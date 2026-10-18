"""Compare our DE440s/jplephem heliocentric ecliptic-J2000 states with JPL Horizons API."""
import json, sys, urllib.request, urllib.parse
import numpy as np
sys.path.insert(0, "."); from starship.ephem import state; from starship.constants import ORDER
CMD = {"mercury": "199", "venus": "299", "earth": "399", "mars": "4", "jupiter": "5", "saturn": "6", "uranus": "7", "neptune": "8"}
EPOCHS = [2447800.5, 2451545.0, 2460600.5, 2462502.5, 2465000.5, 2470000.5]  # 1989-10, J2000, 2024-10, 2030-01, 2036-11, 2050
def horizons(cmd, jd):
    q = dict(format="json", COMMAND=f"'{cmd}'", EPHEM_TYPE="VECTORS", CENTER="'500@10'", REF_PLANE="ECLIPTIC",
             REF_SYSTEM="ICRF", TLIST=f"'{jd}'", VEC_TABLE="2", OUT_UNITS="KM-S", CSV_FORMAT="YES", TIME_TYPE="TDB")
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q)
    r = json.load(urllib.request.urlopen(url, timeout=60))["result"]
    line = r.split("$$SOE")[1].split("$$EOE")[0].strip().split(",")
    v = [float(x) for x in line[2:8]]; return np.array(v[:3]), np.array(v[3:])
rows = []
for b in ORDER:
    for jd in EPOCHS:
        rh, vh = horizons(CMD[b], jd); r, v = state(b, jd)
        dr = np.linalg.norm(r - rh); dv = np.linalg.norm(v - vh)
        rows.append(dict(body=b, jd=jd, dr_km=dr, rel=dr / np.linalg.norm(rh), dv_ms=dv * 1e3))
        print(f"{b:8s} JD {jd}  |dr| {dr:10.3f} km  rel {dr/np.linalg.norm(rh):.2e}  |dv| {dv*1e3:8.5f} m/s", flush=True)
json.dump(rows, open("verification/horizons.json", "w"), indent=1)
