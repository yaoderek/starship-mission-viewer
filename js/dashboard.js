// Dashboard panels. Works on both planetary mission files and generated interstellar missions.
import * as THREE from 'three';
import * as View from './scene.js';
import { EVC } from './scene.js';
import { Holo } from './holo.js';
import { vehicleById } from './catalog.js';
import { HISTORIC } from './historic.js';
import { $, cap, esc, f1, int, sig, prob, dur, mass, energy, fmtDate, jdYear, yearJd } from './fmt.js';

const MODES = { 'one-way': 'One-way', conjunction: 'Long stay', opposition: 'Short stay', isru: 'Surface + ISRU', 'round-trip': 'Round trip', rendezvous: 'Stops', flyby: 'Flyby' };
const C = { surf: '#9ccf7a', gcr: '#9a9a9a', spe: '#e0b050', belt: '#e0605a', tot: '#f2f2f2', p95: '#6a6a6a', lim: '#e0605a', grid: '#1c1c1c', axis: '#5a5a5a' };
let data = null, mission = null, mIndex = 0, modeFilter = 'all', regSel = null, sheltered = true;
let t = 0, playing = false, sortKey = 'rank', sortDir = 1, lastJd = -1;
const isStar = () => data && data.kind === 'interstellar';
const isHist = () => data && data.kind === 'historic';
export const state = { get t() { return t; }, get mission() { return mission; }, get data() { return data; } };

// ------------------------------------------------------------------ public API
export function load(d, mi = 0) {
  data = d; modeFilter = 'all'; sortKey = 'rank'; sortDir = 1; regSel = null;
  View.setData(d);
  document.body.classList.toggle('mode-star', isStar()); document.body.classList.toggle('mode-solar', !isStar());
  renderModes(); select(Math.min(mi, d.missions.length - 1));
}
export function select(i) {
  mIndex = i; mission = data.missions[i];
  if (isHist() && data.target !== mission.target) { data.target = mission.target; View.setData(data); }
  View.setMission(mission);
  renderCmp(); renderEvents(); renderBudget(); renderReg(); renderRad(); renderHazards(); cabinFor(mission); holoFor(mission);
  drawTimeline(); setT(0); lastJd = -1;
}
export function setT(f) { t = Math.max(0, Math.min(1, f)); }
export function togglePlay(force) { playing = force ?? !playing; if (t >= 1 && playing) t = 0; if (playing && t < 1e-6 && hasLaunch()) runAscent(); $('play').classList.toggle('on', playing); $('play').innerHTML = playing ? PAUSE : PLAY; }
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
  if (Math.abs(jd - lastJd) > 1e-6) { drawChart(jd); updateRadNow(jd); lastJd = jd; }
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
const regF = (R, x) => { const k = Object.keys(R.regolith).find(q => Math.abs(parseFloat(q) - x) < 1e-6); return k ? R.regolith[k] : 1; };
function regK(m) { const R = m.radiation; if (!R || !R.regolith || regSel == null) return 1; return regF(R, regSel) / regF(R, R.regolith_used ?? 0); }
function dose(m) {
  const T = m.radiation && m.radiation.totals; if (!T) return {};
  const ds = (T.surface || 0) * (1 - regK(m));
  return sheltered ? { mean: T.total_mean_sh - ds, p95: T.total_p95_sh - ds } : { mean: T.total_mean - ds, p95: T.total_p95 - ds };
}
function adj(arr) { const R = mission.radiation, k = regK(mission); if (k === 1 || !R.surf_cum) return arr; return arr.map((v, i) => v - R.surf_cum[i] * (1 - k)); }
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
  ['feas', 'Status', '', m => m.summary.feasible ? 0 : 1, go]];
const HIST_COLS = [
  ['name', 'Mission', '', m => m.rank, m => `${m.name}<div class="sub">${m.model}</div>`, 'l'],
  ['launch', 'Launch', '', m => m.summary.launch, m => m.summary.launch],
  ['arrive', 'Arrival', '', m => m.summary.arrive, m => m.summary.arrive],
  ['dur', 'Cruise', '', m => m.summary.total_days, m => dur(m.summary.total_days)],
  ['c3', 'C3', 'km²/s²', m => m.summary.c3, m => f1(m.summary.c3, 1)],
  ['fb', 'Flybys', '', m => m.summary.flybys.length, m => m.summary.flybys.length ? m.summary.flybys.map(b => b[0].toUpperCase()).join('-') : '<span class="dim">direct</span>']];
