"""Multiple-gravity-assist (MGA) trajectory model and optimizer.
Model: chain of zero-revolution Lambert arcs between planets, powered flybys at
intermediate planets (no deep-space maneuvers), launch from LEO, capture at target.
Optimizer: scipy differential evolution over [launch epoch, leg TOFs] + local polish."""
import math, itertools
import numpy as np
from scipy.optimize import differential_evolution
from .constants import PLANETS, MU_SUN, DAY, AU, ORDER, LETTER
from .ephem import state, date_from_jd
from .lambert import lambert
from .lambert_mr import lambert_all
from .maneuvers import departure_dv, flyby, arrival

def seq_name(seq):
    return "-".join(LETTER[b] for b in seq)

def hohmann_days(b1, b2):
    a1 = np.linalg.norm(state(b1, 2451545.0)[0]); a2 = np.linalg.norm(state(b2, 2451545.0)[0])
    a = 0.5 * (a1 + a2)
    return math.pi * math.sqrt(a**3 / MU_SUN) / DAY

def evaluate(seq, t0, tofs, opts, detail=False):
    """Return total dv (km/s) or detail dict. tofs in days."""
    times = [t0]
    for t in tofs: times.append(times[-1] + t)
    states = [state(b, t) for b, t in zip(seq, times)]
    nrev = opts.get("max_revs", 0)
    rpark = PLANETS["earth"][2] + opts.get("leo_alt", 300.0)
    if nrev <= 0:
        legs = []
        for i in range(len(seq) - 1):
            sol = lambert(states[i][0], states[i + 1][0], tofs[i] * DAY, MU_SUN)
            if sol is None:
                return 1e3 if not detail else None
            legs.append(sol)
    else:
        # all N-rev / left-right branches per leg; pick best combination by dynamic programming
        opts_leg = [lambert_all(states[i][0], states[i + 1][0], tofs[i] * DAY, MU_SUN, nrev)
                    for i in range(len(seq) - 1)]
        if any(len(o) == 0 for o in opts_leg):
            return 1e3 if not detail else None
        cost = [departure_dv(np.linalg.norm(o[0] - states[0][1]), r_park=rpark) for o in opts_leg[0]]
        back = []
        for i in range(1, len(seq) - 1):
            nc, bk = [], []
            for o in opts_leg[i]:
                best, arg = math.inf, -1
                for k, p in enumerate(opts_leg[i - 1]):
                    c = cost[k] + flyby(seq[i], p[1] - states[i][1], o[0] - states[i][1])[0]
                    if c < best: best, arg = c, k
                nc.append(best); bk.append(arg)
            cost = nc; back.append(bk)
        fin = [cost[k] + arrival(seq[-1], float(np.linalg.norm(o[1] - states[-1][1])), opts.get("arrival_mode", "auto"),
                                 opts.get("max_entry"), opts.get("capture_peri_alt"), opts.get("capture_ecc"))["dv"]
               for k, o in enumerate(opts_leg[-1])]
        k = int(np.argmin(fin)); idx = [k]
        for bk in reversed(back):
            k = bk[k]; idx.append(k)
        idx.reverse()
        legs = [opts_leg[i][j][:2] for i, j in enumerate(idx)]
        branches = [f"{opts_leg[i][j][2]}{opts_leg[i][j][3] if opts_leg[i][j][2] else ''}" for i, j in enumerate(idx)]
    vinf_dep = np.linalg.norm(legs[0][0] - states[0][1])
    dv_dep = departure_dv(vinf_dep, r_park=rpark)
    fbs = []; dv_fb = 0.0
    for i in range(1, len(seq) - 1):
        vin = legs[i - 1][1] - states[i][1]; vout = legs[i][0] - states[i][1]
        dv, rp, ang, ok = flyby(seq[i], vin, vout)
        dv_fb += dv
        fbs.append(dict(body=seq[i], jd=times[i], date=date_from_jd(times[i]), vinf=float(np.linalg.norm(vin)),
                        dv=dv, rp_km=rp, alt_km=rp - PLANETS[seq[i]][2], turn_deg=ang, ok=ok))
    vinf_arr = float(np.linalg.norm(legs[-1][1] - states[-1][1]))
    arr = arrival(seq[-1], vinf_arr, opts.get("arrival_mode", "auto"), opts.get("max_entry"),
                  opts.get("capture_peri_alt"), opts.get("capture_ecc"))
    total = dv_dep + dv_fb + arr["dv"]
    tof_total = sum(tofs)
    pen = 0.0
    if tof_total > opts.get("max_tof_days", 1e9):
        pen += (tof_total - opts["max_tof_days"]) / 100.0
    score = total + pen + opts.get("tof_weight", 0.0) * tof_total / 365.25
    if not detail:
        return score
    return dict(seq=seq, name=seq_name(seq), t0=t0, tofs=list(tofs), times=times,
                launch=date_from_jd(times[0]), arrive=date_from_jd(times[-1]),
                tof_days=tof_total, vinf_dep=vinf_dep, c3=vinf_dep**2, dv_dep=dv_dep,
                dv_flyby=dv_fb, flybys=fbs, vinf_arr=vinf_arr, arrival=arr,
                dv_total=total, score=score, legs=legs, states=states, model='mga' + (f'-{nrev}rev' if nrev else ''),
                dv_dsm=0.0, dsms=[], branches=branches if nrev > 0 else ['0'] * len(legs))

