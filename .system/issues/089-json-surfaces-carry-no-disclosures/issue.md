# 089 · where/what/explain --json carry no disclosure text — an agent consuming JSON gets the confident answer without the honesty the text has (057, 070, 085 all affected); instrument A audits JSON

**Status:** FIXED — disclosures[] additive field on where/what/check/review --json, generic JSON renderer hook; instrument C parity test + instrument A consumes it; 2181/2181
**Found by:** 085 worker via escalation 20, 2026-09-02
**Severity:** high
**Class:** C

## Symptom

Before this fix, `where`'s text answer and its `--json` answer disagreed about how much to trust the top hit:

```
$ grain where zzqfrobnicate            # text
no lexical match for "zzqfrobnicate" in parsed code — but that exact text appears in NOTES.md, and grain has no
grammar for ".md" (never reads that format at all, so this file was never parsed). This may be a real hit grain
cannot see. Compact map of the source groups, markers and directories follows regardless.
...
$ grain where zzqfrobnicate --json     # json — same query, same run
{"query":"zzqfrobnicate","hits":[...],"signal":{...},"asOf":"..."}
```

The JSON carried the ranked hits and nothing about the never-parsed file the text had just disclosed. Same gap for
`what --json` (the `blind-weak`/`gated`/`ungrammared`/`blind` notes core.mjs's `whatCmd` already computed were
partially exposed via `note`, but not as the sentence text, and not for `check`/`review`'s `noGrammar`/
`noPartition`/`parseFailed`/`hasError` booleans, which had no matching prose at all in JSON). Instrument A's
`checkNoDeclarationsAnywhere` (`tests/stress/audit-claims.mjs`) only reads `where --json`, so it kept counting a
disclosed "the real text lives in a file I can't read" answer as silent fabrication — measured directly (see
Acceptance) on 3 real corpus repos: leveldb 4→3, CleanArchitecture 9→7 fabrications out of the same 30-40 sampled
candidates, aggregate 23→20 out of 100 checked, once `--json` carries the disclosure this fix adds.

After this fix, the same `where zzqfrobnicate --json` run carries:

```
{"query":"zzqfrobnicate","hits":[...],"signal":{...},
 "disclosures":[{"kind":"ungrammared","text":"no lexical match for \"zzqfrobnicate\" in parsed code — but that
   exact text appears in NOTES.md, and grain has no grammar for \".md\" ..."}],
 "asOf":"..."}
```

## Suspected area

