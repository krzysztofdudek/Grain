# 126 · Horde: keys bound to the ticket's diff (patch-id), scoped re-review by range-diff

**Status:** OPEN
**Found by:** director, 2026-09-06
**Severity:** high
**Repo:** /home/user/horde · branch `claude/grain-agent-tool-b89y0x` · work in a worktree, do not push
**Ruling:** `keys-bind-to-patch-id` (see `.system/decisions.md` in Grain) · mission: `.system/research/mission-one-system.md` §3, §6 E5
**Class:** opus

## Why

`premerge.mjs` item 2 binds the owner's approval (`name@sha`, `tk.mjs:478`) and the verifier's verdict
(`green at sha X`, `verify.mjs:172`) to the branch tip. Every merge into the team branch makes every other
in-flight branch STALE (item 1), the catch-up merge moves the tip, and the keys go stale too — "approval/verdict
predates … — re-review" — even when the ticket's diff is byte-for-byte the same. Landing k ready tickets costs
2k−1 to k(k+1)/2 verifications instead of k. Measured (git 2.43, `one-system-design.md` §3.3): a catch-up merge
in another file or outside the hunk's 3-line context keeps `git patch-id --stable` unchanged; a change inside the
context changes it; an adjacent change conflicts.

## What

A verdict is bound to what it judged. The verifier reproduced the **diff** and ran the gate on the **tree**; the
owner read the **diff**.

1. `_lib.mjs`: `patchIdOf(branch, parent, { context })` → `git diff -U<context> <parent>...<branch> | git
   patch-id --stable` → 40-hex or null. `config.keyContext` (default 3) is the sensitivity knob; document it in
   `horde.mjs config` help and `scripts/README.md`. `-U0` is not offered.
2. `verify.mjs record`: computes the ticket branch's patch-id at record time (branch from the queue item, or
   `--branch`) and writes it into the verdict block as its own line (e.g. `**Diff:** <patch-id>`), next to the
   existing `**Gate:** … at sha …`. `--sha` stays required for the gate.
3. `tk.mjs review approve|changes`: the Keys-line approval carries the patch-id as well as the sha. Choose an
   encoding `splitNameSha` can parse both ways: legacy `name@sha` stays readable and stays sha-bound (behaves
   exactly as today), new entries carry both.
4. `premerge.mjs` item 2: an approval or verdict that carries a patch-id is valid iff the branch's current
   patch-id equals it; a legacy sha-only key is stale on any tip change as today. Note wording: `keys bound to
   diff <patch7>` when transferred; when the diff changed: `diff changed since review at <sha7> — scoped
   re-review: <path>`. Items 1 (base freshness) and 5 (gate, sha-bound, re-runs free) unchanged.
5. Scoped re-review: when the patch-id changed, `premerge` writes `git range-diff <oldBase>..<oldTip>
   <parent>..<tip>` (oldTip = sha in the key; oldBase = `git merge-base oldTip parent`) to a file beside the
   ticket (`rereview-<old7>..<new7>.diff` in the ticket's issue directory) and prints the path. `brief.mjs
   verifier NNN --delta <path>` renders a scoped brief: verdict each previous finding addressed / not addressed,
   inspect only the delta, new breakage in the delta only; `tk.mjs review-request NNN --delta <path>` logs the
   path for the owner. A full re-review remains available by omitting `--delta`.
6. `reference/roles/steward.md` step 4: base freshness ✗ → `git merge <team>` in the worktree → rerun premerge;
   keys ✗ "diff changed" → scoped re-review with the printed file; "predates" only for legacy keys. `verifier.md`
   and `owner.md`: what a scoped re-review is and is not.
7. Say it plainly in `scripts/README.md` and in the CHANGELOG: transferring a key across a catch-up is exactly as
   safe as the repository's tests, because the gate re-runs on the new tree and the diff is provably unchanged.

## What is NOT in scope

Stacked tickets (134), ticket fields (127), `queue next` changes (136). Do not touch `queue.mjs` beyond what
recording the branch requires.

## Acceptance

- [ ] E5: in `scripts/tests/premerge.test.mjs` on a real temp repo: (a) keys recorded with patch-id; a sibling
      merge in another file, then `git merge team` in the ticket worktree → item 1 ✓, item 2 ✓ "bound to diff",
      item 5 re-runs; (b) a sibling change inside the hunk context → item 2 ✗ "diff changed", a range-diff file
      exists at the printed path and contains the ticket's commit; (c) a legacy `name@sha` approval still goes
      stale on any new commit; (d) an adjacent change conflicts on merge and premerge is not consulted.
- [ ] `verify.test.mjs`, `tk.test.mjs`: recording and parsing both encodings; `brief.test.mjs`: `--delta` brief
      names the file and the previous findings.
- [ ] Full suite green (`node --test` per `scripts/README.md`), README and role briefs updated, CHANGELOG
      `[Unreleased]` entry in adopter language (what changes for them, no internals).
- [ ] Commits on the worktree branch with the session trailers; report: branch name, test count, one paragraph.
