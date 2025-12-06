# Streaming Module

The Streaming module provides real-time fraud detection capabilities using Apache Spark for distributed stream processing and a metrics tracking service for performance evaluation. It consumes transaction streams from Kafka, applies machine learning models for fraud detection, and calculates performance metrics.

## Overview

The Streaming module consists of two main services:

1. **Spark Streaming Application** - Distributed real-time fraud predictions using three ML models
2. **Metrics Tracker** - Real-time performance metrics calculation and reporting

## Components

### `stream_app.py`

Apache Spark streaming application that performs real-time fraud detection on transaction streams.

**Functionality:**

- Consumes transaction messages from Kafka topic `transactions`
- Deserializes JSON messages into Spark DataFrames
- Applies feature engineering (hour, day of week extraction)
- Makes fraud predictions using three ML models:
  - XGBoost Classifier
  - Random Forest Classifier
  - Isolation Forest (Anomaly Detection)
- Outputs predictions to console with configurable trigger intervals

**Architecture:**

- Uses Spark Structured Streaming for scalable, fault-tolerant processing
- Implements Pandas UDFs (User-Defined Functions) for model inference
- Caches models per worker process to avoid repeated loading
- Processes streams in micro-batches (2-second intervals by default)

**Model Loading:**

- Models are loaded once per Spark worker process (cached)
- Model files must be mounted at:
  - `/opt/app/fraud_model_xgb.pkl` - XGBoost model
  - `/opt/app/fraud_model.pkl` - Random Forest model
  - `/opt/app/fraud_unsupervised.pkl` - Isolation Forest pipeline

**Feature Engineering:**

Extracts temporal features from transaction timestamps:
- `hour` - Hour of day (0-23)
- `day_of_week` - Day of week (1=Sunday, 7=Saturday)

**Predictions:**

Each transaction receives predictions from all three models:
- `xgb_fraud_prediction` - XGBoost prediction (0 or 1)
- `rf_fraud_prediction` - Random Forest prediction (0 or 1)
- `if_fraud_prediction` - Isolation Forest prediction (0 or 1)

### `metrics_tracker.py`

Kafka consumer service that calculates and reports real-time performance metrics.

**Functionality:**

- Consumes transaction messages from Kafka
- Maintains ground truth labels and predictions from all three models
- Calculates performance metrics every 100 transactions:
  - Accuracy, Precision, Recall, F1-Score
  - Confusion Matrix (TP, FP, TN, FN)
- Sends metrics to WebSocket server for frontend display
- Prints formatted metrics to console

**Metrics Calculated:**

For each model (XGBoost, Random Forest, Isolation Forest):
- **True Positives (TP)** - Correctly identified fraud
- **False Positives (FP)** - Incorrectly flagged as fraud
- **True Negatives (TN)** - Correctly identified legitimate transactions
- **False Negatives (FN)** - Missed fraud cases
- **Accuracy** - Overall prediction correctness
- **Precision** - Proportion of fraud predictions that were correct
- **Recall** - Proportion of actual fraud cases detected
- **F1-Score** - Harmonic mean of precision and recall

**Reporting:**

- Metrics calculated every 100 transactions (configurable via `METRICS_INTERVAL`)
- Metrics broadcasted to WebSocket server at `http://ws:8000/broadcast`
- Console output includes formatted metric summaries
- Final metrics summary printed on shutdown

### `Dockerfile`

Containerizes the Spark streaming application with all necessary dependencies.

**Build Process:**

- Base image: `python:3.9-slim-bullseye`
- Installs Java 11 (required for Spark)
- Downloads and installs Apache Spark 3.3.2
- Downloads Kafka integration JARs:
  - `spark-sql-kafka-0-10_2.12-3.3.2.jar`
  - `kafka-clients-2.8.0.jar`
  - `spark-token-provider-kafka-0-10_2.12-3.3.2.jar`
  - `commons-pool2-2.11.1.jar`
- Configures log4j properties
- Installs Python dependencies from `requirements.txt`

**Environment Variables:**

- `SPARK_HOME` - Spark installation directory (`/opt/spark`)
- `SPARK_VERSION` - Spark version (3.3.2)
- `PYSPARK_PYTHON` - Python interpreter for PySpark (`python3`)

