import sys, json, joblib, argparse
from pathlib import Path
import numpy as np
import pandas as pd

# ---------- Simple, farmer-friendly advice templates ----------
# Keep it short. You can edit any text below.
ADVICE_TEMPLATES = {
    "N": {
        "low":  "Nitrogen low → Apply nitrogen fertilizer (urea/CAN). Use split doses.",
        "high": "Nitrogen high → Reduce N to avoid scorch and lodging."
    },
    "P": {
        "low":  "Phosphorus low → Band-apply DAP/TSP near roots.",
        "high": "Phosphorus high → Stop extra P; can block other nutrients."
    },
    "K": {
        "low":  "Potassium low → Apply MOP (potash).",
        "high": "Potassium high → Reduce K; can affect Mg/Ca uptake."
    },
    "ph": {
        "low":  "Soil pH low (acidic) → Apply lime.",
        "high": "Soil pH high (alkaline) → Use elemental sulfur/acidifying inputs."
    },
    "temperature": {
        "low":  "Temperature low → Mulch/cover; use tolerant variety.",
        "high": "Temperature high → Provide shade/mulch; irrigate to cool."
    },
    "humidity": {
        "low":  "Humidity low → Irrigate more; use mulch/windbreaks.",
        "high": "Humidity high → Improve airflow; watch for foliar diseases."
    },
    "rainfall": {
        "low":  "Rainfall low → Add water / increase irrigation.",
        "high": "Rainfall high → Improve drainage; pause irrigation."
    }
}

ALL_OK_MSG = "All good. Keep current practices."

def build_advice(flags):
    """
    Convert flags to short, bullet-point advice.
    flags: dict like {'N':'low','P':'ok',...}
    Returns a single string with newline bullets (good for your UI).
    """
    tips = []
    for k, stat in flags.items():
        if stat == "low":
            msg = ADVICE_TEMPLATES.get(k, {}).get("low")
            if msg: tips.append(msg)
        elif stat == "high":
            msg = ADVICE_TEMPLATES.get(k, {}).get("high")
            if msg: tips.append(msg)
        # 'ok' or 'unknown' -> no tip

    # De-duplicate while preserving order
    seen = set()
    uniq = []
    for t in tips:
        if t not in seen:
            uniq.append(t)
            seen.add(t)

    if not uniq:
        return ALL_OK_MSG

    # Return bullet points (newline list). Your frontend shows this as:
    # Advice: - point1\n- point2 ...
    return "\n".join(f"- {t}" for t in uniq)

# ---------- Helpers for case-insensitive lookup + stage aliases ----------
def normalize(s):
    return str(s).strip().lower()

STAGE_ALIASES = {
    "land_prep": "preplant",
    "soil_management": "preplant",
    "planting": "planting",
    "irrigation": "vegetative",
    "weed_control": "vegetative",
    "pest_management": "vegetative",
    "fertilization": "vegetative",
    "harvest": "harvest",
}

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
    ap.add_argument("--threshold", type=float, default=0.4)  # tune if needed
    args = ap.parse_args()

    # Load model
    pipe = joblib.load(args.model)

    # Load rules/ranges
    with open(args.rules, "r", encoding="utf-8") as f:
        rules = json.load(f)

    # Assemble input row
    row = {
        "crop": args.crop,
        "stage": args.stage,
        "N": args.N, "P": args.P, "K": args.K,
        "temperature": args.temperature, "humidity": args.humidity,
        "ph": args.ph, "rainfall": args.rainfall
    }
    X = pd.DataFrame([row])

    # Predict suitability probability
    proba = pipe.predict_proba(X)[:, 1][0]
    pred = int(proba >= args.threshold)

    # ---- Case-insensitive crop/stage lookup + aliases (robust flags) ----
    crop_key = normalize(args.crop)
    stage_key = normalize(STAGE_ALIASES.get(normalize(args.stage), args.stage))

    crops_dict = rules.get("crops", {})
    ci_crops = { normalize(k): v for k, v in crops_dict.items() }
    c = ci_crops.get(crop_key, {})

    st = None
    for s in c.get("stages", []):
        if normalize(s.get("stage")) == stage_key:
            st = s
            break

    keys = ["N","P","K","temperature","humidity","ph","rainfall"]

    if st and "ideal_ranges" in st:
        flags = {}
        for k in keys:
            rr = st["ideal_ranges"][k]
            v = row[k]
            flags[k] = "ok" if (rr["min"] <= v <= rr["max"]) else ("low" if v < rr["min"] else "high")
    else:
        # Generic fallback so farmers still get useful tips even if rules miss
        GENERIC = {
            "N": {"min":80,"max":120}, "P":{"min":40,"max":60}, "K":{"min":40,"max":60},
            "ph":{"min":6.0,"max":7.0}, "temperature":{"min":18,"max":30},
            "humidity":{"min":50,"max":80}, "rainfall":{"min":50,"max":250}
        }
        flags = {}
        for k in keys:
            v = row[k]
            rr = GENERIC[k]
            flags[k] = "ok" if (rr["min"] <= v <= rr["max"]) else ("low" if v < rr["min"] else "high")

    # --- Farmer-friendly advice (bullet points) ---
    advice = build_advice(flags)

    out = {
        "prediction": "suitable" if pred == 1 else "not suitable",
        "suitability_score": round(float(proba), 3),
        "threshold": args.threshold,
        "flags": flags,
        "advice": advice
    }
    print(json.dumps(out))

if __name__ == "__main__":
    main()
