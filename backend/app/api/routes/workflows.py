import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_project_role
from app.database import get_db
from app.models.project_member import ProjectRole
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.workflow import WorkflowCreate, WorkflowOut, WorkflowUpdate

router = APIRouter(prefix="/projects/{project_id}/workflows", tags=["workflows"])


@router.get("", response_model=list[WorkflowOut])
def list_workflows(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    return db.execute(
        select(Workflow).where(Workflow.project_id == project_id).order_by(Workflow.created_at)
    ).scalars().all()


@router.post("", response_model=WorkflowOut, status_code=status.HTTP_201_CREATED)
def create_workflow(
    project_id: uuid.UUID,
    payload: WorkflowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    workflow = Workflow(
        tenant_id=current_user.tenant_id,
        project_id=project_id,
        name=payload.name,
        created_by=current_user.id,
    )
    db.add(workflow)
    db.flush()
    return workflow


@router.get("/{workflow_id}", response_model=WorkflowOut)
def get_workflow(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    workflow = db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.project_id == project_id)
    ).scalar_one_or_none()
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    return workflow


@router.patch("/{workflow_id}", response_model=WorkflowOut)
def update_workflow(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    payload: WorkflowUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    workflow = db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.project_id == project_id)
    ).scalar_one_or_none()
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(workflow, field, value)
    db.flush()
    return workflow


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workflow(
    project_id: uuid.UUID,
    workflow_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    workflow = db.execute(
        select(Workflow).where(Workflow.id == workflow_id, Workflow.project_id == project_id)
    ).scalar_one_or_none()
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found")
    db.delete(workflow)
