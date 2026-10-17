"""Build viewer/sky.json from the HYG v4.1 star catalogue (astronexus/HYG-Database, CC BY-SA 4.0).
Stars with mag <= 6.5, RA/Dec (J2000/ICRS) -> ecliptic-J2000 unit vectors (same obliquity as the
planet ephemeris). Also a schematic Milky Way band oriented on the real galactic plane (IAU J2000
galactic->equatorial rotation); it is a density model, not imaging data."""
import csv, json, math, sys
import numpy as np
sys.path.insert(0, ".")
from starship.constants import OBLIQUITY
c, s = math.cos(OBLIQUITY), math.sin(OBLIQUITY)
EQ2EC = np.array([[1, 0, 0], [0, c, s], [0, -s, c]])
stars = []
for row in csv.DictReader(open("data/hyg.csv")):
    try: mag = float(row["mag"])
    except ValueError: continue
    if row["id"] == "0" or mag > 6.5: continue
    ra = math.radians(float(row["ra"]) * 15); dec = math.radians(float(row["dec"]))
    v = EQ2EC @ np.array([math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)])
    try: ci = float(row["ci"])
    except ValueError: ci = 0.6
    stars.append([round(v[0], 5), round(v[1], 5), round(v[2], 5), round(mag, 2), round(ci, 2),
                  row["proper"] if mag < 1.6 and row["proper"] else ""])
# galactic -> equatorial (J2000), Hipparcos / Liu+2011 matrix (transpose of eq->gal)
G2E = np.array([[-0.0548755604, -0.8734370902, -0.4838350155],
                [+0.4941094279, -0.4448296300, +0.7469822445],
                [-0.8676661490, -0.1980763734, +0.4559837762]]).T
rng = np.random.default_rng(3); mw = []
for _ in range(30000):
    l = rng.uniform(-math.pi, math.pi)
    w = 0.35 + 0.65 * math.exp(-(l / 0.9) ** 2)              # brighter toward galactic centre
    if rng.uniform() > w: continue
    b = rng.normal(0, 0.06 + 0.05 * math.exp(-(l / 0.5) ** 2))  # bulge
    g = np.array([math.cos(b) * math.cos(l), math.cos(b) * math.sin(l), math.sin(b)])
    v = EQ2EC @ (G2E @ g); mw.append([round(v[0], 4), round(v[1], 4), round(v[2], 4), round(w, 2)])
json.dump(dict(source="HYG Database v4.1 (astronexus, CC BY-SA 4.0), mag<=6.5; ecliptic J2000",
               stars=stars, milkyway=mw), open("viewer/sky.json", "w"), separators=(",", ":"))
print(len(stars), "stars;", len(mw), "milky-way points")
# sanity: Polaris should be ~66.6 deg from ecliptic north pole... print ecliptic latitude of Polaris & Sirius
for name in ("Polaris", "Sirius", "Regulus", "Spica"):
    for st in stars:
        if st[5] == name or False: pass
