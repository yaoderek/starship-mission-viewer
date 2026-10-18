"""Zero-revolution prograde Lambert solver (universal variables, bisection; Curtis Alg. 5.2)
plus a universal-variable Kepler propagator for plotting."""
import math
import numpy as np

def _stumpff(z):
    if z > 1e-8:
        s = math.sqrt(z); return (s - math.sin(s)) / s**3, (1 - math.cos(s)) / z
    if z < -1e-8:
        s = math.sqrt(-z); return (math.sinh(s) - s) / s**3, (math.cosh(s) - 1) / (-z)
    return 1/6 - z/120, 0.5 - z/24

def lambert(r1, r2, tof, mu, prograde=True):
    """Return (v1, v2) or None. tof in seconds."""
    R1 = np.linalg.norm(r1); R2 = np.linalg.norm(r2)
    cosd = np.dot(r1, r2) / (R1 * R2); cosd = max(-1.0, min(1.0, cosd))
    dth = math.acos(cosd)
    cz = np.cross(r1, r2)[2]
    if (prograde and cz < 0) or (not prograde and cz >= 0):
        dth = 2 * math.pi - dth
    A = math.sin(dth) * math.sqrt(R1 * R2 / (1 - cosd)) if abs(1 - cosd) > 1e-12 else 0.0
    if abs(A) < 1e-9 or tof <= 0:
        return None
    smu = math.sqrt(mu)
    def y(z):
        S, C = _stumpff(z); return R1 + R2 + A * (z * S - 1) / math.sqrt(C)
    def F(z):
        S, C = _stumpff(z); yy = y(z)
        if yy < 0: return -1e30
        return (yy / C) ** 1.5 * S + A * math.sqrt(yy) - smu * tof
    zu = 4 * math.pi**2 - 1e-6
    zl = -4 * math.pi**2
    # ensure y(zl) > 0: if A>0, y may be negative at low z -> move zl up
    if y(zl) <= 0:
        a, b = zl, zu
        for _ in range(200):
            m = 0.5 * (a + b)
            if y(m) > 0: b = m
            else: a = m
        zl = b + 1e-10
    # extend lower bound for very short times (hyperbolic)
    k = 0
    while F(zl) > 0 and k < 60:
        zl = zl * 2 if zl < 0 else zl - 10; k += 1
        if y(zl) <= 0: return None
    if F(zl) > 0 or F(zu) < 0:
        return None
    a, b = zl, zu
    for _ in range(100):
        m = 0.5 * (a + b)
        if F(m) > 0: b = m
        else: a = m
        if b - a < 1e-11: break
    z = 0.5 * (a + b); yy = y(z)
    f = 1 - yy / R1; g = A * math.sqrt(yy / mu); gd = 1 - yy / R2
    v1 = (r2 - f * r1) / g; v2 = (gd * r2 - r1) / g
    return v1, v2

def propagate(r0, v0, dt, mu):
    """Universal-variable Kepler propagation (Curtis Alg. 3.4)."""
    R0 = np.linalg.norm(r0); vr0 = np.dot(r0, v0) / R0
    alpha = 2 / R0 - np.dot(v0, v0) / mu; smu = math.sqrt(mu)
    x = smu * abs(alpha) * dt
    for _ in range(100):
        z = alpha * x * x; S, C = _stumpff(z)
        Fx = R0 * vr0 / smu * x * x * C + (1 - alpha * R0) * x**3 * S + R0 * x - smu * dt
        dF = R0 * vr0 / smu * x * (1 - alpha * x * x * S) + (1 - alpha * R0) * x * x * C + R0
        dx = Fx / dF; x -= dx
        if abs(dx) < 1e-8: break
    z = alpha * x * x; S, C = _stumpff(z)
    f = 1 - x * x / R0 * C; g = dt - x**3 / smu * S
    r = f * r0 + g * v0; R = np.linalg.norm(r)
    fd = smu / (R * R0) * (alpha * x**3 * S - x); gd = 1 - x * x / R * C
    return r, fd * r0 + gd * v0
