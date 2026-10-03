# PDF 处理工作流平台

多租户 PDF 自动化处理平台。三个阶段均已完成：**第一阶段**（租户/用户/项目/项目成员的权限架构 RBAC）、**第二阶段**（工作流可视化搭建、节点 Code/Prompt 编辑）、**第三阶段**（PDF 上传、后台异步任务处理、节点沙箱化执行、结果与历史持久化）。

## 目录结构

```
backend/           FastAPI 后端（鉴权、租户/用户/项目/成员/工作流/节点/运行记录 API、数据库模型与迁移、Celery 任务）
backend/sandbox/   节点 Code 执行用的独立沙箱 Docker 镜像（不随 backend 一起构建，需单独 build）
frontend/          React + TypeScript 前端（登录、用户管理、项目/成员管理、工作流可视化编辑器、运行与历史记录）
db/init/           PostgreSQL 初次启动时执行的角色创建脚本（本地开发用）
docker-compose.yml 一键启动 Postgres + Redis + LocalStack(S3) + 后端 + Celery worker + 前端
```

## 本地启动（推荐：Docker）

前提：安装 Docker Desktop。

```bash
# 第一次使用前，先单独构建沙箱镜像（节点 Code 执行环境，不是 docker compose 管理的服务）
docker build -t pdf-workflow-sandbox:latest ./backend/sandbox

docker compose up --build
```

首次启动会自动：
1. 启动 PostgreSQL，并执行 `db/init/01_roles.sql` 创建两个数据库角色（`pdf_app` 常规业务角色、`pdf_app_auth` 登录查找专用角色）
2. 启动 Redis（Celery 任务队列）、LocalStack（本地 S3 兼容对象存储，存 PDF 原件和节点产物）
3. 后端容器执行 `alembic upgrade head` 建表并启用行级安全策略（RLS）
4. 启动后端 API（http://localhost:8000 ，交互式文档见 http://localhost:8000/docs）、Celery worker（消费工作流运行任务）
5. 启动前端（http://localhost:5173）

> 想让节点 Prompt 真正调用 AI（而不是看到"未配置 ANTHROPIC_API_KEY"的报错）：在仓库根目录创建 `.env` 文件写入 `ANTHROPIC_API_KEY=sk-ant-...`，docker-compose 会自动读取。不配置也完全不影响 PDF 上传、异步任务调度、节点 Code 执行这些核心能力。

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
5. 在编辑器页面点击"运行 / 历史记录"，上传一个或多个 PDF 文件并提交——请求会立即返回，不会卡住页面；任务在后台异步执行，页面每隔几秒自动刷新状态，点击某次运行可以看到每个节点的执行状态、耗时、报错信息，并下载每一步产出的文件

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

## 工作流运行与异步处理

- 用户上传 PDF → 后端把文件存入对象存储（本地开发是 LocalStack 模拟的 S3，生产环境换成真实 AWS S3 无需改代码）→ 创建 `workflow_runs` 记录（status=pending）→ 把 `run_id` 丢进 Celery 队列 → **立即返回**，不阻塞前端
- Celery worker 按节点 `order_index` 顺序依次执行：每个节点起一个 `node_runs` 记录，执行完更新状态/耗时/报错/产出文件；某个节点失败就停止后续节点，整个 run 标记为 failed，但已成功的节点及其产出不会丢
- 所有产出文件（上传的原始 PDF、每个节点的输出）都记录在 `files` 表 + 对象存储里，可在运行详情页逐个下载，永久可回溯

## 节点 Code 的沙箱化执行（安全设计）

每个节点的 Code 都是用户自己写的，必须当作不可信代码隔离执行，不能简单 `exec()` 在后端进程里：

- **每次节点执行启动一个一次性 Docker 容器**（镜像见 `backend/sandbox/`），执行完立即销毁，不留痕迹
- **没有公网访问权限**：容器只接入一个专用的 Docker 内部网络（`sandbox_net`，`internal: true`），既连不上外部互联网，也连不上宿主机或其他项目的容器——已用真实请求验证过（DNS 解析直接失败）
- **只能通过受控 SDK 间接访问资源**：节点 Code 拿不到网络/任意文件系统权限，只能调用注入的 `sdk` 对象：`sdk.list_inputs()` / `sdk.read_input_bytes()` / `sdk.extract_pdf_text()`（读输入）、`sdk.write_output()`（写输出）、`sdk.call_llm(prompt, content)`（AI 调用，背后代理到后端 `/internal/llm/complete`，API Key 永远不会进入沙箱）
- **资源限制**：512MB 内存、1 个 CPU、根文件系统只读（仅 `/workspace` 下的几个挂载点可写）、不新增任何 Linux capability、执行超时（默认 120 秒）自动强制终止
- 节点 **Code 留空**时有默认行为：配置了 Prompt 就自动提取所有输入 PDF 文本并调用 LLM 总结，没配置 Prompt 就原样透传输入文件——这样"纯 AI 节点"不需要手写样板代码

已知的生产加固项（当前阶段未做，仅记录，不影响本地开发/演示）：容器内以非 root 用户运行、内部调用令牌从共享静态值改为每次运行单独签发、更细粒度的 egress 控制。

## 本地开发的一个特殊细节：Docker-outside-of-Docker

Celery worker 容器通过挂载宿主机的 `/var/run/docker.sock` 来创建沙箱容器（而不是在 worker 容器内部再跑一个 Docker daemon）。这意味着 worker 实际上是在指挥**宿主机**的 Docker daemon 干活，所以传给沙箱容器的挂载路径必须是宿主机真实存在的路径，不能是 worker 容器自己内部的路径。为此 worker 和宿主机共享同一个目录（`backend/.sandbox-tmp`），worker 把临时文件写在这个共享目录里，再把路径前缀替换成宿主机上的真实绝对路径（`HOST_SANDBOX_TMP_DIR`，docker-compose 里用 `${PWD}` 自动算好）。如果不用 Docker 跑 worker（直接在宿主机装 Celery 跑），完全不需要关心这一段。
