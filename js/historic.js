// Historical robotic missions, rebuilt from their real launch and encounter dates.
// Planet positions: JPL approximate elements (js/ephem.js). Each leg between encounters is a
// zero-revolution Lambert arc, so flyby v∞ mismatches stand in for the real deep-space manoeuvres.
import { planetPos, planetVel, PLANET_NAMES, MU, KMS, AU_KM } from './ephem.js';
import { lambert, kepler, norm, sub } from './lambert.js';

const jdOf = s => Date.parse(s + 'T00:00:00Z') / 864e5 + 2440587.5;
const date = jd => new Date((jd - 2440587.5) * 864e5).toISOString().slice(0, 10);
const NASA = { voyager: 'https://science.nasa.gov/mission/voyager/', cassini: 'https://science.nasa.gov/mission/cassini/', m2020: 'https://science.nasa.gov/mission/mars-2020-perseverance/' };

export const HISTORIC = [
  { id: 'voyager2', name: 'Voyager 2', year: 1977, launcher: 'titan3e', launcherName: 'Titan IIIE / Centaur', hero: 'neptune', target: 'neptune',
    blurb: 'The Grand Tour: the only spacecraft to visit Uranus and Neptune, riding a planetary alignment that recurs every 175 years.',
    encounters: [['earth', '1977-08-20'], ['jupiter', '1979-07-09'], ['saturn', '1981-08-26'], ['uranus', '1986-01-24'], ['neptune', '1989-08-25']],
    facts: [['Launch vehicle', 'Titan IIIE / Centaur D-1T'], ['Launch site', 'Cape Canaveral LC-41'], ['Spacecraft mass', '722 kg'], ['Power', '3 RTGs, ~470 W at launch']],
    risk: [
      { level: 'HIGH', cat: 'Comms', at: '1978-04-05', title: 'Primary radio receiver failed eight months after launch', note: 'The backup receiver has a faulty tracking-loop capacitor, so Earth must predict the Doppler shift and transmit on the exact frequency it can still hear. Voyager 2 has flown the rest of its mission on that one receiver.', src: NASA.voyager },
      { level: 'MED', cat: 'Saturn', at: '1981-08-26', title: 'Scan platform jammed just after Saturn closest approach', note: 'The camera platform’s azimuth actuator seized while the spacecraft was behind Saturn; engineers traced it to lubricant loss and nursed it back with slow, careful moves for Uranus and Neptune.', src: NASA.voyager },
      { level: 'INFO', cat: 'Neptune', at: '1989-08-25', title: 'Neptune: four hours of one-way light time', note: 'Every command to Voyager 2 at Neptune took about four hours to arrive; the flyby sequence ran autonomously from onboard computers.', src: NASA.voyager },
    ] },
  { id: 'cassini', name: 'Cassini–Huygens', year: 1997, launcher: 'titan4b', launcherName: 'Titan IVB / Centaur', hero: 'saturn', target: 'saturn',
    blurb: 'NASA/ESA/ASI Saturn orbiter and Titan lander. Too heavy to fly direct, it took two Venus flybys, one of Earth and one of Jupiter.',
    encounters: [['earth', '1997-10-15'], ['venus', '1998-04-26'], ['venus', '1999-06-24'], ['earth', '1999-08-18'], ['jupiter', '2000-12-30'], ['saturn', '2004-07-01']],
    facts: [['Launch vehicle', 'Titan IVB / Centaur'], ['Launch site', 'Cape Canaveral SLC-40'], ['Launch mass', '5,712 kg'], ['Dry mass', '2,523 kg'], ['Reported launch C3', '16.6 km²/s²']], refC3: 16.6,
    risk: [
      { level: 'MED', cat: 'Earth flyby', at: '1999-08-18', title: 'Earth flyby carrying 33 kg of plutonium-238', note: 'Cassini’s three RTGs held about 32.7 kg of plutonium dioxide fuel. The flyby altitude was set so that the chance of an accidental re-entry was below one in a million.', src: NASA.cassini },
      { level: 'HIGH', cat: 'Cruise', at: '2000-02-01', title: 'Huygens receiver design flaw found in flight', note: 'A test in 2000 showed Huygens’ radio receiver could not handle the Doppler shift of the planned relay geometry. The whole Saturn tour was redesigned so the probe’s release came later and the orbiter flew a slower relay pass.', src: NASA.cassini },
      { level: 'HIGH', cat: 'Saturn', at: '2004-07-01', title: 'Saturn orbit insertion through the ring plane', note: 'A 96-minute main engine burn slowed Cassini into orbit after it crossed the ring plane through the gap between the F and G rings, using its high-gain antenna as a dust shield.', src: NASA.cassini },
    ] },
  { id: 'perseverance', name: 'Mars 2020 Perseverance', year: 2020, launcher: 'atlas541', launcherName: 'Atlas V 541', hero: 'mars', target: 'mars',
    blurb: 'NASA’s Jezero Crater rover, with the Ingenuity helicopter tucked underneath. Landed by sky crane with terrain-relative navigation.',
    encounters: [['earth', '2020-07-30'], ['mars', '2021-02-18']], entry: true,
    facts: [['Launch vehicle', 'Atlas V 541'], ['Launch site', 'Cape Canaveral SLC-41'], ['Spacecraft mass', '3,649 kg'], ['Rover mass', '1,025 kg'], ['Landing site', 'Jezero Crater']],
    risk: [
      { level: 'HIGH', cat: 'EDL', at: '2021-02-18', title: 'Seven minutes from atmosphere to wheels down', note: 'Entry, parachute and sky-crane descent ran on their own: an 11-minute light delay meant the landing was already over when Earth heard it had begun. Terrain-relative navigation steered clear of hazards in the crater.', src: NASA.m2020 },
      { level: 'INFO', cat: 'Mars', at: '2021-04-19', title: 'Ingenuity: first powered flight on another planet', note: 'The 1.8 kg helicopter rode under the rover and flew 72 times before a rotor blade broke in January 2024.', src: NASA.m2020 },
    ] },
];
export const historicById = id => HISTORIC.find(h => h.id === id);

