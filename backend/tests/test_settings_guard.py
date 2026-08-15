"""The suite must run against the test settings module.

`DJANGO_SETTINGS_MODULE` is set to `config.settings.dev` in the container
environment, and pytest-django lets the environment variable win over
pyproject.toml. For several milestones the suite ran against dev settings
without anyone noticing: everything passed, but eager Celery was off, so any
test asserting on a task's side effects would have been silently testing
nothing.

`conftest.py` at the backend root fixes it. This test makes sure it stays fixed.
"""

from __future__ import annotations

from django.conf import settings


def test_the_test_settings_module_is_active() -> None:
    assert settings.SETTINGS_MODULE == "config.settings.test"


def test_celery_runs_tasks_inline() -> None:
    """Otherwise `.delay()` silently queues to a broker no test is watching."""
    from celery import current_app

    assert settings.CELERY_TASK_ALWAYS_EAGER is True
    assert current_app.conf.task_always_eager is True


def test_the_database_is_postgres() -> None:
    """SQLite has no jsonb, no GIN, no full-text search and no partial indexes,
    so a green SQLite suite would test none of what this schema relies on."""
    engine = str(settings.DATABASES["default"]["ENGINE"])
    assert "postgresql" in engine


def test_the_production_cache_is_shared_between_processes() -> None:
    """The run lock and the auth throttle counters both live in the cache.

    A per-process cache makes both worthless: the Celery worker runs several
    forks, so a local-memory lock is invisible to the others and two triggers
    double-fetch every source. That is not hypothetical — it happened, and four
    concurrent triggers all ran until the cache moved to Redis.
    """
    from config.settings import base

    backend = base.CACHES["default"]["BACKEND"]
    assert "locmem" not in backend.lower(), f"{backend} is per-process"
    assert "redis" in backend.lower()
