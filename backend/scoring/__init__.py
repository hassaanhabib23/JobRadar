"""Pure domain logic: scoring, reconciliation and staleness.

**This package must not import Django.** Everything here is a pure function over
plain dataclasses, which is what makes it fast to run, pleasant to test without a
database, and independent of the web framework. There is a test that enforces it.
"""

from scoring.defaults import ROLE_PRESETS, apply_role_keywords, default_profile
from scoring.domain import (
    Freshness,
    Profile,
    RawPosting,
    ScoreDetail,
    ScoreOutcome,
    ScoreResult,
    tier_for,
)
from scoring.reconcile import authority, normalise_company, normalise_title, reconcile
from scoring.scorer import evaluate_job, score_job
from scoring.text import find_terms, find_weighted, normalise

__all__ = [
    "ROLE_PRESETS",
    "Freshness",
    "Profile",
    "RawPosting",
    "ScoreDetail",
    "ScoreOutcome",
    "ScoreResult",
    "apply_role_keywords",
    "authority",
    "default_profile",
    "evaluate_job",
    "find_terms",
    "find_weighted",
    "normalise",
    "normalise_company",
    "normalise_title",
    "reconcile",
    "score_job",
    "tier_for",
]
