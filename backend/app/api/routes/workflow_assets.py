import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_project_role
from app.database import get_db
from app.models.project_member import ProjectRole
from app.models.user import User
from app.models.workflow_asset import AssetKind, WorkflowAsset
from app.models.workflow_asset_version import WorkflowAssetVersion
from app.schemas.workflow_asset import AssetCreate, AssetOut, AssetUpdate, AssetVersionOut

router = APIRouter(prefix="/projects/{project_id}/assets", tags=["workflow-assets"])


def _get_asset_or_404(db: Session, project_id: uuid.UUID, asset_id: uuid.UUID) -> WorkflowAsset:
    asset = db.execute(
        select(WorkflowAsset).where(WorkflowAsset.id == asset_id, WorkflowAsset.project_id == project_id)
    ).scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")
    return asset


@router.get("", response_model=list[AssetOut])
def list_assets(
    project_id: uuid.UUID,
    kind: AssetKind | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    stmt = select(WorkflowAsset).where(WorkflowAsset.project_id == project_id)
    if kind is not None:
        stmt = stmt.where(WorkflowAsset.kind == kind)
    stmt = stmt.order_by(WorkflowAsset.updated_at.desc())
    return db.execute(stmt).scalars().all()


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def create_asset(
    project_id: uuid.UUID,
    payload: AssetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    asset = WorkflowAsset(
        tenant_id=current_user.tenant_id,
        project_id=project_id,
        kind=payload.kind,
        name=payload.name,
        content=payload.content,
        created_by=current_user.id,
    )
    db.add(asset)
    db.flush()
    return asset


@router.get("/{asset_id}", response_model=AssetOut)
def get_asset(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    return _get_asset_or_404(db, project_id, asset_id)


@router.patch("/{asset_id}", response_model=AssetOut)
def update_asset(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    payload: AssetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    asset = _get_asset_or_404(db, project_id, asset_id)
    updates = payload.model_dump(exclude_unset=True)

    if "content" in updates and updates["content"] != asset.content:
        next_version_no = db.execute(
            select(func.coalesce(func.max(WorkflowAssetVersion.version_no), 0)).where(
                WorkflowAssetVersion.asset_id == asset_id
            )
        ).scalar_one() + 1
        db.add(
            WorkflowAssetVersion(
                tenant_id=current_user.tenant_id,
                asset_id=asset.id,
                version_no=next_version_no,
                content_snapshot=asset.content,
                saved_by=current_user.id,
            )
        )

    for field, value in updates.items():
        setattr(asset, field, value)
    db.flush()
    return asset


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    asset = _get_asset_or_404(db, project_id, asset_id)
    db.delete(asset)


@router.get("/{asset_id}/versions", response_model=list[AssetVersionOut])
def list_asset_versions(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_project_role(ProjectRole.VIEWER)),
):
    _get_asset_or_404(db, project_id, asset_id)
    return db.execute(
        select(WorkflowAssetVersion)
        .where(WorkflowAssetVersion.asset_id == asset_id)
        .order_by(WorkflowAssetVersion.version_no.desc())
    ).scalars().all()


@router.post("/{asset_id}/versions/{version_id}/restore", response_model=AssetOut)
def restore_asset_version(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_role(ProjectRole.EDITOR)),
):
    asset = _get_asset_or_404(db, project_id, asset_id)
    version = db.execute(
        select(WorkflowAssetVersion).where(
            WorkflowAssetVersion.id == version_id, WorkflowAssetVersion.asset_id == asset_id
        )
    ).scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

    next_version_no = db.execute(
        select(func.coalesce(func.max(WorkflowAssetVersion.version_no), 0)).where(
            WorkflowAssetVersion.asset_id == asset_id
        )
    ).scalar_one() + 1
    db.add(
        WorkflowAssetVersion(
            tenant_id=current_user.tenant_id,
            asset_id=asset.id,
            version_no=next_version_no,
            content_snapshot=asset.content,
            saved_by=current_user.id,
        )
    )
    asset.content = version.content_snapshot
    db.flush()
    return asset
