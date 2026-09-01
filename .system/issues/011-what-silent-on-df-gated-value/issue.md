# 011 · `what <literal>` returns a bare empty answer for a value the df gate excluded — no explanation

**Status:** FIXED (Phase 1 — honest-negative answer shape; verified by the independent cross-check oracle, (d1)/(d2) green)
**Found by:** retest round 1, Java/spring-petclinic, 2026-09-01
**Severity:** medium — same "unexplained silence" class as 004 and 007

## NOT a regression — verified

The reporter hypothesized this was fix-002 (`coversQt`) overshooting. **It is not.** Verified directly against
the live petclinic model:

```
total valueIndex keys: 123
"New Owner Created" -> ABSENT from index
"Owner Created"     -> ABSENT from index
"error"             -> str:error (3 places)
```

The value never reaches the matching code fix-002 touched, because it is not in `model.valueIndex` at all. It
appears in exactly one file (`OwnerController.java:85`), so `CFG.valueDfMin = 2` excludes it — the deliberate
J3.1 population gate ("a value in one file alone has no concordance to report"). The pre-fix `.some()` matcher
would have missed it identically. Pre-existing behavior, correctly gated.

## The real defect

`what "New Owner Created"` — a real, verifiable string literal the user can see in the source — returns:
```json
{"defined":[],"values":[],"spread":[],"siblings":[],...}
```
Nothing. No indication the value was seen and deliberately excluded, versus genuinely not existing. A user who
just read that literal in the file gets an answer that reads like grain cannot see their code.

Single-word values with df≥2 (`error`, 3 places) work fine, which makes the failure look arbitrary from outside —
the reporter reasonably concluded "multi-word queries are broken", which is the wrong lesson to draw.

## Expected

Distinguish "not found anywhere" from "found, but below the concordance floor". The df window is a real, defended
design choice; a user hitting it should be told, in one clause, the same way `relCoverageNote`/`intraModuleNote`
(004/007) disclose their own gaps. Something like: seen in 1 file, below the 2-file floor where concordance
begins — no siblings to report.

Requires knowing the value existed pre-gate. Check what is cheaply available: the gate runs in `learn()` over
`vPlaces` before `vKept` is cut. Persisting every excluded value is wrong (that is the whole index, unpruned) —
a bounded alternative (a count, or a check-time re-scan of just the queried term) may be better. Establish the
cost before designing.

## Acceptance

`what <a real literal appearing in exactly one file>` says it was seen and why it is not indexed, not a bare
empty result. `what <a genuinely absent string>` still says plainly that nothing was found. The two answers must
be distinguishable.

---

## Round 2 (Express/JS) — SEVERITY RAISED. This is not an edge case; it guts J7.2's headline value.

The express tester concluded *"0.3.0's JSON support does not extend to `what`; it's not indexing keys/values at
all."* **Wrong mechanism, right effect** — and the true mechanism is worse. Measured directly on their model:

```
json files indexed: 1        [ 'package.json' ]
valueIndex total:   562  |  key: entries: 39
sample key: entries: [ branches, cancel-in-progress, checks, concurrency,
                       contents, coverage, cron, fail-fast ]
```

JSON/YAML key extraction **works**: 39 `key:` entries are indexed. But every one comes from `.github/workflows/
*.yml` — files that exist in *multiples* and share keys. **Not one key from `package.json`**, because express has
exactly one `package.json`, so every key in it has df=1 and `CFG.valueDfMin = 2` removes all of them.

## Why this reframes the issue

The same df floor that this issue already described now demonstrably means:

- **`what <any package.json key>` can never work in a single-package repo** — the archetypal, most obvious config
  question a JS developer would ask.
- J7.2's JSON/YAML support delivers value only where a repo has **several structurally similar config files**
  (a workflows directory, a monorepo's many `package.json`s). That is a real but much narrower claim than
  "grain understands JSON/YAML".
- Round 1's Java result now reads differently: `what "runs-on"` worked there **because petclinic has 3 workflow
  files sharing that key**, not because YAML support is broadly functional. Two testers, opposite conclusions,
  same mechanism — which is itself evidence the current behavior misleads.

## Consequence for the fix

The disclosure fix this issue already proposes (distinguish "below the concordance floor" from "not found") is
now the *minimum*, not the whole answer. Also worth deciding, with measurement:

**Should a single-file config still be indexed for `what`, even though it has no concordance?** The df floor's
own justification is "a value in one file alone has no concordance to report" — true for the SIBLING/norm machinery,
but `what` mostly answers *"where is this and what is it"*, which is meaningful at df=1. Those may simply be two
different populations that should not share one gate: `valueSiblings`/`valueNorms` keep the floor; `valueIndex`
(what `what` reads) might not need it.

That is a real design question with a measurable cost (index size — express: 562 entries today; how many at
df≥1?). Do not change the constant. Measure first, and consider whether the gate belongs at a different layer.