### Configuration Files

#### `log4j.properties` / `log4j2.properties`

Logging configuration for Spark to reduce verbosity:
- Sets log level to WARN to minimize console output
- Configures log output format

## Dependencies

### Core Dependencies

- **pyspark** (3.3.2) - Apache Spark Python API
- **kafka-python** (2.0.2) - Kafka client for metrics tracker
- **joblib** (1.3.2) - Model serialization and loading
- **pandas** (2.1.3) - Data manipulation in UDFs
- **pyarrow** (>=1.0.0) - Efficient data transfer between Spark and Pandas
- **scikit-learn** (1.3.2) - Machine learning utilities
- **xgboost** - Gradient boosting classifier
- **requests** (2.32.2) - HTTP client for metrics broadcasting

### System Dependencies

- **Java 11** - Required runtime for Apache Spark
- **Apache Spark 3.3.2** - Distributed processing engine
- **Kafka Integration JARs** - Spark-Kafka connector libraries

### Installation

Dependencies are automatically installed during Docker image build. For local development, ensure Java 11 and Spark are installed, then:

```bash
pip install -r requirements.txt
```

## Configuration

### Spark Streaming Configuration

**Kafka Connection:**
- Bootstrap Servers: `kafka:9092` (Docker service name)
- Topic: `transactions`
- Starting Offset: Latest (configurable)

**Processing:**
- Trigger Interval: 2 seconds (micro-batch processing)
- Output Mode: Append (streaming)
- Checkpoint Location: None (console output only)

**Model Paths:**
- XGBoost: `/opt/app/fraud_model_xgb.pkl`
- Random Forest: `/opt/app/fraud_model.pkl`
- Isolation Forest: `/opt/app/fraud_unsupervised.pkl`

### Metrics Tracker Configuration

**Kafka Connection:**
- Bootstrap Servers: `fraudguard-kafka:9092`
- Topic: `transactions`
- Consumer Group: `metrics-tracker`
- Auto Offset Reset: Latest

**Metrics Calculation:**
- Interval: Every 100 transactions (configurable via `METRICS_INTERVAL`)
- WebSocket URL: `http://ws:8000/broadcast` (configurable via `WS_URL`)

**Environment Variables:**
- `WS_URL` - WebSocket broadcaster URL (default: `http://ws:8000/broadcast`)

## Usage

### Running via Docker Compose

Both streaming services are automatically started as part of the FraudGuard stack:

```bash
# Start Spark streaming only
docker-compose up predictions

# Start metrics tracker only
docker-compose up metrics

# Start entire stack
docker-compose up -d
```

### Viewing Spark Streaming Logs

```bash
# Follow Spark streaming logs (filtered to reduce noise)
docker-compose logs -f predictions | Select-String -NotMatch "WARN KafkaDataConsumer"

# View all logs
docker-compose logs predictions
```

### Viewing Metrics Tracker Logs

```bash
# Follow metrics tracker logs
docker-compose logs -f metrics

# View recent metrics
docker-compose logs metrics
```

### Expected Output

**Spark Streaming:**
```
============================================================
Multi Model Fraud Detection - Streaming Predictions Started
XGBoost Model: /opt/app/fraud_model_xgb.pkl
RandomForest Model: /opt/app/fraud_model.pkl
Isolation Forest Model: /opt/app/fraud_unsupervised.pkl
============================================================

Batch: 0
+-----------------+--------+-------------------+------------------+-------------------+
|transaction_id   |amt     |xgb_fraud_prediction|rf_fraud_prediction|if_fraud_prediction|
+-----------------+--------+-------------------+------------------+-------------------+
|0                |68.5    |0                  |0                 |0                  |
...
```

**Metrics Tracker:**
```
============================================================
Metrics Tracker Service Started
Calculating metrics every 100 transactions
============================================================

[2024-01-15 10:30:00] Processed 100 transactions

================================================================================
METRICS FOR XGBOOST MODEL
================================================================================
Total Samples: 100
True Positives (TP):  5
False Positives (FP): 2
True Negatives (TN):  90
False Negatives (FN): 3
Accuracy:  0.9500
Precision: 0.7143
Recall:    0.6250
F1-Score:  0.6667
================================================================================
```

## Architecture

### Data Flow

