"""Mission architectures: one-way, round trip (conjunction / opposition class, orbit stay), Mars ISRU extended stay.
Every constant carries its source; ESTIMATE/ASSUMPTION marks values without a direct published figure."""
import math
import numpy as np
from .constants import AU, DAY, MU_SUN, PLANETS
from .ephem import state, date_from_jd
from .lambert import lambert, propagate
from .maneuvers import departure_dv, entry_speed, flyby, propulsive_capture_dv, capture_orbit_defaults

G0 = 9.80665e-3
# ---------------------------------------------------------------- Mars surface segment (sourced)
MARS_ASCENT_LMO = dict(central=4.15, lo=4.10, hi=4.20, src=(
    "4.15 km/s surface->100 km LMO: Mars Sample Return MAV requirements, NTRS 20130013542; 4.2 km/s incl. 20% gravity loss: "
    "Palaszewski 2021, NTRS 20210026187 Table 3; 4.1 km/s commonly cited (Wikipedia delta-v budget)"))
MARS_LANDING = dict(central=0.70, lo=0.67, hi=0.81, src=(
    "Terminal propulsive descent after aero entry: 0.674 km/s (from elliptic orbit) to 0.813 km/s (from 500 km LMO, incl. deorbit), "
    "Palaszewski 2021 NTRS 20210026187 Tables 3-4 (60 t lander, beta ~750 kg/m^2). Starship value is an ESTIMATE in this range."))
MARS_SURFACE_DOSE = dict(rate=0.64, sd=0.12, src="MSL/RAD Gale crater, 0.64 +/- 0.12 mSv/day dose equivalent (Hassler et al. 2014, Science 343:1244797), "
                         "measured Aug 2012-Jun 2013 near solar max; solar-cycle variation of the surface rate is NOT modelled (Guo et al. 2015 show ~+-25%)")
MARS_COLUMN_GCM2 = 21.0   # Gale crater atmospheric column ~21 g/cm^2 (Hassler 2014)
REGOLITH = {0.0: 1.0, 0.5: 67.6 / 121.0, 1.0: 35.0 / 121.0}   # effective-dose ratio under regolith (Geant4, Nucl. Sci. Tech. 2022 33:24 doi 10.1007/s41365-022-00987-2)
REGOLITH_SRC = "Geant4 Mars subsurface effective dose 121 / 67.6 / 35.0 mSv/yr at 0 / 0.5 / 1.0 m (Nucl. Sci. Tech. 2022, doi:10.1007/s41365-022-00987-2)"
DUST_STORM_PERIOD_D = (3.0 * 686.98, 4.0 * 686.98)  # global storms every ~3-4 Mars years (NASA JPL 2018 'perfect storm' release)
DUST_TAU_MAX = 10.8   # Opportunity, 10 Jun 2018 (JPL)
# ---------------------------------------------------------------- ISRU (sourced)
ISRU_KWH_PER_KG = dict(central=13.6, lo=11.2, hi=20.2, src=(
    "Electrical energy per kg LCH4/LO2 incl. water-from-regolith and liquefaction. Kleinhenz & Paz 2017 (AIAA 2017-0423, NTRS 20170001421): "
    "29.7 t in 480 d at 52 kW = 20.2 kWh/kg all-electric, 35 kW with heat recuperation = 13.6 kWh/kg (central). NASA kiloton-ISRU study 2023 "
    "(NTRS 20230017069): ~230 kW for 300 t in 20 months = 11.2 kWh/kg (paper quotes ~11.5 MWh/t). 17 kWh/kg 2011 Sabatier prototype figure cited "
    "for SpaceX (Wikipedia 'SpaceX Mars transportation infrastructure'). Musk IAC 2017 implies 45 GWh / 6600 t = 6.8 kWh/kg (no breakdown; outside range)."))
ISRU_PLANT_KG_PER_KGD = dict(central=27.5, lo=27.5, hi=33.0, src=(
    "Plant hardware mass per kg/day of propellant: Kleinhenz 2017 1.7 t for 61.9 kg/d -> 27.5; kiloton study 3x5.4 t pallets for ~493 kg/d -> 33 "
    "(liquefaction pallets excluded). Linear scaling to SpaceX-scale (~2-3 t/day) is an EXTRAPOLATION."))
POWER_KG_PER_KWE = dict(nuclear=(154.5, 175.0), solar=(280.0, 563.0), src=(
    "Nuclear: Kilopower 10 kWe = 1545 kg (NTRS 20150000526 Table 4); 40 kWe FSP ~7 t (NTRS 20160014032). "
    "Solar: NASA Mars surface power white paper (2025, iparch07) 11.2-22.5 t vs 40 kWe fission-equivalent -> 280-563 kg/kWe, includes storage "
    "for night; global dust storms (tau up to 10.8) can cut output >90% for weeks - not covered by this sizing."))
SPACEX_RETURN_PROP_T = 1100.0   # Musk IAC 2017: ~1100 t methalox per ship for return (validation reference only)
ISRU_MARGIN_D = 30.0            # ASSUMPTION: propellant complete 30 d before departure (as in Starship feasibility study, Sci. Rep. 2024)
RETURN_PAYLOAD_T = 20.0         # ASSUMPTION: crew + samples on return (no published Starship figure)
EARTH_MAX_ENTRY = 12.5          # ESTIMATE (planner default; Stardust 12.9 km/s is the fastest Earth entry flown, Apollo ~11.0)

