from __future__ import annotations

from typing import Any

from django.contrib import admin, messages
from django.db.models import QuerySet
from django.http import HttpRequest

from jobs.models import Job, Source, UserJob
from sources import SourceError, fetch


@admin.register(Source)
class SourceAdmin(admin.ModelAdmin):
    """Where shared sources are added and tested. No redeploy, no code change."""

    list_display = ("__str__", "kind", "slug", "enabled", "owner", "last_status", "last_run_at")
    list_filter = ("kind", "enabled", "last_status")
    search_fields = ("slug", "company", "label", "url", "host")
    autocomplete_fields = ("owner",)
    actions = ("test_source",)

    @admin.action(description="Test selected sources (fetches live)")
    def test_source(self, request: HttpRequest, queryset: QuerySet[Source]) -> None:
        for source in queryset:
            try:
                postings = fetch(source.spec)
            except SourceError as exc:
                self.message_user(request, f"{source}: {exc}", level=messages.ERROR)
            except Exception as exc:
                self.message_user(
                    request, f"{source}: unexpected {exc.__class__.__name__}", level=messages.ERROR
                )
            else:
                sample = postings[0].title if postings else "—"
                self.message_user(
                    request,
                    f"{source}: {len(postings)} postings (e.g. {sample})",
                    level=messages.SUCCESS if postings else messages.WARNING,
                )


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    """Read-only: jobs are written by the run, never by hand."""

    list_display = ("company", "title", "location", "source", "posted_at", "last_seen", "closed_at")
    list_filter = ("source", "closed_at")
    search_fields = ("company", "title", "location", "key")
    date_hierarchy = "first_seen"

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj: Any = None) -> bool:
        return False


@admin.register(UserJob)
class UserJobAdmin(admin.ModelAdmin):
    list_display = ("user", "job", "score", "tier", "status", "is_new", "is_open")
    list_filter = ("tier", "status", "is_new", "is_open")
    search_fields = ("user__email", "job__title", "job__company")
    readonly_fields = ("score", "tier", "detail", "flags", "tracking_days")
