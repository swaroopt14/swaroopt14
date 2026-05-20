#!/bin/bash
# entrypoint.sh — auto-trains RCA model on first deploy if no bundle exists.
# Production-safe: if RCA_MODEL_PATH already exists (pre-mounted .pkl), skip training.
set -e

MODEL_PATH="${RCA_MODEL_PATH:-/data/rca_model.pkl}"

if [ ! -f "$MODEL_PATH" ]; then
    echo "[entrypoint] No RCA model at $MODEL_PATH — generating synthetic training data and training HDBSCAN..."
    python /app/scripts/generate_and_train.py
    echo "[entrypoint] Bootstrap training complete."
else
    echo "[entrypoint] Found RCA model at $MODEL_PATH — skipping bootstrap training."
fi

exec python main.py
