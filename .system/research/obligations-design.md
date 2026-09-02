# Obligations — what this repo requires of me

Class G's §7 named the product gap once: grain answers **precedents** ("what does the existing code look
like") and is absent at **obligations** ("what must accompany this change", "what will break", "what rule
applies to me", "what contract pins this"). This document establishes, for each obligation question type,
what evidence would answer it, whether the model already holds that evidence, what new extraction is
needed, how the capability would be measured, and in what order to build.

Everything below is measured on the corpus clones under the session scratchpad — 20 repositories spanning C, C++, C#, Go, Java, JavaScript, Kotlin, Lua, PHP, Python, Ruby,
Rust, Scala, Solidity, TypeScript and Zig — 62 330 commits. Scripts: `oblig/mine{2..8}.mjs`, `why.mjs` (scratchpad, not committed).

---

## 0. Summary of findings

Four results decide the design. Two of them contradict the catalog, and one contradicts the brief that
commissioned this document.

1. **Q15 (migration obligation) is not a new extraction problem, and the catalog is wrong to rank it as
   "not derivable".** A migration obligation is not an ORM fact. It is a *birth obligation*: "a commit that
   adds a file under this (directory, extension) also touches file O." Mined from `git log --name-status`
   alone, gated by grain's own certification, that rule is right **94.2%** of the time it speaks. It needs
   no ORM config, no migration-directory list, no name list of any kind. What it needs is one byte
   `history.mjs` already parses and then throws away.

2. **Raw co-change loses to "touch the same three files you always touch."** Pooled over 20 repos,
   co-change ranked by max directional confidence gets recall@3 = **0.285**; the null "the 3 hottest files
   in the recent window" gets **0.336**, and beats co-change in 15 of 20 repos. Co-change's entire value is
   in the *non-obvious* companions: on companions outside the 10 hottest files it scores 0.198 where the
   null scores 0.000 by construction. An answer that mixes ambient and specific companions buries the half
   that is worth anything. `cochangeData` applies no base-rate contrast; `bridgeBits` already implements one.

3. **The violation ground truth the brief hypothesised does not exist.** "A commit that touched X alone and
   was followed by a fix touching Y is a recorded violation" was tested at file-pair level over **36 771
   candidate violations**. The follow-up rate after a *skip* is **0.246**; after a *compliant* commit it is
   **0.452** — lower after skipping, in **20 of 20 repos, no exceptions**. Restricted to fix-worded
   follow-ups: 0.034 vs 0.052, same direction. The signal is not weak; it points the other way, because a
   pair fires when both files are active, so complying is itself evidence of an active area. **Do not build
   an instrument on this.** The instrument that does work is the held-out prospective one (§4).

4. **Finer classes beat coarser ones, decisively.** Keying the rule on (directory, extension) beats keying
   it on the directory alone on *both* coverage and precision at every setting tested; truncating the
   directory to 2 or 1 segments destroys both. This matters because (module, suffix) is exactly the feature
   pair `changeArchetypes` already codes.

---

## 1. What the model holds, per question type

Verified against the engine at `42c0713` (line numbers from that commit).

### Q3 — "what else must I touch"

Splits cleanly in two, and grain's coverage differs completely between the halves.

**Edit mode — the file exists.** *Held.* `model.cochange` carries `support`, `commitsA`, `commitsB`,
`confidenceAB`, `confidenceBA` per pair; wave-3 recommendation 1 (rank by the maximum of the two
directional confidences, print the number) lands the answer. Nothing new is required. §2 below reports what
that answer is actually worth, which is less than the catalog assumes and differently distributed.

**Birth mode — the file does not exist yet.** *Not held, and structurally silent.* `cmdCheck`
(`engine/grain.mjs:901`) is the prospective entry point — `check <file> --as <path> --content <file>` norms a
file that is not in the tree — and it calls `missingLines` with **`sources: ['cochange']` only**
(`grain.mjs:1131`). A file that does not exist has no co-change history, so the one command an agent would
use before writing a new file can only return nothing. The exclusion of `'recipe'` at that call site carries
a stated reason in the code; the exclusion of `'shape'` does not.

### Q15 — migration / schema obligation

The catalog ranks this 7th and calls it *not derivable* — "needs new extraction (ORM config, migration
dirs, test-DB bootstrap)". **That framing is the error.** It treats the question as being about databases.
It is about *a class of file whose creation obliges a second file*, and the database case is one instance:

