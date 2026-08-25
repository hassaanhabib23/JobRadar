# CV-Driven Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user upload a CV (PDF/DOCX) that gets parsed with the same non-AI keyword matching job scoring already uses, and have the detected skills/role/seniority pre-fill the existing onboarding flow.

**Architecture:** A new `resumes` Django app owns the `Resume` model and the upload/parse/delete API. Extraction (`resumes/parsing.py`) is pure Python reusing `scoring.text.find_weighted`/`find_terms` against the vocabulary already in `scoring/defaults.py` — no new matching logic, no AI. A new pure function `scoring.defaults.apply_seniority` re-buckets the level-bonus/penalty tables by the candidate's own detected tier. The frontend gets a new onboarding Step 1 ("Upload your CV") ahead of the existing Cities/Focus/Done steps.

**Refinement over the spec:** the design spec (`docs/superpowers/specs/2026-08-26-cv-driven-profile-design.md`) described folding resume signals into the existing `PATCH /profile/` handler. This plan instead applies them **once, directly inside `POST /api/resume/`**, writing straight to the user's `Profile` row. Deferring the merge into `PATCH /profile/` would mean *every* future profile edit — including a user hand-tuning a weight months later from the profile settings screen — re-merges the same resume data on top of their edit. Applying it once, at upload time, means `PATCH /profile/` (used by onboarding *and* later manual tuning) needs no changes at all, and a user's later edits are never silently overwritten.

**Tech Stack:** Django/DRF (new `resumes` app), `pypdf` + `python-docx` (new deps), React/TanStack Query, MSW/vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-cv-driven-profile-design.md` — read alongside this plan; the plan implements it with the one refinement noted above.

## Global Constraints

- No AI/LLM extraction anywhere — only `scoring.text`'s existing substring-matching primitives.
- The uploaded file is personal data: never served via a public `MEDIA_URL`; only `GET`/`DELETE /api/resume/`, both scoped to `request.user`, can reach it.
- One `Resume` per user (`OneToOneField`); re-upload deletes the old file and row, then creates fresh.
- A user who never uploads a CV gets today's onboarding and scoring behaviour, byte-for-byte unchanged.
- File size capped at 5 MB, checked before any parsing is attempted.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/resumes/models.py` | `Resume` model, `SeniorityTier` choices, `resume_upload_path` |
| `backend/resumes/parsing.py` | Pure text extraction (`extract_text`) + signal detection (`extract_signals`) |
| `backend/resumes/serializers.py` | `ResumeUploadSerializer` (file validation), `ResumeSerializer` (read shape) |
| `backend/resumes/views.py` | `ResumeView` — POST/GET/DELETE, and the one-time Profile merge on upload |
| `backend/resumes/urls.py`, `admin.py`, `apps.py` | Wiring, read-only admin registration |
| `backend/scoring/defaults.py` | Add `apply_seniority()` beside `apply_role_keywords()` |
| `backend/config/settings/base.py` | `INSTALLED_APPS` += `resumes`; `MEDIA_ROOT`/`MEDIA_URL` |
| `backend/config/urls.py` | Include `resumes.urls` |
| `backend/pyproject.toml` | Add `pypdf`, `python-docx` |
| `docker-compose.yml` | New `media` volume, mounted into `web` |
| `frontend/src/api/client.ts` | `request()` supports a `FormData` body |
| `frontend/src/api/types.ts`, `queries.ts` | `ResumeSignals` type, `useUploadResume`/`useResume`/`useDeleteResume` |
| `frontend/src/test/server.ts` | Mock `/resume/` endpoints |
| `frontend/src/routes/Welcome.tsx` | New Step 1 "Upload your CV", steps renumbered |

---

### Task 1: `resumes` app scaffold — model, migration, settings, storage

**Files:**
- Create: `backend/resumes/__init__.py`, `apps.py`, `models.py`, `admin.py`
- Create: `backend/resumes/migrations/__init__.py`, `backend/resumes/migrations/0001_initial.py` (generated)
- Modify: `backend/config/settings/base.py`, `backend/pyproject.toml`, `docker-compose.yml`
- Test: `backend/tests/test_resume_model.py`

**Interfaces:**
- Produces: `Resume(user, file, original_filename, content_type, extracted_text, detected_skills, detected_role_keywords, detected_seniority, uploaded_at, parsed_at)`; `SeniorityTier.{JUNIOR,MID,SENIOR,LEAD,UNKNOWN}`; `resume_upload_path(instance, filename) -> str`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_resume_model.py
from __future__ import annotations

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

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
    with pytest.raises(Exception):
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T web pytest tests/test_resume_model.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'resumes'`

- [ ] **Step 3: Add dependencies**

In `backend/pyproject.toml`, add to `dependencies` (after `"sentry-sdk[django]>=2.18",`):

```toml
    "pypdf>=5.1",
    "python-docx>=1.1",
