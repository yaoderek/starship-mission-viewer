# Verification report — Starship mission planner

Generated 2026-10-17 14:26 PDT. Every number below was produced by the scripts in `verification/`
(re-run them to reproduce): `horizons_check.py`, `lambert_check.py`, `hohmann_check.py`,
`trajbrowser_compare.py`, `historical.py`, `starship_sensitivity.py`, `recompute_vehicle.py`, `make_report.py`.
Pass criteria: ephemeris |Δr| < 1 km; Lambert rel. error < 1e-6; Hohmann < 0.5 %; Trajectory Browser C3 < 3 %,
injection Δv < 2 %, arrival Δv < 5 %; historical launch C3 within 15 %.
