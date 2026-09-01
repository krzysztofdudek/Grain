# 053 · `check` says "parse degraded" and `review` does not — the caveat is dropped in the aggregate

**Status:** OPEN
**Found by:** round 4 field test, Scala/playframework, 2026-09-01
**Severity:** medium — a disclosure that exists but does not survive aggregation

## Symptom

`grain check <file>` on an ordinary, mainline modern-Scala file (implicit params, Json readers) reports
`(parse degraded — part of this file sits in error nodes)`. The aggregated `grain review` text over the same
file **does not carry that caveat**.

## Why it matters

`review` is `check` over many files, and it is the form an agent is most likely to consume. A reader of `review`
gets findings computed from a partially-parsed file with no indication that part of the file was unreadable —
so an absence of findings reads as "clean" when it may mean "unread".

This is precisely the §041 failure re-stated: grain has the honest sentence, and the aggregate drops it. The
disclosure register (`relCoverageNote`, `intraModuleNote`, `DIRTY_TREE_NOTE`, `CYCLE_GRANULARITY_NOTE`) exists so
grain can say what it cannot see; a per-file caveat that vanishes when summarised defeats it.

## Second, separate finding in the same report

The Scala grammar **cannot fully parse ordinary Play code**. That is a grammar-coverage fact worth recording in
`docs/validation.md`'s Known boundaries — independent of whether the caveat propagates. Quantify it: what share
of Play's `.scala` files carry error nodes, and does it cluster on a particular idiom (implicits? for-comprehensions?)

## Acceptance

`review` carries the degradation caveat for any file whose `check` would carry it, capped sensibly so a repo with
many degraded files does not drown the findings. Test asserting a degraded file's caveat survives aggregation.
Plus a measured note in validation.md on Scala parse coverage.
