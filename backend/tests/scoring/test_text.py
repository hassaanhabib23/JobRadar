"""Keyword matching.

The first test here is the one the whole scoring package exists to get right.
"""

from __future__ import annotations

import pytest

from scoring.text import contains_term, find_terms, find_weighted, normalise


class TestDotNetDoesNotMatchSubstrings:
    """`.net` must not match `kubernetes`, `subnet` or `telnet`.

    A naive `".net" in text` matches all three, and so does `\\b.net\\b` — the
    word boundary sits between `t` and `.`, so `telnet` matches too. This is the
    defect the tokenise-pad-substring rule exists to prevent.
    """

    @pytest.mark.parametrize(
        "text",
        [
            "kubernetes telnet subnet",
            "Kubernetes administrator",
            "Telnet and SSH experience",
            "subnet configuration",
            "We use Kubernetes, telnet and subnetting",
        ],
    )
    def test_does_not_match(self, text: str) -> None:
        assert not contains_term(normalise(text), ".net")

    @pytest.mark.parametrize(
        "text",
        [
            ".NET Developer",
            "Senior .NET Engineer",
            "Experience with .net required",
            "C# / .NET",
        ],
    )
    def test_does_match_a_real_mention(self, text: str) -> None:
        assert contains_term(normalise(text), ".net")


class TestNormalise:
    def test_lowercases_tokenises_and_pads(self) -> None:
        assert normalise("ASP.NET Core Developer") == " asp.net core developer "

    def test_keeps_domain_significant_characters(self) -> None:
        # `.`, `+` and `#` all carry meaning here — .net, c++, c#.
        assert normalise("C# and C++ and .NET") == " c# and c++ and .net "

    def test_splits_on_everything_else(self) -> None:
        assert normalise("CI/CD, multi-tenant") == " ci cd multi tenant "

    def test_collapses_repeated_separators(self) -> None:
        assert normalise("React  —  Node.js") == " react node.js "

    def test_empty_text_is_still_padded(self) -> None:
        assert normalise("") == "  "


class TestContainsTerm:
    def test_multiword_terms_match_across_tokens(self) -> None:
        assert contains_term(normalise("Senior Full Stack Engineer"), "full stack")

    def test_terms_split_by_punctuation_still_match(self) -> None:
        # "ci/cd" tokenises identically on both sides, so it matches.
        assert contains_term(normalise("Strong CI/CD background"), "ci/cd")
        assert contains_term(normalise("multi-tenant SaaS"), "multi-tenant")

    def test_partial_token_does_not_match(self) -> None:
        assert not contains_term(normalise("Reactor design"), "react")
        assert not contains_term(normalise("Leadership training"), "lead")
        assert not contains_term(normalise("Sriram Kumar"), "sr")

    def test_empty_term_never_matches(self) -> None:
        """Otherwise a blank profile entry would match every posting."""
        assert not contains_term(normalise("anything at all"), "")
        assert not contains_term(normalise("anything at all"), "   ")
        assert not contains_term(normalise(""), "")

    def test_matching_is_case_insensitive(self) -> None:
        assert contains_term(normalise("PYTHON developer"), "Python")


class TestFindTerms:
    def test_returns_matches_in_the_order_given(self) -> None:
        found = find_terms("React and TypeScript with Azure", ["azure", "react", "django"])
        assert found == ["azure", "react"]


class TestFindWeighted:
    def test_orders_by_weight_then_alphabetically(self) -> None:
        weights = {"react": 6.0, "azure": 6.0, "llm": 9.0, "git": 1.0}

        found = find_weighted("React, Azure, LLM and Git", weights)

        assert found == [("llm", 9.0), ("azure", 6.0), ("react", 6.0), ("git", 1.0)]

    def test_returns_nothing_when_no_skill_matches(self) -> None:
        assert find_weighted("Warehouse Supervisor", {"react": 6.0}) == []
