# 147 · Yggdrasil: `yg check --json` and `yg aspects --json` (`yg-check/1`) — the verdict set as a machine document; Horde's quality index reads it instead of text

**Status:** LANDED — committed b36f24e3, pushed
**Found by:** director, 2026-09-06 (from ticket 138's report: `yg check --json` does not exist, so Horde's wave close parses the text output of `check` and `aspects`)
**Severity:** medium
**Repo:** /home/user/Yggdrasil · branch `claude/grain-agent-tool-b89y0x` · same worker as 130–133, after 133 and before 144
**Rulings:** `layered-family` (a lower layer's text output parsed by a higher layer is the exact fragility the mission removes)
**Class:** opus

## What

1. `yg check --json`: one `yg-check/1` document on stdout carrying what the text report says — per pair
   (aspect, file, status enforced/advisory/draft, verdict approved/refused/unverified/stale, reviewer name or
   `deterministic`, hashes), totals per status, the noise floor, coverage (covered/total and required), the
   baseline of pre-existing sites when progressive mode is on, and the exit reason. `--only-deterministic` and
   the other flags compose with it. Nothing changes in the text output.
2. `yg aspects --json`: the aspect list with status, reviewer type, drill counts, `review_by`.
3. Follow Yggdrasil's own rules (AGENTS.md, `yg prime`, graph before code, formatter beside `context-json.ts`,
   docs and the CLI reference in `templates/knowledge/cli-reference.ts`, CHANGELOG `[Unreleased]` for the
   adopter, tests on real fixtures, repo-check green except the two known environmental failures). Commit with
   the session trailers.
4. Horde follow-up (a separate small ticket, after this lands): `wave.mjs close`'s quality index switches to
   `yg check --json`, refusing an installed CLI that does not emit `yg-check/1`.

## Acceptance

- [ ] `yg check --json` on this repository's own graph parses and matches the text report's counts; `--json`
      with `--only-deterministic`; `yg aspects --json`.
- [ ] Repo-check; commit; report with one document pasted verbatim (truncated to the first two pairs).
