# 026 · `what`'s honest-negative disclosures reach the text renderer but not `--json`

**Status:** FIXED (verified independently)
**Found by:** cross-check test suite (honest-silence distinguishability), 2026-09-01, on grain 0.3.0 · extractor g27
**Severity:** medium — a consumer reading `--json` still gets the pre-011 collapse the text no longer has

## Symptom

Measured mid-flight as 011's text fix landed: on the honest-silence fixture (a literal `"zqgated literal"` in
exactly one file, df=1, below `valueDfMin=2`):

- `what "zqgated literal"` (TEXT) now differs from `what zqabsent` — the df-gate disclosure landed.
  (`tests/cross-check-honest-silence.test.mjs` (d1): flipped RED → GREEN between g27 runs.)
- `what "zqgated literal" --json` is still **byte-identical** to the absent-term's JSON after deleting the
  echoed `query` field — both reduce to
  `{"defined":[],"values":[],"spread":[],"siblings":[],"changes":{},"usedBy":{},"asOf":...}`.
  ((d1-json): still RED.)

So the two renderings of one command now disagree about whether grain has something to disclose — the exact
json/text divergence class of 009, created by a fix rather than by original growth. MCP `grain_what` (if it
mirrors `what --json`) inherits the same gap.

## The general point

Whatever honest-negative disclosure `what` gains in TEXT must appear in `--json` in some structured form —
otherwise every fix for 011/014/018 re-opens this ticket for its own case. The suite already asserts all three
pairs in both renderings: (d1-json) is the confirmed instance today; (d2-json)/(d3-json) will verify the
018/014 halves as those fixes land (both still red on both renderings at time of filing).

## Suspected area

`whatCmd` (core.mjs ~2876) and/or `cmdWhat`'s `--json` branch in `grain.mjs` — wherever the new df-gate clause
was added to the text path, the JSON object was not extended alongside. Follow 009's own precedent argument:
additive fields do not bump the export schema (export.mjs:4-5).

## Explicitly NOT in scope

- The shape of the disclosure itself (011/018/014 own that).
- 009 (`how --json` dropping `score`) — same class, different command, already filed.

## Acceptance

`tests/cross-check-honest-silence.test.mjs` (d1-json) goes green: the df-gated term's `--json` differs from
the absent term's after normalizing out the query — carrying the disclosure as a field, not prose leaked into
JSON. When 018/014 land their text halves, (d2-json)/(d3-json) green in the same change, not as a follow-up.
MCP `grain_what` stays identical to `what --json` if an existing test asserts that (check before closing).
