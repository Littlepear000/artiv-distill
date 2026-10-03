# PDF 处理工作流平台

多租户 PDF 自动化处理平台。本仓库目前完成**第一阶段**（租户/用户/项目/项目成员的权限架构 RBAC）和**第二阶段**（工作流可视化搭建、节点 Code/Prompt 编辑）。

PDF 文件上传、后台异步处理将在第三阶段加入。

## 目录结构

```
backend/    FastAPI 后端（鉴权、租户/用户/项目/成员/工作流/节点 API、数据库模型与迁移）
frontend/   React + TypeScript 前端（登录、用户管理、项目/成员管理、工作流可视化编辑器）
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
4. 进入项目的"工作流"创建一个工作流，点击"打开编辑器"进入可视化画布：点击"添加节点"新增处理节点，点击某个节点在右侧面板编辑它的 **Code**（处理逻辑代码）和 **Prompt**（AI 提示词），保存后生效；用"前移/后移"调整节点的执行顺序；每次修改 Code/Prompt 都会自动留存上一版本，可在"版本历史"中查看并一键恢复

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

## 工作流与节点模型

- 一个项目下可以创建多个工作流（`workflows` 表）
- 一个工作流下包含多个节点（`workflow_nodes`），每个节点有独立的 `code`（处理逻辑）和 `prompt`（AI 提示词），按 `order_index` 顺序串行执行（当前阶段只搭建结构和编辑能力，节点代码/Prompt 的实际执行在第三阶段实现）
- 节点的 Code/Prompt 每次修改都会在 `workflow_node_versions` 表留一份修改前的快照，支持查看历史与一键恢复
- 前端编辑器使用 **React Flow** 渲染节点画布（节点可拖拽摆放，连线按执行顺序自动生成），**Monaco Editor** 编辑节点 Code（Prompt 用普通文本框，因为它是自然语言而非代码）
- 节点相关接口都嵌套在 `/projects/{project_id}/workflows/{workflow_id}/nodes` 路径下，并在服务端显式校验"工作流确实属于该项目、节点确实属于该工作流"，防止同一租户内跨项目越权访问（已通过测试验证）

## 下一步（第三阶段）

PDF 文件上传、后台异步任务处理（Celery + Redis）、节点 Code/Prompt 沙箱化执行、结果与历史持久化。
