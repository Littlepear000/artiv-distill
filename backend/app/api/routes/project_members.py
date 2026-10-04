import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_project_role
from app.database import get_db
from app.models.project_member import ProjectMember, ProjectRole
from app.models.user import User
from app.schemas.project_member import ProjectMemberCreate, ProjectMemberOut, ProjectMemberUpdate

router = APIRouter(prefix="/projects/{project_id}/members", tags=["project-members"])


def _to_out(member: ProjectMember, user: User | None) -> ProjectMemberOut:
    return ProjectMemberOut(
        id=member.id,
        project_id=member.project_id,
        user_id=member.user_id,
        project_role=member.project_role,
        created_at=member.created_at,
        user_name=user.name if user else None,
        user_email=user.email if user else None,
    )


def _is_last_owner(db: Session, project_id: uuid.UUID, member: ProjectMember) -> bool:
    if member.project_role != ProjectRole.OWNER:
        return False
    owners = db.execute(
        select(func.count())
        .select_from(ProjectMember)
        .where(ProjectMember.project_id == project_id, ProjectMember.project_role == ProjectRole.OWNER)
    ).scalar_one()
    return owners <= 1


@router.get("", response_model=list[ProjectMemberOut])
def list_members(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    rows = db.execute(
        select(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.created_at)
    ).all()
    return [_to_out(m, u) for m, u in rows]


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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This user is already a project member")

    member = ProjectMember(
        tenant_id=current_user.tenant_id,
        project_id=project_id,
        user_id=payload.user_id,
        project_role=payload.project_role,
    )
    db.add(member)
    db.flush()
    return _to_out(member, db.get(User, member.user_id))


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if payload.project_role != ProjectRole.OWNER and _is_last_owner(db, project_id, member):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot demote the last owner of a project")
    member.project_role = payload.project_role
    db.flush()
    return _to_out(member, db.get(User, member.user_id))


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if _is_last_owner(db, project_id, member):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot remove the last owner of a project")
    db.delete(member)
