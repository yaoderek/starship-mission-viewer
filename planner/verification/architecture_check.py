"""Validation of the v0.4 architecture models -> verification/architecture.json + VERIFICATION_architecture.md"""
import json, math, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import numpy as np
from starship import architecture as X, radiation as R
from starship.constants import AU, DAY, MU_SUN, PLANETS
from starship.ephem import state
from starship.lambert import lambert, propagate
from starship.vehicle import Starship
rows = []
def row(name, ref, ours, ok, note, src):
    rows.append(dict(name=name, ref=ref, ours=ours, result=None if ok is None else bool(ok), note=note, src=src))
S = json.load(open("output/architecture_summary.json"))
mars = {m["mode"] + ("" if m["mode"] != "isru" else "-%d" % round(m["stay_days"])): m for m in S["mars"]}
conj = S["mars"][0] if S["mars"][0]["mode"] == "conjunction" else [m for m in S["mars"] if m["mode"] == "conjunction"][0]
opp = [m for m in S["mars"] if m["mode"] == "opposition"][0]
isru = [m for m in S["mars"] if m["mode"] == "isru"]
# 1 return-leg Lambert endpoint by independent propagation
D0 = 2464000.5; r1 = state("mars", D0)[0]; r2 = state("earth", D0 + 220)[0]; v1, _ = lambert(r1, r2, 220 * DAY, MU_SUN)
err = np.linalg.norm(propagate(r1, v1, 220 * DAY, MU_SUN)[0] - r2)
row("Return leg (Mars->Earth) Lambert, propagated endpoint error", "< 1000 km", f"{err:.3g} km", err < 1000, "universal-variable propagation of the Lambert v1", "internal")
# 2 Mars ascent: reproduce the 20%-gravity-loss arithmetic of Palaszewski
v = math.sqrt(PLANETS["mars"][1] / (PLANETS["mars"][2] + 100)); row("Mars ascent to 100 km LMO", "4.2 km/s (NTRS 20210026187, ideal +20%)", f"{v:.3f} x 1.2 = {1.2*v:.2f} km/s; used {X.MARS_ASCENT_LMO['central']}",
    abs(1.2 * v - 4.2) / 4.2 < 0.03, "Circular speed 3.50 km/s + 20% losses; MSR MAV 4.15 km/s", X.MARS_ASCENT_LMO["src"][:90])
# 3 conjunction class vs DRA 5.0
row("Conjunction-class Mars: stay / total duration", "~500 d stay, ~900 d total; transits 175-225 d (NASA SP-2009-566 DRA 5.0)",
    f"stay {conj['stay_days']:.0f} d, total {conj['total_days']:.0f} d, out {conj['out_days']:.0f} / ret {conj['ret_days']:.0f} d",
    400 <= conj["stay_days"] <= 650 and 850 <= conj["total_days"] <= 1000, "min-Δv search over stays 400-620 d; optimum sits at the 400 d edge (shorter stays cost more)", "NASA SP-2009-566")
row("Conjunction-class Mars: transit times", "175-225 d each way (DRA 5.0 crew transits)", f"out {conj['out_days']:.0f} d / ret {conj['ret_days']:.0f} d",
    175 <= conj["out_days"] <= 225 and 175 <= conj["ret_days"] <= 225, "MISMATCH: our search minimises Δv with no crew-transit cap, so it picks a slow 316-d outbound; DRA caps transits for crew health", "NASA SP-2009-566")
row("Opposition-class Mars: stay / total duration", "30-90 d stay, ~400-650 d total, Venus swing-by often used (DRA 5.0 short-stay)",
    f"stay {opp['stay_days']:.0f} d, total {opp['total_days']:.0f} d, via {opp['via']}", 30 <= opp["stay_days"] <= 90 and 400 <= opp["total_days"] <= 650, "", "NASA SP-2009-566")
