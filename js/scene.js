// Main 3D view. Two modes share one renderer:
//   solar        - heliocentric, units AU, planets from the mission file ephemeris
//   interstellar - local stellar neighbourhood, units light years
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { Line2 } from '../vendor/lines/Line2.js';
import { LineMaterial } from '../vendor/lines/LineMaterial.js';
import { LineGeometry } from '../vendor/lines/LineGeometry.js';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';
import { loadSkyData, makeSky } from './sky.js';
import { planetTexture, earthClouds, ringTexture, remapRingUVs, glowTexture, starSpikeTexture, sunTexture, atmosphereMaterial } from './textures.js';
import { STARS, MAP_STARS } from './catalog.js';
import { starPos } from './interstellar.js';
import { cap } from './fmt.js';

export const ORDER = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
export const RADIUS = { mercury: 2439, venus: 6052, earth: 6371, mars: 3390, jupiter: 69911, saturn: 58232, uranus: 25362, neptune: 24622 };
export const PCOL = { mercury: '#9a958e', venus: '#d8c49a', earth: '#5b8fd0', mars: '#c8714f', jupiter: '#d3b48c', saturn: '#d8c595', uranus: '#9fd3d8', neptune: '#5b78d8' };
const TILT = { mercury: 0.03, venus: 177.4, earth: 23.44, mars: 25.19, jupiter: 3.13, saturn: 26.73, uranus: 97.77, neptune: 28.32 };
const SPIN = { mercury: 0.02, venus: -0.01, earth: 0.25, mars: 0.24, jupiter: 0.6, saturn: 0.55, uranus: -0.35, neptune: 0.37 };   // cosmetic rad/s
const ATMO = { venus: ['#f4dca0', 0.9], earth: ['#6fb0ff', 1.2], mars: ['#e8a27a', 0.45], jupiter: ['#e8d4b0', 0.5], saturn: ['#efe0b8', 0.5], uranus: ['#bff0f4', 0.7], neptune: ['#7aa0ff', 0.8] };
export const EVC = { launch: '#e8e8e8', arrival: '#e8e8e8', flyby: '#8aaec4', dsm: '#c9a24f', hazard: '#c96a5f', surface: '#8fae7a', departure: '#e8e8e8', return: '#e8e8e8' };
const AU_KM = 149597870.7, SUN_R = 695700 / AU_KM;

let renderer, composer, bloom, scene, skyScene, camera, skyCam, controls, host, canvas, sky, labelLayer, tipEl;
let W = 1, H = 1, mode = 'solar', trueScale = true, data = null, mission = null, relView = true;
const lineMats = [], labels = [], hoverables = [];
let planets = {}, orbitGroup, gridGroup, missionGroup, starGroup, sunGroup, sunMesh, sunGlow, sunHalo, ship, shipGlow, trajFlown, trajPlan, nSeg = 0;
let focus = null, tween = null, onPick = null, curJd = 0;
const vtmp = new THREE.Vector3();

// ------------------------------------------------------------------ setup
export async function initScene(opts) {
  ({ canvas, host, labelLayer, tipEl, onPick } = opts);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  scene = new THREE.Scene(); skyScene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 1e-6, 5000); skyCam = new THREE.PerspectiveCamera(40, 1, 0.1, 10);
  camera.up.set(0, 0, 1); camera.position.set(0, -6, 4);
  controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 2e-7, maxDistance: 400, zoomSpeed: 1.6, rotateSpeed: 0.7 });
  controls.addEventListener('start', () => { tween = null; });

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(skyScene, skyCam));
  const main = new RenderPass(scene, camera); main.clear = false; main.clearDepth = true; composer.addPass(main);
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.86); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  scene.add(new THREE.PointLight(0xfff4e6, 3.2, 0, 0));
  scene.add(new THREE.AmbientLight(0x2a3440, 0.35));
  orbitGroup = new THREE.Group(); gridGroup = new THREE.Group(); missionGroup = new THREE.Group(); starGroup = new THREE.Group(); sunGroup = new THREE.Group();
  scene.add(orbitGroup, gridGroup, missionGroup, starGroup, sunGroup);

  sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ map: sunTexture(), color: new THREE.Color(1.6, 1.45, 1.2) }));
  sunGlow = sprite(glowTexture('#fff3d8'), 0xfff0d0, 1, true); sunHalo = sprite(glowTexture('rgba(255,190,120,0.55)'), 0xffb070, 1, true);
  sunGlow.material.blending = sunHalo.material.blending = THREE.AdditiveBlending;
  sunGroup.add(sunMesh, sunHalo, sunGlow);

  const d = await loadSkyData(); sky = makeSky(d); skyScene.add(sky.group);
  buildStarMap();
  bindPointer();
  new ResizeObserver(resize).observe(host); resize();
}

