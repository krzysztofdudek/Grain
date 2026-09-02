# 051 · `map --json` omits `concepts`, `changes` and edges that the text output carries

**Status:** FIXED — closed as duplicate/subset of 066 - map --json now carries concepts/changes/edges
**Found by:** round 4 field test, Scala/playframework, 2026-09-01
**Severity:** medium — a machine-readable contract that is strictly poorer than the human one

## Symptom

`grain map` (text) renders concepts, changes and module edges. `grain map --json` omits all three.

## Why it matters

The JSON shapes were declared a **published interface** this release, and the whole point of the JSON path is
that an agent consumes it. An agent reading `map --json` gets a strictly smaller picture than a human reading
`map`, with nothing saying so — so it will conclude the repository has no concepts and no module edges.

This is the same failure family as §007 (report and rules drifting apart) and §041 (a coverage note that
certifies an absence): two surfaces over one model disagreeing, with the poorer one silent about being poorer.

## What to establish

1. Is the omission deliberate — is any of this genuinely unavailable in the JSON path — or is it drift?
2. Are other `--json` surfaces missing content their text twin renders? Audit all of them; the cross-check suite
   added this release covers text/JSON agreement for `check` but evidently not for `map`.
3. Adding fields to a published interface is a compatible change; removing or renaming is not. Additions only.

## Acceptance

`map --json` carries what `map` renders, or documents precisely what it omits and why. A cross-check test
asserting text/JSON parity for `map`, in the style of the existing `cross-check-json-text.test.mjs`.
