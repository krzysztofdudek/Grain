# 012 · `where <intent>` misses a file that `what <term>` finds perfectly — same fact, two answers

**Status:** FIXED — where ranks by volume-channel normalisation: scope-name token weighed by share of file, directory bonus by earned coverage; named hit@3 +0.184 across 12 repos, leak-free guard also up; director-approved
**Found by:** Java/spring-petclinic, 2026-09-01; re-confirmed byte-for-byte identical after round 1 fixes
**Severity:** medium — a coverage inconsistency between two of the four headline commands

## Symptom

```
grain where "add a validator for a new form field"
  → top hits: OwnerController.java, VisitController.java. PetValidator.java NEVER surfaces.

grain what "validator"
  → finds PetValidator.java + both its test files, correctly.
```

The retest confirms the `where` output is **byte-for-byte identical** to the pre-fix run — fix-002 changed
`what`'s matching only, and did not touch `where`.

## Why it matters

`where` is the command the SKILL points an agent at first ("where do such things live, what is expected there,
which exemplar to copy"). If the canonical example of a role exists and `where` cannot name it while `what` can,
the primary entry point is weaker than a secondary one on the same underlying model.

## Suspected area

`whereCmd`'s lexical scoring over the model's own vocabulary (role labels, medoid features, fact payloads,
directory names) versus `whatCmd`'s direct declaration/value lookup. Likely the query "add a validator for a new
form field" is dominated by tokens matching controller cards (`add`, `form`, `field`), and `PetValidator`'s own
group either has no card, a weak label, or loses on IDF mass.

Diagnose before designing: is `PetValidator` a role group at all in this model, does it have a card, and where
does that card rank for the query? The answer determines whether this is a ranking bug, a card-construction gap,
or correct behavior with a bad-looking example.

## Constraint

`where`'s ranking was calibrated during the release (see docs/validation.md's J2.3 gate — `how`'s sibling
machinery). Do not retune ranking blind; establish the mechanism first, and if the fix is a ranking change,
re-run the corpus evaluation rather than eyeballing one query.

## Acceptance

Either `where "add a validator..."` surfaces `PetValidator.java` in its top hits, or the diagnosis explains
precisely why it should not and what the user should ask instead — recorded here.

## Update — the obvious lever is measured and it fixes the wrong half

`selftest --where` now exists (built for this ticket; see log.md). It scores this ticket's own query as a
failure and the known-good rephrasing as a pass, so it can judge a fix.

**The lever §4 proposed — moving file-card member-name tokens from `TOKW.name` to the existing `TOKW.fact`
tier (no new constant) — was measured and must NOT be shipped on the pooled number alone.** Medians over 8
repos:

| stratum | hit@3 | place@3 |
|---|---|---|
| pooled | +0.029 | +0.089 |
| query DOES name the file | **+0.099** | **+0.124** |
| query does NOT name the file | **+0.000** | **−0.016** |

It is a name-matching improvement that buys nothing where names cannot help, and on this ticket's own query it
moves `PetValidator` from rank 5 to rank 4 — still outside `--top 3`, still a FAIL.

**Acceptance for any fix here is therefore the leak-free stratum, not the pooled median.** A patch that moves
pooled while leaving unnamed flat has improved the benchmark's easy half and not this defect.

Counter-intuitive finding that reframes the whole ticket: the named stratum is the **worst-performing** one
(where 0.388 vs baseline 0.875, the largest gap in the measurement), not a saturated one. A message that names
its file is a *longer* message, and every extra word is another chance for IDF to land mass on an incidental
token — the same mechanism as this ticket, at larger scale.

## Corroboration — this is not one query, one repo, or one language

Four independent measurements now say the same thing. `where` loses to a naive path-match baseline:

| corpus | where hit@3 | baseline hit@3 |
|---|---|---|
| 8-repo median (`selftest --where`) | 0.402 | 0.696 |
| C++ / leveldb (n=19) | 0.21 | 0.47 |
| Lua / telescope.nvim (n=47) | 0.26 | 0.47 |
| Java / spring-petclinic | this ticket's own query: rank 5, FAIL | — |

Two field testers, on languages grain had never been run on, independently reproduced the failure mode this
ticket describes — and both named the *same mechanism* the petclinic diagnosis found: an incidental literal
token outranking the real exemplar.

- Lua: `where "add a custom sorter"` ranks `action_spec.lua` (74%) and `diagnostics_spec.lua` (47%) ABOVE
  `lua/telescope/sorters.lua` (26%) — because a test's `it()` description contains the word "custom". The real
  exemplar is flagged "verify before building on it" while two test specs outrank it.
- Lua: `where "add a new picker"` top-ranks the `pickers/` **directory** on a directory-name token match; per
  telescope's own developers.md that directory is internal machinery, and a new picker is authored elsewhere.
- Lua: `where "add a previewer for a new file type"` top-hits `previewers/utils.lua` (helpers) while the real
  exemplar `buffer_previewer.lua` appears only in a co-change footnote.

The Lua tester rated `what`, `check`, `how` and `report` as genuinely useful on that repo and named `where` as
**the** weak link — so this is a defect in one command's ranking, not a verdict on the model.
