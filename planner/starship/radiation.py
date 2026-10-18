"""Crew radiation model (ESTIMATES, with sources and stated uncertainty).

Components
 * GCR   : dose-equivalent rate vs solar modulation potential phi (Usoskin/Väisänen 2023 reconstruction),
           calibrated on MSL/RAD cruise (Zeitlin+2013) and LRO/CRaTER Nov-Dec 2022 (Dobynde/Artemis I paper),
           radial gradient 3 %/AU (Gieseler+2016 Ulysses/PAMELA, 2.8-3.6 %/AU). Validated on ExoMars TGO
           Liulin-MO cruise 2016 (held out).
 * Solar activity: observed SSN (NOAA SWPC JSON), NOAA SWPC cycle-25 prediction (quartiles) to 2030-12,
           cycle 26 = empirical mean shape of cycles 19-24 with amplitude drawn from observed cycle maxima
           and start drawn from NOAA's stated 2029-2032 window.  phi(SSN) by lagged linear regression.
 * SPE   : non-homogeneous Poisson process, rate proportional to SSN, calibrated on the 1956-2023 E>30 MeV
           event catalogue (Papaioannou, Zenodo 15083732).  Fluence drawn from that catalogue (bootstrap),
           scaled r^-2..r^-3 (uniform exponent) beyond 1 AU, r^-2 inside.  Dose scaled linearly in Phi30 from
           the August 1972 event (Phi30 = 5e9 cm^-2 in the catalogue) BFO dose equivalent behind Al:
           0.59 Sv @5, 0.22 Sv @10, 0.06 Sv @20 g/cm^2 (Townsend et al., hdl.handle.net/2346/84719).
 * Belts : Earth: Artemis I measured inner+outer belt dose in Orion (Nature 2024); Jupiter: unshielded
           dose rates at Io/Europa/Ganymede/Callisto (Ringwald 2000; order of magnitude only), attenuated
           using Juno's vault factor (1 cm Ti, ~4.5 g/cm^2 -> x1/800, NASA).
All doses are reported as effective-dose proxies in mSv (dose equivalent; for SPE BFO dose equivalent).
"""
import json, math, os
import numpy as np

HERE = os.path.dirname(__file__)
RAD = os.path.join(HERE, "..", "data", "rad")
MSV_LIMITS = dict(career=600.0, bfo_30d=250.0, bfo_1yr=500.0)   # NASA-STD-3001 Vol.1 Rev C
HULL_GCM2 = 0.4 * 8.0          # 4 mm 304L stainless (rho 8.0 g/cm^3) -> 3.2 g/cm^2  (ESTIMATE of hull only)
GCR_RADIAL_GRAD = 0.03         # per AU (Gieseler et al. 2016: 2.8-3.6 %/AU)
SPE_PRE_SHELTER_FRACTION = 0.10  # ASSUMPTION: share of event dose received before crew reaches shelter

def yr_from_jd(jd): return 2000.0 + (np.asarray(jd) - 2451545.0) / 365.25

