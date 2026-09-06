# 117 · Backlog Graina z własnej ręcznej wyroczni (108): core.mjs 569k znaków (11.4x budżet, 'robi za dużo' potwierdzone ręką), surowy bajt SOH w core.mjs:2629 i 2 testach historii (rodzina NUL, 103), run-corpus.mjs bez testu strażniczego, 5 wywołań sieciowych w vendorze

**Status:** FIXED — core.mjs split: 573804 -> 6708 chars, 29 engine modules all under the oracle's 50000-char reviewer budget, zero import cycles, grain's observable output byte-identical on three corpora, suite 2390/2390. engine/file-size-budget refusals 3 -> 2 (grain.mjs and propose.mjs remain, both outside this ticket). Two items left for the director: 29 type-strict-orphan errors because the frozen oracle has no node owning the new modules (not edited on purpose), and one dead line in learn.mjs logged but not fixed.
**Found by:** 108 grain oracle, 2026-09-05
**Severity:** medium
**Class:** D

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
