from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://pdf_app:pdf_app_password@localhost:5432/pdf_workflow"
    auth_database_url: str = "postgresql+psycopg2://pdf_app_auth:pdf_app_auth_password@localhost:5432/pdf_workflow"
    jwt_secret_key: str = "change-me-to-a-random-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    redis_url: str = "redis://localhost:6379/0"

    s3_endpoint_url: str = "http://localhost:4566"
    s3_access_key: str = "test"
    s3_secret_key: str = "test"
    s3_region: str = "us-east-1"
    s3_bucket: str = "pdf-workflow"
    # 本地 LocalStack/MinIO 用 path；阿里云 OSS 必须用 virtual
    s3_addressing_style: str = "path"
    # 预签名下载链接给浏览器用，必须是公网可达的地址；留空则沿用 s3_endpoint_url（OSS 内网地址浏览器访问不了，需填公网地址）
    s3_public_endpoint_url: str = ""

    sandbox_image: str = "pdf-workflow-sandbox:latest"
    sandbox_internal_token: str = "dev-sandbox-token-change-me"
    sandbox_network: str = "pdf_workflow_sandbox_net"
    llm_proxy_url: str = "http://backend:8000/internal/llm/complete"

    # worker 容器通过挂载的 docker.sock 调用的是宿主机的 Docker daemon（sibling containers
    # 模式），所以传给 containers.run() 的 volume 源路径必须是宿主机路径，不能是 worker
    # 容器自己文件系统里的路径。做法：worker 和宿主机共享同一个目录，worker 这边挂载在
    # sandbox_tmp_dir，宿主机那边的真实路径由 HOST_SANDBOX_TMP_DIR 告知。
    sandbox_tmp_dir: str = "/sandbox-tmp"
    host_sandbox_tmp_dir: str = ""

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-5"

    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"


settings = Settings()
