-- 仅用于本地开发环境：创建两个运行期数据库角色。
-- 生产环境务必更换密码，并通过密钥管理服务下发，不要硬编码在仓库中。

-- 常规业务角色：受行级安全策略（RLS）约束，所有普通 API 请求使用它
CREATE ROLE pdf_app LOGIN PASSWORD 'pdf_app_password';
GRANT CONNECT ON DATABASE pdf_workflow TO pdf_app;
GRANT USAGE ON SCHEMA public TO pdf_app;

-- 登录查找专用角色：具备 BYPASSRLS，仅在 /auth/login 按 email 查用户时使用，
-- 生产环境应进一步收紧为仅 SELECT (id, tenant_id, hashed_password, is_active) 等必要列。
CREATE ROLE pdf_app_auth LOGIN PASSWORD 'pdf_app_auth_password' BYPASSRLS;
GRANT CONNECT ON DATABASE pdf_workflow TO pdf_app_auth;
GRANT USAGE ON SCHEMA public TO pdf_app_auth;
