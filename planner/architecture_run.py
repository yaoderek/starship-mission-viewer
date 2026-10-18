"""Mission-architecture builder: round trips (conjunction / opposition class) and Mars ISRU extended stay.
Adds missions with field `mode` to viewer/missions/<planet>.json (existing ones become mode 'one-way').
Usage: python architecture_run.py [--planets mars,venus,jupiter] [--modes conjunction,opposition,isru]
       [--stay 500] [--regolith 0|0.5|1.0] [--isru-power-kw 1000] [--crew 12] [--shelter 20] [--mc 400]"""
import argparse, json, math, re, os
import numpy as np
from starship import architecture as X, radiation as R, hazards as H
from starship.constants import AU, DAY, PLANETS
from starship.ephem import state, date_from_jd
from starship.maneuvers import departure_dv, entry_speed, propulsive_capture_dv, DEFAULT_MAX_ENTRY, AEROCAPTURE_TRIM_KMS
from starship.vehicle import Starship

ap = argparse.ArgumentParser()
ap.add_argument("--planets", default="mars,venus,jupiter"); ap.add_argument("--modes", default="conjunction,opposition,isru")
ap.add_argument("--stay", type=float, default=None, help="ISRU: target surface stay (d); default builds 3 stay classes")
ap.add_argument("--regolith", type=float, default=0.0, choices=[0.0, 0.5, 1.0]); ap.add_argument("--isru-power-kw", type=float, default=1000.0)
ap.add_argument("--crew", type=int, default=12); ap.add_argument("--shelter", type=float, default=20.0); ap.add_argument("--mc", type=int, default=400)
A = ap.parse_args()
SHIP = Starship(prop_capacity_t=1600.0); CAP = SHIP.prop_capacity_t; DRY, PAY = SHIP.dry_mass_t, SHIP.payload_t
D = lambda jd: str(date_from_jd(jd).date())

def outbound_cands(tgt, need_aero=False, keep=40, margin=1.0):
    z = np.load(f"output/{tgt}/porkchop_grid.npz"); L, T, DV, VA = z["launch_jd"], z["tof_days"], z["dv"], z["vinf_arr"]
    c = []
    for j in range(0, len(T), 2):
        for i in range(0, len(L), 2):
            if not np.isfinite(DV[j, i]): continue
            va = float(VA[j, i]); r1, ve = state("earth", L[i]); c3 = float(z["c3"][j, i]) if "c3" in z else None
            ent = entry_speed(tgt, va) if PLANETS[tgt][3] else None
            aero = ent is not None and ent <= DEFAULT_MAX_ENTRY.get(tgt, 0)
            if need_aero and not aero: continue
            dd = departure_dv(math.sqrt(c3) if c3 is not None else 0) if c3 is not None else None
            c.append((float(DV[j, i]), float(L[i]), float(T[j]), va, aero, ent))
    c.sort(); best = c[0][0]
    # thin: keep best per ~20-day launch bin within margin
    out, seen = [], set()
    for q in c:
        if q[0] > best + margin: break
        k = (round(q[1] / 20), round(q[2] / 20))
        if k in seen: continue
        seen.add(k); out.append(q)
        if len(out) >= keep: break
    return out

def out_leg(tgt, L, T):
    r1, v1e = state("earth", L); r2, v2p = state(tgt, L + T); s = X.lambert(r1, r2, T * DAY, X.MU_SUN)
    return r1, s[0], np.linalg.norm(s[0] - v1e), np.linalg.norm(s[1] - v2p)

