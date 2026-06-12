from __future__ import annotations

import json
import logging
import shutil
import threading
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from catboost import CatBoostRegressor

from app import config

logger = logging.getLogger(__name__)


class LeakagePredictionModel:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._bundle: dict[str, Any] | None = None
        self._real_rows: list[dict[str, Any]] = []
        self._retraining = False
        self._last_trained_row_count = 0

        self._model_path = Path(config.LEAKAGE_MODEL_PATH)
        self._bootstrap_model_path = Path(config.LEAKAGE_BOOTSTRAP_MODEL_PATH)
        self._bootstrap_dataset_path = Path(config.LEAKAGE_BOOTSTRAP_DATASET_PATH)
        self._buffer_path = Path(config.LEAKAGE_TRAINING_BUFFER_PATH)

        local_artifacts_dir = Path(__file__).resolve().parents[2] / "model_artifacts"
        if not self._bootstrap_model_path.exists():
            self._bootstrap_model_path = local_artifacts_dir / "leakage_prediction_bundle.joblib"
        if not self._bootstrap_dataset_path.exists():
            self._bootstrap_dataset_path = local_artifacts_dir / "combined_model_ready_378.csv"

        self._ensure_bootstrap_model()
        self._load_bundle()
        self._load_real_rows()

    def predict(self, raw_features: dict[str, Any]) -> dict[str, Any]:
        bundle = self._get_bundle()
        if bundle is None:
            return {
                "predicted_leakage_rate": 0.0,
                "predicted_leakage_minor": 0.0,
                "risk_tier": "LOW",
            }

        frame = self._frame_from_features(raw_features, bundle)
        model = bundle["model"]
        rate = float(np.clip(model.predict(frame)[0], 0.0, 1.0))
        intended = float(frame["batch_total_intended_amount_minor"].iloc[0])
        amount = rate * max(intended, 0.0)
        return {
            "predicted_leakage_rate": rate,
            "predicted_leakage_minor": amount,
            "risk_tier": _risk_tier(rate),
        }

    def buffer_labeled_row(
        self,
        batch_id: str,
        raw_features: dict[str, Any],
        label_rate: float,
        label_amount: float,
        sample_weight: float,
    ) -> None:
        bundle = self._get_bundle()
        if bundle is None:
            logger.warning("leakage_model: no bundle loaded; skipping train buffer for batch=%s", batch_id)
            return

        row = self._normalized_training_row(raw_features, bundle)
        row["predicted_leakage_rate"] = float(np.clip(label_rate, 0.0, 1.0))
        row["target_leakage_amount_minor"] = float(max(label_amount, 0.0))
        row["sample_weight"] = float(sample_weight)
        row["row_id"] = f"real::{batch_id}"
        row["parent_batch_id"] = batch_id
        row["batch_id"] = batch_id
        row["scenario_family"] = "real_runtime"

        with self._lock:
            if any(existing.get("batch_id") == batch_id for existing in self._real_rows):
                return
            self._real_rows.append(row)
            self._append_row_to_disk(row)
            pending = len(self._real_rows) - self._last_trained_row_count
            should_retrain = pending >= config.LEAKAGE_RETRAIN_THRESHOLD and not self._retraining
            if should_retrain:
                self._retraining = True

        if should_retrain:
            thread = threading.Thread(target=self._retrain, daemon=True, name="leakage-retrain")
            thread.start()

    def _ensure_bootstrap_model(self) -> None:
        try:
            self._model_path.parent.mkdir(parents=True, exist_ok=True)
        except Exception:
            logger.warning(
                "leakage_model: model path %s not writable; falling back to bootstrap path",
                self._model_path,
            )
            self._model_path = self._bootstrap_model_path
            return
        if self._model_path.exists():
            return
        if self._bootstrap_model_path.exists():
            try:
                shutil.copy2(self._bootstrap_model_path, self._model_path)
                logger.info("leakage_model: bootstrapped model bundle to %s", self._model_path)
            except Exception:
                logger.warning(
                    "leakage_model: failed copying bootstrap bundle to %s; using bootstrap bundle in place",
                    self._model_path,
                )
                self._model_path = self._bootstrap_model_path

    def _load_bundle(self) -> None:
        try:
            if not self._model_path.exists():
                logger.warning("leakage_model: bundle missing path=%s", self._model_path)
                return
            bundle = joblib.load(self._model_path)
            with self._lock:
                self._bundle = bundle
            logger.info("leakage_model: loaded bundle path=%s version=%s", self._model_path, bundle.get("bundle_version"))
        except Exception:
            logger.exception("leakage_model: failed loading bundle path=%s", self._model_path)

    def _get_bundle(self) -> dict[str, Any] | None:
        with self._lock:
            return self._bundle

    def _load_real_rows(self) -> None:
        try:
            if not self._buffer_path.exists():
                return
            rows: list[dict[str, Any]] = []
            for line in self._buffer_path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                rows.append(json.loads(line))
            with self._lock:
                self._real_rows = rows
            logger.info("leakage_model: loaded %d real labeled rows", len(rows))
        except Exception:
            logger.exception("leakage_model: failed reading real-row buffer path=%s", self._buffer_path)

    def _append_row_to_disk(self, row: dict[str, Any]) -> None:
        try:
            self._buffer_path.parent.mkdir(parents=True, exist_ok=True)
            with self._buffer_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(row) + "\n")
        except Exception:
            logger.warning("leakage_model: could not persist real-row buffer path=%s", self._buffer_path)

    def _retrain(self) -> None:
        try:
            bundle = self._get_bundle()
            if bundle is None:
                return

            train_df = self._load_bootstrap_dataset(bundle)
            with self._lock:
                real_df = pd.DataFrame(self._real_rows)

            if not real_df.empty:
                real_df["sample_weight"] = real_df.get("sample_weight", config.LEAKAGE_REAL_SAMPLE_WEIGHT).astype(float)
                train_df = pd.concat([train_df, real_df], ignore_index=True, sort=False)

            feature_columns = bundle["feature_columns"]
            categorical_columns = bundle["categorical_columns"]
            target_column = bundle["target_column"]

            frame = train_df[feature_columns].copy()
            for col in categorical_columns:
                frame[col] = frame[col].fillna("UNKNOWN").astype(str)
            for col in feature_columns:
                if col not in categorical_columns:
                    frame[col] = pd.to_numeric(frame[col], errors="coerce").fillna(0.0)

            y = pd.to_numeric(train_df[target_column], errors="coerce").fillna(0.0).clip(0.0, 1.0)
            weights = pd.to_numeric(train_df.get("sample_weight", 1.0), errors="coerce").fillna(1.0)

            model = CatBoostRegressor(
                loss_function="MAE",
                eval_metric="MAE",
                random_seed=20260612,
                depth=4,
                learning_rate=0.03,
                l2_leaf_reg=5.0,
                min_data_in_leaf=4,
                random_strength=0.5,
                bagging_temperature=0.0,
                iterations=700,
                verbose=False,
                allow_writing_files=False,
            )
            model.fit(frame, y, cat_features=categorical_columns, sample_weight=weights)

            updated_bundle = dict(bundle)
            updated_bundle["model"] = model
            updated_bundle["training_summary"] = {
                **dict(bundle.get("training_summary", {})),
                "real_labeled_rows": int(len(self._real_rows)),
                "retrained_at": pd.Timestamp.utcnow().isoformat(),
                "training_row_count": int(len(train_df)),
            }
            tmp_path = self._model_path.with_suffix(".tmp")
            joblib.dump(updated_bundle, tmp_path)
            tmp_path.replace(self._model_path)

            with self._lock:
                self._bundle = updated_bundle
                self._last_trained_row_count = len(self._real_rows)
            logger.info(
                "leakage_model: retrain complete rows=%d real_rows=%d",
                len(train_df),
                len(self._real_rows),
            )
        except Exception:
            logger.exception("leakage_model: retrain failed; keeping previous bundle")
        finally:
            with self._lock:
                self._retraining = False

    def _load_bootstrap_dataset(self, bundle: dict[str, Any]) -> pd.DataFrame:
        if self._bootstrap_dataset_path.exists():
            return pd.read_csv(self._bootstrap_dataset_path)

        feature_columns = bundle["feature_columns"]
        target_column = bundle["target_column"]
        columns = feature_columns + [target_column, "sample_weight", "row_id", "parent_batch_id", "batch_id", "scenario_family"]
        return pd.DataFrame(columns=columns)

    def _frame_from_features(self, raw_features: dict[str, Any], bundle: dict[str, Any]) -> pd.DataFrame:
        row = self._normalized_training_row(raw_features, bundle)
        return pd.DataFrame([row], columns=bundle["feature_columns"])

    def _normalized_training_row(self, raw_features: dict[str, Any], bundle: dict[str, Any]) -> dict[str, Any]:
        categorical_columns = set(bundle["categorical_columns"])
        row: dict[str, Any] = {}
        for col in bundle["feature_columns"]:
            value = raw_features.get(col)
            if col in categorical_columns:
                row[col] = "UNKNOWN" if value in (None, "") else str(value)
            else:
                row[col] = _to_float(value)
        return row


def _to_float(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except Exception:
        return 0.0


def _risk_tier(rate: float) -> str:
    if rate > 0.05:
        return "CRITICAL"
    if rate > 0.025:
        return "HIGH"
    if rate > 0.01:
        return "MEDIUM"
    if rate > 0:
        return "LOW"
    return "CLEAN"
