import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { EffectComposer } from './vendor/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/postprocessing/OutputPass.js';
import { Line2 } from './vendor/lines/Line2.js';
import { LineMaterial } from './vendor/lines/LineMaterial.js';
import { LineGeometry } from './vendor/lines/LineGeometry.js';

const $ = id => document.getElementById(id);
const ORDER = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const RADIUS = { mercury: 2439, venus: 6052, earth: 6371, mars: 3390, jupiter: 69911, saturn: 58232, uranus: 25362, neptune: 24622 };
const PCOL = { mercury: '#a8a29a', venus: '#e8c98a', earth: '#4f8fe8', mars: '#d9653b', jupiter: '#d8b48a', saturn: '#e6cf98', uranus: '#8fd8e0', neptune: '#4a6fe0' };
const EVCOL = { launch: '#b07cff', flyby: '#5ee0ff', dsm: '#ffc65c', arrival: '#b07cff', hazard: '#ff5d73' };
const fmt = jd => new Date((jd - 2440587.5) * 864e5).toISOString().slice(0, 10);
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.0005, 5000);
camera.up.set(0, 0, 1); camera.position.set(0, -6, 4);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.07; controls.minDistance = 0.02; controls.maxDistance = 400;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.55, 0.62); composer.addPass(bloom);
composer.addPass(new OutputPass());
const lineMats = [];
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
  camera.aspect = w / h;
  // keep the scene centred in the area not covered by the panel
  if (w < 760) camera.setViewOffset(w, h, 0, h * 0.2, w, h); else camera.setViewOffset(w, h, -Math.min(200, w * 0.13), 0, w, h);
  camera.updateProjectionMatrix();
  lineMats.forEach(m => m.resolution.set(w, h));
}
addEventListener('resize', resize);

