# log — 034

- 2026-09-01 · FIXED both (a) and (b).

  (a) Confirmed mechanism first: `history.mjs`'s `walk()` invokes `git log --reverse --raw --no-abbrev --no-merges
  -M ...` — `state.commits` (and therefore `model.historyStats.commits`, the number `statusLines` renders) is
  exactly `commits.length` off that walk, i.e. non-merge commits only. `CFG.megaCap`/`nonMegaCommits` (§J2.4b) are
  a separate, narrower accounting used only for `fileCommits`/`msgTokCommits`'s own base-rate denominator inside
  the language bridge — they do not feed this total at all, so h8's own comment is precedent, not the mechanism
  itself. Fix: qualified the rendered line in `core.mjs`'s `statusLines` from `"N commits, M blobs"` to
  `"N non-merge commits, M blobs"`, with a comment citing the exact nest discrepancy (12,435 vs 21,710) as the
  motivating evidence.
  Before: `history: 16 commits, 172 blobs` (fixture; unqualified).
  After: `history: 16 non-merge commits, 172 blobs`.
  Tests: updated the pinned literal-string assertion in `grain.test.mjs` for the new wording; added a new test
  building a from-scratch repo with one real merge (base + 2 divergent branch commits + 1 merge = 4 commits per
  plain `git log --oneline`) asserting `status` reports exactly 3 non-merge commits and that the qualified number
  is strictly less than the plain count — pinning the actual exclusion, not just the wording. Hand-reverted the
  `core.mjs` wording change to confirm both tests go red without it (2 failures), then restored — 16/16 green in
  `grain.test.mjs` after restoring.
  Left `history.mjs`'s own `[history] N commits, M blobs (...)` progress log (stderr, walk-time diagnostic, no
  test pins its text) untouched — out of scope: it's a transient build-progress line, not a persisted "repo fact"
  a reader compares against `git log`, unlike the `status`/`report` line this ticket is about.

  (b) `docs/validation.md`: the corpus table (`## The corpus`) was introduced in commit 13e5136 ("0.2.0: layering
  norms, ..."), confirmed via `git show 13e5136:plugins/grain/engine/config.mjs` to carry `ENGINE_VERSION =
  '0.2.0'` at that time; current `ENGINE_VERSION = '0.3.0'` (unreleased). Added a paragraph directly under the
  table stating it was measured under engine 0.2.0, one machine, one point in time, and that grammar support
  added since (JSON/YAML/TOML, `.properties`) walks/parses more files in every build by construction, so a later
  engine reads higher for that reason alone before any other machine difference. Extended the existing "Known
  boundaries" paragraph (which already conceded the table predates JSON/YAML/TOML support) with the explicit
  engine version and one concrete cross-check: a different-machine run on the current pre-release engine timed
  nest's cold build at 114 s against the table's 55.7 s (~2x), framed as consistent with more files entering every
  build plus ordinary hardware/OS/node drift, not a regression — and explicitly NOT folded into the table itself,
  per the ticket's own instruction not to quietly edit numbers to match one new machine. No re-measurement of the
  full corpus performed (explicitly out of scope). Docs-only change; no test added (per the dispatch's own
  guidance that (b) needs none).
