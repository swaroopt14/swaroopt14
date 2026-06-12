#!/bin/bash
# entrypoint.sh — auto-trains RCA model on first deploy if no bundle exists.
# Production-safe: if RCA_MODEL_PATH already exists (pre-mounted .pkl), skip training.
set -e

MODEL_PATH="${RCA_MODEL_PATH:-/data/rca_model.pkl}"
LEAKAGE_MODEL_PATH="${LEAKAGE_MODEL_PATH:-/data/leakage_prediction_bundle.joblib}"
LEAKAGE_BOOTSTRAP_MODEL_PATH="${LEAKAGE_BOOTSTRAP_MODEL_PATH:-/app/model_artifacts/leakage_prediction_bundle.joblib}"

if [ ! -f "$MODEL_PATH" ]; then
    echo "[entrypoint] No RCA model at $MODEL_PATH — generating synthetic training data and training HDBSCAN..."
    python /app/scripts/generate_and_train.py
    echo "[entrypoint] Bootstrap training complete."
else
    echo "[entrypoint] Found RCA model at $MODEL_PATH — skipping bootstrap training."
fi

if [ ! -f "$LEAKAGE_MODEL_PATH" ] && [ -f "$LEAKAGE_BOOTSTRAP_MODEL_PATH" ]; then
    echo "[entrypoint] Bootstrapping leakage model bundle to $LEAKAGE_MODEL_PATH"
    cp "$LEAKAGE_BOOTSTRAP_MODEL_PATH" "$LEAKAGE_MODEL_PATH"
fi

exec python main.py
