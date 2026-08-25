# CV-Driven Profile Design

## Context

JobRadar's scoring is per-user but every profile field (skills, role focus,
seniority weighting) is filled in by hand during onboarding — a three-step
wizard (`frontend/src/routes/Welcome.tsx`) where the user picks cities, then
optionally checks a few role chips (`dotnet`, `react`, `angular`, `python`,
`qa`, `devops`, `ai_ml`) that boost matching skill weights.

The request driving this change: let a user upload their CV right after
signup, extract skills/role/seniority from it automatically, and use that to
pre-fill the same onboarding fields — so a new user gets a working, personally
weighted profile without hand-picking chips or knowing the tool's vocabulary.
The user explicitly wants extraction to stay **non-AI**, consistent with the
project's existing philosophy ("Scoring is transparent keyword weighting
against a profile you control. It is not AI, and that is the point." —
README). Fetching itself does not need to change: `jobs/runner.py`'s
`expand_location_sources` already dedupes scraped sources by `(query, city)`
across every user's private + shared `Source` rows, so a user-specific jobspy
query is already fetchable today — the missing piece is entirely "CV → the
same fields onboarding already collects."

## Goals

- Upload a CV (PDF or DOCX) and extract, using the *same* keyword-matching
  primitives job scoring already uses:
  - Skills + weights (`scoring.text.find_weighted` against
    `scoring.defaults.DEFAULT_SKILLS`)
  - A role focus, expressed as the same `ROLE_PRESETS` keys the onboarding
    chips already use
  - A seniority tier (junior/mid/senior/lead), used to reweight
    `level_bonus`/`level_penalty` so a senior candidate is not penalised for
    senior-titled roles
- Pre-fill onboarding Step 2's existing chips and the profile save payload
  from these signals — the user reviews/edits before anything is committed.
- One CV per user; re-uploading replaces the previous file and its extracted
  signals.
- Skipping CV upload leaves today's onboarding flow completely unchanged.

## Non-goals

- No AI/LLM-based extraction of any kind.
- No multi-CV history, no CV version list.
- No change to *what* gets fetched (the run/source pipeline is untouched) —
  this is entirely about how a `Profile` gets populated.
- No location extraction from the CV — city selection stays manual (Step 1),
  per the user's decision.
- No public file serving — see Security below.

## Data model

New Django app `resumes/`, alongside the existing `users`/`jobs`/`scoring`/
`sources`/`notifications` apps.

```python
class SeniorityTier(models.TextChoices):
    JUNIOR = "junior", "Junior"
    MID = "mid", "Mid"
    SENIOR = "senior", "Senior"
    LEAD = "lead", "Lead"
    UNKNOWN = "unknown", "Unknown"


class Resume(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="resume")
    file = models.FileField(upload_to=resume_upload_path)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)

    extracted_text = models.TextField(blank=True)
    detected_skills = models.JSONField(default=dict)          # keyword -> weight
    detected_role_keywords = models.JSONField(default=list)    # ROLE_PRESETS keys
    detected_seniority = models.CharField(max_length=16, choices=SeniorityTier.choices, default=SeniorityTier.UNKNOWN)

    uploaded_at = models.DateTimeField(auto_now_add=True)
    parsed_at = models.DateTimeField(null=True, blank=True)
```

`resume_upload_path(instance, filename)` returns a path keyed by user id
(e.g. `resumes/{user_id}/{filename}`), not by any guessable sequential id.

**Storage:** `MEDIA_ROOT`/`MEDIA_URL` added to Django settings; a new `media`
named volume mounted into the `web` service in `docker-compose.yml` (parsing
happens synchronously inside the `web` request, so only `web` touches it —
`worker`/`beat` never need the file).

**New dependencies:** `pypdf` (PDF text extraction) and `python-docx` (DOCX
text extraction), added to `backend/pyproject.toml`'s main dependencies.

## Extraction pipeline

`resumes/parsing.py` — pure functions, no Django imports, mirroring the
`scoring/` package's existing "framework-free domain logic" convention so it
is unit-testable without a database:

```python
def extract_text(data: bytes, content_type: str) -> str:
    """Dispatches to pypdf or python-docx by content_type. Raises ParseError
    on anything unreadable (corrupt file, password-protected PDF, empty)."""

@dataclass(frozen=True)
class ResumeSignals:
    skills: dict[str, float]
    role_keywords: tuple[str, ...]
    seniority: str  # a SeniorityTier value, as a plain string

def extract_signals(text: str) -> ResumeSignals:
    """Reuses scoring.text.find_weighted(text, DEFAULT_SKILLS) for skills.
    A role preset is suggested when at least half its skill list (rounded
    down, minimum 1) is present in `skills`. Seniority is the highest-ranked
    term found by scoring.text.find_terms against a fixed tier ladder built
    from DEFAULT_LEVEL_BONUS/DEFAULT_LEVEL_PENALTY (lead > senior > mid >
    junior), defaulting to "unknown" when nothing matches."""
```

`ParseError` is a plain exception the API layer catches and turns into a 400.

## Seniority-driven weight adjustment

New pure function in `scoring/defaults.py` (beside `apply_role_keywords`,
same style):

