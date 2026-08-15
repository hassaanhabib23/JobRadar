"""Reconciliation.

Two failure modes matter here and they pull in opposite directions: silently
dropping merged jobs, and merging jobs that are not the same job.
"""

from __future__ import annotations

from datetime import date

import pytest

from scoring.domain import RawPosting
from scoring.reconcile import (
    authority,
    normalise_company,
    normalise_title,
    reconcile,
)


def posting(source: str, company: str, title: str, **overrides: object) -> RawPosting:
    defaults: dict[str, object] = {
        "source": source,
        "company": company,
        "title": title,
        "location": "Islamabad, Pakistan",
    }
    defaults.update(overrides)
    return RawPosting(**defaults)  # type: ignore[arg-type]


class TestNormaliseCompany:
    def test_collapses_decoration(self) -> None:
        assert normalise_company("DPL (Digital Processing Labs) Pvt Ltd") == "dpl"
        assert normalise_company("DPL") == "dpl"

    @pytest.mark.parametrize(
        ("a", "b"),
        [
            ("Arbisoft", "Arbisoft (Pvt) Limited"),
            ("Careem", "CAREEM  "),
            ("VentureDive Pvt. Ltd.", "VentureDive"),
            ("10Pearls, LLC", "10pearls"),
        ],
    )
    def test_variants_collapse_together(self, a: str, b: str) -> None:
        assert normalise_company(a) == normalise_company(b)

    def test_a_name_made_only_of_suffixes_falls_back_to_the_raw_name(self) -> None:
        """ "Systems Limited" is a real employer, and both words are suffixes.

        Stripping them leaves nothing, and an empty key would merge it with every
        other all-suffix company name.
        """
        assert normalise_company("Systems Limited") != ""
        assert normalise_company("Systems Limited") != normalise_company("Software Solutions")


class TestNormaliseTitle:
    def test_drops_tags_parentheticals_seniority_and_location(self) -> None:
        assert (
            normalise_title("Senior Software Engineer [REQ-1234] (Remote)") == "software engineer"
        )
        assert normalise_title("Junior Software Engineer - Islamabad") == "software engineer"

    def test_variants_collapse_together(self) -> None:
        assert normalise_title("Senior .NET Developer") == normalise_title("Jr .NET Developer")

    def test_keeps_domain_characters(self) -> None:
        assert ".net" in normalise_title("Senior .NET Developer")

    def test_an_empty_normalisation_falls_back_to_the_raw_title(self) -> None:
        """Otherwise "Senior" and "Junior" both become "" and wrongly merge."""
        assert normalise_title("Senior") != ""
        assert normalise_title("Senior") != normalise_title("Junior")


class TestAuthority:
    def test_ats_beats_scraping_beats_rss(self) -> None:
        assert authority("greenhouse") > authority("jobspy") > authority("rss")

    def test_unknown_sources_rank_between_ats_and_rss(self) -> None:
        assert authority("greenhouse") > authority("something-new") > authority("rss")


class TestReconcileReturnsItsWinner:
    """The merged posting must actually reach the output list.

    The obvious implementation computes the winner and forgets to append it,
    which silently deletes every job that appeared on more than one source — the
    duplicates it was supposed to fix.
    """

    def test_a_merged_pair_produces_exactly_one_posting(self) -> None:
        merged = reconcile(
            [
                posting("jobspy", "Careem", "Associate Software Engineer"),
                posting("greenhouse", "Careem", "Associate Software Engineer"),
            ]
        )

        assert len(merged) == 1
        assert merged[0].title == "Associate Software Engineer"

    def test_no_posting_is_lost_across_a_mixed_batch(self) -> None:
        postings = [
            posting("greenhouse", "Careem", "Associate Software Engineer"),
            posting("jobspy", "Careem", "Associate Software Engineer"),
            posting("lever", "Arbisoft", "Python Developer"),
            posting("rss", "Systems Limited", "QA Engineer"),
        ]

        merged = reconcile(postings)

        assert len(merged) == 3
        assert {p.company for p in merged} == {"Careem", "Arbisoft", "Systems Limited"}

    def test_the_highest_authority_source_wins(self) -> None:
        merged = reconcile(
            [
                posting("jobspy", "Careem", "Associate Software Engineer", url="https://linkedin"),
                posting("greenhouse", "Careem", "Associate Software Engineer", url="https://gh"),
            ]
        )

        assert merged[0].source == "greenhouse"
        assert merged[0].url == "https://gh"

    def test_input_order_does_not_change_the_winner(self) -> None:
        ats = posting("greenhouse", "Careem", "Associate Software Engineer")
        scrape = posting("jobspy", "Careem", "Associate Software Engineer")

        assert reconcile([ats, scrape])[0].source == reconcile([scrape, ats])[0].source


