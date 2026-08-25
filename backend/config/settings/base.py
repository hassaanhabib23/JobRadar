"""Settings shared by every environment.

Environment-specific modules (dev/prod/test) import * from here and override.
Nothing secret lives in this file — everything sensitive comes from the environment.
"""

from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

from celery.schedules import crontab

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def env_bool(key: str, default: bool = False) -> bool:
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_list(key: str, default: str = "") -> list[str]:
    return [item.strip() for item in env(key, default).split(",") if item.strip()]


SECRET_KEY = env("DJANGO_SECRET_KEY", "insecure-dev-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    # Third party
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
    "django_celery_beat",
    # Local
    "users",
    "jobs",
    "notifications",
    "resumes",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# --- Database -------------------------------------------------------------
# Postgres only. SQLite has no jsonb, no GIN indexes, no full-text search and no
# partial indexes, so a green SQLite suite would test none of what this schema
# actually relies on.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "jobradar"),
        "USER": env("POSTGRES_USER", "jobradar"),
        "PASSWORD": env("POSTGRES_PASSWORD", "jobradar"),
        "HOST": env("POSTGRES_HOST", "postgres"),
        "PORT": env("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": 60,
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Swapping this after the first migration is genuinely painful, so it is set
# from the very first commit.
AUTH_USER_MODEL = "users.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- I18N / time ----------------------------------------------------------
# Timestamps are stored in UTC; schedules are expressed in local time.
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Never served at this URL directly — resumes are personal data, reachable
# only through the authenticated /api/resume/ endpoints. MEDIA_ROOT just
# needs to exist so FileField has somewhere to write.
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# --- DRF ------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_RENDERER_CLASSES": ("djangorestframework_camel_case.render.CamelCaseJSONRenderer",),
    "DEFAULT_PARSER_CLASSES": ("djangorestframework_camel_case.parser.CamelCaseJSONParser",),
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DATETIME_FORMAT": "%Y-%m-%dT%H:%M:%SZ",
    "DEFAULT_THROTTLE_CLASSES": ("rest_framework.throttling.ScopedRateThrottle",),
    "DEFAULT_THROTTLE_RATES": {
        # Credential-stuffing defence on the two endpoints that accept passwords.
        "register": env("THROTTLE_REGISTER", "5/hour"),
        "login": env("THROTTLE_LOGIN", "10/min"),
        # Unauthenticated and it sends mail to an address the caller chooses.
        # Without a tight limit it is an email bomb pointed at anyone.
        "password_reset": env("THROTTLE_PASSWORD_RESET", "5/hour"),
        "email_verify": env("THROTTLE_EMAIL_VERIFY", "5/hour"),
    },
}

# --- JWT ------------------------------------------------------------------
# Access token in memory on the frontend, refresh token in an httpOnly cookie.
# Neither goes in localStorage, where any injected script could read it.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

#: The refresh cookie. Scoped to the auth endpoints so it is not sent with every
#: dashboard request.
JWT_REFRESH_COOKIE = "jobradar_refresh"
JWT_REFRESH_COOKIE_PATH = "/api/auth/"
JWT_REFRESH_COOKIE_SAMESITE = "Lax"
JWT_REFRESH_COOKIE_SECURE = env_bool("JWT_COOKIE_SECURE", False)

# Redis, not local memory. The run lock and the auth throttle counters both live
# here, and both are worthless per-process: the worker runs four forks, so a
# LocMemCache lock is invisible to the other three and two triggers happily
# double-fetch every source.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_CACHE_URL", "") or env("REDIS_URL", "redis://redis:6379/0"),
        "KEY_PREFIX": "jobradar",
    }
}

