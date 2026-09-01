# 024 · The stamp over-promises: `+dirty` means "includes your edits", and grain both under- and over-claims it

**Status:** FIXED — explain now reads the worktree; DIRTY_TREE_NOTE added for the 8 HEAD-readers; verified independently
**Found by:** cross-check test suite (stamp property loop), 2026-09-01, on grain 0.3.0 · extractor g27
**Severity:** low-medium — the stamp is the product's own freshness promise, printed under every answer

## The ruling this re-scope encodes (orchestrator, 2026-09-01)

The stamp's job is to say what the answer was computed FROM. `as of <sha>` means "computed from sha".
Therefore `+dirty` can only honestly mean **"this answer incorporates your uncommitted edits"** — the meaning
`check`'s stamp already has. One marker cannot also carry "your tree is dirty but this answer EXCLUDES your
edits" — that opposite meaning needs a different, distinct disclosure.

Under that ruling the original measurement (8 of 10 commands never say `+dirty`; only `check`/`explain` do)
decomposes into three findings:

## (a) The documented claim over-promises

Help text and README say "Every answer ends with `as of <sha>[+dirty]`." For the 8 HEAD-reading commands
(`where`, `how`, `what`, `map`, `status`, `report`, `rules`, `completeness`) the `[+dirty]` half can never
truthfully fire — they answer from the indexed sha, so their stamps are CORRECT as-is and the doc is wrong.
Narrow the claim to what the stamp actually promises.

## (b) `spectrum`/`explain`'s `+dirty` is a FALSE claim — cross-reference 013

`cmdSpectrum` stamps `as of <sha>+dirty` for a dirty target file while rendering HEAD data (the line predates
013 — first engine commit). That is the stamp's strongest reassurance ("this reflects your edits") attached to
an answer that specifically does not — worse than silence, and the same class as 004/007/011/018 (grain knows
something and states the opposite). Resolution is 013's: either `explain` reads the worktree (then `+dirty`
becomes true) or it keeps HEAD data and must drop `+dirty` in favor of the (c) marker. Do not close 024(b)
independently of 013.

## (c) HEAD-reading commands on a dirty tree owe a DISTINCT disclosure

When the worktree differs from the indexed sha, a HEAD-reading command's answer may not describe what the
reader is looking at — and today nothing says so (measured: for all 8 commands, clean and dirty runs produce
byte-identical output). The disclosure needs a marker that is NOT `+dirty` (now spoken for), in the register
of `relCoverageNote`/`intraModuleNote` — e.g. a clause noting the answer is from `<sha>` while the tree has
uncommitted changes. Marker to be designed; that design is the actual fix here.

## Explicitly NOT in scope

- Adding `+dirty` to the 8 bare `stamp()` call sites — the pre-ruling reading, now explicitly forbidden: it
  would propagate the false claim eightfold. The tests are being re-targeted so that this "fix" turns them
  red, not green.
- 013's content-staleness itself (which of its two fix shapes to pick) — only its stamp consequence (b) lands
  here.
- g22 (`rules`' stamp delivery to stderr/stdout).

## Acceptance

`tests/cross-check-freshness.test.mjs` (re-targeted to this ruling):
- For the 8 HEAD-readers: a dirty worktree makes the output visibly disclose the dirt (differ from the clean
  run) — goes green when (c)'s marker ships; AND the output never claims bare `+dirty` — green today, stays
  green (the guard against the forbidden fix).
- For `explain`: `+dirty` appears only if the answer actually reflects the worktree edit (red today, per (b);
  resolved by 013's fix either way it goes).
- `check` unchanged (its `+dirty` is truthful).
- The help text's stamp sentence matches the decided rule, and the decision is recorded here.
