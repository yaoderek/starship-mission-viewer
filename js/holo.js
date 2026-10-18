// Holographic vehicle viewer: procedural models of every vehicle in the catalogue,
// drawn as a monochrome hologram (fresnel rim glow, scanlines, edge lines, flicker).
import * as THREE from 'three';
import { buildStarship, DIM, ASCENT } from './starship.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { buildRocket } from './rockets.js';
const ROCKETS = new Set(['titan3e', 'titan4b', 'atlas541']);
const ROCKET_NAME = { titan3e: 'TITAN IIIE / CENTAUR', titan4b: 'TITAN IVB / CENTAUR', atlas541: 'ATLAS V 541' };

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ hologram material
function holoMat(u, int = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { ...u, uInt: { value: int } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vY = wp.y; vN = normalize(mat3(modelMatrix) * normal);
      vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uTime; uniform float uFlick; uniform float uInt; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        float f = pow(1. - abs(dot(normalize(vN), vV)), 2.2);
        float scan = .55 + .45 * smoothstep(.35, .5, abs(fract(vY * 38. - uTime * .6) - .5));
        float band = .85 + .5 * smoothstep(.97, 1., sin(vY * 2.2 - uTime * 1.7));
        float a = (.09 + f * .85) * scan * band * uFlick * uInt;
        gl_FragColor = vec4(uCol * a, a);
      }`,
  });
}

// ------------------------------------------------------------------ geometry helpers
// Every builder works in metres along +Y (nose up) and returns { group, engine, length }.
function kit(mat, edgeMat) {
  const g = new THREE.Group();
  const add = (geo, pos, rot) => {
    const m = new THREE.Mesh(geo, mat); if (pos) m.position.copy(pos); if (rot) m.rotation.set(...rot); g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat); e.position.copy(m.position); e.rotation.copy(m.rotation); g.add(e);
    return m;
  };
  const cyl = (r, h, y, seg = 32, r2 = r) => add(new THREE.CylinderGeometry(r2, r, h, seg, 1, true), V3(0, y + h / 2, 0));
  const cylAt = (r, h, x, y, z, seg = 16) => add(new THREE.CylinderGeometry(r, r, h, seg, 1, true), V3(x, y + h / 2, z));
  const cone = (r, h, y, seg = 32) => add(new THREE.ConeGeometry(r, h, seg, 1, true), V3(0, y + h / 2, 0));
  const bell = (r, h, x, y, z, seg = 20) => add(new THREE.CylinderGeometry(r * 0.35, r, h, seg, 1, true), V3(x, y - h / 2, z));
  const sphere = (r, x, y, z, seg = 20) => add(new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1)), V3(x, y, z));
  const box = (w, h, d, x, y, z, rot) => add(new THREE.BoxGeometry(w, h, d), V3(x, y, z), rot);
  const disk = (r, y, seg = 48, r0 = 0) => add(new THREE.RingGeometry(r0, r, seg, 1), V3(0, y, 0), [Math.PI / 2, 0, 0]);
  const torus = (R, r, y, seg = 48) => add(new THREE.TorusGeometry(R, r, 6, seg), V3(0, y, 0), [Math.PI / 2, 0, 0]);
  const lathe = (pts, y = 0, seg = 40) => add(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg), V3(0, y, 0));
  const line = (pts) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), edgeMat); g.add(l); return l; };
  const truss = (x, z, y0, y1, w) => { for (const [dx, dz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) line([V3(x + dx * w, y0, z + dz * w), V3(x + dx * w, y1, z + dz * w)]);
    const n = Math.max(2, Math.round((y1 - y0) / (w * 3))); for (let k = 0; k < n; k++) { const a = y0 + (y1 - y0) * k / n, b = y0 + (y1 - y0) * (k + 1) / n; line([V3(x + w, a, z + w), V3(x - w, b, z + w)]); line([V3(x + w, a, z - w), V3(x - w, b, z - w)]); } };
  return { g, add, cyl, cylAt, cone, bell, sphere, box, disk, torus, lathe, line, truss };
}

const BUILD = {
  starship(k) {   // SpaceX Starship upper stage, 50 m x 9 m
    k.cyl(4.5, 33, 0, 48);
    k.lathe([[4.5, 0], [4.45, 4], [4.2, 8], [3.6, 11.5], [2.6, 14.5], [1.2, 16.6], [0, 17]], 33, 48);
    k.box(0.4, 7, 3.2, 5.4, 39, 0, [0, 0, -0.12]); k.box(0.4, 7, 3.2, -5.4, 39, 0, [0, 0, 0.12]);
    k.box(0.4, 9, 4.2, 5.7, 5, 0); k.box(0.4, 9, 4.2, -5.7, 5, 0);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; k.bell(0.65, 1.8, Math.cos(a) * 1.1, 0.2, Math.sin(a) * 1.1); }
    for (let i = 0; i < 3; i++) { const a = (i / 3 + 1 / 6) * Math.PI * 2; k.bell(1.15, 2.6, Math.cos(a) * 3, 0.2, Math.sin(a) * 3); }
    for (const y of [8.5, 17, 25.5]) { const pts = []; for (let i = 0; i <= 64; i++) { const t = i / 64 * Math.PI * 2; pts.push(V3(Math.cos(t) * 4.52, y, Math.sin(t) * 4.52)); } k.line(pts); }
    return { engine: { y: -2.4, r: 3.6 }, length: 50 };
  },
  ntr(k) {        // NASA DRA 5.0 nuclear thermal crew ship (lengths approximate)
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; k.bell(0.9, 2.6, Math.cos(a) * 1.8, 1.5, Math.sin(a) * 1.8); }
    k.cyl(1.2, 3, 1.5, 16); k.cyl(4.2, 18, 4.5, 40); k.sphere(4.2, 0, 4.5, 0, 28); k.sphere(4.2, 0, 22.5, 0, 28);
    k.truss(0, 0, 26.7, 52, 1.6); k.cyl(4.2, 14, 32, 40);                         // in-line tank on the truss
    k.cyl(3.5, 9, 53, 32); k.disk(3.5, 53); k.cone(2.6, 4, 62, 24);                // transit habitat + Orion capsule
    k.box(14, 0.08, 4, 11, 57, 0); k.box(14, 0.08, 4, -11, 57, 0);                 // solar arrays
    return { engine: { y: -1.1, r: 2.8 }, length: 66 };
  },
  hailmary(k) {   // Project Hail Mary: crew modules forward, Astrophage bays, spin-drive array aft (book gives no dimensions)
    k.lathe([[2.4, 0], [2.3, 2], [1.6, 4], [0, 5]], 30, 32);
    k.cyl(2.4, 4, 26, 32); k.cyl(2.6, 4, 22, 32); k.cyl(2.4, 3, 19, 32);             // control room, lab, dormitory
    k.cyl(4.2, 13, 5, 6);                                                             // hexagonal fuel bay section
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; k.box(0.06, 12, 3.2, Math.cos(a) * 3.65, 11.5, Math.sin(a) * 3.65, [0, -a, 0]); }
    k.cyl(4.6, 2, 3, 6); k.cyl(4.6, 1, 18, 6);
    for (let i = 0; i < 19; i++) { const ring = i === 0 ? 0 : i < 7 ? 1.4 : 2.8, n = i === 0 ? 1 : i < 7 ? 6 : 12, j = i === 0 ? 0 : i < 7 ? i - 1 : i - 7, a = j / n * Math.PI * 2;
      k.cylAt(0.55, 2.2, Math.cos(a) * ring, 0.8, Math.sin(a) * ring, 6); }  // spin drives
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; k.box(0.9, 1.6, 0.9, Math.cos(a) * 3.2, 24, Math.sin(a) * 3.2); }   // beetle probes
    return { engine: { y: 0.6, r: 3.6 }, length: null };
  },
  daedalus(k) {   // Project Daedalus, two-stage, ~190 m tall
    k.lathe([[0, 0], [20, 4], [34, 14], [42, 30], [44, 44]], 0, 40); k.torus(44, 0.6, 44, 64);         // stage 1 reaction chamber + nozzle
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.sphere(17, Math.cos(a) * 34, 66, Math.sin(a) * 34, 18); }
    k.cyl(8, 40, 44, 24);
    k.lathe([[0, 0], [8, 2], [14, 7], [17, 14], [18, 20]], 88, 32); k.torus(18, 0.4, 108, 48);           // stage 2
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; k.sphere(9, Math.cos(a) * 16, 122, Math.sin(a) * 16, 16); }
    k.cyl(5, 46, 108, 20); k.cyl(10, 14, 154, 24); k.disk(16, 182, 48); k.cyl(16, 1, 181.5, 48);         // payload bay + beryllium shield
    k.truss(0, 0, 168, 181, 2.5);
    return { engine: { y: -2, r: 30 }, length: 190 };
  },
  icarus(k) {     // Icarus Firefly: Z-pinch engine, long spine, big radiators
    for (let i = 0; i < 5; i++) k.torus(5.5 - i * 0.6, 0.35, 1 + i * 1.8, 40);
    k.cyl(3, 6, 10, 24); k.truss(0, 0, 16, 92, 2.2);
    k.cyl(6, 26, 30, 36); k.sphere(6, 0, 30, 0, 24); k.sphere(6, 0, 56, 0, 24);
    k.box(0.1, 46, 26, 14, 72, 0); k.box(0.1, 46, 26, -14, 72, 0);
    k.cyl(3.5, 6, 92, 24); k.disk(7, 98.2, 40); k.cyl(7, 0.6, 98, 40);
    return { engine: { y: 0, r: 4.5 }, length: 99 };
  },
  longshot(k) {   // Project Longshot: fusion orbiter for Alpha Centauri B
    for (let i = 0; i < 3; i++) k.torus(4.5 - i * 0.8, 0.3, 1 + i * 1.6, 36);
    k.cyl(3, 8, 5, 24);
    for (let i = 0; i < 3; i++) k.sphere(4.6, 0, 18 + i * 9.5, 0, 22);
    k.truss(0, 0, 12, 46, 1.4);
    k.cyl(2.4, 8, 46, 20); k.lathe([[0, 0], [3, 0.8], [4.5, 2.2]], 54, 32);
    return { engine: { y: 0, r: 3.5 }, length: 60 };
  },
  orion(k) {      // Dyson-style Orion: pusher plate, shock absorbers, pulse-unit magazine
    k.lathe([[0, 0], [10, 0.8], [20, 2.2], [21, 2.6]], 0, 64); k.disk(21, 0.02, 64);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.cylAt(0.9, 9, Math.cos(a) * 7, 3, Math.sin(a) * 7, 10); }
    k.cyl(9, 2, 12, 32); for (let i = 0; i < 4; i++) k.cyl(7.5, 6, 14 + i * 6.5, 12);   // magazine stacks
    k.cyl(8, 14, 40, 32); k.lathe([[8, 0], [6, 5], [0, 9]], 54, 32);
    return { engine: { y: -1.5, r: 18 }, length: 63 };
  },
  antimatter(k) { // beamed-core antimatter rocket: magnetic nozzle, trap, radiators
    for (let i = 0; i < 6; i++) k.torus(6 - i * 0.7, 0.25, 1 + i * 1.4, 40);
    k.sphere(3.4, 0, 13, 0, 22); k.torus(4.2, 0.35, 13, 40);
    k.truss(0, 0, 16, 60, 1.5); k.cyl(4, 16, 22, 30); k.sphere(4, 0, 22, 0, 20); k.sphere(4, 0, 38, 0, 20);
    k.box(0.1, 24, 14, 9, 50, 0); k.box(0.1, 24, 14, -9, 50, 0);
    k.cyl(2.5, 5, 60, 20); k.disk(5, 65.2, 32);
    return { engine: { y: 0, r: 5 }, length: 66 };
  },
  starshot(k) {   // Breakthrough Starshot: 4 m light sail and gram-scale chip
    k.disk(2, 0, 64); k.torus(2, 0.015, 0, 64);
    for (let r = 0.5; r < 2; r += 0.5) k.torus(r, 0.006, 0, 48);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.line([V3(Math.cos(a) * 2, 0, Math.sin(a) * 2), V3(0, 0.9, 0)]); }
    k.box(0.12, 0.02, 0.12, 0, 0.9, 0);
    return { engine: null, length: 4 };
  },
  bussard(k) {    // Bussard ramjet: magnetic scoop field far ahead of a fusion ship
    k.bell(3.5, 5, 0, 1, 0, 32); k.cyl(3, 22, 1, 28); k.sphere(4.5, 0, 26, 0, 22); k.truss(0, 0, 30, 46, 1.2);
    for (let i = 0; i < 7; i++) { const y = 46 + i * 5, r = 2 + i * 4.2; k.torus(r, 0.12, y, 48); }
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.line([V3(Math.cos(a) * 2, 46, Math.sin(a) * 2), V3(Math.cos(a) * 27, 76, Math.sin(a) * 27)]); }
    return { engine: { y: -4, r: 3 }, length: null };
  },
  voyager(k) {    // Voyager: 3.7 m high-gain antenna, 10-sided bus, booms
    k.lathe([[0, 0], [0.9, 0.12], [1.85, 0.48]], 1.2, 40); k.line([V3(0, 1.2, 0), V3(0, 2.2, 0)]);
    k.cyl(0.9, 0.5, 0.6, 10); k.disk(0.9, 1.1, 10);
    k.box(0.12, 0.12, 6, 0, 0.8, 3.5); for (let i = 0; i < 3; i++) k.add(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 12, 1, true), V3(0, 0.8, 4.3 + i * 0.7), [Math.PI / 2, 0, 0]);   // RTG boom
    k.box(0.1, 0.1, 2.5, 0, 0.8, -2.1); k.box(0.6, 0.5, 0.5, 0, 0.8, -3.4);           // science boom + scan platform
    k.line([V3(0, 0.85, 0), V3(-6, 0.85, 0)]);                                        // magnetometer boom (13 m, drawn short)
    return { engine: null, length: 3.7, lengthLabel: 'DISH 3.7 m' };
  },
};
BUILD['starship-lite'] = BUILD['starship-heavy'] = BUILD.starship;

const STARSHIP = new Set(['starship', 'starship-lite', 'starship-heavy']);

// ------------------------------------------------------------------ viewer
export class Holo {
  constructor(canvas, host, opts = {}) {
    this.canvas = canvas; this.host = host; this.opts = opts; this.id = null; this.thrust = 0; this.visible = true;
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
    this.u = { uCol: { value: new THREE.Color(opts.color || '#e9eef0') }, uTime: { value: 0 }, uFlick: { value: 1 } };
    this.mat = holoMat(this.u);
    this.edge = new THREE.LineBasicMaterial({ color: opts.color || '#e9eef0', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    this.turn = new THREE.Group(); this.scene.add(this.turn);
    // projector base: concentric rings and a soft beam
    const base = new THREE.Group(); this.base = base; this.scene.add(base);
    const ringMat = new THREE.LineBasicMaterial({ color: opts.color || '#e9eef0', transparent: true, opacity: 0.18 });
    for (const rr of [0.55, 0.85, 1.15]) { const pts = []; for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; pts.push(V3(Math.cos(a) * rr, 0, Math.sin(a) * rr)); } base.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat)); }
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; base.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1), V3(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2)]), ringMat)); }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.15, 0.9, 48, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: this.u, vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform vec3 uCol; varying float vY; void main(){ float a = .05 * (1. - vY); gl_FragColor = vec4(uCol * a, a); }' }));
    beam.position.y = 0.45; base.add(beam);
    // engine plume
    this.plume = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { ...this.u, uThr: { value: 0 } }, vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform vec3 uCol; uniform float uThr; uniform float uTime; varying float vY; void main(){ float a = uThr * pow(1. - vY, 2.2) * (.38 + .1 * sin(uTime * 40. + vY * 20.)); gl_FragColor = vec4(uCol * a, a); }' }));
    this.plume.rotation.x = Math.PI;
    this.label = opts.label || null;
    // drag to orbit, scroll to zoom, right-drag to pan, double-click to reset; the idle sweep pauses while you handle it
    const ctl = this.ctl = new OrbitControls(this.cam, canvas);
    Object.assign(ctl, { enableDamping: true, dampingFactor: 0.08, minDistance: 0.5, maxDistance: 14, rotateSpeed: 0.8, zoomSpeed: 1.1 });
    ctl.target.set(0, 0.55, 0); this.sweep = 0; this.idle = 99;
    ctl.addEventListener('start', () => { this.manual = true; this.idle = 0; canvas.style.cursor = 'grabbing'; });
    ctl.addEventListener('end', () => { this.idle = 0; canvas.style.cursor = 'grab'; });
    canvas.style.cursor = 'grab'; canvas.style.touchAction = 'none';
    canvas.addEventListener('dblclick', () => { this.manual = false; this.fit(true); });
    new ResizeObserver(() => this.fit()).observe(host); this.fit(true);
  }
  fit(reset) {
    const b = this.host.getBoundingClientRect(); this.w = Math.max(1, b.width); this.h = Math.max(1, b.height);
    this.r.setSize(this.w, this.h, false); this.cam.aspect = this.w / this.h;
    const vf = THREE.MathUtils.degToRad(this.cam.fov) / 2, hf = Math.atan(Math.tan(vf) * this.cam.aspect), d = Math.max(1.5 / Math.tan(hf), 0.62 / Math.tan(vf));
    if (reset || !this.manual) { this.cam.position.set(0, 0.55 + d * 0.3, d * 0.95); if (this.ctl) this.ctl.target.set(0, 0.55, 0); this.cam.lookAt(0, 0.55, 0); }
    this.cam.updateProjectionMatrix();
  }
  show(id, mode = 'ship') {
    if (id === this.id && mode === this.mode) return; this.id = id; this.mode = mode;
    this.turn.clear(); this.rig = null; this.rocket = null; this.asc = null;
    if (STARSHIP.has(id)) return this.showStarship(mode);
    if (ROCKETS.has(id)) return this.showRocket(id);
    const k = kit(this.mat, this.edge), info = (BUILD[id] || BUILD.starship)(k) || {}; this.place(k.g, info, id);
  }

  // ---------------------------------------------------------------- Starship V3 stack
  showStarship(mode) {
    if (!this.smats) this.showStarshipMats();
    const rig = this.rig = buildStarship(this.smats);
    // plumes on every engine, each with its own throttle uniform
    const plumeGeo = new THREE.CylinderGeometry(1, 1.25, 1, 20, 1, true); plumeGeo.translate(0, -0.5, 0);
    const mkPlume = (eng, vac) => {
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { ...this.u, uThr: { value: 0 } }, vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: 'uniform vec3 uCol; uniform float uThr; uniform float uTime; varying float vY; void main(){ float a = uThr * pow(vY, 1.8) * (.5 + .12 * sin(uTime * 47. + vY * 31.)); gl_FragColor = vec4(uCol * a, a); }' });
      const p = new THREE.Mesh(plumeGeo, m);
      p.position.copy(eng.pos); p.scale.set(eng.r * 0.95, vac ? 9 : 14, eng.r * 0.95); p.visible = false; parent.add(p); eng.plume = p;
    };
    let parent = rig.booster; rig.boosterEngines.forEach(e => mkPlume(e, false));
    parent = rig.ship; rig.shipEngines.forEach(e => mkPlume(e, e.vac));
    // stack lies on its side, nose to the right; `focus` slides so the framed part stays centred
    const holder = new THREE.Group(), focus = new THREE.Group(); holder.rotation.z = -Math.PI / 2; holder.position.y = 0.62;
    focus.add(rig.root); holder.add(focus); this.turn.add(holder);
    this.holder = holder; this.focus = focus; this.flick = 0.15;
    this.info = { engine: true, length: mode === 'stack' ? DIM.stackH : DIM.shipH };
    this.setStage(mode === 'stack' ? { frame: 0, booster: true } : { frame: 1, booster: false });
    if (this.label) this.label.textContent = mode === 'stack' ? `STACK ${DIM.stackH} m · SHIP ${DIM.shipH} m · BOOSTER ${DIM.boosterH} m` : `SHIP ${DIM.shipH} m · V3`;
  }
  // frame 0 = whole stack, 1 = ship only; gap/flip move the booster after separation
  setStage({ frame = 1, booster = false, gap = 0, flip = 0, bThr = null, sThr = null, entry = 0 }) {
    const rig = this.rig; if (!rig) return;
    const k = frame * frame * (3 - 2 * frame);
    const len = DIM.stackH + (DIM.shipH - DIM.stackH) * k, cy = DIM.stackH / 2 + (DIM.boosterH + DIM.shipH / 2 - DIM.stackH / 2) * k;
    this.holder.scale.setScalar(2.2 / len); this.focus.position.y = -cy;
    rig.booster.visible = booster; rig.booster.position.y = -gap;
    rig.booster.rotation.x = flip * Math.PI; rig.booster.position.z = 0;
    if (flip) { const h = DIM.boosterH / 2, a = flip * Math.PI; rig.booster.position.y = -gap + h * (1 - Math.cos(a)); rig.booster.position.z = -h * Math.sin(a); }   // rotate about its middle
    const thr = (e, v) => { e.plume.material.uniforms.uThr.value = v; e.plume.visible = v > 0.01; };
    rig.boosterEngines.forEach(e => thr(e, booster && bThr ? bThr(e.ring) : 0));
    rig.shipEngines.forEach(e => thr(e, sThr == null ? 0 : sThr * (e.vac ? 0.8 : 1)));
    for (const [key, f] of Object.entries(rig.flaps)) f.rotation.y = entry * (key.startsWith('fwd') ? 0.35 : 0.5) * (key.endsWith('L') ? 1 : -1);
    this.smats.shield.uniforms.uInt.value = 1.35 + 2.2 * entry;
  }
  // ---------------------------------------------------------------- historical launchers
  showRocket(id) {
    if (!this.smats) this.showStarshipMats();
    const R = this.rocket = buildRocket(id, this.smats);
    const plumeGeo = new THREE.CylinderGeometry(1, 1.25, 1, 20, 1, true); plumeGeo.translate(0, -0.5, 0);
    const mk = (eng, grp, len) => {
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { ...this.u, uThr: { value: 0 } }, vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: 'uniform vec3 uCol; uniform float uThr; uniform float uTime; varying float vY; void main(){ float a = uThr * pow(vY, 1.8) * (.5 + .12 * sin(uTime * 47. + vY * 31.)); gl_FragColor = vec4(uCol * a, a); }' });
      const p = new THREE.Mesh(plumeGeo, m); p.position.copy(eng.pos); p.scale.set(eng.r * 0.95, len, eng.r * 0.95); p.visible = false; grp.add(p); eng.plume = p;
    };
    R.engines.boosters.forEach(e => mk(e, e.grp, 16)); R.engines.core.forEach(e => mk(e, R.core, 14)); R.engines.upper.forEach(e => mk(e, R.upper, 8)); R.engines.centaur.forEach(e => mk(e, R.centaur, 9));
    R.boosters.forEach(b => b.userData.base = b.position.clone());
    const holder = new THREE.Group(), focus = new THREE.Group(); holder.rotation.z = -Math.PI / 2; holder.position.y = 0.62;
    focus.add(R.root); holder.add(focus); this.turn.add(holder); this.holder = holder; this.focus = focus; this.flick = 0.15;
    this.info = { engine: true, length: R.height };
    this.setRocket(-1);
    if (this.label) this.label.textContent = `H ${R.height} m`;
  }
  // pose the launcher at flight time T (seconds); T < 0 = on the pad
  setRocket(T) {
    const R = this.rocket, tm = R.timing, on = (e, v) => { e.plume.material.uniforms.uThr.value = v; e.plume.visible = v > 0.01; };
    const after = t0 => Math.max(0, T - t0);
    R.engines.boosters.forEach(e => on(e, T >= 0 && T < tm.boosterOff ? 1 : 0));
    R.engines.core.forEach(e => on(e, T >= tm.coreOn && T < tm.coreSep ? 1 : 0));
    R.engines.upper.forEach(e => on(e, T >= tm.coreSep + 2 && T < tm.centaur ? 1 : 0));
    R.engines.centaur.forEach(e => on(e, T >= tm.centaur + 3 && T < Math.min(tm.payloadSep - 15, tm.centaur + 360) ? 1 : 0));
    const sb = after(tm.boosterSep);                     // solids peel away outward and fall back
    R.boosters.forEach(b => { const o = b.userData.base, d = Math.hypot(o.x, o.z) || 1, out = 0.012 * sb * sb + 0.25 * sb, tilt = Math.min(0.9, sb * 0.02);
      b.position.set(o.x + o.x / d * out, -0.08 * sb * sb, o.z + o.z / d * out); b.rotation.set(o.z / d * tilt, 0, -o.x / d * tilt); b.visible = sb < 90; });
    const sf = after(tm.fairing);                        // clamshell halves split sideways
    R.fairing.forEach((f, i) => { const sg = i ? 1 : -1; f.position.set(0, -0.02 * sf * sf, sg * (0.1 * sf + 0.01 * sf * sf)); f.rotation.set(sg * Math.min(0.7, sf * 0.02), 0, 0); f.visible = sf < 70; });
    const sc = after(tm.coreSep);                        // spent core drops away
    R.core.position.y = -(0.05 * sc * sc + 0.4 * sc); R.core.visible = sc < 120;
    const s2 = after(tm.centaur);                        // Titan stage 2 drops after Centaur takes over
    R.upper.position.y = -(0.05 * s2 * s2 + 0.4 * s2); R.upper.visible = s2 < 120;
    const sp = after(tm.payloadSep);                     // spacecraft separation
    R.centaur.position.y = -(0.01 * sp * sp + 0.2 * sp); R.centaur.visible = sp < 200;
    const k0 = Math.max(0, Math.min(1, (T - tm.coreSep) / 70)), k = k0 * k0 * (3 - 2 * k0);
    const len = R.height + ((R.focusTop - R.focusBottom + 4) - R.height) * k, cy = R.height / 2 + ((R.focusTop + R.focusBottom) / 2 - R.height / 2) * k;
    this.holder.scale.setScalar(2.2 / len); this.focus.position.y = -cy;
  }
  stepRocket(dt) {
    const A = this.asc, R = this.rocket, tm = R.timing; A.tau += dt;
    const K = [[0, 0], [5, tm.boosterSep - 15], [9, tm.boosterSep + 25], [13, tm.coreSep + 30], [18, tm.centaur + 60], [21, tm.payloadSep - 10], [25, tm.end]];
    let T = tm.end; for (let i = 0; i < K.length - 1; i++) if (A.tau <= K[i + 1][0]) { const f = (A.tau - K[i][0]) / (K[i + 1][0] - K[i][0]); T = K[i][1] + f * (K[i + 1][1] - K[i][1]); break; }
    this.setRocket(T);
    const ev = [...R.seq].reverse().find(e => T >= e.t), mm = Math.floor(T / 60), ss = Math.floor(T % 60);
    if (this.seqEl) this.seqEl.textContent = `T+${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')} ${ev ? ev.label : ''}`;
    if (A.tau > 25.5) { this.asc = null; if (this.seqEl) this.seqEl.textContent = ''; A.onDone && A.onDone(); }
  }
  showStarshipMats() {
    const c = this.opts.color || '#e9eef0', lm = o => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    this.smats = { hull: holoMat(this.u, 1.25), shield: holoMat(this.u, 1.45), inner: holoMat(this.u, 0.28), engine: holoMat(this.u, 1.1), edge: lm(0.5), faint: lm(0.11), tile: lm(0.055) };
    this.slines = [[this.smats.edge, 0.5], [this.smats.faint, 0.11], [this.smats.tile, 0.055]];
  }
  // scripted ascent: real seconds -> flight seconds, piecewise so staging plays in slow motion
  startAscent(onDone, tankers = 0) { if (!this.rig && !this.rocket) return false; this.asc = { tau: 0, onDone, tankers }; this.visible = true; return true; }
  ascActive() { return !!this.asc; }
  stepAscent(dt) {
    const A = this.asc; A.tau += dt;
    const K = [[0, 0], [6, 159], [10, 168], [17, 240], [22, 520]], tau = A.tau;
    let T = 520; for (let i = 0; i < K.length - 1; i++) if (tau <= K[i + 1][0]) { const f = (tau - K[i][0]) / (K[i + 1][0] - K[i][0]); T = K[i][1] + f * (K[i + 1][1] - K[i][1]); break; }
    const sep = Math.max(0, T - 165), gap = sep > 0 ? Math.min(400, 0.025 * sep * sep + 0.55 * sep) : 0;
    const flip = T < 170 ? 0 : Math.min(1, (T - 170) / 18);
    const bThr = r => T < 159 ? 1 : T < 166 ? (r === 'centre' ? 1 : 0) : (T > 182 && T < 225 && r !== 'outer') ? 0.9 : 0;
    const sThr = T >= 161 && T < 520 ? 1 : 0;
    this.setStage({ frame: Math.max(0, Math.min(1, (T - 200) / 70)), booster: T < 330, gap, flip, bThr, sThr });
    const ev = [...ASCENT].reverse().find(e => T >= e.t);
    const mm = Math.floor(T / 60), ss = Math.floor(T % 60);
    let txt = `T+${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')} ${ev ? ev.label : ''}`;
    if (tau > 22) { const n = A.tankers, k = n ? Math.min(n, Math.floor((tau - 22) / 4 * n) + 1) : 0; txt = n ? `ORBIT · PROPELLANT TRANSFER ${k}/${n} REFUEL MISSION${n === 1 ? '' : 'S'}` : 'ORBIT · PROPELLANT LOADED'; }
    if (this.seqEl) this.seqEl.textContent = txt;
    if (tau > 26.5) { this.asc = null; if (this.seqEl) this.seqEl.textContent = ''; this.setStage({ frame: 1, booster: false }); A.onDone && A.onDone(); }
  }
  place(g, info, id) {
    const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const L = Math.max(size.x, size.y, size.z), s = 2.2 / L;
    // lay the vehicle on its side, nose to the right, sitting above the projector
    const holder = new THREE.Group(); g.position.sub(c); holder.add(g);
    if (size.y >= Math.max(size.x, size.z) * 0.9 && id !== 'starshot') holder.rotation.z = -Math.PI / 2;
    if (id === 'starshot') holder.rotation.x = 0.9;
    holder.scale.setScalar(s); holder.position.y = 0.62;
    if (info.engine) { const pl = Math.min(info.engine.r * 4, L * 0.4); this.plume.scale.set(info.engine.r * 0.8, pl, info.engine.r * 0.8); this.plume.position.set(0, info.engine.y - pl / 2, 0); g.add(this.plume); }
    this.turn.add(holder);
    this.info = info; this.flick = 0.15;            // brief power-up flicker on change
    if (this.label) this.label.textContent = info.lengthLabel || (info.length ? `L ${info.length} m` : 'NOT TO SCALE');
    this.onInfo && this.onInfo(info);
  }
  setThrust(x) { this.thrust = x; }
  setEntry(x) { this.entry = x; }
  render(dt) {
    if (!this.visible || !this.id) return;
    this.u.uTime.value += dt; this.idle += dt;
    if (this.idle > 6) this.sweep += dt;                                         // idle: sweep around a three-quarter view
    this.turn.rotation.y = 0.45 + 0.55 * Math.sin(this.sweep * 0.3);
    this.ctl.update();
    this.flick = Math.min(1, this.flick + dt * 1.8);
    const glitch = Math.random() < 0.012 ? 0.45 : 1;
    this.u.uFlick.value = this.flick * glitch * (0.93 + 0.07 * Math.sin(this.u.uTime.value * 13));
    this.edge.opacity = 0.45 * this.u.uFlick.value;
    if (this.rocket) { for (const [m, o] of this.slines) m.opacity = o * this.u.uFlick.value; if (this.asc) this.stepRocket(dt); }
    else if (this.rig) {
      for (const [m, o] of this.slines) m.opacity = o * this.u.uFlick.value;
      if (this.asc) this.stepAscent(dt);
      else if (this.mode === 'ship') { this.thrS = (this.thrS || 0) + (this.thrust - (this.thrS || 0)) * Math.min(1, dt * 4); this.setStage({ frame: 1, booster: false, sThr: this.thrS, entry: this.entry || 0 }); }
    } else this.plume.material.uniforms.uThr.value += ((this.info?.engine ? this.thrust : 0) - this.plume.material.uniforms.uThr.value) * Math.min(1, dt * 4);
    this.r.render(this.scene, this.cam);
  }
}
