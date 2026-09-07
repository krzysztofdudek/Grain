# 144 · Yggdrasil: `yg advise` accepts `grain-advice/1` items as proposals with provenance

**Status:** LANDED — committed 49ea51da, pushed
**Found by:** director, 2026-09-06
**Severity:** medium
**Repo:** <yggdrasil> · branch `claude/grain-agent-tool-b89y0x` · same worker as 130–133, after 133
**Rulings:** `layered-family`, `escalations-become-rules`, `quality-always-authorised` · mission §3 (`grain-advice/1` shape), §6 E20
**Class:** opus

## What

1. A way to feed external proposals into `yg advise` — derive the command shape from how `advise` stores and
   lists items today (`yg knowledge`, the advise code and docs). Input: a `grain-advice/1` document (file or
   stdin). Each item becomes an advise entry with provenance (`source: grain`, the evidence object kept
   verbatim, the sha it was measured at), mapped by kind: `relation` → "declare relation a → b" (or a port on b),
   `split` → "split node a into candidates", `rule` → a draft aspect proposal, `port` → "add port". Unknown kinds
   are refused; a document whose `schema` is not `grain-advice/1` is refused with what/why/next.
2. Listing shows provenance; the existing AGENTS.md rule stands: dismissing, deferring or recording an item is
   the user's (or, under a horde's quality policy, the architect's) act — importing is not accepting.
3. Idempotent: re-importing the same document does not duplicate entries (key on kind + nodes + measured sha).
4. Graph before code; docs and CLI reference; CHANGELOG `[Unreleased]` for the adopter (another tool can now
   hand Yggdrasil proposals, kept apart from what a person decided); tests on real fixtures with a document
   produced by the real `grain advise` if the Grain build is available at <grain> (ticket 131), else a
   document of the documented shape checked in as a fixture; `scripts/repo-check.sh` green except the two known
   environmental failures; commit with session trailers.

## Acceptance

- [ ] E20a; refusals; idempotence; provenance visible in `yg advise` output and `--json`.
- [ ] Repo-check; commit; report with the command shape chosen.
