# 052 — measurement log

## Part 0 — adjudication design, PRE-REGISTERED (written before any `siblings:` line was looked at)

Recorded 2026-09-02, before running `whatCmd` on any corpus repo. Engine snapshot: worktree
`research/052` at merge-of-main, `engine/core.mjs` md5 `77562a64d98e6e1f8919dd2b1fa380dc`,
`engine/config.mjs` md5 `b4decde88bef161012820ba5441c2fd5`. Corpus models are read from each repo's
existing `.grain/cache/model.json` **read-only** — no repo is re-learned, nothing under a corpus repo or
under `plugins/grain/` is written by the measurement.

### The surface under measurement

`core.mjs:7745-7760` computes it, `core.mjs:7834` renders it:

```js
// (d) siblings: the OTHER members of any container a matched value belongs to
const matchedKeys = new Set(valueHits.map(h => h.key));
for (const h of valueHits) {
  const contEntry = Object.entries(model.valueSiblings || {}).find(([, sibs]) => sibs.includes(h.key));
  ...
  const others = sibs.filter(k2 => !matchedKeys.has(k2));
  ...
}
if (siblings.length) lines.push(voice('practiced', `siblings: ${siblings.join(' · ')}`));
```

Read plainly: one value in the repo matched the query (`valueHits`, gate (b)); the container that value sits
in is looked up; and **every other member of that container is printed**, minus the ones that also matched.
There is no relevance test of any kind between the query and the values actually printed — the only filter
applied to them is that they must NOT match the query.

### Unit of measurement

**Primary unit: one rendered sibling VALUE.** That is the atomic claim the reader must individually refute,
and it is what the field report is about ("random string-literal soup"). A value is one backticked token in
the rendered line.

**Secondary unit: one rendered `siblings:` LINE** — scored HIT if AT LEAST ONE of its values is a hit. This
is the maximally generous reading ("the line paid for itself if anything on it was useful") and is reported
alongside the primary figure.

### The rubric for HIT (fixed here; not revised after seeing data)

> A sibling value **V**, shown under query **Q**, is a **HIT** if a competent maintainer of that repo, seeing
> `what "Q"` return V under `siblings:`, would say: *"yes — knowing V exists helps me understand what Q is,
> or how it is used, in this codebase."* Concretely, at least one of:
>
> - **(i) peer alternative** — V is a member of the same closed set of choices as the thing Q names: another
>   member of the enum Q is a member of, another HTTP method when Q is a method, another log level when Q is
>   a level. Knowing the whole set is the point of the answer.
> - **(ii) same subject** — V names the same domain concept as Q, an attribute of it, or a value it is
>   compared against, even with no shared token.
> - **(iii) paired value** — V is the partner of Q's own value at the same site: a key to Q's value, a header
>   name to Q's header value.
>
> A sibling value is **NOISE** if the only thing it has in common with Q is that it happens to sit inside the
> same syntactic construct — a nearby unrelated string literal, a path or file-extension fragment, a build/CI
> or tooling token, a fragment of a human-readable message, a format or punctuation string, a name from an
> unrelated domain.
>
> **Tie-break: an unsure value counts HIT.** The bias is deliberately toward the tool, so the precision
> figure reported here is an *upper bound* on precision and therefore a *conservative* estimate of any noise
> problem. Same tie-break as §044.

### Query sampling (fixed here)

A reader types the repository's own salient words, so the query pool per repo is:

1. `model.concepts` — the repo's certified code∩commit-message vocabulary (§J4.3b). This is the engine's own
   answer to "what words does this repo actually talk in", so it is not a pool invented for this measurement.
2. Topped up, if under 40 entries, with the most frequent declaration-name tokens taken from
   `model.partitions[].fileScopes` — again the repo's own vocabulary, never mine.

Every query in the pool is run through `whatCmd`. The queries that produce a NON-EMPTY `siblings:` line are
the **population the reader meets**. If a repo yields more than 12 such queries, adjudicate a uniform random
sample of **12** drawn with a fixed seed (`seed = repo name`); otherwise adjudicate all of them. Within one
sampled line, adjudicate up to **6** values — all of them if the line has ≤ 6, otherwise a seeded uniform
sample of 6 — and record how many were elided, so the per-value denominator is honest.

Sampling is uniform over lines, NOT stratified by container kind, so the per-repo precision figure is an
unbiased estimate of what the reader meets; the named-vs-anonymous-container cut is a secondary cut of the
same sample.

### Repos (fixed here)

Seven, seven languages, including the exact repo of the field report:

