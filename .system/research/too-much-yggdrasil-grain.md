# Does the "too much" diagnostic point at what these two repositories already know is their problem?

**Method.** `plugins/grain/tests/stress/too-much.mjs` (design: `too-much-design.md`), zero engine changes, run
on two repositories whose answers are known in advance.

| repo | as of | files indexed | partitions | modules | commit footprints | conventions certified |
|---|---|---|---|---|---|---|
| Yggdrasil (read-only reference) | `5cca6b1` | 2290 | 19 | 37 | 1344 | 149 |
| Grain (this worktree, `research/096-too-much` at `6e17813`) | `6e17813` | 1142 | 19 | 20 | 185 | **0** |

**The known answers.**

- Yggdrasil: `.yggdrasil/yg-config.yaml` calls `source/cli/src/cli/check.ts` *"a recurring hot spot"* for the
  reviewer prompt ceiling, in a comment that has been amended four times to keep raising `max_prompt_chars`.
  Separately, `yg check --attention-dump` names 15 files that "deviate structurally from their neighbours".
- Grain: `plugins/grain/engine/core.mjs` is 10 658 lines and `engine/grain.mjs` 3 092.

Nothing about either was given to the instrument.

---

## 1. Headline

| question | answer |
|---|---|
| Does it find Yggdrasil's named hot spot? | **`source/cli/src/cli/check.ts` ranks 4 of 627 flagged files (2290 indexed)** — 24.67 bits on 4 dimensions. And `source/cli/src/core/check.ts`, the other half of the same command, ranks **1**. |
| Does it find Grain's? | **`engine/core.mjs` ranks 1 of 117** (47.84 bits, 6 dimensions of 6 possible); **`engine/grain.mjs` ranks 2** (41.82 bits, 6 dimensions). |
| Overlap with the 15 `yg advise` flags? | **12 of 15** flagged on ≥1 dimension; 3 on ≥3. Three not flagged at all. |
| Fire rate | Per dimension 0.8–12.4 % on Yggdrasil, 0.9–10.5 % on Grain. **Union over all dimensions: 27.4 % / 10.3 %** — too many to be a flag list. See §5. |
| Cycles | 2 on Yggdrasil, identical to the two `yg advise` nominates; 0 on Grain. |

---

## 2. Yggdrasil — fire rate per dimension

| dimension | scored | fired | rate | fired at partition level | at repo level | the certified norm (largest population) |
|---|---|---|---|---|---|---|
| responsibilities | 375 | 10 | 2.67 % | 5 | 5 | at most 30 bits (100 % of n=115) |
| size | 2290 | 226 | 9.87 % | 89 | 143 | at most 2 scopes (89 % of n=501) |
| fanout | 2290 | 283 | **12.36 %** | 66 | 254 | at most 0 (95 % of n=501) |
| fanin | 2290 | 202 | 8.82 % | 44 | 187 | at most 0 (97 % of n=501) |
| churn | 1407 | 160 | 11.37 % | 62 | 136 | at most 6 commits (90 % of n=280) |
| cochange-breadth | 1407 | 42 | 2.99 % | 24 | 30 | at most 62 partners (92 % of n=280) |
| scope-size | 17630 | 914 | 5.18 % | 769 | 528 | at most 62 lines (94 % of n=7628) |
| multideviant | 5829 | 240 | 4.12 % | 240 | 2 | at most 2 (100 % of n=1322) |
| mod-fanout | 37 | 0 | 0 % | 0 | 0 | at most 14 (100 % of n=37) |
| mod-fanin | 37 | 0 | 0 % | 0 | 0 | at most 14 (100 % of n=37) |

Silent populations: 24 (below `CFG.minRaw`). Underpowered but fitted: 2, both named with their
`attainableBits` (2.81, under the 3 the bound demands). Wall time on a warm export: **3.6 s**.

The theoretical ceiling is `1/λ = 12.5 %` per population (§1c of the design). fan-out sits at 12.36 % — at the
ceiling, which is what a genuinely long tail looks like, not a tuning failure.

### Files firing on ≥ k dimensions

| ≥1 | ≥2 | ≥3 | ≥4 | ≥5 | ≥6 |
|---|---|---|---|---|---|
| 627 (27.4 %) | 209 (9.1 %) | 65 (2.8 %) | 20 (0.87 %) | 2 (0.09 %) | 0 |

