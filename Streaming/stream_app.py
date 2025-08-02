from pyspark.sql import SparkSession
from pyspark.sql.functions import from_json, col, hour, dayofweek
from pyspark.sql.types import StructType, StringType, FloatType, TimestampType
from pyspark.sql.functions import pandas_udf
import joblib

# 1. Define schema
schema = StructType() \
    .add("transaction_id", StringType()) \
    .add("user_id", StringType()) \
    .add("amt", FloatType()) \
    .add("timestamp", TimestampType()) \
    .add("device_id", StringType()) \
    .add("location", StringType()) \
    .add("ip_address", StringType()) \
    .add("merchant_id", StringType()) \
    .add("city_pop", FloatType()) \
    .add("lat", FloatType()) \
    .add("long", FloatType()) \
    .add("merch_lat", FloatType()) \
    .add("merch_long", FloatType())

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
    .withColumn("day_of_week", dayofweek("timestamp"))

# 5. Define Pandas UDF for prediction
@pandas_udf("integer")
def predict_fraud_udf(amt, city_pop, lat, long, merch_lat, merch_long):
    import pandas as pd
    model = joblib.load('/opt/app/fraud_model.pkl')
    X = pd.DataFrame({
        'amt': amt,
        'city_pop': city_pop,
        'lat': lat,
        'long': long,
        'merch_lat': merch_lat,
        'merch_long': merch_long
    })
    return pd.Series(model.predict(X))

# 6. Add prediction column
df_pred = df_feats.withColumn(
    "fraud_prediction",
    predict_fraud_udf(
        col("amt"),
        col("city_pop"),
        col("lat"),
        col("long"),
        col("merch_lat"),
        col("merch_long")
    )
)

# 7. Output to console (logs)
query = df_pred.writeStream \
    .outputMode("append") \
    .format("console") \
    .option("truncate", False) \
    .start()

query.awaitTermination()