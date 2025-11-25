# kafka_fraud_consumer.py
import os
import json
import ast
from time import sleep
from typing import Dict, Any, List, Optional

import joblib
import requests
import pandas as pd
from kafka import KafkaConsumer
from kafka.errors import NoBrokersAvailable

# ---------- Config ----------
RF_MODEL_PATH = os.getenv("RF_MODEL_PATH", "fraud_model.pkl")
XGB_MODEL_PATH = os.getenv("XGB_MODEL_PATH", "fraud_model_xgb.pkl")
IF_MODEL_PATH = os.getenv("IF_MODEL_PATH", "fraud_unsupervised.pkl")
WS_URL = os.getenv("WS_URL", "http://ws:8000/broadcast")
BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "fraudguard-kafka:9092")
TOPIC = os.getenv("KAFKA_TOPIC", "transactions")
GROUP_ID = os.getenv("KAFKA_GROUP_ID", "fraudguard-python-ws")  # use a unique group id

# Pin the broker API version to avoid kafka-python's auto-probe (which can raise NoBrokersAvailable
# even when TCP is open). If your broker differs, adjust e.g. (3, 5, 0) or (3, 4, 0).
API_VERSION = (3, 5, 0)

# Startup retry settings
CONNECT_TRIES = int(os.getenv("KAFKA_CONNECT_TRIES", "20"))
CONNECT_DELAY = float(os.getenv("KAFKA_CONNECT_DELAY", "3"))  # seconds

# ---------- Models ----------
print("Loading models...")
rf_model = joblib.load(RF_MODEL_PATH)
print(f"✅ RandomForest model loaded from {RF_MODEL_PATH}")

try:
    xgb_model = joblib.load(XGB_MODEL_PATH)
    print(f"✅ XGBoost model loaded from {XGB_MODEL_PATH}")
except Exception as e:
    print(f"⚠️ Could not load XGBoost model: {e}")
    xgb_model = None

try:
    if_model = joblib.load(IF_MODEL_PATH)
    print(f"✅ Isolation Forest model loaded from {IF_MODEL_PATH}")
except Exception as e:
    print(f"⚠️ Could not load Isolation Forest model: {e}")
    if_model = None

# Try to read exact columns the model expects (works for sklearn >= 1.0)
try:
    EXPECTED: List[str] = list(rf_model.feature_names_in_)  # type: ignore[attr-defined]
except Exception:
    # Fallback if model doesn't expose feature_names_in_
    EXPECTED = ['amt', 'city_pop', 'lat', 'long', 'merch_lat', 'merch_long']


def to_dataframe(tx: Dict[str, Any]) -> pd.DataFrame:
    """Build a 1-row DataFrame with EXACT training column names and numeric types."""
    missing = [c for c in EXPECTED if c not in tx]
    if missing:
        print(f"⚠️ Missing expected fields: {missing}; defaulting them to 0.0")

    row: Dict[str, float] = {}
    for col in EXPECTED:
        v = tx.get(col)
        try:
            row[col] = float(v) if v is not None else 0.0
        except Exception:
            row[col] = 0.0
    return pd.DataFrame([row], columns=EXPECTED)


def send_alert(payload: Dict[str, Any]) -> None:
    """POST to the websocket broadcaster via its HTTP /broadcast. Fail fast so we don't block scoring."""
    try:
        requests.post(WS_URL, json=payload, timeout=1.0)
    except Exception as e:
        print("⚠️ failed to POST to WS:", e)


def make_consumer(tries: int = CONNECT_TRIES, delay: float = CONNECT_DELAY) -> KafkaConsumer:
    """Create a KafkaConsumer with retries and fixed api_version to avoid auto-probe."""
    last_err: Optional[Exception] = None
    for i in range(1, tries + 1):
        try:
            c = KafkaConsumer(
                TOPIC,
                bootstrap_servers=BOOTSTRAP,
                api_version=API_VERSION,
                # Parse manually in the loop; do not use value_deserializer here
                auto_offset_reset="latest",
                enable_auto_commit=True,
                group_id=GROUP_ID,
                # Network behavior explicit
                request_timeout_ms=30000,   # 30s request timeout
                session_timeout_ms=10000,   # 10s session timeout
                heartbeat_interval_ms=3000, # 3s heartbeat
                # IMPORTANT: do NOT set consumer_timeout_ms → iterator blocks forever
                max_poll_records=50,        # modest batch size
            )
            # Touch metadata to ensure we’re really connected
            parts = c.partitions_for_topic(TOPIC)
            if parts is None:
                print(f"ℹ️ Connected to Kafka, but topic '{TOPIC}' has no metadata yet (attempt {i}/{tries}).")
            else:
                print(f"✅ Connected to Kafka. '{TOPIC}' partitions: {parts}")
            return c
        except NoBrokersAvailable as e:
            last_err = e
            print(f"⏳ Kafka not ready (attempt {i}/{tries}); retrying in {delay}s...")
            sleep(delay)
        except Exception as e:
            last_err = e
            print(f"⚠️ Unexpected error creating KafkaConsumer (attempt {i}/{tries}): {e}")
            sleep(delay)
    raise SystemExit(f"Kafka not reachable after {tries} attempts: {last_err}")


