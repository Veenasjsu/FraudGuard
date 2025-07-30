from kafka import KafkaProducer
import pandas as pd, json, time

# Read your 1M transactions
df = pd.read_csv("/opt/data/train.csv")

producer = KafkaProducer(
    bootstrap_servers='fraudguard-kafka:9092',
    value_serializer=lambda v: json.dumps(v).encode('utf-8')
)

# Stream at ~50 tx/sec
for i, row in df.iterrows():
    producer.send("transactions", row.to_dict())
    print(f"📤 Sent transaction {i+1}: {row.to_dict()}")  
    time.sleep(0.02)

print("Finished streaming.")