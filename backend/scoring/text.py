"""Keyword matching.

The whole package hangs off one rule, and getting it wrong is the difference
between a useful score and nonsense:

    tokenise, join with single spaces, pad both ends with a space, then
    substring-match.

Plain `in` would make ``.net`` match ``kubernetes``, ``telnet`` and ``subnet``.
Word-boundary regex does not help either — ``\\b`` sits between ``t`` and ``.``,
so ``\\b.net\\b`` matches ``telnet`` too. Padding both the haystack and the
needle means a term can only match a whole token (or a whole run of tokens).

The token character class keeps ``.``, ``+`` and ``#`` because they are load
bearing in this domain — ``.net``, ``c++`` and ``c#`` are all real skills — and
drops everything else, so ``ci/cd`` and ``multi-tenant`` split into two tokens
on both sides of the comparison and still match.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping

#: Everything outside this class is a separator.
TOKEN_RE = re.compile(r"[a-z0-9+#.]+")


def normalise(text: str) -> str:
    """Lowercase, tokenise, and pad with a space at each end.

    >>> normalise("ASP.NET Core / C# Developer")
    ' asp.net core c# developer '
    """
    return " " + " ".join(TOKEN_RE.findall(text.lower())) + " "


def contains_term(haystack: str, term: str) -> bool:
    """Whether `term` appears in an already-normalised `haystack`.

    `haystack` must have come from :func:`normalise`; `term` is normalised here.
    """
    needle = normalise(term)
    if not needle.strip():
        # An empty or punctuation-only term would otherwise match everything.
        return False
    return needle in haystack


def find_terms(text: str, terms: Iterable[str]) -> list[str]:
    """Every term from `terms` present in `text`, in the order given."""
    haystack = normalise(text)
    return [term for term in terms if contains_term(haystack, term)]


def find_weighted(text: str, weights: Mapping[str, float]) -> list[tuple[str, float]]:
    """Matched terms paired with their weights, heaviest first.

    Ties break alphabetically so the output is deterministic — it ends up in the
    API response and in test assertions.
    """
    haystack = normalise(text)
    matched = [(term, weight) for term, weight in weights.items() if contains_term(haystack, term)]
    return sorted(matched, key=lambda pair: (-pair[1], pair[0]))
