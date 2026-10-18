"""Non-radiation hazard models (ESTIMATES; each item carries its source and basis).

quantitative items give an expected count or probability; qualitative ones give a flag only."""
import math, re
import numpy as np
from .constants import AU, PLANETS
from .ephem import state

# ---------------------------------------------------------------- vehicle geometry (ESTIMATE)
SHIP_LEN_M, SHIP_DIAM_M = 52.0, 9.0          # SpaceX published height ~52 m (V3 ~ 52 m) and 9 m diameter
SHIP_SURF_M2 = math.pi * SHIP_DIAM_M * SHIP_LEN_M + 2 * math.pi * (SHIP_DIAM_M / 2) ** 2
SHIP_AREA_M2 = SHIP_SURF_M2 / 4               # mean projected area of a randomly oriented convex body (Cauchy)

# ---------------------------------------------------------------- orbital debris (ORDEM 3.0, 2029 projection)
# Derived from Table 1 of "Characterizing the Orbital Debris Environment Using Satellite Perturbation Anomaly Data"
# (1st Int. Orbital Debris Conf. 2019, paper 6065): impacts/yr on 1 m^2 bodies / number of satellites.
ORDEM_340KM = {"1mm": 211 / 7518, "3mm": 0.1 / 7518, "1cm": 0.009 / 7518}     # per m^2 per yr
ORDEM_550KM = {"1mm": 28 / 140, "3mm": 0.1 / 140, "1cm": 0.004 / 140}
ORDEM_SRC = "https://www.hou.usra.edu/meetings/orbitaldebris2019/orbital2019paper/pdf/6065.pdf (ORDEM 3.0, yr 2029)"
TANKER_CADENCE_D = (3.0, 7.0, 14.0)           # ASSUMPTION: days between tanker dockings (no published figure)

def debris_loiter(n_tankers, cadence_d=7.0, table=ORDEM_340KM):
    days = max(n_tankers, 0) * cadence_d + 3.0
    out = {}
    for k, f in table.items():
        N = f * SHIP_AREA_M2 * days / 365.25; out[k] = dict(expected=N, p_ge1=1 - math.exp(-N))
    return days, out

# ---------------------------------------------------------------- micrometeoroids (Grün et al. 1985)
def grun_flux(m_g):
    """Cumulative interplanetary meteoroid flux at 1 AU, particles m^-2 s^-1, mass >= m (g). Grün et al. 1985,
    Icarus 62:244, constants as listed in NASA MEM 3 documentation (NTRS 20200000563)."""
    c4, c5, c6, c7, c8, c9, c10 = 2.2e3, 15.0, 1.3e-9, 1e11, 1e27, 1.3e-16, 1e6
    return ((c4 * m_g ** 0.306 + c5) ** -4.38 + c6 * (m_g + c7 * m_g ** 2 + c8 * m_g ** 4) ** -0.36
            + c9 * (m_g + c10 * m_g ** 2) ** -0.85)
MM_R_EXP = 1.3   # spatial density ~ r^-1.3 (Leinert et al. 1981, Helios zodiacal light); applied to flux (ESTIMATE)

def micrometeoroids(jd, r_au, masses=(1e-6, 1e-4, 1e-3)):
    dt = np.diff(jd, prepend=jd[0]) * 86400.0
    w = np.sum(dt * np.asarray(r_au) ** -MM_R_EXP)
    return {m: grun_flux(m) * SHIP_AREA_M2 * w for m in masses}

# ---------------------------------------------------------------- asteroid belt
N_AST_1KM = 1.2e6   # Tedesco & Desert 2002, AJ 124:2070 (ISO deep survey): ~1.2 (±0.5) million asteroids D>1 km
def asteroid_belt(jd, r_au, v_rel_kms=5.0):
    inb = (np.asarray(r_au) > 2.1) & (np.asarray(r_au) < 3.3)
    days = float(np.sum(np.diff(jd, prepend=jd[0])[inb]))
    vol_km3 = math.pi * (3.3**2 - 2.1**2) * 2 * 2.7 * math.sin(math.radians(10)) * AU**3   # torus, +-10 deg
    n = N_AST_1KM / vol_km3; sigma = math.pi * 0.53**2
    return days, n * sigma * v_rel_kms * days * 86400

