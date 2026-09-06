# 142 · Horde: one end-to-end test from a bare repository through `grain propose`, `yg adopt`, `horde init`, a ticket, two keys and a merge, on real builds

**Status:** OPEN
**Found by:** director, 2026-09-06
**Severity:** high
**Repo:** /home/user/horde · branch `claude/grain-agent-tool-b89y0x` · worktree, do not push
**Rulings:** `layered-family` · after 135 landed · mission §6 E18
**Class:** opus

## What

`skills/horde/scripts/tests/family.e2e.test.mjs`, skipped with a printed reason only when the two builds are
absent (`YG_BIN`, default `/home/user/Yggdrasil/source/cli/dist/bin.js`; `GRAIN_BIN`, default the Grain
engine's dispatcher at `/home/user/Grain/plugins/grain/engine/grain.mjs`) — never skipped silently:

1. A small real repository is created in a temp dir with a commit history (a handful of source files in two
   directories, tests, a few commits touching them so Grain has evidence).
2. `grain propose` → `yg adopt` (with the baseline) → a graph exists; assert nodes and at least one draft rule.
3. `horde init` binds the nodes; `horde charter edit` with two evidence rows; an owner proposes a ticket with
   `Files`, `Produces`, `Evidence`; `queue plan` prints one layer; `queue set running` creates the worktree; a
   commit adds a failing-then-passing test and the change; author key; verifier verdict with `--ran/--saw` and
   the gate at the tip, plus the patch-id; owner approval; `premerge` all ✓ including the graph item through
   the real `yg check`; merge; `queue set merged`; `wave close` turns the evidence rows green; `horde done`
   refuses (no audit yet) then passes after `wave audit`; `horde blame` on a merged line prints the chain.
4. Every step asserts on files and exit codes, never on prose. Document the scenario in `scripts/README.md`
   (this is the family's contract test) and add a CHANGELOG line for the adopter (a full walk from an empty
   repository to a merged, proven change is now part of the suite).

## Acceptance

- [ ] E18 passes on this machine with the two builds; the skip reason prints when a build path is wrong.
- [ ] Suite green; commit with session trailers; report branch, test count, sha, and the wall-clock of the
      test.
