from kafka import KafkaConsumer
import json
import joblib
import asyncio
from fraud_ws_server import broadcast_alert

import warnings
warnings.filterwarnings("ignore", category=UserWarning)


# Load the trained model
model = joblib.load("fraud_model.pkl")

# Set up the Kafka consumer
consumer = KafkaConsumer(
    'transactions',
    bootstrap_servers='fraudguard-kafka:9092',
    value_deserializer=lambda m: json.loads(m.decode('utf-8'))
)

print("✅ Kafka Consumer started. Waiting for messages...")

# Consume messages
for msg in consumer:
    transaction = msg.value

    # Match your trained model's feature columns:
    features = [transaction.get(k) for k in ['amt', 'city_pop', 'lat', 'long', 'merch_lat', 'merch_long']]
    
    try:
        prediction = model.predict([features])[0]
        asyncio.run(broadcast_alert(transaction))
        # if prediction == 1:
        #     print("🚨 Fraud Detected:", transaction)
        #     asyncio.run(broadcast_alert(transaction))  # ✅ send to frontend
    except Exception as e:
        print("⚠️ Error during prediction:", e)