# ---------------------------------------------------------------- solar activity
class Solar:
    def __init__(self):
        obs = json.load(open(os.path.join(RAD, "observed-solar-cycle-indices.json")))
        self.ot = np.array([int(o["time-tag"][:4]) + (int(o["time-tag"][5:7]) - 0.5) / 12 for o in obs])
        self.ossn = np.array([max(o["ssn"], 0.0) for o in obs])
        k = np.ones(13) / 13; self.osm = np.convolve(self.ossn, k, mode="same")
        pr = json.load(open(os.path.join(RAD, "predicted-solar-cycle.json")))
        self.pt = np.array([int(p["time-tag"][:4]) + (int(p["time-tag"][5:7]) - 0.5) / 12 for p in pr])
        self.pmed = np.array([p["predicted_ssn"] for p in pr])
        self.plo = np.array([p["low75_ssn"] for p in pr]); self.phi_ = np.array([p["high75_ssn"] for p in pr])
        # cycle minima (SILSO): 19..25 starts
        self.minima = [1954.3, 1964.8, 1976.2, 1986.7, 1996.6, 2008.9, 2019.9]
        shapes, amps = [], []
        for a, b in zip(self.minima[:-1], self.minima[1:]):
            m = (self.ot >= a) & (self.ot < b); amps.append(self.osm[m][6:-6].max())
            tt = self.ot[m] - a; shapes.append(np.interp(np.arange(0, 11.5, 1 / 12), tt, self.osm[m] / amps[-1]))
        m = self.ot >= 2019.9; amps.append(self.osm[m][6:-6].max())   # cycle 25 (complete enough: max Oct 2024)
        self.cycle_max = amps; self.shape = np.mean(shapes, 0); self.shape_t = np.arange(0, 11.5, 1 / 12)
        self.c26_start = (2029.0, 2032.0)       # NOAA SWPC: "Solar Cycle 26 expected to begin Jan 2029 - Dec 2032"
        self._fit_phi()

    def _fit_phi(self):
        ph = np.genfromtxt(os.path.join(RAD, "phi_monthly.csv"), delimiter=";", skip_header=1)
        t, p = ph[:, 2] + 1 / 24, ph[:, 3]
        best = None
        for lag in range(0, 25):
            s = np.interp(t - lag / 12, self.ot, self.osm)
            A = np.vstack([np.ones_like(s), s]).T; c, *_ = np.linalg.lstsq(A, p, rcond=None)
            r = p - A @ c; sse = float(r @ r)
            if best is None or sse < best[0]: best = (sse, lag, c, r)
        sse, lag, c, r = best
        self.phi_lag, self.phi_a, self.phi_b = lag / 12, c[0], c[1]
        self.phi_sigma = float(np.std(r)); self.phi_r2 = 1 - sse / float(((p - p.mean())**2).sum())
        self.phi_t, self.phi_obs = t, p

    def ssn(self, yr, draw=None):
        """Monthly SSN at fractional years.  draw=None -> median; else dict(amp, start, q) for MC."""
        yr = np.atleast_1d(yr).astype(float); out = np.empty_like(yr)
        q = 0.0 if draw is None else draw["q"]
        amp = np.median(self.cycle_max[-4:]) if draw is None else draw["amp"]
        st = np.mean(self.c26_start) if draw is None else draw["start"]
        for i, y in enumerate(yr):
            if y <= self.ot[-1]: v = np.interp(y, self.ot, self.ossn)
            elif y <= self.pt[-1]:
                med = np.interp(y, self.pt, self.pmed)
                v = med + q * (np.interp(y, self.pt, self.phi_) - med if q > 0 else med - np.interp(y, self.pt, self.plo))
            else: v = 0.0
            if y > st: v = max(v, amp * np.interp(y - st, self.shape_t, self.shape, right=self.shape[-1]))
            out[i] = max(v, 0.0)
        return out

    def phi(self, yr, draw=None):
        s = self.ssn(np.atleast_1d(yr) - self.phi_lag, draw)
        k = np.ones(13) / 13
        return self.phi_a + self.phi_b * s

    def draw(self, rng):
        return dict(amp=float(rng.choice(self.cycle_max)), start=float(rng.uniform(*self.c26_start)),
                    q=float(rng.uniform(-1, 1)))

SOLAR = None
def solar():
    global SOLAR
    if SOLAR is None: SOLAR = Solar()
    return SOLAR

# ---------------------------------------------------------------- GCR
# Calibration (fit): solar-cycle slope from LRO/CRaTER free-space Si dose 318 uGy/d (2009/10 minimum) vs
# 156 uGy/d (2013/14 maximum) -- Case et al. 2016 Space Weather, https://doi.org/10.1002/2015SW001314 ;
# amplitude from MSL/RAD cruise 1.84 +- 0.30 mSv/d (Dec 2011-Jul 2012), Zeitlin et al. 2013 Science.
CRATER_SLOPE = [((2009.5, 2010.5), 318.0), ((2013.5, 2014.5), 156.0)]
RAD_CAL = ((2011.93, 2012.54), 1.84, 0.30)
GCR_VAL = [("ExoMars TGO Liulin-MO cruise", (2016.31, 2016.71), 2.00, 0.40, None,
            "Semkova et al. 2018 Icarus 303:53 (1.97/2.04 +-0.4 mSv/d, ~10 g/cm^2) https://ui.adsabs.harvard.edu/abs/2018Icar..303...53S"),
           ("LRO/CRaTER, Artemis I period", (2022.87, 2022.95), 1.55, 0.31, None,
            "quoted in Artemis I paper, Nature 2024 https://www.nature.com/articles/s41586-024-07927-7"),
           ("Orion HERA, Artemis I (heavier shielding)", (2022.87, 2022.95), 1.10, 0.14, 0.7,
            "Artemis I HERA 0.96-1.24 mSv/d, Nature 2024; tests the -30%/+80% shielding factor"),]

