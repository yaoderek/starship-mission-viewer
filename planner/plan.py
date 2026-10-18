#!/usr/bin/env python3
"""Starship mission / flyby planner CLI. See README.md."""
import os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"): os.environ.setdefault(_v, "1")
import argparse, sys, json, time
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from starship.constants import ABBR, PLANETS
from starship.ephem import jd_from_date
from starship.vehicle import Starship
from starship import mga, mga1dsm, porkchop, trajplot, export

def parse_body(s):
    s = s.lower(); return ABBR.get(s, s)

def parse_seq(s):
    return tuple(parse_body(x) for x in s.replace(",", "-").split("-"))

def _run(args):
    seq, t0lo, t0hi, opts, seed, it, model = args
    try:
        if model == "1dsm":
            return mga1dsm.optimize_pg(seq, t0lo, t0hi, opts, seed=seed, gens=it)
        return mga.optimize(seq, t0lo, t0hi, opts, seed=seed, maxiter=it)
    except Exception as e:
        import traceback; print(f"[warn] {model} {seq} seed {seed} failed: {e!r}", file=sys.stderr)
        return None

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--to", required=True, help="target planet (mercury..neptune)")
    p.add_argument("--launch-window", default="2028-2035", help="YYYY-YYYY or YYYY-MM-DD:YYYY-MM-DD")
    p.add_argument("--max-tof-years", type=float, default=8.0)
    p.add_argument("--sequences", default=None, help="comma-free list e.g. 'E-V-E-J;E-J' (else auto)")
    p.add_argument("--max-flybys", type=int, default=3)
    p.add_argument("--top", type=int, default=10)
    p.add_argument("--out", default="output")
    p.add_argument("--tof-weight", type=float, default=0.2, help="ranking penalty km/s per year of TOF")
    p.add_argument("--leo-alt", type=float, default=300.0)
    p.add_argument("--arrival", choices=["auto", "aero", "prop", "flyby"], default="auto")
    p.add_argument("--max-entry-kms", type=float, default=None, help="max aerocapture entry speed (ESTIMATE)")
    p.add_argument("--capture-peri-alt-km", type=float, default=None)
    p.add_argument("--capture-ecc", type=float, default=None)
    # vehicle (ESTIMATES)
    p.add_argument("--dry-mass", type=float, default=120.0)
    p.add_argument("--prop-capacity", type=float, default=1600.0)
    p.add_argument("--isp", type=float, default=375.0)
    p.add_argument("--payload", type=float, default=100.0)
    p.add_argument("--refuels", type=int, default=8)
    p.add_argument("--tanker-load", type=float, default=100.0)
    p.add_argument("--fill-fraction", type=float, default=1.0)
    p.add_argument("--residual-prop", type=float, default=50.0)
    p.add_argument("--porkchop-n", type=int, default=150)
    p.add_argument("--iters", type=int, default=300, help="differential evolution generations")
    p.add_argument("--seeds", type=int, default=2)
    p.add_argument("--model", choices=["1dsm", "mga", "both"], default="1dsm",
                   help="1dsm: MGA-1DSM (one deep-space burn per leg, unpowered flybys); "
                        "mga: Lambert chain + powered flybys")
    p.add_argument("--mode", default="one-way", help="one-way | conjunction,opposition,isru (Mars) | round-trip (others): "
                   "after the one-way search, runs architecture_run.py (needs radiation_run.py output for the viewer JSON)")
    p.add_argument("--stay", type=float, default=None, help="ISRU target surface stay, days"); p.add_argument("--regolith", type=float, default=0.0)
    p.add_argument("--isru-power-kw", type=float, default=1000.0)
    p.add_argument("--max-revs", type=int, default=2, help="multi-rev Lambert branches for --model mga")
    p.add_argument("--iters-1dsm", type=int, default=1500, help="pygmo sade generations per restart (4 restarts)")
    p.add_argument("--vinf-max", type=float, default=13.0, help="1dsm: upper bound on launch v-inf km/s")
    p.add_argument("--viewer-dir", default="viewer/missions")
    p.add_argument("--jupiter-rad-rj", type=float, default=15.0)
    a = p.parse_args(argv)

    target = parse_body(a.to)
    if target not in PLANETS or target == "earth":
        sys.exit(f"bad target {a.to}")
    if ":" in a.launch_window:
        lo, hi = a.launch_window.split(":")
    else:
        y0, y1 = a.launch_window.split("-"); lo, hi = f"{y0}-01-01", f"{y1}-12-31"
    t0lo, t0hi = jd_from_date(lo), jd_from_date(hi)
    out = os.path.join(a.out, target); os.makedirs(out, exist_ok=True)
    ship = Starship(a.dry_mass, a.prop_capacity, a.isp, a.payload, a.residual_prop,
                    a.tanker_load, a.fill_fraction, a.refuels)
    opts = dict(max_tof_days=a.max_tof_years * 365.25, tof_weight=a.tof_weight, leo_alt=a.leo_alt,
                arrival_mode=a.arrival, max_entry=a.max_entry_kms,
                capture_peri_alt=a.capture_peri_alt_km, capture_ecc=a.capture_ecc,
                max_revs=a.max_revs, vinf_max=a.vinf_max)
    print(f"Vehicle (ESTIMATES): dry {ship.dry_mass_t} t, payload {ship.payload_t} t, prop cap "
          f"{ship.prop_capacity_t} t, Isp {ship.isp_s} s; {ship.refuels} tankers x {ship.tanker_load_t} t "
          f"-> {ship.prop_after_refuel():.0f} t loaded, dv avail {ship.delta_v():.2f} km/s "
          f"(max full {ship.max_delta_v():.2f} km/s)")

    # porkchop for direct transfer
    hd = mga.hohmann_days("earth", target)
    tof_lo, tof_hi = max(40, 0.4 * hd), min(opts["max_tof_days"], 1.8 * hd)
    t1 = time.time()
    L, T, DV, C3, VA = porkchop.grid("earth", target, t0lo, t0hi, tof_lo, tof_hi, a.porkchop_n, opts)
    pc = os.path.join(out, f"porkchop_earth_{target}.png")
    porkchop.plot("earth", target, L, T, DV, pc)
    np.savez(os.path.join(out, "porkchop_grid.npz"), launch_jd=L, tof_days=T, dv=DV, c3=C3, vinf_arr=VA)
    print(f"porkchop -> {pc} ({time.time()-t1:.0f}s)")
    from starship.ephem import date_from_jd
    wins, syn = porkchop.windows("earth", target, L, T, DV)
    print(f"Direct-transfer windows from porkchop grid (synodic period {syn:.0f} d; grid resolution "
          f"{(L[1]-L[0]):.0f} d x {(T[1]-T[0]):.0f} d):")
    for l, t, dv in wins:
        print(f"   launch {date_from_jd(l):%Y-%m-%d}  TOF {t:6.0f} d ({t/30.44:4.1f} mo)  dv(LEO dep + capture) {dv:6.2f} km/s")

    seqs = ([parse_seq(s) for s in a.sequences.split(";")] if a.sequences
            else mga.candidate_sequences(target, a.max_flybys))
    print(f"optimizing {len(seqs)} sequences: " + ", ".join(mga.seq_name(s) for s in seqs))
    models = ["1dsm", "mga"] if a.model == "both" else [a.model]
    jobs = [(s, t0lo, t0hi, opts, k, a.iters_1dsm if m == "1dsm" else a.iters, m)
            for m in models for s in seqs for k in range(a.seeds)]
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(_run, jobs))
    best = {}
    for r in res:
        if not r: continue
        key = r["name"] + "/" + r.get("model", "mga")
        if key not in best or r["score"] < best[key]["score"]: best[key] = r
    ranked = sorted(best.values(), key=lambda r: r["score"])
    rows = []
    hdr = (f"{'#':>2} {'model':<9}{'seq':<12}{'launch':<11} {'arrive':<11} {'TOF y':>5} {'C3':>6} {'dvDep':>6} "
           f"{'dvMid':>5} {'vinfA':>6} {'cap':>4} {'dvCap':>6} {'dvTot':>6} {'tank':>4} {'ok':>3}  hazards/notes")
    print(hdr); print("-" * len(hdr))
    for i, r in enumerate(ranked[:a.top]):
        need = ship.refuels_needed(r["dv_total"])
        feas = need is not None and need <= ship.refuels
        hz = mga.hazards(r, a.jupiter_rad_rj, opts)
        if r["arrival"]["note"]: hz.append(r["arrival"]["note"])
        if r["arrival"]["entry_speed"] and r["arrival"]["mode"] == "aero":
            hz.append(f"aerocapture entry {r['arrival']['entry_speed']:.2f} km/s")
        print(f"{i+1:>2} {r.get('model','mga'):<9}{r['name']:<12}{r['launch']:%Y-%m-%d} {r['arrive']:%Y-%m-%d} "
              f"{r['tof_days']/365.25:5.2f} {r['c3']:6.1f} {r['dv_dep']:6.2f} {r['dv_flyby'] + r.get('dv_dsm', 0):5.2f} "
              f"{r['vinf_arr']:6.2f} {r['arrival']['mode']:>4} {r['arrival']['dv']:6.2f} {r['dv_total']:6.2f} "
              f"{('n/a' if need is None else need):>4} {'Y' if feas else 'N':>3}  {'; '.join(hz)}")
        rows.append(dict(rank=i+1, model=r.get("model", "mga"), dv_dsm=r.get("dv_dsm", 0.0), sequence=r["name"], launch=str(r["launch"].date()), arrive=str(r["arrive"].date()),
                         tof_years=r["tof_days"]/365.25, c3=r["c3"], dv_departure=r["dv_dep"], dv_flybys=r["dv_flyby"],
                         vinf_arrival=r["vinf_arr"], capture=r["arrival"]["mode"], dv_capture=r["arrival"]["dv"],
                         dv_total=r["dv_total"], tankers_needed=need, feasible=feas, hazards=hz,
                         flybys=[dict(body=f["body"], date=str(f["date"].date()), vinf=f["vinf"], alt_km=f["alt_km"],
                                      dv=f["dv"], turn_deg=f["turn_deg"]) for f in r["flybys"]],
                         dsms=[dict(leg=m["leg"], date=str(m["date"].date()), dv=m["dv"]) for m in r.get("dsms", [])]))
    print("dvMid = deep-space manoeuvres (mga-1dsm) or powered-flyby burns (mga-Nrev); tank = min tanker flights needed (n/a = exceeds full tanks); ok = feasible with --refuels")
    json.dump(rows, open(os.path.join(out, "ranked.json"), "w"), indent=1)
    os.makedirs(a.viewer_dir, exist_ok=True)
    nref = int(ship.refuels)
    vdesc = (f"dry {ship.dry_mass_t} t, payload {ship.payload_t} t, prop cap {ship.prop_capacity_t} t, "
             f"Isp {ship.isp_s} s, {nref} refuel mission{'' if nref == 1 else 's'} x {ship.tanker_load_t} t")
    vj = os.path.join(a.viewer_dir, f"{target}.json")
    export.write(vj, target, ranked[:a.top], rows, vdesc); print(f"viewer JSON -> {vj}")
    for i, r in enumerate(ranked[:3]):
        h = os.path.join(out, f"traj_{i+1}_{r['name']}.html"); g = h.replace(".html", ".png")
        trajplot.plot(r, h, g); print(f"trajectory -> {g} , {h}")
    run_arch(a)

def run_arch(a):
    import subprocess, sys
    if a.mode == "one-way": return
    cmd = [sys.executable, "architecture_run.py", "--planets", a.to, "--modes", a.mode.replace("round-trip", "conjunction"),
           "--regolith", str(a.regolith), "--isru-power-kw", str(a.isru_power_kw)] + (["--stay", str(a.stay)] if a.stay else [])
    print("architecture:", " ".join(cmd)); subprocess.run(cmd, check=True)

if __name__ == "__main__":
    main()
