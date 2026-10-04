# ArtivDistill

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

> 想让节点 Prompt 真正调用 AI（而不是看到「未配置 ANTHROPIC_API_KEY」的报错）：在仓库根目录创建 `.env` 文件写入 `ANTHROPIC_API_KEY=sk-ant-...`，docker-compose 会自动读取。不配置也完全不影响 PDF 上传、异步任务调度、节点 Code 执行这些核心能力。

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

1. 打开前端 http://localhost:5173 ，点击「创建新租户」，填写机构名称和管理员账号 —— 这一步会同时创建租户和第一个租户管理员
2. 用该管理员账号登录后，进入「租户用户管理」添加团队成员
3. 进入「项目」创建项目（创建者自动成为该项目 Owner）——点击项目行会进入这个项目自己的主页，左边是侧边栏菜单（工作流 / 项目成员），右边是对应内容，切换菜单时侧边栏本身保持不动
4. 侧边栏点「工作流」：第一次进入会自动创建一个默认工作流，默认停在「编辑」tab——这里是表单/输入框形式的节点列表，不是画布：最上面是「📥 PDF 输入」区块（统一起点，支持本地上传一批 PDF 并触发运行），下面是节点列表，点某个节点展开编辑它的 **Code**（处理逻辑代码）和 **Prompt**（AI 提示词），保存后生效；用「前移/后移」调整节点的执行顺序；每次修改 Code/Prompt 都会自动留存上一版本，可在「版本历史」中查看并一键恢复；一个项目可以建多个工作流，顶部会出现切换下拉框
5. 侧边栏点「项目成员」：把指定租户用户加入项目、分配角色（Owner/Editor/Viewer）
6. 在 PDF 输入区块选一个或多个 PDF 文件、点「上传并运行」——请求立即返回，不会卡住页面，节点列表里每一项都会跟着显示最近一次运行的状态点（灰/蓝/绿/红）和产出文件，点开节点就能直接下载；想单纯看一眼整条流程长什么样、不想碰编辑，切到「流程图」tab——纯展示的可视化画布，点节点只显示结果（状态、产出文件下载），改不了 Code/Prompt；历史记录页（顶部「历史记录」）可以看更早的运行和完整的逐节点报错信息

## 权限模型

- **租户管理员（Tenant Admin）**：可管理本租户所有用户，对本租户所有项目拥有等效 Owner 权限
- **租户普通成员（Tenant Member）**：只能看到自己被加入的项目
- **项目角色**：Owner（可编辑项目、管理成员）> Editor（可编辑，不可管理成员）> Viewer（只读）

## 多租户隔离的实现方式

所有业务表都有 `tenant_id` 字段，并在 PostgreSQL 层开启了 **Row-Level Security（行级安全策略）**：每个 API 请求在查询数据库前，会先把当前用户的租户 ID 写入数据库会话（`SET LOCAL app.current_tenant_id = ...`），之后这个连接上的任何查询都会被数据库自动加上「只能看到这个租户的数据」的过滤条件 —— 即使应用代码某处漏写了租户过滤，也不会跨租户泄露数据。详见 `backend/app/database.py` 和 `backend/alembic/versions/0001_initial.py`。

登录时还不知道用户属于哪个租户，所以 `/auth/login` 单独使用一个具备 `BYPASSRLS` 权限、且只授予了 `SELECT` 权限的专用数据库角色（`pdf_app_auth`）按邮箱查找账号，查到后再切换回受 RLS 约束的常规连接。

## 测试

```bash
cd backend
pytest
```

当前只包含一个不依赖数据库的健康检查冒烟测试；后续阶段会补充覆盖权限边界（如「普通成员看不到未加入的项目」）的测试。

## 工作流与节点模型

