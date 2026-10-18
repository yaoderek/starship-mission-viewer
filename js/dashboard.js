// Dashboard panels. Works on both planetary mission files and generated interstellar missions.
import * as THREE from 'three';
import * as View from './scene.js';
import { EVC } from './scene.js';
import { Holo } from './holo.js';
import { vehicleById } from './catalog.js';
import { HISTORIC } from './historic.js';
import * as Rad from './radiation.js';
import { resizeAll } from './vehicle.js';
import { $, cap, esc, f1, int, sig, prob, dur, mass, energy, fmtDate, jdYear, yearJd } from './fmt.js';

const MODES = { 'one-way': 'One-way', conjunction: 'Long stay', opposition: 'Short stay', isru: 'Surface + ISRU', 'round-trip': 'Round trip', rendezvous: 'Stops', flyby: 'Flyby' };
const C = { surf: '#9ccf7a', gcr: '#9a9a9a', spe: '#e0b050', belt: '#e0605a', tot: '#f2f2f2', p95: '#6a6a6a', lim: '#e0605a', grid: '#1c1c1c', axis: '#5a5a5a' };
let data = null, mission = null, mIndex = 0, modeFilter = 'all', regSel = null;
let t = 0, playing = false, sortKey = 'rank', sortDir = 1, lastJd = -1;
const isStar = () => data && data.kind === 'interstellar';
const isHist = () => data && data.kind === 'historic';
export const state = { get t() { return t; }, get mission() { return mission; }, get data() { return data; } };

// ------------------------------------------------------------------ public API
export function load(d, mi = 0) {
  data = d; modeFilter = 'all'; sortKey = 'rank'; sortDir = 1; regSel = null; doseCache.clear(); hzList = [];
  View.setData(d);
  document.body.classList.toggle('mode-star', isStar()); document.body.classList.toggle('mode-solar', !isStar());
  renderModes(); select(Math.min(mi, d.missions.length - 1));
}
export function select(i) {
  mIndex = i; mission = data.missions[i];
  if (isHist() && data.target !== mission.target) { data.target = mission.target; View.setData(data); }
  View.setMission(mission); analyseMission();
  renderCmp(); renderEvents(); renderBudget(); renderReg(); renderRad(); renderHazards(); cabinFor(mission); holoFor(mission);
  drawTimeline(); setT(0); lastJd = -1;
}
export function setT(f) { t = Math.max(0, Math.min(1, f)); }
export function togglePlay(force) { playing = force ?? !playing; if (t >= 1 && playing) { t = 0; if (A) reroll(); } if (playing && t < 1e-6 && hasLaunch()) runAscent(); $('play').classList.toggle('on', playing); $('play').innerHTML = playing ? PAUSE : PLAY; }
export const span = () => [mission.traj[0][0], mission.traj[mission.traj.length - 1][0]];
const PLAY = 'PLAY', PAUSE = 'PAUSE';

// Simulation rate in days of Earth time per real second; interstellar trips scale to their length.
function rate() { const v = +$('speed').value; if (!isStar()) return v; const [a, b] = span(); return (b - a) / ({ 10: 60, 45: 25, 120: 12, 365: 5 }[v] || 25); }

export function tick(dt) {
  if (!mission) return;
  if (playing && !(holo && holo.ascActive())) { const [a, b] = span(); setT(t + dt * rate() / (b - a)); if (t >= 1) togglePlay(false); }
  const [t0, t1] = span(), jd = t0 + t * (t1 - t0);
  const q = isStar() ? starAt(jd) : null;
  View.update(jd, dt, q ? q.beta : 0);
  $('date').textContent = isStar() ? Math.floor(jdYear(jd)).toString() : fmtDate(jd);
  $('met').textContent = `T+${dur(jd - t0)}`;
  if (q) { $('shipclock').textContent = dur(q.tau); $('speedv').textContent = q.beta >= 0.001 ? `${(q.beta * 100).toFixed(q.beta > 0.99 ? 2 : 1)}% c` : q.beta < 1e-7 ? '0' : `${(q.beta * 299792.458).toFixed(1)} km/s`; }
  $('knob').style.left = (t * 100) + '%';
  const stormOn = lastStorm && performance.now() - lastStorm.at < 4100;   // keep redrawing while a storm alert is up
  if (stormOn || Math.abs(jd - lastJd) > 1e-6) { stormCheck(jd, lastJd); drawChart(jd); drawSolar(jd); updateRadNow(jd); lastJd = jd; }
  if (view === 'cabin') updateCabin(jd); else if (holo) { holo.setThrust(thrustAt(jd)); holo.setEntry(isStar() ? 0 : entryAt(jd)); $('holothr').textContent = holo.ascActive() ? 'ASCENT' : entryAt(jd) > 0.05 ? 'ENTRY · HEAT SHIELD' : thrustAt(jd) > 0.05 ? 'ENGINE ● BURN' : 'ENGINE ○ COAST'; holo.render(dt); }
}

function starAt(jd) {
  const R = mission.radiation, J = R.jd, n = J.length; let k = 0;
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (J[m] <= jd) lo = m; else hi = m; } k = lo;
  const f = Math.max(0, Math.min(1, (jd - J[k]) / ((J[k + 1] - J[k]) || 1)));
  return { beta: R.beta[k] + f * (R.beta[k + 1] - R.beta[k]), tau: R.tau[k] + f * (R.tau[k + 1] - R.tau[k]), x: R.r_au[k] + f * (R.r_au[k + 1] - R.r_au[k]) };
}

// ------------------------------------------------------------------ comparison table
const totDays = m => m.summary.total_days ?? m.summary.tof_years * 365.25;
const cancerCell = d => d.cancer == null ? '<span class="dim">—</span>' : `<span class="${d.mean > 600 ? 'no' : d.mean > 300 ? 'wn' : ''}">${Rad.cancerLabel(d.mean)}</span>`;
// Interstellar: probes show what a crew would get in that hull, dimmed. Beyond ~6 Sv in two days nobody survives.
const LETHAL = 6000;
function starRisk(m) { const T = m.radiation.totals, lethal = T.acute >= LETHAL; return { T, lethal, cancer: Rad.cancerChance(T.total_mean), sick: Rad.sickness(T.acute), sort: lethal ? 2 + T.acute / 1e12 : Rad.cancerChance(T.total_mean) }; }
const probeTip = m => m.summary.crew ? '' : ' title="Uncrewed: what a crew would receive in this hull"';
function starDoseCell(m) { const { T, lethal } = starRisk(m), c = m.summary.crew ? '' : 'dim';
  return `<span class="${c}"${probeTip(m)}>${lethal ? '<span class="no">lethal</span>' : T.total_mean > 10000 ? `<span class="no">${bigDose(T.total_mean)}</span>` : doseCell(T.total_mean)}</span>`; }
function starCancerCell(m) { const r = starRisk(m), c = m.summary.crew ? '' : 'dim';
  return `<span class="${c}"${probeTip(m)}>${r.lethal ? '<span class="no">—</span>' : `<span class="${r.T.total_mean > 600 ? 'no' : r.T.total_mean > 300 ? 'wn' : ''}">${Rad.cancerLabel(r.T.total_mean)}</span>`}</span>`; }
const doseCell = v => v == null ? '<span class="dim">—</span>' : `<span class="${v > 600 ? 'no' : v > 300 ? 'wn' : ''}">${int(v)}</span>`;
const go = m => m.summary.feasible ? '<span class="ok">GO</span>' : `<span class="no" title="${esc((m.summary.why || []).join('; '))}">NO-GO</span>`;
const pct = b => b >= 0.99999 ? '100%' : b >= 0.01 ? (b * 100).toFixed(b >= 0.99 ? (b >= 0.9995 ? 2 : 1) : 0) + '%' : (b * 299792.458).toFixed(0) + ' km/s';

const SOLAR_COLS = [
  ['rank', '#', '', m => m.rank, m => `<span class="dim">${m.rank}</span>`, 'l'],
  ['name', 'Route', '', m => m.name, m => `${m.name}${(m.tags || []).map(x => `<span class="tag">${x.includes('alternative') ? 'LOW-DOSE ALT' : 'LOW-DOSE'}</span>`).join('')}<div class="sub">${MODES[m.mode || 'one-way']}${m.summary.stay_days ? ` · ${int(m.summary.stay_days)} d stay` : ''}</div>`, 'l'],
  ['launch', 'Launch', '', m => m.summary.launch, m => m.summary.launch],
  ['dur', 'Total', 'days', totDays, m => int(totDays(m))],
  ['dv', 'Δv', 'km/s', m => m.summary.dv_total, m => f1(m.summary.dv_total, 2)],
  ['tk', 'Tankers', '', m => m.summary.tankers_needed ?? 99, m => m.summary.tankers_needed ?? '<span class="no">—</span>'],
  ['dose', 'Dose', 'mSv', m => dose(m).mean ?? 1e9, m => doseCell(dose(m).mean)],
  ['cancer', 'Cancer', 'chance', m => dose(m).cancer ?? 9, m => cancerCell(dose(m))],
  ['feas', 'Status', '', m => m.summary.feasible ? 0 : 1, go]];
const HIST_COLS = [
  ['name', 'Mission', '', m => m.rank, m => `${m.name}<div class="sub">${m.model}</div>`, 'l'],
  ['launch', 'Launch', '', m => m.summary.launch, m => m.summary.launch],
  ['arrive', 'Arrival', '', m => m.summary.arrive, m => m.summary.arrive],
  ['dur', 'Cruise', '', m => m.summary.total_days, m => dur(m.summary.total_days)],
  ['c3', 'C3', 'km²/s²', m => m.summary.c3, m => f1(m.summary.c3, 1)],
  ['fb', 'Flybys', '', m => m.summary.flybys.length, m => m.summary.flybys.length ? m.summary.flybys.map(b => b[0].toUpperCase()).join('-') : '<span class="dim">direct</span>']];
// Doses that run past 10 Sv read better in Sv, and past 10,000 Sv in powers of ten.
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹', sup = n => String(n).split('').map(c => SUP[+c]).join('');
function bigDose(v) { const S = v / 1000; if (v < 1e4) return int(v); if (S < 1e4) return sig(S) + ' Sv'; const e = Math.floor(Math.log10(S)); return `${(S / 10 ** e).toFixed(1)}×10${sup(e)} Sv`; }
const durS = d => d > 365.25 * 1000 ? `${sig(d / 365.25 / 1000)}k yr` : dur(d);   // compact for the table
const STAR_COLS = [
  ['name', 'Vehicle', '', m => m.rank, m => `${m.name}${(m.tags || []).includes('yours') ? '<span class="tag acc">SELECTED</span>' : ''}<div class="sub">${m.model}</div>`, 'l'],
  ['crew', 'Crew', '', m => m.summary.crew, m => m.summary.crew || '<span class="dim" title="Uncrewed probe">—</span>'],
  ['beta', 'Top speed', 'of c', m => m.summary.beta, m => pct(m.summary.beta)],
  ['earth', 'Earth time', '', m => m.summary.earth_days, m => durS(m.summary.earth_days)],
  ['ship', 'Ship time', '', m => m.summary.ship_days, m => `<span class="acc">${durS(m.summary.ship_days)}</span>`],
  ['arr', 'Arrive', '', m => m.summary.decel ? 0 : 1, m => m.summary.decel ? 'stops' : '<span class="wn">flyby</span>', 'l'],
  ['dose', 'Dose', 'mSv', m => m.summary.dose_mean, m => starDoseCell(m)],
  ['cancer', 'Cancer', 'chance', m => starRisk(m).sort, m => starCancerCell(m)]];

