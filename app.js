import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { Line2 } from './vendor/lines/Line2.js';
import { LineMaterial } from './vendor/lines/LineMaterial.js';
import { LineGeometry } from './vendor/lines/LineGeometry.js';

const $ = id => document.getElementById(id);
const ORDER = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const RADIUS = { mercury: 2439, venus: 6052, earth: 6371, mars: 3390, jupiter: 69911, saturn: 58232, uranus: 25362, neptune: 24622 };
const PCOL = { mercury: '#9a958e', venus: '#cdb88a', earth: '#5b8fd0', mars: '#c0674a', jupiter: '#c9ae8a', saturn: '#cdbb8f', uranus: '#86c2c8', neptune: '#5b78c8' };
const EVC = { launch: '#e8f4ff', arrival: '#e8f4ff', flyby: '#7fc8ff', dsm: '#e0b050', hazard: '#e0605a', surface: '#9ccf7a', departure: '#e8f4ff', return: '#e8f4ff' };
const MODES = { 'one-way': 'ONE-WAY', conjunction: 'CONJUNCTION', opposition: 'OPPOSITION', isru: 'ISRU STAY', 'round-trip': 'ROUND TRIP' };
let modeFilter = 'all', regSel = null;
const C = { surf: '#9ccf7a', gcr: '#7fc8ff', spe: '#e0b050', belt: '#e0605a', tot: '#e8f4ff', p95: '#8a96a2', lim: '#e0605a' };
const fmt = jd => new Date((jd - 2440587.5) * 864e5).toISOString().slice(0, 10);
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
const f1 = (x, d = 1) => x == null || !isFinite(x) ? '—' : (+x).toFixed(d);
const fsig = x => x == null ? '—' : x === 0 ? '0' : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 1 ? x.toFixed(1) : x.toExponential(1);

// ---------------------------------------------------------------- 3D scene
const sceneEl = $('scene'), canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.autoClear = false;
const scene = new THREE.Scene(), skyScene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 1e-6, 5000), skyCam = new THREE.PerspectiveCamera(40, 1, 0.1, 10);
camera.up.set(0, 0, 1); camera.position.set(0, -6, 4);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 2e-7; controls.maxDistance = 300; controls.zoomSpeed = 1.6;
const lineMats = [];
let W = 1, H = 1;
function resize() {
  W = sceneEl.clientWidth; H = sceneEl.clientHeight;
  renderer.setSize(W, H, false); camera.aspect = skyCam.aspect = W / H; camera.updateProjectionMatrix(); skyCam.updateProjectionMatrix();
  lineMats.forEach(m => m.resolution.set(W, H)); sizeChart(); sizeCut(); drawTimeline();
}
addEventListener('resize', resize);

function bvToRGB(bv) { bv = Math.max(-0.4, Math.min(2.0, bv)); const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)), t = T / 100;
  const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332), g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * Math.pow(t - 60, -0.0755), b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  return [r, g, b].map(x => Math.max(0, Math.min(255, x)) / 255); }
async function loadSky() {   // HYG v4.1 catalogue, mag <= 6.5, ecliptic J2000
  const d = await (await fetch('sky.json')).json();
  const mk = (pts, vs, fs) => { const g = new THREE.BufferGeometry(), P = [], Cc = [], S = [];
    for (const q of pts) { const [x, y, z, c, sz] = vs(q); P.push(x * 5, y * 5, z * 5); Cc.push(...c); S.push(sz); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); g.setAttribute('size', new THREE.Float32BufferAttribute(S, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, vertexColors: true, uniforms: { pr: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `attribute float size; varying vec3 vC; uniform float pr; void main(){ vC=color; gl_PointSize=size*pr; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`, fragmentShader: fs });
    const pt = new THREE.Points(g, m); pt.frustumCulled = false; skyScene.add(pt); };
  mk(d.stars, q => { const f = Math.pow(10, -0.4 * q[3]); const c = bvToRGB(q[4]); const a = Math.min(1, 0.14 + 0.8 * Math.pow(f, 0.42));
    return [q[0], q[1], q[2], c.map(x => x * a * 0.85), Math.max(1.0, Math.min(4.5, 1.6 + 2.4 * Math.pow(f, 0.3)))]; },
    `varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.15,d); gl_FragColor=vec4(vC,a); }`);
  mk(d.milkyway, q => [q[0], q[1], q[2], [0.022 * q[3], 0.024 * q[3], 0.030 * q[3]], 12],
    `varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.0,d); gl_FragColor=vec4(vC,a*.5); }`);
}
const skyReady = loadSky();

const AU_KM = 149597870.7, SUN_R = 695700 / AU_KM;
const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff1d0 })); scene.add(sun);
scene.add(new THREE.PointLight(0xffffff, 2.6, 0, 0)); scene.add(new THREE.AmbientLight(0x404a55, 0.5));
function sqTex(fill) { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 3; if (fill) { g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 9, 0, 7); g.fill(); } else g.strokeRect(6, 6, 20, 20);
  const t = new THREE.CanvasTexture(c); return t; }
const SQ = sqTex(false), DOT = sqTex(true);
function sprite(tex, color, px) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  s.scale.setScalar(px / 1000); s.renderOrder = 5; return s; }

// labels
const labelLayer = $('labels'); const labels = [];
function makeLabel(html, cls, prio, getPos) { const el = document.createElement('div'); el.className = 'lb ' + cls; el.innerHTML = html; labelLayer.appendChild(el);
  const L = { el, prio, getPos, w: 0, h: 0 }; labels.push(L); return L; }
function clearLabels(filter) { for (let i = labels.length - 1; i >= 0; i--) if (filter(labels[i])) { labels[i].el.remove(); labels.splice(i, 1); } }
const vtmp = new THREE.Vector3();
function layoutLabels() {
  const placed = [];
  for (const L of [...labels].sort((a, b) => b.prio - a.prio)) {
    const p = L.getPos(); if (!p) { L.el.style.opacity = 0; continue; }
    vtmp.copy(p).project(camera);
    if (vtmp.z > 1 || Math.abs(vtmp.x) > 1.05 || Math.abs(vtmp.y) > 1.05) { L.el.style.opacity = 0; continue; }
    const x = (vtmp.x + 1) / 2 * W, y = (1 - vtmp.y) / 2 * H;
    if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
    const planet = L.el.classList.contains('planet');
    const box = { x0: x + 6, x1: x + 8 + L.w, y0: planet ? y + 2 : y - L.h - 8, y1: planet ? y + L.h + 4 : y - 6 };
    const hit = placed.some(b => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1));
    L.el.style.transform = `translate(${box.x0}px,${box.y0}px)`;
    L.el.style.opacity = hit && !L.force ? 0 : 1; if (!hit || L.force) placed.push(box);
  }
}

let data = null, mission = null, mIndex = 0, planets = {}, missionGroup = new THREE.Group(), orbitGroup = new THREE.Group();
scene.add(orbitGroup); scene.add(missionGroup);
let t = 0, playing = false, focus = null, tween = null, hoverables = [], trajFlown = null, trajPlan = null, ship = null, nSeg = 0, trueScale = true, sheltered = true;
function interp(track, jd) { const n = track.length;
  if (jd <= track[0][0]) return track[0].slice(1); if (jd >= track[n - 1][0]) return track[n - 1].slice(1);
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (track[m][0] <= jd) lo = m; else hi = m; }
  const a = track[lo], b = track[hi], f = (jd - a[0]) / (b[0] - a[0]); return [a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3])]; }
