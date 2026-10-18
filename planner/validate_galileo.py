"""Validation: reproduce Galileo VEEGA (launch 1989-10-18, C3 ~13 km^2/s^2,
V 1990-02-10, E 1990-12-08, E 1992-12-08, J 1995-12-07) with the MGA-1DSM optimizer."""
import sys
from concurrent.futures import ProcessPoolExecutor
from starship.mga1dsm import optimize_pg as optimize
from starship.ephem import jd_from_date
SEQ = ("earth", "venus", "earth", "earth", "jupiter")
OPTS = dict(max_tof_days=6.5 * 365.25, arrival_mode="flyby", tof_weight=0.0, vinf_max=6.0)
def run(seed):
    return optimize(SEQ, jd_from_date("1989-08-01"), jd_from_date("1989-12-31"), OPTS, seed=seed,
                    gens=int(sys.argv[1]) if len(sys.argv) > 1 else 1500)
if __name__ == "__main__":
    with ProcessPoolExecutor(8) as ex:
        res = [r for r in ex.map(run, range(int(sys.argv[2]) if len(sys.argv) > 2 else 16)) if r]
    res.sort(key=lambda r: r["dv_dsm"] + r["dv_dep"])
    for r in res[:4]:
        print(f"launch {r['launch']:%Y-%m-%d} C3 {r['c3']:.1f}  DSM {r['dv_dsm']:.3f} km/s  "
              f"vinf_arr {r['vinf_arr']:.2f}  " + "  ".join(f"{f['body'][0].upper()} {f['date']:%Y-%m-%d} alt {f['alt_km']:.0f}" for f in r["flybys"])
              + f"  J {r['arrive']:%Y-%m-%d}")
    # export for the viewer
    from starship import export, mga
    rows = []
    for r in res[:4]:
        rows.append(dict(launch=str(r["launch"].date()), arrive=str(r["arrive"].date()), tof_years=r["tof_days"] / 365.25,
                         c3=r["c3"], dv_departure=r["dv_dep"], dv_dsm=r["dv_dsm"], dv_flybys=0.0, dv_capture=0.0,
                         capture="flyby", dv_total=r["dv_total"], tankers_needed=None, feasible=False,
                         hazards=mga.hazards(r)))
    export.write("viewer/missions/galileo_veega_1989.json", "jupiter", res[:4], rows,
                 "validation case (no Starship sizing)")
    print("exported viewer/missions/galileo_veega_1989.json")
