# What evidence should rank a placement? — `where`'s ranking, measured against every other source the model holds

**Verdict: no single evidence source moves the leak-free stratum, and the fix is structural.** Three levers were
built and measured — commit-message affinity, co-change propagation, a birth-place prior — each a different
evidence source, each constant-free. None lifts leak-free `hit@3` on both the median and the head-to-head, and
every one of them costs pooled `hit@3`. The reason is upstream of ranking: **for 73% of leak-free misses no source
in the model reaches the right file at all**, and for 36% of them the right file scores exactly zero on `where`'s
lexical scale — it is invisible, not mis-ranked.

Written for issue 012. Nothing here is shipped; the engine changes are experiments on `research/where-lever`.

---

## 0. What was measured, and how to re-run it

Seven repositories, seven languages, engine at the merge of `main` (1878 tests, 0 fail — the lever hook is inert
when unused, and `selftest --where` on petclinic returns byte-identical JSON with the hook present).

| repo | language | indexed files | candidates (`--last 100`) | leak-free |
|---|---|---|---|---|
| spring-petclinic | Java | 77 | 14 | 6 |
| flask | Python | 99 | 32 | 10 |
| telescope.nvim | Lua | 86 | 47 | 27 |
| openzeppelin-contracts | Solidity | 754 | 100 | 22 |
| CleanArchitecture | C# | 424 | 26 | 15 |
| leveldb | C++ | 134 | 19 | 12 |
| playframework | Scala | 1683 | 100 | 35 |
| **total** | | | **338** | **127** |

The candidate derivation, the strata and the baseline arm are `whereEval`'s own, unchanged. The attribution
harness re-implements `whereCmd`'s scorer so it can read the full ranking even where the concentration safeguard
suppresses the answer; it was verified against `whereCmd` on every candidate it could (**304 comparisons, 0
mismatches**).

**One methodological rule this work had to add.** Every history-derived source is measured with the candidate's
**own birth commit subtracted** — its message tokens removed from `msgTokCommits`, its file touches removed from
`msgAff`/`fileCommits`, its own pair support removed from the co-change graph, its own birth removed from the
birth counts. Without that subtraction a source is credited for the very commit that defines the answer. This is
not a theoretical worry; it is worth roughly a doubling (§4.4).

---

## 1. Failure characterisation — the leak-free misses

`where` misses 111 of the 127 leak-free candidates at `hit@3`. What is actually wrong with those 111:

| | count | share |
|---|---|---|
| truth's file card scores **exactly zero** | **40** | 36% of 111 |
| truth is scored but ranked below the cut | 71 | 64% of 111 |
| …of those, median rank of the truth among file cards | **16** | |
| `where` ranked nothing at all (safeguard fired, or no lexical match) | 19 | 17% of 111 |
| lost on a tie-break at equal score | 3 | 3% |
| median score lift needed to enter the top 3 | **0.181** | of 68 reachable (p25 0.088, p75 0.283) |
| …needing ≤ 0.02 lift (a re-weight could plausibly reach) | 6 | 9% of 68 |
| …needing ≤ 0.10 lift | 21 | 31% of 68 |

*(Denominators differ by a few because the lift analysis reads the ranking **without** the concentration
safeguard's suppression — 108 misses, 68 of them reachable — while the counts above treat a suppressed answer as
the miss it is, 111 misses, 71 reachable. Both are stated rather than merged.)*

**This corrects 012's headline.** "The failure is ranking, not blindness" is true of the pooled corpus and false
of the leak-free half: a third of these truths carry none of the query's words in any form. And of the ones that
are visible, the median needs +0.181 on a scale where the median top hit scores about 0.3 — that is not a
tie-break, a weight tier, or a stemmer away.

What ranked first instead, on a leak-free miss: a **file** card 62 times, a **directory** 36, a group 6, a marker
3, nothing 4. And **472 of the cards ranked above the truth sit in the truth's own directory**, spread across 48
of the 108 misses read without suppression — `where` frequently gets the area right and the file wrong, which is why its leak-free
`place@3` sits closer to the baseline than its `hit@3` does.

Single-token queries are **1 of 108** leak-free misses, so §037's `coversQt` concern is not what this stratum is
made of. None of the three levers touches `qt` derivation, `QSTOP`, `coversQt` or `whatCmd`'s `weakName` gate —
they re-score cards that are already built, after `qt` is fixed.

---

## 2. Source attribution — which evidence, if consulted, would have placed the truth?

Each source is a ranker over files, built from the model (and from `H` where the model prunes it away), with the
candidate's own commit subtracted. The question asked of each: *does the truth land in YOUR top 3?*

