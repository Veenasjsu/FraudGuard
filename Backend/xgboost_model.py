import pandas as pd
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
import joblib

# Load dataset
df = pd.read_csv('./data/train.csv')
feature_columns = ['amt', 'city_pop', 'lat', 'long', 'merch_lat', 'merch_long']

# Prepare features and target
y = df['is_fraud'].squeeze()
X = df[feature_columns]

# Ensure consistent columns and handle missing values in pre-split data
train_cols = X.select_dtypes(include=['number']).columns
X = X[train_cols].fillna(X[train_cols].mean())

# Split into train and test sets (80/20 split)
# Using stratified split to maintain fraud class distribution
X_train, X_test, y_train, y_test = train_test_split(
    X, y, 
    test_size=0.2, 
    random_state=42, 
    stratify=y
)

print(f"Training set size: {len(X_train)} samples")
print(f"Test set size: {len(X_test)} samples")
print(f"Training set fraud rate: {y_train.mean():.4f}")
print(f"Test set fraud rate: {y_test.mean():.4f}")

# Train model ONLY on training data
model = XGBClassifier(random_state=42, eval_metric='logloss')
model.fit(X_train, y_train)

# Evaluate on test set to check for overfitting
train_score = model.score(X_train, y_train)
test_score = model.score(X_test, y_test)
print(f"\nTraining accuracy: {train_score:.4f}")
print(f"Test accuracy: {test_score:.4f}")
print(f"Overfitting gap: {train_score - test_score:.4f}")

if train_score - test_score > 0.1:
    print("⚠️  WARNING: Large gap between train and test accuracy suggests overfitting!")

# Save model
joblib.dump(model, 'fraud_model_xgb.pkl')
print(f"\n✅ Model saved to 'fraud_model_xgb.pkl'")

