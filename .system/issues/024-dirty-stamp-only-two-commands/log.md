# log — 024

- 2026-09-01 · filed by the cross-check test-suite designer. Found by
  `tests/cross-check-freshness.test.mjs`'s stamp property loop (every read command × clean/dirty worktree).
  8/10 commands red on the dirty side only; verified stable across two runs at extractor g27.
- Root cause is static: only `cmdCheck`/`cmdSpectrum` pass a dirtiness argument to `stamp()`; all other call
  sites call it bare. Discovered by the implementing agent reading `engine/grain.mjs`, confirmed by the
  uniform failure shape (dirty side only, clean side always correct).
- 2026-09-01 · re-scoped after orchestrator ruling: `+dirty` may only mean "this answer incorporates your
  uncommitted edits" (check's meaning). The 8 bare-stamp commands are CORRECT as-is; the defects are (a) the
  over-promising doc sentence, (b) spectrum/explain's +dirty-while-rendering-HEAD (a false claim, tied to
  013), (c) the missing distinct dirty-tree disclosure for HEAD-readers. cross-check-freshness.test.mjs being
  re-targeted accordingly: the previously-implied fix (add +dirty to 8 call sites) now turns tests RED.
- 2026-09-01 · fixed, jointly with 013 per the cross-reference ruling.
  (a) doc over-promise: narrowed both occurrences in `engine/grain.mjs` (the file-header comment and the
  `USAGE` string) from "every answer ends with `as of <sha>[+dirty]`" to "every answer ends with `as of <sha>`;
  `check`/`review`/`explain`/`spectrum` append `+dirty` when they read uncommitted content — other commands
  never claim it, and note a dirty worktree separately instead." README.md, docs/reference.md and
  skills/grain/SKILL.md already scoped the claim correctly (`+dirty` tied to "the file was read from an
  uncommitted worktree") — left untouched.
  (b) spectrum/explain's false `+dirty`: resolved by 013's fix (spectrum now genuinely reads the worktree for
  the queried file), so the existing `stamp(fileDirty(root, rel, isGit))` call in `cmdSpectrum` is now
  truthful and needed no change itself.
  (c) new distinct disclosure for the 8 HEAD-readers (`where`/`how`/`what`/`map`/`status`/`report`/`rules`/
  `completeness`): added `DIRTY_TREE_NOTE` (exported from `engine/core.mjs`, same register as
  `relCoverageNote`/`intraModuleNote` — a plain declarative sentence, no voice() wrap) and `repoDirty(root,
  isGit)` (engine/grain.mjs) — one `git status --porcelain` call per invocation, filtered through the
  existing `HARD_EXCL` regex so grain's own uncommitted `.grain/.gitignore`/cache bookkeeping never falsely
  reads as "your worktree is dirty" (this filter is load-bearing — verified by hand-reverting it: all 8
  HEAD-reader tests go red because `.grain/` is untracked in the test fixtures). `treeDirty` is computed once
  in `main()` and threaded through `ctx`; each of the 8 commands splices `DIRTY_TREE_NOTE` into its lines
  right before `stamp()` when dirty. `rules` is the one exception in mechanics, not in outcome: since its
  no-`--out` stdout IS the generated document (the CLI's own ephemeral `stamp()` is deliberately kept off
  stdout there already), the note is threaded into `rulesMarkdown(model, { …, dirty })` as a new trailing
  `*<note>*` line alongside the existing `*as of <sha>*` — a snapshot-time fact, persisted in the document
  itself (both the stdout and `--out` file paths), not just echoed on the CLI. The `--out` confirmation line
  also gets the note for a caller who never opens the file.
  Suite: 1689 pass/13 fail -> 1700 pass/2 fail (the 2 remaining are ticket 014's Go const/var extraction,
  unrelated, left red on purpose). No version bump: no cache schema or extraction-output change, pure
  query-time/CLI behavior — reported to the requester rather than touching config.mjs.
