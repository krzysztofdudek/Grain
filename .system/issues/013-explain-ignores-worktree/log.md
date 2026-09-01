# log — 013

- 2026-09-01 · filed at retest round 1 (python/flask): `explain`/`spectrum` render HEAD-cached scopes for the
  queried file, so a live edit (even one removing `@setupmethod` from `add_url_rule`, which `check` catches
  instantly) is invisible to `explain`.
- 2026-09-01 · orchestrator ruling: `spectrum`'s existing `+dirty` stamp on a dirty target file (present since
  16fa901) does not discharge this ticket — it is a FALSE claim under the stamp's own semantics (`+dirty` =
  "this answer incorporates your edits"), and is more serious than the original silent-staleness framing.
  Cross-referenced with 024(b); the two are to be fixed together.
- 2026-09-01 · fixed, jointly with 024, by making `spectrum()` (engine/core.mjs) read the worktree, per the
  ruling's stated preference ("prefer reading the worktree if the cost is acceptable").
  Change: `spectrum()` used to build `ps` (every scope spectrum's cell-population math runs over) from
  `scopesAll`, the HEAD-indexed tree cache, for every file in the partition including the one being queried —
  except a brand-new untracked file, which §G20 already parsed live because it had no cache entry to replay.
  This generalizes that: after assembling `ps` from the cache, the queried file's own cached scopes are
  dropped (`ps.filter(s => s.rel !== rel)`) and re-added by parsing its CURRENT disk content the same way
  §G20 already does for untracked files (`getParser`/`bindingFor`/`extractScopes`, no `hydrateScope` needed
  since a fresh parse already yields native Sets). Every other file in the partition still comes from the
  cache — only the one file the user is asking about gets a live read.
  Cost measured: one extra single-file tree-sitter parse per `spectrum`/`explain` call — the same parse
  `checkFile` already performs for the identical file on every `check` call (`checkFile` always does
  `readFileSync` + parse, ungated by dirty status). Negligible; no repo-wide reparse, no change to the
  tree/blob cache.
  Consequence for `+dirty`: with the target file now genuinely read live, `cmdSpectrum`'s existing
  `stamp(fileDirty(root, rel, isGit))` call (grain.mjs, unchanged) is truthful for the first time — closing
  024(b) as a side effect, with no separate change needed there.
  Verified both directions per the acceptance criterion: a clean worktree round-trips byte-identical output
  (013 regression-guard test, unaffected); a dirty worktree now changes `explain`'s own scope count and its
  role-scoped NORM row correctly flags `auto.extends:Command` deviation on a live-edited file that removed
  `extends Command` (the "sharper case" test in cross-check-freshness.test.mjs) — both were RED before this
  fix and are GREEN after. Hand-verified load-bearing by reverting the `spectrum()` hunk alone: the 3
  explain/013 tests (the two 013 acceptance tests plus the +dirty-must-reflect-the-edit stamp test) went red
  again, all 8 HEAD-reader tests stayed green — confirming the two fixes (013 here, 024(c) in grain.mjs) are
  independent of each other in the test suite despite being decided together.
  Suite: 1689 pass/13 fail -> 1700 pass/2 fail (2 remaining are ticket 014's, unrelated, left red on purpose).