```

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T -u root web pip install pypdf python-docx` (so the running container has them immediately; the image rebuild at the end of this plan picks up `pyproject.toml` permanently).

- [ ] **Step 4: Create the app**

`backend/resumes/__init__.py`: empty file.

`backend/resumes/apps.py`:

```python
from django.apps import AppConfig


class ResumesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "resumes"
```

`backend/resumes/models.py`:

```python
"""One user's uploaded CV and what was detected in it.

Extraction reuses the exact keyword vocabulary and matching rule job scoring
already uses (`scoring.text`, `scoring.defaults`) — what a CV says and what a
job posting says are judged by the same rule. See `resumes/parsing.py`.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models


def resume_upload_path(instance: "Resume", filename: str) -> str:
    """Keyed by user id, not a public/incrementing resume id — a leaked media
    path alone must not let anyone enumerate other users' CVs."""
    return f"resumes/{instance.user_id}/{filename}"


class SeniorityTier(models.TextChoices):
    JUNIOR = "junior", "Junior"
    MID = "mid", "Mid"
    SENIOR = "senior", "Senior"
    LEAD = "lead", "Lead"
    UNKNOWN = "unknown", "Unknown"


class Resume(models.Model):
    """One CV. Re-uploading replaces this row entirely — see `resumes/views.py`."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="resume"
    )
    file = models.FileField(upload_to=resume_upload_path, max_length=500)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)

    extracted_text = models.TextField(blank=True)
    detected_skills = models.JSONField(default=dict, blank=True)
    detected_role_keywords = models.JSONField(default=list, blank=True)
    detected_seniority = models.CharField(
        max_length=16, choices=SeniorityTier.choices, default=SeniorityTier.UNKNOWN
    )

    uploaded_at = models.DateTimeField(auto_now_add=True)
    parsed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "resume"

    def __str__(self) -> str:
        return f"Resume({self.user_id})"
```

`backend/resumes/admin.py`:

```python
from __future__ import annotations

from django.contrib import admin

from resumes.models import Resume


@admin.register(Resume)
class ResumeAdmin(admin.ModelAdmin):
    """Read-only: a resume is written by its owner via the API, never by hand."""

    list_display = ("user", "detected_seniority", "uploaded_at", "parsed_at")
    search_fields = ("user__email",)
    readonly_fields = (
        "user",
        "file",
        "original_filename",
        "content_type",
        "extracted_text",
        "detected_skills",
        "detected_role_keywords",
        "detected_seniority",
        "uploaded_at",
        "parsed_at",
    )

    def has_add_permission(self, request: object) -> bool:
        return False
```

- [ ] **Step 5: Wire settings**

In `backend/config/settings/base.py`, add to `INSTALLED_APPS` (after `"notifications",`):

```python
    "notifications",
    "resumes",
```

Add near the static files settings (search for `STATIC` in the file, add after it):

```python
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
```

Leave `backend/config/urls.py` untouched for now — Task 4 creates `resumes/urls.py` and adds the include there, so `config/urls.py` never points at a module that doesn't exist yet.

- [ ] **Step 6: Add the media volume**

In `docker-compose.yml`, add `media` to the `web` service's `volumes:` (after the dev override's bind mounts don't apply here — this is the base file, so add a new top-level entry). The base `web` service currently has no `volumes:` key; add one:

```yaml
  web:
    build:
      context: ./backend
    image: jobradar-backend
    restart: unless-stopped
    volumes:
      - media:/app/media
    command: >
```

(Insert the `volumes:` block right after `restart: unless-stopped` and before `command:`.)

Add `media:` to the top-level `volumes:` section at the end of the file:

```yaml
volumes:
  pgdata:
  redisdata:
  media:
```

- [ ] **Step 7: Generate and apply the migration**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T web python manage.py makemigrations resumes`

Verify it creates `backend/resumes/migrations/0001_initial.py` with one `CreateModel` for `Resume`. Create `backend/resumes/migrations/__init__.py` if `makemigrations` didn't (it should).

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T web python manage.py migrate resumes`

- [ ] **Step 8: Run test to verify it passes**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T web pytest tests/test_resume_model.py -v`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
git add backend/resumes backend/config/settings/base.py backend/pyproject.toml docker-compose.yml backend/tests/test_resume_model.py
git commit -m "feat: add the resumes app with the Resume model"
```

---

### Task 2: Extraction pipeline (pure, no Django)

