"""Physical constants and planet data. Sources: IAU/JPL standard values."""
import math
MU_SUN = 1.32712440018e11  # km^3/s^2
AU = 1.495978707e8         # km
G0 = 9.80665e-3            # km/s^2
DAY = 86400.0

# name: (NAIF barycenter id, mu km^3/s^2, mean radius km, has_atmosphere,
#        default min safe flyby altitude km (ESTIMATE / planning margin))
PLANETS = {
    "mercury": (1, 22031.868, 2439.4, False, 200.0),
    "venus":   (2, 324858.59, 6051.8, True, 300.0),
    "earth":   (3, 398600.435, 6371.0, True, 300.0),
    "mars":    (4, 42828.375, 3389.5, True, 200.0),
    "jupiter": (5, 126712764.1, 69911.0, True, 2.0 * 69911.0),  # ~3 Rj periapsis floor
    "saturn":  (6, 37940584.8, 58232.0, True, 1.5 * 58232.0),   # ring clearance-ish
    "uranus":  (7, 5794556.4, 25362.0, True, 0.5 * 25362.0),
    "neptune": (8, 6836527.1, 24622.0, True, 0.5 * 24622.0),
}
ABBR = {"me": "mercury", "v": "venus", "e": "earth", "m": "mars", "j": "jupiter",
        "s": "saturn", "u": "uranus", "n": "neptune"}
LETTER = {v: k.upper() if len(k) == 1 else "Me" for k, v in ABBR.items()}
ORDER = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"]
OBLIQUITY = math.radians(84381.448 / 3600.0)  # IAU 1976 J2000 obliquity, as used by JPL Horizons "ecliptic of J2000"