function baseSize(name) { return trueScale ? RADIUS[name] / AU_KM : 0.010 * Math.pow(RADIUS[name] / 6371, 0.55); }
function updateClip() { const d = camera.position.distanceTo(controls.target); camera.near = Math.max(1e-9, d * 1e-3); camera.far = Math.max(200, d * 1e4); camera.updateProjectionMatrix(); }

function buildPlanets() {
  orbitGroup.clear(); for (const p of Object.values(planets)) { scene.remove(p.mesh); scene.remove(p.dot); } hoverables = [];
  clearLabels(L => L.el.classList.contains('planet')); planets = {};
  for (const name of ORDER) {
    const P = data.planets[name]; if (!P) continue;
    const g = new THREE.BufferGeometry().setFromPoints(P.orbit.map(p => new THREE.Vector3(...p)));
    orbitGroup.add(new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0x3a4652, transparent: true, opacity: .9 })));
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshStandardMaterial({ color: PCOL[name], roughness: .9, metalness: 0 }));
    if (name === 'saturn') { const ring = new THREE.Mesh(new THREE.RingGeometry(1.24, 2.27, 96), new THREE.MeshBasicMaterial({ color: 0x9a8f78, side: THREE.DoubleSide, transparent: true, opacity: .5 })); ring.rotation.x = .47; mesh.add(ring); }
    mesh.userData = { kind: 'planet', name }; scene.add(mesh); hoverables.push(mesh);
    const dot = sprite(DOT, PCOL[name], 7); dot.userData = { kind: 'planet', name }; scene.add(dot); hoverables.push(dot);
    planets[name] = { mesh, track: P.track, dot };
    makeLabel(name, 'planet', name === data.target ? 60 : 40, () => mesh.position);
  }
}

function selectMission(i) {
  mIndex = i; mission = data.missions[i];
  missionGroup.clear(); clearLabels(L => !L.el.classList.contains('planet')); hoverables = hoverables.filter(h => h.userData.kind === 'planet');
  const pts = mission.traj, n = pts.length, pos = []; for (const p of pts) pos.push(p[1], p[2], p[3]);
  const mk = (color, width, dashed) => { const g = new LineGeometry(); g.setPositions(pos);
    const m = new LineMaterial({ color, linewidth: width, transparent: true, opacity: 1, depthWrite: false, dashed: !!dashed, dashSize: .02, gapSize: .015 });
    m.resolution.set(W, H); lineMats.push(m); const l = new Line2(g, m); if (dashed) l.computeLineDistances(); return l; };
  trajPlan = mk(0x4d6a85, 1.0); missionGroup.add(trajPlan); trajFlown = mk(0xe8f4ff, 1.6); missionGroup.add(trajFlown); nSeg = n - 1;
  ship = sprite(SQ, 0xffffff, 12); missionGroup.add(ship); makeLabel('STARSHIP', 'ship', 100, () => ship.position).force = true;
  for (const e of mission.events) {
    const typ = e.hazard ? 'hazard' : e.type; const s = sprite(SQ, EVC[typ], 9);
    s.position.set(...e.pos); s.userData = { kind: 'event', e }; missionGroup.add(s); hoverables.push(s);
    const short = e.type === 'flyby' ? `${cap(e.body)} GA` : e.type === 'dsm' ? e.label.split(' ')[0] : e.type === 'launch' ? 'TLI' : e.type === 'departure' ? `${cap(e.body)} DEP` : e.type === 'return' ? 'EARTH ENTRY' : e.type === 'surface' ? 'SURFACE' : `${cap(e.body)} ARR`;
    const dv = e.dv > 0.0005 ? `<span class="dv">${e.dv >= 1 ? e.dv.toFixed(2) + ' km/s' : (e.dv * 1000).toFixed(0) + ' m/s'}</span>` : '';
    makeLabel(`${short.toUpperCase()}${dv}`, e.hazard ? 'hz' : e.type, e.hazard ? 90 : e.type === 'arrival' ? 85 : e.type === 'launch' ? 80 : e.type === 'flyby' ? 70 : 30 + Math.min(20, e.dv * 20), () => s.position);
  }
  renderEvents(); renderBudget(); renderReg(); renderRadTable(); renderHazards(); drawTimeline();
  document.querySelectorAll('#cmp tbody tr').forEach(el => el.classList.toggle('on', +el.dataset.i === i));
  const r = Math.max(...pts.map(p => Math.hypot(p[1], p[2], p[3])));
  focus = null; flyTo(new THREE.Vector3(0, 0, 0), r * 2.6 * Math.max(1, 1.2 / camera.aspect), new THREE.Vector3(0.1, -1, 0.85)); setT(0);
}

// ---------------------------------------------------------------- tables
let sortKey = 'rank', sortDir = 1;
const COLS = [
  ['rank', '#', '', m => m.rank, m => m.rank, 'l'], ['name', 'ROUTE', '', m => m.name, m => `${m.name}${(m.tags || []).map(x => `<span class="tag">${x.includes('alternative') ? 'LOW-DOSE ALT' : 'LOW-DOSE'}</span>`).join('')}`, 'l'],
  ['mode', 'MODE', '', m => m.mode || 'one-way', m => `<span class="dim">${MODES[m.mode || 'one-way']}${m.mode && m.mode !== 'one-way' ? '' : ' · ' + m.model}</span>`, 'l'], ['launch', 'LAUNCH', 'UTC', m => m.summary.launch, m => m.summary.launch],
  ['dur', 'DUR', 'd', m => totDays(m), m => totDays(m).toFixed(0)], ['stay', 'STAY', 'd', m => m.summary.stay_days || 0, m => m.summary.stay_days ? m.summary.stay_days.toFixed(0) : '—'], ['dv', 'Δv', 'km/s', m => m.summary.dv_total, m => f1(m.summary.dv_total, 2)],
  ['tk', 'TANK', 'n', m => m.summary.tankers_needed ?? 99, m => m.summary.tankers_needed ?? '—'], ['ln', 'LNCH', 'n', m => m.summary.tankers_needed ?? 99, m => m.summary.tankers_needed == null ? '—' : m.summary.tankers_needed + 1],
  ['dose', 'DOSE', 'mSv μ', m => dose(m).mean ?? 1e9, m => doseCell(dose(m).mean)], ['p95', 'P95', 'mSv', m => dose(m).p95 ?? 1e9, m => doseCell(dose(m).p95)],
  ['risk', 'RISK', 'HIGH n', m => (m.risk || []).filter(h => h.level === 'HIGH').length, m => { const n = (m.risk || []).filter(h => h.level === 'HIGH').length; return `<span class="${n ? 'no' : 'ok'}">${m.risk ? n : '—'}</span>`; }],
  ['feas', 'FEAS', '', m => m.summary.feasible ? 0 : 1, m => m.summary.feasible ? '<span class="ok">YES</span>' : '<span class="no">NO</span>']];
function totDays(m) { return m.summary.total_days ?? m.summary.tof_years * 365.25; }
const regF = (R, x) => { const k = Object.keys(R.regolith).find(q => Math.abs(parseFloat(q) - x) < 1e-6); return k ? R.regolith[k] : 1; };
function regK(m) { const R = m.radiation; if (!R || !R.regolith || regSel == null) return 1; return regF(R, regSel) / regF(R, R.regolith_used ?? 0); }
function dose(m) { const T = m.radiation && m.radiation.totals; if (!T) return {}; const ds = (T.surface || 0) * (1 - regK(m));
  return sheltered ? { mean: T.total_mean_sh - ds, p95: T.total_p95_sh - ds } : { mean: T.total_mean - ds, p95: T.total_p95 - ds }; }