// ---------- procedural textures ----------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function glowTex(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,.25)') {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.15, mid); gr.addColorStop(0.45, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.75, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = glowTex();
function planetTex(name) {
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const r = rng(name.length * 977 + name.charCodeAt(0)); const base = new THREE.Color(PCOL[name]);
  const shade = (k) => { const col = base.clone().offsetHSL((r() - .5) * .03, (r() - .5) * .1, k); return `#${col.getHexString()}`; };
  g.fillStyle = PCOL[name]; g.fillRect(0, 0, W, H);
  if (['jupiter', 'saturn', 'uranus', 'neptune'].includes(name)) {
    const amp = name === 'jupiter' ? .14 : name === 'saturn' ? .08 : .04;
    for (let y = 0; y < H; y += 2) {
      const k = Math.sin(y * 0.11 + r() * .4) * amp + Math.sin(y * .37) * amp * .4;
      g.fillStyle = shade(k); g.fillRect(0, y, W, 2);
    }
    if (name === 'jupiter') { g.fillStyle = 'rgba(190,90,60,.75)'; g.beginPath(); g.ellipse(330, 165, 28, 14, 0, 0, 7); g.fill(); }
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${r() * .05})`; g.fillRect(r() * W, r() * H, 20 + r() * 60, 1.5); }
  } else {
    for (let i = 0; i < 900; i++) {
      g.fillStyle = shade((r() - .5) * .25); g.globalAlpha = .35; g.beginPath();
      g.arc(r() * W, r() * H, 2 + r() * 18, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    if (name === 'earth') {
      g.fillStyle = '#3f8a4a'; for (let i = 0; i < 26; i++) { g.globalAlpha = .8; g.beginPath(); g.ellipse(r() * W, 40 + r() * 170, 20 + r() * 50, 10 + r() * 30, r() * 3, 0, 7); g.fill(); }
      g.fillStyle = '#fff'; g.globalAlpha = .9; g.fillRect(0, 0, W, 14); g.fillRect(0, H - 14, W, 14);
      for (let i = 0; i < 120; i++) { g.globalAlpha = .25; g.fillRect(r() * W, r() * H, 30 + r() * 80, 3); }
    }
    if (name === 'mars') { g.fillStyle = '#f5ece6'; g.globalAlpha = .85; g.fillRect(0, 0, W, 9); g.fillRect(0, H - 7, W, 7); }
    if (name === 'venus') { for (let i = 0; i < 200; i++) { g.fillStyle = 'rgba(255,240,210,.12)'; g.fillRect(0, r() * H, W, 4); } }
    g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- starfield + milky way ----------
(function sky() {
  const r = rng(42), N = 9000, M = 26000, pos = [], col = [], size = [];
  const tilt = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(60.2)).multiply(new THREE.Matrix4().makeRotationZ(1.1));
  const tmp = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < N + M; i++) {
    let v;
    if (i < N) v = tmp.randomDirection();
    else { // band around a great circle, gaussian latitude, denser toward a "core"
      const lon = r() * Math.PI * 2, g = (r() + r() + r() + r() - 2) * 0.16 * (1.3 - 0.6 * Math.cos(lon));
      v = tmp.set(Math.cos(lon) * Math.cos(g), Math.sin(lon) * Math.cos(g), Math.sin(g)).applyMatrix4(tilt);
    }
    v.multiplyScalar(1500); pos.push(v.x, v.y, v.z);
    const temp = r(); c.setHSL(temp < .3 ? .6 : temp < .8 ? .12 : .02, i < N ? .35 : .25, i < N ? .7 + r() * .3 : .55 + r() * .25);
    col.push(c.r, c.g, c.b);
    size.push(i < N ? (r() < .03 ? 3.2 : .8 + r() * 1.6) : .6 + r() * 1.1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    uniforms: { pr: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: `attribute float size; varying vec3 vC; uniform float pr; void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=size*pr; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d); gl_FragColor=vec4(vC*.85,a*.9); }`
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = -1; scene.add(p);
  scene.userData.sky = p;
})();

// ---------- sun ----------
const sun = new THREE.Mesh(new THREE.SphereGeometry(0.05, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .85, .55).multiplyScalar(3) }));
scene.add(sun);
const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,230,170,1)', 'rgba(255,170,80,.35)'), color: 0xb08a50, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
corona.scale.setScalar(0.7); scene.add(corona);
scene.add(new THREE.PointLight(0xfff1dd, 3.2, 0, 0)); scene.add(new THREE.AmbientLight(0x334466, 0.35));

// ---------- labels with declutter ----------
const labelLayer = $('labels'); const labels = [];
function makeLabel(html, cls, prio, getPos, info) {
  const el = document.createElement('div'); el.className = 'lb ' + cls; el.innerHTML = html; labelLayer.appendChild(el);
  const L = { el, prio, getPos, info, w: 0, h: 0 }; labels.push(L); return L;
}
function clearLabels(filter) {
  for (let i = labels.length - 1; i >= 0; i--) if (filter(labels[i])) { labels[i].el.remove(); labels.splice(i, 1); }
}
const vtmp = new THREE.Vector3();
function layoutLabels() {
  const W = innerWidth, H = innerHeight, placed = [];
  const sorted = [...labels].sort((a, b) => b.prio - a.prio);
  for (const L of sorted) {
    const p = L.getPos(); if (!p) { L.el.style.opacity = 0; continue; }
    vtmp.copy(p).project(camera);
    if (vtmp.z > 1 || Math.abs(vtmp.x) > 1.1 || Math.abs(vtmp.y) > 1.1) { L.el.style.opacity = 0; continue; }
    const x = (vtmp.x + 1) / 2 * W, y = (1 - vtmp.y) / 2 * H;
    if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
    const planet = L.el.classList.contains('planet');
    const box = { x0: x - L.w / 2 - 3, x1: x + L.w / 2 + 3, y0: planet ? y : y - L.h * 1.4 - 2, y1: planet ? y + L.h * 1.6 : y + 2 };
    const hit = placed.some(b => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1));
    L.el.style.transform = `translate(${x}px,${y}px) translate(-50%,${planet ? '60%' : '-140%'})`;
    L.el.style.opacity = hit && !L.force ? 0 : 1;
    if (!hit || L.force) placed.push(box);
  }
}

// ---------- state ----------
let data = null, mission = null, planets = {}, missionGroup = new THREE.Group(), orbitGroup = new THREE.Group();
scene.add(orbitGroup); scene.add(missionGroup);
let t = 0, playing = false, focus = null, tween = null, hoverables = [];
let trajBright = null, ship = null, shipGlow = null, nSeg = 0;

function interp(track, jd) {
  const n = track.length;
  if (jd <= track[0][0]) return track[0].slice(1); if (jd >= track[n - 1][0]) return track[n - 1].slice(1);
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (track[m][0] <= jd) lo = m; else hi = m; }
  const a = track[lo], b = track[hi], f = (jd - a[0]) / (b[0] - a[0]);
  return [a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3])];
}
function baseSize(name) { return 0.012 * Math.pow(RADIUS[name] / 6371, 0.55); }

function buildPlanets() {
  orbitGroup.clear(); for (const p of Object.values(planets)) scene.remove(p.mesh);
  clearLabels(L => L.el.classList.contains('planet')); planets = {};
  for (const name of ORDER) {
    const P = data.planets[name]; if (!P) continue;
    const g = new THREE.BufferGeometry().setFromPoints(P.orbit.map(p => new THREE.Vector3(...p)));
    orbitGroup.add(new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: PCOL[name], transparent: true, opacity: .22 })));
    const mat = new THREE.MeshStandardMaterial({ map: planetTex(name), roughness: .85, metalness: 0 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat); mesh.rotation.x = Math.PI / 2;
    if (name === 'saturn') {
      const rg = new THREE.RingGeometry(1.35, 2.3, 96);
      const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xd9c79c, side: THREE.DoubleSide, transparent: true, opacity: .55 }));
      ring.rotation.x = -Math.PI / 2 + .47; mesh.add(ring);
    }
    const atm = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: PCOL[name], transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
    atm.scale.setScalar(3.2); mesh.add(atm);
    mesh.userData = { kind: 'planet', name }; scene.add(mesh); hoverables.push(mesh);
    planets[name] = { mesh, track: P.track };
    makeLabel(cap(name), 'planet', name === data.target ? 60 : 40, () => mesh.position, { title: cap(name), body: `Radius ${RADIUS[name].toLocaleString()} km · click to focus` });
  }
}

function selectMission(i) {
  mission = data.missions[i];
  missionGroup.clear(); clearLabels(L => !L.el.classList.contains('planet'));
  hoverables = hoverables.filter(h => h.userData.kind === 'planet');
  const pts = mission.traj, n = pts.length;
  const pos = [], col = [], c0 = new THREE.Color('#5ee0ff'), c1 = new THREE.Color('#b07cff'), c2 = new THREE.Color('#ff8a5c'), c = new THREE.Color();
  for (let k = 0; k < n; k++) {
    pos.push(pts[k][1], pts[k][2], pts[k][3]); const f = k / (n - 1);
    if (f < .5) c.lerpColors(c0, c1, f * 2); else c.lerpColors(c1, c2, (f - .5) * 2); col.push(c.r, c.g, c.b);
  }
  const mk = (opacity, width) => {
    const g = new LineGeometry(); g.setPositions(pos); g.setColors(col);
    const m = new LineMaterial({ vertexColors: true, linewidth: width, transparent: true, opacity, depthWrite: false });
    m.resolution.set(innerWidth, innerHeight); lineMats.push(m); return new Line2(g, m);
  };
  missionGroup.add(mk(.28, 1.6)); trajBright = mk(1, 3.2); missionGroup.add(trajBright); nSeg = n - 1;
  ship = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.8, 2.2) }));
  shipGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0x9fefff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  shipGlow.scale.setScalar(7); ship.add(core); ship.add(shipGlow); missionGroup.add(ship);
  makeLabel('Starship', 'ship', 100, () => ship.position).force = true;
  for (const e of mission.events) {
    const typ = e.hazard ? 'hazard' : e.type;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: EVCOL[typ], blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    s.position.set(...e.pos); s.userData = { kind: 'event', e }; missionGroup.add(s); hoverables.push(s);
    const short = e.type === 'flyby' ? `${cap(e.body)} flyby` : e.type === 'dsm' ? e.label.split(' ')[0] : e.type === 'launch' ? 'Launch' : `${cap(e.body)} arrival`;
    const dv = e.dv > 0.0005 ? `<span class="dv">${e.dv >= 1 ? e.dv.toFixed(2) + ' km/s' : (e.dv * 1000).toFixed(0) + ' m/s'}</span>` : '';
    const prio = e.hazard ? 90 : e.type === 'arrival' ? 85 : e.type === 'launch' ? 80 : e.type === 'flyby' ? 70 : 30 + Math.min(20, e.dv * 20);
    makeLabel(`${e.hazard ? '⚠ ' : ''}${short}${dv}`, e.hazard ? 'hz' : e.type, prio, () => s.position, { title: `${e.date} · ${short}`, body: e.label });
  }
  // sidebar detail + timeline ticks
  const S = mission.summary;
  $('detail').innerHTML = `<div style="font-weight:700;margin-bottom:4px">${mission.name} <span class="sub">· ${mission.model}</span></div>` +
    mission.events.map((e, k) => `<div class="ev" data-k="${k}"><i style="background:${EVCOL[e.hazard ? 'hazard' : e.type]}"></i><span class="d">${e.date}</span><span>${e.label}</span></div>`).join('') +
    (mission.hazards.length ? `<div class="hzbox">⚠ ${mission.hazards.join('<br>⚠ ')}</div>` : '') +
    `<div class="sub" style="margin-top:8px">C3 ${S.c3.toFixed(1)} km²/s² · departure ${S.dv_dep.toFixed(2)} · mid-course ${S.dv_dsm.toFixed(2)} · capture ${S.dv_capture.toFixed(2)} km/s (${S.capture})<br>Vehicle: ${data.vehicle}</div>`;
  const t0 = pts[0][0], t1 = pts[n - 1][0];
  $('ticks').innerHTML = mission.events.map(e => `<div class="tick" style="left:${(e.jd - t0) / (t1 - t0) * 100}%;background:${EVCOL[e.hazard ? 'hazard' : e.type]}" data-l="${e.date} · ${e.label.replace(/"/g, '')}"></div>`).join('');
  document.querySelectorAll('.ev').forEach(el => el.onclick = () => { const e = mission.events[+el.dataset.k]; setT((e.jd - t0) / (t1 - t0)); flyTo(new THREE.Vector3(...e.pos), 1.2); });
  document.querySelectorAll('.card').forEach((el, k) => el.classList.toggle('on', k === i));
  const r = Math.max(...pts.map(p => Math.hypot(p[1], p[2], p[3])));
  focus = null; flyTo(new THREE.Vector3(0, 0, 0), r * 2.3 * Math.max(1, 1.25 / camera.aspect), new THREE.Vector3(0.15, -1, 0.75));
  setT(0);
}