def build(tgt, mode, o, ret, stay_kind, extra=None):
    dvo, L, T, va, aero, ent = o; A_ = L + T; r1, v1, vi, _ = out_leg(tgt, L, T)
    dep = departure_dv(vi); mu, Rb = PLANETS[tgt][1], PLANETS[tgt][2]
    land = stay_kind == "surface"
    if land: cap_dv, cap_lbl = X.MARS_LANDING["central"], f"{tgt.title()} entry + propulsive landing {X.MARS_LANDING['central']:.2f} km/s (v∞ {va:.2f}, entry {ent:.2f} km/s)"
    elif aero: cap_dv, cap_lbl = AEROCAPTURE_TRIM_KMS, f"{tgt.title()} aero capture {AEROCAPTURE_TRIM_KMS:.2f} km/s (v∞ {va:.2f})"
    else:
        alt = (X.JUP_RT_RP_RJ - 1) * Rb if tgt == "jupiter" else None
        cap_dv = propulsive_capture_dv(tgt, va, peri_alt_km=alt)
        cap_lbl = f"{tgt.title()} prop capture {cap_dv:.2f} km/s (v∞ {va:.2f})" + (f", periapsis {X.JUP_RT_RP_RJ:.0f} Rj" if tgt == "jupiter" else "")
    Dd, Tr = ret["D"], ret["T"]; Ret = Dd + Tr; stay = Dd - A_
    pts = X.lambert_pts(r1, v1, L, T, 220) + X.planet_pts(tgt, A_, Dd, 4.0)
    for (o_, d_, t0, tt, rr, vv) in ret["legs"]: pts += X.lambert_pts(rr, vv, t0, tt, 160)
    p0 = pts[0][1:]
    ev = [dict(type="launch", body="earth", jd=L, date=D(L), pos=p0, dv=dep, label=f"Launch TLI {dep:.2f} km/s (C3 {vi*vi:.1f})", hazard=False),
          dict(type="arrival", body=tgt, jd=A_, date=D(A_), pos=list(state(tgt, A_)[0] / AU), dv=cap_dv, label=cap_lbl, hazard=aero or land)]
    if land: ev.append(dict(type="surface", body=tgt, jd=A_ + 0.5, date=D(A_), pos=ev[-1]["pos"], dv=0, label=f"Surface stay {stay:.0f} d (ISRU production)", hazard=False))
    dl = (f"Mars ascent {X.MARS_ASCENT_LMO['central']:.2f} + TEI {ret['dv_dep']-X.MARS_ASCENT_LMO['central']:.2f} km/s" if land
          else f"{tgt.title()} departure {ret['dv_dep']:.2f} km/s") + f" (v∞ {ret['vinf_dep']:.2f})"
    ev.append(dict(type="departure", body=tgt, jd=Dd, date=D(Dd), pos=list(state(tgt, Dd)[0] / AU), dv=ret["dv_dep"], label=dl, hazard=land))
    if ret.get("via"):
        fj = ret["flyby_jd"]; ev.append(dict(type="flyby", body="venus", jd=fj, date=D(fj), pos=list(state("venus", fj)[0] / AU), dv=ret["dv_flyby"],
                                            label=f"Venus flyby alt {ret['flyby_alt']:.0f} km, Δv {ret['dv_flyby']:.2f} km/s", hazard=ret["flyby_alt"] < 500))
    ev.append(dict(type="return", body="earth", jd=Ret, date=D(Ret), pos=list(state("earth", Ret)[0] / AU), dv=ret["brake"],
                   label=f"Earth entry {ret['v_entry']:.2f} km/s (v∞ {ret['vinf_arr']:.2f})" + (f", braking {ret['brake']:.2f} km/s" if ret["brake"] > 0 else ", direct entry"),
                   hazard=ret["v_entry"] > 11.5))
    ev.sort(key=lambda e: e["jd"])
    # propellant / refuelling
    rdv = ret["dv"]; S = dict(mode=mode, launch=D(L), arrive=D(A_), depart=D(Dd), ret=D(Ret), stay_days=stay, out_days=T, ret_days=Tr,
                              total_days=Ret - L, tof_years=(Ret - L) / 365.25, c3=vi * vi, dv_dep=dep, dv_dsm=0.0, dv_capture=cap_dv,
                              capture="aero" if (aero and not land) else ("edl" if land else "prop"), dv_return=rdv, dv_ret_dep=ret["dv_dep"],
                              dv_flyby=ret.get("dv_flyby", 0.0), dv_brake=ret["brake"], v_entry_earth=ret["v_entry"], vinf_earth=ret["vinf_arr"],
                              dv_total=dep + cap_dv + rdv, via=ret.get("via"), surface=land)
    if land:
        p_leo = SHIP.prop_needed_t(dep + cap_dv); p_dst = X.stack_prop([rdv], DRY, [X.RETURN_PAYLOAD_T])
        S.update(prop_leo_t=p_leo, prop_dest_t=p_dst, dest_source="ISRU")
    else:
        p_all = X.stack_prop([dep, cap_dv, rdv], DRY, [PAY, PAY, PAY])
        if p_all <= CAP: S.update(prop_leo_t=p_all, prop_dest_t=0.0, dest_source="none (single tank load)")
        else: S.update(prop_leo_t=SHIP.prop_needed_t(dep + cap_dv), prop_dest_t=X.stack_prop([rdv], DRY, [PAY]), dest_source="REQUIRED at destination (prepositioned propellant depot) - not modelled")
    nt = None if S["prop_leo_t"] > CAP else max(0, math.ceil((S["prop_leo_t"] - SHIP.residual_prop_leo_t) / SHIP.tanker_load_t - 1e-9))
    S["tankers_needed"] = nt; S["total_launches"] = None if nt is None else nt + 1
    S["feasible"] = nt is not None and nt <= SHIP.refuels and S["prop_dest_t"] <= CAP and (S["prop_dest_t"] == 0 or land)
    S["dest_tank_ok"] = S["prop_dest_t"] <= CAP
    m = dict(rank=0, name="E-" + tgt[0].upper() + ("-V" if ret.get("via") else "") + "-E", model=mode, mode=mode, summary=S, traj=pts, events=ev,
             hazards=[], phases=[dict(name="outbound", jd0=L, jd1=A_), dict(name="surface stay" if land else "orbit stay", jd0=A_, jd1=Dd),
                                 dict(name="return", jd0=Dd, jd1=Ret)])
    if land:   # ISRU sizing
        prod = stay - X.ISRU_MARGIN_D; plan = X.isru_plan(S["prop_dest_t"], prod)
        pre = X.isru_plan(S["prop_dest_t"], prod + 780.0)
        e_need = plan["energy_mwh"]; t_at = e_need / (A.isru_power_kw * 24 / 1e3)   # days at configured plant power
        curve = [dict(days=dd, kw=X.isru_plan(S["prop_dest_t"], dd)["power_kw"]) for dd in (30, 60, 120, 240, 360, 480, 600, 780, 1000, 1300, 1600, 2000)]
        landed = plan["plant_t"] + plan["nuclear_t"][0]
        m["isru"] = dict(plan=plan, predeploy=pre, power_kw_config=A.isru_power_kw, days_at_config=t_at,
                         feasible_at_config=t_at + X.ISRU_MARGIN_D <= stay, earliest_return_jd=A_ + t_at + X.ISRU_MARGIN_D,
                         curve=curve, cargo_ships_nuclear=math.ceil(landed / PAY), cargo_ships_solar=math.ceil((plan["plant_t"] + plan["solar_t"][0]) / PAY),
                         sources=dict(energy=X.ISRU_KWH_PER_KG["src"], plant=X.ISRU_PLANT_KG_PER_KGD["src"], power=X.POWER_KG_PER_KWE["src"]),
                         check_spacex=X.SPACEX_RETURN_PROP_T)
        S["feasible"] = S["feasible"] and m["isru"]["feasible_at_config"]
    if extra: m.update(extra)
    return m

