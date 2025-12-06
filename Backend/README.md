# Backend Module

The Backend module provides the core fraud detection services for the FraudGuard application. It includes machine learning model training scripts, a real-time Kafka consumer for fraud detection, and a WebSocket server for broadcasting alerts to connected clients.

## Overview

The Backend module consists of three main components:

1. **Model Training Scripts** - Train and persist fraud detection models
2. **Kafka Consumer** - Real-time fraud detection from transaction streams
3. **WebSocket Server** - Broadcast fraud alerts and metrics to frontend clients

## Components

### Model Training Scripts

#### `supervised_model.py`
Trains a Random Forest classifier for fraud detection.

**Features:**
- Loads transaction data from `data/train.csv`
- Uses features: `amt`, `city_pop`, `lat`, `long`, `merch_lat`, `merch_long`
- 80/20 train/test split with stratification
- Evaluates model performance and checks for overfitting
- Saves model to `fraud_model.pkl`

**Usage:**
```bash
cd Backend
python supervised_model.py
```

**Output:**
- `fraud_model.pkl` - Trained Random Forest model
- Training and test accuracy metrics
- Optional test set export to `data/test_set.csv`

#### `xgboost_model.py`
Trains an XGBoost classifier for fraud detection.

**Features:**
- Uses the same feature set as Random Forest
- 80/20 train/test split with stratification
- Includes overfitting detection warnings
- Saves model to `fraud_model_xgb.pkl`

**Usage:**
```bash
cd Backend
python xgboost_model.py
```

**Output:**
- `fraud_model_xgb.pkl` - Trained XGBoost model
- Training and test accuracy metrics

#### `unsupervised_model.py`
Trains an Isolation Forest model for anomaly-based fraud detection.

**Features:**
- Unsupervised learning approach (no labels required)
- Configurable contamination rate (default: 0.01)
- Uses StandardScaler preprocessing pipeline
- Saves complete pipeline to `fraud_unsupervised.pkl`

**Usage:**
```bash
cd Backend
python unsupervised_model.py --contamination 0.01 --random-state 42
```

**Arguments:**
- `--contamination` - Expected proportion of outliers (default: 0.01)
- `--random-state` - Random seed for reproducibility (default: 42)
- `--output` - Output path for model (default: `../fraud_unsupervised.pkl`)

**Output:**
- `fraud_unsupervised.pkl` - Trained Isolation Forest pipeline

### Real-Time Services

#### `kafka_fraud_consumer.py`
Kafka consumer service that performs real-time fraud detection on transaction streams.

**Functionality:**
- Consumes transaction messages from Kafka topic `transactions`
- Loads three ML models (Random Forest, XGBoost, Isolation Forest)
- Extracts features and makes predictions for each transaction
- Combines predictions from all models
- Broadcasts enriched alerts to WebSocket server

**Features:**
- Robust error handling for missing models
- Automatic feature extraction and validation
- Retry logic for Kafka connection with configurable attempts
- Real-time logging of predictions and scores

**Configuration (Environment Variables):**
- `KAFKA_BOOTSTRAP` - Kafka broker address (default: `fraudguard-kafka:9092`)
- `KAFKA_TOPIC` - Topic name (default: `transactions`)
- `KAFKA_GROUP_ID` - Consumer group ID (default: `fraudguard-python-ws`)
- `RF_MODEL_PATH` - Path to Random Forest model (default: `fraud_model.pkl`)
- `XGB_MODEL_PATH` - Path to XGBoost model (default: `fraud_model_xgb.pkl`)
- `IF_MODEL_PATH` - Path to Isolation Forest model (default: `fraud_unsupervised.pkl`)
- `WS_URL` - WebSocket broadcaster URL (default: `http://ws:8000/broadcast`)
- `KAFKA_CONNECT_TRIES` - Connection retry attempts (default: `20`)
- `KAFKA_CONNECT_DELAY` - Delay between retries in seconds (default: `3`)

**Prediction Output:**
Each transaction is enriched with:
- `rf_fraud_prediction` - Random Forest prediction (0 or 1)
- `rf_score` - Random Forest probability score
- `xgb_fraud_prediction` - XGBoost prediction (0 or 1)
- `xgb_score` - XGBoost probability score
- `if_fraud_prediction` - Isolation Forest prediction (0 or 1)
- `fraud` - Backward compatibility field (same as RF prediction)
- `score` - Backward compatibility field (same as RF score)
- Kafka metadata: `kafka_partition`, `kafka_offset`, `kafka_ts`

#### `fraud_ws_server.py`
FastAPI WebSocket server for real-time fraud alert broadcasting.

**Functionality:**
- Maintains active WebSocket connections to frontend clients
- Receives fraud alerts via HTTP POST `/broadcast`
- Broadcasts alerts to all connected WebSocket clients
- Maintains in-memory ring buffer of recent transactions (up to 5,000)
- Provides REST API endpoints for health checks and transaction listing

**Endpoints:**

- `GET /` - Server status message
- `GET /health` - Health check with connection count and stored transaction count
- `GET /transactions` - List all stored transactions (newest first)
- `POST /broadcast` - Receive and broadcast fraud alerts
- `WS /ws/alerts` - WebSocket endpoint for real-time alerts
- `POST /_test_send` - Test endpoint to send sample alert

