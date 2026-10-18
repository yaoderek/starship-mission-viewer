// Start screen: the mission builder over an animated backdrop of the chosen destination.
import * as THREE from 'three';
import { loadSkyData, makeSky } from './sky.js';
import { planetTexture, atmosphereMaterial, atmosphereHaloMaterial, ATMOSPHERES, glowTexture, earthClouds, ringTexture, remapRingUVs } from './textures.js';
import { drawSchematic } from './schematic.js';
import { PLANETS, STARS, SOLAR_VEHICLES, STAR_VEHICLES, planetById, starById } from './catalog.js';
import { buildMission } from './interstellar.js';
import { HISTORIC, historicById, buildHistoric } from './historic.js';
import { Holo } from './holo.js';
import { resizeAll } from './vehicle.js';
import { $, esc, dur, mass, sig, int, f1 } from './fmt.js';
import * as Rad from './radiation.js';

// ------------------------------------------------------------------ hero backdrop
// The selected destination fills the middle of the screen between the two builder rails.
const TILT = { mercury: 0.03, venus: 3.1, earth: 0.41, mars: 0.44, jupiter: 0.05, saturn: 0.47, uranus: 1.71, neptune: 0.49 };
let hero = null;
export async function initHero() {
  const canvas = $('hero');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.autoClear = false; r.toneMapping = THREE.ACESFilmicToneMapping;
  const skyScene = new THREE.Scene(), skyCam = new THREE.PerspectiveCamera(55, 1, 0.1, 10);
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(0, 0, 9);
  const sky = makeSky(await loadSkyData(), { brightness: 1.15 }); skyScene.add(sky.group);
  const sunPos = new THREE.Vector3(-26, 9, 2);
  const light = new THREE.DirectionalLight(0xfff4e6, 2.6); light.position.copy(sunPos); sc.add(light); sc.add(new THREE.AmbientLight(0x1a1a1a, 0.3));
  const pivot = new THREE.Group(); sc.add(pivot);
  const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ffffff'), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sc.add(star); star.visible = false;
  hero = { r, skyScene, skyCam, sc, cam, sky, pivot, sunPos, planets: {}, star, mode: null, fade: 0, target: 'mars', beta: 0, t: 0, yaw: 0.6 };
  const resize = () => { const w = innerWidth, h = innerHeight; r.setSize(w, h, false); cam.aspect = skyCam.aspect = w / h; cam.updateProjectionMatrix(); skyCam.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();
  setHero('mars');
}
function heroPlanet(name) {
  const H = hero; if (H.planets[name]) return H.planets[name];
  const g = new THREE.Group(), tilt = new THREE.Group(); tilt.rotation.z = TILT[name] || 0; g.add(tilt);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshStandardMaterial({ map: planetTexture(name), roughness: 1 })); tilt.add(body);
  if (name === 'earth') { const cl = new THREE.Mesh(new THREE.SphereGeometry(1.01, 128, 64), new THREE.MeshStandardMaterial({ map: earthClouds(), transparent: true, depthWrite: false })); cl.userData.spin = 0.065; cl.renderOrder = 1; tilt.add(cl); }
  const A = ATMOSPHERES[name];
  if (A) {
    const am = atmosphereMaterial(A.color, A.rim), hm = atmosphereHaloMaterial(A.color, A.halo);
    am.uniforms.sunPos.value.copy(H.sunPos); hm.uniforms.sunPos.value.copy(H.sunPos);
    const rim = new THREE.Mesh(new THREE.SphereGeometry(1.05, 64, 32), am); rim.renderOrder = 2;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(A.shell, 48, 24), hm); halo.renderOrder = 3;
    tilt.add(rim, halo);
  }
  if (name === 'saturn') {
    const rg = new THREE.RingGeometry(1.24, 2.27, 160, 1); remapRingUVs(rg, 1.24, 2.27);
    const ring = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
    ring.rotation.x = Math.PI / 2 - 0.25; ring.renderOrder = 4; tilt.add(ring);
  }
  g.userData.body = body; g.visible = false; H.pivot.add(g); H.planets[name] = g; return g;
}
// mode: a planet id, or a star object { col }
export function setHero(mode) { if (hero) hero.target = mode; }
export function renderHero(dt) {
  if (!hero) return; const H = hero; H.t += dt;
  const key = m => typeof m === 'string' ? m : 'star:' + (m && m.id);
  if (key(H.mode) !== key(H.target)) {
    if (typeof H.target === 'string') { H.mode = H.target; H.fade = 1; } // planet swap keeps scale; no zoom pulse
    else { H.fade -= dt * 3; if (H.fade <= 0) { H.mode = H.target; H.fade = 0; } }
  } else H.fade = Math.min(1, H.fade + dt * 2);
  const wide = innerWidth > 1000, isStar = H.mode && typeof H.mode !== 'string';
  for (const [k, g] of Object.entries(H.planets)) g.visible = false;
  if (H.mode && !isStar) {
    const g = heroPlanet(H.mode), s = wide ? (H.mode === 'saturn' ? 1.05 : 1.55) : 1.3;
    g.visible = true; g.position.set(wide ? 0.25 : 0, wide ? -0.05 : -1.6, 0); g.scale.setScalar(s); g.userData.body.rotation.y = H.t * 0.05;
    g.traverse(o => { if (o.userData.spin) o.rotation.y = H.t * o.userData.spin; });
  }
  H.star.visible = !!isStar; if (isStar) { H.star.material.color.set(H.mode.col || '#ffffff'); H.star.material.opacity = H.fade; H.star.position.set(wide ? 0.25 : 0, 0, 0); H.star.scale.setScalar((1.6 + 0.6 * Math.min(1, Math.pow(H.mode.lum || 1, 0.15))) * (1 + 0.04 * Math.sin(H.t * 2))); }
  // interstellar destinations warp the sky as if seen from a ship at 90% of light speed
  const tb = isStar ? 0.9 : 0; H.beta += (tb - H.beta) * Math.min(1, dt * 1.5);
  H.yaw += dt * 0.008;
  H.skyCam.position.set(0, 0, 0); H.skyCam.lookAt(Math.cos(H.yaw), Math.sin(H.yaw), 0.15);
  const fwd = new THREE.Vector3(); H.skyCam.getWorldDirection(fwd);
  H.sky.uniforms.uBeta.value = H.beta; H.sky.uniforms.uDir.value.copy(fwd);
  H.r.clear(); H.r.render(H.skyScene, H.skyCam); H.r.clearDepth(); H.r.render(H.sc, H.cam);
}

