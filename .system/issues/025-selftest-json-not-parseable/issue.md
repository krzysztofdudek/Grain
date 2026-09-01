# 025 · `selftest --json` stdout is not parseable JSON — the stamp is appended as a trailing text line

**Status:** FIXED (verified independently)
**Found by:** cross-check test suite (json/text agreement loop), 2026-09-01, on grain 0.3.0 · extractor g27
**Severity:** low — but it is a published `--json` surface a consumer cannot `JSON.parse`

## Symptom

```
grain selftest --json
{
 ... valid JSON ...
}
as of 7bd21ac        ← trailing non-JSON line
```

`JSON.parse` on the full stdout throws `Unexpected non-whitespace character after JSON`. Every other `--json`
command (`where`, `how`, `what`, `map`, `check`, `status`, `report`) emits one clean JSON document — measured
in the same run by the same generic loop, all green. `selftest --how --json` fails identically.

The gap is already half-known: `tests/selftest.test.mjs` test (c) strips `/\nas of .*$/` from stdout before
parsing — the workaround is in the repo's own suite instead of the contract being fixed.

## Suspected area

`engine/grain.mjs`'s selftest branch builds its output as `lines = [JSON.stringify(res, null, 1), stamp()]` —
two array elements, JSON blob + bare stamp line — where the other `--json` branches fold the stamp into the
JSON object (an `asOf` field). Same shape for the `--how` variant.

## Explicitly NOT in scope

- 009 (`how --json` dropping `matches[].score`) — different command, different gap, tracked separately.
- Any change to what selftest measures or its text rendering.

## Acceptance

`grain selftest --json` (and `selftest --how --json`) stdout parses as one JSON document carrying the stamp as
a field (match the other commands' `asOf` convention). The workaround strip in `tests/selftest.test.mjs` (c)
is removed in the same change, so the old shape cannot silently return. The generic loop in
`tests/cross-check-json-text.test.mjs` ("`grain selftest` --json stdout is one parseable JSON document") goes
green.
