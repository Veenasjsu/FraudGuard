from kafka import KafkaConsumer
import json
import joblib
import pandas as pd
from collections import defaultdict
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
import time
from datetime import datetime
import requests
import os

# Model paths
XGB_MODEL_PATH = '/opt/app/fraud_model_xgb.pkl'
RF_MODEL_PATH = '/opt/app/fraud_model.pkl'
IF_MODEL_PATH = '/opt/app/fraud_unsupervised.pkl'

# Load models
print("Loading models...")
xgb_model = joblib.load(XGB_MODEL_PATH)
rf_model = joblib.load(RF_MODEL_PATH)
if_model = joblib.load(IF_MODEL_PATH)
print("All models loaded successfully!")

# Feature columns
FEATURE_COLUMNS = ['amt', 'city_pop', 'lat', 'long', 'merch_lat', 'merch_long']

# Storage for predictions and ground truth
predictions_xgb = []
predictions_rf = []
predictions_if = []
ground_truth = []

# Metrics calculation interval (calculate every N transactions)
METRICS_INTERVAL = 100

# WebSocket server URL for sending metrics
WS_URL = os.getenv("WS_URL", "http://ws:8000/broadcast")

def calculate_metrics(y_true, y_pred, model_name):
    """Calculate and return all metrics for a model"""
    if len(y_true) == 0 or len(y_pred) == 0:
        return None
    
    # Calculate confusion matrix
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    
    # Calculate metrics
    accuracy = accuracy_score(y_true, y_pred)
    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    
    return {
        'model': model_name,
        'tp': int(tp),
        'fp': int(fp),
        'tn': int(tn),
        'fn': int(fn),
        'accuracy': float(accuracy),
        'precision': float(precision),
        'recall': float(recall),
        'f1_score': float(f1),
        'total_samples': len(y_true)
    }

def send_metrics(metrics_dict):
    """Send metrics to WebSocket server"""
    if metrics_dict is None:
        return
    
    try:
        # Add timestamp and type indicator
        payload = {
            **metrics_dict,
            'type': 'metrics',
            'timestamp': datetime.now().isoformat(),
            'ts': int(time.time() * 1000)  # epoch milliseconds
        }
        requests.post(WS_URL, json=payload, timeout=2.0)
    except Exception as e:
        print(f"⚠️ Failed to send metrics to WS server: {e}")

def print_metrics(metrics_dict):
    """Print formatted metrics"""
    if metrics_dict is None:
        return
    
    print("\n" + "=" * 80)
    print(f"METRICS FOR {metrics_dict['model'].upper()} MODEL")
    print("=" * 80)
    print(f"Total Samples: {metrics_dict['total_samples']}")
    print(f"True Positives (TP):  {metrics_dict['tp']}")
    print(f"False Positives (FP): {metrics_dict['fp']}")
    print(f"True Negatives (TN):  {metrics_dict['tn']}")
    print(f"False Negatives (FN): {metrics_dict['fn']}")
    print(f"Accuracy:  {metrics_dict['accuracy']:.4f}")
    print(f"Precision: {metrics_dict['precision']:.4f}")
    print(f"Recall:    {metrics_dict['recall']:.4f}")
    print(f"F1-Score:  {metrics_dict['f1_score']:.4f}")
    print("=" * 80 + "\n")
    
    # Also send to WebSocket server
    send_metrics(metrics_dict)

# Kafka consumer setup
consumer = KafkaConsumer(
    'transactions',
    bootstrap_servers='fraudguard-kafka:9092',
    value_deserializer=lambda m: json.loads(m.decode('utf-8')),
    auto_offset_reset='latest',  # Start from latest messages
    consumer_timeout_ms=10000,  # Wait 10 seconds for messages before checking again
    group_id='metrics-tracker',
    enable_auto_commit=True
)

print("=" * 80)
print("Metrics Tracker Service Started")
print(f"Calculating metrics every {METRICS_INTERVAL} transactions")
print("=" * 80)

transaction_count = 0

try:
    while True:
        try:
            message = next(consumer)
        except StopIteration:
            # No messages available, continue waiting
            continue
        transaction = message.value
        transaction_count += 1
        
        # Extract ground truth
        if 'is_fraud' in transaction:
            y_true = int(transaction['is_fraud'])
            ground_truth.append(y_true)
        else:
            continue  # Skip if no ground truth
        
        # Extract features
        try:
            features = pd.DataFrame([{
                'amt': float(transaction.get('amt', 0)),
                'city_pop': float(transaction.get('city_pop', 0)),
                'lat': float(transaction.get('lat', 0)),
                'long': float(transaction.get('long', 0)),
                'merch_lat': float(transaction.get('merch_lat', 0)),
                'merch_long': float(transaction.get('merch_long', 0))
            }])
        except (ValueError, KeyError) as e:
            continue  # Skip if features are missing
        
        # Make predictions with all models
        try:
            # XGBoost prediction
            pred_xgb = xgb_model.predict(features)[0]
            predictions_xgb.append(int(pred_xgb))
            
            # RandomForest prediction
            pred_rf = rf_model.predict(features)[0]
            predictions_rf.append(int(pred_rf))
            
            # Isolation Forest prediction (returns -1 for anomaly, 1 for normal)
            pred_if_raw = if_model.predict(features)[0]
            pred_if = 1 if pred_if_raw == -1 else 0  # Convert -1/1 to 1/0
            predictions_if.append(int(pred_if))
        except Exception as e:
            print(f"Error making predictions: {e}")
            continue
        
        # Calculate and print metrics every METRICS_INTERVAL transactions
        if transaction_count % METRICS_INTERVAL == 0:
            print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Processed {transaction_count} transactions")
            
            # Calculate metrics for each model
            metrics_xgb = calculate_metrics(ground_truth, predictions_xgb, "XGBoost")
            metrics_rf = calculate_metrics(ground_truth, predictions_rf, "RandomForest")
            metrics_if = calculate_metrics(ground_truth, predictions_if, "IsolationForest")
            
            # Print metrics
            if metrics_xgb:
                print_metrics(metrics_xgb)
            if metrics_rf:
                print_metrics(metrics_rf)
            if metrics_if:
                print_metrics(metrics_if)

except KeyboardInterrupt:
    print("\nShutting down metrics tracker...")
finally:
    # Print final metrics
    if len(ground_truth) > 0:
        print("\n" + "=" * 80)
        print("FINAL METRICS SUMMARY")
        print("=" * 80)
        
        metrics_xgb = calculate_metrics(ground_truth, predictions_xgb, "XGBoost")
        metrics_rf = calculate_metrics(ground_truth, predictions_rf, "RandomForest")
        metrics_if = calculate_metrics(ground_truth, predictions_if, "IsolationForest")
        
        if metrics_xgb:
            print_metrics(metrics_xgb)
        if metrics_rf:
            print_metrics(metrics_rf)
        if metrics_if:
            print_metrics(metrics_if)
    
    consumer.close()

