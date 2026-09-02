# 008 — measurement log

**Verdict: DO NOT SHIP a change to the weighted side. The half weight is derived, not tuned.**

Measured 2026-09-01 across nine repositories in eight languages. Engine instrumented with a temporary
`GRAIN_AMB_MODE` knob in `mine()`; the knob is **removed** and `plugins/grain/engine/core.mjs` is byte-identical
to its pre-experiment state. Suite green (1744/1744 at the time of writing; it was 1733 when the dispatch was
issued — another agent landed 11 tests during this run).

The one number: **the mean rank-1 responsibility `m1/(m1+m2)` of an ambiguous scope, over 4350 ambiguous scopes in
eight repositories, is 0.557.** The half weight is that responsibility, rounded conservatively down. It is a soft
assignment, not a hedge someone picked.

---

## 1. Prior art — was the asymmetry reasoned?

Yes, and it outranks the issue's framing.

`.temp/reference/2026-08-17-yg-roots-v6-spec.md` §8.5 carries a **binding weight-index table**:

> Ambiguous scopes: counted in role cells at weight `w(s,q) · 0.5` (rank-1 only, no rank-2 contribution), **silent
> in hooks for role conventions**; `_all` still applies. Weight-index table (binding): role-cell counts use
> `w(s,q)·(ambiguous ? 0.5 : 1)`; `_all` counts use `w(s,q)`; …

`git log -S` shows the half weight has been in `mine()` since the first commit (16fa901) and was never touched.
m15/G9 (b693d54) changed only `rw` (1→0) and `gi` (i→−1) on the same `add()` call, and
`tests/role-ambiguous-membership.test.mjs` records the intent explicitly: *"Only `counts` (the MDL evidence) was
meant to keep ambiguous scopes at half weight."* So the asymmetry was **deliberate and spec-bound**, not incidental.

What the spec does **not** record is *why* 0.5. That gap is what §4 below closes, and what the
`docs/mathematics.md` note now states.

§8.7 of the same spec also pre-answers the "225 of 493 are ambiguous" observation:

> Ambiguity remains the per-scope backstop (I5), and it is the dominant silence mechanism in practice.
> Role-conditioned speech is *thin* on real repositories; `_all` carries most enforceable mass. **This is a stated,
> measured property, not a defect.**

---

## 2. Method

Three modes, each a full `grain refresh` (forced relearn on warm tree/history caches) followed by a model diff
keyed on `(partition, cid, kind, pid)`:

| mode | ambiguous member's contribution to the role cell's `counts` |
| --- | --- |
| `base` | `w · 0.5` (shipping behaviour) |
| `excl` | `0` — what the issue proposes |
| `narrow` | `0` only where the cell's established (`raw`) side is unanimous, else `w · 0.5` |
| numeric | `w · k` for k ∈ {0.25, 0.75, 1.0} — sensitivity sweep |

`base` was verified behaviour-neutral: the full suite passed 1733/1733 with the knob installed.

Repos (chosen for one repo per major supported language, plus this one):
flask (Python) · spring-petclinic (Java) · CleanArchitecture (C#) · gin (Go) · axum (Rust) · express (JavaScript) ·
Slim (PHP) · sinatra (Ruby) · Grain (this repo, JavaScript).

**Grain itself is a null datapoint**: 32 commits, everything younger than `survDays`, so nothing is established and
the model carries 0 conventions in every mode. Reported for completeness, carries no information.

Tiering uses `factTiers()`'s own split, so `taut` is exactly `isDefiningFact()` (issue 003's marker-tautology test).

---

## 3. Results

### 3.1 base → excl (what the issue proposes)

| repo | facts before | after | added | dropped | added domain | dropped domain | added tautology |
| --- | --- | --- | --- | --- | --- | --- | --- |
| flask | 49 | 73 | 26 | 2 | 2 | 0 | 12 |
| spring-petclinic | 6 | 6 | 1 | 1 | 0 | 0 | 1 |
| CleanArchitecture | 17 | 23 | 7 | 1 | 1 | 0 | 3 |
| gin | 64 | 75 | 18 | 7 | 7 | 4 | 5 |
| axum | 70 | 93 | 29 | 6 | 11 | 4 | 13 |
| express | 26 | 28 | 14 | 12 | 9 | 4 | 0 |
| Slim | 22 | 35 | 15 | 2 | 3 | 0 | 5 |
| sinatra | 3 | 3 | 0 | 0 | 0 | 0 | 0 |
| Grain | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **total** | **257** | **336** | **110** | **31** | **33** | **12** | **39** |

