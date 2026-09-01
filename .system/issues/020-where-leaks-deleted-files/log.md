# log — 020

Fixed together with 023 (same defect class, two independent renderers — 020 is `cochangePartners`/`where`,
023 is `cochangeData`/`check`+`completeness`+`how`). See 023's log for the full joint report; this entry covers
020's own renderer only.

## Root cause

`cochangePartners` (core.mjs, `whereCmd`'s co-change source) never checked whether the historical partner path
it names still exists at HEAD — unlike `howCmd`'s `places[]`, which already computes an `exists` flag off the
live path set and renders `(deleted)`.

## Fix

Reused the exact liveness idiom already used in three other places in `core.mjs` (`howCmd`'s `live`, ~2817;
`archModOf`/`liveScope` at ~1759/1842): `new Set([...(model.pathsAll || []), ...(model.filesAll || [])])` —
`pathsAll` because `model.cochange`'s `a`/`b` are general tracked paths (any file git saw move together), not
only the code-parseable subset `filesAll` covers; the union with `filesAll` is the same defensive fallback the
other three call sites use. Added a `dead` flag to each object `cochangePartners` returns, and both of
`whereCmd`'s two render sites (file-card co-change line, group/directory co-change line) now append
`(deleted)` after the partner's name when `dead` is true.

## Decision: mark, not omit

Made jointly with 023 (same decision applies to both renderers — see 023's log for the shared reasoning). Marking
wins here specifically because the test file's own non-vacuous precondition
(`PRECONDITION: at least one OTHER surface mentions the dead path`) asserts that `where zqalpha`'s output still
contains the literal dead path string after the fix — the fixture's `zqalpha.js` co-changes with exactly one
partner, the dead one, so omitting it would make that precondition itself fail. Marking also matches `how`'s
own precedent (`(deleted)`) exactly, and keeps the historical fact visible — a heavy co-change with a since-deleted
file can be a real signal (e.g. "this logic moved elsewhere").

## Verification

- `cross-check-liveness.test.mjs`'s `SWEEP: where "zqalpha" (file-card co-change line)` — RED before (unmarked
  `lib/zqdeadrouter.js (10/10 commits)` — the ticket's own reproduction), GREEN after.
- Hand-reverted the `cochangePartners` hunk and both `whereCmd` render-line hunks via `Edit` (no git): the exact
  same RED returned, byte-for-byte. Restored via `Edit`; GREEN again.
- Full suite `node --test 'plugins/grain/tests/**/*.test.mjs'`: 1702 tests, 1683→1687 pass, 19→15 fail (the
  4 fixed here+023, zero new failures — the remaining 15 are pre-existing, explicitly-labeled open tickets:
  024(c) stamp-truth, 013, 014(d3), 009 how-json-score, selftest --json).
