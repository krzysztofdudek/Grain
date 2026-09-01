# 004 — work log

## Diagnosis

Ran `grain report` on the real flask clone (already indexed corpus). Architecture line:

```
== architecture — 13 modules · 0 directed dependencies · 0 cycle(s) ==
  resolution does not cover 16 files (bash, json, toml, yaml) — conventions layer only for those
```

Note the disclosure line IS present and fires correctly for bash/json/toml/yaml — Python is not in that
uncovered list, i.e. `relSupported('python')` is true (extractor exists, `REL_LANGS` already includes
`'python'`). So the field report's premise ("bare, no-disclosure zero") didn't match what a rebuilt index
actually renders — the disclosure infra was already partially working. Investigated further.

Checked `model.json` directly:
- `model.edges.length` = 139 (real, resolved file→file edges)
- `model.moduleGraph.edges.length` = 0
- `model.moduleGraph.nodes` shows `src/flask` as ONE node (24 files) — `sansio/`, `json/` etc. all collapse
  into it because `moduleOf` caps module depth at 2 path segments and `refineModOf`'s dominant-module
  refinement (§G11, `n >= max(40, files.length*0.5)`) never fires for src/flask (24 files, repo total 99 code
  files — well under the ~50-file threshold; tests/+examples/ dilute the total).

Isolated repro (`repro-004b.mjs`, scratchpad): called `relFactsFor`/`buildEdges` directly on flask's real
`src/flask/*.py` files outside the CLI — got **118 real edges**, including `.ctx`, `.sansio.blueprints`, deep
`..` parent-relative imports. `resolvePythonModule` (python-resolve.mjs) resolves all of them correctly.
There's also a pre-existing, thorough `tests/relations/unit/python-name-resolution-matrix/` suite (22 cases:
relative, parent-relative, absolute, stdlib-silence, etc.) — all passing, unmodified.

**Diagnosis: neither (A) nor (B) as posed.** This is not a resolver bug (A) — Python relative/absolute
resolution works correctly, confirmed both by direct repro and by the existing test matrix. It is also not
quite (B) as literally stated — Python is not "unresolved"; quite the opposite, every file-level edge in the
issue's own examples resolves. The real defect is a **third, disclosure-shaped gap**: `buildEdges` resolves
138(9) real edges, but `moduleGraph`'s own edge-folding step (`if (a === b) continue`, relations.mjs) drops
every one of them because they're all intra-module (same coarse "src/flask" bucket) — and `report()` then
prints "N modules · 0 directed dependencies" with nothing to say that real edges exist and were folded away.
This is exactly the family of bug §G21's `relCoverageNote` already treats (a bare zero must never look like a
measured fact when it's actually a gap/artifact) — just a different cause than "grammar unsupported": module
granularity, not resolution coverage.

Per instructions: did not touch `moduleGraph`, `refineModOf`'s threshold, or `architectureNorms` — that would
be "restructuring moduleGraph," out of scope. `REL_LANGS`/`relSupported` needed no change — Python already
correctly listed and correctly resolving.

Also noted, NOT fixed (nearby): `rulesMarkdown()`'s "## Architecture" section (core.mjs, backs `grain rules`)
never calls `relCoverageNote` at all — a pre-existing, unrelated disclosure gap for THAT command, distinct
from this issue. And `grain map` (`mapSections`) doesn't render a "N directed dependencies" line at all — it
renders `layers:` — so it was never actually the offender the issue title named; `report` is.

## Tests — RED first

New file `plugins/grain/tests/python-module-deps.test.mjs`, modeled on `map-command.test.mjs` /
`relation-coverage.test.mjs`'s CLI-driven fixture style. Three temp git repos:
- `pyIntra`: small `pkg/` (under the refinement threshold) with a relative import (`.other`), an absolute
  import to the same target (`pkg.other`), and a stdlib import (`os`) that must stay silent; plus an
  unrelated `tests/` file so `moduleGraph.nodes.length > 1`.
- `pyCross`: `pkg/sub/deep.py` doing `from ..other import Thing` — a parent-relative import that genuinely
  crosses a module boundary (`pkg/sub` → `pkg`), contrasting with pyIntra.
- `tsCheck`: minimal TS cross-module import, regression control.

Ran against unmodified code — 5/6 passed immediately (confirming the diagnosis: resolution and cross-module
aggregation both already work correctly). The 6th failed exactly as expected:

```
✖ report never shows a bare, unexplained "0 directed dependencies" when real file-level edges exist
  AssertionError [ERR_ASSERTION]: expected an intra-module disclosure line right after the header, got:
  "agent-authored share of code younger than 120 days: n/a · co-change pairs: 0 (bulk commits touching >30
  files excluded from pairing)"
  full output:
  == architecture — 2 modules · 0 directed dependencies · 0 cycle(s) ==
  agent-authored share of code younger than 120 days: n/a · co-change pairs: 0 (...)
  ...
```

## Fix

`plugins/grain/engine/core.mjs`:
- Added `intraModuleNote(model)` right after `relCoverageNote(model)` (~line 2957) — a sibling disclosure
  function, same shape/tone: fires only when `moduleGraph.edges.length === 0` AND `model.edges.length > 0`,
  i.e. real edges exist but none survived module-level folding. Pure render off fields already on the model,
  no new heuristics, no moduleGraph changes.
- Wired it into `report()`'s architecture section (~line 3063), right beside the existing `covNote` line:
  `const intraNote = intraModuleNote(model); if (intraNote) lines.push('  ' + intraNote);`

Message: `"${n} file-level edge${n>1?'s':''} resolved, none crossing a module boundary — the architecture
graph only counts cross-module dependencies"`.

Confirmed GREEN: all 6 new tests pass.

Confirmed on the real flask clone:
```
== architecture — 13 modules · 0 directed dependencies · 0 cycle(s) ==
  resolution does not cover 16 files (bash, json, toml, yaml) — conventions layer only for those
  139 file-level edges resolved, none crossing a module boundary — the architecture graph only counts cross-module dependencies
```

## Red/green re-verification (hand revert, no git)

Removed the one `const intraNote = ...` line via `Edit`, reran `python-module-deps.test.mjs`: 5 pass / 1 fail,
identical failure to the original RED. Restored the line via `Edit`, reran: 6/6 green.

## Full suite

`node --test 'plugins/grain/tests/**/*.test.mjs'`: **1465/1465** (baseline 1459 + 6 new). Zero failures.
No existing test asserted the old buggy behavior (nothing needed to be changed/fixed elsewhere).

## Surprises

- The issue's own example command output ("bare 0, no disclosure at all") didn't reproduce verbatim on a
  freshly-rebuilt index — the `resolution does not cover ... (bash, json, toml, yaml)` line WAS already
  present. The actual bug was one level subtler than "disclosure line missing" — it was "disclosure line
  present but incomplete," covering only one of two distinct reasons a module-level zero can be dishonest.
- `grain map` was never the offending surface for this specific string; `grain rules` has its own, separate,
  unfixed instance of the ORIGINAL (§G21) gap (missing `relCoverageNote` entirely) — flagged, not touched.
