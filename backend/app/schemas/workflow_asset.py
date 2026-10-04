import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.workflow_asset import AssetKind


class AssetCreate(BaseModel):
    kind: AssetKind
    name: str = Field(min_length=1, max_length=255)
    content: str = ""


class AssetUpdate(BaseModel):
    name: str | None = None
    content: str | None = None


class AssetOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    kind: AssetKind
    name: str
    content: str
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssetVersionOut(BaseModel):
    id: uuid.UUID
    asset_id: uuid.UUID
    version_no: int
    content_snapshot: str
    saved_by: uuid.UUID
    saved_at: datetime

    model_config = {"from_attributes": True}
