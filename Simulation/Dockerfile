FROM python:3.9-slim

WORKDIR /opt/app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY producer.py .

# Entrypoint set by docker-compose
