import json, argparse, random
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import joblib

rng = np.random.default_rng(42)
random.seed(42)

NUM_COLS = ["N","P","K","temperature","humidity","ph","rainfall"]
CAT_COLS = ["crop","stage"]

def normalize_range(rr, feature):
    """Return (lo, hi) with lo < hi. Auto-fix inverted/flat ranges and clamp ph sensibly."""
    lo = float(rr["min"])
    hi = float(rr["max"])
    # swap if inverted
    if hi < lo:
        lo, hi = hi, lo
    # widen zero-width
    if hi == lo:
        width = max(1e-6, abs(lo)*1e-4 + 1e-3)
        lo -= width/2
        hi += width/2
    # guardrails
    if feature == "ph":
        lo = max(lo, 3.0)
        hi = min(hi, 9.0)
        if hi <= lo:
            mid = (lo + hi) / 2.0
            lo = mid - 0.05
            hi = mid + 0.05
    if feature == "humidity":
        lo = max(lo, 0.0)
        hi = min(hi, 100.0)
        if hi <= lo:
            mid = (lo + hi) / 2.0
            lo = mid - 0.5
            hi = mid + 0.5
    if feature == "rainfall":
        lo = max(lo, 0.0)
        if hi <= lo:
            hi = lo + 0.1
    return lo, hi

def sample_inside(rr, n, feature):
    lo, hi = normalize_range(rr, feature)
    return rng.uniform(lo, hi, size=n)

def sample_outside(rr, n, feature, stretch_low=0.15, stretch_high=0.15):
    lo, hi = normalize_range(rr, feature)
    width = hi - lo
    if width <= 0:
        width = max(1e-3, abs(lo)*1e-4 + 1e-3)
        hi = lo + width
    half = n // 2
    below = rng.uniform(lo - stretch_low*width, lo, size=half)
    above = rng.uniform(hi, hi + stretch_high*width, size=n - half)
    return np.concatenate([below, above])

def gen_samples_for_stage(crop, stage, ranges, n_pos=300, n_neg=300):
    # POS: inside all ranges
    pos = {}
    for k in NUM_COLS:
        rr = ranges[k]
        pos[k] = sample_inside(rr, n_pos, k)
    pos_df = pd.DataFrame(pos)
    pos_df["label"] = 1

    # NEG: 1–2 features outside, others inside
    keys = list(ranges.keys())
    neg_rows = []
    for _ in range(n_neg):
        row = {}
        outside_feats = random.sample(keys, k=random.choice([1,2]))
        for k in keys:
            rr = ranges[k]
            if k in outside_feats:
                row[k] = float(sample_outside(rr, 1, k)[0])
            else:
                row[k] = float(sample_inside(rr, 1, k)[0])
        row["label"] = 0
        neg_rows.append(row)
    neg_df = pd.DataFrame(neg_rows)

    df = pd.concat([pos_df, neg_df], ignore_index=True)
    df["crop"] = crop
    df["stage"] = stage
    return df

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--rules", default="all_crops_stage_guide.json")
    p.add_argument("--out", default="process_eval_pipeline.joblib")
    p.add_argument("--pos_per_stage", type=int, default=300)
    p.add_argument("--neg_per_stage", type=int, default=300)
    args = p.parse_args()

    with open(args.rules, "r", encoding="utf-8") as f:
        rules = json.load(f)

    all_rows = []
    for crop, cinfo in rules.get("crops", {}).items():
        for st in cinfo.get("stages", []):
            stage = st["stage"]
            ranges = st["ideal_ranges"]
            # ensure every numeric key exists
            for key in NUM_COLS:
                if key not in ranges:
                    raise ValueError(f"Missing range for {crop}/{stage}/{key}")
            df_stage = gen_samples_for_stage(
                crop, stage, ranges,
                n_pos=args.pos_per_stage, n_neg=args.neg_per_stage
            )
            all_rows.append(df_stage)

    data = pd.concat(all_rows, ignore_index=True)

    X = data[CAT_COLS + NUM_COLS]
    y = data["label"].values

    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), CAT_COLS),
        ("num", "passthrough", NUM_COLS)
    ])
    base = GradientBoostingClassifier(random_state=42)
    clf = CalibratedClassifierCV(base, method="isotonic", cv=3)

    pipe = Pipeline([("pre", pre), ("clf", clf)])

    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.20, stratify=y, random_state=42)
    pipe.fit(Xtr, ytr)
    preds = pipe.predict(Xte)

    acc = accuracy_score(yte, preds)
    print(f"Balanced process-eval accuracy: {acc:.4f}")
    print(classification_report(yte, preds, digits=4))

    joblib.dump(pipe, args.out)
    print("Saved model to:", Path(args.out).resolve())
