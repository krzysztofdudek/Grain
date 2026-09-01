# 032 — work log

## Confirmation of current (pre-fix) behavior

Reproduced on the read-only Slim corpus (`corpus-a4b1/Slim`, `.grain/cache` already built, HEAD `73274eb`):

```
$ grain what MiddlewareInterface
defined: MiddlewareDispatcherInterface (type) · 5 incidental test-method-name hits (6 total)
used by: 5 files

$ grain what ResponseInterface
defined: 1 incidental test-method-name hit
(no used by line)

$ grain what RouteInterface   (control — locally declared)
defined: RouteCollectorInterface, RouteCollectorProxyInterface, RouteGroupInterface, RouteInterface,
         RouteParserInterface, RouteResolverInterface (6 types)
used by: 23 files
```

Grep ground truth: `implements ... MiddlewareInterface` = 10 files, any mention = 21 files;
`ResponseInterface` implements = 0 files, any mention = 41 files. Confirms the issue's table and the tester's
diagnosis: neither vendor type has a local declaration, so (a)'s fuzzy name-token search over local declarations
substitutes incidental matches (`MiddlewareDispatcherInterface`, test method names) for the real answer, and
misses every real `implements`/type-hint site.

## Root cause, confirmed

`whatCmd` (core.mjs) has no path that consults structural facts at all for a name with no local declaration.
`learn()` already builds `sup` (heritage) per scope and, at partition level, `fileSups` (per-file, threshold-free,
dedup'd heritage names) — but `fileSups` only covers `extends`/`implements`, not parameter/return TYPE HINTS
(`ptypes`/`rets`), which is where `ResponseInterface`'s 41 real usages almost entirely live (0 heritage sites, all
type hints). `ptypes`/`rets` were captured per-scope but never aggregated into a queryable per-file structure the
way `fileSups` was — that's the second, larger gap.

## What was reachable at query time

- `model.partitions[].fileSups` — YES, already persisted in `model.json`, per-file, no minimum-carrier threshold
  (unlike `markers`, which needs >=3 carriers). Directly usable for heritage matching.
- Parameter/return type hints — NOT reachable per-file before this fix. `markers['ret:X']` exists but is gated at
  >=3 carriers repo-wide (a `where`-oriented structure, wrong shape for an exact per-file reference count) and has
  no `ptypes` counterpart at all.

## Fix shipped

Both (1) and (2) from the issue.

**(1) Consult structural facts** — core.mjs:
- `learn()` now also builds `fileTypeRefs`: `fileSups`'s sibling for parameter/return type hints — same per-file,
  threshold-free, dedup'd (capped 24/file) shape, sourced from each scope's existing `rets`/`ptypes`.
- `whatCmd` computes `exactLocal` — does the query case-insensitively equal some declared scope's own name
  (not merely share tokens with it)? When `false`, `typeRefHits(model, q)` does an EXACT-name (never
  token-overlap) scan of `fileSups`/`fileTypeRefs` across all partitions and returns `{files, implements,
  typeHint}`. A locally-declared type (`exactLocal === true`) skips this entirely — its answer through (a) is
  already correct and complete; doubling the disclosure there would be noise.

