
- 2026-09-01 · fixed: `cmdHow`'s `--json` branch (`engine/grain.mjs`, the `matches.map(...)` inside the
  `opts.json` return) dropped `score` even though `howCmd` (core.mjs) already computes and returns it
  (`+m.score.toFixed(3)`, per match). Added `score: m.score` to the emitted match object — purely additive,
  no version/schema bump (export.mjs:4-5's own precedent). Decision: `places[]` already carries `weight`
  (005) — left as-is; `score` on `matches[]` is enough for symmetry, no further change needed there. MCP
  `grain_how` calls `cmdHow` directly (`bin/grain-mcp.mjs`), so it inherits the fix automatically; verified
  `tests/how-command.test.mjs` (c)'s existing `grain_how` ≡ `how --json` assertion still passes unmodified.
  Red confirmed first (`cross-check-json-text.test.mjs`'s "every JSON match carries a numeric score" failed
  with `actual: 'undefined'`), fixed, confirmed green, then hand-reverted/restored the one-line change to
  prove it load-bearing (test flips back to the same red without it).
