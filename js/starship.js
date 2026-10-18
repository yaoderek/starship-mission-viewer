// High-detail Starship V3 / Block 3 stack for the hologram viewer.
// Dimensions from SpaceX via Wikipedia (Super Heavy, Starship spacecraft) and the V3 debut coverage:
//   stack 124.4 m, Super Heavy 72.3 m, Ship 52.1 m, diameter 9 m;
//   Super Heavy: 33 Raptor 3 (3 centre, 10 inner ring, 20 outer), three grid fins at 90/90/180 deg,
//   integrated hot-stage section on the methane tank; Ship: 3 sea-level + 3 vacuum Raptors,
//   forward flaps moved leeward (~140 deg apart), ~18,000 hexagonal tiles on the windward side.
// Model units are metres. +Y is up the stack, +Z is the ship's windward (heat shield) side.
import * as THREE from 'three';

export const DIM = { R: 4.5, shipH: 52.1, boosterH: 72.3, stackH: 124.4 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// Ascent timeline (seconds after liftoff), Block 2/3 flight profile
export const ASCENT = [
  { t: 0, label: 'LIFTOFF · 33 RAPTOR 3' },
  { t: 62, label: 'MAX-Q' },
  { t: 159, label: 'MECO · 64 km' },
  { t: 161, label: 'HOT STAGING · SHIP IGNITION' },
  { t: 168, label: 'STAGE SEPARATION' },
  { t: 180, label: 'BOOSTER FLIP · BOOSTBACK BURN' },
  { t: 240, label: 'SHIP ASCENT · 6 RAPTORS' },
  { t: 360, label: 'BOOSTER LANDING BURN · 13 ENGINES' },
  { t: 520, label: 'SECO · ORBIT' },
];

// ------------------------------------------------------------------ builder
// mats: { hull, shield, inner, engine, edge, faint } materials supplied by the hologram viewer.
export function buildStarship(mats) {
  const R = DIM.R;
  const edge = (geo, m, angle = 30) => new THREE.LineSegments(new THREE.EdgesGeometry(geo, angle), m || mats.edge);
  const mesh = (geo, mat, pos, rot, edges = true) => {
    const o = new THREE.Group(), m = new THREE.Mesh(geo, mat); o.add(m); if (edges) o.add(edge(geo));
    if (pos) o.position.copy(pos); if (rot) o.rotation.set(...rot); return o;
  };
  const lines = (pts, m) => new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), m || mats.edge);
  const ring = (r, y, n = 96) => { const p = []; for (let i = 0; i < n; i++) { const a = i / n * TAU, b = (i + 1) / n * TAU; p.push(V(Math.sin(a) * r, y, Math.cos(a) * r), V(Math.sin(b) * r, y, Math.cos(b) * r)); } return p; };
  const at = (r, th, y) => V(Math.sin(th) * r, y, Math.cos(th) * r);

  // a Raptor 3 engine: bell nozzle + compact powerhead (no shrouds on Raptor 3)
  function raptor(exitR, len, vac) {
    const g = new THREE.Group(), throat = exitR * (vac ? 0.2 : 0.3), prof = [];
    for (let i = 0; i <= 14; i++) { const s = i / 14; prof.push(new THREE.Vector2(throat + (exitR - throat) * Math.pow(s, vac ? 0.62 : 0.72), -len * s)); }
    const bell = new THREE.LatheGeometry(prof, 28);
    g.add(new THREE.Mesh(bell, mats.engine)); g.add(edge(bell, mats.faint, 40));
    g.add(lines(ring(exitR, -len, 28), mats.edge));
    const ph = new THREE.CylinderGeometry(throat * 1.6, throat * 1.1, len * 0.42, 14, 1, true);
    const pm = new THREE.Mesh(ph, mats.inner); pm.position.y = len * 0.21; g.add(pm);
    const tp = new THREE.CylinderGeometry(throat * 0.7, throat * 0.7, len * 0.3, 10, 1, true);
    for (const s of [-1, 1]) { const t = new THREE.Mesh(tp, mats.inner); t.position.set(s * throat * 1.5, len * 0.25, 0); g.add(t); }
    g.userData.exit = { r: exitR, len };
    return g;
  }
  // dome (ellipsoidal cap) inside a tank; dir +1 bulges up, -1 down
  function dome(y, sag, dir, r = R - 0.05) {
    const p = []; for (let i = 0; i <= 16; i++) { const s = i / 16; p.push(new THREE.Vector2(r * Math.sin(s * Math.PI / 2), dir * sag * Math.cos(s * Math.PI / 2))); }
    const g = new THREE.LatheGeometry(p, 48), o = new THREE.Group(); o.add(new THREE.Mesh(g, mats.inner)); o.add(lines(ring(r * 0.66, dir * sag * 0.75, 48), mats.faint)); o.position.y = y; return o;
  }
  // thin tapered plate (flap / fin) in the plane containing the body axis; sweep is the tip's offset from the aft end of the root
  function plate(root, tip, span, sweep, thick) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(span, sweep); s.lineTo(span, sweep + tip); s.lineTo(0, root); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.3, bevelSize: thick * 0.3, bevelSegments: 1 });
    g.translate(0, 0, -thick / 2); g.rotateY(-Math.PI / 2); return g;
  }
  // hexagonal tile grid on a body of revolution, windward arc [th0, th1]
  function tiles(rOf, y0, y1, th0, th1, s, rOff = 0.06) {
    const pts = [], R0 = R, w = Math.sqrt(3) * s, hStep = 1.5 * s;
    const P = (u, v) => { const r = rOf(v) + rOff, th = u / R0; return at(r, th, v); };
    for (let row = 0, v = y0; v < y1; row++, v += hStep) {
      for (let u = th0 * R0 + (row % 2 ? w / 2 : 0); u < th1 * R0; u += w) {
        const vs = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; vs.push([u + s * Math.cos(a), v + s * Math.sin(a)]); }
        for (let k = 0; k < 6; k++) { const a = vs[k], b = vs[(k + 1) % 6]; if (a[1] > y1 || b[1] > y1 || a[1] < y0) continue; if (rOf(Math.max(a[1], b[1])) < 0.6) continue; pts.push(P(a[0], a[1]), P(b[0], b[1])); }
      }
    }
    return lines(pts, mats.tile);
  }

  // ================================================================ SHIP
  const ship = new THREE.Group(), SH = DIM.shipH, barrel = 33.5, noseL = SH - barrel;
  const rho = (R * R + noseL * noseL) / (2 * R), noseR = h => h <= 0 ? R : h >= noseL ? 0 : Math.sqrt(Math.max(0, rho * rho - h * h)) + R - rho;
  const shipR = y => y < barrel ? R : noseR(y - barrel);
  ship.add(mesh(new THREE.CylinderGeometry(R, R, barrel, 72, 1, true), mats.hull, V(0, barrel / 2, 0)));
  const np = []; for (let i = 0; i <= 40; i++) { const h = noseL * (1 - Math.pow(1 - i / 40, 1.4)); np.push(new THREE.Vector2(Math.max(0.001, noseR(Math.min(h, noseL - 0.35))), h)); }
  np.push(new THREE.Vector2(0, noseL));
  ship.add(mesh(new THREE.LatheGeometry(np, 72), mats.hull, V(0, barrel, 0), null, false));
  for (let k = 1; k < barrel / 1.83; k++) ship.add(lines(ring(R + 0.01, k * 1.83), mats.faint));     // barrel ring welds
  for (const h of [3, 7, 11, 15]) ship.add(lines(ring(noseR(h) + 0.01, barrel + h, 64), mats.faint)); // nose welds
  // heat shield: windward 200 deg arc of hexagonal tiles, plus a brighter shell
  const SA = 100 * Math.PI / 180;
  const shieldGeo = new THREE.CylinderGeometry(R + 0.05, R + 0.05, barrel - 1.2, 48, 1, true, -SA, 2 * SA);
  const shield = new THREE.Mesh(shieldGeo, mats.shield); shield.position.y = 1.2 + (barrel - 1.2) / 2; ship.add(shield);
  const shieldTiles = tiles(shipR, 1.2, SH - 1.2, -SA, SA, 0.62); ship.add(shieldTiles);
  // forward flaps: smaller, moved leeward, ~140 deg apart (Block 2+). Hinge runs along the nose surface.
  const flaps = {};
  const flap = (th, y, rBase, slope, geo, key) => {
    const piv = new THREE.Group(); piv.position.copy(at(rBase - 0.05, th, y)); piv.rotation.y = th;
    const tilt = new THREE.Group(); tilt.rotation.x = -slope; piv.add(tilt);
    const hinge = new THREE.Group(); tilt.add(hinge); hinge.add(mesh(geo, mats.hull));
    piv.userData.dynamic = true; ship.add(piv); flaps[key] = hinge;
  };
  const fwdSlope = Math.atan((noseR(2.2) - noseR(9.4)) / 7.2);
  for (const side of [-1, 1]) flap(Math.PI + side * 70 * Math.PI / 180, barrel + 2.2, noseR(2.2), fwdSlope, plate(7.2, 2.6, 3.1, 0.6, 0.3), 'fwd' + (side < 0 ? 'L' : 'R'));
  // aft flaps: larger, on the sides, slightly leeward
  for (const side of [-1, 1]) flap(side * 100 * Math.PI / 180, 1.4, R, 0, plate(10.8, 5.2, 4.3, 1.0, 0.36), 'aft' + (side < 0 ? 'L' : 'R'));
  // chines/aero covers between the flaps
  for (const side of [-1, 1]) { const th = side * 100 * Math.PI / 180; const c = mesh(new THREE.BoxGeometry(0.5, 21, 0.35), mats.hull, at(R + 0.15, th, 22.5), [0, th, 0]); ship.add(c); }
  // Starlink deploy slot ("PEZ" door) on the leeward side, catch points under the forward flaps
  ship.add(lines([V(-1.1, 24, -R - 0.02), V(1.1, 24, -R - 0.02), V(1.1, 24, -R - 0.02), V(1.1, 31, -R - 0.02), V(1.1, 31, -R - 0.02), V(-1.1, 31, -R - 0.02), V(-1.1, 31, -R - 0.02), V(-1.1, 24, -R - 0.02)]));
  for (const side of [-1, 1]) { const th = Math.PI + side * 70 * Math.PI / 180, pg = new THREE.Group(); pg.position.copy(at(R + 0.4, th, barrel - 0.6)); pg.rotation.y = th; pg.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 10), mats.hull, null, [Math.PI / 2, 0, 0])); ship.add(pg); }
  // tanks: aft dome, common dome (LOX below / CH4 above), forward dome, nose header tank
  ship.add(dome(3.4, 1.8, -1), dome(16.5, 1.9, -1), dome(31.2, 2.0, 1));
  const ht = new THREE.SphereGeometry(1.25, 20, 12), htm = new THREE.Mesh(ht, mats.inner); htm.position.y = barrel + 4; ship.add(htm);
  ship.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 13, 12, 1, true), mats.inner, V(0, 9.5, 0), null, false));   // downcomer
  // engines: 3 sea-level (centre) + 3 vacuum (outer), engine bay skirt
  const shipEngines = [];
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU, e = raptor(0.65, 2.3, false); e.position.copy(at(1.05, a, 0.6)); ship.add(e); shipEngines.push({ pos: at(1.05, a, 0.6 - 2.3), r: 0.65, vac: false }); }
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + Math.PI / 3, e = raptor(1.15, 3.7, true); e.position.copy(at(3.0, a, 1.4)); ship.add(e); shipEngines.push({ pos: at(3.0, a, 1.4 - 3.7), r: 1.15, vac: true }); }
  ship.add(lines(ring(R, 0.02)), lines(ring(R, 1.2), mats.faint));

  // ================================================================ SUPER HEAVY
  const booster = new THREE.Group(), BH = DIM.boosterH, hsY = BH - 5.9;
  booster.add(mesh(new THREE.CylinderGeometry(R, R, hsY, 72, 1, true), mats.hull, V(0, hsY / 2, 0)));
  for (let k = 1; k < hsY / 1.83; k++) booster.add(lines(ring(R + 0.01, k * 1.83), mats.faint));
  // integrated hot-stage section: vented ring on the methane tank with a forward heat shield
  booster.add(mesh(new THREE.CylinderGeometry(R, R, BH - hsY, 72, 1, true), mats.shield, V(0, (hsY + BH) / 2, 0), null, false));
  const vents = [];
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, b = a + TAU / 24 * 0.55, y0 = hsY + 0.8, y1 = BH - 0.8;
    vents.push(at(R + 0.02, a, y0), at(R + 0.02, b, y0), at(R + 0.02, b, y0), at(R + 0.02, b, y1), at(R + 0.02, b, y1), at(R + 0.02, a, y1), at(R + 0.02, a, y1), at(R + 0.02, a, y0)); }
  booster.add(lines(vents), lines(ring(R + 0.02, hsY)), lines(ring(R + 0.02, BH)));
  booster.add(dome(BH - 1.2, 2.2, 1, R - 0.08));                                                   // forward dome, exposed under the vents
  booster.add(dome(44, 2.0, -1), dome(5.6, 2.0, -1));                                              // common dome, aft dome
  booster.add(mesh(new THREE.CylinderGeometry(0.85, 0.85, 37, 14, 1, true), mats.inner, V(0, 24.5, 0), null, false));   // CH4 downcomer
  // grid fins: three, 50% larger than V2, at 90/90/180 deg, just below the hot-stage section
  const fins = [];
  for (const deg of [0, 90, 180]) {
    // deployed grid fin: a flat lattice panel sticking out radially, cells open along the stack axis
    const th = deg * Math.PI / 180, piv = new THREE.Group(), fw = 5.4, fs = 4.6, fd = 0.9;
    piv.position.copy(at(R, th, hsY - 4.2)); piv.rotation.y = th;
    const panel = new THREE.Group(); panel.position.z = 0.6 + fs / 2;
    const frame = new THREE.BoxGeometry(fw, fd, fs); panel.add(new THREE.Mesh(frame, mats.hull), edge(frame));
    const lat = [], cell = 0.62, clipLine = (c, sgn, yy) => {      // diagonal z = sgn*x + c clipped to the panel
      const xs = []; for (const x of [-fw / 2, fw / 2]) { const z = sgn * x + c; if (Math.abs(z) <= fs / 2) xs.push([x, z]); }
      for (const z of [-fs / 2, fs / 2]) { const x = (z - c) * sgn; if (Math.abs(x) <= fw / 2) xs.push([x, z]); }
      if (xs.length >= 2) lat.push(V(xs[0][0], yy, xs[0][1]), V(xs[1][0], yy, xs[1][1]));
    };
    for (const yy of [fd / 2 + 0.01, -fd / 2 - 0.01]) for (let c = -fw; c <= fw; c += cell) { clipLine(c, 1, yy); clipLine(c, -1, yy); }
    panel.add(lines(lat, mats.faint));
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.7), mats.hull); arm.position.z = 0.3;
    piv.add(panel, arm); booster.add(piv); fins.push(piv);
    if (deg !== 90) booster.add(mesh(new THREE.BoxGeometry(1.0, 1.4, 0.8), mats.hull, at(R + 0.35, th, hsY - 0.9), [0, th, 0]));   // catch hardpoints
  }
  // raceway and the consolidated quick-disconnect plate at the base
  booster.add(mesh(new THREE.BoxGeometry(0.7, hsY - 8, 0.35), mats.hull, at(R + 0.15, 1.5 * Math.PI, (hsY - 8) / 2 + 6), [0, 1.5 * Math.PI, 0]));
  booster.add(mesh(new THREE.BoxGeometry(2.4, 3.2, 0.5), mats.hull, at(R + 0.2, 1.5 * Math.PI, 2.4), [0, 1.5 * Math.PI, 0]));
  // 33 Raptor 3: 3 centre, 10 inner ring, 20 outer ring
  const boosterEngines = [];
  const place = (n, r, off, ring) => { for (let i = 0; i < n; i++) { const a = i / n * TAU + off, e = raptor(0.65, 2.2, false); e.position.copy(at(r, a, 1.6)); booster.add(e); boosterEngines.push({ pos: at(r, a, 1.6 - 2.2), r: 0.65, ring }); } };
  place(3, 0.95, 0, 'centre'); place(10, 2.4, 0.15, 'inner'); place(20, 3.78, 0.05, 'outer');
  booster.add(lines(ring(R, 0.02)), lines(ring(R - 0.25, 1.4), mats.faint));

  bake(ship); bake(booster);
  ship.position.y = BH;
  const root = new THREE.Group(); root.add(booster, ship);
  return { root, ship, booster, flaps, fins, shipEngines, boosterEngines, shield, shieldTiles };
}