`exp`-changed: **0** in every repo. The expected value a fact names never flips; only whether it certifies.

Tier composition of the fact set:

| tier | base | excl |
| --- | --- | --- |
| domain | 114 (44.4%) | 135 (40.2%) |
| structural | 55 (21.4%) | 78 (23.2%) |
| marker tautology | 81 (31.5%) | 116 (34.5%) |
| lexical | 7 | 7 |

### 3.2 The tautology hypothesis is refuted

The dispatch asked specifically whether half-weighting suppresses the *non*-tautological facts.

**It does not. It suppresses tautologies at a slightly higher rate than average.** 39 of the 110 added facts (35.5%)
are marker tautologies, against 31.5% in the existing fact set. Only 30.0% of the added facts are domain-tier,
against 44.4% of the base set. The change makes the fact set *less* informative per fact, not more.

### 3.3 It is churn, not growth — and the losses are true facts

31 facts stop speaking, 12 of them domain-tier. Every one has `share = 1.0` and is true. Examples:

- `gin render|r1:method auto.ptype:http.ResponseWriter = true` — 11 of 11. A real convention, lost.
- `gin _repo|r3:method auto.call:engine = true` — 10 of 10. Lost.
- `gin _root|r2:method auto.ptype:testing.T = false` — 14 of 14. Lost.
- `axum axum|r67:method auto.call:Router::new = true` — 9 of 9. Lost.
- `express test/acceptance|r4:case auto.call:request = true` — 9 of 9. Lost.

On express the fact set is nearly *replaced* rather than extended: +14 / −12.

**The gin `engine()` case is the clearest counter-example, hand-verified.** `_repo` role 3 has 10 unambiguous
members, all in `ginS/gins.go`, all `func X(...) gin.IRoutes { return engine().X(...) }`. The cell's weighted count
is 14 against `raw = 10`: the extra 4 is ambiguous members at half weight. Reading the file confirms it — *every*
function in `ginS/gins.go` calls `engine()` (25 calls, 25 functions), including the ones the clustering left
ambiguous. Under `excl` those true corroborators stop counting and the true fact dies. Excluding ambiguous members
is not a purity improvement here; it is destruction of true, agreeing evidence.

### 3.4 Are the added facts true? Yes — 66 of 66.

Independent text-level probe (`verify.mjs`): for each added role fact whose surface is text-probeable
(`auto.deco:` / `auto.ptype:` / `auto.call:` / `auto.returns:` / `auto.extends:`), slice each unambiguous member's
own source range out of the worktree and grep for the claimed surface — never asking the extractor.

- 66 added facts probed (flask 14, CleanArchitecture 4, gin 10, axum 23, express 9, Slim 6).
- 57 passed outright.
- 9 flagged; **all 9 hand-read and confirmed TRUE.** Every flag was a probe artifact: Go's arrow-less
  `func X() IRoutes`, C#'s `public static RouteHandlerBuilder MapGet(...)`, Rust's tuple return
  `-> (StatusCode, String)`, Go's variadic `...gin.HandlerFunc`, and one 11-line `@pytest.mark.parametrize`
  decorator sitting above the probe's preamble window.