```
add tests/libtest/*.c                      => touch tests/libtest/Makefile.inc          27/27
add okhttp/src/commonJvmAndroid/kotlin/*   => touch okhttp/api/jvm/okhttp.api             5/6
add certora/specs/*.spec                   => touch certora/specs.json                  11/12
add src/Symfony/Component/Validator/*.php  => touch .../Validator/CHANGELOG.md            6/6
add docs/libcurl/opts/*                    => touch docs/libcurl/symbols-in-versions      7/8
add tests/lsp_features/*.zig               => touch tests/tests.zig                     12/12
```

Regenerating an API signature file, registering a test in a build manifest, adding a spec to a spec index,
writing the per-component changelog — these are the same obligation as "add an entity, write a migration",
and every one is visible in `--name-status` output with no knowledge of what any of those tools are. This
is the "kod to kod" version of Q15, and it generalises to repos that have no database at all.

*What is missing.* The add/modify distinction. `history.mjs:243` parses the status letter (`A`/`M`/`D`/`R`)
from git's raw output and then stores plain paths (`:253`, `:256`); `fps.files` is a deduped sorted path
list (`:552`, `:591`). Status survives only on `events[].st` (replay input, not persisted) and on the
per-scope lifecycle flag `lc[key].newFile` (`:525`), which is on `H`, not on the model. So **"a commit that
ADDS a file under module M" is not expressible in today's footprint feature bag.**

### Q9 — "what will break"

Splits, and only one half is reachable.

**File level.** *Held.* `model.edges` is the file-level import/reference graph; the inbound set is the
reverse-dependency answer, and it is the upper bound of a blast radius. It lands with wave-3
recommendation 3 (`used by: <names>`). Note that co-change and edges are *different* answers — one
behavioural, one structural — and should be printed as two labelled sets rather than merged; a file that
imports you and never co-changes with you, and a file that co-changes and never imports you, are different
risks and an agent needs to tell them apart.

**Member level** — "what breaks if I add *this field*". *Not held.* This needs symbol-level reference
resolution: which call sites read which member. Grain has file-level edges and heritage names
(`fileSups`, ≤12 names per file, `core.mjs:4301`), not a reference index. This is the same extraction N1
(data-flow path) would need. Both remain out of reach and neither is recommended now.

### N2 — "what rule applies to me"

*Mostly held; one wire missing.* `check <file>` answers for a file that exists, and `--as <path>`
`--content <file>` already answers for one that does not — that prospective path is built and shipped. What
it does not do is run the obligation renderer: `missingLines`' `'shape'` source (`core.mjs:9453–9497`)
takes the changed files, derives `m:<refined module>` and `k:<suffix>` cells, matches the best change
archetype by weighted Jaccard, and prints **the certified cells the change lacks** — which is, in the
existing engine, an obligation statement. It is wired only into `cmdReview` (`grain.mjs:1277`).

Two caveats before anyone calls this a one-line fix. First, the archetype match is gated at
`m1 >= CFG.minMemb (0.35)` and `m1 - m2 >= CFG.ambGap (0.15)`; a single new file contributes 2–3 cells, and
whether a 2-cell set clears a weighted-Jaccard bar against multi-cell archetypes is an open measurement,
not a prediction. Second, and more limiting: **an archetype cell names a module or a suffix, never a file.**
The best it can say is `tests/libtest/ (27 of 29)`. The measured, actionable answer is
`tests/libtest/Makefile.inc`. The cell-valued path cannot produce the file-valued answer, which is why §3's
recommendation is a new table and not only a new wire.

### N5 — "what contract pins this"

*Not held, and the cheapest of the true gaps.* The model holds the inheritance **edge** — `sup[]` and
`supKind{name → 'ext'|'impl'}` per scope (`core.mjs:1147`, `:1240`), `fileSups` (`:4301`),
`model.heritageKind` (`:3944`) — but **not the interface's member list**. Method scopes are unqualified
(`scopeName`, `:468–475`) and carry no parent link.

But the raw material is already on the model. `part.fileScopes[rel]` holds `[kind, name, line, endLine]`
tuples (`:4290`, capped at 200 per file), so an interface's members are recoverable **by line containment**
— every scope whose `[line, endLine]` sits inside the interface's own span — with no new parsing, no new
grammar work, and no name list: the grammar already decided what a member is. "Type `T` implements `I`,
whose members are `m1`, `m2`, `m3`" is a derived table over data grain already stores.

---

## 2. What the co-change answer is actually worth

