# 138 · Horde: audit as sampling with an adaptive rate and a published refutation rate; recurring rulings become rule proposals; decisions per merged ticket; quality index at wave close

**Status:** OPEN
**Found by:** director, 2026-09-06
**Severity:** medium
**Repo:** /home/user/horde · branch `claude/grain-agent-tool-b89y0x` · worktree, do not push
**Rulings:** `audit-is-spc`, `escalations-become-rules`, `quality-always-authorised` · after 137 landed (and 135 for the quality index through `yg`) · mission §6 E14
**Class:** opus

## What

1. **Audit as sampling.** `hordes/<h>/audit.json`: samples, refutations, current rate (tickets audited per
   wave). Rule: a refutation among the last five samples doubles the rate (up to every merged ticket); fifty
   clean samples halve it (never below one per wave). `wave.mjs close` records the wave's verdicts into it and
   prints refutations/samples with a Wilson 95% interval; `wave.mjs audit-plan` prints how many tickets to
   audit next wave and picks them at random from the wave's merges (the director's brief uses it instead of
   "one at random").
2. **Escalations → rules.** `escalate.mjs recurring`: groups ruled escalations by (kind, node); a group with
   three or more prints a rule proposal: the rulings as evidence, a one-line rule text, and the exact `yg
   advise`/`yg log add` command to file it (through `config.ygCommand`); until 144 lands it prints the
   command for the architect to run.
3. **KPI.** `wave.mjs close` prints human decisions (ruled escalations) per merged ticket for the wave and the
   trend across waves.
4. **Parallelism and transfer.** `wave.mjs close` prints planned vs achieved parallelism (layers from `queue
   plan --json` at wave start, stored in the journal by `wave.mjs start`, vs the merge timeline) and the number
   of keys transferred without re-review (`premerge` appends a journal note when a transfer happens; add it
   there).
5. **Quality index.** From `yg check --json` at the trunk tip via `config.ygCommand`: enforced rules, advisory
   rules with zero new violations, baseline violations, noise floor, coverage; printed at wave close with the
   delta from the previous wave; a decrease is an escalation (`escalate.mjs add … --kind quality`).
6. `director` section of `SKILL.md`, `steward.md`, `templates/wave-close.md`, `scripts/README.md`, CHANGELOG
   `[Unreleased]` in adopter language.

## Acceptance

- [ ] E14 on real temp repos (the quality index test uses the real Yggdrasil build on a fixture graph).
- [ ] Suite green; commits with session trailers; report branch, test count, shas.
