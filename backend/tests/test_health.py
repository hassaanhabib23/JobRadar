"""Milestone 1 exit criterion: /api/health/ answers, and its database check is real."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_health_reports_ok_with_a_working_database(api_client: APIClient) -> None:
    response = api_client.get("/api/health/")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["checks"]["database"] == "ok"


@pytest.mark.django_db
def test_health_needs_no_authentication(api_client: APIClient) -> None:
    """An uptime monitor cannot hold a token."""
    assert api_client.get("/api/health/").status_code == 200


@pytest.mark.django_db
def test_health_reports_last_run_age_key(api_client: APIClient) -> None:
    """The key exists from the start so monitoring does not break in milestone 6."""
    body = api_client.get("/api/health/").json()

    assert "lastSuccessfulRunAgeSeconds" in body, body
