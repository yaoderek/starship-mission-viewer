"""Radiation & hazard model verification -> verification/radiation.json + VERIFICATION_radiation.md"""
import json, math, sys; sys.path.insert(0, ".")
import numpy as np
from starship import radiation as R, hazards as H
S, G, P = R.solar(), R.GCR(), R.SPE()
rows = []
def add(cat, item, ours, ref, src, err, ok, note=""):
    rows.append(dict(cat=cat, item=item, ours=ours, ref=ref, src=src, err=err, result=None if ok is None else bool(ok), note=note))
pc = lambda a, b: f"{(a / b - 1) * 100:+.1f}%"
add("GCR (fit)", "Solar-cycle slope from CRaTER free-space Si dose 318 vs 156 uGy/d (2009/10 min vs 2013/14 max)",
    f"phi0 = {G.phi0:.0f} MV (phi {G.phi_min:.0f} -> {G.phi_max:.0f} MV, Usoskin/Väisänen 2023)", "ratio 2.04", "https://doi.org/10.1002/2015SW001314", "fit", None,
    "calibration input, not a test. Si absorbed-dose ratio used for dose equivalent (Q also varies; unquantified)")
add("GCR (fit)", "Amplitude from MSL/RAD cruise Dec 2011-Jul 2012", f"1.84 mSv/d at phi {G.phi_rad:.0f} MV", "1.84 +- 0.30 mSv/d", "https://doi.org/10.1126/science.1235989", "fit", None, "calibration input")
for v in G.validate():
    add("GCR (held-out)", v["name"], f"{v['pred']:.2f} mSv/d (phi {v['phi']:.0f} MV)", f"{v['meas']:.2f} +- {v['sigma']:.2f}", v["source"], pc(v["pred"], v["meas"]), bool(v["pass_"]),
        "pass = within 2 sigma" + ("; Orion case uses the Artemis-I shielding factor 0.7 (-30%)" if "Orion" in v["name"] else "") + ("; phi from SSN regression (Oulu series ends 2021)" if v["phi"] and "2022" in v["source"] or "Artemis" in v["name"] else ""))
add("Solar", "phi(SSN) lagged regression 1964-2021", f"phi = {S.phi_a:.0f} + {S.phi_b:.2f} SSN(t-{S.phi_lag*12:.0f} mo); R^2 {S.phi_r2:.2f}, sigma {S.phi_sigma:.0f} MV",
    "Oulu phi monthly", "https://cosmicrays.oulu.fi/phi/phi.html", "—", None, "sigma propagated into MC")
add("Solar", "Cycle 25 maximum (13-month smoothed SSN)", f"{S.cycle_max[-1]:.1f} (our 13-mo boxcar on NOAA monthly)", "160.9 (SILSO, Oct 2024)",
    "https://www.sidc.be/article/solar-cycle-25-reached-its-maximum-october-2024", pc(S.cycle_max[-1], 160.9), abs(S.cycle_max[-1] / 160.9 - 1) < 0.03)
add("Solar", "Cycle 26 forecast", f"start U(2029-2032), amplitude drawn from cycles 19-25 maxima {', '.join(f'{a:.0f}' for a in S.cycle_max)}; mean cycle shape",
    "NOAA: cycle 26 begins Jan 2029-Dec 2032; no amplitude forecast", "https://www.swpc.noaa.gov/products/solar-cycle-progression", "—", None, "no published cycle-26 amplitude exists; this is our assumption")
k_mod, k_all = R.spe_rate_k("modern"), R.spe_rate_k("all")
for a, b, nobs, npred in P.per_cycle:
    if a < 1986: npred_m = npred * k_mod / k_all
    else: npred_m = npred * k_mod / k_all
    ok = abs(nobs - npred_m) <= 2 * math.sqrt(max(npred_m, 1))
    add("SPE", f"Events Phi30>=1e7 in cycle {a:.1f}-{b:.1f} (rate ∝ SSN, k fitted 1986-2023)", f"{npred_m:.1f}", f"{nobs} (catalogue)",
        "https://zenodo.org/records/15083732", pc(npred_m, nobs) if nobs else "—", ok, "in-sample for >=1986" if a >= 1986 else "out-of-sample: pre-1986 catalogue (Shea & Smart) lists ~2x more events -> catalogue inhomogeneity; modern rate is used")
ev = [(y, f) for y, f in P.ev if 2011.93 <= y < 2012.55]
d_rad = sum(R.d72(10.0) * f / R.PHI30_1972 * 1.2 ** -2.5 for _, f in ev)
add("SPE", "MSL/RAD cruise SEP dose from catalogue events (Dec 2011-Jul 2012), ~10 g/cm^2, r~1.2 AU", f"{d_rad:.1f} mSv (BFO, {len(ev)} catalogue events)", "~25 mGy total from 4-5 SEP events (point dose, Si)",
    "Zeitlin 2013 / Semkova 2020 summary", pc(d_rad, 25), False, "model gives BFO (body self-shielded) dose; RAD is a lightly shielded point detector, and 2 of RAD's events are below the catalogue threshold. Not like-for-like: SPE absolute calibration is UNVALIDATED (factor ~3-10).")
