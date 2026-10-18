"""Numba-accelerated kernels for the optimizer: tabulated DE440s ephemeris (daily nodes,
cubic Hermite interpolation of position/velocity), 0-rev Lambert, Kepler propagation and the
full MGA-1DSM fitness. The Python implementations in lambert.py / mga1dsm.py are the reference;
fastcore is checked against them (see tests/test_core.py)."""
import os, math
import numpy as np
from numba import njit
from .constants import PLANETS, MU_SUN, ORDER, DAY

TAB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ephem_table_1950_2100.npz")
JD0 = 2433282.5   # 1950-01-01
NDAYS = 55152     # to ~2101

def build_table():
    from .ephem import kernel, _ROT
    k = kernel(); jd = JD0 + np.arange(NDAYS, dtype=float)
    ps, vs = k[0, 10].compute_and_differentiate(jd)
    R = np.zeros((8, NDAYS, 3)); V = np.zeros((8, NDAYS, 3))
    for i, b in enumerate(ORDER):
        pid = PLANETS[b][0]
        p, v = k[0, pid].compute_and_differentiate(jd)
        if b == "earth":
            p2, v2 = k[3, 399].compute_and_differentiate(jd); p = p + p2; v = v + v2
        elif b in ("mercury", "venus"):
            p2, v2 = k[pid, pid * 100 + 99].compute_and_differentiate(jd); p = p + p2; v = v + v2
        R[i] = (_ROT @ (p - ps)).T; V[i] = (_ROT @ ((v - vs) / 86400.0)).T
    np.savez(TAB_PATH, R=R, V=V)
    return R, V

def load_table():
    if not os.path.exists(TAB_PATH):
        return build_table()
    z = np.load(TAB_PATH); return z["R"], z["V"]

@njit(cache=True)
def eph(R, V, ib, jd):
    s = jd - 2433282.5; i = int(math.floor(s))
    if i < 0: i = 0
    if i > R.shape[1] - 2: i = R.shape[1] - 2
    t = s - i; h = 86400.0
    p0 = R[ib, i]; p1 = R[ib, i + 1]; m0 = V[ib, i] * h; m1 = V[ib, i + 1] * h
    t2 = t * t; t3 = t2 * t
    h00 = 2 * t3 - 3 * t2 + 1; h10 = t3 - 2 * t2 + t; h01 = -2 * t3 + 3 * t2; h11 = t3 - t2
    r = h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1
    d00 = 6 * t2 - 6 * t; d10 = 3 * t2 - 4 * t + 1; d01 = -6 * t2 + 6 * t; d11 = 3 * t2 - 2 * t
    v = (d00 * p0 + d10 * m0 + d01 * p1 + d11 * m1) / h
    return r, v

@njit(cache=True)
def stumpff(z):
    if z > 1e-8:
        s = math.sqrt(z); return (s - math.sin(s)) / s**3, (1 - math.cos(s)) / z
    if z < -1e-8:
        s = math.sqrt(-z)
        if s > 700: return math.inf, math.inf
        return (math.sinh(s) - s) / s**3, (math.cosh(s) - 1) / (-z)
    return 1 / 6 - z / 120, 0.5 - z / 24

@njit(cache=True)
def _y(z, R1, R2, A):
    S, C = stumpff(z)
    if not (C > 1e-300) or not math.isfinite(C): return -1.0
    return R1 + R2 + A * (z * S - 1) / math.sqrt(C)

@njit(cache=True)
def _F(z, R1, R2, A, smu, tof):
    yy = _y(z, R1, R2, A)
    if yy < 0: return -1e30
    S, C = stumpff(z)
    return (yy / C) ** 1.5 * S + A * math.sqrt(yy) - smu * tof

@njit(cache=True)
def lambert0(r1, r2, tof, mu):
    z3 = np.zeros(3)
    R1 = np.linalg.norm(r1); R2 = np.linalg.norm(r2)
    cosd = np.dot(r1, r2) / (R1 * R2); cosd = max(-1.0, min(1.0, cosd))
    dth = math.acos(cosd)
    cz = r1[0] * r2[1] - r1[1] * r2[0]
    if cz < 0: dth = 2 * math.pi - dth
    if abs(1 - cosd) < 1e-12 or tof <= 0: return False, z3, z3
    A = math.sin(dth) * math.sqrt(R1 * R2 / (1 - cosd))
    if abs(A) < 1e-9: return False, z3, z3
    smu = math.sqrt(mu)
    zu = 4 * math.pi**2 - 1e-6; zl = -4 * math.pi**2
    if _y(zl, R1, R2, A) <= 0:
        a = zl; b = zu
        for _ in range(200):
            m = 0.5 * (a + b)
            if _y(m, R1, R2, A) > 0: b = m
            else: a = m
        zl = b + 1e-10
    k = 0
    while _F(zl, R1, R2, A, smu, tof) > 0 and k < 60:
        zl = zl * 2 if zl < 0 else zl - 10; k += 1
        if _y(zl, R1, R2, A) <= 0: return False, z3, z3
    if _F(zl, R1, R2, A, smu, tof) > 0 or _F(zu, R1, R2, A, smu, tof) < 0: return False, z3, z3
    a = zl; b = zu
    for _ in range(100):
        m = 0.5 * (a + b)
        if _F(m, R1, R2, A, smu, tof) > 0: b = m
        else: a = m
        if b - a < 1e-11: break
    z = 0.5 * (a + b); yy = _y(z, R1, R2, A)
    f = 1 - yy / R1; g = A * math.sqrt(yy / mu); gd = 1 - yy / R2
    return True, (r2 - f * r1) / g, (gd * r2 - r1) / g

