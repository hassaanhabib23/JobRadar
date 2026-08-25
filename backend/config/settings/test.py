"""Test settings.

Still Postgres — see the note in base.py. The only concessions are a fast
password hasher and eager Celery so tasks run inline.
"""

import tempfile

from .base import *

DEBUG = False
SECRET_KEY = "test-only-key"
ALLOWED_HOSTS = ["*", "testserver"]

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Low enough that a throttling test can exhaust the allowance in a few requests
# without depending on override_settings reaching DRF's cached api_settings
# mid-run. The real rates live in base.py and are asserted separately.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {
        "register": "3/hour",
        "login": "3/min",
        "password_reset": "3/hour",
        "email_verify": "3/hour",
    },
}

# Collected in `django.core.mail.outbox` instead of sent. No test may touch a
# real SMTP server, for the same reason none may touch a real job board.
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
PUBLIC_BASE_URL = "http://testserver"

# A throwaway directory per test run — uploaded resumes must never land in
# (or pollute) the real media volume, or worse, a bind-mounted source tree.
MEDIA_ROOT = tempfile.mkdtemp(prefix="jobradar-test-media-")

# Local memory is right here and wrong in production: the suite is one process,
# and a shared Redis would leak throttle counters between test runs.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "jobradar-tests",
    }
}

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
