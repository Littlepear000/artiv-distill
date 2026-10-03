import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.project_member import ProjectRole


class ProjectMemberCreate(BaseModel):
    user_id: uuid.UUID
    project_role: ProjectRole = ProjectRole.VIEWER


class ProjectMemberUpdate(BaseModel):
    project_role: ProjectRole


class ProjectMemberOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    project_role: ProjectRole
    created_at: datetime

    model_config = {"from_attributes": True}
