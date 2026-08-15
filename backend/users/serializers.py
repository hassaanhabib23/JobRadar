"""Serializers for auth, profile and the score preview."""

from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model, password_validation
from django.db import transaction
from rest_framework import serializers

from scoring import defaults, locations
from scoring.domain import RawPosting
from scoring.scorer import evaluate_job
from users.models import Profile

User = get_user_model()

VALID_LOCATION_KEYS = {location.key for location in locations.SELECTABLE}
VALID_ROLE_KEYWORDS = set(defaults.ROLE_PRESETS)


class UserSerializer(serializers.ModelSerializer):
    """The current user. Never exposes another user's row."""

    class Meta:
        model = User
        fields = ("id", "email", "onboarding_complete", "date_joined")
        read_only_fields = fields


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    locations = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
        help_text="Catalogue keys from GET /api/locations/. Defaults to Islamabad + Rawalpindi.",
    )
    role_keywords = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
        help_text="Onboarding role chips that pre-weight the matching skills.",
    )

    def validate_email(self, value: str) -> str:
        normalised = User.objects.normalize_email(value).lower()
        if User.objects.filter(email__iexact=normalised).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return normalised

    def validate_password(self, value: str) -> str:
        password_validation.validate_password(value)
        return value

    def validate_locations(self, value: list[str]) -> list[str]:
        unknown = [key for key in value if key not in VALID_LOCATION_KEYS]
        if unknown:
            raise serializers.ValidationError(f"Unknown location keys: {', '.join(unknown)}")
        # Preserve order, drop duplicates.
        return list(dict.fromkeys(value))

    def validate_role_keywords(self, value: list[str]) -> list[str]:
        unknown = [key for key in value if key.lower() not in VALID_ROLE_KEYWORDS]
        if unknown:
            raise serializers.ValidationError(f"Unknown role keywords: {', '.join(unknown)}")
        return list(dict.fromkeys(key.lower() for key in value))

    @transaction.atomic
    def create(self, validated_data: dict[str, Any]) -> Any:
        chosen = tuple(validated_data.get("locations") or defaults.DEFAULT_LOCATIONS)
        keywords = tuple(validated_data.get("role_keywords") or ())

        user = User.objects.create_user(
            email=validated_data["email"], password=validated_data["password"]
        )

        # The post_save signal has already created a default profile; re-seed it
        # with the cities and role chips this user actually picked.
        profile = user.profile
        profile.seed_defaults(locations=chosen, role_keywords=keywords)
        profile.save()

        return user


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True, style={"input_type": "password"})
    new_password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate_old_password(self, value: str) -> str:
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value: str) -> str:
        password_validation.validate_password(value, self.context["request"].user)
        return value

    def save(self, **kwargs: Any) -> Any:
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class RefreshRequestSerializer(serializers.Serializer):
    """The refresh endpoint normally reads the httpOnly cookie.

    The body field exists only so non-browser clients have a way in, and so the
    schema describes something concrete.
    """

    refresh = serializers.CharField(required=False)


class LocationSerializer(serializers.Serializer):
    """A selectable city for the onboarding picker."""

    key = serializers.CharField()
    # `label` collides with the `Field.label` attribute every serializer
    # inherits. The wire name has to stay `label`, so the shadowing is
    # deliberate rather than a mistake.
    label = serializers.CharField()  # type: ignore[assignment]
    aliases = serializers.ListField(child=serializers.CharField())


class ProfileSerializer(serializers.ModelSerializer):
    """The requesting user's own profile. `user` is never client-supplied."""

    class Meta:
        model = Profile
        fields = (
            "skills",
            "level_bonus",
            "level_penalty",
            "title_blocklist",
            "locations_allowed",
            "locations_preferred",
            "locations_secondary",
            "stack_saturation",
            "freshness",
            "role_keywords",
            "updated_at",
        )
        read_only_fields = ("updated_at",)

    def _validate_location_keys(self, value: Any, field: str) -> list[str]:
        if not isinstance(value, list):
            raise serializers.ValidationError({field: "Expected a list of location keys."})
        unknown = [key for key in value if key not in locations.BY_KEY]
        if unknown:
            raise serializers.ValidationError(
                {field: f"Unknown location keys: {', '.join(map(str, unknown))}"}
            )
        return list(dict.fromkeys(value))

    def validate_locations_allowed(self, value: Any) -> list[str]:
        keys = self._validate_location_keys(value, "locations_allowed")
        if not keys:
            raise serializers.ValidationError("Choose at least one city.")
        return keys

    def validate_locations_preferred(self, value: Any) -> list[str]:
        return self._validate_location_keys(value, "locations_preferred")

    def validate_locations_secondary(self, value: Any) -> list[str]:
        return self._validate_location_keys(value, "locations_secondary")

    def validate_stack_saturation(self, value: float) -> float:
        if value <= 0:
            raise serializers.ValidationError("Must be greater than zero.")
        return value

    def _validate_weights(self, value: Any, label: str) -> dict[str, float]:
        if not isinstance(value, dict):
            raise serializers.ValidationError(f"{label} must be an object of term → number.")
        cleaned: dict[str, float] = {}
        for term, weight in value.items():
            if not str(term).strip():
                raise serializers.ValidationError(f"{label} contains a blank term.")
            try:
                cleaned[str(term)] = float(weight)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"{label}['{term}'] must be a number.") from None
        return cleaned

    def validate_skills(self, value: Any) -> dict[str, float]:
        return self._validate_weights(value, "skills")

    def validate_level_bonus(self, value: Any) -> dict[str, float]:
        return self._validate_weights(value, "level_bonus")

    def validate_level_penalty(self, value: Any) -> dict[str, float]:
        return self._validate_weights(value, "level_penalty")

    def validate_freshness(self, value: Any) -> dict[str, Any]:
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected an object.")
        allowed = {
            "max_age_days",
            "unknown_date_points",
            "ghost_points",
            "drop_unknown_date",
            "ghost_after_days_tracked",
        }
        unknown = set(value) - allowed
        if unknown:
            raise serializers.ValidationError(f"Unknown keys: {', '.join(sorted(unknown))}")
        return value


class ScorePreviewRequestSerializer(serializers.Serializer):
    """A hypothetical posting, for tuning weights interactively."""

    title = serializers.CharField(allow_blank=True, default="")
    description = serializers.CharField(allow_blank=True, default="")
    location = serializers.CharField(allow_blank=True, default="")
    company = serializers.CharField(allow_blank=True, default="Preview")


class ScorePreviewResponseSerializer(serializers.Serializer):
    score = serializers.IntegerField(allow_null=True)
    tier = serializers.CharField(allow_null=True)
    detail = serializers.DictField(allow_null=True)
    flags = serializers.ListField(child=serializers.CharField())
    filtered = serializers.BooleanField()
    filtered_reason = serializers.CharField(allow_null=True)

    @staticmethod
    def from_profile(profile: Profile, payload: dict[str, Any]) -> dict[str, Any]:
        posting = RawPosting(
            source="preview",
            company=payload.get("company") or "Preview",
            title=payload.get("title", ""),
            location=payload.get("location", ""),
            description=payload.get("description", ""),
        )
        outcome = evaluate_job(posting, profile.to_domain())

        if outcome.result is None:
            return {
                "score": None,
                "tier": None,
                "detail": None,
                "flags": [],
                "filtered": True,
                "filtered_reason": outcome.filtered_reason,
            }

        return {
            "score": outcome.result.score,
            "tier": outcome.result.tier,
            "detail": outcome.result.detail.as_dict(),
            "flags": list(outcome.result.flags),
            "filtered": False,
            "filtered_reason": None,
        }
