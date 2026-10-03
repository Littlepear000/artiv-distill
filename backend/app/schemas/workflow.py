import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class WorkflowUpdate(BaseModel):
    name: str | None = None


class WorkflowOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