Prospective measurement: train on the oldest 80% of each repo's commits, score on the newest 20%. For every
file in a held-out commit, predict its companions and check them against what that commit really contained.
Commits over 40 files excluded as bulk. This is the `selftest --where` model — automatic ground truth from
history, nobody labels anything — and it respects `history-levers-must-hide-own-commit`: the scored commit
is never in the training half.

| arm (top 3) | recall@3, any companion | recall@3, companion outside the 10 hottest files |
|---|---|---|
| co-change, max directional confidence | 0.285 | **0.198** |
| co-change, ranked by lift | 0.221 | 0.194 |
| co-change, lift with support ≥ 3 | 0.229 | 0.192 |
| **null: the 3 hottest files in the recent window** | **0.336** | 0.000 |
| union (2 co-change + 1 hot) | 0.362 | 0.162 |

Pooled over 20 repos, 24 324 scored cases.

**Read this carefully.** Pooled, the null wins — "touch the changelog and the lockfile" is a better answer
than co-change on 15 of 20 repos. Co-change is not thereby worthless; it is worth *exactly the non-obvious
column*, where it recovers a fifth of the companions an agent could not have guessed and the null recovers
none. The product consequence is that **`completeness` must label the two kinds and never merge them into
one ranked list**, or the ambient companions will crowd out the specific ones at every top-3 an agent reads.
The machinery for the split exists: `bridgeBits` (`core.mjs:4914–4931`) already contrasts a file's
token-conditional rate against its own base rate with KT/BIC/index-cost, and `H.fileCommits` /
`H.nonMegaCommits` (`history.mjs:578–583`) are computed at learn time. `cochangeData` (`core.mjs:9181–9206`)
applies no contrast at all — only `cochangeMinSup = 8` and `cochangeMinConf = 0.75`, both configured floors.

**One lever measured and rejected.** Ranking partners by lift instead of by max directional confidence is
*worse*: 0.221 vs 0.285 pooled and 0.194 vs 0.198 on the non-obvious stratum. Wave-3 recommendation 1's
scoring stands as designed; this closes the obvious alternative without a ticket.

---

## 3. The birth obligation, measured

### The rule

For each class `(directory of the added file, its extension)`, and each file `O` outside that class: how
many of the commits that added a file in the class also touched `O`? Both halves of the key are already
features of a commit footprint in `changeArchetypes` — `m:<refined module>` and `k:<suffix>`
(`core.mjs:5010–5029`). Nothing lexical is read; no name list exists anywhere in the rule.

### The gates — and they are grain's own, with no new constant

`changeArchetypes` certifies a cell at `core.mjs:5063–5065` with `bits > 0 && (k+0.5)/(n+1) >= 1-1/λ &&
k*2 > n`. The obligation table uses the same two tests:

1. **The contrast.** Coding "commits in this class touch `O`" at the class's own rate must cost fewer bits
   than coding it at `O`'s rate over the whole history — KT data term plus a BIC half-log model term,
   against the base-rate null. This is what stops "you must touch the changelog" being reported as a
   discovery about your module.
2. **The display bound.** `(k + ½)/(n + 1) ≥ 1 − 1/λ`, λ = 8 — the existing "naming an expected value" test
   from `docs/mathematics.md`.
3. **A support floor of 5**, which is `CFG.minRaw` — the same floor `changeArchetypes` already applies to a
   cluster before it may certify.
4. **Liveness**: the named file must have been touched in the recent window. This is the fix wave-3
   recommendation 5 applies to `how`, applied here for the same reason.

Gate 3 is load-bearing and was found by measurement, not assumed. Without it the λ bound alone passes rules
at `n = 3`, where `(3+½)/(3+1) = 0.875` clears `1 − 1/8` exactly — and those rules are wrong. On cpp-json,
**26 of 29 firing cases came from a single `n = 3` rule** (`docs/examples/*.cpp => Makefile`) and it was
wrong every time. `minRaw` removes it. No constant is introduced by any of the four gates.

### Results

Prospective, train 80% / score newest 20%, 20 repos, 2 318 held-out new-file events.

| support floor | rules | coverage | precision @ top-1 | precision, non-obvious answers | null "3 hottest" on the same fired subset | repos firing |
|---|---|---|---|---|---|---|
| none | 156 | 0.122 | 0.833 | 0.887 | 0.206 | 9/20 |
| 3 | 156 | 0.122 | 0.833 | 0.887 | 0.206 | 9/20 |
| **5 (`CFG.minRaw`)** | **55** | **0.096** | **0.942** | **0.876** | **0.143** | **6/20** |
| 8 (`cochangeMinSup`) | 19 | 0.073 | 0.988 | 0.950 | 0.154 | 4/20 |

