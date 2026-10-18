"""MGA-1DSM trajectory model (velocity formulation, after Vasile & De Pascale / pykep mga_1dsm).

Decision vector:
  [t0, u, v, Vinf, eta1, T1]  +  [beta_i, rp_i/R_i, eta_i, T_i]  for each later leg
Launch v-infinity direction from (u, v); each leg: ballistic Kepler arc for eta*T, one impulsive
deep-space manoeuvre (DSM), then a 0-rev Lambert arc for (1-eta)*T to the next planet.
Flybys are unpowered (|v_inf| conserved) with periapsis rp >= safe floor and plane angle beta.
Because the first arc is propagated (any number of revs), Earth-Earth / Venus-Venus resonant
legs (with a DSM to pump/crank) are represented properly.
"""
import math
import numpy as np
from scipy.optimize import differential_evolution, minimize
from .constants import PLANETS, MU_SUN, DAY, LETTER
from .ephem import state, date_from_jd
from .lambert import lambert, propagate
from .maneuvers import departure_dv, arrival
from .mga import seq_name, hohmann_days

def _fb_out(vin_rel, vpl, mu, rp, beta):
    v = np.linalg.norm(vin_rel)
    delta = 2 * math.asin(1 / (1 + rp * v * v / mu))
    b1 = vin_rel / v
    b2 = np.cross(b1, vpl); b2 /= np.linalg.norm(b2)
    b3 = np.cross(b1, b2)
    return v * (math.cos(delta) * b1 + math.sin(delta) * math.cos(beta) * b2
                + math.sin(delta) * math.sin(beta) * b3), math.degrees(delta)

def decode(seq, x, opts, detail=False):
    try:
        out = _decode(seq, x, opts, detail)
    except (OverflowError, ValueError, ZeroDivisionError, FloatingPointError):
        return None if detail else 1e3
    if not detail and not math.isfinite(out):
        return 1e3
    return out

def _decode(seq, x, opts, detail=False):
    t0, u, vv, Vinf, eta, T = x[:6]
    theta = 2 * math.pi * u; phi = math.acos(2 * vv - 1) - math.pi / 2
    vinf_dep = Vinf * np.array([math.cos(theta) * math.cos(phi), math.sin(theta) * math.cos(phi), math.sin(phi)])
    t = t0; r, vp = state(seq[0], t)
    v_out = vp + vinf_dep
    dsms = []; fbs = []; arcs = []; times = [t0]; states = [(r, vp)]
    for i in range(len(seq) - 1):
        if i > 0:
            beta, rpr, eta, T = x[6 + 4 * (i - 1): 10 + 4 * (i - 1)]
            b = seq[i]; mu, R = PLANETS[b][1], PLANETS[b][2]
            vrel, turn = _fb_out(v_arr - vp, vp, mu, rpr * R, beta)
            v_out = vp + vrel
            fbs.append(dict(body=b, jd=t, date=date_from_jd(t), vinf=float(np.linalg.norm(vrel)),
                            rp_km=rpr * R, alt_km=rpr * R - R, turn_deg=turn, dv=0.0, ok=True, beta=beta))
        T_s = T * DAY
        r_d, v_dm = propagate(r, v_out, eta * T_s, MU_SUN)
        t_next = t + T
        r2, vp2 = state(seq[i + 1], t_next)
        sol = lambert(r_d, r2, (1 - eta) * T_s, MU_SUN)
        if sol is None:
            return None if detail else 1e3
        dv = float(np.linalg.norm(sol[0] - v_dm))
        dsms.append(dict(leg=i + 1, jd=t + eta * T, date=date_from_jd(t + eta * T), dv=dv,
                         r=r_d))
        arcs.append(dict(r0=r, v0=v_out, t_dsm=eta * T_s, r_dsm=r_d, v_dsm=sol[0], tof=T_s))
        v_arr = sol[1]; r, vp, t = r2, vp2, t_next
        times.append(t); states.append((r, vp))
    vinf_arr = float(np.linalg.norm(v_arr - vp))
    arr = arrival(seq[-1], vinf_arr, opts.get("arrival_mode", "auto"), opts.get("max_entry"),
                  opts.get("capture_peri_alt"), opts.get("capture_ecc"))
    dv_dep = departure_dv(Vinf, r_park=PLANETS["earth"][2] + opts.get("leo_alt", 300.0))
    dv_dsm = sum(d["dv"] for d in dsms)
    total = dv_dep + dv_dsm + arr["dv"]
    tof = t - t0
    pen = max(0.0, tof - opts.get("max_tof_days", 1e9)) / 100.0
    score = total + pen + opts.get("tof_weight", 0.0) * tof / 365.25
    if not detail:
        return score
    return dict(model="mga-1dsm", seq=list(seq), name=seq_name(seq), x=list(map(float, x)), t0=t0,
                tofs=[times[k + 1] - times[k] for k in range(len(seq) - 1)], times=times,
                launch=date_from_jd(t0), arrive=date_from_jd(t), tof_days=tof,
                vinf_dep=Vinf, c3=Vinf ** 2, dv_dep=dv_dep, dv_flyby=0.0, dv_dsm=dv_dsm, dsms=dsms,
                flybys=fbs, vinf_arr=vinf_arr, arrival=arr, dv_total=total, score=score,
                arcs=arcs, states=states)

