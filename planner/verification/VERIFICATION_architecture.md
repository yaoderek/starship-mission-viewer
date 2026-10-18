
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