- `plugins/grain/engine/core.mjs`: `whereCmd` (disclosure sites: `noContentFoothold`, `weak match`, the mass-
  concentration/`partial-word-coverage` note, the §085 ranked-answer `ungrammared` banner, and the zero-hit
  `ungrammared`/`honest-negative` variants) — each now also pushes `{ kind, text }` into a new `disclosures` array
  returned alongside `lines`/`hits`. `whatCmd` (disclosure sites: `blind-weak`, `gated`, `ungrammared`, `blind` —
  `note.kind`'s own existing vocabulary, reused verbatim as `kind`) — same pattern, a sibling `disclosures` array,
  deliberately never added as a field ON `note` itself (its shape must not change).
- `plugins/grain/engine/grain.mjs`: `cmdWhere` (threads `whereCmd`'s `disclosures` into the JSON branch; adds the
  model-signal note — `no-source-partition`/`empty-model`/`sparse-model`, derived from `signal()`'s own existing
  verdict text — and `dirty-tree`, from the existing `DIRTY_TREE_NOTE` constant, neither of which reached JSON
  before), `cmdWhat` (threads `whatCmd`'s `disclosures` plus `dirty-tree` the same way), `cmdCheck`'s three early
  JSON branches (`no-grammar`, `no-partition`, `parse-failed` — one literal sentence each, reused for both the text
  return and the new `disclosures` entry so the two can never drift), and `fileVerdictJson` (shared by `check`'s
  main path and `review`'s per-file `findings[]` — adds `parse-degraded` when `r.hasError`, the exact sentence
  `check`'s own text prints under the headline).
- `plugins/grain/tests/cross-check-json-text.test.mjs` (instrument C): a new generic `assertDisclosureParity(dir,
  args, expectedKind, pick)` helper plus 5 dedicated fixtures (check no-grammar/no-partition/parse-degraded, what
  blind-weak, where ungrammared) proving, for each, that the JSON's `disclosures[]` entry's `text` appears verbatim
  in the text rendering — the acceptance criterion, checked generically rather than per-command.
- `plugins/grain/tests/stress/audit-claims.mjs` (instrument A): `checkNoDeclarationsAnywhere` now reads
  `j.disclosures` and skips the fabrication increment (never the `checked`/`claims` counters) when an `ungrammared`
  entry is present — the disclosure kind that exactly matches this check's own sampling shape (an identifier that
  appears ONLY in a no-grammar file).
- `docs/reference.md`: a new `### disclosures[] — every hedge the text answer carries, structured (§089)` section
  documenting the field, the kind vocabulary, and the check/review nesting; the "Recipe for a CI PR comment"
  paragraph updated to note that each parseable `findings[]` item now also carries `disclosures[]`.

## What is NOT in scope

- **`explain`/`spectrum` and `completeness`**: neither has a `--json` output AT ALL today (confirmed by reading
  `cmdSpectrum`/the `completeness` switch case in `grain.mjs` — no `opts.json` branch exists for either). The
  ticket's own ruling frames this as additive to "every --json surface"; adding a brand-new `--json` mode to two
  commands that have none is a materially larger, differently-scoped change (a new output contract, not an
  additive field on an existing one) and was left out. Flagged for a follow-up ticket if the director wants
  `explain`/`completeness --json` at all.
- **`obligation`**: audited and found to need NO change. `obligationLines`' only non-numeric branch ("no recorded
  births in this repo's history") is already fully represented by the existing `births: 0` JSON field — there is
  no separate hedge sentence in its text output that JSON doesn't already carry structurally.
- **`check`/`review`'s many other hedge-shaped lines** (steer/waiver "not yours to fix" notes, "no strong
  convention governs this file", "only naming and lexical style is certified here", the pre-existing-deviations
  summary, `--all`-gated "+N more" notes): these either lack a backing boolean/flag already present in JSON (adding
  one would mean inventing new JSON structure, not surfacing existing internal state) or are presentational
  list-capping choices rather than "the shown answer may be incomplete/wrong" caveats. Only the four cases already
  backed by an existing JSON boolean (`noGrammar`, `noPartition`, `parseFailed`, `hasError`) were converted, per the
  ticket's "reuse existing internal state/flags, don't recompute" instruction.
- **`review`'s no-grammar branch specifically**: confirmed it has no text-side "no grammar" sentence at all to
  mirror (a file with no grammar and no placement hit is silently dropped from `review` entirely; one with a
  placement hit shows only the placement sentence) — nothing to make additive there without inventing new prose.
- No existing `--json` key changed shape or was removed anywhere in this change; `note` (what --json) keeps its
  exact existing shape (kind-dependent fields only, no new `text` field added to it — `disclosures` is a sibling
  array instead, precisely so `note`'s shape stays untouched).
- No text output changed (verified: every disclosure site pushes the identical string object/literal to both
  `lines` and `disclosures`, never a re-derived copy).
- `config.mjs` version constants untouched.

## Acceptance

- Full suite green in-worktree: `npm test` → 2175/2175 (base was 2164; +7 disclosure-parity/audit-claims tests, +4
  pre-existing suite growth from `git merge main`).
- Instrument C (cross-check-json-text.test.mjs): 5 new dedicated fixtures, each proving a real `disclosures[]`
  entry's `text` matches the text renderer's own line, for `check` (no-grammar, no-partition, parse-degraded via
  both `check` and `review`), `what` (blind-weak), and `where` (ungrammared) — all green via one generic assertion
  function, not per-command bespoke logic.
- Instrument A (audit-claims.mjs): two new unit tests prove `checkNoDeclarationsAnywhere`'s logic change directly —
  a confident-wrong hit WITH a matching `ungrammared` disclosure is no longer counted as fabrication (still
  counted as `checked`); a confident-wrong hit with an UNRELATED disclosure kind still IS counted (the fix does not
  launder every disclosure into a free pass). Measured, not simulated, on 3 real, already-cloned corpus repos
  (leveldb, CleanArchitecture, okhttp — up to 40 sampled `noDeclarationsAnywhere` candidates each, same real
  `where --json` calls used for both the old and new predicate):
  - leveldb: 30 checked, old-rule fabricated 4 (13.3%) → new-rule 3 (10.0%) — `leveldbTargets` (a real compound
    identifier) correctly suppressed.
  - CleanArchitecture: 40 checked, old-rule 9 (22.5%) → new-rule 7 (17.5%) — `EditorConfig`/`TypeScript` suppressed.
  - okhttp: 40 checked, old-rule 10 (25.0%) → new-rule 10 (25.0%) — unchanged; every sampled candidate was a plain
    English word (`router`, `nullable`, `accessors`, …), not an identifier-shaped compound, so `where`'s own §085
    scan-discipline gate never even attempts the never-parsed scan for these (by design, matching the measured
    "single common words must not pay for a file scan" rule) — no disclosure fires, so nothing could be
    suppressed. This is an honest finding, not a shortfall of this ticket: instrument A's own candidate sampling is
    broader than the specific class of query `where`'s disclosure register covers, and narrowing that sampling (or
    teaching the disclosure register a second class of caveat) is future instrument-A work, not part of 089's own
    scope (which is "propagate the disclosures grain already computes", not "compute new ones").
  - Aggregate: 100 checked, 23 → 20 old-vs-new-rule fabrications (13% relative reduction), concentrated exactly on
    identifier-shaped candidates — could not run the full versioned stress corpus (`tests/stress/corpus.json`,
    ~15+ repos with full history walks) within this worktree's time budget; the 3-repo, real-subprocess measurement
    above is what was verified.