### Top 12 by total excess

| # | file | dims | bits | what |
|---|---|---|---|---|
| 1 | `source/cli/src/core/check.ts` | 4 | 30.91 | fanout 19, fanin 44, churn 51, co-change 376 |
| 2 | `source/cli/tests/fixtures/runcheck-parity/src/core/check.ts` | 5 | 28.76 | resp 10, size 9, fanin 9, churn 4, co-change 59 |
| 3 | `source/cli/src/cli/advise.ts` | 5 | 24.95 | resp 49, size 44, fanout 23, churn 17, co-change 130 |
| 4 | **`source/cli/src/cli/check.ts`** | 4 | 24.67 | fanout 13, fanin 4, churn 60, co-change 354 |
| 5 | `source/cli/src/core/graph-loader.ts` | 4 | 24.59 | fanout 10, fanin 85, churn 16, co-change 136 |
| 6 | `source/cli/src/core/fill.ts` | 4 | 23.12 | fanout 23, fanin 22, churn 30, co-change 230 |
| 7 | `source/cli/src/core/validator.ts` | 4 | 22.61 | fanout 9, fanin 14, churn 45, co-change 223 |
| 8 | `source/cli/src/relations/pass.ts` | 4 | 20.50 | fanout 14, fanin 23, churn 22, co-change 175 |
| 9 | `source/cli/src/relations/resolve-path.ts` | 4 | 20.50 | fanout 10, fanin 24, churn 17, co-change 131 |
| 10 | `source/cli/src/io/aspect-parser.ts` | 4 | 20.44 | fanout 7, fanin 13, churn 28, co-change 156 |
| 11 | `.yggdrasil/aspects/runcheck-injected-input-parity/check.mjs` | 3 | 19.79 | size 19 (one 230-line `check`), churn 6, co-change 85 |
| 12 | `source/cli/src/model/graph.ts` | 4 | 19.67 | size 19, fanin 10, churn 29, co-change 183 |

**`check.ts`'s per-dimension ranks:** churn 7/160, co-change breadth 4/42, fan-out 20/283, fan-in 109/202. Its
419-line `registerCheckCommand` is separately the highest-excess scope in `source/cli/src/cli` (7.31 bits).
Nothing about the reviewer prompt ceiling is visible to Grain; it reached the same file through history and
coupling alone.

### The 15 files `yg advise` calls structurally deviant

| rank | file | fired on |
|---|---|---|
| 15 | `tests/integration/relation-pass.test.ts` | size 63, fanout 11, churn 14, co-change 146 |
| 30 | `src/templates/knowledge/cli-reference.ts` | churn 54, co-change 303 |
| 39 | `src/core/graph/aspects.ts` | fanout 4, fanin 36, churn 9 |
| 73 | `src/core/graph/impact-graph.ts` | fanout 4, fanin 5, churn 12 |
| 117 | `tests/unit/ast/suppress.test.ts` | size 107, churn 7 |
| 133 | `tests/unit/core/aspect-effective-nowhere.test.ts` | size 45, fanout 7 |
| 192 | `tests/unit/io/architecture-parser.test.ts` | size 50, churn 9 |
| 193 | `tests/unit/io/aspect-parser.test.ts` | size 46, churn 9 |
| 215 | `tests/unit/core/validator-core.test.ts` | size 52, fanout 3 |
| 323 | `src/core/graph-metrics.ts` | fanin 4 |
| 367 | `tests/portal-e2e/support/harness.ts` | fanin 6 |
| 452 | `tests/unit/templates/platform.test.ts` | size 59 |
| — | `tests/portal-e2e/consistency-with-check.spec.ts` | not flagged |
| — | `tests/e2e/cli-advise-type-covered-churn.test.ts` | not flagged |
| — | `tests/unit/io/flow-parser.test.ts` | not flagged |

**12/15, and the agreement is weaker than it looks.** `yg advise`'s field compares a file only against its own
node's same-language siblings on ten raw counts (size, nesting, functions, classes, imports, branches, calls,
literals); this instrument compares against a compression-derived partition on ten *different* statistics, four
of which (churn, co-change, fan-in, fan-out) `yg advise` does not measure at all. The two agree on the crude
half — size — and diverge elsewhere by construction. Eleven of the 15 are test files; that is a property of
`yg advise`'s own stratification (a node needs ≥5 same-language files before anything is compared, and test
nodes have the big families), not of this diagnostic.