```python
def apply_seniority(
    level_bonus: dict[str, float], level_penalty: dict[str, float], seniority: str
) -> tuple[dict[str, float], dict[str, float]]:
    """Re-buckets every default level term by the candidate's own tier: terms
    at or below the detected tier move into (or stay in) level_bonus at full
    weight; terms above it move into (or stay in) level_penalty. A junior
    candidate's defaults are the tables unchanged (the ladder already assumes
    a junior searcher, per DEVIATIONS.md #5); "unknown" is a no-op."""
```

This is called once, from the onboarding save path, with the user's already
editable `level_bonus`/`level_penalty` — it never runs again automatically,
so a user who tunes these by hand afterwards is never silently overwritten.

## API

All under `IsAuthenticated`, scoped to `request.user` exactly like every
other endpoint in this codebase (`jobs/views.py`'s `_user()` pattern).

| Endpoint | Behaviour |
|---|---|
| `POST /api/resume/` | Multipart upload. Extracts text + signals synchronously, `update_or_create`s the `Resume` row (replacing any prior upload — file and DB row both), returns `{skills, roleKeywords, seniority}`. Never touches `Profile`. |
| `GET /api/resume/` | Current resume's detected signals (for onboarding to re-show if the user navigates back), 404 if none. |
| `DELETE /api/resume/` | Deletes the file and row. |

Applying signals to the profile is **not** a new endpoint. The frontend keeps
sending exactly the `PATCH /profile/` payload it sends today
(`locationsAllowed`, `locationsPreferred`, `roleKeywords`). Server-side, the
existing profile-update handling checks whether the requesting user has a
`Resume` row; if so, it folds the resume's `detected_skills` and
`apply_seniority()`-adjusted `level_bonus`/`level_penalty` into the same
`seed_defaults`-style computation that already runs from `role_keywords`
alone. No new field travels over the wire — the merge is driven entirely by
"does this user have a `Resume`", which is exactly why re-upload-replaces
(rather than versioned history) keeps this simple: at most one row to check.

The requirement for the implementation plan: **skill/seniority merging must
be pure and testable without Django**, living in `scoring/` (next to
`apply_role_keywords`), not duplicated inline in the view.

## Onboarding UX

New Step 0, "Upload your CV" — before Cities, always skippable:

- File picker, `.pdf`/`.docx` only, client-side extension check before upload.
- On success: shows the detected skills (as read-only chips/tags), the
  suggested role focus, and the detected seniority as a short summary line —
  "We found: React, TypeScript, Node.js · Senior".
- Step 2 ("What do you build?") pre-checks `detected_role_keywords` chips;
  everything about Step 2 stays otherwise identical, including the ability to
  add/remove chips.
- Confirming (Step 2 → Step 3) sends the same `PATCH /profile/` shape as
  today; the backend now folds in the resume's `detected_skills` (merged
  additively with the role-keyword-boosted defaults, resume weights winning
  on overlap) and the seniority-adjusted `level_bonus`/`level_penalty` when a
  `Resume` row exists for that user.
- Skipping Step 0 (or never uploading) leaves today's flow byte-for-byte
  unchanged — no `Resume` row means no adjustment happens anywhere.

## Security

- The uploaded file is personal data. It is **never** exposed via a public
  `MEDIA_URL` static path. `GET`/`DELETE /api/resume/` are the only ways to
  reach it, both scoped to `request.user`; there is no "download original
  file" endpoint in this first cut (the extracted signals are enough for the
  UI — downloading the raw file back can be a later addition if asked for).
- `resume_upload_path` keys storage by user id, not a public/incrementing
  resume id, so a leaked media path alone doesn't enumerate other users' CVs.
- File size capped (5 MB) at the serializer, before any parsing is attempted.
- A parse failure never leaves a half-written `Resume` row — extraction
  happens before any database write.

## Error handling

| Case | Result |
|---|---|
| Unsupported file type | 400, nothing saved |
| Corrupt / password-protected PDF | 400 (`ParseError` caught), nothing saved |
| File over 5 MB | 400 at the serializer, parsing never runs |
| Parse succeeds, zero skills/role/seniority found | 200, `Resume` saved with empty signal fields — onboarding just shows nothing pre-checked, not an error |
| Re-upload | Old file deleted, old row replaced (not a new row) |

## Testing

- `resumes/parsing.py`: pure unit tests against known extracted text (and a
  couple of small real PDF/DOCX fixtures) — asserts skills/role/seniority
  detected, mirroring `scoring/`'s existing test style (no DB, no client).
- `scoring/defaults.py::apply_seniority`: pure unit tests per tier, including
  "unknown" as a no-op and the junior-defaults-unchanged case.
- API tests (`backend/tests/test_resume.py`): upload → 201 + signals; re-upload
  replaces; GET/DELETE 404/scoped correctly for another user's non-existent
  row; oversized/unsupported file → 400; corrupt PDF → 400.
- Onboarding integration test extension (`Welcome.test.tsx`): CV upload step
  pre-checks the right chips from a mocked `POST /api/resume/` response; skip
  path still reaches Step 3 unchanged; PATCH `/profile/` payload includes the
  merged skills when a resume was uploaded.

## Open questions for the implementation plan

- Exact half-of-preset-skills threshold for suggesting a role chip — needs a
  concrete example-driven test to pin down (e.g. `react` preset has 4 skills;
  "at least 2 found" suggests it).
- Whether `python-docx`/`pypdf` need to go in the `scrape` extra or as a base
  dependency — likely base, since every user may upload a CV regardless of
  whether scraping is enabled.
