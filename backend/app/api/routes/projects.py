import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_project_role
from app.database import get_db
from app.models.file_record import FileRecord
from app.models.node_run import NodeRun
from app.models.project import Project
from app.models.project_member import ProjectMember, ProjectRole
from app.models.report import Report
from app.models.report_field import ReportField
from app.models.report_field_value import ReportFieldValue
from app.models.result_version import ResultVersion
from app.models.result_version_row import ResultVersionRow
from app.models.user import TenantRole, User
from app.models.workflow import Workflow
from app.models.workflow_asset import WorkflowAsset
from app.models.workflow_asset_version import WorkflowAssetVersion
from app.models.workflow_node import WorkflowNode
from app.models.workflow_node_version import WorkflowNodeVersion
from app.models.workflow_run import WorkflowRun
from app.schemas.project import ProjectCreate, ProjectOut, ProjectOwner, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


def _build_project_outs(db: Session, user: User, projects: list[Project]) -> list[ProjectOut]:
    """Decorate projects with role, owners, counts and last activity."""
    if not projects:
        return []
    ids = [p.id for p in projects]

    def counts(col, model):
        return dict(db.execute(select(col, func.count()).where(col.in_(ids)).group_by(col)).all())

    member_counts = counts(ProjectMember.project_id, ProjectMember)
    report_counts = counts(Report.project_id, Report)
    workflow_counts = counts(Workflow.project_id, Workflow)

    def maxes(col, ts):
        return dict(db.execute(select(col, func.max(ts)).where(col.in_(ids)).group_by(col)).all())

    activity: dict[uuid.UUID, list] = {p.id: [p.created_at] for p in projects}
    for mapping in (
        maxes(Report.project_id, Report.updated_at),
        maxes(WorkflowRun.project_id, WorkflowRun.created_at),
        maxes(Workflow.project_id, Workflow.updated_at),
    ):
        for pid, ts in mapping.items():
            if ts is not None:
                activity[pid].append(ts)

    owners: dict[uuid.UUID, list[ProjectOwner]] = {pid: [] for pid in ids}
    my_roles: dict[uuid.UUID, str] = {}
    for member, member_user in db.execute(
        select(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id.in_(ids))
        .order_by(ProjectMember.created_at)
    ).all():
        if member.project_role == ProjectRole.OWNER:
            owners[member.project_id].append(
                ProjectOwner(id=member_user.id, name=member_user.name, email=member_user.email)
            )
        if member.user_id == user.id:
            my_roles[member.project_id] = member.project_role.value

    out = []
    for p in projects:
        out.append(
            ProjectOut(
                id=p.id,
                tenant_id=p.tenant_id,
                name=p.name,
                description=p.description,
                created_by=p.created_by,
                created_at=p.created_at,
                my_role="owner" if user.tenant_role == TenantRole.ADMIN else my_roles.get(p.id, "viewer"),
                owners=owners[p.id],
                member_count=member_counts.get(p.id, 0),
                report_count=report_counts.get(p.id, 0),
                workflow_count=workflow_counts.get(p.id, 0),
                last_activity_at=max(activity[p.id]),
            )
        )
    return out


def _delete_project_dependents(db: Session, project_id: uuid.UUID) -> None:
    """Delete everything referencing the project, in FK-safe order."""
    run_ids = select(WorkflowRun.id).where(WorkflowRun.project_id == project_id)
    workflow_ids = select(Workflow.id).where(Workflow.project_id == project_id)
    node_ids = select(WorkflowNode.id).where(WorkflowNode.workflow_id.in_(workflow_ids))
    asset_ids = select(WorkflowAsset.id).where(WorkflowAsset.project_id == project_id)

    db.execute(delete(FileRecord).where(FileRecord.project_id == project_id))
    db.execute(delete(NodeRun).where(NodeRun.workflow_run_id.in_(run_ids)))
    db.execute(delete(WorkflowRun).where(WorkflowRun.project_id == project_id))
    db.execute(delete(WorkflowNodeVersion).where(WorkflowNodeVersion.node_id.in_(node_ids)))
    db.execute(delete(WorkflowNode).where(WorkflowNode.workflow_id.in_(workflow_ids)))
    db.execute(delete(Workflow).where(Workflow.project_id == project_id))
    db.execute(delete(WorkflowAssetVersion).where(WorkflowAssetVersion.asset_id.in_(asset_ids)))
    db.execute(delete(WorkflowAsset).where(WorkflowAsset.project_id == project_id))
    version_ids = select(ResultVersion.id).where(ResultVersion.project_id == project_id)
    db.execute(delete(ResultVersionRow).where(ResultVersionRow.version_id.in_(version_ids)))
    db.execute(delete(ResultVersion).where(ResultVersion.project_id == project_id))
    db.execute(delete(ReportFieldValue).where(ReportFieldValue.project_id == project_id))
    db.execute(delete(Report).where(Report.project_id == project_id))
    db.execute(delete(ReportField).where(ReportField.project_id == project_id))
    db.execute(delete(ProjectMember).where(ProjectMember.project_id == project_id))


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
    return _build_project_outs(db, current_user, list(db.execute(stmt).scalars().all()))


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
    return _build_project_outs(db, current_user, [project])[0]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    project = db.execute(select(Project).where(Project.id == project_id)).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return _build_project_outs(db, current_user, [project])[0]


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.OWNER)),
):
    project = db.execute(select(Project).where(Project.id == project_id)).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.flush()
    return _build_project_outs(db, current_user, [project])[0]


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.OWNER)),
):
    project = db.execute(select(Project).where(Project.id == project_id)).scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    _delete_project_dependents(db, project_id)
    db.delete(project)
