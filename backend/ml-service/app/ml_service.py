"""
MLService — routes incoming ML requests to the correct model and returns results.

Owns the single in-process AmbiguityModel instance so online LR training is
persistent across requests within one process lifetime.  The model is also
persisted to disk every 10 training steps so it survives restarts.
"""

from __future__ import annotations

import logging
from typing import Optional

from app import config
from app.models import isolation_forest, logistic_regression, zscore
from app.schemas import (
    EVENT_TYPE_IF_SCORE,
    EVENT_TYPE_LR_PREDICT,
    EVENT_TYPE_LR_TRAIN,
    EVENT_TYPE_ZSCORE,
    MLRequest,
    MLResult,
)

logger = logging.getLogger(__name__)

_SAVE_EVERY_N_STEPS = 10


class MLService:
    def __init__(self) -> None:
        self._lr_model = logistic_regression.AmbiguityModel.load(config.LR_MODEL_PATH)
        self._steps_since_save = 0

    def process(self, req: MLRequest) -> Optional[MLResult]:
        """
        Dispatch request to the appropriate model handler.
        Returns None for fire-and-forget requests (LR_TRAIN).
        Returns an MLResult with error field set if processing fails.
        """
        try:
            if req.event_type == EVENT_TYPE_IF_SCORE:
                return self._handle_if_score(req)
            if req.event_type == EVENT_TYPE_ZSCORE:
                return self._handle_zscore(req)
            if req.event_type == EVENT_TYPE_LR_PREDICT:
                return self._handle_lr_predict(req)
            if req.event_type == EVENT_TYPE_LR_TRAIN:
                self._handle_lr_train(req)
                return None
            logger.warning("ml_service: unknown event_type=%s event_id=%s", req.event_type, req.event_id)
            return None
        except Exception as exc:
            logger.exception("ml_service: error processing event_id=%s event_type=%s", req.event_id, req.event_type)
            return MLResult(
                event_id=req.event_id,
                event_type=req.event_type,
                tenant_id=req.tenant_id,
                model_outputs={},
                model_version="error",
                error=str(exc),
            )

    # ── Handlers ──────────────────────────────────────────────────────────────

    def _handle_if_score(self, req: MLRequest) -> MLResult:
        payload = req.payload
        raw = payload.get("features") or {}
        history: list[list[float]] = payload.get("history") or []

        features = isolation_forest.build_features(
            ambiguity_rate=float(raw.get("ambiguity_rate", 0.0)),
            variance_rate=float(raw.get("variance_rate", 0.0)),
            settlement_ratio=float(raw.get("settlement_ratio", 0.0)),
            unresolved_ratio=float(raw.get("unresolved_ratio", 0.0)),
            missing_ref_rate=float(raw.get("missing_ref_rate", 0.0)),
        )
        result = isolation_forest.score(features, history)

        return MLResult(
            event_id=req.event_id,
            event_type=req.event_type,
            tenant_id=req.tenant_id,
            model_outputs=result,
            model_version=config.MODEL_VERSION_IF,
        )

    def _handle_zscore(self, req: MLRequest) -> MLResult:
        payload = req.payload
        current_value = float(payload.get("current_value", 0.0))
        history = [float(v) for v in (payload.get("history") or [])]

        result = zscore.detect(current_value, history)

        return MLResult(
            event_id=req.event_id,
            event_type=req.event_type,
            tenant_id=req.tenant_id,
            model_outputs=result,
            model_version=config.MODEL_VERSION_ZSCORE,
        )

    def _handle_lr_predict(self, req: MLRequest) -> MLResult:
        payload = req.payload
        raw = payload.get("features") or {}

        features = logistic_regression.build_features(
            ambiguity_rate=float(raw.get("ambiguity_rate", 0.0)),
            provider_ref_missing_rate=float(raw.get("provider_ref_missing_rate", 0.0)),
            avg_confidence=float(raw.get("avg_confidence", 1.0)),
            value_at_risk_minor=float(raw.get("value_at_risk_minor", 0.0)),
            total_intended_minor=float(raw.get("total_intended_minor", 0.0)),
        )
        prob = self._lr_model.predict(features)
        level = logistic_regression.predict_level(prob)

        return MLResult(
            event_id=req.event_id,
            event_type=req.event_type,
            tenant_id=req.tenant_id,
            model_outputs={"probability": prob, "level": level},
            model_version=config.MODEL_VERSION_LR,
        )

    def _handle_lr_train(self, req: MLRequest) -> None:
        payload = req.payload
        raw_features = payload.get("features", [])
        label = float(payload.get("label", 0.0))
        learning_rate = float(payload.get("learning_rate", 0.01))

        features = [float(f) for f in raw_features]
        if len(features) != logistic_regression.FEATURE_SIZE:
            logger.error(
                "lr_train: expected %d features, got %d — skipping",
                logistic_regression.FEATURE_SIZE, len(features),
            )
            return

        self._lr_model.train(features, label, learning_rate)
        logger.info(
            "lr_train: ok tenant=%s label=%.0f trained_on=%d",
            req.tenant_id, label, self._lr_model.trained_on,
        )

        self._steps_since_save += 1
        if self._steps_since_save >= _SAVE_EVERY_N_STEPS:
            self._lr_model.save(config.LR_MODEL_PATH)
            self._steps_since_save = 0