function renderCards() {
  $('cards').innerHTML = data.missions.map((m, i) => {
    const s = m.summary;
    return `<div class="card" data-i="${i}"><div class="row1"><div><span class="rank">#${m.rank}</span><span class="seq">${m.name}</span></div>
      <span class="badge ${s.feasible ? 'ok' : 'no'}">${s.feasible ? 'FEASIBLE' : 'NOT FEASIBLE'}</span></div>
      <div class="sub">${s.launch} → ${s.arrive} · ${m.model}${m.hazards.length ? ' · <span class="hz">⚠ ' + m.hazards.length + '</span>' : ''}</div>
      <div class="stats"><div class="stat"><b>${s.dv_total.toFixed(2)}</b><span>Δv km/s</span></div><div class="stat"><b>${s.tof_years.toFixed(1)}</b><span>TOF yr</span></div>
      <div class="stat"><b>${s.tankers_needed ?? '—'}</b><span>tankers</span></div><div class="stat"><b>${s.c3.toFixed(0)}</b><span>C3</span></div></div></div>`;
  }).join('');
  document.querySelectorAll('.card').forEach(el => el.onclick = () => selectMission(+el.dataset.i));
}

async function loadFile(f, mi = 0) {
  $('loading').style.opacity = 1; $('loading').style.display = 'grid';
  data = await (await fetch('missions/' + f)).json();
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.f === f));
  buildPlanets(); renderCards(); selectMission(Math.min(mi, data.missions.length - 1));
  $('loading').style.opacity = 0; setTimeout(() => $('loading').style.display = 'none', 600);
}