**(2) Disclose the fallback** — when `referenced` is non-null, `whatCmd` renders a `voice('map', ...)` line
("«Q» has no declaration anywhere in this repository (likely an external/vendor type) but is referenced
structurally in N files ... Matched by its exact name against grain's own recorded supertype and parameter/
return-type facts, not a resolved import — this count may still miss usages the extractor cannot see
structurally") — additive, next to the pre-existing (possibly-incidental) `defined:`/`used by:` lines, not a
replacement for them. `referenced` is also a new top-level field in `--json` output (`null` when not applicable).
The pre-existing "absent" branch is now gated on `!referenced` too, so a query with structural-only evidence never
reads as "has no declarations or values anywhere".

## Before / after on real Slim

| query | before | after |
|---|---|---|
| `what MiddlewareInterface` | `defined:` 6 incidental hits · `used by: 5 files` (both unchanged) | + `map: ... referenced structurally in 14 files — implements/extends it in 10 files · ... parameter/return type in 4 files` |
| `what ResponseInterface` | `defined:` 1 incidental hit | + `map: ... referenced structurally in 33 files — ... parameter/return type in 33 files` |
| `what RouteInterface` (control) | `defined:` 6 types (23 used-by) | byte-identical — `referenced` is `null` (exactLocal short-circuits) |

`implements: 10` for MiddlewareInterface matches the `implements ... MiddlewareInterface` grep count exactly.
Remaining gap to the raw "any mention" grep counts (21 / 41) is `use`-import-only and PHPDoc-only mentions and
at least one PHP union-type parameter (`MiddlewareInterface|string|callable`) that the current `ptypes` extraction
does not parse into a plain type token — these are not scope-level type declarations the extractor can see
structurally, and the disclosure line says so explicitly ("may still miss usages the extractor cannot see
structurally"). This is a legitimate, honestly-disclosed boundary, not silently claimed as complete.

## Sibling noise (measured, not touched)

`what RouteInterface`'s `defined:` list still blends `RouteResolverInterface` (and 4 more `*Interface` siblings)
in via (a)'s pre-existing token-superset match — unchanged by this fix, exactly as the issue asked. Captured as a
baseline assertion in the new test (test 3) so a future fix has something to diff against.

## 031 / 012

Not touched, not affected. 031 (Sinatra `environment`, metaprogrammed identifiers / single-token presentation) has
no supertype/parameter/return-type structural signal to match on — `typeRefHits` would return nothing for that
query shape, so this fix is inert there. 012 (`where` ranking) is untouched; nothing in this fix runs inside
`whereCmd`.

## Tests

New file `plugins/grain/tests/what-external-types.test.mjs` (4 tests, PHP fixture, real tree-sitter-php
extraction):
1. External type (`MiddlewareInterface`, 3 heritage sites + 1 type-hint-only site, 0 local declaration) →
   `referenced = {files:4, implements:3, typeHint:1}`, text carries the disclosure.
2. Local control (`RouteInterface`) → resolves via (a) as before, `referenced === null`.
3. Sibling noise baseline (`RouteResolverInterface` blended into `RouteInterface`'s `defined:`) — asserted as
   current, unfixed behavior.
4. Genuinely absent type (`TotallyAbsentInterface`) → short, clean 3-line "not found" answer, `referenced ===
   null`, no verbosity creep.

Hand-reverted and restored (via `Edit`, never git) both load-bearing hunks individually to confirm they are
necessary:
- Reverting the `referenced` computation in `whatCmd` → test (1) fails (`expected structural reference evidence,
  got null`); tests (2)-(4) still pass. Restored, re-verified green.
- Reverting `fileTypeRefs`'s population in `learn()` (leaving `fileSups` alone) → test (1) fails with
  `{"files":3,"implements":3,"typeHint":0}` (the type-hint-only site drops out) instead of the expected 4.
  Restored, re-verified green.

## Suite

Full suite (`npm test`), run in isolation (not concurrent with any other tool call): **1733/1733 pass, 0 fail**,
both before writing the new test file's assertions were finalized and after, and again after the two
revert/restore cycles above. (One `npm test` invocation launched IN PARALLEL with an unrelated Slim check showed a
transient single failure — reproduced on immediate rerun as 1733/1733 clean; root-caused to another concurrent
agent's in-flight edit to the same shared `core.mjs`/`grain.mjs` at that exact moment, not this change: `node -c`
syntax checks and a full grep of this fix's own hunks confirmed the file was intact throughout.) The task's
stated starting point was 1721/1721; the +12 delta reflects other agents' concurrent landings in this shared tree
(4 of which are this ticket's own new tests) — not a discrepancy in this fix.

## Not touched

`config.mjs` was not edited, per instruction. **A `MODEL_V` bump is needed** (currently `'m22'` would be next —
check the live value at merge time, other agents are also bumping it concurrently): `fileTypeRefs` is a new
`model.partitions[]` field `whatCmd` now depends on; without the bump, a pre-existing cached `model.json` from
before this change won't have it and `typeRefHits` will silently see an empty `fileTypeRefs` (degrades gracefully
to heritage-only matching, never crashes) until the next full re-learn.