function renderCmp() {
  const COLS = isStar() ? STAR_COLS : isHist() ? HIST_COLS : SOLAR_COLS;
  if (!COLS.find(c => c[0] === sortKey)) sortKey = COLS[0][0];
  const col = COLS.find(c => c[0] === sortKey);
  const ms = data.missions.map((m, i) => [m, i]).filter(([m]) => modeFilter === 'all' || (m.mode || 'one-way') === modeFilter);
  ms.sort((a, b) => { const x = col[3](a[0]), y = col[3](b[0]); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
  $('cmp').innerHTML = `<thead><tr>${COLS.map(c => `<th data-k="${c[0]}" class="${c[5] || ''} ${c[0] === sortKey ? 'sorted' : ''}">${c[1]}${c[0] === sortKey ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}<span class="u">${c[2] || '&nbsp;'}</span></th>`).join('')}</tr></thead><tbody>` +
    ms.map(([m, i]) => `<tr data-i="${i}" class="${i === mIndex ? 'on' : ''}">${COLS.map(c => `<td class="${c[5] || ''}">${c[4](m)}</td>`).join('')}</tr>`).join('') + '</tbody>';
  $('cmp').querySelectorAll('th').forEach(th => th.onclick = () => { const k = th.dataset.k; sortDir = k === sortKey ? -sortDir : 1; sortKey = k; renderCmp(); });
  $('cmp').querySelectorAll('tbody tr').forEach(tr => tr.onclick = () => select(+tr.dataset.i));
  $('cmpTitle').textContent = isStar() ? `Vehicle comparison · ${data.star.name}` : isHist() ? 'Historical missions' : 'Mission comparison';
  $('cmpHint').textContent = isStar() ? 'click row to fly that vehicle' : 'click header to sort · row to select';
}
function renderModes() {
  if (isStar() || isHist()) { $('modes').innerHTML = ''; $('modes').hidden = true; return; }
  $('modes').hidden = false;
  const have = [...new Set(data.missions.map(m => m.mode || 'one-way'))];
  if (have.length < 2) { $('modes').innerHTML = ''; $('modes').hidden = true; return; }
  $('modes').innerHTML = ['all', ...Object.keys(MODES).filter(k => have.includes(k))].map(k => `<button data-m="${k}" class="${k === modeFilter ? 'on' : ''}">${k === 'all' ? 'All' : MODES[k]}<span class="n">${k === 'all' ? data.missions.length : data.missions.filter(m => (m.mode || 'one-way') === k).length}</span></button>`).join('');
  $('modes').querySelectorAll('button').forEach(b => b.onclick = () => {
    modeFilter = b.dataset.m; renderModes(); renderCmp();
    const first = data.missions.findIndex(m => modeFilter === 'all' || (m.mode || 'one-way') === modeFilter);
    if (first >= 0 && !(modeFilter === 'all' || (mission.mode || 'one-way') === modeFilter)) select(first);
  });
}

// ------------------------------------------------------------------ events
function renderEvents() {
  const [t0] = span();
  $('selname').textContent = isStar() ? mission.name : `${mission.name} · ${mission.model}${mission.variant ? ' · ' + mission.variant : ''}`;
  if (isStar()) {
    const R = mission.radiation, tauAt = jd => { const k = R.jd.findIndex(x => x >= jd - 1e-6); return R.tau[Math.max(0, k)]; };
    $('evt').innerHTML = `<thead><tr><th>Earth</th><th>Ship</th><th class="l">Event</th><th>Speed</th></tr></thead><tbody>` +
      mission.events.map((e, k) => `<tr data-k="${k}"><td>${dur(e.jd - t0)}</td><td class="acc">${dur(tauAt(e.jd))}</td><td class="l"><i style="border-color:${EVC[e.hazard ? 'hazard' : e.type]}"></i>${esc(e.label)}</td><td>${e.speed ? pct(e.speed) : '<span class="dim">0</span>'}</td></tr>`).join('') + '</tbody>';
  } else {
    $('evt').innerHTML = `<thead><tr><th>Day</th><th class="l">Event</th><th>Date</th><th>Δv<span class="u">m/s</span></th></tr></thead><tbody>` +
      mission.events.map((e, k) => `<tr data-k="${k}"><td>${int(e.jd - t0)}</td><td class="l"><i style="border-color:${EVC[e.hazard ? 'hazard' : e.type]}"></i>${esc(e.label)}</td><td>${e.date}</td><td>${e.dv > 0.0005 ? int(e.dv * 1000) : '<span class="dim">—</span>'}</td></tr>`).join('') + '</tbody>';
  }
  $('evt').querySelectorAll('tbody tr').forEach(el => el.onclick = () => { const e = mission.events[+el.dataset.k]; jumpTo(e); });
}
export function jumpTo(e) { const [a, b] = span(); setT((e.jd - a) / (b - a)); View.flyToEvent(e); }

// ------------------------------------------------------------------ budget
const kv = rows => rows.map(([k, x, u, c]) => `<div${c ? ` class="${c}"` : ''}><span>${k}${u ? ` <em>${u}</em>` : ''}</span><b>${x}</b></div>`).join('');
function renderBudget() {
  $('isruwrap').style.display = mission.isru ? '' : 'none';
  $('tankx').style.display = isStar() ? 'none' : '';
  if (isStar()) return renderStarBudget();
  if (isHist()) return renderHistBudget();
  const S = mission.summary, P = data.vehicleParams, rt = mission.mode && mission.mode !== 'one-way';
  const no = x => `<span class="no">${x}</span>`, ok = x => `<span class="ok">${x}</span>`;
  $('budtitle').textContent = rt ? `Architecture · ${MODES[mission.mode]} · Δv / propellant` : 'Δv and propellant';
  const why = S.why && S.why.length ? `<div class="wide why no">${S.why.map(esc).join('<br>')}</div>` : '';
  let rows;
  if (!rt) rows = [['Departure burn', f1(S.dv_dep, 2), 'km/s'], ['Course corrections', f1(S.dv_dsm, 2), 'km/s'], [`Capture (${S.capture === 'aero' ? 'aerobraking' : S.capture})`, f1(S.dv_capture, 2), 'km/s'],
    ['Total Δv', f1(S.dv_total, 2), 'km/s', 'hl'], ['Propellant from orbit', S.prop_leo_t > P.cap ? no(int(S.prop_leo_t)) : int(S.prop_leo_t), 't'], ['Tanker flights', S.tankers_needed == null ? no('—') : `${S.tankers_needed} <span class="dim">(${S.tankers_needed + 1} launches)</span>`, '', 'hl']];
  else {
    rows = [['Out / stay / back', `${int(S.out_days)} / ${int(S.stay_days)} / ${int(S.ret_days)}`, 'days'], ['Total', `${int(S.total_days)} d <span class="dim">(${(S.total_days / 365.25).toFixed(1)} yr)</span>`, ''],
      ['Departure burn', f1(S.dv_dep, 2), 'km/s'], [S.surface ? 'Mars landing' : `Capture (${S.capture})`, f1(S.dv_capture, 2), 'km/s'],
      [S.surface ? 'Ascent + return burn' : 'Return burn', f1(S.dv_ret_dep, 2), 'km/s'], ['Earth entry speed', S.v_entry_earth.toFixed(1) + (S.v_entry_earth > 12.5 ? ' ' + no('hot') : ''), 'km/s'],
      ['Total Δv', f1(S.dv_total, 2), 'km/s', 'hl'], ['Propellant from orbit', S.prop_leo_t > P.cap ? no(int(S.prop_leo_t)) : int(S.prop_leo_t), 't'],
      ['Tanker flights', S.tankers_needed == null ? no('—') : `${S.tankers_needed} <span class="dim">(${S.tankers_needed + 1} launches)</span>`, '', 'hl'],
      ['Propellant at destination', S.prop_dest_t > 0 ? (S.prop_dest_t > P.cap ? no(int(S.prop_dest_t)) : int(S.prop_dest_t)) : '0', 't'],
      ['Comes from', S.dest_source.startsWith('REQ') ? no('nothing modelled') : S.dest_source.startsWith('none') ? 'carried from Earth' : S.dest_source === 'ISRU' ? 'made on Mars' : S.dest_source, ''],
      ['Verdict', S.feasible ? ok('works') : no('does not close'), '']];
    const I = mission.isru;
    if (I) { const Q = I.plan;
      rows = rows.concat([['Propellant to make', int(Q.prop_t), 't'], ['Production window', int(Q.prod_days), 'days'], ['Plant power', `${int(Q.power_kw)} <span class="dim">(${int(Q.power_kw_lo)}–${int(Q.power_kw_hi)})</span>`, 'kW'],
        ['Plant mass', `${int(Q.plant_t)}–${int(Q.plant_t_hi)}`, 't'], ['Reactor mass', `${int(Q.nuclear_t[0])}–${int(Q.nuclear_t[1])}`, 't'], ['Cargo ships (fission / solar)', `${I.cargo_ships_nuclear} / ${I.cargo_ships_solar}`, ''],
        [`With a ${int(I.power_kw_config)} kW plant`, `${int(I.days_at_config)} d ${I.feasible_at_config ? ok('in time') : no('too slow')}`, '']]); }
  }
  $('budget').innerHTML = kv(rows) + why + `<div class="wide note">Vehicle: ${esc(data.vehicle)}.${rt && S.surface ? ` Return payload ${data.architecture ? data.architecture.return_payload_t : 20} t. Mars ascent 4.15 km/s (MSR MAV, NTRS 20130013542).` : ''}</div>`;
  if (mission.isru) drawIsru();
}
function renderHistBudget() {
  const S = mission.summary, h = HISTORIC.find(x => x.id === mission.historicId);
  $('budtitle').textContent = 'Mission facts · reconstructed trajectory';
  $('tankx').style.display = 'none';
  const rows = [...h.facts.map(([k, v]) => [k, v, '']), ['Launch', S.launch, ''], ['Arrival', S.arrive, ''], ['Cruise', dur(S.total_days), '', 'hl'],
    ['Launch C3 (reconstructed)', f1(S.c3, 1), 'km²/s²', 'hl'], ['Arrival v∞', f1(S.vinf_arr, 2), 'km/s'], ...(S.entry_kms ? [['Entry speed (125 km)', f1(S.entry_kms, 2), 'km/s']] : []),
    ['Gravity assists', S.flybys.length ? S.flybys.map(b => b[0].toUpperCase() + b.slice(1)).join(', ') : 'none', '']];
  $('budget').innerHTML = kv(rows) + `<div class="wide note">${esc(h.blurb)} Trajectory rebuilt from the real launch and encounter dates with Lambert arcs between planets (JPL approximate ephemeris); where flyby v∞ in and out differ, the real spacecraft made deep-space manoeuvres.</div>`;
}
function renderStarBudget() {
  const S = mission.summary, p = mission.params, c = 299792458;
  $('budtitle').textContent = 'Mass, speed and time';
  const rows = [['Earth time', dur(S.earth_days), '', 'hl'], ['Ship time', `<span class="acc">${dur(S.ship_days)}</span>`, '', 'hl'], ['Time dilation at cruise', `${sig(S.gamma)}×`, 'γ'],
    ['Top speed', pct(S.beta), 'of c'], ['Acceleration', p.kind === 'ballistic' ? '—' : sig(p.accel), 'g'], ['Exhaust speed', p.kind === 'rocket' ? pct(p.ve) : p.kind === 'beam' ? 'laser' : p.kind === 'ramjet' ? 'scooped' : '—', p.kind === 'rocket' ? 'of c' : ''],
    ['Dry mass', mass(p.dry), ''], ['Propellant used', p.kind === 'rocket' ? mass(S.prop_used_t) : 'none', ''], ['Mass ratio', p.kind === 'rocket' ? sig(S.mr) : '1', 'm₀/m₁'],
    ['Propellant loaded', p.kind === 'rocket' ? mass(p.prop) : '—', '', p.kind === 'rocket' && S.prop_used_t < p.prop * 0.98 ? 'ok' : ''], ['Kinetic energy at cruise', energy(S.ke_J), ''], ['Arrival', S.decel ? 'brakes into orbit' : 'flies past', '']];
  let extra = '';
  if (p.kind === 'rocket' && S.prop_used_t < p.prop * 0.98) extra += `<div class="wide note">Only ${sig(S.prop_used_t / p.prop * 100)}% of the loaded propellant is needed: the trip is short enough that the ship turns over before running dry.</div>`;
  if (mission.vehicleId === 'hailmary') {
    // Same ship, same 1.5 g profile, solved with the relativistic rocket equation for exhaust at c.
    const need = p.dry * (S.mr - 1);
    extra += `<div class="wide book"><b>Book vs physics</b>A photon rocket holding 1.5 g for the whole trip to Tau Ceti and back to rest needs a mass ratio of e<sup>Δη</sup> ≈ ${sig(S.mr)}. ` +
      `With ${mass(p.dry)} of ship that is ${mass(need)} of Astrophage. ${need > p.prop * 1.02 ? `The ${mass(p.prop)} loaded is not enough for this profile.` : `The ${mass(p.prop)} loaded covers it.`} ` +
      `Change the dry mass or fuel in Edit mission to see how sensitive the trip is.</div>`;
  }
  $('budget').innerHTML = kv(rows) + extra;
}
function drawIsru() {
  const cv = $('isruchart'), r = cv.getBoundingClientRect(); if (!r.width) return;
  const p = Math.min(devicePixelRatio, 2); cv.width = r.width * p; cv.height = r.height * p; const g = cv.getContext('2d'); g.setTransform(p, 0, 0, p, 0, 0);
  const w = r.width, h = r.height, L = 48, B = 20, T = 10, I = mission.isru, cu = I.curve, xmax = 2000, lx = v => L + Math.log10(v / 30) / Math.log10(xmax / 30) * (w - L - 10);
  const ymin = 100, ymax = 1e5, ly = v => T + (h - T - B) * (1 - Math.log10(Math.max(ymin, v) / ymin) / Math.log10(ymax / ymin));
  g.font = '10px ' + MONO; g.strokeStyle = C.grid; g.fillStyle = C.axis;
  for (const v of [100, 1e3, 1e4, 1e5]) { g.beginPath(); g.moveTo(L, ly(v) + .5); g.lineTo(w - 10, ly(v) + .5); g.stroke(); g.fillText(v >= 1e3 ? (v / 1e3) + ' MW' : v + ' kW', 4, ly(v) + 3); }
  for (const v of [30, 60, 120, 240, 480, 1000, 2000]) { g.beginPath(); g.moveTo(lx(v) + .5, T); g.lineTo(lx(v) + .5, h - B); g.stroke(); g.fillText(v, lx(v) - 8, h - 6); }
  g.strokeStyle = C.tot; g.lineWidth = 1.5; g.beginPath(); cu.forEach((q, k) => k ? g.lineTo(lx(q.days), ly(q.kw)) : g.moveTo(lx(q.days), ly(q.kw))); g.stroke(); g.lineWidth = 1;
  g.strokeStyle = C.surf; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(L, ly(I.power_kw_config)); g.lineTo(w - 10, ly(I.power_kw_config)); g.stroke(); g.setLineDash([]);
  g.fillStyle = C.surf; g.fillText(`Planned plant ${int(I.power_kw_config)} kW`, L + 4, ly(I.power_kw_config) - 4);
  const x = lx(I.plan.prod_days), y = ly(I.plan.power_kw); g.fillStyle = I.feasible_at_config ? C.surf : C.belt; g.fillRect(x - 3, y - 3, 6, 6);
  g.fillText(`This stay needs ${int(I.plan.power_kw)} kW`, Math.min(x + 7, w - 150), y - 6); g.fillStyle = C.axis; g.fillText('days of production', w - 120, h - 6);
}
const MONO = 'ui-monospace,"JetBrains Mono","DejaVu Sans Mono",Menlo,monospace';

// ------------------------------------------------------------------ radiation
// Planetary missions use the live model in radiation.js: A holds the statistics over many simulated missions for
// the current shielding, run is the one storm history being played out. Interstellar missions keep their own totals.
let shield = { wall: 0, shelter: 20 }, A = null, A0 = null, run = null, seen = -1, doseCache = new Map(), lastStorm = null;
export let onShield = null;
export function setShieldHandler(f) { onShield = f; }
export function setShield(s) { shield = { wall: +(s.wall ?? 0), shelter: +(s.shelter ?? 20) }; }
const planetRad = () => !isStar() && !isHist() && Rad.ready() && !!(mission && mission.radiation && mission.radiation.r_au);
// ?seed=N replays a particular storm history (first mission opened only)
let fixedSeed = +new URLSearchParams(location.search).get('seed') || 0;
const newSeed = () => { const s = fixedSeed || (Math.random() * 2 ** 31) >>> 0; fixedSeed = 0; return s; };
function analyseMission(keepSeed) {
  A = planetRad() ? Rad.analyse(mission, shield, { reg: regSel, n: 600 }) : null;
  A0 = A && shield.shelter > 0 ? Rad.analyse(mission, { ...shield, shelter: 0 }, { reg: regSel, n: 300, series: false }) : A;
  run = A ? Rad.rollout(A, keepSeed && run ? run.seed : newSeed()) : null; seen = -1;
  if (A) doseCache.set(doseKey(mission), { mean: A.mean, p95: A.p95, cancer: A.cancer });
}
export function reroll() { if (!A) return; run = Rad.rollout(A, newSeed()); seen = -1; renderRad(); drawTimeline(); lastJd = -1; }
const doseKey = m => `${data.missions.indexOf(m)}|${shield.wall}|${shield.shelter}|${regSel}`;
function dose(m) {
  if (isStar() || isHist()) { const T = m.radiation && m.radiation.totals; return T ? { mean: T.total_mean, p95: T.total_p95, cancer: Rad.cancerChance(T.total_mean) } : {}; }
  if (!Rad.ready() || !m.radiation || !m.radiation.r_au) return {};
  const k = doseKey(m);
  if (!doseCache.has(k)) { const a = Rad.analyse(m, shield, { reg: regSel, n: 200, series: false }); doseCache.set(k, { mean: a.mean, p95: a.p95, cancer: a.cancer }); }
  return doseCache.get(k);
}
const fmtP = (p, n) => p <= 0 ? (n ? `<${(100 / n).toFixed(1)}%` : '0%') : p < 0.001 ? '<0.1%' : (p * 100).toFixed(p < 0.1 ? 1 : 0) + '%';
const lvlCls = (v, hi, med) => v > hi ? 'no' : v > med ? 'wn' : 'ok';

function renderReg() {
  const on = !!(mission && mission.summary.surface); $('regseg').style.display = on ? '' : 'none';
  const cur = regSel ?? (mission && mission.radiation ? mission.radiation.regolith_used ?? 0 : 0);
  $('regseg').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.r === +cur));
}
function renderShield() {
  $('wallseg').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.w === shield.wall));
  $('shseg').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.s === shield.shelter));
  const dm = Rad.shieldMass(shield), tk = mission && mission.summary.tankers_needed;
  $('shmass').innerHTML = `${dm >= 0 ? '+' : '−'}${int(Math.abs(dm))} t${tk != null ? ` · ${tk} tankers` : ' · <span class="no">no-go</span>'}`;
}
function applyShield() {
  if (data.vehicleParams && !isStar() && !isHist()) resizeAll(data, { ...data.vehicleParams, ...shield });
  doseCache.clear(); analyseMission(true); onShield && onShield({ ...shield });
  renderCmp(); renderBudget(); renderRad(); renderHazards(); drawTimeline(); lastJd = -1;
}
export function bindRadControls() {
  $('regseg').querySelectorAll('button').forEach(b => b.onclick = () => { regSel = +b.dataset.r; renderReg(); doseCache.clear(); analyseMission(true); renderCmp(); renderRad(); renderHazards(); lastJd = -1; });
  $('wallseg').querySelectorAll('button').forEach(b => b.onclick = () => { shield.wall = +b.dataset.w; applyShield(); });
  $('shseg').querySelectorAll('button').forEach(b => b.onclick = () => { shield.shelter = +b.dataset.s; applyShield(); });
  $('reroll').onclick = () => reroll();
  $('solarchart').addEventListener('click', ev => {   // click a mission marker to fly it
    const hit = solarHits.find(h => Math.abs(h.x - (ev.offsetX)) < 6 && Math.abs(h.y - ev.offsetY) < 8); if (hit) select(hit.i);
  });
}
function bar(label, v, lim, limLabel) {
  const f = v / lim, c = f > 1 ? 'no' : f > 0.6 ? 'wn' : 'ok';
  return `<div class="lim"><div class="lt"><span>${label}</span><b class="${c}">${v < 1e4 ? int(v) : bigDose(v)} <em>/ ${lim} mSv</em></b></div><div class="lbar"><i class="${c}" style="width:${Math.min(100, f * 100).toFixed(1)}%"></i></div><div class="ln">${limLabel}</div></div>`;
}
function riskTiles(mean, bad, extra = '') {
  return `<div class="rk ${lvlCls(mean, 600, 300)}" title="Extra lifetime chance of cancer caused by this mission's radiation, on top of the ~40% everyone has"><span>Cancer from radiation</span><b>${Rad.cancerLabel(mean)}</b><em>${mean > 10000 ? `${sig(mean / 1000)} Sv, far beyond any data` : `bad case ${Rad.cancerLabel(bad)} · ${int(mean)} mSv`}</em></div>${extra}`;
}
function renderRad() {
  const R = mission.radiation, pr = planetRad();
  $('shieldctl').style.display = pr ? '' : 'none'; $('reroll').style.display = pr ? '' : 'none'; $('solarwrap').style.display = pr ? '' : 'none';
  if (!R) { $('limits').innerHTML = `<div class="empty">${isHist() ? 'Robotic mission: no crew aboard, so no crew dose.' : 'No radiation analysis for this case (it is a validation trajectory).'}</div>`; $('radnow').innerHTML = ''; $('radbreak').innerHTML = ''; $('risk').innerHTML = ''; $('radnote').textContent = ''; return; }
  if (!pr) return renderRadStar();
  renderShield();
  const S = shield, ars = A.pArs, big = A.pBig;
  $('risk').innerHTML = riskTiles(A.mean, A.p95,
    `<div class="rk ${ars > 0.01 ? 'no' : ars > 0.001 ? 'wn' : 'ok'}" title="Nausea and vomiting from a big dose in a day or two: about 1 in 10 people at 1 Sv"><span>Radiation sickness</span><b>${fmtP(ars, A.n)}</b><em>${S.shelter ? `${fmtP(A0.pArs, A0.n)} with no shelter` : 'no shelter fitted'}</em></div>` +
    `<div class="rk ${big > 0.5 ? 'wn' : ''}"><span>Big solar storm</span><b>${fmtP(big)}</b><em>bad case ${int(A.spe_p95)} mSv${S.shelter ? `, ${int(A0.spe_p95)} unsheltered` : ''}</em></div>`);
  $('limits').innerHTML = bar('Whole mission, expected', A.mean, 600, 'NASA career limit (NASA-STD-3001)') +
    bar('Worst 30 days, bad case', A.win30, 250, '30-day blood-forming organ limit') + bar('Worst year, bad case', A.win365, 500, '1-year blood-forming organ limit');
  const bodies = [...new Set(A.belts.map(b => b.body === 'earth' ? 'Earth' : cap(b.body)))].join(', ') || 'none crossed';
  const rows = [['Cosmic rays', A.gcr - A.surface, `range ${sig(A.gcr_p05)}–${sig(A.gcr_p95)}${S.wall ? `, wall cuts ${int((1 - A.f0) * 100)}%` : ''}`], ['Solar storms', A.spe_mean, `bad case ${sig(A.spe_p95)}`],
    ['Radiation belts', A.belt, bodies], ...(A.surface ? [['On the surface', A.surface, `${sig(A.surface / Math.max(1, (mission.phases || []).filter(p => p.name.includes('surface')).reduce((s, p) => s + p.jd1 - p.jd0, 0)))} mSv/day in the habitat`]] : []),
    ['Total', A.mean, `bad case ${sig(A.p95)}`]];
  $('radbreak').innerHTML = rows.map(r => `<tr><td class="l">${r[0]}</td><td>${sig(r[1])} <em>mSv</em></td><td class="l dim">${r[2]}</td></tr>`).join('');
  $('radnote').textContent = `${mission.mode && mission.mode !== 'one-way' ? 'Whole mission, there and back.' : 'One-way transit.'} Expected values over ${A.n} simulated missions with random solar cycles and storms. ` +
    `Hull ${sig(Rad.HULL)} g/cm² steel${S.wall ? ` plus ${S.wall} g/cm² of water round the cabin` : ''}; ${S.shelter ? `storm shelter ${S.shelter} g/cm² water` : 'no storm shelter'}. Cancer chance uses ${Rad.RISK.cancerPerSv * 100}% per Sv (BEIR VII incidence, age 35–40; NASA puts the real uncertainty at about ×3 either way). Estimates; method in VERIFICATION.md.`;
}
function renderRadStar() {
  const R = mission.radiation, T = R.totals;
  const r = starRisk(mission), probe = !mission.summary.crew, pr = probe ? ' <span class="dim">if crewed</span>' : '';
  $('risk').innerHTML = (r.lethal
    ? `<div class="rk no"><span>Cancer from radiation${pr}</span><b>—</b><em>the crew would not survive the trip</em></div>`
    : riskTiles(T.total_mean, T.total_p95).replace('Cancer from radiation', 'Cancer from radiation' + pr)) +
    `<div class="rk ${r.lethal ? 'no' : r.sick > 0.01 ? 'wn' : 'ok'}"><span>Radiation sickness${pr}</span><b>${r.lethal ? 'LETHAL' : fmtP(r.sick)}</b><em>${r.lethal ? `${bigDose(T.peak_rate / 24)} per hour at cruise` : `peak ${sig(T.peak_rate)} mSv/day`}</em></div>` +
    `<div class="rk ${T.gas > 1 ? 'no' : ''}"><span>Interstellar gas</span><b>${T.gas > 1 ? (T.gas < 1e4 ? int(T.gas) + ' mSv' : bigDose(T.gas)) : 'stopped'}</b><em>${mission.params.absorbs ? 'Astrophage absorbs it' : `${sig(mission.params.frontal)} g/cm² bow shield`}</em></div>`;
  const crewNote = probe ? '<div class="empty">Uncrewed probe. Numbers show what a crew would receive in this hull.</div>' : '';
  $('limits').innerHTML = crewNote + bar('Whole mission, expected', T.total_mean, 600, 'NASA career limit (NASA-STD-3001)') +
    bar('Worst 30 days, bad case', T.win30_p95, 250, '30-day blood-forming organ limit') + bar('Worst year, bad case', T.win365_p95, 500, '1-year blood-forming organ limit');
  const rows = [['Cosmic rays', T.gcr, `${sig(T.gcr_p05)}–${sig(T.gcr_p95)}`], ...(T.gas ? [['Interstellar gas', T.gas, 'hydrogen hitting the bow at cruise speed']] : []), ['Shielding', null, mission.params.absorbs ? 'Astrophage fuel (absorbs nearly everything)' : `${sig(mission.params.shield)} g/cm² water-equivalent`], ['Time aboard', null, dur(T.days) + ' ship time']];
  $('radbreak').innerHTML = rows.map(r => `<tr><td class="l">${r[0]}</td><td>${r[1] == null ? '' : sig(r[1]) + ' <em>mSv</em>'}</td><td class="l dim">${r[2]}</td></tr>`).join('');
  $('radnote').textContent = 'Cosmic rays: Curiosity’s cruise rate (1.84 mSv/day), 1.36× beyond the heliopause, scaled for shielding. Interstellar gas: 0.2 hydrogen atoms per cm³ hitting the bow at cruise speed, stopped only if the forward shield is thicker than the proton range. Cancer chance 8% per Sv (BEIR VII). Rough estimates; relativistic boosting of cosmic rays is not modelled.';
}

