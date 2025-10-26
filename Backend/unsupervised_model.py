import argparse
from pathlib import Path

import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
import joblib

DATA_PATH = Path('../data/train.csv')
OUT_PATH = Path('../fraud_unsupervised.pkl')  # saved to project root by default

def load_features(path, feature_columns):
    df = pd.read_csv(path)
    X = df[feature_columns]
    # keep only numeric columns and fill missing values with column mean
    num_cols = X.select_dtypes(include=['number']).columns
    X = X[num_cols].fillna(X[num_cols].mean())
    return X

def build_pipeline(contamination=0.01, random_state=42):
    clf = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        random_state=random_state
    )
    pipe = Pipeline([
        ('scaler', StandardScaler()),
        ('iforest', clf)
    ])
    return pipe

def main(args):
    feature_columns = ['amt', 'city_pop', 'lat', 'long', 'merch_lat', 'merch_long']
    X = load_features(DATA_PATH, feature_columns)
    pipe = build_pipeline(contamination=args.contamination, random_state=args.random_state)

    print(f"Training IsolationForest on {X.shape[0]} samples with contamination={args.contamination}...")
    pipe.fit(X)

    out = (OUT_PATH if args.output is None else Path(args.output)).resolve()
    joblib.dump(pipe, out)
    print(f"Saved unsupervised model pipeline to: {out}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train unsupervised IsolationForest for anomaly (fraud) detection")
    parser.add_argument("--contamination", type=float, default=0.01,
                        help="Proportion of outliers in the data. Adjust to expected fraud rate (default: 0.01).")
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--output", type=str, default=None,
                        help="Path to save pipeline (default: ../fraud_unsupervised.pkl)")
    args = parser.parse_args()
    main(args)