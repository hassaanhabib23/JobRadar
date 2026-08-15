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

        healthy = all(value == "ok" for value in checks.values())
        payload = {
            "status": "ok" if healthy else "degraded",
            "checks": checks,
            # Wired to the Run model in milestone 6. Present from the start so the
            # contract does not change under monitoring later.
            "last_successful_run_age_seconds": None,
        }
        return Response(
            payload,
            status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        )
