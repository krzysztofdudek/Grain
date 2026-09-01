# log — 025

- 2026-09-01 · filed by the cross-check test-suite designer. Found by
  `tests/cross-check-json-text.test.mjs`'s generic loop (every `--json` command must emit one parseable JSON
  document; the loop is the generalization of the `where` leak fixed in where-json-member-line.test.mjs).
  selftest is the only command of eight that fails it; verified at extractor g27.

- 2026-09-01 · fixed: `engine/grain.mjs`'s `case 'selftest'` built its `--json` output as a 2-element
  `lines` array (`[JSON.stringify(res, null, 1), stamp()]`), same for the no-history-for-`--how` early
  return and the `howEval` `--how --json` branch — three spots, all folded to a single JSON.stringify call
  carrying the stamp as an `asOf` field (`{ ...res, asOf: stamp().replace(/^as of /, '') }`), matching every
  other command's own convention. `mutate-test` was deliberately left untouched — the code's own comment
  says its two-part text+stamp format vs. selftest's is an intentional asymmetry, not this ticket's scope.
  Updated `tests/selftest.test.mjs` (c) to parse `selftest --json` directly (no more `.replace(/\nas of .*$/,
  '')` workaround) and to assert the new 7-key shape (`asOf` added) while still checking the underlying
  detection payload is an unmodified passthrough of `mutate-test`'s own (still-stripped) result. Confirmed
  red first (the generic loop in `cross-check-json-text.test.mjs` failed with "Unexpected non-whitespace
  character after JSON"), fixed, confirmed green (that generic loop now passes for all 8 `--json` commands,
  and `tests/how-eval.test.mjs`'s many `selftest --how --json` call sites — which also stripped the trailing
  line defensively — needed no changes since the strip is now a harmless no-op). Hand-reverted all three
  hunks together and confirmed both the generic-loop test and the updated selftest.test.mjs (c) go red, then
  restored.
