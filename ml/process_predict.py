import sys, json, joblib, argparse
from pathlib import Path
import numpy as np
import pandas as pd

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("crop")
    ap.add_argument("stage")
    ap.add_argument("N", type=float)
    ap.add_argument("P", type=float)
    ap.add_argument("K", type=float)
    ap.add_argument("temperature", type=float)
    ap.add_argument("humidity", type=float)
    ap.add_argument("ph", type=float)
    ap.add_argument("rainfall", type=float)
    ap.add_argument("--rules", default="all_crops_stage_guide.json")
    ap.add_argument("--model", default="process_eval_pipeline.joblib")
    ap.add_argument("--threshold", type=float, default=0.4)  # <<< tune here
    args = ap.parse_args()

    pipe = joblib.load(args.model)
    with open(args.rules, "r") as f:
        rules = json.load(f)

    row = {
        "crop": args.crop,
        "stage": args.stage,
        "N": args.N, "P": args.P, "K": args.K,
        "temperature": args.temperature, "humidity": args.humidity,
        "ph": args.ph, "rainfall": args.rainfall
    }
    X = pd.DataFrame([row])
    proba = pipe.predict_proba(X)[:,1][0]
    pred = int(proba >= args.threshold)

    # Rule flags & advice
    c = rules["crops"].get(args.crop, {})
    st = next((s for s in c.get("stages",[]) if s["stage"] == args.stage), None)
    flags = {}
    if st:
        for k in ["N","P","K","temperature","humidity","ph","rainfall"]:
            rr = st["ideal_ranges"][k]
            v = row[k]
            flags[k] = "ok" if (rr["min"] <= v <= rr["max"]) else ("low" if v < rr["min"] else "high")
    else:
        flags = {k:"unknown" for k in ["N","P","K","temperature","humidity","ph","rainfall"]}

    tips = []
    for k,stat in flags.items():
        if stat == "low":  tips.append(f"Increase {k}")
        elif stat == "high": tips.append(f"Reduce {k}")
    advice = ", ".join(tips) if tips else "All within the recommended range."

    out = {
        "prediction": "suitable" if pred==1 else "not suitable",
        "suitability_score": round(float(proba), 3),
        "threshold": args.threshold,
        "flags": flags,
        "advice": advice
    }
    print(json.dumps(out))

if __name__ == "__main__":
    main()
