// Mission preview: a vector "plot board" schematic in the style of a tactical display.
// White dashed orbits and outlined bodies, green dashed trajectory with star markers, mono labels.
// Planetary missions use the real ephemeris and trajectory from the mission file; interstellar
// missions use the catalogue star positions projected onto the ecliptic.
import { STARS, MAP_STARS } from './catalog.js';
import { starPos } from './interstellar.js';

const WHITE = '#f2f2f2', DIM = 'rgba(242,242,242,.55)', GREEN = '#46ff5e', GREEN_DIM = 'rgba(70,255,94,.55)', RED = '#ff4a3d';
const MONO = 'ui-monospace,"JetBrains Mono","DejaVu Sans Mono",Menlo,monospace';

function fit(cv) {
  const r = cv.getBoundingClientRect(), p = Math.min(devicePixelRatio, 2);
  if (cv.width !== Math.round(r.width * p) || cv.height !== Math.round(r.height * p)) { cv.width = r.width * p; cv.height = r.height * p; }
  const g = cv.getContext('2d'); g.setTransform(p, 0, 0, p, 0, 0); g.clearRect(0, 0, r.width, r.height); return { g, w: r.width, h: r.height };
}
const star4 = (g, x, y, s, col) => {   // four-point star marker
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? s * 0.28 : s; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
};
let placed = [];
// labels skip themselves if they would collide with one already drawn
const label = (g, txt, x, y, col, align = 'left', size = 9, force = true) => {
  g.font = `600 ${size}px ${MONO}`; const w = g.measureText(txt).width, x0 = align === 'left' ? x : x - w, box = [x0 - 2, y - size, x0 + w + 2, y + 2];
  if (!force && placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return;
  placed.push(box); g.fillStyle = col; g.textAlign = align; g.fillText(txt, x, y); g.textAlign = 'left';
};
const sym = (g, x, y, r, kind) => {    // astronomical symbols: ☉ sun, ⊕ earth, plain circle otherwise
  g.strokeStyle = WHITE; g.lineWidth = 1.6; g.setLineDash([]); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  if (kind === 'earth') { g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke(); }
  if (kind === 'sun') { g.fillStyle = WHITE; g.beginPath(); g.arc(x, y, Math.max(1.5, r * 0.18), 0, Math.PI * 2); g.fill(); }
};
function interp(track, jd) {
  const n = track.length; if (jd <= track[0][0]) return track[0].slice(1); if (jd >= track[n - 1][0]) return track[n - 1].slice(1);
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (track[m][0] <= jd) lo = m; else hi = m; }
  const a = track[lo], b = track[hi], f = (jd - a[0]) / (b[0] - a[0]); return [a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3])];
}
const SHORT = { mercury: 'MERCURY', venus: 'VENUS', earth: 'EARTH', mars: 'MARS', jupiter: 'JUPITER', saturn: 'SATURN', uranus: 'URANUS', neptune: 'NEPTUNE' };

