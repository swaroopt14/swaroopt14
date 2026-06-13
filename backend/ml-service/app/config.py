import os

KAFKA_BROKERS: list[str] = os.getenv("KAFKA_BROKERS", "localhost:9092").split(",")
KAFKA_GROUP_ID: str = os.getenv("KAFKA_GROUP_ID", "ml-service-group")
ML_REQUEST_TOPIC: str = os.getenv("ML_REQUEST_TOPIC", "ml.request.events")
ML_RESULT_TOPIC: str = os.getenv("ML_RESULT_TOPIC", "ml.result.events")

# Path for persisting the online LR model weights across restarts
LR_MODEL_PATH: str = os.getenv("LR_MODEL_PATH", "/data/lr_model.json")

# RCA HDBSCAN bundle path — never committed to git; set RCA_MODEL_PATH in env
RCA_MODEL_PATH: str = os.getenv("RCA_MODEL_PATH", "/data/rca_model.pkl")

# Minimum new labeled batches before triggering async retrain
RCA_RETRAIN_THRESHOLD: int = int(os.getenv("RCA_RETRAIN_THRESHOLD", "50"))

LEAKAGE_MODEL_PATH: str = os.getenv("LEAKAGE_MODEL_PATH", "/data/leakage_prediction_bundle.joblib")
LEAKAGE_BOOTSTRAP_MODEL_PATH: str = os.getenv(
    "LEAKAGE_BOOTSTRAP_MODEL_PATH",
    "/app/model_artifacts/leakage_prediction_bundle.joblib",
)
LEAKAGE_TRAINING_BUFFER_PATH: str = os.getenv(
    "LEAKAGE_TRAINING_BUFFER_PATH",
    "/data/leakage_training_rows.jsonl",
)
LEAKAGE_RETRAIN_THRESHOLD: int = int(os.getenv("LEAKAGE_RETRAIN_THRESHOLD", "25"))
LEAKAGE_REAL_SAMPLE_WEIGHT: float = float(os.getenv("LEAKAGE_REAL_SAMPLE_WEIGHT", "5.0"))

# Canonical model version strings shared with Go side
MODEL_VERSION_IF: str = "isolation_forest_v1"
MODEL_VERSION_LR: str = "logistic_regression_v1"
MODEL_VERSION_ZSCORE: str = "zscore_v1"
MODEL_VERSION_RCA: str = "rca_hdbscan_v1"
MODEL_VERSION_LEAKAGE: str = "leakage_prediction_v1"
