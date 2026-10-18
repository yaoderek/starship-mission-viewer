// Start screen: animated hero backdrop, preset mission cards and the mission builder.
import * as THREE from 'three';
import { loadSkyData, makeSky } from './sky.js';
import { planetTexture, atmosphereMaterial, glowTexture, earthClouds } from './textures.js';
import { PLANETS, STARS, SOLAR_VEHICLES, STAR_VEHICLES, planetById, starById } from './catalog.js';
import { buildMission } from './interstellar.js';
import { Holo } from './holo.js';
import { resizeAll } from './vehicle.js';
import { $, esc, dur, mass, sig, int, f1 } from './fmt.js';

// ------------------------------------------------------------------ hero backdrop
let hero = null;
export async function initHero() {
  const canvas = $('hero');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.autoClear = false; r.toneMapping = THREE.ACESFilmicToneMapping;
  const skyScene = new THREE.Scene(), skyCam = new THREE.PerspectiveCamera(55, 1, 0.1, 10);
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(0, 0, 9);
  const sky = makeSky(await loadSkyData(), { brightness: 1.15 }); skyScene.add(sky.group);
  const sunPos = new THREE.Vector3(-26, 9, -3);
  const light = new THREE.DirectionalLight(0xfff4e6, 2.6); light.position.copy(sunPos); sc.add(light); sc.add(new THREE.AmbientLight(0x1a2230, 0.25));
  const pivot = new THREE.Group(); sc.add(pivot);
  const mk = name => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshStandardMaterial({ map: planetTexture(name), roughness: 1 })));
    if (name === 'earth') g.add(new THREE.Mesh(new THREE.SphereGeometry(1.01, 128, 64), new THREE.MeshStandardMaterial({ map: earthClouds(), transparent: true, depthWrite: false })));
    const am = atmosphereMaterial(name === 'earth' ? '#6fb0ff' : '#e8a27a', name === 'earth' ? 1.3 : 0.7); am.uniforms.sunPos && am.uniforms.sunPos.value.copy(sunPos);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1.05, 96, 48), am));
    g.rotation.z = 0.35; g.visible = false; pivot.add(g); return g;
  };
  const planets = { mars: mk('mars'), earth: mk('earth') };
  const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#fff2d8'), color: 0xffe2b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  star.scale.setScalar(1.6); sc.add(star); star.visible = false;
  hero = { r, skyScene, skyCam, sc, cam, sky, planets, star, mode: 'mars', fade: 1, target: 'mars', beta: 0, t: 0, yaw: 0.6 };
  const resize = () => { const w = innerWidth, h = innerHeight; r.setSize(w, h, false); cam.aspect = skyCam.aspect = w / h; cam.updateProjectionMatrix(); skyCam.updateProjectionMatrix(); place(); };
  addEventListener('resize', resize); resize();
  setHero('mars');
}
function place() {   // planet sits to the right on wide screens, behind the cards on narrow ones
  if (!hero) return; const wide = innerWidth > 1000;
  for (const g of Object.values(hero.planets)) { g.position.set(wide ? 2.6 : 0, wide ? -0.3 : -1.8, 0); g.scale.setScalar(wide ? 2.1 : 1.6); }
  hero.star.position.set(wide ? 2.4 : 0, 0.2, 0);
}
export function setHero(mode) { if (hero && mode !== hero.target) { hero.target = mode; } }
export function renderHero(dt) {
  if (!hero) return; const H = hero; H.t += dt;
  // cross-fade between hero subjects
  if (H.mode !== H.target) { H.fade -= dt * 3; if (H.fade <= 0) { H.mode = H.target; H.fade = 0; } } else H.fade = Math.min(1, H.fade + dt * 2);
  for (const [k, g] of Object.entries(H.planets)) { g.visible = H.mode === k; g.children[0].rotation.y = H.t * 0.05; if (g.children[1] && k === 'earth') g.children[1].rotation.y = H.t * 0.065; g.scale.setScalar((innerWidth > 1000 ? 2.1 : 1.6) * (0.92 + 0.08 * H.fade)); }
  H.star.visible = H.mode === 'star'; H.star.material.opacity = H.fade; H.star.scale.setScalar(1.3 + 0.08 * Math.sin(H.t * 2));
  // the Hail Mary card warps the sky as if you were aboard at 90% of light speed
  const tb = H.mode === 'star' ? 0.92 : 0; H.beta += (tb - H.beta) * Math.min(1, dt * 1.5);
  H.yaw += dt * 0.008;
  H.skyCam.position.set(0, 0, 0); H.skyCam.lookAt(Math.cos(H.yaw), Math.sin(H.yaw), 0.15);
  const fwd = new THREE.Vector3(); H.skyCam.getWorldDirection(fwd);
  H.sky.uniforms.uBeta.value = H.beta; H.sky.uniforms.uDir.value.copy(fwd);
  H.r.clear(); H.r.render(H.skyScene, H.skyCam); H.r.clearDepth(); H.r.render(H.sc, H.cam);
}