// spec: { kind:'planet', data, mission, dest } | { kind:'star', star, mission }
export function drawSchematic(cv, spec, time) {
  const { g, w, h } = fit(cv); placed = []; if (!spec || !spec.mission) return;
  const m = spec.mission, dash = -time * 18;
  g.lineCap = 'round';
  if (spec.kind === 'planet') {
    const P = spec.data.planets, order = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    const tr = m.traj, rTraj = Math.max(...tr.map(p => Math.hypot(p[1], p[2])));
    const show = order.filter(n => P[n] && Math.max(...P[n].orbit.map(p => Math.hypot(p[0], p[1]))) <= rTraj * 1.25 + 0.05);
    const R = Math.max(rTraj, ...show.map(n => Math.max(...P[n].orbit.map(p => Math.hypot(p[0], p[1]))))) * 1.08;
    const cx = w / 2, cy = h / 2 + 6, k = Math.min(w, h - 26) / 2 / R, X = p => [cx + p[0] * k, cy - p[1] * k];
    // orbits
    g.lineWidth = 1.1; g.setLineDash([5, 5]);
    for (const n of show) { g.strokeStyle = n === (m.target || spec.dest) || n === 'earth' ? WHITE : DIM; g.beginPath(); P[n].orbit.forEach((p, i) => { const [x, y] = X(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke(); }
    sym(g, cx, cy, 7, 'sun'); label(g, 'SUN', cx + 10, cy - 8, DIM);
    // trajectory: green dashed, moving dashes
    g.strokeStyle = GREEN; g.lineWidth = 1.8; g.setLineDash([6, 5]); g.lineDashOffset = dash;
    g.beginPath(); tr.forEach((p, i) => { const [x, y] = X([p[1], p[2]]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.lineDashOffset = 0;
    // bodies at departure / arrival
    const t0 = tr[0][0], t1 = tr[tr.length - 1][0];
    const dest = m.target || spec.dest, e = X(interp(P.earth.track, t0)), d = X(interp(P[dest].track, t1));
    sym(g, e[0], e[1], 9, 'earth'); label(g, 'EARTH', e[0] + 12, e[1] - 10, WHITE);
    sym(g, d[0], d[1], 8, 'planet'); label(g, SHORT[dest], d[0] + 11, d[1] - 10, WHITE);
    // event markers
    for (const ev of m.events) {
      const [x, y] = X(ev.pos);
      star4(g, x, y, 7, ev.hazard ? RED : GREEN);
      const tag = ev.type === 'launch' ? 'TLI' : ev.type === 'flyby' ? (ev.body || '').slice(0, 3).toUpperCase() + ' GA' : ev.type === 'dsm' ? 'DSM' : ev.type === 'arrival' ? 'ARR' : ev.type === 'surface' ? 'LDG' : ev.type === 'departure' ? 'TEI' : ev.type === 'return' ? 'EI' : ev.type.toUpperCase();
      label(g, tag, x + 8, y + 12, ev.hazard ? RED : GREEN, 'left', 8.5, false);
    }
    // ship marker loops along the path
    const f = (time * 0.12) % 1, q = tr[Math.floor(f * (tr.length - 1))], [sx, sy] = X([q[1], q[2]]);
    g.strokeStyle = WHITE; g.lineWidth = 1.3; g.setLineDash([]); g.strokeRect(sx - 3.5, sy - 3.5, 7, 7);
    const S = m.summary;
    label(g, `${m.name} · ${S.launch}`, 10, 16, WHITE);
    label(g, S.historic ? `${Math.round(S.total_days)} D · C3 ${S.c3.toFixed(1)} KM²/S² · ${S.flybys.length ? S.flybys.length + ' FLYBYS' : 'DIRECT'}` : `${Math.round(S.total_days ?? S.tof_years * 365.25)} D · Δv ${S.dv_total.toFixed(2)} KM/S · ${S.tankers_needed ?? '—'} TANKERS`, 10, h - 10, GREEN_DIM, 'left', 8.5);
  } else {
    const tgt = spec.star, tp = starPos(tgt), Rr = tgt.ly * 1.25;
    // rotate the ecliptic projection so the target lies to the right of the Sun
    const ang = Math.atan2(tp[1], tp[0]), c = Math.cos(-ang), sn = Math.sin(-ang);
    const cx = w * 0.2, cy = h / 2 + 6, k = (w * 0.66) / Math.hypot(tp[0], tp[1]);
    const X = p => [cx + (p[0] * c - p[1] * sn) * k, cy - (p[0] * sn + p[1] * c) * k];
    const step = tgt.ly > 20 ? 10 : 2;
    g.lineWidth = 1; g.setLineDash([4, 6]); g.strokeStyle = DIM;
    for (let r = step; r <= Rr; r += step) { g.beginPath(); g.arc(cx, cy, r * k, 0, Math.PI * 2); g.stroke(); label(g, `${r} LY`, cx + r * k * 0.71 + 3, cy + r * k * 0.71 + 9, 'rgba(242,242,242,.35)', 'left', 8); }
    sym(g, cx, cy, 7, 'sun'); label(g, 'SOL', cx + 10, cy - 8, WHITE);
    for (const s of [...STARS, ...MAP_STARS]) {
      if (s.ly > Rr) continue; const [x, y] = X(starPos(s)); if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue; const r = Math.max(2.5, Math.min(9, 4 * Math.pow(s.lum, 0.18)));
      const isT = s.id === tgt.id; g.strokeStyle = isT ? WHITE : DIM; g.lineWidth = isT ? 1.6 : 1; g.setLineDash([]); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      if (isT || s.lum > 0.2) label(g, s.name.toUpperCase(), x + r + 4, y - r - 2, isT ? WHITE : DIM, 'left', isT ? 9 : 8, isT);
    }
    const [tx, ty] = X(tp);
    g.strokeStyle = GREEN; g.lineWidth = 1.8; g.setLineDash([6, 5]); g.lineDashOffset = dash; g.beginPath(); g.moveTo(cx, cy); g.lineTo(tx, ty); g.stroke(); g.lineDashOffset = 0;
    for (const ev of m.events) {
      const [x, y] = X(ev.pos); star4(g, x, y, 7, ev.hazard ? RED : GREEN);
      const tag = ev.type === 'launch' ? 'DEP' : ev.type === 'arrival' ? (m.summary.decel ? 'ARR' : 'FLYBY') : /coast|push/i.test(ev.label) ? 'MECO' : /Turnover/.test(ev.label) ? 'FLIP' : 'BRAKE';
      label(g, tag, x + 7, y + 13, ev.hazard ? RED : GREEN, 'left', 8.5, false);
    }
    const f = (time * 0.1) % 1; g.strokeStyle = WHITE; g.lineWidth = 1.3; g.setLineDash([]); g.strokeRect(cx + (tx - cx) * f - 3.5, cy + (ty - cy) * f - 3.5, 7, 7);
    const S = m.summary, dur = d => d < 400 ? Math.round(d) + ' D' : (d / 365.25 < 100 ? (d / 365.25).toFixed(1) : Math.round(d / 365.25).toLocaleString('en-US')) + ' YR';
    label(g, `${m.name.toUpperCase()} → ${tgt.name.toUpperCase()}`, 10, 16, WHITE);
    label(g, `EARTH ${dur(S.earth_days)} · SHIP ${dur(S.ship_days)} · ${(S.beta * 100).toFixed(S.beta > 0.99 ? 1 : 0)}% C`, 10, h - 10, GREEN_DIM, 'left', 8.5);
  }
}
