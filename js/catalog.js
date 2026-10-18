// Destinations, vehicles and preset missions.

// Planet destinations backed by precomputed trajectory files in missions/.
export const PLANETS = [
  { id: 'mercury', name: 'Mercury', file: 'mercury.json', blurb: 'Deep in the Sun’s gravity well. Expensive to stop.' },
  { id: 'venus', name: 'Venus', file: 'venus.json', blurb: 'Closest neighbour. Aerocapture into orbit, flyby returns.' },
  { id: 'mars', name: 'Mars', file: 'mars.json', blurb: 'Six-month transits, surface stays, propellant made on site.' },
  { id: 'jupiter', name: 'Jupiter', file: 'jupiter.json', blurb: 'Years in transit and a brutal radiation belt.' },
  { id: 'saturn', name: 'Saturn', file: 'saturn.json', blurb: 'Gravity assists or a very large propellant bill.' },
  { id: 'uranus', name: 'Uranus', file: 'uranus.json', blurb: 'A decade-plus cruise. Probes only, realistically.' },
  { id: 'neptune', name: 'Neptune', file: 'neptune.json', blurb: 'The edge of the planetary system.' },
];

// Nearby stars. RA/Dec J2000 in degrees, distance in light years, luminosity in Suns.
export const STARS = [
  { id: 'proxima', name: 'Proxima Centauri', short: 'Proxima', ra: 217.429, dec: -62.680, ly: 4.25, sp: 'M5.5Ve', lum: 0.0017, col: '#ff9a6a', blurb: 'Nearest star. Red dwarf with a planet in its habitable zone.' },
  { id: 'alphacen', name: 'Alpha Centauri', short: 'α Centauri', ra: 219.902, dec: -60.834, ly: 4.34, sp: 'G2V + K1V', lum: 2.0, col: '#fff1d6', blurb: 'Sun-like binary. The classic interstellar target.' },
  { id: 'barnard', name: 'Barnard’s Star', short: 'Barnard’s', ra: 269.452, dec: 4.693, ly: 5.96, sp: 'M4V', lum: 0.0035, col: '#ffa070', blurb: 'Project Daedalus’ target.' },
  { id: 'wolf359', name: 'Wolf 359', short: 'Wolf 359', ra: 164.120, dec: 7.015, ly: 7.86, sp: 'M6V', lum: 0.0011, col: '#ff8860', blurb: 'Dim flare star.' },
  { id: 'sirius', name: 'Sirius', short: 'Sirius', ra: 101.287, dec: -16.716, ly: 8.60, sp: 'A1V + DA2', lum: 25.4, col: '#cfe0ff', blurb: 'Brightest star in the night sky.' },
  { id: 'epseri', name: 'Epsilon Eridani', short: 'ε Eridani', ra: 53.233, dec: -9.458, ly: 10.50, sp: 'K2V', lum: 0.34, col: '#ffd2a0', blurb: 'Young star with a debris disk and a gas giant.' },
  { id: 'procyon', name: 'Procyon', short: 'Procyon', ra: 114.825, dec: 5.225, ly: 11.46, sp: 'F5IV', lum: 6.9, col: '#f4f1ff', blurb: 'Bright F-type subgiant.' },
  { id: 'tauceti', name: 'Tau Ceti', short: 'τ Ceti', ra: 26.017, dec: -15.938, ly: 11.91, sp: 'G8V', lum: 0.52, col: '#ffe6bf', blurb: 'Sun-like and stable. Where the Hail Mary went.' },
  { id: '40eri', name: '40 Eridani', short: '40 Eridani', ra: 63.818, dec: -7.653, ly: 16.34, sp: 'K0V', lum: 0.46, col: '#ffd9a8', blurb: 'Triple system. Home of Rocky in Project Hail Mary.' },
  { id: 'altair', name: 'Altair', short: 'Altair', ra: 297.696, dec: 8.868, ly: 16.73, sp: 'A7V', lum: 10.6, col: '#e8eeff', blurb: 'Fast-spinning bright star.' },
  { id: 'trappist1', name: 'TRAPPIST-1', short: 'TRAPPIST-1', ra: 346.622, dec: -5.041, ly: 40.66, sp: 'M8V', lum: 0.00055, col: '#ff7a50', blurb: 'Seven rocky planets, three in the habitable zone.' },
];

