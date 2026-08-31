"""Scoring: hard filters, the four components, and staleness.

The staleness tests are the subtle ones — see `TestGhostPostings`.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest

from scoring import default_profile
from scoring.domain import Freshness, Profile, RawPosting
from scoring.scorer import (
    MAX_STACK,
    NO_LEVEL_MATCH_POINTS,
    POINTS_OTHER_LOCATION,
    POINTS_PREFERRED_LOCATION,
    POINTS_SECONDARY_LOCATION,
    evaluate_job,
    freshness_band,
    score_job,
)

TODAY = date(2026, 8, 15)


@pytest.fixture
def profile() -> Profile:
    return default_profile(("islamabad", "rawalpindi"))


def posting(**overrides: object) -> RawPosting:
    defaults: dict[str, object] = {
        "source": "greenhouse",
        "company": "Careem",
        "title": "Associate Software Engineer",
        "location": "Islamabad, Pakistan",
        "posted_at": date(2026, 8, 13),
        "description": "ASP.NET Core, C#, Azure",
    }
    defaults.update(overrides)
    return RawPosting(**defaults)  # type: ignore[arg-type]


class TestARealisticPosting:
    """One end-to-end anchor, so a regression in any component is visible."""

    def test_scores_and_explains_itself(self, profile: Profile) -> None:
        result = score_job(posting(), profile, today=TODAY)

        assert result is not None
        # stack 28.4 + level 23.75 + location 20 + freshness 15
        assert result.score == 87
        assert result.tier == "High"
        assert result.detail.skills_hit == ("asp.net core", "asp.net", "c#", "azure")
        assert result.detail.age_days == 2
        assert result.detail.age_inferred is False
        assert result.flags == ()

    def test_components_sum_to_the_score(self, profile: Profile) -> None:
        result = score_job(posting(), profile, today=TODAY)

        assert result is not None
        detail = result.detail
        total = detail.stack + detail.level + detail.location + detail.fresh
        assert round(total) == result.score


class TestHardFilters:
    """Each returns None, paired with a reason."""

    def test_title_blocklist(self, profile: Profile) -> None:
        blocked = replace(profile, title_blocklist=("sales", "recruiter"))

        outcome = evaluate_job(posting(title="Sales Engineer"), blocked, today=TODAY)

        assert outcome.result is None
        assert outcome.filtered_reason == "title blocklist: sales"

    def test_blocklist_uses_token_matching(self, profile: Profile) -> None:
        """ "sales" must not filter "Salesforce Developer"."""
        blocked = replace(profile, title_blocklist=("sales",))

        outcome = evaluate_job(posting(title="Salesforce Developer"), blocked, today=TODAY)

        assert outcome.result is not None

    def test_location_not_allowed(self, profile: Profile) -> None:
        outcome = evaluate_job(posting(location="Karachi, Pakistan"), profile, today=TODAY)

        assert outcome.result is None
        assert outcome.filtered_reason == "location not allowed: Karachi, Pakistan"

    def test_blank_location_is_reported_readably(self, profile: Profile) -> None:
        outcome = evaluate_job(posting(location=""), profile, today=TODAY)

        assert outcome.filtered_reason == "location not allowed: (unspecified)"

    def test_older_than_max_age(self, profile: Profile) -> None:
        outcome = evaluate_job(posting(posted_at=date(2026, 1, 1)), profile, today=TODAY)

        assert outcome.result is None
        assert outcome.filtered_reason == "older than max_age_days"

    def test_max_age_of_zero_disables_the_filter(self, profile: Profile) -> None:
        never_expires = replace(profile, freshness=replace(profile.freshness, max_age_days=0))

        outcome = evaluate_job(posting(posted_at=date(2020, 1, 1)), never_expires, today=TODAY)

        assert outcome.result is not None

    def test_no_posting_date_when_configured_to_drop(self, profile: Profile) -> None:
        strict = replace(profile, freshness=replace(profile.freshness, drop_unknown_date=True))

        outcome = evaluate_job(posting(posted_at=None), strict, today=TODAY)

        assert outcome.result is None
        assert outcome.filtered_reason == "no posting date"

    def test_undated_postings_are_kept_by_default(self, profile: Profile) -> None:
        """Scored down, not discarded — scraped sources rarely carry a date."""
        assert evaluate_job(posting(posted_at=None), profile, today=TODAY).result is not None

    def test_blocklist_is_checked_before_location(self, profile: Profile) -> None:
        """Order matters: the reason shown should be the first rule broken."""
        blocked = replace(profile, title_blocklist=("sales",))

        outcome = evaluate_job(
            posting(title="Sales Engineer", location="Karachi"), blocked, today=TODAY
        )

        assert outcome.filtered_reason == "title blocklist: sales"


class TestDefaultTitleBlocklist:
    """FR5: drop postings whose title is a different profession entirely.

    Without this, a run across 14 real boards put "Associate — Project Sales"
    and "Associate People Business Partner" near the top of a .NET developer's
    list, scoring ~49 on the entry-level bonus alone with zero skill matches.
    """

    @pytest.mark.parametrize(
        "title",
        [
            "Associate - Project Sales",
            "Associate People Business Partner",
            "Account Executive, Enterprise",
            "Talent Acquisition Specialist",
            "Accounts Receivable Associate",
            "Graphic Designer",
            "Customer Support Representative",
        ],
    )
    def test_non_engineering_titles_are_dropped(self, profile: Profile, title: str) -> None:
        outcome = evaluate_job(posting(title=title), profile, today=TODAY)

        assert outcome.result is None, f"{title!r} should not reach a developer's list"
        assert outcome.filtered_reason is not None

    @pytest.mark.parametrize(
        "title",
        [
            "Associate Software Engineer",
            "Junior .NET Developer",
            "Trainee Software Developer",
            "Full Stack Engineer",
            "QA Automation Engineer",
            "DevOps Engineer",
            "Data Engineer",
            "Sales Engineer",
        ],
    )
    def test_engineering_titles_survive(self, profile: Profile, title: str) -> None:
        """Including "Sales Engineer" — the blocklist matches whole tokens, and
        that is a real engineering role."""
        outcome = evaluate_job(posting(title=title), profile, today=TODAY)

        assert outcome.result is not None, f"{title!r} was wrongly filtered out"


class TestStackComponent:
    def test_saturates_at_forty(self, profile: Profile) -> None:
        loaded = posting(
            description="ASP.NET Core C# Azure React Angular Django Python LLM RAG Docker"
        )

        result = score_job(loaded, profile, today=TODAY)

        assert result is not None
        assert result.detail.stack == pytest.approx(MAX_STACK)

    def test_no_matching_skills_scores_zero(self, profile: Profile) -> None:
        result = score_job(
            posting(title="Engineer", description="Nothing relevant"), profile, today=TODAY
        )

        assert result is not None
        assert result.detail.stack == 0.0
        assert result.detail.skills_hit == ()
        assert "no profile skills matched" in result.detail.notes

    def test_description_contributes(self, profile: Profile) -> None:
        without = score_job(posting(description=""), profile, today=TODAY)
        with_skills = score_job(posting(description="React and Django"), profile, today=TODAY)

        assert without is not None and with_skills is not None
        assert with_skills.detail.stack > without.detail.stack


class TestLevelComponent:
    def test_unstated_seniority_scores_fourteen_not_zero(self, profile: Profile) -> None:
        """An unstated level is not a bad sign, so it sits mid-range."""
        result = score_job(posting(title="Software Engineer"), profile, today=TODAY)

        assert result is not None
        assert result.detail.level == NO_LEVEL_MATCH_POINTS
        assert "no seniority stated" in result.detail.notes

    def test_entry_level_bonus(self, profile: Profile) -> None:
        result = score_job(posting(title="Junior Software Engineer"), profile, today=TODAY)

        assert result is not None
        assert result.detail.level == pytest.approx(25.0)
        assert "entry-level signal: junior" in result.detail.notes

    def test_seniority_penalty(self, profile: Profile) -> None:
        result = score_job(posting(title="Senior Software Engineer"), profile, today=TODAY)

        assert result is not None
        assert result.detail.level == pytest.approx(25.0 * 0.35)
        assert "seniority penalty: senior" in result.detail.notes

    def test_penalty_beats_bonus_when_a_title_carries_both(self, profile: Profile) -> None:
        """ "Senior Associate" is not an entry-level opening."""
        result = score_job(posting(title="Senior Associate Engineer"), profile, today=TODAY)

        assert result is not None
        assert result.detail.level == pytest.approx(25.0 * 0.35)

    def test_strongest_penalty_wins(self, profile: Profile) -> None:
        result = score_job(posting(title="Senior Staff Engineer"), profile, today=TODAY)

        assert result is not None
        assert result.detail.level == pytest.approx(25.0 * 0.15)

    def test_chief_scores_zero_for_the_component(self, profile: Profile) -> None:
        result = score_job(posting(title="Chief Technology Officer"), profile, today=TODAY)

        assert result is not None
        assert result.detail.level == 0.0


class TestLocationComponent:
    def test_preferred(self, profile: Profile) -> None:
        result = score_job(posting(location="Islamabad, Pakistan"), profile, today=TODAY)
        assert result is not None
        assert result.detail.location == POINTS_PREFERRED_LOCATION

    def test_secondary(self, profile: Profile) -> None:
        """Allowed but not preferred — country-wide rather than in their city."""
        wide = replace(profile, locations_allowed=("islamabad", "rawalpindi", "pakistan"))

        result = score_job(posting(location="Multan, Pakistan"), wide, today=TODAY)

        assert result is not None
        assert result.detail.location == POINTS_SECONDARY_LOCATION

    def test_neither_preferred_nor_secondary(self, profile: Profile) -> None:
        wide = replace(
            profile,
            locations_allowed=("islamabad", "remote_ww"),
            locations_secondary=("pakistan",),
        )

        result = score_job(posting(location="Remote, Anywhere"), wide, today=TODAY)

        assert result is not None
        assert result.detail.location == POINTS_OTHER_LOCATION

    def test_aliases_match(self, profile: Profile) -> None:
        """A posting reading "Pindi" or "ISB" is still their city."""
        for text in ("Pindi", "RWP", "ISB office"):
            result = score_job(posting(location=text), profile, today=TODAY)
            assert result is not None, text
            assert result.detail.location == POINTS_PREFERRED_LOCATION, text


class TestFreshnessComponent:
    @pytest.mark.parametrize(
        ("age_days", "expected"),
        [
            (0, 15.0),
            (3, 15.0),
            (4, 13.0),
            (7, 13.0),
            (8, 9.0),
            (21, 9.0),
            (22, 5.0),
            (45, 5.0),
            (46, 2.0),
            (200, 2.0),
        ],
    )
    def test_bands(self, age_days: int, expected: float) -> None:
        assert freshness_band(age_days) == expected

    def test_unknown_date_scores_the_configured_points(self, profile: Profile) -> None:
        result = score_job(posting(posted_at=None), profile, today=TODAY)

        assert result is not None
        assert result.detail.fresh == profile.freshness.unknown_date_points
        assert result.detail.age_days is None
        assert "no posting date" in result.detail.notes


class TestInferredAge:
    """No date, but we have been watching it — that is a floor on its real age."""

    def test_tracking_days_become_an_inferred_age(self, profile: Profile) -> None:
        result = score_job(posting(posted_at=None), profile, tracked_days=10, today=TODAY)

        assert result is not None
        assert result.detail.age_days == 10
        assert result.detail.age_inferred is True

    def test_inference_can_only_lower_the_score(self, profile: Profile) -> None:
        """Never above what a plain undated posting already gets.

        Tracked for 10 days, the age band alone would award 9 — more than the 4
        an undated posting gets, which would reward us for having watched it
        longer. It must not.
        """
        undated = score_job(posting(posted_at=None), profile, today=TODAY)
        tracked = score_job(posting(posted_at=None), profile, tracked_days=10, today=TODAY)

        assert undated is not None and tracked is not None
        assert tracked.detail.fresh <= undated.detail.fresh

    def test_a_long_tracked_posting_scores_below_a_new_undated_one(self, profile: Profile) -> None:
        undated = score_job(posting(posted_at=None), profile, today=TODAY)
        tracked = score_job(posting(posted_at=None), profile, tracked_days=50, today=TODAY)

        assert undated is not None and tracked is not None
        assert tracked.detail.fresh < undated.detail.fresh

    def test_a_real_date_is_never_overridden_by_tracking(self, profile: Profile) -> None:
        result = score_job(
            posting(posted_at=date(2026, 8, 14)), profile, tracked_days=5, today=TODAY
        )

        assert result is not None
        assert result.detail.age_days == 1
        assert result.detail.age_inferred is False


class TestGhostPostings:
    """A posting sitting unfilled for weeks is almost certainly already gone.

    The naive implementation is backwards: a 40-day ghost falls in the "≤45 days"
    band and scores 5, beating the 4 given to a brand-new undated posting. These
    tests pin the ordering the right way round.
    """

    def test_a_ghost_is_flagged(self, profile: Profile) -> None:
        result = score_job(posting(posted_at=None), profile, tracked_days=30, today=TODAY)

        assert result is not None
        assert "ghost?" in result.flags

    def test_a_ghost_scores_below_an_undated_posting(self, profile: Profile) -> None:
        undated = score_job(posting(posted_at=None), profile, tracked_days=0, today=TODAY)
        ghost = score_job(posting(posted_at=None), profile, tracked_days=40, today=TODAY)

        assert undated is not None and ghost is not None
        assert ghost.detail.fresh < undated.detail.fresh
        assert ghost.score < undated.score

    def test_the_ghost_ceiling_holds_even_if_configured_badly(self, profile: Profile) -> None:
        """A profile setting ghost_points above unknown_date_points must not
        invert the ordering the rule exists to create."""
        misconfigured = replace(
            profile,
            freshness=Freshness(ghost_points=9, unknown_date_points=4, ghost_after_days_tracked=25),
        )

        undated = score_job(posting(posted_at=None), misconfigured, tracked_days=0, today=TODAY)
        ghost = score_job(posting(posted_at=None), misconfigured, tracked_days=40, today=TODAY)

        assert undated is not None and ghost is not None
        assert ghost.detail.fresh < undated.detail.fresh

    def test_a_dated_but_long_tracked_posting_is_also_a_ghost(self, profile: Profile) -> None:
        # max_age_days raised so the freshness cutoff itself does not drop this
        # posting before ghost detection — that interaction is a separate concern.
        never_expires = replace(profile, freshness=replace(profile.freshness, max_age_days=0))
        result = score_job(
            posting(posted_at=date(2026, 7, 20)), never_expires, tracked_days=30, today=TODAY
        )

        assert result is not None
        assert "ghost?" in result.flags
        assert result.detail.fresh <= 1.0

    def test_below_the_threshold_is_not_a_ghost(self, profile: Profile) -> None:
        result = score_job(posting(posted_at=None), profile, tracked_days=24, today=TODAY)

        assert result is not None
        assert "ghost?" not in result.flags

    def test_ghost_detection_can_be_disabled(self, profile: Profile) -> None:
        off = replace(profile, freshness=replace(profile.freshness, ghost_after_days_tracked=0))

        result = score_job(posting(posted_at=None), off, tracked_days=999, today=TODAY)

        assert result is not None
        assert "ghost?" not in result.flags


class TestRepostFlag:
    def test_reposted_postings_are_flagged(self, profile: Profile) -> None:
        result = score_job(posting(reposted=True), profile, today=TODAY)

        assert result is not None
        assert "reposted" in result.flags


class TestTiers:
    @pytest.mark.parametrize(
        ("score", "tier"),
        [
            (100, "High"),
            (75, "High"),
            (74, "Medium"),
            (60, "Medium"),
            (59, "Stretch"),
            (0, "Stretch"),
        ],
    )
    def test_thresholds(self, score: int, tier: str) -> None:
        from scoring.domain import tier_for

        assert tier_for(score) == tier


class TestPerUserScoring:
    """The same posting must score differently for differently-configured users.

    This is the whole reason score lives on `UserJob` rather than on `Job`.
    """

    def test_two_profiles_score_the_same_posting_differently(self) -> None:
        dotnet_dev = default_profile(("islamabad",))
        react_dev = replace(
            default_profile(("lahore",)),
            skills={"react": 10.0, "typescript": 6.0},
        )
        shared = posting(location="Islamabad, Pakistan", description="ASP.NET Core and C#")

        for_dotnet = score_job(shared, dotnet_dev, today=TODAY)
        for_react = evaluate_job(shared, react_dev, today=TODAY)

        assert for_dotnet is not None
        # Wrong city for the React developer, so it does not reach them at all.
        assert for_react.result is None
        assert for_react.filtered_reason is not None

    def test_same_city_different_stack_gives_different_scores(self) -> None:
        dotnet_dev = default_profile(("islamabad",))
        react_dev = replace(
            default_profile(("islamabad",)), skills={"react": 10.0, "typescript": 6.0}
        )
        shared = posting(description="ASP.NET Core and C#")

        a = score_job(shared, dotnet_dev, today=TODAY)
        b = score_job(shared, react_dev, today=TODAY)

        assert a is not None and b is not None
        assert a.score != b.score
        assert a.score > b.score