```
Kafka Topic: transactions
    │
    ├─→ Spark Streaming (stream_app.py)
    │       │
    │       ├─→ Feature Engineering
    │       ├─→ XGBoost Prediction
    │       ├─→ Random Forest Prediction
    │       ├─→ Isolation Forest Prediction
    │       └─→ Console Output
    │
    └─→ Metrics Tracker (metrics_tracker.py)
            │
            ├─→ Collect Predictions & Ground Truth
            ├─→ Calculate Metrics (every 100 tx)
            └─→ Broadcast to WebSocket Server
                    │
                    └─→ Frontend Dashboard
```

### Model Caching Strategy

- Models are loaded once per Spark worker process
- Cached in global variables (`_xgb_model_cache`, `_rf_model_cache`, `_if_model_cache`)
- Avoids repeated file I/O during stream processing
- Each worker maintains its own cached copy

## Performance Characteristics

### Spark Streaming

- **Latency**: ~2 seconds (trigger interval)
- **Throughput**: Scales with Spark cluster size
- **Fault Tolerance**: Automatic recovery from failures
- **Model Loading**: Once per worker (efficient caching)

### Metrics Tracker

- **Update Frequency**: Every 100 transactions
- **Latency**: Near real-time (limited by Kafka consumer lag)
- **Memory**: Accumulates predictions in memory (consider batching for very large datasets)

## Integration with FraudGuard

The Streaming module integrates with other FraudGuard components:

- **Simulation Module**: Consumes transaction streams produced by the producer
- **Backend Module**: Models are trained and saved by Backend training scripts
- **Frontend**: Metrics are displayed in real-time via WebSocket server

### Service Dependencies

- **Kafka**: Must be running and accessible
- **Model Files**: Must be mounted at expected paths
- **WebSocket Server** (for metrics): Must be running for metrics broadcasting

## Error Handling

### Spark Streaming

- Invalid messages: Spark will skip malformed JSON and continue processing
- Missing features: UDFs handle missing values gracefully (defaults to 0.0)
- Model loading failures: Errors are logged; worker may retry on next batch

### Metrics Tracker

- Missing ground truth: Transactions without `is_fraud` label are skipped
- Model prediction errors: Errors are logged; transaction is skipped
- WebSocket failures: Metrics calculation continues; broadcast failures are logged

## Performance Optimization

### Spark Streaming

1. **Model Caching**: Models are cached per worker to avoid reloading
2. **Batch Processing**: Processes transactions in micro-batches for efficiency
3. **Parallel Processing**: Spark distributes work across available cores

### Metrics Tracker

1. **Batched Metrics**: Calculates metrics every N transactions to reduce overhead
2. **Efficient Storage**: Uses Python lists for predictions (consider deque for very large datasets)
3. **Async Broadcasting**: HTTP requests to WebSocket server are non-blocking

## Troubleshooting

### Spark Streaming Not Processing

- Check Kafka connectivity: Verify Kafka service is running and accessible
- Verify topic exists: `docker-compose exec kafka kafka-topics --list --bootstrap-server localhost:9092`
- Check model files: Ensure model files are mounted correctly
- Review Spark logs: `docker-compose logs predictions`

### Models Not Loading

- Verify model file paths match expected locations
- Check file permissions in Docker container
- Ensure models are compatible versions (trained with same scikit-learn/xgboost versions)

### Metrics Not Updating

- Check metrics tracker is running: `docker-compose ps metrics`
- Verify WebSocket server is accessible: `curl http://localhost:8000/health`
- Review metrics tracker logs: `docker-compose logs metrics`
- Ensure transactions have `is_fraud` field for ground truth

### High Memory Usage

- Reduce metrics interval if tracking too many transactions
- Consider implementing prediction storage limits
- Monitor Spark worker memory usage

## Development Notes

- Spark streaming uses append mode; ensure downstream consumers handle duplicates if needed
- Isolation Forest returns -1 for anomalies; converted to 1 (fraud) for consistency
- Metrics tracker accumulates all predictions in memory; consider implementing rolling windows for production
- Model files should be read-only and mounted as volumes for efficient sharing across services
- Spark Structured Streaming provides exactly-once semantics within Spark; Kafka integration maintains at-least-once delivery

