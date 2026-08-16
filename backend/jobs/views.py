"""Job endpoints.

Every queryset here derives from `request.user`. A mismatched id returns 404
rather than 403 — a 403 confirms the row exists, which leaks the fact that
somebody else has it.
"""

from __future__ import annotations

from typing import Any

from django.db.models import Avg, Count, Q, QuerySet
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from jobs.filters import JobFilter, apply_ordering
from jobs.models import Run, Source, UserJob
from jobs.runner import last_successful_run
from jobs.serializers import (
    BulkStatusSerializer,
    JobSerializer,
    JobUpdateSerializer,
    RunDetailSerializer,
    RunSerializer,
    SourceSerializer,
    StatsSerializer,
    StatusChoiceSerializer,
)
from jobs.services import statuses
from jobs.tasks import run_now


def _user(request: Request) -> Any:
    """`IsAuthenticated` guarantees a concrete user; the checker cannot see that."""
    return request.user


class JobViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """The user's own job list.

    Never `UserJob.objects.get(pk=...)` without a user filter — `get_object`
    resolves against the filtered queryset, so an id belonging to somebody else
    simply is not there.
    """

    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = JobFilter
    http_method_names = ["get", "patch", "post", "head", "options"]
    #: Never used at runtime — `get_queryset` overrides it. It exists so schema
    #: generation can find the model without executing a user-scoped query with
    #: no user attached.
    queryset = UserJob.objects.none()

    def get_serializer_class(self) -> Any:
        if self.action in {"partial_update", "update"}:
            return JobUpdateSerializer
        return JobSerializer

    def get_queryset(self) -> QuerySet[UserJob]:
        if getattr(self, "swagger_fake_view", False):
            return UserJob.objects.none()
        # select_related is not optional: without it a 50-row page is 51 queries.
        queryset = UserJob.objects.filter(user=_user(self.request)).select_related("job")

        include_closed = str(self.request.query_params.get("include_closed", "")).lower() in {
            "1",
            "true",
            "yes",
        }
        if not include_closed:
            queryset = queryset.filter(is_open=True)

        return queryset

    def filter_queryset(self, queryset: Any) -> Any:
        queryset = super().filter_queryset(queryset)
        ordering = self.request.query_params.get("ordering")
        if ordering or "search" not in self.request.query_params:
            # A search already orders by relevance; do not override it unless the
            # client explicitly asked for a different sort.
            queryset = apply_ordering(queryset, ordering)
        return queryset

    @extend_schema(
        parameters=[
            OpenApiParameter("search", str, description="Full-text over title, company, location"),
            OpenApiParameter("tier", str, description="High | Medium | Stretch"),
            OpenApiParameter("source", str),
            OpenApiParameter("status", str),
            OpenApiParameter("min_score", int),
            OpenApiParameter("max_score", int),
            OpenApiParameter(
                "is_new", bool, description="First appeared in this user's list on the last run"
            ),
            OpenApiParameter("posted_today", bool, description="Published today by the employer"),
            OpenApiParameter("posted_within", int, description="Published within the last N days"),
            OpenApiParameter(
                "has_date", bool, description="Excludes inferred ages as well as nulls"
            ),
            OpenApiParameter("location", str, description="A location catalogue key"),
            OpenApiParameter("flag", str, description="e.g. ghost?"),
            OpenApiParameter("pinned", bool),
            OpenApiParameter("include_closed", bool),
            OpenApiParameter(
                "ordering", str, description="-score | posted_at | first_seen | company"
            ),
        ],
        responses={200: JobSerializer(many=True)},
    )
    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().list(request, *args, **kwargs)

    @extend_schema(request=JobUpdateSerializer, responses={200: JobSerializer})
    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        instance = self.get_object()
        serializer = JobUpdateSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        instance.refresh_from_db()
        return Response(JobSerializer(instance).data)

    @extend_schema(
        request=BulkStatusSerializer,
        responses={200: dict},
        description="Set one status across many jobs. Ids belonging to another user are ignored.",
    )
    @action(detail=False, methods=["post"], url_path="bulk_status")
    def bulk_status(self, request: Request) -> Response:
        serializer = BulkStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Scoped to this user's rows, so a foreign id updates nothing rather than
        # erroring in a way that confirms it exists.
        updated = UserJob.objects.filter(
            user=_user(request), pk__in=serializer.validated_data["ids"]
        ).update(status=serializer.validated_data["status"])

        return Response({"updated": updated})

    @extend_schema(responses={200: StatusChoiceSerializer(many=True)})
    @action(detail=False, methods=["get"], url_path="statuses")
    def statuses(self, request: Request) -> Response:
        """Human labels for every status, so the frontend never hardcodes them."""
        return Response(StatusChoiceSerializer(statuses(), many=True).data)