---

## 3. Grain — fire rate per dimension

| dimension | scored | fired | rate | at partition level | at repo level | certified norm (largest population) |
|---|---|---|---|---|---|---|
| responsibilities | 436 | 20 | 4.59 % | 2 | 18 | at most 30 bits (100 % of n=79) |
| size | 1142 | 81 | 7.09 % | 10 | 80 | at most 6 scopes (99 % of n=432) |
| fanout | 1142 | 10 | 0.88 % | 6 | 10 | at most 2 (100 % of n=432) |
| fanin | 1142 | 42 | 3.68 % | 4 | 42 | at most 0 (100 % of n=432) |
| churn | 133 | 14 | 10.53 % | 6 | 8 | at most 2 commits (94 % of n=98) |
| cochange-breadth | 133 | 4 | 3.01 % | 1 | 3 | at most 30 partners (99 % of n=98) |
| scope-size | 6807 | 442 | 6.49 % | 240 | 270 | at most 30 lines (97 % of n=1165) |
| multideviant | **0** | 0 | — | — | — | — |
| mod-fanout | 20 | 1 | 5 % | 1 | 0 | at most 2 (95 % of n=20) |
| mod-fanin | 20 | 1 | 5 % | 1 | 0 | at most 2 (95 % of n=20) |

Silent: 9. Underpowered but fitted: 11 (the six-file `plugins/grain/engine` partition is underpowered on four
dimensions at once, and says so). Wall time: **0.9 s**.

| ≥1 | ≥2 | ≥3 | ≥4 | ≥5 | ≥6 |
|---|---|---|---|---|---|
| 117 (10.3 %) | 33 (2.9 %) | 12 (1.05 %) | 5 (0.44 %) | 2 (0.18 %) | 2 (0.18 %) |

### Top 6 by total excess

| # | file | dims | bits | what |
|---|---|---|---|---|
| **1** | **`plugins/grain/engine/core.mjs`** | **6** | **47.84** | resp 472 bits, size 326 scopes, fanout 3, fanin 81, churn 62, co-change 138 |
| **2** | **`plugins/grain/engine/grain.mjs`** | **6** | **41.82** | resp 109, size 119, fanout 4, fanin 4, churn 27, co-change 90 |
| 3 | `tests/relations/unit/_unit-harness.mjs` | 3 | 30.83 | size 23, fanout 15, fanin **825** |
| 4 | `plugins/grain/engine/history.mjs` | 4 | 30.04 | resp 34, size 39, fanin 15, churn 11 |
| 5 | `engine/vendor/relations/resolve-path.mjs` | 4 | 21.34 | resp 30, size 23, fanout 8, fanin 2 |
| 6 | `engine/vendor/web-tree-sitter/web-tree-sitter.js` | 3 | 21.24 | resp 490, size 315, fanin 1 |

`core.mjs` and `grain.mjs` are the **only two files in the repository that fire on all six file-rank
dimensions**, and they are 1 and 2 by total excess. `core.mjs` is rank 1 of 81 on size, 1 of 42 on fan-in, 1 of
4 on co-change breadth, 2 of 20 on responsibilities, 2 of 14 on churn.

### What the minimal cut says

- **Splitting `core.mjs` along its 28 role groups saves +184.79 bits** (472.16 coded before, 287.37 after), the
  largest positive cut gain in either repository. The five largest scopes inside it are `learn` (1392 lines),
  `extractScopes` (809), `whereCmd` (549), `checkFile` (477), `bindingFor` (309) — 3 536 lines in five scopes.
- **Splitting Yggdrasil's `advise.ts` along its 6 role groups saves −9.85 bits, i.e. it costs.** The cut is
  computed and reported as not paying. **All ten** of Yggdrasil's responsibilities rows carry a negative gain: on that repository the diagnostic finds no file whose role split pays.
- Size, churn and co-change breadth carry **no** cut gain by construction, and print `—`.
- Duplication, top gain: Grain's `kotlin-name-resolution-matrix` residue template — 43 members, 302 shared
  skeleton nodes, **zero per-instance holes**, 61 116 bits if extracted once. On Yggdrasil the top is a 34-member
  `tests/unit` template at 12 435 bits. Both are test-suite duplication; neither repository's production code
  carries a template near that size.
