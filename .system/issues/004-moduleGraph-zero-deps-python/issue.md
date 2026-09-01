# 004 · `report`/`map` architecture section shows 0 dependencies on a Python repo with obvious real imports

**Status:** FIXED (verified independently by orchestrator, 1465/1465)
**Found by:** field test, Python/flask, 2026-09-01
**Severity:** medium — a whole section silently reports nothing instead of disclosing it cannot resolve

## Symptom

On flask, `grain report` / `grain map` architecture section claims **"13 modules · 0 directed dependencies"** for
`src/flask/`, while the source plainly contains intra-package imports:
`from .ctx import AppContext`, `from .sansio.blueprints import Blueprint`, and many more.

The dependency graph looks entirely uncomputed for this repo, rather than partially resolved.

## Suspected area

`relations.mjs` — Python relative-import (`from .x import Y` / `from ..x import Y`) resolution, and/or
`REL_LANGS`/`relSupported` coverage for Python. Determine first whether Python is genuinely in the supported set
and the resolver is failing, or whether Python is NOT resolution-supported and the real bug is that the
disclosure line ("resolution does not cover N files") is missing/insufficient for this case.

Both outcomes are legitimate fixes but they are DIFFERENT fixes — establish which before writing code. Note the
existing disclosure precedent already seen in this project's own report output:
`resolution does not cover 36 files (bash, json, yaml) — conventions layer only for those`.

## Expected

Either the relative imports resolve into real module edges, or the report states plainly that dependency
resolution does not cover this repository's language/layout — never a bare, unqualified "0 directed
dependencies", which reads as a measured fact about the code rather than a gap in the tool.

## Acceptance

A Python fixture with real relative imports between two modules: either the edge appears in `moduleGraph`, or the
report carries an explicit disclosure naming Python as unresolved. Zero-with-no-explanation must not be possible.

---

## Resolution (2026-09-01)

**Diagnosis was NEITHER (A) nor (B) as this issue originally posed them — a third mechanism**, established by the
fixing agent with live evidence and independently confirmed by the orchestrator:

Python relative/absolute import resolution was never broken. `relSupported('python')` is already true, and on real
flask `relFactsFor`/`buildEdges` produce **118 correct edges** (deep `..` parent-relative forms included);
`model.edges.length` on the real indexed flask model is 139. A pre-existing 22-case
`tests/relations/unit/python-name-resolution-matrix/` suite was already passing, unmodified.

The actual cause: `moduleOf`/`refineModOf` bucket all of `src/flask/` (24 files) into ONE module node — it sits
below §G11's dominant-module refinement threshold (`n >= max(40, files.length*0.5)`, flask has 99 code files), so
it is never split. All 139 edges are therefore intra-module (`a === b`) and are folded away by moduleGraph's own
`if (a === b) continue` — correct by design, since the graph counts CROSS-module dependencies only. `report()`
then printed a bare "0 directed dependencies" and said nothing about the 139 resolved-then-folded edges.

So this was a **disclosure** bug after all, but a different one than (B) guessed: not "language unsupported"
(which `relCoverageNote`/§G21 already covers correctly), but "resolved fine, then aggregated to zero at module
granularity" — a sibling gap with no existing coverage.

**Fix:** new `intraModuleNote(model)` (`core.mjs:2957`), fires only when `moduleGraph.edges.length === 0 &&
model.edges.length > 0`, wired into `report()`'s architecture section beside the existing `covNote`. Pure render
over existing model fields — no new heuristics, no changes to `moduleGraph`/`refineModOf`/`architectureNorms`/
`REL_LANGS` (none needed any).

Real flask output after the fix:
```
== architecture — 13 modules · 0 directed dependencies · 0 cycle(s) ==
  resolution does not cover 16 files (bash, json, toml, yaml) — conventions layer only for those
  139 file-level edges resolved, none crossing a module boundary — the architecture graph only counts cross-module dependencies
```

Verified independently by the orchestrator: removing the one wired-in line reproduces exactly the one intended red
test (5/6 still pass — the resolver tests correctly pass either way, proving they test the right thing); restoring
goes green. Full suite 1465/1465.

**Found nearby, NOT fixed (new work, not this issue's):** `rulesMarkdown()` (backing `grain rules`) never calls
`relCoverageNote` at all — its own separate, pre-existing §G21-style disclosure gap. Logged as a candidate, see
issue 007.
