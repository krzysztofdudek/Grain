# 140 · Horde: node ownership is exclusive across live hordes on one repository; init and bind refuse an overlap

**Status:** OPEN
**Found by:** director, 2026-09-06
**Severity:** medium
**Repo:** /home/user/horde · branch `claude/grain-agent-tool-b89y0x` · worktree, do not push
**Ruling:** `node-lease-across-hordes` · mission §6 E16
**Class:** sonnet

## Why

topology.md allows several hordes on one repository. Two hordes binding the same node get two owners with
contradictory decisions, and the conflict surfaces when their trunks meet the base, the most expensive moment.

## What

1. `.horde/leases.json`: node → { horde, since }. `node.mjs bind` (and `horde init` when it binds the charter's
   nodes) refuses a node leased by another horde that is not archived, naming the horde and its last activity;
   `--take` requires a ruled escalation id and logs it. `horde.mjs archive` releases the horde's leases.
2. `status.mjs` shows leases held by other hordes on the nodes this one touches. `horde.mjs list` shows each
   horde's leased nodes.
3. `topology.md`, `scripts/README.md`, CHANGELOG `[Unreleased]` in adopter language.

## Acceptance

- [ ] E16 on a real temp repo with two hordes; release on archive; `--take` with and without an escalation.
- [ ] Suite green; commits with session trailers; report branch, test count, shas.