class GCR:
    def __init__(self):
        S = solar()
        def ph(win):   # measured phi where available (Oulu, to 2021), regression beyond
            a, b = win; m = (S.phi_t >= a) & (S.phi_t < b)
            return float(S.phi_obs[m].mean()) if m.sum() >= 3 else float(np.mean(S.phi(np.linspace(a, b, 6))))
        self.ph = ph
        (w1, d1), (w2, d2) = CRATER_SLOPE
        self.phi_min, self.phi_max = ph(w1), ph(w2)
        self.inv_phi0 = math.log(d1 / d2) / (self.phi_max - self.phi_min); self.phi0 = 1 / self.inv_phi0
        self.phi_rad = ph(RAD_CAL[0])
        self.c0 = math.log(RAD_CAL[1]) + self.inv_phi0 * self.phi_rad
    def rate(self, phi, r_au, shield_factor=1.0):
        """mSv/day inside a lightly shielded cabin (RAD-like, roughly <10-20 g/cm^2)."""
        return np.exp(self.c0 - self.inv_phi0 * np.asarray(phi)) * (1 + GCR_RADIAL_GRAD * (np.asarray(r_au) - 1)) * shield_factor
    def validate(self):
        out = []
        for name, win, h, sig, f, src in GCR_VAL:
            p = self.ph(win); pred = float(self.rate(p, 1.0, f or 1.0))
            out.append(dict(name=name, phi=p, pred=pred, meas=h, sigma=sig, err=(pred - h) / h,
                            pass_=abs(pred - h) <= 2 * sig if f is None else abs(pred - h) <= max(2 * sig, 0.3 * h), source=src))
        return out

# Orion/Artemis I: ~30 % lower dose equivalent for ~80 % more shielding mass (Nature 2024).  Starship cabin is
# treated as RAD-equivalent (factor 1.0, +-30 %).
STARSHIP_GCR_FACTOR = (1.0, 0.3)

# ---------------------------------------------------------------- SPE
D72 = np.array([[5.0, 590.0], [10.0, 220.0], [20.0, 60.0]])   # g/cm^2 Al, BFO dose equivalent mSv (Aug 1972)
PHI30_1972 = 5.0e9
def d72(x):
    """BFO dose equivalent (mSv) of the Aug-1972 event behind x g/cm^2 (log-linear, extrapolated outside 5-20)."""
    lx, ly = D72[:, 0], np.log(D72[:, 1])
    if x < 5: s = (ly[1] - ly[0]) / 5.0; return float(np.exp(ly[0] + s * (x - 5)))
    if x > 20: s = (ly[2] - ly[1]) / 10.0; return float(np.exp(ly[2] + s * (x - 20)))
    return float(np.exp(np.interp(x, lx, ly)))

class SPE:
    THRESH = 1e7
    def __init__(self):
        S = solar()
        ev = json.load(open(os.path.join(RAD, "sep_e30_catalog.json")))
        self.ev = [(y + (m - 0.5) / 12, f) for y, m, d, f in ev if f >= self.THRESH]
        self.flu = np.array([f for _, f in self.ev])
        t = np.arange(1956.0, 2024.0, 1 / 12)
        integ = float(np.sum(S.ssn(t)) / 12)                  # SSN-years
        self.k = len(self.ev) / integ                       # events per (SSN * year)
        self.per_cycle = []
        for a, b in zip(S.minima[:-1] + [2019.9], S.minima[1:] + [2024.0]):
            if b <= 1956: continue
            a2 = max(a, 1956.0); tt = np.arange(a2, b, 1 / 12)
            self.per_cycle.append((a, b, int(sum(1 for y, _ in self.ev if a2 <= y < b)), float(self.k * S.ssn(tt).sum() / 12)))
    def event_dose(self, phi30, r, x_gcm2, alpha):
        return d72(x_gcm2) * phi30 / PHI30_1972 * r ** (-alpha)

def rp_dist(): pass

# ---------------------------------------------------------------- trapped belts
EARTH_BELT = dict(central=4.0, lo=2.0, hi=8.0,
    note="Artemis I phantom front skin inner+outer belt absorbed 1.96+0.11 mGy (Nature 2024 Table 1); "
         "x Q~1-2 and x~2 for lighter (wall-like) shielding -> 2-8 mSv per transit")