// index and fraction of jd in the radiation grid
function gridAt(J, jd) { const n = J.length; let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (J[m] <= jd) lo = m; else hi = m; } const k = Math.min(lo, n - 2); return [k, Math.max(0, Math.min(1, (jd - J[k]) / (J[k + 1] - J[k] || 1)))]; }
const lerpAt = (a, k, f) => a[k] + f * (a[k + 1] - a[k]);

const dc = () => $('dosechart');
function chartCtx(cv) {
  const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return null;
  const p = Math.min(devicePixelRatio, 2); if (cv.width !== Math.round(r.width * p) || cv.height !== Math.round(r.height * p)) { cv.width = r.width * p; cv.height = r.height * p; }
  const g = cv.getContext('2d'); g.setTransform(p, 0, 0, p, 0, 0); g.clearRect(0, 0, r.width, r.height); g.font = '10px ' + MONO; return [g, r.width, r.height];
}
function legend(g, items, DW) {
  let lx = 44, ly = 8;
  for (const [k, c, dash] of items) {
    const w = g.measureText(k.toUpperCase()).width + 26; if (lx + w > DW - 4) { lx = 44; ly += 12; }
    if (dash === 'band') { g.fillStyle = 'rgba(242,242,242,.18)'; g.fillRect(lx, ly - 2, 10, 7); }
    else { g.strokeStyle = c; g.lineWidth = 2.5; g.setLineDash(dash || []); g.beginPath(); g.moveTo(lx, ly + 1); g.lineTo(lx + 10, ly + 1); g.stroke(); g.setLineDash([]); g.lineWidth = 1; }
    g.fillStyle = '#8a8a8a'; g.fillText(k.toUpperCase(), lx + 14, ly + 4); lx += w;
  }
  return ly;
}
function axes(g, L, T, w, h, ymax, tmax, yrs, DH, xlabel) {
  const X = v => L + v / tmax * w, Y = v => T + h - v / ymax * h;
  g.strokeStyle = C.grid; g.lineWidth = 1; g.fillStyle = C.axis;
  const e = Math.pow(10, Math.floor(Math.log10(Math.max(ymax, 10) / 6))), step = [1, 2, 5, 10].map(k => k * e).find(s => ymax / s <= 6);   // ~6 gridlines at any scale
  const sv = ymax >= 1e4, lab = v => !sv ? int(v) : v / 1000 < 1e4 ? sig(v / 1000) : (v / 1000).toExponential(0).replace('e+', 'e');   // axis in Sv when huge
  for (let v = 0; v <= ymax; v += step) { g.beginPath(); g.moveTo(L, Y(v) + .5); g.lineTo(L + w, Y(v) + .5); g.stroke(); g.fillText(lab(v), 4, Y(v) + 3); }
  const unit = yrs ? 365.25 : 1, xsStep = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000, 10000, 50000].map(s => s * (yrs ? 365.25 : 1)).concat(yrs ? [] : [30, 60, 90, 180, 365]).sort((a, b) => a - b).find(s => tmax / s <= 7) || tmax;
  for (let v = 0; v <= tmax + 1e-9; v += xsStep) { g.beginPath(); g.moveTo(X(v) + .5, T); g.lineTo(X(v) + .5, T + h); g.stroke(); g.fillText(int(v / unit), X(v) - 4, DH - 7); }
  g.textAlign = 'right'; g.fillText(xlabel, L + w - 4, T + h - 6); g.textAlign = 'left';
  if (600 <= ymax && ymax < 6e4) { g.strokeStyle = C.lim; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(L, Y(600)); g.lineTo(L + w, Y(600)); g.stroke(); g.setLineDash([]); g.fillStyle = C.lim; g.fillText('career limit 600', L + w - 100, Y(600) - 4); }
  return [X, Y, sv ? 'Sv' : 'mSv'];
}
function drawChart(jd) {
  const c = chartCtx(dc()); if (!c) return; const [g, DW, DH] = c;
  const R = mission && mission.radiation; if (!R) { g.fillStyle = C.axis; g.fillText('No radiation data', 10, 20); return; }
  if (!A) return drawChartStar(g, DW, DH, jd);
  const P = A.P, J = P.J, N = J.length, xs = J.map(x => x - J[0]), tmax = xs[N - 1] || 1, yrs = tmax > 800;
  const items = [['This run', C.tot], ['Expected', '#8a8a8a', [4, 3]], ['5–95% of runs', null, 'band'], ['Cosmic rays', C.gcr], ['Storms', C.spe], ['Belts', C.belt], ...(A.surface ? [['Surface', C.surf]] : [])];
  const T = legend(g, items, DW) + 18, L = 44, B = 22, w = DW - L - 10, h = DH - T - B;
  const ymax = Math.max(50, A.band.hi[N - 1], run.tot[N - 1]) * 1.1;
  if (P.surf.some(Boolean)) for (const ph of mission.phases || []) if (ph.name.includes('stay')) { const a = L + (ph.jd0 - J[0]) / tmax * w, b = L + (ph.jd1 - J[0]) / tmax * w; g.fillStyle = 'rgba(156,207,122,.07)'; g.fillRect(a, T, b - a, h); g.fillStyle = '#6f8f5a'; g.fillText('on surface', a + 4, T + h - 5); }
  const [X, Y, unit] = axes(g, L, T, w, h, ymax, tmax, yrs, DH, yrs ? 'years →' : 'mission day →');
  g.fillStyle = C.axis; g.fillText(unit, 4, T - 6);
  const now = jd - J[0], [kn, fn] = gridAt(J, jd), upto = kn + 1;
  const line = (arr, col, dash, lw = 1, n = N) => { g.strokeStyle = col; g.setLineDash(dash || []); g.lineWidth = lw; g.beginPath(); for (let k = 0; k < n; k++) k ? g.lineTo(X(xs[k]), Y(arr[k])) : g.moveTo(X(xs[k]), Y(arr[k])); g.stroke(); g.setLineDash([]); g.lineWidth = 1; };
  g.fillStyle = 'rgba(242,242,242,.07)'; g.beginPath(); for (let k = 0; k < N; k++) g.lineTo(X(xs[k]), Y(A.band.hi[k])); for (let k = N - 1; k >= 0; k--) g.lineTo(X(xs[k]), Y(A.band.lo[k])); g.closePath(); g.fill();
  line(A.band.mid, '#8a8a8a', [4, 3]);
  if (A.surface) line(A.surfC, C.surf);
  line(A.gcrC.map((v, i) => v - A.surfC[i]), C.gcr); line(A.beltC, C.belt);
  // this run is only known up to now: storms appear as they happen
  const runNow = Array.from(run.tot.slice(0, upto)), speNow = Array.from(run.speC.slice(0, upto));
  runNow.push(lerpAt(run.tot, kn, fn)); speNow.push(lerpAt(run.speC, kn, fn));
  const xsNow = xs.slice(0, upto).concat([Math.min(now, tmax)]);
  const lineNow = (arr, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); arr.forEach((v, k) => k ? g.lineTo(X(xsNow[k]), Y(v)) : g.moveTo(X(xsNow[k]), Y(v))); g.stroke(); g.lineWidth = 1; };
  lineNow(speNow, C.spe, 1.5); lineNow(runNow, C.tot, 2);
  for (const st of run.storms) if (st.jd <= jd) {
    const x = X(st.jd - J[0]), sz = Rad.stormClass(st.F);
    g.fillStyle = C.spe; g.beginPath(); g.moveTo(x, T + 1); g.lineTo(x - 4, T - 6); g.lineTo(x + 4, T - 6); g.closePath(); g.fill();
    if (st.dose >= 5 || sz === 'severe' || sz === 'extreme') { g.fillText(`+${sig(st.dose)}`, x + 5, T + 9); g.fillStyle = C.spe; }
  }
  const xn = X(Math.min(now, tmax)); g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(xn + .5, T); g.lineTo(xn + .5, T + h); g.stroke();
  g.fillStyle = C.tot; g.fillRect(xn - 2.5, Y(runNow[runNow.length - 1]) - 2.5, 5, 5);
}
function drawChartStar(g, DW, DH, jd) {
  const R = mission.radiation, xs = R.tau, tmax = xs[xs.length - 1] || 1, yrs = tmax > 800;
  const T = legend(g, [['Total', C.tot], ['Bad case', C.p95, [3, 3]], ['Cosmic rays', C.gcr], ...(R.totals.gas ? [['Interstellar gas', C.belt]] : [])], DW) + 18, L = 44, w = DW - L - 10, h = DH - T - 22;
  const ymax = Math.max(50, ...R.tot_p95) * 1.12, [X, Y, unit] = axes(g, L, T, w, h, ymax, tmax, yrs, DH, yrs ? 'ship years →' : 'ship days →');
  g.fillStyle = C.axis; g.fillText(unit, 4, T - 6);
  const line = (arr, col, dash, lw = 1) => { g.strokeStyle = col; g.setLineDash(dash || []); g.lineWidth = lw; g.beginPath(); arr.forEach((v, k) => k ? g.lineTo(X(xs[k]), Y(v)) : g.moveTo(X(xs[k]), Y(v))); g.stroke(); g.setLineDash([]); g.lineWidth = 1; };
  line(R.gcr_cum, C.gcr); if (R.gas_cum && R.totals.gas) line(R.gas_cum, C.belt); line(R.tot_p95, C.p95, [3, 3]); line(R.tot_mean, C.tot, null, 2);
  const xn = X(Math.min(starAt(jd).tau, tmax)); g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(xn + .5, T); g.lineTo(xn + .5, T + h); g.stroke();
}

