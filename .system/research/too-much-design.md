# "Too much": one definition, eight categories, and what the minimal cut would save

**The question.** A maintainer clones a brownfield repository. Which parts of it do too much — in every sense of
the phrase — and what goes under the scalpel first? It has to come out of the objective, not out of thresholds.

**The answer in one line.** An element is *too much* on a dimension when the pointwise codelength of its
statistic, under the KT predictive fitted on its own partition, exceeds the cost of a conforming one by the same
λ bound Grain already applies to accuse a deviant. One definition, ten dimensions, no per-category threshold,
no new constant.

---

## 1. The definition

For an element **e** — a scope, a file, or a module — and a dimension **d**:

1. **The statistic.** `t_d(e)` is a non-negative integer: a count, a degree, a commit tally, or a number of
   bits. Nothing else enters.
2. **The population.** `R_d(e)` is every element of the same rank in **e's own partition**, where "partition"
   means the cut `mdlCuts` already made. For a **module**-rank element there is no style partition to belong to
   — modules are cut from package roots, not from directory style — so the module graph itself is the only
   population, and the two levels below coincide.
3. **The alphabet.** `bin(t) = ⌊log₂(1 + t)⌋`. This is not a bucketing choice; it is the magnitude field of the
   standard universal code for an integer, and it fixes what "too much" *means*: excess is measured in
   doublings. It is the only scale-free reading of the phrase, and it makes the alphabet a function of the data
   rather than of a setting.
4. **The distribution.** The KT predictive the engine already uses for every categorical convention —
   `kt(c, K, x, n) = (c[x] + ½)/(n + K/2)`, imported verbatim from `engine/core.mjs` so the arithmetic here
   cannot drift from mining's. `K` = the number of bins the population shows, plus the unseen sentinel, sized
   once from the whole population so the alphabet never changes per element.
5. **The norm.** A deviation in Grain fires only where a convention was *certified*, and a convention is
   certified only when its expected value clears the display bound `(nₑ + ½)/(n_eff + K/2) ≥ 1 − 1/λ`. The
   ordinal analogue of "the expected value" for a size, a degree or a commit count is not one bin but a
   **prefix** — the norm is "at most this big" — so the same bound is applied one-sidedly to the cumulative
   mass. `normBin` is the smallest bin whose prefix clears it. Nothing at or below `normBin` can be excessive.
6. **The excess.**

   ```
   excess(e) = log₂( kt(counts₋ₑ, K, modeBin, n−1) / kt(counts₋ₑ, K, bin(t(e)), n−1) )
   ```

   This is the identical expression `core.mjs` computes for a deviation's `gapBits`, with the convention's
   expected value replaced by the population's modal bin.
7. **The bound.** It fires iff `excess ≥ log₂ λ = 3 bits` **and** `bin(t) > normBin`. One-sided by the meaning
   of the word: only a statistic above the mode can be "too much".

### 1a. Why leave-one-out

`counts₋ₑ` excludes the element under test. That is what *pointwise* means for a sequential KT predictive: the
codelength of `x_e` given `x_{−e}`. `core.mjs` leaves the deviant inside its own cell because a convention's
population runs to hundreds and one instance does not move it. Here a population can be five files, where a
god-file left inside its own bin pays itself 1.6 bits of self-immunity — measured: on Grain's six-file `engine`
partition, `core.mjs` scored 1.22 bits with itself counted and 2.81 without. Same code, correct conditioning.

### 1b. Why `CFG.minRaw = 5` is not a second floor

The largest excess any member of a population of `n` can carry is `log₂(2n − 1)` (everyone else on the modal
bin, this one alone above it). Clearing `log₂ λ` therefore requires `2n − 1 ≥ λ`, i.e. `n ≥ (λ+1)/2 = 4.5` —
**exactly 5**. `minRaw` is not an extra gate here; it is the point at which the bound first becomes reachable,
which is precisely the "compute short circuit — below it, positive bits are unreachable anyway" role
`docs/mathematics.md` already assigns it.

### 1c. Why the norm gate is what makes this shippable

