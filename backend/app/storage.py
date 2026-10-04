"""对象存储（S3 兼容，本地开发用 MinIO）访问封装。

数据库里只存 storage_key 等元数据，PDF 原件和节点产物的实际字节内容都在这里。
"""
import logging
import uuid

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config import settings

_s3_client = None
_s3_public_client = None


def _make_client(endpoint_url: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        # LocalStack/MinIO 需要 path-style（否则会解析 bucket.endpoint 这种域名）；
        # 阿里云 OSS 只支持 virtual-hosted 风格 + s3v4 签名，通过 S3_ADDRESSING_STYLE=virtual 切换
        config=Config(signature_version="s3v4", s3={"addressing_style": settings.s3_addressing_style}),
    )


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = _make_client(settings.s3_endpoint_url)
    return _s3_client


def get_s3_public_client():
    """只用来生成给浏览器用的预签名链接；内网 endpoint 浏览器访问不了，所以可单独配公网地址。"""
    global _s3_public_client
    if not settings.s3_public_endpoint_url:
        return get_s3_client()
    if _s3_public_client is None:
        _s3_public_client = _make_client(settings.s3_public_endpoint_url)
    return _s3_public_client


def ensure_bucket_exists() -> None:
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        try:
            client.create_bucket(Bucket=settings.s3_bucket)
        except ClientError as exc:
            # 生产环境（如 OSS 子账号无建桶权限）bucket 应事先建好，这里不阻止应用启动
            logging.getLogger(__name__).warning("Bucket %s unavailable and could not be created: %s", settings.s3_bucket, exc)


def build_storage_key(tenant_id: uuid.UUID, project_id: uuid.UUID, *parts: str) -> str:
    return "/".join(["tenants", str(tenant_id), "projects", str(project_id), *parts])


def upload_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    get_s3_client().put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type)


def download_bytes(key: str) -> bytes:
    response = get_s3_client().get_object(Bucket=settings.s3_bucket, Key=key)
    return response["Body"].read()


def list_object_keys(prefix: str, bucket: str | None = None) -> list[str]:
    """List all object keys under a prefix (skips "directory" placeholder keys)."""
    client = get_s3_client()
    paginator = client.get_paginator("list_objects_v2")
    keys: list[str] = []
    for page in paginator.paginate(Bucket=bucket or settings.s3_bucket, Prefix=prefix):
        for obj in page.get("Contents", []) or []:
            if not obj["Key"].endswith("/"):
                keys.append(obj["Key"])
    return keys


def presigned_download_url(key: str, bucket: str | None = None, expires_in: int = 3600) -> str:
    return get_s3_public_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket or settings.s3_bucket, "Key": key},
        ExpiresIn=expires_in,
    )
