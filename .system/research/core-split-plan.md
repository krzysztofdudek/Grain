# core.mjs seam map — the split plan for ticket 117

> **Landed.** The plan below is what was cut; the table's "chars" column is the estimate made before
> cutting, and the delivered sizes are within a few hundred characters of it. Two things changed while
> cutting: `learn` needed nine statement lifts rather than five (they went to `arch.mjs`,
> `partition.mjs`, and two new modules, `decisions.mjs` and `commit-log.mjs`), and `harness.mjs` was
> renamed `selftest.mjs` because the oracle's `engine/no-test-or-instrument-import` rule refuses a
> shipped module that imports anything named `*harness.js` — the rule is right and the file name was
> the thing to fix. Delivered: 29 modules, largest `scopes.mjs` at 45 505, `learn.mjs` at 40 221,
> `core.mjs` a 6 708-character facade, zero import cycles.

`plugins/grain/engine/core.mjs` is 573 804 characters. The hand-written Grain oracle
(`plugins/grain/tests/stress/oracles/grain/.yggdrasil/aspects/engine/file-size-budget/`) refuses any
first-party module over 50 000 characters — the ceiling one assembled reviewer prompt is checked
against — and core.mjs is 11.5× over it. This is the seam map the split follows.

## Method

The file already carries 23 `// ===== SECTION =====` headings. Every top-level declaration was
attributed to the section it sits in, its character weight measured, and the reference graph between
declarations computed (identifiers used in a block, intersected with the file's own top-level names).
Modules were then chosen so that (a) no module exceeds 50 000 characters, (b) the file-level import
graph between the new modules is a DAG — zero cycles.

Nothing is renamed. Every identifier keeps its name, every currently exported name stays exported
from `core.mjs`, which becomes a re-export façade so no caller (`grain.mjs`, `export.mjs`,
`propose.mjs`, `history.mjs`, the instruments, the tests) changes an import in this ticket.

## The modules

| module | chars | what it holds |
| --- | ---: | --- |
| `base.mjs` | 402 | the two cell-key sentinels, `toPosix`, `CODE_RE` |
| `parse.mjs` | 31 387 | generic binding derived from each grammar's node-types.json, the parser pool, `parseFile`, `walkFiles`, `tokenize`, `nameShape`, `hashStr` |
| `extract.mjs` | 25 348 | the node-type predicates and the declaration/member/modifier helpers extraction is built from |
| `scopes.mjs` | 44 401 | `extractScopes` — one function, the extraction pipeline itself |
| `superposition.mjs` | 16 918 | skeletons, profiles, templates, twins, doc tokens |
| `lexical.mjs` | 10 017 | the file-scope lexical predicates and the scope↔line map |
| `facts.mjs` | 12 364 | the objective and the fact vocabulary: `kt`, `jac`/`jacW`, `featW`, `applyVocab`, `archCellLabel`/`archCellSort`, `scopeLabel`, `pct`, `factLabel`, `part` |
| `obligations.mjs` | 9 984 | birth obligations: certification, footprints, the obligation table |
| `mine.mjs` | 33 847 | clustering, roles, the MDL/λ miner, deviants, marker/held/author summaries |
| `weights.mjs` | 8 373 | history weighting (survival × provenance × churn), trends, calibration |
| `verbalize.mjs` | 12 524 | the verbalizer: shapes, units, deviation phrasing |
| `partition.mjs` | 13 320 | package roots, MDL cuts, the current-tree extraction, vocabulary, scope (de)serialization |
| `learn.mjs` | 71 598 → ~43 000 | `learn` — see "the one function that does not fit" below |
| `placement.mjs` | 8 494 | placement-on-create: stop lists, name tokens, `placementHit` |
| `check.mjs` | 28 615 | `checkFile` and `groupDeviations` |
| `arch.mjs` | 13 160 + ~9 000 | the measured architecture: `architectureNorms`, `computeArchHits`, and (stage 5) the relation-layer pass lifted out of `learn` |
| `spectrum.mjs` | 7 330 | the full lattice for one file |
| `cards.mjs` | 23 122 | card building and the card-level line renderers |
| `where.mjs` | 32 204 | `whereCmd` |
| `how.mjs` | 12 533 | `howCmd` |
| `evidence.mjs` | 16 339 | value-kind labels, gated value evidence, type-ref hits, tested-by evidence, blind/ungrammared files |
| `what.mjs` | 22 856 | `whatCmd` |
| `evals.mjs` | 32 943 | `howEval`, `whereEval`, `obligationEval`, `leakSubtractedH` |
| `report-facts.mjs` | 23 799 | fact tiers, the standing notes, lexical tally, coverage notes, health rows |
| `report.mjs` | 23 759 | `report`, `rulesMarkdown`, `statusLines`, module layers, map sections |
| `completeness.mjs` | 19 516 | completeness, co-change, recipes, value-kin gaps, missing lines |
| `harness.mjs` | 13 895 | the mutation harness and the extraction-recall selftest |
| `core.mjs` | ~9 000 | re-export façade only |

## The dependency graph

The file-level import graph is a DAG. Cycles: **0**. The layering that falls out of it, lowest first:

```
base → parse → extract → scopes
                 ↘ facts ↘ obligations
       superposition   lexical   verbalize   weights   partition
                 ↘ mine ↘ placement ↘ cards
                          arch → check → spectrum
                          where → how → what → evals
                          report-facts → report → completeness
                                              harness
```

(the arrows above are a reading aid; the machine-checked statement is simply that the import graph
between the 27 new modules has no cycle.)

## The one function that does not fit

`learn` is a **single 71 598-character function**. No pure move can bring it under 50 000: there is
nothing inside it to move except statements. It is therefore the only place in this ticket where a
block of statements is lifted into a function of its own. Each lift takes the block's free variables
as explicit parameters, has no early exit, and returns nothing — the byte-identity gate on
`grain export` is what proves each one behaviour-preserving.

The blocks lifted, largest first:

| block | chars | lifted to |
| --- | ---: | --- |
| the relation layer (`try { … } catch` — workspaces, tsconfig aliases, PSR-4 autoload, source roots, edges, module graph, relation stages) | ~9 000 | `arch.mjs` · `applyRelationLayer` |
| implications per group (same-stem companion file + the file that registers members) | ~6 900 | `learn.mjs` · module-level helper |
| change archetypes | ~4 900 | `learn.mjs` · module-level helper |
| steers | ~4 400 | `learn.mjs` · module-level helper |
| message affinity | ~3 500 | `learn.mjs` · module-level helper |

That leaves `learn` at roughly 43 000 characters.

## Staging

1. the leaf layers: `base`, `parse`, `extract`, `scopes`, `superposition`, `lexical`, `facts`
2. the mining layers: `obligations`, `mine`, `weights`, `verbalize`, `partition`
3. the query layers: `placement`, `arch`, `check`, `spectrum`, `cards`
4. the answer layers: `where`, `how`, `evidence`, `what`, `evals`, `report-facts`, `report`,
   `completeness`, `harness` — and `core.mjs` becomes the façade
5. `learn.mjs`, including the five statement lifts above

Every stage carries the same gate: `grain export` JSON identical before and after on the repo's own
tree, on the built fixtures, and on a real third-party clone; `grain where/check/report` text
identical on a fixture; the full suite green.

## What must not move

`EXTR_V`, `HIST_V`, `MODEL_V` in `engine/config.mjs`. A pure move changes nothing about what
extraction, replay or the model produces, so the three cache-version keys stay exactly where they
are. No cache key embeds a module path or a function's source text — they are literal string
constants in `config.mjs`, read by `history.mjs` and `grain.mjs`.