function adj(arr) { const R = mission.radiation, k = regK(mission); if (k === 1 || !R.surf_cum) return arr; return arr.map((v, i) => v - R.surf_cum[i] * (1 - k)); }
function doseCell(v) { if (v == null) return '<span class="dim">—</span>'; const c = v > 600 ? 'no' : v > 300 ? 'wn' : ''; return `<span class="${c}">${v.toFixed(0)}</span>`; }
function renderCmp() {
  const ms = data.missions.map((m, i) => [m, i]).filter(([m]) => modeFilter === 'all' || (m.mode || 'one-way') === modeFilter); const col = COLS.find(c => c[0] === sortKey);
  ms.sort((a, b) => { const x = col[3](a[0]), y = col[3](b[0]); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
  $('cmp').innerHTML = `<thead><tr>${COLS.map(c => `<th data-k="${c[0]}" class="${c[5] || ''} ${c[0] === sortKey ? 'sorted' : ''}">${c[1]}${c[0] === sortKey ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}<span class="u">${c[2] || '&nbsp;'}</span></th>`).join('')}</tr></thead><tbody>` +
    ms.map(([m, i]) => `<tr data-i="${i}" class="${i === mIndex ? 'on' : ''}">${COLS.map(c => `<td class="${c[5] || ''}">${c[4](m)}</td>`).join('')}</tr>`).join('') + '</tbody>';
  document.querySelectorAll('#cmp th').forEach(th => th.onclick = () => { const k = th.dataset.k; sortDir = k === sortKey ? -sortDir : 1; sortKey = k; renderCmp(); });
  document.querySelectorAll('#cmp tbody tr').forEach(tr => tr.onclick = () => selectMission(+tr.dataset.i));
}
function renderEvents() {
  const [t0] = span(); $('selname').textContent = `${mission.name} · ${mission.model}${mission.variant ? ' · ' + mission.variant : ''}`;
  $('evt').innerHTML = `<thead><tr><th>MET d</th><th class="l">EVENT</th><th>DATE UTC</th><th>Δv<span class="u">m/s</span></th></tr></thead><tbody>` +
    mission.events.map((e, k) => `<tr data-k="${k}"><td>${(e.jd - t0).toFixed(0)}</td><td class="l"><i style="border-color:${EVC[e.hazard ? 'hazard' : e.type]}"></i>${e.label}</td><td>${e.date}</td><td>${e.dv > 0.0005 ? (e.dv * 1000).toFixed(0) : '—'}</td></tr>`).join('') + '</tbody>';
  document.querySelectorAll('#evt tbody tr').forEach(el => el.onclick = () => { const e = mission.events[+el.dataset.k]; const [a, b] = span(); setT((e.jd - a) / (b - a)); flyTo(new THREE.Vector3(...e.pos), 0.8); });
}
function renderBudget() {
  const S = mission.summary, v = data.vehicle || '', kv = rows => rows.map(([k, x, u, c]) => `<div${c ? ` class="${c}"` : ''}><span>${k}${u ? ' [' + u + ']' : ''}</span><b>${x}</b></div>`).join('');
  const rt = mission.mode && mission.mode !== 'one-way'; $('budtitle').textContent = rt ? `ARCHITECTURE · ${MODES[mission.mode]} · Δv / PROPELLANT` : 'Δv BUDGET / VEHICLE';
  $('isruwrap').style.display = mission.isru ? '' : 'none';
  if (!rt) { $('budget').innerHTML = kv([['DEPARTURE', f1(S.dv_dep, 3), 'km/s'], ['DSM / MID-COURSE', f1(S.dv_dsm, 3), 'km/s'], ['CAPTURE (' + S.capture + ')', f1(S.dv_capture, 3), 'km/s'],
    ['TOTAL Δv', f1(S.dv_total, 3), 'km/s'], ['C3', f1(S.c3, 2), 'km²/s²'], ['TANKERS / LAUNCHES', `${S.tankers_needed ?? '—'} / ${S.tankers_needed == null ? '—' : S.tankers_needed + 1}`, 'n']]) + `<div style="grid-column:1/-1"><span>VEHICLE (ESTIMATES)</span><br>${v}</div>`; return; }
  const no = x => `<span class="no">${x}</span>`, ok = x => `<span class="ok">${x}</span>`;
  let rows = [['OUTBOUND / STAY / RETURN', `${S.out_days.toFixed(0)} / ${S.stay_days.toFixed(0)} / ${S.ret_days.toFixed(0)}`, 'd'], ['TOTAL DURATION', `${S.total_days.toFixed(0)} (${(S.total_days / 365.25).toFixed(2)} yr)`, 'd'],
    ['TLI (LEO)', f1(S.dv_dep, 3), 'km/s'], [S.surface ? 'MARS EDL LANDING' : 'CAPTURE (' + S.capture + ')', f1(S.dv_capture, 3), 'km/s'],
    [S.surface ? 'ASCENT + TEI' : 'DEPARTURE (TEI)', f1(S.dv_ret_dep, 3), 'km/s'], ['VENUS FLYBY Δv', S.via ? f1(S.dv_flyby, 3) : '—', 'km/s'],
    ['EARTH ENTRY SPEED', S.v_entry_earth.toFixed(2) + (S.v_entry_earth > 12.5 ? ' ' + no('>12.5') : ''), 'km/s'], ['EARTH BRAKING', f1(S.dv_brake, 3), 'km/s'],
    ['TOTAL Δv', f1(S.dv_total, 3), 'km/s'], ['PROPELLANT LOADED IN LEO', S.prop_leo_t > 1600 ? no(S.prop_leo_t.toFixed(0)) : S.prop_leo_t.toFixed(0), 't'],
    ['TANKERS / LAUNCHES', `${S.tankers_needed ?? '—'} / ${S.tankers_needed == null ? '—' : S.tankers_needed + 1}`, 'n'],
    ['PROPELLANT AT DESTINATION', S.prop_dest_t > 0 ? (S.prop_dest_t > 1600 ? no(S.prop_dest_t.toFixed(0) + ' > TANK') : S.prop_dest_t.toFixed(0)) : '0', 't'],
    ['DEST. PROPELLANT SOURCE', S.dest_source.startsWith('REQ') ? no('NONE MODELLED') : S.dest_source, ''], ['FEASIBLE (THIS MODEL)', S.feasible ? ok('YES') : no('NO'), '']];
  const I = mission.isru;
  if (I) { const P = I.plan;
    rows = rows.concat([['ISRU PROPELLANT NEEDED', P.prop_t.toFixed(0), 't'], ['PRODUCTION WINDOW (stay − 30 d)', P.prod_days.toFixed(0), 'd'], ['PRODUCTION RATE', P.rate_kgd.toFixed(0), 'kg/d'],
      ['PLANT POWER (range)', `${P.power_kw.toFixed(0)} (${P.power_kw_lo.toFixed(0)}–${P.power_kw_hi.toFixed(0)})`, 'kWe'], ['ENERGY', (P.energy_mwh / 1000).toFixed(2), 'GWh'],
      ['ISRU PLANT MASS', `${P.plant_t.toFixed(0)}–${P.plant_t_hi.toFixed(0)}`, 't'], ['FISSION POWER MASS', `${P.nuclear_t[0].toFixed(0)}–${P.nuclear_t[1].toFixed(0)}`, 't'],
      ['SOLAR POWER MASS', `${P.solar_t[0].toFixed(0)}–${P.solar_t[1].toFixed(0)}`, 't'], ['CARGO SHIPS (fission / solar)', `${I.cargo_ships_nuclear} / ${I.cargo_ships_solar}`, 'n'],
      ['PRE-DEPLOYED PLANT (+780 d)', `${I.predeploy.power_kw.toFixed(0)} kWe`, ''],
      [`AT ${I.power_kw_config.toFixed(0)} kWe: PROPELLANT READY`, `${I.days_at_config.toFixed(0)} d ${I.feasible_at_config ? ok('RETURN OK') : no('MISSES WINDOW')}`, ''],
      ['CROSS-CHECK: SPACEX (MUSK 2017)', `${I.check_spacex.toFixed(0)} t/ship`, '']]); }
  $('budget').innerHTML = kv(rows) + `<div style="grid-column:1/-1" class="dim">Return payload ${data.architecture ? data.architecture.return_payload_t : 20} t (ASSUMPTION). Ascent 4.15 km/s (MSR MAV, NTRS 20130013542); landing 0.67–0.81 km/s (NTRS 20210026187). Single Starship, Isp 375 s, 1600 t tanks. ${v}</div>`;
  if (I) drawIsru();
}
function drawIsru() {
  const cv = $('isruchart'), r = cv.getBoundingClientRect(), p = Math.min(devicePixelRatio, 2); cv.width = r.width * p; cv.height = r.height * p; const g = cv.getContext('2d'); g.setTransform(p, 0, 0, p, 0, 0);
  const w = r.width, h = r.height, L = 44, B = 18, T = 8, I = mission.isru, cu = I.curve, xmax = 2000, lx = v => L + Math.log10(v / 30) / Math.log10(xmax / 30) * (w - L - 8);
  const ymin = 100, ymax = 1e5, ly = v => T + (h - T - B) * (1 - Math.log10(Math.max(ymin, v) / ymin) / Math.log10(ymax / ymin));
  g.font = '9px ui-monospace,monospace'; g.strokeStyle = '#1a222a'; g.fillStyle = '#55616d';
  for (const v of [100, 1e3, 1e4, 1e5]) { g.beginPath(); g.moveTo(L, ly(v) + .5); g.lineTo(w - 8, ly(v) + .5); g.stroke(); g.fillText(v >= 1e3 ? (v / 1e3) + ' MW' : v + ' kW', 2, ly(v) + 3); }
  for (const v of [30, 60, 120, 240, 480, 1000, 2000]) { g.beginPath(); g.moveTo(lx(v) + .5, T); g.lineTo(lx(v) + .5, h - B); g.stroke(); g.fillText(v, lx(v) - 6, h - 5); }
  g.strokeStyle = '#e8f4ff'; g.beginPath(); cu.forEach((q, k) => k ? g.lineTo(lx(q.days), ly(q.kw)) : g.moveTo(lx(q.days), ly(q.kw))); g.stroke();
  g.strokeStyle = '#9ccf7a'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(L, ly(I.power_kw_config)); g.lineTo(w - 8, ly(I.power_kw_config)); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#9ccf7a'; g.fillText(`CONFIGURED PLANT ${I.power_kw_config.toFixed(0)} kWe`, L + 4, ly(I.power_kw_config) - 3);
  const x = lx(I.plan.prod_days), y = ly(I.plan.power_kw); g.fillStyle = I.feasible_at_config ? '#9ccf7a' : '#e0605a'; g.fillRect(x - 3, y - 3, 6, 6);
  g.fillText(`THIS STAY: ${I.plan.power_kw.toFixed(0)} kWe`, Math.min(x + 6, w - 120), y - 5); g.fillStyle = '#55616d'; g.fillText('production days', w - 90, h - 5);
}
function renderRadTable() {
  const R = mission.radiation;
  if (!R) { $('radtbl').innerHTML = '<tr><td>No radiation analysis for this case (validation trajectory).</td></tr>'; $('radnow').innerHTML = ''; return; }
  const T = R.totals, sh = sheltered;
  const rows = [['GCR (cycle-phase band p05–p95)', T.gcr, `${fsig(T.gcr_p05)}–${fsig(T.gcr_p95)}`], ['SPE expected / p95', sh ? T.spe_mean_sh : T.spe_mean, fsig(sh ? T.spe_p95_sh : T.spe_p95)],
    ['Trapped belts (Earth, Jupiter)', sh ? T.belts_sh : T.belts, ''], ...(T.surface ? [['Mars surface stay (habitat)', T.surface * regK(mission), `0.64±0.12 mSv/d × ${(regK(mission) * regF(mission.radiation, mission.radiation.regolith_used ?? 0)).toFixed(2)}`]] : []), ['TOTAL expected / p95', dose(mission).mean, fsig(dose(mission).p95)],
    ['Worst 30-d window p95 (BFO lim 250)', sh ? T.win30_p95_sh : T.win30_p95, (sh ? T.win30_p95_sh : T.win30_p95) > 250 ? '<span class="no">EXCEEDS</span>' : '<span class="ok">within</span>'],
    ['Worst 365-d window p95 (BFO lim 500)', sh ? T.win365_p95_sh : T.win365_p95, (sh ? T.win365_p95_sh : T.win365_p95) > 500 ? '<span class="no">EXCEEDS</span>' : '<span class="ok">within</span>'],
    ['Fraction of career limit (600 mSv)', dose(mission).mean / 6, '%']];
  $('radtbl').innerHTML = '<tr><td></td><td class="dim">mSv</td><td class="dim">range / note</td></tr>' + rows.map(r => `<tr><td>${r[0]}</td><td>${fsig(r[1])}</td><td>${r[2]}</td></tr>`).join('') +
    `<tr><td colspan="3" class="dim" style="text-align:left;white-space:normal">${mission.mode && mission.mode !== 'one-way' ? 'FULL MISSION (outbound + stay + return). Surface: MSL/RAD Hassler 2014; regolith factors Geant4 (NST 2022). Orbit stay: planet shadow credited.' : 'One-way transit only.'} Hull ${T.hull_gcm2} g/cm² steel; shelter ${T.shelter_gcm2} g/cm² water (SPE + belt passes). NASA-STD-3001 limits. ESTIMATES — see VERIFICATION.md.</td></tr>`;
  $('shval').textContent = `${T.shelter_gcm2} g/cm²`;
}
function renderHazards() {
  const hz = mission.risk || [], [t0] = span();
  if (!hz.length) { $('hzt').innerHTML = '<tr><td class="l dim">No hazard analysis for this case.</td></tr>'; return; }
  const order = { HIGH: 0, MED: 1, LOW: 2, INFO: 3 };
  const rows = hz.map((h, k) => [h, k]).sort((a, b) => order[a[0].level] - order[b[0].level]);
  $('hzt').innerHTML = `<thead><tr><th class="l">LVL</th><th class="l">PHASE</th><th class="l">HAZARD</th><th>METRIC</th><th class="l">UNIT</th><th>PROB.</th><th class="l">BASIS</th><th>MET d</th></tr></thead><tbody>` +
    rows.map(([h, k]) => `<tr data-k="${k}" title="${(h.note || '').replace(/"/g, '')}  [${(h.source || '').replace(/"/g, '')}]"><td class="l"><span class="lv ${h.level}">${h.level}</span></td><td class="l dim">${h.cat}</td><td class="l">${h.title}</td><td>${h.value == null ? '—' : fsig(h.value)}</td><td class="l dim">${h.unit}</td><td>${h.prob == null ? '<span class="dim">n/q</span>' : fsig(h.prob)}</td><td class="l dim">${h.basis}</td><td>${h.jd0 != null ? (h.jd0 - t0).toFixed(0) : '—'}</td></tr>` +
      `<tr class="note"><td></td><td colspan="7" class="l dim" style="white-space:normal;padding-top:0">${h.note || ''} <i>${h.prob_label ? '[' + h.prob_label + '] ' : ''}${h.source || ''}</i></td></tr>`).join('') + '</tbody>';
  document.querySelectorAll('#hzt tbody tr[data-k]').forEach(el => el.onclick = () => { const h = hz[+el.dataset.k]; if (h.jd0 == null) return; const [a, b] = span(); setT((Math.max(a, h.jd0) - a) / (b - a)); });
}

// ---------------------------------------------------------------- dose chart (2D canvas)
const dc = $('dosechart'); let dctx = dc.getContext('2d'), DW = 1, DH = 1;
function sizeChart() { const r = dc.getBoundingClientRect(); DW = r.width; DH = r.height; const p = Math.min(devicePixelRatio, 2); dc.width = DW * p; dc.height = DH * p; dctx.setTransform(p, 0, 0, p, 0, 0); }
function drawChart(jd) {
  const g = dctx; g.clearRect(0, 0, DW, DH); g.font = '9px ui-monospace,DejaVu Sans Mono,monospace';
  const R = mission && mission.radiation; if (!R) { g.fillStyle = '#55616d'; g.fillText('NO RADIATION DATA', 10, 20); return; }
  const L = 40, Rr = 8, T = 10, B = 20, w = DW - L - Rr, h = DH - T - B, tt = R.jd.map(x => x - R.jd[0]), tmax = tt[tt.length - 1];
  const tot = adj(sheltered ? R.tot_mean_sh : R.tot_mean), p95 = adj(sheltered ? R.tot_p95_sh : R.tot_p95), spe = sheltered ? R.spe_mean_sh : R.spe_mean, belt = sheltered ? R.belt_cum_sh : R.belt_cum;
  const ymax = Math.max(50, ...p95) * 1.12, X = v => L + v / tmax * w, Y = v => T + h - v / ymax * h;
  for (const ph of mission.phases || []) if (ph.name.includes('stay')) { const a = X(ph.jd0 - R.jd[0]), b = X(ph.jd1 - R.jd[0]); g.fillStyle = 'rgba(156,207,122,.07)'; g.fillRect(a, T, b - a, h);
    g.strokeStyle = '#2c3a2a'; g.strokeRect(a + .5, T + .5, b - a, h); g.fillStyle = '#6f8f5a'; g.fillText(ph.name.toUpperCase(), a + 4, T + h - 4); }
  g.strokeStyle = '#1a222a'; g.lineWidth = 1; g.fillStyle = '#55616d';
  const step = [100, 200, 500, 1000, 2000, 5000].find(s => ymax / s <= 7) || 10000;
  for (let v = 0; v <= ymax; v += step) { g.beginPath(); g.moveTo(L, Y(v) + .5); g.lineTo(L + w, Y(v) + .5); g.stroke(); g.fillText(v.toFixed(0), 4, Y(v) + 3); }
  const xs = [30, 60, 90, 180, 365, 730, 1825].find(s => tmax / s <= 8) || 3650;
  for (let v = 0; v <= tmax; v += xs) { g.beginPath(); g.moveTo(X(v) + .5, T); g.lineTo(X(v) + .5, T + h); g.stroke(); g.fillText(v.toFixed(0), X(v) - 6, DH - 7); }
  g.fillText('MET d', L + w - 28, DH - 7); g.fillText('mSv', 4, T + 2);
  const line = (arr, col, dash, lw = 1) => { g.strokeStyle = col; g.setLineDash(dash || []); g.lineWidth = lw; g.beginPath(); arr.forEach((v, k) => k ? g.lineTo(X(tt[k]), Y(v)) : g.moveTo(X(tt[k]), Y(v))); g.stroke(); g.setLineDash([]); };
  g.fillStyle = C.lim; if (600 <= ymax) { g.strokeStyle = C.lim; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(L, Y(600)); g.lineTo(L + w, Y(600)); g.stroke(); g.setLineDash([]); g.fillText('NASA CAREER LIMIT 600 mSv', L + 4, Y(600) - 3); }
  else g.fillText(`CAREER LIMIT 600 mSv ↑ off-scale (${(Math.max(...p95) / 6).toFixed(0)}% at p95)`, L + 4, T + 18);
  if (250 <= ymax) { g.strokeStyle = '#7a4a2a'; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(L, Y(250)); g.lineTo(L + w, Y(250)); g.stroke(); g.setLineDash([]); g.fillStyle = '#a06a40'; g.fillText('250 (30-d BFO limit, as reference level)', L + 4, Y(250) - 3); }
  const gc = R.surf_cum ? R.gcr_cum.map((v, i) => v - R.surf_cum[i]) : R.gcr_cum; if (R.surf_cum && R.totals.surface) line(adj(R.surf_cum), C.surf);
  line(gc, C.gcr); line(spe, C.spe); line(belt, C.belt); line(p95, C.p95, [2, 2]); line(tot, C.tot, null, 1.4);
  const now = jd - R.jd[0]; g.strokeStyle = '#ffffff'; g.beginPath(); g.moveTo(X(Math.min(now, tmax)) + .5, T); g.lineTo(X(Math.min(now, tmax)) + .5, T + h); g.stroke();
  let lx = L + 6; [['TOTAL μ', C.tot], ['P95', C.p95], ['GCR SPACE', C.gcr], ['SPE μ', C.spe], ['BELTS', C.belt], ...(R.totals.surface ? [['SURFACE', C.surf]] : [])].forEach(([k, c]) => { g.fillStyle = c; g.fillRect(lx, T + 4, 8, 2); g.fillStyle = '#8a96a2'; g.fillText(k, lx + 11, T + 7); lx += g.measureText(k).width + 22; });
}
function radAt(jd) {
  const R = mission && mission.radiation; if (!R) return null; const J = R.jd, n = J.length;
  let k = 0; while (k < n - 2 && J[k + 1] < jd) k++;
  const f = Math.max(0, Math.min(1, (jd - J[k]) / (J[k + 1] - J[k] || 1))), I = a => a[k] + f * (a[k + 1] - a[k]);
  const tot = adj(sheltered ? R.tot_mean_sh : R.tot_mean), spe = sheltered ? R.spe_mean_sh : R.spe_mean;
  const dt = (J[k + 1] - J[k]) || 1, speRate = (spe[k + 1] - spe[k]) / dt;
  const belt = R.belts.find(b => Math.abs(b.jd - jd) < 1.5);
  const onSurf = (mission.phases || []).some(p => p.name === 'surface stay' && jd >= p.jd0 && jd <= p.jd1);
  return { onSurf, cum: I(tot), p95: I(adj(sheltered ? R.tot_p95_sh : R.tot_p95)), gcr: I(R.gcr_rate) * (onSurf ? regK(mission) : 1), spe: speRate, r: I(R.r_au), p30: I(R.spe_p30), belt, gcrCum: I(R.gcr_cum), speCum: I(spe), beltCum: I(sheltered ? R.belt_cum_sh : R.belt_cum) };
}
function updateRadNow(jd) {
  const q = radAt(jd); if (!q) return;
  $('radnow').innerHTML = [['CUMULATIVE μ', q.cum.toFixed(1), 'mSv'], ['CUMULATIVE P95', q.p95.toFixed(1), 'mSv'], [q.onSurf ? 'SURFACE RATE (HAB)' : 'GCR RATE', q.gcr.toFixed(2), 'mSv/d'],
    ['SPE EXPECTED RATE', q.spe.toFixed(3), 'mSv/d'], ['P(LARGE SPE, 30 d)', (q.p30 * 100).toFixed(1), '%'], ['HELIO DIST', q.r.toFixed(2), 'AU']]
    .map(([k, v, u]) => `<div><span>${k} [${u}]</span><b>${v}</b></div>`).join('') + (q.belt ? `<div style="grid-column:1/-1" class="no">BELT PASS: ${q.belt.label} · ${fsig(sheltered ? q.belt.sheltered : q.belt.hull)} mSv</div>` : '');
}

// ---------------------------------------------------------------- crew compartment cutaway (second renderer)
const cutC = $('cut'), cutR = new THREE.WebGLRenderer({ canvas: cutC, antialias: true, preserveDrawingBuffer: true });
cutR.setPixelRatio(Math.min(devicePixelRatio, 2)); cutR.setClearColor(0x0a0d11);
const cS = new THREE.Scene(), cCam = new THREE.PerspectiveCamera(32, 1, 0.1, 200); cCam.position.set(24, -21, 12); cCam.up.set(0, 0, 1); cCam.lookAt(0, 0, 0.5);
cS.add(new THREE.AmbientLight(0xffffff, .7)); const dl = new THREE.DirectionalLight(0xffffff, .8); dl.position.set(5, -8, 10); cS.add(dl);
const R_HULL = 4.5, HGT = 7.0, HALF = Math.PI * 1.25;
const heatCols = [new THREE.Color('#14324a'), new THREE.Color('#2f6f8f'), new THREE.Color('#d0a040'), new THREE.Color('#e0605a')];
function heat(x) { x = Math.max(0, Math.min(1, x || 0)); const s = x * 3, k = Math.min(2, Math.floor(s)); return heatCols[k].clone().lerp(heatCols[k + 1], s - k); }
const hullGeo = new THREE.CylinderGeometry(R_HULL, R_HULL, HGT, 48, 8, true, Math.PI * 0.375, HALF); hullGeo.rotateX(Math.PI / 2);
const hullMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: .85 });
hullGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(hullGeo.attributes.position.count * 3), 3));
const hull = new THREE.Mesh(hullGeo, hullMat); cS.add(hull);
cS.add(new THREE.LineSegments(new THREE.EdgesGeometry(hullGeo, 30), new THREE.LineBasicMaterial({ color: 0x8a96a2 })));
const deckG = new THREE.CircleGeometry(R_HULL, 48, Math.PI * 0.375, HALF); const deck = new THREE.Mesh(deckG, new THREE.MeshLambertMaterial({ color: 0x1a222a, side: THREE.DoubleSide })); deck.position.z = -HGT / 2; cS.add(deck);
const shG = new THREE.CylinderGeometry(1.6, 1.6, 2.4, 32, 1, true, Math.PI * 0.375, HALF); shG.rotateX(Math.PI / 2);
const shMat = new THREE.MeshLambertMaterial({ color: 0x2a6f9a, transparent: true, opacity: .55, side: THREE.DoubleSide }); const shelterMesh = new THREE.Mesh(shG, shMat); shelterMesh.position.z = -HGT / 2 + 1.2; cS.add(shelterMesh);
const shEdge = new THREE.LineSegments(new THREE.EdgesGeometry(shG, 30), new THREE.LineBasicMaterial({ color: 0x7fc8ff })); shEdge.position.copy(shelterMesh.position); cS.add(shEdge);
const crew = new THREE.Group(); for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(.18, .9, 4, 8), new THREE.MeshLambertMaterial({ color: 0xd8dee4 })); b.rotation.x = Math.PI / 2; const a = k / 4 * Math.PI * 2; b.position.set(Math.cos(a) * .8, Math.sin(a) * .8, -HGT / 2 + .9); crew.add(b); } cS.add(crew);
const NP = 400, pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), pState = [];
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
cS.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true })));
for (let k = 0; k < NP; k++) pState.push({ live: false });
function spawn(p, kind) { const th = Math.random() * Math.PI * 2, z = (Math.random() - .5) * HGT * 1.4, R0 = 13; const tgt = new THREE.Vector3((Math.random() - .5) * 3, (Math.random() - .5) * 3, (Math.random() - .5) * HGT * .8);
  p.o = new THREE.Vector3(Math.cos(th) * R0, Math.sin(th) * R0, z); p.d = tgt.clone().sub(p.o).normalize(); p.x = p.o.clone(); p.live = true; p.kind = kind;
  const pen = kind === 'gcr' ? 0.92 : kind === 'spe' ? 0.35 : 0.25; p.stopR = Math.random() < pen ? (sheltered && kind !== 'gcr' && Math.random() < .85 ? 1.6 : -1) : R_HULL; p.v = 0.35 + Math.random() * .25; }