// ------------------------------------------------------------------ builder
const PARAM_DEFS = {
  solar: [['dry', 'Dry mass', 't', 1], ['payload', 'Payload', 't', 1], ['cap', 'Tank capacity', 't', 10], ['isp', 'Engine Isp', 's', 1], ['tanker', 'Propellant per tanker', 't', 5], ['maxTankers', 'Tanker flights allowed', '', 1], ['wall', 'Extra cabin shielding (water)', 'g/cm²', 5], ['shelter', 'Storm shelter (water)', 'g/cm²', 5]],
  rocket: [['dry', 'Dry mass', 't', 1], ['prop', 'Propellant', 't', 1], ['ve', 'Exhaust speed', '% of c', 0.1, 100], ['accel', 'Acceleration', 'g', 0.01], ['crew', 'Crew', '', 1], ['shield', 'Crew shielding', 'g/cm²', 1]],
  beam: [['beta', 'Target speed', '% of c', 1, 100], ['accel', 'Acceleration', 'g', 100]],
  ramjet: [['accel', 'Acceleration', 'g', 0.1], ['crew', 'Crew', '', 1], ['shield', 'Crew shielding', 'g/cm²', 1]],
  ballistic: [['vkms', 'Cruise speed', 'km/s', 0.1]],
};
export const B = { kind: 'planet', dest: 'mars', vehicle: 'starship', params: {}, year: 2035 };
let fileCache = {}, onLaunch = null;
export async function loadPlanetFile(id) {
  const f = planetById(id).file;
  if (!fileCache[f]) fileCache[f] = fetch('missions/' + f).then(r => r.json());
  return fileCache[f];
}

let bholo = null;
let preview = null, ptime = 0;
export function renderBuilderHolo(dt) { if (!bholo) return; bholo.render(dt); ptime += dt; drawSchematic($('schem'), preview, ptime); }
export function initBuilder(launch) {
  onLaunch = launch;
  bholo = new Holo($('bholo'), $('bholowrap'), { label: $('bhololen') });
  $('dPlanets').innerHTML = PLANETS.map(p => `<button data-k="planet" data-id="${p.id}"><i style="color:${pdot(p.id)}">■</i>${p.name}</button>`).join('');
  $('dHist').innerHTML = HISTORIC.map(h => `<button data-k="historic" data-id="${h.id}"><i style="color:#f2f2f2">■</i>${h.name.replace('Mars 2020 ', '')}<em>${h.year}</em></button>`).join('');
  $('dStars').innerHTML = STARS.map(s => `<button data-k="star" data-id="${s.id}"><i style="color:${s.col}">■</i>${s.short}<em>${s.ly.toFixed(1)} ly</em></button>`).join('');
  bindDest();
}
const pdot = id => ({ mercury: '#9a958e', venus: '#d8c49a', mars: '#c8714f', jupiter: '#d3b48c', saturn: '#d8c595', uranus: '#9fd3d8', neptune: '#5b78d8' }[id]);
function bindDest() {
  document.querySelectorAll('#dPlanets button,#dStars button,#dHist button').forEach(b => b.onclick = () => {
    const kind = b.dataset.k; if (kind !== B.kind) { B.vehicle = kind === 'star' ? 'hailmary' : kind === 'historic' ? historicById(b.dataset.id).launcher : 'starship'; B.params = {}; }
    if (kind === 'historic') B.vehicle = historicById(b.dataset.id).launcher;
    B.kind = kind; B.dest = b.dataset.id; B.mission = 0; renderBuilder();
  });
  $('launch').onclick = () => onLaunch({ ...B, params: { ...B.params } });
}