// ---------- camera transitions ----------
const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
function flyTo(target, dist, dir) {
  const d = dir ? dir.clone().normalize() : camera.position.clone().sub(controls.target).normalize();
  tween = { t: 0, fromT: controls.target.clone(), toT: target.clone(), fromP: camera.position.clone(), toP: target.clone().add(d.multiplyScalar(dist)) };
}
function focusPlanet(name) {
  focus = name; const p = planets[name].mesh;
  flyTo(p.position, Math.max(0.25, p.scale.x * 14));
}

// ---------- time ----------
function span() { return [mission.traj[0][0], mission.traj[mission.traj.length - 1][0]]; }
function setT(f) { t = Math.max(0, Math.min(1, f)); }
function updateWorld() {
  if (!mission) return;
  const [t0, t1] = span(), jd = t0 + t * (t1 - t0);
  const camD = camera.position.distanceTo(controls.target);
  const k = Math.max(1, camD / 3.5);
  let prevFocus = focus ? planets[focus].mesh.position.clone() : null;
  for (const [name, p] of Object.entries(planets)) {
    p.mesh.position.set(...interp(p.track, jd));
    p.mesh.scale.setScalar(baseSize(name) * (focus === name ? Math.min(k, 1.5) : k));
    p.mesh.rotation.y += 0.002;
  }
  if (focus && prevFocus && !tween) { const dlt = planets[focus].mesh.position.clone().sub(prevFocus); controls.target.add(dlt); camera.position.add(dlt); }
  ship.position.set(...interp(mission.traj, jd)); ship.scale.setScalar(0.006 * k);
  const ks = Math.max(1, Math.sqrt(k)); sun.scale.setScalar(ks); corona.scale.setScalar(0.32 * ks);
  // bright traveled segment: count segments with time <= jd
  let lo = 0, hi = mission.traj.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (mission.traj[m][0] <= jd) lo = m; else hi = m; }
  trajBright.geometry.instanceCount = Math.max(1, Math.min(nSeg, lo));
  for (const o of missionGroup.children) if (o.isSprite && o.userData.kind === 'event') o.scale.setScalar(0.05 * k);
  $('date').textContent = fmt(jd);
  $('met').textContent = `T+${Math.round(jd - t0)} d  ·  ${((jd - t0) / 365.25).toFixed(2)} yr  ·  arrival ${fmt(t1)}`;
  $('fill').style.width = $('knob').style.left = (t * 100) + '%';
}

