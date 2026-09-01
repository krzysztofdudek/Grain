# log — 027

- 2026-09-01 · filed by the cross-check test-suite designer, from the export-parity suite's findings
  (`tests/cross-check-export-parity.test.mjs`, 11/11 green — this gap is asserted as observed behavior, with
  the flip-to-parity instruction recorded in the acceptance). All four recent export extensions
  (changeArchetypes, twins, moves, reshaped valueSiblings) checked clean against their renderers on the same
  fixture; coverage is the one family with no export counterpart.

- 2026-09-01 · FIXED. `core.mjs`: factored `relCoverageNote(model)` into an exported `relCoverageData(model)` →
  `{n, grammars}`, with `relCoverageNote` now just formatting that data's string. `export.mjs`: imports
  `relCoverageData`, adds a top-level `relCoverage: relCoverageData(model)` field (additive, no schema bump per
  export.mjs:4-5's own rule) and a `schemaNotes.relCoverage` entry. Confirmed `intraModuleNote`'s sibling case
  needs no treatment — export already carries `edges`/`moduleGraph`, from which a consumer can derive the same
  fact intraModuleNote renders; no test exercises it in this file, matching the issue's own "explicitly not in
  scope" note.
  Before: `grain export --compact` on a repo with a planted `.zig` file had no `file`/`grammar`/`coverage` key
  anywhere in its schema (topKeys/summary both clean under `/file|grammar|coverage|uncover/i`).
  After: live-checked on a fresh fixture with one zig file — `status` prints
  `resolution does not cover 2 files (json, zig) — conventions layer only for those`; `export --compact` now
  carries `"relCoverage":{"n":2,"grammars":["json","zig"]}` — exact parity.
  Tests: flipped `cross-check-export-parity.test.mjs`'s coverage test from asserting the gap to asserting
  `d.relCoverage` deep-equals the live `status`/`report` disclosure; added a second test building a from-scratch
  all-TypeScript repo (the shared build-fixture always carries a `package.json` JSON-grammar gap, so it can't
  serve as the "full coverage" case) asserting the honest empty shape `{n: 0, grammars: []}`. Both pass;
  hand-reverted the export.mjs field addition to confirm the flipped test goes red without it, then restored.