def leg_tof_bounds(a, b, max_tof):
    if a == b:
        return (300.0, min(max_tof, 1200.0))   # allows 1:1, 2:1 Earth resonances, V-V 1:1..3:2
    h = hohmann_days(a, b)
    lo = max(40.0, 0.3 * h); hi = min(max_tof, max(2.5 * h, 200.0))
    if lo >= hi: lo = max(40.0, 0.5 * hi)  # long legs (e.g. U-N) under a tight max TOF
    return (lo, hi)

def bounds(seq, t0_lo, t0_hi, opts):
    mt = opts.get("max_tof_days", 3650)
    b = [(t0_lo, t0_hi), (0.0, 1.0), (0.0, 1.0), (opts.get("vinf_min", 0.5), opts.get("vinf_max", 8.0)),
         (0.01, 0.99), leg_tof_bounds(seq[0], seq[1], mt)]
    for i in range(1, len(seq) - 1):
        body = seq[i]; R = PLANETS[body][2]
        rmin = 1 + PLANETS[body][4] / R
        rmax = 100.0 if body in ("jupiter", "saturn", "uranus", "neptune") else 30.0
        b += [(-2 * math.pi, 2 * math.pi), (rmin, rmax), (0.01, 0.99), leg_tof_bounds(body, seq[i + 1], mt)]
    return b

def optimize(seq, t0_lo, t0_hi, opts, seed=0, maxiter=600, popsize=15):
    bnds = bounds(seq, t0_lo, t0_hi, opts)
    f = lambda x: decode(seq, x, opts)
    res = differential_evolution(f, bnds, seed=seed, maxiter=maxiter, popsize=popsize, tol=1e-8,
                                 mutation=(0.4, 1.0), recombination=0.9, polish=False, init="sobol")
    x = res.x
    try:  # bounded local refinement
        r2 = minimize(f, x, method="Nelder-Mead", options=dict(maxiter=4000, xatol=1e-6, fatol=1e-7))
        lo = np.array([b[0] for b in bnds]); hi = np.array([b[1] for b in bnds])
        if r2.fun < res.fun and np.all(r2.x >= lo) and np.all(r2.x <= hi):
            x = r2.x
    except Exception:
        pass
    return decode(seq, x, opts, detail=True)