// Solar cycle: sunspot forecast band, the cosmic-ray rate it controls, and where every candidate launch sits.
let solarBand = null, solarHits = [];
function drawSolar(jd) {
  if (!A) return; const c = chartCtx($('solarchart')); if (!c) return; const [g, DW, DH] = c;
  const ms = data.missions.map((m, i) => [m, i]).filter(([m]) => m.radiation && m.radiation.jd);
  const yl = ms.map(([m]) => Rad.yr(m.radiation.jd[0])), ye = ms.map(([m]) => Rad.yr(m.radiation.jd[m.radiation.jd.length - 1]));
  const y0 = Math.min(2025, Math.floor(Math.min(...yl)) - 1), y1 = Math.max(2041, Math.ceil(Math.max(...ye)) + 1);
  if (!solarBand || solarBand.y0 !== y0 || solarBand.y1 !== y1) solarBand = { y0, y1, ...Rad.ssnBand(y0, y1, 1 / 12) };
  const L = 34, Rr = 44, T = 14, B = 34, w = DW - L - Rr, h = DH - T - B, X = y => L + (y - y0) / (y1 - y0) * w;
  const smax = 320, gmax = 3.2, Ys = v => T + h - v / smax * h, Yg = v => T + h - v / gmax * h, S = solarBand;
  const Ja = A.P.J, a = Rad.yr(Ja[0]), b = Rad.yr(Ja[Ja.length - 1]);
  g.fillStyle = 'rgba(242,242,242,.07)'; g.fillRect(X(a), T, X(b) - X(a), h);
  g.strokeStyle = C.grid; g.fillStyle = C.axis;
  for (let v = 0; v <= smax; v += 100) { g.beginPath(); g.moveTo(L, Ys(v) + .5); g.lineTo(L + w, Ys(v) + .5); g.stroke(); g.fillText(v, 4, Ys(v) + 3); }
  g.textAlign = 'right'; for (let v = 0; v <= 3; v++) g.fillText(v.toFixed(0), DW - 4, Yg(v) + 3); g.textAlign = 'left';
  const ystep = (y1 - y0) > 16 ? 4 : 2;
  for (let y = Math.ceil(y0 / ystep) * ystep; y <= y1; y += ystep) { g.beginPath(); g.moveTo(X(y) + .5, T); g.lineTo(X(y) + .5, T + h); g.stroke(); g.fillText(y, X(y) - 12, T + h + 11); }
  g.fillStyle = 'rgba(224,176,80,.16)'; g.beginPath(); S.ys.forEach((y, k) => g.lineTo(X(y), Ys(S.hi[k]))); for (let k = S.ys.length - 1; k >= 0; k--) g.lineTo(X(S.ys[k]), Ys(S.lo[k])); g.closePath(); g.fill();
  g.strokeStyle = C.spe; g.lineWidth = 1.5; g.beginPath(); S.ys.forEach((y, k) => k ? g.lineTo(X(y), Ys(S.med[k])) : g.moveTo(X(y), Ys(S.med[k]))); g.stroke();
  g.strokeStyle = C.gcr; g.setLineDash([4, 3]); g.beginPath(); S.ys.forEach((y, k) => { const v = Rad.gcrRate(Rad.phi(y), 1) * A.f0; k ? g.lineTo(X(y), Yg(v)) : g.moveTo(X(y), Yg(v)); }); g.stroke(); g.setLineDash([]); g.lineWidth = 1;
  // label the turning points of the median cycle
  g.font = '9px ' + MONO;
  // smooth the median a little (observed months are noisy), then mark one max/min per turning point
  const sm = S.med.map((_, k) => { const a = S.med.slice(Math.max(0, k - 6), k + 7); return a.reduce((x, y) => x + y, 0) / a.length; });
  for (let k = 12, last = -99; k < S.ys.length - 12; k++) {
    const v = sm[k], win = sm.slice(k - 12, k + 13), isMax = v === Math.max(...win) && v > 90, isMin = v === Math.min(...win) && v < 40;
    if ((isMax || isMin) && S.ys[k] - last > 3) { g.fillStyle = isMax ? C.spe : '#8a8a8a'; g.fillText(`${isMax ? 'MAX' : 'MIN'} ${S.ys[k].toFixed(0)}`, X(S.ys[k]) - 20, Ys(isMax ? Math.max(v, S.hi[k]) : v) - 6); last = S.ys[k]; }
  }
  for (const st of run.storms) if (st.jd <= jd) { const x = X(Rad.yr(st.jd)); g.fillStyle = C.spe; g.fillRect(x - 1, T, 2, 6); }
  g.fillStyle = C.spe; g.fillText('SUNSPOTS', L + 4, T + 9); g.fillStyle = C.gcr; g.textAlign = 'right'; g.fillText('COSMIC RAYS mSv/day', L + w - 4, T + 9); g.textAlign = 'left';
  // candidate missions: launch date, coloured by expected dose
  solarHits = []; const yRow = T + h + 22;
  g.fillStyle = C.axis; g.fillText('LAUNCH', 2, yRow + 3);
  for (const [m, i] of ms) {
    const d = dose(m).mean, x = X(Rad.yr(m.radiation.jd[0])), col = d > 600 ? C.lim : d > 300 ? '#e0b050' : '#5fbf7f', on = i === mIndex;
    g.fillStyle = col; g.fillRect(x - (on ? 3.5 : 2.5), yRow - (on ? 3.5 : 2.5), on ? 7 : 5, on ? 7 : 5);
    if (on) { g.strokeStyle = '#f2f2f2'; g.strokeRect(x - 5.5, yRow - 5.5, 11, 11); }
    solarHits.push({ x, y: yRow, i });
  }
  const yn = Rad.yr(jd); g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(X(yn) + .5, T); g.lineTo(X(yn) + .5, T + h); g.stroke();
  g.font = '10px ' + MONO;
}