const STAR_COLS = [
  ['name', 'Vehicle', '', m => m.rank, m => `${m.name}${(m.tags || []).includes('yours') ? '<span class="tag acc">SELECTED</span>' : ''}<div class="sub">${m.model}</div>`, 'l'],
  ['crew', 'Crew', '', m => m.summary.crew, m => m.summary.crew || '<span class="dim">probe</span>'],
  ['beta', 'Top speed', 'of c', m => m.summary.beta, m => pct(m.summary.beta)],
  ['earth', 'Earth time', '', m => m.summary.earth_days, m => dur(m.summary.earth_days)],
  ['ship', 'Ship time', '', m => m.summary.ship_days, m => `<span class="acc">${dur(m.summary.ship_days)}</span>`],
  ['prop', 'Propellant', '', m => m.summary.prop_used_t, m => m.summary.kind === 'rocket' ? mass(m.summary.prop_used_t) : '<span class="dim">none</span>'],
  ['arr', 'At target', '', m => m.summary.decel ? 0 : 1, m => m.summary.decel ? 'stops' : '<span class="wn">flyby</span>', 'l'],
  ['dose', 'Dose', 'mSv', m => m.summary.crew ? m.summary.dose_mean : 1e12, m => m.summary.crew ? doseCell(m.summary.dose_mean) : '<span class="dim">—</span>']];

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
function renderReg() {
  const on = !!(mission && mission.summary.surface); $('regseg').style.display = on ? '' : 'none';
  const cur = regSel ?? (mission && mission.radiation ? mission.radiation.regolith_used ?? 0 : 0);
  $('regseg').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.r === +cur));
}
export function bindRadControls() {
  $('regseg').querySelectorAll('button').forEach(b => b.onclick = () => { regSel = +b.dataset.r; renderReg(); renderCmp(); renderRad(); lastJd = -1; });
  $('shelter').onchange = e => { sheltered = e.target.checked; renderCmp(); renderRad(); lastJd = -1; };
}
function bar(label, v, lim, limLabel) {
  const f = v / lim, c = f > 1 ? 'no' : f > 0.6 ? 'wn' : 'ok';
  return `<div class="lim"><div class="lt"><span>${label}</span><b class="${c}">${int(v)} <em>/ ${lim} mSv</em></b></div><div class="lbar"><i class="${c}" style="width:${Math.min(100, f * 100).toFixed(1)}%"></i>${f > 1 ? '' : ''}</div><div class="ln">${limLabel}</div></div>`;
}
function renderRad() {
  const R = mission.radiation;
  $('shelterwrap').style.display = isStar() ? 'none' : '';
  if (!R) { $('limits').innerHTML = `<div class="empty">${isHist() ? 'Robotic mission: no crew aboard, so no crew dose.' : 'No radiation analysis for this case (it is a validation trajectory).'}</div>`; $('radnow').innerHTML = ''; $('radbreak').innerHTML = ''; return; }
  const T = R.totals, sh = sheltered, D = isStar() ? { mean: T.total_mean, p95: T.total_p95 } : dose(mission);
  const w30 = sh ? T.win30_p95_sh : T.win30_p95, w365 = sh ? T.win365_p95_sh : T.win365_p95;
  const crewNote = isStar() && !mission.summary.crew ? '<div class="empty">Uncrewed probe. Numbers show what a crew would receive in this hull.</div>' : '';
  $('limits').innerHTML = crewNote + bar('Whole mission, expected', D.mean, 600, 'NASA career limit (NASA-STD-3001)') +
    bar('Worst 30 days, bad case', w30, 250, '30-day blood-forming organ limit') + bar('Worst year, bad case', w365, 500, '1-year blood-forming organ limit');
  const rows = isStar()
    ? [['Cosmic rays', T.gcr, `${sig(T.gcr_p05)}–${sig(T.gcr_p95)}`], ['Shielding', null, mission.params.absorbs ? 'Astrophage fuel (absorbs nearly everything)' : `${sig(mission.params.shield)} g/cm² water-equivalent`], ['Time aboard', null, dur(T.days) + ' ship time']]
    : [['Cosmic rays', T.gcr, `range ${sig(T.gcr_p05)}–${sig(T.gcr_p95)}`], ['Solar storms', sh ? T.spe_mean_sh : T.spe_mean, `bad case ${sig(sh ? T.spe_p95_sh : T.spe_p95)}`],
      ['Radiation belts', sh ? T.belts_sh : T.belts, 'Earth, Jupiter'], ...(T.surface ? [['On the surface', T.surface * regK(mission), `0.64 mSv/day × ${(regK(mission) * regF(R, R.regolith_used ?? 0)).toFixed(2)} habitat`]] : []),
      ['Total', D.mean, `bad case ${sig(D.p95)}`]];
  $('radbreak').innerHTML = rows.map(r => `<tr><td class="l">${r[0]}</td><td>${r[1] == null ? '' : sig(r[1]) + ' <em>mSv</em>'}</td><td class="l dim">${r[2]}</td></tr>`).join('');
  $('radnote').textContent = isStar() ? 'Deep-space rate from Curiosity’s cruise to Mars (1.84 mSv/day), 1.36× beyond the heliopause, scaled for shielding. Rough estimate.'
    : `${mission.mode && mission.mode !== 'one-way' ? 'Whole mission, there and back.' : 'One-way transit.'} Hull ${T.hull_gcm2} g/cm² steel, storm shelter ${T.shelter_gcm2} g/cm² water. Estimates; method in VERIFICATION.md.`;
  $('shval').textContent = `${T.shelter_gcm2} g/cm²`;
}
const dc = () => $('dosechart');
function drawChart(jd) {
  const cv = dc(), r = cv.getBoundingClientRect(); if (!r.width || !r.height) return;
  const p = Math.min(devicePixelRatio, 2); if (cv.width !== Math.round(r.width * p) || cv.height !== Math.round(r.height * p)) { cv.width = r.width * p; cv.height = r.height * p; }
  const g = cv.getContext('2d'); g.setTransform(p, 0, 0, p, 0, 0); const DW = r.width, DH = r.height; g.clearRect(0, 0, DW, DH); g.font = '10px ' + MONO;
  const R = mission && mission.radiation; if (!R) { g.fillStyle = C.axis; g.fillText('No radiation data', 10, 20); return; }
  const L = 44, Rr = 10, T = 26, B = 22, w = DW - L - Rr, h = DH - T - B;
  const star = isStar(), xs = star ? R.tau : R.jd.map(x => x - R.jd[0]), tmax = xs[xs.length - 1] || 1, yrs = tmax > 800;
  const tot = adj(sheltered ? R.tot_mean_sh : R.tot_mean), p95 = adj(sheltered ? R.tot_p95_sh : R.tot_p95), spe = sheltered ? R.spe_mean_sh : R.spe_mean, belt = sheltered ? R.belt_cum_sh : R.belt_cum;
  const ymax = Math.max(50, ...p95) * 1.12, X = v => L + v / tmax * w, Y = v => T + h - v / ymax * h;
  if (!star) for (const ph of mission.phases || []) if (ph.name.includes('stay')) { const a = X(ph.jd0 - R.jd[0]), b = X(ph.jd1 - R.jd[0]); g.fillStyle = 'rgba(156,207,122,.07)'; g.fillRect(a, T, b - a, h); g.fillStyle = '#6f8f5a'; g.fillText('on surface', a + 4, T + h - 5); }
  g.strokeStyle = C.grid; g.lineWidth = 1; g.fillStyle = C.axis;
  const step = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].find(s => ymax / s <= 6) || 1e5;
  for (let v = 0; v <= ymax; v += step) { g.beginPath(); g.moveTo(L, Y(v) + .5); g.lineTo(L + w, Y(v) + .5); g.stroke(); g.fillText(int(v), 4, Y(v) + 3); }
  const unit = yrs ? 365.25 : 1, xsStep = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000, 10000, 50000].map(s => s * (yrs ? 365.25 : 1)).concat(yrs ? [] : [30, 60, 90, 180, 365]).sort((a, b) => a - b).find(s => tmax / s <= 7) || tmax;
  for (let v = 0; v <= tmax + 1e-9; v += xsStep) { g.beginPath(); g.moveTo(X(v) + .5, T); g.lineTo(X(v) + .5, T + h); g.stroke(); g.fillText(int(v / unit), X(v) - 4, DH - 7); }
  g.textAlign = 'right'; g.fillText(star ? (yrs ? 'ship years →' : 'ship days →') : (yrs ? 'years →' : 'mission day →'), L + w - 4, T + h - 6); g.textAlign = 'left'; g.fillText('mSv', 4, T - 8);
  const line = (arr, col, dash, lw = 1) => { g.strokeStyle = col; g.setLineDash(dash || []); g.lineWidth = lw; g.beginPath(); arr.forEach((v, k) => k ? g.lineTo(X(xs[k]), Y(v)) : g.moveTo(X(xs[k]), Y(v))); g.stroke(); g.setLineDash([]); g.lineWidth = 1; };
  if (600 <= ymax) { g.strokeStyle = C.lim; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(L, Y(600)); g.lineTo(L + w, Y(600)); g.stroke(); g.setLineDash([]); g.fillStyle = C.lim; g.fillText('career limit 600', L + w - 100, Y(600) - 4); }
  const gc = R.surf_cum ? R.gcr_cum.map((v, i) => v - R.surf_cum[i]) : R.gcr_cum;
  if (R.surf_cum && R.totals.surface) line(adj(R.surf_cum), C.surf);
  if (!star) { line(spe, C.spe); line(belt, C.belt); }
  line(gc, C.gcr); line(p95, C.p95, [3, 3]); line(tot, C.tot, null, 2);
  const now = star ? starAt(jd).tau : jd - R.jd[0], xn = X(Math.min(now, tmax));
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(xn + .5, T); g.lineTo(xn + .5, T + h); g.stroke();
  let lx = L; const items = [['Total', C.tot], ['Bad case', C.p95], ['Cosmic rays', C.gcr], ...(star ? [] : [['Solar storms', C.spe], ['Belts', C.belt]]), ...(R.totals.surface ? [['Surface', C.surf]] : [])];
  for (const [k, c] of items) { g.fillStyle = c; g.fillRect(lx, 8, 10, 2.5); g.fillStyle = '#8a8a8a'; g.fillText(k.toUpperCase(), lx + 14, 12); lx += g.measureText(k).width + 26; }
}
function radAt(jd) {
  const R = mission && mission.radiation; if (!R) return null; const J = R.jd, n = J.length;
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (J[m] <= jd) lo = m; else hi = m; } const k = Math.min(lo, n - 2);
  const f = Math.max(0, Math.min(1, (jd - J[k]) / (J[k + 1] - J[k] || 1))), I = a => a[k] + f * (a[k + 1] - a[k]);
  const tot = adj(sheltered ? R.tot_mean_sh : R.tot_mean), spe = sheltered ? R.spe_mean_sh : R.spe_mean;
  const dt = (J[k + 1] - J[k]) || 1, speRate = (spe[k + 1] - spe[k]) / dt;
  const belt = (R.belts || []).find(b => Math.abs(b.jd - jd) < 1.5);
  const onSurf = (mission.phases || []).some(p => p.name === 'surface stay' && jd >= p.jd0 && jd <= p.jd1);
  return { onSurf, cum: I(tot), p95: I(adj(sheltered ? R.tot_p95_sh : R.tot_p95)), gcr: I(R.gcr_rate) * (onSurf ? regK(mission) : 1), spe: speRate, r: I(R.r_au), p30: I(R.spe_p30), belt };
}
function updateRadNow(jd) {
  const q = radAt(jd); if (!q) return;
  const items = isStar()
    ? [['Dose so far', q.cum.toFixed(1), 'mSv'], ['Dose rate', q.gcr.toFixed(2), 'mSv/day'], ['From Sun', q.r < 0.01 ? (q.r * 63241).toFixed(0) + ' AU' : q.r.toFixed(2) + ' ly', '']]
    : [['Dose so far', q.cum.toFixed(1), 'mSv'], [q.onSurf ? 'Surface rate' : 'Cosmic rays', q.gcr.toFixed(2), 'mSv/day'], ['Storm risk', (q.p30 * 100).toFixed(1), '% / 30 d'], ['From Sun', q.r.toFixed(2), 'AU']];
  $('radnow').innerHTML = items.map(([k, v, u]) => `<div><span>${k}</span><b>${v} <em>${u}</em></b></div>`).join('') +
    (q.belt ? `<div class="wide alert">Crossing radiation belt: ${esc(q.belt.label)}, ${sig(sheltered ? q.belt.sheltered : q.belt.hull)} mSv</div>` : '');
}