let cutW = 1, cutH = 1, rateNorm = 0;
function sizeCut() { const r = $('cutwrap').getBoundingClientRect(); cutW = Math.max(1, r.width); cutH = Math.max(1, r.height); cutR.setSize(cutW, cutH, false); cCam.aspect = cutW / cutH; cCam.updateProjectionMatrix(); }
function updateCut(jd, dt) {
  const q = radAt(jd); if (!q) { cutR.render(cS, cCam); return; }
  const beltRate = q.belt ? (sheltered ? q.belt.sheltered : q.belt.hull) : 0, rate = q.gcr + q.spe + beltRate;
  rateNorm = Math.min(1, Math.log10(1 + rate) / Math.log10(1 + 50));
  const col = hullGeo.attributes.color, P = hullGeo.attributes.position;
  for (let k = 0; k < P.count; k++) { const z = P.getZ(k) / HGT + .5; const c = heat(rateNorm * (0.75 + 0.25 * Math.sin(z * 6 + jd * .3))); col.setXYZ(k, c.r, c.g, c.b); } col.needsUpdate = true;
  shelterMesh.visible = shEdge.visible = sheltered; shMat.color.copy(heat(rateNorm * (sheltered ? .35 : 1)));
  const nGcr = Math.min(6, q.gcr * 2.5 * dt * 30), nS = Math.min(20, (q.spe * 40 + beltRate * 3) * dt * 30);
  let want = nGcr + nS;
  for (const p of pState) { if (!p.live && want > Math.random()) { spawn(p, Math.random() < nGcr / (want || 1) ? 'gcr' : (q.belt ? 'belt' : 'spe')); want -= 1; } }
  pState.forEach((p, k) => {
    if (!p.live) { pPos[k * 3 + 2] = 1e4; return; }
    p.x.addScaledVector(p.d, p.v); const rr = Math.hypot(p.x.x, p.x.y);
    if ((p.stopR > 0 && rr < p.stopR) || p.x.length() > 16) { p.live = false; }
    pPos.set([p.x.x, p.x.y, p.x.z], k * 3); const c = p.kind === 'gcr' ? [0.5, .78, 1] : p.kind === 'belt' ? [.88, .38, .35] : [.88, .69, .31]; pCol.set(c, k * 3);
  });
  pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = true;
  $('cutleg').innerHTML = `<span style="color:#7fc8ff">■</span> GCR (penetrating) <span style="color:#e0b050">■</span> SPE p <span style="color:#e0605a">■</span> trapped<br>Total rate ${rate.toFixed(2)} mSv/d · hull colour = log rate (0–50 mSv/d) · schematic, not to scale of particle flux`;
  cutR.render(cS, cCam);
}

