# 036 · `what` calls a locally-declared type "external/vendor" — REGRESSION introduced by 032

**Status:** FIXED (verified independently)
**Found by:** round 4, Kotlin/okhttp, 2026-09-01
**Severity:** CRITICAL — a confident, unhedged, wrong answer about the repository's own central type

## Symptom

```
grain what Interceptor
  → «Interceptor» has no declaration anywhere in this repository (likely an external/vendor type)
    but is referenced structurally in N files …
```

**False.** `Interceptor.kt` declares `fun interface Interceptor` in that very repo. Interceptor is arguably
okhttp's single most important public type.

## Root cause — confirmed by reading, not inferred

`core.mjs`, in `whatCmd`:

```js
defined.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line)).splice(12);   // line ~3070
…
const exactLocal = defined.some(d => d.name.toLowerCase() === q.toLowerCase());                   // line ~3075
```

`exactLocal` is computed from the **already-truncated** list. The sort is by **path then line — not by
relevance** — so the 12 survivors are simply the alphabetically-first paths. For a query with heavy token
collision (`Interceptor` → `BrotliInterceptor`, `HttpLoggingInterceptor`, dozens of `intercept()` methods) the
real exact declaration is easily pushed out, and `exactLocal` goes false.

`exactLocal === false` is precisely the gate 032 added for "this is an external/vendor type", so the truncation
manufactures the external verdict.

## This is my own regression, and it inverts 032's purpose

032 existed to stop `what` presenting an incomplete answer as authoritative. The fix added an honest disclosure
for genuinely-external types — and, through this truncation bug, made grain **confidently wrong about local ones**.
That is strictly worse than the undercount 032 set out to fix: an undercount understates, this asserts a falsehood
about the user's own code.

## Fix

Compute `exactLocal` over the **full** `defined` set, before `.splice(12)`. The truncation is a display cap and
must not feed a semantic verdict. Check every other consumer of the truncated list for the same conflation —
a display cap feeding a decision is a pattern, not necessarily a one-off.

Consider also whether `defined`'s sort should rank an exact-name match first regardless of path, so the true answer
is not merely *counted* but *shown*. That is a separate improvement; the correctness fix is the ordering of the
truncation.

## Acceptance

A fixture with ≥13 token-colliding declarations where the exact match sorts late by path: `what <exact name>`
reports it as locally declared and does NOT claim external/vendor. 032's genuine external-type case still gets its
disclosure (regression). The displayed list stays capped.
