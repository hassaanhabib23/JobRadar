"""Scoring: hard filters, then four components out of 100.

Pure functions. No Django, no I/O, no clock reads that a caller cannot override
— `today` is a parameter precisely so the staleness behaviour is testable.
"""

from __future__ import annotations

from datetime import date

from scoring import locations
from scoring.domain import (
    Profile,
    RawPosting,
    ScoreDetail,
    ScoreOutcome,
    ScoreResult,
    tier_for,
)
from scoring.text import contains_term, find_weighted, normalise

# Component ceilings — these sum to 100.
MAX_STACK = 40.0
MAX_LEVEL = 25.0
MAX_LOCATION = 20.0
MAX_FRESH = 15.0

#: A title that states no seniority at all is not a bad sign, so it scores in the
#: middle rather than at zero. 14/25 is the specified value.
NO_LEVEL_MATCH_POINTS = 14.0

POINTS_PREFERRED_LOCATION = 20.0
POINTS_SECONDARY_LOCATION = 13.0
POINTS_OTHER_LOCATION = 8.0

#: (max age in days, points). First band whose bound the age falls within wins.
FRESHNESS_BANDS: tuple[tuple[int, float], ...] = (
    (3, 15.0),
    (7, 13.0),
    (21, 9.0),
    (45, 5.0),
)
FRESHNESS_OLDEST_POINTS = 2.0


def freshness_band(age_days: int) -> float:
    """Points for a known age in days."""
    for bound, points in FRESHNESS_BANDS:
        if age_days <= bound:
            return points
    return FRESHNESS_OLDEST_POINTS


def _filter_reason(
    posting: RawPosting,
    profile: Profile,
    *,
    age_days: int | None,
) -> str | None:
    """The first hard rule this posting fails, in the specified order."""
    title = normalise(posting.title)
    for term in profile.title_blocklist:
        if contains_term(title, term):
            return f"title blocklist: {term}"

    if profile.locations_allowed and not locations.matches_any(
        posting.location, profile.locations_allowed
    ):
        shown = posting.location.strip() or "(unspecified)"
        return f"location not allowed: {shown}"

    max_age = profile.freshness.max_age_days
    if max_age > 0 and age_days is not None and age_days > max_age:
        return "older than max_age_days"

    if posting.posted_at is None and profile.freshness.drop_unknown_date:
        return "no posting date"

    return None


def _score_stack(posting: RawPosting, profile: Profile) -> tuple[float, tuple[str, ...]]:
    hits = find_weighted(posting.searchable_text, profile.skills)
    if not hits:
        return 0.0, ()

    total = sum(weight for _, weight in hits)
    saturation = profile.stack_saturation if profile.stack_saturation > 0 else 1.0
    return MAX_STACK * min(1.0, total / saturation), tuple(term for term, _ in hits)


def _score_level(posting: RawPosting, profile: Profile) -> tuple[float, str]:
    """Seniority multiplier applied to the /25 ceiling.

    Where a title carries both signals — "Senior Associate Engineer" — the
    penalty wins. The specification says to check the bonus list "then" the
    penalty list without saying which takes precedence, and for someone hunting
    junior roles the conservative reading is the useful one: a title that says
    "senior" anywhere is not an entry-level opening. Among several matches on the
    same side, the strongest signal wins (lowest penalty, highest bonus).
    """
    title = normalise(posting.title)

    penalties = [(t, m) for t, m in profile.level_penalty.items() if contains_term(title, t)]
    if penalties:
        term, multiplier = min(penalties, key=lambda pair: (pair[1], pair[0]))
        return MAX_LEVEL * multiplier, f"seniority penalty: {term}"

    bonuses = [(t, m) for t, m in profile.level_bonus.items() if contains_term(title, t)]
    if bonuses:
        term, multiplier = max(bonuses, key=lambda pair: (pair[1], pair[0]))
        return MAX_LEVEL * multiplier, f"entry-level signal: {term}"

    return NO_LEVEL_MATCH_POINTS, "no seniority stated"


