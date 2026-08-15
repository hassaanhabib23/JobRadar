"""Reconciliation: the same job arriving from several sources becomes one row.

A company's own ATS feed carries a real date and a canonical URL; a LinkedIn
scrape of the same job often carries neither. Merging before scoring means the
posting is judged on the best data available rather than on whichever source
happened to be read last.
"""

from __future__ import annotations

import re
from collections import OrderedDict
from collections.abc import Iterable, Sequence
from dataclasses import replace

from scoring.domain import RawPosting

#: Which source to believe when two disagree. ATS feeds are the company itself
#: talking; a keyword scrape is a third party's guess; an RSS alert is a headline.
SOURCE_AUTHORITY: dict[str, int] = {
    "greenhouse": 100,
    "lever": 100,
    "workable": 100,
    "breezy": 100,
    "ashby": 100,
    "smartrecruiters": 100,
    "recruitee": 100,
    "workday": 100,
    "jobspy": 50,
    "rss": 30,
}
#: An unrecognised source ranks below every ATS feed but above a bare RSS item.
DEFAULT_AUTHORITY = 40

_PARENTHETICAL_RE = re.compile(r"\([^)]*\)")
_BRACKETED_RE = re.compile(r"\[[^\]]*\]")

#: Titles keep `.`, `+` and `#` because ".net", "c++" and "c#" are load bearing.
_TITLE_WORD_RE = re.compile(r"[a-z0-9+#.]+")

#: Company names strip punctuation outright, so "Pvt. Ltd." reduces to the
#: suffix words "pvt" and "ltd" and can actually be recognised as decoration.
_COMPANY_WORD_RE = re.compile(r"[a-z0-9]+")

#: Legal and generic decoration that says nothing about which company this is.
COMPANY_SUFFIXES: frozenset[str] = frozenset(
    {
        "pvt",
        "private",
        "limited",
        "ltd",
        "llc",
        "inc",
        "corp",
        "technologies",
        "solutions",
        "systems",
        "software",
        "group",
        "company",
        "co",
        "labs",
    }
)

#: Seniority and location words that vary between listings of the same job.
TITLE_NOISE: tuple[str, ...] = (
    "full time",
    "part time",
    "senior",
    "sr",
    "junior",
    "jr",
    "lead",
    "staff",
    "principal",
    "associate",
    "trainee",
    "graduate",
    "intern",
    "remote",
    "onsite",
    "hybrid",
    "contract",
    "pakistan",
    "islamabad",
    "rawalpindi",
    "lahore",
    "karachi",
)

_TITLE_NOISE_RE = re.compile(
    r"(?<= )(?:"
    + "|".join(re.escape(term).replace(r"\ ", r"\s+") for term in TITLE_NOISE)
    + r")(?= )"
)


def authority(source: str) -> int:
    return SOURCE_AUTHORITY.get(source.lower(), DEFAULT_AUTHORITY)


def normalise_company(raw: str) -> str:
    """Collapse a company name to its identifying core.

    "DPL (Digital Processing Labs) Pvt Ltd" and "DPL" must produce the same key.

    Stripping every suffix word can empty the name out — "Systems Limited" is a
    real Pakistani employer made entirely of suffix words — and two different
    companies both normalising to "" would wrongly merge. So, exactly as with
    titles, an empty result falls back to the raw name.
    """
    without_parens = _PARENTHETICAL_RE.sub(" ", raw.lower())
    words = _COMPANY_WORD_RE.findall(without_parens)
    kept = [word for word in words if word not in COMPANY_SUFFIXES]
    normalised = " ".join(kept)
    return normalised or " ".join(words) or raw.strip().lower()


def normalise_title(raw: str) -> str:
    """Collapse a job title to its identifying core.

    Drops `[REQ-TAGS]` and `(parentheticals)`, then seniority and location words.

    If that leaves nothing — a posting titled just "Senior", or "Junior" — the
    raw title is used instead. Without this, two unrelated roles both normalise
    to the empty string and merge into one.
    """
    without_tags = _BRACKETED_RE.sub(" ", raw.lower())
    without_parens = _PARENTHETICAL_RE.sub(" ", without_tags)
    padded = " " + " ".join(_TITLE_WORD_RE.findall(without_parens)) + " "
    stripped = _TITLE_NOISE_RE.sub(" ", padded)
    normalised = " ".join(stripped.split())
    return normalised or " ".join(_TITLE_WORD_RE.findall(without_parens)) or raw.strip().lower()


def group_key(posting: RawPosting) -> tuple[str, str]:
    return normalise_company(posting.company), normalise_title(posting.title)


def _merge(group: Sequence[RawPosting]) -> RawPosting:
    """Fold a group of duplicates into the highest-authority posting.

    Preference order: authority, then having a real date, then the longest
    description. `max` is stable, so equal candidates keep input order and the
    result is deterministic.
    """
    winner = max(
        group,
        key=lambda posting: (
            authority(posting.source),
            posting.posted_at is not None,
            len(posting.description),
            # A stable final tie-break, so the winner does not depend on the
            # order a board happened to return its rows in. Without it, a feed
            # reordering its response would pick a different winner tomorrow,
            # change the stored key, and make one job look closed and another
            # look new — every day, for no reason.
            str(posting.external_id or ""),
            posting.url,
            posting.title,
        ),
    )

    posted_at = winner.posted_at
    date_from = winner.date_from
    if posted_at is None:
        # Inherit a date from the most authoritative sibling that has one.
        for sibling in sorted(group, key=lambda p: -authority(p.source)):
            if sibling.posted_at is not None:
                posted_at = sibling.posted_at
                date_from = sibling.source
                break

    def best(attribute: str) -> str:
        """Keep the winner's value, or the longest sibling value if it is empty."""
        current: str = getattr(winner, attribute)
        if current:
            return current
        candidates = [getattr(p, attribute) for p in group if getattr(p, attribute)]
        return max(candidates, key=len) if candidates else current

    def merged_locations() -> str:
        """Union every location in the group, not just the winner's.

        Title normalisation strips city names, so "Software Engineer — Karachi"
        and "Software Engineer — Islamabad" are one group. Keeping only the
        winner's city would delete the other one, and a user who chose only that
        city would never see the role at all.
        """
        seen: list[str] = []
        for posting in group:
            for part in posting.location.split(","):
                cleaned = part.strip()
                if cleaned and cleaned.lower() not in {s.lower() for s in seen}:
                    seen.append(cleaned)
        return ", ".join(seen)

    # Parentheses matter: `-` binds tighter than `|`, so without them the
    # winner's own source survives into its "also seen on" list.
    seen_elsewhere = ({p.source for p in group} | set(winner.also_seen_on)) - {winner.source}
    also_seen_on = tuple(sorted(seen_elsewhere))

    return replace(
        winner,
        posted_at=posted_at,
        date_from=date_from,
        description=best("description"),
        location=merged_locations() or best("location"),
        url=best("url"),
        also_seen_on=also_seen_on,
        reposted=any(p.reposted for p in group),
    )


def reconcile(postings: Iterable[RawPosting]) -> list[RawPosting]:
    """One posting per real-world job, keeping the best data from each source."""
    groups: OrderedDict[tuple[str, str], list[RawPosting]] = OrderedDict()
    for posting in postings:
        groups.setdefault(group_key(posting), []).append(posting)

    merged: list[RawPosting] = []
    for group in groups.values():
        if len(group) == 1:
            merged.append(group[0])
            continue
        # The obvious implementation computes the winner and forgets this line,
        # silently dropping every job that appeared on more than one source.
        merged.append(_merge(group))

    return merged
