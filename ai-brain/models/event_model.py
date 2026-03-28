from pydantic import BaseModel, Field
from typing import Dict
from datetime import datetime

class Event(BaseModel):
    tenant_id: str = Field(..., min_length=1)
    feature_id: str = Field(..., min_length=1)
    event_type: str
    timestamp: datetime
    session_id: str
    metadata: Dict = {}

    class Config:
        json_schema_extra = {
            "example": {
                "tenant_id": "T1",
                "feature_id": "KYC",
                "event_type": "FEATURE_OPEN",
                "timestamp": "2026-01-01T10:00:00",
                "session_id": "S1",
                "metadata": {}
            }
        }