At `minRaw`, the rule speaks on about one new file in ten and is right **94.2%** of the time — clear of λ's
0.875 bound, which is the bar grain sets for speech at all. On the answers that are *not* one of the ten
hottest files, precision is 0.876 and the null scores 0.143: the accuracy is not being carried by the
changelog.

### What is wrong with this, stated plainly

- **Coverage is low and unevenly distributed.** 6 of 20 repos produce any rule at `minRaw`. A repo whose
  directories do not accumulate 5 file-births each gets silence. That is the correct behaviour and it is
  also a real limit on how often the feature pays.
- **The pooled precision is concentrated.** c-curl contributes 139 of the 223 fired cases. Averaging over
  the 6 firing repos instead of over cases gives **0.811**, not 0.942, and axum is 0/7. Both numbers should
  be reported; the macro figure is the conservative one and it sits *below* the λ bound. The gap between
  0.942 and 0.811 is the honest uncertainty in this capability, and the acceptance in §4 is written against
  the macro figure for that reason.
- **`--name-status` sees renames as add+delete unless followed.** The measurement did not resolve renames.
  A rename-heavy repo will mine spurious births; the engine must use its existing rename walk.

---

## 4. The instrument

Every capability gets its own, on the `selftest --where` model. There is already a precedent for exactly
this shape: `selftest --how` does leave-one-out prediction of a past commit's files against a grep baseline.

**`grain selftest --obligation [--last N] [--json]`**

- **Ground truth, unlabelled.** A past commit that added a file *is* a recorded obligation: whatever else
  that commit touched is what the obligation required. Nobody annotates anything.
- **Protocol.** Learn on commits older than the candidate, predict, score against the candidate's own
  contents, advance. The candidate's commit is hidden from the model that scores it —
  `history-levers-must-hide-own-commit` applies here prospectively and must be guarded by a test, as
  ticket 069 guards `whereEval`.
- **Reported measures.** Coverage (share of new-file events where any rule fires); precision@1 and
  precision@3 on the fired subset; **precision on non-obvious answers** (top-1 outside the 10 hottest
  recent files) — the leak-free stratum of this instrument, and the one a ranking change must be judged on,
  by analogy with `where-judged-on-leak-free-stratum`; and both the **case-pooled and repo-macro** precision,
  because §3 shows they differ by 0.13.
- **Nulls, on the same fired subset.** (a) the 3 hottest recent files, (b) 3 files drawn at random from
  those alive in the training window. Measured at 0.143 and ~0.01 respectively.
- **Not used as ground truth: the skipped-then-fixed pattern.** §0.3. It was measured over 36 771
  candidates and runs backwards. If a later worker proposes it again, this is the entry that rules on it.

---

## 5. Priority

By the catalog's own criterion — frequency × price × derivability — and by what buys an agent the most.

| # | capability | questions served | corpus frequency | derivability | verdict |
|---|---|---|---|---|---|
| **1** | **birth obligation table** | Q3-birth, **Q15**, **Q12** | Q15 9 inst / ~37 calls (**median 7 — the most expensive answerable type**); Q12 24 inst / **54 calls**; Q3 7 inst / 10 calls | one dropped status byte; measured at 0.942 pooled / 0.811 macro | **build** |
| 2 | contract members (N5) | N5, Q8 | N5 5/10; Q8 **42 inst / 83 calls** | derived by line containment over `fileScopes`, already stored | build after 1 |
| 3 | ambient/specific split on co-change | Q3-edit | Q3 + blast radius, 33 inst / 63 calls | `bridgeBits` machinery exists | fold into wave-3 rec 1 |
| 4 | inbound edges by name (Q9 file-level) | Q9, Q5 | Q9 26 inst / 53 calls | held | **already landing** as wave-3 rec 3 |
| 5 | `'shape'` source on `check --as` (N2) | N2, Q3-birth | N2 9 inst / **76 calls** | one wire, but the match gate is unmeasured | measure first |
| — | member-level Q9, N1 data-flow | Q9-member, N1 | N1 4 inst / 37 calls (median 9.5) | needs a symbol reference index | **do not build** |

Number 1 leads because it is the only item that serves three question types with one table, and because Q15
and Q12 are respectively the most expensive answerable type in the corpus and the second-largest call sink
in the replay set. It also converts the catalog's own "not derivable" verdict into a measured capability,
which is the largest single correction this research produced.

---

