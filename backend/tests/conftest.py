from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def user_factory(db):
    """Create users without repeating the email/password boilerplate."""
    User = get_user_model()
    counter = {"n": 0}

    def make(email: str | None = None, password: str = "pa55word!secure", **extra):
        counter["n"] += 1
        return User.objects.create_user(
            email=email or f"user{counter['n']}@example.com",
            password=password,
            **extra,
        )

    return make
