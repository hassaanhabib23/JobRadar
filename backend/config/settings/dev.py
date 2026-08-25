"""Development settings — permissive, verbose, never for a public host."""

from .base import *
from .base import env_bool

DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = ["*"]

# Browsable API is genuinely useful while wiring endpoints up.
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = (
    "djangorestframework_camel_case.render.CamelCaseJSONRenderer",
    "rest_framework.renderers.BrowsableAPIRenderer",
)

CELERY_TASK_EAGER_PROPAGATES = True

# Every email prints to the worker's stdout. The whole reset and digest flow is
# developable without an SMTP account anywhere — copy the link out of the log.
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
