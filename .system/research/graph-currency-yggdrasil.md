# Graph currency at wave close, measured on Yggdrasil

**Question (ticket 098).** `reconstruct.mjs` (093) measures whether Grain can recover a hand-written `.yggdrasil/`
from scratch. This asks the wave-close question instead: once a graph exists, does it **stay current** as the
code moves — and can a steward get a number for that at every wave close, for free, with no new engine code?

**Answer, in one line.** On Yggdrasil at HEAD (`5cca6b1`, 3019 tracked files, 38 node types, 427 nodes, 70
aspects) the wave-close report finds **4 graph-debt rows** — 3 already known from 093/094 (`repo-config`,
`ci-config`, `cli/config/quality` — hand-drawn categories, not localities) plus **one genuinely new finding**
from the reverse-direction comparison this ticket adds (`.yggdrasil/aspects`, only 11% of its 338 files owned
by any node) — **12 miner-gap rows**, **337 undecidable rows**, and a trend of **0 graph-debt rows per 100
commits** over the last 200 commits (identical debt count, 4, at HEAD and at HEAD~200). Separately, re-running
094's proposal renderer against the current export confirms **5 of the 7 types 093 named as the cheapest
recall available are now reached** (up from 0 of 7 in 093's raw baseline) — `portal-server`, `portal-engine-api`
and `portal-frontend-core` at the active level, `parser-adapter` and `llm-provider` via an offered alternative —
and 2 remain unproposed, named below with why. `sizing.json` now ships in the proposal with files/bytes/scopes/
codelength for 70 proposed nodes and all 393 hand nodes.

---

## 1. Method

`plugins/grain/tests/stress/graph-currency.mjs` — a new, standalone instrument (no engine changes, no changes
to `reconstruct.mjs`). It is a thin wrapper: every disagreement it reports is `reconstruct.mjs`'s own
`compareTypes` / `compareNodes` / `compareRelations`, imported and read for the `verdict.class` (a/b/c) those
functions already compute. The **one new comparison** is `compareModuleOwnership` — the direction 093/094 never
measured: not "does grain hold every hand element" but "does the hand graph still cover every locality the CODE
has today". For each grain module, it finds the best-matching hand node (by subtree mapping) at the same J≥0.5
bar the rest of this instrument family uses everywhere (no new floor); a module under that bar with under half
its files claimed by ANY node at all is graph debt, over half is a granularity call (undecidable) — the same
three-class discipline `classifyMiss` already applies elsewhere in `reconstruct.mjs`.

**(b) graph debt** is the union of four things, exactly as the ticket asked:
1. a declared relation with no code backing at HEAD (`compareRelations`'s `missClassB`)
2. a type whose `when` no longer matches any grain cut at J≥0.5 (`compareTypes` rows, `verdict.class === 'b'`)
3. a grain module with no owning node (the new `compareModuleOwnership`)
4. a node `mapping:` resolving to files that now cluster elsewhere (`compareNodes` rows, `verdict.class === 'b'`)

**(a) miner gaps** and **(c) undecidable** are the same union of `verdict.class === 'a'` / `'c'` rows across all
four comparisons.

**The one number — graph-debt rows per 100 commits.** The debt-row count is computed identically at HEAD and at
HEAD~200 (a **throwaway clone**, `git checkout`ed to that commit, its own `grain export` run inside it — the
repo passed on the command line is never written to). The delta is scaled: `(debtAtHead - debtAtOld) / (200 /
100)`. This is exactly what `graph-currency.mjs --window 200` does on its own when pointed at a live repo;
here, both states' `grain export` were run ahead of time (to fit each inside a single command's wall-time
budget) and handed in via `--export`/`--old-export --old-repo`, which the tool accepts for exactly this reason.
`HEAD~200` follows the first-parent chain (git's own `~N` semantics) — Yggdrasil's history has merges, so
`git rev-list --count HEAD` (1564) and `HEAD~200`'s own ancestor count (1244) legitimately differ; the window is
200 commits along the branch actually checked out, not 200 nodes of the full DAG.

**A bug this ticket found and fixed on sight** (`fix-bugs-on-sight`): the first version of `compareModuleOwnership`
flagged `.yggdrasil/model` (605 files) and `.yggdrasil/flows` (18 files) as graph debt. That was an artifact of
the new comparison, not a finding — Yggdrasil's own `cli/core/file-when-evaluator` node says so in its own
description ("Auto-exempts `.yggdrasil/` paths"), a CLI coverage rule this new comparison did not know about.
Fixed by excluding `.yggdrasil/**` from the comparison, **except** `.yggdrasil/aspects` — Yggdrasil's own
`graph-rules` node deliberately maps `.yggdrasil/aspects/*/check.mjs` as ordinary source ("held to the graph's
own rules like any other first-party source"), so an unowned rule script there stays a real, reportable gap
(and is exactly the one new debt row this instrument found). Guarded by a red-green test
(`graph-currency.test.mjs`, "a module under .yggdrasil/ is exempt from ownership, except .yggdrasil/aspects
itself").

**Wall time.** Cold `grain export`, full history, on the throwaway clones: HEAD (3019 files, 1510+ commits)
**~424s** (375.5s of that reported as indexing); HEAD~200 (1970 files, fewer commits) **~300s** (277.1s
indexing). The comparison itself (`graph-currency.mjs`, both exports already on disk) **under 2 minutes**. The
proposal re-run (`propose.mjs --score`, reusing the HEAD export and its cache) **38.9s**. Total measurement:
well under 20 minutes wall, most of it the two `grain export` runs — the instrument itself, given an export, is
seconds.

---

## 2. The wave-close report on Yggdrasil (HEAD, `5cca6b1`)

| | count |
|---|---|
| tracked files | 3019 |
| hand graph | 38 node types, 427 nodes, 70 aspects |
| grain | 19 partitions, 37 modules |
| **(b) graph debt** | **4** (type 2 · node 1 · relation 0 · module 1) |
| (a) miner gaps | 12 |
| (c) undecidable | 337 |

**The 4 graph-debt rows, named:**

| source | id | why |
|---|---|---|
| type | `repo-config` | spreads over 10 grain modules, none of them mostly this set (largest: `.`, 26% of the set / 93% of the module) — a hand-drawn category (root dotfiles, `docs/public/**`, `tools/**`, CLI package files), not a locality |
| type | `ci-config` | spreads over 3 grain modules (largest: `source/cli`, 56% of the set / 64% of the module) — same shape, smaller |
| node | `cli/config/quality` | spreads over 2 grain modules (largest: `source/cli`, 71% of the set / 36% of the module) — a hand grouping by topic, not by place |
| module | `.yggdrasil/aspects` | only 11% of this module's 338 files (yg-aspect.yaml, content.md, drills/**) are claimed by any node — only the 43 `check.mjs` files are mapped (by `graph-rules`), everything else in the rule's own directory has no owner |

The first three are **exactly** the rows 093 (§2, §3) and 094 (§9) already named as class-(b) graph debt — this
report reproduces them for free from the same underlying comparisons. The fourth is new: it is the one thing
093/094 could not see, because both only ever asked "does grain hold this hand element", never "does the hand
graph still cover this piece of the code". It is a real, small, informational finding — nothing here proposes
changing Yggdrasil.

**The 12 miner-gap rows:** the same 7 types 093 named as class-(a) at the raw grain-candidate level
(`reviewer-dispatch`, `portal-frontend-vendor`, `portal-server`, `parser-adapter`, `portal-engine-api`,
`portal-frontend-core`, `llm-provider` — this comparison, like 093, is against grain's own partitions/modules
directly, not against 094's rendered proposal; §3 below is the proposal-level answer), plus 5 relation misses
(`source/cli/src/{ast,portal,relations} → source/cli/src/model`, `source/cli/src/migrations → source/cli/src/core`,
`source/cli/src/cli → source/cli/tests`) — the same 5 resolver gaps 093 §4 named.

**337 undecidable rows** — dominated by the same granularity judgements 093/094 already discussed at length
(093 §2 class c, §3 class c/relation misses; 094 §9): grain drawing the same locality one level coarser or
finer than the hand graph, and the module-pair questions a human has to settle. Nothing new to report there;
listed in the raw JSON (`currency-report.json`) for a steward who wants to read them.

---

## 3. The trend number — graph-debt rows per 100 commits

| | HEAD (`5cca6b1`) | HEAD~200 (`fb12dacf`) |
|---|---|---|
| tracked files | 3019 | 1970 |
| node types / nodes / aspects | 38 / 427 / 70 | 36 / 346 / 54 |
| **(b) graph debt** | **4** | **4** |
| (a) miner gaps | 12 | 11 |
| (c) undecidable | 337 | 266 |

**Graph-debt rows per 100 commits: 0.** The debt count is identical at both ends — the same 4 rows, for the
same reasons — over 200 commits in which the repository grew by 1049 tracked files, 81 nodes and 16 aspects.
Read plainly: Yggdrasil's own hand graph has not accumulated new drift of the four counted kinds in its last
200 commits, which is exactly what a repository that dogfoods its own tool at every commit (the `repo-check.sh`
gate this repository runs on every commit) would be expected to show. It is not evidence the graph is perfect —
093/094 already found the same 4 rows stable at both ends — only evidence it is not **getting worse**. A
repository that let its graph drift would show this number rise; one that is actively paying down debt would
show it fall below zero. This is the one control this measurement has: it is a single data point on a
repository that already enforces `yg check` in CI, not a claim about repositories that do not.

---

## 4. The 7 types, confirmed against the current proposal

Re-running `propose.mjs --score` against the current HEAD export reproduces 094's headline exactly (82 active
types, 284 alternatives, 72 nodes, 215 aspect drafts — 43 `check.mjs` / 172 prose — 960 drill cases; types
recall 21/36 active, 24/36 with alternatives; precision 23/82). The exact J for each of the 7 types 093 §2
named as the cheapest recall available anywhere in that report:

| type | files | active J | + alternative J | status |
|---|---|---|---|---|
| `portal-server` | 5 | **1.00** | — | reached (active) |
| `portal-engine-api` | 10 | **0.90** | — | reached (active) |
| `portal-frontend-core` | 25 | **0.61** | — | reached (active) — crosses the J≥0.5 bar outright, no alternative needed |
| `parser-adapter` | 6 | 0.24 | **0.50** | reached (alternative, exactly at the bar) |
| `llm-provider` | 7 | 0.41 | **0.57** | reached (alternative) |
| `reviewer-dispatch` | 2 | 0.02 | 0.33 | **unproposed** |
| `portal-frontend-vendor` | 1 | 0.02 | 0.02 | **unproposed** |

**5 of 7 reached, 2 remain unproposed, named with why:**

- **`reviewer-dispatch`** (2 files) — its best alternative (`source-cli-src-core-verify-pair-list`, a frozen
  list) reaches only J=0.33: the two files sit inside `source/cli/src/core` (63 files) alongside everything
  else the core partition does, and nothing in grain's role groups or markers isolates just these two — there
  is no shared name shape, marker, or import that separates a 2-file reviewer-dispatch role from the rest of
  the engine at this repository's size.
- **`portal-frontend-vendor`** (1 file) — `MIN_TYPE_FILES = 2` excludes any 1-file type from becoming an active
  type by construction (094 §8's own measured cost of this floor), and unlike the other three 1-file hand
  types, no offered alternative reaches it either (J stays 0.02 with or without alternatives) — the single file
  carries no name shape or marker distinguishing it from its 25-file host directory.

This is a straight re-confirmation, not a re-measurement of 093's headline: 093's raw baseline had 0 of these 7
reached (that is what made them "the cheapest recall available" in the first place); 094's renderer already
closed 5 of them; this ticket's job was to check that a fresh run of the same renderer against the current
graph still reaches the same 5, and it does, to 2 decimal places at three of them.

---

## 5. `sizing.json`

Added to `propose.mjs`'s output (`<out-dir>/sizing.json`). Per proposed node — and, when the source repository
already carries its own `.yggdrasil/` (as Yggdrasil does), per **hand** node too — four counts: `files`,
`bytes` (`fs.statSync`, summed), `codelengthLines` (source lines, summed), `scopes` (summed from
`.grain/cache/tree.json` when that cache exists; `null`, never 0, when it does not). **What is derived and what
is a fact of the model**, stated in the file's own header comment: all four counts are derived — computed from
the files themselves or from grain's own scope cache, nothing tuned, nothing tunable. The one number that is
**not** derived is `contextBudgetTokens: 200000` — Anthropic's published context window for the models this
family runs on, a fact about the tool the ecosystem happens to run on, not a Grain measurement or a Grain
constant. `sizing.json` computes no ratio itself — that is left for Horde's `node.mjs map`, per the ticket.

On Yggdrasil, 70 proposed nodes and all 393 hand nodes were sized. **First data for the "node right size" bet —
no claim, just the table** (top 10 by bytes, both sides):

**Hand nodes, top 10 by bytes:**

| node | files | bytes | codelength (lines) | scopes |
|---|---|---|---|---|
| `docs/site` | 12 | 2,950,436 | 14,101 | 4 |
| `root/project-config` | 22 | 655,131 | 3,204 | 5 |
| `cli/tests/integration/portal` | 22 | 366,265 | 7,131 | 449 |
| `docs/guides` | 20 | 351,861 | 5,172 | 0 |
| `cli/tests/fixtures` | 578 | 348,173 | 8,653 | 814 |
| `cli/tests/unit/cli/general` | 19 | 299,769 | 6,586 | 540 |
| `scripts` | 13 | 232,984 | 5,007 | 231 |
| `cli/relations/extractors` | 22 | 223,915 | 4,596 | 179 |
| `graph-rules` | 36 | 213,909 | 4,624 | 178 |
| `cli/tests/unit/core/operations/fill/det` | 12 | 192,949 | 3,957 | 201 |

**Hand nodes, top 10 by codelength (lines):** the same set almost exactly, reordered — `docs/site` (14,101),
`cli/tests/fixtures` (8,653), `cli/tests/integration/portal` (7,131), `cli/tests/unit/cli/general` (6,586),
`docs/guides` (5,172), `scripts` (5,007), `cli/portal/frontend/core` (4,691), `graph-rules` (4,624),
`cli/relations/extractors` (4,596), `cli/config/build` (4,523).

**Proposed nodes, top 10 by bytes:** `docs` (3.30M, 19,273 lines), `dot-yggdrasil` (2.62M, 10,608),
`source/cli/tests/e2e` (2.35M, 51,447), `source/cli/tests/unit/core` (1.45M, 32,044), `source/cli/src/core`
(857K, 17,773), `source/cli/tests/integration` (790K, 16,849), `repo-root` (649K, 3,031),
`source/cli/tests/unit/cli` (637K, 14,401), `source/cli/src/cli` (633K, 12,850), `source/cli/src/templates`
(483K, 10,005).

**Proposed nodes, top 10 by codelength:** `source/cli/tests/e2e` (51,447 lines), `source/cli/tests/unit/core`
(32,044), `docs` (19,273), `source/cli/src/core` (17,773), `source/cli/tests/integration` (16,849),
`source/cli/tests/unit/cli` (14,401), `reference/relations` (13,428, 328 files), `source/cli/src/cli` (12,850),
`dot-yggdrasil` (10,608), `source/cli/tests/unit/io` (10,501).

Read plainly, not as a claim: the proposed cut's largest node by both measures is grain's own coarse,
partition-level `source/cli/tests/e2e` — one node for the whole e2e suite, 133 files, 51K lines — which is
exactly the kind of node 094 §3 already flagged as too coarse for a hand-written architecture (the hand graph
splits `cli/tests/e2e/*` into one node per test). Nothing here says what ratio against 200K tokens predicts an
owner's success; that bet (ecosystem-design-2026-09-05.md §6) is unmeasured and stays unmeasured — this is only
the two numbers a ratio would need, computed and named.

---

## 6. Guard test

`plugins/grain/tests/graph-currency.test.mjs` — 5 tests (new), on a synthetic repository with a **planted
graph-debt row**: a node (`reports`) declares a relation to another node (`util`) that no import or textual
mention backs at all, while `reports` does have a real, resolved import elsewhere (`const`) so the comparison
can tell "no code backing" apart from "grain saw nothing from this module" (the coverage-gap class c, not b).
The report classifies it `(b)` with the message `"no code backing at HEAD"`, and the real, imported relation
(`api → util`) is confirmed **not** flagged. Also covers: `compareModuleOwnership` flagging an orphan module a
real fixture never named; the `.yggdrasil/` self-exemption (the bug found and fixed in §1, red before the fix,
green after); the CLI end to end with `--skip-window`; and the window mechanism running over real (tiny) git
history with 3 extra commits, asserting the arithmetic (`debtRowsPer100Commits = deltaDebtRows / (commits/100)`)
holds.

`plugins/grain/tests/propose.test.mjs` gained 3 tests for `sizing.json`: files/bytes/codelength populate for
every proposed node and the `contextBudgetTokens` constant is exactly 200000; a second fixture with its own
`.yggdrasil/` gets its 2 hand nodes sized correctly; and an absent `.grain/cache/tree.json` reports `scopes:
null`, never `0`.

`cd plugins/grain && npm test`: **2224 / 2224 pass, 0 fail** (up from the 2217 baseline the ticket named; 5 new
tests in `graph-currency.test.mjs`, 3 new in `propose.test.mjs`).

---

## 7. Confounds

1. **The window's two states used slightly different measurement conditions than a live steward run would**:
   both `grain export`s were run ahead of time and handed to `graph-currency.mjs` via `--export`/`--old-repo`
   to fit each inside one command's wall-time budget, rather than letting the tool clone and export on its own
   (which it does, and which the guard test exercises end to end on a tiny fixture). The comparison logic run
   is identical either way; only the orchestration differs.
2. **`.yggdrasil/aspects`'s 11% is a real number, not a criticism.** Yggdrasil's own `graph-rules` node
   deliberately maps only `check.mjs` — the description says it is held to source-code standards specifically
   *because* it is code, not configuration or prose. Whether `yg-aspect.yaml` / `content.md` / `drills/**`
   *should* have an owning node is a maintainer's call this report does not make; it is recorded as debt only
   because compareModuleOwnership's rule ("does anything own this locality") does not know the difference
   between "deliberately unowned" and "forgotten" — same caveat 093/094 state for every (b) row.
3. **"0 graph-debt rows per 100 commits" is one data point on one repository that already enforces its own
   graph in CI.** It says this measurement CAN produce a trend number and that Yggdrasil's own graph has not
   drifted by the four counted kinds recently; it says nothing about a repository that does not run `yg check`
   on every commit, where the number would very plausibly be positive.
4. **The 7-types re-confirmation is not new evidence that 094's renderer changed** — it did not change in this
   ticket. It confirms the SAME renderer, run against the current graph, reaches the same 5 of 7, which is the
   thing a graph-currency check actually needs to know (did a later commit silently regress a prior recovery),
   not a new capability claim.
5. **`codelengthLines` is a size proxy, not the export's own bit-based "codelength".** Despite
   ecosystem-design-2026-09-05.md §2.4's phrasing ("Grain's export already has bytes, scopes and codelength per
   module and per partition"), neither `bytes` nor a size-flavoured codelength exists anywhere in the export or
   the cache at module/partition granularity — verified by reading `engine/export.mjs` and
   `engine/relations.mjs`'s `moduleGraph` (nodes carry only `{id, files}`, a count, not a size). Both are
   computed fresh in `sizing.json` from the files themselves; `scopes` is the one figure genuinely read out of
   an existing cache (`tree.json`).

---

## 8. Reproducing this

```
# the wave-close report + trend number, on a live repo (clones and exports automatically)
node plugins/grain/tests/stress/graph-currency.mjs <repo-with-.yggdrasil> out.json --md

# same, with pre-computed exports (what this report actually ran, to fit wall-time budgets)
node plugins/grain/tests/stress/graph-currency.mjs <repo> out.json \
  --export head-export.json --old-repo <clone-at-HEAD~200> --old-export old-export.json --window 200 --md

# sizing.json comes free with a proposal run
node plugins/grain/tests/stress/propose.mjs <repo> <out-dir> --export <export.json> --score <repo>
cat <out-dir>/sizing.json
```

Yggdrasil was treated as read-only throughout: `git clone` (read) into two throwaway directories under this
session's scratchpad, `git checkout` inside those clones only, `grain export` run only inside those clones.
`/home/user/Yggdrasil`'s own `git status --short` was confirmed empty and carries no `.grain/` at the end of
this measurement.
