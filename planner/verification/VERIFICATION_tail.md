
## Notes on the mismatches (honest reading)

* **Trajectory Browser "injection C3" is ~0.9 km²/s² lower than ours for every direct case.** At identical dates our
  Lambert v∞ agrees with TB's *own* heliocentric state at sphere-of-influence exit to 0.2–1.3 %, and propagating TB's
  heliocentric state lands within ~12,000 km of our Mars position. The gap equals 2μ⊕/r_SOI (≈0.86 km²/s² at
  r ≈ 925,000 km), i.e. TB's finite-SOI patched-conic convention, not an ephemeris or Lambert error. Injection Δv
  agrees to ~1 %. The Venus arrival Δv (+13 %) is the largest disagreement; the same SOI convention at arrival is the
  likely cause but this is **not proven**.
* **TB returned gravity-assist routes** for Jupiter (2028) and Uranus (2030) and no result for Mercury/Neptune, so
  those are marked N/A rather than compared.
* **Historical missions:** with the real launch windows our MGA-1DSM optimizer reproduces the flyby *dates* of
  Galileo, Cassini and Juno to within ~1–11 days and launch C3 within 2–12 %, and finds Cassini's 450 m/s
  Venus-targeting DSM almost exactly (453 m/s) — but on the wrong date. It does **not** reproduce the near-zero
  deep-space Δv of Galileo, or Cassini's total (ours 1.6 km/s vs ≈0.57 km/s). Causes: stochastic optimizer not
  fully converged on 22-dimensional problems, no arrival-date constraint equal to the real one, unpowered-flyby
  model without moons/launch-period constraints. Treat gravity-assist Δv numbers from this tool as **upper-bound
  estimates**; launch C3 and dates are more trustworthy.

## Starship model: sourced inputs

| Input | Value used | Public figure / range | Source |
|---|---|---|---|
| Propellant capacity | **1600 t** (was 1500) | 1,600 t (current SpaceX spec); 1,200 t in earlier HLS-era descriptions | [spacex.com/vehicles/starship](https://www.spacex.com/vehicles/starship/technical-specifications); [Payload Space](https://payloadspace.com/spacex-may-test-propellant-transfer-on-next-starship-flight/) |
| Payload | 100 t default, configurable | "100+ t" to LEO | SpaceX site |
| Isp | 375 s | RVac ≈380 s; sea-level Raptor ≈350 s (all-6-engine blend ≈366 s) | [Wikipedia Raptor](https://en.wikipedia.org/wiki/Raptor_vacuum); SpaceX |
| Dry mass | 120 t | **no official figure**; public estimates ~100–150 t | estimate (sensitivity below) |
| Propellant per tanker | 100 t | 100–150 t (NASA estimate as reported) | [Payload Space](https://payloadspace.com/spacex-may-test-propellant-transfer-on-next-starship-flight/) |
| Tanker flights for one lunar HLS mission | — | Musk: 4–8; SpaceX (Jensen): "ten-ish"; NASA (Hawkins): "high teens"; GAO 2021: 16 launches | [Ars Technica 2023](https://arstechnica.com/space/2023/11/what-nasa-wants-to-see-from-spacexs-second-starship-test-flight/2/); [SpaceNews](https://spacenews.com/spacex-targets-february-for-third-starship-test-flight/) |
| Ship-to-ship transfer | — | **not yet demonstrated** (only intra-vehicle transfer on flight test 3) | [Wikipedia: Propellant Transfer Demo](https://en.wikipedia.org/wiki/Starship_Propellant_Transfer_Demonstration) |
| Residual propellant on reaching LEO | 50 t | **unsourced estimate** | — |

Boil-off, depot losses, transfer efficiency, gravity losses and landing propellant are **not modelled**.

### Sensitivity (`verification/starship_sensitivity.py`)
```
rocket-equation re-derivation + refuels_needed round-trip: PASS

Tankers needed (100 t/tanker; 125; 150) vs mission dv and payload; dry 120 t, Isp 375 s, 1600 t capacity, 50 t residual
  payload  20 t  dv 3.7 km/s  tankers [2, 2, 2]
  payload  20 t  dv 5.8 km/s  tankers [5, 4, 4]
  payload  20 t  dv 6.5 km/s  tankers [7, 6, 5]
  payload  20 t  dv 7.5 km/s  tankers [9, 8, 6]
  payload  20 t  dv 8.2 km/s  tankers [12, 9, 8]
  payload  50 t  dv 3.7 km/s  tankers [3, 2, 2]
  payload  50 t  dv 5.8 km/s  tankers [7, 5, 5]
  payload  50 t  dv 6.5 km/s  tankers [8, 7, 6]
  payload  50 t  dv 7.5 km/s  tankers [11, 9, 8]
  payload  50 t  dv 8.2 km/s  tankers [14, 11, 10]
  payload 100 t  dv 3.7 km/s  tankers [4, 3, 3]
  payload 100 t  dv 5.8 km/s  tankers [8, 7, 6]
  payload 100 t  dv 6.5 km/s  tankers [11, 9, 7]
  payload 100 t  dv 7.5 km/s  tankers [15, 12, 10]
  payload 100 t  dv 8.2 km/s  tankers ['-', '-', '-']
  payload 150 t  dv 3.7 km/s  tankers [5, 4, 3]
  payload 150 t  dv 5.8 km/s  tankers [10, 8, 7]
  payload 150 t  dv 6.5 km/s  tankers [13, 11, 9]
  payload 150 t  dv 7.5 km/s  tankers ['-', '-', '-']
  payload 150 t  dv 8.2 km/s  tankers ['-', '-', '-']

Max dv (full 1600 t) by dry mass / Isp, payload 100 t:
  dry 100 Isp366:7.89 Isp375:8.08 Isp380:8.19
  dry 120 Isp366:7.58 Isp375:7.77 Isp380:7.87
  dry 150 Isp366:7.18 Isp375:7.36 Isp380:7.46
```

## Bugs found and fixed

1. **Ecliptic obliquity constant** was 23.43928°; JPL Horizons' "ecliptic of J2000" uses 84381.448″ = 23.4392911°.
   Max position error was ≈870 km at Neptune (velocity ≈6 mm/s). Fixed in `starship/constants.py`; the numba
   ephemeris table was rebuilt. After the fix Horizons agrees to < 1 mm. Effect on any Δv: < 0.01 m/s (no
   trajectory result changes at the reported precision; optimisations were not re-run for this).
2. **Propellant capacity default** 1500 t → 1600 t to match SpaceX's current published spec. Trajectories are
   unaffected; tanker counts were recomputed for all saved results (`recompute_vehicle.py`). Rows that changed:

| Target | Mission | Δv (km/s) | Before (tankers / feasible) | After |
|---|---|---|---|---|
{VC}

   All other rows' tanker counts were unchanged.
3. (Earlier session) MGA-1DSM bound inversion for long legs under a tight max-TOF and a zero-v∞ flyby domain error.
4. Convention note (not changed): parking-orbit altitude is measured from Earth's mean radius (6371 km) rather than
   equatorial (6378 km); this causes the −0.1 % residual vs. the Hohmann table.
