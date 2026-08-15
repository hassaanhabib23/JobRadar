"""The selectable location catalogue and location matching.

Kept here rather than in the database because it is static reference data that
both the scorer (Django-free) and `GET /api/locations/` need. Section 10 of the
specification allows either "a lookup table or a constant"; a constant means the
scorer stays pure and there is exactly one definition of what "Pindi" matches.

Matching is alias-based, so a posting reading "ISB" or "Pindi" still resolves to
Islamabad and Rawalpindi.
"""

from __future__ import annotations

from dataclasses import dataclass

from scoring.text import contains_term, normalise


@dataclass(frozen=True, slots=True)
class Location:
    key: str
    label: str
    aliases: tuple[str, ...] = ()
    #: Offered in the onboarding city picker. `pakistan` is not — it exists so a
    #: profile can express "anywhere in the country" as a secondary preference,
    #: which is what the default profile in section 10 does.
    selectable: bool = True

    @property
    def match_terms(self) -> tuple[str, ...]:
        return (self.label, *self.aliases)


CATALOGUE: tuple[Location, ...] = (
    Location("islamabad", "Islamabad", ("isb", "islamabad capital territory")),
    Location("rawalpindi", "Rawalpindi", ("rwp", "pindi")),
    Location("lahore", "Lahore"),
    Location("karachi", "Karachi"),
    Location("faisalabad", "Faisalabad"),
    Location("multan", "Multan"),
    Location("peshawar", "Peshawar"),
    Location("sialkot", "Sialkot"),
    Location("abbottabad", "Abbottabad"),
    Location("quetta", "Quetta"),
    Location("remote_pk", "Remote (Pakistan)", ("remote", "work from home", "wfh")),
    Location("remote_ww", "Remote (worldwide)", ("remote", "anywhere", "global")),
    Location("pakistan", "Pakistan", ("pk",), selectable=False),
)

BY_KEY: dict[str, Location] = {location.key: location for location in CATALOGUE}

SELECTABLE: tuple[Location, ...] = tuple(loc for loc in CATALOGUE if loc.selectable)


def matches(location_text: str, key: str) -> bool:
    """Whether a posting's location string satisfies one catalogue key."""
    location = BY_KEY.get(key)
    if location is None:
        return False
    haystack = normalise(location_text)
    return any(contains_term(haystack, term) for term in location.match_terms)


def matches_any(location_text: str, keys: object) -> bool:
    """Whether the location satisfies any of `keys`."""
    if not isinstance(keys, (list, tuple, set, frozenset)):
        return False
    return any(matches(location_text, str(key)) for key in keys)


def matched_keys(location_text: str) -> tuple[str, ...]:
    """Every catalogue key a location string resolves to.

    A posting reading simply "Remote" legitimately matches both `remote_pk` and
    `remote_ww` — the string does not say which, and neither should we.
    """
    haystack = normalise(location_text)
    return tuple(
        location.key
        for location in CATALOGUE
        if any(contains_term(haystack, term) for term in location.match_terms)
    )


def label_for(key: str) -> str:
    location = BY_KEY.get(key)
    return location.label if location else key
