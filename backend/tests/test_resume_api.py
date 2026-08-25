from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from docx import Document
from rest_framework.test import APIClient

from resumes.models import Resume
from users.models import Profile

pytestmark = pytest.mark.django_db

DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _docx_upload(name: str, paragraphs: list[str]) -> SimpleUploadedFile:
    document = Document()
    for paragraph in paragraphs:
        document.add_paragraph(paragraph)
    buf = io.BytesIO()
    document.save(buf)
    return SimpleUploadedFile(name, buf.getvalue(), content_type=DOCX_CONTENT_TYPE)


@pytest.fixture
def authed_client(api_client: APIClient, user_factory):
    user = user_factory()
    api_client.force_authenticate(user=user)
    return api_client, user


class TestUpload:
    def test_uploads_and_returns_detected_signals(self, authed_client):
        client, user = authed_client
        upload = _docx_upload("cv.docx", ["Senior React Developer", "React, TypeScript, Docker"])

        response = client.post("/api/resume/", {"file": upload}, format="multipart")

        assert response.status_code == 201
        body = response.json()
        assert body["detectedSeniority"] == "senior"
        assert "react" in body["detectedSkills"]
        assert Resume.objects.filter(user=user).exists()

    def test_writes_skills_onto_the_profile(self, authed_client):
        client, user = authed_client
        upload = _docx_upload("cv.docx", ["React, TypeScript, Docker"])

        client.post("/api/resume/", {"file": upload}, format="multipart")

        profile = Profile.objects.get(user=user)
        assert profile.skills["react"] > 0

    def test_re_upload_replaces_the_previous_resume(self, authed_client):
        client, user = authed_client
        client.post(
            "/api/resume/", {"file": _docx_upload("cv1.docx", ["React"])}, format="multipart"
        )
        first_id = Resume.objects.get(user=user).pk

        client.post(
            "/api/resume/",
            {"file": _docx_upload("cv2.docx", ["Python Django"])},
            format="multipart",
        )

        assert Resume.objects.filter(user=user).count() == 1
        replaced = Resume.objects.get(user=user)
        assert replaced.pk != first_id
        assert "python" in replaced.detected_skills

    def test_rejects_an_unsupported_file_type(self, authed_client):
        client, _user = authed_client
        upload = SimpleUploadedFile("cv.png", b"not a resume", content_type="image/png")

        response = client.post("/api/resume/", {"file": upload}, format="multipart")

        assert response.status_code == 400
        assert not Resume.objects.exists()

    def test_rejects_an_oversized_file(self, authed_client):
        client, _user = authed_client
        upload = SimpleUploadedFile(
            "cv.docx", b"0" * (6 * 1024 * 1024), content_type=DOCX_CONTENT_TYPE
        )

        response = client.post("/api/resume/", {"file": upload}, format="multipart")

        assert response.status_code == 400
        assert not Resume.objects.exists()

    def test_rejects_a_file_with_no_extractable_text(self, authed_client):
        client, _user = authed_client
        upload = SimpleUploadedFile(
            "cv.pdf", b"%PDF-1.4 not really a pdf", content_type="application/pdf"
        )

        response = client.post("/api/resume/", {"file": upload}, format="multipart")

        assert response.status_code == 400
        assert not Resume.objects.exists()

    def test_requires_authentication(self, api_client: APIClient):
        upload = _docx_upload("cv.docx", ["React"])
        assert (
            api_client.post("/api/resume/", {"file": upload}, format="multipart").status_code == 401
        )


class TestReadAndDelete:
    def test_get_returns_404_with_no_resume(self, authed_client):
        client, _user = authed_client
        assert client.get("/api/resume/").status_code == 404

    def test_get_returns_the_current_signals(self, authed_client):
        client, _user = authed_client
        client.post(
            "/api/resume/", {"file": _docx_upload("cv.docx", ["React"])}, format="multipart"
        )

        response = client.get("/api/resume/")

        assert response.status_code == 200
        assert "react" in response.json()["detectedSkills"]

    def test_delete_removes_it(self, authed_client):
        client, user = authed_client
        client.post(
            "/api/resume/", {"file": _docx_upload("cv.docx", ["React"])}, format="multipart"
        )

        response = client.delete("/api/resume/")

        assert response.status_code == 204
        assert not Resume.objects.filter(user=user).exists()

    def test_delete_with_no_resume_is_404(self, authed_client):
        client, _user = authed_client
        assert client.delete("/api/resume/").status_code == 404

    def test_scoped_to_the_authenticated_user(self, authed_client, user_factory):
        client, _user = authed_client
        stranger = user_factory()
        Resume.objects.create(
            user=stranger,
            file=_docx_upload("cv.docx", ["React"]),
            original_filename="cv.docx",
            content_type=DOCX_CONTENT_TYPE,
        )

        assert client.get("/api/resume/").status_code == 404