def _score_location(posting: RawPosting, profile: Profile) -> tuple[float, str]:
    if locations.matches_any(posting.location, profile.locations_preferred):
        return POINTS_PREFERRED_LOCATION, "preferred location"
    if locations.matches_any(posting.location, profile.locations_secondary):
        return POINTS_SECONDARY_LOCATION, "secondary location"
    return POINTS_OTHER_LOCATION, "location outside preferences"


def _ghost_ceiling(profile: Profile) -> float:
    """The freshness ceiling for a ghost posting.

    A ghost must never out-score a merely undated posting. Taking `ghost_points`
    at face value is not enough on its own: nothing stops a profile from setting
    it above `unknown_date_points`, which would invert the ordering the whole
    staleness rule exists to establish. So the ceiling is also held strictly
    below the undated score.
    """
    fresh = profile.freshness
    return float(min(fresh.ghost_points, max(0, fresh.unknown_date_points - 1)))


def _score_freshness(
    posting: RawPosting,
    profile: Profile,
    *,
    age_days: int | None,
    tracked_days: int,
) -> tuple[float, int | None, bool, list[str], list[str]]:
    """Returns (points, age_days, age_inferred, notes, flags)."""
    fresh = profile.freshness
    notes: list[str] = []
    flags: list[str] = []
    age_inferred = False

    if posting.posted_at is not None and age_days is not None:
        points = freshness_band(age_days)
        notes.append(f"posted {age_days}d ago")
    else:
        points = float(fresh.unknown_date_points)
        notes.append("no posting date")
        if tracked_days > 0:
            # We have been watching it for N days, so it is at least N days old.
            # An inferred age may only lower the score, never raise it above what
            # an undated posting already gets.
            age_days = tracked_days
            age_inferred = True
            points = min(points, freshness_band(tracked_days))
            notes.append(f"age estimated from {tracked_days}d tracked")

    if tracked_days >= fresh.ghost_after_days_tracked > 0:
        flags.append("ghost?")
        points = min(points, _ghost_ceiling(profile))
        notes.append(f"listed {tracked_days}d without closing — likely already filled")

    if posting.reposted:
        flags.append("reposted")
        notes.append("source flagged this as a repost")

    return points, age_days, age_inferred, notes, flags


def evaluate_job(
    posting: RawPosting,
    profile: Profile,
    *,
    tracked_days: int = 0,
    today: date | None = None,
) -> ScoreOutcome:
    """Score a posting, or explain why it was filtered out."""
    today = today or date.today()

    age_days = (today - posting.posted_at).days if posting.posted_at is not None else None

    reason = _filter_reason(posting, profile, age_days=age_days)
    if reason is not None:
        return ScoreOutcome(filtered_reason=reason)

    stack, skills_hit = _score_stack(posting, profile)
    level, level_note = _score_level(posting, profile)
    location, location_note = _score_location(posting, profile)
    fresh, age_days, age_inferred, fresh_notes, flags = _score_freshness(
        posting, profile, age_days=age_days, tracked_days=tracked_days
    )

    notes = [level_note, location_note, *fresh_notes]
    if skills_hit:
        notes.insert(0, f"matched {len(skills_hit)} skills")
    else:
        notes.insert(0, "no profile skills matched")

    total = stack + level + location + fresh
    score = max(0, min(100, round(total)))

    detail = ScoreDetail(
        stack=stack,
        level=level,
        location=location,
        fresh=fresh,
        skills_hit=skills_hit,
        notes=tuple(notes),
        age_days=age_days,
        age_inferred=age_inferred,
    )
    return ScoreOutcome(
        result=ScoreResult(score=score, tier=tier_for(score), detail=detail, flags=tuple(flags))
    )


def score_job(
    posting: RawPosting,
    profile: Profile,
    *,
    tracked_days: int = 0,
    today: date | None = None,
) -> ScoreResult | None:
    """`None` means the posting was filtered out.

    Use :func:`evaluate_job` when the reason matters.
    """
    return evaluate_job(posting, profile, tracked_days=tracked_days, today=today).result
