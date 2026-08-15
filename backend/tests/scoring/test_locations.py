"""The location catalogue and alias matching."""

from __future__ import annotations

import pytest

from scoring import locations


class TestCatalogue:
    def test_every_key_is_unique(self) -> None:
        keys = [location.key for location in locations.CATALOGUE]
        assert len(keys) == len(set(keys))

    def test_the_picker_offers_the_specified_cities(self) -> None:
        assert [location.key for location in locations.SELECTABLE] == [
            "islamabad",
            "rawalpindi",
            "lahore",
            "karachi",
            "faisalabad",
            "multan",
            "peshawar",
            "sialkot",
            "abbottabad",
            "quetta",
            "remote_pk",
            "remote_ww",
        ]

    def test_country_wide_is_not_offered_in_the_picker(self) -> None:
        """`pakistan` exists for profiles, not for the onboarding city list."""
        assert "pakistan" in locations.BY_KEY
        assert "pakistan" not in {location.key for location in locations.SELECTABLE}

    def test_glassdoor_is_nowhere_to_be_found(self) -> None:
        """It does not serve Pakistan at all — never offer it."""
        assert not any("glassdoor" in location.label.lower() for location in locations.CATALOGUE)


class TestMatching:
    @pytest.mark.parametrize(
        ("text", "key"),
        [
            ("Islamabad, Pakistan", "islamabad"),
            ("ISB", "islamabad"),
            ("Islamabad Capital Territory", "islamabad"),
            ("Rawalpindi", "rawalpindi"),
            ("Pindi", "rawalpindi"),
            ("RWP office", "rawalpindi"),
            ("Remote", "remote_pk"),
            ("Work from home", "remote_pk"),
            ("WFH", "remote_pk"),
            ("Anywhere", "remote_ww"),
            ("PER - Lahore, PK", "lahore"),
            ("PER - Lahore, PK", "pakistan"),
        ],
    )
    def test_aliases_resolve(self, text: str, key: str) -> None:
        assert locations.matches(text, key)

    @pytest.mark.parametrize(
        ("text", "key"),
        [
            ("Karachi, Pakistan", "islamabad"),
            ("Lahore", "rawalpindi"),
            ("Dubai, UAE", "pakistan"),
            ("", "islamabad"),
        ],
    )
    def test_non_matches(self, text: str, key: str) -> None:
        assert not locations.matches(text, key)

    def test_an_unknown_key_never_matches(self) -> None:
        assert not locations.matches("Islamabad", "atlantis")

    def test_a_multi_city_posting_matches_every_city_it_lists(self) -> None:
        """Lever roles routinely list six cities at once."""
        text = "Pakistan, Lahore, Karachi, Islamabad, Faisalabad"

        matched = locations.matched_keys(text)

        assert {"islamabad", "lahore", "karachi", "faisalabad", "pakistan"} <= set(matched)

    def test_a_bare_remote_matches_both_remote_kinds(self) -> None:
        """The string does not say which, and neither should we."""
        matched = locations.matched_keys("Remote")

        assert "remote_pk" in matched
        assert "remote_ww" in matched


class TestMatchesAny:
    def test_matches_when_one_key_matches(self) -> None:
        assert locations.matches_any("Islamabad", ("karachi", "islamabad"))

    def test_no_keys_never_matches(self) -> None:
        assert not locations.matches_any("Islamabad", ())

    def test_a_non_collection_is_treated_as_no_match(self) -> None:
        """Guards against a malformed profile taking down a whole run."""
        assert not locations.matches_any("Islamabad", None)
        assert not locations.matches_any("Islamabad", "islamabad")
