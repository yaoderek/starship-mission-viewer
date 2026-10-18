"""Compare our Lambert solvers vs lamberthub (Izzo 2015, Gooding 1990) on random cases, incl. multi-rev.
Also propagate each of our solutions with an independent integrator (scipy DOP853) to check endpoints."""
import sys, json, numpy as np
sys.path.insert(0, ".")
from lamberthub import izzo2015, gooding1990
from scipy.integrate import solve_ivp
from starship.lambert import lambert
from starship.lambert_mr import lambert_all
mu = 1.0; rng = np.random.default_rng(7)
def twobody(t, y): r = y[:3]; return np.r_[y[3:], -mu * r / np.linalg.norm(r)**3]
res = dict(n0=0, fail0=0, max0=0.0, nmr=0, failmr=0, maxmr=0.0, prop_max=0.0, missing=0)
for k in range(400):
    r1 = rng.normal(size=3); r1 *= rng.uniform(0.4, 2) / np.linalg.norm(r1)
    r2 = rng.normal(size=3); r2 *= rng.uniform(0.4, 3) / np.linalg.norm(r2)
    r1[2] *= .2; r2[2] *= .2
    tof = rng.uniform(0.3, 40.0)
    ours = lambert_all(r1, r2, tof, mu, max_revs=3)
    # reference: izzo for each M (M=0 single; M>=1 both branches)
    refs = []
    for M in range(0, 4):
        for low in ([True] if M == 0 else [True, False]):
            try:
                v1, v2 = izzo2015(mu, r1, r2, tof, M=M, prograde=True, low_path=low, maxiter=200, atol=1e-12, rtol=1e-12)
                if np.all(np.isfinite(v1)): refs.append((M, v1, v2))
            except Exception: pass
    for M, v1, v2 in refs:
        cand = [o for o in ours if o[2] == M]
        if not cand: res["missing"] += 1; continue
        err = min(np.linalg.norm(o[0] - v1) / np.linalg.norm(v1) for o in cand)
        key = "0" if M == 0 else "mr"
        res["n" + key] += 1; res["max" + key] = max(res["max" + key], err)
        if err > 1e-6: res["fail" + key] += 1
    for o in ours:
        s = solve_ivp(twobody, (0, tof), np.r_[r1, o[0]], method="DOP853", rtol=1e-12, atol=1e-12)
        res["prop_max"] = max(res["prop_max"], np.linalg.norm(s.y[:3, -1] - r2) / np.linalg.norm(r2))
# gooding cross-check of 0-rev on planetary-scale numbers
from starship.constants import MU_SUN, AU
g = 0.0
for k in range(100):
    r1 = np.r_[rng.normal(size=2), 0.05 * rng.normal()] * AU; r2 = np.r_[rng.normal(size=2) * 3, 0.05 * rng.normal()] * AU
    tof = rng.uniform(100, 1500) * 86400
    a = lambert(r1, r2, tof, MU_SUN)
    if a is None: continue
    v1, v2 = gooding1990(MU_SUN, r1, r2, tof, M=0, prograde=True, low_path=True)
    g = max(g, np.linalg.norm(a[0] - v1) / np.linalg.norm(v1))
res["gooding_max"] = g
print(json.dumps(res, indent=1)); json.dump(res, open("verification/lambert.json", "w"), indent=1)
