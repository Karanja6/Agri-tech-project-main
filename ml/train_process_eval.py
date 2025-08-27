import json, argparse
import pandas as pd
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import joblib
from pathlib import Path

def within(ranges, x):
    return (x >= ranges["min"]) and (x <= ranges["max"])

def label_from_json(crop, stage, row, rules):
    c = rules["crops"].get(crop)
    if not c: 
        return 0
    stage_rule = next((s for s in c["stages"] if s["stage"] == stage), None)
    if not stage_rule: 
        return 0
    R = stage_rule["ideal_ranges"]
    checks = [
        within(R["N"], row["N"]),
        within(R["P"], row["P"]),
        within(R["K"], row["K"]),
        within(R["temperature"], row["temperature"]),
        within(R["humidity"], row["humidity"]),
        within(R["ph"], row["ph"]),
        within(R["rainfall"], row["rainfall"]),
    ]
    return 1 if all(checks) else 0

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--csv", default="Crop_recommendation.csv")
    p.add_argument("--rules", default="all_crops_stage_guide.json")
    p.add_argument("--out", default="process_eval_pipeline.joblib")
    args = p.parse_args()

    df = pd.read_csv(args.csv)
    df.columns = [c.strip().lower() for c in df.columns]

    with open(args.rules, "r") as f:
        rules = json.load(f)

    # Create synthetic stage labels by sampling stages uniformly per row
    stages = ["preplant","planting","vegetative","harvest"]
    X_rows = []
    y = []
    for _, r in df.iterrows():
        crop = r["label"]
        features = dict(
            N=r["n"], P=r["p"], K=r["k"],
            temperature=r["temperature"], humidity=r["humidity"],
            ph=r["ph"], rainfall=r["rainfall"]
        )
        for st in stages:
            lab = label_from_json(crop, st, features, rules)
            X_rows.append({**features, "crop": crop, "stage": st})
            y.append(lab)

    X = pd.DataFrame(X_rows)
    y = np.array(y)

    # Pipeline: OneHot(crop, stage) + numeric passthrough -> GBDT
    cat_cols = ["crop","stage"]
    num_cols = ["N","P","K","temperature","humidity","ph","rainfall"]
    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), cat_cols),
        ("num", "passthrough", num_cols)
    ])
    clf = GradientBoostingClassifier(random_state=42)
    pipe = Pipeline([("pre", pre), ("clf", clf)])

    X_train, X_test, y_train, y_test = train_test_split(X, y, stratify=y, test_size=0.2, random_state=42)
    pipe.fit(X_train, y_train)
    preds = pipe.predict(X_test)
    proba = pipe.predict_proba(X_test)[:,1]
    acc = accuracy_score(y_test, preds)
    print(f"Process-eval model accuracy: {acc:.4f}")
    print(classification_report(y_test, preds, digits=4))

    joblib.dump(pipe, args.out)
    print("Saved model to:", Path(args.out).resolve())
