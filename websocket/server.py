import time
import json
from kafka import KafkaConsumer
from flask import Flask
from flask_socketio import SocketIO
from threading import Thread

# Flask and SocketIO setup
app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

# Kafka consumer setup
KAFKA_BROKER = 'kafka:9092'  # Must match the service name in docker-compose
KAFKA_TOPIC = 'realtime_fraud_metrics'

def kafka_listener():
    # Set up the consumer to read from the specified topic
    consumer = KafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=[KAFKA_BROKER],
        auto_offset_reset='latest',  # Start reading new messages
        enable_auto_commit=True,
        value_deserializer=lambda x: json.loads(x.decode('utf-8'))
    )

    print("Starting Kafka consumer...")
    for message in consumer:
        # The message value is the JSON payload produced by Spark's to_json()
        metric_data = message.value
        
        # Emit the data to all connected React clients
        socketio.emit('new_metric', metric_data)
        print(f"Emitted real-time metric: {metric_data['fraud_rate_pct']:.2f}%")

# Start the Kafka listener thread when the server starts
@socketio.on('connect')
def test_connect():
    print('Client connected!')

# Start the Kafka listener in a separate thread
kafka_thread = Thread(target=kafka_listener)
kafka_thread.daemon = True
kafka_thread.start()

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000)