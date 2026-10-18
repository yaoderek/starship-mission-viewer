// Crewed Starship cutaway for the radiation view.
// Metres, +Y up the stack, +Z windward (heat-shield side), same frame as js/starship.js.
//
// Public figures the silhouette is built from:
//   SpaceX vehicle page — ship 52 m, diameter 9 m, 1,600 t CH4/LOX, 3 Raptor + 3 Raptor Vacuum.
//     https://www.spacex.com/vehicles/starship/
//   Wikipedia "SpaceX Starship" — Block 2 ship 52.1 m (the 52 m figure above, and the height
//     the hologram already uses); payload bay holds the nose, header tanks and forward flaps;
//     LOX header forms the nose tip with the methane header directly under it; aft flaps sit
//     on the engine bay and LOX tank; windward heat shield of hexagonal tiles; forward flaps
//     moved leeward, about 140° apart, from Block 2 on.
//   FAA written re-evaluation (2023), Starship internal-structure figure — LOX aft, CH4 forward,
//     common dome, methane downcomer through the LOX tank, header residuals in the nose.
// Crew decks are the cargo bay of that ship fitted out for people: the volume under the header
// tanks and above the forward dome, at about 2.5 m per deck. SpaceX describes several crew
// decks (HLS garage plus cabin; a crewed ship "minus the windows" is how they describe a tanker)
// but has not published a deck count, so the count is however many 2.5 m decks fit in that bay.
// The storm shelter is this app's water shelter (radiation.js: 1.6 m radius, 2.4 m tall),
// placed on the lowest deck, on the centreline, where the tanks below add shielding.
import * as THREE from 'three';

const R = 4.5, H = 52.1, BARREL = 33.5, NOSE = H - BARREL;
const rho = (R * R + NOSE * NOSE) / (2 * R);
const noseR = h => h <= 0 ? R : h >= NOSE ? 0 : Math.sqrt(Math.max(0, rho * rho - h * h)) + R - rho;
const shipR = y => y <= BARREL ? R : noseR(y - BARREL);
const TAU = Math.PI * 2;

// Opening faces the camera (starboard-leeward) so the cut, the leeward windows and the
// windward tiles are all in one 3/4 view. Theta 0 is +Z.
const CAM_TH = 2.02, OPEN0 = 1.40, OPEN1 = 2.62;
const KEPT = TAU - (OPEN1 - OPEN0);
const thKept = u => OPEN1 + u * KEPT;

// Dose colour is the console status ramp (green → amber → red → white), unlit so the
// legend matches the surfaces. Same stops as the cabin-dose-gradient change.
const DOSE_STOPS = [[0, '#245c40'], [1, '#5fbf7f'], [5, '#e0b050'], [20, '#e0605a'], [80, '#f2f2f2']].map(([r, hex]) => ({ r, hex, col: new THREE.Color(hex) }));
const doseF = v => Math.log10(1 + Math.max(0, v));
const doseU = v => Math.max(0, Math.min(1, doseF(v) / doseF(DOSE_STOPS[DOSE_STOPS.length - 1].r)));
const doseTmp = new THREE.Color();
function doseInto(rate, out) {
  const x = Math.max(0, rate); let k = 0; while (k < DOSE_STOPS.length - 2 && x > DOSE_STOPS[k + 1].r) k++;
  const a = DOSE_STOPS[k], b = DOSE_STOPS[k + 1], t = (doseF(x) - doseF(a.r)) / (doseF(b.r) - doseF(a.r) || 1);
  return out.copy(a.col).lerp(b.col, Math.max(0, Math.min(1, t)));
}
export function doseScaleHTML(rate) {
  const grad = DOSE_STOPS.map(s => `${s.hex} ${(doseU(s.r) * 100).toFixed(1)}%`).join(',');
  const ticks = DOSE_STOPS.map(s => `<em style="left:${(doseU(s.r) * 100).toFixed(1)}%">${s.r >= 80 ? '80+' : s.r}</em>`).join('');
  const num = rate >= 100 ? Math.round(rate).toString() : rate >= 10 ? rate.toFixed(1) : rate.toFixed(2);
  return `<span class="scale" title="Dose rate at the hull, mSv per day"><i style="background:linear-gradient(90deg,${grad})"><span class="mark" style="left:${(doseU(rate) * 100).toFixed(1)}%"></span></i><span class="ticks">${ticks}</span></span><b>${num} mSv/d</b>`;
}

