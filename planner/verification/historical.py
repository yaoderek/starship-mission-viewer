"""Re-optimise historical gravity-assist missions with our MGA-1DSM model, inside each mission's real
launch period, and compare with flown values (see VERIFICATION.md for sources)."""
import os, sys, json
for v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS"): os.environ[v] = "1"
sys.path.insert(0, ".")
from concurrent.futures import ProcessPoolExecutor
from starship.mga1dsm import optimize_pg
from starship.ephem import jd_from_date
CASES = {
 "galileo": dict(seq=("earth", "venus", "earth", "earth", "jupiter"), win=("1989-10-01", "1989-11-30"), tof=6.3),
 "cassini": dict(seq=("earth", "venus", "venus", "earth", "jupiter", "saturn"), win=("1997-10-01", "1997-11-15"), tof=6.9),
 "juno":    dict(seq=("earth", "earth", "jupiter"), win=("2011-08-01", "2011-08-31"), tof=5.1),
}
def run(a):
    name, seed = a; c = CASES[name]
    opts = dict(max_tof_days=c["tof"] * 365.25, arrival_mode="flyby", tof_weight=0.0, vinf_max=7.0)
    try:
        d = optimize_pg(c["seq"], jd_from_date(c["win"][0]), jd_from_date(c["win"][1]), opts, seed=seed, gens=int(sys.argv[1]) if len(sys.argv) > 1 else 2000)
    except Exception as e:
        return name, None
    return name, dict(launch=str(d["launch"].date()), c3=d["c3"], dsm=d["dv_dsm"], vinf_arr=d["vinf_arr"], arrive=str(d["arrive"].date()),
                      cost=d["dv_dep"] + d["dv_dsm"], flybys=[(f["body"], str(f["date"].date()), round(f["alt_km"]), round(f["vinf"], 2)) for f in d["flybys"]],
                      dsms=[(m["leg"], str(m["date"].date()), round(m["dv"] * 1000)) for m in d["dsms"]])
if __name__ == "__main__":
    jobs = [(n, s) for n in CASES for s in range(8)]
    with ProcessPoolExecutor(8) as ex: res = list(ex.map(run, jobs))
    best = {}
    for n, r in res:
        if r and (n not in best or r["cost"] < best[n]["cost"]): best[n] = r
    json.dump(best, open("verification/historical.json", "w"), indent=1)
    for n, r in best.items(): print(n, json.dumps(r))