Without it, the fire rate is unbounded: any bin eight times rarer than the mode fires, and a heavy tail is full
of them. With it, the norm covers at least `1 − 1/λ = 7/8` of every population by construction, so **at most
1/λ = 12.5 % of any one population is even eligible**, before the 3-bit excess cuts further. That ceiling is
derived from λ, not chosen. Measured on Yggdrasil the worst dimension (fan-out) sits at 12.36 % — at the
ceiling, as expected for a statistic whose tail is genuinely long.

### 1d. Two levels, never summed

Mining runs a two-level contrast: a cell is judged inside its own context *and* against the partition-wide
`_all:` cell. The same two levels apply here. **Local** = the element's own partition. **Repo** = every element
of that rank in the repository (kind-scoped where the statistic is not comparable across kinds: a `case`, a
`method` and a `class` do not share a length distribution, exactly as no mined convention pools two `f.kind`s
into one cell). The two are *never added* — they are two codes for the same statistic — so an element's excess
on a dimension is the stronger of the two, and every row records which level spoke.

### 1e. When the partition is too small to fit

- Below `CFG.minRaw`: **silence**, and the (dimension, population) pair is listed by name in
  `silentPopulations`. No default distribution is ever substituted for a population too small to fit.
- Fitted, but the population's own concentration cannot reach 3 bits: listed in `underpoweredPopulations` with
  its `attainableBits`. Its members stay in `scored` and drop out of `scoredPowered`, so the fire rate reads
  either way — over everything measured, or over everything that could have spoken. Measured on Grain: the
  six-file `plugins/grain/engine` partition is underpowered on four dimensions at once, and says so.

---

## 2. The dimensions

Each row: rank, statistic, and where the number comes from.

| # | dimension | rank | statistic `t` | source |
|---|---|---|---|---|
| 1 | `responsibilities` | file | `n·H` — the bits spent coding which role group each of the file's scopes plays | model cache `assignments` + `medoids` |
| 2 | `size` | file | scopes declared in the file | `tree.json` (uncapped) |
| 2b | `scope-size` | scope | lines the scope spans | `tree.json` |
| 3 | `fanout` | file | distinct files it imports | export `edges` |
| 3b | `fanin` | file | distinct files that import it | export `edges` |
| 3c | `mod-fanout` / `mod-fanin` | module | distinct modules in/out | export `moduleGraph.edges` |
| 4 | `churn` | file | commits that touched it | history cache `fps` |
| 4b | `cochange-breadth` | file | distinct files it ever changed together with | history cache `fps` |
| 6 | `multideviant` | scope | distinct conventions it fires a deviation on | export `conventions[].deviatingSites[].fires` |

### (1) Responsibilities — and why the obvious statistic is wrong

The tempting statistic is "how many role groups does this file span", or its size-free cousin `2^H`. Both are
**bounded above by the file's own scope count**, so a four-scope fixture whose four scopes happen to land in
four groups reads as maximally multi-role while a hundred-scope file reads as barely worse. Measured on
Yggdrasil, that statistic fired three times and all three were four-to-nine-scope test fixtures; stratifying the
population by size bin removed those false alarms and also removed the only true positive on Grain
(`core.mjs`), leaving the dimension dead at 0/436.

The MDL-native statistic is **the bits themselves**: `n·H`, where `H` is the Shannon entropy of the file's
scope→role-group distribution. That is exactly what the model spends coding "which role does each scope here
play", and exactly the term the minimal cut in §3 removes — so the dimension is denominated in the same currency
as its own counterfactual. A big *single-role* file costs 0 no matter how big; a small heterogeneous file costs
`4 × 2 = 8` bits; `core.mjs` costs `104 × 4.54 = 472`. Unstratified, this fires 20/436 on Grain (with `core.mjs`
top) and 10/375 on Yggdrasil.

**Ambiguity is evidence, not a dimension.** A scope with `m1 ≈ m2` is torn between two readings — a seam, and
the ticket's candidate for a cut. But ambiguity is Grain's *silence* rule, not a codelength excess: an ambiguous
scope belongs to no group's evidence at full weight and cannot be excessive on a group statistic without
contradicting that. So the ambiguous count per file is printed as an evidence field on every responsibilities
row (`core.mjs`: 141 ambiguous scopes) and is never scored. `m1`/`m2` themselves are not persisted — the model
records only the `-1` marker — so the count is what an instrument can honestly read.

