# Starship mission / flyby planner (v0.1)

Patched-conic planner for Starship missions from Earth (LEO departure) to Mercury … Neptune:
direct Lambert transfers, porkchop plots, multi-gravity-assist (MGA) sequence search,
a rocket-equation Starship model with LEO refuelling, aerocapture / propulsive capture, and basic hazard flags.

## Setup
```
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
curl -o data/de440s.bsp https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp
```
Ephemeris: JPL **DE440s** (1849–2150) read with `jplephem`, converted to heliocentric ecliptic J2000.
(pykep 3.x from pip failed to import on Python 3.13 — missing packaged data file — so the Lambert
solver, propagator and optimizer are implemented here with numpy/scipy.)

## Usage
```
python plan.py --to jupiter --launch-window 2028-2035 --max-tof-years 8 --refuels 8
python plan.py --to mars --launch-window 2028-2035 --max-tof-years 3 --arrival prop
python plan.py --to neptune --launch-window 2028-2040 --max-tof-years 15 --payload 20 --refuels 12
python plan.py --to saturn --sequences "E-J-S;E-V-E-J-S"     # custom sequences
```
Outputs in `output/<target>/`: `porkchop_earth_<target>.png`, `porkchop_grid.npz`,
`ranked.json`, `traj_<rank>_<seq>.png` (matplotlib 3D) and `.html` (interactive plotly).

Key options: `--arrival auto|aero|prop|flyby`, `--max-entry-kms`, `--capture-peri-alt-km`, `--capture-ecc`,
`--dry-mass --prop-capacity --isp --payload --refuels --tanker-load --fill-fraction --residual-prop`,
`--tof-weight` (ranking penalty, km/s per year), `--max-flybys`, `--iters`, `--seeds`, `--jupiter-rad-rj`.

## Models
* **Lambert**: 0-revolution, prograde, universal variables with bisection (`starship/lambert.py`).
* **Departure**: impulsive burn from circular LEO (default 300 km): `sqrt(vinf²+2μ/r) − sqrt(μ/r)`.
* **Flybys**: powered patched-conic flyby. Periapsis is solved for the required turn; a periapsis burn covers
  the |v∞| mismatch. If the turn needs periapsis below the safe floor, it is clamped and an extra turning Δv is
  charged and flagged. No deep-space manoeuvres (MGA, not MGA-1DSM).
* **Optimizer**: scipy differential evolution over (launch date, leg TOFs) + polish, multiple seeds, parallel.
* **Ranking**: score = total Δv + tof_weight·TOF(yr) (+ penalty beyond max TOF).
* **Arrival**: aerocapture if the target has an atmosphere and entry speed ≤ max entry speed
  (ESTIMATES: Mars 7.5, Earth 12.5, Venus 11.5 km/s; gas giants disabled by default), charged a 0.15 km/s
  ESTIMATED trim; otherwise propulsive capture (default: 400 km circular for rocky planets;
  e = 0.9 with periapsis at the safe flyby floor for giants).
* **Vehicle (all ESTIMATES, not SpaceX specs)**: dry 120 t, propellant capacity 1500 t, Isp 375 s,
  payload 100 t, 50 t residual in LEO, 100 t per tanker. Loaded prop = min(capacity·fill_fraction,
  residual + N·tanker_load). Ideal rocket equation, single stage from LEO, no boil-off/gravity losses.
  Table reports min tankers needed and whether `--refuels` is enough.
* **Hazards**: flyby periapsis at/below safe-altitude floor (per-planet, ESTIMATE in `constants.py`),
  Jupiter flyby/capture periapsis < 15 Rj = HIGH RADIATION, Saturn periapsis inside ring region.

## Sanity check
Ideal Hohmann Earth→Mars (circular coplanar): v∞ 2.94 / 2.65 km/s → 3.59 km/s from 300 km LEO
+ 2.08 km/s into 400 km circular Mars orbit = **5.67 km/s, 259 days**. The ephemeris-based porkchop gives
5.74–6.2 km/s over 2028–2035 windows (eccentric/inclined real orbits), consistent.

## v0.2 additions
* `--model 1dsm` (default): **MGA-1DSM** (`starship/mga1dsm.py`): launch v∞ vector, one impulsive deep-space
  manoeuvre per leg at an optimised fraction eta, unpowered flybys with optimised periapsis/B-plane angle
  (periapsis ≥ safe floor). Resonant E-E / V-V legs work. Fitness is numba-compiled (`starship/fastcore.py`,
  tabulated DE440s with Hermite interpolation, ≤ ~20 km error, checked by `tests/test_core.py`);
  optimised with pygmo `sade` (4 restarts) + monotonic basin hopping / compass search.