def isru_plan(prop_t, prod_days, kwh=None, plant=None):
    kwh = kwh or ISRU_KWH_PER_KG; plant = plant or ISRU_PLANT_KG_PER_KGD
    rate = prop_t * 1e3 / max(prod_days, 1.0)            # kg/day
    p = lambda k: rate * k / 24.0                       # kW continuous
    return dict(prop_t=prop_t, prod_days=prod_days, rate_kgd=rate, power_kw=p(kwh["central"]), power_kw_lo=p(kwh["lo"]), power_kw_hi=p(kwh["hi"]),
                energy_mwh=prop_t * kwh["central"], plant_t=rate * plant["central"] / 1e3, plant_t_hi=rate * plant["hi"] / 1e3,
                nuclear_t=(p(kwh["central"]) * POWER_KG_PER_KWE["nuclear"][0] / 1e3, p(kwh["central"]) * POWER_KG_PER_KWE["nuclear"][1] / 1e3),
                solar_t=(p(kwh["central"]) * POWER_KG_PER_KWE["solar"][0] / 1e3, p(kwh["central"]) * POWER_KG_PER_KWE["solar"][1] / 1e3))

# ---------------------------------------------------------------- burns
def depart_orbit_dv(body, vinf, from_surface=False):
    mu, R = PLANETS[body][1], PLANETS[body][2]
    if from_surface:   # ascent to 100 km LMO (sourced, incl. losses) + Oberth burn from there
        return MARS_ASCENT_LMO["central"] + departure_dv(vinf, mu, R + 100.0)
    alt, e = capture_orbit_defaults(body)
    if body == "jupiter": alt = JUP_RT_RP_RJ * R - R
    rp = R + alt
    return math.sqrt(vinf**2 + 2 * mu / rp) - math.sqrt(mu * (1 + e) / rp)
JUP_RT_RP_RJ = 20.0   # round-trip Jupiter capture periapsis (outside Europa; radiation-aware choice, see Pareto)

def earth_return(vinf):
    ve = entry_speed("earth", vinf)
    return ve, max(0.0, ve - EARTH_MAX_ENTRY)   # braking burn near perigee to bring entry speed to the limit

def stack_prop(burns, dry, pays, isp=None):
    """Propellant (t) at the start of a burn sequence with one tank load; pays[i] = payload carried during burn i."""
    c = (isp or ISP) * G0; m = dry + pays[-1]
    for i in reversed(range(len(burns))):
        m *= math.exp(burns[i] / c)
        if i > 0: m += pays[i - 1] - pays[i]
    return m - dry - pays[0]
ISP = 375.0

def lambert_pts(r1, v1, D, T, n=200):
    return [[D + s / DAY, *(propagate(r1, v1, s, MU_SUN)[0] / AU)] for s in np.linspace(0, T * DAY, n)]

def planet_pts(b, a, z, step=4.0):
    ts = np.arange(a, z, step).tolist() + [z]
    return [[t, *(state(b, t)[0] / AU)] for t in ts]

def search_return(body, a0, a1, tofs, from_surface=False, venus=False):
    """Best return departing body in [a0,a1] (JD). Direct Lambert and (optionally) via a powered Venus flyby."""
    deps = np.arange(a0, a1 + 1e-6, 2.0)
    best = None
    for D in deps:
        r1, vp = state(body, D)
        for T in tofs:
            r2, ve = state("earth", D + T); s = lambert(r1, r2, T * DAY, MU_SUN)
            if s is None: continue
            vi = np.linalg.norm(s[0] - vp); va = np.linalg.norm(s[1] - ve)
            ven, brk = earth_return(va); dv = depart_orbit_dv(body, vi, from_surface) + brk
            if best is None or dv < best["dv"]:
                best = dict(dv=dv, D=D, T=T, vinf_dep=vi, vinf_arr=va, v_entry=ven, brake=brk, dv_dep=dv - brk, legs=[(body, "earth", D, T, r1, s[0])], via=None)
    if venus:
        t1s = np.arange(80, 261, 6.0); t2s = np.arange(60, 301, 6.0)
        cache = {}
        for D in deps:
            r1, vp = state(body, D)
            for T1 in t1s:
                rv, vv = state("venus", D + T1); s1 = lambert(r1, rv, T1 * DAY, MU_SUN)
                if s1 is None: continue
                vi = np.linalg.norm(s1[0] - vp); d0 = depart_orbit_dv(body, vi, from_surface)
                if best and d0 > best["dv"]: continue
                vin = s1[1] - vv
                for T2 in t2s:
                    key = (round(D + T1, 3), T2)
                    if key not in cache:
                        re_, vE = state("earth", D + T1 + T2); s2 = lambert(rv, re_, T2 * DAY, MU_SUN)
                        cache[key] = None if s2 is None else (s2[0] - vv, s2[0], np.linalg.norm(s2[1] - vE))
                    c = cache[key]
                    if c is None: continue
                    fb = flyby("venus", vin, c[0]); ven, brk = earth_return(c[2])
                    dv = d0 + fb[0] + brk
                    if dv < best["dv"]:
                        best = dict(dv=dv, D=D, T=T1 + T2, vinf_dep=vi, vinf_arr=c[2], v_entry=ven, brake=brk, dv_dep=d0, dv_flyby=fb[0],
                                    flyby_alt=fb[1] - PLANETS["venus"][2], flyby_jd=D + T1,
                                    legs=[(body, "venus", D, T1, r1, s1[0]), ("venus", "earth", D + T1, T2, rv, c[1])], via="venus")
    return best
