import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class NodePosition(BaseModel):
    x: float = 0
    y: float = 0


class NodeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str = ""
    prompt: str = ""
    position: NodePosition = NodePosition()


class NodeUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    prompt: str | None = None
    position: NodePosition | None = None
    code_asset_id: uuid.UUID | None = None
    code_asset_version: int | None = None
    prompt_asset_id: uuid.UUID | None = None
    prompt_asset_version: int | None = None


class NodeReorderRequest(BaseModel):
    node_ids: list[uuid.UUID]


class NodeOut(BaseModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    name: str
    code: str
    prompt: str
    order_index: int
    position: NodePosition
    code_asset_id: uuid.UUID | None
    code_asset_version: int | None
    prompt_asset_id: uuid.UUID | None
    prompt_asset_version: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NodeVersionOut(BaseModel):
    id: uuid.UUID
    node_id: uuid.UUID
    version_no: int
    code_snapshot: str
    prompt_snapshot: str
    saved_by: uuid.UUID
    saved_at: datetime

    model_config = {"from_attributes": True}
