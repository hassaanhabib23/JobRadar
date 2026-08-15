# Deviations from the specification

Every departure from `PROMPT.md`, with the reasoning. Nothing here is a
preference — each is a place where the spec as written cannot be implemented, or
contradicts itself.

## 1. `UserJob` partial index cannot reference a joined field

**Spec (§8):** index `(user, -score)` partial on `job__closed_at IS NULL`.

**Problem:** Django forbids joined references inside an `Index` condition. This is
a hard error at `makemigrations` time, not a performance nit — the condition must
resolve against columns on the model's own table, and `job__closed_at` lives on
another one.

**Resolution:** denormalise `is_open = BooleanField()` onto `UserJob`, maintained
by the run whenever a `Job` opens or closes, and make the partial index condition
`Q(is_open=True)`. Same hot query, same index benefit, and the run already writes
every affected `UserJob` row so keeping it in step costs nothing.

*Status: to be applied in milestone 4, when the models are created.*

## 2. `Job` has no `score` column to index

**Spec (§2):** create `Index(fields=["-score"], condition=Q(closed_at__isnull=True),
name="job_open_by_score")` — on `Job`.

**Spec (§8):** `Job` has "**No score, no status, no user FK** — those are not
properties of a posting."

**Problem:** the two are directly incompatible, and §8 is the load-bearing one:
score is per-user by design, which is the central decision of the whole schema.

**Resolution:** the score partial index moves to `UserJob` (see deviation 1),
where the score actually lives. `Job` gets a partial index on `(-last_seen)`
conditioned on `closed_at IS NULL` instead, which serves the run's
open-jobs sweep.

*Status: to be applied in milestone 4.*

## 3. `bulk_create(update_conflicts=True)` cannot express `COALESCE`

**Spec (§2):** use native upsert, and "never overwrite a known `posted_at` with an
empty one — handle that with `COALESCE`-style logic".

**Problem:** Django's `update_fields` argument takes column names, not
expressions. There is no supported way to emit
`SET posted_at = COALESCE(EXCLUDED.posted_at, jobs_job.posted_at)` through it.

**Resolution:** exclude `posted_at` from the upsert's `update_fields` entirely,
then follow the upsert with a single targeted statement that only fills blanks:

```sql
UPDATE jobs_job SET posted_at = %s WHERE key = %s AND posted_at IS NULL
```

batched across the run. Still two statements per run rather than per job, and the
§12 test ("a known `posted_at` is not overwritten by a later empty one") applies
unchanged.

*Status: to be applied in milestone 6.*

## 4. Dashboard route is `/app`, not `/`

**Spec (§9):** the routing table says `/app` and `/app/jobs/:id`; the prose lower
in the same section labels the dashboard `/` and detail `/jobs/:id`.

**Resolution:** the table is canonical. `/` is the public landing page, which is
what the rest of §9, FR21 and acceptance criteria 11–12 all require.

## 5. Seniority: a penalty outranks a bonus

**Spec (§4):** "check title against `level_bonus`, then `level_penalty`; multiply
25 by the matched multiplier."

**Problem:** it does not say which wins when a title carries both. "Senior
Associate Engineer" matches `associate` (0.95) and `senior` (0.35). Taking the
bonus would score it as an entry-level opening.

**Resolution:** the penalty wins. Among several matches on the same side the
strongest signal wins — lowest penalty, highest bonus. For someone hunting junior
roles the conservative reading is the useful one.

*Applied in `scoring/scorer.py::_score_level`.*

## 6. The ghost ceiling is held strictly below the undated score

**Spec (§4):** flag `ghost?` and "floor freshness at `freshness.ghost_points`",
plus the standing rule "a ghost must never out-score a merely undated posting".

**Problem:** with the defaults (`ghost_points` 1, `unknown_date_points` 4) those
two agree. Nothing stops a profile from setting `ghost_points` to 9, which
inverts the exact ordering the rule exists to create — and profiles are
user-editable, so this is reachable without touching code.

**Resolution:** the ceiling is `min(ghost_points, unknown_date_points - 1)`, so
the invariant holds for every profile rather than only the default one. There is
a test for the misconfigured case.

## 7. Company names also fall back when they normalise to empty

**Spec (§5):** the empty-normalisation fallback is specified for titles only.

**Problem:** the identical hazard exists for companies. Every word of "Systems
Limited" is on the suffix strip-list, so it normalises to `""` — and it is a real
Pakistani employer already on the milestone 5 candidate list. Any two all-suffix
company names would share the key `("", title)` and wrongly merge.

**Resolution:** apply the same fallback to company names.

## 8. A non-selectable `pakistan` location

**Spec (§10):** the picker lists twelve cities, none of which is "Pakistan" — but
the default profile in the same section sets `locations_secondary` to
`[pakistan]`.

**Resolution:** the catalogue carries a `pakistan` entry marked
`selectable=False`. It is available to profiles and to location matching, and
`GET /api/locations/` will not offer it in the onboarding picker.

