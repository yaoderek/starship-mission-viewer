"""Cross-check fast numba kernels against the reference Python implementation."""
import numpy as np, time
from starship import fastcore as fc
from starship.ephem import state
from starship.constants import ORDER, MU_SUN
from starship.lambert import lambert, propagate
from starship import mga1dsm

def test_all():
    R, V = fc.load_table()
    worst = 0
    for b in ORDER:
        for jd in np.random.default_rng(0).uniform(2451545, 2470000, 50):
            r, v = state(b, jd); r2, v2 = fc.eph(R, V, ORDER.index(b), jd)
            worst = max(worst, np.linalg.norm(r - r2))
    print("max ephem interp error km:", worst); assert worst < 50
    r1 = np.array([1.5e8, 0, 0.]); r2 = np.array([-1e8, 1.8e8, 1e6])
    a = lambert(r1, r2, 250 * 86400, MU_SUN); ok, v1, v2 = fc.lambert0(r1, r2, 250 * 86400, MU_SUN)
    assert ok and np.allclose(a[0], v1, atol=1e-6)
    ok, rr, vv = fc.propagate(r1, v1, 250 * 86400, MU_SUN); assert np.linalg.norm(rr - r2) < 1
    from starship.ephem import jd_from_date
    seq = ("earth", "venus", "earth", "earth", "jupiter"); opts = dict(arrival_mode="flyby")
    b = mga1dsm.bounds(seq, jd_from_date("1989-08-01"), jd_from_date("1989-12-31"), opts)
    f = mga1dsm.FastFitness(seq, opts)
    rng = np.random.default_rng(1); diffs = []
    for _ in range(300):
        x = np.array([rng.uniform(*q) for q in b])
        p = mga1dsm.decode(seq, x, opts); q = f(x)
        if p < 100 and q < 100: diffs.append(abs(p - q))
    print("python vs numba fitness max diff km/s:", max(diffs), "n", len(diffs)); assert max(diffs) < 1e-3
    t = time.time()
    for _ in range(2000): f(x)
    print("fast eval us:", (time.time() - t) / 2000 * 1e6)

if __name__ == "__main__":
    test_all()
