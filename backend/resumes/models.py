"""One user's uploaded CV and what was detected in it.

Extraction reuses the exact keyword vocabulary and matching rule job scoring
already uses (`scoring.text`, `scoring.defaults`) — what a CV says and what a
job posting says are judged by the same rule. See `resumes/parsing.py`.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models


def resume_upload_path(instance: Resume, filename: str) -> str:
    """Keyed by user id, not a public/incrementing resume id — a leaked media
    path alone must not let anyone enumerate other users' CVs."""
    return f"resumes/{instance.user_id}/{filename}"


class SeniorityTier(models.TextChoices):
    JUNIOR = "junior", "Junior"
    MID = "mid", "Mid"
    SENIOR = "senior", "Senior"
    LEAD = "lead", "Lead"
    UNKNOWN = "unknown", "Unknown"


class Resume(models.Model):
    """One CV. Re-uploading replaces this row entirely — see `resumes/views.py`."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="resume"
    )
    file = models.FileField(upload_to=resume_upload_path, max_length=500)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)

    extracted_text = models.TextField(blank=True)
    detected_skills = models.JSONField(default=dict, blank=True)
    detected_role_keywords = models.JSONField(default=list, blank=True)
    detected_seniority = models.CharField(
        max_length=16, choices=SeniorityTier.choices, default=SeniorityTier.UNKNOWN
    )

    uploaded_at = models.DateTimeField(auto_now_add=True)
    parsed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "resume"

    def __str__(self) -> str:
        return f"Resume({self.user_id})"