| evidence source | reaches the truth at all | **top-3** | top-1 | median rank when reached |
|---|---|---|---|---|
| path-token baseline (the arm `where` must beat) | 51 | **13** | 7 | 14 |
| commit-message affinity (`H.msgAff`, leak-subtracted) | **54** | **10** | 7 | 16 |
| file doc comments (`fileDocs`, already in cards at 0.5) | 26 | **10** | 3 | **6** |
| value index (`model.valueIndex`) | 16 | 1 | 0 | 16 |
| markers / heritage matching a query token | 14 | 2 | 2 | 27 |
| co-change with `where`'s own top 3 (`model.cochange`) | 5 | 0 | 0 | 10 |
| role-cluster siblings of the top lexical hit | 2 | 1 | 1 | 6 |
| *(same directory as the top lexical hit — a place signal, not a file one)* | 18 | — | — | — |
| **union of all seven** | | **30** | | |
| **no source reaches the truth in its own top 3** | | **81 / 111 (73%)** | | |

Read this table honestly and it settles the design question the ticket asked.

- **The best single untapped source rescues 10 of 111.** Commit-message affinity has the broadest reach (54) and
  the worst ordering (median rank 16). Doc comments have the best ordering (median rank 6) and almost no reach
  (26), and they are *already* in the card at `TOKW.doc`.
