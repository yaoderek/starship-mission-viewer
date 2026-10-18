"""Query NASA Ames Trajectory Browser (https://trajbrowser.arc.nasa.gov) for direct rendezvous optima."""
import re, sys, json, subprocess
def q(target, y1, y2, maxdt_yrs, maxdv=20):
    data = f"maxMag=25&maxOCC=4&chk_target_list=on&target_list={target}&mission_class=oneway&mission_type=rendezvous&LD1={y1}&LD2={y2}&maxDT={maxdt_yrs}&DTunit=yrs&maxDV={maxdv}&min=DV&wdw_width=0&submit=Search"
    s = subprocess.run(["curl", "-s", "-m", "180", "-X", "POST", "https://trajbrowser.arc.nasa.gov/traj_browser.php", "-d", data],
                       capture_output=True, text=True).stdout
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", t, flags=re.S)
    out = [[re.sub(r"<[^>]+>|&nbsp;", " ", c).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, flags=re.S)] for r in rows]
    out = [r for r in out if r and any(ch.isdigit() for ch in " ".join(r))]
    err = re.findall(r"Query error[^<]*", t)
    return out, err, s
if __name__ == "__main__":
    res = {}
    for tgt, y1, y2, dt in [("Mars", 2033, 2034, 1.5), ("Mars", 2035, 2036, 1.5), ("Venus", 2031, 2032, 1), ("Jupiter", 2028, 2029, 6)]:
        rows, err, raw = q(tgt, y1, y2, dt)
        key = f"{tgt}_{y1}"; res[key] = rows
        open(f"verification/tb_{key}.html", "w").write(raw)
        print(key, err); [print("  ", r) for r in rows[-12:]]
    json.dump(res, open("verification/trajbrowser.json", "w"), indent=1)
