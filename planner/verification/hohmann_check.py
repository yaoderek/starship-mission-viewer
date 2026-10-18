"""Hohmann check vs Wikipedia 'Hohmann transfer orbit' interplanetary table (circular coplanar orbits,
300 km LEO): https://en.wikipedia.org/wiki/Hohmann_transfer_orbit#Application_to_interplanetary_travel"""
import sys, math, json; sys.path.insert(0, ".")
from starship.constants import MU_SUN, AU
from starship.maneuvers import departure_dv
REF = {"mercury": (0.39, 7.474, 5.509), "venus": (0.72, 2.532, 3.491), "mars": (1.52, 2.929, 3.590), "jupiter": (5.2, 8.792, 6.301),
       "saturn": (9.54, 10.290, 7.285), "uranus": (19.19, 11.282, 7.984), "neptune": (30.07, 11.655, 8.251)}
rows = []
r1 = 1.0 * AU
for b, (a, vref, leoref) in REF.items():
    r2 = a * AU; at = (r1 + r2) / 2
    vinf = abs(math.sqrt(MU_SUN * (2 / r1 - 1 / at)) - math.sqrt(MU_SUN / r1))
    leo = departure_dv(vinf, mu=398600.4418, r_park=6378.14 + 300)
    tof = math.pi * math.sqrt(at**3 / MU_SUN) / 86400
    rows.append(dict(body=b, vinf=vinf, vref=vref, leo=leo, leoref=leoref, tof_days=tof))
    print(f"{b:8s} vinf {vinf:.3f} ref {vref:.3f} ({(vinf/vref-1)*100:+.2f}%)  LEO dv {leo:.3f} ref {leoref:.3f} ({(leo/leoref-1)*100:+.2f}%)  TOF {tof:.0f} d")
json.dump(rows, open("verification/hohmann.json", "w"), indent=1)