function buildMission(h) {
  const enc = h.encounters.map(([body, d]) => ({ body, jd: jdOf(d) }));
  for (const e of enc) { e.r = planetPos(e.body, e.jd); e.vp = planetVel(e.body, e.jd); }
  const traj = [], legs = [];
  for (let i = 0; i < enc.length - 1; i++) {
    const a = enc[i], b = enc[i + 1], dt = b.jd - a.jd, { v1, v2 } = lambert(a.r, b.r, dt, MU), n = Math.max(60, Math.round(dt / 4));
    for (let k = i ? 1 : 0; k <= n; k++) { const t = dt * k / n, p = k === n ? b.r : kepler(a.r, v1, t, MU); traj.push([a.jd + t, p[0], p[1], p[2]]); }
    legs.push({ v1, v2 }); a.vout = v1; b.vin = v2;
  }
  const vinf = v => norm(v) * KMS, events = [];
  const c3 = Math.pow(vinf(sub(enc[0].vout, enc[0].vp)), 2);
  enc.forEach((e, i) => {
    const vin = e.vin ? vinf(sub(e.vin, e.vp)) : null, vout = e.vout ? vinf(sub(e.vout, e.vp)) : null, last = i === enc.length - 1;
    const cap = e.body[0].toUpperCase() + e.body.slice(1);
    const label = i === 0 ? `Launch from Earth, C3 ${c3.toFixed(1)} km²/s²` : last ? `${cap} ${h.entry ? 'atmospheric entry' : 'arrival'}, v∞ ${vin.toFixed(2)} km/s` : `${cap} flyby, v∞ ${vin.toFixed(2)} in / ${vout.toFixed(2)} out km/s`;
    events.push({ type: i === 0 ? 'launch' : last ? 'arrival' : 'flyby', body: e.body, jd: e.jd, date: date(e.jd), pos: e.r, dv: 0, label, hazard: false, vinf: vin });
  });
  const t0 = enc[0].jd, t1 = enc[enc.length - 1].jd, last = events[events.length - 1];
  const R = { mars: 3389.5 }[h.target], entry = h.entry && R ? Math.sqrt(last.vinf ** 2 + 2 * 42828.37 / (R + 125)) : null;   // 125 km entry interface
  const summary = { launch: date(t0), arrive: date(t1), total_days: t1 - t0, tof_years: (t1 - t0) / 365.25, c3, vinf_arr: last.vinf, entry_kms: entry,
    flybys: enc.slice(1, -1).map(e => e.body), feasible: true, historic: true, dv_total: null, tankers_needed: null };
  const risk = h.risk.map((r, k) => ({ id: h.id + k, cat: r.cat, title: r.title, value: null, unit: '', prob: null, level: r.level, basis: 'qualitative', jd0: jdOf(r.at), jd1: jdOf(r.at), note: r.note, source: r.src }));
  return { rank: 0, name: h.name, model: h.launcherName, vehicleId: h.launcher, historicId: h.id, target: h.target, mode: 'historic', summary, traj, events, phases: [], risk };
}

// One data object with all historical missions; planet tracks cover 1977–2022 at 3-day steps.
let cache = null;
export function buildHistoric() {
  if (cache) return cache;
  const j0 = jdOf('1977-01-01'), j1 = jdOf('2022-01-01'), planets = {};
  const COL = { mercury: 'gray', venus: 'goldenrod', earth: 'royalblue', mars: 'red', jupiter: 'orange', saturn: 'khaki', uranus: 'turquoise', neptune: 'navy' };
  const PER = { mercury: 87.97, venus: 224.7, earth: 365.256, mars: 686.98, jupiter: 4332.6, saturn: 10759, uranus: 30687, neptune: 60190 };
  for (const n of PLANET_NAMES) {
    const track = []; for (let jd = j0; jd <= j1; jd += 3) { const p = planetPos(n, jd); track.push([jd, p[0], p[1], p[2]]); }
    const orbit = []; for (let k = 0; k < 360; k++) orbit.push(planetPos(n, 2451545 + PER[n] * k / 360));
    planets[n] = { color: COL[n], orbit, track };
  }
  const missions = HISTORIC.map(buildMission); missions.forEach((m, i) => m.rank = i + 1);
  cache = { kind: 'historic', target: missions[0].target, vehicle: 'historical', planets, missions };
  return cache;
}
export { AU_KM };