def leg_bounds(seq, max_tof):
    b = []
    for i in range(len(seq) - 1):
        h = hohmann_days(seq[i], seq[i + 1])
        lo = max(30.0, 0.25 * h); hi = min(max_tof, max(2.0 * h, 120.0))
        if seq[i] == seq[i + 1]:
            lo, hi = 300.0, min(max_tof, 1200.0)  # resonant; needs --max-revs>=1
        b.append((lo, max(lo + 1, hi)))
    return b

def optimize(seq, t0_lo, t0_hi, opts, seed=0, maxiter=300, popsize=25):
    bounds = [(t0_lo, t0_hi)] + leg_bounds(seq, opts.get("max_tof_days", 3650))
    f = lambda x: evaluate(seq, x[0], x[1:], opts)
    res = differential_evolution(f, bounds, seed=seed, maxiter=maxiter, popsize=popsize,
                                 tol=1e-7, mutation=(0.5, 1.0), recombination=0.9,
                                 polish=True, init="sobol")
    d = evaluate(seq, res.x[0], res.x[1:], opts, detail=True)
    return d

def candidate_sequences(target, max_flybys=3):
    """Enumerate plausible flyby sequences Earth -> target (heuristic pruning)."""
    ti = ORDER.index(target)
    outer = [p for p in ("jupiter", "saturn", "uranus") if ORDER.index(p) < ti]
    inner_prefixes = [[], ["venus"], ["mars"], ["venus", "earth"], ["venus", "venus"],
                      ["earth"], ["venus", "earth", "earth"], ["venus", "venus", "earth"]]
    if target in ("mercury", "venus"):
        inner_prefixes = [[], ["venus"], ["earth"], ["venus", "venus"], ["earth", "venus"]]
    seqs = set()
    for pre in inner_prefixes:
        for k in range(0, len(outer) + 1):
            for chain in itertools.combinations(outer, k):
                mid = list(pre) + list(chain)
                if len(mid) > max_flybys: continue
                if target in ("mercury", "venus") and pre and pre[-1] == target and target == "venus":
                    continue
                if pre == ["mars"] and target == "mars": continue
                if target == "mars" and pre == ["venus", "earth"]: pass
                s = tuple(["earth"] + mid + [target])
                if any(s[i] == s[i+1] and s[i] not in ("venus", "earth") for i in range(len(s)-1)): continue
                if s[-2] == target: continue
                seqs.add(s)
    return sorted(seqs, key=lambda s: (len(s), s))

def hazards(d, jupiter_rad_rj=15.0, opts=None):
    """Flag low flybys and high-radiation Jupiter passes."""
    out = []
    for fb in d["flybys"]:
        b = fb["body"]; R = PLANETS[b][2]
        if not fb["ok"]:
            out.append(f"{LETTER[b]} flyby needs more turn than allowed at min safe alt "
                       f"({PLANETS[b][4]:.0f} km): clamped, extra dv charged")
        elif fb["alt_km"] < PLANETS[b][4] * 1.05:
            out.append(f"{LETTER[b]} flyby at {fb['alt_km']:.0f} km alt, near safe floor")
        if b == "jupiter" and fb["rp_km"] / R < jupiter_rad_rj:
            out.append(f"J flyby periapsis {fb['rp_km']/R:.1f} Rj < {jupiter_rad_rj:.0f} Rj: HIGH RADIATION")
        if b == "saturn" and fb["rp_km"] / R < 2.3:
            out.append(f"S flyby periapsis {fb['rp_km']/R:.2f} Rs: inside main ring region")
    if d["seq"][-1] == "jupiter" and d["arrival"]["mode"] != "flyby":
        from .maneuvers import capture_orbit_defaults
        alt = (opts or {}).get("capture_peri_alt") or capture_orbit_defaults("jupiter")[0]
        if (R_ := PLANETS["jupiter"][2]) and (R_ + alt) / R_ < jupiter_rad_rj:
            out.append(f"Jupiter capture periapsis {(R_+alt)/R_:.1f} Rj: HIGH RADIATION")
    return out
