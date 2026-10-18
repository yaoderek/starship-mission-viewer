"""Heliocentric ecliptic-J2000 planet states from JPL DE440s (jplephem)."""
import os, math, datetime
import numpy as np
from jplephem.spk import SPK
from .constants import PLANETS, OBLIQUITY

_KERNEL = None
_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "de440s.bsp")
_c, _s = math.cos(OBLIQUITY), math.sin(OBLIQUITY)
_ROT = np.array([[1, 0, 0], [0, _c, _s], [0, -_s, _c]])  # equatorial -> ecliptic
_cache = {}

def kernel():
    global _KERNEL
    if _KERNEL is None:
        _KERNEL = SPK.open(os.path.abspath(_PATH))
    return _KERNEL

def state(body, jd):
    """Return (r km, v km/s) of planet barycenter relative to the Sun, ecliptic J2000.
    For Earth uses the Earth body (399) not the EMB."""
    key = (body, round(jd, 6))
    if key in _cache:
        return _cache[key]
    k = kernel()
    pid = PLANETS[body][0]
    p, v = k[0, pid].compute_and_differentiate(jd)
    if body == "earth":
        p2, v2 = k[3, 399].compute_and_differentiate(jd); p = p + p2; v = v + v2
    elif body in ("mercury", "venus"):
        nid = pid * 100 + 99
        p2, v2 = k[pid, nid].compute_and_differentiate(jd); p = p + p2; v = v + v2
    ps, vs = k[0, 10].compute_and_differentiate(jd)
    r = _ROT @ (p - ps); vv = _ROT @ ((v - vs) / 86400.0)
    if len(_cache) > 200000: _cache.clear()
    _cache[key] = (r, vv)
    return r, vv

def jd_from_date(d):
    if isinstance(d, str): d = datetime.datetime.fromisoformat(d)
    if isinstance(d, datetime.date) and not isinstance(d, datetime.datetime):
        d = datetime.datetime(d.year, d.month, d.day)
    return 2440587.5 + (d - datetime.datetime(1970, 1, 1)).total_seconds() / 86400.0

def date_from_jd(jd):
    return datetime.datetime(1970, 1, 1) + datetime.timedelta(days=jd - 2440587.5)