- 一个项目下可以创建多个工作流（`workflows` 表）
- 一个工作流下包含多个节点（`workflow_nodes`），每个节点有独立的 `code`（处理逻辑）和 `prompt`（AI 提示词），按 `order_index` 顺序串行执行（当前阶段只搭建结构和编辑能力，节点代码/Prompt 的实际执行在第三阶段实现）
- 节点的 Code/Prompt 每次修改都会在 `workflow_node_versions` 表留一份修改前的快照，支持查看历史与一键恢复
- **编辑和展示是两个分开的 tab**（`frontend/src/components/WorkflowFormEditor.tsx` / `WorkflowDiagramView.tsx`）：「编辑」是表单/输入框形式的节点列表（展开某一项编辑 Code/Prompt、调顺序、删除、传 PDF 触发运行），「流程图」是只读的 **React Flow** 可视化画布（看结构、看每个节点的产出，不能改）——两个 tab 共享同一份节点和"最近一次运行"数据，画布每 4 秒轻量轮询一次运行状态，所以无论在哪个 tab，节点上的状态点（灰=排队中/蓝=执行中/绿=成功/红=失败）都会跟着实际进度动
- 节点的 Code/Prompt **不再在工作流里直接编辑或展示**，只能通过下拉框「从 Code/Prompt 库选择」绑定一个素材库里的条目——选中后会把该素材**当前的内容拷贝**进节点（拷贝关系，不是实时引用），并记下"选用的是哪个素材、第几版"；真正要写代码/改 Prompt，去侧边栏「Code / Prompt 库」的详情页（见下一节），workflow 编辑页只负责"选用哪个版本"
- 下拉框旁边会显示当前绑定的素材名称 + 版本号，并附一个「查看 / 编辑代码」/「查看 / 编辑 Prompt」链接直接跳到素材库详情页；没有选 Code 素材的节点会有黄色提示（没代码可运行），Prompt 是可选项，不选就是没有额外 Prompt
- 节点代码里调用 `sdk.call_llm(content=...)` 不传 `prompt` 参数时，默认用的就是这里绑定的 Prompt，也可以在 Code 里直接用 `sdk.prompt` 拿到这段文本——两者本来就是联动的，不需要额外配置
- 「流程图」tab 点某个处理节点，不再内嵌 Code 预览，而是直接给一个「去 Code 库查看完整代码 →」的链接——看代码和改代码统一都在素材库里
- 每个节点都会显示一个根据节点内容自动生成的「文件名」标签：写了 Code 就显示 `节点名.py`（📄），只写了 Prompt 没写 Code 就显示「✨ AI 摘要（默认行为）」，两者都没写就显示「↷ 透传节点」——不是真的磁盘文件，纯粹是让人一眼看出「这个节点到底在跑什么」

## Code / Prompt 素材库

- 侧边栏「Code / Prompt 库」是项目级的可复用素材管理页（`workflow_assets` 表，`kind` 区分 Code/Prompt）。列表页（`AssetLibraryPage.tsx`）只负责列表：Code/Prompt 切换 tab、「+ 新建空白素材」或「📁 上传 .py/.txt 文件」直接建一个新素材（文件名去掉扩展名当默认名称），表格形式展示名称/所有者/更新时间，超过 8 条自动分页（目前是前端分页，一次性拉全量数据再切页，素材数量到几百条量级之前都没问题，量再大需要换成后端分页）
- 点列表里的名称会跳到独立的详情页（`AssetDetailPage.tsx`，路由 `/projects/{id}/assets/{assetId}`），这个页面撑满侧边栏之外的整个内容区：左边是大尺寸的 Monaco/文本编辑器，右边常驻一条版本历史侧栏（不是点开才出现的折叠区）——每次「保存」都会把保存前的内容存一个新版本，点历史里任意一条可以**只读预览**（不会动当前编辑的内容），预览时上方有「恢复这个版本」和「返回当前编辑」；和节点编辑器一样有"未保存修改"提示 + 离开前的确认拦截
- 编辑工作流节点时，Code/Prompt 各是一个「从 Code/Prompt 库选择」下拉框：选中某条素材，会把它**当前的内容拷贝**进节点的 Code/Prompt，并记下"选用的是哪个素材、第几版"（`workflow_nodes.code_asset_id`/`code_asset_version`，Prompt 同理）——**这是拷贝关系，不是实时引用**：选用之后去库里改了那条素材，节点这边不会跟着联动，要用新内容得重新选一次（这样每个节点都能清楚追溯"当时用的是哪个版本"，不会被后续的素材编辑悄悄改变行为）
- 「流程图」tab 的节点卡片上会显示它引用的 Code/Prompt 素材名称和版本号（比如"📎 Code: Extract Text Helper v2"），运行完成后还会动态列出这次产出的文件名——不用点进节点详情，扫一眼画布就知道每一步用的是什么、产出了什么
- 「流程图」tab 最左边固定一个「📥 PDF 输入」节点，是所有工作流统一的起点；点它看最近一次运行的输入文件（可下载），点普通节点看该节点最近一次的产出文件（可下载）——这个 tab 纯粹用来"看"，上传新 PDF、改 Code/Prompt 都要回到「编辑」tab
- 节点相关接口都嵌套在 `/projects/{project_id}/workflows/{workflow_id}/nodes` 路径下，并在服务端显式校验「工作流确实属于该项目、节点确实属于该工作流」，防止同一租户内跨项目越权访问（已通过测试验证）

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
- 节点 **Code 留空**时有默认行为：配置了 Prompt 就自动提取所有输入 PDF 文本并调用 LLM 总结，没配置 Prompt 就原样透传输入文件——这样「纯 AI 节点」不需要手写样板代码