- **Co-change and role clusters are empty, not merely outvoted.** The shipped co-change graph contains the truth
  for 5 of 111 — it is pruned to `cochangeMinSup 8` / `cochangeMinConf 0.75` and holds 27–304 pairs on
  repositories of 77–1683 files. Rebuilt **unpruned** from `H.fps` it reaches 33 of 74 (the six-repo run, before playframework was
  added), so the pruning is real — but even unpruned it puts the truth in the top 3 only **4** times. Reach was never the binding constraint;
  ordering was. Role clustering reaches 2 of 111, because a newly born file is usually role `-1` (exactly
  `PetValidator`'s situation in the original ticket) and has no cluster to be a sibling of.
- **Even the union of everything the model holds covers 30 of 111.** There is no combination of these sources,
  weighted any way at all, that fixes the leak-free stratum.

### 2.1 Would a wider card vocabulary reach the 40 invisible ones?

Asked directly, as an oracle rather than a lever: of the 43 leak-free truths whose card scores exactly zero
(7-repo count), how many carry a query token in the value index, in their declared type references
(`fileTypeRefs`), or in their full import specifications — none of which the file card indexes today?

**Three of 43.** Forty remain unreachable. (The 43 here is the population whose card carries no matching token
at all; the 40 in §1 is the population the full scorer gives exactly zero. The three-file difference is precisely
the cards lifted off zero by the exact-name pin without any token match — which is the same shortcut the leak-free
stratum exists to exclude.) The commit message and the file it created share no vocabulary at all,
in any index this repository builds. That is the honest bound on a lexical instrument, and it is why widening the
card is not the fix either.

---

## 3. The three levers

Each is a different evidence source, each is constant-free, each was implemented behind a `lever` hook in
`whereCmd` that no product call site passes (`whereEval` alone supplies it).

- **A — commit-message affinity.** For each query token, the files that commits saying that word touched *in
  excess of their own base rate* (the shipped bridge's own direction test). A card scores the share of the
  query's commit-side idf mass its files explain; combined with the lexical score by noisy-OR,
  `1 − (1−lex)(1−aff)`, so there is no weight to tune. Two aggregations were measured: **A(max)**, where one hot
  file carries the whole card, and **A2(mean)**, where a wide card must earn its width.
- **B — co-change propagation.** A dense, unpruned co-change graph from `H.fps`. The top three lexical cards lend
  score to the files history says move with them: `aff(f) = max over seeds s of lexScore(s) × conf(s→f)`. Noisy-OR
  again. This is the "reach 33 instead of 5" version, not the shipped graph.
- **C — birth-place prior.** The repository's own record of where it *creates* files. Lexical score as the
  likelihood, the directory's share of all births as the prior: `score' = lex × birthShare(dir) / maxBirthShare`.
  Constant-free, and name-free — it reads the `newFile` record, not a word list, so it stays inside the
  maintainer's "no semantic recognition of tests or examples by NAME" ruling.

Nothing here needed a new tuned constant, so "no new constant" was never the binding constraint. All three failed
on the evidence, not on the budget.

---

## 4. Results — leak-free stratum, seven repos, leak-subtracted

### 4.1 `hit@3` — the acceptance metric

| repo | n | none | A(max) | A2(mean) | B | C | baseline |
|---|---|---|---|---|---|---|---|
| spring-petclinic | 6 | 0.667 | 0.167 | 0.167 | 0.333 | 0.500 | 0.000 |
| flask | 10 | 0.300 | 0.100 | 0.200 | 0.100 | 0.200 | 0.400 |
| telescope.nvim | 27 | 0.148 | 0.074 | 0.148 | 0.074 | 0.111 | 0.148 |
| openzeppelin-contracts | 22 | 0.091 | 0.000 | 0.000 | 0.091 | 0.136 | 0.091 |
| CleanArchitecture | 15 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.067 |
| leveldb | 12 | 0.083 | 0.083 | 0.083 | 0.167 | 0.250 | 0.167 |
| playframework | 35 | 0.057 | 0.086 | 0.057 | 0.029 | 0.000 | 0.171 |
| **median** | | **0.091** | 0.083 | 0.083 | 0.091 | **0.136** | 0.148 |
| **Δ vs none** | | | −0.008 | −0.008 | +0.000 | **+0.045** | |
| **repos better / worse** | | | 1 / 4 | 0 / 3 | 1 / 4 | **2 / 4** | |

C is the only positive median, and it is **worse on four of seven repositories**. A median carried by two repos
against four is noise, not a lever.

### 4.2 `place@3` — and the artifact that eats it

| repo | none | A(max) | A2(mean) | B | C | baseline |
|---|---|---|---|---|---|---|
| **median** | 0.227 | **0.500** | 0.114 | 0.333 | 0.259 | 0.267 |
| **Δ vs none** | | **+0.273** | −0.113 | +0.106 | +0.032 | |
| **repos better / worse** | | 4 / 2 | 0 / 7 | 3 / 2 | 3 / 3 | |

A(max) looks like a large win and is not one. `place@3` credits any card that *contains* the truth, and says
nothing about how wide that card is. Measuring the width of the card that earns each credit:

| repo | files | none | A(max) | A2(mean) | B | C |
|---|---|---|---|---|---|---|
| spring-petclinic | 77 | 1 | 9 | 1 | 1 | 1 |
| flask | 99 | 3 | 12 | 1 | 12 | 1 |
| telescope.nvim | 86 | 2 | **55** | 1 | 8 | 7 |
| openzeppelin-contracts | 754 | 44 | 87 | – | 14 | 44 |
| CleanArchitecture | 424 | 27 | 41 | – | 25 | 27 |
| leveldb | 134 | 4 | **42** | 1 | 6 | 1 |
| playframework | 1683 | 4 | 12 | 2 | 22 | 48 |

On telescope, lever A earns 17 of its 22 place-credits with the single card `lua/telescope/` — **55 of the
repository's 86 files, 64% of it**. "Where does a new picker go?" answered with "somewhere under
`lua/telescope/`" satisfies `place@3` and tells the reader nothing. A2, which makes a wide card earn its width by
averaging instead of maximising, gives the honest reading of the same source: **−0.113, worse on all seven
repositories**. B's smaller `place@3` gain is partly the same purchase (flask 3→12, telescope 2→8, playframework
4→22).

### 4.3 MRR, and the pooled stratum

| | none | A(max) | A2(mean) | B | C |
|---|---|---|---|---|---|
| leak-free MRR (median) | 0.104 | 0.033 | 0.062 | 0.060 | 0.136 |
| Δ vs none | | −0.071 | −0.043 | −0.044 | +0.032 |
| repos better / worse | | 0 / 6 | 1 / 6 | 0 / 6 | 3 / 3 |
| **pooled `hit@3` (median)** | **0.255** | 0.071 | 0.115 | 0.149 | 0.250 |
| **Δ vs none** | | **−0.184** | **−0.140** | **−0.106** | **−0.005** |

Every lever damages the pooled stratum. 012's rule was that a lever lifting pooled while leaving leak-free flat
has bought nothing; the mirror image holds here, and none of these three even earns the trade.

### 4.4 The leak, quantified — a rule for every future lever

The same levers, measured **without** subtracting the candidate's own commit (what a shipped implementation would
score on this harness as it stands):

| | leak-free `hit@3` leaky | leak-subtracted | inflation |
|---|---|---|---|
| A2 (message affinity) | 0.171 | 0.083 | **×2.1** |
| B (co-change) | 0.091 | 0.091 | ×1.0 |
| C (birth prior) | 0.182 | 0.136 | ×1.3 |

On openzeppelin the message-affinity lever scores `hit@3` **0.500 leaky and 0.000 clean** — the entire apparent
gain is the harness handing the lever the commit that defines the answer. `selftest --where` cannot see this on
its own: the query is a commit message and the model is built from all of history, including that commit.

**Rule to adopt: any lever that reads commit messages, co-change, or birth records must be measured with the
candidate's own commit subtracted, or the harness will bless it.** 012's log never stated this, and it is the
single most dangerous property of an otherwise good instrument.

---

## 5. Recommendation

**What `where` should rank on: nothing available beats what it already uses.** That is the measured answer, and
it should be recorded rather than papered over with a fourth lever.

The reasoning, in order of how load-bearing it is:

1. **73% of leak-free misses are unreachable by every evidence source in the model, individually or together.**
   A ranking change cannot fix a retrieval problem whose answer is not in the index.
2. **36% of them are invisible, not mis-ranked** — the truth's card scores exactly zero — and widening the card
   with the value index, declared type references and full import specs reaches 3 of 43. The commit message and
   the file it created simply share no words.
3. **Of the 64% that are visible, the median needs +0.181.** Six of 111 need ≤ 0.02. There is no re-weighting of
   `TOKW`, no stemmer fix and no tie-break repair with that much room in it. (012's own member-name demotion was
   already measured at +0.000 on this stratum; this explains why, and predicts the same for its neighbours.)

### What to do instead

**(a) Close the two harness defects before any further lever is judged.** Both were found by this work and both
are cheap:

- **`place@3` must disclose or discount card width.** As it stands a lever can score +0.273 by ranking the
  repository root, and did. Minimum fix: report the median width of the credited card beside `place@3`
  (implemented here as `unnamed.placeWidthMed`, ~4 lines). Stronger fix: credit only the narrowest containing
  card. Without this the gate is gameable, and the next lever to try will game it.
- **Leak subtraction for history-reading levers** (§4.4), as a documented property of the harness.

**(b) Re-aim the product's promise at the half that is answerable.** `where`'s `hit@3` asks it to name a file that
does not exist yet; for a third of real intents nothing in the repository connects the ask to the answer. Its
`place@3` on the leak-free stratum is the reading that matches what `where` promises — "where do such things live, which
exemplar to copy" — and it is the one metric where `where` is roughly level with the baseline rather than far
behind it (0.227 vs 0.267 on this corpus; 0.571 vs 0.474 on 012's eight). Making place-and-exemplar the headline,
with a width-honest metric behind it, is a product decision this measurement supports; chasing `hit@3` is not.
It is worth saying plainly that this is a narrowing of what `where` claims, not a fix that makes it better.

**(c) If one lever must be carried forward, it is C, and not yet.** The birth-place prior is the cheapest to ship
(one integer per directory on the model; no query-time cost; no `H` at query time, unlike A and B which need a
2k–47k-pair affinity table or a 10⁴–10⁵-pair dense graph persisted and a `MODEL_V` bump), it is constant-free, it
is name-free and therefore inside the maintainer's ruling, and it is the only arm that costs the pooled stratum
almost nothing (−0.005). But at 2 repos better against 4 worse it has not earned a landing, and it should not get
one on a median.

### Acceptance test for any future lever

All four, together, on ≥ 6 repositories of ≥ 4 languages:

1. leak-free `hit@3` median improves, **and**
2. at least ⅔ of repositories improve individually — no median carried by two outliers,
3. pooled `hit@3` does not regress,
4. the median width of the card earning `place@3` does not grow.

Measured leak-subtracted, always reported beside the leaky number.

---

## 6. What is in the tree, and what is not

Committed on `research/where-lever`: this document, and nothing else. The engine changes below are left
**uncommitted in the worktree** as experiments — they are the vehicle for the measurement, not a proposal:

- `engine/core.mjs` — a `lever` parameter on `whereCmd` (a hook called after scoring, before ranking; no product
  call site passes it); the three lever builders inside `whereEval` behind `lever` / `leak` options; and
  `unnamed.placeWidthMed`, the credited-card width.
- `selftest --where` output is unchanged when no lever is asked for: petclinic returns byte-identical JSON, and
  the suite is 1878 tests / 0 fail, the same as the merge base.

Not attempted, and why: **retuning `TOKW` again** (012 measured it at +0.000 leak-free and §1 explains the
mechanism); **a name-based test-file demotion** (forbidden by the maintainer's 2026-08-25 ruling, and the
name-free proxy for it — import in-degree — fails on the data: the truth itself has in-degree > 0 in only 8 of 68
reachable misses, the import graph being far too sparse); **an LLM or embedding bridge** (`docs/validation.md`'s
standard is that every number comes from a run a user can repeat offline on their own repository).