// ---------------------------------------------------------------- timeline
const tlc = $('tlc'); let tctx = tlc.getContext('2d');
function drawTimeline() {
  if (!mission) return; const r = tlc.getBoundingClientRect(), p = Math.min(devicePixelRatio, 2); tlc.width = r.width * p; tlc.height = r.height * p; tctx.setTransform(p, 0, 0, p, 0, 0);
  const g = tctx, w = r.width, h = r.height, [t0, t1] = span(), X = jd => (jd - t0) / (t1 - t0) * w; g.clearRect(0, 0, w, h);
  const R = mission.radiation;
  if (R) { // SPE 30-day probability strip (bottom half) + GCR rate (top)
    const n = R.jd.length; const mx = Math.max(...R.gcr_rate);
    for (let k = 0; k < n - 1; k++) { const x0 = X(R.jd[k]), x1 = X(R.jd[k + 1]); const pv = R.spe_p30[k];
      g.fillStyle = `rgba(224,176,80,${Math.min(.9, pv * 3)})`; g.fillRect(x0, h * .55, x1 - x0 + .5, h * .45);
      g.fillStyle = `rgba(127,200,255,${.15 + .5 * R.gcr_rate[k] / mx})`; g.fillRect(x0, 0, x1 - x0 + .5, h * .2); }
  }
  for (const ph of mission.phases || []) { const a = X(ph.jd0), b = X(ph.jd1); g.strokeStyle = ph.name.includes('stay') ? '#6f8f5a' : '#3a4652'; g.strokeRect(a + .5, h * .2 + .5, Math.max(1, b - a - 1), h * .34);
    g.fillStyle = ph.name.includes('stay') ? 'rgba(156,207,122,.10)' : 'rgba(0,0,0,0)'; g.fillRect(a, h * .2, b - a, h * .34); }
  for (const hz of mission.risk || []) if (hz.jd0 != null) { const x0 = X(Math.max(t0, hz.jd0)), x1 = Math.max(x0 + 2, X(Math.min(t1, hz.jd1 ?? hz.jd0)));
    g.fillStyle = hz.level === 'HIGH' ? 'rgba(224,96,90,.55)' : 'rgba(224,176,80,.4)'; g.fillRect(x0, h * .22, x1 - x0, h * .3); }
  g.fillStyle = '#55616d'; g.font = '8.5px ui-monospace,monospace'; g.fillText('GCR RATE', 3, 7); g.fillText('P(LARGE SPE / 30 d)', 3, h - 3);
  for (const ph of mission.phases || []) { g.fillStyle = ph.name.includes('stay') ? '#9ccf7a' : '#8a96a2'; g.fillText(ph.name.toUpperCase(), X(ph.jd0) + 4, h * .2 + 10); }
  $('ticks').innerHTML = mission.events.map(e => `<div class="tick" title="${e.date} ${e.label.replace(/"/g, '')}" style="left:${(e.jd - t0) / (t1 - t0) * 100}%;background:${EVC[e.hazard ? 'hazard' : e.type]}"></div>`).join('');
  const yrs = []; for (let y = Math.ceil(2000 + (t0 - 2451545) / 365.25); y <= 2000 + (t1 - 2451545) / 365.25; y++) yrs.push(y);
  const every = Math.max(1, Math.ceil(yrs.length / 12));
  $('tlaxis').innerHTML = yrs.filter((y, k) => k % every === 0).map(y => `<span style="left:${(2451545 + (y - 2000) * 365.25 - t0) / (t1 - t0) * 100}%">${y}</span>`).join('');
}