class SourceViewSet(viewsets.ModelViewSet):
    """Shared sources plus this user's own private ones.

    Another user's private source is invisible: not listable, not readable, not
    editable, not deletable.
    """

    serializer_class = SourceSerializer
    permission_classes = [IsAuthenticated]
    queryset = Source.objects.none()  # schema generation only; see JobViewSet

    def get_queryset(self) -> QuerySet[Source]:
        if getattr(self, "swagger_fake_view", False):
            return Source.objects.none()
        return Source.objects.filter(Q(owner__isnull=True) | Q(owner=_user(self.request))).order_by(
            "kind", "slug"
        )

    def perform_create(self, serializer: Any) -> None:
        # A source created through the API is always private to its creator.
        # Shared sources are seeded or added in Django admin.
        serializer.save(owner=_user(self.request))

    def _reject_shared(self) -> Response:
        return Response(
            {"detail": "Shared sources are managed in the admin."},
            status=status.HTTP_403_FORBIDDEN,
        )

    def update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        if self.get_object().owner_id is None:
            return self._reject_shared()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        if self.get_object().owner_id is None:
            return self._reject_shared()
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        if self.get_object().owner_id is None:
            return self._reject_shared()
        return super().destroy(request, *args, **kwargs)


class RunViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Run history.

    Runs are global — they describe the shared fetch, not one user's data — so
    every authenticated user sees the same history. Nothing user-private is in
    them.
    """

    permission_classes = [IsAuthenticated]
    queryset = Run.objects.all()

    def get_serializer_class(self) -> Any:
        return RunDetailSerializer if self.action == "retrieve" else RunSerializer

    def get_queryset(self) -> Any:
        queryset = Run.objects.all()
        if self.action == "retrieve":
            return queryset.prefetch_related("source_results")
        return queryset

    @extend_schema(
        request=None,
        responses={202: dict},
        description="Trigger a run. Returns 202 immediately; poll GET /api/runs/ for progress.",
    )
    def create(self, request: Request) -> Response:
        result = run_now.delay(triggered_by=f"manual:{_user(request).pk}")

        # With CELERY_TASK_ALWAYS_EAGER (tests, and dev without a worker) the
        # task has already finished by the time delay() returns.
        payload: dict[str, Any] = {"task_id": str(result.id)}
        if getattr(result, "result", None) and isinstance(result.result, dict):
            payload.update(result.result)

        return Response(payload, status=status.HTTP_202_ACCEPTED)


class StatsView(APIView):
    """Dashboard summary for the requesting user.

    Every count here is scoped to `request.user` except `last_run_at`, which
    describes the shared fetch.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: StatsSerializer}, operation_id="stats")
    def get(self, request: Request) -> Response:
        user = _user(request)
        mine = UserJob.objects.filter(user=user, is_open=True)

        by_tier = dict(
            mine.values_list("tier").annotate(count=Count("id")).values_list("tier", "count")
        )
        by_status = dict(
            mine.values_list("status").annotate(count=Count("id")).values_list("status", "count")
        )
        by_source = dict(
            mine.values_list("job__source")
            .annotate(count=Count("id"))
            .values_list("job__source", "count")
        )

        histogram = [
            {
                "bucket": f"{low}-{low + 9}",
                "min": low,
                "count": mine.filter(score__gte=low, score__lt=low + 10).count(),
            }
            for low in range(0, 100, 10)
        ]

        last_run = last_successful_run()

        return Response(
            StatsSerializer(
                {
                    "open_count": mine.count(),
                    "new_today": mine.filter(is_new=True).count(),
                    "by_tier": by_tier,
                    "by_source": by_source,
                    "by_status": by_status,
                    "avg_score": mine.aggregate(avg=Avg("score"))["avg"],
                    # Only successful runs. A failed run going green here would
                    # hide exactly the failure this element exists to surface.
                    "last_run_at": last_run.started_at if last_run else None,
                    "score_histogram": histogram,
                }
            ).data
        )