const SQ = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(14, 14, 36, 36); return new THREE.CanvasTexture(c); })();
const DOT = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, '#fff'); gr.addColorStop(.45, '#fff'); gr.addColorStop(.6, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
function sprite(tex, color, px, raw) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  s.scale.setScalar(raw ? px : px / 1000); s.renderOrder = 5; return s;
}

export function resize() {
  W = Math.max(1, host.clientWidth); H = Math.max(1, host.clientHeight);
  renderer.setSize(W, H, false); composer.setSize(W, H); bloom.resolution.set(W, H);
  camera.aspect = skyCam.aspect = W / H; camera.updateProjectionMatrix(); skyCam.updateProjectionMatrix();
  lineMats.forEach(m => m.resolution.set(W, H));
  labels.forEach(L => L.w = 0);
}

// ------------------------------------------------------------------ labels
function makeLabel(html, cls, prio, getPos, group = 'mission') {
  const el = document.createElement('div'); el.className = 'lb ' + cls; el.innerHTML = html; labelLayer.appendChild(el);
  const L = { el, prio, getPos, w: 0, h: 0, group }; labels.push(L); return L;
}
function clearLabels(group) { for (let i = labels.length - 1; i >= 0; i--) if (labels[i].group === group) { labels[i].el.remove(); labels.splice(i, 1); } }
function layoutLabels() {
  const placed = [];
  for (const L of [...labels].sort((a, b) => b.prio - a.prio)) {
    const p = L.visible === false ? null : L.getPos(); if (!p) { L.el.style.opacity = 0; continue; }
    vtmp.copy(p).project(camera);
    if (vtmp.z > 1 || Math.abs(vtmp.x) > 1.05 || Math.abs(vtmp.y) > 1.05) { L.el.style.opacity = 0; continue; }
    const x = (vtmp.x + 1) / 2 * W, y = (1 - vtmp.y) / 2 * H;
    if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
    const below = L.el.classList.contains('planet') || L.el.classList.contains('star');
    const box = { x0: x + 7, x1: x + 9 + L.w, y0: below ? y + 3 : y - L.h - 8, y1: below ? y + L.h + 5 : y - 6 };
    const hit = placed.some(b => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1));
    L.el.style.transform = `translate(${box.x0}px,${box.y0}px)`;
    const show = !hit || L.force; L.el.style.opacity = show ? 1 : 0; if (show) placed.push(box);
  }
}

