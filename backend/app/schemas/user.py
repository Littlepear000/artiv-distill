import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.user import TenantRole


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=255)
    tenant_role: TenantRole = TenantRole.MEMBER


class UserUpdate(BaseModel):
    name: str | None = None
    tenant_role: TenantRole | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    email: EmailStr
    name: str
    tenant_role: TenantRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
