# 038 — work log

## Decision (given, not re-litigated)

Option 3 only: disclose the module granularity at the point a cycle is claimed. Options 1 (refine granularity from
build manifests) and 2 (heuristic caveat on test-shaped edges) are explicitly out of scope for this ticket.

## Before (report(), 4-module SCC fixture from cycle-set-not-chain.test.mjs)

```
== architecture — 4 modules · 4 directed dependencies · 1 cycle(s) ==
  mod-a/ → mod-c/ (1)
  mod-b/ → mod-a/ (1)
  mod-c/ → mod-d/ (1)
  mod-d/ → mod-b/ (1)
  cycle (strongly connected): mod-a, mod-b, mod-c, mod-d — every member reaches every other, not necessarily in this order
```

## Before (rulesMarkdown(), same fixture)

```
## Architecture

4 modules · 4 directed dependencies · 1 cycle(s)

- `mod-a/` → `mod-c/` (1)
- `mod-b/` → `mod-a/` (1)
- `mod-c/` → `mod-d/` (1)
- `mod-d/` → `mod-b/` (1)

**Cycles (strongly connected — every member reaches every other, not necessarily in this order):**

- mod-a, mod-b, mod-c, mod-d
```

## What was built

`core.mjs`: new exported constant `CYCLE_GRANULARITY_NOTE`, placed alongside `DIRTY_TREE_NOTE`/`relCoverageNote`/
`intraModuleNote` (same file region, same register — plain declarative sentence, no hedge):

> modules here are directory buckets (refined one level under a dominant root), not build-declared source sets —
> a module that folds together more than one source set, such as production and test code under one src/ tree,
> can show a cycle that is entirely a test-only dependency, not a production one

Wired into both `report()` and `rulesMarkdown()` immediately after the cycle list is printed (only site in either
renderer where cycle *membership* is shown — `status`'s and `explain`'s one-line cycle *counts*, grain.mjs:662 and
core.mjs:3669, don't name modules and were left alone). No name-based test detection was added anywhere — the note
states how modules were derived (directory buckets via `moduleOf`/`refineModOf`), never classifies a path as
"test".

Fires **always** when `mg.cycles.length > 0` — not conditionally on "does this cycle look test-shaped." The brief
called this out as the preferred default, and it's also the only option that doesn't require a heuristic (option 2,
explicitly out of scope) to decide when to fire. A cycle claim with no granularity disclosure would be the
regressed case; firing unconditionally on every cycle costs one line and needs no new signal.

`rules` carries the identical note text as `report` (both reference the same exported constant, so they cannot
drift the way §007 did for a different disclosure).

## After (report(), same fixture)

```
  cycle (strongly connected): mod-a, mod-b, mod-c, mod-d — every member reaches every other, not necessarily in this order
  modules here are directory buckets (refined one level under a dominant root), not build-declared source sets — a module that folds together more than one source set, such as production and test code under one src/ tree, can show a cycle that is entirely a test-only dependency, not a production one
```

## After (rulesMarkdown(), same fixture)

```
**Cycles (strongly connected — every member reaches every other, not necessarily in this order):**

- mod-a, mod-b, mod-c, mod-d

modules here are directory buckets (refined one level under a dominant root), not build-declared source sets — a module that folds together more than one source set, such as production and test code under one src/ tree, can show a cycle that is entirely a test-only dependency, not a production one
```

## Existing test check

Checked `tests/cycle-set-not-chain.test.mjs` (the cycle-rendering regression test) first, per instructions. It
locates lines by exact-equality on a single found line (`lines.find(l => l.trim().startsWith('cycle'))`, etc.), not
on the full output array, so appending a new trailing line does not change what those assertions match. Ran it in
isolation: 4/4 still pass, unmodified. No update was needed or made.

## New test

`plugins/grain/tests/cycle-granularity-note.test.mjs` — 4 tests:
1. genuine 4-module cycle still reported, now carries the note (report()).
2. rulesMarkdown carries the identical note for the same cycle.
3. report and rulesMarkdown agree (both reference the same exported `CYCLE_GRANULARITY_NOTE`).
4. no-cycle repo → no note in either renderer (must not decorate unconditional architecture output).

## Suite

Start: 1767/1767 green (stated baseline).
End: **1771/1771** green (`npm test` in `plugins/grain`) — 1767 baseline + 4 new tests, 0 fail.

## Config

`config.mjs` not touched — render-only change, no version bump needed.