function updateRadNow(jd) {
  if (!A) return updateRadNowStar(jd);
  const P = A.P, J = P.J, [k, f] = gridAt(J, jd), dt = (J[k + 1] - J[k]) || 1;
  const onSurf = !!P.surf[k], rate = (A.gcrC[k + 1] - A.gcrC[k]) / dt, past = run.storms.filter(s => s.jd <= jd), nb = past.filter(s => run.big.includes(s)).length;
  const ss = Rad.ssn(Rad.yr(jd)), act = ss > 110 ? 'high' : ss < 40 ? 'low' : 'moderate';
  const items = [['Dose so far · this run', lerpAt(run.tot, k, f).toFixed(1), 'mSv'], [onSurf ? 'Surface rate' : 'Cosmic rays', rate.toFixed(2), 'mSv/day'],
    ['Storms so far', past.length ? `${past.length}${nb ? ` · ${nb} big` : ''}` : '0', ''], ['Sunspots', int(ss), act], ['From Sun', lerpAt(P.R.r_au, k, f).toFixed(2), 'AU']];
  // a storm stays on screen for 4 mission days or 4 real seconds, whichever is longer, so it reads at any speed
  const recent = lastStorm && performance.now() - lastStorm.at < 4000 && lastStorm.s.jd <= jd ? lastStorm.s : null;
  const st = recent || past.filter(s => jd - s.jd < 4).sort((a, b) => b.dose - a.dose)[0], belt = A.belts.find(b => Math.abs(b.jd - jd) < 1.5);
  $('radnow').innerHTML = items.map(([k, v, u]) => `<div><span>${k}</span><b>${v} <em>${u}</em></b></div>`).join('') +
    (st ? `<div class="wide alert storm">Solar storm (${Rad.stormClass(st.F)}): ${st.surf ? 'crew on the surface' : shield.shelter ? 'crew in the shelter' : 'no shelter aboard'}, +${sig(st.dose)} mSv${!st.surf && shield.shelter ? ` (${sig(st.cabin)} without the shelter)` : ''}</div>` : '') +
    (belt ? `<div class="wide alert">Crossing radiation belt: ${esc(belt.label)}, ${sig(belt.dose)} mSv</div>` : '');
}
function updateRadNowStar(jd) {
  const R = mission && mission.radiation; if (!R) return;
  const [k, f] = gridAt(R.jd, jd), q = starAt(jd);
  const items = [['Dose so far', lerpAt(R.tot_mean, k, f).toFixed(1), 'mSv'], ['Dose rate', lerpAt(R.gcr_rate, k, f).toFixed(2), 'mSv/day'], ['From Sun', q.x < 0.01 ? (q.x * 63241).toFixed(0) + ' AU' : q.x.toFixed(2) + ' ly', '']];
  $('radnow').innerHTML = items.map(([k, v, u]) => `<div><span>${k}</span><b>${v} <em>${u}</em></b></div>`).join('');
}
// dose rate the crew feels right now (cabin cutaway colouring)
function rateNow(jd) {
  if (!A) { const R = mission && mission.radiation; if (!R) return null; const [k, f] = gridAt(R.jd, jd); return lerpAt(R.gcr_rate, k, f); }
  const J = A.P.J, [k] = gridAt(J, jd), dt = (J[k + 1] - J[k]) || 1, st = run.storms.filter(s => s.jd <= jd && jd - s.jd < 2), belt = A.belts.find(b => Math.abs(b.jd - jd) < 1.5);
  return (A.gcrC[k + 1] - A.gcrC[k]) / dt + st.reduce((s, x) => s + x.dose / 2, 0) + (belt ? belt.dose : 0);
}
// Storms the playhead just crossed: flash the Sun in the 3D view.
function stormCheck(jd, prev) {
  if (!run) return;
  if (prev > 0 && jd > prev && jd - prev < 30) { const hit = run.storms.filter(s => s.jd > prev && s.jd <= jd); if (hit.length) { const s = hit.reduce((a, b) => b.F > a.F ? b : a); lastStorm = { s, at: performance.now() }; View.stormPulse(Math.min(1, 0.3 + Math.sqrt(s.F) * 1.2), Rad.stormClass(s.F)); } }
  const n = run.storms.filter(s => s.jd <= jd).length; if (n !== seen) { seen = n; drawTimeline(); }
}

