"""Source adapters — one module per ATS vendor plus the scraper.

Importing this package registers every adapter, so `ADAPTERS` is populated by the
time anything asks for one.
"""

from sources.base import ADAPTERS, ADDITIVE_KINDS, SourceError, SourceSpec, fetch, register

# Registration side effects. Each import adds entries to ADAPTERS.
from sources import ats, greenhouse, jobspy_adapter, rss  # noqa: F401  isort:skip

__all__ = [
    "ADAPTERS",
    "ADDITIVE_KINDS",
    "SourceError",
    "SourceSpec",
    "fetch",
    "register",
]