* `--model mga --max-revs N`: Lambert chain using a **multi-revolution Lambert solver** (`starship/lambert_mr.py`,
  all N-rev left/right branches, universal-variable bracketing — not Izzo's algorithm, but verified by propagation);
  branch combination per trajectory chosen by dynamic programming. `--model both` runs both.
* Validation: `PYTHONPATH=. python validate_galileo.py 4000 16` (Galileo VEEGA, 1989 window).
* Viewer: `plan.py` writes `viewer/missions/<target>.json` (sampled trajectory, planet tracks/orbits, launch/
  DSM/flyby/arrival events with dv, hazard flags) and updates `index.json`.
  ```
  cd viewer && python -m http.server 8765      # open http://127.0.0.1:8765/
  python viewer/screenshot.py jupiter.json 0 0.35 screenshots/x.png   # headless (playwright)
  ```
  URL params: `?file=jupiter.json&m=0&t=0.4&play=1`. Orbit/zoom with mouse, time slider, play speed, mission picker.

## Known limitations
* Global optimisation is stochastic and not fully converged on 4-5 flyby sequences (Galileo case: dates match,
  but optimiser leaves ~0.3-0.6 km/s of DSM that the real mission did not need).
* three.js is vendored (v0.160) in viewer/vendor; labels can overlap when events cluster near Earth.
* Patched conics, impulsive burns, no launch/arrival declination constraints, no planetary moons (no Titan/Ganymede assists).
* Optimizer is stochastic; increase `--iters/--seeds` for better solutions. Min-Δv outer-planet solutions
  tend to sit at the max-TOF bound.
* Aerocapture/entry and radiation thresholds are crude estimates; no heating/g-load model.
* Starship performance numbers are public ballpark estimates only.

## v0.3 — crew radiation, hazards, radiation-aware routes, console UI (2026-10-17)

```
python radiation_run.py --mc 800            # dose + hazards for every mission JSON, Pareto (Δv vs dose), low-dose alternatives, plots
python verification/radiation_check.py && python verification/make_report.py   # rebuild VERIFICATION.md
```
* `starship/radiation.py` — GCR (CRaTER-slope / RAD-amplitude fit vs Oulu φ, 3 %/AU gradient), solar cycle (NOAA SWPC JSON + cycle-26 Monte Carlo),
  SPE Poisson model on the 1956-2023 E>30 MeV catalogue, Earth/Jupiter belts, hull 4 mm 304L + configurable water shelter (`--shelter g/cm²`).
* `starship/hazards.py` — ORDEM-3.0-derived debris during refuelling loiter, Grün micrometeoroids, asteroid belt, ring planes, aerocapture
  3-DOF/Sutton-Graves, comms delay & solar conjunction, BVAD consumables.
* Outputs: `output/<planet>/dose_cumulative.png`, `output/<planet>/pareto_dv_dose.png`, `output/radiation_summary.json`; viewer JSONs gain
  `radiation`, `risk`, `pareto`. Original JSONs are kept in `viewer/missions_base/`.
* All radiation/hazard figures are ESTIMATES; validation status (incl. FAILs) is in `VERIFICATION.md` → "Crew radiation and hazard models".
* Viewer: console layout (comparison table sortable by Δv/TOF/dose/risk, event table, Δv budget, radiation chart synced to the timeline,
  shelter toggle, crew-compartment cutaway with dose heat-map/particles, hazards table, timeline strips for GCR rate and 30-day SPE probability).
  Query params: `file=`, `m=`, `t=`, `sort=dose`, `shelter=0`, `scale=enlarged`.

## v0.4 — Mission architectures

`python architecture_run.py [--planets mars,venus,jupiter] [--modes conjunction,opposition,isru] [--stay D] [--regolith 0|0.5|1.0] [--isru-power-kw 1000] [--crew 12]`
(or `python plan.py --to mars --mode conjunction,opposition,isru ...`, which calls it after the one-way search). Run after `radiation_run.py`.

* **one-way** – existing missions (unchanged).
* **conjunction** (Mars) – outbound from the porkchop grid + return Lambert search for stays 400–620 d; orbit stay (aerocapture to 400 km LMO), no landing.
* **opposition** (Mars) – stay 30–60 d; return either direct or via a powered Venus flyby (2-leg Lambert grid, `maneuvers.flyby`).
* **isru** (Mars) – lands (aero entry + 0.70 km/s propulsive landing, 0.67–0.81 sourced), makes methalox on the surface, single-stage ascent 4.15 km/s + TEI. Three stay classes (30–60, 400–620, 1150–1400 d) unless `--stay`. Reports propellant, production rate, power (13.6 kWh/kg, 11.2–20.2), plant mass, fission vs solar mass, cargo ships, and whether a plant of `--isru-power-kw` finishes in time.
* **round-trip** (Venus, Jupiter) – orbit stay, return from the capture orbit (Jupiter: 20 Rj periapsis, e = 0.9, periapsis passes dosed).
* Earth return: entry speed; if > 12.5 km/s (ESTIMATE) a perigee braking burn is charged. Entry g/heating from the 3-DOF integrator.
* Radiation over the full timeline; surface 0.64 ± 0.12 mSv/d (MSL/RAD), regolith 0 / 0.5 / 1 m (Geant4 factors), Mars-orbit planet shadow credited.
* Hazards added: Mars EDL, ascent, global dust storm probability, surface ops, ISRU scale-up, Earth entry, propellant needed at destination.
* Viewer: mode filter, DUR/STAY columns, architecture & ISRU panel, power-vs-time chart, habitat (regolith) toggle, stay phase shading. Query: `?file=mars.json&mode=isru&pick=400&reg=1`.
* Validation: `python verification/architecture_check.py && python verification/make_report.py` (section "v0.4" in VERIFICATION.md).

## Data files not in this repo
Large data files are excluded. Before running, download them into `planner/data/`:
- `de440s.bsp`: JPL planetary ephemeris, from https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de440s.bsp
- `hyg.csv`: HYG star catalog v4.1, from https://codeberg.org/astronexus/hyg (used only to build the viewer's star field)
The cached ephemeris table (`ephem_table_1950_2100.npz`) is regenerated automatically from `de440s.bsp`.
