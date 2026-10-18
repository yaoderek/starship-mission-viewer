"""Multi-revolution Lambert solver (universal-variable formulation).

For N complete revolutions the universal variable z lies in the band
((2*pi*N)^2, (2*pi*(N+1))^2). In each band (N>=1) the time-of-flight curve t(z) has a single
minimum; for TOF above that minimum there are two solutions, the left branch (z below the
minimum, lower energy / longer path) and right branch (z above). N=0 has one solution.
This plays the role of Izzo's N-rev left/right solutions; it is NOT Izzo's algorithm
(Householder on x), just robust bracketing - slower but simple and verifiable.
"""
import math
import numpy as np
from .lambert import _stumpff, lambert as lambert0

def _geom(r1, r2, prograde):
    R1 = np.linalg.norm(r1); R2 = np.linalg.norm(r2)
    cosd = max(-1.0, min(1.0, float(np.dot(r1, r2) / (R1 * R2))))
    dth = math.acos(cosd)
    cz = np.cross(r1, r2)[2]
    if (prograde and cz < 0) or (not prograde and cz >= 0):
        dth = 2 * math.pi - dth
    if abs(1 - cosd) < 1e-12:
        return None
    A = math.sin(dth) * math.sqrt(R1 * R2 / (1 - cosd))
    return R1, R2, A

def lambert_all(r1, r2, tof, mu, max_revs=2, prograde=True):
    """Return list of (v1, v2, nrev, branch) for all solutions up to max_revs."""
    out = []
    s0 = lambert0(r1, r2, tof, mu, prograde)
    if s0 is not None:
        out.append((s0[0], s0[1], 0, "0"))
    g = _geom(r1, r2, prograde)
    if g is None or max_revs < 1:
        return out
    R1, R2, A = g; smu = math.sqrt(mu)
    def y(z):
        S, C = _stumpff(z)
        if C <= 1e-300: return -1.0
        return R1 + R2 + A * (z * S - 1) / math.sqrt(C)
    def t(z):
        yy = y(z)
        if yy <= 0: return math.inf
        S, C = _stumpff(z)
        return ((yy / C) ** 1.5 * S + A * math.sqrt(yy)) / smu
    def sol(z):
        yy = y(z); f = 1 - yy / R1; gg = A * math.sqrt(yy / mu); gd = 1 - yy / R2
        return (r2 - f * r1) / gg, (gd * r2 - r1) / gg
    for N in range(1, max_revs + 1):
        lo = (2 * math.pi * N) ** 2 * (1 + 1e-9) + 1e-6; hi = (2 * math.pi * (N + 1)) ** 2 * (1 - 1e-9) - 1e-6
        # golden-section for t minimum in band
        a, b = lo, hi; gr = 0.6180339887
        c = b - gr * (b - a); d = a + gr * (b - a)
        for _ in range(80):
            if t(c) < t(d): b = d
            else: a = c
            c = b - gr * (b - a); d = a + gr * (b - a)
        zm = 0.5 * (a + b); tmin = t(zm)
        if not math.isfinite(tmin) or tof < tmin:
            break  # higher N need even more time
        for name, (za, zb) in (("L", (lo, zm)), ("R", (zm, hi))):
            # t decreasing on left part, increasing on right
            fa = t(za) - tof; fb = t(zb) - tof
            if not (math.isfinite(fa) or math.isfinite(fb)): continue
            p, q = za, zb
            for _ in range(100):
                m = 0.5 * (p + q); fm = t(m) - tof
                if name == "L":
                    if fm > 0: p = m
                    else: q = m
                else:
                    if fm > 0: q = m
                    else: p = m
            z = 0.5 * (p + q)
            if abs(t(z) - tof) / tof < 1e-6:
                v1, v2 = sol(z); out.append((v1, v2, N, name))
    return out
