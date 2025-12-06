# Simulation Module

The Simulation module provides the transaction data producer service for the FraudGuard application. It reads transaction data from CSV files and streams them into Apache Kafka at a configurable rate, simulating real-time financial transaction processing.

## Overview

The Simulation module consists of a single producer service that:

- Reads transaction data from CSV files (preferring test set over training set)
- Serializes transactions as JSON messages
- Publishes transactions to Kafka topic `transactions` at approximately 50 transactions per second
- Provides a realistic simulation of real-time transaction streaming

## Components

### `producer.py`

The main producer script that reads transaction data and streams it to Kafka.

**Functionality:**

- Automatically detects and prioritizes test set (`test_set.csv`) if available
- Falls back to training set (`train.csv`) if test set is not found
- Converts each transaction row to a JSON dictionary
- Publishes messages to Kafka topic `transactions`
- Streams at a rate of approximately 50 transactions per second (0.02 second delay between messages)
- Logs each transaction as it is sent

**Data Source Priority:**

1. `/opt/data/test_set.csv` - Preferred (unseen by models)
2. `/opt/data/train.csv` - Fallback (may include training data)

**Output:**

- Messages published to Kafka topic: `transactions`
- Each message contains a JSON-serialized transaction dictionary
- Transaction fields include: `amt`, `city_pop`, `lat`, `long`, `merch_lat`, `merch_long`, `is_fraud`, and other transaction metadata

**Streaming Rate:**

- Default: ~50 transactions per second (0.02 second delay)
- Configurable by modifying the `time.sleep()` value in the script

### `Dockerfile`

Containerizes the producer service using a lightweight Python base image.

**Build Process:**

- Base image: `python:3.9-slim`
- Installs dependencies from `requirements.txt`
- Copies `producer.py` to container
- Entrypoint configured via docker-compose

## Dependencies

### Core Dependencies

- **kafka-python** (2.0.2) - Kafka client library for Python
- **pandas** (2.2.2) - Data manipulation and CSV reading

### Installation

Dependencies are automatically installed during Docker image build. For local development:

```bash
pip install kafka-python==2.0.2 pandas==2.2.2
```

## Configuration

### Kafka Connection

The producer connects to Kafka using the following configuration:

- **Bootstrap Servers**: `fraudguard-kafka:9092` (Docker service name)
- **Topic**: `transactions`
- **Serialization**: JSON (UTF-8 encoded)

### Data Paths

Transaction data is expected at:

- Primary: `/opt/data/test_set.csv`
- Fallback: `/opt/data/train.csv`

These paths are mounted from the host `data/` directory in docker-compose.

### Streaming Rate

The streaming rate can be adjusted by modifying the sleep duration in `producer.py`:

```python
time.sleep(0.02)  # 50 tx/sec
time.sleep(0.01)  # 100 tx/sec
time.sleep(0.05)  # 20 tx/sec
```

## Usage

### Running via Docker Compose

The producer is automatically started as part of the FraudGuard stack:

```bash
docker-compose up producer
```

Or start the entire stack:

```bash
docker-compose up -d
```

### Viewing Producer Logs

```bash
# Follow producer logs
docker-compose logs -f producer

# View recent logs
docker-compose logs producer
```

### Expected Output

When running, you should see output like:

```
Using test set: /opt/data/test_set.csv
   Streaming 5000 test transactions (unseen by models)
Sent transaction 1: {'trans_num': 0, 'amt': 68.5, ...}
Sent transaction 2: {'trans_num': 1, 'amt': 25.0, ...}
...
Finished streaming.
```

### Running Locally (Development)

For local development without Docker:

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Ensure Kafka is accessible and update bootstrap servers:
   ```python
   producer = KafkaProducer(
       bootstrap_servers='localhost:9092',  # Update for your setup
       value_serializer=lambda v: json.dumps(v).encode('utf-8')
   )
   ```

3. Place data files in `data/` directory relative to project root

4. Run the producer:
   ```bash
   python producer.py
   ```

## Data Format

### Input CSV Format

The producer expects CSV files with columns matching the transaction schema, including:

- `trans_num` - Transaction number/ID
- `amt` - Transaction amount
- `city_pop` - City population
- `lat` - Transaction latitude
- `long` - Transaction longitude
- `merch_lat` - Merchant latitude
- `merch_long` - Merchant longitude
- `is_fraud` - Fraud label (0 or 1)
- Additional metadata fields

### Output Kafka Message Format

Each Kafka message contains a JSON-serialized dictionary with all CSV columns:

```json
{
  "trans_num": 0,
  "amt": 68.5,
  "city_pop": 50000,
  "lat": 40.7128,
  "long": -74.0060,
  "merch_lat": 40.7589,
  "merch_long": -73.9851,
  "is_fraud": 0,
  ...
}
```

## Integration with FraudGuard

The Simulation module integrates with the FraudGuard system as follows:

```
Simulation Producer
    │
    └─→ Kafka Topic: transactions
            │
            ├─→ Spark Streaming (predictions)
            ├─→ Python Consumer (real-time alerts)
            └─→ Metrics Tracker (performance metrics)
```

### Service Dependencies

The producer depends on:

- **Kafka Service** - Must be running and healthy before producer starts
- **Zookeeper** - Required for Kafka coordination

These dependencies are managed automatically via docker-compose service dependencies and health checks.

## Performance Characteristics

- **Throughput**: ~50 transactions per second (configurable)
- **Latency**: Minimal (limited by network and Kafka processing)
- **Memory**: Low footprint (processes CSV row-by-row)
- **Scalability**: Single producer instance; multiple instances can be added for higher throughput

## Error Handling

- Missing CSV files: Falls back to alternative data source with warning
- Kafka connection failures: Producer will fail on initial connection; retries not implemented (Docker restart handles this)
- Invalid data: All rows are sent as-is; downstream consumers handle validation

## Best Practices

1. **Use Test Set for Evaluation**: Ensure `test_set.csv` exists for proper model evaluation
2. **Monitor Kafka Lag**: Watch for consumer lag if streaming rate exceeds processing capacity
3. **Data Quality**: Verify CSV files contain expected columns before streaming
4. **Rate Tuning**: Adjust streaming rate based on downstream processing capacity

## Troubleshooting

### Producer Not Sending Messages

- Check Kafka service is running: `docker-compose ps kafka`
- Verify topic exists: `docker-compose exec kafka kafka-topics --list --bootstrap-server localhost:9092`
- Check producer logs: `docker-compose logs producer`

### Wrong Data Source Used

- Verify file paths: Check if `test_set.csv` exists in `data/` directory
- Check container logs for data source selection message
- Ensure data directory is properly mounted in docker-compose

### Connection Errors

- Verify Kafka service name matches: `fraudguard-kafka:9092`
- Check network connectivity: Ensure producer and Kafka are on same Docker network
- Review Kafka health check status in docker-compose logs

## Development Notes

- The producer is stateless and can be restarted without losing progress (reads entire file each time)
- CSV files are read entirely into memory (pandas DataFrame); for very large files, consider chunked reading
- Transaction order is preserved as transactions are sent sequentially
- No message deduplication; if producer restarts, transactions will be re-sent