class TestReconcileDoesNotOverMerge:
    """Each of these would be a real posting quietly disappearing."""

    def test_two_different_roles_at_one_company_stay_separate(self) -> None:
        merged = reconcile(
            [
                posting("greenhouse", "Careem", "Software Engineer"),
                posting("greenhouse", "Careem", "Data Analyst"),
            ]
        )

        assert len(merged) == 2

    def test_the_same_role_at_two_companies_stays_separate(self) -> None:
        merged = reconcile(
            [
                posting("greenhouse", "Careem", "Software Engineer"),
                posting("lever", "Arbisoft", "Software Engineer"),
            ]
        )

        assert len(merged) == 2

    def test_titles_that_normalise_to_empty_stay_separate(self) -> None:
        """ "Senior" and "Junior" both strip to nothing — they must not merge."""
        merged = reconcile(
            [
                posting("greenhouse", "Careem", "Senior"),
                posting("greenhouse", "Careem", "Junior"),
            ]
        )

        assert len(merged) == 2
        assert {p.title for p in merged} == {"Senior", "Junior"}

    def test_companies_that_normalise_to_empty_stay_separate(self) -> None:
        merged = reconcile(
            [
                posting("greenhouse", "Systems Limited", "Software Engineer"),
                posting("greenhouse", "Software Solutions", "Software Engineer"),
            ]
        )

        assert len(merged) == 2


class TestMergedData:
    """FR3: show it once, keeping the best data from each source."""

    def test_the_winner_inherits_a_date_from_a_sibling(self) -> None:
        merged = reconcile(
            [
                posting("greenhouse", "Careem", "Software Engineer", posted_at=None),
                posting("jobspy", "Careem", "Software Engineer", posted_at=date(2026, 8, 10)),
            ]
        )

        assert merged[0].source == "greenhouse"
        assert merged[0].posted_at == date(2026, 8, 10)
        assert merged[0].date_from == "jobspy"

    def test_a_winner_with_its_own_date_keeps_it(self) -> None:
        merged = reconcile(
            [
                posting("greenhouse", "Careem", "Software Engineer", posted_at=date(2026, 8, 12)),
                posting("jobspy", "Careem", "Software Engineer", posted_at=date(2026, 8, 10)),
            ]
        )

        assert merged[0].posted_at == date(2026, 8, 12)
        assert merged[0].date_from is None

    def test_other_sources_are_recorded(self) -> None:
        merged = reconcile(
            [
                posting("greenhouse", "Careem", "Software Engineer"),
                posting("jobspy", "Careem", "Software Engineer"),
                posting("rss", "Careem", "Software Engineer"),
            ]
        )

        assert merged[0].also_seen_on == ("jobspy", "rss")

    def test_the_winners_own_source_is_not_listed_as_also_seen_on(self) -> None:
        merged = reconcile(
            [
                posting("greenhouse", "Careem", "Software Engineer"),
                posting("jobspy", "Careem", "Software Engineer"),
            ]
        )

        assert "greenhouse" not in merged[0].also_seen_on

    def test_an_empty_description_is_filled_from_a_sibling(self) -> None:
        merged = reconcile(
            [
                posting("greenhouse", "Careem", "Software Engineer", description=""),
                posting("jobspy", "Careem", "Software Engineer", description="Build things."),
            ]
        )

        assert merged[0].description == "Build things."

    def test_a_repost_flag_from_any_source_survives(self) -> None:
        merged = reconcile(
            [
                posting("greenhouse", "Careem", "Software Engineer"),
                posting("jobspy", "Careem", "Software Engineer", reposted=True),
            ]
        )

        assert merged[0].reposted is True

    def test_every_location_in_the_group_survives_the_merge(self) -> None:
        """Title normalisation strips city names, so the same role in two cities
        is one group. Keeping only the winner's city would delete the other, and
        a user who chose only that city would never see the role."""
        merged = reconcile(
            [
                posting("greenhouse", "Careem", "Software Engineer", location="Karachi, Pakistan"),
                posting(
                    "greenhouse", "Careem", "Software Engineer", location="Islamabad, Pakistan"
                ),
            ]
        )

        assert len(merged) == 1
        assert "Karachi" in merged[0].location
        assert "Islamabad" in merged[0].location

    def test_duplicate_location_parts_are_not_repeated(self) -> None:
        merged = reconcile(
            [
                posting("greenhouse", "Careem", "Software Engineer", location="Lahore, Pakistan"),
                posting("jobspy", "Careem", "Software Engineer", location="Lahore, Pakistan"),
            ]
        )

        assert merged[0].location.count("Lahore") == 1
        assert merged[0].location.count("Pakistan") == 1

    def test_a_single_posting_passes_through_untouched(self) -> None:
        only = posting("greenhouse", "Careem", "Software Engineer")

        assert reconcile([only]) == [only]

    def test_an_empty_batch_produces_nothing(self) -> None:
        assert reconcile([]) == []
