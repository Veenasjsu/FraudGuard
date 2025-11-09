import pandas as pd
from xgboost import XGBClassifier
import joblib

df = pd.read_csv('./data/train.csv')
feature_columns = ['amt', 'city_pop', 'lat', 'long', 'merch_lat', 'merch_long']

y_train = df['is_fraud'].squeeze()
X_train = df[feature_columns]

# Ensure consistent columns and handle missing values in pre-split data
train_cols = X_train.select_dtypes(include=['number']).columns
X_train = X_train[train_cols].fillna(X_train[train_cols].mean())

model = XGBClassifier(random_state=42, eval_metric='logloss')
model.fit(X_train, y_train) 
joblib.dump(model, 'fraud_model_xgb.pkl')

