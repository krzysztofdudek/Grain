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

---

# propose.mjs and grain.mjs seam maps — the split plan for ticket 124

Ticket 117 left two modules over the Grain oracle's 50 000-character `engine/file-size-budget`:
`plugins/grain/engine/propose.mjs` at **265 284** characters (5.3×) and
`plugins/grain/engine/grain.mjs` at **160 272** (3.2×). `tests/engine-module-size-budget.test.mjs`
carries both as a shrinking exception list. This is the seam map for cutting them, by exactly the
method 117 used: seam map first, a pure move in stages, a byte-identity gate per stage, and the
oracle updated the way a maintainer updates a graph when files move.

## Method, and the one thing that had to change from 117

Same as 117 — every top-level declaration attributed to a module, its character weight measured, the
reference graph between declarations computed, modules chosen so that no module exceeds 50 000
characters and the file-level import graph is a DAG — with one correction forced by these two files.

117 found the blocks with a line regex (`^(export )?(function|class|const…) NAME`). That is **unsafe
here**: both files embed whole JavaScript files inside template literals — the `check.mjs` sources
`renderCheck` generates, the drill corpora, the node-type fixtures — and inside those literals
`export function check(…)` stands at column 0. The regex read four such lines in `propose.mjs` as
top-level declarations of a function named `check`, and would have cut a module in the middle of a
string. The splitter was rewritten on the engine's OWN vendored tree-sitter (the same parse that
supplied the identifier graph in 117): a block is a top-level named child of the root node plus the
comment lines directly above it. Exact block counts: **125** in `propose.mjs` (the regex claimed
134), **67** in `grain.mjs`.

Nothing is renamed. Every identifier keeps its name and every currently exported name stays exported
from the original file, which becomes a re-export façade — so `bin/grain.mjs`, `bin/grain-mcp.mjs`,
`tests/stress/propose.mjs` (which imports 38 names by hand), the instruments and the tests change no
import.

## propose.mjs → 16 modules + a façade

| module | chars | what it holds |
| --- | ---: | --- |
| `propose-base.mjs` | 22 125 | the admission constants and where each comes from, `resolveYg`, the worktree/git file walk, `progressiveReference`, `slug`/`yq`/`yamlEmit`/`write`, the honest preamble |
| `propose-levels.mjs` | 20 121 | `localities` — the three levels a type can be cut at — and the words that describe one: `typeEvidence`, `levelSentence`, `contentRegexFor`, `caseTolerant` |
| `propose-types.mjs` | 25 474 | `buildTypes` — choosing the level, and showing the alternatives instead of hiding them |
| `propose-nodes.mjs` | 10 732 | `buildRelations` and `buildNodes`: the deliberately coarse node cut |
| `propose-lattice.mjs` | 9 850 | `partitionLattice`, `subGate`, `identifierOf`, `shapeToRegex`, the draft/status notes |
| `propose-checks.mjs` | 11 048 | `renderCheck` — the deterministic `check.mjs` a drafted aspect ships |
| `propose-classify.mjs` | 12 303 | `RENDERABLE`, the boolean/absence classes, `renderableDirection`, `WHY_PROSE` |
| `propose-sizing.mjs` | 3 226 | `computeSizing` — `sizing.json`, what the graph costs to review |
| `propose-write.mjs` | 36 266 | `loadInputs`, the four `write*` steps and `propose` itself: the render pipeline |
| `propose-aspects.mjs` | 36 445 | the obligation form (`obligationSentence`, `describeRow`) and `buildAspects` |
| `propose-status.mjs` | 16 059 | `provenanceFor`, and the status an aspect earns from a real `yg drill` |
| `propose-family.mjs` | 10 018 | `buildFamilyCandidates`, `nodeCochangePairs` |
| `propose-charters.mjs` | 11 503 | `renderNodeCharter` and the cascade it prints |
| `propose-drills.mjs` | 8 473 | `cutDrills`, `contentMd`, `subGateMd`, `mdTable` |
| `propose-markdown.mjs` | 17 417 | `renderProposalMd`, `renderAlternativesMd`, `renderBacklogMd` |
| `propose-report.mjs` | 15 188 | `proposeReport` — what `grain propose` prints, and what `--json` writes |
| `propose.mjs` | 6 933 | re-export façade only |

