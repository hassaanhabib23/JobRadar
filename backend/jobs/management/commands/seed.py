"""Seed shared sources, a superuser, and two demo users.

`docker compose up` is meant to be the entire setup (NFR1). Two demo users with
different cities and different profiles exist so the multi-user behaviour is
visible immediately rather than theoretical.
"""

from __future__ import annotations

import os
from typing import Any, NamedTuple

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from jobs.models import Source
from jobs.seeds import SHARED_SOURCES

User = get_user_model()


class DemoUser(NamedTuple):
    email: str
    locations: tuple[str, ...]
    role_keywords: tuple[str, ...]


#: Two users with different cities and different profiles, so the multi-user
#: behaviour is visible on first boot rather than theoretical.
DEMO_USERS = [
    DemoUser("demo.islamabad@jobradar.local", ("islamabad", "rawalpindi"), ("dotnet",)),
    DemoUser("demo.lahore@jobradar.local", ("lahore", "remote_pk"), ("react", "ai_ml")),
]


class Command(BaseCommand):
    help = "Seed shared sources, a superuser and two demo users. Safe to re-run."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--password",
            default=os.environ.get("DJANGO_SUPERUSER_PASSWORD", "jobradar-dev-password"),
            help="Password for the superuser and demo users.",
        )

    @transaction.atomic
    def handle(self, *args: Any, **options: Any) -> None:
        password = options["password"]

        created_sources = 0
        for entry in SHARED_SOURCES:
            lookup = {
                "kind": entry["kind"],
                "slug": entry.get("slug", ""),
                "host": entry.get("host", ""),
                "owner": None,
            }
            _, created = Source.objects.get_or_create(**lookup, defaults=entry)
            created_sources += int(created)

        shared_total = Source.objects.filter(owner=None).count()
        self.stdout.write(f"sources: {created_sources} created, {shared_total} shared total")

        admin_email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "admin@jobradar.local")
        admin, created = User.objects.get_or_create(
            email=admin_email, defaults={"is_staff": True, "is_superuser": True}
        )
        if created:
            admin.set_password(password)
            admin.save()
        self.stdout.write(f"superuser: {admin_email} ({'created' if created else 'exists'})")

        for demo in DEMO_USERS:
            user, created = User.objects.get_or_create(email=demo.email)
            if created:
                user.set_password(password)
                user.save()
            profile = user.profile
            profile.seed_defaults(locations=demo.locations, role_keywords=demo.role_keywords)
            profile.save()
            self.stdout.write(f"demo user: {demo.email} — {', '.join(demo.locations)}")

        self.stdout.write(self.style.SUCCESS("seed complete"))
