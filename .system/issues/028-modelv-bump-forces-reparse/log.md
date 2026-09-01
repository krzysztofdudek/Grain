# log — 028

- 2026-09-01 · filed by the cross-check test-suite designer, from the cache-invalidation suite
  (`tests/cross-check-cache-invalidation.test.mjs`, 9/9 green — the MODEL_V test asserts the OBSERVED
  discard-and-reparse behavior with a pointer here, so either resolution direction is a one-assertion flip).
  Method: sentinel corruption planted per cache layer + recorded-version tampering, with negative controls
  proving each cache is genuinely consulted when version-current (so the invalidation results are not
  vacuous cache-bypass).

- 2026-09-01 · resolved by fix-028 agent, resolution (1): decoupled `versionOk`.
  - Root cause confirmed by reading `learn()` (core.mjs): `treeCacheOut` (the on-disk tree cache) is built at
    core.mjs:1410, from `serializeScope(s)` snapshots taken immediately after `extractTree`, BEFORE any
    model-schema-versioned logic runs (`addModuleScopes`, `applyVocab`, `auto.filebirth`, `mdlCuts`,
    `groupPartitions`, `mine`, roles, history enrichment — all further down in `learn()`). `serializeScope`'s
    `preds: { ...s.preds }` takes a shallow copy at that moment, so later in-place mutations of `s.preds`
    (vocab/history predicates) never leak into the cached record. The extraction-cache-hit path in `extractTree`
    (core.mjs:1348-1349) feeds cached scopes into the exact same downstream pipeline as freshly-parsed ones, with
    no branch conditioned on MODEL_V. Conclusion: the tree cache is a pure function of (extractor version, grammar
    version, file content) and cannot be semantically stale w.r.t. MODEL_V.
  - Fix: `engine/grain.mjs` `ensureFresh` now computes `extractOk` (engine+extractor+grammars) separately from
    `versionOk` (`extractOk && model===MODEL_V`); the tree-cache load (`treeCache = extractOk ? readJson(...) : null`)
    is gated by `extractOk` alone. `versionOk` is unchanged in every other use (the "fully fresh, no work" fast
    path, and the STALE banner text) — a MODEL_V-only staleness still forces a real relearn, it just gets to reuse
    a version-current tree cache while doing it. The full-history-walk-forcing `!versionOk` check and the
    config.mjs MODEL_V comment were left untouched (out of scope; the comment is now true).
  - Test: flipped the one named assertion in `cross-check-cache-invalidation.test.mjs`'s MODEL_V invalidation
    subtest from `!includes('zqTREETAMPERED')` to `includes(...)` (tree cache now survives), reworded the
    surrounding FINDING comments/test titles to record 028 as resolved, kept every other assertion (including the
    exact-match-with-pristine-control check on `report --json` output) untouched and passing.
  - Verified empirically: hand-reverted the two-line grain.mjs change via Edit — the flipped assertion failed
    exactly as expected (proving it's load-bearing) — then restored via Edit and reran to 9/9 green.
  - Full suite: 1702 tests, 1685 pass, 17 fail (was 1702/1683/19 before this session) — no new failures; the two
    fewer are pre-existing/other-agent-owned (deadpaths co-change SWEEP tests, concurrently being worked by
    fix-020-023-deadpaths — not touched by this fix).