### (2) Size, depth, arity

Size is the scope count (file rank) and the line span (scope rank). Both come from `tree.json`, the HEAD-only,
uncapped scope inventory; the model's own `part.fileScopes` is capped at 200 per file and saturates precisely on
the files this diagnostic exists to rank (`core.mjs` and `web-tree-sitter.js` both read exactly 200 through
that path).

**Arity is deliberately not a dimension.** `auto.arity` is already a mined convention with its own certified
expected value and its own λ deviation: a seven-parameter function in a one-parameter group already fires, and
already contributes to `multideviant`. A second arity dimension would double-count the same evidence under two
names. **Depth is dropped**: nesting depth is not recorded anywhere in the model, and inventing it would mean an
engine change, which this instrument does not make.

### (3) Fan-in and fan-out

Out-degree and in-degree over the export's file-level `edges`, and over `moduleGraph.edges` for modules. The
population caveat is disclosed rather than corrected: `relCoverage` names the grammars whose resolution is
missing or `#include`-shaped, and those files are structurally silent here.

### (4) Churn

Commits touching the file, and the number of distinct files it has ever changed together with, both read off
`fps` — the per-commit footprints — and mapped through the same forward rename chase `currentPathOf` performs.
Two confounds are **named, not corrected**:

- **Age.** A file present since the first commit has had more chances to be touched. Stratifying by age would
  shred the population; the honest move is to disclose it and let the reader discount.
- **`megaCap = 30`.** Footprints only exist for commits touching at most thirty files, so a repository developed
  in large sweeps has thin churn coverage. Measured: on Grain only 133 of 1142 indexed files have any footprint
  at all, against 1407 of 2290 on Yggdrasil. That difference is a property of how the two repositories commit,
  not of the diagnostic.

### (5) Duplication and twins — a gain, not an excess

**Dropped as a fired dimension, kept as a ranked gain.** A template is repeated *by definition*; there is no
population against which one template is excessive, and forcing one would be inventing a reference. What *is*
computable is the saving:

```
duplicationGain(T) = (n − 1) · Σ_{sig ∈ T.req} count(sig) · (−log₂ P̂(sig))
```

where `P̂` is a KT code over the repository's **own** template-signature alphabet, built from every group
profile's and residue template's `req` map. `T.req` is `profileOf`'s enumerable per-signature count of what
every member provably carries. Near-zero hole entropy is read straight off the profile: a template with an empty
`perInstance` list has no per-instance slot at all, i.e. its members differ in nothing.

Twins are the same arithmetic across two groups: the shared core stored once instead of twice. The export
publishes a twin's coverage (`sim`) but not its shared core, so the gain is the smaller side's own core scaled
by that coverage — approximate, and labelled so in every row.

### (6) Multi-deviant

The count of distinct conventions on which one scope has a `fires: true` deviation. This composes λ with λ: each
constituent deviation already cleared 3 bits on its own population, and the count of them is then judged against
the partition's distribution of counts (mode 0 in any healthy population).

### (7) Layer inversion and cycles — a graph fact, with a graph cut

**Dropped as a codelength excess.** In Grain's model a module's `layer` is the longest path to a leaf on the
**SCC-condensed** DAG, so a back-edge — an import into a strictly higher layer — is not a separate phenomenon:
it is *exactly* what makes the two modules one strongly connected component. "Layer inversion" and "cycle" are
the same fact, and a layer number being unusual is not meaningful (a graph has to have a deepest module). Hub
modules are already covered by `mod-fanin`/`mod-fanout`.

So cycles are reported as they are — a categorical graph fact, already in the model — with the **weakest edge on
the cycle by dependency count** named as the minimal cut. That is a graph cut, not a compression gain, and every
row says so.

---

## 3. "How it should be" — the counterfactual, and where there isn't one

