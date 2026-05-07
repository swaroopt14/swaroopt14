from __future__ import annotations

import time
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

# Event type constants — must match mlclient/schemas.go exactly
EVENT_TYPE_IF_SCORE = "ISOLATION_FOREST_SCORE"
EVENT_TYPE_ZSCORE = "ZSCORE_DETECT"
EVENT_TYPE_LR_PREDICT = "LOGISTIC_REGRESSION_PREDICT"
EVENT_TYPE_LR_TRAIN = "LOGISTIC_REGRESSION_TRAIN"


@dataclass
class MLRequest:
    event_id: str
    event_type: str
    tenant_id: str
    payload: dict[str, Any]
    timestamp: int = field(default_factory=lambda: int(time.time()))

    @classmethod
    def from_dict(cls, d: dict) -> MLRequest:
        return cls(
            event_id=d["event_id"],
            event_type=d["event_type"],
            tenant_id=d["tenant_id"],
            payload=d.get("payload", {}),
            timestamp=d.get("timestamp", int(time.time())),
        )


@dataclass
class MLResult:
    event_id: str
    event_type: str
    tenant_id: str
    model_outputs: dict[str, Any]
    model_version: str
    processed_at: int = field(default_factory=lambda: int(time.time()))
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)
