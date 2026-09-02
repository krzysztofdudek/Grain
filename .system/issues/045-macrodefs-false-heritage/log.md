# Log

## Landed, fix/045

Worktree was one commit behind `main` (missing 509e786, which carries the `what` command and §018
phase 2 — the code the ticket's line numbers and tests assume). Fast-forwarded `fix/045` onto `main`
first; no divergent commits existed yet, so this was a clean fast-forward, not a rebase/merge.

Applied the agreed change verbatim: `macroDefs` deleted, `sup: []` at the file-scope push, `macroDoc`
kept as-is. For the kod-to-kod retirement, found that `b.macroCall` (a Set) already exists in
`bindingFor` from the merged §018 phase-2 work — generically derived per-grammar, matching exactly
`macro_invocation` in Rust and nothing in any other shipped grammar. Used it directly:
`b.nodeTypes.has('macro_invocation')` → `b.macroCall.size`, `descendantsOfType('macro_invocation')` →
`descendantsOfType([...b.macroCall])`. No config.mjs change needed for this ticket.

Copied the scratchpad's `macro-file-sups.test.mjs` into `plugins/grain/tests/`. Verified red/green by
reverting the two edits (via Edit, not git stash), confirming (1)/(2)/(3) fail and (4)/(5)/precondition
pass against pre-fix code, then reapplying and confirming all 6 green.

Full suite: `npm test` → 1831/1831 pass (0 fail) — the ticket's baseline 1825 plus these 6 new tests.

Commit: see fix/045 branch, worktree
`<repo>/.claude/worktrees/agent-a1ce6d14bff289e9c`.