// Background stars drawn on the interstellar map but not offered as destinations.
export const MAP_STARS = [
  { name: 'Luyten’s Star', ra: 111.852, dec: 5.226, ly: 12.35, sp: 'M3.5V', lum: 0.0088, col: '#ff9a6a' },
  { name: 'Ross 128', ra: 176.935, dec: 0.804, ly: 11.01, sp: 'M4V', lum: 0.0036, col: '#ff9a6a' },
  { name: '61 Cygni', ra: 316.725, dec: 38.749, ly: 11.4, sp: 'K5V + K7V', lum: 0.24, col: '#ffc890' },
  { name: 'Epsilon Indi', ra: 330.840, dec: -56.786, ly: 11.87, sp: 'K5V', lum: 0.22, col: '#ffc890' },
  { name: 'Lalande 21185', ra: 165.836, dec: 35.970, ly: 8.31, sp: 'M2V', lum: 0.02, col: '#ffa070' },
];

// Chemical / nuclear vehicles for planetary missions. Masses in tonnes.
// Tankers: each tanker launch tops up `tanker` t of propellant in low Earth orbit.
export const SOLAR_VEHICLES = [
  { id: 'starship', name: 'Starship', tag: 'Baseline', blurb: 'Published SpaceX specs. Dry mass is an outside estimate.',
    p: { dry: 120, payload: 100, cap: 1600, isp: 375, tanker: 100, residual: 50, maxTankers: 12, wall: 0, shelter: 20 } },
  { id: 'starship-lite', name: 'Starship, optimistic', tag: 'Best case', blurb: 'Lighter ship (100 t) and fuller tankers (150 t) from the top of the public range.',
    p: { dry: 100, payload: 100, cap: 1600, isp: 380, tanker: 150, residual: 50, maxTankers: 12, wall: 0, shelter: 20 } },
  { id: 'starship-heavy', name: 'Starship, conservative', tag: 'Worst case', blurb: 'Heavier ship (150 t), 366 s blended Isp, 100 t tankers.',
    p: { dry: 150, payload: 100, cap: 1600, isp: 366, tanker: 100, residual: 50, maxTankers: 16, wall: 0, shelter: 20 } },
  { id: 'ntr', name: 'NASA nuclear thermal', tag: 'DRA 5.0', blurb: 'NASA’s 2009 reference Mars ship: hydrogen heated by fission reactors at about 906 s Isp. 356 t assembled from 3 heavy-lift launches.',
    p: { dry: 94, payload: 63, cap: 200, isp: 906, tanker: 70, residual: 0, maxTankers: 3, wall: 0, shelter: 20 } },
];

