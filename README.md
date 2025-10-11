# FraudGuard

# 🚨 FraudGuard: Real-Time Fraud Detection System

FraudGuard is an intelligent, streaming-based fraud detection system built using **Apache Kafka**, **Docker**, and **Python**. It simulates real-time financial transactions and streams them into a Kafka topic, ready to be consumed by downstream systems such as Spark or ML models.

---

## 🧱 Project Structure

<pre> <code> ``` FraudGuard/ ├── simulation/ # Kafka producer service │ ├── producer.py │ ├── Dockerfile │ └── requirements.txt ├── data/ # Local-only datasets (not tracked in Git) │ └── train.csv # Large CSV file used by the producer ├── docker-compose.yml # All services: kafka, zookeeper, producer ├── .gitignore └── README.md ``` </code> </pre>

---

## ⚙️ Prerequisites

- ✅ Docker & Docker Compose installed
- ✅ `train.csv` placed manually in `data/` directory

---

## 🚀 Run Steps

### 1. 📁 Place Your Dataset

Download dataset from - https://www.kaggle.com/datasets/kartik2112/fraud-detection

Put your raw transaction file (`train.csv`) in the `data/` directory:

FraudGuard/data/train.csv


> ⚠️ `train.csv` is intentionally **ignored from Git**. You must add it locally.

---

### 2. 🐳 Build All Docker Services

```bash
docker-compose build
```
This builds the simulation producer and ensures dependencies are installed.


### 3. 🔄 Start the Stack (Kafka + Zookeeper + Producer)
```bash
docker-compose up -d
```
This runs:

Apache Kafka

Zookeeper

Python-based Kafka producer (simulates transaction stream)

### 4. 🧪 View Producer Logs
```bash
docker-compose logs -f producer
```
You should see logs like:

📤 Sent transaction 1: {...}
📤 Sent transaction 2: {...}
✅ Finished streaming.

### 5. 🧪 View Prediction Logs
```bash
docker-compose logs -f predictions | Select-String -NotMatch "WARN KafkaDataConsumer"
```
# 🚀 FraudGuard Frontend:
### 1. 📦 Install Dependencies

To set up the frontend dependencies, navigate to the `frontend/` directory and run:

```bash
cd frontend
npm install
```

### 2. ▶️ Start Development Server

After installing dependencies, start the development server with:

```bash
npm run dev

```
Visit the URL printed in the terminal (typically http://localhost:5173).