def analyze(m, tgt, regolith):
    S = m["summary"]; ev = m["events"]; ph = m["phases"]; a, z = ph[1]["jd0"], ph[1]["jd1"]
    stays = []
    if S["surface"]:
        stays.append(dict(jd0=a, jd1=z, kind="surface", rate=X.MARS_SURFACE_DOSE["rate"] * X.REGOLITH[regolith], rate_sd=X.MARS_SURFACE_DOSE["sd"] * X.REGOLITH[regolith],
                          d_spe=0.5 * R.d72(X.MARS_COLUMN_GCM2 + (150.0 * regolith if regolith else 0))))
    else:
        alt, _ = X.capture_orbit_defaults(tgt); Rb = PLANETS[tgt][2]
        if tgt == "jupiter": alt = (X.JUP_RT_RP_RJ - 1) * Rb
        geo = 1 - (1 - math.cos(math.asin(Rb / (Rb + alt)))) / 2 if tgt != "jupiter" else 1.0
        stays.append(dict(jd0=a, jd1=z, kind="orbit", geo=geo))
    extra = []
    xh = R.HULL_GCM2 * R.STEEL_AL_EQ; xs = xh + A.shelter
    ret = [e for e in ev if e["type"] == "return"][0]
    extra.append(dict(jd=ret["jd"] - 0.1, body="earth", label="Van Allen belt transit (return)", hull=R.EARTH_BELT["central"],
                      sh=R.EARTH_BELT["central"] * R.ARTEMIS_SHELTER_BELT, rp_rj=None))
    if tgt == "jupiter":   # periapsis passes of the 20 Rj, e=0.9 orbit during the stay + departure pass
        mu, Rj = PLANETS["jupiter"][1], PLANETS["jupiter"][2]; rp = X.JUP_RT_RP_RJ * Rj; aa = rp / 0.1
        per = 2 * math.pi * math.sqrt(aa**3 / mu) / 86400; t = a + per
        while t <= z + 1e-6:
            extra.append(dict(jd=min(t, z), body="jupiter", label=f"Jupiter orbit periapsis {X.JUP_RT_RP_RJ:.0f} Rj", rp_rj=X.JUP_RT_RP_RJ,
                              hull=R.hyperbola_pass_dose(rp, 0.5, mu, Rj, lambda q: R.jupiter_rate(q, xh)),
                              sh=R.hyperbola_pass_dose(rp, 0.5, mu, Rj, lambda q: R.jupiter_rate(q, xs)))); t += per
    rad = R.mission_dose(m["traj"], [e for e in ev if e["type"] in ("launch", "arrival", "flyby")], shelter_gcm2=A.shelter, n_mc=A.mc,
                         jup_rp_rj=X.JUP_RT_RP_RJ if tgt == "jupiter" else None, stays=stays, extra_belts=extra)
    hz = H.mission_hazards(m, rad, n_crew=A.crew)
    dur = S["total_days"]; kgd = sum(H.BVAD.values())
    for h in hz:
        if h["id"] == "eclss":
            h["title"] = f"Duration {dur:.0f} d (out {S['out_days']:.0f} / stay {S['stay_days']:.0f} / return {S['ret_days']:.0f}): consumables"
            h["note"] = (f"Open-loop O2+food+water {kgd:.2f} kg/crew-day (BVAD) -> {kgd*dur*A.crew/1000:.1f} t for {A.crew} crew, full round trip, before recycling. "
                         f"Longest human spaceflight to date: {H.LONGEST_FLIGHT_D} d.")
    def add(**k): hz.append(k)
    if S["surface"]:
        st = S["stay_days"]; p_lo, p_hi = 1 - math.exp(-st / X.DUST_STORM_PERIOD_D[1]), 1 - math.exp(-st / X.DUST_STORM_PERIOD_D[0])
        add(id="edl", cat="Arrival", title=f"Mars EDL: aero entry {S['dv_capture']:.2f} km/s propulsive landing", value=S["dv_capture"], unit="km/s landing Δv",
            prob=None, level="HIGH", basis="qualitative", jd0=ph[0]["jd1"], jd1=ph[0]["jd1"],
            note=f"Landing Δv {X.MARS_LANDING['lo']}-{X.MARS_LANDING['hi']} km/s (sourced range). Heaviest Mars landing to date ~1 t (Perseverance); Starship-class EDL never demonstrated.",
            source=X.MARS_LANDING["src"])
        add(id="dust", cat="Surface", title=f"Global dust storm during {st:.0f}-d surface stay", value=p_hi, unit="P(>=1 global storm)", prob=p_hi,
            prob_label="P(global storm)", level="HIGH" if p_hi > 0.3 else "MED", basis="quantitative (Poisson, climatology)", jd0=a, jd1=z,
            note=f"P = {p_lo:.2f}-{p_hi:.2f} (one per 3-4 Mars years). Opportunity measured tau {X.DUST_TAU_MAX} (2018): solar ISRU output can drop >90% for weeks; nuclear unaffected.",
            source="NASA JPL 2018 'NASA Encounters the Perfect Storm for Science'; Opportunity tau 10.8 (JPL 2018)")
        add(id="surfops", cat="Surface", title="Surface operations (dust, perchlorate, EVA, 0.38 g)", value=None, unit="", prob=None, level="MED", basis="qualitative", jd0=a, jd1=z,
            note="Perchlorate in regolith (Phoenix 2008) is a toxicity/ECLSS contamination risk; EVA count and suit dust ingress not modelled; partial-gravity readaptation after "
                 f"{S['out_days']:.0f}-d cruise.", source="Hecht et al. 2009 Science 325:64 (Phoenix WCL perchlorate)")
        add(id="ascent", cat="Departure", title=f"Mars ascent + TEI single stage {S['dv_ret_dep']:.2f} km/s ({S['prop_dest_t']:.0f} t ISRU propellant)",
            value=S["dv_ret_dep"], unit="km/s", prob=None, level="HIGH" if S["prop_dest_t"] > CAP else "MED", basis="quantitative (rocket eq.)", jd0=z, jd1=z,
            note=f"Ascent {X.MARS_ASCENT_LMO['lo']}-{X.MARS_ASCENT_LMO['hi']} km/s to LMO + Oberth TEI; return payload {X.RETURN_PAYLOAD_T:.0f} t (ASSUMPTION); Isp {X.ISP:.0f} s; "
                 f"tank capacity {CAP:.0f} t. No pad/infrastructure on Mars modelled.", source=X.MARS_ASCENT_LMO["src"])
        add(id="isru", cat="Surface", title=f"ISRU plant must deliver {S['prop_dest_t']:.0f} t methalox", value=m["isru"]["plan"]["power_kw"], unit="kW continuous",
            prob=None, level="HIGH", basis="qualitative (TRL)", jd0=a, jd1=z,
            note=f"Largest Mars ISRU to date: MOXIE, 122 g O2 total (2021-23). Required scale-up ~{S['prop_dest_t']*1e6/122:.0e}x. Return is impossible if the plant fails unless "
                 "propellant is shipped from Earth.", source="NASA JPL 2023 MOXIE final results; " + X.ISRU_KWH_PER_KG["src"][:60])
    elif S["prop_dest_t"] > 0:
        add(id="destprop", cat="Departure", title=f"Return needs {S['prop_dest_t']:.0f} t propellant at {tgt.title()}", value=S["prop_dest_t"], unit="t",
            prob=None, level="HIGH", basis="quantitative (rocket eq.)", jd0=ph[1]["jd1"], jd1=ph[1]["jd1"],
            note=("exceeds tank capacity: return impossible with one Starship. " if S["prop_dest_t"] > CAP else "") +
                 "Single-tank-load from LEO is insufficient; requires a prepositioned propellant depot at the destination (not modelled).", source="rocket equation, vehicle model")
    ve = min(S["v_entry_earth"], X.EARTH_MAX_ENTRY); runs = [(g, H._fly("earth", ve * 1e3, -g, 0.3)) for g in np.arange(3.0, 12.0, 0.25)]
    nes = [(g, r) for g, r in runs if r["result"] != "escape"]; dsc = [(g, r) for g, r in runs if r["result"] == "impact"]
    q = nes[0] if nes else None; qd = dsc[0] if dsc else None
    add(id="entry", cat="Return", title=f"Earth entry at {ve:.2f} km/s" + (f" (after {S['dv_brake']:.2f} km/s braking from {S['v_entry_earth']:.2f})" if S["dv_brake"] else ""),
        value=q[1]["gmax"] if q else None, unit="peak g, shallowest non-skip-out pass (lift up)", prob=None,
        level="HIGH" if S["v_entry_earth"] > 12.0 or (q and q[1]["gmax"] > 5) else "MED", basis="quantitative (ESTIMATE)", jd0=ph[2]["jd1"], jd1=ph[2]["jd1"],
        note=(f"Shallowest corridor edge {-q[0]:.2f} deg: {q[1]['gmax']:.1f} g, ~{q[1]['qmax']/1e4:.0f} W/cm^2 (first pass skips to a bound orbit; re-entry not modelled). " if q else "") +
             (f"Single-pass descent needs {-qd[0]:.2f} deg: {qd[1]['gmax']:.0f} g, ~{qd[1]['qmax']/1e4:.0f} W/cm^2 with constant lift-up (no bank-angle guidance modelled; real vehicles modulate lift). " if qd else "") +
             f"Limit {X.EARTH_MAX_ENTRY} km/s (ESTIMATE). Fastest Earth entries flown: Stardust 12.9 km/s; Apollo ~11.0 km/s. Starship vehicle model as for aerocapture.",
        source="Sutton & Graves 1971; NASA Stardust/Apollo entry data")
    m["radiation"] = lite(rad); m["radiation"]["stays"] = stays
    m["radiation"]["regolith"] = {str(k): v for k, v in X.REGOLITH.items()}; m["radiation"]["regolith_used"] = regolith
    m["risk"] = hz; t = rad["totals"]
    S.update(dose_mean=t["total_mean"], dose_p95=t["total_p95"], dose_mean_sh=t["total_mean_sh"], dose_p95_sh=t["total_p95_sh"], dose_surface=t["surface"],
             risk_high=sum(1 for h in hz if h["level"] == "HIGH"))
    return m

