# 028 · A MODEL_V bump silently forces a full re-parse, contradicting its own documented semantics

**Status:** FIXED — resolution (1), versionOk decoupled; verified independently (revert reproduces 2 reds)
**Found by:** cross-check test suite (cache invalidation), 2026-09-01, on grain 0.3.0 · extractor g28
**Severity:** low — no wrong answers; a performance promise and its implementation disagree

## Symptom

`config.mjs`'s own comment on `MODEL_V`: "bump when the model gains fields queries depend on (**forces a
re-learn, not a re-parse**)". Measured with sentinel-tampered caches (tree.json sentinel + version tampering,
`tests/cross-check-cache-invalidation.test.mjs`):

- MODEL_V-only staleness → model relearned (correct) AND the tree-extraction cache discarded and rebuilt
  (the sentinel was erased) — a full re-parse, which the comment says should not happen. Blob shards were
  kept (byte- and mtime-identical), so the blob layer behaves as documented.

## Root cause (read from source)

`ensureFresh` (engine/grain.mjs) folds engine/extractor/model/grammars checks from `.grain/cache/meta.json`
into ONE shared `versionOk` boolean; if any is stale, `treeCache` is nulled for all. So MODEL_V cannot be
stale without also throwing away the tree cache, even though the tree cache's own gate (`EXTR_V` via
meta.json `"extractor"`) is version-current.

For reference, the full recorded-version layout (established by the same suite, first direct evidence all
three gates work at all): EXTR_V in meta.json `"extractor"` + `blobs/VERSION` + history.json `"x"`;
HIST_V in history.json `"h"`; MODEL_V in meta.json `"model"`. EXTR_V and HIST_V rebuild scopes match their
documentation exactly.

## Decision needed

Either split `versionOk` so a MODEL_V-only staleness keeps a version-current tree cache (delivering the
documented "re-learn, not re-parse" — cheap on large repos where parse dominates), or amend the comment to
say what the code does ("forces a full rebuild"). Both are legitimate; the current state — a maintainer
bumping MODEL_V believing it is cheap — is not.

## Explicitly NOT in scope

- Any integrity checking of version-current caches (they are trusted blindly by design — "disposable,
  gitignored"; observed and recorded as fact by the same suite, not a defect).
- EXTR_V/HIST_V semantics (verified correct).

## Acceptance

Either: a MODEL_V-only staleness rebuilds the model while the tree-cache sentinel SURVIVES (the invalidation
suite's MODEL_V test flipped to assert survival — currently it asserts the observed discard, with a comment
pointing here), and the comment stands; or the config.mjs comment is corrected and the test's current
assertion is kept with the decision recorded here.