## 9. `evaluate_job` alongside `score_job`

**Spec (§4):** `score_job(posting, profile) -> ScoreResult | None` — "`None`
means filtered out, paired with a reason."

**Problem:** `None` cannot carry a reason.

**Resolution:** `score_job` keeps exactly the specified signature and behaviour.
`evaluate_job` is the same computation returning a `ScoreOutcome` that holds
either the result or the rejection reason, which is what the run logs and the
"why is this job missing?" question need. No duplicated logic — `score_job` is a
one-line wrapper.

## 10. Greenhouse is fetched with `content=true`, not `content=false`

**Spec (§3):** `GET .../boards/{slug}/jobs?content=false`.

**Problem:** measured live against Careem's board, `content=false` returns 24
jobs in 38 KB with **zero** descriptions. The stack component is 40 of the 100
available points and is scored over "title + location + description" (§4). With
no description it has only the title, and in a real end-to-end run 23 of 24
postings scored `stack: 0` and landed in Stretch.

`content=true` returns the same 24 jobs, in the same **single** request, at
216 KB — with all 24 descriptions. Re-running the same two users afterwards moved
the top result from 36 to 51 and 47, with `c#`, `docker` and `backend` actually
matching.

**Resolution:** descriptions are fetched by default. Any source can opt out with
`{"content": false}` in its config if a particular board is unusually large. One
request per board either way, so NFR12 is unaffected.

## 11. A default `title_blocklist`, where the specification gives none

**Spec:** FR5 requires dropping postings that fail hard rules, naming
"non-engineering title" explicitly. Section 10's default profile lists skills,
level weights and freshness knobs — but no blocklist.

**Problem:** with an empty blocklist, a live run across 14 real boards put
"Associate — Project Sales" and "Associate People Business Partner" near the top
of a .NET developer's list, both scoring ~49 on the entry-level bonus alone with
zero skill matches. The entry-level bonus rewards the word "Associate" wherever
it appears.

**Resolution:** a conservative default blocklist of titles that are
unambiguously a different profession. Deliberately narrow: "analyst",
"consultant" and "specialist" are left out because they are already penalised by
seniority weighting and sometimes describe engineering work, and bare "sales" is
avoided because it would drop "Sales Engineer" and "Solution Engineer
(Pre-Sales)". Fully editable per user.

## 12. Reconciliation merges locations rather than keeping only the winner's

**Spec (§5):** the highest-authority source wins, inheriting a date from
siblings.

**Problem:** title normalisation strips city names, so "Software Engineer —
Karachi" and "Software Engineer — Islamabad" are one group. Keeping only the
winner's location silently deletes the other city, and a user who selected only
that city would never see the role at all. In a live run this affected 182 jobs.

**Resolution:** the merged posting carries the union of every location in its
group, de-duplicated. This is the same principle the specification already
applies to Lever's `allLocations`.

## 13. Closed-detection is scoped by feed, not by source kind

**Spec (§6):** "Scope closures to sources that **succeeded**, so a network
failure never mass-closes a healthy board."

**Problem:** `Job.source` stores the vendor (`greenhouse`), not which board.
Careem and Arbisoft are both Greenhouse boards, so scoping by that field means a
failed Arbisoft fetch closes every one of Careem's jobs — precisely the
corruption the rule exists to prevent. A test caught this immediately.

**Resolution:** `Job.source_ref` records the specific feed (`greenhouse:careem`),
threaded through `RawPosting` from the run. Closures are scoped to the set of
feeds that actually succeeded.

## 14. The job table renders one layout, not two hidden behind CSS

**Spec (§9):** "Table collapses to cards under 900px."

**Problem:** the obvious implementation renders both and hides one with a CSS
media query. Both stay in the DOM, so every element id exists twice and every
control is announced twice to a screen reader — in a suite that checks for
exactly that, it showed up immediately as "found multiple elements".

**Resolution:** a `useMediaQuery` hook picks one layout. Same behaviour, half
the DOM, and no duplicated ids.

## 15. A retry replaces a second refresh when the token already rotated

**Spec (§9):** "Handle 401 by attempting one silent refresh before giving up."

**Problem:** a dashboard fires several requests at once. If one 401s and
refreshes while another is still in flight, the second request's 401 arrives
*after* the token has already been replaced — and refreshing again rotates it a
second time, invalidating the token every other request just started using. The
user is logged out at the exact moment everything was fine.

**Resolution:** the client tracks a token generation. A request that 401s after
the generation changed simply retries with the current token instead of starting
another refresh. A test fires three concurrent requests and asserts exactly one
refresh happens.

## 16. `python-jobspy` and the `scrape` extra

Not a spec disagreement — a build-time one. jobspy pulls in pandas, which is slow
to install and heavy at runtime. It is declared as the `scrape` extra in
`backend/pyproject.toml` and added to the image in milestone 10, when the adapter
that needs it is written. Sizing guidance in §13 (2GB RAM minimum) applies from
that point onward.