`playframework` (Scala — the field report), `gin` (Go), `flask` (Python), `nest` (TypeScript),
`okhttp` (Kotlin), `spring-petclinic` (Java), `CleanArchitecture` (C#). C# and Java are included
deliberately because they have first-class named `enum` declarations — the surface's BEST case — so the
corpus is not stacked against the feature.

### Null model (fixed here) — question 2

Two comparisons, both fixed before data:

- **N1, lexical.** Mean token overlap (Jaccard over `normTok` token sets) between Q and the values actually
  shown, versus between Q and the members of a RANDOM container drawn from the same repo's
  `model.valueSiblings`. Prediction recorded in advance: **both ≈ 0 by construction**, because `others`
  explicitly removes every key that matched Q. So N1 is expected to be uninformative and is recorded only to
  demonstrate that fact rather than assume it.
- **N2, adjudicated — the real test.** For each sampled query, build a card that shows the query and a
  SHUFFLED mix of real siblings and decoys: values drawn from a *different, randomly chosen* container in the
  same repo (same repo, same value kinds, seeded). The adjudicator does not know which is which. If the hand
  hit-rate on real siblings is indistinguishable from the hit-rate on random decoys, the gate is admitting
  values at the **arbitrary-pair baseline** and is selecting for nothing — the §044 population-median finding,
  in this surface's own terms.

### Secondary cut (fixed here) — no new constant

Every container carries `model.valueContainer[c]`: the container's DISPLAY NAME, non-null only for a named
enum, null for a positional string-literal set and for a Go `const`/`var` block. Precision is reported
separately for **named** and **anonymous** containers. This is a structural distinction the model already
records; using it introduces no numeric threshold.

### The bar (fixed here)

**0.70**, taken from §044 unchanged — the supermajority proportion (2/3, rounded up) the engine's own
acceptance gates already use, so the bar is not invented for this measurement.

### What would count as each outcome

- **Surface earns its place** — per-value precision ≥ 0.70 AND clearly above the N2 decoy baseline. No change.
- **Evidenced negative / keep + disclose** — precision below the bar but meaningfully above the N2 baseline,
  and the surface is pull-shaped or cheap for the reader to refute. Disclose the rate; keep the line.
- **Delete** — precision at or near the N2 baseline (the gate selects for nothing), or push-shaped with low
  precision, or the claim reaches `rules`/`CONVENTIONS.md` where it is committed into the user's repository.

### Amendment to the sampling plan — recorded BEFORE any sibling value was looked at

The N2 decoy arm doubles the number of hand verdicts per adjudicated value. To keep the total hand-verdict
budget comparable to §044's 75, the per-repo sample changes from "12 lines × up to 6 values" to
**8 lines × up to 3 values**, drawn the same seeded-uniform way. That is 7 repos × 8 queries × 3 = **168 real
values**, each paired with a decoy, for 336 blind verdicts. Aggregate n = 168 real, per-repo n = 24 real —
the same order as §044's 25-per-repo. No other part of the pre-registration changes. Recorded before any
`*.pop.json` file was opened; the only figures seen at this point are container/group COUNTS, never a value.

---

## Part 1 — corpus and reproduction

Seven repos, seven languages, including the field report's own. Models read from each repo's existing
`.grain/cache/model.json` (all at `MODEL_V = m23`, the current schema) — nothing re-learned, nothing written.
Query pool per repo = `model.concepts` + the most frequent declaration names, 60 queries each, 420 total.

| repo | language | pool | queries that FIRE a `siblings:` line | fire rate | sibling values shown | mean values per firing line | worst single line |
|---|---|---|---|---|---|---|---|
| playframework | Scala | 60 | **48** | 0.80 | 6499 | **135.4** | **759** |
| gin | Go | 60 | 16 | 0.27 | 479 | 29.9 | 73 |
| flask | Python | 60 | 31 | 0.52 | 1413 | 45.6 | 205 |
| nest | TypeScript | 60 | 54 | 0.90 | 3660 | 67.8 | 345 |
| okhttp | Kotlin | 60 | 38 | 0.63 | 2507 | 66.0 | 222 |
| spring-petclinic | Java | 60 | 16 | 0.27 | 797 | 49.8 | 106 |
| CleanArchitecture | C# | 60 | 15 | 0.25 | 483 | 32.2 | 76 |
| **total** | | **420** | **218 (52%)** | | **15 838** | **72.7** | |

**The field report reproduces and was understated.** On playframework the line fires on 4 of every 5 queries
and averages 135 values; one query renders **759 backticked string literals on a single line**, in the
`practiced` voice — the register `voice()` documents as "the statistical claim".

### The container population it draws from

| repo | sibling containers | NAMED (an enum with its own identifier) | accepted by `model.valueNorms` |
|---|---|---|---|
| playframework | 841 | 19 | 0 |
| gin | 59 | 0 | 0 |
| flask | 77 | 1 | 0 |
| nest | 895 | 35 | 3 |
| okhttp | 419 | 1 | 0 |
| spring-petclinic | 47 | 2 | 0 |
| CleanArchitecture | 55 | 26 | 0 |
| **total** | **2393** | **84 (3.5%)** | **3 (0.1%)** |

**`what` renders raw container membership and never consults the engine's own certification.** `model.valueNorms`
is the KT/BIC/`CFG.lambda` co-travel test built at `core.mjs:5155-5196` and documented in
`docs/mathematics.md` §"Value concordance" — "whether a set of siblings travels together … is a codelength
question". `check`/`review`'s `kin:` line reads it (`valueKinGaps`, `core.mjs:9271-9278`: `if (!model.valueNorms)
return out`). `what`'s block (d) reads `model.valueSiblings` directly. Across the corpus that certification
accepts **3 of 2393** containers; `what` was rendering all 2393. And 96.5% of them are ANONYMOUS — a positional
string-literal set or a Go `const`/`var` block with no name to print, which is the "string-literal soup" the
field report saw.

## Part 2 — precision (question 1)

Sample drawn per the pre-registration: 8 seeded-uniform queries per repo, 3 seeded-uniform values per query,
each paired with a decoy from a different container in the same repo. **56 cards, 330 items, shuffled, labels
hidden.** Verdicts recorded to `verdicts.json` with `TRUTH.json` unopened; scored afterwards.

| repo | per-value precision | 95% Wilson CI | decoy baseline | lift | line-level (≥1 of 3) |
|---|---|---|---|---|---|
| playframework (Scala) | **8/24 = 0.33** | [0.18, 0.53] | 3/24 = 0.13 | +0.21 | 6/8 |
| gin (Go) | **7/24 = 0.29** | [0.15, 0.49] | 2/24 = 0.08 | +0.21 | 3/8 |
| flask (Python) | **7/24 = 0.29** | [0.15, 0.49] | 2/24 = 0.08 | +0.21 | 4/8 |
| nest (TypeScript) | **8/24 = 0.33** | [0.18, 0.53] | 2/24 = 0.08 | +0.25 | 5/8 |
| okhttp (Kotlin) | **12/24 = 0.50** | [0.31, 0.69] | 3/24 = 0.13 | +0.38 | 6/8 |
| spring-petclinic (Java) | **7/24 = 0.29** | [0.15, 0.49] | 4/24 = 0.17 | +0.13 | 4/8 |
| CleanArchitecture (C#) | **11/21 = 0.52** | [0.32, 0.72] | 5/21 = 0.24 | +0.29 | 7/8 |
| **aggregate** | **60/165 = 0.364** | **[0.29, 0.44]** | **21/165 = 0.127** | **+0.236** | **35/56 = 0.63** |

**0.364 against a pre-registered bar of 0.70**, and it is an upper bound: the tie-break was applied liberally
(a Jackson feature flag under the query `java`, a test-fixture body string under `body`, an NSwag codegen option
under `client` were all scored HIT as "unsure"). Even the deliberately generous LINE-level reading — the line
counts as a hit if any one of its three sampled values was useful — reaches only 0.63, still under the bar.

No language clears it. The two that come closest (C# 0.52, Kotlin 0.50) are the ones with real named enums and
with build-module / event-callback containers.

## Part 3 — null model (question 2): the gate DOES select, and that is not enough

This is where §052 parts company with §044, and the honest answer is the less convenient one.

- **N1, lexical.** Mean query↔shown-value token Jaccard: 0.000–0.004. Mean query↔random-container Jaccard:
  0.000–0.028. **The random baseline is HIGHER on 6 of 7 repos.** Mechanically inevitable and worth stating:
  block (d) prints `sibs.filter(k2 => !matchedKeys.has(k2))`, i.e. exactly the members that did NOT match the
  query, so lexical relatedness is filtered out by construction. N1 is uninformative, as pre-registered.
- **N2, adjudicated — the real test.** Real siblings score **0.364**, arbitrary-container decoys **0.127**.
  Two-proportion **z = 4.99**. Container co-membership is a genuine signal, ~2.9× the arbitrary-pair baseline.

**So, unlike §044's twin gate, this gate is not sitting at the population median — it is selecting for
something real.** It is simply selecting far too weakly to justify a push surface, and then printing 72.7 of
the results at once. The §044 verdict is reached by a different route: not "the evidence is worthless" but
"the evidence is weak, unbidden, and delivered by the bucket".

### The one constant-free narrowing, measured and rejected

`model.valueContainer[c] !== null` (render only NAMED enum containers) is a structural field already in the
model, so it adds no constant. Measured over the same populations:

| | now | named-only |
|---|---|---|
| firing queries | 218 | 33 |
| values shown | 15 838 | 909 |
| mean values per line | 72.7 | **27.5** |
| worst single line | 759 | 72 |
| languages with any output | 7 | **4** (gin, flask, okhttp go to zero) |

27.5 values per line is still soup, and it deletes three of the seven languages outright — the same objection
§044 raised against a minimum-skeleton-size floor. It does not rescue the surface.

## Part 4 — push or pull (question 3): **PUSH, unambiguously**

`siblings:` is emitted inside `whatCmd`'s answer block (`core.mjs:7834`), between `spread:` and `changes:`,
whenever any indexed value happens to match. The reader asked *"what is «q» here"*. There is no flag, no
sub-command and no argument by which a reader can ask for siblings, and none by which they can suppress them.
The values printed are, by the filter's own definition, the ones that are NOT what the reader asked about.
It reaches `what --json` identically, and through it the MCP tool `grain_what` — so an agent's context window
takes all 6499 playframework values, which is where the volume hurts most.

The PULL counterpart for the same evidence already exists and is the certified one: `check`/`review`'s `kin:`
line. It fires only when the reader's own change touched that container, and it reads `model.valueNorms`. That
is precisely §044's `twin:` group-card relationship — the reader has already opened the thing being spoken about.

## Part 5 — does it reach `rules`/`CONVENTIONS.md` (question 4): **NO**

Checked, not assumed. `cmdRules` (`grain.mjs:1857`) renders `rulesMarkdown` (`core.mjs:8917`), which composes
partition facts, markers, archNorms, steers and health rows. Grepped its whole body: no `valueSiblings`, no
`valueContainer`, no `valueNorms`, no `kin`. `siblings:` exists only in `what`'s text output and `what --json`.

**This is the one dimension on which §052 is lower-stakes than §044**, where 83 unrefuted twin instructions were
being written into a committed document. Here the damage is transient — but it is transient noise delivered 218
times over 420 queries, at 72.7 items a time, in the voice reserved for statistical claims.

## Part 6 — recommendation: DELETE the `siblings:` surface

This is what the pre-registered criteria select. The "delete" branch reads: *precision at or near the N2
baseline, **or push-shaped with low precision**, or it reaches `rules`*. The middle clause fires: push-shaped
(Part 4) at 0.364 against a 0.70 bar (Part 2). The "keep + disclose" branch requires the surface be
*"pull-shaped or cheap for the reader to refute"* — it is neither: 72.7 values per line, worst line 759.

A disclosure line cannot fix a volume problem. Telling a reader "roughly 1 in 3 of the following 135 string
literals is related to your query" does not make the 135 literals cost less to read; it just makes grain say so.

This is a deletion. **It introduces no new tuned constant, and removes none.**

What is kept, deliberately, exactly as §044 kept `model.twins`:

- `model.valueSiblings`, `model.valueContainer`, `model.valueNorms` — untouched. No `MODEL_V` bump: the model
  is unchanged, this is render-only.
- `export`'s `valueSiblings` field and its `schemaNotes` entry — a published interface (§adoption review).
- `check`/`review`'s `kin:` line — the pull surface, and the certified one.

Recorded as a flagged finding for the director, NOT implemented here (the brief forbids a new tuned constant,
and this is one): if the maintainer would rather narrow than delete, the constant-free option is to require
`model.valueNorms[c]` before rendering a container — that reuses `CFG.lambda`'s existing certification and adds
no number. It was not implemented because it was measured at **3 of 2393 containers**, i.e. it would fire on
essentially nothing while leaving the code path alive. A rendered cap (`slice(0, N)`) would be a new tuned
constant and is therefore the director's call, not mine.

---

## Part 7 — the change, proven red→green

Branch `research/052`, based on `main` at `4d84b66` (verified: `git merge main` → "Already up to date",
`git diff main..HEAD` empty before the change). Base suite measured at **2011 tests, 2011 pass, 0 fail** — the
brief's "≥2021" figure predates this merge; main is fully green at 2011.

### The edit

Four hunks, all render-only:

| file | change |
|---|---|
| `engine/core.mjs` | block (d), the sibling computation, replaced by the note recording this measurement |
| `engine/core.mjs` | the `siblings:` render line deleted |
| `engine/core.mjs` | `siblings` dropped from `whatCmd`'s return |
| `engine/grain.mjs` | `siblings` dropped from `cmdWhat`'s destructure and from `--json` |
| `tests/what-command.test.mjs` | the two assertions that pinned the line, re-pointed to assert its absence |
| `docs/reference.md:19` | "sibling values" removed from the `what` row |

### New file: `tests/what-siblings-not-a-push-line.test.mjs`

Six tests in two deliberate halves, on the §044 pattern — the second half must pass in BOTH arms, because a
guard that only holds after the change guards nothing. The fixture is the surface's BEST case: a NAMED enum
container, three members, and the one value that would have been printed (`CANCELLED`) is a genuine peer
alternative. If the deletion is right, it has to be right even here.

| test | RED | GREEN | what it pins |
|---|---|---|---|
| (a) no `siblings:` line, while `defined:`/`values:`/`spread:` still render | **fail** | pass | the deletion is real AND surgical |
| (b) `what --json` has no `siblings` field, other fields intact | **fail** | pass | the agent-facing path, where the volume hurts most |
| (c) the container is still fully learned, named, and indexed | pass | pass | proves (a)/(b) pass for the RIGHT reason — it is a rendering decision, not a vanished input |
| (d) both arms — `export` still publishes `valueSiblings` verbatim | pass | pass | the published interface is untouched |
| (e) both arms — the export `schemaNotes` entry survives | pass | pass | same |
| (f) both arms — every value `what` names is one the index carries | pass | pass | the invariant that outlives this renderer |

Measured directly, against the unmodified engine and then against the changed one:

```
RED   (engine unmodified):  tests 6, pass 4, fail 2
                            ✖ (a) §052: `what` renders NO siblings: line …
                              actual: 'siblings: OrderStatus: `CANCELLED`'
                            ✖ (b) §052: `what --json` carries no `siblings` field …
                              got keys query,defined,values,spread,siblings,changes,usedBy,…
GREEN (deletion applied):   tests 6, pass 6, fail 0
```

The two RED failures are exactly the deletion's two claims and nothing else.

### Full suite

| arm | tests | pass | fail |
|---|---|---|---|
| base (`main` @ `4d84b66`) | 2011 | 2011 | 0 |
| **GREEN** (this branch) | **2017** | **2017** | **0** |

2017 = 2011 + this ticket's 6 new tests, which confirms 2011 independently: the two amended assertions in
`what-command.test.mjs` were edits in place, not additions.

Two intermediate full-suite runs reported cancellations (939, then 10) with `fail 0` — machine contention from
the other agents on this box, not this change. Every cancelled file was then run directly and passed:
`decide-waive`, `review-command`, `voices`, `what-command`, `what-honest-negative`, `what-tested-by`,
`what-weak-answer-disclosure`, `where-eval`, `where-json-member-line`, `where-recipe-filebirth` — 100 tests,
0 fail. The third full run completed clean at 2017/2017/0.

### Version bump: none, and it is render-only by construction

`EXTR_V`/`MODEL_V`/`HIST_V` are untouched. Nothing this ticket edits participates in extraction or in learning:
`model.valueSiblings`, `model.valueContainer` and `model.valueNorms` are built identically before and after, and
test (c) asserts exactly that on the fixture — the container, its name `OrderStatus`, all three members and the
`enum:CANCELLED` index entry are all still there after the change. A user with a warm cache gets the new
rendering with no rebuild.

### Flagged to the director, NOT implemented

1. **A `valueNorms` gate instead of deletion.** Constant-free (reuses `CFG.lambda`'s existing certification),
   principled, and it is what `check`'s `kin:` already does. Measured at **3 of 2393 containers** across the
   corpus, so it would fire on essentially nothing while leaving a dead code path. Recorded, not shipped.
2. **A rendered cap on the list.** Would be a NEW tuned constant — out of bounds for this ticket by the brief,
   and §039's lesson (a cap must decide only what is displayed) would need re-arguing for it.

## 2026-09-02 03:06 — MEASURED: per-value precision 0.364 [0.29-0.44] over 165 blind verdicts, 7 languages, vs a pre-registered 0.70 bar (unsure=HIT, so an upper bound). Decoy null 0.127 (z=4.99) — unlike 044 the gate DOES select, just far too weakly. PUSH surface; 218/420 queries fire; mean 72.7 values/line, worst 759. Engine's own valueNorms certification accepts 3 of 2393 containers rendered. Never reaches rules/CONVENTIONS.md. Named-only narrowing measured and rejected (27.5/line, zeroes 3 of 7 languages). RECOMMEND + SHIPPED: delete the siblings: surface from what (text and --json); model/export/check's kin: untouched. Red 4/2 -> green 6/6; full suite 2017/2017/0.
