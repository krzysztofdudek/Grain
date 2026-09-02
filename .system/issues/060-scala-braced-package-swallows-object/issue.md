# 060 · Scala: a braced-package / DI-constructor parse error silently swallows a nested `object` and its methods

**Status:** FIXED — walk-logic gap, not grammar limit: ERROR node's own children now pushed onto walk; 145 declarations recovered across 58/97 error-bearing Play files, hasError/parse-degraded caveat unaffected
**Severity:** medium — class B (silence), on a real, common Play shape

## Symptom
On playframework, `selftest --extract` shows declarations the grammar's own oracle sees that grain never records:
a `package x { … }` (braced form) containing a class with an `@Inject()` constructor produces a parse error node,
and the nested `object` plus its methods inside the error region are dropped without a word.

## What to establish
1. Is the error node from the Scala grammar (a grammar limit — then record in validation.md Scala coverage, cf.
   §053's second finding) or from grain's walk stopping at the first ERROR (then §018's re-parse-the-region
   instinct applies: descend into the error subtree and keep what parses cleanly)?
2. Count on Play: how many declarations sit inside error regions? `selftest --extract --json` gives the misses.

## Acceptance
Either the nested `object` is recorded, or the loss is disclosed per file (`check`'s parse-degraded caveat
already exists — 053 must make it reach `review`) and quantified in validation.md. Test over a Scala fixture.
