# log — 023

- 2026-09-01 · filed by the cross-check test-suite designer. Found by `tests/cross-check-liveness.test.mjs`
  (property sweep: every read command run over a fixture with a heavily-co-changing, then-deleted file; any
  line naming a HEAD-absent path must carry a deadness marker). Verified live at extractor g27, twice
  (Sonnet implementation run + independent orchestration snapshot, identical output).
- Root-cause shape (from reading, not fixing): exactly two co-change renderers exist — `cochangePartners`
  (020's, `where`-only) and `cochangeData` (this one, three consumers). Both ignore the `exists` machinery
  `howCmd.places[]` already uses.

## Fix (2026-09-01), done together with 020 per the joint dispatch

`cochangeData` (core.mjs ~3400) now computes the same liveness set `cochangePartners` (020's fix, same commit)
and `howCmd`'s `places[]` (~2817) use: `new Set([...(model.pathsAll || []), ...(model.filesAll || [])])` —
`pathsAll` because `model.cochange` pairs are general tracked paths, not only the parseable subset `filesAll`
covers; the `filesAll` union is the same defensive fallback the three pre-existing call sites of this exact
idiom already use. `pathsAll` alone would in practice already cover it (`filesAll` should be a subset), but the
union matches house precedent byte-for-byte rather than trusting that subset relationship at every call site.
Each hit now carries `dead: !live.has(file)`.

Four render sites read this shared data and all now append `(deleted)` after the file name when `dead`:
`missingLines`'s `co-change:` line (feeds `check <file>`, `how`, `review`), `completenessDirectional` (the
standalone `completeness <file>` command), `review --json`'s `cochangePartners` field (grain.mjs ~421 — the
ticket's own note to check it while here), and both `check-hook`'s PostToolUse co-change line and `edit-hook`'s
PreToolUse co-change line (grain.mjs — these two share a `cochange:<rel>` `seenGate` suppression key, so their
signature strings were both updated in lockstep with a `:${dead?1:0}` suffix; leaving one unchanged would have
let a dead-vs-live wording mismatch defeat their mutual suppression).

## Decision: mark, not omit (joint with 020, not decided per-surface)

The ticket floated omission as "arguably RIGHT for completeness/check-hook" since a dead path can never be a
valid edit target. Rejected in favor of marking, uniformly, for two reasons: (1) the dispatch requires ONE
decision applied to BOTH renderers (020's `cochangePartners` and this ticket's `cochangeData`), not a
per-surface split; and (2) `cross-check-liveness.test.mjs`'s own non-vacuous precondition for `where` requires
the dead path to still appear in `where`'s output post-fix (its fixture's only co-change partner for
`zqalpha.js` is the dead one) — so 020's side of the decision is forced to MARK, which settles it for 023's
side too. Marking also matches the established `how`-places `(deleted)` precedent exactly and preserves a real
signal (a heavy co-change with a since-deleted file often means "this logic moved").

The now-dead `completeness` (not `completenessDirectional`) at core.mjs ~3391 was NOT touched: grepped the whole
plugin tree, it has zero callers anywhere (not wired to any CLI command, hook, or test) — genuinely unreachable
legacy code, not a live leak surface. Flagging in case someone wants it deleted, but out of scope here.

## Verification

- `cross-check-liveness.test.mjs` full run BEFORE any change: 16 tests, 4 RED for exactly the expected reason
  (unmarked `lib/zqdeadrouter.js` mentions) — `where`'s file-card line, `how`'s `missingLines`/co-change line
  (in the SAME invocation whose `places[]` already correctly marks it — the ticket's sharpest example,
  reproduced), `check lib/zqalpha.js`, `completeness lib/zqalpha.js`. AFTER: all 16 GREEN.
- Hand-reverted every hunk (both `cochangeData` and all four grain.mjs render/signature sites) via `Edit`, no
  git: re-ran the sweep, got the identical 4 REDs back, byte-for-byte the same failure messages. Restored via
  `Edit`; back to 16/16 green.
- Full suite `node --test 'plugins/grain/tests/**/*.test.mjs'`: 1702 tests total, both before (1683 pass / 19
  fail) and after (1687 pass / 15 fail) — exactly the 4 targeted failures gone, zero new failures. The
  remaining 15 are pre-existing, explicitly-labeled open tickets unrelated to this class of bug: 024(c)
  stamp-truth (8 commands), 013 (×2), 014 (d3/d3-json), `selftest --json`, 009 how-json-score.