- Plus three facts read member-by-member in full: flask `src|r33 auto.stshape:expression_statement(call(attribute,
  argument_list))` **12 of 12 true** (this is the issue's own flagship example), flask `tests|r8
  auto.ptype:FlaskClient` **7 of 7 true**, gin `_repo|r3` membership.

**Hit rate 66/66 = 100%. Nothing false was added.**

This is expected once the mechanism is understood, and it is why "are they true?" is the wrong question here:
`sraw`, `share`, `conform`, `deviants` and `exp` are all computed from the **ambiguous-free** population in *both*
modes (that is what m15/G9 fixed). An added fact's printed sentence is exactly the sentence the base engine would
have printed had it certified. The mode changes only whether the evidence test passes, never what is claimed.

### 3.5 Does anything false start SPEAKING? Yes, in one place.

Practical noise surface — `checkFile` over every indexed file at HEAD content, unmutated:

| | base | excl |
| --- | --- | --- |
| governed cells | 8444 | 9300 (+10.1%) |
| deviation messages | 278 | 281 (+1.1%) |
| `mutateTest` false fires | 0 | 0 |

The noise does not explode, because a fact only certifies under `excl` when the unambiguous population is
near-unanimous, and the ambiguous members that were diluting it are exactly the scopes the fact can never speak
about (`checkFile`: `roleOk = role !== undefined && !amb.has(i)`, and the sticky lookup skips `-1`). The deviation
odds already run on `srawCounts`, not `counts`.

But the message-level diff finds a genuine false accusation:

- **express `test/req.secure.js:38`** gains three messages from the newly-certified `test|r80:case auto.call:it`
  and its siblings: *"named callbacks here call `it`"*, *"never contain a `member_expression`"*, *"never use
  `expression_statement(call_expression(member_expression,…))`"*. Role 80's other members are `describe(...)`
  blocks (which do call `it`); this member is an `it(...)` callback that got pulled in by name similarity. The
  accusation is a category error. Under `base` the ambiguous members' disagreement corroborated the one
  unambiguous deviant and kept the cell below the bar. **Ambiguous disagreement is a signal that the group
  boundary is wrong, and here it is the only thing that stopped a wrong fact from speaking.**
- **flask `src/flask/sansio/scaffold.py:284#_method_route`** gains *"methods here are annotated with
  `@setupmethod`"*. `_method_route` is the private helper the 15 decorated shortcuts delegate to; it must not carry
  the decorator. The governing fact is itself a **marker tautology** (suppressed from `report`/`rules` by
  `factTiers`, but `check` does not suppress) — so `excl` promotes a report-suppressed tautology into a live
  accusation against correct code.
- flask `tests/test_config.py:13#common_object_test` gains a structural message; it is a shared assertion helper,
  not a test.
- Two messages are lost (flask `tests/test_blueprints.py:87`, express `test/acceptance/web-service.js:6`).

### 3.6 The `narrow` rule does not help

"Exclude ambiguous members only where the established side is unanimous": added 99, **dropped 27** (11 domain).
It barely improves on `excl`'s 31 dropped, because the drops come *precisely from unanimous cells* where the
ambiguous mass was supporting — the exact case the narrower rule was meant to protect. It also adds a case split
with nothing behind it. Rejected.

### 3.7 Sensitivity — w = 0 is a discontinuity, not a point on a curve

Fact counts by ambiguous weight:

| repo | 0 (`excl`) | 0.25 | **0.5 (ships)** | 0.75 | 1.0 |
| --- | --- | --- | --- | --- | --- |
| flask | 73 | 59 | 49 | 48 | 48 |
| gin | 75 | 66 | 64 | 68 | 71 |
| axum | 93 | 73 | 70 | 69 | 69 |
| express | 28 | 18 | 26 | 27 | 32 |
| Slim | 35 | 24 | 22 | 25 | 23 |
| **sum** | **304** | **240** | **231** | **237** | **243** |

For every non-zero weight the count sits in a 231–243 band. w = 0 jumps to 304 because the cell's `neff` collapses
to the unambiguous weight alone and the BIC penalty `½·log₂(neff)` shrinks with it — a different regime, not a
stronger reading of the same one.

**Full weight (w = 1) is the only alternative with a better information yield than the status quo**, and it is a
much smaller change: 257 → 270 (+5.1%), 28 added / 15 dropped, of which **15 of 28 added (54%) are domain-tier**
against `excl`'s 30%, and only 5 are tautologies. It is also arguably simpler (it deletes a constant). I still do
not recommend it — see §4 — but it is the direction worth revisiting if this is ever reopened, and it is the
opposite of what the issue proposes.

---

## 4. Why 0.5 is derived

`assignAll` marks a scope ambiguous under either of two disjuncts: `m1 − m2 < ambGap` (torn between two readings)
or `m1 < minMemb` (fits nothing well). Instrumenting both, over 4350 ambiguous scopes in eight repositories:

- gap case: 2067 (47.5%) · low-membership case: 2283 (52.5%)
- **mean rank-1 responsibility `m1/(m1+m2)` = 0.557 over all ambiguous scopes; 0.533 over the gap case alone.**

A scope torn between two readings holds roughly half the mixture weight of each. Crediting only the nearest medoid
(the spec's "rank-1 only, no rank-2 contribution") at half a vote is the soft assignment that number describes. For
the gap disjunct 0.5 is the responsibility to two decimal places; for the low-membership disjunct it is a
conservative cap. Either way it is derivable, not tuned — which is the answer the constitution's "one loss
constant" discipline demands and the record did not previously contain.

And ambiguous members are not noise to be discounted away:

| | share |
| --- | --- |
| unambiguous members agreeing with their cell's established majority | **95.8%** of weight |
| ambiguous members agreeing with the same majority | **91.4%** of weight |
| ambiguous members agreeing, in cells whose established side is unanimous | **95.9%** of weight |
| ambiguous share of a role cell's total weight | **29.2%** |
| role cells whose established side is unanimous | 18965 of 22608 (83.9%) |

(22608 role cells with `raw ≥ minRaw` and non-zero ambiguous weight, eight repos.)

An ambiguous member is 95% as reliable as an unambiguous one. `excl` throws away 29.2% of every role cell's
observed weight to remove a 4.4-point reliability gap.

---

## 5. The 225 / 493 question

Not an outlier, and not a bug. Corpus-wide, **5683 of 11661 role-eligible scopes (48.7%) are ambiguous** and
therefore governed by no role fact at all:

| repo | ambiguous / role-eligible |
| --- | --- |
| gin | 556 / 1413 (39.3%) |
| flask | 696 / 1609 (43.3%) — `src` alone 225 / 493 |
| Grain | 1333 / 2776 (48.0%) |
| sinatra | 259 / 540 (48.0%) |
| CleanArchitecture | 181 / 374 (48.4%) |
| axum | 1121 / 2269 (49.4%) |
| Slim | 461 / 825 (55.9%) |
| express | 921 / 1615 (57.0%) |
| spring-petclinic | 155 / 240 (64.6%) |

This is spec §8.7's stated, measured property: role speech is thin, `_all` carries the enforceable mass, and the
product degrades to a strong global-conventions engine when the role layer underperforms. Whether that silence
should be narrowed is a **clustering** question (`ambGap`, `minMemb`, the medoid set, the feature bag), not an
acceptance-mathematics question. Nothing here was acted on.

---

## 6. Deliverable

`docs/mathematics.md` gains a section, *"Groups, and the ambiguous member's half vote"*, between *Partitions from
compression* and *Superposition*, recording the mechanism, the 0.557 derivation, and the measured cost in both
directions (including the flask veto the issue reports and the gin `engine()` fact that `excl` would silence). The
*honest residue* bullet on the clustering ambiguity constants now points at it, since the half vote it gates is
derived rather than tuned. No engine change.

---

## 7. Incident

At 18:39 the restore of `core.mjs` from the pre-experiment backup **clobbered a concurrent agent's in-progress
edit** (a `heritageKindOf` export for issue 033, added to `core.mjs` after this run's backup was taken). The break
was visible for roughly seven minutes; that agent re-applied its work by 18:46 and the suite is green at
1744/1744. Recorded because the hazard is structural: `cp`-from-backup is unsafe on a working tree several agents
are editing at once. A future measurement dispatch should snapshot and restore by patch, not by whole file.

---

## Artifacts

`<scratch>/i008/`
— `models/` (per repo × mode `model.json` + refresh logs), `diff.mjs` (fact-set diff, tier-aware),
`verify.mjs` (independent text probe of a fact's claim), `members.mjs` (a role's unambiguous membership),
`checkall.mjs` (`checkFile` over every file + `mutateTest`), `ambstat.mjs` / `ambshare.mjs` (agreement and
ambiguity-share aggregates), `ambstat/*.tsv` (raw per-cell and per-scope dumps).