// ------------------------------------------------------------------ hazards
// Mission-file notes were written as terse engineering shorthand; soften the shouting for display.
const tidy = s => String(s || '').replace(/\s+—\s+/g, '; ').replace(/\bALL ESTIMATES\b/g, 'All estimates').replace(/\b(ESTIMATES?|ASSUMPTION)\b/g, w => w.toLowerCase()).replace(/\bNOT\b/g, 'not').replace(/\s*\(not modelled\)/g, ' (not modelled)');
const LVL = { HIGH: 0, MED: 1, LOW: 2, INFO: 3 }, LVLNAME = { HIGH: 'High', MED: 'Medium', LOW: 'Low', INFO: 'Info' };
function renderHazards() {
  const hz = mission.risk || [], [t0] = span();
  const counts = Object.fromEntries(Object.keys(LVL).map(k => [k, hz.filter(h => h.level === k).length]));
  $('hzcount').innerHTML = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `<span class="lv ${k}">${n} ${k}</span>`).join('');
  if (!hz.length) { $('hzt').innerHTML = '<div class="empty">No hazard analysis for this case.</div>'; return; }
  const rows = hz.map((h, k) => [h, k]).sort((a, b) => LVL[a[0].level] - LVL[b[0].level]);
  const when = h => h.jd0 == null ? '' : isStar() ? `year ${(jdYear(h.jd0) - jdYear(t0)).toFixed(1)}` : `day ${int(Math.max(0, h.jd0 - t0))}`;
  const src = s => { if (!s) return ''; const m = s.match(/https?:\/\/[^\s)]+/); if (!m) return `<span class="src">${esc(s)}</span>`; let host = ''; try { host = new URL(m[0]).hostname.replace('www.', ''); } catch { } return `<a class="src" href="${esc(m[0])}" target="_blank" rel="noopener">[${esc(host || 'source')}]</a>`; };
  $('hzt').innerHTML = rows.map(([h, k]) => {
    const pr = prob(h.prob);
    return `<article class="hz ${h.level}" data-k="${k}">
      <div class="row"><span class="lv ${h.level}">${h.level}</span><h3>${esc(tidy(h.title))}</h3><b class="mv">${h.value == null ? '—' : sig(h.value)} <em>${esc(h.unit || '')}</em></b><span class="when">${when(h)}</span><span class="car">▸</span></div>
      <div class="more">
        <div class="meta"><span>${esc(h.cat)}</span><span>${h.basis === 'quantitative' ? 'QUANTITATIVE' : 'QUALITATIVE'}</span>${pr ? `<span class="p">${pr} <em>${esc(h.prob_label || 'probability')}</em></span>` : ''}</div>
        ${h.note ? `<p>${esc(tidy(h.note))}</p>` : ''}
        ${h.source ? `<footer>${src(h.source)}</footer>` : ''}
      </div>
    </article>`;
  }).join('');
  $('hzt').querySelectorAll('.hz').forEach(el => {
    el.onclick = ev => { if (ev.target.closest('a')) return; el.classList.toggle('open'); const h = hz[+el.dataset.k]; if (h.jd0 == null) return; const [a, b] = span(); setT((Math.max(a, h.jd0) - a) / (b - a)); };
  });
}