add("SPE", "Aug-1972 dose vs shielding (input)", f"{R.d72(5):.0f}/{R.d72(10):.0f}/{R.d72(20):.0f} mSv @5/10/20 g/cm^2; hull {R.HULL_GCM2*R.STEEL_AL_EQ:.2f} g/cm^2 Al-eq -> {R.d72(R.HULL_GCM2*R.STEEL_AL_EQ):.0f} (extrapolated)",
    "0.59/0.22/0.06 Sv BFO", "https://hdl.handle.net/2346/84719", "input", None, "below 5 g/cm^2 log-linear extrapolation (likely overestimates BFO dose at thin shielding)")
# aerocapture integrator vs Allen-Eggers ballistic entry
H.SHIP_ENTRY["LD"] = 0.3
r = H._fly("earth", 7500.0, -20.0, 0.0)
ae = 7500.0**2 * math.sin(math.radians(20)) / (2 * math.e * 8500.0) / 9.80665
add("Aero", "Entry integrator vs Allen-Eggers ballistic peak deceleration (Earth, 7.5 km/s, -20 deg)", f"{r['gmax']:.1f} g", f"{ae:.1f} g (analytic)", "Allen & Eggers 1958, NACA TR-1381", pc(r["gmax"], ae), abs(r["gmax"] / ae - 1) < 0.05, "checks the integrator only, not the vehicle model. Allen-Eggers neglects gravity and curvature, which plausibly explains +5.5%, but it exceeds the 5% tolerance fixed before running")
add("MMOD", "Grün 1985 flux implementation", f"F(>=1e-6 g) = {H.grun_flux(1e-6):.2e} m^-2 s^-1 at 1 AU", "constants per MEM 3 doc", "https://ntrs.nasa.gov/citations/20200000563", "—", None, "no independent numeric value found to compare against")
add("Belts", "Jupiter dose model", "Ringwald surface dose rates x Juno-vault attenuation", "none for crewed spacecraft", "Ringwald 2000; NASA Juno", "—", None, "ORDER OF MAGNITUDE ONLY (x/÷10); unvalidated")
json.dump(rows, open("verification/radiation.json", "w"), indent=1)

