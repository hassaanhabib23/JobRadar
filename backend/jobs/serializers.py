"""Job serializers.

The client never sees the `Job` / `UserJob` split — that is a storage concern.
Every list row is one flattened object.
"""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from jobs.models import ApplicationStatus, Source, UserJob


class JobSerializer(serializers.ModelSerializer):
    """A `UserJob` joined to its `Job`, flattened."""

    key = serializers.CharField(source="job.key", read_only=True)
    # `source` shadows the inherited `Field.source` attribute. The wire name is
    # fixed by the API contract, so the shadowing is deliberate.
    source = serializers.CharField(source="job.source", read_only=True)  # type: ignore[assignment]
    company = serializers.CharField(source="job.company", read_only=True)
    title = serializers.CharField(source="job.title", read_only=True)
    location = serializers.CharField(source="job.location", read_only=True)
    url = serializers.CharField(source="job.url", read_only=True)
    description = serializers.CharField(source="job.description", read_only=True)
    posted_at = serializers.DateField(source="job.posted_at", read_only=True)
    first_seen = serializers.DateTimeField(source="first_seen_by_user", read_only=True)
    last_seen = serializers.DateTimeField(source="job.last_seen", read_only=True)
    closed_at = serializers.DateTimeField(source="job.closed_at", read_only=True)
    seen_count = serializers.IntegerField(source="job.seen_count", read_only=True)
    also_seen_on = serializers.JSONField(source="job.also_seen_on", read_only=True)
    date_from = serializers.CharField(source="job.date_from", read_only=True)

    class Meta:
        model = UserJob
        fields = (
            "id",
            "key",
            "source",
            "company",
            "title",
            "location",
            "url",
            "description",
            "posted_at",
            "first_seen",
            "last_seen",
            "closed_at",
            "seen_count",
            "score",
            "tier",
            "status",
            "notes",
            "pinned",
            "is_new",
            "flags",
            "detail",
            "also_seen_on",
            "date_from",
            "tracking_days",
        )
        # Everything except the three things the user owns is written by the run.
        read_only_fields = tuple(
            field for field in fields if field not in {"status", "notes", "pinned"}
        )


class JobUpdateSerializer(serializers.ModelSerializer):
    """The only three fields a user may write."""

    class Meta:
        model = UserJob
        fields = ("status", "notes", "pinned")


class BulkStatusSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    status = serializers.ChoiceField(choices=ApplicationStatus.choices)


class StatusChoiceSerializer(serializers.Serializer):
    value = serializers.CharField()
    # Shadows the inherited `Field.label`; the wire name has to stay `label`.
    label = serializers.CharField()  # type: ignore[assignment]


class SourceSerializer(serializers.ModelSerializer):
    """A user sees shared sources and their own private ones, never another's."""

    is_shared = serializers.BooleanField(read_only=True)
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Source
        fields = (
            "id",
            "kind",
            "slug",
            "company",
            "host",
            "tenant",
            "site",
            "url",
            "label",
            "location_hint",
            "config",
            "enabled",
            "last_run_at",
            "last_status",
            "last_error",
            "is_shared",
            "is_mine",
        )
        read_only_fields = ("last_run_at", "last_status", "last_error")

    def get_is_mine(self, obj: Source) -> bool:
        request = self.context.get("request")
        return bool(request and obj.owner_id == request.user.pk)


class StatsSerializer(serializers.Serializer):
    open_count = serializers.IntegerField()
    new_today = serializers.IntegerField()
    by_tier = serializers.DictField(child=serializers.IntegerField())
    by_source = serializers.DictField(child=serializers.IntegerField())
    by_status = serializers.DictField(child=serializers.IntegerField())
    avg_score = serializers.FloatField(allow_null=True)
    last_run_at = serializers.DateTimeField(allow_null=True)
    score_histogram = serializers.ListField(child=serializers.DictField())


class JobDetailSerializer(JobSerializer):
    """Identical to the list shape — the detail screen needs nothing extra."""

    class Meta(JobSerializer.Meta):
        pass


def job_queryset_for(user: Any):
    """Every job query starts here, and it always filters by the user.

    `select_related("job")` is not optional: without it a 50-row page issues 51
    queries.
    """
    return UserJob.objects.filter(user=user).select_related("job")