const DECKS = [
  { y: 34.25, e0: 0.06, e1: 0.70 }, // lowest: metres of propellant directly below
  { y: 36.75, e0: 0.20, e1: 0.86 },
  { y: 39.25, e0: 0.36, e1: 0.95 },
  { y: 41.75, e0: 0.48, e1: 1.00 }, // under the header-tank sump
];

// Low-poly crew from the merged cabin figures: local +Y up, visor toward local +Z.
// Scaled from the original ~1.3 m build to a standing height of about 1.75 m.
const FIG = 1.35;
const SLOTS = [
  { y: 36.75, x: 1.15, z: -1.35, yaw: CAM_TH },
  { y: 36.75, x: -0.15, z: -2.05, yaw: CAM_TH - 0.35 },
  { y: 39.25, x: 0.55, z: -1.15, yaw: CAM_TH + 0.2 },
  { y: 34.25, x: 0.05, z: 0.05, yaw: CAM_TH },
  { y: 41.75, x: -0.45, z: -0.7, yaw: CAM_TH - 0.5 },
  { y: 39.25, x: -1.25, z: 0.85, yaw: CAM_TH + 0.6 },
];

export function createCabin(canvas, host) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setClearColor(0x000000, 0);
  const S = new THREE.Scene(), cam = new THREE.PerspectiveCamera(26, 1, 0.08, 800); cam.up.set(0, 1, 0);
  S.add(new THREE.AmbientLight(0xffffff, 0.72));
  const key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(Math.sin(CAM_TH) * 40, 30, Math.cos(CAM_TH) * 40); S.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.38); fill.position.set(-24, 8, 16); S.add(fill);

  const steel = new THREE.MeshLambertMaterial({ color: 0xd5d8dc, side: THREE.DoubleSide });
  const steelDark = new THREE.MeshLambertMaterial({ color: 0x8e9398, side: THREE.DoubleSide });
  const tileMat = new THREE.MeshLambertMaterial({ color: 0x141414, side: THREE.DoubleSide });
  const engineMat = new THREE.MeshLambertMaterial({ color: 0x5c6166, side: THREE.DoubleSide });
  const liquidLox = new THREE.MeshLambertMaterial({ color: 0xc5ccd1, side: THREE.DoubleSide });
  const liquidCh4 = new THREE.MeshLambertMaterial({ color: 0xb7b3a6, side: THREE.DoubleSide });
  const glass = new THREE.MeshLambertMaterial({ color: 0x0e1014 });
  const ink = new THREE.LineBasicMaterial({ color: 0xf2f2f2 });
  const faint = new THREE.LineBasicMaterial({ color: 0x9aa0a6 });
  const dimLine = new THREE.LineBasicMaterial({ color: 0x2a2a2a });
  const doseMat = () => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const suitMat = new THREE.MeshLambertMaterial({ color: 0xd8dee4 });
  const visorMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const crewGeo = {
    leg: new THREE.CapsuleGeometry(0.06, 0.42, 2, 6), torso: new THREE.BoxGeometry(0.36, 0.48, 0.2),
    head: new THREE.SphereGeometry(0.15, 12, 8), visor: new THREE.BoxGeometry(0.16, 0.06, 0.04), arm: new THREE.CapsuleGeometry(0.045, 0.36, 2, 6),
  };

  const root = new THREE.Group(); S.add(root);
  const doseGeos = [];
  const lines = (pts, mat) => { const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(...p))); root.add(new THREE.LineSegments(g, mat || faint)); };
  const ring = (rad, y, n = 80, mat) => { const p = []; for (let i = 0; i < n; i++) { const a = i / n * TAU, b = (i + 1) / n * TAU; p.push([Math.sin(a) * rad, y, Math.cos(a) * rad], [Math.sin(b) * rad, y, Math.cos(b) * rad]); } lines(p, mat); };

  function grid(nu, nv, at, exposure, mat) {
    const nx = nu + 1, nz = nv + 1, pos = new Float32Array(nx * nz * 3), exp = exposure ? new Float32Array(nx * nz) : null;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const [x, y, z] = at(i / nu, j / nv), k = j * nx + i; pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      if (exp) exp[k] = exposure(i / nu, j / nv);
    }
    const idx = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * nx + i; idx.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    if (exp) { g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nx * nz * 3), 3)); g.userData.exposure = exp; doseGeos.push(g); }
    const m = new THREE.Mesh(g, mat); root.add(m); return m;
  }
  function shell(y0, y1, ny, rOf, mat, exposure) {
    return grid(40, ny, (u, v) => {
      const y = y0 + (y1 - y0) * v, th = thKept(u), rad = rOf(y);
      return [Math.sin(th) * rad, y, Math.cos(th) * rad];
    }, exposure, mat);
  }
  function disc(y, rad, e0, e1, mat, nTh = 36, nRad = 5) {
    const n = 1 + nRad * nTh, pos = new Float32Array(n * 3), exp = new Float32Array(n);
    pos[1] = y; exp[0] = e0;
    for (let j = 1; j <= nRad; j++) {
      const rr = rad * j / nRad, e = e0 + (e1 - e0) * (j / nRad);
      for (let i = 0; i < nTh; i++) {
        const th = i / nTh * TAU, k = 1 + (j - 1) * nTh + i;
        pos[k * 3] = Math.sin(th) * rr; pos[k * 3 + 1] = y; pos[k * 3 + 2] = Math.cos(th) * rr; exp[k] = e;
      }
    }
    const idx = [];
    for (let i = 0; i < nTh; i++) idx.push(0, 1 + i, 1 + (i + 1) % nTh);
    for (let j = 1; j < nRad; j++) {
      const a0 = 1 + (j - 1) * nTh, b0 = 1 + j * nTh;
      for (let i = 0; i < nTh; i++) { const i2 = (i + 1) % nTh; idx.push(a0 + i, b0 + i, b0 + i2, a0 + i, b0 + i2, a0 + i2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setIndex(idx); g.userData.exposure = exp; doseGeos.push(g);
    const m = new THREE.Mesh(g, mat); root.add(m); return m;
  }
  function dome(yRim, sag, dir, rad) {
    grid(32, 10, (u, v) => {
      const th = thKept(u), s = v * Math.PI / 2, rr = rad * Math.sin(s);
      return [Math.sin(th) * rr, yRim + dir * sag * Math.cos(s), Math.cos(th) * rr];
    }, null, steelDark);
    ring(rad, yRim, 72, faint);
  }
  function plate(rootC, tip, span, sweep, thick) {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(span, sweep); s.lineTo(span, sweep + tip); s.lineTo(0, rootC); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.25, bevelSize: thick * 0.25, bevelSegments: 1 });
    g.translate(0, 0, -thick / 2); g.rotateY(-Math.PI / 2); return g;
  }
  function flap(th, y, rBase, slope, geo) {
    const piv = new THREE.Group(); piv.position.set(Math.sin(th) * (rBase - 0.02), y, Math.cos(th) * (rBase - 0.02)); piv.rotation.y = th;
    const tilt = new THREE.Group(); tilt.rotation.x = -slope; piv.add(tilt);
    const m = new THREE.Mesh(geo, steel); tilt.add(m);
    tilt.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), faint));
    root.add(piv);
  }
  function raptor(exitR, len) {
    const throat = exitR * 0.28, prof = [];
    for (let i = 0; i <= 10; i++) { const s = i / 10; prof.push(new THREE.Vector2(throat + (exitR - throat) * Math.pow(s, 0.7), -len * s)); }
    const g = new THREE.Group(), bell = new THREE.LatheGeometry(prof, 18);
    g.add(new THREE.Mesh(bell, engineMat));
    const ph = new THREE.Mesh(new THREE.CylinderGeometry(throat * 1.5, throat * 1.05, len * 0.38, 10), engineMat);
    ph.position.y = len * 0.2; g.add(ph); return g;
  }
  function figure(slot) {
    const g = new THREE.Group();
    const put = (geo, x, y, z, mat) => { const m = new THREE.Mesh(geo, mat || suitMat); m.position.set(x, y, z); g.add(m); };
    put(crewGeo.leg, -0.10, -0.38, 0); put(crewGeo.leg, 0.10, -0.38, 0);
    put(crewGeo.torso, 0, 0.13, 0); put(crewGeo.head, 0, 0.50, 0); put(crewGeo.visor, 0, 0.51, 0.175, visorMat);
    const hang = (x, rz) => {
      const p = new THREE.Group(); p.position.set(x, 0.30, 0); p.rotation.z = rz;
      const m = new THREE.Mesh(crewGeo.arm, suitMat); m.position.y = -(crewGeo.arm.parameters.length / 2 + crewGeo.arm.parameters.radius); p.add(m); g.add(p);
    };
    hang(-0.20, -0.55); hang(0.20, 0.55);
    g.scale.setScalar(FIG); g.rotation.y = slot.yaw;
    g.position.set(slot.x, slot.y + 0.65 * FIG, slot.z);
    return g;
  }

  // ---------------------------------------------------------------- hull, tiles, cut edges
  shell(0.15, 51.85, 56, y => Math.max(0.04, shipR(y)), steel, null);
  grid(12, 1, (u, v) => {
    const th = thKept(u), rad = Math.max(0.04, shipR(51.85)) * (1 - v);
    return [Math.sin(th) * rad, 51.85 + v * (H - 51.85), Math.cos(th) * rad];
  }, null, steel);
  // Windward heat shield. Theta -1.35..1.35 sits clear of the leeward cut (1.40..2.62).
  grid(28, 32, (u, v) => {
    const y = 1.2 + (46.5 - 1.2) * v, th = -1.35 + 2.7 * u, rad = shipR(y) + 0.08;
    return [Math.sin(th) * rad, y, Math.cos(th) * rad];
  }, null, tileMat);
  // coarse hexagonal tile lines on the windward barrel, enough to read as the heat shield
  {
    const pts = [], s = 1.15, R0 = R, w = Math.sqrt(3) * s, hStep = 1.5 * s, y0 = 2, y1 = 40, th0 = -1.2, th1 = 1.2;
    const P = (uu, vv) => { const rad = shipR(vv) + 0.11, th = uu / R0; return [Math.sin(th) * rad, vv, Math.cos(th) * rad]; };
    for (let row = 0, v = y0; v < y1; row++, v += hStep) {
      for (let uu = th0 * R0 + (row % 2 ? w / 2 : 0); uu < th1 * R0; uu += w) {
        const vs = []; for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; vs.push([uu + s * Math.cos(a), v + s * Math.sin(a)]); }
        for (let k = 0; k < 6; k++) {
          const a = vs[k], b = vs[(k + 1) % 6];
          if (a[1] < y0 || b[1] < y0 || a[1] > y1 || b[1] > y1) continue;
          const tha = a[0] / R0, thb = b[0] / R0;
          if (tha > OPEN0 && tha < OPEN1) continue;
          if (tha < th0 || tha > th1 || thb < th0 || thb > th1) continue;
          pts.push(P(a[0], a[1]), P(b[0], b[1]));
        }
      }
    }
    lines(pts, new THREE.LineBasicMaterial({ color: 0x3a3a3a }));
  }
  // cut edges
  for (const th of [OPEN0, OPEN1]) {
    const p = [];
    for (let i = 0; i < 48; i++) {
      const y0 = 0.2 + (51.7 - 0.2) * i / 48, y1 = 0.2 + (51.7 - 0.2) * (i + 1) / 48;
      p.push([Math.sin(th) * shipR(y0), y0, Math.cos(th) * shipR(y0)], [Math.sin(th) * shipR(y1), y1, Math.cos(th) * shipR(y1)]);
    }
    lines(p, ink);
  }
  for (let k = 1; k < BARREL / 1.83; k++) {
    const y = k * 1.83, p = [], n = 48;
    for (let i = 0; i < n; i++) {
      const a = thKept(i / n), b = thKept((i + 1) / n);
      p.push([Math.sin(a) * (R + 0.02), y, Math.cos(a) * (R + 0.02)], [Math.sin(b) * (R + 0.02), y, Math.cos(b) * (R + 0.02)]);
    }
    lines(p, faint);
  }

  // ---------------------------------------------------------------- flaps and engines
  const fwdSlope = Math.atan((noseR(2.2) - noseR(9.4)) / 7.2);
  for (const side of [-1, 1]) flap(Math.PI + side * 70 * Math.PI / 180, BARREL + 2.2, noseR(2.2), fwdSlope, plate(7.2, 2.6, 3.1, 4.0, 0.28));
  for (const side of [-1, 1]) flap(side * 100 * Math.PI / 180, 1.4, R, 0, plate(10.8, 5.2, 4.3, 4.6, 0.34));
  for (const side of [-1, 1]) {
    const th = side * 100 * Math.PI / 180, box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 18, 0.28), steel);
    box.position.set(Math.sin(th) * (R + 0.16), 20, Math.cos(th) * (R + 0.16)); box.rotation.y = th; root.add(box);
  }
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU, e = raptor(0.65, 2.2); e.position.set(Math.sin(a) * 1.05, 0.55, Math.cos(a) * 1.05); root.add(e); }
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + Math.PI / 3, e = raptor(1.15, 3.4); e.position.set(Math.sin(a) * 2.9, 1.35, Math.cos(a) * 2.9); root.add(e); }
  ring(R, 0.16, 64, ink);

  // ---------------------------------------------------------------- tanks
  dome(3.4, 1.8, -1, R - 0.15);   // aft LOX dome
  dome(16.5, 1.9, -1, R - 0.12);  // common dome, LOX below / CH4 above
  dome(31.2, 2.0, 1, R - 0.12);   // forward CH4 dome, crown just under the crew
  const lox = new THREE.Mesh(new THREE.CircleGeometry(4.15, 40), liquidLox); lox.rotation.x = -Math.PI / 2; lox.position.y = 11.2; root.add(lox);
  const ch4 = new THREE.Mesh(new THREE.CircleGeometry(4.15, 40), liquidCh4); ch4.rotation.x = -Math.PI / 2; ch4.position.y = 25.2; root.add(ch4);
  const down = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 14, 12, 1, true), steelDark);
  down.position.y = 12; root.add(down);

  // header tanks in the tip: LOX header is the nose, methane header and its sump sit under it
  shell(47.55, 51.7, 12, y => Math.max(0.08, shipR(y) - 0.22), steelDark, null);
  const bulk = new THREE.Mesh(new THREE.CircleGeometry(Math.max(0.3, shipR(47.55) - 0.28), 28), steelDark);
  bulk.rotation.x = -Math.PI / 2; bulk.position.y = 47.55; root.add(bulk);
  shell(45.05, 47.45, 6, () => 1.62, steelDark, null);
  grid(24, 6, (u, v) => {
    const th = thKept(u), rr = 1.62 * (1 - v) + 0.12 * v, y = 45.05 - v * 1.45;
    return [Math.sin(th) * rr, y, Math.cos(th) * rr];
  }, null, steelDark);

  // ---------------------------------------------------------------- crew bay
  const wallMat = doseMat();
  shell(33.55, 44.3, 16, y => Math.max(0.4, shipR(y) - 0.1), wallMat, (u, v) => 0.42 + 0.58 * v);
  const deckMat = doseMat();
  for (const d of DECKS) {
    const rad = Math.max(0.8, shipR(d.y) - 0.28);
    disc(d.y, rad, d.e0, d.e1, deckMat);
    const beams = [], n = 8;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      beams.push([0, d.y + 0.03, 0], [Math.sin(a) * rad, d.y + 0.03, Math.cos(a) * rad]);
    }
    lines(beams, dimLine);
    ring(rad * 0.55, d.y + 0.03, 28, dimLine);
  }
  // leeward window band — crew Starship is the one with windows (a tanker is this ship without them)
  for (const y of [37.35, 39.85]) for (const th of [2.78, 3.08, 3.40, 3.72, 4.02]) {
    const rad = shipR(y) + 0.05, g = new THREE.Group();
    g.position.set(Math.sin(th) * rad, y, Math.cos(th) * rad); g.rotation.y = th;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.35, 0.08), steel);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.12, 0.12), glass);
    g.add(frame, pane); root.add(g);
  }

  // storm shelter: thick water wall, open toward the camera, on the lowest deck
  const shelter = new THREE.Group(); shelter.position.y = 34.25; root.add(shelter);
  const shMat = doseMat();
  const sOpen1 = CAM_TH + 0.95, sKept = TAU - 1.9;
  {
    const nu = 28, nx = nu + 1, nz = 2;
    const make = (r0, y0, y1, e0, e1) => {
      const pos = new Float32Array(nx * nz * 3), exp = new Float32Array(nx * nz);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const th = sOpen1 + (i / nu) * sKept, y = y0 + (y1 - y0) * j, k = j * nx + i;
        pos[k * 3] = Math.sin(th) * r0; pos[k * 3 + 1] = y; pos[k * 3 + 2] = Math.cos(th) * r0;
        exp[k] = e0 + (e1 - e0) * j;
      }
      const idx = [];
      for (let i = 0; i < nu; i++) { const a = i; idx.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nx * nz * 3), 3));
      g.setIndex(idx); g.computeVertexNormals(); g.userData.exposure = exp; doseGeos.push(g);
      return new THREE.Mesh(g, shMat);
    };
    shelter.add(make(1.60, 0.02, 2.38, 0.10, 0.10));
    shelter.add(make(1.22, 0.02, 2.38, 0.00, 0.00));
    shelter.userData.floor = disc(34.29, 1.18, 0, 0.04, doseMat());
  }
  // inner posts stay visible when the water jacket is removed, so the room doesn't disappear
  const posts = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const th = i / 8 * TAU, post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6), steelDark);
    post.position.set(Math.sin(th) * 1.12, 1.2, Math.cos(th) * 1.12); posts.add(post);
  }
  shelter.add(posts);

  // ---------------------------------------------------------------- crew and labels
  const crew = new THREE.Group(); root.add(crew);
  ring(1.62, 34.27, 40, ink); ring(1.62, 36.62, 40, ink);
  const labelLayer = document.createElement('div'); labelLayer.id = 'cutlabels'; host.appendChild(labelLayer);
  const tmpV = new THREE.Vector3();
  // Perpendicular to the view, so the words sit beside the hull instead of on it.
  const sideL = new THREE.Vector3(-Math.cos(CAM_TH), 0, Math.sin(CAM_TH));
  const sideR = sideL.clone().negate();
  const labelDefs = [
    { text: 'HEADER TANKS', y: 49.6, side: sideL, reach: 11.2 },
    { text: 'CREW DECKS', y: 39.4, side: sideL, reach: 12.4 },
    { text: 'STORM SHELTER', y: 35.4, side: sideR, reach: 11.4 },
    { text: 'MAIN TANKS', y: 19.0, side: sideR, reach: 12.2 },
  ];
  const labels = labelDefs.map(d => {
    const el = document.createElement('b'); el.textContent = d.text; labelLayer.appendChild(el);
    const end = d.side.clone().multiplyScalar(d.reach); end.y = d.y;
    const anchor = d.side.clone().multiplyScalar(3.6); anchor.y = d.y;
    lines([[anchor.x, anchor.y, anchor.z], [end.x * 0.92, end.y, end.z * 0.92]], faint);
    return { el, end };
  });

  let frame = 'ship';
  function fit() {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    r.setSize(w, h, false); cam.aspect = w / h;
    const crewFrame = frame === 'crew';
    const target = new THREE.Vector3(0, crewFrame ? 42.2 : 25.2, 0);
    const viewH = crewFrame ? 22 : 66, viewW = crewFrame ? 16 : 26;
    const fov = cam.fov * Math.PI / 180;
    const dist = Math.max((viewH / 2) / Math.tan(fov / 2), (viewW / 2) / (Math.tan(fov / 2) * cam.aspect)) * 1.02;
    cam.position.set(target.x + Math.sin(CAM_TH) * dist, target.y + dist * (crewFrame ? 0.04 : 0.08), target.z + Math.cos(CAM_TH) * dist);
    cam.lookAt(target); cam.updateProjectionMatrix();
  }
  function projectLabels() {
    const w = host.clientWidth, h = host.clientHeight;
    for (const L of labels) {
      tmpV.copy(L.end).project(cam);
      const x = (tmpV.x * 0.5 + 0.5) * w, y = (-tmpV.y * 0.5 + 0.5) * h;
      const on = tmpV.z < 1 && x > -40 && x < w + 40 && y > -10 && y < h - 18;
      L.el.style.display = on ? '' : 'none';
      if (on) L.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
    }
  }
  function paint(deep, high) {
    for (const g of doseGeos) {
      const e = g.userData.exposure, col = g.attributes.color;
      for (let i = 0; i < e.length; i++) { doseInto(deep + (high - deep) * e[i], doseTmp); col.setXYZ(i, doseTmp.r, doseTmp.g, doseTmp.b); }
      col.needsUpdate = true;
    }
  }

  let crewN = -1;
  canvas.addEventListener('dblclick', () => { frame = frame === 'ship' ? 'crew' : 'ship'; fit(); });
  new ResizeObserver(fit).observe(host); fit();

  return {
    resize: fit,
    setCrew(n) {
      if (n === crewN) return; crewN = n; crew.clear();
      for (let i = 0; i < n && i < SLOTS.length; i++) crew.add(figure(SLOTS[i]));
    },
    update(q) {
      const on = !!q.shelterOn;
      shelter.visible = true;
      for (const c of shelter.children) if (c !== posts) c.visible = on;
      if (shelter.userData.floor) shelter.userData.floor.visible = on;
      // High end is the hull rate. The low end is the shelter when it is fitted,
      // and otherwise the quieter inboard / propellant-shadowed rate, so decks
      // still separate when nobody is in the shelter.
      const high = Math.max(0, q.cabin);
      const deep = on ? Math.min(Math.max(0, q.shelter), high * 0.22) : high * 0.55;
      paint(deep, high);
      r.render(S, cam); projectLabels();
    },
    render() { r.render(S, cam); projectLabels(); },
    toggleFrame() { frame = frame === 'ship' ? 'crew' : 'ship'; fit(); },
  };
}