def sample(d, n_per_leg=300):
    """Heliocentric sampled points [(jd, x, y, z km)] along the full trajectory."""
    pts = []
    for i, a in enumerate(d["arcs"]):
        t_start = d["times"][i]
        for s in np.linspace(0, a["t_dsm"], n_per_leg // 2):
            r, _ = propagate(a["r0"], a["v0"], s, MU_SUN); pts.append((t_start + s / DAY, *r))
        rem = a["tof"] - a["t_dsm"]
        for s in np.linspace(0, rem, n_per_leg // 2):
            r, _ = propagate(a["r_dsm"], a["v_dsm"], s, MU_SUN); pts.append((t_start + (a["t_dsm"] + s) / DAY, *r))
    return pts

# ---------------- fast fitness + pygmo optimisation ----------------
from . import fastcore as _fc
from .constants import ORDER as _ORDER
from .maneuvers import DEFAULT_MAX_ENTRY, ENTRY_ALT_KM, AEROCAPTURE_TRIM_KMS, capture_orbit_defaults
_TAB = None

class FastFitness:
    def __init__(self, seq, opts):
        global _TAB
        if _TAB is None: _TAB = _fc.load_table()
        self.R, self.V = _TAB
        self.seq = np.array([_ORDER.index(b) for b in seq], dtype=np.int64)
        self.mus = np.array([PLANETS[b][1] for b in _ORDER]); self.radii = np.array([PLANETS[b][2] for b in _ORDER])
        tgt = seq[-1]; mode = {"flyby": 0, "auto": 1, "aero": 2, "prop": 3}[opts.get("arrival_mode", "auto")]
        vmax = DEFAULT_MAX_ENTRY.get(tgt, 0.0) if opts.get("max_entry") is None else opts["max_entry"]
        d_alt, d_e = capture_orbit_defaults(tgt)
        alt = d_alt if opts.get("capture_peri_alt") is None else opts["capture_peri_alt"]
        ecc = d_e if opts.get("capture_ecc") is None else opts["capture_ecc"]
        Rt = PLANETS[tgt][2]
        self.arr = np.array([mode, float(PLANETS[tgt][3]), vmax, Rt + ENTRY_ALT_KM.get(tgt, 200.0), Rt + alt, ecc,
                             AEROCAPTURE_TRIM_KMS, PLANETS[tgt][1]])
        self.rpark = PLANETS["earth"][2] + opts.get("leo_alt", 300.0)
        self.max_tof = opts.get("max_tof_days", 1e9); self.w = opts.get("tof_weight", 0.0)
    def __call__(self, x):
        return _fc.fitness_1dsm(np.asarray(x, dtype=float), self.seq, self.mus, self.radii, self.R, self.V,
                                self.rpark, self.arr, self.max_tof, self.w)

class _PgProb:
    def __init__(self, seq=None, opts=None, bnds=None):
        self.seq, self.opts, self.bnds = seq, opts, bnds; self._f = None
    def fitness(self, x):
        if self._f is None: self._f = FastFitness(self.seq, self.opts)
        return [self._f(x)]
    def get_bounds(self):
        return ([b[0] for b in self.bnds], [b[1] for b in self.bnds])
    def get_name(self): return "mga1dsm " + seq_name(self.seq)

def optimize_pg(seq, t0_lo, t0_hi, opts, seed=0, gens=1500, pop=None, restarts=4):
    """Self-adaptive DE (pygmo sade) with restarts, polished by monotonic basin hopping
    around a compass search. Returns detail dict (decoded with the reference Python model)."""
    import pygmo as pg
    bnds = bounds(seq, t0_lo, t0_hi, opts)
    prob = pg.problem(_PgProb(tuple(seq), opts, bnds))
    pop = pop or max(40, 6 * len(bnds))
    best_x, best_f = None, math.inf
    for k in range(restarts):
        p = pg.population(prob, pop, seed=seed * 1000 + k)
        p = pg.algorithm(pg.sade(gen=gens, variant=2, variant_adptv=2, memory=False, ftol=1e-8, xtol=1e-8,
                                 seed=seed * 1000 + k)).evolve(p)
        if p.champion_f[0] < best_f: best_f, best_x = p.champion_f[0], p.champion_x
    p = pg.population(prob, 1, seed=seed); p.set_x(0, best_x)
    loc = pg.algorithm(pg.compass_search(max_fevals=20000, start_range=0.05, stop_range=1e-7))
    p = pg.algorithm(pg.mbh(loc, stop=5, perturb=0.02, seed=seed)).evolve(p)
    return decode(seq, p.champion_x, opts, detail=True)
