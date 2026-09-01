# Work log — 030

Decision handed down: option 2 only (mark template lines descriptive, not enforced). Option 1 not attempted.

## Confirmed mechanism

`report`'s template lines come from `mineTemplates`/`profileOf` (unclustered residue — scopes clustering leaves
behind, coarse-silhouette-bucketed then anti-unified). `checkFile`'s shape-deviation pass (J5.8) reads only
`part.profiles[role].req` — a CLUSTERED role group's literal-signature counts — and never reads `part.templates` at
all. So an unclustered-residue template line has zero enforcement, not even J5.8's partial "missing signature"
bridge (that bridge only exists for role groups, never for `mineTemplates`' output). Confirmed with a synthetic
repro fixture (8 one-liner `try { work() } catch { logger.error }` functions across `src/jobs/`): `report`/`rules`
show `template (unclustered methods ×8, ...) — one slot per-instance (8/8, e.g. `load`) — held since ...`.

## Before

```
template (unclustered methods ×8, ~96% of an average one): function_declaration(...) · one slot per-instance
(8/8, e.g. `load`) · held since 2026-01 · 8 new in 180d — e.g. src/jobs/load.ts:1–8
```
(and the matching `### Templates (unclustered residue)` bullet in `rules`, same clauses, no marker.)

## Fix

Added `export const TEMPLATE_DESCRIPTIVE_NOTE` in core.mjs, next to `DIRTY_TREE_NOTE`/`relCoverageNote` (same
plain-declarative register), text: `'descriptive only — check has no cell for a template\'s shape, so a member
breaking it is never flagged'`. Spliced into both `report()`'s template line and `rulesMarkdown()`'s `### Templates`
bullet, same position (after the `held since`/`new in 180d` clause, before the `— e.g.` exemplar pointer). One
constant, two call sites — cannot drift the way `report`/`rules` drifted before (§007).

## After

```
template (unclustered methods ×8, ~96% of an average one): function_declaration(...) · one slot per-instance
(8/8, e.g. `load`) · held since 2026-01 · 8 new in 180d · descriptive only — check has no cell for a template's
shape, so a member breaking it is never flagged — e.g. src/jobs/load.ts:1–8
```
`rules`' Templates bullet carries the identical clause.

Verified on the richer `build-fixture.mjs` repo (83 convention/fact lines in `report --top 60`): exactly 1 line
carries "descriptive only" (the one genuine template), the other 82 real `part.facts` convention lines do not.

## Tests added

- `tests/templates.test.mjs`: new test `§030: both report and rules mark the template line descriptive,
  byte-identically` — asserts every template line in both surfaces carries the exact marker text.
- `tests/grain.test.mjs`'s existing `report finds the planted conventions` test: added assertions that (a) the
  build-fixture.mjs template line carries the marker, (b) the already-asserted genuine `@Handler` convention line
  does NOT.

## Load-bearing proof

Hand-reverted the `report()` template line's marker splice via Edit; re-ran `tests/grain.test.mjs` — the new
assertion failed exactly as expected (marker absent). Restored via Edit; re-ran full suite green.

## Process note

This is a SHARED, uncoordinated working tree — other agents' concurrent saves to `engine/core.mjs` and
`engine/grain.mjs` overwrote my in-progress edits at least twice during this session (confirmed by grep going from
present to completely absent with no error, mid-task). I re-applied and re-verified after each occurrence. Final
state re-verified immediately before writing this log: all core.mjs/grain.mjs edits present, `node --check` clean,
full suite 1749/1749 green.

## Bump needed

None. No new persisted field, no schema change — `TEMPLATE_DESCRIPTIVE_NOTE` is a pure render-time string.
