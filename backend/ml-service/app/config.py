import os

KAFKA_BROKERS: list[str] = os.getenv("KAFKA_BROKERS", "localhost:9092").split(",")
KAFKA_GROUP_ID: str = os.getenv("KAFKA_GROUP_ID", "ml-service-group")
ML_REQUEST_TOPIC: str = os.getenv("ML_REQUEST_TOPIC", "ml.request.events")
ML_RESULT_TOPIC: str = os.getenv("ML_RESULT_TOPIC", "ml.result.events")

# Path for persisting the online LR model weights across restarts
LR_MODEL_PATH: str = os.getenv("LR_MODEL_PATH", "/data/lr_model.json")

# Canonical model version strings shared with Go side
MODEL_VERSION_IF: str = "isolation_forest_v1"
MODEL_VERSION_LR: str = "logistic_regression_v1"
MODEL_VERSION_ZSCORE: str = "zscore_v1"