// ---------------------------------------------------------------- camera/time
const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
function flyTo(target, dist, dir) { const d = dir ? dir.clone().normalize() : camera.position.clone().sub(controls.target).normalize();
  tween = { t: 0, fromT: controls.target.clone(), toT: target.clone(), fromP: camera.position.clone(), toP: target.clone().add(d.multiplyScalar(dist)) }; }
function focusPlanet(name) { focus = name; const p = planets[name].mesh; flyTo(p.position, trueScale ? baseSize(name) * 7 : Math.max(0.2, p.scale.x * 14)); }
function span() { return [mission.traj[0][0], mission.traj[mission.traj.length - 1][0]]; }
function setT(f) { t = Math.max(0, Math.min(1, f)); }
let lastJd = 0;
function updateWorld(dt) {
  if (!mission) return; const [t0, t1] = span(), jd = t0 + t * (t1 - t0);
  const camD = camera.position.distanceTo(controls.target), k = Math.max(1, camD / 3.5);
  const prevFocus = focus ? planets[focus].mesh.position.clone() : null;
  for (const [name, p] of Object.entries(planets)) {
    p.mesh.position.set(...interp(p.track, jd)); p.mesh.scale.setScalar(trueScale ? baseSize(name) : baseSize(name) * (focus === name ? Math.min(k, 1.5) : k)); p.dot.position.copy(p.mesh.position);
    const px = p.mesh.scale.x / Math.max(1e-12, camera.position.distanceTo(p.mesh.position)) * H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    p.dot.material.opacity = Math.max(0, Math.min(1, (5 - px) / 3));
  }
  if (focus && prevFocus && !tween) { const dlt = planets[focus].mesh.position.clone().sub(prevFocus); controls.target.add(dlt); camera.position.add(dlt); }
  ship.position.set(...interp(mission.traj, jd));
  sun.scale.setScalar(trueScale ? SUN_R : Math.max(0.03, 0.006 * camD));
  let lo = 0, hi = mission.traj.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (mission.traj[m][0] <= jd) lo = m; else hi = m; }
  trajFlown.geometry.instanceCount = Math.max(1, Math.min(nSeg, lo));
  $('date').textContent = fmt(jd); $('met').textContent = `T+${Math.round(jd - t0)} d / ${((jd - t0) / 365.25).toFixed(2)} yr`;
  $('knob').style.left = (t * 100) + '%';
  if (Math.abs(jd - lastJd) > 1e-6 || dt === 0) { drawChart(jd); updateRadNow(jd); lastJd = jd; }
  updateCut(jd, dt || 0.016);
}
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); ray.params.Points = { threshold: .02 };
function pick(ev) { const r = canvas.getBoundingClientRect(); mouse.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(mouse, camera); const hits = ray.intersectObjects(hoverables, false); return hits.length ? hits[0].object : null; }
canvas.addEventListener('pointermove', ev => { const o = pick(ev), tip = $('tip'), r = canvas.getBoundingClientRect();
  if (!o) { tip.style.opacity = 0; canvas.style.cursor = ''; return; } canvas.style.cursor = 'pointer';
  tip.innerHTML = o.userData.kind === 'planet' ? `<b>${cap(o.userData.name)}</b><br>R = ${RADIUS[o.userData.name].toLocaleString()} km · click to focus` : `<b>${o.userData.e.date} · ${o.userData.e.type.toUpperCase()}</b><br>${o.userData.e.label}`;
  tip.style.opacity = 1; tip.style.left = Math.min(ev.clientX - r.left + 12, W - 290) + 'px'; tip.style.top = ev.clientY - r.top + 12 + 'px'; });
