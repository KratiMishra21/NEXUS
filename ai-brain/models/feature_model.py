from pydantic import BaseModel

class Feature(BaseModel):
    feature_id: str
    usage_count: int = 0
    success_count: int = 0
    fail_count: int = 0