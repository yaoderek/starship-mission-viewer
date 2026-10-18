"""Re-evaluate tanker counts / feasibility in all saved results with the corrected vehicle default
(propellant capacity 1500 -> 1600 t, SpaceX 2026 spec). Trajectories are unchanged (vehicle-independent)."""
import json, re, sys, glob, os; sys.path.insert(0, ".")
from starship.vehicle import Starship
changes = []
for vj in sorted(glob.glob("viewer/missions/*.json")):
    if vj.endswith("index.json") or "galileo" in vj: continue
    d = json.load(open(vj)); v = d["vehicle"]
    m = re.search(r"dry ([\d.]+) t, payload ([\d.]+) t, prop cap ([\d.]+) t, Isp ([\d.]+) s, (\d+) (?:tankers|refuel missions?) x ([\d.]+) t", v)
    dry, pay, cap, isp, n, load = map(float, m.groups())
    ship = Starship(dry_mass_t=dry, payload_t=pay, prop_capacity_t=1600.0, isp_s=isp, refuels=int(n), tanker_load_t=load)
    tgt = d["target"]; rk = f"output/{tgt}/ranked.json"; rows = json.load(open(rk)) if os.path.exists(rk) else []
    for i, mi in enumerate(d["missions"]):
        s = mi["summary"]; old = (s["tankers_needed"], s["feasible"])
        need = ship.refuels_needed(s["dv_total"]); feas = need is not None and need <= ship.refuels
        s["tankers_needed"], s["feasible"] = need, feas
        if i < len(rows): rows[i]["tankers_needed"], rows[i]["feasible"] = need, feas
        if old != (need, feas): changes.append((tgt, mi["name"], mi["model"], s["dv_total"], old, (need, feas)))
    d["vehicle"] = v.replace(f"prop cap {cap} t", "prop cap 1600.0 t")
    json.dump(d, open(vj, "w"))
    if rows: json.dump(rows, open(rk, "w"), indent=1)
for c in changes: print(f"{c[0]:8s} {c[1]:11s} {c[2]:9s} dv {c[3]:.2f}: tankers/feasible {c[4]} -> {c[5]}")
json.dump(changes, open("verification/vehicle_changes.json", "w"), indent=1)
