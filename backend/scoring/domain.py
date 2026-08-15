"""Plain dataclasses the scorer operates on.

Deliberately not Django models. Everything the scoring and reconciliation code
touches is a frozen dataclass over primitives, which is what lets the whole
package be tested without a database and keeps the interesting logic independent
of the web framework.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

# --- Inputs ---------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RawPosting:
    """One posting as an adapter produced it, before it becomes a `Job` row."""

    source: str
    company: str
    title: str
    location: str = ""
    url: str = ""
    external_id: str | None = None
    posted_at: date | None = None
    description: str = ""
    employment_type: str = ""
    #: The source described this as a repost rather than a new listing.
    reposted: bool = False
    #: Populated by reconciliation: the other sources this posting was seen on.
    also_seen_on: tuple[str, ...] = ()
    #: Populated by reconciliation: which source the posting date came from,
    #: when the winning source had no date of its own.
    date_from: str | None = None

    @property
    def searchable_text(self) -> str:
        """The text the stack score is computed over."""
        return f"{self.title} {self.location} {self.description}"


@dataclass(frozen=True, slots=True)
class Freshness:
    """Freshness and staleness knobs. All editable per user."""

    #: Postings older than this are dropped outright. 0 disables the filter.
    max_age_days: int = 60
    #: Freshness points for a posting whose source gave no date at all.
    unknown_date_points: int = 4
    #: Freshness ceiling once a posting is flagged as a ghost.
    ghost_points: int = 1
    #: Drop undated postings entirely rather than scoring them down.
    drop_unknown_date: bool = False
    #: Tracked this long without disappearing → probably filled already.
    ghost_after_days_tracked: int = 25


@dataclass(frozen=True, slots=True)
class Profile:
    """One user's scoring configuration. Every weight comes from here."""

    skills: dict[str, float] = field(default_factory=dict)
    level_bonus: dict[str, float] = field(default_factory=dict)
    level_penalty: dict[str, float] = field(default_factory=dict)
    title_blocklist: tuple[str, ...] = ()
    #: Catalogue keys. A posting matching none of these is filtered out.
    locations_allowed: tuple[str, ...] = ()
    locations_preferred: tuple[str, ...] = ()
    locations_secondary: tuple[str, ...] = ()
    #: Stack weight at which the /40 component saturates.
    stack_saturation: float = 45.0
    freshness: Freshness = field(default_factory=Freshness)


# --- Outputs --------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ScoreDetail:
    """The breakdown behind a score. A score with no explanation is useless."""

    stack: float
    level: float
    location: float
    fresh: float
    skills_hit: tuple[str, ...] = ()
    notes: tuple[str, ...] = ()
    age_days: int | None = None
    #: True when `age_days` is our own tracking floor rather than a real date.
    age_inferred: bool = False

    def as_dict(self) -> dict[str, Any]:
        """The shape stored in `UserJob.detail` and returned by the API."""
        return {
            "stack": round(self.stack, 1),
            "level": round(self.level, 1),
            "location": round(self.location, 1),
            "fresh": round(self.fresh, 1),
            "skills_hit": list(self.skills_hit),
            "notes": list(self.notes),
            "age_days": self.age_days,
            "age_inferred": self.age_inferred,
        }


@dataclass(frozen=True, slots=True)
class ScoreResult:
    score: int
    tier: str
    detail: ScoreDetail
    flags: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ScoreOutcome:
    """Either a score or the reason the posting was filtered out — never both.

    `score_job` returns `ScoreResult | None` as the specification describes, but
    the run needs the rejection reason for its logs and for the "why is this job
    missing?" question, so this carries both halves.
    """

    result: ScoreResult | None = None
    filtered_reason: str | None = None

    @property
    def kept(self) -> bool:
        return self.result is not None


# Tier thresholds.
TIER_HIGH = 75
TIER_MEDIUM = 60


def tier_for(score: float) -> str:
    if score >= TIER_HIGH:
        return "High"
    if score >= TIER_MEDIUM:
        return "Medium"
    return "Stretch"
