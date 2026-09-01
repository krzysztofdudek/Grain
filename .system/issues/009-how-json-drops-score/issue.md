# 009 · `grain how --json` / MCP `grain_how` drop `matches[].score` from the published contract

**Status:** FIXED (verified independently)
**Found by:** fix-005-007 agent, 2026-09-01 (reported, deliberately not fixed — out of that issue's scope)
**Severity:** low-medium — a real consumer-facing gap, and it made testing 005 harder than it should be

## Symptom

`howCmd` computes a per-match `score` (the IDF-coverage strength of each matched commit) and BOTH internal
consumers read it — `howEval` (the §J2.3 gate) and `how-hook` (`grain.mjs`, the `>= 0.5` injection gate). But
`cmdHow`'s `--json` rendering (`grain.mjs` ~line 181) omits it from the emitted object, so no external consumer
can see the strength of a match.

Concretely: issue 005's test (2) — the guard proving the MATCHER was unchanged while only aggregation was fixed —
could not go through `--json` at all. It had to call `howCmd` directly against a real built model, because the one
number it needed to assert on is not reachable through the public surface.

## Why it matters beyond testing

Issue 005 just made `places[]` rank by summed match score. A consumer reading `--json` now sees an ordering it has
no way to explain or reproduce, because the quantity driving it is hidden. That is the same class of problem as
issues 004 and 007 in this batch: grain knows something, acts on it, and does not say so.

## Expected

`--json`'s `matches[]` entries carry `score` (already rounded to 3dp internally). Purely additive — `grain
export`'s own versioning precedent (`export.mjs:4-5`) is that additive fields do not bump the schema number.

Check whether `places[]`'s new `weight` field (added by 005) should be exposed on the same grounds, and whether
MCP's `grain_how` needs the same treatment (it is documented as returning exactly what `how --json` returns —
verify that claim still holds after any change).

## Acceptance

`grain how <query> --json` emits `score` on every match; a test asserts it matches what `howCmd` returns
internally. MCP `grain_how` stays byte-identical to `how --json` (there is an existing test asserting this — find
and extend it rather than writing a second one).
