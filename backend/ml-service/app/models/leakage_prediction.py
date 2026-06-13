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

        frame, diagnostics = self._frame_from_features(raw_features, bundle)
        model = bundle["model"]
        rate = float(np.clip(model.predict(frame)[0], 0.0, 1.0))
        intended = float(frame["batch_total_intended_amount_minor"].iloc[0])
        amount = rate * max(intended, 0.0)
        return {
            "predicted_leakage_rate": rate,
            "predicted_leakage_minor": amount,
            "risk_tier": _risk_tier(rate),
            "fallback_feature_count": diagnostics["fallback_feature_count"],
            "fallback_features": diagnostics["fallback_features"],
            "fallback_segment_level": diagnostics["fallback_segment_level"],
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

        row, _ = self._normalized_training_row(raw_features, bundle)
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
                frame[col] = frame[col].map(lambda value: _normalize_categorical_value(value, bundle) or "unknown")
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
            updated_bundle["fallback_priors"] = self._build_fallback_priors(train_df, feature_columns, categorical_columns)
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

    def _frame_from_features(self, raw_features: dict[str, Any], bundle: dict[str, Any]) -> tuple[pd.DataFrame, dict[str, Any]]:
        row, diagnostics = self._normalized_training_row(raw_features, bundle)
        return pd.DataFrame([row], columns=bundle["feature_columns"]), diagnostics

    def _normalized_training_row(self, raw_features: dict[str, Any], bundle: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        feature_columns = bundle["feature_columns"]
        categorical_columns = list(bundle["categorical_columns"])
        categorical_set = set(categorical_columns)
        priors = bundle.get("fallback_priors", {})

        normalized: dict[str, Any] = {}
        fallback_features: list[str] = []
        fallback_level = "global"

        for col in feature_columns:
            value = raw_features.get(col)
            if col in categorical_set:
                normalized[col] = _normalize_categorical_value(value, bundle)
            else:
                normalized[col] = _to_float_or_none(value)

        normalized["source_system"], source_used, source_level = self._fill_categorical_with_prior(
            normalized.get("source_system"),
            "source_system",
            normalized,
            priors,
            bundle,
        )
        if source_used:
            fallback_features.append("source_system")
            fallback_level = more_specific_level(fallback_level, source_level)

        normalized["rail"], rail_used, rail_level = self._fill_categorical_with_prior(
            normalized.get("rail"),
            "rail",
            normalized,
            priors,
            bundle,
        )
        if rail_used:
            fallback_features.append("rail")
            fallback_level = more_specific_level(fallback_level, rail_level)

        normalized["provider_key"], provider_used, provider_level = self._fill_categorical_with_prior(
            normalized.get("provider_key"),
            "provider_key",
            normalized,
            priors,
            bundle,
        )
        if provider_used:
            fallback_features.append("provider_key")
            fallback_level = more_specific_level(fallback_level, provider_level)

        for col in categorical_columns:
            if col in {"source_system", "rail", "provider_key"}:
                continue
            filled, used, level = self._fill_categorical_with_prior(normalized.get(col), col, normalized, priors, bundle)
            normalized[col] = filled
            if used:
                fallback_features.append(col)
                fallback_level = more_specific_level(fallback_level, level)
        for col in feature_columns:
            if col in categorical_set:
                continue
            if normalized[col] is None:
                filled, level = self._fill_numeric_with_prior(col, normalized, priors, bundle)
                normalized[col] = filled
                fallback_level = more_specific_level(fallback_level, level)
                fallback_features.append(col)
            else:
                normalized[col] = float(normalized[col])

        for col in categorical_columns:
            if normalized[col] is None:
                normalized[col] = "unknown"

        return normalized, {
            "fallback_feature_count": len(fallback_features),
            "fallback_features": sorted(set(fallback_features)),
            "fallback_segment_level": fallback_level,
        }

    def _fill_categorical_with_prior(
        self,
        value: str | None,
        feature: str,
        row: dict[str, Any],
        priors: dict[str, Any],
        bundle: dict[str, Any],
    ) -> tuple[str | None, bool, str]:
        if value is not None:
            return value, False, "global"
        fallback, level = self._lookup_prior(feature, row, priors, bundle, "categorical")
        return (_normalize_categorical_value(fallback, bundle) or "unknown"), True, level

    def _fill_numeric_with_prior(
        self,
        feature: str,
        row: dict[str, Any],
        priors: dict[str, Any],
        bundle: dict[str, Any],
    ) -> tuple[float, str]:
        fallback, level = self._lookup_prior(feature, row, priors, bundle, "numeric")
        return float(0.0 if fallback is None else fallback), level

    def _lookup_prior(
        self,
        feature: str,
        row: dict[str, Any],
        priors: dict[str, Any],
        bundle: dict[str, Any],
        family: str,
    ) -> tuple[Any, str]:
        segments = priors.get("segments", {})
        segment_levels = bundle.get("segment_levels", [])
        best_level = "global"
        for level_columns in reversed(segment_levels):
            level_key = "__".join(level_columns)
            segment_key = _row_segment_key(row, level_columns)
            if segment_key is None:
                continue
            level_map = segments.get(level_key, {})
            values = level_map.get(segment_key, {})
            family_values = values.get(family, {})
            if feature in family_values:
                return family_values[feature], level_key
        return priors.get("global", {}).get(family, {}).get(feature), best_level

    def _build_fallback_priors(
        self,
        train_df: pd.DataFrame,
        feature_columns: list[str],
        categorical_columns: list[str],
    ) -> dict[str, Any]:
        numeric_columns = [col for col in feature_columns if col not in categorical_columns]
        frame = train_df.copy()
        for col in categorical_columns:
            frame[col] = frame[col].map(lambda value: _normalize_categorical_value(value, {"missing_category_tokens": []}) or "unknown")

        global_numeric = {
            col: float(pd.to_numeric(frame[col], errors="coerce").dropna().median())
            for col in numeric_columns
        }
        global_categorical = {
            col: _mode_or_default(frame[col], "unknown")
            for col in categorical_columns
        }

        segments: dict[str, dict[str, dict[str, Any]]] = {}
        for level_columns in (["source_system"], ["source_system", "rail"], ["source_system", "rail", "provider_key"]):
            level_key = "__".join(level_columns)
            level_segments: dict[str, dict[str, Any]] = {}
            grouped = frame.groupby(level_columns, dropna=False, sort=False)
            for group_values, group_df in grouped:
                if not isinstance(group_values, tuple):
                    group_values = (group_values,)
                normalized_values = [str(value).strip().lower() for value in group_values]
                if any(not value or value == "unknown" for value in normalized_values):
                    continue
                segment_key = "||".join(normalized_values)
                level_segments[segment_key] = {
                    "numeric": {
                        col: float(pd.to_numeric(group_df[col], errors="coerce").dropna().median())
                        for col in numeric_columns
                    },
                    "categorical": {
                        col: _mode_or_default(group_df[col], global_categorical[col])
                        for col in categorical_columns
                    },
                    "row_count": int(len(group_df)),
                }
            segments[level_key] = level_segments

        return {
            "global": {
                "numeric": global_numeric,
                "categorical": global_categorical,
            },
            "segments": segments,
        }


def _to_float(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except Exception:
        return 0.0


def _to_float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except Exception:
        return None


def _normalize_categorical_value(value: Any, bundle: dict[str, Any]) -> str | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    missing_tokens = set(bundle.get("missing_category_tokens", []))
    if text in missing_tokens:
        return None
    return text


def _row_segment_key(row: dict[str, Any], columns: list[str]) -> str | None:
    values: list[str] = []
    for col in columns:
        value = row.get(col)
        if value in (None, "", "unknown"):
            return None
        values.append(str(value))
    return "||".join(values)


def _mode_or_default(series: pd.Series, default: str) -> str:
    cleaned = [str(value).strip() for value in series.tolist() if str(value).strip()]
    if not cleaned:
        return default
    return pd.Series(cleaned).mode(dropna=True).iloc[0]


def more_specific_level(current: str, candidate: str) -> str:
    rank = {
        "global": 0,
        "source_system": 1,
        "source_system__rail": 2,
        "source_system__rail__provider_key": 3,
    }
    if rank.get(candidate, 0) > rank.get(current, 0):
        return candidate
    return current


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
