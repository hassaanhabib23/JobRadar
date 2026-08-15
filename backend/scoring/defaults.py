"""The default scoring profile from section 10 of the specification.

Pure data, so it lives beside the scorer rather than in the Django layer. A new
user's `Profile` row is seeded from this with their chosen cities substituted in,
so they get a working profile immediately rather than an empty one.
"""

from __future__ import annotations

from scoring.domain import Freshness, Profile

DEFAULT_SKILLS: dict[str, float] = {
    "asp.net core": 10,
    "asp.net": 8,
    ".net": 8,
    "dotnet": 8,
    "c#": 8,
    "entity framework": 6,
    "blazor": 5,
    "web api": 4,
    "rest api": 4,
    "angular": 8,
    "react": 6,
    "typescript": 4,
    "javascript": 3,
    "azure": 6,
    "azure devops": 4,
    "ci/cd": 3,
    "docker": 4,
    "sql server": 5,
    "postgresql": 3,
    "mongodb": 3,
    "python": 4,
    "django": 5,
    "rag": 9,
    "llm": 9,
    "generative ai": 6,
    "openai": 5,
    "langchain": 5,
    "agentic": 6,
    "machine learning": 4,
    "chatbot": 4,
    "multi-tenant": 5,
    "microservices": 3,
    "full stack": 5,
    "backend": 3,
    "frontend": 3,
    "git": 1,
    "postman": 2,
}

DEFAULT_LEVEL_BONUS: dict[str, float] = {
    "junior": 1.0,
    "jr": 1.0,
    "entry": 1.0,
    "fresh": 0.95,
    "fresher": 0.95,
    "associate": 0.95,
    "graduate": 0.92,
    "trainee": 0.92,
    "apprentice": 0.85,
    "intern": 0.4,
}

DEFAULT_LEVEL_PENALTY: dict[str, float] = {
    "chief": 0.0,
    "vp": 0.0,
    "director": 0.05,
    "head of": 0.05,
    "principal": 0.1,
    "staff": 0.15,
    "architect": 0.15,
    "manager": 0.15,
    "lead": 0.2,
    "expert": 0.25,
    "senior": 0.35,
    "sr": 0.35,
    "specialist": 0.6,
    "consultant": 0.6,
}

DEFAULT_TITLE_BLOCKLIST: tuple[str, ...] = ()

DEFAULT_STACK_SATURATION = 45.0

DEFAULT_FRESHNESS = Freshness(
    max_age_days=60,
    unknown_date_points=4,
    ghost_points=1,
    drop_unknown_date=False,
    ghost_after_days_tracked=25,
)

#: Used when a user has not picked anything yet.
DEFAULT_LOCATIONS: tuple[str, ...] = ("islamabad", "rawalpindi")

#: Country-wide fallback, so a role listed only as "Pakistan" still scores.
DEFAULT_SECONDARY_LOCATIONS: tuple[str, ...] = ("pakistan",)


def default_profile(locations: tuple[str, ...] = DEFAULT_LOCATIONS) -> Profile:
    """A working profile for a user who has just chosen their cities."""
    chosen = tuple(locations) or DEFAULT_LOCATIONS
    return Profile(
        skills=dict(DEFAULT_SKILLS),
        level_bonus=dict(DEFAULT_LEVEL_BONUS),
        level_penalty=dict(DEFAULT_LEVEL_PENALTY),
        title_blocklist=DEFAULT_TITLE_BLOCKLIST,
        locations_allowed=chosen,
        locations_preferred=chosen,
        locations_secondary=DEFAULT_SECONDARY_LOCATIONS,
        stack_saturation=DEFAULT_STACK_SATURATION,
        freshness=DEFAULT_FRESHNESS,
    )
