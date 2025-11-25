from kafka import KafkaProducer
import pandas as pd, json, time
import os

# Determine which dataset to use
# Use test set if available, otherwise use full dataset
test_set_path = "/opt/data/test_set.csv"
train_set_path = "/opt/data/train.csv"

if os.path.exists(test_set_path):
    print(f"✅ Using test set: {test_set_path}")
    df = pd.read_csv(test_set_path)
    print(f"   Streaming {len(df)} test transactions (unseen by models)")
else:
    print(f"Test set not found, using full training set: {train_set_path}")
    print("   WARNING: Model may be evaluated on training data!")
    df = pd.read_csv(train_set_path)

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