summ = json.load(open("output/radiation_summary.json"))
def tbl(planet, n=20):
    out = ["| # | Route | Model | Launch | TOF yr | Δv km/s | GCR mSv (p05–p95) | Belts mSv (unsh / sh) | SPE mean / p95 unsh | SPE mean / p95 shelter | Total mean (unsh / sh) | Worst 30-d p95 sh |", "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for m in summ[planet][:n]:
        out.append(f"| {m['rank']} | {m['name']}{' **' + ', '.join(m['tags']) + '**' if m['tags'] else ''} | {m['model']} | {m['launch']} | {m['tof']:.2f} | {m['dv']:.2f} | {m['gcr']:.0f} ({m['gcr_p05']:.0f}–{m['gcr_p95']:.0f}) | {m['belts']:.1f} / {m['belts_sh']:.1f} | {m['spe_mean']:.0f} / {m['spe_p95']:.0f} | {m['spe_mean_sh']:.1f} / {m['spe_p95_sh']:.0f} | {m['total_mean']:.0f} / {m['total_mean_sh']:.0f} | {m['win30_p95_sh']:.0f} |")
    return "\n".join(out)
res = lambda x: "PASS" if x is True else "FAIL" if x is False else "INPUT/INFO"
md = ["\n\n## Crew radiation and hazard models (added 2026-10-17)\n",
      "All radiation numbers are **ESTIMATES** of one-way transit dose (no surface stay, no return) for a crew in the Starship cabin. "
      "Dose is reported as dose equivalent in mSv used as a proxy for effective dose (SPE: BFO dose equivalent). Limits: NASA-STD-3001 Vol 1 Rev C — career effective dose < 600 mSv; BFO 250 mGy-Eq / 30 d and 500 mGy-Eq / yr "
      "([NASA](https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf)). The 600 mSv career limit corresponds to NASA's 3 % REID cancer-mortality criterion for the most susceptible case; every route beyond Mars exceeds it in transit alone with this vehicle model.\n",
      "### Model summary\n",
      "* **GCR**: H = A·exp(−φ/φ₀)·(1+0.03·(r−1 AU)). φ(t) from the Oulu reconstruction to 2021, then a lagged SSN regression driven by observed SSN → NOAA SWPC cycle-25 prediction (quartiles) → cycle-26 template. φ₀ from CRaTER's measured solar-min/max ratio, A from MSL/RAD. Radial gradient 3 %/AU from Ulysses/PAMELA (2.8–3.6 %/AU, inner heliosphere); **beyond ~5 AU it is an extrapolation** (Voyager-era gradients are smaller, so outer-planet GCR is probably overestimated). Starship cabin treated as RAD-equivalent shielding (±30 %). The storm shelter is NOT credited against GCR (conservative).",
      "* **Solar activity / launch timing**: Monte Carlo (n=800/mission) over cycle-26 start (U 2029–2032), amplitude (bootstrap of cycles 19–25), NOAA quartile position and φ regression noise. This is why GCR bands are wide (p05–p95 typically ×0.35–×2.2 of the median).",
      "* **SPE**: Poisson process with rate ∝ SSN (k = %.4f events SSN⁻¹ yr⁻¹, Φ30 ≥ 1e7 cm⁻², fitted 1986–2023); fluence bootstrap from the 1956–2023 catalogue (387 events, heavy tail incl. Nov-1960 9e9 and Aug-1972 5e9); r^−2 inside 1 AU, r^−U(2,3) beyond; dose linear in Φ30 relative to Aug-1972 BFO dose vs Al depth. Shelter: 10 %% of each event's dose is received before sheltering (assumption). Flares cannot be scheduled: the viewer shows a 30-day probability of a large event (Φ30 ≥ 1e8 at the ship), not event dates." % k_mod,
      "* **Belts**: Earth Van Allen transit 4 mSv (2–8) per departure / Earth flyby < 40,000 km, from Artemis I (Orion phantom 1.96 + 0.11 mGy, scaled for lighter shielding); shelter factor 134/287 from Artemis I HERA. Jupiter: Ringwald (2000) unshielded rates at Io/Europa/Ganymede/Callisto, log-interpolated, attenuated by Juno's vault factor (1 cm Ti → ÷800), integrated along the hyperbolic pass; no extra credit beyond 4.5 g/cm²; **order of magnitude only**. Saturn/Uranus/Neptune belts not modelled (weaker; flagged).",
      "* **Hazards**: ORDEM 3.0 2029 debris flux at 340 km (≥1 mm, ≥3 mm, ≥1 cm), refuelling loiter = tankers × 7 d (cadence is an assumption); Grün 1985 micrometeoroids × r^−1.3 (Leinert 1981); asteroid belt n·σ·v·t with 1.2e6 bodies > 1 km (Tedesco & Desert 2002); ring-plane crossings qualitative; aerocapture 3-DOF exponential-atmosphere integration with Sutton–Graves convective heating (vehicle β, L/D, nose radius are estimates; radiative heating not modelled); comms light-time and solar-conjunction (SEP < 2°) from DE440s; consumables from NASA BVAD.\n",
      "### Validation\n", "| Category | Item | Ours | Reference | Source | Error | Result | Note |", "|---|---|---|---|---|---|---|---|"]
for r_ in rows: md.append(f"| {r_['cat']} | {r_['item']} | {r_['ours']} | {r_['ref']} | {r_['src']} | {r_['err']} | {res(r_['result'])} | {r_['note']} |")
md += ["\n### Sample results (one-way, shelter 20 g/cm² water)\n", "**Mars**\n", tbl("mars"), "\n**Jupiter** (capture periapsis 3 Rj unless noted; rp30Rj = radiation-aware variant)\n", tbl("jupiter"),
       "\n**Saturn**\n", tbl("saturn", 6), "\n**Neptune**\n", tbl("neptune", 5),
       "\nPareto plots: `output/<planet>/pareto_dv_dose.png`; cumulative-dose plots: `output/<planet>/dose_cumulative.png`. Low-dose alternatives were added to the viewer JSONs (tag `low-dose alternative`).\n",
       "### Caveats\n* SPE absolute dose is not validated against a like-for-like measurement (FAIL above); treat SPE numbers as ±×3–10. The shelter benefit ratio is more robust than the absolute value.\n* GCR is validated at 1 AU only (TGO +13 %, CRaTER 0 %, Orion −2 % with shielding factor). Values at Jupiter and beyond rest on an extrapolated radial gradient.\n* Jupiter belt doses are order-of-magnitude (unvalidated). A 3 Rj capture periapsis is the planner default; at ~250 mSv unsheltered per pass it is the single largest avoidable dose, and raising periapsis to 30 Rj costs ~0.3 km/s.\n* No return trip, no surface stay, no EVA, no vehicle-internal shielding beyond hull + shelter; crew size does not affect dose.\n"]
open("verification/VERIFICATION_radiation.md", "w").write("\n".join(md))
print(sum(r_["result"] is True for r_ in rows), "pass", sum(r_["result"] is False for r_ in rows), "fail", sum(r_["result"] is None for r_ in rows), "info")
for r_ in rows: print(res(r_["result"]), r_["item"][:70], r_["ours"][:60], r_["ref"], r_["err"])
