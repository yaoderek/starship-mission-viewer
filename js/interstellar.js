// Interstellar mission model: special-relativistic constant-acceleration flight.
// Output mirrors the planetary mission files (summary / traj / events / radiation / risk),
// so the dashboard panels can render either kind.
import { STARS, STAR_VEHICLES } from './catalog.js';
import { yearJd, sig, dur, mass, fmtDate } from './fmt.js';

const C = 299792458, G0 = 9.80665, LY = 9.4607304725808e15, DAY = 86400, YR = 365.25 * DAY, AU_LY = 1 / 63241.077;
const OBL = 23.4392811 * Math.PI / 180;

// Unit vector toward a star in ecliptic J2000 coordinates (same frame as the sky backdrop).
export function starDir(s) {
  const ra = s.ra * Math.PI / 180, de = s.dec * Math.PI / 180;
  const x = Math.cos(de) * Math.cos(ra), y = Math.cos(de) * Math.sin(ra), z = Math.sin(de);
  return [x, y * Math.cos(OBL) + z * Math.sin(OBL), -y * Math.sin(OBL) + z * Math.cos(OBL)];
}
export const starPos = s => starDir(s).map(v => v * s.ly);

// Flight profile for distance d (m). Returns phase durations and a state(tEarth) function.
export function profile(p, dly) {
  const d = dly * LY, k = p.decel ? 2 : 1;
  if (p.kind === 'ballistic') {
    const v = p.vkms * 1000, T = d / v, b = v / C, g = 1 / Math.sqrt(1 - b * b);
    return { k, w: Math.atanh(b), beta: b, gamma: g, tAcc: 0, tauAcc: 0, xAcc: 0, tCoast: T, tauCoast: T / g, T, tau: T / g, wUsed: 0, mr: 1, a: Infinity,
      state: t => ({ x: Math.min(d, v * t) / LY, beta: t < T ? b : 0, tau: Math.min(t, T) / g, phase: t < T ? 'coast' : 'arrived' }) };
  }
  const a = p.accel * G0;
  let wAvail = Infinity;
  if (p.kind === 'rocket' && !p.followBook) wAvail = p.ve * Math.log((p.dry + p.prop) / p.dry) / k;
  if (p.beta) wAvail = Math.min(wAvail, Math.atanh(Math.min(p.beta, 0.999999)));
  const wTurn = Math.acosh(1 + a * d / (k * C * C));
  const w = Math.min(wAvail, wTurn);
  const xAcc = C * C / a * (Math.cosh(w) - 1), tAcc = C / a * Math.sinh(w), tauAcc = C / a * w;
  const beta = Math.tanh(w), gamma = Math.cosh(w);
  const coast = Math.max(0, d - k * xAcc), tCoast = beta > 0 ? coast / (beta * C) : Infinity, tauCoast = tCoast / gamma;
  const T = k * tAcc + tCoast, tau = k * tauAcc + tauCoast;
  const wUsed = p.kind === 'rocket' ? k * w : 0, mr = p.kind === 'rocket' ? Math.exp(wUsed / p.ve) : 1;
  const accel = t => { const u = Math.asinh(a * t / C); return { x: C * C / a * (Math.cosh(u) - 1), beta: Math.tanh(u), tau: C / a * u }; };
  const state = t => {
    if (t <= tAcc) { const s = accel(t); return { x: s.x / LY, beta: s.beta, tau: s.tau, phase: 'accel' }; }
    if (t <= tAcc + tCoast) { const dt = t - tAcc; return { x: (xAcc + beta * C * dt) / LY, beta, tau: tauAcc + dt / gamma, phase: 'coast' }; }
    if (!p.decel) { const dt = t - tAcc; return { x: Math.min(d, xAcc + beta * C * dt) / LY, beta: t < T ? beta : 0, tau: tauAcc + Math.min(dt, tCoast) / gamma, phase: t < T ? 'coast' : 'arrived' }; }
    const left = Math.max(0, T - t), s = accel(left);
    return { x: (d - s.x) / LY, beta: s.beta, tau: tau - s.tau, phase: left > 0 ? 'decel' : 'arrived' };
  };
  return { k, w, beta, gamma, tAcc, tauAcc, xAcc, tCoast, tauCoast, T, tau, wUsed, mr, a, wAvail, wTurn, state };
}

