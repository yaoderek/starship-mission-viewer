"""Export viewer-ready JSON (sampled trajectory, planet tracks, events, hazards)."""
import json, os
import numpy as np
from .constants import AU, DAY, MU_SUN, PLANETS, LETTER
from .ephem import state, date_from_jd
from .lambert import propagate
from .trajplot import COL

SIZE = {"mercury": .02, "venus": .035, "earth": .035, "mars": .028, "jupiter": .09,
        "saturn": .08, "uranus": .06, "neptune": .06}

def _orbit(body, t, n=360):
    r, v = state(body, t)
    a = 1 / (2 / np.linalg.norm(r) - np.dot(v, v) / MU_SUN)
    P = 2 * np.pi * np.sqrt(a**3 / MU_SUN)
    return [list(propagate(r, v, s, MU_SUN)[0] / AU) for s in np.linspace(0, P, n)]

def traj_points(d, n=300):
    if d.get("model") == "mga-1dsm":
        from .mga1dsm import sample
        return [(t, *(np.array(p) / AU)) for t, *p in sample(d, n)]
    pts = []
    for i, (v1, _) in enumerate(d["legs"]):
        r0 = d["states"][i][0]
        for s in np.linspace(0, d["tofs"][i] * DAY, n):
            pts.append((d["times"][i] + s / DAY, *(propagate(r0, v1, s, MU_SUN)[0] / AU)))
    return pts

def mission_json(d, rank, row):
    pts = traj_points(d)
    ev = []
    def pos(jd): return list(np.array(min(pts, key=lambda p: abs(p[0] - jd))[1:]))
    ev.append(dict(type="launch", body="earth", jd=d["times"][0], date=str(d["launch"].date()),
                   pos=list(d["states"][0][0] / AU), dv=d["dv_dep"],
                   label=f"Launch TLI {d['dv_dep']:.2f} km/s (C3 {d['c3']:.1f})", hazard=False))
    for f in d["flybys"]:
        hz = any(LETTER[f["body"]] + " " in h or h.startswith(LETTER[f["body"]]) for h in row["hazards"])
        j = f.get("jd") or d["times"][d["flybys"].index(f) + 1]
        ev.append(dict(type="flyby", body=f["body"], jd=j, date=str(f["date"].date()), pos=pos(j), dv=f["dv"],
                       label=f"{f['body'].title()} flyby alt {f['alt_km']:.0f} km v∞ {f['vinf']:.2f}"
                             + (f" dv {f['dv']:.2f}" if f["dv"] > 1e-3 else ""), hazard=hz))
    for m in d.get("dsms", []):
        if m["dv"] > 0.02:
            ev.append(dict(type="dsm", body=None, jd=m["jd"], date=str(m["date"].date()), pos=list(m["r"] / AU),
                           dv=m["dv"], label=f"DSM{m['leg']} {m['dv']*1000:.0f} m/s", hazard=False))
    a = d["arrival"]
    ev.append(dict(type="arrival", body=d["seq"][-1], jd=d["times"][-1], date=str(d["arrive"].date()),
                   pos=list(d["states"][-1][0] / AU), dv=a["dv"],
                   label=f"{d['seq'][-1].title()} {a['mode']} capture {a['dv']:.2f} km/s (v∞ {d['vinf_arr']:.2f})",
                   hazard=any("capture" in h for h in row["hazards"])))
    ev.sort(key=lambda e: e["jd"])
    summ = dict(launch=row["launch"], arrive=row["arrive"], tof_years=row["tof_years"], c3=row["c3"],
                dv_dep=row["dv_departure"], dv_dsm=row.get("dv_dsm", 0.0) + row["dv_flybys"],
                dv_capture=row["dv_capture"], capture=row["capture"], dv_total=row["dv_total"],
                tankers_needed=row["tankers_needed"], feasible=row["feasible"])
    return dict(rank=rank, name=d["name"], model=d.get("model", "mga"), summary=summ,
                traj=[[float(x) for x in p] for p in pts], events=ev, hazards=row["hazards"])

def write(path, target, ranked, rows, vehicle_desc, n_track=1200):
    ms = [mission_json(d, i + 1, r) for i, (d, r) in enumerate(zip(ranked, rows))]
    t0 = min(m["traj"][0][0] for m in ms); t1 = max(m["traj"][-1][0] for m in ms)
    planets = {}
    for b in PLANETS:
        tr = [[float(t), *map(float, state(b, t)[0] / AU)] for t in np.linspace(t0, t1, n_track)]
        planets[b] = dict(color=COL[b], size=SIZE[b], orbit=_orbit(b, t0), track=tr)
    json.dump(dict(target=target, vehicle=vehicle_desc, planets=planets, missions=ms), open(path, "w"))
    idx_path = os.path.join(os.path.dirname(path), "index.json")
    idx = json.load(open(idx_path)) if os.path.exists(idx_path) else []
    if os.path.basename(path) not in idx: idx.append(os.path.basename(path))
    json.dump(sorted(idx), open(idx_path, "w"))