export function openBuilder(cfg) {
  if (cfg) Object.assign(B, { ...cfg, params: { ...(cfg.params || {}) } });
  delete B.preset; delete B.title;
  renderBuilder();
}
const heroTarget = () => B.kind === 'star' ? starById(B.dest) : B.kind === 'historic' ? historicById(B.dest).hero : B.dest;

function vehicles() { return B.kind === 'star' ? STAR_VEHICLES : SOLAR_VEHICLES; }
function veh() { return vehicles().find(v => v.id === B.vehicle) || vehicles()[0]; }
function renderBuilder() {
  document.querySelectorAll('#dPlanets button,#dStars button,#dHist button').forEach(b => b.classList.toggle('on', b.dataset.id === B.dest));
  if (B.kind === 'historic') return renderHistoric();
  const d = B.kind === 'star' ? starById(B.dest) : planetById(B.dest);
  $('destBlurb').innerHTML = `<b>${esc(d.name)}</b>${B.kind === 'star' ? ` · ${d.ly.toFixed(2)} ly · ${d.sp}` : ''}<br>${esc(d.blurb)}`;
  setHero(heroTarget());
  $('vehList').innerHTML = vehicles().map(v => `<button class="veh ${v.id === veh().id ? 'on' : ''}" data-id="${v.id}"><span class="vt"><b>${esc(v.name)}</b><em>${esc(v.tag)}</em>${v.crewed ? '<span class="tag ok">CREWED</span>' : ''}</span><span class="vb">${esc(v.blurb)}</span></button>`).join('');
  $('vehList').querySelectorAll('.veh').forEach(b => b.onclick = () => { B.vehicle = b.dataset.id; B.params = {}; renderBuilder(); });
  bholo.show(veh().id, 'stack'); $('bholoname').textContent = veh().name;
  $('launch').textContent = 'LAUNCH MISSION →';
  renderParams(); estimate();
}
// Historical missions are replays: the vehicle and numbers are fixed, so show facts instead of inputs.
function renderHistoric() {
  const h = historicById(B.dest), data = buildHistoric(), mi = data.missions.findIndex(m => m.historicId === h.id), m = data.missions[mi], S = m.summary;
  B.vehicle = h.launcher; B.mission = mi; B.params = {};
  $('destBlurb').innerHTML = `<b>${esc(h.name)}</b> · ${h.year}<br>${esc(h.blurb)}`;
  setHero(heroTarget());
  $('vehList').innerHTML = `<div class="veh on"><span class="vt"><b>${esc(h.launcherName)}</b><em>Launch vehicle</em></span><span class="vb">${h.facts.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</span></div>`;
  bholo.show(h.launcher); $('bholoname').textContent = h.launcherName;
  $('params').innerHTML = `<div class="facts">${m.events.map(e => `<div><span>${e.date}</span><b>${esc(e.label)}</b></div>`).join('')}</div>`;
  $('estimate').innerHTML = `<div class="est-grid"><div><span>Cruise</span><b>${dur(S.total_days)}</b></div><div><span>Launch C3</span><b>${f1(S.c3, 1)} km²/s²</b></div>
    <div><span>Arrival v∞</span><b>${f1(S.vinf_arr, 2)} km/s</b></div><div><span>Gravity assists</span><b>${S.flybys.length || 'none'}</b></div></div>`;
  $('launch').disabled = false; $('launch').textContent = 'REPLAY MISSION →';
  preview = { kind: 'planet', data, mission: m, dest: m.target };
}
function renderParams() {
  const v = veh(), p = { ...v.p, ...B.params }, defs = B.kind === 'star' ? PARAM_DEFS[p.kind] : PARAM_DEFS.solar;
  let html = defs.map(([k, label, unit, step, scale = 1]) => `<label class="field"><span>${label}</span><input type="number" data-k="${k}" data-s="${scale}" step="${step}" min="0" value="${+(p[k] * scale).toPrecision(6)}"><em>${unit}</em></label>`).join('');
  if (B.kind === 'star') {
    if (p.kind === 'rocket' || p.kind === 'ramjet') html += `<label class="check"><input type="checkbox" data-k="decel" ${p.decel ? 'checked' : ''}> Brake at the destination instead of flying past</label>`;
    if (v.id === 'hailmary') html += `<label class="check"><input type="checkbox" data-k="followBook" ${p.followBook ? 'checked' : ''}> Fly the book’s profile: 1.5 g all the way, whether or not the fuel allows it</label>`;
    html += `<label class="field"><span>Launch year</span><input type="number" data-year step="1" value="${B.year}"><em></em></label>`;
  }
  html += `<button class="ghost small" id="preset-reset">Reset to ${esc(v.name)} defaults</button>`;
  $('params').innerHTML = html;
  $('params').querySelectorAll('input[data-k]').forEach(inp => inp.oninput = () => {
    const k = inp.dataset.k;
    if (inp.type === 'checkbox') B.params[k] = inp.checked;
    else { const x = parseFloat(inp.value); if (isFinite(x) && x >= 0) B.params[k] = x / +inp.dataset.s; }
    estimate();
  });
  const yr = $('params').querySelector('[data-year]'); if (yr) yr.oninput = () => { const y = parseInt(yr.value); if (y > 1900 && y < 1e5) { B.year = y; estimate(); } };
  $('preset-reset').onclick = () => { B.params = {}; renderParams(); estimate(); };
}

