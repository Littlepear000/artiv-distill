"""对象存储（S3 兼容，本地开发用 MinIO）访问封装。

数据库里只存 storage_key 等元数据，PDF 原件和节点产物的实际字节内容都在这里。
"""
import uuid

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config import settings

_s3_client = None


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            # LocalStack/MinIO 等自建 S3 兼容服务需要 path-style 寻址，
            # 否则会尝试用 bucket.endpoint 这种虚拟主机风格的域名，本地解析不了
            config=Config(s3={"addressing_style": "path"}),
        )
    return _s3_client


def ensure_bucket_exists() -> None:
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        client.create_bucket(Bucket=settings.s3_bucket)


def build_storage_key(tenant_id: uuid.UUID, project_id: uuid.UUID, *parts: str) -> str:
    return "/".join(["tenants", str(tenant_id), "projects", str(project_id), *parts])


def upload_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    get_s3_client().put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type)


def download_bytes(key: str) -> bytes:
    response = get_s3_client().get_object(Bucket=settings.s3_bucket, Key=key)
    return response["Body"].read()
