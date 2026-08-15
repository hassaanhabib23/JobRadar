"""The adapter registry.

An adapter takes a :class:`SourceSpec` and returns ``list[RawPosting]``. Adding a
source is one function plus one decorator.

Adapters take a plain dataclass rather than a Django model so this package stays
independent of the ORM, which makes fixture tests trivial: build a spec, stub the
HTTP call, assert on the postings.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, TypeVar

from scoring.domain import RawPosting

#: Adapters whose absence from a run's results proves nothing. A keyword search
#: is not a full listing of anyone's board, so a job missing from today's scrape
#: may well still be open. These must never trigger closed-detection.
ADDITIVE_KINDS: frozenset[str] = frozenset({"jobspy", "rss"})


@dataclass(frozen=True, slots=True)
class SourceSpec:
    """Everything an adapter needs, with no Django model attached."""

    kind: str
    slug: str = ""
    company: str = ""
    host: str = ""
    tenant: str = ""
    site: str = ""
    url: str = ""
    label: str = ""
    location_hint: str = ""
    config: dict[str, Any] = field(default_factory=dict)

    @property
    def dedupe_key(self) -> tuple[str, str]:
        """Two sources with this key are the same feed and must be fetched once.

        If three users each privately add `greenhouse/careem`, that is one HTTP
        request per run, not three.
        """
        identity = self.url or "/".join(
            part for part in (self.host, self.tenant, self.site, self.slug) if part
        )
        return self.kind.lower(), identity.lower()

    @property
    def display_name(self) -> str:
        return self.label or f"{self.kind}/{self.slug or self.url or self.host}"

    @property
    def is_additive(self) -> bool:
        return self.kind.lower() in ADDITIVE_KINDS


class SourceError(Exception):
    """An adapter could not fetch. Recorded against the source, never fatal."""


Adapter = Callable[[SourceSpec], list[RawPosting]]

#: Bound to Adapter so the decorator preserves each adapter's own signature —
#: several take extra keyword-only arguments (`today`) that tests rely on.
AdapterT = TypeVar("AdapterT", bound=Adapter)

ADAPTERS: dict[str, Adapter] = {}


def register(kind: str) -> Callable[[AdapterT], AdapterT]:
    def decorator(adapter: AdapterT) -> AdapterT:
        ADAPTERS[kind] = adapter
        return adapter

    return decorator


def fetch(spec: SourceSpec) -> list[RawPosting]:
    """Run the adapter for `spec`.

    Raises :class:`SourceError` for anything the caller should record against the
    source. The run catches it per source and carries on — one failing board must
    never end a run or close another board's jobs.
    """
    adapter = ADAPTERS.get(spec.kind)
    if adapter is None:
        raise SourceError(f"No adapter registered for kind '{spec.kind}'")
    return adapter(spec)
