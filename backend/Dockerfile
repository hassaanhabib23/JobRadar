FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# psycopg[binary] ships its own libpq, so no build toolchain is needed here.
# curl is only for container healthchecks and debugging.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first so the layer caches across source edits.
#
# The `scrape` extra pulls in python-jobspy and therefore pandas, which is the
# reason this image is not small. It also means the worker needs ~2GB: a 1GB box
# OOM-kills it mid-run, which looks exactly like a hang.
COPY pyproject.toml ./
RUN pip install --no-cache-dir ".[dev,scrape]"

COPY . .

RUN useradd --create-home --uid 1000 app && chown -R app:app /app
USER app

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-"]
