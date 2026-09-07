# 128 · Horde: fix-loop breaker, flake as an incident, the approval seat when the author owns the node

**Status:** LANDED — merged 4529fe1 on Horde feature branch
**Found by:** director, 2026-09-06
**Severity:** medium
**Repo:** <horde> · branch `claude/grain-agent-tool-b89y0x` · work in a worktree, do not push
**Rulings:** `flake-is-an-incident`, `horde-of-one-deferred` (only the approval-seat rule enters now) · mission §6 E8
**Class:** sonnet

## Why

`tk.mjs status NNN changes "<why>"` has no round limit: the same "repeat until approved" loop Superpowers' fix-loop
spec diagnosed as its biggest cost variance. A verifier that cannot reproduce once raises escalation #7 to the
human, so flaky tests flood the human. When the author is the node's owner and no architect exists, nobody can
approve, and the rule "never review your own ticket" has no seat to fall back on.

## What

1. **Rounds.** `config.fixRounds = { resume: 3, fresh: 2 }` (defaults in `horde.mjs defaultConfig`, settable by
   `config set`). `tk.mjs status NNN changes` counts the round in the ticket log (`round N`) and prints it in its
   result. Rounds 1–`resume`: the steward resumes the **same** worker with the findings (SendMessage by the
   `agentId` the roster already records). Rounds `resume+1`–`resume+fresh`: a **fresh** worker one class up
   (next heavier class in `config.classes`; `roster.mjs spawn` already refuses a lower one), with a takeover
   framing rendered by `brief.mjs worker NNN --takeover` ("a prior worker attempted this N times; the ticket is
   yours; here is its log"). Beyond the cap: `tk status changes` refuses with the next step printed —
   `escalate.mjs add "<why>" --kind adjudicate --ticket NNN` (new kind) and `queue set NNN escalated`.
   Rulings, not stalls. A finding that contradicts the charter or a contract goes to the director at once, at
   any round (steward.md).
2. **Flake.** `verify.mjs record` accepts `--runs <n> --results <r1,r2,…>`; two differing results → verdict
   `flaky`, the verdict block names the test, the ticket goes to `changes "flaky: <what>"` with the instruction
   to make the test deterministic, and the flake is recorded as an incident: through `yg incident` when the
   repository has a graph (`config.ygCommand`; derive the exact subcommand from the installed CLI's `--help`,
   never assume), else a journal note. `verifier.md`: on a failed reproduction run once more before recording;
   never escalate #7 on a first failure.
3. **Approval seat.** `tk.mjs review approve --by <name>` accepts the ticket's verifier when the ticket's author
   is the node's owner (roster) and the roster has no live architect; the Keys line marks it (e.g.
   `name(verifier-seat)@…`) and `premerge` accepts it. Otherwise the existing refusal stands.
4. Briefs (`steward.md`, `verifier.md`, `worker.md` takeover section), `scripts/README.md`, CHANGELOG
   `[Unreleased]` in adopter language.

## What is NOT in scope

Scoped re-review (126), stacking (134), disciplines text (129).

## Acceptance

- [ ] E8: round counting through three `changes`; the fourth prints "fresh worker, class up"; the sixth refuses
      with the escalate command; `escalate add --kind adjudicate` works; `brief worker --takeover` renders the
      log and the framing.
- [ ] `verify record --runs 2 --results red,green` → verdict `flaky`, ticket in `changes`, incident recorded
      (test both with a stub `ygCommand` that records its argv and without a graph).
- [ ] Approval-seat: verifier approval accepted only under both conditions; refused otherwise.
- [ ] Full suite green; docs and briefs updated; commits with session trailers; report branch, test count.
