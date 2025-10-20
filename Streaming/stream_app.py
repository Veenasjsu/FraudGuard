from pyspark.sql import SparkSession
from pyspark.sql.functions import from_json, col, hour, dayofweek
from pyspark.sql.types import StructType, StringType, FloatType, TimestampType
from pyspark.sql.functions import pandas_udf
import joblib
from pyspark.sql.functions import window, count, sum, avg, expr, to_json, struct

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

#query.awaitTermination()


# 8. Watermark: Allow late data up to 5 minutes
df_watermarked = df_pred.withWatermark("timestamp", "5 minutes")

# 9. Group and Aggregate over a 5-minute tumbling window
window_duration = "5 minutes"

df_eda_metrics = df_watermarked.groupBy(
    window(col("timestamp"), window_duration)
).agg(
    count(col("transaction_id")).alias("total_transactions"),
    # Sum of fraud_prediction (where 1=fraud, 0=not fraud) gives the fraud count
    sum(expr("CAST(fraud_prediction AS LONG)")).alias("fraud_count"),
    avg(col("amt")).alias("avg_amt_window")
).withColumn(
    "fraud_rate_pct",
    (col("fraud_count") / col("total_transactions")) * 100
).filter(col("total_transactions") > 0) # Only process non-empty windows

# 10. Prepare for Kafka Output (Convert struct to JSON string)
df_eda_json = df_eda_metrics.select(
    to_json(
        # Select all columns and wrap them in a struct for JSON serialization
        struct(col("window.*"), "total_transactions", "fraud_count", "fraud_rate_pct", "avg_amt_window")
    ).alias("value")
)

# 3b. Output 2: Real-Time EDA Metrics (To Kafka for Dashboard)
eda_query = df_eda_json.writeStream \
    .outputMode("append") \
    .format("kafka") \
    .option("kafka.bootstrap.servers", "kafka:9092") \
    .option("topic", "realtime_fraud_metrics") \
    .option("checkpointLocation", "/opt/app/checkpoints/eda_metrics") \
    .start()

# 3c. Output 3: Fraud Alerts (Filter and Send to a separate topic/console)
df_alerts = df_pred.filter(col("fraud_prediction") == 1)
alert_query = df_alerts.writeStream \
    .outputMode("append") \
    .format("console") \
    .option("truncate", False) \
    .start()

# Wait for all streaming queries to terminate
spark.streams.awaitAnyTermination()