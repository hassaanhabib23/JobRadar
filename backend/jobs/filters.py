"""List filtering.

Server-side, always. The dashboard has to stay responsive at 5,000+ stored jobs,
which rules out fetching everything and filtering in the browser.
"""

from __future__ import annotations

from typing import Any

import django_filters
from django.contrib.postgres.search import SearchQuery, SearchRank
from django.db.models import F, Q, QuerySet

from jobs.models import ApplicationStatus, SourceKind, UserJob
from scoring import locations as location_catalogue


class JobFilter(django_filters.FilterSet):
    """Everything the dashboard's filter bar can ask for."""

    search = django_filters.CharFilter(method="filter_search")
    tier = django_filters.CharFilter(field_name="tier", lookup_expr="iexact")
    source = django_filters.ChoiceFilter(field_name="job__source", choices=SourceKind.choices)
    status = django_filters.ChoiceFilter(field_name="status", choices=ApplicationStatus.choices)
    min_score = django_filters.NumberFilter(field_name="score", lookup_expr="gte")
    max_score = django_filters.NumberFilter(field_name="score", lookup_expr="lte")
    is_new = django_filters.BooleanFilter(field_name="is_new")
    pinned = django_filters.BooleanFilter(field_name="pinned")
    has_date = django_filters.BooleanFilter(method="filter_has_date")
    location = django_filters.CharFilter(method="filter_location")
    flag = django_filters.CharFilter(method="filter_flag")
    company = django_filters.CharFilter(field_name="job__company", lookup_expr="icontains")
    include_closed = django_filters.BooleanFilter(method="filter_include_closed")

    class Meta:
        model = UserJob
        fields: list[str] = []

    def filter_search(self, queryset: QuerySet, name: str, value: str) -> QuerySet:
        """Real full-text search over title, company and location.

        `icontains` is a poor substitute once there are a few thousand rows, and
        the generated `search_vector` column is already indexed for this.
        """
        term = (value or "").strip()
        if not term:
            return queryset
        query = SearchQuery(term, config="english", search_type="websearch")
        return (
            queryset.filter(job__search_vector=query)
            .annotate(rank=SearchRank(F("job__search_vector"), query))
            .order_by("-rank", "-score")
        )

    def filter_has_date(self, queryset: QuerySet, name: str, value: bool) -> QuerySet:
        """ "Has a real date" must exclude inferred ages as well as nulls.

        An age the system worked out from how long it has been tracking a posting
        is an estimate, not a date the employer published.
        """
        inferred = Q(detail__age_inferred=True)
        if value:
            return queryset.filter(job__posted_at__isnull=False).exclude(inferred)
        return queryset.filter(Q(job__posted_at__isnull=True) | inferred)

    def filter_location(self, queryset: QuerySet, name: str, value: str) -> QuerySet:
        """Filter by a catalogue key, matching any of its aliases."""
        location = location_catalogue.BY_KEY.get((value or "").strip().lower())
        if location is None:
            return queryset.filter(job__location__icontains=value)

        matches = Q()
        for term in location.match_terms:
            matches |= Q(job__location__icontains=term)
        return queryset.filter(matches)

    def filter_flag(self, queryset: QuerySet, name: str, value: str) -> QuerySet:
        """A GIN index on `flags` makes this an index lookup, not a scan."""
        return queryset.filter(flags__contains=[value])

    def filter_include_closed(self, queryset: QuerySet, name: str, value: bool) -> QuerySet:
        # Handled in the view so it applies before any other filter; kept here so
        # django-filter does not reject the query parameter as unknown.
        return queryset


#: Sort keys the client may ask for, mapped to real ordering. Anything else is
#: ignored rather than passed through to the ORM.
ORDERING_MAP: dict[str, tuple[str, ...]] = {
    "score": ("score", "-first_seen_by_user"),
    "-score": ("-score", "-first_seen_by_user"),
    "posted_at": ("job__posted_at", "-score"),
    "-posted_at": (F("job__posted_at").desc(nulls_last=True), "-score"),  # type: ignore[dict-item]
    "first_seen": ("first_seen_by_user", "-score"),
    "-first_seen": ("-first_seen_by_user", "-score"),
    "company": ("job__company", "-score"),
    "-company": ("-job__company", "-score"),
    "title": ("job__title", "-score"),
    "-title": ("-job__title", "-score"),
}

DEFAULT_ORDERING: tuple[str, ...] = ("-score", "-first_seen_by_user")


def apply_ordering(queryset: QuerySet, ordering: str | None) -> QuerySet:
    fields: Any = ORDERING_MAP.get((ordering or "").strip(), DEFAULT_ORDERING)
    return queryset.order_by(*fields)
