"""Test settings.

Still Postgres — see the note in base.py. The only concessions are a fast
password hasher and eager Celery so tasks run inline.
"""

from .base import *

DEBUG = False
SECRET_KEY = "test-only-key"
ALLOWED_HOSTS = ["*", "testserver"]

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Quieter than base.py — expected-failure paths log at INFO and would otherwise
# bury a real failure in the test output.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
}
