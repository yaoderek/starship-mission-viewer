"""3D trajectory plots: plotly HTML + matplotlib PNG."""
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import plotly.graph_objects as go
from .constants import AU, DAY, MU_SUN, LETTER, PLANETS
from .ephem import state
from .lambert import propagate

COL = {"mercury": "gray", "venus": "goldenrod", "earth": "royalblue", "mars": "red",
       "jupiter": "orange", "saturn": "khaki", "uranus": "turquoise", "neptune": "navy"}

def _arcs(d, n=300):
    if d.get("model") == "mga-1dsm":
        from .mga1dsm import sample
        pts = np.array([p[1:] for p in sample(d, n)]) / AU
        k = n // 2 * 2
        return [pts[i * k:(i + 1) * k] for i in range(len(d["seq"]) - 1)]
    arcs = []
    for i, (v1, _) in enumerate(d["legs"]):
        r0 = d["states"][i][0]; tof = d["tofs"][i] * DAY
        pts = np.array([propagate(r0, v1, t, MU_SUN)[0] for t in np.linspace(0, tof, n)])
        arcs.append(pts / AU)
    return arcs

def _orbit(body, t, n=400):
    r, v = state(body, t)
    a = 1 / (2 / np.linalg.norm(r) - np.dot(v, v) / MU_SUN)
    P = 2 * np.pi * np.sqrt(a**3 / MU_SUN)
    return np.array([propagate(r, v, s, MU_SUN)[0] for s in np.linspace(0, P, n)]) / AU

def plot(d, html_path, png_path):
    arcs = _arcs(d); bodies = sorted(set(d["seq"]), key=lambda b: list(PLANETS).index(b))
    fig = go.Figure(); fig.add_trace(go.Scatter3d(x=[0], y=[0], z=[0], mode="markers",
                                    marker=dict(size=6, color="yellow"), name="Sun"))
    for b in bodies:
        o = _orbit(b, d["t0"])
        fig.add_trace(go.Scatter3d(x=o[:, 0], y=o[:, 1], z=o[:, 2], mode="lines",
                                   line=dict(color=COL[b], width=1), name=f"{b} orbit"))
    for i, a in enumerate(arcs):
        fig.add_trace(go.Scatter3d(x=a[:, 0], y=a[:, 1], z=a[:, 2], mode="lines",
                                   line=dict(width=5), name=f"leg {i+1}"))
    for b, t, (r, _) in zip(d["seq"], d["times"], d["states"]):
        from .ephem import date_from_jd
        fig.add_trace(go.Scatter3d(x=[r[0]/AU], y=[r[1]/AU], z=[r[2]/AU], mode="markers+text",
                      marker=dict(size=5, color=COL[b]), text=[f"{LETTER[b]} {date_from_jd(t):%Y-%m-%d}"],
                      name=b))
    fig.update_layout(title=f"{d['name']}  dv={d['dv_total']:.2f} km/s  TOF={d['tof_days']/365.25:.2f} y",
                      scene=dict(aspectmode="data", xaxis_title="x [AU]", yaxis_title="y [AU]",
                                 zaxis_title="z [AU]"))
    fig.write_html(html_path)
    f = plt.figure(figsize=(9, 8)); ax = f.add_subplot(projection="3d")
    ax.scatter([0], [0], [0], c="gold", s=80)
    for b in bodies:
        o = _orbit(b, d["t0"]); ax.plot(o[:, 0], o[:, 1], o[:, 2], c=COL[b], lw=0.6)
    for i, a in enumerate(arcs): ax.plot(a[:, 0], a[:, 1], a[:, 2], lw=2, label=f"leg {i+1}")
    for b, (r, _) in zip(d["seq"], d["states"]):
        ax.scatter([r[0]/AU], [r[1]/AU], [r[2]/AU], c=COL[b], s=30); ax.text(r[0]/AU, r[1]/AU, r[2]/AU, LETTER[b])
    lim = max(np.abs(np.concatenate(arcs)).max(), 1.0)
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_zlim(-lim / 4, lim / 4)
    ax.set_xlabel("x [AU]"); ax.set_ylabel("y [AU]"); ax.view_init(elev=55, azim=-60)
    ax.set_title(f"{d['name']}  launch {d['launch']:%Y-%m-%d}  dv {d['dv_total']:.2f} km/s  TOF {d['tof_days']/365.25:.2f} y")
    ax.legend(); f.tight_layout(); f.savefig(png_path, dpi=110); plt.close(f)