canvas.addEventListener('click', ev => { const o = pick(ev); if (!o) return; if (o.userData.kind === 'planet') focusPlanet(o.userData.name); else { const [a, b] = span(); setT((o.userData.e.jd - a) / (b - a)); focus = null; flyTo(o.position, 1); } });
canvas.addEventListener('dblclick', () => { focus = null; const r = Math.max(...mission.traj.map(p => Math.hypot(p[1], p[2], p[3]))); flyTo(new THREE.Vector3(), r * 2.6); });
controls.addEventListener('start', () => { tween = null; });
function togglePlay(force) { playing = force ?? !playing; if (t >= 1 && playing) t = 0; $('play').textContent = playing ? 'PAUSE' : 'PLAY'; }
$('play').onclick = () => togglePlay(); addEventListener('keydown', e => { if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); togglePlay(); } });
const track = $('track'); function scrub(ev) { const r = track.getBoundingClientRect(); setT((ev.clientX - r.left) / r.width); }
track.addEventListener('pointerdown', ev => { scrub(ev); track.setPointerCapture(ev.pointerId); track.onpointermove = scrub; }); track.addEventListener('pointerup', () => { track.onpointermove = null; });
function renderModes() { const have = [...new Set(data.missions.map(m => m.mode || 'one-way'))]; if (modeFilter !== 'all' && !have.includes(modeFilter)) modeFilter = 'all';
  $('modes').innerHTML = ['all', ...Object.keys(MODES).filter(k => have.includes(k))].map(k => `<button data-m="${k}" class="${k === modeFilter ? 'on' : ''}">${k === 'all' ? 'ALL' : MODES[k]} <span class="dim">${k === 'all' ? data.missions.length : data.missions.filter(m => (m.mode || 'one-way') === k).length}</span></button>`).join('');
  document.querySelectorAll('#modes button').forEach(b => b.onclick = () => { modeFilter = b.dataset.m; renderModes(); renderCmp(); const first = data.missions.findIndex(m => modeFilter === 'all' || (m.mode || 'one-way') === modeFilter); if (first >= 0 && !(modeFilter === 'all' || (mission.mode || 'one-way') === modeFilter)) selectMission(first); }); }
