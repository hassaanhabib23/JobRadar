"""Project-level views that belong to no single app."""

from __future__ import annotations

import logging
from typing import Any

from django.db import connection
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


class HealthView(APIView):
    """Liveness plus a real database check.

    An uptime monitor watches this. From milestone 6 it also reports how old the
    last *successful* run is, which is the cheapest possible way to notice that
    the worker or beat has quietly died.
    """

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(
        operation_id="health",
        responses={200: dict, 503: dict},
        description="Service health: database connectivity and last successful run age.",
    )
    def get(self, request: Request) -> Response:
        checks: dict[str, str] = {}

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            checks["database"] = "ok"
        except Exception as exc:  # pragma: no cover - exercised by killing postgres
            logger.exception("health check: database unreachable")
            checks["database"] = f"error: {exc.__class__.__name__}"

        # An uptime monitor can watch this: a worker that quietly died shows up
        # as a growing number here long before anyone notices missing jobs.
        last_run_age: float | None = None
        if checks.get("database") == "ok":
            try:
                from django.utils import timezone

                from jobs.runner import last_successful_run

                last_run = last_successful_run()
                if last_run is not None:
                    last_run_age = (timezone.now() - last_run.started_at).total_seconds()
            except Exception:
                logger.exception("health check: could not read the last run")

        healthy = all(value == "ok" for value in checks.values())
        payload = {
            "status": "ok" if healthy else "degraded",
            "checks": checks,
            "last_successful_run_age_seconds": last_run_age,
        }
        return Response(
            payload,
            status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        )
