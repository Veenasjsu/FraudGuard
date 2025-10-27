FROM python:3.9-slim-bullseye

ENV DEBIAN_FRONTEND=noninteractive

# Java 11 + tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends openjdk-11-jre-headless wget ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Spark 3.3.2 (Hadoop 3)
ENV SPARK_VERSION=3.3.2 \
    HADOOP_PROFILE=hadoop3 \
    SPARK_HOME=/opt/spark
RUN wget -qO- https://archive.apache.org/dist/spark/spark-${SPARK_VERSION}/spark-${SPARK_VERSION}-bin-${HADOOP_PROFILE}.tgz \
  | tar xz -C /opt && mv /opt/spark-${SPARK_VERSION}-bin-${HADOOP_PROFILE} ${SPARK_HOME}

# Kafka / extra jars
RUN wget -O ${SPARK_HOME}/jars/spark-sql-kafka-0-10_2.12-${SPARK_VERSION}.jar https://repo1.maven.org/maven2/org/apache/spark/spark-sql-kafka-0-10_2.12/${SPARK_VERSION}/spark-sql-kafka-0-10_2.12-${SPARK_VERSION}.jar && \
    wget -O ${SPARK_HOME}/jars/kafka-clients-2.8.0.jar https://repo1.maven.org/maven2/org/apache/kafka/kafka-clients/2.8.0/kafka-clients-2.8.0.jar && \
    wget -O ${SPARK_HOME}/jars/spark-token-provider-kafka-0-10_2.12-${SPARK_VERSION}.jar https://repo1.maven.org/maven2/org/apache/spark/spark-token-provider-kafka-0-10_2.12/${SPARK_VERSION}/spark-token-provider-kafka-0-10_2.12-${SPARK_VERSION}.jar && \
    wget -O ${SPARK_HOME}/jars/commons-pool2-2.11.1.jar https://repo1.maven.org/maven2/org/apache/commons/commons-pool2/2.11.1/commons-pool2-2.11.1.jar

# log4j config must be a separate COPY
COPY log4j.properties ${SPARK_HOME}/conf/log4j.properties

ENV PATH="${SPARK_HOME}/bin:${PATH}"
ENV PYSPARK_PYTHON=python3

WORKDIR /opt/app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY stream_app.py .

CMD ["bash", "-lc", "spark-shell --version"]
