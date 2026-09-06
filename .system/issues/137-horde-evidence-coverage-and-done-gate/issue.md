# 137 · Horde: `status` shows evidence coverage in five states; `horde done` refuses with what stands in the way; dropping a row after wave 1 escalates

**Status:** LANDED — merged on Horde feature branch
**Found by:** director, 2026-09-06
**Severity:** high
**Repo:** /home/user/horde · branch `claude/grain-agent-tool-b89y0x` · worktree, do not push
**Ruling:** `evidence-is-the-plan` · after 126 and 127 landed · mission §6 E13
**Class:** sonnet

## Why

The charter's evidence catalogue is the plan; "queue empty" is never "done". Today a row without a ticket is
silent, progress is counted in tickets, the mission's end is a sentence in the director's brief, and a hard row
can be deleted from the charter without anyone noticing.

## What

1. `status.mjs`: an "Evidence" block: every charter row with one of five states — no ticket / queued / running
   / merged / reproduced — derived from tickets' `**Evidence:**` fields, `queue.json`, and verdict blocks
   (`wave.mjs close` already turns rows green from reproduced verdicts; share that code). `--json` carries it.
2. `horde.mjs done [--horde h]`: the mission's final gate. Refuses, listing every reason, when any row is not
   reproduced, when the trunk gate is not green at the trunk tip (`gates.trunk`, run it), when no audit verdict
   exists for the current wave, or when the cost report for the mission is missing (`cost.mjs report`); otherwise
   appends the completion block to the journal, stamps the charter, and prints what the user does next (push).
3. `horde.mjs charter edit`: after wave 1 has started, a rewrite that drops a row refuses unless
   `--escalation <id>` names a ruled escalation (`escalate.mjs`) whose text mentions the row id; the log line
   records it. Dropping before wave 1 stays free.
4. `SKILL.md` director section and `steward.md` step 7 reference `done`; `scripts/README.md`; CHANGELOG
   `[Unreleased]` in adopter language (the mission now ends only when every promised proof is reproduced; the
   status screen shows each proof's state).

## Acceptance

- [ ] E13 on real temp repos: five states shown; `done` refuses naming a red row and a missing audit, then
      passes after a reproduced verdict, a green trunk gate, an audit and a cost report; row drop refused
      without an escalation, accepted with one.
- [ ] Suite green; commits with session trailers; report branch, test count, shas.
