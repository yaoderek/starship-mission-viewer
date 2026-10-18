# Verification report — Starship mission planner

Generated 2026-10-17 14:26 PDT. Every number below was produced by the scripts in `verification/`
(re-run them to reproduce): `horizons_check.py`, `lambert_check.py`, `hohmann_check.py`,
`trajbrowser_compare.py`, `historical.py`, `starship_sensitivity.py`, `recompute_vehicle.py`, `make_report.py`.
Pass criteria: ephemeris |Δr| < 1 km; Lambert rel. error < 1e-6; Hohmann < 0.5 %; Trajectory Browser C3 < 3 %,
injection Δv < 2 %, arrival Δv < 5 %; historical launch C3 within 15 %.

| Category | Item | Ours | Reference | Source | Error | Result | Note |
|---|---|---|---|---|---|---|---|
| Ephemeris | Mercury heliocentric ecliptic state, 6 epochs 1989–2050 | max ∣Δr∣ 7.6e-06 m, ∣Δv∣ 1.5e-11 m/s | Horizons vector | [JPL Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api) (DE441) | 1.3e-16 | PASS |  |
| Ephemeris | Venus heliocentric ecliptic state, 6 epochs 1989–2050 | max ∣Δr∣ 3e-05 m, ∣Δv∣ 8.0e-12 m/s | Horizons vector | [JPL Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api) (DE441) | 2.8e-16 | PASS |  |
| Ephemeris | Earth heliocentric ecliptic state, 6 epochs 1989–2050 | max ∣Δr∣ 0.054 m, ∣Δv∣ 1.5e-07 m/s | Horizons vector | [JPL Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api) (DE441) | 3.5e-13 | PASS |  |
| Ephemeris | Mars heliocentric ecliptic state, 6 epochs 1989–2050 | max ∣Δr∣ 7.5e-05 m, ∣Δv∣ 7.4e-12 m/s | Horizons vector | [JPL Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api) (DE441) | 3.6e-16 | PASS |  |
| Ephemeris | Jupiter heliocentric ecliptic state, 6 epochs 1989–2050 | max ∣Δr∣ 6.1e-05 m, ∣Δv∣ 5.3e-12 m/s | Horizons vector | [JPL Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api) (DE441) | 8.2e-17 | PASS |  |
| Ephemeris | Saturn heliocentric ecliptic state, 6 epochs 1989–2050 | max ∣Δr∣ 0.00048 m, ∣Δv∣ 2.6e-12 m/s | Horizons vector | [JPL Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api) (DE441) | 3.5e-16 | PASS |  |
| Ephemeris | Uranus heliocentric ecliptic state, 6 epochs 1989–2050 | max ∣Δr∣ 0.00068 m, ∣Δv∣ 2.7e-13 m/s | Horizons vector | [JPL Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api) (DE441) | 2.3e-16 | PASS |  |
| Ephemeris | Neptune heliocentric ecliptic state, 6 epochs 1989–2050 | max ∣Δr∣ 0.00048 m, ∣Δv∣ 9.8e-13 m/s | Horizons vector | [JPL Horizons API](https://ssd.jpl.nasa.gov/api/horizons.api) (DE441) | 1.1e-16 | PASS |  |
| Lambert | 0-rev vs Izzo 2015 (400 random cases) | max rel Δv₁ 6.5e-12 | lamberthub izzo2015 | [lamberthub](https://github.com/jorgepiloto/lamberthub) | 6.5e-12 | PASS |  |
| Lambert | multi-rev N=1..3, both branches (1456 solutions) | max rel Δv₁ 1.4e-12; 0 missing | lamberthub izzo2015 | lamberthub | 1.4e-12 | PASS |  |
| Lambert | 0-rev, planetary scale (100 cases) | max rel 1.2e-12 | lamberthub gooding1990 | lamberthub | 1.2e-12 | PASS |  |
| Lambert | endpoint check: propagate every solution with scipy DOP853 | max rel miss 4.9e-06 | r₂ | independent integrator | 4.9e-06 | PASS |  |
| Hohmann | Earth→Mercury v∞ / Δv from 300 km LEO | 7.473 / 5.511 km/s | 7.474 / 5.509 | [Wikipedia Hohmann table](https://en.wikipedia.org/wiki/Hohmann_transfer_orbit#Application_to_interplanetary_travel) | -0.01% / +0.04% | PASS | TOF 106 d |
| Hohmann | Earth→Venus v∞ / Δv from 300 km LEO | 2.532 / 3.490 km/s | 2.532 / 3.491 | [Wikipedia Hohmann table](https://en.wikipedia.org/wiki/Hohmann_transfer_orbit#Application_to_interplanetary_travel) | -0.00% / -0.04% | PASS | TOF 146 d |
| Hohmann | Earth→Mars v∞ / Δv from 300 km LEO | 2.929 / 3.586 km/s | 2.929 / 3.590 | [Wikipedia Hohmann table](https://en.wikipedia.org/wiki/Hohmann_transfer_orbit#Application_to_interplanetary_travel) | +0.00% / -0.11% | PASS | TOF 258 d |
| Hohmann | Earth→Jupiter v∞ / Δv from 300 km LEO | 8.791 / 6.298 km/s | 8.792 / 6.301 | [Wikipedia Hohmann table](https://en.wikipedia.org/wiki/Hohmann_transfer_orbit#Application_to_interplanetary_travel) | -0.01% / -0.05% | PASS | TOF 997 d |
| Hohmann | Earth→Saturn v∞ / Δv from 300 km LEO | 10.289 / 7.282 km/s | 10.290 / 7.285 | [Wikipedia Hohmann table](https://en.wikipedia.org/wiki/Hohmann_transfer_orbit#Application_to_interplanetary_travel) | -0.01% / -0.04% | PASS | TOF 2209 d |
| Hohmann | Earth→Uranus v∞ / Δv from 300 km LEO | 11.281 / 7.979 km/s | 11.282 / 7.984 | [Wikipedia Hohmann table](https://en.wikipedia.org/wiki/Hohmann_transfer_orbit#Application_to_interplanetary_travel) | -0.01% / -0.07% | PASS | TOF 5858 d |
| Hohmann | Earth→Neptune v∞ / Δv from 300 km LEO | 11.654 / 8.249 km/s | 11.655 / 8.251 | [Wikipedia Hohmann table](https://en.wikipedia.org/wiki/Hohmann_transfer_orbit#Application_to_interplanetary_travel) | -0.01% / -0.03% | PASS | TOF 11182 d |
| Trajectory Browser | Mars 2033-04-17→2033-10-10 C3 (vs TB heliocentric state at SOI exit) | 9.29 | 9.17 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +1.3% | PASS |  |
| Trajectory Browser | Mars 2033-04-17→2033-10-10 C3 (vs TB injection C3) | 9.29 | 8.35 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +11.3% | FAIL | TB injection C3 ≈ (SOI-exit v∞)² − 2μ/r_SOI ≈ −0.86 km²/s²: convention, see notes |
| Trajectory Browser | Mars 2033-04-17→2033-10-10 injection Δv, 200 km LEO | 3.639 | 3.597 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +1.1% | PASS |  |
| Trajectory Browser | Mars 2033-04-17→2033-10-10 arrival Δv to C3=0 | 1.220 | 1.207 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +1.1% | PASS |  |
| Trajectory Browser | Mars 2035-06-26→2036-01-04 C3 (vs TB heliocentric state at SOI exit) | 10.30 | 10.18 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +1.2% | PASS |  |
| Trajectory Browser | Mars 2035-06-26→2036-01-04 C3 (vs TB injection C3) | 10.30 | 9.35 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +10.1% | FAIL | TB injection C3 ≈ (SOI-exit v∞)² − 2μ/r_SOI ≈ −0.86 km²/s²: convention, see notes |
| Trajectory Browser | Mars 2035-06-26→2036-01-04 injection Δv, 200 km LEO | 3.683 | 3.641 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +1.1% | PASS |  |
| Trajectory Browser | Mars 2035-06-26→2036-01-04 arrival Δv to C3=0 | 0.701 | 0.687 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +2.0% | PASS |  |
| Trajectory Browser | Venus 2031-05-30→2031-10-05 C3 (vs TB heliocentric state at SOI exit) | 12.76 | 12.78 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | -0.2% | PASS |  |
| Trajectory Browser | Venus 2031-05-30→2031-10-05 C3 (vs TB injection C3) | 12.76 | 11.95 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +6.8% | FAIL | TB injection C3 ≈ (SOI-exit v∞)² − 2μ/r_SOI ≈ −0.86 km²/s²: convention, see notes |
| Trajectory Browser | Venus 2031-05-30→2031-10-05 injection Δv, 200 km LEO | 3.789 | 3.754 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +0.9% | PASS |  |
| Trajectory Browser | Venus 2031-05-30→2031-10-05 arrival Δv to C3=0 | 0.447 | 0.395 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +13.3% | FAIL |  |
| Trajectory Browser | Mercury 2031 | — | no result returned | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | — | N/A | query returned no trajectory |
| Trajectory Browser | Jupiter 2028-02-15→2031-11-22 | — | TB optimum is a gravity-assist route (mid-course Δv 1.18) | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | — | N/A | not comparable to a direct Lambert arc |
| Trajectory Browser | Saturn 2029-07-11→2032-04-30 C3 (vs TB heliocentric state at SOI exit) | 137.43 | 137.21 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +0.2% | PASS |  |
| Trajectory Browser | Saturn 2029-07-11→2032-04-30 C3 (vs TB injection C3) | 137.43 | 136.35 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +0.8% | PASS | TB injection C3 ≈ (SOI-exit v∞)² − 2μ/r_SOI ≈ −0.86 km²/s²: convention, see notes |
| Trajectory Browser | Saturn 2029-07-11→2032-04-30 injection Δv, 200 km LEO | 8.297 | 8.264 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +0.4% | PASS |  |
| Trajectory Browser | Saturn 2029-07-11→2032-04-30 arrival Δv to C3=0 | 1.744 | 1.724 | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | +1.2% | PASS |  |
| Trajectory Browser | Uranus 2030-01-19→2039-09-09 | — | TB optimum is a gravity-assist route (mid-course Δv 0.74) | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | — | N/A | not comparable to a direct Lambert arc |
| Trajectory Browser | Neptune 2030 | — | no result returned | [NASA Ames Trajectory Browser](https://trajbrowser.arc.nasa.gov) | — | N/A | query returned no trajectory |
| Historical | Galileo VEEGA launch C3 | 13.25 (1989-11-04) | ≈13 minimum for the 1989 VEEGA (flown 1989-10-18) | [D'Amario et al. 1992, SSRv 60](https://articles.adsabs.harvard.edu/cgi-bin/nph-iarticle_query?1992SSRv...60...23D&data_type=PDF_HIGH&whole_paper=YES&type=PRINTER&filetype=.pdf); [NASA Galileo](https://science.nasa.gov/mission/galileo/) | +2.0% | PASS |  |
| Historical | Galileo flyby dates V/E/E | 1990-02-16 / 1990-12-07 / 1992-12-05 | 1990-02-10 / 1990-12-08 / 1992-12-08 | [D'Amario et al. 1992, SSRv 60](https://articles.adsabs.harvard.edu/cgi-bin/nph-iarticle_query?1992SSRv...60...23D&data_type=PDF_HIGH&whole_paper=YES&type=PRINTER&filetype=.pdf); [NASA Galileo](https://science.nasa.gov/mission/galileo/) | +6 d / −1 d / −3 d | PASS |  |
| Historical | Galileo deep-space Δv | 575 m/s | “only a small amount of ΔV for trajectory shaping” | [D'Amario et al. 1992, SSRv 60](https://articles.adsabs.harvard.edu/cgi-bin/nph-iarticle_query?1992SSRv...60...23D&data_type=PDF_HIGH&whole_paper=YES&type=PRINTER&filetype=.pdf); [NASA Galileo](https://science.nasa.gov/mission/galileo/) | — | FAIL | optimizer not fully converged / ours unconstrained by arrival date |
| Historical | Cassini VVEJGA launch C3 | 18.58 (1997-10-23) | 16.640 (1997-10-15) | [JPL Cassini fact table](https://dataverse.jpl.nasa.gov/api/access/datafile/13695); [Goodson et al. AIAA-98-4224](https://scispace.com/pdf/cassini-maneuver-experience-launch-and-early-cruise-10m0jk305y.pdf) | +11.7% | PASS | within 15%, not exact |
| Historical | Cassini flyby dates V/V/E/J | 1998-05-05 / 1999-06-23 / 1999-08-18 / 2001-01-04 | 1998-04-26 / 1999-06-24 / 1999-08-18 / 2000-12-30 | [JPL Cassini fact table](https://dataverse.jpl.nasa.gov/api/access/datafile/13695); [Goodson et al. AIAA-98-4224](https://scispace.com/pdf/cassini-maneuver-experience-launch-and-early-cruise-10m0jk305y.pdf) | +9 d / −1 d / 0 d / +5 d | PASS |  |
| Historical | Cassini Venus-targeting DSM | 453 m/s on 1998-09-07 (leg 2) | 450 m/s on 1998-12-03 | [JPL Cassini fact table](https://dataverse.jpl.nasa.gov/api/access/datafile/13695); [Goodson et al. AIAA-98-4224](https://scispace.com/pdf/cassini-maneuver-experience-launch-and-early-cruise-10m0jk305y.pdf) | +0.7% (Δv), −87 d (date) | PASS | date differs |
| Historical | Cassini total deterministic Δv | 1609 m/s | ≈570 m/s cumulative TCMs by 2002 | [JPL Cassini fact table](https://dataverse.jpl.nasa.gov/api/access/datafile/13695); [Goodson et al. AIAA-98-4224](https://scispace.com/pdf/cassini-maneuver-experience-launch-and-early-cruise-10m0jk305y.pdf) | +182.2% | FAIL | extra DSMs (esp. 776 m/s at Jupiter leg) from SOI-date limit/max-TOF bound; not converged |
| Historical | Juno ΔV-EGA launch C3 | 28.86 (2011-08-07) | 31.1 (2011-08-05) | [JPL DESCANSO Juno](https://descanso.jpl.nasa.gov/DPSummary/Descanso16_Juno_RevA.pdf); [PLASMA guide C3 list](https://trajectoryv2.wpi.edu/plasma-user-guide.pdf) | -7.2% | PASS |  |
| Historical | Juno DSM date / Earth-flyby date | 2012-08-27 (643 m/s) / 2013-09-28 | 2012-08-30 & 09-14 / 2013-10-09 | [JPL DESCANSO Juno](https://descanso.jpl.nasa.gov/DPSummary/Descanso16_Juno_RevA.pdf); [PLASMA guide C3 list](https://trajectoryv2.wpi.edu/plasma-user-guide.pdf) | −3 d / −11 d | PASS | Juno split the DSM in two |
| Starship | Tsiolkovsky + tanker inversion (180 parameter combos) | identical to independent formula | Δv = Isp·g₀·ln(m₀/m_f) | textbook | 0 | PASS |  |
| Starship | LEO departure Δv = √(v∞²+2μ/r) − √(μ/r) | 3.586 km/s (Mars, 300 km) | 3.590 | [Wikipedia Hohmann table](https://en.wikipedia.org/wiki/Hohmann_transfer_orbit#Application_to_interplanetary_travel) | −0.11% | PASS | residual from Earth radius 6371 vs 6378 km |

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
| jupiter | E-J (mga-1dsm) | 7.60 | None / not feasible | 15 / not feasible |
| jupiter | E-J (mga-2rev) | 7.59 | None / not feasible | 15 / not feasible |
| saturn | E-E-J-S (mga-2rev) | 7.72 | None / not feasible | 16 / not feasible |

   All other rows' tanker counts were unchanged.
3. (Earlier session) MGA-1DSM bound inversion for long legs under a tight max-TOF and a zero-v∞ flyby domain error.
4. Convention note (not changed): parking-orbit altitude is measured from Earth's mean radius (6371 km) rather than
   equatorial (6378 km); this causes the −0.1 % residual vs. the Hohmann table.


## Crew radiation and hazard models (added 2026-10-17)

All radiation numbers are **ESTIMATES** of one-way transit dose (no surface stay, no return) for a crew in the Starship cabin. Dose is reported as dose equivalent in mSv used as a proxy for effective dose (SPE: BFO dose equivalent). Limits: NASA-STD-3001 Vol 1 Rev C — career effective dose < 600 mSv; BFO 250 mGy-Eq / 30 d and 500 mGy-Eq / yr ([NASA](https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf)). The 600 mSv career limit corresponds to NASA's 3 % REID cancer-mortality criterion for the most susceptible case; every route beyond Mars exceeds it in transit alone with this vehicle model.

### Model summary

* **GCR**: H = A·exp(−φ/φ₀)·(1+0.03·(r−1 AU)). φ(t) from the Oulu reconstruction to 2021, then a lagged SSN regression driven by observed SSN → NOAA SWPC cycle-25 prediction (quartiles) → cycle-26 template. φ₀ from CRaTER's measured solar-min/max ratio, A from MSL/RAD. Radial gradient 3 %/AU from Ulysses/PAMELA (2.8–3.6 %/AU, inner heliosphere); **beyond ~5 AU it is an extrapolation** (Voyager-era gradients are smaller, so outer-planet GCR is probably overestimated). Starship cabin treated as RAD-equivalent shielding (±30 %). The storm shelter is NOT credited against GCR (conservative).
* **Solar activity / launch timing**: Monte Carlo (n=800/mission) over cycle-26 start (U 2029–2032), amplitude (bootstrap of cycles 19–25), NOAA quartile position and φ regression noise. This is why GCR bands are wide (p05–p95 typically ×0.35–×2.2 of the median).
* **SPE**: Poisson process with rate ∝ SSN (k = 0.0112 events SSN⁻¹ yr⁻¹, Φ30 ≥ 1e7 cm⁻², fitted 1986–2023); fluence bootstrap from the 1956–2023 catalogue (387 events, heavy tail incl. Nov-1960 9e9 and Aug-1972 5e9); r^−2 inside 1 AU, r^−U(2,3) beyond; dose linear in Φ30 relative to Aug-1972 BFO dose vs Al depth. Shelter: 10 % of each event's dose is received before sheltering (assumption). Flares cannot be scheduled: the viewer shows a 30-day probability of a large event (Φ30 ≥ 1e8 at the ship), not event dates.
* **Belts**: Earth Van Allen transit 4 mSv (2–8) per departure / Earth flyby < 40,000 km, from Artemis I (Orion phantom 1.96 + 0.11 mGy, scaled for lighter shielding); shelter factor 134/287 from Artemis I HERA. Jupiter: Ringwald (2000) unshielded rates at Io/Europa/Ganymede/Callisto, log-interpolated, attenuated by Juno's vault factor (1 cm Ti → ÷800), integrated along the hyperbolic pass; no extra credit beyond 4.5 g/cm²; **order of magnitude only**. Saturn/Uranus/Neptune belts not modelled (weaker; flagged).
* **Hazards**: ORDEM 3.0 2029 debris flux at 340 km (≥1 mm, ≥3 mm, ≥1 cm), refuelling loiter = tankers × 7 d (cadence is an assumption); Grün 1985 micrometeoroids × r^−1.3 (Leinert 1981); asteroid belt n·σ·v·t with 1.2e6 bodies > 1 km (Tedesco & Desert 2002); ring-plane crossings qualitative; aerocapture 3-DOF exponential-atmosphere integration with Sutton–Graves convective heating (vehicle β, L/D, nose radius are estimates; radiative heating not modelled); comms light-time and solar-conjunction (SEP < 2°) from DE440s; consumables from NASA BVAD.

### Validation

| Category | Item | Ours | Reference | Source | Error | Result | Note |
|---|---|---|---|---|---|---|---|
| GCR (fit) | Solar-cycle slope from CRaTER free-space Si dose 318 vs 156 uGy/d (2009/10 min vs 2013/14 max) | phi0 = 330 MV (phi 409 -> 645 MV, Usoskin/Väisänen 2023) | ratio 2.04 | https://doi.org/10.1002/2015SW001314 | fit | INPUT/INFO | calibration input, not a test. Si absorbed-dose ratio used for dose equivalent (Q also varies; unquantified) |
| GCR (fit) | Amplitude from MSL/RAD cruise Dec 2011-Jul 2012 | 1.84 mSv/d at phi 578 MV | 1.84 +- 0.30 mSv/d | https://doi.org/10.1126/science.1235989 | fit | INPUT/INFO | calibration input |
| GCR (held-out) | ExoMars TGO Liulin-MO cruise | 2.26 mSv/d (phi 510 MV) | 2.00 +- 0.40 | Semkova et al. 2018 Icarus 303:53 (1.97/2.04 +-0.4 mSv/d, ~10 g/cm^2) https://ui.adsabs.harvard.edu/abs/2018Icar..303...53S | +13.1% | PASS | pass = within 2 sigma |
| GCR (held-out) | LRO/CRaTER, Artemis I period | 1.54 mSv/d (phi 636 MV) | 1.55 +- 0.31 | quoted in Artemis I paper, Nature 2024 https://www.nature.com/articles/s41586-024-07927-7 | -0.4% | PASS | pass = within 2 sigma; phi from SSN regression (Oulu series ends 2021) |
| GCR (held-out) | Orion HERA, Artemis I (heavier shielding) | 1.08 mSv/d (phi 636 MV) | 1.10 +- 0.14 | Artemis I HERA 0.96-1.24 mSv/d, Nature 2024; tests the -30%/+80% shielding factor | -1.7% | PASS | pass = within 2 sigma; Orion case uses the Artemis-I shielding factor 0.7 (-30%); phi from SSN regression (Oulu series ends 2021) |
| Solar | phi(SSN) lagged regression 1964-2021 | phi = 441 + 2.29 SSN(t-6 mo); R^2 0.78, sigma 78 MV | Oulu phi monthly | https://cosmicrays.oulu.fi/phi/phi.html | — | INPUT/INFO | sigma propagated into MC |
| Solar | Cycle 25 maximum (13-month smoothed SSN) | 159.2 (our 13-mo boxcar on NOAA monthly) | 160.9 (SILSO, Oct 2024) | https://www.sidc.be/article/solar-cycle-25-reached-its-maximum-october-2024 | -1.0% | PASS |  |
| Solar | Cycle 26 forecast | start U(2029-2032), amplitude drawn from cycles 19-25 maxima 287, 158, 232, 213, 181, 115, 159; mean cycle shape | NOAA: cycle 26 begins Jan 2029-Dec 2032; no amplitude forecast | https://www.swpc.noaa.gov/products/solar-cycle-progression | — | INPUT/INFO | no published cycle-26 amplitude exists; this is our assumption |
| SPE | Events Phi30>=1e7 in cycle 1954.3-1964.8 (rate ∝ SSN, k fitted 1986-2023) | 14.5 | 31 (catalogue) | https://zenodo.org/records/15083732 | -53.1% | FAIL | out-of-sample: pre-1986 catalogue (Shea & Smart) lists ~2x more events -> catalogue inhomogeneity; modern rate is used |
| SPE | Events Phi30>=1e7 in cycle 1964.8-1976.2 (rate ∝ SSN, k fitted 1986-2023) | 11.1 | 28 (catalogue) | https://zenodo.org/records/15083732 | -60.4% | FAIL | out-of-sample: pre-1986 catalogue (Shea & Smart) lists ~2x more events -> catalogue inhomogeneity; modern rate is used |
| SPE | Events Phi30>=1e7 in cycle 1976.2-1986.7 (rate ∝ SSN, k fitted 1986-2023) | 13.1 | 27 (catalogue) | https://zenodo.org/records/15083732 | -51.6% | FAIL | out-of-sample: pre-1986 catalogue (Shea & Smart) lists ~2x more events -> catalogue inhomogeneity; modern rate is used |
| SPE | Events Phi30>=1e7 in cycle 1986.7-1996.6 (rate ∝ SSN, k fitted 1986-2023) | 11.8 | 11 (catalogue) | https://zenodo.org/records/15083732 | +7.2% | PASS | in-sample for >=1986 |
| SPE | Events Phi30>=1e7 in cycle 1996.6-2008.9 (rate ∝ SSN, k fitted 1986-2023) | 11.4 | 13 (catalogue) | https://zenodo.org/records/15083732 | -12.5% | PASS | in-sample for >=1986 |
| SPE | Events Phi30>=1e7 in cycle 2008.9-2019.9 (rate ∝ SSN, k fitted 1986-2023) | 6.1 | 7 (catalogue) | https://zenodo.org/records/15083732 | -13.0% | PASS | in-sample for >=1986 |
| SPE | Events Phi30>=1e7 in cycle 2019.9-2024.0 (rate ∝ SSN, k fitted 1986-2023) | 2.8 | 1 (catalogue) | https://zenodo.org/records/15083732 | +179.5% | PASS | in-sample for >=1986 |
| SPE | MSL/RAD cruise SEP dose from catalogue events (Dec 2011-Jul 2012), ~10 g/cm^2, r~1.2 AU | 1.8 mSv (BFO, 2 catalogue events) | ~25 mGy total from 4-5 SEP events (point dose, Si) | Zeitlin 2013 / Semkova 2020 summary | -92.9% | FAIL | model gives BFO (body self-shielded) dose; RAD is a lightly shielded point detector, and 2 of RAD's events are below the catalogue threshold. Not like-for-like: SPE absolute calibration is UNVALIDATED (factor ~3-10). |
| SPE | Aug-1972 dose vs shielding (input) | 590/220/60 mSv @5/10/20 g/cm^2; hull 2.88 g/cm^2 Al-eq -> 896 (extrapolated) | 0.59/0.22/0.06 Sv BFO | https://hdl.handle.net/2346/84719 | input | INPUT/INFO | below 5 g/cm^2 log-linear extrapolation (likely overestimates BFO dose at thin shielding) |
| Aero | Entry integrator vs Allen-Eggers ballistic peak deceleration (Earth, 7.5 km/s, -20 deg) | 44.8 g | 42.5 g (analytic) | Allen & Eggers 1958, NACA TR-1381 | +5.5% | FAIL | checks the integrator only, not the vehicle model. Allen-Eggers neglects gravity and curvature, which plausibly explains +5.5%, but it exceeds the 5% tolerance fixed before running |
| MMOD | Grün 1985 flux implementation | F(>=1e-6 g) = 4.72e-08 m^-2 s^-1 at 1 AU | constants per MEM 3 doc | https://ntrs.nasa.gov/citations/20200000563 | — | INPUT/INFO | no independent numeric value found to compare against |
| Belts | Jupiter dose model | Ringwald surface dose rates x Juno-vault attenuation | none for crewed spacecraft | Ringwald 2000; NASA Juno | — | INPUT/INFO | ORDER OF MAGNITUDE ONLY (x/÷10); unvalidated |

### Sample results (one-way, shelter 20 g/cm² water)

**Mars**

| # | Route | Model | Launch | TOF yr | Δv km/s | GCR mSv (p05–p95) | Belts mSv (unsh / sh) | SPE mean / p95 unsh | SPE mean / p95 shelter | Total mean (unsh / sh) | Worst 30-d p95 sh |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | E-M | mga-1dsm | 2033-04-04 | 0.48 | 3.73 | 207 (69–475) | 4.0 / 1.9 | 24 / 87 | 3.4 / 12 | 236 / 213 | 48 |
| 2 | E-E-M | mga-1dsm | 2032-04-28 | 1.75 | 3.70 | 912 (325–2046) | 8.0 / 3.7 | 80 / 262 | 11.3 / 37 | 1000 / 927 | 81 |
| 3 | E-V-V-M | mga-1dsm | 2034-08-05 | 2.76 | 4.13 | 1025 (368–2022) | 4.0 / 1.9 | 254 / 1395 | 35.9 / 197 | 1283 / 1062 | 244 |
| 4 | E-V-M | mga-1dsm | 2030-01-24 | 1.18 | 4.77 | 1078 (499–1815) | 4.0 / 1.9 | 8 / 28 | 1.2 / 4 | 1090 / 1081 | 80 |
| 5 | E-V-E-M | mga-1dsm | 2031-06-01 | 2.03 | 4.77 | 1448 (458–2753) | 4.0 / 1.9 | 98 / 432 | 13.8 / 61 | 1550 / 1464 | 114 |
| 6 | E-V-E-E-M | mga-1dsm | 2028-02-29 | 3.19 | 5.30 | 2611 (1212–4571) | 4.0 / 1.9 | 52 / 162 | 7.4 / 23 | 2667 / 2620 | 85 |
| 7 | E-V-V-E-M | mga-1dsm | 2031-06-03 | 2.78 | 7.92 | 1728 (598–3561) | 8.0 / 3.7 | 205 / 825 | 29.0 / 117 | 1941 / 1760 | 162 |
| 8 | E-M **low-dose alternative** | lambert-direct | 2035-07-27 | 0.30 | 4.61 | 104 (35–198) | 4.0 / 1.9 | 16 / 65 | 2.3 / 9 | 124 / 108 | 36 |

**Jupiter** (capture periapsis 3 Rj unless noted; rp30Rj = radiation-aware variant)

| # | Route | Model | Launch | TOF yr | Δv km/s | GCR mSv (p05–p95) | Belts mSv (unsh / sh) | SPE mean / p95 unsh | SPE mean / p95 shelter | Total mean (unsh / sh) | Worst 30-d p95 sh |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | E-V-E-E-J | mga-1dsm | 2029-11-27 | 5.63 | 5.81 | 3663 (1430–6614) | 266.7 / 28.6 | 74 / 260 | 10.5 / 37 | 4004 / 3702 | 90 |
| 2 | E-E-J | mga-1dsm | 2033-08-31 | 4.52 | 6.35 | 1936 (712–3677) | 265.0 / 26.9 | 73 / 256 | 10.3 / 36 | 2273 / 1973 | 78 |
| 3 | E-M-J | mga-2rev | 2031-02-16 | 2.47 | 7.09 | 1901 (685–3468) | 260.1 / 24.9 | 8 / 28 | 1.1 / 4 | 2169 / 1927 | 80 |
| 4 | E-J | mga-1dsm | 2028-12-23 | 2.88 | 7.60 | 2737 (1234–4878) | 260.6 / 25.0 | 3 / 14 | 0.5 / 2 | 3001 / 2762 | 102 |
| 5 | E-J | mga-2rev | 2028-12-23 | 2.92 | 7.59 | 2778 (1171–4828) | 260.6 / 25.0 | 5 / 13 | 0.7 / 2 | 3044 / 2803 | 102 |
| 6 | E-V-V-J **low-dose** | mga-2rev | 2033-01-05 | 3.77 | 7.45 | 1476 (560–2944) | 256.4 / 24.6 | 140 / 453 | 19.9 / 64 | 1873 / 1521 | 84 |
| 7 | E-V-E-E-J | mga-2rev | 2031-01-31 | 6.47 | 7.17 | 3439 (1404–6349) | 267.5 / 28.6 | 124 / 405 | 17.5 / 57 | 3831 / 3486 | 102 |
| 8 | E-E-J | mga-2rev | 2033-08-25 | 3.24 | 7.84 | 1227 (492–2445) | 264.3 / 26.8 | 106 / 369 | 15.0 / 52 | 1597 / 1268 | 60 |
| 9 | E-V-V-J | mga-1dsm | 2028-04-21 | 3.88 | 7.84 | 3410 (1559–5948) | 255.0 / 24.5 | 30 / 89 | 4.3 / 13 | 3695 / 3439 | 95 |
| 10 | E-M-J | mga-1dsm | 2033-09-07 | 4.45 | 8.08 | 1897 (693–3403) | 263.0 / 25.2 | 69 / 286 | 9.7 / 40 | 2228 / 1931 | 77 |
| 11 | E-V-E-J | mga-1dsm | 2033-02-23 | 6.69 | 8.24 | 3420 (1443–6406) | 264.5 / 26.9 | 192 / 818 | 27.1 / 116 | 3876 / 3474 | 136 |
| 12 | E-V-J | mga-2rev | 2032-12-21 | 3.26 | 9.35 | 1323 (495–2691) | 254.6 / 24.5 | 48 / 205 | 6.7 / 29 | 1625 / 1354 | 71 |
| 13 | E-E-J rp30Rj **low-dose alternative** | mga-1dsm | 2033-08-31 | 4.52 | 6.63 | 1936 (712–3677) | 8.0 / 3.7 | 73 / 256 | 10.3 / 36 | 2016 / 1950 | 61 |

**Saturn**

| # | Route | Model | Launch | TOF yr | Δv km/s | GCR mSv (p05–p95) | Belts mSv (unsh / sh) | SPE mean / p95 unsh | SPE mean / p95 shelter | Total mean (unsh / sh) | Worst 30-d p95 sh |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | E-V-E-E-S | mga-2rev | 2028-03-12 | 7.93 | 6.57 | 5378 (2416–9006) | 12.0 / 5.6 | 57 / 191 | 8.0 / 27 | 5447 / 5392 | 86 |
| 2 | E-E-J-S | mga-1dsm | 2034-08-07 | 8.26 | 6.88 | 6171 (2591–11199) | 29.4 / 5.7 | 78 / 261 | 11.0 / 37 | 6279 / 6188 | 98 |
| 3 | E-M-J-S | mga-2rev | 2031-02-15 | 9.87 | 6.59 | 6626 (3034–11276) | 11.8 / 2.6 | 17 / 56 | 2.5 / 8 | 6655 / 6631 | 92 |
| 4 | E-E-S **low-dose** | mga-1dsm | 2028-07-13 | 7.64 | 7.15 | 5246 (2299–9070) | 8.0 / 3.7 | 27 / 89 | 3.8 / 13 | 5281 / 5253 | 85 |
| 5 | E-M-J-S | mga-1dsm | 2031-02-11 | 10.00 | 6.90 | 6764 (2769–11316) | 4.6 / 1.9 | 17 / 64 | 2.3 / 9 | 6786 / 6769 | 93 |
| 6 | E-J-S | mga-2rev | 2030-01-19 | 9.57 | 7.21 | 6330 (2775–11509) | 168.1 / 16.7 | 17 / 67 | 2.5 / 9 | 6515 / 6349 | 89 |

**Neptune**

| # | Route | Model | Launch | TOF yr | Δv km/s | GCR mSv (p05–p95) | Belts mSv (unsh / sh) | SPE mean / p95 unsh | SPE mean / p95 shelter | Total mean (unsh / sh) | Worst 30-d p95 sh |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | E-E-J-N | mga-1dsm | 2030-02-22 | 15.00 | 8.18 | 15330 (6656–26714) | 8.0 / 3.7 | 32 / 110 | 4.5 / 16 | 15369 / 15338 | 145 |
| 2 | E-M-J-N | mga-2rev | 2031-02-10 | 15.00 | 8.22 | 16033 (7314–28318) | 4.5 / 1.9 | 9 / 31 | 1.3 / 4 | 16047 / 16036 | 145 |
| 3 | E-M-J-N | mga-1dsm | 2031-02-02 | 14.69 | 8.50 | 15548 (7477–25918) | 4.6 / 1.9 | 8 / 31 | 1.2 / 4 | 15560 / 15551 | 145 |
| 4 | E-J-N | mga-2rev | 2031-02-21 | 15.00 | 8.58 | 16050 (6262–28321) | 4.8 / 1.9 | 7 / 25 | 0.9 / 4 | 16061 / 16053 | 145 |
| 5 | E-J-N | mga-1dsm | 2031-02-21 | 15.00 | 8.58 | 16050 (6262–28321) | 4.8 / 1.9 | 7 / 25 | 0.9 / 4 | 16062 / 16053 | 145 |

Pareto plots: `output/<planet>/pareto_dv_dose.png`; cumulative-dose plots: `output/<planet>/dose_cumulative.png`. Low-dose alternatives were added to the viewer JSONs (tag `low-dose alternative`).

### Caveats
* SPE absolute dose is not validated against a like-for-like measurement (FAIL above); treat SPE numbers as ±×3–10. The shelter benefit ratio is more robust than the absolute value.
* GCR is validated at 1 AU only (TGO +13 %, CRaTER 0 %, Orion −2 % with shielding factor). Values at Jupiter and beyond rest on an extrapolated radial gradient.
* Jupiter belt doses are order-of-magnitude (unvalidated). A 3 Rj capture periapsis is the planner default; at ~250 mSv unsheltered per pass it is the single largest avoidable dose, and raising periapsis to 30 Rj costs ~0.3 km/s.
* No return trip, no surface stay, no EVA, no vehicle-internal shielding beyond hull + shelter; crew size does not affect dose.

## v0.4 Mission architectures (round trip, opposition, ISRU)

| Check | Reference | Ours | Result | Note |
|---|---|---|---|---|
| Return leg (Mars->Earth) Lambert, propagated endpoint error | < 1000 km | 0.000143 km | PASS | universal-variable propagation of the Lambert v1 |
| Mars ascent to 100 km LMO | 4.2 km/s (NTRS 20210026187, ideal +20%) | 3.503 x 1.2 = 4.20 km/s; used 4.15 | PASS | Circular speed 3.50 km/s + 20% losses; MSR MAV 4.15 km/s |
| Conjunction-class Mars: stay / total duration | ~500 d stay, ~900 d total; transits 175-225 d (NASA SP-2009-566 DRA 5.0) | stay 402 d, total 933 d, out 316 / ret 215 d | PASS | min-Δv search over stays 400-620 d; optimum sits at the 400 d edge (shorter stays cost more) |
| Conjunction-class Mars: transit times | 175-225 d each way (DRA 5.0 crew transits) | out 316 d / ret 215 d | FAIL | MISMATCH: our search minimises Δv with no crew-transit cap, so it picks a slow 316-d outbound; DRA caps transits for crew health |
| Opposition-class Mars: stay / total duration | 30-90 d stay, ~400-650 d total, Venus swing-by often used (DRA 5.0 short-stay) | stay 58 d, total 605 d, via venus | PASS |  |
| Opposition costs more Δv than conjunction | qualitative (DRA 5.0) | 7.93 vs 5.69 km/s | PASS |  |
| ISRU power: NASA kiloton study (300 t in 20 months) | ~230 kW (NTRS 20230017069) | 230 kW at 11.2 kWh/kg; 280 kW at central 13.6 | PASS | lower bound of our range reproduces the study; central 13.6 is +21% |
| ISRU power: Kleinhenz & Paz 2017 (29.7 t in 480 d) | 52 kW all-electric / 35 kW recuperated | 52.1 / 35.1 kW | PASS | by construction (range end-points taken from this paper) - consistency, not independent |
| ISRU plant mass: Kleinhenz 1.7 t | 1.7 t | 1.70 t | PASS | by construction |
| Return propellant vs SpaceX figure | ~1100 t per ship (Musk IAC 2017) | ours 605 t (dry 120 t, return payload 20 t); dry 85 t + 50 t payload: 584 t | INFO | INFO: SpaceX figure includes unstated payload, margins and possibly full-tank fill; not directly comparable |
| Round-trip GCR+surface dose, MSL-era conditions (180/500/180 d) | ~1.01 Sv (Hassler et al. 2014: 2x0.33 + 0.32 Sv) | 0.87 Sv (GCR part, cruise at 1.25 AU from 2011-11) | PASS | cruise rate follows the solar-cycle model through 2012-14 rather than the fixed 1.84 mSv/d |
| Regolith shielding (1 m) | -71% effective dose (Geant4, NST 2022); -41% primary-only (PSS 2022); 1 m meets all PELs (HZETRN, TTU 2015) | factor 0.29 | INFO | INFO: published values disagree by ~2x; we use the Geant4 effective-dose ratio |
| Multi-burn propellant chaining == single burn (no payload drop) | 277.403 t | 277.403 t | PASS |  |

## v0.5 Interstellar missions and vehicle swaps (computed in the browser)

**Vehicle swaps (planetary).** `js/vehicle.js` keeps each trajectory's Δv legs and re-runs the propellant chain for the chosen vehicle (dry mass, payload, tank size, Isp, tanker load). With the baseline Starship inputs it reproduces the mission files: Mars E-M one-way 386.6 t / 4 tankers, conjunction 813.6 t / 8, ISRU E-M-E 484.3 t from LEO + 605.2 t made on Mars, Jupiter round trip 298.7 t needed at Jupiter. NASA DRA 5.0 NTR inputs: 356.4 t IMLEO, 191.7 t LH2, 62.8 t payload, ~94 t inert, Isp ~906 s (NASA SP-2009-566).

**Interstellar flight model.** `js/interstellar.js` flies a constant proper acceleration *a* to a cruise rapidity *w*, coasts, and (optionally) brakes symmetrically. Earth time `t = (c/a) sinh w`, ship time `τ = (c/a) w`, distance `(c²/a)(cosh w − 1)` per burn. Rapidity budget from the relativistic rocket equation `Δw = (vₑ/c) ln(m₀/m₁)`.

| Check | Reference | Ours | Result |
|---|---|---|---|
| Hail Mary, 1.5 g to Tau Ceti (11.91 ly), photon exhaust | Book: ~3 yr 9 mo ship time, ~13 yr Earth time | 3.89 yr ship, 13.14 yr Earth, peak 99.52% c | PASS |
| Hail Mary mass ratio for that profile | e^6.03 ≈ 416 (Physics Forums thread 1084422) | 415.9 → 41,487 t of fuel for a 100 t ship | PASS |
| Hail Mary with the book's 2,000 t fuel (ratio 21) | ~0.91 c (same thread) | 90.9% c, 6.6 yr ship / 13.9 yr Earth | PASS |
| Daedalus, Barnard's Star 5.96 ly | 0.12 c, ~50 yr (Bond & Martin 1978) | 12.0% c, 52 yr (single-stage equivalent: 54,000 t, vₑ 0.033 c) | PASS |
| Icarus Firefly, Alpha Cen | 0.047 c, ~100 yr (Freeland & Lamontagne 2015) | 4.7% c, 102 yr (braking uses the acceleration phase length, 10 yr not 5) | PASS |
| Longshot as published (396 t, 264 t prop, Isp 10⁶ s) | Claimed 0.045 c, 100 yr | Masses only give 1.8% c with braking, 245 yr | INFO: published masses do not close |
| Starshot, Alpha Cen 4.34 ly | 0.2 c, ~20 yr | 20% c, 21.7 yr | PASS |

Book figures (100 t ship, 2,000 t Astrophage, 1.5 g, 3 crew in coma, Tau Ceti) come from fan summaries of the novel; Andy Weir has said he tuned the fuel figure for the story (Physics Today). Star positions and distances: SIMBAD J2000; Alpha Centauri at 4.34 ly (system parallax 750.81 mas).

**Interstellar radiation (rough).** Deep-space GCR 1.84 mSv/day (MSL/RAD cruise, Zeitlin 2013) up to 20 g/cm², two-exponential falloff beyond, ×1.36 outside the heliosphere (~2.5 mSv/day; estimate built from Semyonov's ~0.7 Sv/yr unshielded and Voyager modulation data, no published crew calculation found). Ship-time integrated. Hazard cards also compute the oncoming interstellar hydrogen energy (n_H = 0.2 cm⁻³, Crawford 2011), the water depth needed to stop it (Bragg-Kleeman fit, extrapolated above ~300 MeV), and dust energy per m² (dust density 6.2×10⁻²⁴ kg/m³). These are order-of-magnitude figures.

## v0.6 Live radiation model in the browser (storm rollouts, shielding, cancer risk)

`planner/export_solar.py` writes `missions/solar.json`: the sunspot record and NOAA forecast band, the cycle-26 shape and amplitude draws, the φ(SSN) regression, the GCR calibration constants, the SPE rate constant and the 118-event >30 MeV fluence catalogue (normalised to August 1972). `js/radiation.js` is a line-for-line port of `mission_dose`, so the viewer can roll storm histories live and recompute dose for any shielding.

**Port check** (`node`, 800 rollouts, default 20 g/cm² shelter, against the Python totals stored in the mission files): central cosmic-ray dose matches to within 0.3% on every Mars, Venus, Jupiter and Saturn route, and mean storm and belt doses agree within Monte Carlo noise. The JS "bad case" (95th percentile) also carries the cosmic-ray uncertainty (solar-cycle draw, φ residual, ±30% cabin factor). The Python `total_p95` held cosmic rays at their central value, so the new bad case is wider and more honest.

**Shielding** (new):
- *Cabin wall:* water added around the crew deck (≈410 m², so 4.1 t per g/cm²).
- *Storm shelter:* water, 0–40 g/cm² (≈40 m²). Mass above the 20 g/cm² baseline is added to dry mass, so tankers and feasibility respond.
- *Cosmic rays vs depth:* NASA TM-2012-217361 Table 6a water curve (0.57/0.53/0.48/0.46 Sv/yr at 5/10/20/40 g/cm²), with the hull as the 5 g/cm² point. 40 g/cm² of water cuts cosmic rays by only about 19%.
- *Storms:* August-1972 dose-vs-depth table, as before.
- *Earth belts:* e-folding of 26 g/cm², which reproduces the Artemis I shelter/wall ratio.
- *Jupiter belts:* Juno vault attenuation, with no credit beyond 4.5 g/cm².

**Risk to crew:**
- *Cancer chance:* 1 − exp(−0.08 · dose in Sv). The 8%/Sv is BEIR VII Table 12D-1 lifetime attributable incidence for exposure at 35–40, sexes averaged; mortality is about 1.8× lower. NASA's 600 mSv limit is a mean 3% REID for a 35-year-old woman (NASEM 2021). NASA's 95% interval runs about 3× below to 3.5× above the mean (Cucinotta et al., NASA TM-2012-217361).
- *Radiation sickness:* lognormal dose-response for prodromal vomiting, median 1.8 Gy, σ 0.46 (about 10% at 1 Gy, IAEA Safety Reports 2 via REMM). It is applied to the largest single storm or belt dose in each rollout, using BFO dose equivalent as Gy (cautious).

**Storm rollouts:** each playback rolls one storm history on the median solar cycle; REROLL or replaying from the end rolls another, and `?seed=N` reproduces one. The statistics (expected dose, 5–95% band, chances) come from 600 rollouts with full solar-cycle draws.
