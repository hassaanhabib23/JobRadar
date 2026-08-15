"""The custom user model is a first-migration decision — lock its shape in now."""

from __future__ import annotations

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model


def test_auth_user_model_is_the_custom_one() -> None:
    assert settings.AUTH_USER_MODEL == "users.User"


def test_email_is_the_username_field() -> None:
    User = get_user_model()

    assert User.USERNAME_FIELD == "email"
    assert User.REQUIRED_FIELDS == []
    assert not hasattr(User, "username") or User.username is None


@pytest.mark.django_db
def test_create_user_hashes_the_password() -> None:
    User = get_user_model()

    user = User.objects.create_user(email="dev@example.com", password="pa55word!secure")

    assert user.password != "pa55word!secure"
    assert user.check_password("pa55word!secure")
    assert user.onboarding_complete is False


@pytest.mark.django_db
def test_email_is_unique() -> None:
    from django.db import IntegrityError

    User = get_user_model()
    User.objects.create_user(email="dup@example.com", password="pa55word!secure")

    with pytest.raises(IntegrityError):
        User.objects.create_user(email="dup@example.com", password="pa55word!secure")


@pytest.mark.django_db
def test_create_superuser() -> None:
    User = get_user_model()

    admin = User.objects.create_superuser(email="admin@example.com", password="pa55word!secure")

    assert admin.is_staff and admin.is_superuser


@pytest.mark.django_db
def test_email_without_an_address_is_rejected() -> None:
    User = get_user_model()

    with pytest.raises(ValueError, match="email address is required"):
        User.objects.create_user(email="", password="pa55word!secure")
