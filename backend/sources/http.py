"""HTTP access for adapters.

One place to set the timeout, the user agent and the error translation, so no
adapter can accidentally hang a run forever or leak a vendor-specific exception.
"""

from __future__ import annotations

from typing import Any

import requests

from sources.base import SourceError

#: These are public feeds ATS vendors publish for aggregators. Identify honestly.
USER_AGENT = "JobRadar/0.1 (+https://github.com/; personal job aggregator)"

#: A hanging board must not hold up the rest of the run. Celery's task time limit
#: is the backstop; this is the first line.
DEFAULT_TIMEOUT = 20


def get_json(url: str, *, params: dict[str, Any] | None = None, timeout: int = DEFAULT_TIMEOUT):
    return _request("GET", url, params=params, timeout=timeout)


def post_json(url: str, *, json: dict[str, Any] | None = None, timeout: int = DEFAULT_TIMEOUT):
    return _request("POST", url, json=json, timeout=timeout)


def get_text(url: str, *, timeout: int = DEFAULT_TIMEOUT) -> str:
    response = _raw("GET", url, timeout=timeout)
    return response.text


def _raw(method: str, url: str, **kwargs: Any) -> requests.Response:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json, text/xml, */*"}
    try:
        response = requests.request(method, url, headers=headers, **kwargs)
        response.raise_for_status()
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "?"
        raise SourceError(f"{method} {url} returned HTTP {status}") from exc
    except requests.RequestException as exc:
        # Timeouts, DNS failures, connection resets — all the same to the caller:
        # this source failed, record it and carry on with the others.
        raise SourceError(f"{method} {url} failed: {exc.__class__.__name__}") from exc
    return response


def _request(method: str, url: str, **kwargs: Any) -> Any:
    response = _raw(method, url, **kwargs)
    try:
        return response.json()
    except ValueError as exc:
        raise SourceError(f"{method} {url} did not return JSON") from exc
