# 141 · Horde: quality policy in the charter; the status ladder is climbed on drill evidence without a human; quality tickets from Grain advisories are queued without a ruling; lowering needs the user

**Status:** LANDED — merged 744689c
**Found by:** director, 2026-09-06
**Severity:** high
**Repo:** /home/user/horde · branch `claude/grain-agent-tool-b89y0x` · worktree, do not push
**Rulings:** `quality-always-authorised`, `escalations-become-rules`, `production-is-the-corpus` · after 131 (Grain) and 135 landed · mission §1 mandate, §6 E17
**Class:** opus

## Why

The user's standing order: the horde raises quality wherever it works, without asking. What raises or keeps
enforcement is autonomous; what lowers it needs a person. Today every graph change waits for a ruling and the
status ladder is climbed by hand.

## What

1. **Policy.** Charter field `quality: autonomous | only-the-work` (default autonomous; `horde.mjs charter
   edit` validates it; `tk.mjs new --no-quality` marks a single ticket). The director's framing section of
   `SKILL.md` names the policy and its default in one sentence.
2. **Ladder.** `node.mjs promote <aspect>` (through `config.ygCommand`: read the aspect's status, run `yg drill`
   for it, count new violations since the wave it entered its current status): draft → advisory when the drill
   is green on the repository's own corpus and the baseline of existing violations is recorded; advisory →
   enforced when two consecutive waves closed with zero new violations. Promotion is done by the architect
   through `yg` (edit the aspect's status the way Yggdrasil prescribes, `yg log add` with the evidence), logged,
   and listed at wave close for the user to veto. `node.mjs demote` refuses without `--by user`; so do
   suppressions and review-date changes (they already do in Yggdrasil's own rules; the horde adds no way around
   them).
3. **Quality tickets.** After each wave close (and at staffing), the steward runs `grain advise` when a Grain
   command is configured and hands each item to the owner of the node it names; the owner proposes a ticket of
   kind `quality` (136) with the advisory as its Why; the steward queues it without an escalation. With
   `only-the-work`, none of this runs and the wave close says so.
4. **Wave close.** Lists: rules promoted this wave with their evidence, quality tickets merged, the quality
   index delta (138), and the veto instruction for the user.
5. `architect.md`, `owner.md`, `steward.md`, `SKILL.md`, `scripts/README.md`, CHANGELOG `[Unreleased]` in
   adopter language (the horde now improves the rules and the graph on its own wherever the evidence allows,
   and only ever asks before making anything weaker; one setting turns it off).

## Acceptance

- [ ] E17 on a real temp repo with the real Yggdrasil build: promotion on evidence, refusal to demote without
      `--by user`, quality ticket queued from a `grain-advice/1` document, `only-the-work` disables it all.
- [ ] Suite green; commits with session trailers; report branch, test count, shas.
