# 005 · `grain how` — "places touched" is a flat union across all matched commits, burying the real answer

**Status:** FIXED (aggregation half; verified 1471/1471) — matcher-precision half split out, see retest note below
**Found by:** field test, independently in TWO repos (Java/spring-petclinic, Python/flask), 2026-09-01
**Severity:** medium — the top hit is often excellent, the aggregate around it is noisy

## Symptom

`how`'s rank-1/2 commit matches are frequently exactly right, but the aggregated "places such a change touched"
list unions every file from every matched commit, including weakly-matched ones.

- **Python/flask**: `how "fix IPv6 address parsing"` → correctly found the two real IPv6 commits (7203fea,
  de8429f), then also pulled in an unrelated 2015 "RedBaron AST parsing" commit and a 2011 "release script date
  parsing" commit on loose keyword overlap; the places list then absorbed a 26-file "use ruff linter" commit.
- **Java/spring-petclinic**: `how "add a new translation locale"` → correctly identified the two real i18n
  commits, then buried `messages_hi.properties`/`messages_ja.properties` under files from unrelated
  LocalDate/jodatime migration commits that matched only superficially.

## Note

`how`'s own acceptance/gating math was measured during this release (see the J2.3 gate section in
docs/validation.md — precision beats a grep baseline by ~4.6x in aggregate). This issue is NOT a claim that the
matching is broken; it is that the AGGREGATION step downstream of the match discards the per-commit match
strength that the matcher already computed.

## Expected

Places should be weighted or filtered by the strength of the commit that contributed them (the matcher already
computes a per-match `score`), so a strongly-matched commit's files outrank a weakly-matched one's — or weak
matches are excluded from the aggregate entirely while still being listed as commits. The current behavior treats
a 0.9-score commit and a 0.35-score commit as equal contributors.

## Acceptance

A fixture where one strongly-matching commit and one weakly-matching commit touch disjoint file sets: the strong
commit's files must rank above (or exclude) the weak one's in the rendered places list.

---

## Retest round 1 (2026-09-01): PARTIALLY fixed — reopened for the remaining half

Java/spring-petclinic, `how "add a new translation locale"`, after the score-weighted ranking landed:

- The real i18n files (`messages_hi.properties`, `messages_ja.properties`) moved **6-7 → 4-5**, now ahead of two
  dead/deleted files. Real improvement, and the "certified shape" line also corrected itself from a generic
  `*.java + src/main/` to `*.properties + src/main/`.
- **But they still do not lead.** Positions 1-3 remain `Pet.java`, `Visit.java`, `ClinicServiceTests.java` — all
  contributed by the two irrelevant LocalDate/jodatime-migration commits.

**Why the aggregation fix could not finish the job:** those irrelevant commits are in the matched set with
*un-diminished* scores. Weighting places by contributing-commit score cannot demote a file whose contributing
commit scored highly; the aggregation is now faithful to the matcher, and the matcher is what is admitting these
commits.

That is a MATCHER precision question, explicitly ruled out of this issue's scope (and out of the fix brief) —
`how`'s acceptance math was measured during the release (docs/validation.md, J2.3 gate: ~4.6× grep precision) and
must not be retuned on a single anecdote.

**Split:** the aggregation half of 005 is FIXED and verified. The remaining half is a distinct question —
*should a weakly-relevant commit that shares only generic tokens (`add`, `new`) be in the matched set at all?* —
which needs the same corpus-evaluation treatment the J2.3 gate got, not a patch. Tracked separately rather than
left implied here; do not reopen the aggregation work for it.
