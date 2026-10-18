// Historical launch vehicles for the hologram viewer, built with separable stages.
// Heights: Titan IIIE/Centaur 48.8 m (Wikipedia), Titan IVB/Centaur 55.8 m as flown for Cassini (ESA),
// Atlas V 541 58.3 m (Wikipedia). Diameters: Titan core 3.05 m, UA1205 SRM 3.05 m, SRMU 3.2 m,
// Titan IV fairing 5.1 m, Atlas CCB 3.81 m, AJ-60A 1.6 m x 17 m, Atlas 5-m fairing 5.4 m, Centaur 3.05/4.3 m.
// Model units: metres, +Y up the stack.
import * as THREE from 'three';
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildRocket(id, mats) {
  const edge = g => new THREE.LineSegments(new THREE.EdgesGeometry(g, 28), mats.edge);
  const part = () => new THREE.Group();
  const cyl = (grp, r, y0, y1, mat = mats.hull, seg = 40, r2 = r) => { const g = new THREE.CylinderGeometry(r2, r, y1 - y0, seg, 1, true); const m = new THREE.Mesh(g, mat); m.position.y = (y0 + y1) / 2; grp.add(m); const e = edge(g); e.position.copy(m.position); grp.add(e); };
  const ogive = (grp, r, y0, len, mat = mats.hull) => { const p = []; for (let i = 0; i <= 18; i++) { const s = i / 18; p.push(new THREE.Vector2(r * Math.sqrt(Math.max(0, 1 - s * s)) * (1 - 0.15 * s) + 0.001, y0 + len * s)); } const g = new THREE.LatheGeometry(p, 40); grp.add(new THREE.Mesh(g, mat)); grp.add(edge(g)); };
  const cone = (grp, r, y0, len, mat = mats.hull) => { const g = new THREE.ConeGeometry(r, len, 32, 1, true); const m = new THREE.Mesh(g, mat); m.position.y = y0 + len / 2; grp.add(m); const e = edge(g); e.position.copy(m.position); grp.add(e); };
  const ring = (grp, r, y) => { const p = []; for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2, b = (i + 1) / 64 * Math.PI * 2; p.push(V(Math.cos(a) * r, y, Math.sin(a) * r), V(Math.cos(b) * r, y, Math.sin(b) * r)); } grp.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(p), mats.faint)); };
  const bell = (grp, r, len, x, y, z) => { const p = []; for (let i = 0; i <= 10; i++) { const s = i / 10; p.push(new THREE.Vector2(r * 0.3 + r * 0.7 * Math.pow(s, 0.7), -len * s)); } const g = new THREE.LatheGeometry(p, 20), m = new THREE.Mesh(g, mats.engine); m.position.set(x, y, z); grp.add(m); const e = edge(g); e.position.copy(m.position); grp.add(e); return { pos: V(x, y - len, z), r }; };
  const R = { boosters: [], core: part(), upper: part(), fairing: [part(), part()], payload: part(), engines: { boosters: [], core: [], upper: [] } };
  const halfShell = (grp, r, y0, y1, noseLen, side) => {    // one clamshell half of a fairing
    const a0 = side < 0 ? Math.PI / 2 : -Math.PI / 2, g1 = new THREE.CylinderGeometry(r, r, y1 - y0, 24, 1, true, a0, Math.PI);
    const m1 = new THREE.Mesh(g1, mats.hull); m1.position.y = (y0 + y1) / 2; grp.add(m1); const e1 = edge(g1); e1.position.copy(m1.position); grp.add(e1);
    const p = []; for (let i = 0; i <= 14; i++) { const s = i / 14; p.push(new THREE.Vector2(Math.max(0.001, r * Math.sqrt(1 - s * s) * (1 - 0.2 * s)), y1 + noseLen * s)); }
    const g2 = new THREE.LatheGeometry(p, 24, a0, Math.PI); grp.add(new THREE.Mesh(g2, mats.hull)); grp.add(edge(g2));
  };
  const seq = [];

  if (id === 'titan3e' || id === 'titan4b') {
    const four = id === 'titan4b', H = four ? 55.8 : 48.8, rc = 1.525, s1 = four ? 26.4 : 22.2, s2 = four ? 36.4 : 29.3;
    cyl(R.core, rc, 1.5, s1); for (let y = 4; y < s1; y += 3) ring(R.core, rc + 0.01, y);
    cyl(R.upper, rc, s1, s2); ring(R.upper, rc + 0.01, s1 + 0.3);
    R.engines.core.push(bell(R.core, 0.75, 2.2, -0.75, 1.5, 0), bell(R.core, 0.75, 2.2, 0.75, 1.5, 0));    // LR87 twin
    R.engines.upper.push(bell(R.upper, 0.55, 1.6, 0, s1 + 0.2, 0));                                         // LR91
    // upper stage: Centaur inside the shroud/fairing
    const cent = part(); cyl(cent, four ? 2.15 : 1.525, s2 + 0.5, s2 + (four ? 9.3 : 9.6), mats.hull); ring(cent, (four ? 2.15 : 1.525) + 0.01, s2 + 4); R.engines.centaur = [bell(cent, 0.45, 1.4, -0.6, s2 + 0.5, 0), bell(cent, 0.45, 1.4, 0.6, s2 + 0.5, 0)]; R.centaur = cent;
    const fr = four ? 2.54 : 2.135, fy1 = H - (four ? 5.6 : 5.2);
    halfShell(R.fairing[0], fr, s2, fy1, H - fy1, -1); halfShell(R.fairing[1], fr, s2, fy1, H - fy1, 1);
    // solid boosters
    const br = four ? 1.6 : 1.525, bx = rc + br + 0.25, bh = four ? 34.3 : 25.9;
    for (const sx of [-1, 1]) {
      const b = part(); b.position.x = sx * bx;
      cyl(b, br, -0.5, bh - 3.2); cone(b, br, bh - 3.2, 3.2); for (let y = 3; y < bh - 4; y += 3.6) ring(b, br + 0.01, y);
      R.engines.boosters.push({ ...bell(b, br * 0.75, 2.4, 0, -0.5, 0), grp: b });
      R.boosters.push(b);
    }
    // payload under the fairing
    if (four) { cyl(R.payload, 2.0, s2 + 10.5, s2 + 17.3, mats.hull, 24); const d = new THREE.Mesh(new THREE.SphereGeometry(2.0, 24, 8, 0, Math.PI * 2, 0, 0.5), mats.hull); d.position.y = s2 + 15.6; R.payload.add(d); }   // Cassini + HGA
    else { cyl(R.payload, 0.9, s2 + 11.5, s2 + 12.1, mats.hull, 10); const d = new THREE.Mesh(new THREE.SphereGeometry(1.85, 24, 6, 0, Math.PI * 2, 0, 0.6), mats.hull); d.position.y = s2 + 11.0; R.payload.add(d); }  // Voyager
    // Titan III/IV: only the solids fire at liftoff, the core air-starts just before they burn out
    const tc = four ? 130 : 112, sep = four ? 140 : 122;
    seq.push({ t: 0, label: `LIFTOFF · ${four ? 'SRMU' : 'UA1205'} SOLIDS ONLY` }, { t: tc, label: 'CORE STAGE 1 AIR-START' }, { t: sep, label: 'SOLID BOOSTER SEPARATION' },
      { t: four ? 280 : 260, label: 'STAGE 1/2 SEPARATION' }, { t: four ? 290 : 265, label: 'FAIRING JETTISON' }, { t: four ? 520 : 470, label: 'CENTAUR SEPARATION · BURN 1' }, { t: four ? 720 : 680, label: 'SPACECRAFT SEPARATION' });
    R.timing = { coreOn: tc, boosterOff: sep, boosterSep: sep, coreSep: four ? 280 : 260, fairing: four ? 290 : 265, centaur: four ? 520 : 470, payloadSep: four ? 720 : 680, end: four ? 760 : 720 };
    R.height = H;
  } else {   // Atlas V 541
    const H = 58.3, rc = 1.905;
    cyl(R.core, rc, 1.2, 32.5); for (let y = 4; y < 32; y += 3) ring(R.core, rc + 0.01, y);
    R.engines.core.push(bell(R.core, 0.75, 2.4, -0.7, 1.2, 0), bell(R.core, 0.75, 2.4, 0.7, 1.2, 0));     // RD-180 twin nozzles
    cyl(R.core, rc, 32.5, 33.6, mats.hull, 40, 2.2);                                                       // interstage flare
    const cent = part(); cyl(cent, 1.525, 34.2, 46.9, mats.hull); ring(cent, 1.535, 40); R.engines.centaur = [bell(cent, 0.6, 1.8, 0, 34.2, 0)]; R.centaur = cent;   // Centaur III, single RL10
    halfShell(R.fairing[0], 2.7, 33.6, 51.0, H - 51.0, -1); halfShell(R.fairing[1], 2.7, 33.6, 51.0, H - 51.0, 1);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2, b = part(); b.position.set(Math.cos(a) * (rc + 0.85), 0, Math.sin(a) * (rc + 0.85));
      cyl(b, 0.79, 0.2, 14.8); cone(b, 0.79, 14.8, 2.2); R.engines.boosters.push({ ...bell(b, 0.6, 1.6, 0, 0.2, 0), grp: b }); R.boosters.push(b);
    }
    // Mars 2020: cruise stage disc, aeroshell backshell and heat shield
    cyl(R.payload, 2.0, 47.6, 48.2, mats.hull, 28); cone(R.payload, 2.25, 48.2, 2.6, mats.hull);
    seq.push({ t: 0, label: 'LIFTOFF · RD-180 + 4 AJ-60A' }, { t: 95, label: 'SOLID BOOSTER JETTISON' }, { t: 205, label: 'FAIRING JETTISON' }, { t: 260, label: 'BOOSTER ENGINE CUTOFF · STAGING' },
      { t: 270, label: 'CENTAUR BURN 1' }, { t: 3340, label: 'SPACECRAFT SEPARATION' });
    R.timing = { coreOn: 0, boosterOff: 92, boosterSep: 95, coreSep: 260, fairing: 205, centaur: 270, payloadSep: 3340, end: 3380 };
    R.height = H;
  }
  R.focusTop = R.height; R.focusBottom = id === 'atlas541' ? 33.6 : (id === 'titan4b' ? 36.4 : 29.3);
  const root = new THREE.Group(); root.add(R.core, R.upper, R.centaur, R.payload, ...R.fairing, ...R.boosters);
  R.root = root; R.seq = seq;
  return R;
}
