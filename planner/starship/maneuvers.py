"""Departure, flyby and arrival maneuver models (patched conics)."""
import math
import numpy as np
from .constants import PLANETS

# ESTIMATED max atmospheric entry speeds (km/s, inertial at entry interface) that a
# Starship-class heat shield might tolerate for aerocapture. Not official numbers.
DEFAULT_MAX_ENTRY = {"mars": 7.5, "earth": 12.5, "venus": 11.5}
ENTRY_ALT_KM = {"mars": 125.0, "earth": 120.0, "venus": 150.0, "jupiter": 1000.0,
                "saturn": 1000.0, "uranus": 1000.0, "neptune": 1000.0}
AEROCAPTURE_TRIM_KMS = 0.15  # ESTIMATE: periapsis raise + cleanup after aerocapture

def departure_dv(vinf, mu=PLANETS["earth"][1], r_park=6371.0 + 300.0):
    """Impulsive burn from circular parking orbit to hyperbolic v-infinity."""
    return math.sqrt(vinf**2 + 2 * mu / r_park) - math.sqrt(mu / r_park)

def capture_orbit_defaults(body):
    R = PLANETS[body][2]
    if body in ("jupiter", "saturn", "uranus", "neptune"):
        return PLANETS[body][4], 0.9   # periapsis alt at safe floor, highly elliptic
    return 400.0, 0.0                  # low circular orbit

def propulsive_capture_dv(body, vinf, peri_alt_km=None, ecc=None):
    d_alt, d_e = capture_orbit_defaults(body)
    peri_alt_km = d_alt if peri_alt_km is None else peri_alt_km
    ecc = d_e if ecc is None else ecc
    mu, R = PLANETS[body][1], PLANETS[body][2]
    rp = R + peri_alt_km
    v_hyp = math.sqrt(vinf**2 + 2 * mu / rp)
    v_orb = math.sqrt(mu * (1 + ecc) / rp)
    return v_hyp - v_orb

def entry_speed(body, vinf):
    mu, R = PLANETS[body][1], PLANETS[body][2]
    return math.sqrt(vinf**2 + 2 * mu / (R + ENTRY_ALT_KM.get(body, 200.0)))

def arrival(body, vinf, mode="auto", max_entry=None, peri_alt_km=None, ecc=None):
    """Return dict(dv, mode, entry_speed, note). mode: auto|aero|prop|flyby."""
    if mode == "flyby":
        return dict(dv=0.0, mode="flyby", entry_speed=None, note="no capture")
    has_atm = PLANETS[body][3]
    vmax = DEFAULT_MAX_ENTRY.get(body, 0.0) if max_entry is None else max_entry
    ve = entry_speed(body, vinf) if has_atm else None
    if mode in ("auto", "aero") and has_atm and vmax > 0 and ve <= vmax:
        return dict(dv=AEROCAPTURE_TRIM_KMS, mode="aero", entry_speed=ve, note="")
    note = ""
    if mode == "aero":
        note = ("no atmosphere" if not has_atm else
                f"entry {ve:.1f} > max {vmax:.1f} km/s") + " -> propulsive"
    return dict(dv=propulsive_capture_dv(body, vinf, peri_alt_km, ecc), mode="prop",
                entry_speed=ve, note=note)

def flyby(body, vin, vout, rp_min_alt=None):
    """Powered-flyby model: find periapsis radius giving required turn; burn at periapsis
    covers |v_inf| mismatch. If required turn exceeds the max at rp_min, an extra
    (penalised) turning delta-v is added and the flyby is clamped at rp_min.
    Returns (dv, rp_km, turn_deg, feasible_unpowered_turn)."""
    mu, R = PLANETS[body][1], PLANETS[body][2]
    rpmin = R + (PLANETS[body][4] if rp_min_alt is None else rp_min_alt)
    a, b = np.linalg.norm(vin), np.linalg.norm(vout)
    if not (a > 1e-3 and b > 1e-3):  # degenerate (zero v-inf) flyby
        return abs(a - b) + 10.0, rpmin, 0.0, False
    alpha = math.acos(max(-1, min(1, np.dot(vin, vout) / (a * b))))
    def turn(rp):
        return math.asin(1 / (1 + rp * a * a / mu)) + math.asin(1 / (1 + rp * b * b / mu))
    extra = 0.0; ok = True
    if turn(rpmin) >= alpha:
        lo, hi = rpmin, rpmin
        while turn(hi) > alpha and hi < 1e12: hi *= 2
        for _ in range(80):
            m = 0.5 * (lo + hi)
            if turn(m) > alpha: lo = m
            else: hi = m
        rp = 0.5 * (lo + hi)
    else:
        rp = rpmin; ok = False
        extra = 2 * b * math.sin((alpha - turn(rpmin)) / 2)
    dv = abs(math.sqrt(b * b + 2 * mu / rp) - math.sqrt(a * a + 2 * mu / rp)) + extra
    return dv, rp, math.degrees(alpha), ok
