// Two-body tools: zero-revolution Lambert solver (universal variables, Curtis Algorithm 5.2)
// and a universal-variable Kepler propagator (Curtis Algorithms 3.3 / 3.4). Any consistent units.
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export { dot, norm, sub, add, mul };

function C(z) { return z > 0 ? (1 - Math.cos(Math.sqrt(z))) / z : z < 0 ? (Math.cosh(Math.sqrt(-z)) - 1) / -z : 0.5; }
function S(z) { if (z > 0) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); } if (z < 0) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); } return 1 / 6; }

// Returns { v1, v2 } for the prograde transfer r1 -> r2 in time dt.
export function lambert(r1, r2, dt, mu) {
  const R1 = norm(r1), R2 = norm(r2), cz = r1[0] * r2[1] - r1[1] * r2[0];
  let th = Math.acos(Math.max(-1, Math.min(1, dot(r1, r2) / (R1 * R2))));
  if (cz < 0) th = 2 * Math.PI - th;
  const A = Math.sin(th) * Math.sqrt(R1 * R2 / (1 - Math.cos(th)));
  const y = z => R1 + R2 + A * (z * S(z) - 1) / Math.sqrt(C(z));
  const F = z => { const yz = y(z); if (yz < 0) return -Infinity; return Math.pow(yz / C(z), 1.5) * S(z) + A * Math.sqrt(yz) - Math.sqrt(mu) * dt; };
  let lo = -4 * Math.PI * Math.PI, hi = 4 * Math.PI * Math.PI - 1e-7;
  while (F(lo) > 0 && lo > -1e5) lo *= 2;
  for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2, f = F(mid); if (!isFinite(f) || f < 0) lo = mid; else hi = mid; }
  const z = (lo + hi) / 2, yz = y(z), f = 1 - yz / R1, g = A * Math.sqrt(yz / mu), gd = 1 - yz / R2;
  return { v1: mul(sub(r2, mul(r1, f)), 1 / g), v2: mul(sub(mul(r2, gd), r1), 1 / g) };
}

// Position after time dt from state (r0, v0).
export function kepler(r0, v0, dt, mu) {
  const R0 = norm(r0), vr0 = dot(r0, v0) / R0, alpha = 2 / R0 - dot(v0, v0) / mu, sm = Math.sqrt(mu);
  let x = sm * Math.abs(alpha) * dt;
  for (let k = 0; k < 60; k++) {
    const z = alpha * x * x, Fx = R0 * vr0 / sm * x * x * C(z) + (1 - alpha * R0) * x * x * x * S(z) + R0 * x - sm * dt;
    const dF = R0 * vr0 / sm * x * (1 - alpha * x * x * S(z)) + (1 - alpha * R0) * x * x * C(z) + R0;
    const step = Fx / dF; x -= step; if (Math.abs(step) < 1e-12) break;
  }
  const z = alpha * x * x, f = 1 - x * x / R0 * C(z), g = dt - x * x * x / sm * S(z);
  return add(mul(r0, f), mul(v0, g));
}
