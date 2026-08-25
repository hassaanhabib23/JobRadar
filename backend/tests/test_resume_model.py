from __future__ import annotations

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError

from resumes.models import Resume, SeniorityTier

pytestmark = pytest.mark.django_db


def test_one_resume_per_user(user_factory):
    user = user_factory()
    Resume.objects.create(
        user=user,
        file=SimpleUploadedFile("cv.pdf", b"%PDF-1.4 fake", content_type="application/pdf"),
        original_filename="cv.pdf",
        content_type="application/pdf",
    )
    with pytest.raises(IntegrityError):
        Resume.objects.create(
            user=user,
            file=SimpleUploadedFile("cv2.pdf", b"%PDF-1.4 fake", content_type="application/pdf"),
            original_filename="cv2.pdf",
            content_type="application/pdf",
        )


def test_defaults(user_factory):
    user = user_factory()
    resume = Resume.objects.create(
        user=user,
        file=SimpleUploadedFile("cv.pdf", b"%PDF-1.4 fake", content_type="application/pdf"),
        original_filename="cv.pdf",
        content_type="application/pdf",
    )
    assert resume.detected_skills == {}
    assert resume.detected_role_keywords == []
    assert resume.detected_seniority == SeniorityTier.UNKNOWN
    assert resume.parsed_at is None


def test_upload_path_is_keyed_by_user_id(user_factory):
    user = user_factory()
    resume = Resume(user=user)
    assert resumes_upload_path_contains_user(resume, "cv.pdf", user.pk)


def resumes_upload_path_contains_user(resume: Resume, filename: str, user_id: int) -> bool:
    from resumes.models import resume_upload_path

    path = resume_upload_path(resume, filename)
    return f"/{user_id}/" in f"/{path}"