# The camelCase renderer rewrites *keys*, which is right for field names and
# wrong for data. `by_status` is keyed by status value — `not_started` is a value
# the client also receives verbatim from /api/jobs/statuses/, so camelising it to
# `notStarted` would leave the frontend unable to match the two.
JSON_CAMEL_CASE = {
    "JSON_UNDERSCOREIZE": {
        "ignore_fields": (
            # Keyed by status / source / tier value, not by field name.
            # `not_started` is a value the client also gets verbatim from
            # /api/jobs/statuses/, so rewriting it to `notStarted` here would
            # leave the frontend unable to match the two.
            "by_status",
            "by_source",
            "by_tier",
            # User-authored keys. A skill called "machine_learning" must come
            # back exactly as it was saved, or tuning it becomes impossible.
            "skills",
            "level_bonus",
            "level_penalty",
            "config",
        ),
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "JobRadar API",
    "DESCRIPTION": "Job aggregation, per-user scoring and application tracking.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "CAMELIZE_NAMES": True,
    # Both UserJob.status and Run.status are called "status", and without this
    # the generated TypeScript gets names like `Status51bEnum` — meaningless to
    # read and unstable across regenerations.
    "ENUM_NAME_OVERRIDES": {
        "ApplicationStatusEnum": "jobs.models.ApplicationStatus.choices",
        "RunStatusEnum": "jobs.models.RunStatus.choices",
    },
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "drf_spectacular.contrib.djangorestframework_camel_case.camelize_serializer_fields",
    ],
}

# --- Celery ---------------------------------------------------------------
CELERY_BROKER_URL = env("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", "redis://redis:6379/1")
# A server on UTC firing "9am" would fire at 2pm Pakistan time otherwise.
CELERY_TIMEZONE = env("CELERY_TIMEZONE", "Asia/Karachi")
CELERY_ENABLE_UTC = True
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1

REDIS_URL = env("REDIS_URL", "redis://redis:6379/0")

# The daily schedule. django-celery-beat stores it in the database, so the cron
# is editable from the admin without a redeploy; this is only the initial value.
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"
CELERY_BEAT_SCHEDULE = {
    "daily-run": {
        "task": "jobs.run_now",
        # 09:00 Asia/Karachi — CELERY_TIMEZONE above, not the server's clock.
        "schedule": crontab(hour="9", minute="0"),
        "kwargs": {"triggered_by": "schedule"},
    },
    "job-reminders": {
        "task": "jobs.send_due_reminders",
        # Hourly: a date-level reminder does not need finer granularity, and
        # this is 24x more sweeps than the run without being noisy.
        "schedule": crontab(minute=0),
    },
}

# --- Error tracking ----------------------------------------------------------
# No DSN, no Sentry. Nothing is sent from a laptop or from CI.
from config.observability import configure as _configure_sentry  # noqa: E402

SENTRY_ENABLED = _configure_sentry(
    dsn=env("SENTRY_DSN"),
    environment=env("SENTRY_ENVIRONMENT", "development"),
    release=env("SENTRY_RELEASE"),
)

# --- Email -----------------------------------------------------------------
# Plain SMTP, configured entirely from the environment. Resend, SendGrid,
# Mailgun, SES and Gmail all speak SMTP, so there is no provider SDK to depend
# on and no vendor to migrate away from later.
#
# For Resend: EMAIL_HOST=smtp.resend.com, EMAIL_PORT=587, EMAIL_HOST_USER=resend,
# EMAIL_HOST_PASSWORD=<api key>.
#
# dev.py prints to the console and test.py collects into `mail.outbox`, so the
# whole feature is developable and testable with no account anywhere.
EMAIL_BACKEND = env("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", "")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_TIMEOUT = int(env("EMAIL_TIMEOUT", "10"))
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "JobRadar <noreply@localhost>")

#: Absolute base for links in emails. A reset link has to work from an inbox,
#: so it cannot be relative and cannot be guessed from the request host —
#: `Host` is attacker-controlled, and trusting it turns a reset mail into a
#: phishing vector pointing at someone else's server.
PUBLIC_BASE_URL = env("PUBLIC_BASE_URL", "http://localhost:3000").rstrip("/")

#: One hour, not Django's three-day default. A live password-reset link sitting
#: valid in an inbox for three days is a much larger window than this needs.
PASSWORD_RESET_TIMEOUT = int(env("PASSWORD_RESET_TIMEOUT", str(60 * 60)))

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {"format": "{levelname} {asctime} {name} {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "simple"},
    },
    "root": {"handlers": ["console"], "level": env("DJANGO_LOG_LEVEL", "INFO")},
}
