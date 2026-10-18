// Crew radiation in the browser: the planner's model (planner/starship/radiation.py) ported so storms can be
// rolled live and dose recomputed for any shielding. Parameters come from missions/solar.json (export_solar.py).
//   GCR    rate from the solar modulation potential, which follows the sunspot cycle; light shielding barely helps.
//   Storms non-homogeneous Poisson process with rate proportional to sunspot number; sizes bootstrapped from the
//          1956-2023 >30 MeV event catalogue; dose scaled from the August 1972 event behind the shielding.
//   Belts  per-pass doses from the mission file, rescaled for the shielding.
let M = null;
export async function loadRadModel() { if (!M) M = await fetch('missions/solar.json').then(r => r.json()); return M; }
export const ready = () => !!M;

// ------------------------------------------------------------------ risk coefficients
// Cancer incidence: BEIR VII Table 12D-1 lifetime attributable risk, exposure at 35-40, sexes averaged: ~8 %/Sv
// (6.5-6.7 % male, 8.9-9.8 % female), about 1.8x the mortality figure. NASA's 600 mSv career limit is the dose giving a
// mean 3 % risk of exposure-induced death for a 35-year-old woman (NASEM 2021). NASA's own 95 % interval on
// space-radiation cancer risk runs ~3x below to ~3.5x above the mean (Cucinotta et al., NASA TM-2012-217361).
// Radiation sickness: vomiting in ~10 % at 1 Gy, 10-50 % at 1-2 Gy, 70-90 % at 2-4 Gy (IAEA Safety Reports 2, via
// REMM) -> lognormal dose-response with median 1.8 Gy and sigma 0.46. Storm BFO dose equivalent is used as Gy, which
// overstates it slightly (cautious).
export const RISK = {
  cancerPerSv: 0.08, cancerRange: [0.027, 0.28],
  baseline: 0.40,                                // lifetime cancer incidence without any space exposure (US)
  arsMedian: 1800, arsSigma: 0.46, arsThreshold: 1000,
  career: 600, bfo30: 250, bfo365: 500,          // NASA-STD-3001 limits, mSv
};
const erf = x => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
export const sickness = D => D <= 0 ? 0 : 0.5 * (1 + erf(Math.log(D / RISK.arsMedian) / (RISK.arsSigma * Math.SQRT2)));   // D: acute mSv

// ------------------------------------------------------------------ shielding
// wall: water added round the crew cabin (g/cm²); shelter: storm-shelter water (g/cm², 0 = none).
// Masses use a 9 m x 10 m crew deck (~410 m²) and a 1.6 m x 2.4 m shelter (~40 m²): 1 g/cm² = 10 kg/m².
export const HULL = 3.2;   // g/cm², 4 mm 304L stainless (planner HULL_GCM2)
export const cancerChance = D => 1 - Math.exp(-RISK.cancerPerSv * D / 1000);   // D in mSv
export const CABIN_M2 = 410, SHELTER_M2 = 40, BASE_SHELTER = 20;
export const shieldMass = s => (CABIN_M2 * s.wall + SHELTER_M2 * (s.shelter - BASE_SHELTER)) * 0.01;   // t above baseline
// GCR effective dose vs water depth at solar minimum (NASA TM-2012-217361 Table 6a: 0.57/0.53/0.48/0.46 Sv/yr at
// 5/10/20/40 g/cm²). The hull counts as the 5 g/cm² point; added water moves along the curve. It flattens past
// ~20-30 g/cm² as secondary neutrons build up, so even 40 g/cm² only cuts cosmic rays by about a fifth.
const GCR_DEPTH = [[5, 0.57], [10, 0.53], [20, 0.48], [40, 0.46], [80, 0.46]];
export const gcrFactor = w => interp(5 + w, GCR_DEPTH.map(p => p[0]), GCR_DEPTH.map(p => p[1])) / 0.57;
const EARTH_BELT_L = 20 / Math.log(1 / 0.467);   // g/cm² e-folding that reproduces Artemis I shelter vs wall (134/287)