JUP_MOONS = np.array([[5.9, 36000.0], [9.4, 5400.0], [15.0, 80.0], [26.3, 0.1]])  # Rj, mSv/day unshielded (Ringwald 2000)
JUNO_VAULT = (4.5, 800.0)  # g/cm^2 Ti (1 cm), attenuation factor (NASA)
def jupiter_rate(r_rj, x_gcm2):
    """mSv/day behind x g/cm^2; order of magnitude only (x/÷10)."""
    lr = np.interp(r_rj, JUP_MOONS[:, 0], np.log10(JUP_MOONS[:, 1]), left=np.log10(JUP_MOONS[0, 1]), right=-np.inf)
    if r_rj > 26.3: lr = np.log10(0.1) - 0.5 * (r_rj - 26.3)   # steep fall-off beyond Callisto (assumed)
    # no credit beyond the Juno-vault thickness (bremsstrahlung/high-energy tail not modelled)
    return 10 ** lr * JUNO_VAULT[1] ** (-min(x_gcm2, JUNO_VAULT[0]) / JUNO_VAULT[0])

def hyperbola_pass_dose(rp_km, vinf, mu, R, rate_fn, rmax_R=60.0, e_orbit=None):
    """Integrate dose over a hyperbolic (or capture-to-ellipse) pass from rmax inbound to rmax outbound."""
    a = -mu / vinf**2; e = 1 - rp_km / a
    tot, dt = 0.0, 600.0
    # sample in true anomaly
    nu_max = math.acos(min(1, max(-1, (a * (1 - e * e) / (rmax_R * R) - 1) / e)))
    nus = np.linspace(-nu_max, nu_max, 4001)
    p = a * (1 - e * e)
    r = p / (1 + e * np.cos(nus)); h = math.sqrt(mu * p)
    dtdnu = r**2 / h
    rates = np.array([rate_fn(ri / R) for ri in r]) / 86400.0
    return float(np.trapezoid(rates * dtdnu, nus))

if __name__ == "__main__":
    S = solar(); G = GCR(); P = SPE()
    print("phi fit", S.phi_lag, S.phi_a, S.phi_b, S.phi_sigma, S.phi_r2, "phi0", G.phi0, G.phi_min, G.phi_max, G.phi_rad)
    for v in G.validate(): print(v)
    print("cycle max", S.cycle_max, "SPE k", P.k, P.per_cycle)
    for y in [2026.8, 2028, 2030, 2032, 2034, 2036, 2038]: print(y, S.ssn([y])[0], S.phi([y])[0], G.rate(S.phi([y])[0], 1.0))

# ---------------------------------------------------------------- mission integration
ARTEMIS_SHELTER_BELT = 134.0 / 287.0
STEEL_AL_EQ = 0.9   # ESTIMATE: proton stopping per g/cm^2 in Fe vs Al (Bethe Z/A ~0.97, plus mean-excitation term)
def _ri(traj, jd):
    t = traj[:, 0]; return np.array([np.interp(jd, t, traj[:, k]) for k in (1, 2, 3)]).T

def spe_rate_k(era="modern"):
    P = SPE()
    if era == "all": return P.k
    S = solar(); t = np.arange(1986.7, 2024.0, 1 / 12)
    n = sum(1 for y, _ in P.ev if y >= 1986.7)
    return n / float(np.sum(S.ssn(t)) / 12)

def belt_events(events):
    """Return list of (jd, mSv_hull, mSv_sheltered_fn(x) , label) for trapped-belt passes."""
    from .constants import PLANETS
    out = []
    for e in events:
        b, typ = e.get("body"), e["type"]
        if typ == "launch" or (typ == "flyby" and b == "earth"):
            alt = _alt(e) if typ == "flyby" else 0
            if typ == "launch" or alt < 40000:
                out.append(dict(jd=e["jd"], body="earth", hull=EARTH_BELT["central"], lo=EARTH_BELT["lo"], hi=EARTH_BELT["hi"],
                                rp_rj=None, label="Van Allen belt transit"))
        if b == "jupiter" and typ in ("flyby", "arrival"):
            mu, R = PLANETS["jupiter"][1], PLANETS["jupiter"][2]
            rp = (R + _alt(e)) if typ == "flyby" else R + PLANETS["jupiter"][4]
            vinf = _vinf(e)
            out.append(dict(jd=e["jd"], body="jupiter", rp_rj=rp / R, vinf=vinf,
                            hull=hyperbola_pass_dose(rp, vinf, mu, R, lambda r: jupiter_rate(r, HULL_GCM2 * STEEL_AL_EQ)),
                            label=f"Jupiter belts, periapsis {rp / R:.1f} Rj"))
    return out

