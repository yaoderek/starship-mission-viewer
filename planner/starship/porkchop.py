"""Porkchop grid (direct Lambert transfers) and plotting."""
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from .constants import DAY, MU_SUN, PLANETS, LETTER
from .ephem import state, date_from_jd
from .lambert import lambert
from .maneuvers import departure_dv, arrival

def grid(origin, dest, t0_lo, t0_hi, tof_lo, tof_hi, n=120, opts=None, capture=True):
    opts = opts or {}
    L = np.linspace(t0_lo, t0_hi, n); T = np.linspace(tof_lo, tof_hi, n)
    DV = np.full((n, n), np.nan); C3 = np.full((n, n), np.nan); VA = np.full((n, n), np.nan)
    Rp = PLANETS[origin][2] + opts.get("leo_alt", 300.0)
    for i, t0 in enumerate(L):
        r1, v1p = state(origin, t0)
        for j, tof in enumerate(T):
            r2, v2p = state(dest, t0 + tof)
            s = lambert(r1, r2, tof * DAY, MU_SUN)
            if s is None: continue
            vi = np.linalg.norm(s[0] - v1p); va = np.linalg.norm(s[1] - v2p)
            dv = departure_dv(vi, PLANETS[origin][1], Rp)
            if capture:
                dv += arrival(dest, va, opts.get("arrival_mode", "auto"), opts.get("max_entry"),
                              opts.get("capture_peri_alt"), opts.get("capture_ecc"))["dv"]
            DV[j, i] = dv; C3[j, i] = vi * vi; VA[j, i] = va
    return L, T, DV, C3, VA

def plot(origin, dest, L, T, DV, path, vmax=None, title_extra=""):
    ld = [date_from_jd(x) for x in L]
    fig, ax = plt.subplots(figsize=(10, 7))
    finite = DV[np.isfinite(DV)]
    lo = np.nanmin(finite); vmax = vmax or min(np.nanpercentile(finite, 60), lo * 2.5)
    lv = np.linspace(lo, vmax, 25)
    cs = ax.contourf(ld, T, np.clip(DV, None, vmax), levels=lv, cmap="viridis_r")
    ax.contour(ld, T, DV, levels=lv[::3], colors="k", linewidths=0.4)
    fig.colorbar(cs, label="total delta-v (LEO departure + capture) [km/s]")
    j, i = np.unravel_index(np.nanargmin(DV), DV.shape)
    ax.plot(ld[i], T[j], "r*", ms=14, label=f"min {DV[j,i]:.2f} km/s, {ld[i]:%Y-%m-%d}, TOF {T[j]:.0f} d")
    ax.legend(loc="upper right"); ax.set_xlabel("launch date"); ax.set_ylabel("time of flight [days]")
    ax.set_title(f"Porkchop {origin.title()} -> {dest.title()} (direct Lambert, 0-rev){title_extra}")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m")); fig.autofmt_xdate()
    fig.tight_layout(); fig.savefig(path, dpi=120); plt.close(fig)
    return DV[j, i], L[i], T[j]

def windows(origin, dest, L, T, DV, max_ratio=2.0):
    """Best direct transfer in each launch window (synodic-period separated local minima)."""
    from .mga import hohmann_days
    import math
    from .ephem import state
    from .constants import MU_SUN, DAY
    a1 = np.linalg.norm(state(origin, 2451545.0)[0]); a2 = np.linalg.norm(state(dest, 2451545.0)[0])
    P1 = 2*math.pi*math.sqrt(a1**3/MU_SUN)/DAY; P2 = 2*math.pi*math.sqrt(a2**3/MU_SUN)/DAY
    syn = abs(1/(1/P1 - 1/P2))
    col = np.nanmin(np.where(np.isfinite(DV), DV, np.inf), axis=0)
    gmin = col.min(); order = np.argsort(col); picked = []
    for i in order:
        if not np.isfinite(col[i]) or col[i] > max_ratio * gmin: break
        if all(abs(L[i] - L[k]) > 0.6 * syn for k in picked): picked.append(i)
    out = []
    for i in sorted(picked):
        j = int(np.nanargmin(np.where(np.isfinite(DV[:, i]), DV[:, i], np.inf)))
        out.append((L[i], T[j], DV[j, i]))
    return out, syn
