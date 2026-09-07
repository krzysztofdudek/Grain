# 148 · Horde: the quality index at wave close reads `yg check --json` (`yg-check/1`) and refuses a CLI that does not emit it

**Status:** LANDED — merged 461d006
**Found by:** director, 2026-09-06 (follow-up of 138 and 147)
**Severity:** medium
**Repo:** <horde> · branch `claude/grain-agent-tool-b89y0x` · worktree, do not push · after 135 landed
**Rulings:** `layered-family` · mission §6 E14
**Class:** sonnet

## What

1. `wave.mjs close`'s quality index (138) stops parsing the text of `yg check` and `yg aspects`: it runs
   `<ygCommand> check --json` at the trunk tip and reads `yg-check/1` — `totals.verdicts`, `totals.errors`,
   `totals.warnings`, `coverage`, `progressive` (the baseline when present), `judges` — and `aspects --json`
   (`yg-aspects/1`) for statuses and drill counts. A CLI whose document lacks `schema: yg-check/1` is refused
   with the version needed, never parsed as text.
2. The index line at wave close names the same five figures as before (enforced, advisory clean, baseline,
   noise floor, coverage) plus the judges count; the delta logic is unchanged.
3. Tests with the real Yggdrasil build (b36f24e3 or later) on a fixture graph; `scripts/README.md`; CHANGELOG
   `[Unreleased]` only if the adopter sees a difference (the refusal message is one).

## Acceptance

- [ ] E14's index test passes reading the document; a stub `ygCommand` printing text is refused with the
      version line.
- [ ] Suite green; commit with session trailers; report branch, test count, sha.
