import json, numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
for tgt in ("mars", "venus", "jupiter"):
    d = json.load(open(f"viewer/missions/{tgt}.json")); fig, ax = plt.subplots(figsize=(9, 5))
    for m in d["missions"]:
        if m.get("mode", "one-way") == "one-way" and m["rank"] > 1: continue
        R = m["radiation"]; t = np.array(R["jd"]) - R["jd"][0]
        l, = ax.plot(t, R["tot_mean_sh"], lw=1.2, label=f"{m.get('mode','one-way')} {m.get('variant','')} {m['summary']['launch']}")
        ax.fill_between(t, R["tot_mean_sh"], R["tot_p95_sh"], color=l.get_color(), alpha=.1)
    ax.axhline(600, color="r", ls="--", lw=.8); ax.text(5, 620, "NASA career limit 600 mSv", color="r", fontsize=8)
    ax.set_xlabel("mission elapsed time (d)"); ax.set_ylabel("cumulative effective dose, sheltered (mSv)"); ax.grid(alpha=.2); ax.legend(fontsize=7)
    ax.set_title(f"{tgt.title()} architectures: cumulative crew dose (mean; band to p95) — ESTIMATE", fontsize=9)
    fig.tight_layout(); fig.savefig(f"output/{tgt}/dose_architectures.png", dpi=130); plt.close(fig)
