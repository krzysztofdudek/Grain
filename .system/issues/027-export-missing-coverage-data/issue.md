# 027 · `export` carries no relation-coverage data — the §G21/007 disclosure gap reproduced on the published audit surface

**Status:** FIXED (verified independently)
**Found by:** cross-check test suite (export parity), 2026-09-01, on grain 0.3.0 · extractor g28
**Severity:** low-medium — same honesty class as 004/007, on the one surface explicitly sold for audits

## Symptom

On a fixture with a live coverage gap (a `.zig` file with no `relSupported()` extractor), `report`/`status`
print the §G21 disclosure:

```
resolution does not cover 1 files (zig) — conventions layer only for those
```

`grain export` — verified against a live dump's actual key set, not guessed — carries **no field a consumer
could derive that disclosure from**: no top-level or `summary` entry names uncovered files, grammars without
extractors, or a covered/uncovered breakdown. `relCoverageNote` was simply never wired into export.mjs, the
same way it was never wired into `rulesMarkdown` before 007.

## Why it matters

`export` is the declared published interface "for training pipelines and audits". A consumer of the export
alone cannot distinguish "these N files are in a grammar with no relation extractor" from "this code genuinely
imports nothing" — the exact indistinguishability §G21 was written to eliminate on `report`. An audit surface
that silently under-discloses is arguably the worst place for this gap, mirroring 007's own argument about
`rules` ("a reader with no terminal").

Note the contrast with `valueSiblings`: its omission of place data IS disclosed, in `schemaNotes.valueSiblings`
— so the house pattern for export-side honesty exists; coverage just never got either the data or the note.

## Suspected area

`export.mjs` — either export the underlying data (uncovered file list or per-grammar counts; the inputs
`relCoverageNote(model)` already reads) or, at minimum, add a `schemaNotes` entry stating that resolution
coverage is not represented. Data is better: additive fields do not bump the schema (export.mjs:4-5 precedent).

## Explicitly NOT in scope

- The parallel `intraModuleNote` question (edges resolved but all intra-module): export DOES carry `edges` and
  `moduleGraph`, so a consumer can derive that one — no gap there (verified by the same parity suite).
- Any change to report/rules/status (all correct since 004/007).

## Acceptance

`tests/cross-check-export-parity.test.mjs`'s coverage test currently asserts the gap AS OBSERVED (export has
no such field) and documents it as a candidate finding; when the field lands, flip that test to assert the
data agrees with `relCoverageNote`'s inputs (uncovered count + grammar names matching what report prints).
A fixture with full coverage exports the field in its honest empty/complete shape.
