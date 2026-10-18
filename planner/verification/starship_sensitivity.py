"""Starship rocket-equation model: independent re-derivation + sensitivity tables."""
import sys, math, json, itertools; sys.path.insert(0, ".")
from starship.vehicle import Starship
g0 = 9.80665e-3
def dv_indep(dry, pay, prop, isp): return isp * g0 * math.log((dry + pay + prop) / (dry + pay))
ok = True
for dry, pay, n, load, isp in itertools.product([100, 120, 150], [20, 100], [0, 4, 8, 12, 16], [100, 150], [366, 375, 380]):
    s = Starship(dry_mass_t=dry, payload_t=pay, refuels=n, tanker_load_t=load, isp_s=isp)
    prop = min(1600, 50 + n * load)
    a, b = s.delta_v(), dv_indep(dry, pay, prop, isp)
    if abs(a - b) > 1e-9: ok = False
    nn = s.refuels_needed(a - 1e-6)
    if nn is not None and nn > n: ok = False
print("rocket-equation re-derivation + refuels_needed round-trip:", "PASS" if ok else "FAIL")
out = {}
print("\nTankers needed (100 t/tanker; 125; 150) vs mission dv and payload; dry 120 t, Isp 375 s, 1600 t capacity, 50 t residual")
for pay in [20, 50, 100, 150]:
    for dv in [3.7, 5.8, 6.5, 7.5, 8.2]:
        row = [Starship(payload_t=pay, tanker_load_t=L).refuels_needed(dv) for L in (100, 125, 150)]
        out[f"{pay}_{dv}"] = row
        print(f"  payload {pay:3d} t  dv {dv:.1f} km/s  tankers {['-' if r is None else r for r in row]}")
print("\nMax dv (full 1600 t) by dry mass / Isp, payload 100 t:")
for dry in (100, 120, 150):
    print("  dry", dry, " ".join(f"Isp{i}:{dv_indep(dry,100,1600,i):.2f}" for i in (366, 375, 380)))
json.dump(out, open("verification/starship_sensitivity.json", "w"), indent=1)
