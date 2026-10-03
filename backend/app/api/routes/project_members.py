import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_project_role
from app.database import get_db
from app.models.project_member import ProjectMember, ProjectRole
from app.models.user import User
from app.schemas.project_member import ProjectMemberCreate, ProjectMemberOut, ProjectMemberUpdate

router = APIRouter(prefix="/projects/{project_id}/members", tags=["project-members"])


@router.get("", response_model=list[ProjectMemberOut])
def list_members(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    return db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project_id).order_by(ProjectMember.created_at)
    ).scalars().all()


@router.post("", response_model=ProjectMemberOut, status_code=status.HTTP_201_CREATED)
def add_member(
    project_id: uuid.UUID,
    payload: ProjectMemberCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.OWNER)),
):
    existing = db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == payload.user_id
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该用户已是项目成员")

    member = ProjectMember(
        tenant_id=current_user.tenant_id,
        project_id=project_id,
        user_id=payload.user_id,
        project_role=payload.project_role,
    )
    db.add(member)
    db.flush()
    return member


@router.patch("/{member_id}", response_model=ProjectMemberOut)
def update_member_role(
    project_id: uuid.UUID,
    member_id: uuid.UUID,
    payload: ProjectMemberUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.OWNER)),
):
    member = db.execute(
        select(ProjectMember).where(ProjectMember.id == member_id, ProjectMember.project_id == project_id)
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="成员不存在")
    member.project_role = payload.project_role
    db.flush()
    return member


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    project_id: uuid.UUID,
    member_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.OWNER)),
):
    member = db.execute(
        select(ProjectMember).where(ProjectMember.id == member_id, ProjectMember.project_id == project_id)
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="成员不存在")
    db.delete(member)
