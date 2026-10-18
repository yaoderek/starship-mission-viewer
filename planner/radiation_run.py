"""Radiation + hazard pass over all mission JSONs; Pareto (delta-v vs dose); low-dose alternatives; plots.
Usage: python radiation_run.py [--shelter 20] [--mc 800] [--planets mars,jupiter,...]"""
import argparse, copy, glob, json, math, os, shutil, sys
import numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from starship import radiation as R, hazards as H
from starship.constants import AU, DAY, MU_SUN, PLANETS
from starship.ephem import state, date_from_jd
from starship.lambert import lambert, propagate
from starship.maneuvers import propulsive_capture_dv, arrival, departure_dv
from starship.vehicle import Starship

ap = argparse.ArgumentParser(); ap.add_argument("--shelter", type=float, default=20.0); ap.add_argument("--mc", type=int, default=800)
ap.add_argument("--planets", default="mercury,venus,mars,jupiter,saturn,uranus,neptune"); A = ap.parse_args()
VD, BASE = "viewer/missions", "viewer/missions_base"
if not os.path.isdir(BASE):
    os.makedirs(BASE); [shutil.copy(f, BASE) for f in glob.glob(VD + "/*.json")]
SHIP = Starship(prop_capacity_t=1600.0)
S, G, P = R.solar(), R.GCR(), R.SPE(); K = R.spe_rate_k()
X_H = R.HULL_GCM2 * R.STEEL_AL_EQ; X_S = X_H + A.shelter
MEANF = float(P.flu.mean()) / R.PHI30_1972

def expected(jd, r, belt_h, belt_s):
    dt = np.diff(jd, prepend=jd[0]); yr = R.yr_from_jd(jd)
    g = float(np.sum(G.rate(S.phi(yr), r) * dt))
    w = np.sum(K * S.ssn(yr) / 365.25 * dt * MEANF * r ** -np.where(r > 1, 2.5, 2.0))
    sh = R.SPE_PRE_SHELTER_FRACTION * R.d72(X_H) + (1 - R.SPE_PRE_SHELTER_FRACTION) * R.d72(X_S)
    return g + w * R.d72(X_H) + belt_h, g + w * sh + belt_s

def lite(rad, n=300):
    jd = np.array(rad["jd"]); idx = np.unique(np.linspace(0, len(jd) - 1, min(n, len(jd))).astype(int))
    out = {k: [round(float(v[i]), 4) for i in idx] for k, v in rad.items() if isinstance(v, list) and k not in ("belts",) and len(v) == len(jd)}
    out["jd"] = [float(jd[i]) for i in idx]; out["belts"] = rad["belts"]; out["totals"] = rad["totals"]
    out["limits"] = R.MSV_LIMITS; return out

def direct_mission(tgt, L, T):
    r1, v1e = state("earth", L); r2, v2p = state(tgt, L + T)
    sol = lambert(r1, r2, T * DAY, MU_SUN)
    if sol is None: return None
    v1, v2 = sol; vi = np.linalg.norm(v1 - v1e); va = np.linalg.norm(v2 - v2p)
    pts = [[L + s / DAY, *(propagate(r1, v1, s, MU_SUN)[0] / AU)] for s in np.linspace(0, T * DAY, 300)]
    arr = arrival(tgt, va); dd = departure_dv(vi)
    tot = dd + arr["dv"]; need = SHIP.refuels_needed(tot)
    ev = [dict(type="launch", body="earth", jd=L, date=str(date_from_jd(L).date()), pos=pts[0][1:], dv=dd,
               label=f"Launch TLI {dd:.2f} km/s (C3 {vi*vi:.1f})", hazard=False),
          dict(type="arrival", body=tgt, jd=L + T, date=str(date_from_jd(L + T).date()), pos=pts[-1][1:], dv=arr["dv"],
               label=f"{tgt.title()} {arr['mode']} capture {arr['dv']:.2f} km/s (v∞ {va:.2f})", hazard=arr["mode"] == "aero")]
    summ = dict(launch=ev[0]["date"], arrive=ev[1]["date"], tof_years=T / 365.25, c3=vi * vi, dv_dep=dd, dv_dsm=0.0,
                dv_capture=arr["dv"], capture=arr["mode"], dv_total=tot, tankers_needed=need,
                feasible=need is not None and need <= SHIP.refuels)
    return dict(rank=0, name="E-" + {"mercury": "Me"}.get(tgt, tgt[0].upper()), model="lambert-direct", summary=summ, traj=pts, events=ev,
                hazards=(["aerocapture entry"] if arr["mode"] == "aero" else []))

