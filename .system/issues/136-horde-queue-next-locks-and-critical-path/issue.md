# 136 · Horde: `queue next` honours file locks, prefers node-disjoint tickets, orders by remaining critical path; quality tickets last

**Status:** LANDED — merged on Horde feature branch
**Found by:** director, 2026-09-06
**Severity:** medium
**Repo:** /home/user/horde · branch `claude/grain-agent-tool-b89y0x` · worktree, do not push
**Rulings:** `evidence-is-the-plan`, `quality-always-authorised` · after 127 landed · mission §6 E12
**Class:** sonnet

## What

`queue.mjs next` (keep the interface; add `--why`):

1. Hard: skip a ready ticket whose declared `Files` intersect any `running` ticket's `Files` in the team; a
   ticket without `Files` locks its whole node (safe degradation).
2. Hard (exists): all `dependsOn` merged.
3. Order: severity → longer remaining critical path through the ticket first (from `queue plan --json`,
   `horde-plan/1`, computed in-process, not by shelling out) → prefer a ticket whose nodes hold no running
   ticket → FIFO. A ticket marked as quality work (`**Kind:** quality` in the header, set by `tk new --kind
   quality`; default kind `work`) always sorts after every non-quality ticket of any severity.
4. `--why` prints every queued ticket with the reason it was skipped (dependency, lock with NNN on file F, class
   filter) or its rank.
5. `steward.md` step 1 text; `scripts/README.md`; CHANGELOG `[Unreleased]` in adopter language.

## Acceptance

- [ ] E12 on real temp repos: lock skip; critical-path ordering at equal severity; quality last; `--why` text.
- [ ] Suite green; commits with session trailers; report branch, test count, shas.