row("Opposition costs more Δv than conjunction", "qualitative (DRA 5.0)", f"{opp['dv_total']:.2f} vs {conj['dv_total']:.2f} km/s", opp["dv_total"] > conj["dv_total"], "", "NASA SP-2009-566")
# 4 ISRU reproduction of published plants
k = X.isru_plan(300.0, 608.0); row("ISRU power: NASA kiloton study (300 t in 20 months)", "~230 kW (NTRS 20230017069)", f"{k['power_kw']*11.2/13.6:.0f} kW at 11.2 kWh/kg; {k['power_kw']:.0f} kW at central 13.6",
    abs(k["power_kw"] * 11.2 / 13.6 - 230) / 230 < 0.1, "lower bound of our range reproduces the study; central 13.6 is +21%", "NTRS 20230017069")
k = X.isru_plan(29.7, 480.0); row("ISRU power: Kleinhenz & Paz 2017 (29.7 t in 480 d)", "52 kW all-electric / 35 kW recuperated", f"{k['power_kw_hi']:.1f} / {k['power_kw']:.1f} kW",
    abs(k["power_kw_hi"] - 52) < 3 and abs(k["power_kw"] - 35) < 3, "by construction (range end-points taken from this paper) - consistency, not independent", "NTRS 20170001421")
row("ISRU plant mass: Kleinhenz 1.7 t", "1.7 t", f"{k['plant_t']:.2f} t", abs(k["plant_t"] - 1.7) < 0.1, "by construction", "NTRS 20170001421")
sh = Starship(); p = X.stack_prop([X.MARS_ASCENT_LMO["central"] + 2.0], 85.0, [50.0])
row("Return propellant vs SpaceX figure", "~1100 t per ship (Musk IAC 2017)", f"ours {isru[1]['prop_dest_t']:.0f} t (dry 120 t, return payload 20 t); dry 85 t + 50 t payload: {p:.0f} t",
    None, "INFO: SpaceX figure includes unstated payload, margins and possibly full-tank fill; not directly comparable", "Musk 2017")
# 5 mission-dose integration vs Hassler 2014 / Zeitlin 2013 headline (180 + 500 + 180 d, 2012 conditions)
t0 = 2455890.5; jd = np.arange(t0, t0 + 861, 1.0); traj = np.array([[t, 1.25, 0, 0] for t in jd])
rad = R.mission_dose(traj, [], n_mc=50, stays=[dict(jd0=t0 + 180, jd1=t0 + 680, kind="surface", rate=0.64, rate_sd=0.12, d_spe=0.0)])
g = rad["totals"]["gcr"]; row("Round-trip GCR+surface dose, MSL-era conditions (180/500/180 d)", "~1.01 Sv (Hassler et al. 2014: 2x0.33 + 0.32 Sv)",
    f"{g/1000:.2f} Sv (GCR part, cruise at 1.25 AU from 2011-11)", abs(g - 1010) / 1010 < 0.2,
    "cruise rate follows the solar-cycle model through 2012-14 rather than the fixed 1.84 mSv/d", "Hassler 2014 Science 343:1244797; Zeitlin 2013 Science 340:1080")
row("Regolith shielding (1 m)", "-71% effective dose (Geant4, NST 2022); -41% primary-only (PSS 2022); 1 m meets all PELs (HZETRN, TTU 2015)",
    f"factor {X.REGOLITH[1.0]:.2f}", None, "INFO: published values disagree by ~2x; we use the Geant4 effective-dose ratio", X.REGOLITH_SRC[:80])
# 6 rocket-equation chaining
a = X.stack_prop([1.0, 2.0], 120.0, [100.0, 100.0]); b = Starship().prop_needed_t(3.0)
row("Multi-burn propellant chaining == single burn (no payload drop)", f"{b:.3f} t", f"{a:.3f} t", abs(a - b) < 1e-6, "", "internal")
json.dump(rows, open("verification/architecture.json", "w"), indent=1)
md = ["\n## v0.4 Mission architectures (round trip, opposition, ISRU)\n", "| Check | Reference | Ours | Result | Note |", "|---|---|---|---|---|"]
for r in rows: md.append(f"| {r['name']} | {r['ref']} | {r['ours']} | {'INFO' if r['result'] is None else ('PASS' if r['result'] else 'FAIL')} | {r['note']} |")
open("verification/VERIFICATION_architecture.md", "w").write("\n".join(md) + "\n")
print("\n".join(md))