// GCR effective dose rate behind s g/cm² of water. Thin shields barely help (secondaries offset
// the primaries removed), so the MSL/RAD cruise value of 1.84 mSv/d holds up to ~20 g/cm²; beyond
// that a two-exponential falloff, rough past ~100 g/cm². Outside the heliosphere ×1.36 (~2.5 mSv/d).
const shieldF = s => 0.55 * Math.exp(-s / 20) + 0.45 * Math.exp(-s / 250);
const gcrRate = (s, absorbs, outside) => absorbs ? 0.02 : 1.84 * Math.min(1, shieldF(s) / shieldF(20)) * (outside ? 1.36 : 1);

// Kinetic energy (MeV) of an interstellar hydrogen atom seen from a ship at speed beta.
const protonMeV = g => (g - 1) * 938.272;
// Water range (cm) for protons; Bragg-Kleeman fit, extrapolated above ~300 MeV.
const protonRange = E => 0.0022 * Math.pow(E, 1.77);
// Dose rate (mSv per day of ship time) from interstellar hydrogen hitting the bow at speed beta. In the ship frame
// the gas is denser by gamma, so the flux is gamma·n·beta·c. If the forward shield (or Astrophage) is thicker than
// the proton range it stops them; otherwise they pass through the crew at ~1.5 nSv·cm² each (GeV class).
const ISM_N = 0.2;   // neutral H per cm³, local interstellar medium (Crawford 2011)
function gasRate(beta, p) {
  if (beta < 1e-4) return 0;
  const g = 1 / Math.sqrt(1 - beta * beta), E = protonMeV(g);
  if (p.absorbs || p.frontal >= protonRange(E)) return 0;
  return g * ISM_N * beta * C * 100 * 1.5e-9 * (E > 30 ? 1 : E / 30) * 1000 * 86400;
}

