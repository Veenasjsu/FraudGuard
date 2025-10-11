FROM python:3.9-slim

# Install Spark dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends wget gnupg2 ca-certificates && \
    apt-get install -y --no-install-recommends openjdk-17-jre-headless && \
    wget -qO- https://archive.apache.org/dist/spark/spark-3.3.2/spark-3.3.2-bin-hadoop3.tgz \
      | tar xz -C /opt && \
    mv /opt/spark-3.3.2-bin-hadoop3 /opt/spark && \
    wget -O /opt/spark/jars/spark-sql-kafka-0-10_2.12-3.3.2.jar https://repo1.maven.org/maven2/org/apache/spark/spark-sql-kafka-0-10_2.12/3.3.2/spark-sql-kafka-0-10_2.12-3.3.2.jar && \
    wget -O /opt/spark/jars/kafka-clients-2.8.0.jar https://repo1.maven.org/maven2/org/apache/kafka/kafka-clients/2.8.0/kafka-clients-2.8.0.jar && \
    wget -O /opt/spark/jars/spark-token-provider-kafka-0-10_2.12-3.3.2.jar https://repo1.maven.org/maven2/org/apache/spark/spark-token-provider-kafka-0-10_2.12/3.3.2/spark-token-provider-kafka-0-10_2.12-3.3.2.jar && \
    wget -O /opt/spark/jars/commons-pool2-2.11.1.jar https://repo1.maven.org/maven2/org/apache/commons/commons-pool2/2.11.1/commons-pool2-2.11.1.jar && \
    apt-get clean && \    
    COPY log4j.properties /opt/spark/conf/log4j.properties && \
    rm -rf /var/lib/apt/lists/*
     
ENV SPARK_HOME=/opt/spark
ENV PATH=$SPARK_HOME/bin:$PATH

WORKDIR /opt/app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY stream_app.py .

# Spark job runs via docker-compose entrypoint
