# 139 · Horde: `horde blame file:line` prints the chain of custody from git to ticket, keys, evidence and rule verdicts

**Status:** LANDED — merged on Horde feature branch
**Found by:** director, 2026-09-06
**Severity:** medium
**Repo:** /home/user/horde · branch `claude/grain-agent-tool-b89y0x` · worktree, do not push
**Ruling:** `horde-blame` · after 126 landed · mission §6 E15
**Class:** sonnet

## What

`horde.mjs blame <file>:<line> [--horde h]` (or `blame.mjs` if `horde.mjs` is already large): `git blame` →
commit → the ticket whose recorded branch tip (keys line, verdict block, or the journal's `merged: NNN <sha>`)
contains that commit (`git merge-base --is-ancestor`) → prints: commit, ticket id and title, node(s), author
key, verifier key with class, owner approvals, evidence rows the ticket named and their state, and, when the
repository has a graph, the rule verdicts for that file at that commit (`yg check --json` restricted to the file
through `config.ygCommand`, or the lock's entries — derive which is honest from the installed CLI). Archived
hordes are searched too. `--json`. A line no ticket owns says so plainly (pre-horde code).

`scripts/README.md`, README (one paragraph: every line a horde merged has a custody chain), CHANGELOG
`[Unreleased]` in adopter language.

## Acceptance

- [ ] E15 on a real temp repo with one merged ticket: full chain printed; a pre-horde line reports no ticket.
- [ ] Suite green; commits with session trailers; report branch, test count, shas.
