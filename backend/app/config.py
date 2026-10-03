from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://pdf_app:pdf_app_password@localhost:5432/pdf_workflow"
    auth_database_url: str = "postgresql+psycopg2://pdf_app_auth:pdf_app_auth_password@localhost:5432/pdf_workflow"
    jwt_secret_key: str = "change-me-to-a-random-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480


settings = Settings()
