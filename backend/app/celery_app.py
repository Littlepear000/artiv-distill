from celery import Celery

from app.config import settings

celery_app = Celery("pdf_workflow", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_track_started=True,
)

celery_app.autodiscover_tasks(["app"])