# ---------------------------------------------------------------- rings (qualitative)
RINGS = {"jupiter": (1.4, 3.2, "faint gossamer/main rings (Galileo, Juno)"),
         "saturn": (1.11, 8.0, "D-ring to E-ring; Voyager 2 ring-plane crossing at 2.88 Rs recorded many dust impacts"),
         "uranus": (1.6, 2.0, "narrow rings (6-epsilon) 1.6-2.0 Ru"),
         "neptune": (1.7, 2.54, "Galle-Adams rings 1.7-2.54 Rn")}

# ---------------------------------------------------------------- aerocapture
ATM = {"mars": (0.020, 11.1e3, 1.9027e-4), "venus": (65.0, 15.9e3, 1.896e-4), "earth": (1.217, 8.5e3, 1.7415e-4)}
# rho0 kg/m^3, H m (NASA NSSDC planetary fact sheets); Sutton-Graves k (SI) (Sutton & Graves 1971, NASA TR R-376)
SHIP_ENTRY = dict(mass=220e3, CdA=1.6 * SHIP_LEN_M * SHIP_DIAM_M, LD=0.3, rn=SHIP_DIAM_M / 2)   # ALL ESTIMATES

def _fly(body, v0, gam0, ld):
    rho0, H, k = ATM[body]; mu = PLANETS[body][1] * 1e9; R = PLANETS[body][2] * 1e3
    r, v, g = R + 125e3 if body == "mars" else R + (150e3 if body == "venus" else 120e3), v0, math.radians(gam0)
    rtop = r; m, CdA, rn = SHIP_ENTRY["mass"], SHIP_ENTRY["CdA"], SHIP_ENTRY["rn"]
    gmax = qmax = 0.0; dt = 0.25; t = 0
    while t < 4000:
        rho = rho0 * math.exp(-(r - R) / H); D = 0.5 * rho * v * v * CdA / m; L = ld * D
        gr = mu / r**2
        dv = -D - gr * math.sin(g); dg = (L / v) - (gr / v - v / r) * math.cos(g)
        v += dv * dt; g += dg * dt; r += v * math.sin(g) * dt; t += dt
        gmax = max(gmax, math.hypot(D, L) / 9.80665); qmax = max(qmax, k * math.sqrt(rho / rn) * v**3)
        if r < R + 5e3: return dict(result="impact", gmax=gmax, qmax=qmax)
        if r > rtop and g > 0:
            eps = v * v / 2 - mu / r
            if eps >= 0: return dict(result="escape", gmax=gmax, qmax=qmax)
            a = -mu / (2 * eps); h = r * v * math.cos(g); e = math.sqrt(max(0, 1 - h * h / (mu * a)))
            return dict(result="capture", ra_km=(a * (1 + e) - R) / 1e3, gmax=gmax, qmax=qmax)
    return dict(result="timeout", gmax=gmax, qmax=qmax)