// Merge every static mesh and line set in a part into one draw call per material.
// Subtrees marked userData.dynamic (flap hinges) stay live so they can move.
function bake(part) {
  part.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(part.matrixWorld).invert(), meshes = new Map(), segs = new Map(), dead = [];
  const walk = o => {
    for (const c of [...o.children]) {
      if (c.userData.dynamic) continue;
      if (c.isMesh || c.isLineSegments) {
        const rel = new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld);
        let g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        if (c.isMesh && !g.attributes.normal) g.computeVertexNormals();
        g.applyMatrix4(rel);
        const bucket = c.isMesh ? meshes : segs; if (!bucket.has(c.material)) bucket.set(c.material, []); bucket.get(c.material).push(g);
        dead.push(c);
      }
      walk(c);
    }
  };
  walk(part);
  for (const c of dead) c.parent.remove(c);
  const merge = list => {
    const n = list.reduce((a, g) => a + g.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = list[0].attributes.normal ? new Float32Array(n * 3) : null;
    let k = 0; for (const g of list) { pos.set(g.attributes.position.array, k * 3); if (nor && g.attributes.normal) nor.set(g.attributes.normal.array, k * 3); k += g.attributes.position.count; }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); if (nor) out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return out;
  };
  for (const [m, list] of meshes) part.add(new THREE.Mesh(merge(list), m));
  for (const [m, list] of segs) part.add(new THREE.LineSegments(merge(list), m));
  // drop the now-empty groups
  const prune = o => { for (const c of [...o.children]) { if (c.userData.dynamic) continue; prune(c); if (c.type === 'Group' && !c.children.length) o.remove(c); } };
  prune(part);
}
