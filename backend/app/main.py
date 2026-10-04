from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    auth,
    internal,
    project_members,
    projects,
    report_fields,
    reports,
    results,
    users,
    workflow_assets,
    workflow_nodes,
    workflow_runs,
    workflows,
)
from app.storage import ensure_bucket_exists


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_bucket_exists()
    yield


app = FastAPI(title="ArtivDistill API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(project_members.router)
app.include_router(report_fields.router)
app.include_router(reports.router)
app.include_router(results.router)
app.include_router(workflows.router)
app.include_router(workflow_assets.router)
app.include_router(workflow_nodes.router)
app.include_router(workflow_runs.router)
app.include_router(internal.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
