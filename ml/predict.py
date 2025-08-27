import sys, json
from pathlib import Path
import joblib, pandas as pd

def main():
    if len(sys.argv) != 8:
        print(json.dumps({"error":"usage: predict.py N P K temperature humidity ph rainfall"}))
        return

    vals = list(map(float, sys.argv[1:]))

    model_path = Path(__file__).with_name("crop_rf_pipeline.joblib")
    if not model_path.exists():
        print(json.dumps({"error": f"model not found at {model_path}"}))
        return

    pipe = joblib.load(model_path)
    cols = ["N","P","K","temperature","humidity","ph","rainfall"]
    X = pd.DataFrame([dict(zip(cols, vals))])

    pred = pipe.predict(X)[0]

    # try to get top3
    try:
        probs = pipe.predict_proba(X)[0]
        classes = pipe.named_steps["clf"].classes_
        topk_idx = probs.argsort()[-3:][::-1]
        top3 = [classes[i] for i in topk_idx]
    except Exception:
        top3 = [pred]

    # Build JSON response
    result = {
        "prediction": pred,
        "message": f"The most suitable crop is {pred}",
        "alternatives": top3[1:] if len(top3) > 1 else []
    }

    print(json.dumps(result))

if __name__ == "__main__":
    main()
