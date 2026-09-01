# Work log — 007: `grain rules` omits the relation-coverage disclosure `report` carries

## Diagnosis
Confirmed: `rulesMarkdown()` (core.mjs, `## Architecture` section, ~line 3159-3168) never called
`relCoverageNote(model)`. Also confirmed the issue's suspicion: `intraModuleNote(model)` (added minutes earlier by
the 004 fix, core.mjs:2957, wired into `report()` at ~3062-3063) was ALSO missing from `rulesMarkdown()` — both
omissions, same root cause (the two renderers were never made to call the same disclosure helpers in this
section).

## Fix
In `rulesMarkdown()`, right after the `## Architecture` heading + summary line (`N modules · N directed
dependencies · N cycle(s)`), added:
```js
const covNote = relCoverageNote(model); if (covNote) lines.push(covNote, '');
const intraNote = intraModuleNote(model); if (intraNote) lines.push(intraNote, '');
```
Each is pushed as its own Markdown paragraph (own line + trailing blank line) rather than `report()`'s 2-space
terminal indent — this document already renders every other architecture-section clause (the summary line, the
"Established layering" aside) as its own plain paragraph, italicized only for asides about exceptions, so a plain
paragraph matches the surrounding idiom better than pasting terminal-style indentation into Markdown.

Checked before changing: neither helper is wrapped in `voice()` in `report()` either (both are plain informational
strings, not voiced claims), so the Markdown version doesn't add a marker either — kept parity.

## Existing-test safety check
Grepped every other test that hand-builds a model and calls `rulesMarkdown()` (`cycle-set-not-chain`,
`pct-rounding`, `health-section`, `answer-grammar`, `voices`) for `moduleGraph`/`edges` fields, to make sure this
change couldn't spuriously introduce a new disclosure line into an existing golden-output assertion:
- `pct-rounding.test.mjs`: `moduleGraph: null` → whole architecture block (including the new lines) is skipped by
  the outer guard. Safe.
- `answer-grammar.test.mjs`: deletes `model.moduleGraph` for the relevant test. Safe.
- `health-section.test.mjs`: never sets `moduleGraph` at all → guard skips. Safe.
- `cycle-set-not-chain.test.mjs`: sets `moduleGraph` but not `filesAll`/`edges` → `relCoverageNote` sees
  `filesAll: []` (returns null), `intraModuleNote` sees `n = (model.edges||[]).length === 0` → returns null via
  its own `!n` short-circuit. Safe — ran this file after the fix to confirm (still green).
- `voices.test.mjs`: uses a REAL indexed fixture (build-fixture.mjs) via the CLI, so its `moduleGraph`/`edges` are
  real. The only `rules`-invoking tests there use `.match()` against specific decided-voice lines, not a whole-
  document comparison, so an extra unrelated disclosure line elsewhere in the doc can't break them. Ran the full
  file after the fix to confirm (still green).

## Tests — written first, confirmed RED, then GREEN
File: `plugins/grain/tests/rules-coverage-note.test.mjs`, reusing the exact fixture shapes already proven in
`relation-coverage.test.mjs` (relCoverageNote) and `python-module-deps.test.mjs` (intraModuleNote/§004), so the
fixtures' own correctness isn't newly at risk.

1. **relCoverageNote parity**: `mixedRepo` (2 TS files wired by one import + 3 `.zig` files, no relSupported()
   extractor). RED before the fix:
   ```
   ✖ `grain rules` carries the same relation-coverage disclosure as `grain report`, for the identical model
     AssertionError: grain rules must carry the same coverage disclosure report() does, got:
     ... (no "resolution does not cover" line anywhere in the rules output) ...
   ```
   GREEN after: `grain rules` output contains `resolution does not cover 3 files (zig) — conventions layer only
   for those` under `## Architecture`, matching `grain report`'s own line for the identical model.

2. **intraModuleNote parity (§004)**: `pyIntra` (small Python package under the §G11 dominant-module threshold,
   with `rel_user.py`+`abs_user.py` both importing `pkg/other.py` — 2 real file-level edges that fold to 0 at
   module level). RED before the fix (same shape: no disclosure line in `grain rules`). GREEN after: `grain
   rules` carries `2 file-level edges resolved, none crossing a module boundary`, matching `report()`.

3. **Regression control**: an all-relSupported, real-cross-module-edge TS repo gets neither disclosure line in
   `grain rules` — passed both before and after (nothing to regress here, confirms the fix is conditional on the
   same gap `report()` detects, not unconditional).

## Full suite
`node --test 'plugins/grain/tests/**/*.test.mjs'` → **1471/1471** (baseline 1465 + 6 new tests here and in 005).

## Revert/restore verification (mandatory process, no git stash/checkout used)
Manually reverted the two-line `rulesMarkdown()` hunk via `Edit`. Re-ran `rules-coverage-note.test.mjs`: tests (1)
and (2) failed with the exact RED shown above, test (3) still passed. Restored the fix via `Edit`; all 3 tests
green again.

## Nearby, not fixed (reporting only)
See the 005 log's "nearby, not fixed" note — `grain how --json`/MCP `grain_how` drop `matches[].score` from their
public contract even though `howCmd` computes it and both `howEval` and `how-hook` read it internally. Unrelated
to 007 itself but found while auditing `how`'s aggregation for 005; recorded here too since it touches the same
file.
