import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectOwner(BaseModel):
    id: uuid.UUID
    name: str
    email: str


class ProjectOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None
    created_by: uuid.UUID
    created_at: datetime
    my_role: str = "viewer"
    owners: list[ProjectOwner] = []
    member_count: int = 0
    report_count: int = 0
    workflow_count: int = 0
    last_activity_at: datetime | None = None

    model_config = {"from_attributes": True}
