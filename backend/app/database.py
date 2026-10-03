"""
数据库连接与多租户 RLS 上下文管理。

设计要点（对应架构方案第2节）：
- `engine` / `SessionLocal`：常规业务连接，使用 `pdf_app` 角色，受 RLS 策略约束，
  每个请求必须先 `set_tenant_context()` 才能查到数据。
- `auth_engine` / `AuthSessionLocal`：仅用于登录时"根据 email 查用户"这一步，
  使用具备 BYPASSRLS 的 `pdf_app_auth` 角色 —— 因为登录时还不知道 tenant_id，
  无法先设置 RLS 上下文。生产环境应将该角色权限收紧为仅能 SELECT 必要字段。
"""
import uuid
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

auth_engine = create_engine(settings.auth_database_url, pool_pre_ping=True)
AuthSessionLocal = sessionmaker(bind=auth_engine, autoflush=False, expire_on_commit=False)

Base = declarative_base()


def set_tenant_context(session, tenant_id: uuid.UUID) -> None:
    """在当前事务内设置 RLS 所需的租户上下文，事务结束后自动失效（SET LOCAL）。"""
    session.execute(text(f"SET LOCAL app.current_tenant_id = '{uuid.UUID(str(tenant_id))}'"))


def get_db():
    """FastAPI 依赖：提供一个空的、尚未设置租户上下文的会话（由上层依赖负责设置）。"""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@contextmanager
def get_auth_session():
    """仅用于登录路径：按 email 查用户，绕过 RLS（见模块说明）。"""
    db = AuthSessionLocal()
    try:
        yield db
    finally:
        db.close()
