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

## 5. `python-jobspy` is an optional dependency until milestone 10

Not a spec disagreement — a build-time one. jobspy pulls in pandas, which is slow
to install and heavy at runtime. It is declared as the `scrape` extra in
`backend/pyproject.toml` and added to the image in milestone 10, when the adapter
that needs it is written. Sizing guidance in §13 (2GB RAM minimum) applies from
that point onward.