// ------------------------------------------------------------------ timeline
export function drawTimeline() {
  if (!mission) return; const tlc = $('tlc'), r = tlc.getBoundingClientRect(); if (!r.width) return;
  const p = Math.min(devicePixelRatio, 2); tlc.width = r.width * p; tlc.height = r.height * p; const g = tlc.getContext('2d'); g.setTransform(p, 0, 0, p, 0, 0);
  const w = r.width, h = r.height, [t0, t1] = span(), X = jd => (jd - t0) / (t1 - t0) * w; g.clearRect(0, 0, w, h);
  const R = mission.radiation;
  if (R && !isStar()) {
    const n = R.jd.length, mx = Math.max(...R.gcr_rate);
    for (let k = 0; k < n - 1; k++) { const x0 = X(R.jd[k]), x1 = X(R.jd[k + 1]);
      g.fillStyle = `rgba(224,176,80,${Math.min(.9, R.spe_p30[k] * 3)})`; g.fillRect(x0, h * .72, x1 - x0 + .5, h * .28);
      g.fillStyle = `rgba(200,200,200,${.08 + .4 * R.gcr_rate[k] / mx})`; g.fillRect(x0, 0, x1 - x0 + .5, h * .16); }
  }
  if (R && isStar()) {   // speed profile as a filled curve
    g.beginPath(); g.moveTo(0, h); R.jd.forEach((jd, k) => g.lineTo(X(jd), h - R.beta[k] / Math.max(1e-9, Math.max(...R.beta)) * h * .8)); g.lineTo(w, h); g.closePath();
    g.fillStyle = 'rgba(240,240,240,.08)'; g.fill(); g.strokeStyle = 'rgba(240,240,240,.5)'; g.stroke();
  }
  for (const ph of mission.phases || []) { const a = X(ph.jd0), b = X(ph.jd1), stay = ph.name.includes('stay') || ph.name === 'cruise';
    g.strokeStyle = stay ? '#6f8f5a' : '#3a3a3a'; g.strokeRect(a + .5, h * .2 + .5, Math.max(1, b - a - 1), h * .46);
    g.fillStyle = stay ? 'rgba(156,207,122,.10)' : 'rgba(0,0,0,0)'; g.fillRect(a, h * .2, b - a, h * .46); }
  for (const hz of mission.risk || []) if (hz.jd0 != null && !isStar()) { const x0 = X(Math.max(t0, hz.jd0)), x1 = Math.max(x0 + 2, X(Math.min(t1, hz.jd1 ?? hz.jd0)));
    g.fillStyle = hz.level === 'HIGH' ? 'rgba(224,96,90,.55)' : 'rgba(224,176,80,.4)'; g.fillRect(x0, h * .24, x1 - x0, h * .38); }
  g.font = '10px ' + MONO;
  for (const ph of mission.phases || []) { const a = X(ph.jd0), b = X(ph.jd1); if (b - a < 40) continue; g.fillStyle = ph.name.includes('stay') ? '#9ccf7a' : '#8a8a8a'; g.fillText(cap(ph.name), a + 5, h * .2 + 13); }
  if (!isStar() && R) { g.fillStyle = '#5a5a5a'; g.textAlign = 'right'; g.fillText('cosmic-ray rate', w - 4, 9); g.fillText('solar storm odds', w - 4, h - 3); g.textAlign = 'left'; }
  $('ticks').innerHTML = mission.events.map(e => `<div class="tick" title="${esc((e.date || '') + ' ' + e.label)}" style="left:${(e.jd - t0) / (t1 - t0) * 100}%;background:${EVC[e.hazard ? 'hazard' : e.type]}"></div>`).join('');
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
  $('cutnote').textContent = view !== 'cabin' ? '' : isStar() ? (p.absorbs ? 'Fuel tanks wrap the crew' : !m.summary.crew ? 'Uncrewed: no cabin' : `${sig(p.shield)} g/cm² shielding`) : 'hull 4 mm 304L · shelter water';
  cab.astro = !!p.absorbs; cab.probe = isStar() && !m.summary.crew;
}
function updateCabin(jd) {
  if (!cab) return; const q = radAt(jd);
  if (!q) { cab.r.render(cab.S, cab.cam); return; }
  const beltRate = q.belt ? (sheltered ? q.belt.sheltered : q.belt.hull) : 0, rate = q.gcr + Math.max(0, q.spe) + beltRate;
  const rn = Math.min(1, Math.log10(1 + rate) / Math.log10(51));
  const col = cab.hullGeo.attributes.color, P = cab.hullGeo.attributes.position;
  for (let k = 0; k < P.count; k++) { const z = P.getZ(k) / cab.HG + .5; const c = cab.astro ? new THREE.Color('#7a5a2a').lerp(new THREE.Color('#d09040'), .5 + .3 * Math.sin(z * 8 + jd * .2)) : cab.heat(rn * (0.75 + 0.25 * Math.sin(z * 6 + jd * .3))); col.setXYZ(k, c.r, c.g, c.b); }
  col.needsUpdate = true;
  const sh = sheltered && !isStar(); cab.shelter.visible = cab.shEdge.visible = sh; cab.shMat.color.copy(cab.heat(rn * .35));
  $('cutleg').innerHTML = `<b>${rate.toFixed(2)} mSv/d</b>`;
  cab.r.render(cab.S, cab.cam);
}
