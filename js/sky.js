// Background sky: HYG v4.1 stars (mag <= 6.5, ecliptic J2000) and a schematic Milky Way band.
// The star shader can apply relativistic aberration and Doppler shift for a moving observer,
// so the interstellar view shows what the crew would see at the current speed.
import * as THREE from 'three';

let skyData = null;
export async function loadSkyData() {
  if (!skyData) skyData = fetch('sky.json').then(r => r.json());
  return skyData;
}

function bvToRGB(bv) {
  bv = Math.max(-0.4, Math.min(2.0, bv));
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)), t = T / 100;
  const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * Math.pow(t - 60, -0.0755);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  return [r, g, b].map(x => Math.max(0, Math.min(255, x)) / 255);
}

const VERT = `
attribute float size; varying vec3 vC; uniform float pr; uniform float uBeta; uniform vec3 uDir; uniform float uGain; uniform float uGrow;
void main(){
  vec3 p = normalize(position); vec3 c = color; float s = size;
  if (uBeta > 0.0005) {
    float ct = dot(p, uDir);
    float ctp = (ct + uBeta) / (1.0 + uBeta * ct);              // aberration: stars crowd toward the direction of travel
    vec3 perp = p - uDir * ct; float pl = length(perp);
    vec3 pn = pl > 1e-6 ? perp / pl : vec3(0.0);
    p = uDir * ctp + pn * sqrt(max(0.0, 1.0 - ctp * ctp));
    float g = inversesqrt(1.0 - uBeta * uBeta);
    float D = 1.0 / (g * (1.0 - uBeta * ctp));                 // Doppler factor seen by the moving observer
    c *= clamp(pow(D, 1.4), 0.06, uGain);
    s *= clamp(sqrt(D), 0.6, uGrow);
    c = mix(c, c * vec3(0.55, 0.78, 1.35), clamp((D - 1.0) * 0.35, 0.0, 0.85));
    c = mix(c, c * vec3(1.35, 0.55, 0.35), clamp((1.0 - D) * 1.4, 0.0, 0.85));
  }
  vC = c; gl_PointSize = s * pr;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p * 5.0, 1.0);
}`;

// Returns a group with the star and Milky Way points; `uniforms` drives the relativistic effect.
export function makeSky(d, { brightness = 1 } = {}) {
  const pr = Math.min(devicePixelRatio, 2);
  const uniforms = { pr: { value: pr }, uBeta: { value: 0 }, uDir: { value: new THREE.Vector3(1, 0, 0) } };
  const group = new THREE.Group();
  const mk = (pts, vs, frag, gain, grow) => {
    const g = new THREE.BufferGeometry(), P = [], C = [], S = [];
    for (const q of pts) { const [x, y, z, c, sz] = vs(q); P.push(x, y, z); C.push(...c); S.push(sz); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(S, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, vertexColors: true, uniforms: { ...uniforms, uGain: { value: gain }, uGrow: { value: grow } }, vertexShader: VERT, fragmentShader: frag });
    const pt = new THREE.Points(g, m); pt.frustumCulled = false; group.add(pt);
  };
  mk(d.stars, q => {
    const f = Math.pow(10, -0.4 * q[3]), c = bvToRGB(q[4]), a = Math.min(1, 0.14 + 0.8 * Math.pow(f, 0.42)) * brightness;
    return [q[0], q[1], q[2], c.map(x => x * a * 0.9), Math.max(1.0, Math.min(4.8, 1.6 + 2.6 * Math.pow(f, 0.3)))];
  }, `varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .1, d); gl_FragColor = vec4(vC, a); }`, 5.0, 2.4);
  mk(d.milkyway, q => [q[0], q[1], q[2], [0.024 * q[3] * brightness, 0.026 * q[3] * brightness, 0.034 * q[3] * brightness], 14],
    `varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d); gl_FragColor = vec4(vC, a * .5); }`, 1.6, 1.0);
  return { group, uniforms };
}
