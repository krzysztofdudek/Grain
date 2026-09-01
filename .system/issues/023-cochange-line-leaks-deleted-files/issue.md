# 023 · The `missingLines`/`cochangeData` co-change line leaks unmarked deleted files into `how`, `check` and `completeness`

**Status:** FIXED — dead co-change paths now marked `(deleted)` in both renderers; verified independently
**Found by:** cross-check test suite (liveness sweep), 2026-09-01, on grain 0.3.0 · extractor g27
**Severity:** medium — same class as 020, but a SECOND renderer, reaching three commands instead of one

## Relationship to 020 — sibling, not duplicate

020 names `cochangePartners` (core.mjs ~2543), consumed by `where`'s "historically co-changes with:" line.
This ticket is the OTHER co-change renderer: `cochangeData` (core.mjs ~3331), consumed via `missingLines`'
`co-change:` line and via `completenessDirectional` (~3355). Fixing 020's renderer alone leaves all three
surfaces below still leaking. 020's own "wider check" section asked for this audit; this is its result.

## Symptom

Fixture: `lib/zqdeadrouter.js` co-changes 10/10 commits with `lib/zqalpha.js`, then is deleted several commits
before HEAD (`git ls-files` confirms it is absent). Three commands then name it with no marker — one of them in
the same breath as marking it correctly:

```
grain how "fix parsing of routes"
  places such a change touched:
    lib/zqalpha.js (5/5) — lib
    lib/zqdeadrouter.js (5/5) — (deleted)          ← the SAME invocation marks it here
  missing from your change:
  co-change: lib/zqdeadrouter.js (co-changed in 10/10 commits)   ← …and leaks it here, unmarked

grain check lib/zqalpha.js
  missing from your change:
  co-change: lib/zqdeadrouter.js (co-changed in 10/10 commits)   ← unmarked

grain completeness lib/zqalpha.js
  [grain] Edits like this historically also touch:
    - lib/zqdeadrouter.js (co-changed in 10/10 commits)          ← unmarked
```

The `how` case is the sharpest: one command, one output, the identical dead path marked `(deleted)` in
`places[]` (its `exists` flag works) and presented as a live recommendation four lines later. `completeness`
is the worst consumer in practice — its line is what `check-hook` appends automatically after a matching edit,
so an agent is actively steered toward editing a file that does not exist.

## Suspected area

`cochangeData` (core.mjs ~3331) and its renderers: `missingLines`' cochange source (~3396),
`completenessDirectional` (~3355). `howCmd`'s `places[]` builds an `exists` flag from the live file set —
reuse that source (`model.filesAll` / the live-path set), do not write a third liveness check. Note
`review --json`'s `cochangePartners` field flows through the same data — check it while there.

## Explicitly NOT in scope

- 020 itself (`cochangePartners` / `where`) — fix separately or together, but this ticket's evidence is the
  other three surfaces.
- Whether a dead co-change partner should be marked or omitted — same decision as 020; make it once,
  consistently, for both renderers. (Omission is arguably RIGHT for `completeness`/check-hook, whose whole
  purpose is "you should edit this too" — a dead path can never be a valid completion.)

## Acceptance

`tests/cross-check-liveness.test.mjs` sweep entries for `how`, `check lib/zqalpha.js` and
`completeness lib/zqalpha.js` go green (they assert: every line naming a path absent from HEAD carries a
deadness marker, or the path is omitted). The `where` entry stays governed by 020. A live co-change partner is
rendered unchanged (the same sweep asserts live paths are never marked).
