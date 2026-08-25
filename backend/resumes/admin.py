from __future__ import annotations

from django.contrib import admin
from django.http import HttpRequest

from resumes.models import Resume


@admin.register(Resume)
class ResumeAdmin(admin.ModelAdmin):
    """Read-only: a resume is written by its owner via the API, never by hand."""

    list_display = ("user", "detected_seniority", "uploaded_at", "parsed_at")
    search_fields = ("user__email",)
    readonly_fields = (
        "user",
        "file",
        "original_filename",
        "content_type",
        "extracted_text",
        "detected_skills",
        "detected_role_keywords",
        "detected_seniority",
        "uploaded_at",
        "parsed_at",
    )

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False