**Files:**
- Create: `backend/resumes/parsing.py`
- Test: `backend/tests/test_resume_parsing.py`

**Interfaces:**
- Produces: `ParseError(Exception)`; `extract_text(data: bytes, content_type: str) -> str`; `ResumeSignals(skills: dict[str, float], role_keywords: tuple[str, ...], seniority: str)`; `extract_signals(text: str) -> ResumeSignals`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_resume_parsing.py
from __future__ import annotations

import io

import pytest
from docx import Document
from pypdf import PdfWriter

from resumes.parsing import ParseError, extract_signals, extract_text


def _pdf_bytes(text_note: str = "") -> bytes:
    """A minimal valid PDF. pypdf's writer produces a real, parseable file;
    it carries no extractable text, which is exactly what the "no text
    could be extracted" test needs."""
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def _docx_bytes(paragraphs: list[str]) -> bytes:
    document = Document()
    for paragraph in paragraphs:
        document.add_paragraph(paragraph)
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()


class TestExtractText:
    def test_extracts_docx_paragraphs(self):
        data = _docx_bytes(["Senior React Developer", "Skills: React, TypeScript, AWS"])
        text = extract_text(
            data, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        assert "Senior React Developer" in text
        assert "TypeScript" in text

    def test_rejects_unsupported_content_type(self):
        with pytest.raises(ParseError):
            extract_text(b"whatever", "image/png")

    def test_rejects_a_pdf_with_no_extractable_text(self):
        with pytest.raises(ParseError):
            extract_text(_pdf_bytes(), "application/pdf")

    def test_rejects_garbage_pdf_bytes(self):
        with pytest.raises(ParseError):
            extract_text(b"not a pdf at all", "application/pdf")


class TestExtractSignals:
    def test_detects_skills_with_weights(self):
        signals = extract_signals("Senior React Developer. Skills: React, TypeScript, Docker.")
        assert signals.skills["react"] > 0
        assert signals.skills["typescript"] > 0
        assert signals.skills["docker"] > 0
        assert "python" not in signals.skills

    def test_detects_a_role_keyword_from_skill_overlap(self):
        signals = extract_signals("React TypeScript JavaScript frontend developer")
        assert "react" in signals.role_keywords

    def test_detects_seniority_lead_over_senior(self):
        signals = extract_signals("Senior Engineer, promoted to Lead Engineer in 2024")
        assert signals.seniority == "lead"

    def test_detects_seniority_senior(self):
        signals = extract_signals("Senior Software Engineer with 6 years experience")
        assert signals.seniority == "senior"

    def test_unknown_seniority_when_nothing_matches(self):
        signals = extract_signals("Software Engineer building web applications")
        assert signals.seniority == "unknown"

    def test_no_signals_from_empty_text(self):
        signals = extract_signals("")
        assert signals.skills == {}
        assert signals.role_keywords == ()
        assert signals.seniority == "unknown"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T web pytest tests/test_resume_parsing.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'resumes.parsing'`

- [ ] **Step 3: Implement**

```python
# backend/resumes/parsing.py
"""Turning a CV into the same signals a job posting is scored against.

No AI: skills, role focus and seniority are all detected with the identical
substring-matching rule `scoring.text` already applies to job postings
(`scoring/text.py`'s tokenise-pad-substring-match), against the same
vocabulary (`scoring/defaults.py`). What a CV says and what a job posting says
are judged the same way.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

from scoring import defaults
from scoring.text import find_terms, find_weighted


class ParseError(Exception):
    """The file could not be read at all — wrong type, corrupt, or empty."""


_PDF_CONTENT_TYPE = "application/pdf"
_DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def extract_text(data: bytes, content_type: str) -> str:
    """Plain text from a PDF or DOCX. Raises `ParseError` on anything unreadable."""
    if content_type == _PDF_CONTENT_TYPE:
        text = _extract_pdf_text(data)
    elif content_type == _DOCX_CONTENT_TYPE:
        text = _extract_docx_text(data)
    else:
        raise ParseError(f"Unsupported file type: {content_type}")

    if not text.strip():
        raise ParseError("No text could be extracted from this file.")
    return text


def _extract_pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ParseError("This PDF is password-protected.")
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except PdfReadError as exc:
        raise ParseError("Could not read this PDF.") from exc


def _extract_docx_text(data: bytes) -> str:
    from docx import Document
    from docx.opc.exceptions import PackageNotFoundError

    try:
        document = Document(io.BytesIO(data))
    except PackageNotFoundError as exc:
        raise ParseError("Could not read this document.") from exc
    return "\n".join(paragraph.text for paragraph in document.paragraphs)


#: Checked highest tier first — a CV mentioning both "senior" and "lead" is a
#: lead's CV, not a senior's, so the strongest signal anywhere in the text wins.
_SENIORITY_LADDER: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("lead", ("lead", "principal", "staff", "architect", "head of", "director", "vp", "chief")),
    ("senior", ("senior", "sr", "expert", "manager")),
    ("junior", ("junior", "jr", "entry", "fresh", "fresher", "associate", "graduate", "trainee",
                "apprentice", "intern")),
)


@dataclass(frozen=True)
class ResumeSignals:
    skills: dict[str, float]
    role_keywords: tuple[str, ...]
    seniority: str


def extract_signals(text: str) -> ResumeSignals:
    """Pure: no Django, no I/O, testable with plain strings."""
    skills = dict(find_weighted(text, defaults.DEFAULT_SKILLS))
    return ResumeSignals(
        skills=skills,
        role_keywords=_detect_role_keywords(skills),
        seniority=_detect_seniority(text),
    )


def _detect_role_keywords(skills: dict[str, float]) -> tuple[str, ...]:
    """A role preset is suggested once at least half its skill list (rounded
    down, minimum 1) was found in the CV."""
    detected = []
    for role, preset_skills in defaults.ROLE_PRESETS.items():
        threshold = max(1, len(preset_skills) // 2)
        matched = sum(1 for skill in preset_skills if skill in skills)
        if matched >= threshold:
            detected.append(role)
    return tuple(detected)


def _detect_seniority(text: str) -> str:
    for tier, terms in _SENIORITY_LADDER:
        if find_terms(text, terms):
            return tier
    return "unknown"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T web pytest tests/test_resume_parsing.py -v`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/resumes/parsing.py backend/tests/test_resume_parsing.py
git commit -m "feat: extract skills, role focus and seniority from resume text"
```

---

### Task 3: `apply_seniority` — re-bucket level weights by the candidate's own tier

**Files:**
- Modify: `backend/scoring/defaults.py`
- Test: `backend/tests/test_scoring_defaults.py` (create if it doesn't already exist — check first with `Read`; if it exists, add a new test class rather than replacing the file)

**Interfaces:**
- Consumes: nothing new.
- Produces: `apply_seniority(level_bonus: dict[str, float], level_penalty: dict[str, float], seniority: str) -> tuple[dict[str, float], dict[str, float]]`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_scoring_defaults.py
from __future__ import annotations

from scoring.defaults import DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, apply_seniority


class TestApplySeniority:
    def test_unknown_seniority_is_a_no_op(self):
        bonus, penalty = apply_seniority(DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, "unknown")
        assert bonus == DEFAULT_LEVEL_BONUS
        assert penalty == DEFAULT_LEVEL_PENALTY

    def test_lead_candidate_is_not_penalised_for_senior_or_lead_titles(self):
        bonus, penalty = apply_seniority(DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, "lead")
        assert bonus["senior"] == 1.0
        assert bonus["lead"] == 1.0
        assert "senior" not in penalty
        assert "lead" not in penalty

    def test_junior_candidate_is_heavily_penalised_for_lead_titles(self):
        bonus, penalty = apply_seniority(DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, "junior")
        assert penalty["lead"] < 0.2
        assert bonus["junior"] == 1.0

    def test_a_term_further_above_the_candidates_tier_is_penalised_more(self):
        _, penalty = apply_seniority(DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, "junior")
        assert penalty["lead"] < penalty["senior"]

    def test_terms_outside_the_ladder_are_left_exactly_where_they_were(self):
        bonus, penalty = apply_seniority(DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, "senior")
        # "specialist"/"consultant" describe a different job family, not a
        # seniority tier — apply_seniority must not touch them.
        assert penalty["specialist"] == DEFAULT_LEVEL_PENALTY["specialist"]
        assert penalty["consultant"] == DEFAULT_LEVEL_PENALTY["consultant"]

    def test_returns_new_dicts_not_the_originals(self):
        bonus, penalty = apply_seniority(DEFAULT_LEVEL_BONUS, DEFAULT_LEVEL_PENALTY, "senior")
        bonus["junior"] = -1
        assert DEFAULT_LEVEL_BONUS["junior"] == 1.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T web pytest tests/test_scoring_defaults.py -v`
Expected: FAIL with `ImportError: cannot import name 'apply_seniority'`

- [ ] **Step 3: Implement**

In `backend/scoring/defaults.py`, add after `apply_role_keywords` (after its closing `return boosted` at line 199):

```python
#: A candidate's own tier, for comparing against a job title's signal.
SENIORITY_ORDER: dict[str, int] = {"junior": 0, "mid": 1, "senior": 2, "lead": 3}

#: Which DEFAULT_LEVEL_BONUS/PENALTY terms represent which tier on the
#: candidate's own ladder. Deliberately partial: "specialist" and
#: "consultant" describe a different job family rather than a seniority
#: level (see DEVIATIONS.md #11), so they are absent here and therefore
#: untouched by `apply_seniority` no matter the candidate's tier.
LEVEL_TERM_TIERS: dict[str, int] = {
    "junior": 0, "jr": 0, "entry": 0, "fresh": 0, "fresher": 0,
    "associate": 0, "graduate": 0, "trainee": 0, "apprentice": 0, "intern": 0,
    "senior": 2, "sr": 2, "expert": 2, "manager": 2,
    "lead": 3, "principal": 3, "staff": 3, "architect": 3,
    "head of": 3, "director": 3, "vp": 3, "chief": 3,
}


def apply_seniority(
    level_bonus: dict[str, float], level_penalty: dict[str, float], seniority: str
) -> tuple[dict[str, float], dict[str, float]]:
    """Re-bucket every ladder term relative to the candidate's own tier.

    A term at or below the candidate's tier moves into (or stays in)
    `level_bonus` at full weight — those titles are squarely within reach. A
    term above it moves into `level_penalty`, halved for every tier of
    distance, so a Lead candidate is not penalised at all for "Senior" but a
    Junior candidate is heavily penalised for "Lead". `seniority="unknown"`
    (or anything not in `SENIORITY_ORDER`) changes nothing — the tables the
    defaults already assume a junior searcher (DEVIATIONS.md #5) stay as-is.
    """
    candidate_tier = SENIORITY_ORDER.get(seniority)
    if candidate_tier is None:
        return dict(level_bonus), dict(level_penalty)

    new_bonus: dict[str, float] = {}
    new_penalty: dict[str, float] = {}
    for term, weight in {**level_bonus, **level_penalty}.items():
        term_tier = LEVEL_TERM_TIERS.get(term)
        if term_tier is None:
            (new_bonus if term in level_bonus else new_penalty)[term] = weight
        elif term_tier <= candidate_tier:
            new_bonus[term] = 1.0
        else:
            new_penalty[term] = 0.5 ** (term_tier - candidate_tier)

    return new_bonus, new_penalty
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T web pytest tests/test_scoring_defaults.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/scoring/defaults.py backend/tests/test_scoring_defaults.py
git commit -m "feat: add apply_seniority to re-bucket level weights by candidate tier"
```

---

### Task 4: Resume API — upload, read, delete, and the one-time profile merge

**Files:**
- Create: `backend/resumes/serializers.py`, `backend/resumes/views.py`, `backend/resumes/urls.py`
- Modify: `backend/config/urls.py`
- Test: `backend/tests/test_resume_api.py`

**Interfaces:**
- Consumes: `Resume`, `resume_upload_path` (Task 1); `ParseError`, `extract_text`, `extract_signals` (Task 2); `apply_seniority` (Task 3); `users.models.Profile`.
- Produces: `POST/GET/DELETE /api/resume/`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_resume_api.py
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
            "/api/resume/", {"file": _docx_upload("cv2.docx", ["Python Django"])}, format="multipart"
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
        upload = SimpleUploadedFile("cv.pdf", b"%PDF-1.4 not really a pdf", content_type="application/pdf")

        response = client.post("/api/resume/", {"file": upload}, format="multipart")

        assert response.status_code == 400
        assert not Resume.objects.exists()

    def test_requires_authentication(self, api_client: APIClient):
        upload = _docx_upload("cv.docx", ["React"])
        assert api_client.post("/api/resume/", {"file": upload}, format="multipart").status_code == 401


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T web pytest tests/test_resume_api.py -v`
Expected: FAIL — `Page not found` / `ImportError` (no urls/views yet).

- [ ] **Step 3: Implement the serializers**

```python
# backend/resumes/serializers.py
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
```

- [ ] **Step 4: Implement the view**

```python
# backend/resumes/views.py
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
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from resumes.models import Resume
from resumes.parsing import ParseError, extract_signals, extract_text
from resumes.serializers import ResumeSerializer, ResumeUploadSerializer
from scoring import defaults
from users.models import Profile


def _user(request: Request) -> Any:
    return request.user


class ResumeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: ResumeSerializer, 404: None}, operation_id="resume_get")
    def get(self, request: Request) -> Response:
        resume = Resume.objects.filter(user=_user(request)).first()
        if resume is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(ResumeSerializer(resume).data)

    @extend_schema(
        request=ResumeUploadSerializer, responses={201: ResumeSerializer}, operation_id="resume_upload"
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
            # The queryset delete below would drop the row but never the
            # underlying file — Django does not do that automatically.
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


def _apply_to_profile(user: Any, signals: Any) -> None:
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
```

- [ ] **Step 5: Wire the URL**

`backend/resumes/urls.py`:

```python
from django.urls import path

from resumes.views import ResumeView

urlpatterns = [
    path("resume/", ResumeView.as_view(), name="resume"),
]
```

In `backend/config/urls.py`, add after `path("api/", include("jobs.urls")),`:

```python
    path("api/", include("resumes.urls")),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T web pytest tests/test_resume_api.py -v`
Expected: PASS (11 tests)

- [ ] **Step 7: Regenerate the OpenAPI contract**

Run: `make gen-schema && make gen-client`

Verify `git diff contracts/jobradar-v1.json` shows the new `/resume/` paths and `frontend/src/api/schema.d.ts` reflects them.

- [ ] **Step 8: Commit**

```bash
git add backend/resumes/serializers.py backend/resumes/views.py backend/resumes/urls.py backend/config/urls.py backend/tests/test_resume_api.py contracts/jobradar-v1.json frontend/src/api/schema.d.ts
git commit -m "feat: add resume upload/read/delete API with one-time profile merge"
```

---

### Task 5: Frontend API layer — FormData support, resume types/queries, mock server

**Files:**
- Modify: `frontend/src/api/client.ts`, `frontend/src/api/types.ts`, `frontend/src/api/queries.ts`, `frontend/src/test/server.ts`

**Interfaces:**
- Produces: `request()` accepts a `FormData` body without JSON-encoding it; `ResumeSignals` type; `useUploadResume()`, `useResume()`, `useDeleteResume()`.

- [ ] **Step 1: Extend the API client for file uploads**

In `frontend/src/api/client.ts`, inside `request()`'s `send` closure, change:

```typescript
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (accessToken && !anonymous) headers.Authorization = `Bearer ${accessToken}`
```

to:

```typescript
    const isFormData = body instanceof FormData
    const headers: Record<string, string> = { Accept: 'application/json' }
    // A FormData body sets its own multipart boundary; declaring
    // Content-Type by hand here would omit that boundary and break parsing.
    if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json'
    if (accessToken && !anonymous) headers.Authorization = `Bearer ${accessToken}`
```

and change:

```typescript
    if (body !== undefined) init.body = JSON.stringify(body)
```

to:

```typescript
    if (body !== undefined) init.body = isFormData ? body : JSON.stringify(body)
```

- [ ] **Step 2: Add the `ResumeSignals` type**

In `frontend/src/api/types.ts`, add after the `StatusEvent` interface:

```typescript
export type Seniority = 'junior' | 'mid' | 'senior' | 'lead' | 'unknown'

export interface ResumeSignals {
  detectedSkills: Record<string, number>
  detectedRoleKeywords: string[]
  detectedSeniority: Seniority
  uploadedAt: string
  parsedAt: string | null
}
```

- [ ] **Step 3: Add the query hooks**

In `frontend/src/api/queries.ts`, add `ResumeSignals` to the `import type { ... } from './types'` block, add to `queryKeys` (after `sources: ...`):

```typescript
  sources: () => ['sources'] as const,
  resume: () => ['resume'] as const,
```

Add after `useUpdateProfile`:

```typescript
export function useResume(): UseQueryResult<ResumeSignals | null> {
  return useQuery({
    queryKey: queryKeys.resume(),
    queryFn: async () => {
      try {
        return await api.get<ResumeSignals>('/resume/')
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  })
}

export function useUploadResume(): UseMutationResult<ResumeSignals, Error, File> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file) => {
      const form = new FormData()
      form.append('file', file)
      return api.post<ResumeSignals>('/resume/', form)
    },
    onSuccess: (signals) => {
      queryClient.setQueryData(queryKeys.resume(), signals)
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile() })
    },
  })
}

export function useDeleteResume(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.delete<void>('/resume/'),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.resume(), null)
    },
  })
}
```

Add `ApiError` to the `import { api } from './client'` line (change to `import { api, ApiError } from './client'`).

- [ ] **Step 4: Extend the mock server**

In `frontend/src/test/server.ts`, add to `MockState` (after `statusHistory: ...`):

```typescript
  statusHistory: Record<number, { fromStatus: string; toStatus: string; changedAt: string }[]>
  resume: {
    detectedSkills: Record<string, number>
    detectedRoleKeywords: string[]
    detectedSeniority: string
    uploadedAt: string
    parsedAt: string | null
  } | null
```

Initialise in `createState()` (after `statusHistory: {},`):

```typescript
    statusHistory: {},
    resume: null,
```

Add handlers after the `status_history` handler:

```typescript
  http.get(`${API}/resume/`, ({ request }) => {
    if (!authed(request)) return unauthorized()
    return state.resume ? HttpResponse.json(state.resume) : HttpResponse.json({}, { status: 404 })
  }),

  http.post(`${API}/resume/`, ({ request }) => {
    if (!authed(request)) return unauthorized()
    state.resume = {
      detectedSkills: { react: 6, typescript: 4 },
      detectedRoleKeywords: ['react'],
      detectedSeniority: 'senior',
      uploadedAt: '2026-08-26T09:00:00Z',
      parsedAt: '2026-08-26T09:00:00Z',
    }
    return HttpResponse.json(state.resume, { status: 201 })
  }),

  http.delete(`${API}/resume/`, ({ request }) => {
    if (!authed(request)) return unauthorized()
    if (!state.resume) return HttpResponse.json({}, { status: 404 })
    state.resume = null
    return new HttpResponse(null, { status: 204 })
  }),
```

- [ ] **Step 5: Verify nothing broke**

Run: `cd frontend && npm run typecheck && npm run test -- --run`
Expected: PASS — no new test exercises these yet; this only confirms the plumbing compiles and nothing existing regressed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/api/types.ts frontend/src/api/queries.ts frontend/src/test/server.ts
git commit -m "feat: add resume upload API client support"
```

---

### Task 6: Onboarding Step 1 — Upload your CV

**Files:**
- Modify: `frontend/src/routes/Welcome.tsx`, `frontend/src/routes/Welcome.test.tsx`

**Interfaces:**
- Consumes: `useUploadResume` (Task 5).
- Produces: onboarding renumbered to 4 steps (`CV`, `Cities`, `Focus`, `Done`); `roles` state pre-seeded from the upload response.

- [ ] **Step 1: Update the shared test helper so existing tests are unaffected**

In `frontend/src/routes/Welcome.test.tsx`, replace `startOnboarding`:

```typescript
async function startOnboarding() {
  state.refreshValid = true
  state.user.onboardingComplete = false
  renderWithProviders(<App />, { route: '/welcome' })
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: /upload your cv/i })
  await user.click(screen.getByRole('button', { name: /skip for now/i }))
  await screen.findByRole('heading', { name: /where do you want to work/i })
  return user
}
```

This is the only change existing tests need — every other test in the file keeps working unchanged, since they all start from `startOnboarding()`.

- [ ] **Step 2: Write the failing tests for the new step**

Add a new `describe` block to `Welcome.test.tsx`:

```typescript
describe('CV upload step', () => {
  beforeEach(() => {
    state.refreshValid = true
    state.user.onboardingComplete = false
  })

  it('is the first screen', async () => {
    renderWithProviders(<App />, { route: '/welcome' })

    expect(await screen.findByRole('heading', { name: /upload your cv/i })).toBeInTheDocument()
  })

  it('uploading pre-checks the detected role and advances', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/welcome' })

    const input = await screen.findByLabelText(/upload your cv/i)
    await user.upload(input, new File(['fake pdf bytes'], 'cv.pdf', { type: 'application/pdf' }))

    await screen.findByText(/react/i)
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await screen.findByRole('heading', { name: /where do you want to work/i })
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('heading', { name: /what do you build/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /react/i })).toBeChecked()
  })

  it('can be skipped', async () => {
    const user = userEvent.setup()
    renderWithProviders(<App />, { route: '/welcome' })

    await user.click(await screen.findByRole('button', { name: /skip for now/i }))

    expect(
      await screen.findByRole('heading', { name: /where do you want to work/i }),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npm run test -- --run Welcome`
Expected: FAIL — "Upload your CV" heading does not exist yet; every existing test also fails now because `startOnboarding` looks for a heading that isn't there.

- [ ] **Step 4: Implement the new step**

In `frontend/src/routes/Welcome.tsx`:

Change the imports (add `useUploadResume` and `ResumeSignals`):

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api } from '../api/client'
import { useUploadResume } from '../api/queries'
import { ROLE_KEYWORDS, type Location, type Profile, type User } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { AuthLayout } from '../components/AuthLayout'
import { IconCheck, IconMapPin, IconRadar } from '../components/icons'
import { Button, Chip, Skeleton, cx } from '../components/ui'
```

Change `STEPS`, `Step`, and the initial `step` state:

```typescript
const STEPS = ['CV', 'Cities', 'Focus', 'Done'] as const

type Step = 1 | 2 | 3 | 4
```

```typescript
  const [step, setStep] = useState<Step>(1)
```

Add resume upload state and mutation, right after the `roles` state:

```typescript
  const [roles, setRoles] = useState<string[]>([])
  const uploadResume = useUploadResume()
```

Update `titles`/`subtitles` to cover 4 steps:

```typescript
  const titles: Record<Step, string> = {
    1: 'Upload your CV',
    2: 'Where do you want to work?',
    3: 'What do you build?',
    4: "You're set up",
  }

  const subtitles: Record<Step, string> = {
    1: "Optional. We'll pre-fill your skills and focus from it — nothing is sent anywhere but your own profile.",
    2: 'This decides which jobs reach you and how they score. Change it any time.',
    3: 'Picking a few raises the weight of the matching skills. Optional — you can tune every weight individually later.',
    4: 'Your profile is saved and the first run is under way.',
  }
```

Add the new Step 1 block, right after `<Progress current={step} />` and before the existing `{step === 1 && (` cities block — **renumber that block and the "Focus"/"Done" blocks to `step === 2`, `step === 3`, `step === 4`** (mechanical rename, keeping their JSX bodies otherwise identical, including `setStep(1)`→`setStep(2)`, `setStep(2)`→`setStep(3)` inside them, and the final `goToStep3`→`goToStep4` rename described below):

```tsx
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <label htmlFor="resume-upload" className="text-sm font-medium">
                Upload your CV
              </label>
              <input
                id="resume-upload"
                type="file"
                accept=".pdf,.docx"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  uploadResume.mutate(file, {
                    onSuccess: (signals: ResumeSignals) => {
                      setRoles((current) => [...new Set([...current, ...signals.detectedRoleKeywords])])
                    },
                  })
                }}
                className="w-full rounded border border-hairline-strong bg-surface-inset p-3.5 text-sm"
              />

              {uploadResume.isPending && <p className="text-sm text-muted">Reading your CV…</p>}
              {uploadResume.isError && (
                <p role="alert" className="text-sm text-danger">
                  Could not read that file — PDF and DOCX only, up to 5MB.
                </p>
              )}
              {uploadResume.isSuccess && (
                <p aria-live="polite" className="text-sm text-muted">
                  Found:{' '}
                  <strong className="font-bold text-fg">
                    {Object.keys(uploadResume.data.detectedSkills).join(', ') || 'no specific skills'}
                  </strong>
                  {uploadResume.data.detectedSeniority !== 'unknown' &&
                    ` · ${uploadResume.data.detectedSeniority}`}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-hairline pt-4">
                <Button size="lg" onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            </div>
          )}
```

Add the `ResumeSignals` type import alongside the others:

```typescript
import { ROLE_KEYWORDS, type Location, type Profile, type ResumeSignals, type User } from '../api/types'
```

Rename `goToStep3` to `goToStep4` and update its body (`setStep(3)` → `setStep(4)`); update its call site (`onClick={() => void goToStep3()}` → `goToStep4`) in the renumbered Focus step. Update the `{step < 3 &&` skip-link condition to `{step < 4 &&`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm run test -- --run Welcome`
Expected: PASS (all existing tests + 3 new ones)

- [ ] **Step 6: Run the full frontend suite, typecheck, and lint**

Run: `cd frontend && npm run typecheck && npm run test -- --run && npm run lint && npm run format:check`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/Welcome.tsx frontend/src/routes/Welcome.test.tsx
git commit -m "feat: add CV upload as the first onboarding step"
```

---

## Verification (end to end)

1. Backend suite: `docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T web pytest` — all tests pass.
2. Backend lint/types: `make lint-backend`.
3. Frontend suite + types + lint: as in Task 6 Step 6.
4. Contract drift check: `make gen-schema && git diff --exit-code contracts/jobradar-v1.json`.
5. **The one rebuild, at the end, per `build-once-at-the-end`:** `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d` (picks up the new `pypdf`/`python-docx` dependencies baked into the image, and the new `media` volume).
6. Manual smoke test against the running stack:
   - Register a new user, land on `/welcome`, confirm "Upload your CV" is the first screen.
   - Upload a real PDF or DOCX resume with a few recognisable skills (e.g. mentioning "React", "TypeScript", "Senior").
   - Confirm the detected-skills summary appears, continue to Cities → confirm the "React" chip is pre-checked on the Focus step.
   - Finish onboarding, open Profile settings, confirm `react`/`typescript` weights are present and `level_bonus`/`level_penalty` reflect the detected seniority.
   - Re-upload a different CV for the same user; confirm `docker compose exec web python manage.py shell -c "from resumes.models import Resume; print(Resume.objects.filter(user__email='...').count())"` reports exactly 1.
   - Confirm `GET /api/resume/` for a user with no upload returns 404, and that `DELETE /api/resume/` removes it.
