import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_auth_session, get_db, set_tenant_context
from app.models.tenant import Tenant
from app.models.user import TenantRole, User
from app.schemas.auth import CurrentUserOut, LoginRequest, TenantSignupRequest, TokenResponse
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup-tenant", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup_tenant(payload: TenantSignupRequest, db: Session = Depends(get_db)):
    """创建一个新租户及其第一个租户管理员账号（平台的注册入口）。"""
    # id 必须在 Python 侧先生成好（而不是等数据库插入时才生成），
    # 这样才能在 INSERT 之前设置 RLS 上下文，满足两张表的 WITH CHECK 策略
    new_tenant = Tenant(id=uuid.uuid4(), name=payload.tenant_name)
    set_tenant_context(db, new_tenant.id)

    db.add(new_tenant)
    db.flush()

    admin_user = User(
        tenant_id=new_tenant.id,
        email=payload.admin_email,
        hashed_password=hash_password(payload.admin_password),
        name=payload.admin_name,
        tenant_role=TenantRole.ADMIN,
    )
    db.add(admin_user)
    db.flush()

    token = create_access_token(admin_user.id, new_tenant.id, admin_user.tenant_role.value)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest):
    # 登录时尚不知道 tenant_id，必须用具备 BYPASSRLS 的专用连接按 email 查找
    with get_auth_session() as auth_db:
        user = auth_db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()

    if user is None or not user.is_active or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="邮箱或密码错误")

    token = create_access_token(user.id, user.tenant_id, user.tenant_role.value)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=CurrentUserOut)
def read_me(current_user: User = Depends(get_current_user)):
    return CurrentUserOut(
        id=current_user.id,
        tenant_id=current_user.tenant_id,
        email=current_user.email,
        name=current_user.name,
        tenant_role=current_user.tenant_role.value,
    )