function renderReg() { const on = !!(mission && mission.summary.surface); $('regseg').style.display = on ? '' : 'none'; const cur = regSel ?? (mission && mission.radiation ? mission.radiation.regolith_used ?? 0 : 0);
  document.querySelectorAll('#regseg button').forEach(b => b.classList.toggle('on', +b.dataset.r === +cur)); }
document.querySelectorAll('#regseg button').forEach(b => b.onclick = () => { regSel = +b.dataset.r; renderReg(); renderCmp(); renderRadTable(); lastJd = -1; });
$('shelter').onchange = e => { sheltered = e.target.checked; renderCmp(); renderRadTable(); lastJd = -1; };

let last = performance.now();
function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (playing && mission) { const [t0, t1] = span(); setT(t + dt * +$('speed').value / (t1 - t0)); if (t >= 1) togglePlay(false); }
  if (tween) { tween.t = Math.min(1, tween.t + dt / 1.0); const e = ease(tween.t); controls.target.lerpVectors(tween.fromT, tween.toT, e); camera.position.lerpVectors(tween.fromP, tween.toP, e);
    if (focus) controls.target.copy(planets[focus].mesh.position); if (tween.t >= 1) tween = null; }
  updateWorld(dt); controls.update(); updateClip(); skyCam.quaternion.copy(camera.quaternion);
  renderer.clear(); renderer.render(skyScene, skyCam); renderer.clearDepth(); renderer.render(scene, camera); layoutLabels();
}
renderer.setAnimationLoop(frame);

function setScale(v) { trueScale = v; document.querySelectorAll('#scale button').forEach(b => b.classList.toggle('on', (b.dataset.s === 'true') === v));
  $('scalenote').textContent = v ? 'TRUE SCALE — real radii & distances; planets sub-pixel at system scale (markers not to scale). Log zoom: scroll/pinch. Sky: HYG v4.1, 8,920 stars ≤ mag 6.5, J2000 ecliptic; Milky Way band schematic.'
    : 'ENLARGED PLANETS — NOT TO SCALE. Bodies drawn 10²–10³× real size; distances real.'; if (focus) focusPlanet(focus); }
document.querySelectorAll('#scale button').forEach(b => b.onclick = () => setScale(b.dataset.s === 'true'));
const NAMES = { 'galileo_veega_1989.json': 'Galileo-89' };
async function loadFile(f, mi = 0) {
  $('loading').style.opacity = 1; $('loading').style.display = 'grid';
  data = await (await fetch('missions/' + f)).json(); document.querySelectorAll('#targets button').forEach(c => c.classList.toggle('on', c.dataset.f === f));
  mIndex = Math.min(mi, data.missions.length - 1); buildPlanets(); renderModes(); renderCmp(); selectMission(mIndex);
  $('loading').style.opacity = 0; setTimeout(() => $('loading').style.display = 'none', 400);
}
async function boot() {
  const q = new URLSearchParams(location.search);
  if (q.get('mode')) modeFilter = q.get('mode'); if (q.get('reg') != null) regSel = +q.get('reg');
  if (q.get('shelter') === '0') { sheltered = false; $('shelter').checked = false; }
  resize(); await skyReady; setScale(q.get('scale') !== 'enlarged');
  const idx = await (await fetch('missions/index.json')).json();
  const sorted = idx.sort((a, b) => (ORDER.indexOf(a.replace('.json', '')) + 1 || 99) - (ORDER.indexOf(b.replace('.json', '')) + 1 || 99));
  $('targets').innerHTML = sorted.map(f => `<button data-f="${f}">${NAMES[f] || f.replace('.json', '')}</button>`).join('');
  document.querySelectorAll('#targets button').forEach(c => c.onclick = () => loadFile(c.dataset.f));
  await loadFile(q.get('file') || (sorted.includes('mars.json') ? 'mars.json' : sorted[0]), +(q.get('m') || 0));
  if (q.get('mode') && q.get('m') == null) { const k = data.missions.findIndex(m => (m.mode || 'one-way') === q.get('mode')); if (k >= 0) selectMission(k); }
  if (q.get('pick')) { const k = data.missions.findIndex(m => (m.variant || '').includes(q.get('pick'))); if (k >= 0) selectMission(k); }
  if (q.get('sort')) { sortKey = q.get('sort'); renderCmp(); }
  if (q.get('t')) setT(+q.get('t')); if (q.get('focus')) focusPlanet(q.get('focus')); if (q.get('play')) togglePlay(true);
  if (q.get('still')) { renderer.setAnimationLoop(null); if (tween) tween.t = 1; for (let k = 0; k < 40; k++) frame(performance.now() + k * 16); window.stillDone = true; }
}
window.viewerReady = boot().then(() => true);
