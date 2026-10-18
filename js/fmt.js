// Small formatting helpers shared by every panel.
export const $ = id => document.getElementById(id);
export const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const J1970 = 2440587.5;
// Julian date -> 'YYYY-MM-DD', falling back to a plain year far outside the JS Date range.
export function fmtDate(jd) {
  const ms = (jd - J1970) * 864e5;
  if (Math.abs(ms) < 8e15) { const d = new Date(ms), y = d.getUTCFullYear(); if (y >= 0 && y <= 9999) return d.toISOString().slice(0, 10); }
  return 'year ' + Math.round(2000 + (jd - 2451545) / 365.25).toLocaleString('en-US');
}
export const jdYear = jd => 2000 + (jd - 2451545) / 365.25;
export const yearJd = y => 2451545 + (y - 2000) * 365.25;

export const f1 = (x, d = 1) => x == null || !isFinite(x) ? '—' : (+x).toFixed(d);
export const int = x => x == null || !isFinite(x) ? '—' : Math.round(x).toLocaleString('en-US');

// Readable significant figures: 0.95, 12.3, 1,240, 4.1e-5 only when truly tiny.
export function sig(x, n = 3) {
  if (x == null || !isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e12) return x.toExponential(1).replace(/e\+(\d+)/, (_, d) => '×10' + [...d].map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join(''));
  if (a >= 1e9) return +(x / 1e9).toPrecision(2) + ' billion';
  if (a >= 1e6) return +(x / 1e6).toPrecision(2) + ' million';
  if (a >= 1000) return Math.round(x).toLocaleString('en-US');
  if (a >= 0.01) return (+x.toPrecision(n)).toString();
  return x.toExponential(1).replace('e-', '×10⁻').replace(/⁻(\d+)/, (_, d) => '⁻' + [...d].map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join(''));
}

// Probability as "1 in N" for small values, percent otherwise.
export function prob(p) {
  if (p == null || !isFinite(p)) return null;
  if (p <= 0) return '≈ 0';
  if (p >= 0.995) return '≈ 100%';
  if (p >= 0.01) return (p * 100).toFixed(p >= 0.1 ? 0 : 1) + '%';
  const n = 1 / p, r = n >= 1e4 ? Math.round(n / 1000) * 1000 : n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n);
  return '1 in ' + r.toLocaleString('en-US');
}

export function dur(days) {
  if (days == null || !isFinite(days)) return '—';
  if (days < 1e-3) return '0';
  if (days < 1) return (days * 24).toFixed(1) + ' h';
  if (days < 400) return Math.round(days) + ' d';
  const y = days / 365.25;
  return (y < 100 ? y.toFixed(1) : Math.round(y).toLocaleString('en-US')) + ' yr';
}

export function mass(t) {           // tonnes in, human units out
  if (t == null || !isFinite(t)) return '—';
  if (t < 1e-3) return sig(t * 1e6) + ' g';
  if (t < 1) return sig(t * 1000) + ' kg';
  if (t < 1e6) return sig(t) + ' t';
  if (t < 1e9) return sig(t / 1e6) + ' Mt';
  return t.toExponential(1) + ' t';
}

export function energy(J) {
  if (!isFinite(J) || J <= 0) return '—';
  const u = [[1e24, 'YJ'], [1e21, 'ZJ'], [1e18, 'EJ'], [1e15, 'PJ'], [1e12, 'TJ'], [1e9, 'GJ'], [1e6, 'MJ'], [1e3, 'kJ'], [1, 'J']].find(([k]) => J >= k);
  return sig(J / u[0]) + ' ' + u[1];
}
