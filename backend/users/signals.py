"""A new user gets a working profile immediately.

Registration goes through the API, but users also arrive via `createsuperuser`,
the admin, the seed command and tests. A signal covers every one of those paths,
so there is no way to end up with a user who has no profile and therefore cannot
be scored.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from users.models import Profile


@receiver(post_save, sender=settings.AUTH_USER_MODEL, dispatch_uid="create_user_profile")
def create_profile_for_new_user(sender: Any, instance: Any, created: bool, **kwargs: Any) -> None:
    if not created:
        return
    profile = Profile(user=instance)
    profile.seed_defaults()
    profile.save()
