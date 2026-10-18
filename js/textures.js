// Procedural canvas textures for the solar-system / interstellar viewer.
// Everything is generated at load time on <canvas>; no image files, no network.
// Noise is a seeded 3D Perlin implementation sampled on the unit sphere, so the
// equirectangular maps have no seam at lon = +-180 and no pinching at the poles.
import * as THREE from 'three';

// ---------------------------------------------------------------- utilities

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const cache = new Map();

function cached(key, make) {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
}

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed) { // mulberry32
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Parse any CSS colour to [r, g, b, a(0..1)] using the canvas normaliser.
let parseCtx = null;
function cssRGBA(css) {
  if (!parseCtx) parseCtx = document.createElement('canvas').getContext('2d');
  parseCtx.fillStyle = '#000';
  parseCtx.fillStyle = css;
  const s = String(parseCtx.fillStyle);
  if (s[0] === '#') { const c = hexRGB(s); return [c[0], c[1], c[2], 1]; }
  const m = s.match(/[\d.]+/g) || [0, 0, 0, 1];
  return [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1];
}

// Colour ramp -> Float32Array LUT (n entries x 3). stops: [[t, '#hex'], ...] sorted by t.
function ramp(stops, n = 256) {
  const lut = new Float32Array(n * 3);
  const cols = stops.map(s => hexRGB(s[1]));
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const t0 = stops[k][0], t1 = stops[k + 1][0];
    const f = t1 > t0 ? clamp01((t - t0) / (t1 - t0)) : 0;
    const a = cols[k], b = cols[k + 1];
    lut[i * 3] = a[0] + (b[0] - a[0]) * f;
    lut[i * 3 + 1] = a[1] + (b[1] - a[1]) * f;
    lut[i * 3 + 2] = a[2] + (b[2] - a[2]) * f;
  }
  return lut;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(canvas, { srgb = true, wrapS = THREE.ClampToEdgeWrapping, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = wrapS;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Per-pixel sphere coordinates for an equirectangular W x H map.
// Row 0 = north pole (CanvasTexture flipY puts it at v = 1, matching SphereGeometry).
const gridCache = new Map();
function sphereGrid(W, H) {
  const key = W + 'x' + H;
  let g = gridCache.get(key);
  if (g) return g;
  const cosLon = new Float32Array(W), sinLon = new Float32Array(W), lonDeg = new Float32Array(W);
  const cosLat = new Float32Array(H), sinLat = new Float32Array(H), latDeg = new Float32Array(H);
  for (let i = 0; i < W; i++) {
    const lon = ((i + 0.5) / W) * TAU - Math.PI;
    cosLon[i] = Math.cos(lon); sinLon[i] = Math.sin(lon); lonDeg[i] = lon / DEG;
  }
  for (let j = 0; j < H; j++) {
    const lat = Math.PI / 2 - ((j + 0.5) / H) * Math.PI;
    cosLat[j] = Math.cos(lat); sinLat[j] = Math.sin(lat); latDeg[j] = lat / DEG;
  }
  g = { W, H, cosLon, sinLon, lonDeg, cosLat, sinLat, latDeg };
  gridCache.set(key, g);
  return g;
}

// ---------------------------------------------------------------- noise

// Seeded improved-Perlin 3D noise + fBm. Output of noise() is roughly [-1, 1].
function makeNoise(seed) {
  const r = rng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  // Perlin's 12 edge gradients (+4 repeats), stored per perm slot for branch-free lookup
  const GV = [1,1,0, -1,1,0, 1,-1,0, -1,-1,0, 1,0,1, -1,0,1, 1,0,-1, -1,0,-1,
    0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1, 1,1,0, 0,-1,1, -1,1,0, 0,-1,-1];
  const gx = new Float32Array(512), gy = new Float32Array(512), gz = new Float32Array(512);
  for (let i = 0; i < 512; i++) { const h = (perm[i] & 15) * 3; gx[i] = GV[h]; gy[i] = GV[h + 1]; gz[i] = GV[h + 2]; }

  function noise(x, y, z) {
    // offset keeps coordinates positive so |0 == floor
    x += 512; y += 512; z += 512;
    let X = x | 0, Y = y | 0, Z = z | 0;
    x -= X; y -= Y; z -= Z;
    X &= 255; Y &= 255; Z &= 255;
    const u = x * x * x * (x * (x * 6 - 15) + 10);
    const v = y * y * y * (y * (y * 6 - 15) + 10);
    const w = z * z * z * (z * (z * 6 - 15) + 10);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    const x1 = x - 1, y1 = y - 1, z1 = z - 1;
    let h;
    h = AA; const g000 = gx[h] * x + gy[h] * y + gz[h] * z;
    h = BA; const g100 = gx[h] * x1 + gy[h] * y + gz[h] * z;
    h = AB; const g010 = gx[h] * x + gy[h] * y1 + gz[h] * z;
    h = BB; const g110 = gx[h] * x1 + gy[h] * y1 + gz[h] * z;
    h = AA + 1; const g001 = gx[h] * x + gy[h] * y + gz[h] * z1;
    h = BA + 1; const g101 = gx[h] * x1 + gy[h] * y + gz[h] * z1;
    h = AB + 1; const g011 = gx[h] * x + gy[h] * y1 + gz[h] * z1;
    h = BB + 1; const g111 = gx[h] * x1 + gy[h] * y1 + gz[h] * z1;
    const a0 = g000 + u * (g100 - g000), a1 = g010 + u * (g110 - g010);
    const b0 = g001 + u * (g101 - g001), b1 = g011 + u * (g111 - g011);
    const c0 = a0 + v * (a1 - a0), c1 = b0 + v * (b1 - b0);
    return c0 + w * (c1 - c0);
  }

  // fBm, normalised so the result is roughly in [-1, 1] (typical |v| < 0.5).
  function fbm(x, y, z, oct, lac = 2.03, gain = 0.5) {
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += amp * noise(x, y, z);
      norm += amp;
      x *= lac; y *= lac; z *= lac; amp *= gain;
    }
    return sum / norm;
  }

  return { noise, fbm };
}

function noiseFor(name) { return makeNoise(hashString(name)); }

// Evaluate a smooth (low-frequency) field fn(x, y, z) on a coarse lattice every `step`
// pixels and bilinearly upsample to W x H (wrapping in longitude). Most of the noise
// budget lives in low octaves, so this is where the speed comes from.
function coarseField(G, step, fn) {
  const { W, H } = G;
  const cw = Math.ceil(W / step), ch = Math.ceil((H - 1) / step) + 1;
  const c = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) {
    const lat = Math.PI / 2 - ((Math.min(j * step, H - 1) + 0.5) / H) * Math.PI;
    const cl = Math.cos(lat), y = Math.sin(lat);
    for (let i = 0; i < cw; i++) {
      const lon = ((i * step + 0.5) / W) * TAU - Math.PI;
      c[j * cw + i] = fn(cl * Math.cos(lon), y, cl * Math.sin(lon));
    }
  }
  const out = new Float32Array(W * H), inv = 1 / step;
  for (let pj = 0; pj < H; pj++) {
    const fy = pj * inv, j0 = fy | 0, j1 = Math.min(j0 + 1, ch - 1), ty = fy - j0;
    const r0 = j0 * cw, r1 = j1 * cw;
    for (let pi = 0; pi < W; pi++) {
      const fx = pi * inv, i0 = fx | 0, i1 = i0 + 1 === cw ? 0 : i0 + 1, tx = fx - i0;
      const a = c[r0 + i0] + (c[r0 + i1] - c[r0 + i0]) * tx;
      const b = c[r1 + i0] + (c[r1 + i1] - c[r1 + i0]) * tx;
      out[pj * W + pi] = a + (b - a) * ty;
    }
  }
  return out;
}

// Area-weighted quantile of a field sampled on an equirectangular grid.
function quantile(field, G, q) {
  const BINS = 2048;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < field.length; i++) { const v = field[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const hist = new Float64Array(BINS);
  const scale = (BINS - 1) / (hi - lo || 1);
  let total = 0;
  for (let j = 0; j < G.H; j++) {
    const wgt = G.cosLat[j], row = j * G.W;
    for (let i = 0; i < G.W; i++) hist[((field[row + i] - lo) * scale) | 0] += wgt;
    total += wgt * G.W;
  }
  let acc = 0;
  for (let b = 0; b < BINS; b++) { acc += hist[b]; if (acc >= q * total) return lo + b / scale; }
  return hi;
}

// ---------------------------------------------------------------- craters

// Soft crater stamps drawn with the 2D context (dark floor + bright rim), stretched
// horizontally by 1/cos(lat) so they stay round on the sphere, wrapped across the seam.
function drawCraters(ctx, W, H, rand, { count, rMin, rMax, floor = 0.32, rim = 0.22, slope = 2.2, latBias = 0 }) {
  for (let n = 0; n < count; n++) {
    // power-law size distribution: many small, few large
    const u = rand();
    const r = rMin * Math.pow(1 - u * (1 - Math.pow(rMin / rMax, slope)), -1 / slope);
    let s = 2 * rand() - 1;
    if (latBias) s = Math.max(-1, Math.min(1, s - latBias * rand()));
    const lat = Math.asin(s);
    const cy = (0.5 - lat / Math.PI) * H;
    const cx = rand() * W;
    const sx = 1 / Math.max(0.12, Math.cos(lat));
    const fresh = 0.55 + 0.45 * rand(); // degraded vs fresh craters
    const fa = floor * fresh, ra = rim * fresh;
    for (let k = -1; k <= 1; k++) {
      const x = cx + k * W;
      if (x + r * sx * 1.4 < 0 || x - r * sx * 1.4 > W) continue;
      ctx.save();
      ctx.translate(x, cy);
      ctx.scale(sx, 1);
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(0,0,0,${fa})`);
      g.addColorStop(0.6, `rgba(0,0,0,${fa * 0.8})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      g = ctx.createRadialGradient(0, 0, r * 0.62, 0, 0, r * 1.4);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.42, `rgba(255,250,240,${ra})`);
      g.addColorStop(0.62, `rgba(255,250,240,${ra * 0.35})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.4, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
}

// Bright ray system around a young crater (Tycho / Copernicus style).
function drawRays(ctx, W, H, rand, latDeg, lonFrac, len, rays, alpha) {
  const lat = latDeg * DEG;
  const cx = lonFrac * W, cy = (0.5 - lat / Math.PI) * H;
  const sx = 1 / Math.max(0.2, Math.cos(lat));
  for (let k = -1; k <= 1; k++) {
    ctx.save();
    ctx.translate(cx + k * W, cy);
    ctx.scale(sx, 1);
    for (let i = 0; i < rays; i++) {
      const a = rand() * TAU, l = len * (0.35 + 0.65 * rand()), w = 0.6 + rand() * 1.6;
      const g = ctx.createLinearGradient(0, 0, Math.cos(a) * l, Math.sin(a) * l);
      g.addColorStop(0, `rgba(255,252,245,${alpha})`);
      g.addColorStop(1, 'rgba(255,252,245,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l); ctx.stroke();
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len * 0.18);
    g.addColorStop(0, `rgba(255,252,245,${alpha * 1.6})`);
    g.addColorStop(1, 'rgba(255,252,245,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, len * 0.18, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- rocky bodies

function genRegolith(name, cfg) {
  const W = 1024, H = 512, G = sphereGrid(W, H), N = noiseFor(name);
  const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  const hi = hexRGB(cfg.highland), lo = hexRGB(cfg.maria);
  const REG = coarseField(G, 2, (x, y, z) => N.fbm(x * 2.4 + 3.1, y * 2.4, z * 2.4, 5));
  const MAR = coarseField(G, 4, (x, y, z) => {
    const mw = N.fbm(x * 1.6 - 7.3, y * 1.6 + 1.7, z * 1.6, 3);
    return N.fbm(x * 1.1 + mw * 0.6, y * 1.1 + 11.0 + mw * 0.6, z * 1.1, 4);
  });
  for (let j = 0; j < H; j++) {
    const cl = G.cosLat[j], y = G.sinLat[j];
    for (let i = 0; i < W; i++) {
      const x = cl * G.cosLon[i], z = cl * G.sinLon[i], k = j * W + i;
      const grain = N.noise(x * 70, y * 70, z * 70);
      const m = smoothstep(cfg.mariaLo, cfg.mariaHi, MAR[k] + grain * 0.015) * cfg.mariaAmt;
      const v = 1 + REG[k] * 0.55 + grain * 0.07 - m * 0.05;
      const o = k * 4;
      d[o] = (hi[0] + (lo[0] - hi[0]) * m) * v;
      d[o + 1] = (hi[1] + (lo[1] - hi[1]) * m) * v;
      d[o + 2] = (hi[2] + (lo[2] - hi[2]) * m) * v;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const rand = rng(hashString(name + ':craters'));
  drawCraters(ctx, W, H, rand, { count: cfg.craters, rMin: 1.2, rMax: 26, floor: 0.30, rim: 0.20 });
  for (const ray of cfg.rays) drawRays(ctx, W, H, rand, ray[0], ray[1], ray[2], 46, ray[3]);
  return toTexture(canvas, { wrapS: THREE.RepeatWrapping });
}

function genMars() {
  const W = 1024, H = 512, G = sphereGrid(W, H), N = noiseFor('mars');
  const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  const lut = ramp([[0, '#4a2a1d'], [0.3, '#6e3b25'], [0.55, '#a5562f'], [0.75, '#c2703e'], [0.9, '#d4945d'], [1, '#e2b07c']]);
  const WX = coarseField(G, 4, (x, y, z) => N.fbm(x * 1.3 + 5.2, y * 1.3, z * 1.3, 3));
  const ALB = coarseField(G, 2, (x, y, z) => {
    const wx = N.fbm(x * 1.3 + 5.2, y * 1.3, z * 1.3, 2);
    return N.fbm(x * 1.5 + wx * 0.7, y * 1.5 + wx * 0.7, z * 1.5 - wx * 0.7, 5);
  });
  const DUST = coarseField(G, 2, (x, y, z) => N.fbm(x * 4.5 - 2.1, y * 4.5, z * 4.5, 4));
  for (let j = 0; j < H; j++) {
    const cl = G.cosLat[j], y = G.sinLat[j], lat = G.latDeg[j], alat = Math.abs(lat);
    // dark albedo features concentrate in a southern / equatorial belt
    const belt = Math.exp(-((lat + 12) * (lat + 12)) / (2 * 26 * 26));
    for (let i = 0; i < W; i++) {
      const x = cl * G.cosLon[i], z = cl * G.sinLon[i], k = j * W + i;
      const wx = WX[k], alb = ALB[k];
      const dust = DUST[k] + N.noise(x * 60, y * 60, z * 60) * 0.05;
      const dark = smoothstep(-0.02, 0.26, alb + belt * 0.14 - 0.05) * (0.45 + 0.4 * belt);
      // Valles-Marineris-like scar
      const lon = G.lonDeg[i];
      let canyon = 0;
      if (lon > -110 && lon < -40) {
        const cLat = -8 + 3 * Math.sin((lon + 75) * 0.09) + wx * 4;
        const dl = (lat - cLat) / 1.3;
        canyon = Math.exp(-dl * dl) * smoothstep(-110, -95, lon) * (1 - smoothstep(-55, -40, lon));
      }
      let t = 0.8 + dust * 0.35 - dark * 0.42 - canyon * 0.3;
      t = clamp01(t);
      const li = (t * 255) | 0;
      let r = lut[li * 3], g = lut[li * 3 + 1], b = lut[li * 3 + 2];
      // polar caps (north larger), ragged edges
      const capN = smoothstep(81, 83.5, lat + dust * 9 + wx * 4);
      const capS = smoothstep(83.5, 86, -lat + dust * 7);
      const cap = Math.max(capN, capS);
      if (cap > 0) {
        const cv = 236 + dust * 30;
        r += (cv - r) * cap; g += (cv - 4 - g) * cap; b += (cv - 10 - b) * cap;
      }
      // faint polar hood haze
      const hz = smoothstep(60, 90, alat) * 0.12;
      const o = (j * W + i) * 4;
      d[o] = r + (225 - r) * hz; d[o + 1] = g + (205 - g) * hz; d[o + 2] = b + (190 - b) * hz; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const rand = rng(hashString('mars:craters'));
  drawCraters(ctx, W, H, rand, { count: 260, rMin: 1.2, rMax: 14, floor: 0.16, rim: 0.10, latBias: 0.6 });
  return toTexture(canvas, { wrapS: THREE.RepeatWrapping });
}

function genVenus() {
  const W = 1024, H = 512, G = sphereGrid(W, H), N = noiseFor('venus');
  const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  const lut = ramp([[0, '#a88a55'], [0.35, '#cdb07a'], [0.6, '#e2cd9c'], [0.82, '#efe2bd'], [1, '#f8f0d8']]);
  // domain warp stretched along longitude (y frequency higher -> zonal streaks)
  const Q2 = coarseField(G, 4, (x, y, z) => N.fbm(x * 1.4 + 5.2, y * 3.2 + 1.3, z * 1.4 - 2.8, 4));
  const F = coarseField(G, 2, (x, y, z) => {
    const q1 = N.fbm(x * 1.4, y * 3.2, z * 1.4, 3);
    const q2 = N.fbm(x * 1.4 + 5.2, y * 3.2 + 1.3, z * 1.4 - 2.8, 3);
    return N.fbm(x * 2.0 + q1 * 1.8, y * 5.0 + q2 * 2.2, z * 2.0 + q1 * 1.8, 5);
  });
  for (let j = 0; j < H; j++) {
    const lat = G.latDeg[j] * DEG;
    for (let i = 0; i < W; i++) {
      const k = j * W + i, f = F[k];
      const band = Math.sin(lat * 9 + f * 4 + Q2[k] * 2);
      // Y/chevron hint: brighter at mid latitudes, darker equatorial streaks
      let t = 0.58 + f * 0.55 + band * 0.07 + 0.08 * Math.abs(Math.sin(lat * 2));
      t = clamp01(t);
      const li = (t * 255) | 0, o = (j * W + i) * 4;
      d[o] = lut[li * 3]; d[o + 1] = lut[li * 3 + 1]; d[o + 2] = lut[li * 3 + 2]; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { wrapS: THREE.RepeatWrapping });
}

function genEarth() {
  const W = 1024, H = 512, G = sphereGrid(W, H), N = noiseFor('earth');
  const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  // low octaves on a coarse lattice, two crisp octaves per pixel for coastlines
  const hgt = coarseField(G, 2, (x, y, z) => {
    const w = N.fbm(x * 0.9 + 9.1, y * 0.9, z * 0.9, 3);
    return N.fbm(x * 1.35 + w * 0.8, y * 1.35 + w * 0.8, z * 1.35 - w * 0.8, 5);
  });
  const wet = coarseField(G, 4, (x, y, z) => N.fbm(x * 2.6 - 4.4, y * 2.6, z * 2.6, 4));
  const jagF = coarseField(G, 4, (x, y, z) => N.noise(x * 9, y * 9, z * 9));
  for (let j = 0; j < H; j++) {
    const cl = G.cosLat[j], y = G.sinLat[j];
    for (let i = 0; i < W; i++) {
      const x = cl * G.cosLon[i], z = cl * G.sinLon[i];
      hgt[j * W + i] += 0.035 * N.noise(x * 43, y * 43, z * 43) + 0.018 * N.noise(x * 87, y * 87, z * 87);
    }
  }
  const sea = quantile(hgt, G, 0.70); // ~30% land by area
  const deep = hexRGB('#071d45'), mid = hexRGB('#0c3168'), shallow = hexRGB('#1d6390');
  const trop = hexRGB('#2c5420'), temp = hexRGB('#4b6a2e'), boreal = hexRGB('#34472a');
  const tundra = hexRGB('#7a7461'), desert = hexRGB('#c7a56d'), steppe = hexRGB('#a08c5c');
  const rock = hexRGB('#6f6252');
  for (let j = 0; j < H; j++) {
    const lat = G.latDeg[j], alat = Math.abs(lat);
    const fTemp = smoothstep(12, 42, alat), fBor = smoothstep(48, 60, alat), fTun = smoothstep(60, 70, alat);
    const dryLat = Math.exp(-((alat - 24) * (alat - 24)) / (2 * 9 * 9));
    for (let i = 0; i < W; i++) {
      const k = j * W + i, o = k * 4;
      const h = hgt[k] - sea, m = wet[k];
      let r, g, b;
      if (h < 0) {
        const dep = smoothstep(0, 0.035, -h), dd = smoothstep(0.03, 0.2, -h);
        r = shallow[0] + (mid[0] - shallow[0]) * dep; g = shallow[1] + (mid[1] - shallow[1]) * dep; b = shallow[2] + (mid[2] - shallow[2]) * dep;
        r += (deep[0] - r) * dd; g += (deep[1] - g) * dd; b += (deep[2] - b) * dd;
      } else {
        // latitude biome blend
        r = trop[0] + (temp[0] - trop[0]) * fTemp; g = trop[1] + (temp[1] - trop[1]) * fTemp; b = trop[2] + (temp[2] - trop[2]) * fTemp;
        r += (boreal[0] - r) * fBor; g += (boreal[1] - g) * fBor; b += (boreal[2] - b) * fBor;
        r += (tundra[0] - r) * fTun; g += (tundra[1] - g) * fTun; b += (tundra[2] - b) * fTun;
        // deserts in the subtropics and continental interiors
        const dry = clamp01(dryLat * 1.3 - m * 3.2 + h * 1.5 - 0.15);
        const st = clamp01(dry * 1.6);
        r += (steppe[0] - r) * st * 0.6; g += (steppe[1] - g) * st * 0.6; b += (steppe[2] - b) * st * 0.6;
        const ds = smoothstep(0.35, 0.8, dry);
        r += (desert[0] - r) * ds; g += (desert[1] - g) * ds; b += (desert[2] - b) * ds;
        // mountains and snowline (lower toward the poles)
        const mt = smoothstep(0.09, 0.2, h);
        r += (rock[0] - r) * mt * 0.65; g += (rock[1] - g) * mt * 0.65; b += (rock[2] - b) * mt * 0.65;
        const sl = 0.29 - alat * 0.0022; // snowline drops toward the poles
        const sn = smoothstep(sl, sl + 0.03, h) * 0.85;
        r += (236 - r) * sn; g += (238 - g) * sn; b += (242 - b) * sn;
        const v = 0.93 + m * 0.25;
        r *= v; g *= v; b *= v;
      }
      // polar ice (Antarctic cap larger, covers land and sea)
      const jag = jagF[k] * 4 + m * 6;
      const ice = lat > 0 ? smoothstep(73, 77, lat + jag) : smoothstep(66, 70, -lat + jag);
      if (ice > 0) { r += (236 - r) * ice; g += (241 - g) * ice; b += (246 - b) * ice; }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { wrapS: THREE.RepeatWrapping });
}

function genEarthClouds() {
  const W = 1024, H = 512, G = sphereGrid(W, H), N = noiseFor('earth-clouds');
  const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  const C = coarseField(G, 2, (x, y, z) => {
    const w1 = N.fbm(x * 1.6, y * 1.6, z * 1.6, 3);
    const w2 = N.fbm(x * 1.6 + 3.3, y * 1.6 - 1.1, z * 1.6, 3);
    const sgn = Math.max(-1, Math.min(1, y * 6)); // swirl sense flips with hemisphere
    return N.fbm(x * 2.8 + w1 * 1.6, y * 5.2 + w2 * 1.6 * sgn, z * 2.8 - w1 * 1.6, 5);
  });
  for (let j = 0; j < H; j++) {
    const cl = G.cosLat[j], y = G.sinLat[j], lat = G.latDeg[j], alat = Math.abs(lat);
    // ITCZ +, subtropical highs -, mid-latitude storm tracks +
    const bias = 0.10 * Math.exp(-((lat - 5) * (lat - 5)) / 50)
      - 0.13 * Math.exp(-((alat - 24) * (alat - 24)) / 90)
      + 0.10 * Math.exp(-((alat - 55) * (alat - 55)) / 160)
      - 0.06 * smoothstep(70, 90, alat);
    for (let i = 0; i < W; i++) {
      const x = cl * G.cosLon[i], z = cl * G.sinLon[i], k = j * W + i;
      const fine = N.noise(x * 30, y * 55, z * 30) * 0.07 + N.noise(x * 70, y * 110, z * 70) * 0.035;
      const a = smoothstep(0.0, 0.42, C[k] + bias + fine - 0.01);
      const o = k * 4;
      d[o] = 255; d[o + 1] = 255; d[o + 2] = 255; d[o + 3] = a * 242;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { wrapS: THREE.RepeatWrapping });
}

// ---------------------------------------------------------------- gas / ice giants

// cfg.stops: [[latDeg, '#hex'], ...] from -90 to +90; colours interpolate between stops.
// cfg.spots: [{lat, lon, rlat, rlon, color, core, alpha, swirl, soft, collar}]
function genGiant(name, cfg) {
  const W = 1024, H = 512, G = sphereGrid(W, H), N = noiseFor(name);
  const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  // latitude LUT, 0.25 deg resolution, with fine random sub-banding
  const LN = 721;
  const stops = cfg.stops.map(s => [(s[0] + 90) / 180, s[1]]);
  const lut = ramp(stops, LN);
  for (let k = 0; k < LN; k++) {
    const s = 1 + cfg.sub * (N.noise(k * 0.11, 7.7, 1.3) + 0.5 * N.noise(k * 0.37, 2.1, 9.4));
    lut[k * 3] *= s; lut[k * 3 + 1] *= s; lut[k * 3 + 2] *= s;
  }
  const spots = (cfg.spots || []).map(s => ({
    ...s, c: hexRGB(s.color), k: hexRGB(s.core || s.color), soft: s.soft ?? 0.65, alpha: s.alpha ?? 1, swirl: s.swirl ?? 0,
  }));
  const st = cfg.stretch, ta = cfg.turb, fa = cfg.fine;
  // turbulence: domain-warped fBm, stretched along longitude (higher y frequency)
  const WF = coarseField(G, 2, (x, y, z) => {
    const q = N.fbm(x * 2.2, y * 2.2 * st, z * 2.2, 3);
    return N.fbm(x * 4 + q * 2.4, y * 4 * st + q * 1.8, z * 4 - q * 2.4, 3);
  });
  for (let j = 0; j < H; j++) {
    const cl = G.cosLat[j], y = G.sinLat[j], lat = G.latDeg[j];
    // turbulence is strongest at band edges / mid latitudes, calmer near the poles
    const env = 0.55 + 0.45 * Math.sin(Math.abs(lat) * DEG * 3) ** 2;
    for (let i = 0; i < W; i++) {
      const x = cl * G.cosLon[i], z = cl * G.sinLon[i], lon = G.lonDeg[i], k = j * W + i;
      const fn = N.noise(x * 26, y * 26 * st, z * 26);
      const w = WF[k] + fn * 0.12;
      let latS = lat + ta * env * w;
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let n = 0; n < spots.length; n++) {
        const s = spots[n];
        let dl = lon - s.lon;
        if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
        const dx = dl / s.rlon, dy = (lat - s.lat) / s.rlat;
        const r2 = dx * dx + dy * dy;
        if (r2 > 12) continue;
        if (s.swirl) { // bend bands around the vortex
          const ang = s.swirl * Math.exp(-r2 * 0.55);
          const ry = dx * Math.sin(ang) + dy * Math.cos(ang);
          latS = s.lat + ry * s.rlat + ta * env * w * (1 - Math.exp(-r2));
        }
        const rr = Math.sqrt(r2);
        const inner = 1 - smoothstep(s.soft, 1, rr + w * 0.25);
        if (inner > 0) {
          const kk = clamp01(1 - rr + w * 0.6);
          const a = inner * s.alpha;
          sr += (s.c[0] + (s.k[0] - s.c[0]) * kk - sr) * a;
          sg += (s.c[1] + (s.k[1] - s.c[1]) * kk - sg) * a;
          sb += (s.c[2] + (s.k[2] - s.c[2]) * kk - sb) * a;
          sa += (1 - sa) * a;
        }
        if (s.collar) { // pale hollow around the spot
          const cr = Math.exp(-((rr - 1.15) * (rr - 1.15)) / 0.05) * s.collar;
          sr += (240 - sr) * cr * (1 - sa); sg += (230 - sg) * cr * (1 - sa); sb += (210 - sb) * cr * (1 - sa);
          sa += (1 - sa) * cr;
        }
      }
      let li = ((latS + 90) * 4 + 0.5) | 0;
      if (li < 0) li = 0; else if (li > LN - 1) li = LN - 1;
      const sh = 1 + fa * fn + fa * 0.6 * w;
      let r = lut[li * 3] * sh, g = lut[li * 3 + 1] * sh, b = lut[li * 3 + 2] * sh;
      if (sa > 0) { r += (sr / sa - r) * sa; g += (sg / sa - g) * sa; b += (sb / sa - b) * sa; }
      const o = (j * W + i) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { wrapS: THREE.RepeatWrapping });
}

const GIANTS = {
  jupiter: {
    turb: 6.5, stretch: 3.0, fine: 0.07, sub: 0.07,
    stops: [
      [-90, '#7a7064'], [-66, '#91846f'], [-52, '#b3a084'], [-45, '#cbbb9c'], [-40, '#ddd0b4'],
      [-37, '#b39270'], [-33, '#a6855f'], [-29, '#e3d6bb'], [-23, '#e9dcc2'], [-20, '#b88458'],
      [-15, '#9c6440'], [-11, '#a8714a'], [-8, '#dcc9a6'], [-5, '#ece0c6'], [0, '#e6cfa4'],
      [5, '#ebdcbf'], [8, '#c79c72'], [11, '#94603f'], [15, '#9d6a46'], [18, '#c49a72'],
      [21, '#e8d8ba'], [25, '#dccbad'], [27, '#a37a58'], [30, '#b08a68'], [33, '#ddcdb0'],
      [38, '#c4ab8b'], [44, '#d3c19f'], [52, '#a99779'], [64, '#918470'], [90, '#776e63'],
    ],
    spots: [
      { lat: -22.5, lon: 40, rlat: 6.2, rlon: 12, color: '#c46b45', core: '#b04e35', swirl: 2.4, soft: 0.55, collar: 0.35 },
      { lat: -40.5, lon: -60, rlat: 1.7, rlon: 2.6, color: '#f1e9da', core: '#faf5ea', swirl: 1.2, soft: 0.4 },
      { lat: -40.5, lon: -25, rlat: 1.6, rlon: 2.4, color: '#efe6d6', core: '#f8f2e6', swirl: 1.2, soft: 0.4 },
      { lat: -41, lon: 120, rlat: 1.5, rlon: 2.3, color: '#ece2d0', core: '#f6efe2', swirl: 1.0, soft: 0.4 },
      { lat: 18.5, lon: -130, rlat: 1.4, rlon: 3.2, color: '#8a5434', core: '#7a462b', swirl: 0.8, soft: 0.5, alpha: 0.7 },
    ],
  },
  saturn: {
    turb: 2.2, stretch: 4.5, fine: 0.035, sub: 0.045,
    stops: [
      [-90, '#a49a80'], [-72, '#bfae88'], [-58, '#d2c098'], [-46, '#c8b088'], [-38, '#dccaa2'],
      [-28, '#cfb68a'], [-20, '#e0cca0'], [-12, '#d5bb8c'], [-5, '#e9d7ae'], [0, '#ecdbb2'],
      [5, '#e6d2a4'], [12, '#d3b886'], [19, '#e1cda0'], [27, '#cbb287'], [36, '#d9c59b'],
      [48, '#c6b089'], [60, '#bba985'], [70, '#a69b7d'], [76, '#8f8a77'], [90, '#86857a'],
    ],
  },
  uranus: {
    turb: 1.2, stretch: 5, fine: 0.012, sub: 0.012,
    stops: [
      [-90, '#c6eaec'], [-60, '#b9e3e7'], [-35, '#abdae1'], [-15, '#a2d4dc'], [0, '#9ed0d9'],
      [15, '#a1d2db'], [35, '#a8d8df'], [60, '#b3dfe4'], [90, '#bce4e8'],
    ],
  },
  neptune: {
    turb: 3.5, stretch: 4, fine: 0.04, sub: 0.035,
    stops: [
      [-90, '#3d5fb5'], [-70, '#3656ab'], [-52, '#4a6cc4'], [-44, '#3a5bb4'], [-30, '#2f4fa6'],
      [-12, '#3558b3'], [0, '#3a5fbc'], [12, '#3454ae'], [28, '#4063be'], [45, '#3354aa'],
      [65, '#395ab2'], [90, '#4264b8'],
    ],
    spots: [
      { lat: -20, lon: -30, rlat: 5.5, rlon: 11, color: '#1f2f78', core: '#182260', swirl: 1.4, soft: 0.5, alpha: 0.9 },
      { lat: -27.5, lon: -26, rlat: 1.3, rlon: 7, color: '#eef3ff', core: '#ffffff', soft: 0.1, alpha: 0.75 },
      { lat: -42, lon: 70, rlat: 1.1, rlon: 9, color: '#dfe8ff', core: '#ffffff', soft: 0.05, alpha: 0.55 },
      { lat: 27, lon: 150, rlat: 1.0, rlon: 12, color: '#dfe8ff', core: '#f6f9ff', soft: 0.05, alpha: 0.45 },
      { lat: -55, lon: 160, rlat: 2.0, rlon: 3.5, color: '#253a86', core: '#1e2f72', swirl: 0.8, soft: 0.4, alpha: 0.7 },
    ],
  },
};

// ---------------------------------------------------------------- public API

const PLANETS = {
  mercury: () => genRegolith('mercury', {
    highland: '#8f8a84', maria: '#5f5b57', mariaLo: 0.02, mariaHi: 0.22, mariaAmt: 0.55, craters: 1500,
    rays: [[-35, 0.18, 70, 0.10], [48, 0.66, 50, 0.08]],
  }),
  moon: () => genRegolith('moon', {
    highland: '#a19d97', maria: '#545250', mariaLo: 0.1, mariaHi: 0.24, mariaAmt: 0.85, craters: 1300,
    rays: [[-43, 0.47, 90, 0.11], [10, 0.39, 55, 0.08], [8, 0.74, 40, 0.07]],
  }),
  venus: genVenus,
  earth: genEarth,
  mars: genMars,
  jupiter: () => genGiant('jupiter', GIANTS.jupiter),
  saturn: () => genGiant('saturn', GIANTS.saturn),
  uranus: () => genGiant('uranus', GIANTS.uranus),
  neptune: () => genGiant('neptune', GIANTS.neptune),
};

/** Equirectangular 1024x512 sRGB CanvasTexture for a solar-system body (cached). */
export function planetTexture(name) {
  const key = String(name).toLowerCase();
  const gen = PLANETS[key];
  if (!gen) throw new Error(`planetTexture: unknown body "${name}"`);
  return cached('planet:' + key, gen);
}

/** White cloud layer with alpha for a separate Earth cloud shell (cached). */
export function earthClouds() {
  return cached('earthClouds', genEarthClouds);
}

// Saturn ring radii (km). The texture spans C-ring inner edge -> A-ring outer edge,
// i.e. 1.239 -> 2.270 Saturn radii (matches RingGeometry(1.24, 2.27)).
const RING_IN = 74658, RING_OUT = 136775;

/** 1024x64 RGBA ring texture; x = radius inner(0) -> outer(1). Use with remapRingUVs(). */
export function ringTexture() {
  return cached('ring', () => {
    const W = 1024, H = 64;
    const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H), d = img.data;
    const N = noiseFor('saturn-rings');
    const span = RING_OUT - RING_IN;
    const row = new Float32Array(W * 4);
    const edge = (r, a, w) => smoothstep(a - w, a + w, r); // soft step at radius a
    for (let i = 0; i < W; i++) {
      const r = RING_IN + ((i + 0.5) / W) * span;
      const u = i / W;
      // multi-scale radial striations (ringlets)
      const s1 = N.noise(u * 90, 0.5, 0.5), s2 = N.noise(u * 260, 3.5, 1.5), s3 = N.noise(u * 640, 7.5, 2.5);
      const stri = s1 * 0.5 + s2 * 0.35 + s3 * 0.25;
      let a, c0, c1, c2;
      if (r < 92000) { // C ring: faint, grey-brown, plateaus
        const plateau = 0.5 + 0.5 * Math.sin(r * 0.0021 + s1 * 2) > 0.8 ? 0.08 : 0;
        a = 0.10 + 0.06 * edge(r, 86000, 3000) + plateau + stri * 0.05;
        c0 = 138; c1 = 124; c2 = 106;
      } else if (r < 117580) { // B ring: bright and dense, inner part less opaque
        const t = edge(r, 99000, 2500);
        a = 0.62 + 0.30 * t + stri * 0.10;
        const br = 0.92 + 0.08 * t + stri * 0.06;
        c0 = 222 * br; c1 = 204 * br; c2 = 168 * br;
      } else if (r < 122170) { // Cassini division (Huygens gap at its inner edge)
        a = 0.07 + 0.05 * Math.max(0, s2) + 0.04 * edge(r, 120000, 800);
        if (r < 118100) a *= 0.25;
        c0 = 120; c1 = 112; c2 = 100;
      } else { // A ring with Encke and Keeler gaps
        a = 0.58 + stri * 0.08 - 0.08 * edge(r, 131000, 2500) + 0.06 * edge(r, 134500, 600);
        const encke = Math.exp(-((r - 133589) * (r - 133589)) / (2 * 140 * 140));
        const keeler = Math.exp(-((r - 136505) * (r - 136505)) / (2 * 50 * 50));
        a *= (1 - 0.94 * encke) * (1 - 0.6 * keeler);
        const br = 0.95 + stri * 0.05;
        c0 = 200 * br; c1 = 186 * br; c2 = 158 * br;
      }
      // soften the major boundaries and the outer edge
      const fadeIn = smoothstep(RING_IN, RING_IN + 600, r), fadeOut = 1 - smoothstep(RING_OUT - 300, RING_OUT, r);
      a = clamp01(a) * fadeIn * fadeOut;
      row[i * 4] = c0; row[i * 4 + 1] = c1; row[i * 4 + 2] = c2; row[i * 4 + 3] = a * 255;
    }
    // light 3-tap blur so region boundaries are not aliased
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const o = (j * W + i) * 4, p = i * 4;
        const pl = Math.max(0, i - 1) * 4, pr = Math.min(W - 1, i + 1) * 4;
        for (let c = 0; c < 4; c++) d[o + c] = row[p + c] * 0.6 + (row[pl + c] + row[pr + c]) * 0.2;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(canvas);
  });
}

/** Remap a THREE.RingGeometry's UVs radially: u = (r - inner) / (outer - inner), v = 0.5. */
export function remapRingUVs(geometry, inner, outer) {
  const pos = geometry.attributes.position, uv = geometry.attributes.uv;
  const span = outer - inner;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / span, 0.5);
  }
  uv.needsUpdate = true;
  return geometry;
}

// Bloom-like radial profile: tight core + medium halo + long soft tail, 0 at r = 1.
function bloomProfile(r) {
  if (r >= 1) return 0;
  const r2 = r * r;
  const i = 0.50 * Math.exp(-r2 / (2 * 0.03 * 0.03))   // core
    + 0.24 * Math.exp(-r2 / (2 * 0.09 * 0.09))         // inner halo
    + 0.18 * Math.exp(-r2 / (2 * 0.30 * 0.30))         // wide halo
    + 0.08 / (1 + r2 / (0.1 * 0.1));                   // power-law tail
  const win = 1 - r2;
  return i * win * win;
}

/** 256x256 radial soft glow (sun corona / star sprites). */
export function glowTexture(inner = '#fff', outer = 'rgba(255,255,255,0)') {
  return cached('glow:' + inner + '|' + outer, () => {
    const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S), d = img.data;
    const a = cssRGBA(inner), b = cssRGBA(outer);
    for (let j = 0; j < S; j++) {
      const v = (j + 0.5) / S * 2 - 1;
      for (let i = 0; i < S; i++) {
        const u = (i + 0.5) / S * 2 - 1;
        const I = bloomProfile(Math.sqrt(u * u + v * v));
        const ct = Math.sqrt(I); // colour reaches the inner colour faster than alpha
        const o = (j * S + i) * 4;
        d[o] = b[0] + (a[0] - b[0]) * ct;
        d[o + 1] = b[1] + (a[1] - b[1]) * ct;
        d[o + 2] = b[2] + (a[2] - b[2]) * ct;
        d[o + 3] = (b[3] + (a[3] - b[3]) * I) * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, { aniso: 1 });
  });
}

/** 256x256 white star sprite: soft core glow + subtle 4-point diffraction spikes. */
export function starSpikeTexture() {
  return cached('starSpike', () => {
    const S = 256, c = makeCanvas(S, S), ctx = c.getContext('2d');
    const img = ctx.createImageData(S, S), d = img.data;
    for (let j = 0; j < S; j++) {
      const v = (j + 0.5) / S * 2 - 1, av = Math.abs(v);
      for (let i = 0; i < S; i++) {
        const u = (i + 0.5) / S * 2 - 1, au = Math.abs(u);
        const r = Math.sqrt(u * u + v * v);
        let I = bloomProfile(r * 1.15);
        // spikes: thin gaussian across, power falloff along, widening slightly outward
        const wh = 0.006 + 0.012 * au, wv = 0.006 + 0.012 * av;
        const fh = au < 1 ? Math.pow(1 - au, 2.6) : 0, fv = av < 1 ? Math.pow(1 - av, 2.6) : 0;
        I += 0.42 * Math.exp(-(v * v) / (2 * wh * wh)) * fh;
        I += 0.42 * Math.exp(-(u * u) / (2 * wv * wv)) * fv;
        const o = (j * S + i) * 4;
        d[o] = 255; d[o + 1] = 255; d[o + 2] = 255; d[o + 3] = clamp01(I) * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, { aniso: 1 });
  });
}

/** 512x256 granulated photosphere for the sun sphere. */
export function sunTexture() {
  return cached('sun', () => {
    const W = 512, H = 256, G = sphereGrid(W, H), N = noiseFor('sun');
    const canvas = makeCanvas(W, H), ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H), d = img.data;
    const lut = ramp([[0, '#a83400'], [0.3, '#e86a10'], [0.55, '#ffa030'], [0.78, '#ffd36a'], [1, '#fff4cf']]);
    // 3D Worley (F2 - F1) for granule cells with dark intergranular lanes
    const perm = new Uint8Array(512);
    { const r = rng(hashString('sun:cells')); const p = [...Array(256).keys()];
      for (let i = 255; i > 0; i--) { const k = (r() * (i + 1)) | 0; [p[i], p[k]] = [p[k], p[i]]; }
      for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
    const jit = new Float32Array(256 * 3);
    { const r = rng(hashString('sun:jitter')); for (let i = 0; i < jit.length; i++) jit[i] = r(); }
    const FREQ = 22;
    for (let j = 0; j < H; j++) {
      const cl = G.cosLat[j], y = G.sinLat[j];
      for (let i = 0; i < W; i++) {
        const x = cl * G.cosLon[i], z = cl * G.sinLon[i];
        const px = x * FREQ + 512, py = y * FREQ + 512, pz = z * FREQ + 512;
        const X = px | 0, Y = py | 0, Z = pz | 0;
        let f1 = 9, f2 = 9;
        for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const cx = X + dx, cy = Y + dy, cz = Z + dz;
          const h = perm[(perm[(perm[cx & 255] + (cy & 255)) & 511] + (cz & 255)) & 511] * 3;
          const ex = cx + jit[h] - px, ey = cy + jit[h + 1] - py, ez = cz + jit[h + 2] - pz;
          const dd = ex * ex + ey * ey + ez * ez;
          if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
        }
        const lane = smoothstep(0.0, 0.5, Math.sqrt(f2) - Math.sqrt(f1));
        const sg = N.fbm(x * 5, y * 5, z * 5, 3);
        const fac = smoothstep(0.25, 0.5, N.fbm(x * 3 + 4, y * 3, z * 3, 4)) * 0.18;
        const t = clamp01(0.42 + lane * 0.3 + (1 - Math.sqrt(f1)) * 0.1 + sg * 0.3 + fac);
        const li = (t * 255) | 0, o = (j * W + i) * 4;
        d[o] = lut[li * 3]; d[o + 1] = lut[li * 3 + 1]; d[o + 2] = lut[li * 3 + 2]; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(canvas, { wrapS: THREE.RepeatWrapping });
  });
}

/**
 * Fresnel atmosphere rim for a shell ~1.025-1.06x the planet radius.
 * Additive, depthWrite off, log-depth aware. Update material.uniforms.sunPos (world space)
 * if the sun is not at the origin. `edge` controls how far inside the shell silhouette the
 * glow peaks (raise toward 0.33 for a 1.06x shell, lower toward 0.2 for 1.025x).
 */
export function atmosphereMaterial(colorHex, intensity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(colorHex) },
      intensity: { value: intensity },
      sunPos: { value: new THREE.Vector3(0, 0, 0) },
      power: { value: 3.0 },
      edge: { value: 0.26 },
    },
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 glowColor;
      uniform float intensity;
      uniform vec3 sunPos;
      uniform float power;
      uniform float edge;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float nv = clamp(dot(N, V), 0.0, 1.0);
        // fresnel rim, faded to zero at the very silhouette of the shell so the
        // glow peaks just outside the planet limb instead of at a hard outer edge
        float rim = pow(1.0 - nv, power) * smoothstep(0.0, edge, nv) * 2.0;
        vec3 L = normalize(sunPos - vWorldPos);
        float ndl = dot(N, L);
        float day = smoothstep(-0.28, 0.3, ndl);           // twilight wrap past the terminator
        float fwd = pow(max(dot(-V, L), 0.0), 6.0) * 0.8;   // backlit forward scattering
        fwd *= smoothstep(-0.5, 0.0, ndl);
        float a = clamp(rim * intensity * (day + fwd), 0.0, 1.0);
        // slight warm shift near the terminator
        vec3 col = mix(glowColor * vec3(1.0, 0.72, 0.55), glowColor, smoothstep(-0.1, 0.45, ndl));
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}