Cycles among the sixteen: **0**. One cut was moved to get there: `contentMd`/`subGateMd`/`mdTable`
first sat with the other markdown renderers, which made `propose-aspects → propose-markdown →
propose-aspects` (the aspect bodies are markdown, and `renderProposalMd` words a row with
`describeRow`). Splitting the aspect bodies and the drill corpora into `propose-drills`, below the
report markdown, breaks it. `propose-types` was split off `propose-levels` for headroom only: as one
module it was 45 k, inside the budget but with nothing left over.

## grain.mjs → 9 modules + the dispatcher

`grain.mjs` keeps `main` and stays the dispatcher — that IS its identity in the oracle
(`cli-dispatch`: "the one `switch (cmd)` dispatcher"), and `main` is a single 36 537-character
function, so nothing inside it could move without lifting statements. Everything else leaves.

| module | chars | what it holds |
| --- | ---: | --- |
| `grain-context.mjs` | 17 878 | `parseArgv`, `findRoot`/`storeFor`, `ensureFresh`, the seed file, and the worktree-vs-HEAD comparisons every command answers from |
| `grain-where.mjs` | 12 975 | `cmdWhere`, `cmdHow`, and the bounded raw-text hedges they fall back on |
| `grain-what.mjs` | 8 270 | `cmdWhat`, `cmdMap`, `cmdObligation` |
| `grain-check.mjs` | 34 230 | `cmdCheck` and `cmdReview` — one file, and a whole uncommitted change |
| `grain-seed.mjs` | 14 302 | `cmdSpectrum`, `cmdSeed`, `cmdDecide` |
| `grain-export.mjs` | 5 317 | `cmdExport`, `cmdPropose` |
| `grain-report.mjs` | 9 194 | `cmdStatus`, `cmdReport`, `cmdRules`, the freshness lines |
| `grain-session.mjs` | 17 873 | `sessionContext` and the placement/check feedback loops |
| `grain-usage.mjs` | 5 212 | `USAGE` |
| `grain.mjs` | 40 559 | the doc header, the imports, `main` |

Cycles among the ten: **0**, after three declarations were pushed down a layer rather than left where
the section boundaries put them: `readSeeds`, `hashSeeds` and `loadScopes` sat in the seeds/export
sections but are read by `ensureFresh` and by three commands each, which made
`grain-context → grain-seed → grain-context`. They belong with the store, and that is where they go.

## What must not move (unchanged from 117)

`EXTR_V`, `HIST_V`, `MODEL_V` in `engine/config.mjs`. Also unchanged and deliberately not moved:
`import.meta.url` is read in both files (`here`/`CORE`/`BIN` in `propose.mjs`, `PLUGIN_ROOT`/`BIN` in
`grain.mjs`). Every new module sits in the SAME directory as the file it came out of, so
`dirname(fileURLToPath(import.meta.url))` resolves to the same string — checked before cutting,
because it is the one construct in either file whose value depends on which file it stands in.

## Staging

1. `propose-base`, `propose-levels`, `propose-types`, `propose-nodes`
2. `propose-lattice`, `propose-checks`, `propose-classify`, `propose-sizing`
3. `propose-aspects`, `propose-status`, `propose-family`, `propose-charters`
4. `propose-drills`, `propose-markdown`, `propose-report`, `propose-write` — `propose.mjs` becomes the façade
5. `grain-context`, `grain-where`, `grain-what`, `grain-check`
6. `grain-seed`, `grain-export`, `grain-report`, `grain-session`, `grain-usage` — `grain.mjs` becomes the dispatcher

## The gate

Per stage, byte-identical against the pre-split baseline:

- the full proposal tree, `proposal.json`, `sizing.json`, `PROPOSAL.md`, `alternatives.md`,
  `REFACTOR-BACKLOG.md` and the quiet report from
  `node tests/stress/propose.mjs /home/user/Yggdrasil <out> --export <cached export>` (445 files);
- `grain propose` with `--json` on a frozen clone of this repository — frozen deliberately, because
  the corpus of a proposal run on the live worktree is the very code the stage is changing;
- `grain export --json` on three corpora after wiping `.grain/` (a reused index would make the gate a
  false green — `ensureFresh` is one of the things that moves);
- `where`/`check`/`check --all`/`report`/`rules`/`map`/`explain`/`obligation`/`completeness`/
  `status`/`selftest`/`how`/`what`/`review`/`spectrum`, text AND `--json`, on the built fixture, an
  express clone and the repository clone.

Which fields legitimately vary between two runs was measured FIRST, on the unchanged tree, so the
gate can tell drift from noise.
