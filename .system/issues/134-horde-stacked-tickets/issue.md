# 134 · Horde: a dependent ticket starts from its unmerged dependency's tip (a stack); keys transfer when the parent lands

**Status:** LANDED — merged 31a9f6c
**Found by:** director, 2026-09-06
**Severity:** high
**Repo:** <horde> · branch `claude/grain-agent-tool-b89y0x` · worktree, do not push
**Ruling:** `stacked-tickets` · after 126 and 127 landed · mission §6 E11
**Class:** opus

## Why

`queue next` hands out a ticket only when every dependency is merged, so a chain 101 → 102 → 105 costs three
waves of wall-clock even when each ticket takes an hour. With keys bound to the diff (126), 102 can be written
and verified on top of 101's unmerged branch: when 101 lands, 102's catch-up leaves its patch-id unchanged and
its keys hold. Merge order is still enforced by `dependsOn`.

## What

1. `queue.mjs set NNN running --on MMM`: MMM must be a `running` or `landed` dependency of NNN in the same team;
   the ticket branch is created off `<horde>/t-MMM`'s tip instead of the team tip; the queue item records
   `stackedOn: MMM`. `queue next --stack` also offers such tickets (a queued ticket whose only unmerged
   dependencies are running/landed with branches) marked `stack-ready`, after the fully ready ones.
2. Parent resolution in one function used by `premerge`, `brief.mjs worker` and `queue reconcile`: while
   `stackedOn` names an unmerged ticket, the parent is that ticket's branch; once it is merged, the parent is
   the team branch and `stackedOn` is cleared by the same write that records the merge (`queue set MMM
   merged`). Base freshness, scope, revert test, the diff whose patch-id keys bind to, and the range-diff (126)
   all use that parent.
3. `worker.md` first action merges the stack parent, not the team branch, when stacked; the brief says so and
   names it.
4. Merge order: `queue set NNN merged` still refuses while any dependency is unmerged (as today).
5. `scripts/README.md`, `steward.md` (when to stack: a chain on the critical path with idle parallelism),
   CHANGELOG `[Unreleased]` in adopter language.

## Acceptance

- [ ] E11: 102 stacked on running 101; verifier records keys on 102; 101 merges to the team; 102 catches up
      (`git merge team`) → premerge item 1 ✓ (parent now team), item 2 ✓ keys bound to diff, item 5 re-runs;
      102 merges. Counter-case: 101 is amended inside 102's hunk context before landing → 102's keys go to
      scoped re-review with a range-diff file.
- [ ] Refusals: `--on` a ticket that is not a dependency, or is in another team, or is merged already.
- [ ] Suite green; docs and briefs; commits with session trailers; report branch, test count, shas.
