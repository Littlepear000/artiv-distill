# PDF 处理工作流平台

多租户 PDF 自动化处理平台。本仓库目前完成**第一阶段**：租户 / 用户 / 项目 / 项目成员的权限架构（RBAC）。

工作流可视化搭建、节点 Code/Prompt 编辑、PDF 异步处理将在后续阶段加入。

## 目录结构

```
backend/    FastAPI 后端（鉴权、租户/用户/项目/成员 API、数据库模型与迁移）
frontend/   React + TypeScript 前端（登录、租户用户管理、项目与成员管理页面）
db/init/    PostgreSQL 初次启动时执行的角色创建脚本（本地开发用）
docker-compose.yml   一键启动 Postgres + 后端 + 前端
```

## 本地启动（推荐：Docker）

前提：安装 Docker Desktop。

```bash
docker compose up --build
```

首次启动会自动：
1. 启动 PostgreSQL，并执行 `db/init/01_roles.sql` 创建两个数据库角色（`pdf_app` 常规业务角色、`pdf_app_auth` 登录查找专用角色）
2. 后端容器执行 `alembic upgrade head` 建表并启用行级安全策略（RLS）
3. 启动后端 API（http://localhost:8000 ，交互式文档见 http://localhost:8000/docs）
4. 启动前端（http://localhost:5173）

> 说明：你本机的 Node 版本是 v14，而 Vite 需要 Node 18+。用 Docker 启动可以绕开这个问题，因为前端实际运行在容器内置的 Node 20 环境里，不依赖你本机的 Node 版本。如果你想直接在本机跑前端（不用 Docker），需要先把 Node 升级到 18 及以上。

## 本地启动（不用 Docker）

需要本机已安装 PostgreSQL 16、Python 3.11+、Node 18+。

```bash
# 1. 创建数据库和角色
createdb pdf_workflow
psql pdf_workflow -f db/init/01_roles.sql

# 2. 后端
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # 按需修改
MIGRATION_DATABASE_URL=postgresql+psycopg2://<你的超级用户>@localhost:5432/pdf_workflow alembic upgrade head
uvicorn app.main:app --reload

# 3. 前端（新开一个终端，Node 版本需 >= 18）
cd frontend
npm install
cp .env.example .env
npm run dev
```

## 使用流程

1. 打开前端 http://localhost:5173 ，点击"创建新租户"，填写机构名称和管理员账号 —— 这一步会同时创建租户和第一个租户管理员
2. 用该管理员账号登录后，进入"租户用户管理"添加团队成员
3. 进入"项目"创建项目（创建者自动成为该项目 Owner），再进入项目的"管理成员"把指定租户用户加入项目、分配角色（Owner/Editor/Viewer）

## 权限模型

- **租户管理员（Tenant Admin）**：可管理本租户所有用户，对本租户所有项目拥有等效 Owner 权限
- **租户普通成员（Tenant Member）**：只能看到自己被加入的项目
- **项目角色**：Owner（可编辑项目、管理成员）> Editor（可编辑，不可管理成员）> Viewer（只读）

## 多租户隔离的实现方式

所有业务表都有 `tenant_id` 字段，并在 PostgreSQL 层开启了 **Row-Level Security（行级安全策略）**：每个 API 请求在查询数据库前，会先把当前用户的租户 ID 写入数据库会话（`SET LOCAL app.current_tenant_id = ...`），之后这个连接上的任何查询都会被数据库自动加上"只能看到这个租户的数据"的过滤条件 —— 即使应用代码某处漏写了租户过滤，也不会跨租户泄露数据。详见 `backend/app/database.py` 和 `backend/alembic/versions/0001_initial.py`。

登录时还不知道用户属于哪个租户，所以 `/auth/login` 单独使用一个具备 `BYPASSRLS` 权限、且只授予了 `SELECT` 权限的专用数据库角色（`pdf_app_auth`）按邮箱查找账号，查到后再切换回受 RLS 约束的常规连接。

## 测试

```bash
cd backend
pytest
```

当前只包含一个不依赖数据库的健康检查冒烟测试；后续阶段会补充覆盖权限边界（如"普通成员看不到未加入的项目"）的测试。

## 下一步（第二阶段）

工作流可视化搭建模块、节点 Code/Prompt 编辑模块（React Flow 画布 + Monaco Editor）。