def predict_with_all_models(X: pd.DataFrame) -> Dict[str, Any]:
    """Run all three models and return predictions with probabilities."""
    results = {}
    
    # RandomForest prediction
    try:
        rf_pred = int(rf_model.predict(X)[0])
        rf_proba = None
        try:
            rf_proba = float(rf_model.predict_proba(X)[0][1])
        except Exception:
            pass
        results['rf_fraud_prediction'] = rf_pred
        results['rf_score'] = rf_proba
        # For backward compatibility, also set 'fraud' to RF prediction
        results['fraud'] = rf_pred
        results['score'] = rf_proba
    except Exception as e:
        print(f"⚠️ RF prediction error: {e}")
        results['rf_fraud_prediction'] = 0
        results['fraud'] = 0
    
    # XGBoost prediction
    if xgb_model is not None:
        try:
            xgb_pred = int(xgb_model.predict(X)[0])
            xgb_proba = None
            try:
                xgb_proba = float(xgb_model.predict_proba(X)[0][1])
            except Exception:
                pass
            results['xgb_fraud_prediction'] = xgb_pred
            results['xgb_score'] = xgb_proba
        except Exception as e:
            print(f"⚠️ XGB prediction error: {e}")
            results['xgb_fraud_prediction'] = 0
    else:
        results['xgb_fraud_prediction'] = 0
    
    # Isolation Forest prediction
    if if_model is not None:
        try:
            if_pred_raw = if_model.predict(X)[0]
            # Isolation Forest returns -1 for anomaly (fraud), 1 for normal
            if_pred = 1 if if_pred_raw == -1 else 0
            results['if_fraud_prediction'] = if_pred
            # IF doesn't provide probability scores
        except Exception as e:
            print(f"⚠️ IF prediction error: {e}")
            results['if_fraud_prediction'] = 0
    else:
        results['if_fraud_prediction'] = 0
    
    return results


def main():
    consumer = make_consumer()
    print(f"✅ Kafka Consumer started on topic '{TOPIC}'. Waiting for messages...")

    try:
        for msg in consumer:
            # --- robust parse of msg.value ---
            try:
                raw = msg.value  # bytes (may be None for tombstones)
                if raw is None:
                    print("⚠️ Skipping message (None value)")
                    continue

                text = raw.decode("utf-8", errors="replace").strip()
                if not text:
                    print("⚠️ Skipping message (empty)")
                    continue

                try:
                    tx = json.loads(text)         # proper JSON (double quotes)
                except Exception:
                    tx = ast.literal_eval(text)   # Python-dict-looking strings (single quotes)

                if not isinstance(tx, dict):
                    print(f"⚠️ Skipping message (not an object): {text[:120]}")
                    continue

            except Exception as e:
                print(f"⚠️ Skipping message (cannot parse): {e}")
                continue

            # --- scoring + broadcast ---
            try:
                X = to_dataframe(tx)
                predictions = predict_with_all_models(X)

                # concise, human-friendly log line to stdout
                rf_pred = predictions.get('rf_fraud_prediction', 0)
                rf_proba = predictions.get('rf_score')
                base = (f"[TX] part={msg.partition} off={msg.offset} "
                        f"RF={rf_pred} XGB={predictions.get('xgb_fraud_prediction', 0)} "
                        f"IF={predictions.get('if_fraud_prediction', 0)}"
                        + (f" proba={rf_proba:.4f}" if rf_proba is not None else ""))
                amt = tx.get("amt"); city_pop = tx.get("city_pop")
                extra = []
                if amt is not None:     extra.append(f"amt={amt}")
                if city_pop is not None: extra.append(f"city_pop={city_pop}")
                if extra: base += " " + " ".join(extra)
                print(base)

                enriched = {
                    **tx,
                    **predictions,  # Includes all model predictions
                    "kafka_partition": msg.partition,
                    "kafka_offset": msg.offset,
                    "kafka_ts": msg.timestamp,
                }
                send_alert(enriched)

            except Exception as e:
                print("⚠️ Error during prediction:", e)

    except KeyboardInterrupt:
        print("👋 Shutting down consumer...")
    finally:
        try:
            consumer.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
