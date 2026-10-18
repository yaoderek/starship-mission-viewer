// Re-size every precomputed trajectory for a different vehicle.
// Trajectory Δv legs do not depend on the vehicle, so we keep them and redo the propellant
// chain with the rocket equation. With the baseline Starship inputs this reproduces the
// numbers in the mission files exactly (see VERIFICATION.md, "multi-burn propellant chaining").
import { shieldMass } from './radiation.js';
const G0 = 9.80665;

export function describeVehicle(p) {
  const flights = n => `${n} refuel mission${Number(n) === 1 ? '' : 's'}`;
  return `dry ${p.dry} t, payload ${p.payload} t, tanks ${p.cap} t, Isp ${p.isp} s, up to ${flights(p.maxTankers)} × ${p.tanker} t; ${p.wall ? `+${p.wall} g/cm² water round the cabin, ` : ''}${p.shelter ? `${p.shelter} g/cm² storm shelter` : 'no storm shelter'}`;
}

// Propellant needed to fly a list of burns (km/s, in order) ending at mass mf (t).
function chain(burns, mf, ve) {
  let m = mf;
  for (let k = burns.length - 1; k >= 0; k--) m *= Math.exp(burns[k] * 1000 / ve);
  return m - mf;
}

export function resize(m, p0, arch) {
  // radiation shielding beyond the baseline (no extra wall, 20 g/cm² shelter) rides along as dry mass
  const p = { ...p0, dry: p0.dry + shieldMass({ wall: p0.wall ?? 0, shelter: p0.shelter ?? 20 }) };
  const S = m.summary0 || (m.summary0 = { ...m.summary });
  const s = { ...S }, ve = p.isp * G0, mode = m.mode || 'one-way';
  const out = [S.dv_dep + (S.dv_dsm || 0), S.dv_capture || 0];
  if (mode === 'one-way') {
    s.prop_leo_t = chain(out, p.dry + p.payload, ve);
    s.prop_dest_t = 0;
  } else {
    const retMass = p.dry + (S.surface ? (arch?.return_payload_t ?? 20) : p.payload);
    const back = [S.dv_ret_dep || 0, S.dv_brake || 0];
    const fromLeo = (S.dest_source || '').startsWith('none');
    if (fromLeo) { s.prop_leo_t = chain([...out, ...back], p.dry + p.payload, ve); s.prop_dest_t = 0; }
    else { s.prop_leo_t = chain(out, p.dry + p.payload, ve); s.prop_dest_t = chain(back, retMass, ve); }
  }
  const need = Math.max(0, s.prop_leo_t - p.residual);
  s.tankers_needed = s.prop_leo_t > p.cap ? null : Math.ceil(need / p.tanker - 1e-9);
  s.total_launches = s.tankers_needed == null ? null : s.tankers_needed + 1;
  const reasons = [];
  if (s.prop_leo_t > p.cap) reasons.push(`needs ${Math.round(s.prop_leo_t)} t, tanks hold ${p.cap} t`);
  else if (s.tankers_needed > p.maxTankers) reasons.push(`needs ${s.tankers_needed} refuel mission${s.tankers_needed === 1 ? '' : 's'}, limit ${p.maxTankers}`);
  if (s.prop_dest_t > p.cap) reasons.push(`return burn needs ${Math.round(s.prop_dest_t)} t at destination`);
  if ((S.dest_source || '').startsWith('REQ')) reasons.push('return propellant must already be waiting at the destination');
  if (m.isru && !m.isru.feasible_at_config) reasons.push('surface propellant plant too slow for this stay');
  s.feasible = reasons.length === 0;
  s.why = reasons;
  m.summary = s;
}

export function resizeAll(data, p) {
  for (const m of data.missions) if (m.summary.dv_dep != null && data.target !== 'galileo') resize(m, p, data.architecture);
  data.vehicleParams = p;
  data.vehicle = describeVehicle(p);
}
