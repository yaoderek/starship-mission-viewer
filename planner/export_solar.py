"""Export the solar-activity, GCR and SPE model parameters the viewer needs to roll storm histories and
recompute dose for any shielding (writes ../missions/solar.json).  Same model as starship/radiation.py."""
import json, os
import numpy as np
from starship import radiation as R

S, G, P = R.solar(), R.GCR(), R.SPE()
k = R.spe_rate_k("modern")
keep = S.ot >= 2018.0
r6 = lambda a: [round(float(x), 6) for x in a]
out = dict(
    note="Solar activity, GCR and SPE model exported from planner/starship/radiation.py (ESTIMATES; see VERIFICATION.md).",
    ssn=dict(ot=r6(S.ot[keep]), obs=r6(S.ossn[keep]), pt=r6(S.pt), med=r6(S.pmed), lo=r6(S.plo), hi=r6(S.phi_),
             shape_dt=1 / 12, shape=r6(S.shape), cycle_max=r6(S.cycle_max), c26_start=list(S.c26_start),
             amp_median=float(np.median(S.cycle_max[-4:]))),
    phi=dict(lag=S.phi_lag, a=S.phi_a, b=S.phi_b, sigma=S.phi_sigma),
    gcr=dict(c0=G.c0, inv_phi0=G.inv_phi0, grad=R.GCR_RADIAL_GRAD, factor_sd=R.STARSHIP_GCR_FACTOR[1]),
    spe=dict(k=k, flu=sorted(r6(P.flu / R.PHI30_1972)), d72=R.D72.tolist(), pre_shelter=R.SPE_PRE_SHELTER_FRACTION,
             big=1e8 / R.PHI30_1972),
    hull_gcm2=R.HULL_GCM2, steel_al=R.STEEL_AL_EQ, artemis_shelter_belt=R.ARTEMIS_SHELTER_BELT,
    mars_surface=dict(column_gcm2=21.0, regolith_gcm2_per_m=150.0, spe_factor=0.5),   # architecture_run.analyze
    jup_vault=list(R.JUNO_VAULT), earth_belt=dict(central=R.EARTH_BELT["central"], lo=R.EARTH_BELT["lo"], hi=R.EARTH_BELT["hi"]),
)
json.dump(out, open(os.path.join(os.path.dirname(__file__), "..", "missions", "solar.json"), "w"), separators=(",", ":"))
print("events", len(P.flu), "k", k)
