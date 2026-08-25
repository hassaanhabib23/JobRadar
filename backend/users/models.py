"""The custom user model.

Registration is email + password and no username appears anywhere in the API, so
`email` is the `USERNAME_FIELD` and the username column is dropped entirely.

This model exists from the very first migration on purpose — swapping
`AUTH_USER_MODEL` after any table references it is genuinely painful.
"""

from __future__ import annotations

import dataclasses
from typing import Any, ClassVar

from django.conf import settings
from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _

from scoring import defaults
from scoring.domain import Freshness
from scoring.domain import Profile as ScoringProfile


class UserManager(BaseUserManager["User"]):
    """Identical to Django's, minus the username."""

    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra: Any) -> User:
        if not email:
            raise ValueError("An email address is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra: Any) -> User:
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email: str, password: str | None = None, **extra: Any) -> User:
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        if extra.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True")
        if extra.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True")
        return self._create_user(email, password, **extra)


class User(AbstractUser):
    username = None  # type: ignore[assignment]
    email = models.EmailField(_("email address"), unique=True)

    # Set once the user has been through /welcome. The frontend reads it from
    # /api/auth/me/ to decide whether to show onboarding.
    onboarding_complete = models.BooleanField(default=False)

    #: When this address was confirmed, or null.
    #:
    #: A **soft** gate on purpose. An unverified user gets the whole app; the
    #: only thing they lose is the digest, because mailing an address nobody has
    #: confirmed is how a sender's reputation gets destroyed. Blocking login
    #: instead would mean a broken mail server stops all new signups.
    email_verified_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    # Nothing beyond email and password — `createsuperuser` prompts for those only.
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    objects = UserManager()  # type: ignore[assignment,misc]

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None

    def __str__(self) -> str:
        return self.email


class Profile(models.Model):
    """One user's scoring configuration.

    Private per user, and the reason the same posting scores differently for
    different people. Stored as jsonb so weights can be tuned from the UI without
    a migration, and converted to the framework-free
    :class:`scoring.domain.Profile` whenever the scorer runs.

    Created automatically on registration, seeded from the section 10 defaults,
    so a new user has a working profile immediately rather than an empty one.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )

    skills = models.JSONField(default=dict, help_text="keyword → weight")
    level_bonus = models.JSONField(default=dict, help_text="title term → multiplier")
    level_penalty = models.JSONField(default=dict, help_text="title term → multiplier")
    title_blocklist = models.JSONField(default=list)

    #: Catalogue keys from `scoring.locations`.
    locations_allowed = models.JSONField(default=list)
    locations_preferred = models.JSONField(default=list)
    locations_secondary = models.JSONField(default=list)

    stack_saturation = models.FloatField(default=defaults.DEFAULT_STACK_SATURATION)
    freshness = models.JSONField(default=dict)

    #: Onboarding chips, kept so the UI can show what was picked.
    role_keywords = models.JSONField(default=list)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("profile")
        verbose_name_plural = _("profiles")

    def __str__(self) -> str:
        return f"Profile({self.user.email})"

    def to_domain(self) -> ScoringProfile:
        """Convert to the plain dataclass the scorer works with.

        Every field is defensive: a profile is user-editable JSON, and one
        malformed value must not be able to break a whole run.
        """
        freshness_config = self.freshness if isinstance(self.freshness, dict) else {}
        known = {field.name for field in Freshness.__dataclass_fields__.values()}
        freshness = Freshness(**{k: v for k, v in freshness_config.items() if k in known})

        def as_tuple(value: object) -> tuple[str, ...]:
            return tuple(str(item) for item in value) if isinstance(value, (list, tuple)) else ()

        def as_weights(value: object) -> dict[str, float]:
            if not isinstance(value, dict):
                return {}
            weights: dict[str, float] = {}
            for key, weight in value.items():
                try:
                    weights[str(key)] = float(weight)
                except (TypeError, ValueError):
                    continue
            return weights

        return ScoringProfile(
            skills=as_weights(self.skills),
            level_bonus=as_weights(self.level_bonus),
            level_penalty=as_weights(self.level_penalty),
            title_blocklist=as_tuple(self.title_blocklist),
            locations_allowed=as_tuple(self.locations_allowed),
            locations_preferred=as_tuple(self.locations_preferred),
            locations_secondary=as_tuple(self.locations_secondary),
            stack_saturation=float(self.stack_saturation or 1.0),
            freshness=freshness,
        )

    def seed_defaults(
        self,
        locations: tuple[str, ...] = defaults.DEFAULT_LOCATIONS,
        role_keywords: tuple[str, ...] = (),
    ) -> None:
        """Fill this profile with the section 10 defaults for the chosen cities."""
        chosen = tuple(locations) or defaults.DEFAULT_LOCATIONS
        self.skills = defaults.apply_role_keywords(dict(defaults.DEFAULT_SKILLS), role_keywords)
        self.level_bonus = dict(defaults.DEFAULT_LEVEL_BONUS)
        self.level_penalty = dict(defaults.DEFAULT_LEVEL_PENALTY)
        self.title_blocklist = list(defaults.DEFAULT_TITLE_BLOCKLIST)
        self.locations_allowed = list(chosen)
        self.locations_preferred = list(chosen)
        self.locations_secondary = list(defaults.DEFAULT_SECONDARY_LOCATIONS)
        self.stack_saturation = defaults.DEFAULT_STACK_SATURATION
        self.freshness = dataclasses.asdict(defaults.DEFAULT_FRESHNESS)
        self.role_keywords = list(role_keywords)
