"""Fetch NASA Ames Trajectory Browser optima (direct, rendezvous) and recompute them with our code
at the SAME launch/arrival epochs. Trajectory Browser conventions (user guide):
  injection dV from 200 km circular LEO; rendezvous dV for planets = burn at periapsis to reduce to C3=0."""
import re, sys, json, subprocess, math
import numpy as np
sys.path.insert(0, ".")
from starship.ephem import state, date_from_jd
from starship.lambert import lambert
from starship.constants import PLANETS, MU_SUN, DAY
from starship.maneuvers import departure_dv
CASES = [("Mars", 2033, 2034, 1.5), ("Mars", 2035, 2036, 1.5), ("Venus", 2031, 2032, 1), ("Mercury", 2031, 2033, 2),
         ("Jupiter", 2028, 2029, 6), ("Saturn", 2029, 2030, 10), ("Uranus", 2030, 2031, 15), ("Neptune", 2030, 2031, 20)]
def fetch(target, y1, y2, dt):
    data = (f"maxMag=25&maxOCC=4&chk_target_list=on&target_list={target}&mission_class=oneway&mission_type=rendezvous"
            f"&LD1={y1}&LD2={y2}&maxDT={dt}&DTunit=yrs&maxDV=20&min=DV&wdw_width=0&submit=Search")
    s = subprocess.run(["curl", "-s", "-m", "200", "-X", "POST", "https://trajbrowser.arc.nasa.gov/traj_browser.php", "-d", data],
                       capture_output=True, text=True).stdout
    m = re.search(r"var segs = (\{.*?\});", s, flags=re.S)
    if not m: return None
    return json.loads(m.group(1))
out = []
for tgt, y1, y2, dt in CASES:
    import time
    for _try in range(5):
        sg = fetch(tgt, y1, y2, dt)
        if sg and sg['T']: break
        time.sleep(4)
    if not sg or not sg["T"]:
        print(tgt, y1, "no result"); out.append(dict(target=tgt, year=y1, ok=False)); continue
    tid = sg["Traj_ID"][0]; idx = [i for i, t in enumerate(sg["Traj_ID"]) if t == tid]
    T = [sg["T"][i] for i in idx]; DV = [sg["DV"][i] / 1e3 for i in idx]
    rl = math.sqrt(sg["RX"][idx[-1]]**2 + sg["RY"][idx[-1]]**2 + sg["RZ"][idx[-1]]**2) / 1e3
    jd0 = 2451545.0 + T[0] / 86400; jd1 = 2451545.0 + T[-1] / 86400
    body = tgt.lower(); mu = PLANETS[body][1]
    r1, v1p = state("earth", jd0); r2, v2p = state(body, jd1)
    v1, v2 = lambert(r1, r2, (jd1 - jd0) * DAY, MU_SUN)
    vinf_d = np.linalg.norm(v1 - v1p); vinf_a = np.linalg.norm(v2 - v2p)
    dep = departure_dv(vinf_d, r_park=6378.14 + 200)
    arr = math.sqrt(vinf_a**2 + 2 * mu / rl) - math.sqrt(2 * mu / rl)
    # reference C3 from their injection dV (two-body, 200 km LEO)
    rp = 6378.14 + 200; mue = 398600.4418
    c3_ref = (DV[0] + math.sqrt(mue / rp))**2 - 2 * mue / rp
    row = dict(target=tgt, year=y1, ok=True, launch=str(date_from_jd(jd0).date()), arrive=str(date_from_jd(jd1).date()),
               tof_d=jd1 - jd0, ref_dv_inj=DV[0], our_dv_inj=dep, ref_c3=c3_ref, our_c3=vinf_d**2,
               ref_dv_arr=DV[-1], our_dv_arr=arr, ref_dv_mid=sum(DV[1:-1]), rp_arr_km=rl, our_vinf_arr=vinf_a)
    # TB's own heliocentric state at the first post-launch node (sphere-of-influence exit): v - v_earth
    i1 = idx[1]; Vh = np.array([sg["VX"][i1], sg["VY"][i1], sg["VZ"][i1]]) / 1e3
    row["tb_soi_vinf_c3"] = float(np.linalg.norm(Vh - state("earth", 2451545.0 + sg["T"][i1] / 86400)[1])**2)
    row["direct"] = row["ref_dv_mid"] < 1e-3 and len(idx) == 4
    out.append(row)
    row_print = None
    print(f"{tgt:8s} {row['launch']} -> {row['arrive']}  C3 ref {c3_ref:7.2f} ours {vinf_d**2:7.2f} | inj ref {DV[0]:.3f} ours {dep:.3f}"
          f" | arr ref {DV[-1]:.3f} ours {arr:.3f} | mid(ref) {sum(DV[1:-1]):.3f} | TB C3 at SOI {row.get('tb_soi_vinf_c3',0):.2f}", flush=True)
json.dump(out, open("verification/trajbrowser.json", "w"), indent=1)
