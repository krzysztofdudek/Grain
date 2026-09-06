# 143 · Grain: the difference between a proposal and the graph the adopter accepted becomes an oracle, with precision and recall against it

**Status:** LANDED — merged 1856d72
**Found by:** director, 2026-09-06
**Severity:** medium
**Repo:** /home/user/Grain · branch `claude/grain-agent-tool-b89y0x` · worktree, do not push
**Rulings:** `production-is-the-corpus`, `examples-are-not-oracles` (an accepted graph is an oracle by the same definition the four existing ones use) · mission §6 E19
**Class:** opus

## What

1. `grain oracle record [--proposal <file>] [--graph .yggdrasil] [--name <n>]`: stores, under
   `plugins/grain/tests/stress/oracles/<name>/` or a user-chosen directory outside the repo (`--out`), the
   proposal as emitted and the graph as accepted (nodes, mappings, relations, ports, aspects with statuses),
   plus a `correction.json` listing what the adopter changed: nodes merged, split, renamed, dropped, added;
   relations added or removed; rules dropped, promoted or edited. Consent is explicit: the command prints what
   it will store and where, and `--out` outside the repository is the default when the graph is not one of
   the repository's own fixtures.
2. `grain oracle score <name>`: precision and recall of the proposal against the accepted graph using the same
   measures the existing four-oracle instruments use (`oracles-4-measurement.md`), so a fifth oracle is scored
   the same way as the first four; the reconstruct test accepts oracles recorded this way.
3. Record the Yggdrasil repository itself as the first such oracle (its accepted graph is the live one; the
   proposal is `grain propose` on it) and report the score in the memo `.system/research/oracle-5-yggdrasil.md`.
4. Engine budget and cycle tests; tests on real fixtures; `docs/validation.md`; README command list; log via
   `tk.mjs log 143`.

## Acceptance

- [ ] E19: record on a fixture, score prints precision/recall; the Yggdrasil oracle recorded and scored; the
      reconstruct test runs it.
- [ ] Suite green; commits with session trailers; report branch, test count, shas, the score.
