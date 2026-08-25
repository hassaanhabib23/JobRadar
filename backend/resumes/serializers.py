from __future__ import annotations

from rest_framework import serializers

from resumes.models import Resume

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


class ResumeUploadSerializer(serializers.Serializer):
    file = serializers.FileField()

    def validate_file(self, value):
        if value.size > MAX_UPLOAD_SIZE:
            raise serializers.ValidationError("File is too large (max 5MB).")
        if value.content_type not in ALLOWED_CONTENT_TYPES:
            raise serializers.ValidationError("Only PDF and DOCX files are supported.")
        return value


class ResumeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resume
        fields = (
            "detected_skills",
            "detected_role_keywords",
            "detected_seniority",
            "uploaded_at",
            "parsed_at",
        )
        read_only_fields = fields