def jup_variant(m, rp_rj):
    m2 = copy.deepcopy(m); a = [e for e in m2["events"] if e["type"] == "arrival"][0]
    import re; vinf = float(re.search(r"v∞ ([\d.]+)", a["label"]).group(1)); Rj = PLANETS["jupiter"][2]
    dv = propulsive_capture_dv("jupiter", vinf, peri_alt_km=(rp_rj - 1) * Rj, ecc=0.9)
    s = m2["summary"]; s["dv_total"] += dv - s["dv_capture"]; s["dv_capture"] = dv
    s["tankers_needed"] = SHIP.refuels_needed(s["dv_total"]); s["feasible"] = s["tankers_needed"] is not None and s["tankers_needed"] <= SHIP.refuels
    a["dv"] = dv; a["label"] = f"Jupiter prop capture {dv:.2f} km/s (v∞ {vinf:.2f}), periapsis {rp_rj:.0f} Rj"
    m2["name"] += f" rp{rp_rj:.0f}Rj"; m2["variant"] = f"capture periapsis {rp_rj:.0f} Rj (radiation-aware)"
    m2["hazards"] = [h for h in m2["hazards"] if "HIGH RADIATION" not in h] + ([f"Jupiter capture periapsis {rp_rj:.0f} Rj"] if rp_rj < 15 else [])
    return m2, rp_rj

def analyze(m, jup_rp=None):
    rad = R.mission_dose(m["traj"], m["events"], shelter_gcm2=A.shelter, n_mc=A.mc, jup_rp_rj=jup_rp)
    hz = H.mission_hazards(m, rad)
    m["radiation"] = lite(rad); m["risk"] = hz
    t = rad["totals"]; m["summary"].update(dose_mean=t["total_mean"], dose_p95=t["total_p95"], dose_mean_sh=t["total_mean_sh"],
                                          dose_p95_sh=t["total_p95_sh"], risk_high=sum(1 for h in hz if h["level"] == "HIGH"))
    return m