let estSeq = 0;
async function estimate() {
  const seq = ++estSeq, el = $('estimate'), v = veh(), p = { ...v.p, ...B.params };
  if (B.kind === 'star') {
    const s = starById(B.dest);
    if ((p.kind === 'rocket' && (!(p.dry > 0) || !(p.prop > 0) || !(p.ve > 0))) || !(p.accel > 0 || p.kind === 'ballistic') || (p.kind === 'ballistic' && !(p.vkms > 0))) { el.innerHTML = '<div class="bad">Every mass, speed and acceleration needs to be above zero.</div>'; $('launch').disabled = true; return; }
    const m = buildMission(s, v, B.params, B.year), S = m.summary; preview = { kind: 'star', star: s, mission: m };
    $('launch').disabled = !isFinite(S.earth_days);
    const short = p.kind === 'rocket' && S.prop_used_t > p.prop * 1.0001;
    el.innerHTML = `<div class="est-grid">
      <div><span>Earth time</span><b>${dur(S.earth_days)}</b></div><div><span>Ship time</span><b class="acc">${dur(S.ship_days)}</b></div>
      <div><span>Top speed</span><b>${S.beta >= 0.001 ? (S.beta * 100).toFixed(S.beta > 0.99 ? 2 : 1) + '% c' : f1(S.beta * 299792.458, 1) + ' km/s'}</b></div><div><span>Arrives</span><b>${S.decel ? 'and stops' : 'flyby'}</b></div>
      ${p.kind === 'rocket' ? `<div><span>Mass ratio</span><b>${sig(S.mr)}</b></div><div><span>Fuel needed</span><b class="${short ? 'no' : ''}">${mass(S.prop_used_t)}</b></div>` : ''}
    </div>${short ? `<div class="bad">Needs ${sig(S.prop_used_t / p.prop)}× the propellant loaded. The trip shown follows the book anyway; untick “Fly the book’s profile” to see what the fuel really buys.</div>` : ''}
    ${S.crew && S.ship_days > 365 * 60 ? '<div class="bad">Longer than a human lifetime aboard.</div>' : ''}${starRadEstimate(m)}`;
    return;
  }
  el.innerHTML = '<div class="dim">Loading trajectories…</div>'; $('launch').disabled = true; preview = null;
  const data = await loadPlanetFile(B.dest); if (seq !== estSeq) return;
  resizeAll(data, p);
  const ok = data.missions.filter(m => m.summary.feasible);
  const best = ok.slice().sort((a, b) => (a.summary.tankers_needed ?? 99) - (b.summary.tankers_needed ?? 99) || a.summary.total_days - b.summary.total_days)[0];
  $('launch').disabled = false;
  const shown = best || data.missions[0]; B.mission = data.missions.indexOf(shown); preview = { kind: 'planet', data, mission: shown, dest: B.dest };
  el.innerHTML = `<div class="est-grid"><div><span>Options that work</span><b class="${ok.length ? 'ok' : 'no'}">${ok.length} of ${data.missions.length}</b></div>
    ${best ? `<div><span>Fewest tankers</span><b>${best.summary.tankers_needed}</b></div><div><span>That route</span><b>${esc(best.name)}</b></div><div><span>Launch / duration</span><b>${best.summary.launch}, ${int(best.summary.total_days ?? best.summary.tof_years * 365.25)} d</b></div>` : ''}
    </div>${ok.length ? '' : `<div class="bad">Nothing closes with this vehicle: ${esc((data.missions[0].summary.why || [])[0] || '')}. You can still open the dashboard to see why.</div>`}${radEstimate(data, shown, ok, p)}`;
}
// Interstellar crew radiation before launch (probes: what a crew would get in that hull).
function starRadEstimate(m) {
  const T = m.radiation.totals, lethal = T.acute >= 6000, cls = lethal || T.total_mean > 600 ? 'no' : T.total_mean > 300 ? 'wn' : 'ok', pc = x => x < 0.001 ? '<0.1%' : (x * 100).toFixed(x < 0.1 ? 1 : 0) + '%';
  const who = m.summary.crew ? 'Crew' : 'If crewed';
  return `<div class="est-grid est-rad">
    <div><span>${who} · dose</span><b class="${cls}">${lethal ? 'lethal' : T.total_mean > 10000 ? sig(T.total_mean / 1000) + ' Sv' : int(T.total_mean) + ' mSv'}</b><em>${lethal ? `${sig(T.peak_rate / 24000)} Sv/hour at cruise` : `${int(T.total_mean / 6)}% of career limit`}</em></div>
    <div><span>Cancer chance</span><b class="${cls}">${lethal ? '—' : Rad.cancerLabel(T.total_mean)}</b><em>${lethal ? 'would not survive' : T.total_mean > 10000 ? 'beyond any data' : `bad case ${Rad.cancerLabel(T.total_p95)}`}</em></div>
    <div><span>Interstellar gas</span><b class="${T.gas > 1 ? 'no' : 'ok'}">${T.gas > 1 ? sig(T.gas / 1000) + ' Sv' : 'stopped'}</b><em>${m.params.absorbs ? 'Astrophage absorbs it' : `${sig(m.params.frontal)} g/cm² bow shield`}</em></div>
    </div>`;
}
// Crew radiation risk before launch: the route shown above and the lowest-dose route that still closes.
function radEstimate(data, shown, ok, p) {
  if (!Rad.ready() || !shown.radiation || !shown.radiation.r_au) return '';
  const s = { wall: p.wall ?? 0, shelter: p.shelter ?? 20 }, A = Rad.analyse(shown, s, { n: 300, series: false });
  const pc = x => x < 0.001 ? '<0.1%' : (x * 100).toFixed(x < 0.1 ? 1 : 0) + '%', cls = d => d > 600 ? 'no' : d > 300 ? 'wn' : 'ok';
  const pool = (ok.length ? ok : data.missions).filter(m => m.radiation && m.radiation.r_au).map(m => [m, Rad.analyse(m, s, { n: 120, series: false, seed: 5 })]);
  const [lm, la] = pool.sort((a, b) => a[1].mean - b[1].mean)[0] || [];
  const dm = Rad.shieldMass(s);
  return `<div class="est-grid est-rad">
    <div><span>Crew dose · ${esc(shown.name)}</span><b class="${cls(A.mean)}">${int(A.mean)} mSv</b><em>${int(A.mean / 6)}% of career limit</em></div>
    <div><span>Cancer chance</span><b class="${cls(A.mean)}">${pc(A.cancer)}</b><em>bad case ${pc(A.cancerBad)}</em></div>
    <div><span>Radiation sickness</span><b class="${A.pArs > 0.01 ? 'no' : A.pArs > 0.001 ? 'wn' : 'ok'}">${A.pArs > 0.001 ? pc(A.pArs) : '<0.1%'}</b><em>${s.shelter ? `${s.shelter} g/cm² shelter` : 'no shelter'}</em></div>
    ${lm && lm !== shown ? `<div class="wide"><span>Lowest-dose route${ok.length ? ' that works' : ''}</span><b>${esc(lm.name)} ${lm.summary.launch} · ${int(la.mean)} mSv · ${pc(la.cancer)} cancer chance</b></div>` : ''}
    </div>${dm ? `<div class="dim est-note">Shielding ${dm > 0 ? 'adds' : 'saves'} ${int(Math.abs(dm))} t.</div>` : ''}`;
}

