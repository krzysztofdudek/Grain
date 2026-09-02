# 044 · Structural-twin "duplicate" suggestions are mostly noise — second language to report it

**Status:** FIXED — twins health row deleted, twin: line kept, shipped on fix/044 (merged, 27/27 green). Bookkeeping-only.
**Found by:** round 2 (Go/gin, ~90% noise) and round 3 (Solidity/OpenZeppelin, 83 suggestions), 2026-09-01
**Severity:** medium — plausible noise, which this project treats as worse than silence

## Symptom

`report` emitted **83** `grain decide steer … duplicate of … unify or document why both exist` suggestions on OZ.
Some are real: `Packing.sol`'s `extract_16/20/22/24/28/32` are genuinely templated repetition.

Most are not. A `Math.t.sol` test helper `_squareBigger` was flagged as a duplicate of an access-control
`_unsafeAccess`/role-revocation function, and of an unrelated `clone+deterministic` helper. **The shared "shape"
amounts to "returns an expression."**

Independently, the Go/gin field test judged twin suggestions ~90% noise, with pairs whose only shared trait was
"calls a test helper, takes `testing.T`".

Two languages, two testers, same complaint — so this is not a language-fit accident.

## Why it matters here specifically

Every one of these renders as an actionable instruction to the user (`grain decide steer …`). A suggestion the
reader must individually refute costs more than no suggestion, and 83 of them buries the handful that are real.
Precision matters far more than recall for this surface.

## What to establish

1. **Measure precision** on at least 3 repos: of N twin suggestions, how many survive a reader's judgement?
   Hand-adjudicate a sample; report the number. Until that exists nobody knows whether the honest fix is a
   stricter acceptance, a cap, or removing the surface.
2. Is the skeleton similarity that admits these pairs dominated by a near-empty shape (`return <expr>`)? If a
   trivially-small skeleton is passing the MDL gate, the question is whether the gate's population is right —
   NOT whether to add a size threshold. A new tuned constant contradicts the constitution; see `CFG` and §008.
3. Does `report` cap the list? 83 suggestions in one run suggests not, and an uncapped actionable list is its own
   defect (cf. §039, where a cap silently changed an answer — here the absence of one may be the problem).

## Acceptance

A measured precision number, and then either a justified change to what qualifies as a twin, or a decision that
the surface stays as-is with its rate disclosed. Recorded here either way.


## Measurement result

Criterion fixed **before** any pair was seen; "unsure" counted REAL, so every figure is an **upper bound**.
`shared`, coverage and co-change were computed only after verdicts were locked.

| repo | precision | 95% CI | sampled |
|---|---|---|---|
| OpenZeppelin (Solidity) | 9/25 = **0.36** | 0.20–0.55 | 25 of 83 |
| gin (Go) | 1/25 = **0.04** | 0.01–0.20 | 25 of 76 |
| flask (Python) | 8/25 = **0.32** | 0.17–0.52 | 25 of 27 |
| **aggregate** | 18/75 = **0.24** | 0.16–0.35 | |

Zero twins on petclinic (Java), leveldb (C++), telescope (Lua). Both field reports confirmed; Go is worse than
the tester's ~90%-noise estimate.

### The real fault is the population, not a threshold

Null model: over 861 arbitrary same-root gin pool pairs the median shared core is **10**. gin's *accepted* twins
median is also **10**. **The gate admits pairs at the population median** — `shared > remainders` never consults
what two arbitrary groups already share, so it is not selecting for anything.

This also kills the tempting fix on its own evidence: noise cores are bare declaration syntax (gin's is literally
`func X(t *testing.T) { … }`, 10 nodes), but gin's whole population is 6–23 and flask's is 5–12, so **any floor
clearing gin deletes flask's 8 true rows**. Subtracting the measured median is constant-free and lifts aggregate
to 0.56, but zeroes Go and loses 4 of 18 true hits — **diagnosis, not fix. Do not implement.**

### Two findings worse than the precision figure

1. **Rows are not independent.** 33 of OZ's 83 rows are `Packing.sol` pairing with itself — one fact rendered as
   33 separate instructions. 6 of flask's 27 are one mirrored test fixture.
2. **No cap anywhere, and it reaches committed files.** `report` prints all 83; `--top` does not touch it;
   **`grain rules` writes all 83 into the committed `CONVENTIONS.md`**; export carries 393. The only thinning is
   `roleExemplar` failing to find an anchor (393→83) — accidental, not relevance.

### Ruling

Delete health signal 5 (`core.mjs:3634-3642`). A deletion; no constant added or removed.

The distinction that makes this conservative rather than destructive is **push versus pull**: the health row
pushes 83 accusations at a reader who did not ask, at 76%-noise-by-upper-bound, into a version-controlled file.
The group card's `twin: structurally the same as «B»` line answers a reader who opened that group — observation,
not accusation, capped at one per group. Keeping it means no information is lost.

`model.twins` and the export schema stay: export is a **published interface** (declared so this release).