// ------------------------------------------------------------------ builder
const PARAM_DEFS = {
  solar: [['dry', 'Dry mass', 't', 1], ['payload', 'Payload', 't', 1], ['cap', 'Tank capacity', 't', 10], ['isp', 'Engine Isp', 's', 1], ['tanker', 'Propellant per tanker', 't', 5], ['maxTankers', 'Tanker flights allowed', '', 1]],
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
export function renderBuilderHolo(dt) { if (bholo && !$('builder').hidden) bholo.render(dt); }
export function initBuilder(launch) {
  onLaunch = launch;
  bholo = new Holo($('bholo'), $('bholowrap'));
  $('dPlanets').innerHTML = PLANETS.map(p => `<button data-k="planet" data-id="${p.id}"><i style="color:${pdot(p.id)}">■</i>${p.name}</button>`).join('');
  $('dStars').innerHTML = STARS.map(s => `<button data-k="star" data-id="${s.id}"><i style="color:${s.col}">■</i>${s.short}<em>${s.ly.toFixed(1)} ly</em></button>`).join('');
  bindDest();
}
const pdot = id => ({ mercury: '#9a958e', venus: '#d8c49a', mars: '#c8714f', jupiter: '#d3b48c', saturn: '#d8c595', uranus: '#9fd3d8', neptune: '#5b78d8' }[id]);
function bindDest() {
  document.querySelectorAll('#dPlanets button,#dStars button').forEach(b => b.onclick = () => {
    const kind = b.dataset.k; if (kind !== B.kind) { B.vehicle = kind === 'star' ? 'hailmary' : 'starship'; B.params = {}; }
    B.kind = kind; B.dest = b.dataset.id; renderBuilder();
  });
  $('launch').onclick = () => onLaunch({ ...B, params: { ...B.params } });
}

export function openBuilder(cfg) {
  if (cfg) Object.assign(B, { ...cfg, params: { ...(cfg.params || {}) } });
  $('choose').hidden = true; $('builder').hidden = false; setHero(B.kind === 'star' ? 'star' : B.dest === 'mars' ? 'mars' : 'earth');
  renderBuilder();
}
export function closeBuilder() { $('choose').hidden = false; $('builder').hidden = true; }

function vehicles() { return B.kind === 'star' ? STAR_VEHICLES : SOLAR_VEHICLES; }
function veh() { return vehicles().find(v => v.id === B.vehicle) || vehicles()[0]; }
function renderBuilder() {
  document.querySelectorAll('#dPlanets button,#dStars button').forEach(b => b.classList.toggle('on', b.dataset.id === B.dest));
  const d = B.kind === 'star' ? starById(B.dest) : planetById(B.dest);
  $('destBlurb').innerHTML = `<b>${esc(d.name)}</b>${B.kind === 'star' ? ` · ${d.ly.toFixed(2)} ly · ${d.sp}` : ''}<br>${esc(d.blurb)}`;
  setHero(B.kind === 'star' ? 'star' : B.dest === 'mars' ? 'mars' : 'earth');
  $('vehList').innerHTML = vehicles().map(v => `<button class="veh ${v.id === veh().id ? 'on' : ''}" data-id="${v.id}"><span class="vt"><b>${esc(v.name)}</b><em>${esc(v.tag)}</em>${v.crewed ? '<span class="tag ok">CREWED</span>' : ''}</span><span class="vb">${esc(v.blurb)}</span></button>`).join('');
  $('vehList').querySelectorAll('.veh').forEach(b => b.onclick = () => { B.vehicle = b.dataset.id; B.params = {}; renderBuilder(); });
  bholo.show(veh().id); $('bholoname').textContent = veh().name; $('bhololen').textContent = bholo.info.lengthLabel || (bholo.info.length ? `L ${bholo.info.length} m` : 'NOT TO SCALE');
  renderParams(); estimate();
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
    const m = buildMission(s, v, B.params, B.year), S = m.summary;
    $('launch').disabled = !isFinite(S.earth_days);
    const short = p.kind === 'rocket' && S.prop_used_t > p.prop * 1.0001;
    el.innerHTML = `<div class="est-grid">
      <div><span>Earth time</span><b>${dur(S.earth_days)}</b></div><div><span>Ship time</span><b class="acc">${dur(S.ship_days)}</b></div>
      <div><span>Top speed</span><b>${S.beta >= 0.001 ? (S.beta * 100).toFixed(S.beta > 0.99 ? 2 : 1) + '% c' : f1(S.beta * 299792.458, 1) + ' km/s'}</b></div><div><span>Arrives</span><b>${S.decel ? 'and stops' : 'flyby'}</b></div>
      ${p.kind === 'rocket' ? `<div><span>Mass ratio</span><b>${sig(S.mr)}</b></div><div><span>Fuel needed</span><b class="${short ? 'no' : ''}">${mass(S.prop_used_t)}</b></div>` : ''}
    </div>${short ? `<div class="bad">Needs ${sig(S.prop_used_t / p.prop)}× the propellant loaded. The trip shown follows the book anyway; untick “Fly the book’s profile” to see what the fuel really buys.</div>` : ''}
    ${S.crew && S.ship_days > 365 * 60 ? '<div class="bad">Longer than a human lifetime aboard.</div>' : ''}`;
    return;
  }
  el.innerHTML = '<div class="dim">Loading trajectories…</div>'; $('launch').disabled = true;
  const data = await loadPlanetFile(B.dest); if (seq !== estSeq) return;
  resizeAll(data, p);
  const ok = data.missions.filter(m => m.summary.feasible);
  const best = ok.slice().sort((a, b) => (a.summary.tankers_needed ?? 99) - (b.summary.tankers_needed ?? 99) || a.summary.total_days - b.summary.total_days)[0];
  $('launch').disabled = false;
  el.innerHTML = `<div class="est-grid"><div><span>Options that work</span><b class="${ok.length ? 'ok' : 'no'}">${ok.length} of ${data.missions.length}</b></div>
    ${best ? `<div><span>Fewest tankers</span><b>${best.summary.tankers_needed}</b></div><div><span>That route</span><b>${esc(best.name)}</b></div><div><span>Launch / duration</span><b>${best.summary.launch}, ${int(best.summary.total_days ?? best.summary.tof_years * 365.25)} d</b></div>` : ''}
    </div>${ok.length ? '' : `<div class="bad">Nothing closes with this vehicle: ${esc((data.missions[0].summary.why || [])[0] || '')}. You can still open the dashboard to see why.</div>`}`;
}
