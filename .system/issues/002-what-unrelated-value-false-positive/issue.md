# 002 · `grain what <term>` reports an UNRELATED value/location with full confidence

**Status:** FIXED (verified independently by orchestrator, 1459/1459)
**Found by:** field test, independently in TWO repos (Java/spring-petclinic, C#/CleanArchitecture), 2026-09-01
**Severity:** high — a confident false positive; a developer acting on it opens the wrong file

## Symptom

`grain what <term>` names a definition site or a matching value that does not exist there at all.

- **Java/spring-petclinic**: `grain what "management.endpoints.web.exposure.include"` → reported
  `defined: WebConfiguration.java`. Verified by grep: that string never appears in that file.
- **C#/CleanArchitecture**: `grain what PriorityLevel` (a real enum with members None/Low/Medium/High) →
  output included `values: `LogLevel` in 6 places (key)`. Verified by grep: `LogLevel` appears nowhere near
  `PriorityLevel`, in entirely different files.

Both were presented with the same confidence and formatting as a correct hit — nothing marks them as fuzzy or
low-confidence.

## Suspected area

`whatCmd` (core.mjs) — its matching of the query term against `model.valueIndex` / declarations. The C# case
(`PriorityLevel` → `LogLevel`) looks like a token/substring or stem collision (`...Level`), i.e. a lexical match
being reported as if it were an exact identity match. The Java case (a dotted config key → an unrelated .java
file) may be the same mechanism via partial-token overlap, or a container/place attribution bug.

Investigate before fixing: determine whether these are ONE root cause or two, and say which. Do not guess.

## Expected

Either the match is exact enough to state plainly, or it is labelled as an approximate/lexical match — never an
unqualified `defined:`/`values:` claim pointing at a file that does not contain the term. Silence ("no
declarations or values anywhere") is an acceptable, honest answer; a wrong file is not.

## Acceptance

A fixture containing two similarly-named-but-unrelated symbols (e.g. `PriorityLevel` and `LogLevel`) where
querying one must not report the other's places as its own; and a config-key query that has no real match must
return the honest "nothing found" answer rather than an unrelated file.