export function buildMission(star, veh, params, launchYear = 2035, label) {
  const p = { ...veh.p, ...params };
  const pr = profile(p, star.ly), jd0 = yearJd(launchYear), dir = starDir(star), N = 400;
  const T = pr.T, days = T / DAY, tauDays = pr.tau / DAY;
  const traj = [], rad = { jd: [], r_au: [], gcr_rate: [], gcr_cum: [], belt_cum: [], belt_cum_sh: [], spe_mean: [], spe_p95: [], spe_mean_sh: [], spe_p95_sh: [],
    tot_mean: [], tot_p95: [], tot_mean_sh: [], tot_p95_sh: [], spe_p30: [], beta: [], tau: [], belts: [], gas_cum: [] };
  let cum = 0, gas = 0, prevTau = 0, peak = 0;
  for (let i = 0; i <= N; i++) {
    const t = T * i / N, s = pr.state(t), x = s.x;
    traj.push([jd0 + t / DAY, dir[0] * x, dir[1] * x, dir[2] * x]);
    const outside = x > 120 * AU_LY, r = gcrRate(p.shield, p.absorbs, outside), rg = gasRate(s.beta, p), dtau = (s.tau - prevTau) / DAY;
    cum += r * dtau; gas += rg * dtau; prevTau = s.tau; peak = Math.max(peak, r + rg);
    rad.jd.push(jd0 + t / DAY); rad.r_au.push(x); rad.gcr_rate.push(r + rg); rad.gcr_cum.push(cum); rad.gas_cum.push(gas); rad.beta.push(s.beta); rad.tau.push(s.tau / DAY);
    for (const k of ['belt_cum', 'belt_cum_sh', 'spe_mean', 'spe_p95', 'spe_mean_sh', 'spe_p95_sh', 'spe_p30']) rad[k].push(0);
    rad.tot_mean.push(cum + gas); rad.tot_mean_sh.push(cum + gas); rad.tot_p95.push(cum * 1.6 + gas * 3); rad.tot_p95_sh.push(cum * 1.6 + gas * 3);
  }
  const tot = cum + gas, tot95 = cum * 1.6 + gas * 3;   // gas dose is an order-of-magnitude estimate
  rad.totals = { gcr: cum, gcr_p05: cum * 0.6, gcr_p95: cum * 1.6, gas, belts: 0, belts_sh: 0, spe_mean: 0, spe_p95: 0, spe_mean_sh: 0, spe_p95_sh: 0,
    total_mean: tot, total_p95: tot95, total_mean_sh: tot, total_p95_sh: tot95, win30_p95: Math.min(tot95, peak * 30 * 1.6), win30_p95_sh: Math.min(tot95, peak * 30 * 1.6),
    win365_p95: Math.min(tot95, peak * 365 * 1.6), win365_p95_sh: Math.min(tot95, peak * 365 * 1.6), acute: Math.min(tot, peak * 2), peak_rate: peak, days: tauDays, shelter_gcm2: p.shield, hull_gcm2: p.shield };
  rad.limits = { career: 600, bfo_30d: 250, bfo_1yr: 500 };
  rad.interstellar = true;

  const jdA = jd0 + pr.tAcc / DAY, jdC = jd0 + (pr.tAcc + pr.tCoast) / DAY, jdEnd = jd0 + days;
  const posAt = t => { const x = pr.state(t).x; return dir.map(v => v * x); };
  const cpct = b => b >= 0.01 ? (b * 100).toFixed(b >= 0.99 ? 1 : b >= 0.1 ? 0 : 1) + '% c' : (b * C / 1000).toFixed(1) + ' km/s';
  const events = [{ type: 'launch', body: 'earth', jd: jd0, pos: [0, 0, 0], dv: 0, label: p.kind === 'beam' ? 'Laser array fires' : 'Departure from Earth orbit', hazard: false, speed: 0 }];
  if (p.kind !== 'ballistic') {
    if (pr.tCoast > 1) events.push({ type: 'dsm', jd: jdA, pos: posAt(pr.tAcc), dv: 0, label: p.kind === 'beam' ? `Laser push ends, coast at ${cpct(pr.beta)}` : `Engines off, coast at ${cpct(pr.beta)}`, hazard: false, speed: pr.beta });
    else if (p.decel) events.push({ type: 'dsm', jd: jdA, pos: posAt(pr.tAcc), dv: 0, label: `Turnover at ${cpct(pr.beta)}, start braking`, hazard: false, speed: pr.beta });
    if (p.decel && pr.tCoast > 1) events.push({ type: 'dsm', jd: jdC, pos: posAt(pr.tAcc + pr.tCoast), dv: 0, label: 'Flip and start braking burn', hazard: false, speed: pr.beta });
  }
  events.push({ type: 'arrival', body: star.id, jd: jdEnd, pos: dir.map(v => v * star.ly), dv: 0,
    label: p.decel ? `Arrive at ${star.name}` : `Fly past ${star.name} at ${cpct(pr.beta)}`, hazard: !p.decel && pr.beta > 0.05, speed: p.decel ? 0 : pr.beta });
  const phases = [];
  if (p.kind !== 'ballistic') phases.push({ name: p.decel || pr.tCoast > 1 ? 'acceleration' : 'acceleration', jd0, jd1: jdA });
  if (pr.tCoast > 1) phases.push({ name: 'cruise', jd0: p.kind === 'ballistic' ? jd0 : jdA, jd1: jdC });
  if (p.decel) phases.push({ name: 'braking', jd0: jdC, jd1: jdEnd });

  const propUsed = p.kind === 'rocket' ? p.dry * (pr.mr - 1) : 0;
  const mCruise = p.kind === 'rocket' ? p.dry * Math.exp((pr.k - 1) * pr.w / p.ve) : p.dry;
  const summary = {
    launch: String(launchYear), arrive: String(Math.round(launchYear + T / YR)), earth_days: days, ship_days: tauDays, total_days: days, tof_years: T / YR,
    beta: pr.beta, gamma: pr.gamma, mr: pr.mr, prop_t: p.prop, prop_used_t: propUsed, dry_t: p.dry, decel: p.decel, crew: p.crew, kind: p.kind,
    ke_J: (pr.gamma - 1) * mCruise * 1000 * C * C, accel: p.accel, ve: p.ve, wUsed: pr.wUsed, wTurn: pr.wTurn, turnover: pr.tCoast <= 1,
    feasible: p.kind !== 'rocket' || propUsed <= p.prop * 1.000001, dose_mean: tot, dose_p95: tot95, dose_mean_sh: tot, dose_p95_sh: tot95,
  };
  for (const e of events) e.date = fmtDate(e.jd);
  const risk = interstellarRisks(star, p, pr, summary, jd0, jdA, jdC, jdEnd);
  summary.risk_high = risk.filter(r => r.level === 'HIGH').length;
  return { rank: 0, name: label || veh.name, model: veh.tag, vehicleId: veh.id, params: p, mode: p.decel ? 'rendezvous' : 'flyby', summary, traj, events, phases, radiation: rad, risk, hazards: [] };
}

