import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_project_role
from app.database import get_db
from app.models.project import Project
from app.models.project_member import ProjectMember, ProjectRole
from app.models.user import TenantRole, User
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """租户管理员可见本租户所有项目；普通成员仅可见被加入的项目。"""
    if current_user.tenant_role == TenantRole.ADMIN:
        stmt = select(Project).order_by(Project.created_at)
    else:
        stmt = (
            select(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == current_user.id)
            .order_by(Project.created_at)
        )
    return db.execute(stmt).scalars().all()


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = Project(
        tenant_id=current_user.tenant_id,
        name=payload.name,
        description=payload.description,
        created_by=current_user.id,
    )
    db.add(project)
    db.flush()

    # 创建者自动成为项目 Owner
    db.add(
        ProjectMember(
            tenant_id=current_user.tenant_id,
            project_id=project.id,
            user_id=current_user.id,
            project_role=ProjectRole.OWNER,
        )
    )
    db.flush()
    return project


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    project = db.execute(select(Project).where(Project.id == project_id)).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.OWNER)),
):
    project = db.execute(select(Project).where(Project.id == project_id)).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.flush()
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.OWNER)),
):
    project = db.execute(select(Project).where(Project.id == project_id)).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="项目不存在")
    db.delete(project)