// ------------------------------------------------------------------ small helpers
function interp(x, xs, ys, right) {
  const n = xs.length; if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return right ?? ys[n - 1];
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  return ys[lo] + (x - xs[lo]) / (xs[hi] - xs[lo]) * (ys[hi] - ys[lo]);
}
export function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const normal = r => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
function poisson(r, lam) { if (lam < 1e-9) return 0; const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
export const yr = jd => 2000 + (jd - 2451545) / 365.25;
export const jdOf = y => 2451545 + (y - 2000) * 365.25;

// ------------------------------------------------------------------ solar activity
let shapeT = null;
export function ssn(y, draw) {
  const S = M.ssn; if (!shapeT) shapeT = S.shape.map((_, k) => k * S.shape_dt);
  let v;
  if (y <= S.ot[S.ot.length - 1]) v = interp(y, S.ot, S.obs);
  else if (y <= S.pt[S.pt.length - 1]) {
    const med = interp(y, S.pt, S.med), q = draw ? draw.q : 0;
    v = med + q * (q > 0 ? interp(y, S.pt, S.hi) - med : med - interp(y, S.pt, S.lo));
  } else v = 0;
  const st = draw ? draw.start : (S.c26_start[0] + S.c26_start[1]) / 2, amp = draw ? draw.amp : S.amp_median;
  if (y > st) v = Math.max(v, amp * interp(y - st, shapeT, S.shape, S.shape[S.shape.length - 1]));
  return Math.max(v, 0);
}
export const phi = (y, draw) => M.phi.a + M.phi.b * ssn(y - M.phi.lag, draw);
export const gcrRate = (ph, r) => Math.exp(M.gcr.c0 - M.gcr.inv_phi0 * ph) * (1 + M.gcr.grad * (r - 1));
const solarDraw = r => ({ amp: M.ssn.cycle_max[Math.floor(r() * M.ssn.cycle_max.length)], start: M.ssn.c26_start[0] + r() * (M.ssn.c26_start[1] - M.ssn.c26_start[0]), q: r() * 2 - 1 });
// Sunspot forecast band (median, 10th and 90th percentile over solar-cycle draws) for charts.
export function ssnBand(y0, y1, step = 1 / 12, n = 160) {
  const ys = []; for (let y = y0; y <= y1 + 1e-9; y += step) ys.push(y);
  const r = rng(7), draws = Array.from({ length: n }, () => solarDraw(r));
  const lo = [], hi = [], med = ys.map(y => ssn(y));
  for (const y of ys) { const v = draws.map(d => ssn(y, d)).sort((a, b) => a - b); lo.push(v[Math.floor(n * 0.1)]); hi.push(v[Math.floor(n * 0.9)]); }
  return { ys, med, lo, hi };
}

// August-1972 BFO dose equivalent (mSv) behind x g/cm² Al, log-linear in the 5/10/20 g/cm² table, extrapolated outside.
export function d72(x) {
  const T = M.spe.d72, ly = T.map(p => Math.log(p[1]));
  if (x < 5) return Math.exp(ly[0] + (ly[1] - ly[0]) / 5 * (x - 5));
  if (x > 20) return Math.exp(ly[2] + (ly[2] - ly[1]) / 10 * (x - 20));
  return Math.exp(interp(x, T.map(p => p[0]), ly));
}

// ------------------------------------------------------------------ mission simulation
// Per-mission arrays that do not depend on shielding or the storm draw.
function prep(m, reg) {
  const R = m.radiation, J = R.jd, n = J.length, Y = J.map(yr), dt = J.map((x, i) => i ? x - J[i - 1] : 0);
  const surf = new Uint8Array(n), geo = new Float64Array(n).fill(1), srate = new Float64Array(n), dsurf = new Float64Array(n);
  let ssd = 0;
  const regUsed = R.regolith_used ?? 0, regF = x => { if (!R.regolith) return 1; const k = Object.keys(R.regolith).find(q => Math.abs(parseFloat(q) - x) < 1e-6); return k ? R.regolith[k] : 1; };
  const rg = reg ?? regUsed, MS = M.mars_surface;
  for (const st of R.stays || []) for (let i = 0; i < n; i++) if (J[i] >= st.jd0 && J[i] <= st.jd1) {
    if (st.kind === 'surface') { surf[i] = 1; srate[i] = st.rate * regF(rg) / regF(regUsed); dsurf[i] = MS.spe_factor * d72(MS.column_gcm2 + MS.regolith_gcm2_per_m * rg); ssd = (st.rate_sd || 0) / st.rate; }
    else geo[i] = st.geo ?? 1;
  }
  const gc = Y.map((y, i) => gcrRate(phi(y), R.r_au[i]) * geo[i]);
  return { R, J, n, Y, dt, surf, geo, srate, dsurf, ssd, gc };
}

function beltDoses(R, s) {
  const xh = M.hull_gcm2 * M.steel_al, xc = xh + s.wall, xs = xc + s.shelter, [vx, va] = M.jup_vault;
  const att = x => Math.pow(va, -Math.min(x, vx) / vx);
  return (R.belts || []).map(b => {
    let cab, sh;
    if (b.body === 'jupiter') { const u = b.hull / att(xh); cab = u * att(xc); sh = u * att(xs); }
    else { cab = b.hull * Math.exp(-s.wall / EARTH_BELT_L); sh = b.hull * Math.exp(-(s.wall + s.shelter) / EARTH_BELT_L); }
    return { ...b, cab, dose: s.shelter > 0 ? sh : cab };
  });
}

// Roll one storm history. draw = null uses the median solar cycle.
function rollStorms(P, r, draw) {
  const out = [], flu = M.spe.flu, k = M.spe.k;
  for (let j = 1; j < P.n; j++) {
    const lam = k * ssn(P.Y[j], draw) / 365.25 * P.dt[j], c = poisson(r, lam);
    for (let q = 0; q < c; q++) {
      const ra = P.R.r_au[j], a = ra > 1 ? 2 + r() : 2, F = flu[Math.floor(r() * flu.length)];
      out.push({ j, jd: P.J[j - 1] + r() * P.dt[j], s: F * Math.pow(ra, -a), F, r: ra, surf: !!P.surf[j] });
    }
  }
  return out;
}
function stormDose(ev, P, s) {
  if (ev.surf) return P.dsurf[ev.j] * ev.s;
  const xc = M.hull_gcm2 * M.steel_al + s.wall, cab = d72(xc) * ev.s;
  return s.shelter > 0 ? cab * M.spe.pre_shelter + d72(xc + s.shelter) * ev.s * (1 - M.spe.pre_shelter) : cab;
}

const pct = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1) + 0.5)))];
function windowMax(cum, J, days) {
  let best = 0, j = 0;
  for (let i = 0; i < cum.length; i++) { while (j < cum.length - 1 && J[j + 1] <= J[i] + days) j++; best = Math.max(best, cum[j] - cum[i]); }
  return best;
}

