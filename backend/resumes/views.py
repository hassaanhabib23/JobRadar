"""The resume endpoints.

Upload is the only place a CV's signals ever reach a `Profile` — once, at
upload time. `PATCH /profile/` (onboarding and later manual tuning both use
it) is untouched by this app entirely, so a user's later hand-edited weights
are never silently re-merged with resume data on some unrelated future save.
"""

from __future__ import annotations

from typing import Any

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from resumes.models import Resume
from resumes.parsing import ParseError, ResumeSignals, extract_signals, extract_text
from resumes.serializers import ResumeSerializer, ResumeUploadSerializer
from scoring import defaults
from users.models import Profile


def _user(request: Request) -> Any:
    return request.user


class ResumeView(APIView):
    permission_classes = [IsAuthenticated]
    # The global default is JSON-only (djangorestframework-camel-case); a
    # file upload is multipart, so this view needs its own parser list.
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(responses={200: ResumeSerializer, 404: None}, operation_id="resume_get")
    def get(self, request: Request) -> Response:
        resume = Resume.objects.filter(user=_user(request)).first()
        if resume is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(ResumeSerializer(resume).data)

    @extend_schema(
        request=ResumeUploadSerializer,
        responses={201: ResumeSerializer},
        operation_id="resume_upload",
    )
    def post(self, request: Request) -> Response:
        upload = ResumeUploadSerializer(data=request.data)
        upload.is_valid(raise_exception=True)
        file = upload.validated_data["file"]

        try:
            text = extract_text(file.read(), file.content_type)
        except ParseError as exc:
            return Response({"file": [str(exc)]}, status=status.HTTP_400_BAD_REQUEST)
        file.seek(0)

        signals = extract_signals(text)
        user = _user(request)

        existing = Resume.objects.filter(user=user).first()
        if existing is not None:
            # The row is about to be replaced, but a queryset/instance delete
            # never removes the underlying file from storage on its own.
            existing.file.delete(save=False)
            existing.delete()

        resume = Resume.objects.create(
            user=user,
            file=file,
            original_filename=file.name,
            content_type=file.content_type,
            extracted_text=text,
            detected_skills=signals.skills,
            detected_role_keywords=list(signals.role_keywords),
            detected_seniority=signals.seniority,
            parsed_at=timezone.now(),
        )
        _apply_to_profile(user, signals)

        return Response(ResumeSerializer(resume).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses={204: None, 404: None}, operation_id="resume_delete")
    def delete(self, request: Request) -> Response:
        resume = Resume.objects.filter(user=_user(request)).first()
        if resume is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        resume.file.delete(save=False)
        resume.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _apply_to_profile(user: Any, signals: ResumeSignals) -> None:
    """Fold detected signals into the profile once, at upload time.

    Additive on skills (resume weights win on overlap with whatever is
    already there), and seniority re-buckets level_bonus/level_penalty via
    `apply_seniority`. Never runs again on its own — a later manual edit
    through `PATCH /profile/` is never touched by this.
    """
    profile, _ = Profile.objects.get_or_create(user=user)
    profile.skills = {**profile.skills, **signals.skills}
    profile.level_bonus, profile.level_penalty = defaults.apply_seniority(
        profile.level_bonus, profile.level_penalty, signals.seniority
    )
    profile.role_keywords = list(
        dict.fromkeys([*profile.role_keywords, *signals.role_keywords])
    )
    profile.save(update_fields=["skills", "level_bonus", "level_penalty", "role_keywords"])
