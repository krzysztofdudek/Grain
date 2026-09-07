# 146 · Grain: the scope co-change cap keeps within-file and cross-file pairs in separate budgets; existing consumers re-measured before merge

**Status:** LANDED — merged 179fde7
**Found by:** director, 2026-09-06 (from escalation 23, ticket 131)
**Severity:** medium
**Repo:** <grain> · branch `claude/grain-agent-tool-b89y0x` · worktree, do not push
**Rulings:** escalation 23 (approved as a structural fix), escalation 22 (refused: no new floor), `quality-always-authorised`
**Class:** opus

## Why

`model.scopeCochange` is capped at 5000 pairs sorted by descending support (`learn.mjs`). Within-file pairs
saturate that budget on any repository with large files: on express all 5000 retained pairs are within one file
and all 36 cross-file pairs the store holds are dropped before any consumer sees them. The surface is biased by
construction, and every cross-file consumer (`grain advise`'s relation kind, and any future one) is starved
upstream of its own gate. Measured in `.system/research/node-cochange-measurement.md`.

## What

1. Split the cap into two populations with the same total budget: within-file pairs and cross-file pairs each
   capped separately (each sorted by descending support). No new constant: derive the split from the existing
   budget (e.g. half and half, or proportional to the populations' sizes — say which and why, from the four
   oracles' numbers). `HIST_V`/`MODEL_V` bump only if the persisted shape changes (derive from `config.mjs`'s
   own rules for when each bumps; report the derivation).
2. **Before merge, re-measure** every existing consumer of scope co-change on the four oracles with the same
   instruments used before (`completeness`, `where`'s partners, `what`'s tested-by; the instruments under
   `selftest`): precision must not drop. If it drops, the change does not ship; write the memo and stop.
3. After it lands: re-run `grain advise` on the four oracles with the same mutual gate and floor and append the
   table to `.system/research/node-cochange-measurement.md`. The relation kind's verdict stays "data, not
   advice" unless that table says otherwise; do not change the disclosure line without the numbers.
4. Tests on the oracles; budget and cycle tests; `docs/validation.md`; `tk.mjs log 146` at start, measurement,
   end.

## Acceptance

- [ ] On express, cross-file pairs are retained; on the four oracles the within-file consumers' precision is
      unchanged or better (table in the memo).
- [ ] Suite green; commits with session trailers; report branch, test count, shas, both tables.