def lite(rad, n=360):
    jd = np.array(rad["jd"]); idx = np.unique(np.linspace(0, len(jd) - 1, min(n, len(jd))).astype(int))
    out = {k: [round(float(v[i]), 4) for i in idx] for k, v in rad.items() if isinstance(v, list) and k != "belts" and len(v) == len(jd)}
    out["jd"] = [float(jd[i]) for i in idx]; out["belts"] = rad["belts"]; out["totals"] = rad["totals"]; out["limits"] = R.MSV_LIMITS; return out

RET_TOF = {"mars": np.arange(120, 341, 5.0), "venus": np.arange(80, 301, 5.0), "jupiter": np.arange(600, 1900, 25.0)}
results = {}
for tgt in A.planets.split(","):
    path = f"viewer/missions/{tgt}.json"; d = json.load(open(path))
    base = [m for m in d["missions"] if m.get("mode", "one-way") == "one-way"]
    for m in base: m["mode"] = "one-way"; m["summary"].setdefault("total_days", m["summary"]["tof_years"] * 365.25); m["summary"].setdefault("stay_days", 0)
    new = []
    jobs = []
    if tgt == "mars":
        modes = A.modes.split(",")
        if "conjunction" in modes: jobs.append(("conjunction", (400, 620), False, False, "orbit", {}))
        if "opposition" in modes: jobs.append(("opposition", (30, 60), True, False, "orbit", {}))
        if "isru" in modes:
            stays = [(A.stay - 40, A.stay + 40)] if A.stay else [(30, 60), (400, 620), (1150, 1400)]
            for s in stays: jobs.append(("isru", s, s[1] <= 90, True, "surface", {"variant": f"stay class {s[0]:.0f}-{s[1]:.0f} d"}))
    else:
        jobs.append(("round-trip", (30, 600) if tgt == "venus" else (30, 420), False, False, "orbit", {}))
    for mode, (s0, s1), venus, land, kind, extra in jobs:
        cands = outbound_cands(tgt, need_aero=land, keep=14 if venus else 40, margin=2.0 if venus else 1.0)
        best = None
        for o in cands:
            Aj = o[1] + o[2]
            r = X.search_return(tgt, Aj + s0, Aj + s1, RET_TOF[tgt], from_surface=land, venus=venus)
            if r is None: continue
            out_extra = (X.MARS_LANDING["central"] - (AEROCAPTURE_TRIM_KMS if o[4] else 0)) if land else 0.0
            tot = o[0] + out_extra + r["dv"]
            if best is None or tot < best[0]: best = (tot, o, r)
        if best is None: print(tgt, mode, "no solution"); continue
        m = build(tgt, mode, best[1], best[2], kind, extra); m = analyze(m, tgt, A.regolith)
        new.append(m); S = m["summary"]
        print(f"{tgt:8s} {mode:12s} {S['launch']} stay {S['stay_days']:.0f} d total {S['total_days']:.0f} d dv {S['dv_total']:.2f} "
              f"(ret {S['dv_return']:.2f}{' via V' if S['via'] else ''}) entry {S['v_entry_earth']:.2f} prop LEO {S['prop_leo_t']:.0f} dest {S['prop_dest_t']:.0f} "
              f"tank {S['tankers_needed']} dose {S['dose_mean']:.0f}/{S['dose_mean_sh']:.0f} p95 {S['dose_p95']:.0f} surf {S['dose_surface']:.0f}"
              + (f" ISRU {m['isru']['plan']['rate_kgd']:.0f} kg/d {m['isru']['plan']['power_kw']:.0f} kW" if land else ""), flush=True)
    allm = base + new
    for i, m in enumerate(allm): m["rank"] = i + 1
    d["missions"] = allm
    # extend planet tracks to cover the full span
    t0 = min(m["traj"][0][0] for m in allm) - 30; t1 = max(m["traj"][-1][0] for m in allm) + 30
    for b, pl in d["planets"].items():
        ts = np.linspace(t0, t1, 1600); pl["track"] = [[float(t), *[round(float(x), 6) for x in state(b, t)[0] / AU]] for t in ts]
    d["architecture"] = dict(regolith_m=A.regolith, isru_power_kw=A.isru_power_kw, crew=A.crew, return_payload_t=X.RETURN_PAYLOAD_T,
                             sources=dict(ascent=X.MARS_ASCENT_LMO["src"], landing=X.MARS_LANDING["src"], surface_dose=X.MARS_SURFACE_DOSE["src"],
                                          regolith=X.REGOLITH_SRC, isru=X.ISRU_KWH_PER_KG["src"], plant=X.ISRU_PLANT_KG_PER_KGD["src"], power=X.POWER_KG_PER_KWE["src"]))
    txt = json.dumps(d, separators=(",", ":"), default=lambda o: o.item() if hasattr(o, "item") else str(o)); open(path, "w").write(txt)
    results[tgt] = [dict(name=m["name"], **{k: v for k, v in m["summary"].items() if not isinstance(v, (list, dict))},
                         isru=m.get("isru", {}).get("plan")) for m in new]
json.dump(results, open("output/architecture_summary.json", "w"), indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
