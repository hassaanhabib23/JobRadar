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

#: FR5 requires dropping non-engineering titles, and section 10 gives no list, so
#: this is one. It matters more than it looks: with an empty blocklist, a run
#: across 14 real boards put "Associate — Project Sales" and "Associate People
#: Business Partner" near the top of a .NET developer's list, scoring ~49 on the
#: entry-level bonus alone with zero skill matches.
#:
#: Deliberately conservative. Only titles that are unambiguously a different
#: profession are listed — "analyst", "consultant" and "specialist" are left out
#: because they are penalised by seniority weighting rather than excluded, and
#: they do sometimes describe engineering work. Every entry is editable per user.
DEFAULT_TITLE_BLOCKLIST: tuple[str, ...] = (
    # Not a bare "sales": that would also drop "Sales Engineer" and "Solution
    # Engineer (Pre-Sales)", which are genuinely technical roles.
    "sales executive",
    "sales manager",
    "sales officer",
    "sales representative",
    "sales associate",
    "field sales",
    "project sales",
    "inside sales",
    "sales specialist",
    "sales compliance",
    "key accounts",
    "account executive",
    "account manager",
    "business development",
    "recruiter",
    "recruitment",
    "talent acquisition",
    "people business partner",
    "people operations",
    "human resources",
    "accountant",
    "accounts officer",
    "accounts receivable",
    "accounts payable",
    "finance",
    "payroll",
    "legal",
    "counsel",
    "paralegal",
    "marketing",
    "brand",
    "copywriter",
    "content writer",
    "social media",
    "graphic designer",
    "video editor",
    "front desk",
    "billing specialist",
    "regulatory affairs",
    "corporate affairs",
    "education consultant",
    "customer support",
    "customer service",
    "call center",
    "call centre",
    "rider",
    "driver",
    "warehouse",
    "logistics",
    "procurement",
    "admin officer",
    "receptionist",
    "teacher",
    "nurse",
    "physician",
)

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


#: Onboarding role chips. A blank weight table is a screen nobody fills in, so
#: picking a chip pre-weights the skills that go with it instead.
ROLE_PRESETS: dict[str, tuple[str, ...]] = {
    "dotnet": ("asp.net core", "asp.net", ".net", "dotnet", "c#", "entity framework", "blazor"),
    "react": ("react", "typescript", "javascript", "frontend"),
    "angular": ("angular", "typescript", "javascript", "frontend"),
    "python": ("python", "django", "backend"),
    "qa": ("rest api", "postman", "ci/cd"),
    "devops": ("docker", "ci/cd", "azure devops", "azure"),
    "ai_ml": ("llm", "rag", "generative ai", "openai", "langchain", "agentic", "machine learning"),
}

#: How much picking a chip raises the weights it covers.
ROLE_PRESET_BOOST = 1.5


def apply_role_keywords(
    skills: dict[str, float], role_keywords: tuple[str, ...]
) -> dict[str, float]:
    """Raise the weights a user's chosen role chips cover.

    Pure, so it is testable without a database and reusable when a user changes
    their chips later. Unknown keywords are ignored rather than raising — the
    chip list is presentation data and should never be able to break a signup.
    """
    boosted = dict(skills)
    for keyword in role_keywords:
        for skill in ROLE_PRESETS.get(keyword.lower().strip(), ()):
            if skill in boosted:
                boosted[skill] = round(boosted[skill] * ROLE_PRESET_BOOST, 2)
    return boosted


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