// ---------- input ----------
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); ray.params.Points = { threshold: .02 };
function pick(ev) {
  mouse.set(ev.clientX / innerWidth * 2 - 1, -ev.clientY / innerHeight * 2 + 1); ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(hoverables, false); return hits.length ? hits[0].object : null;
}
canvas.addEventListener('pointermove', ev => {
  const o = pick(ev), tip = $('tip');
  if (!o) { tip.style.opacity = 0; canvas.style.cursor = ''; return; }
  canvas.style.cursor = 'pointer';
  const info = o.userData.kind === 'planet' ? { title: cap(o.userData.name), body: `Radius ${RADIUS[o.userData.name].toLocaleString()} km · click to focus` }
    : { title: `${o.userData.e.date} · ${o.userData.e.type}`, body: o.userData.e.label };
  tip.innerHTML = `<b>${info.title}</b><br>${info.body}`; tip.style.opacity = 1;
  tip.style.left = Math.min(ev.clientX + 14, innerWidth - 270) + 'px'; tip.style.top = ev.clientY + 14 + 'px';
});
canvas.addEventListener('click', ev => {
  const o = pick(ev); if (!o) return;
  if (o.userData.kind === 'planet') focusPlanet(o.userData.name);
  else { const [t0, t1] = span(); setT((o.userData.e.jd - t0) / (t1 - t0)); focus = null; flyTo(o.position, 1); }
});
canvas.addEventListener('dblclick', () => { focus = null; const r = Math.max(...mission.traj.map(p => Math.hypot(p[1], p[2], p[3]))); flyTo(new THREE.Vector3(), r * 2.3); });
controls.addEventListener('start', () => { tween = null; });
function togglePlay(force) { playing = force ?? !playing; if (t >= 1 && playing) t = 0; $('play').textContent = playing ? '❚❚' : '▶'; }
$('play').onclick = () => togglePlay();
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); togglePlay(); } });
const track = $('track');
function scrub(ev) { const r = track.getBoundingClientRect(); setT((ev.clientX - r.left) / r.width); }
track.addEventListener('pointerdown', ev => { scrub(ev); track.setPointerCapture(ev.pointerId); track.onpointermove = scrub; });
track.addEventListener('pointerup', () => { track.onpointermove = null; });
$('collapse').onclick = () => { $('panel').classList.toggle('min'); $('collapse').textContent = $('panel').classList.contains('min') ? '⌃' : '⌄'; };

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (playing && mission) { const [t0, t1] = span(); setT(t + dt * +$('speed').value / (t1 - t0)); if (t >= 1) togglePlay(false); }
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 1.1); const e = ease(tween.t);
    controls.target.lerpVectors(tween.fromT, tween.toT, e); camera.position.lerpVectors(tween.fromP, tween.toP, e);
    if (focus) { const fp = planets[focus].mesh.position; controls.target.copy(fp); }
    if (tween.t >= 1) tween = null;
  }
  updateWorld(); controls.update(); scene.userData.sky.position.copy(camera.position);
  composer.render(); layoutLabels();
}
renderer.setAnimationLoop(frame);