**Features:**
- Automatic heartbeat (ping every 25 seconds)
- CORS enabled for cross-origin requests
- Connection cleanup on disconnect
- Transaction ring buffer to prevent memory overflow

**Transaction Storage:**
- Stores up to 5,000 most recent transactions in memory
- Newest transactions appear first in `/transactions` endpoint
- Automatically removes oldest transactions when limit is reached

## Model Files

The Backend module uses three pre-trained model files:

- `fraud_model.pkl` - Random Forest classifier
- `fraud_model_xgb.pkl` - XGBoost classifier  
- `fraud_unsupervised.pkl` - Isolation Forest pipeline

These models must be present in the Backend directory or mounted at the expected paths in Docker containers.

## Dependencies

### Core Dependencies

- **fastapi** - Web framework for WebSocket server
- **uvicorn** - ASGI server for FastAPI
- **kafka-python** - Kafka client library
- **joblib** - Model serialization and loading
- **pandas** - Data manipulation and DataFrame operations
- **scikit-learn** - Machine learning models and utilities
- **xgboost** - Gradient boosting classifier
- **requests** - HTTP client for broadcasting alerts

### Installation

Dependencies are automatically installed in Docker containers. For local development:

```bash
pip install fastapi "uvicorn[standard]" kafka-python joblib pandas scikit-learn xgboost requests
```

Or using the Docker container approach:
```bash
docker-compose up consumer ws
```

## Architecture

```
Transaction Stream (Kafka)
    │
    ├─→ kafka_fraud_consumer.py
    │       │
    │       ├─→ Load Models (RF, XGB, IF)
    │       ├─→ Extract Features
    │       ├─→ Make Predictions
    │       └─→ HTTP POST to /broadcast
    │
    └─→ fraud_ws_server.py
            │
            ├─→ Store in Ring Buffer
            └─→ WebSocket Broadcast
                    │
                    └─→ Frontend Clients
```

## Docker Integration

The Backend services are containerized and managed via `docker-compose.yml`:

### Consumer Service
- Image: `python:3.11-slim`
- Working Directory: `/opt/app/Backend`
- Models mounted from project root
- Auto-installs dependencies on startup
- Depends on Kafka and WebSocket services

### WebSocket Service
- Image: `python:3.11-slim`
- Working Directory: `/opt/app/Backend`
- Exposes port 8000
- Health check endpoint for service orchestration
- Depends on Kafka service

## Usage

### Training Models

1. Ensure training data is available at `data/train.csv`
2. Train each model:
   ```bash
   python supervised_model.py
   python xgboost_model.py
   python unsupervised_model.py
   ```
3. Verify model files are created in the Backend directory

### Running Services

Services are typically run via Docker Compose:

```bash
docker-compose up consumer ws
```

Or start the entire stack:
```bash
docker-compose up -d
```

### Testing WebSocket Server

```bash
# Test health endpoint
curl http://localhost:8000/health

# Test broadcast endpoint
curl -X POST http://localhost:8000/broadcast \
  -H "Content-Type: application/json" \
  -d '{"type": "fraud_alert", "amount": 1000, "fraud": 1}'

# List stored transactions
curl http://localhost:8000/transactions
```

### Connecting via WebSocket

```python
import asyncio
import websockets
import json

async def test_websocket():
    uri = "ws://localhost:8000/ws/alerts"
    async with websockets.connect(uri) as websocket:
        # Receive hello message
        hello = await websocket.recv()
        print(f"Received: {hello}")
        
        # Keep connection alive and receive alerts
        while True:
            message = await websocket.recv()
            alert = json.loads(message)
            print(f"Alert: {alert}")

asyncio.run(test_websocket())
```

## Feature Engineering

All models use the following features extracted from transactions:

- `amt` - Transaction amount
- `city_pop` - Population of the transaction city
- `lat` - Transaction latitude
- `long` - Transaction longitude
- `merch_lat` - Merchant location latitude
- `merch_long` - Merchant location longitude

Missing values are handled by filling with column means during preprocessing.

## Performance Considerations

- Models are loaded once at service startup to minimize latency
- Feature extraction is optimized to match training-time column names
- WebSocket broadcasts are non-blocking and use timeout protection
- Transaction buffer size is limited to prevent memory issues
- Kafka consumer uses batching (`max_poll_records=50`) for efficiency

## Error Handling

- Missing model files are handled gracefully (consumer continues with available models)
- Invalid Kafka messages are logged and skipped
- WebSocket connection failures are automatically cleaned up
- HTTP broadcast failures are logged but don't block predictions
- Feature extraction includes fallbacks for missing or invalid values

## Logging

Services output structured logs to stdout:
- Consumer: Transaction predictions and Kafka metadata
- WebSocket Server: Connection events and broadcast status
- Health checks: Service status and metrics

## Development Notes

- Model files should be committed to version control or mounted as volumes
- Training scripts assume data is in `data/train.csv` relative to project root
- Feature names must match exactly between training and inference
- Isolation Forest returns -1 for anomalies, which is converted to 1 (fraud) for consistency