// ------------------------------------------------------------------ solar mode
const orbitMat = color => new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(color) }, phase: { value: 0 }, base: { value: 0.16 } },
  vertexShader: `attribute float u; varying float vU;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main(){ vU = u; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `uniform vec3 color; uniform float phase; uniform float base; varying float vU;
    #include <logdepthbuf_pars_fragment>
    void main(){
    #include <logdepthbuf_fragment>
    float d = fract(phase - vU); float a = base + (1. - base) * pow(1. - d, 4.); gl_FragColor = vec4(color, a * .9); }`,
  transparent: true, depthWrite: false,
});

function baseSize(name) { return trueScale ? RADIUS[name] / AU_KM : 0.010 * Math.pow(RADIUS[name] / 6371, 0.55); }

function buildPlanets() {
  orbitGroup.clear(); gridGroup.clear();
  for (const p of Object.values(planets)) { scene.remove(p.group); scene.remove(p.dot); }
  clearLabels('planet'); planets = {};
  hoverables.length = 0;
  let rmax = 0;
  for (const name of ORDER) {
    const P = data.planets[name]; if (!P) continue;
    const n = P.orbit.length, g = new THREE.BufferGeometry().setFromPoints(P.orbit.map(p => new THREE.Vector3(...p)));
    g.setAttribute('u', new THREE.Float32BufferAttribute(P.orbit.map((_, k) => k / n), 1));
    const om = orbitMat(name === data.target ? '#9a9a9a' : '#4a4a4a'); const loop = new THREE.LineLoop(g, om); orbitGroup.add(loop);
    rmax = Math.max(rmax, ...P.orbit.map(p => Math.hypot(p[0], p[1])));

    const group = new THREE.Group(), tilt = new THREE.Group(); group.add(tilt);
    tilt.rotation.x = Math.PI / 2 - THREE.MathUtils.degToRad(TILT[name]);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), new THREE.MeshStandardMaterial({ map: planetTexture(name), roughness: 0.95, metalness: 0 }));
    mesh.userData = { kind: 'planet', name }; tilt.add(mesh);
    if (name === 'earth') { const cl = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 48), new THREE.MeshStandardMaterial({ map: earthClouds(), transparent: true, depthWrite: false, roughness: 1 })); cl.userData.spin = 0.32; tilt.add(cl); }
    if (ATMO[name]) { const am = atmosphereMaterial(ATMO[name][0], ATMO[name][1]); const a = new THREE.Mesh(new THREE.SphereGeometry(1.045, 64, 32), am); a.userData.atmo = am; tilt.add(a); }
    if (name === 'saturn') {
      const rg = new THREE.RingGeometry(1.24, 2.27, 160, 1); remapRingUVs(rg, 1.24, 2.27);
      const ring = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
      ring.rotation.x = -Math.PI / 2; tilt.add(ring);
    }
    scene.add(group); hoverables.push(mesh);
    const dot = sprite(DOT, PCOL[name], 9); dot.userData = { kind: 'planet', name }; scene.add(dot); hoverables.push(dot);
    planets[name] = { group, tilt, mesh, track: P.track, dot, orbit: P.orbit, mat: om };
    makeLabel(cap(name), 'planet', name === data.target ? 60 : 40, () => group.position, 'planet');
  }
  // faint ecliptic reference rings so depth reads at a glance
  const gm = new THREE.LineBasicMaterial({ color: 0x1e1e1e, transparent: true, opacity: 0.8, depthWrite: false });
  for (const r of [1, 2, 5, 10, 20, 30, 40].filter(r => r <= rmax * 1.15)) {
    const pts = []; for (let k = 0; k <= 180; k++) { const a = k / 180 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gm));
  }
}

function interp(track, jd) {
  const n = track.length;
  if (jd <= track[0][0]) return track[0].slice(1); if (jd >= track[n - 1][0]) return track[n - 1].slice(1);
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (track[m][0] <= jd) lo = m; else hi = m; }
  const a = track[lo], b = track[hi], f = (jd - a[0]) / (b[0] - a[0]);
  return [a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3])];
}

// ------------------------------------------------------------------ interstellar map
const SPECTRAL = { O: '#9bb0ff', B: '#aabfff', A: '#cad7ff', F: '#f8f7ff', G: '#fff4ea', K: '#ffd2a1', M: '#ffad76' };
function buildStarMap() {
  starGroup.clear(); clearLabels('star');
  const spike = starSpikeTexture(), glow = glowTexture();
  const all = [{ name: 'Sun', short: 'Sun', ra: 0, dec: 0, ly: 0, sp: 'G2V', lum: 1, col: '#fff4ea', sol: true }, ...STARS, ...MAP_STARS.map(s => ({ ...s, minor: true }))];
  const lineMat = new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.8 });
  const footMat = new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.8 });
  for (const s of all) {
    const p = s.sol ? [0, 0, 0] : starPos(s), v = new THREE.Vector3(...p);
    const col = s.col || SPECTRAL[s.sp[0]] || '#fff';
    const px = Math.max(0.018, Math.min(0.07, 0.03 * Math.pow(s.lum, 0.18)));
    const sp = sprite(s.lum > 0.2 ? spike : glow, col, px, true); sp.position.copy(v); sp.material.blending = THREE.AdditiveBlending; sp.renderOrder = 4;
    sp.userData = { kind: 'star', star: s }; starGroup.add(sp); hoverables.push(sp);
    const core = sprite(DOT, col, 6); core.position.copy(v); starGroup.add(core);
    if (!s.sol) {   // drop line to the ecliptic plane plus a small foot ring
      starGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([v, new THREE.Vector3(p[0], p[1], 0)]), lineMat));
      const ring = []; for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2; ring.push(new THREE.Vector3(p[0] + Math.cos(a) * .12, p[1] + Math.sin(a) * .12, 0)); }
      starGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), footMat));
    }
    const L = makeLabel(s.sol ? 'Sun' : `${s.short || s.name}<span class="d">${s.ly.toFixed(1)} ly</span>`, 'star' + (s.minor ? ' minor' : ''), s.sol ? 70 : s.minor ? 10 : 30, () => v, 'star');
    L.star = s;
  }
  const gm = new THREE.LineBasicMaterial({ color: 0x1c1c1c, transparent: true, opacity: 0.9 });
  for (let r = 2; r <= 18; r += 2) {
    const pts = []; for (let k = 0; k <= 128; k++) { const a = k / 128 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
    starGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gm));
  }
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; starGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(a) * 2, Math.sin(a) * 2, 0), new THREE.Vector3(Math.cos(a) * 18, Math.sin(a) * 18, 0)]), gm)); }
  for (const r of [4, 8, 12, 16]) makeLabel(`${r} ly`, 'ring', 5, () => new THREE.Vector3(r * 0.7071, -r * 0.7071, 0), 'star');
  starGroup.visible = false;
}

// ------------------------------------------------------------------ data / mission
export function setData(d) {
  data = d; mode = d.kind === 'interstellar' ? 'interstellar' : 'solar';
  missionGroup.clear(); clearLabels('mission'); focus = null;
  const solar = mode === 'solar';
  orbitGroup.visible = gridGroup.visible = sunMesh.visible = solar; starGroup.visible = !solar;
  labels.forEach(L => { if (L.group === 'star') L.visible = !solar; });
  if (solar) buildPlanets(); else { for (const p of Object.values(planets)) { scene.remove(p.group); scene.remove(p.dot); } planets = {}; clearLabels('planet'); hoverables.length = 0; starGroup.children.forEach(c => c.userData.kind === 'star' && hoverables.push(c)); }
  labels.forEach(L => { if (L.star) L.el.classList.toggle('target', L.star.id === d.target); if (L.star && L.star.id === d.target) L.prio = 80; });
  if (!solar) sky.uniforms.uDir.value.set(...starPos(d.star)).normalize();
}

export function setMission(m) {
  mission = m;
  missionGroup.clear(); clearLabels('mission');
  for (let i = hoverables.length - 1; i >= 0; i--) if (hoverables[i].userData.kind === 'event') hoverables.splice(i, 1);
  const pos = []; for (const p of m.traj) pos.push(p[1], p[2], p[3]);
  const mk = (color, width, opacity = 1) => {
    const g = new LineGeometry(); g.setPositions(pos);
    const mat = new LineMaterial({ color, linewidth: width, transparent: true, opacity, depthWrite: false });
    mat.resolution.set(W, H); lineMats.push(mat); return new Line2(g, mat);
  };
  trajPlan = mk(mode === 'interstellar' ? 0x6a6a6a : 0x555555, mode === 'interstellar' ? 1.6 : 1.2, 0.9); missionGroup.add(trajPlan);
  trajFlown = mk(0xd2d2d2, 2.0); missionGroup.add(trajFlown); nSeg = m.traj.length - 1;
  shipGlow = sprite(glowTexture('#f0f0f0'), 0xe0e0e0, 0.05, true); shipGlow.material.blending = THREE.AdditiveBlending; missionGroup.add(shipGlow);
  ship = sprite(SQ, 0xffffff, 13); missionGroup.add(ship);
  const shipName = mode === 'interstellar' ? m.name.replace(' (custom)', '').replace('Project ', '').toUpperCase() : 'STARSHIP';
  const SL = makeLabel(`${shipName}<span class="sp"></span>`, 'ship', 100, () => ship.position); SL.force = true; SL.speedEl = SL.el.querySelector('.sp'); m._shipLabel = SL;
  for (const e of m.events) {
    const typ = e.hazard ? 'hazard' : e.type, s = sprite(SQ, EVC[typ], 10);
    s.position.set(...e.pos); s.userData = { kind: 'event', e }; missionGroup.add(s); hoverables.push(s);
    if (mode === 'interstellar' && (e.type === 'launch' || e.type === 'arrival')) continue;   // star labels already mark these
    const short = mode === 'interstellar' ? (e.label.startsWith('Engines off') || e.label.startsWith('Laser push') ? 'Coast' : e.label.startsWith('Turnover') ? 'Turnover' : e.label.startsWith('Flip') ? 'Braking' : e.label)
      : e.type === 'flyby' ? `${cap(e.body)} flyby` : e.type === 'dsm' ? 'Course burn' : e.type === 'launch' ? 'Departure' : e.type === 'departure' ? `Leave ${cap(e.body)}` : e.type === 'return' ? 'Earth entry' : e.type === 'surface' ? 'Landing' : `${cap(e.body)} arrival`;
    const dv = e.dv > 0.0005 ? `<span class="dv">${e.dv >= 1 ? e.dv.toFixed(2) + ' km/s' : (e.dv * 1000).toFixed(0) + ' m/s'}</span>` : '';
    makeLabel(`${short}${dv}`, e.hazard ? 'hz' : e.type, e.hazard ? 90 : e.type === 'arrival' ? 85 : e.type === 'launch' ? 80 : e.type === 'flyby' ? 70 : 30 + Math.min(20, e.dv * 20), () => s.position);
  }
  frameMission();
}

export function frameMission() {
  focus = null;
  if (mode === 'interstellar') {
    const t = new THREE.Vector3(...starPos(data.star)), mid = t.clone().multiplyScalar(0.5), r = Math.max(3, t.length());
    const side = new THREE.Vector3(-t.y, t.x, 0).normalize().multiplyScalar(0.9).add(new THREE.Vector3(0, 0, 0.75)).add(t.clone().normalize().multiplyScalar(-0.35));
    flyTo(mid, r * 1.25 * Math.max(1, 1.1 / camera.aspect), side);
  } else {
    const r = Math.max(...mission.traj.map(p => Math.hypot(p[1], p[2], p[3])));
    flyTo(new THREE.Vector3(0, 0, 0), r * 2.5 * Math.max(1, 1.2 / camera.aspect), new THREE.Vector3(0.1, -1, 0.8));
  }
}

const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export function flyTo(target, dist, dir) {
  const d = dir ? dir.clone().normalize() : camera.position.clone().sub(controls.target).normalize();
  tween = { t: 0, fromT: controls.target.clone(), toT: target.clone(), fromP: camera.position.clone(), toP: target.clone().add(d.multiplyScalar(dist)) };
}
export function focusPlanet(name) {
  if (!planets[name]) return; focus = name; const p = planets[name];
  flyTo(p.group.position, trueScale ? baseSize(name) * 8 : Math.max(0.2, p.group.scale.x * 14));
}
export function flyToEvent(e) { focus = null; flyTo(new THREE.Vector3(...e.pos), mode === 'interstellar' ? 2.5 : 0.8); }
export function setScale(v) { trueScale = v; if (focus) focusPlanet(focus); }
export function setRelativistic(v) { relView = v; }
export const getMode = () => mode;

// ------------------------------------------------------------------ per frame
export function update(jd, dt, beta = 0) {
  if (!mission) return;
  curJd = jd;
  const camD = camera.position.distanceTo(controls.target), k = Math.max(1, camD / 3.5);
  const t0 = performance.now() / 1000;
  if (mode === 'solar') {
    const prevFocus = focus ? planets[focus].group.position.clone() : null;
    for (const [name, p] of Object.entries(planets)) {
      p.group.position.set(...interp(p.track, jd));
      p.group.scale.setScalar(trueScale ? baseSize(name) : baseSize(name) * (focus === name ? Math.min(k, 1.5) : k));
      p.dot.position.copy(p.group.position);
      p.tilt.children[0].rotation.y = t0 * SPIN[name];
      p.tilt.children.forEach(c => { if (c.userData.spin) c.rotation.y = t0 * c.userData.spin; if (c.userData.atmo) c.userData.atmo.uniforms.sunPos && c.userData.atmo.uniforms.sunPos.value.set(0, 0, 0); });
      const px = p.group.scale.x / Math.max(1e-12, camera.position.distanceTo(p.group.position)) * H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      p.dot.material.opacity = Math.max(0, Math.min(1, (6 - px) / 3));
      // orbit tail phase: nearest orbit vertex to the planet
      let best = 0, bd = Infinity; const o = p.orbit, q = p.group.position;
      for (let i = 0; i < o.length; i += 2) { const dd = (o[i][0] - q.x) ** 2 + (o[i][1] - q.y) ** 2; if (dd < bd) { bd = dd; best = i; } }
      p.mat.uniforms.phase.value = best / o.length;
    }
    if (focus && prevFocus && !tween) { const dl = planets[focus].group.position.clone().sub(prevFocus); controls.target.add(dl); camera.position.add(dl); }
    sunMesh.scale.setScalar(trueScale ? SUN_R : Math.max(0.03, 0.006 * camD));
    sunGlow.scale.setScalar(0.085); sunHalo.scale.setScalar(0.2);
    sky.uniforms.uBeta.value = 0;
  } else {
    sunGlow.scale.setScalar(0.05); sunHalo.scale.setScalar(0.09);
    sky.uniforms.uBeta.value = relView ? Math.min(beta, 0.9995) : 0;
  }
  ship.position.set(...interp(mission.traj, jd)); shipGlow.position.copy(ship.position);
  // engine glow: brighter while thrusting (interstellar) or around impulsive burns (solar)
  let burn = 0;
  if (mode === 'interstellar') { const ph = (mission.phases || []).find(p => jd >= p.jd0 && jd <= p.jd1); burn = ph && ph.name !== 'cruise' ? 1 : 0; }
  else for (const e of mission.events) if (e.dv > 0.1 && Math.abs(e.jd - jd) < 3) burn = Math.max(burn, 1 - Math.abs(e.jd - jd) / 3);
  shipGlow.material.color.setRGB(0.85 + 0.15 * burn, 0.85 - 0.1 * burn, 0.85 - 0.4 * burn);
  shipGlow.scale.setScalar(0.035 + 0.05 * burn + 0.006 * Math.sin(t0 * 9) * burn);
  let lo = 0, hi = mission.traj.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (mission.traj[m][0] <= jd) lo = m; else hi = m; }
  trajFlown.geometry.instanceCount = Math.max(1, Math.min(nSeg, lo + 1));
  if (mission._shipLabel?.speedEl) mission._shipLabel.speedEl.textContent = mode === 'interstellar' ? (beta >= 0.01 ? ` ${(beta * 100).toFixed(beta > 0.99 ? 2 : 1)}% c` : '') : '';
}

export function render(dt) {
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 1.1); const e = ease(tween.t);
    controls.target.lerpVectors(tween.fromT, tween.toT, e); camera.position.lerpVectors(tween.fromP, tween.toP, e);
    if (focus && planets[focus]) controls.target.copy(planets[focus].group.position);
    if (tween.t >= 1) tween = null;
  }
  controls.update();
  const d = camera.position.distanceTo(controls.target);
  camera.near = Math.max(1e-9, d * 1e-3); camera.far = Math.max(400, d * 1e4); camera.updateProjectionMatrix();
  skyCam.quaternion.copy(camera.quaternion);
  composer.render(); layoutLabels();
}

// ------------------------------------------------------------------ picking
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function pick(ev) {
  const r = canvas.getBoundingClientRect(); mouse.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(mouse, camera);
  // sprites have screen-constant size, so test them in screen space first
  let best = null, bd = 14;
  for (const o of hoverables) {
    if (!o.isSprite || !o.visible || (o.material.opacity ?? 1) < 0.2) continue;
    vtmp.copy(o.position).project(camera); if (vtmp.z > 1) continue;
    const dx = (vtmp.x + 1) / 2 * r.width - (ev.clientX - r.left), dy = (1 - vtmp.y) / 2 * r.height - (ev.clientY - r.top), dd = Math.hypot(dx, dy);
    if (dd < bd) { bd = dd; best = o; }
  }
  if (best) return best;
  const hits = ray.intersectObjects(hoverables.filter(o => !o.isSprite), false);
  return hits.length ? hits[0].object : null;
}
function bindPointer() {
  canvas.addEventListener('pointermove', ev => {
    const o = pick(ev), r = canvas.getBoundingClientRect();
    if (!o) { tipEl.style.opacity = 0; canvas.style.cursor = ''; return; }
    canvas.style.cursor = 'pointer';
    const u = o.userData;
    tipEl.innerHTML = u.kind === 'planet' ? `<b>${cap(u.name)}</b><br>Radius ${RADIUS[u.name].toLocaleString()} km`
      : u.kind === 'star' ? `<b>${u.star.name}</b><br>${u.star.sol ? 'Home' : u.star.ly.toFixed(2) + ' light years'}, ${u.star.sp}<br>${u.star.blurb ? `<span class="dim">${u.star.blurb}</span>` : ''}`
      : `<b>${u.e.date || ''} ${cap(u.e.type)}</b><br>${u.e.label}`;
    tipEl.style.opacity = 1; tipEl.style.left = Math.min(ev.clientX - r.left + 14, W - 280) + 'px'; tipEl.style.top = (ev.clientY - r.top + 14) + 'px';
  });
  canvas.addEventListener('pointerleave', () => { tipEl.style.opacity = 0; });
  canvas.addEventListener('click', ev => {
    const o = pick(ev); if (!o) return;
    if (o.userData.kind === 'planet') focusPlanet(o.userData.name);
    else if (o.userData.kind === 'star') { focus = null; flyTo(o.position.clone(), 3); }
    else onPick && onPick(o.userData.e);
  });
  canvas.addEventListener('dblclick', () => frameMission());
}
