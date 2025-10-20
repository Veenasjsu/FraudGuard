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
MODEL_PATH = os.getenv("MODEL_PATH", "fraud_model.pkl")
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

# ---------- Model ----------
model = joblib.load(MODEL_PATH)

# Try to read exact columns the model expects (works for sklearn >= 1.0)
try:
    EXPECTED: List[str] = list(model.feature_names_in_)  # type: ignore[attr-defined]
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


def predict_with_optional_proba(X: pd.DataFrame):
    """Return (pred:int, proba:Optional[float])"""
    proba: Optional[float] = None
    try:
        proba = float(model.predict_proba(X)[0][1])  # type: ignore[call-arg]
    except Exception:
        # Model may not support predict_proba
        pass
    pred = int(model.predict(X)[0])
    return pred, proba


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
                pred, proba = predict_with_optional_proba(X)

                # concise, human-friendly log line to stdout
                base = (f"[TX] part={msg.partition} off={msg.offset} pred={pred}"
                        + (f" proba={proba:.4f}" if proba is not None else ""))
                amt = tx.get("amt"); city_pop = tx.get("city_pop")
                extra = []
                if amt is not None:     extra.append(f"amt={amt}")
                if city_pop is not None: extra.append(f"city_pop={city_pop}")
                if extra: base += " " + " ".join(extra)
                print(base)

                enriched = {
                    **tx,
                    "fraud": pred,
                    **({"score": proba} if proba is not None else {}),
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