// ------------------------------------------------------------------ hazards
// Mission-file notes were written as terse engineering shorthand; soften the shouting for display.
const tidy = s => String(s || '').replace(/\s+—\s+/g, '; ').replace(/\bALL ESTIMATES\b/g, 'All estimates').replace(/\b(ESTIMATES?|ASSUMPTION)\b/g, w => w.toLowerCase()).replace(/\bNOT\b/g, 'not').replace(/\s*\(not modelled\)/g, ' (not modelled)');
const LVL = { HIGH: 0, MED: 1, LOW: 2, INFO: 3 };
const lvl = (v, hi, med) => v > hi ? 'HIGH' : v > med ? 'MED' : 'LOW';
// Radiation hazards, recomputed from the live model so they follow the shielding.
function radHazards() {
  if (isStar()) return starRadHazards();
  if (!A) return [];
  const S = shield, days = A.P.J[A.P.J.length - 1] - A.P.J[0], y = Rad.yr(A.P.J[0]), ss = Rad.ssn(y), ss2 = Rad.ssn(y + 1);
  const phase = ss > 110 ? 'near solar maximum' : ss < 40 ? 'near solar minimum' : ss2 < ss ? 'while the Sun is quietening' : 'while the Sun is getting more active';
  const gMax = Rad.gcrRate(Rad.phi(2031.3), 1), gMin = Rad.gcrRate(Rad.phi(2035.3), 1);
  const out = [{ id: 'rad-cancer', cat: 'Radiation', title: `Cancer risk: ${fmtP(A.cancer)} chance from ${int(A.mean)} mSv`, value: A.mean / Rad.RISK.career * 100, unit: '% of career limit', level: lvl(A.mean, 600, 300), basis: 'quantitative',
    note: `Expected dose ${int(A.mean)} mSv, ${int(A.p95)} mSv in a bad case (worst 5% of ${A.n} simulated missions). At about ${Rad.RISK.cancerPerSv * 100}% extra cancer chance per Sv that is ${fmtP(A.cancer)} (bad case ${fmtP(A.cancerBad)}), on top of the roughly 40% lifetime chance everyone already has. NASA caps a career at 600 mSv.${A.mean > 600 ? ` This mission is ${(A.mean / 600).toFixed(1)}× that limit.` : ''} Above 1–2 Sv the risk numbers are extrapolations, and heart and brain effects are not counted.`,
    source: 'NASA-STD-3001 Vol. 1 Rev C (600 mSv career limit); BEIR VII Phase 2 (2006) lifetime attributable cancer incidence' },
  { id: 'rad-gcr', cat: 'Radiation', title: `Cosmic rays: ${int(A.gcr - A.surface)} mSv over ${int(days)} days`, value: (A.gcr - A.surface) / days, unit: 'mSv/day average', level: lvl(A.gcr, 600, 300), basis: 'quantitative',
    note: `Launch in ${y.toFixed(0)} ${phase}. Cosmic rays are strongest when the Sun is quiet (${gMax.toFixed(1)} mSv/day at the 2031 minimum against ${gMin.toFixed(1)} at the 2035 maximum). Shielding barely stops them${S.wall ? `: the extra ${S.wall} g/cm² wall cuts them by ${int((1 - A.f0) * 100)}%` : ''}. What works is less time in deep space, or flying near solar maximum.`,
    source: 'MSL/RAD cruise (Zeitlin et al. 2013, Science); LRO/CRaTER solar-cycle trend (Case et al. 2016)' },
  { id: 'rad-spe', cat: 'Radiation', title: `Solar storms: ${fmtP(A.pBig)} chance of a big one`, value: A.nBig, unit: 'big storms expected', prob: A.pArs, prob_label: 'chance of radiation sickness',
    level: A.pArs > 0.01 || A.spe_p95 > 250 ? 'HIGH' : (A.pBig > 0.3 || !S.shelter) ? 'MED' : 'LOW', basis: 'quantitative',
    note: `Storms come at random, more often near solar maximum. ${S.shelter ? `With the crew in the ${S.shelter} g/cm² shelter the bad case is ${int(A.spe_p95)} mSv; with no shelter it would be ${int(A0.spe_p95)} mSv and the chance of radiation sickness ${fmtP(A0.pArs, A0.n)}.` : `There is no shelter, so the crew takes the full dose: bad case ${int(A.spe_p95)} mSv.`} A storm the size of August 1972 would give ${int(Rad.d72(Rad.HULL * 0.9 + S.wall))} mSv inside the hull at 1 AU.`,
    source: 'Papaioannou et al. >30 MeV event catalogue 1956–2023; Townsend et al. August 1972 dose vs shielding' },
  { id: 'rad-30', cat: 'Radiation', title: `Worst 30 days: ${int(A.win30)} mSv of the 250 mSv limit`, value: A.win30, unit: 'mSv, bad case', level: lvl(A.win30, 250, 150), basis: 'quantitative',
    note: 'The 30-day limit protects the blood-forming organs from short, intense exposure, mostly from a storm landing during a stretch of high cosmic-ray dose.', source: 'NASA-STD-3001 Vol. 1 Rev C' }];
  const byBody = {}; for (const b of A.belts) (byBody[b.body] ||= []).push(b);
  for (const [body, bs] of Object.entries(byBody)) {
    const d = bs.reduce((s, b) => s + b.dose, 0), e = body === 'earth';
    out.push({ id: 'rad-belt-' + body, cat: 'Radiation', title: `${e ? 'Van Allen belts' : cap(body) + ' radiation belts'}: ${bs.length} pass${bs.length > 1 ? 'es' : ''}, ${sig(d)} mSv`, value: d, unit: 'mSv', level: d > 100 ? 'HIGH' : d > 20 ? 'MED' : 'LOW', basis: 'quantitative', jd0: bs[0].jd, jd1: bs[0].jd, body,
      note: e ? `Trapped protons and electrons 1,000–60,000 km up. A fast transit costs a few mSv${S.shelter ? ', less in the shelter' : ''}.` : `${bs.map(b => esc(b.label)).join('; ')}. Jupiter's belts are the harshest radiation in the solar system; dose falls about 30× between a pass at 9 and at 30 Jupiter radii. Order-of-magnitude estimate.`,
      source: e ? 'Artemis I Orion dosimetry (Nature 2024)' : 'Ringwald 2000 dose rates at the Galilean moons; Juno radiation vault' });
  }
  if (A.surface) out.push({ id: 'rad-surf', cat: 'Radiation', title: `Mars surface: ${int(A.surface)} mSv during the stay`, value: A.surface, unit: 'mSv', level: lvl(A.surface, 300, 100), basis: 'quantitative',
    note: 'The planet blocks half the sky and the thin air stops some particles, so the surface rate is about a third of deep space. Burying the habitat under regolith cuts it further (MARS HABITAT buttons in the radiation panel).', source: 'MSL/RAD Gale crater (Hassler et al. 2014)' });
  return out;
}
function starRadHazards() {
  const R = mission.radiation; if (!R) return [];
  const r = starRisk(mission), T = r.T, probe = !mission.summary.crew, who = probe ? 'A crew in this hull' : 'The crew';
  const out = [{ id: 'rad-cancer', cat: 'Radiation', title: r.lethal ? `${who} would get a lethal dose` : `Cancer risk${probe ? ' (if crewed)' : ''}: ${Rad.cancerLabel(T.total_mean)}${T.total_mean > 10000 ? '' : ' chance'} from ${T.total_mean > 10000 ? sig(T.total_mean / 1000) + ' Sv' : int(T.total_mean) + ' mSv'}`,
    value: r.lethal ? T.acute / 1000 : T.total_mean > 1e4 ? T.total_mean / 1000 : T.total_mean / 6, unit: r.lethal ? 'Sv in two days' : T.total_mean > 1e4 ? 'Sv' : '% of career limit', level: r.lethal || T.total_mean > 600 ? 'HIGH' : T.total_mean > 300 ? 'MED' : 'LOW', basis: 'quantitative',
    note: r.lethal ? `At cruise speed the interstellar gas delivers about ${sig(T.peak_rate / 1000 / 24)} Sv per hour through a ${sig(mission.params.frontal)} g/cm² bow shield. Around 6 Sv in a couple of days is fatal even with treatment, so the crew would not survive to see cancer. A forward shield thicker than the proton range is the fix.`
      : `${who} would take about ${int(T.total_mean)} mSv over ${dur(T.days)} of ship time (bad case ${int(T.total_p95)}). ${T.total_mean > 10000 ? 'That is far beyond anything the cancer risk models cover; heart, eye and brain damage would set in too.' : `At about 8% extra cancer chance per Sv that is ${fmtP(r.cancer)}, on top of the roughly 40% everyone has.`} NASA caps a career at 600 mSv.${T.total_mean > 600 ? ` This is ${(T.total_mean / 600).toFixed(1)}× that limit.` : ''}`,
    source: 'NASA-STD-3001 Vol. 1 Rev C; BEIR VII Phase 2 (2006); Semyonov 2020 https://arxiv.org/abs/2004.10079' },
  { id: 'rad-gcr', cat: 'Radiation', title: `Cosmic rays: ${T.gcr < 1e4 ? int(T.gcr) + ' mSv' : bigDose(T.gcr)} over ${durS(T.days)} aboard`, value: T.gcr / Math.max(1, T.days), unit: 'mSv/day average', level: T.gcr > 600 ? 'HIGH' : T.gcr > 300 ? 'MED' : 'LOW', basis: 'quantitative',
    note: `Outside the Sun's protective bubble (past ~120 AU) cosmic rays are about 36% stronger. ${mission.params.absorbs ? 'The Astrophage fuel tanks wrap the crew and absorb almost everything.' : `Thick shielding helps only slowly: this ship carries ${sig(mission.params.shield)} g/cm².`} Time aboard is the main driver, so faster ships and time dilation both cut the dose.`, source: 'MSL/RAD cruise (Zeitlin et al. 2013, Science)' }];
  return out;
}
let hzList = [];
function renderHazards() {
  const hz = hzList = [...radHazards(), ...(mission.risk || [])], [t0] = span();
  const counts = Object.fromEntries(Object.keys(LVL).map(k => [k, hz.filter(h => h.level === k).length]));
  $('hzcount').innerHTML = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `<span class="lv ${k}">${n} ${k}</span>`).join('');
  if (!hz.length) { $('hzt').innerHTML = '<div class="empty">No hazard analysis for this case.</div>'; return; }
  const open = new Set([...$('hzt').querySelectorAll('.hz.open')].map(el => el.dataset.id));
  const rows = hz.map((h, k) => [h, k]).sort((a, b) => LVL[a[0].level] - LVL[b[0].level]);
  const when = h => h.jd0 == null ? '' : isStar() ? `year ${(jdYear(h.jd0) - jdYear(t0)).toFixed(1)}` : `day ${int(Math.max(0, h.jd0 - t0))}`;
  const src = s => { if (!s) return ''; const m = s.match(/https?:\/\/[^\s)]+/); if (!m) return `<span class="src">${esc(s)}</span>`; let host = ''; try { host = new URL(m[0]).hostname.replace('www.', ''); } catch { } return `<a class="src" href="${esc(m[0])}" target="_blank" rel="noopener">[${esc(host || 'source')}]</a>`; };
  $('hzt').innerHTML = rows.map(([h, k]) => {
    const pr = h.cat === 'Radiation' ? (h.prob != null ? fmtP(h.prob, A && A.n) : '') : prob(h.prob), id = h.id || 'hz' + k;
    return `<article class="hz ${h.level}${h.cat === 'Radiation' ? ' rad' : ''}${open.has(id) ? ' open' : ''}" data-k="${k}" data-id="${esc(id)}">
      <div class="row"><span class="lv ${h.level}">${h.level}</span><h3>${esc(tidy(h.title))}</h3><b class="mv">${h.value == null ? '—' : sig(h.value)} <em>${esc(h.unit || '')}</em></b><span class="when">${when(h)}</span><span class="car">▸</span></div>
      <div class="more">
        <div class="meta"><span>${esc(h.cat)}</span><span>${String(h.basis).startsWith('quantitative') ? 'QUANTITATIVE' : 'QUALITATIVE'}</span>${pr ? `<span class="p">${pr} <em>${esc(h.prob_label || 'probability')}</em></span>` : ''}</div>
        ${h.note ? `<p>${h.cat === 'Radiation' ? h.note : esc(tidy(h.note))}</p>` : ''}
        ${h.source ? `<footer>${src(h.source)}</footer>` : ''}
      </div>
    </article>`;
  }).join('');
  $('hzt').querySelectorAll('.hz').forEach(el => {
    el.onclick = ev => { if (ev.target.closest('a')) return; el.classList.toggle('open'); const h = hzList[+el.dataset.k]; if (h.jd0 == null) return; const [a, b] = span(); setT((Math.max(a, h.jd0) - a) / (b - a)); };
  });
}