summary = {}
for tgt in A.planets.split(","):
    d = json.load(open(f"{BASE}/{tgt}.json")); ms = d["missions"]
    pts = []
    for m in ms:
        rad0 = R.belt_events(m["events"]); bh = sum(b["hull"] for b in rad0); bs = sum(b["hull"] * (R.ARTEMIS_SHELTER_BELT if b["body"] == "earth" else 0.06) for b in rad0)
        tr = np.array(m["traj"]); jd = np.linspace(tr[0, 0], tr[-1, 0], 300); r = np.linalg.norm(np.array([np.interp(jd, tr[:, 0], tr[:, k]) for k in (1, 2, 3)]).T, axis=1)
        e_h, e_s = expected(jd, r, bh, bs)
        pts.append(dict(dv=m["summary"]["dv_total"], dose=e_h, dose_sh=e_s, label=f"#{m['rank']} {m['name']} {m['model']}", kind="mga", feasible=m["summary"]["feasible"], tof=m["summary"]["tof_years"], ref=("m", m["rank"] - 1)))
    variants = []
    if tgt == "jupiter":
        for i, m in enumerate(ms[:4]):
            for rp in (6, 10, 15, 20, 30):
                m2, _ = jup_variant(m, rp); variants.append((m2, rp))
                rad0 = R.mission_dose(m2["traj"], m2["events"], n_mc=60, shelter_gcm2=A.shelter, jup_rp_rj=rp)["totals"]
                pts.append(dict(dv=m2["summary"]["dv_total"], dose=rad0["total_mean"], dose_sh=rad0["total_mean_sh"], label=m2["name"], kind="rp-variant",
                                feasible=m2["summary"]["feasible"], tof=m2["summary"]["tof_years"], ref=("v", len(variants) - 1)))
    z = np.load(f"output/{tgt}/porkchop_grid.npz"); Lg, Tg, DV = z["launch_jd"], z["tof_days"], z["dv"]
    ok = np.isfinite(DV) & (DV < np.nanmin(DV) + 3.0)
    cand = [(j, i) for j in range(0, len(Tg), 3) for i in range(0, len(Lg), 3) if ok[j, i]]
    for j, i in cand:
        L, T = float(Lg[i]), float(Tg[j]); r1 = state("earth", L)[0]
        jd = np.linspace(L, L + T, 60)
        r2 = state(tgt, L + T)[0]; sol = lambert(r1, r2, T * DAY, MU_SUN)
        if sol is None: continue
        r = np.array([np.linalg.norm(propagate(r1, sol[0], (t - L) * DAY, MU_SUN)[0]) / AU for t in jd])
        bh = R.EARTH_BELT["central"]; bs = bh * R.ARTEMIS_SHELTER_BELT
        if tgt == "jupiter":   # capture pass at the planner's default 3 Rj periapsis
            mu, Rj = PLANETS["jupiter"][1], PLANETS["jupiter"][2]; va = float(z["vinf_arr"][j, i])
            bh += R.hyperbola_pass_dose(PLANETS["jupiter"][4] + Rj, va, mu, Rj, lambda q: R.jupiter_rate(q, X_H))
            bs += R.hyperbola_pass_dose(PLANETS["jupiter"][4] + Rj, va, mu, Rj, lambda q: R.jupiter_rate(q, X_S))
        e_h, e_s = expected(jd, r, bh, bs)
        need = SHIP.refuels_needed(float(DV[j, i]))
        pts.append(dict(dv=float(DV[j, i]), dose=e_h, dose_sh=e_s, label=f"direct L{date_from_jd(L).date()} TOF {T:.0f} d", kind="direct",
                        feasible=need is not None and need <= SHIP.refuels, tof=T / 365.25, ref=("p", (L, T))))
    # Pareto (minimise dv and sheltered expected dose)
    order = sorted(range(len(pts)), key=lambda k: (pts[k]["dv"], pts[k]["dose_sh"])); front, best = [], 1e99
    for k in order:
        if pts[k]["dose_sh"] < best: front.append(k); best = pts[k]["dose_sh"]
    # low-dose alternatives: lowest sheltered dose on the front within +1 and +2 km/s of the lowest-dv point
    dv0 = pts[front[0]]["dv"]; alts = []
    for budget in (1.0, 2.0):
        c = [k for k in front if pts[k]["dv"] <= dv0 + budget]; k = min(c, key=lambda q: pts[q]["dose_sh"])
        if k != front[0] and k not in alts: alts.append(k)
    newms = [analyze(m) for m in ms]
    for k in alts:
        kind, ref = pts[k]["ref"]
        if kind == "m": newms[ref].setdefault("tags", []).append("low-dose"); continue
        if kind == "v": m2, rp = variants[ref]; m2 = analyze(m2, jup_rp=rp)
        else: m2 = direct_mission(tgt, *ref); m2 and analyze(m2)
        if m2: m2["tags"] = ["low-dose alternative"]; m2["rank"] = len(newms) + 1; newms.append(m2)
    d["missions"] = newms
    d["pareto"] = dict(points=[{k: v for k, v in p.items() if k != "ref"} for p in pts], front=front, alts=alts,
                       note="Expected (mean) one-way crew dose, sheltered 20 g/cm^2 during SPEs; delta-v from LEO incl. capture. Direct points are a 1/3 subsample of the porkchop grid within +3 km/s of its minimum.")
    d["rad_model"] = dict(shelter_gcm2=A.shelter, hull_gcm2=R.HULL_GCM2, limits=R.MSV_LIMITS, phi0=G.phi0, spe_k=K,
                          note="ESTIMATES; see VERIFICATION.md radiation section")
    json.dump(d, open(f"{VD}/{tgt}.json", "w"), separators=(",", ":"))
    # plots
    os.makedirs(f"output/{tgt}", exist_ok=True)
    fig, ax = plt.subplots(figsize=(9, 5))
    for m in newms:
        rr = m["radiation"]; t = (np.array(rr["jd"]) - rr["jd"][0])
        l, = ax.plot(t, rr["tot_mean"], lw=1.2, label=f"#{m['rank']} {m['name']} ({m['model']})")
        ax.fill_between(t, rr["tot_mean_sh"], rr["tot_p95"], color=l.get_color(), alpha=.08)
    for k, v in (("career 600 mSv", 600),): ax.axhline(v, color="r", lw=.8, ls="--"); ax.text(1, v * 1.02, k, color="r", fontsize=8)
    ax.set_xlabel("mission elapsed time (days)"); ax.set_ylabel("cumulative effective dose (mSv)"); ax.set_yscale("log"); ax.set_ylim(1, None)
    ax.set_title(f"Earth→{tgt.title()}: cumulative crew dose (mean, unsheltered; band = sheltered mean … p95 unsheltered) — ESTIMATE", fontsize=9)
    ax.legend(fontsize=6, ncol=2); ax.grid(alpha=.2); fig.tight_layout(); fig.savefig(f"output/{tgt}/dose_cumulative.png", dpi=130); plt.close(fig)
    fig, ax = plt.subplots(figsize=(7, 5))
    for kind, c in (("direct", "#7f8c8d"), ("mga", "#2c7fb8"), ("rp-variant", "#d95f0e")):
        q = [p for p in pts if p["kind"] == kind]
        if q: ax.scatter([p["dv"] for p in q], [p["dose_sh"] for p in q], s=8, c=c, label=kind, alpha=.6)
    ax.plot([pts[k]["dv"] for k in front], [pts[k]["dose_sh"] for k in front], "k-", lw=1, label="Pareto front")
    for k in alts: ax.annotate(pts[k]["label"], (pts[k]["dv"], pts[k]["dose_sh"]), fontsize=6)
    ax.axhline(600, color="r", ls="--", lw=.8); ax.set_yscale("log")
    ax.set_xlabel("total Δv from LEO (km/s)"); ax.set_ylabel("expected one-way dose, sheltered (mSv)"); ax.set_title(f"{tgt.title()}: Δv vs crew dose (ESTIMATE)", fontsize=9)
    ax.legend(fontsize=7); ax.grid(alpha=.2); fig.tight_layout(); fig.savefig(f"output/{tgt}/pareto_dv_dose.png", dpi=130); plt.close(fig)
    summary[tgt] = [dict(rank=m["rank"], name=m["name"], model=m["model"], dv=m["summary"]["dv_total"], tof=m["summary"]["tof_years"],
                         launch=m["summary"]["launch"], tags=m.get("tags", []), **{k: m["radiation"]["totals"][k] for k in
                         ("gcr", "gcr_p05", "gcr_p95", "belts", "belts_sh", "spe_mean", "spe_p95", "spe_mean_sh", "spe_p95_sh", "total_mean", "total_p95", "total_mean_sh", "total_p95_sh", "win30_p95", "win30_p95_sh")},
                         risks={h["id"]: h["level"] for h in m["risk"]}) for m in newms]
    print(tgt, len(pts), "pareto", len(front), "alts", [pts[k]["label"] for k in alts], flush=True)
json.dump(summary, open("output/radiation_summary.json" if A.planets.count(",") >= 6 else f"output/radiation_summary_{A.planets.replace(',','_')}.json", "w"), indent=1)