// Interstellar vehicles.
//   kind: rocket   - carries propellant, constant proper acceleration, relativistic rocket equation
//         beam     - pushed by an external laser; no propellant on board
//         ramjet   - scoops interstellar hydrogen; no propellant limit
//         ballistic- coasts at a fixed speed (for scale)
//   ve: exhaust speed as a fraction of c. accel in g. Masses in tonnes.
//   shield: crew shielding in g/cm² water-equivalent. frontal: forward shield against gas and dust.
export const STAR_VEHICLES = [
  { id: 'hailmary', name: 'Hail Mary', tag: 'Astrophage spin drive', crewed: true,
    blurb: 'Astrophage stores energy as mass and gives it off as infrared light, so the drive is a photon rocket with exhaust at light speed. Book figures: 100 t ship, 2,000 t of fuel, 1.5 g all the way.',
    p: { kind: 'rocket', ve: 1, accel: 1.5, dry: 100, prop: 2000, decel: true, crew: 3, shield: 20, frontal: 1000, absorbs: true, followBook: true },
    source: 'Weir, Project Hail Mary (2021); fuel figures via fan summaries' },
  { id: 'daedalus', name: 'Project Daedalus', tag: 'Fusion pulse, flyby', crewed: false,
    blurb: 'British Interplanetary Society, 1978. 54,000 t two-stage D/He-3 fusion probe; flies past its target at 12% of light speed.',
    p: { kind: 'rocket', ve: 0.033, accel: 0.03, dry: 1400, prop: 52600, decel: false, crew: 0, shield: 5, frontal: 1.3 },
    source: 'Bond & Martin 1978, JBIS; single-stage equivalent of the two-stage design' },
  { id: 'icarus', name: 'Icarus Firefly', tag: 'Fusion, brakes', crewed: false,
    blurb: 'Icarus Interstellar, 2013. 23,550 t Z-pinch fusion probe at 4.7% of light speed that brakes into the target system.',
    p: { kind: 'rocket', ve: 0.04, accel: 0.0046, dry: 2250, prop: 21300, decel: true, crew: 0, shield: 5, frontal: 2 },
    source: 'Freeland & Lamontagne 2015, JBIS 68' },
  { id: 'longshot', name: 'Project Longshot', tag: 'Fusion, orbiter', crewed: false,
    blurb: 'NASA / US Naval Academy, 1988. 396 t pulsed-fusion orbiter for Alpha Centauri B. Taken at face value, its published masses are far short of the 100-year trip it claimed.',
    p: { kind: 'rocket', ve: 0.0327, accel: 0.005, dry: 132, prop: 264, decel: true, crew: 0, shield: 5, frontal: 2 },
    source: 'Beals et al. 1988, NASA-CR-184718' },
  { id: 'orion', name: 'Orion (Dyson 1968)', tag: 'Nuclear pulse, flyby', crewed: false,
    blurb: 'Rides 300,000 one-megaton bombs against an ablative pusher plate. Freeman Dyson’s 100,000 t momentum-limited design.',
    p: { kind: 'rocket', ve: 0.036, accel: 1.0, dry: 40000, prop: 60000, decel: false, crew: 0, shield: 40, frontal: 20 },
    source: 'Dyson 1968, Physics Today 21(10)' },
  { id: 'antimatter', name: 'Antimatter rocket', tag: 'Beamed core, brakes', crewed: false,
    blurb: 'Matter–antimatter annihilation steered by a magnetic nozzle (Frisbee 2003 class). Exhaust at a third of light speed, cruising near 40%.',
    p: { kind: 'rocket', ve: 0.33, accel: 0.1, dry: 720, prop: 8640, decel: true, crew: 0, shield: 5, frontal: 10 },
    source: 'Frisbee 2003, AIAA 2003-4676 (masses uncertain)' },
  { id: 'starshot', name: 'Breakthrough Starshot', tag: 'Laser sail, flyby', crewed: false,
    blurb: 'A one-gram chip on a 4 m light sail, pushed to 20% of light speed by a 100 GW laser array in about ten minutes.',
    p: { kind: 'beam', beta: 0.2, accel: 10000, dry: 0.000002, prop: 0, decel: false, crew: 0, shield: 0, frontal: 0.01 },
    source: 'breakthroughinitiatives.org; Parkin 2018' },
  { id: 'bussard', name: 'Bussard ramjet', tag: 'Theoretical', crewed: true,
    blurb: 'Scoops interstellar hydrogen as fusion fuel, so it never runs dry. The 1 g here is a science-fiction convention; real scoops make more drag than thrust.',
    p: { kind: 'ramjet', accel: 1.0, dry: 1000, prop: 0, decel: true, crew: 20, shield: 50, frontal: 50 },
    source: 'Bussard 1960, Astronautica Acta 6' },
  { id: 'voyager', name: 'Voyager 1 speed', tag: 'For scale', crewed: false,
    blurb: 'Humanity’s fastest outbound probe coasts at 16.9 km/s. This is what present-day technology looks like.',
    p: { kind: 'ballistic', vkms: 16.9, dry: 0.722, prop: 0, decel: false, crew: 0, shield: 1, frontal: 0.5 },
    source: 'NASA JPL Voyager mission status' },
];

export const PRESETS = {
  hailmary: { kind: 'star', dest: 'tauceti', vehicle: 'hailmary', title: 'Project Hail Mary' },
  mars: { kind: 'planet', dest: 'mars', vehicle: 'starship', title: 'Starship to Mars', mission: 0 },
};

export const planetById = id => PLANETS.find(p => p.id === id);
export const starById = id => STARS.find(s => s.id === id);
export const vehicleById = (kind, id) => (kind === 'star' ? STAR_VEHICLES : SOLAR_VEHICLES).find(v => v.id === id);