def aerocapture(body, v_entry_kms):
    v0 = v_entry_kms * 1e3
    def corridor(ld):
        lo, hi = -1.0, -25.0   # shallow / steep
        # find steepest non-impact and shallowest capture via scan
        ok = []
        for gm in np.arange(-0.5, -20.0, -0.25):
            r = _fly(body, v0, gm, ld)
            if r["result"] == "capture": ok.append((gm, r))
        return ok
    up, dn = corridor(+SHIP_ENTRY["LD"]), corridor(-SHIP_ENTRY["LD"])
    allg = [g for g, _ in up] + [g for g, _ in dn]
    if not allg: return dict(feasible=False)
    worst = max([r for _, r in up + dn], key=lambda r: r["gmax"])
    mid = sorted(up + dn, key=lambda x: x[1]["gmax"])[len(up + dn) // 2][1]
    return dict(feasible=True, corridor_deg=(min(allg), max(allg)), width_deg=max(allg) - min(allg),
                gmax_typ=mid["gmax"], qmax_typ_wcm2=mid["qmax"] / 1e4, gmax_worst=worst["gmax"], qmax_worst_wcm2=worst["qmax"] / 1e4)

# ---------------------------------------------------------------- comms / conjunction
C_KMS = 299792.458
def comms(jd, xyz_au):
    lt, sep = [], []
    for t, p in zip(jd, xyz_au):
        e = state("earth", t)[0] / AU; d = np.asarray(p) - e
        lt.append(np.linalg.norm(d) * AU / C_KMS / 60.0)
        nd = np.linalg.norm(d)
        if nd < 2e-3: sep.append(180.0); continue   # at/near Earth: no conjunction
        c = np.dot(-e, d) / (np.linalg.norm(e) * nd); sep.append(math.degrees(math.acos(max(-1, min(1, c)))))
    return np.array(lt), np.array(sep)

# ---------------------------------------------------------------- consumables (NASA BVAD)
BVAD = dict(o2=0.84, food=2.39, water=1.62)   # kg/crew-day (O2, packaged ISS food, drinking water) - BVAD 2022
BVAD_SRC = "NASA Life Support BVAD, NTRS 20210024855 https://ntrs.nasa.gov/api/citations/20210024855/downloads/BVAD_2.15.22-final.pdf"
LONGEST_FLIGHT_D = 437   # V. Polyakov, Mir 1994-95

def mission_hazards(m, rad, n_crew=12):
    traj = np.asarray(m["traj"]); jd = np.asarray(rad["jd"]); r = np.asarray(rad["r_au"])
    xyz = np.array([np.interp(jd, traj[:, 0], traj[:, k]) for k in (1, 2, 3)]).T
    S = m["summary"]; out = []
    def add(**k): out.append(k)
    nt = S.get("tankers_needed") or 0
    days, d = debris_loiter(nt)
    add(id="debris", cat="LEO loiter", title=f"Orbital debris during refuelling ({nt} refuel mission{'' if nt == 1 else 's'}, {days:.0f} d @7 d cadence, ~340 km)",
        value=d["1mm"]["expected"], unit="expected >=1 mm hits", prob=d["1cm"]["p_ge1"], prob_label="P(>=1 cm hit)",
        level="MED" if d["1mm"]["expected"] > 1 else "LOW", basis="quantitative", jd0=jd[0] - days, jd1=jd[0],
        note=f">=3 mm: {d['3mm']['expected']:.2g} expected (may perforate a 4 mm wall without Whipple shielding — qualitative). "
             f"Area {SHIP_AREA_M2:.0f} m^2 (random tumble). Cadence 3/14 d gives x{3/7:.2f}/x{2:.0f}.", source=ORDEM_SRC)
    mm = micrometeoroids(jd, r)
    add(id="mmod", cat="Cruise", title="Micrometeoroid impacts in cruise (Grün 1985, r^-1.3)", value=mm[1e-6], unit="expected hits >=1e-6 g (~100 um)",
        prob=1 - math.exp(-mm[1e-3]), prob_label="P(>=1 hit >=1 mg, ~1 mm)", level="MED" if mm[1e-3] > 0.1 else "LOW", basis="quantitative",
        note=f">=1e-4 g: {mm[1e-4]:.2g}; >=1e-3 g: {mm[1e-3]:.2g}. Beyond ~5 AU the r^-1.3 law is an extrapolation.",
        source="Grün et al. 1985 Icarus 62:244; constants per NASA MEM 3 (NTRS 20200000563)")
    bd, pb = asteroid_belt(jd, r)
    if bd > 0:
        add(id="belt", cat="Cruise", title=f"Asteroid-belt crossing ({bd:.0f} d between 2.1-3.3 AU)", value=pb, unit="P(collision with D>1 km body)",
            prob=pb, prob_label="P(collision)", level="LOW", basis="quantitative",
            note="Uniform-torus estimate; smaller bodies raise this by orders of magnitude but remain < 1e-6.",
            source="Tedesco & Desert 2002 AJ 124:2070 (1.2e6 asteroids D>1 km)")
    for e in m["events"]:
        b = e.get("body")
        if b in RINGS and e["type"] in ("flyby", "arrival"):
            R = PLANETS[b][2]
            mt = re.search(r"alt (\d+) km", e["label"]); alt = float(mt.group(1)) if mt else PLANETS[b][4]
            rp = (R + alt) / R; lo, hi, txt = RINGS[b]
            mr = re.search(r"periapsis ([\d.]+) Rj", e["label"])
            if mr: rp = float(mr.group(1))
            add(id="ring-" + b, cat="Arrival" if e["type"] == "arrival" else "Flyby", title=f"{b.title()} ring-plane crossing (periapsis {rp:.1f} R)",
                value=rp, unit="R_planet", prob=None, level="HIGH" if lo <= rp <= hi * 1.2 else "MED", basis="qualitative",
                note=f"Rings/dust {lo}-{hi} R: {txt}. Crossing location depends on approach geometry (not modelled).", jd0=e["jd"], jd1=e["jd"],
                source="NASA planetary ring fact sheets; Voyager/Cassini")
    arr = [e for e in m["events"] if e["type"] == "arrival"]
    if arr and S.get("capture") == "aero":
        b = arr[0]["body"]; mt = re.search(r"v∞ ([\d.]+)", arr[0]["label"]); vinf = float(mt.group(1))
        from .maneuvers import entry_speed
        ve = entry_speed(b, vinf); ac = aerocapture(b, ve)
        if ac.get("feasible"):
            add(id="aero", cat="Arrival", title=f"{b.title()} aerocapture at {ve:.2f} km/s", value=ac["gmax_typ"], unit="peak g (mid-corridor)",
                prob=None, level="HIGH" if ac["gmax_worst"] > 5 or ac["width_deg"] < 1 else "MED", basis="quantitative (ESTIMATE)",
                jd0=arr[0]["jd"], jd1=arr[0]["jd"],
                note=f"Entry corridor {ac['corridor_deg'][1]:.2f} to {ac['corridor_deg'][0]:.2f} deg (width {ac['width_deg']:.2f} deg). Peak convective heat "
                     f"~{ac['qmax_typ_wcm2']:.0f} W/cm^2 (worst {ac['qmax_worst_wcm2']:.0f}); worst-edge {ac['gmax_worst']:.1f} g. Exponential atmosphere, "
                     f"beta={SHIP_ENTRY['mass']/SHIP_ENTRY['CdA']:.0f} kg/m^2, L/D {SHIP_ENTRY['LD']}, rn {SHIP_ENTRY['rn']} m: ALL ESTIMATES; radiative heating not modelled. "
                     "Never demonstrated for Starship.", source="Sutton & Graves 1971 NASA TR R-376; NSSDC fact sheets")
        else:
            add(id="aero", cat="Arrival", title=f"{b.title()} aerocapture at {ve:.2f} km/s", value=0, unit="", prob=None, level="HIGH",
                basis="quantitative (ESTIMATE)", note="no capture corridor found with this vehicle model", source="")
    lt, sep = comms(jd, xyz)
    dt = np.diff(jd, prepend=jd[0]); blk = float(np.sum(dt[sep < 2.0])); deg = float(np.sum(dt[(sep < 5.0)]))
    k = np.nonzero(sep < 2.0)[0]
    add(id="comms", cat="Ops", title="Comms delay and solar conjunction", value=float(lt.max()), unit="max one-way light time (min)",
        prob=None, level="HIGH" if blk > 0 else ("MED" if lt.max() > 20 else "LOW"), basis="quantitative",
        jd0=float(jd[k[0]]) if len(k) else None, jd1=float(jd[k[-1]]) if len(k) else None,
        note=f"Round trip up to {2*lt.max():.0f} min. {blk:.0f} d with Sun-Earth-probe angle <2 deg (typical blackout), {deg:.0f} d <5 deg (degraded).",
        source="geometry from DE440s; 2-deg conjunction practice per NASA Mars missions", series=dict(lt=lt.tolist(), sep=sep.tolist()))
    dur = rad["totals"]["days"]; kgd = sum(BVAD.values())
    add(id="eclss", cat="Ops", title=f"Duration {dur:.0f} d: consumables & life support", value=dur, unit="days",
        prob=None, level="HIGH" if dur > LONGEST_FLIGHT_D else "MED", basis="qualitative",
        note=f"Open-loop O2+food+water {kgd:.2f} kg/crew-day (BVAD) -> {kgd*dur*n_crew/1000:.1f} t for {n_crew} crew one-way (before recycling). "
             f"Longest human spaceflight to date: {LONGEST_FLIGHT_D} d. No resupply or abort return possible after departure.", source=BVAD_SRC)
    for e in m["events"]:
        if e["type"] == "flyby" and e.get("hazard"):
            add(id="flyby-" + e["body"], cat="Flyby", title=e["label"], value=None, unit="", prob=None, level="MED", basis="qualitative",
                jd0=e["jd"], jd1=e["jd"], note="Low flyby altitude: navigation dispersion margin is small (planner floor).", source="")
    return out
