# ml/train_model.py
import pandas as pd
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
import joblib

def train(input_csv, output_joblib):
    df = pd.read_csv(input_csv)
    X = df.drop(columns=['label'])
    y = df['label']

    preprocess = ColumnTransformer(
        transformers=[("num", "passthrough", X.columns.tolist())],
        remainder="drop"
    )

    rf = RandomForestClassifier(n_estimators=250, n_jobs=-1, random_state=42)
    pipe = Pipeline(steps=[("preprocess", preprocess), ("clf", rf)])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    pipe.fit(X_train, y_train)
    y_pred = pipe.predict(X_test)
    print("Accuracy:", round(accuracy_score(y_test, y_pred), 4))
    print(classification_report(y_test, y_pred, zero_division=0))

    joblib.dump(pipe, output_joblib)
    print("Saved model to:", output_joblib)

if __name__ == "__main__":
    # CSV is in the same ml directory
    input_csv = Path(__file__).with_name("Crop_recommendation.csv")
    output_joblib = Path(__file__).with_name("crop_rf_pipeline.joblib")
    train(str(input_csv), str(output_joblib))