// ---------- boot ----------
const NAMES = { 'galileo_veega_1989.json': 'Galileo 1989 (validation)' };
async function boot() {
  resize();
  const idx = await (await fetch('missions/index.json')).json();
  const sorted = idx.sort((a, b) => (ORDER.indexOf(a.replace('.json', '')) + 1 || 99) - (ORDER.indexOf(b.replace('.json', '')) + 1 || 99));
  $('targets').innerHTML = sorted.map(f => `<button class="chip" data-f="${f}">${NAMES[f] || cap(f.replace('.json', ''))}</button>`).join('');
  document.querySelectorAll('.chip').forEach(c => c.onclick = () => loadFile(c.dataset.f));
  const q = new URLSearchParams(location.search);
  const f = q.get('file') || (sorted.includes('jupiter.json') ? 'jupiter.json' : sorted[0]);
  await loadFile(f, +(q.get('m') || 0));
  if (q.get('t')) setT(+q.get('t'));
  if (q.get('focus')) focusPlanet(q.get('focus'));
  if (q.get('play')) togglePlay(true);
  if (innerWidth < 760 && q.get('panel') === 'min') $('collapse').click();
  if (q.get('still')) { // headless capture: settle camera, then render a single frame
    renderer.setAnimationLoop(null); if (tween) { tween.t = 1; }
    for (let k = 0; k < 3; k++) frame(performance.now());
    window.stillDone = true;
  }
}
window.viewerReady = boot().then(() => true);