function interstellarRisks(star, p, pr, S, jd0, jdA, jdC, jdEnd) {
  const R = [], g = pr.gamma, b = pr.beta, E = protonMeV(g), n = 0.2;                 // local ISM: neutral H 0.19 cm⁻³ (Crawford 2011)
  const flux = n * b * C * 100;                                                       // atoms per cm² per second
  const range = protonRange(E), shieldOK = p.frontal >= range || p.absorbs;
  const unshielded = flux * 1.5e-9 * 3600 * (E > 30 ? 1 : E / 30);                   // Sv/h, ~1.5 nSv·cm² per GeV-class proton
  const crewed = p.crew > 0;
  if (b > 0.01) R.push({ id: 'ism', cat: 'Cruise', title: 'Interstellar gas hits the bow as a particle beam', value: E, unit: 'MeV per hydrogen atom',
    prob: null, level: shieldOK ? 'LOW' : 'HIGH', basis: 'quantitative', jd0: jdA, jd1: jdC,
    note: `At ${(b * 100).toFixed(b > 0.99 ? 1 : 0)}% of light speed every hydrogen atom arrives with ${sig(E)} MeV, about ${sig(flux)} per cm² per second. Stopping them takes roughly ${range >= 100 ? sig(range / 100) + ' m' : sig(range) + ' cm'} of water ahead of the crew${p.absorbs ? '; in the novel the Astrophage fuel absorbs it' : `; this design carries about ${sig(p.frontal)} g/cm²`}. Unshielded dose would be on the order of ${sig(unshielded)} Sv per hour${shieldOK ? '' : `, which ${crewed ? 'would kill the crew' : 'would kill any crew aboard'} within ${unshielded > 10 ? 'minutes' : unshielded > 0.5 ? 'hours' : 'days'}`}.`,
    source: 'Semyonov 2020 https://arxiv.org/abs/2004.10079' });
  const dustKg = 6.2e-24 * star.ly * LY, eDust = (g - 1) * dustKg * C * C;            // local dust mass density (Crawford 2011)
  const grain = (g - 1) * 1e-9 * C * C;
  if (b > 0.001) R.push({ id: 'dust', cat: 'Cruise', title: 'Dust impacts on the forward shield', value: eDust / 1e9, unit: 'GJ per m² of frontal area over the trip',
    prob: null, level: b > 0.1 ? 'HIGH' : b > 0.03 ? 'MED' : 'LOW', basis: 'quantitative', jd0: jdA, jd1: jdEnd,
    note: `The ship sweeps up roughly ${sig(dustKg * 1000)} g of dust per m² on the way. A single microgram grain hits with ${sig(grain / 1000)} kJ (${sig(grain / 4.184e3)} g of TNT). Shield erosion sets the size of the bow shield.`,
    source: 'Hoang et al. 2017, ApJ 837:5 https://arxiv.org/abs/1608.05284' });
  if (crewed) {
    const yrs = S.ship_days / 365.25;
    R.push({ id: 'duration', cat: 'Crew', title: `${dur(S.ship_days)} of ship time with no resupply`, value: yrs, unit: 'years aboard',
      prob: null, level: yrs > 10 ? 'HIGH' : yrs > 2 ? 'MED' : 'LOW', basis: 'qualitative', jd0, jd1: jdEnd,
      note: yrs > 50 ? 'Longer than a working lifetime. This only works as a generation ship or with suspended animation.' : p.absorbs ? 'In the novel the crew rides the trip in a medically induced coma, which also spares them the years of 1.5 g.' : 'No abort and no help. Every consumable, spare and medical capability has to be aboard at launch.', source: '' });
    if (p.accel >= 0.5 && pr.tauAcc > 30 * DAY) R.push({ id: 'g', cat: 'Crew', title: `Sustained ${p.accel} g for ${dur(pr.tauAcc * pr.k / DAY)}`, value: p.accel, unit: 'g',
      prob: null, level: p.accel > 1.2 ? 'MED' : 'LOW', basis: 'qualitative', jd0, jd1: jdEnd,
      note: p.accel > 1.2 ? `Years above 1 g load the heart and spine.${p.absorbs ? ' The Hail Mary crew sleep through it in comas.' : ''}` : 'Roughly Earth gravity; comfortable, and no zero-g bone loss while the engine runs.', source: '' });
  }
  const light = star.ly;
  R.push({ id: 'comms', cat: 'Ops', title: 'Talking to Earth', value: light, unit: 'years for a signal to reach Earth from the target', prob: null, level: 'INFO', basis: 'quantitative', jd0: jdEnd, jd1: jdEnd,
    note: `News of arrival reaches Earth ${sig(light)} years later, ${sig(S.earth_days / 365.25 + light)} years after launch. ${b > 0.5 ? `Signals sent from the ship are Doppler-stretched by up to ${sig(Math.sqrt((1 + b) / (1 - b)))}×.` : ''}`, source: '' });
  if (!p.decel && b > 0.01) R.push({ id: 'flyby', cat: 'Arrival', title: 'Flyby only: minutes inside the target system', value: 1 / (b * C) * 10 * 1.496e11 / 3600, unit: 'hours to cross 10 AU',
    prob: null, level: 'MED', basis: 'quantitative', jd0: jdEnd, jd1: jdEnd, note: 'No braking. All science happens during a single high-speed pass, and the data takes years to come home.', source: '' });
  if (p.kind === 'rocket' && p.ve >= 0.3) R.push({ id: 'fuel', cat: 'Propulsion', title: p.absorbs ? 'Astrophage containment' : 'Antimatter containment', value: S.prop_t * 1000 * C * C / 4.184e15, unit: 'megatons TNT equivalent stored',
    prob: null, level: 'HIGH', basis: 'quantitative', jd0, jd1: jdEnd, note: `The propellant is stored mass-energy. One kilogram released at once is about 21 megatons. ${p.absorbs ? 'In the novel the fuel is a living microbe that gives up its stored energy as infrared light, so the tanks are also the engine.' : 'Holding tonnes of antimatter is far beyond any demonstrated trap (nanograms).'}`, source: '' });
  if (!S.feasible) R.push({ id: 'prop', cat: 'Propulsion', title: p.followBook ? 'The book’s fuel load cannot fly this profile' : 'Not enough propellant for this profile', value: S.prop_used_t / p.prop, unit: '× more propellant needed than loaded', prob: null, level: 'HIGH', basis: 'quantitative', jd0, jd1: jdEnd,
    note: `Holding ${p.accel} g to turnover and braking back to rest needs a mass ratio of ${sig(S.mr)}: ${mass(S.prop_used_t)} of propellant for ${mass(p.dry)} of ship. ${mass(p.prop)} is loaded.${p.followBook ? ' Andy Weir has said he tuned the fuel figure to keep the story tense.' : ''}`, source: p.followBook ? 'Physics Today, "Science inspires but does not limit Andy Weir’s fiction" https://physicstoday.aip.org/news/science-inspires-but-does-not-limit-andy-weirs-fiction' : '' });
  return R;
}

