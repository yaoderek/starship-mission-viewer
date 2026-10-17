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