def _alt(e):
    import re
    m = re.search(r"alt (\d+) km", e.get("label", "")); return float(m.group(1)) if m else 0.0
def _vinf(e):
    import re
    m = re.search(r"v∞ ([\d.]+)", e.get("label", "")); return float(m.group(1)) if m else 6.0

def mission_dose(traj, events, shelter_gcm2=20.0, n_mc=2000, seed=1, ndays=None, era="modern", jup_rp_rj=None,
                 stays=None, extra_belts=None):
    """Cumulative dose (mSv) along a trajectory. traj: array [jd, x, y, z] in AU."""
    from .constants import PLANETS
    S, G, P = solar(), GCR(), SPE()
    traj = np.asarray(traj); t0, t1 = traj[0, 0], traj[-1, 0]
    n = int(min(max((t1 - t0) // 1 + 2, 30), 800)); jd = np.linspace(t0, t1, n); dt = np.diff(jd, prepend=jd[0])
    r = np.linalg.norm(_ri(traj, jd), axis=1)
    yr = yr_from_jd(jd)
    rng = np.random.default_rng(seed)
    k = spe_rate_k(era)
    x_hull = HULL_GCM2 * STEEL_AL_EQ; x_sh = x_hull + shelter_gcm2
    D_hull, D_sh = d72(x_hull), d72(x_sh)
    # GCR central + MC band
    phi_c = S.phi(yr); gcr_rate = G.rate(phi_c, r)
    # stays: list of dict(jd0, jd1, kind='surface'|'orbit', rate (mSv/d, surface), rate_sd, d_spe (mSv per Aug-72 at 1 AU), geo (orbit shadow factor))
    surf = np.zeros(n, bool); geo = np.ones(n); srate = np.zeros(n); ssd = 0.0; Dsurf = np.zeros(n)
    for st in (stays or []):
        mk = (jd >= st["jd0"]) & (jd <= st["jd1"])
        if st["kind"] == "surface":
            surf |= mk; srate[mk] = st["rate"]; ssd = st.get("rate_sd", 0.0) / max(st["rate"], 1e-9); Dsurf[mk] = st["d_spe"]
        else: geo[mk] = st.get("geo", 1.0)
    gcr_rate = np.where(surf, srate, gcr_rate * geo)
    surf_cum = np.cumsum(np.where(surf, srate, 0.0) * dt)
    gcr_cum = np.cumsum(gcr_rate * dt)
    gcr_tot = []
    spe_h = np.zeros((n_mc, n)); spe_s = np.zeros((n_mc, n)); big = np.zeros(n)
    flu = P.flu
    for i in range(n_mc):
        dr = S.draw(rng)
        ph = S.phi(yr, dr) + rng.normal(0, S.phi_sigma)
        f = rng.normal(*STARSHIP_GCR_FACTOR) if i else 1.0
        gr = G.rate(ph, r) * max(f, 0.3) * geo
        if surf.any(): gr = np.where(surf, srate * max(rng.normal(1.0, ssd) if i else 1.0, 0.3), gr)
        gcr_tot.append(float(np.sum(gr * dt)))
        lam = k * S.ssn(yr, dr) / 365.25 * dt
        cnt = rng.poisson(lam)
        idx = np.nonzero(cnt)[0]
        for j in idx:
            for _ in range(cnt[j]):
                F = rng.choice(flu); a = rng.uniform(2, 3) if r[j] > 1 else 2.0
                s = F / PHI30_1972 * r[j] ** (-a)
                if surf[j]: spe_h[i, j] += Dsurf[j] * s; spe_s[i, j] += Dsurf[j] * s; continue
                spe_h[i, j] += D_hull * s
                spe_s[i, j] += D_hull * s * SPE_PRE_SHELTER_FRACTION + D_sh * s * (1 - SPE_PRE_SHELTER_FRACTION)
    ch, cs = np.cumsum(spe_h, 1), np.cumsum(spe_s, 1)
    # monthly-forecast: P(>=1 event with Phi30 >= 1e8 at spacecraft) per 30 days (median solar draw)
    lam_c = k * S.ssn(yr) / 365.25
    frac = np.array([np.mean((flu * rj ** (-2.0 if rj <= 1 else 2.5)) >= 1e8) for rj in r])
    p30 = 1 - np.exp(-lam_c * frac * 30)
    belts = belt_events(events)
    if jup_rp_rj is not None:
        for b in belts:
            if b["body"] == "jupiter" and b is belts[-1]:
                mu, R = PLANETS["jupiter"][1], PLANETS["jupiter"][2]
                b["rp_rj"] = jup_rp_rj
                b["hull"] = hyperbola_pass_dose(jup_rp_rj * R, b["vinf"], mu, R, lambda q: jupiter_rate(q, x_hull))
                b["label"] = f"Jupiter belts, periapsis {jup_rp_rj:.1f} Rj"
    for b in belts:
        if b["body"] == "jupiter":
            mu, R = PLANETS["jupiter"][1], PLANETS["jupiter"][2]
            b["sh"] = hyperbola_pass_dose(b["rp_rj"] * R, b["vinf"], mu, R, lambda q: jupiter_rate(q, x_sh))
        else:
            b["sh"] = b["hull"] * ARTEMIS_SHELTER_BELT   # Artemis I: storm-shelter HSU1/wall HSU2 peak 134/287
    belts += list(extra_belts or [])
    belt_h = np.zeros(n); belt_s = np.zeros(n)
    for b in belts:
        j = int(np.clip(np.searchsorted(jd, b["jd"]), 0, n - 1)); belt_h[j] += b["hull"]; belt_s[j] += b["sh"]
    bh, bs = np.cumsum(belt_h), np.cumsum(belt_s)
    tot_h = gcr_cum + bh + ch.mean(0); tot_s = gcr_cum + bs + cs.mean(0)
    # 30-day max window (p95 over MC) for BFO comparison (GCR + SPE + belts)
    def win(arr2, days):
        best = []
        cum = arr2
        for row in cum[: min(400, len(cum))]:
            w = np.interp(jd + days, jd, row, right=row[-1]) - row
            best.append(w.max())
        return float(np.percentile(best, 95))
    full_h = ch + (gcr_cum + bh)[None, :]; full_s = cs + (gcr_cum + bs)[None, :]
    res = dict(
        jd=jd.tolist(), r_au=r.tolist(), gcr_rate=gcr_rate.tolist(),
        gcr_cum=gcr_cum.tolist(), surf_cum=surf_cum.tolist(), belt_cum=bh.tolist(), belt_cum_sh=bs.tolist(),
        spe_mean=ch.mean(0).tolist(), spe_p95=np.percentile(ch, 95, 0).tolist(),
        spe_mean_sh=cs.mean(0).tolist(), spe_p95_sh=np.percentile(cs, 95, 0).tolist(),
        tot_mean=tot_h.tolist(), tot_p95=np.percentile(full_h, 95, 0).tolist(),
        tot_mean_sh=tot_s.tolist(), tot_p95_sh=np.percentile(full_s, 95, 0).tolist(),
        spe_p30=p30.tolist(),
        belts=[dict(jd=b["jd"], body=b["body"], label=b["label"], hull=b["hull"], sheltered=b["sh"],
                    rp_rj=b.get("rp_rj")) for b in belts],
        totals=dict(
            gcr=float(gcr_cum[-1]), gcr_p05=float(np.percentile(gcr_tot, 5)), gcr_p95=float(np.percentile(gcr_tot, 95)),
            belts=float(bh[-1]), belts_sh=float(bs[-1]),
            spe_mean=float(ch[:, -1].mean()), spe_p50=float(np.median(ch[:, -1])), spe_p95=float(np.percentile(ch[:, -1], 95)),
            spe_mean_sh=float(cs[:, -1].mean()), spe_p95_sh=float(np.percentile(cs[:, -1], 95)),
            total_mean=float(tot_h[-1]), total_p95=float(np.percentile(full_h[:, -1], 95)),
            total_mean_sh=float(tot_s[-1]), total_p95_sh=float(np.percentile(full_s[:, -1], 95)),
            p_spe_large=float(np.mean(ch[:, -1] > 100)), win30_p95=win(full_h, 30), win30_p95_sh=win(full_s, 30),
            win365_p95=win(full_h, 365), win365_p95_sh=win(full_s, 365),
            surface=float(surf_cum[-1]), days=float(t1 - t0), shelter_gcm2=shelter_gcm2, hull_gcm2=HULL_GCM2, n_mc=n_mc))
    return res