// One mission per vehicle for the comparison table. The user's configured vehicle comes first.
export function buildInterstellar(star, vehId, params = {}, launchYear = 2035) {
  const veh = STAR_VEHICLES.find(v => v.id === vehId);
  const mine = buildMission(star, veh, params, launchYear, veh.name);
  const tweaked = Object.keys(params).some(k => params[k] !== veh.p[k]);
  if (tweaked) mine.name = veh.name + ' (custom)';
  mine.tags = ['yours'];
  const others = STAR_VEHICLES.filter(v => v.id !== vehId || tweaked).map(v => buildMission(star, v, {}, launchYear));
  const missions = [mine, ...others];
  // The Hail Mary is the one ship where the story and the rocket equation disagree; show both.
  const hm = missions.findIndex(m => m.vehicleId === 'hailmary');
  if (hm >= 0 && missions[hm].params.followBook) {
    const alt = buildMission(star, STAR_VEHICLES[0], { ...params, followBook: false }, launchYear, 'Hail Mary, fuel-limited');
    alt.model = `Same ship, only ${mass(alt.params.prop)} of fuel`; missions.splice(hm + 1, 0, alt);
    missions[hm].model = 'As flown in the book';
  }
  missions.forEach((m, i) => m.rank = i + 1);
  return { kind: 'interstellar', target: star.id, star, missions, vehicle: veh.name, launchYear };
}

export { STARS };
