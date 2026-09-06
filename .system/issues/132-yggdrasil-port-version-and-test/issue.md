# 132 · Yggdrasil: a port carries `version` and `test`; changing the port's test without bumping the version is refused by `yg check`

**Status:** LANDED — committed b31c900a on Yggdrasil feature branch, pushed
**Found by:** director, 2026-09-06
**Severity:** high
**Repo:** /home/user/Yggdrasil · branch `claude/grain-agent-tool-b89y0x` · same worker as 130, after 130 lands on the branch
**Rulings:** `port-is-contract` · mission `.system/research/mission-one-system.md` (Grain) §3, §6 E2
**Class:** opus

## Why

Port = contract = interface. A contract without a test is a declaration. A port whose test can change silently
makes every consumer's assumption unverifiable. Horde's plan orders tickets by port versions (`Consumes
auth/policy@1`, `Produces auth/policy@2`); the versions are real only if the graph refuses a test change without a
version change.

## What

1. `PortDef` (`model/graph.ts:148`) gains optional `version?: number` (integer ≥ 1) and `test?: string` (a path
   relative to the repository root; must exist and, when the node has a mapping, may lie inside or outside it —
   a contract test is often shared). Loader validation with what/why/next messages. Both optional and additive:
   before changing `CLI_SUPPORTED_SCHEMA` and the default-config `version:`, derive from this repository's git
   history how earlier additive optional fields were introduced (with or without a schema bump and migration) and
   do the same; write the derivation in your report. Never assume.
2. A built-in deterministic check: the lock records, per (node, port, version), the content hash of the port's
   test file; `yg check` refuses when the file's hash differs from the recorded one at the same version; a
   bumped version records afresh. Message: what (port, file, version), why (consumers rely on the contract at
   this version), next (bump `version:` in the node's `yg-node.yaml` and record why with `yg log add`, or restore
   the test). Approving is part of `yg check --approve --only-deterministic` like any deterministic pair. Fit
   this into the existing deterministic-verdict machinery rather than beside it; if the lock format needs a new
   entry kind, document it in the lock's model file and `docs/`.
3. `yg-impact/1` and `yg-node/1` (130) now fill `version` and `test`; `yg context --json` unchanged unless it
   already lists ports (then add the two fields there too).
4. Graph before code: the node(s) owning the loader, the lock store and the check runner get their descriptions
   and mappings updated in the same commit; an aspect for this rule is not required, the check is built in.
   Docs: `docs/` page on nodes/ports and the CLI reference in `templates/knowledge/cli-reference.ts`; CHANGELOG
   `[Unreleased]` for the adopter (a port can now name the test that is its contract and a version; changing
   the test without a new version is refused). Tests on real fixtures, including this repository's own graph
   once you give `cli/io/atomic-write`'s `write-atomic` a `test:` and `version: 1` (the file it names must be a
   real contract test in this repo — pick the existing test that exercises `atomicWriteFile`, do not invent one).
5. `scripts/repo-check.sh` green except the two known environmental failures; commit with session trailers;
   then proceed to 133.

## What is NOT in scope

Horde's use of versions (127/135), the external reviewer (133).

## Acceptance

- [ ] E2 exactly: edit the named test file → `yg check` red with the message; bump `version: 2` → green after
      `--approve --only-deterministic`; restore the file at version 1 → green.
- [ ] Loader refuses a non-integer version and a `test:` path that does not exist, with what/why/next.
- [ ] Graph, docs, CLI reference, CHANGELOG, tests; repo-check; commit; report with the schema-bump derivation.
