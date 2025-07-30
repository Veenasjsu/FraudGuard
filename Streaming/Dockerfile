FROM python:3.9-slim

# Install Spark dependencies
RUN apt-get update && apt-get install -y openjdk-11-jdk wget && \
    wget -qO- https://archive.apache.org/dist/spark/spark-3.3.2/spark-3.3.2-bin-hadoop3.tgz \
      | tar xz -C /opt && \
    mv /opt/spark-3.3.2-bin-hadoop3 /opt/spark

ENV SPARK_HOME=/opt/spark
ENV PATH=$SPARK_HOME/bin:$PATH

# Copy app
WORKDIR /opt/app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY stream_app.py .

# Spark job runs via docker-compose entrypoint
