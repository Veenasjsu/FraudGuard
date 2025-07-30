from pyspark.sql import SparkSession
from pyspark.sql.functions import from_json, col, hour, dayofweek
from pyspark.sql.types import StructType, StringType, FloatType, TimestampType

# 1. Define schema
schema = StructType() \
    .add("transaction_id", StringType()) \
    .add("user_id", StringType()) \
    .add("amount", FloatType()) \
    .add("timestamp", TimestampType()) \
    .add("device_id", StringType()) \
    .add("location", StringType()) \
    .add("ip_address", StringType()) \
    .add("merchant_id", StringType())

# 2. Spark session
spark = SparkSession.builder.appName("FraudGuardStream").getOrCreate()
spark.sparkContext.setLogLevel("WARN")

# 3. Read from Kafka
df = spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", "kafka:9092") \
    .option("subscribe", "transactions") \
    .load() \
    .selectExpr("CAST(value AS STRING) as json") \
    .select(from_json(col("json"), schema).alias("data")) \
    .select("data.*")

# 4. Feature engineering
df_feats = df \
    .withColumn("hour", hour("timestamp")) \
    .withColumn("day_of_week", dayofweek("timestamp")) \
    .withColumn("amount_log", col("amount") + 1)

# 5. Output to console (or sink to DB/Kafka)
query = df_feats.writeStream \
    .outputMode("append") \
    .format("console") \
    .option("truncate", False) \
    .start()

query.awaitTermination()
