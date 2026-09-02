# 052 · `what`'s "siblings" section is noise — reported as random string-literal soup on every term tried

**Status:** RESOLVED — siblings: precision 0.364 vs 0.70 bar, unbidden push surface (72.7 values/line), deleted from text and --json; check's kin: (pull) untouched; valueNorms gate + render cap flagged to director
**Found by:** round 4 field test, Scala/playframework, 2026-09-01 ("pure noise on every one of the 5 terms tried")
**Severity:** medium

## Symptom

Across five real query terms on Play, `what`'s `siblings:` line returned unrelated string literals with no
apparent relationship to the query.

## Why it needs measuring, not patching

§044 established the method for exactly this shape of complaint: a surface reported as noisy by field testers,
where the honest first step is a precision figure and a null model, not a threshold. That measurement found the
twin gate was admitting pairs **at the population median** — i.e. selecting for nothing — and the fix was to
delete a push surface while keeping the pull one.

Ask the same questions here:
1. **Precision.** Fix an adjudication criterion *before* looking at any output; count "unsure" as a hit so the
   figure is an upper bound. Sample across ≥3 languages.
2. **Null model.** What does an arbitrary pair of values share? If accepted siblings sit at that median, the gate
   is not selecting.
3. **Push or pull?** Does `siblings:` appear unbidden in an answer the reader asked a different question of? The
   §044 ruling turned on that distinction — an unsolicited claim needs far higher precision than one the reader
   opened.
4. Is it capped, and does it reach `rules`/`CONVENTIONS.md` — i.e. does it get written into the user's repo?

**Do not add a tuned constant.** Six were deliberately collapsed into `CFG.lambda`.

## Acceptance

A measured precision figure and a recorded decision. "Leave it, disclose the rate" and "delete the surface" are
both first-class outcomes.