// ------------------------------------------------------------------ timeline
// A swing under ~8% stays a thin line. Sunspots use a fixed 0–250 scale so a quiet Sun stays low.
function seriesBounds(arr) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < (arr ? arr.length : 0); i++) { const v = arr[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!isFinite(mn)) return { mn: 0, mx: 0, span: 0, flat: true };
  const span = mx - mn;
  const flat = span <= 1e-6 || Math.abs(mx) < 1e-9 || span / Math.abs(mx) < 0.08;
  return { mn, mx, span, flat };
}
const betaText = v => { if (v < 5e-4) return '0'; const s = pct(v); return s.endsWith('%') ? s + ' c' : s; };
function laneChip(g, text, x, y, color) {
  g.font = '10px ' + MONO; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  const tw = Math.ceil(g.measureText(text).width);
  g.fillStyle = 'rgba(5,5,5,.9)'; g.fillRect(x, y - 9, tw + 6, 12);
  g.fillStyle = color; g.fillText(text, x + 3, y);
  return x + tw + 8;
}
function paintSeries(g, xs, vals, b, y0, y1, w, stroke, fill, lw = 1.25) {
  const n = vals.length, mid = (y0 + y1) / 2;
  g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = stroke;
  if (b.flat || b.span <= 1e-9) {
    const y = Math.round(mid) + 0.5;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    return;
  }
  const Y = v => y1 - 1.5 - ((v - b.mn) / b.span) * (y1 - y0 - 3);
  g.beginPath(); g.moveTo(xs[0], y1 - 0.5);
  for (let k = 0; k < n; k++) g.lineTo(xs[k], Y(vals[k]));
  g.lineTo(xs[n - 1], y1 - 0.5); g.closePath();
  g.fillStyle = fill; g.fill();
  g.beginPath();
  for (let k = 0; k < n; k++) { if (k) g.lineTo(xs[k], Y(vals[k])); else g.moveTo(xs[k], Y(vals[k])); }
  g.stroke();
}
function tickStem(g, x, y0, y1, color, cap, lw = 1.25) {
  const px = Math.round(x) + 0.5;
  g.strokeStyle = color; g.lineWidth = lw; g.beginPath(); g.moveTo(px, y0); g.lineTo(px, y1); g.stroke();
  if (!cap) return;
  g.fillStyle = color; const hw = lw > 1.5 ? 3 : 2;
  g.fillRect(Math.round(x) - hw, cap === 'top' ? y0 : y1 - 2, hw * 2 + 1, 2);
}
export function drawTimeline() {
  if (!mission) return; const tlc = $('tlc'), r = tlc.getBoundingClientRect(); if (!r.width || !r.height) return;
  const p = Math.min(devicePixelRatio, 2); tlc.width = r.width * p; tlc.height = r.height * p; const g = tlc.getContext('2d'); g.setTransform(p, 0, 0, p, 0, 0);
  const w = r.width, h = r.height, [t0, t1] = span(), X = jd => (jd - t0) / (t1 - t0) * w, jdNow = t0 + t * (t1 - t0); g.clearRect(0, 0, w, h);
  const R = mission.radiation, star = isStar(), lanes = [], SZ = { minor: .35, strong: .6, severe: .85, extreme: 1 };
  if (A && A.P) {   // live model: sunspot cycle on a fixed 0–250 scale, and the storms rolled so far
    const P = A.P, ssn = []; for (let k = 0; k < P.n; k++) ssn.push(Rad.ssn(P.Y[k]));
    const raw = seriesBounds(ssn), scale = Math.max(250, raw.mx), mid = Math.round(h * 0.5);
    lanes.push({ kind: 'sun', y0: 1, y1: mid - 2, b: raw.flat ? raw : { mn: 0, mx: scale, span: scale, flat: false }, vals: ssn, xs: P.J.map(X),
      text: raw.span <= 1 ? `SUNSPOTS ${Math.round(raw.mx)}` : `SUNSPOTS ${Math.round(raw.mn)}–${Math.round(raw.mx)}` });
    lanes.push({ kind: 'hits', y0: mid + 1, y1: h - 3 });
  } else if (R && R.jd && R.jd.length > 1 && R.gcr_rate && R.beta) {
    const gcrB = seriesBounds(R.gcr_rate), betaB = seriesBounds(R.beta), thin = gcrB.flat ? 16 : Math.round(h * 0.46), xs = R.jd.map(X);
    lanes.push({ kind: 'gcr', y0: 1, y1: thin, b: gcrB, vals: R.gcr_rate, xs, text: (gcrB.span <= 1e-6 ? `GCR ${sig(gcrB.mx)} mSv/d` : `GCR ${sig(gcrB.mn)}–${sig(gcrB.mx)} mSv/d`) + (star ? ' · STORMS none' : '') });
    lanes.push({ kind: 'speed', y0: thin + 3, y1: h - 3, b: betaB, vals: R.beta, xs, text: betaB.span <= 1e-6 ? `β ${betaText(betaB.mx)}` : `β ${betaText(betaB.mn)}–${betaText(betaB.mx)}` });
  }
  const look = { sun: ['#e0b050', 'rgba(224,176,80,.5)', '#e0b050', 1.35], gcr: ['#d0d0d0', 'rgba(154,154,154,.7)', '#cfcfcf', 1.35], speed: ['#f2f2f2', 'rgba(242,242,242,.4)', '#f2f2f2', 1.6] };
  if (lanes.length > 1) { g.strokeStyle = '#2e2e2e'; g.lineWidth = 1; const y = lanes[0].y1 + 1.5; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  const chips = [];
  for (const lane of lanes) {
    if (lane.kind === 'hits') {
      const hits = (run && run.storms || []).filter(s => s.jd <= jdNow), spanH = lane.y1 - lane.y0 - 3;
      if (!hits.length) { g.strokeStyle = 'rgba(224,176,80,.45)'; g.lineWidth = 1; const midY = Math.round((lane.y0 + lane.y1) / 2) + .5; g.beginPath(); g.moveTo(0, midY); g.lineTo(w, midY); g.stroke(); }
      for (const s of hits) { const sz = SZ[Rad.stormClass(s.F)] || .4, y1 = lane.y1 - 1; tickStem(g, X(s.jd), y1 - spanH * sz, y1, '#e0b050', 'top'); }
      lane.text = hits.length ? `STORMS ${hits.length} this run` : 'STORMS none yet'; lane.ink = '#e0b050'; lane.hits = hits;
    } else {
      const [stroke, fill, ink, lw] = look[lane.kind];
      paintSeries(g, lane.xs, lane.vals, lane.b, lane.y0, lane.y1, w, stroke, fill, lw); lane.ink = ink;
    }
    chips.push(laneChip(g, lane.text, 3, Math.min(lane.y1 - 2, lane.y0 + 12), lane.ink));
  }
  const nameFloor = Math.max(8, ...chips, 0);
  g.font = '10px ' + MONO;
  for (const ph of mission.phases || []) {
    const a = X(ph.jd0), b = X(ph.jd1), stay = /stay|surface/.test(ph.name);
    g.fillStyle = stay ? '#9ccf7a' : 'rgba(242,242,242,.28)'; g.fillRect(a, h - 2, Math.max(1, b - a), 2);
    const name = ph.name.toUpperCase(), tw = g.measureText(name).width;
    if (b - a < tw + 10) continue;
    const host = lanes[lanes.length - 1]; const y = host ? Math.min(host.y1 - 2, host.y0 + 12) : 12;
    let x = a + 4; if (x < nameFloor) x = nameFloor; if (x + tw + 8 > b) continue;
    laneChip(g, name, x, y, stay ? '#9ccf7a' : '#8a8a8a');
  }
  const evTicks = [];
  for (const e of mission.events) {
    const x = X(e.jd), col = EVC[e.hazard ? 'hazard' : e.type] || '#f2f2f2', kind = e.hazard ? 'hz' : e.type;
    const speedLane = lanes.find(l => l.kind === 'speed');
    if (kind === 'flyby') tickStem(g, x, 0, 11, col, 'top');
    else if (kind === 'dsm' && speedLane) tickStem(g, x, speedLane.y0, speedLane.y1, col, 'top');
    else if (kind === 'dsm') tickStem(g, x, 0, 6, col, 'top');
    else tickStem(g, x, 0, kind === 'hz' ? 13 : 9, col, 'top');
    evTicks.push(`<div class="tick" title="${esc((e.date || '') + ' ' + e.label)}" style="left:${(e.jd - t0) / (t1 - t0) * 100}%"></div>`);
  }
  for (const b of (A && A.belts) || (R && R.belts) || []) {
    tickStem(g, X(b.jd), h - 15, h - 2, '#e0605a', 'bottom', 2);
    evTicks.push(`<div class="tick" title="${esc('Radiation belt · ' + (b.label || b.body || ''))}" style="left:${(b.jd - t0) / (t1 - t0) * 100}%"></div>`);
  }
  const hitsLane = lanes.find(l => l.kind === 'hits');
  if (hitsLane) for (const s of hitsLane.hits || []) evTicks.push(`<div class="tick" title="${esc('Solar storm (' + Rad.stormClass(s.F) + ') +' + sig(s.dose) + ' mSv')}" style="left:${(s.jd - t0) / (t1 - t0) * 100}%"></div>`);
  $('ticks').innerHTML = evTicks.join('');
  const y0 = jdYear(t0), y1 = jdYear(t1), spanY = y1 - y0;
  const step = [1 / 12, 1 / 6, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000].find(s => spanY / s <= Math.max(3, Math.min(10, Math.floor(w / 75)))) || 1e6;
  const out = []; for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) out.push(y);
  $('tlaxis').innerHTML = out.map(y => `<span style="left:${(yearJd(y) - t0) / (t1 - t0) * 100}%">${step < 1 ? fmtDate(yearJd(y)).slice(0, 7) : (Math.abs(y) >= 1e4 ? Math.round(y).toLocaleString('en-US') : Math.round(y))}</span>`).join('');
}
export function bindTimeline() {
  const track = $('track'), scrub = ev => { const r = track.getBoundingClientRect(); setT((ev.clientX - r.left) / r.width); };
  track.addEventListener('pointerdown', ev => { scrub(ev); track.setPointerCapture(ev.pointerId); track.onpointermove = scrub; });
  track.addEventListener('pointerup', () => { track.onpointermove = null; });
  $('play').onclick = () => togglePlay(); $('play').innerHTML = PLAY;
  addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName) && !$('app').hidden) { e.preventDefault(); togglePlay(); } });
  new ResizeObserver(() => { drawTimeline(); }).observe(track);
  document.fonts && document.fonts.ready.then(() => { drawTimeline(); lastJd = -1; });
  new ResizeObserver(() => { lastJd = -1; }).observe($('dosechart'));
  new ResizeObserver(() => { lastJd = -1; }).observe($('solarchart'));
  new ResizeObserver(() => { if (mission && mission.isru) drawIsru(); }).observe($('isruchart'));
}

