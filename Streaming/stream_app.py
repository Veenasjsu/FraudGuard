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

# 5. Define Pandas UDFs for prediction with cached model loading
# Models are cached per worker process to avoid reloading on every batch
_xgb_model_cache = None
_rf_model_cache = None

@pandas_udf("integer")
def predict_xgb_fraud_udf(amt, city_pop, lat, long, merch_lat, merch_long):
    import pandas as pd
    import joblib
    global _xgb_model_cache
    
    # Load XGBoost model once per worker process (cached)
    if _xgb_model_cache is None:
        _xgb_model_cache = joblib.load('/opt/app/fraud_model_xgb.pkl')
        model_class = type(_xgb_model_cache).__name__
        print(f"[XGBoost Model Loaded] Model Type: {model_class}, Model Module: {type(_xgb_model_cache).__module__}")
    
    X = pd.DataFrame({
        'amt': amt,
        'city_pop': city_pop,
        'lat': lat,
        'long': long,
        'merch_lat': merch_lat,
        'merch_long': merch_long
    })
    return pd.Series(_xgb_model_cache.predict(X))

@pandas_udf("integer")
def predict_rf_fraud_udf(amt, city_pop, lat, long, merch_lat, merch_long):
    import pandas as pd
    import joblib
    global _rf_model_cache
    
    # Load RandomForest model once per worker process (cached)
    if _rf_model_cache is None:
        _rf_model_cache = joblib.load('/opt/app/fraud_model.pkl')
        model_class = type(_rf_model_cache).__name__
        print(f"[RandomForest Model Loaded] Model Type: {model_class}, Model Module: {type(_rf_model_cache).__module__}")
    
    X = pd.DataFrame({
        'amt': amt,
        'city_pop': city_pop,
        'lat': lat,
        'long': long,
        'merch_lat': merch_lat,
        'merch_long': merch_long
    })
    return pd.Series(_rf_model_cache.predict(X))

# 6. Add prediction columns for both models
df_pred = df_feats \
    .withColumn(
        "xgb_fraud_prediction",
        predict_xgb_fraud_udf(
            col("amt"),
            col("city_pop"),
            col("lat"),
            col("long"),
            col("merch_lat"),
            col("merch_long")
        )
    ) \
    .withColumn(
        "rf_fraud_prediction",
        predict_rf_fraud_udf(
            col("amt"),
            col("city_pop"),
            col("lat"),
            col("long"),
            col("merch_lat"),
            col("merch_long")
        )
    )

# 8. Output to console (logs) with trigger for real-time predictions
query = df_pred.writeStream \
    .outputMode("append") \
    .format("console") \
    .option("truncate", False) \
    .trigger(processingTime='2 seconds') \
    .start()

print("=" * 80)
print("Dual Model Fraud Detection - Streaming Predictions Started")
print("XGBoost Model: /opt/app/fraud_model_xgb.pkl")
print("RandomForest Model: /opt/app/fraud_model.pkl")
print("=" * 80)
query.awaitTermination()