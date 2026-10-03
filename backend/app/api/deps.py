import uuid

from fastapi import Depends, HTTPException, Path, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db, set_tenant_context
from app.models.project_member import ProjectMember, ProjectRole
from app.models.user import TenantRole, User
from app.security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# 项目角色在权限体系中的强弱排序，用于 "至少需要 X 权限" 的判断
_PROJECT_ROLE_RANK = {ProjectRole.VIEWER: 0, ProjectRole.EDITOR: 1, ProjectRole.OWNER: 2}


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
        tenant_id = uuid.UUID(payload["tenant_id"])
    except (ValueError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的登录凭证")

    # 必须先设置 RLS 租户上下文，否则下面的查询在行级安全策略下查不到任何数据
    set_tenant_context(db, tenant_id)

    user = db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id, User.is_active.is_(True))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已被禁用")
    return user


def require_tenant_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.tenant_role != TenantRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要租户管理员权限")
    return current_user


def require_project_role(min_role: ProjectRole):
    """生成一个依赖：要求当前用户在指定项目中至少拥有 min_role 权限（租户管理员直接放行）。"""

    def _dependency(
        project_id: uuid.UUID = Path(...),
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.tenant_role == TenantRole.ADMIN:
            return current_user

        membership = db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == current_user.id,
            )
        ).scalar_one_or_none()

        if membership is None or _PROJECT_ROLE_RANK[membership.project_role] < _PROJECT_ROLE_RANK[min_role]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="没有该项目的足够权限")
        return current_user

    return _dependency