- Twins, top gain: Grain's `php-name-resolution-matrix::3 ~ ::4` at 993 bits (same shape under
  "silence" and "edge"); Yggdrasil's `core::11 check ~ core::4 architecture+check` at 78.85 bits.
- Cycles, Yggdrasil: `cli ↔ portal` (weakest edge `portal→cli`, 4 dependencies) and
  `core ↔ relations ↔ structure` (weakest `relations→core`, 2). Both are exactly what `yg advise` nominates.

---

## 4. False alarms, judged

| what fires | judgement | why |
|---|---|---|
| `tests/fixtures/type-relation-gate/src/svc/handler.ts` — fan-out **rank 1 of 283** on 3 imports | **FALSE** | Its own partition is a fixture whose files import nothing, so the certified norm is "at most 0" and any import at all is out of norm. The arithmetic is right; the population is not a place where "does too much" means anything. Grain has no name lists and cannot tell a fixture from production — an accepted class. The joint ranking demotes it: **1 of the top 20 files** is under `tests/fixtures`. |
| `.yggdrasil/yg-lock.*.json` (238 and 173 commits), `package-lock.json` (111), `package.json` (92) — churn ranks 1, 2, 4, 5 | **TRUE statistic, USELESS advice** | Generated and manifest files genuinely change on nearly every commit. Nothing goes under a scalpel there. Churn alone should never be read as a nomination — which is why the surface ranks on the *total* and these files reach only #15/#16 there (2 dimensions each). |
| Yggdrasil `responsibilities` rows 7–10 — four-to-nine-scope fixtures and unit tests | **FALSE, and quantified** | The residue of the statistic's floor: `n·H` for a 4-scope file maxes at 8 bits, and the repo-level norm sits at 0 because most files play one role. All ten Yggdrasil responsibilities rows carry a **negative** cut gain, so the counterfactual contradicts the excess on the same row. |
| `multideviant` at `t = 1` — **234 of 240 rows** | **REDUNDANT, not false** | The norm for this dimension is "no deviations at all" (95.9 % of Yggdrasil's governed scopes), so one fired deviation is already out of norm. At `t=1` the dimension says exactly what `grain check` says. It adds information only at `t ≥ 2`: **6 scopes on Yggdrasil**, led by `graph-loader.ts#constructor` (4 conventions, 15.6 bits to conform) and `mock-reviewer.ts#case#data` (3, 14.13 bits). |
| Grain `web-tree-sitter.js` — resp 490 bits, size 315, rank 6 | **TRUE and correctly ranked** | It is vendored generated code, and it genuinely is a god-file. Grain's exclusion ruling says a committed vendor tree is the repo's own choice. Not a defect of the diagnostic. |

---

## 5. Verdict

**The diagnostic points where both repositories already know their problem is, and it does so from the
objective with no new constant.** The two files Yggdrasil's own config calls a recurring hot spot rank **1 and
4 of 2290**; the two files this repository knows are its monoliths rank **1 and 2 of 1142** and are the only
two that fire on every file-rank dimension. Both cycles Yggdrasil's own tool nominates come back identically.

**But the per-dimension "fires" flag is not shippable as a flag list, and the measurement says so plainly.**
Six of ten dimensions clear 5 % on both repositories, but fan-out (12.36 %), churn (11.37 %) and size (9.87 %)
sit at or near the structural ceiling `1/λ = 12.5 %`, and the **union over ten dimensions names 27.4 % of
Yggdrasil**. By this project's own 018/037 standard — 18.6 % rejected, 1.58 % shipped — a flag list at 27 % names
nothing. Three consequences, and they are design conclusions, not knobs:

1. **The product is the ranking, not the flag.** Top-N by total excess bits is bounded by N, carries its own
   evidence per row, and puts the known answers at the top on both repositories. The ≥3-dimension slice (2.8 %
   of Yggdrasil, 1.05 % of Grain) is the natural "under the scalpel" shortlist — but note that "≥3" would be a
   *new tuned constant* if it were made a gate, so it is reported as a distribution, never as a threshold.
2. **The norm gate is what makes even 12 % possible.** Without it (mode-reference alone) the rate is unbounded;
   with it every population's out-of-norm mass is at most `1/λ` by construction. That ceiling is the honest
   limit of what one λ can buy on a heavy-tailed integer statistic.
3. **What would tighten it further is an index cost.** Grain pays `log₂ C` for the choice of which cell speaks
   at all, so multiple comparisons are inside the objective. This instrument makes ~46 000 (element, dimension,
   level) comparisons and pays nothing for the selection, because `core.mjs`'s own deviation test doesn't
   either (`d < tau`, no index cost). Charging one would need a second-stage certification — "does this
   (dimension, population) cell earn its own bits against the repo-wide rate?" — which is a real design
   decision about a *pointwise* quantity, not a refactor. **Escalated, not decided here.**

**Weakest dimension: `responsibilities`.** It works (it puts `core.mjs` at rank 2 with the only large positive
cut gain in either repo) but it is thin: only 375 of Yggdrasil's 2290 files and 436 of Grain's 1142 have two or
more *assigned* scopes at all, because **48.7 % of role-eligible scopes are ambiguous by design and belong to no
group**. A file whose scopes are each unique cannot be multi-role in Grain's sense — roles are populations —
which is correct, and also means the statistic sees roughly half of what a reader would call a
responsibility. `core.mjs` carries 141 ambiguous scopes against 104 assigned ones.

---

## 6. Confounds, named

1. **The Yggdrasil index was built by a sibling worker.** Ticket 094's export started one minute before mine on
   the same repository; I killed my duplicate rather than have two writers on one content-addressed cache,
   reused their warm `/home/user/Yggdrasil/.grain/cache/`, and **left it in place** (deleting it would break
   094 mid-run). Yggdrasil's `.grain/` is therefore still present and is the only untracked artifact there;
   `.yggdrasil/.feature-field.json`, which `check --attention-dump` rewrote, is gitignored by
   `.yggdrasil/.gitignore:8`. No tracked file was touched.
2. **Grain certifies zero conventions, so `multideviant` is vacuous on it.** Cause, measured: the repository is
   five weeks old and the **median scope age is 11.9 days**, under `CFG.freshDays = 14`. More than half of all
   scopes have not survived long enough to enter the survived-raw population, so almost no cell reaches
   `sraw ≥ CFG.minRaw` and the printed-population half of the λ bound refuses everything. It is the age gate
   working as designed, not a defect — and it is a useful negative result for the brownfield north star:
   **nine of the ten dimensions work on a repository where the convention layer says nothing at all.**
3. **`megaCap = 30` thins churn coverage unevenly.** Footprints exist only for commits touching at most 30
   files, so churn covers 1407 of 2290 Yggdrasil files but only **133 of 1142** Grain files — Grain is built in
   large sweeps. Cross-repo churn rates are not comparable for that reason alone.
4. **Age is not corrected for in churn.** Yggdrasil's churn top-10 is dominated by files present since early
   history. Disclosed, not adjusted.
5. **Grain was measured on this worktree** (`research/096-too-much` at `6e17813`, the base branch plus 093's
   merge), not on a separate base checkout. The worktree adds no source files beyond the base at that commit.
6. **The model cache caps `fileScopes` at 200 per file**, which saturates exactly on the files being ranked
   (`core.mjs` and `web-tree-sitter.js` both read exactly 200 through it). The instrument reads `tree.json`
   instead — HEAD-only and uncapped — which moved `core.mjs` from 200 to its true **326** scopes. Any consumer
   working from the export or the model alone will silently tie the biggest files together.
7. **Relation coverage.** Yggdrasil `relCoverage.n = 0`; Grain 45 files across bash/json/yaml are invisible to
   fan-in/fan-out. Neither materially affects the top of the ranking.

## 7. Reproduce

```
node plugins/grain/tests/stress/too-much.mjs <repo> <out.json> --md [--export <grain-export.json>]
```

Guard: `plugins/grain/tests/too-much.test.mjs` — a real 36-file git repository with one planted god-file, which
the instrument must rank first on responsibilities and fan-out with nothing on the twenty conforming siblings,
plus the pinned arithmetic (alphabet, norm prefix, leave-one-out excess, λ bound, `minRaw` silence, the
sign of the cut). `cd plugins/grain && npm test` — **2206 pass, 0 fail**.
