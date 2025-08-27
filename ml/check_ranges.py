import json, sys
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else "all_crops_stage_guide.json")
data = json.loads(path.read_text(encoding="utf-8"))

bad = []
for crop, cinfo in data.get("crops", {}).items():
    for st in cinfo.get("stages", []):
        stage = st.get("stage")
        ranges = st.get("ideal_ranges", {})
        for k, rr in ranges.items():
            try:
                lo, hi = float(rr.get("min")), float(rr.get("max"))
            except Exception:
                bad.append((crop, stage, k, rr.get("min"), rr.get("max"), "min/max not numeric"))
                continue
            if hi < lo:
                bad.append((crop, stage, k, lo, hi, "max < min"))
            elif hi == lo:
                bad.append((crop, stage, k, lo, hi, "max == min"))

if not bad:
    print("All ranges look OK ✅")
else:
    print("Found issues:")
    for row in bad:
        print(f" - crop={row[0]}, stage={row[1]}, feature={row[2]} (min={row[3]}, max={row[4]}): {row[5]}")
