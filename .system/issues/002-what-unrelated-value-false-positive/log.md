# 002 — work log

## Diagnosis

**ONE root cause, two symptoms.** `whatCmd` (core.mjs) matches a query's tokenized words against a candidate's
tokenized words using `.some(t => qt.has(t))` — "at least one shared token" — in exactly two places:
- `nameHits` (line 2770, declarations, source (a))
- the (b) values loop over `model.valueIndex` (line 2783)

For a single-token query (`status`, the shipped `what-command.test.mjs` fixture) this degrades to an exact
single-token check and is harmless. For a multi-token query — a camelCase compound identifier (`PriorityLevel` →
tokens `{priority, level}`) or a dotted config key (`management.endpoints.web.exposure.include` → 5 tokens) — a
single coincidentally-shared word is enough to report a completely unrelated symbol with full, unqualified
confidence. No second mechanism was found; both field-test reports trace to this one predicate shape.

Reproduced on the real corpora before touching any code (read-only, cache rebuilt via `grain report`, no source
edits):
- CleanArchitecture: `node bin/grain.mjs what PriorityLevel` → `values: \`LogLevel\` in 6 places (key)`. Grep
  confirmed `LogLevel` lives only in `appsettings*.json`/logging test files, nowhere near `PriorityLevel.cs`.
  Mechanism: `tokenize('LogLevel')` → `{log, level}`; `qt` for `PriorityLevel` → `{priority, level}`; shared token
  `level` alone satisfied the old `.some()`.
- spring-petclinic: `node bin/grain.mjs what "management.endpoints.web.exposure.include"` →
  `defined: WebConfiguration.java`. Grep confirmed the string never appears in that file — it genuinely exists
  only in `application.properties`, a file grain's grammar set doesn't parse (confirmed: `model.valueIndex` has
  no `exposure`/`include` keys, `model.filesAll` has zero `.properties` files). Mechanism: `WebConfiguration`
  tokenizes to `{web, configuration}`; the query's 5 tokens include `web`; shared token `web` alone satisfied
  `.some()`. The honest answer here is "no declarations or values anywhere" — exactly what the acceptance
  criteria call for.

## Tests — written first, confirmed RED

New file `plugins/grain/tests/what-exact-match.test.mjs`, mirroring `what-command.test.mjs`'s harness
(`grainIn`/`gitIn`/fixture-then-`--json`+text assertions):
- repoA (C# shape): real `enum PriorityLevel` + 2 JSON files with a real `PriorityLevel` key (df=2, a true
  positive) alongside an unrelated `enum LogLevel` + 3 JSON files with a `LogLevel` key (df=3) sharing only the
  suffix word "level". 15 filler files keep the value-density gate (`dfMax = ceil(0.2*n)`) above both real dfs.
- repoB (Java shape): one declared `WebController` class and NO real match anywhere for a 5-word dotted query
  that shares only "web" with it.

Ran against unmodified code — 5 of 6 new tests failed exactly as expected (test 3, the true-positive guard, was
already green, confirming it exercises real, pre-existing-correct behavior):
```
✖ (1) `what PriorityLevel` never reports the unrelated `LogLevel` declaration
  → defined included src/logging/logLevel.ts `LogLevel` (type)
✖ (2) `what PriorityLevel` never reports the unrelated `LogLevel` indexed value
  → values included {"value":"LogLevel","kind":"key","places":[...3 places...]}
✖ (4) text rendering never mentions LogLevel
  → defined: ...priorityLevel.ts `PriorityLevel` (type) · ...logLevel.ts `LogLevel` (type)
    values: `LogLevel` in 3 places (key) · `PriorityLevel` in 2 places (key)
✖ (5) config-key query with no real match returns honest "nothing found"
  → defined: [{"rel":"src/config/webController.ts","kind":"type","name":"WebController",...}] (expected [])
✖ (6) text rendering speaks the honest absence
  → defined: src/config/webController.ts:1 `WebController` (type)
```

## Fix

`plugins/grain/engine/core.mjs`, two call sites inside `whatCmd` (~line 2770 and ~2783). Introduced one small
helper and used it at both sites:
```js
const coversQt = toks => qt.size > 0 && [...qt].every(t => toks.has(t));
const nameHits = name => coversQt(new Set(tokenize(name).map(normTok)));
...
if (coversQt(new Set(tokenize(v).map(normTok)))) valueHits.push({ key, k, v, places });
```
Strategy chosen: **tighten the match**, not "label as approximate." A shared incidental word between two
otherwise-unrelated symbols carries no genuine signal worth surfacing at any confidence level — grain's own
constitution treats silence as an acceptable, honest answer, and there is nothing fuzzy-but-useful here to label.
This is not a new tuned similarity threshold: `qt.size > 0 && every(...)` is a coverage requirement (query ⊆
candidate), not a magic ratio — for a single-token query it is byte-identical to the old `.some()` behavior, so
`status` matching `PENDING_STATUS`/`SHIPPED_STATUS` (the shipped fixture) is provably unaffected.

## Verification

- New test file green after the fix: 6/6.
- `what-command.test.mjs` (the existing single-token `status` fixture) unaffected: 9/9, unchanged assertions.
- Real corpora re-checked with the fix in place:
  - CleanArchitecture: `what PriorityLevel` now reports only its own real declaration + the real `tests/...
    ShouldReturnPriorityLevels` method; `LogLevel` no longer appears anywhere in the output.
  - spring-petclinic: `what "management.endpoints.web.exposure.include"` now returns
    `map: «...» has no declarations or values anywhere in this repository's code` — no `WebConfiguration.java`
    mention.
- RED confirmed a second time by hand-reverting both hunks via `Edit` (never git): reproduced the identical 5/6
  failures shown above, byte-for-byte the same assertion failures. Restored via `Edit`.
- Full suite: `node --test 'plugins/grain/tests/**/*.test.mjs'` → **1459/1459** passing (1453 baseline + 6 new).
  No existing test needed to change; none asserted the buggy behavior.

## Surprises / things noticed but not touched

- `whereCmd` (core.mjs, same file) already has a much richer apparatus for exactly this class of problem —
  per-query-word coverage ratio, "mass concentration" of the top hit's matched weight, cross-hit agreement
  suppression, and an explicit "note: the top hit matches only «X» of your N words — verify before building on
  it" caveat line. `whatCmd` had none of this; the fix here is deliberately much smaller (full-coverage predicate
  only) per the "keep the change minimal, don't restructure whatCmd" instruction, but if `what` ever needs
  partial/fuzzy matching with an honest caveat (rather than exclusion), that existing `whereCmd` machinery is the
  precedent to reuse rather than re-invent.
- Confirmed while diagnosing: `.properties` files are not covered by any grammar in this build (`EXT2GRAMMAR`/
  `relSupported`), so a real Spring Boot config key can never be found by `what` even when it genuinely exists —
  this is a coverage gap, not a correctness bug, and is exactly what makes "no declarations or values" the
  correct, honest answer for the Java fixture rather than a false negative. Not in scope for 002; reporting only.