已知的生产加固项（当前阶段未做，仅记录，不影响本地开发/演示）：容器内以非 root 用户运行、内部调用令牌从共享静态值改为每次运行单独签发、更细粒度的 egress 控制。

## 本地开发的一个特殊细节：Docker-outside-of-Docker

Celery worker 容器通过挂载宿主机的 `/var/run/docker.sock` 来创建沙箱容器（而不是在 worker 容器内部再跑一个 Docker daemon）。这意味着 worker 实际上是在指挥**宿主机**的 Docker daemon 干活，所以传给沙箱容器的挂载路径必须是宿主机真实存在的路径，不能是 worker 容器自己内部的路径。为此 worker 和宿主机共享同一个目录（`backend/.sandbox-tmp`），worker 把临时文件写在这个共享目录里，再把路径前缀替换成宿主机上的真实绝对路径（`HOST_SANDBOX_TMP_DIR`，docker-compose 里用 `${PWD}` 自动算好）。如果不用 Docker 跑 worker（直接在宿主机装 Celery 跑），完全不需要关心这一段。

## 待定：节点分叉（一个节点产出分流给不同下游节点）

讨论过但还没实现。现在的执行引擎和节点模型是严格线性的（`order_index` 一条链，每个节点的全部产出原样传给下一个节点），还不支持"一个节点产出两组文件、分别接不同的下游处理"。

卡住的是两个设计决策，需要再确认：
1. 只支持"一个节点分成多条下游分支"（树状，每个节点最多一个上游），还是也要支持"多条分支汇合回同一个节点"（完整 DAG，执行引擎要处理等待多个依赖、部分失败等情况）
2. 在现在这套表单编辑器里，分支连接关系怎么配置——默认还是线性、分支作为高级选项，还是每个节点都显式选上游

流程图（`WorkflowDiagramView.tsx`）用的是 React Flow，原生就能画任意 DAG，视觉上不是瓶颈；卡点在数据模型和执行引擎。


## 报告（Reports）与解析结果

- 进入项目默认落在「Reports」：支持手动添加（名称/链接/可选 PDF）、Excel 批量导入（模板里自动带上启用了导入的字段列）、按文件名从 OSS/S3 前缀批量匹配链接（先预览再应用）
- 「Report fields」配置要提取的字段（年份、Primary deficit 等）：可分别勾选「允许 Excel 导入历史值」「允许系统解析写入」，并选择自动选值策略（system first / latest）
- 每个字段的每次取值（手动 / Excel / 系统解析）都作为一条历史记录保留，可钉选某一条作为报告当前值；未钉选时按策略自动选
- 工作流节点若输出 `report_results.json`（`{"items":[{"report_name":"...","fields":{"key":"value"}}]}`），会自动写入为系统解析结果
- 界面右上角 EN | 中文 切换语言，默认英文
