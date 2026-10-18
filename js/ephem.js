// Planet positions from JPL's "Approximate Positions of the Planets" (E. M. Standish), Table 1:
// Keplerian elements and rates, valid 1800–2050, heliocentric ecliptic J2000, AU and AU/day.
// Used for historical missions that predate the precomputed DE440 mission files.
const D2R = Math.PI / 180, MU = 2.9591220828559115e-4;   // Sun GM in AU^3/day^2
// [a, e, I, L, varpi, Omega] and per-century rates
const EL = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
};
export const PLANET_NAMES = Object.keys(EL);

function elements(name, jd) {
  const T = (jd - 2451545.0) / 36525, [e0, r] = EL[name], v = e0.map((x, i) => x + r[i] * T);
  return { a: v[0], e: v[1], I: v[2] * D2R, L: v[3] * D2R, w: v[4] * D2R, O: v[5] * D2R };
}
// Heliocentric ecliptic position [x, y, z] in AU
export function planetPos(name, jd) {
  const { a, e, I, L, w, O } = elements(name, jd), om = w - O;
  let M = ((L - w) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI, E = M + e * Math.sin(M);
  for (let k = 0; k < 12; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const co = Math.cos(om), so = Math.sin(om), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return [(co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp, (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp, (so * sI) * xp + (co * sI) * yp];
}
// Velocity by central difference, AU/day
export function planetVel(name, jd) { const h = 0.01, a = planetPos(name, jd - h), b = planetPos(name, jd + h); return a.map((x, i) => (b[i] - x) / (2 * h)); }
export const AU_KM = 149597870.7, KMS = AU_KM / 86400;   // AU/day -> km/s
export { MU };