@njit(cache=True)
def propagate(r0, v0, dt, mu):
    R0 = np.linalg.norm(r0); vr0 = np.dot(r0, v0) / R0
    alpha = 2 / R0 - np.dot(v0, v0) / mu; smu = math.sqrt(mu)
    if alpha > 0:
        x = smu * alpha * dt
    else:
        a = 1 / alpha
        x = math.copysign(1.0, dt) * math.sqrt(-a) * math.log(max(1e-12, (-2 * mu * alpha * abs(dt)) /
            (np.dot(r0, v0) + math.copysign(1.0, dt) * math.sqrt(-mu * a) * (1 - R0 * alpha)) + 1e-300))
    ok = False
    for _ in range(100):
        z = alpha * x * x; S, C = stumpff(z)
        if not math.isfinite(S): return False, r0, v0
        Fx = R0 * vr0 / smu * x * x * C + (1 - alpha * R0) * x**3 * S + R0 * x - smu * dt
        dF = R0 * vr0 / smu * x * (1 - alpha * x * x * S) + (1 - alpha * R0) * x * x * C + R0
        dx = Fx / dF; x -= dx
        if abs(dx) < 1e-8: ok = True; break
    if not ok: return False, r0, v0
    z = alpha * x * x; S, C = stumpff(z)
    f = 1 - x * x / R0 * C; g = dt - x**3 / smu * S
    r = f * r0 + g * v0; Rn = np.linalg.norm(r)
    fd = smu / (Rn * R0) * (alpha * x**3 * S - x); gd = 1 - x * x / Rn * C
    return True, r, fd * r0 + gd * v0

@njit(cache=True)
def fitness_1dsm(x, seq, mus, radii, R, V, rpark, arr, max_tof, tof_w):
    """seq: int array of planet indices; arr: [mode(0 flyby,1 auto,2 aero,3 prop), has_atm, vmax,
    r_entry, rp_cap, ecc, trim, mu_t]. Returns score."""
    MU = 1.32712440018e11
    t0 = x[0]; u = x[1]; vv = x[2]; Vinf = x[3]; eta = x[4]; T = x[5]
    th = 2 * math.pi * u; ph = math.acos(2 * vv - 1) - math.pi / 2
    vdep = Vinf * np.array([math.cos(th) * math.cos(ph), math.sin(th) * math.cos(ph), math.sin(ph)])
    t = t0; r, vp = eph(R, V, seq[0], t)
    vout = vp + vdep; dsm = 0.0
    varr = vout
    n = seq.shape[0]
    for i in range(n - 1):
        if i > 0:
            k = 6 + 4 * (i - 1)
            beta = x[k]; rpr = x[k + 1]; eta = x[k + 2]; T = x[k + 3]
            mu = mus[seq[i]]; vin = varr - vp; vm = np.linalg.norm(vin)
            delta = 2 * math.asin(1 / (1 + rpr * radii[seq[i]] * vm * vm / mu))
            b1 = vin / vm; b2 = np.cross(b1, vp); b2 = b2 / np.linalg.norm(b2); b3 = np.cross(b1, b2)
            vout = vp + vm * (math.cos(delta) * b1 + math.sin(delta) * math.cos(beta) * b2
                              + math.sin(delta) * math.sin(beta) * b3)
        Ts = T * 86400.0
        ok, rd, vdm = propagate(r, vout, eta * Ts, MU)
        if not ok: return 1e3
        tn = t + T
        r2, vp2 = eph(R, V, seq[i + 1], tn)
        ok, v1, v2 = lambert0(rd, r2, (1 - eta) * Ts, MU)
        if not ok: return 1e3
        dsm += np.linalg.norm(v1 - vdm)
        varr = v2; r = r2; vp = vp2; t = tn
    vinf_a = np.linalg.norm(varr - vp)
    mode = arr[0]; cap = 0.0
    if mode != 0:
        mu_t = arr[7]; aero = False
        if (mode == 1 or mode == 2) and arr[1] > 0 and arr[2] > 0:
            ve = math.sqrt(vinf_a**2 + 2 * mu_t / arr[3])
            if ve <= arr[2]: aero = True
        if aero: cap = arr[6]
        else:
            rp = arr[4]
            cap = math.sqrt(vinf_a**2 + 2 * mu_t / rp) - math.sqrt(mu_t * (1 + arr[5]) / rp)
    mue = mus[2]
    dvdep = math.sqrt(Vinf**2 + 2 * mue / rpark) - math.sqrt(mue / rpark)
    tof = t - t0
    pen = max(0.0, tof - max_tof) / 100.0
    s = dvdep + dsm + cap + pen + tof_w * tof / 365.25
    if not math.isfinite(s): return 1e3
    return s