Not a design. Grain has no opinion about what the code should look like; every problem has many solutions. What
it can compute is **the compression gain of the minimal cut**, in the same bits the excess is denominated in.

**Responsibilities — computable.** Coding "which role each scope in this file plays" costs `n·H` bits under the
file's own mixture. Split the file along its role groups and that term is gone: each part declares one role
(`k·log₂ G`, with `G` the partition's role count) and the partition pays for `k−1` new file identities at the
same `log₂(#regions)` price `mdlCuts` pays per new region root.

```
gain = n·H − k·log₂(G) − (k−1)·log₂(F + k)
```

A **negative** gain is a result, not a failure: it says the cut does not pay. Measured — splitting Grain's
`core.mjs` along its 28 role groups saves **+185 bits**; splitting Yggdrasil's `advise.ts` along its 6 saves
**−9.85**, i.e. it costs. The instrument prints both.

**Fan-out — computable.** The minimal cut is the single target directory holding most of the out-edges; the gain
is the drop in the very excess that flagged the file, one edge-group lighter: `excess(t) − excess(t − m)`.

**Duplication and twins — computable**, per §2(5).

**Multi-deviant — computable.** Bringing the scope into line with the conventions it breaks removes their gaps:
`gain = Σ gapBits`, each already certified on its own population.

**Size, churn, co-change breadth — not computable, and the instrument says so.**

- *Size*: splitting a file changes no code. The bits it "saves" are exactly the excess it was flagged for, so a
  "gain" here would be the same number twice under two names. The excess is the answer; there is no second one.
- *Churn* and *co-change breadth*: facts about the past. No cut made in the present reduces the number of
  commits that already touched the file. The excess names a hot spot; the remedy is a judgement, not an
  arithmetic.
- *Cycles*: a graph cut (the weakest edge), explicitly not a compression gain.

---

## 4. Disclosure

Seven lines ship on the surface, and the first is the one that matters:

1. **"Too much" is measured against THIS repository's own practice, one partition at a time.** The certified
   norm printed for every dimension IS the yardstick — "files here declare at most 6 scopes, 90 % of 280". A
   repository where every file is a god-file has a god-file norm and flags nothing, correctly, and the printed
   norm is what lets a reader see that happening.
2. One-sided: only a statistic above its population's mode can be excessive.
3. The per-element total is a **sum of independent codes used as a ranking key only**. Size, fan-out and churn
   are correlated in real code, so the sum is an upper bound on a joint excess, never a claim of "N bits of
   debt".
4. Populations below `CFG.minRaw` are silent and named; `minRaw` is where the bound first becomes reachable
   (§1b).
5. Fitted-but-underpowered populations are named with their `attainableBits`.
6. Churn and co-change breadth carry the age confound, uncorrected and disclosed.
7. Coverage: `responsibilities`/`size`/`scope-size` see only files with a grammar; `fanout`/`fanin` see only
   files the relation layer resolves, and `relCoverage` names the gap.

And one more, which the measurement forced (see `too-much-yggdrasil-grain.md`): **the per-dimension "fires" flag
is not a verdict, the ranking is.** The union over ten dimensions names 27 % of Yggdrasil and 10 % of Grain —
too much to be a flag list, by this project's own 018/037 standard. The product is the ranked top-N by total
excess, where the two files Yggdrasil's own config calls its hot spot land at #1 and #4 of 2290.

---

## 5. What this needs from the engine: nothing

The instrument (`plugins/grain/tests/stress/too-much.mjs`) makes **zero engine changes**. It imports `kt` and
`CFG` so the arithmetic is byte-identical to mining's, and reads three artifacts: the export, the model cache
(`assignments`, `medoids`, partition file lists) and the history cache (`fps`). The two things it reads from the
cache rather than the export are named in its header, because the export cannot supply them: group members are
capped at 200 per group and no partition file list is published; co-change pairs are published only above
`cochangeMinSup = 8`.

**No new tuned constant is introduced anywhere.** The only numbers are `CFG.lambda = 8` and `CFG.minRaw = 5`,
both the engine's own, plus the binary-magnitude binning, which is a code rather than a setting.