## 6. Ticket-ready spec — the birth obligation

**Title.** `obligation`: what a new file under this path has historically required.

### Command

```
grain obligation <path> [--top N] [--json]
```

`<path>` need not exist — that is the entire point; the question is asked before the file is written. The
same table also feeds two existing surfaces:

- `check <file> --as <path>` gains an obligation line, closing the structural silence at `grain.mjs:1131`;
- `map --json` gains the table (with `changes` and `concepts`, per wave-3 recommendation 5, which fixes the
  class-C divergence where `map` prints a `changes:` line that `map --json` does not return).

### Output

```
grain obligation tests/libtest/lib2599.c

  a new *.c under tests/libtest/ has come with:
    tests/libtest/Makefile.inc        27 of 27 such commits
    tests/data/test2599               24 of 27
  ambient (this repo touches these with almost everything):
    CHANGES                           311 of 402 commits
  as of 6bc6f89
```

Two labelled sets, never one merged ranking — that is §2's finding rendered. When nothing certifies, say
which class was consulted and how many births it has, never "(complete)"; the lesson
*nota pokrycia, która nazywa 1 plik przy 133 niepokrytych* applies directly, and `weak-answer-disclosure`
sets the standard for how a near-empty answer discloses itself.

### Data source

1. **`history.mjs`: stop discarding the status byte.** `:243` already parses `A`/`M`/`D`/`R`; carry it into
   the persisted footprint alongside the path (`:253`, `:256`, `:552`, `:591`). Resolve renames through the
   existing rename walk so `R` is not mined as a birth. **`HIST_V` bump** (`config.mjs:8`) — re-walks
   history; does not re-parse source.
2. **`core.mjs`: a derived table in `learn`** (`:3845`, beside the history-derived tables at `:4866–5095`),
   keyed on `(refined module, suffix)` of the added file — the same `refineModOf`/`sufOf` pair `cellsOf`
   uses at `:5010–5029`, so the key is not a new concept. Gates exactly as §3: KT+BIC base-rate contrast,
   the λ display bound, `CFG.minRaw` support floor, liveness. **`MODEL_V` bump** (`config.mjs:9`).
3. **Optionally** add an `a:<module>` cell to `cellsOf` so archetypes themselves can distinguish a birth
   from an edit. Not required for the command; it is what would later let the `'shape'` source answer
   birth-mode questions in cell form.

### Cost

Index time: one pass over footprints that `learn` already walks; the pair counting is the same shape as
`cochangeData`'s and bounded by the same `megaCap`. Store: 55 rules across 20 corpus repos at `minRaw` —
tens of rows, not thousands. Both should be reported from a real run before merge, not predicted; the
figures here are the design's expectation and nothing rests on them.

### Constraints honoured

"Kod to kod": the rule reads path, extension and git status. No name list, no ORM knowledge, no lexical
matching. No new tuned constant — λ, `CFG.minRaw` and the KT/BIC contrast are all existing engine
machinery, and §3 shows the support floor was *derived by measurement* (the cpp-json `n = 3` failure), not
chosen.

### Tests

1. A fixture repo where adding under `d/` has 6 of 6 times touched `reg.txt`: `obligation d/new.x` names it
   with `6 of 6`.
2. The same fixture at 3 births: silent, because `CFG.minRaw` is 5. (Guards the §3 finding.)
3. A file the whole repo touches is reported under `ambient`, never as a specific obligation. (Guards §2.)
4. A rule whose named file is dead at HEAD does not speak. (Guards the wave-3 rec 5 disease.)
5. A renamed file is not counted as a birth.
6. `selftest --obligation` hides the candidate's own commit — the guard-test analogue of ticket 069.
7. Empty history, and a class with zero births, each say so rather than reporting a hollow zero.
8. `--json` shape is stable and carries `schemaNotes`, per `export.mjs:210–235`.

### Version

`HIST_V` **and** `MODEL_V` bump (`config.mjs:8`, `:9`) — new persisted history data plus a new derived
table. Engine minor version: **0.4.0**, a new command and a new export table. The documented test count is
anchored to the engine version, so it moves with the bump.

### Acceptance

On the corpus instrument: coverage ≥ 0.08 of new-file events, **repo-macro** precision@1 ≥ 0.80 with the
case-pooled figure reported beside it, and precision on non-obvious answers ≥ 0.80 against the ≤ 0.15 hot
null. Failing the macro figure while passing the pooled one is a fail, not a pass — §3's concentration is
the known risk and the acceptance is written to catch it.