// Full analysis: many rollouts for the statistics plus arrays for the chart.
//   s = { wall, shelter }, opts = { n, seed, reg, series }
export function analyse(m, s, opts = {}) {
  if (!M || !m.radiation || !m.radiation.r_au) return null;
  const n = opts.n ?? 600, P = prep(m, opts.reg), r = rng(opts.seed ?? 11), N = P.n, f0 = gcrFactor(s.wall);
  const belts = beltDoses(P.R, s), beltArr = new Float64Array(N);
  for (const b of belts) { let j = 0; while (j < N - 1 && P.J[j] < b.jd) j++; beltArr[j] += b.dose; }
  const gcrC = new Float64Array(N), surfC = new Float64Array(N), beltC = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const rate = P.surf[i] ? P.srate[i] : P.gc[i] * f0;
    gcrC[i] = (i ? gcrC[i - 1] : 0) + rate * P.dt[i]; surfC[i] = (i ? surfC[i - 1] : 0) + (P.surf[i] ? P.srate[i] * P.dt[i] : 0); beltC[i] = (i ? beltC[i - 1] : 0) + beltArr[i];
  }
  const tot = [], gcrT = [], speT = [], maxEv = [], nBig = [], w30 = [], w365 = [], acute = [];
  const series = opts.series !== false, cols = series ? Array.from({ length: N }, () => new Float32Array(n)) : null;
  const cum = new Float64Array(N), spe = new Float64Array(N), beltMax = Math.max(0, ...belts.map(b => b.dose));
  for (let i = 0; i < n; i++) {
    const dr = solarDraw(r), pn = normal(r) * M.phi.sigma, f = i ? Math.max(0.3, 1 + normal(r) * M.gcr.factor_sd) : 1, sf = i ? Math.max(0.3, 1 + normal(r) * P.ssd) : 1;
    spe.fill(0); let mx = 0, big = 0;
    for (const ev of rollStorms(P, r, dr)) { const d = stormDose(ev, P, s); spe[ev.j] += d; mx = Math.max(mx, d); if (ev.F * Math.pow(ev.r, -2) >= M.spe.big) big++; }
    let g = 0, sp = 0;
    for (let j = 0; j < N; j++) {
      const rate = P.surf[j] ? P.srate[j] * sf : gcrRate(phi(P.Y[j], dr) + pn, P.R.r_au[j]) * P.geo[j] * f0 * f;
      g += rate * P.dt[j]; sp += spe[j]; cum[j] = g + sp + beltC[j];
      if (cols) cols[j][i] = cum[j];
    }
    tot.push(cum[N - 1]); gcrT.push(g); speT.push(sp); maxEv.push(mx); nBig.push(big); acute.push(Math.max(mx, beltMax));
    w30.push(windowMax(cum, P.J, 30)); w365.push(windowMax(cum, P.J, 365));
  }
  const sorted = a => Float64Array.from(a).sort(), mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const T = sorted(tot), S = sorted(speT), G = sorted(gcrT), W30 = sorted(w30), W365 = sorted(w365);
  const cancer = cancerChance;
  const res = {
    s, n, belts, P, f0,
    mean: mean(tot), p05: pct(T, 0.05), p50: pct(T, 0.5), p95: pct(T, 0.95),
    gcr: gcrC[N - 1], gcr_p05: pct(G, 0.05), gcr_p95: pct(G, 0.95), spe_mean: mean(speT), spe_p95: pct(S, 0.95),
    belt: beltC[N - 1], surface: surfC[N - 1], win30: pct(W30, 0.95), win365: pct(W365, 0.95),
    pBig: nBig.filter(x => x > 0).length / n, nBig: mean(nBig), pArs: acute.reduce((a, x) => a + sickness(x), 0) / n, maxEv95: pct(sorted(maxEv), 0.95),
    cancer: cancer(mean(tot)), cancerBad: cancer(pct(T, 0.95)),
    cancerLo: 1 - Math.exp(-RISK.cancerRange[0] * mean(tot) / 1000), cancerHi: 1 - Math.exp(-RISK.cancerRange[1] * mean(tot) / 1000),
    gcrC, surfC, beltC,
  };
  if (cols) { res.band = { lo: new Float64Array(N), mid: new Float64Array(N), hi: new Float64Array(N) }; for (let j = 0; j < N; j++) { const c = cols[j].sort(); res.band.lo[j] = pct(c, 0.05); res.band.mid[j] = mean(c); res.band.hi[j] = pct(c, 0.95); } }
  return res;
}

// One storm history to play out on the timeline (median solar cycle, random storm timing and size).
export function rollout(A, seed) {
  const P = A.P, r = rng(seed), evs = rollStorms(P, r, null).map(ev => ({ ...ev, dose: stormDose(ev, P, A.s), cabin: ev.surf ? P.dsurf[ev.j] * ev.s : d72(M.hull_gcm2 * M.steel_al + A.s.wall) * ev.s }));
  const N = P.n, speC = new Float64Array(N), tot = new Float64Array(N);
  for (const ev of evs) speC[ev.j] += ev.dose;
  for (let j = 0; j < N; j++) { if (j) speC[j] += speC[j - 1]; tot[j] = A.gcrC[j] + A.beltC[j] + speC[j]; }
  return { seed, storms: evs.sort((a, b) => a.jd - b.jd), speC, tot, big: evs.filter(e => e.F * Math.pow(e.r, -2) >= M.spe.big) };
}
// Storm size label from the fluence relative to August 1972 (at 1 AU).
export const stormClass = F => F >= 0.5 ? 'extreme' : F >= 0.1 ? 'severe' : F >= 0.02 ? 'strong' : 'minor';
