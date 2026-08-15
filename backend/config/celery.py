"""Celery application.

The run lifecycle tasks arrive in milestone 6; this exists from milestone 1 so
the app object is importable and the worker/beat services have something to run.
"""

from __future__ import annotations

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("jobradar")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self) -> str:
    return f"request: {self.request!r}"