// ------------------------------------------------------------------ crew cabin cutaway
let cab = null;
function initCabin() {
  const host = $('cutwrap'), cv = $('cut');
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setClearColor(0x000000, 0);
  const S = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 400); cam.up.set(0, 0, 1);
  S.add(new THREE.AmbientLight(0xffffff, .55)); const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(6, -9, 12); S.add(dl);
  const RH = 4.5, HG = 7.0, ARC = Math.PI * 1.25, A0 = Math.PI * 0.375;
  const heatCols = ['#1a1a1a', '#5a5a5a', '#d0a040', '#e0605a'].map(c => new THREE.Color(c));
  const heat = x => { x = Math.max(0, Math.min(1, x || 0)); const s = x * 3, k = Math.min(2, Math.floor(s)); return heatCols[k].clone().lerp(heatCols[k + 1], s - k); };
  const hullGeo = new THREE.CylinderGeometry(RH, RH, HG, 64, 10, true, A0, ARC); hullGeo.rotateX(Math.PI / 2);
  hullGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(hullGeo.attributes.position.count * 3), 3));
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: .82 })); S.add(hull);
  S.add(new THREE.LineSegments(new THREE.EdgesGeometry(hullGeo, 30), new THREE.LineBasicMaterial({ color: 0x8a8a8a })));
  const deck = new THREE.Mesh(new THREE.CircleGeometry(RH, 64, A0, ARC), new THREE.MeshLambertMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide })); deck.position.z = -HG / 2; S.add(deck);
  const deck2 = deck.clone(); deck2.position.z = 0.6; deck2.material = deck.material.clone(); deck2.material.transparent = true; deck2.material.opacity = .35; S.add(deck2);
  const shG = new THREE.CylinderGeometry(1.6, 1.6, 2.4, 40, 1, true, A0, ARC); shG.rotateX(Math.PI / 2);
  const shMat = new THREE.MeshLambertMaterial({ color: 0x5a5a5a, transparent: true, opacity: .55, side: THREE.DoubleSide }), shelter = new THREE.Mesh(shG, shMat); shelter.position.z = -HG / 2 + 1.2; S.add(shelter);
  const shEdge = new THREE.LineSegments(new THREE.EdgesGeometry(shG, 30), new THREE.LineBasicMaterial({ color: 0xd0d0d0 })); shEdge.position.copy(shelter.position); S.add(shEdge);
  const crew = new THREE.Group(); S.add(crew);
  const crewGeo = {
    leg: new THREE.CapsuleGeometry(0.06, 0.42, 2, 6), torso: new THREE.BoxGeometry(0.36, 0.48, 0.2),
    head: new THREE.SphereGeometry(0.15, 12, 8), visor: new THREE.BoxGeometry(0.16, 0.06, 0.04), arm: new THREE.CapsuleGeometry(0.045, 0.36, 2, 6),
  };
  const suitMat = new THREE.MeshLambertMaterial({ color: 0xd8dee4 }), visorMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  cab = { r, S, cam, host, hull, hullGeo, heat, shelter, shEdge, shMat, crew, crewGeo, suitMat, visorMat, RH, HG, w: 1, h: 1 };
  const fit = () => {
    const b = host.getBoundingClientRect(); cab.w = Math.max(1, b.width); cab.h = Math.max(1, b.height);
    r.setSize(cab.w, cab.h, false); cam.aspect = cab.w / cab.h;
    // keep the whole cutaway (bounding radius ~7.5) inside both the horizontal and vertical field of view
    const R0 = 7.6, vf = THREE.MathUtils.degToRad(cam.fov) / 2, hf = Math.atan(Math.tan(vf) * cam.aspect), d = R0 / Math.sin(Math.min(vf, hf));
    cam.position.set(0.62, -0.62, 0.48).normalize().multiplyScalar(d); cam.lookAt(0, 0, -0.4); cam.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(host); fit();
}
// ------------------------------------------------------------------ holographic vehicle
let holo = null, view = 'holo';
export function bindVehicleView() {
  holo = new Holo($('holo'), $('holowrap'), { label: $('hololen') }); holo.seqEl = $('holoseq');
  $('ascbtn').onclick = () => runAscent();
  $('vseg').querySelectorAll('button').forEach(b => b.onclick = () => {
    view = b.dataset.v; $('vseg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    $('holowrap').hidden = view !== 'holo'; $('cutwrap').hidden = view !== 'cabin'; holo.visible = view === 'holo';
    if (mission) cabinFor(mission);
  });
}
function holoFor(m) {
  if (!holo) return;
  const id = m.vehicleId || data.vehicleId || 'starship', v = vehicleById(isStar() ? 'star' : 'planet', id);
  holo.show(id, 'ship'); $('holoname').textContent = v ? (STARSHIP_IDS.has(id) ? v.name + ' V3' : v.name) : m.model || id;
  $('ascbtn').hidden = !LAUNCH_IDS.has(id); $('ascbtn').textContent = STARSHIP_IDS.has(id) ? '▶ ASCENT' : '▶ LAUNCH';
}
const STARSHIP_IDS = new Set(['starship', 'starship-lite', 'starship-heavy']);
const LAUNCH_IDS = new Set([...STARSHIP_IDS, 'titan3e', 'titan4b', 'atlas541']);
const hasLaunch = () => !isStar() && holo && LAUNCH_IDS.has(mission.vehicleId || data.vehicleId);
// Play the launch, hot staging and booster return in the hologram before the mission clock starts.
function runAscent() {
  if (!holo || !LAUNCH_IDS.has(holo.id)) return false;
  if (view !== 'holo') $('vseg').querySelector('[data-v=holo]').click();
  return holo.startAscent(null, mission.summary.tankers_needed || 0);
}
function entryAt(jd) {
  let x = 0;
  for (const e of mission.events) if ((e.type === 'arrival' && /aero|edl/.test(mission.summary.capture || '')) || e.type === 'return' || /entry|EDL|aerocapture/i.test(e.label))
    if (Math.abs(e.jd - jd) < 2) x = Math.max(x, 1 - Math.abs(e.jd - jd) / 2);
  return x;
}
function thrustAt(jd) {
  if (isStar()) { const ph = (mission.phases || []).find(p => jd >= p.jd0 && jd <= p.jd1); return ph && ph.name !== 'cruise' ? 1 : 0; }
  let b = 0; for (const e of mission.events) if (e.dv > 0.1 && Math.abs(e.jd - jd) < 3) b = Math.max(b, 1 - Math.abs(e.jd - jd) / 3);
  return b;
}

// Low-poly crew. Local +Y is up; the group is tipped onto cabin Z and yawed to face out.
// Ring radius, count and suit colour match the markers this replaced.
function crewFigure(angle) {
  const g = new THREE.Group(), suit = cab.suitMat;
  const put = (geo, x, y, z, mat) => { const m = new THREE.Mesh(geo, mat || suit); m.position.set(x, y, z); g.add(m); return m; };
  put(cab.crewGeo.leg, -0.10, -0.38, 0); put(cab.crewGeo.leg, 0.10, -0.38, 0);
  put(cab.crewGeo.torso, 0, 0.13, 0);
  put(cab.crewGeo.head, 0, 0.50, 0);
  put(cab.crewGeo.visor, 0, 0.51, 0.175, cab.visorMat);
  const hang = (x, rz) => {
    const p = new THREE.Group(); p.position.set(x, 0.30, 0); p.rotation.z = rz;
    const m = new THREE.Mesh(cab.crewGeo.arm, suit); m.position.y = -(cab.crewGeo.arm.parameters.length / 2 + cab.crewGeo.arm.parameters.radius); p.add(m); g.add(p);
  };
  hang(-0.20, -0.55); hang(0.20, 0.55);
  g.rotation.x = Math.PI / 2;
  const yaw = new THREE.Group(); yaw.rotation.z = angle + Math.PI / 2; yaw.add(g);
  yaw.position.set(Math.cos(angle) * .8, Math.sin(angle) * .8, -cab.HG / 2 + .75);
  return yaw;
}
function cabinFor(m) {
  if (!cab) initCabin();
  const n = isStar() ? Math.min(6, m.summary.crew || 0) : 4;
  cab.crew.clear();
  for (let k = 0; k < n; k++) cab.crew.add(crewFigure(k / Math.max(1, n) * Math.PI * 2 + 0.4));
  const p = m.params || {};
  $('cutnote').textContent = view !== 'cabin' ? '' : isStar() ? (p.absorbs ? 'Fuel tanks wrap the crew' : !m.summary.crew ? 'Uncrewed: no cabin' : `${sig(p.shield)} g/cm² shielding`) : `hull 4 mm 304L${shield.wall ? ` + ${shield.wall} g/cm² water` : ''} · ${shield.shelter ? `shelter ${shield.shelter} g/cm²` : 'no shelter'}`;
  cab.astro = !!p.absorbs; cab.probe = isStar() && !m.summary.crew;
}
function updateCabin(jd) {
  if (!cab) return; const rate = rateNow(jd);
  if (rate == null) { cab.r.render(cab.S, cab.cam); return; }
  const rn = Math.min(1, Math.log10(1 + rate) / Math.log10(51));
  const col = cab.hullGeo.attributes.color, P = cab.hullGeo.attributes.position;
  for (let k = 0; k < P.count; k++) { const z = P.getZ(k) / cab.HG + .5; const c = cab.astro ? new THREE.Color('#7a5a2a').lerp(new THREE.Color('#d09040'), .5 + .3 * Math.sin(z * 8 + jd * .2)) : cab.heat(rn * (0.75 + 0.25 * Math.sin(z * 6 + jd * .3))); col.setXYZ(k, c.r, c.g, c.b); }
  col.needsUpdate = true;
  const sh = !!A && shield.shelter > 0; cab.shelter.visible = cab.shEdge.visible = sh; cab.shMat.color.copy(cab.heat(rn * .35));
  $('cutleg').innerHTML = `<b>${rate.toFixed(2)} mSv/d</b>`;
  cab.r.render(cab.S, cab.cam);
}
