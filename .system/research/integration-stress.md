# Integration stress: how much of what Grain proposes does Yggdrasil operate on

Ticket 101. Instrument: `plugins/grain/tests/stress/integration-stress.mjs`. Guard:
`plugins/grain/tests/integration-stress.test.mjs`. Yggdrasil CLI 5.8.0 (`source/cli/dist/bin.js`, read-only
checkout). Every number below comes from a run; nothing is estimated except where it says so.

The user's question, in their words: *"do stress tests of such an integration and see how much Grain talks
sense vs what Yggdrasil operates on."* Ruling `granularity-bounded-by-evidence-not-taste` had already retired
precision-against-a-hand-graph as the target and named the replacement — the share of proposed elements that
Yggdrasil (a) **loads**, (b) produces **pairs** with a verdict for, and (c) has a drill that **catches** and does
not **false-alarm**. That share is the SENSE RATE and it is what this report measures.

## The answer, in one block

Seventeen repositories measured of eighteen attempted (one timed out and says so), nine languages, none of them
carrying a hand-written graph. 6635 tracked files; 394 types, 414 nodes and 1671 aspects proposed; 17 704 pairs
and 2164 refusals on the repositories' own code; 1345 drill passes, 463 MISSes and 6 FALSE-ALARMs.

| | rendered | → loads | → pairs | → catches | → no FA | **sense rate** |
|---|---|---|---|---|---|---|
| types | 394 | 394 | 64 | 50 | 46 | **12%** |
| nodes | 414 | 414 | 189 | 157 | 151 | **36%** |
| aspects, all | 1671 | 1671 | 348 | 214 | 210 | **13%** |
| — deterministic | 366 | 366 | 348 | 214 | 210 | **57%** |
| — prose | 1305 | 1305 | 0 | 0 | 0 | **0%** |

- **Loading is not the problem.** 17/17 load, **zero** load-blocking error codes anywhere in the corpus.
- **The single biggest number in the report is 1305 of 1671.** Grain drafts four prose rules for every one it
  can render as a script, and a prose rule cannot be operated on at all without a configured reviewer.
- **Where a rule is a script, it works**: 348 of 366 produce pairs; the loss after that is the drill.
- **A type is inert unless something is attached to it**: only 70 of 394 types carry any aspect.
- **125 of 366 rendered checks catch nothing anywhere in their own repository today.**
- **Hostile repositories: 17 of 17 hold the contract** — no crash, no graph Yggdrasil refuses, no claim over
  zero evidence.
- **Bar 2 of ticket 097 (precision ≥ 0.80 on the 20-candidate sample): FAILED**, 0.091 on the eleven rows with a
  held-out corpus and 0.300 over all twenty.
- **Six defects in `propose.mjs` were found by running through the neighbour's real binary and fixed on sight**,
  each with a red-green test. Two of them — a check that was inert in every language that writes an import
  unquoted, and a check that refused 100% of its own scope — took spring-petclinic's deterministic-aspect sense
  rate from 24% to 87% and its FALSE-ALARMs from 5 to 0.

The corpus matrix in §2 reflects the renderer as it stood when that run started; the sixth defect (§8 #6) was
found FROM that matrix and re-measured on the repositories it affected, exactly as the second and third were.

## 1. Method

Per repository, in order:

1. `propose.mjs <clone> <out>` — which runs `grain export` itself. Finest-with-evidence mode: the reading cap
   `SUBGATE_PER_PARTITION` lifted to 1000 (097 lifted it the same way and for the same reason — it bounds what a
   maintainer is asked to read, not what is measured), everything else at its shipped floor.
2. STAGE: a hard-linked copy of the clone's worktree with the rendered `.yggdrasil/` dropped in. The clone is
   never written to and the proposal is never written into the repository it describes.
3. `yg check` **as proposed** — every aspect `status: draft`.
4. PROMOTE the deterministic aspects (those that shipped a `check.mjs`) to `advisory`, at the aspect file and at
   every attach site.
5. `yg check`, then `yg check --approve --only-deterministic` (free, keyless), then read
   `.yggdrasil/.yg-lock.deterministic.json` — one entry per `(aspect, unit)` with `verdict: approved | refused`.
   This is the authoritative pair record.
6. `yg drill --aspect <id>` for every rendered check with a corpus → pass / MISS / FALSE-ALARM.
7. Sense rate per kind, granularity distributions, wall time, peak RSS (sampled over the whole process tree
   every 120 ms — a LOWER bound, since a spike shorter than the interval is invisible).

### 1.1 Two facts about status that the measurement had to be built around

**A proposal as shipped produces zero pairs, by construction.** Every aspect ships `status: draft`, and a draft
aspect is dormant — `yg knowledge read aspect-status`: "draft removes a pair from the expected set entirely."
So the as-proposed `yg check` is a load test and nothing else; the sense rate is only measurable on a promoted
stage. That is not a flaw in the proposal (drafting is the honest default — nothing is asserted as true), but it
means every pair number in this report is measured one deliberate step past what a maintainer receives.

**A prose aspect at `advisory` takes the free deterministic leg down with it.** With any `content.md` aspect
promoted and no `reviewer:` in `yg-config.yaml`, `yg check --approve` aborts before anything runs — *"A judgment
rule has no judge … nothing ran and nothing was written."* So the promotion is restricted to the deterministic
aspects, and grain's prose aspects have a sense rate of **0 under a keyless gate, structurally**. They are
counted, not hidden: they are a real share of what the renderer emits and Yggdrasil cannot operate on any of them
without a configured reviewer.

### 1.2 What "operated on" means for each kind

An aspect is the only element Yggdrasil judges code WITH; a type and a node are how a rule REACHES code. The same
four legs are therefore applied through the attachment rather than invented:

| kind | loads | pairs | catches | no false alarm |
|---|---|---|---|---|
| aspect | named in the loaded graph, in no load-blocking error | ≥1 unit with a verdict | ≥1 `violates-*` case refused | 0 FALSE-ALARM in its own drill |
| type | same | ≥1 pair from an aspect ATTACHED to it | over those aspects | over those aspects |
| node | same | ≥1 verdict on a unit this node owns | over the aspects that reached it | over the aspects that reached it |

The legs are nested, so the funnel `rendered → loads → pairs → catches → no-FA` reads directly as which leg costs
what. Two honesty rules are enforced in the arithmetic and guarded by test: a drill with **no `violates-*` case**
never counts as catching (0 MISS over an empty corpus is not evidence), and the satisfies-case count is reported
beside every FA=0 so a vacuous "no false alarm" is visible as vacuous.

### 1.3 Floors, named

This instrument adds no floor of its own. It EXPOSES `propose.mjs`'s, so their cost can be measured rather than
defended (ruling `instrument-floors-allowed-if-stated-and-measured`):

- `SUBGATE_PER_PARTITION` — the reading cap, lifted to 1000 for every run here and stated in every table.
- `MIN_TYPE_FILES = 2` — measured at 2 against 1 on three repositories (§5). `propose.mjs` gained
  `--min-type-files` for exactly this; nothing else in the renderer reads the constant.
- `MIN_CONVENTION_SITES = 5`, `MIN_PROMOTE_FILES = 3`, `MIN_GROUP_MEMBERS = 3`, `MIN_WHEN_FIDELITY = 0.5`,
  `FAMILY_MIN_MEMBERS = 5` — unchanged and not varied here.
- `coverage.type_level` is left as the renderer writes it (absent, i.e. `false`). Named as a limit in confound 8 of §9.

---

## 2. The corpus: what Yggdrasil operates on

Eighteen of `corpus.json`'s twenty-five pinned entries, cloned at their pinned shas (the seven not attempted, with the
reason, are in confound 10). No repository here carries a hand-written `.yggdrasil/`, so nothing in this section is
a recall number — it is entirely about whether the neighbour's real binary can do anything with what grain wrote.

Read the matrix left to right as the pipeline: does it load, does it produce pairs, does it refuse anything on
the repository's own code, does its drill catch without fabricating.

### 2.1 The matrix

| repo | tracked files | rendered types / nodes / aspects (det + prose) | yg loads | pairs | refused on own code | drill pass / MISS / FA | sense: types | nodes | det. aspects | wall s | peak MB |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `CleanArchitecture` | 258 | 26 / 28 / 29 (8+21) | yes | 279 | 31 (11%) | 40 / 0 / 0 | 8% | 36% | 38% | 41.2 | 453 |
| `Slim` | 145 | 18 / 18 / 61 (18+43) | yes | 475 | 91 (19%) | 75 / 5 / 0 | 17% | 56% | 72% | 207.9 | 497 |
| `axum-full` | 503 | 20 / 20 / 156 (36+120) | yes | 2165 | 458 (21%) | 175 / 8 / 2 | 25% | 65% | 83% | 206.1 | 530 |
| `bash-it` | 493 | 24 / 26 / 39 (7+32) | yes | 548 | 47 (9%) | 24 / 11 / 2 | 8% | 35% | 71% | 47.4 | 349 |
| `cpp-json` | — | — | — | — | — | — | — | — | — | 1500 | — |  <!-- skipped: propose timed out after 1500s -->
| `express` | 213 | 22 / 22 / 71 (10+61) | yes | 686 | 186 (27%) | 44 / 2 / 0 | 14% | 86% | 80% | 132.3 | 684 |
| `flask` | 236 | 14 / 16 / 90 (27+63) | yes | 982 | 193 (20%) | 137 / 3 / 1 | 7% | 25% | 89% | 39.6 | 428 |
| `gin` | 130 | 13 / 15 / 148 (22+126) | yes | 329 | 72 (22%) | 88 / 10 / 0 | 15% | 13% | 55% | 119.2 | 480 |
| `groovy-spock` | 1460 | 51 / 53 / 215 (44+171) | yes | 5050 | 116 (2%) | 111 / 127 / 0 | 14% | 42% | 36% | 356.8 | 1363 |
| `kotlin-datetime` | 909 | 31 / 35 / 46 (5+41) | yes | 0 | 0 (—) | 26 / 13 / 0 | 0% | 0% | 0% | 58.7 | 486 |
| `leveldb` | 154 | 12 / 14 / 37 (5+32) | yes | 0 | 0 (—) | 25 / 0 / 0 | 0% | 0% | 0% | 64.4 | 464 |
| `openzeppelin-contracts` | 960 | 78 / 78 / 450 (91+359) | yes | 3529 | 412 (12%) | 249 / 193 / 0 | 13% | 47% | 39% | 411 | 1494 |
| `serde-full` | 361 | 14 / 14 / 145 (19+126) | yes | 1427 | 272 (19%) | 92 / 5 / 1 | 21% | 36% | 84% | 450.2 | 838 |
| `sinatra` | 292 | 15 / 16 / 21 (14+7) | yes | 779 | 45 (6%) | 26 / 45 / 0 | 13% | 25% | 21% | 176.4 | 427 |
| `spring-petclinic` | 132 | 12 / 14 / 59 (38+21) | yes | 915 | 176 (19%) | 169 / 14 / 0 | 17% | 21% | 87% | 37.4 | 343 |
| `telescope.nvim` | 113 | 19 / 19 / 37 (8+29) | yes | 270 | 23 (9%) | 18 / 18 / 0 | 11% | 53% | 25% | 96.9 | 414 |
| `tsx-zustand` | 144 | 11 / 12 / 41 (11+30) | yes | 153 | 33 (22%) | 36 / 3 / 0 | 9% | 17% | 82% | 36.4 | 368 |
| `zig-zls` | 132 | 14 / 14 / 26 (3+23) | yes | 117 | 9 (8%) | 10 / 6 / 0 | 7% | 7% | 33% | 598.1 | 647 |
| **pooled (17 repos)** | **6635** | **394 / 414 / 1671 (366+1305)** | 17/17 | **17704** | **2164** | **1345 / 463 / 6** | | | | **3080** | **1494** |

### 2.2 Pooled sense rate, as a funnel

| kind | rendered | loads | pairs | catches | no FALSE-ALARM | **sense rate** |
|---|---|---|---|---|---|---|
| types (classifying) | 394 | 394 | 64 | 50 | 46 | **12%** |
| nodes | 414 | 414 | 189 | 157 | 151 | **36%** |
| aspects (all) | 1671 | 1671 | 348 | 214 | 210 | **13%** |
| — of them deterministic | 366 | 366 | 348 | 214 | 210 | **57%** |
| — of them prose | 1305 | 1305 | 0 | 0 | 0 | **0%** |

### 2.3 What dominates each rate

**Loading is not the problem, and that is the first real result.** 17 of 17 measured repositories load — nine
languages, C# through Zig — with **zero load-blocking error codes** anywhere in the corpus. Yggdrasil reads
everything grain writes. (It took the `parent-type-forbidden` fix in §8 to get there; before it, the very first
repository was refused.)

**Aspects: the whole loss is the reviewer split and the drill.** Of 1671 drafted aspects, 1305 (78%) are prose
for an LLM reviewer and are unmeasurable for free (§1.1) — that single fact takes the all-aspect rate from 57%
to 13%. Among the 366 that render as a `check.mjs`, 348 produce pairs (95%), and the remaining loss is the drill:
348 → 214 catches. 463 MISSes against 1345 passes is the shape of that leg — rendered checks that run, produce
verdicts, and still fail to refuse a case cut from the very site the rule was mined on.

**Types: the loss is attachment, not rendering.** Only **70 of 394 types carry any aspect at all** (18%), and
the type sense rate is 12% — i.e. almost every type that has a rule also has a working one. A type with no rule
is inert whatever else is true of it; the number to move is the 324 that carry nothing, not the rendering.

**Nodes do best (36%)** because a node inherits every rule that reaches any file it owns: **189 of 414 nodes are
reached by at least one verdict**.

**A rule that catches nothing today: 125 of 366.** Deterministic aspects that load, produce pairs, and refuse
nothing anywhere in their own repository. That is the risk ruling `granularity-bounded-by-evidence-not-taste`
named in advance ("rule explosion without catches"), measured: a third of the rendered checks are silent on the
code they were mined from.

**The FALSE-ALARM leg is barely tested.** Only **88 of 366** drilled aspects have any `satisfies-` case at all,
so "FA = 0" is a real claim for a quarter of them and vacuous for the rest. Six FALSE-ALARMs total, in four
aspects, all one defect class (§8.1).

**Two repositories score 0% for one reason, and it is a defect, not a property of the language.**
`kotlin-datetime` and `leveldb` produce zero pairs — not because `yg check --approve` refused, but because it
had nothing to fill: *"Filling 0 unverified pairs across 0 nodes."* Every one of their deterministic aspects is
scoped to `_root/**`, and `_root` is grain's synthetic name for the repository-root bucket, not a directory.
Found here, fixed, and re-measured in §8 #6.

**Cost.** 3080 s of wall time for 17 repositories (median ~120 s, max 598 s on `zig-zls`), peak RSS 1494 MB on
`openzeppelin-contracts`; one repository, `cpp-json`, exceeded a 1500 s budget in `grain export`'s history walk
at 999 MB and is reported as a timeout rather than dropped. Every `yg` step is free and keyless — no reviewer
call was made anywhere in this report.

---

## 3. Granularity

Two granularities, per ruling `two-granularities-rules-fine-nodes-ownership-sized`: rules and types as fine as
the evidence allows, nodes sized so a charter, its contracts and its code fit one agent's context. Both are
measured here — the first as files per type and aspects per type, the second against the external
context-window constant `sizing.json` already carries.

### 3.1 Distributions

| repo | files/node min·med·max (1-file, 0-file) | files/type min·med·max | aspects/type med·max | units/det-aspect med | drill cases/aspect med |
|---|---|---|---|---|---|
| `CleanArchitecture` | 0·5·106 (0, 2) | 2·6·106 | 0·16 | 34 | 5 |
| `Slim` | 2·9·72 (0, 0) | 2·9·72 | 0·32 | 17 | 5 |
| `axum-full` | 2·27·184 (0, 0) | 2·27·184 | 0·56 | 22 | 5 |
| `bash-it` | 0·7·93 (0, 3) | 2·11·93 | 0·12 | 90 | 5 |
| `express` | 2·4·112 (0, 0) | 2·4·112 | 0·32 | 80 | 5 |
| `flask` | 0·9·87 (0, 2) | 2·12·87 | 0·50 | 26 | 5 |
| `gin` | 0·3·30 (0, 3) | 0·4·53 | 0·86 | 17 | 5 |
| `groovy-spock` | 0·15·544 (0, 3) | 0·17·544 | 0·63 | 36 | 5 |
| `kotlin-datetime` | 0·4·621 (0, 5) | 0·4·621 | 0·46 | 0 | 9 |
| `leveldb` | 0·5·44 (0, 4) | 0·6·44 | 0·37 | 0 | 5 |
| `openzeppelin-contracts` | 0·13·384 (0, 1) | 2·13·384 | 0·83 | 24 | 5 |
| `serde-full` | 3·19·272 (0, 0) | 3·19·272 | 0·45 | 30 | 5 |
| `sinatra` | 0·22·117 (0, 1) | 3·22·117 | 0·7 | 85 | 5 |
| `spring-petclinic` | 0·14·107 (0, 2) | 2·20·107 | 0·37 | 21 | 5 |
| `telescope.nvim` | 2·6·76 (0, 0) | 2·6·76 | 0·22 | 21 | 5 |
| `tsx-zustand` | 0·14·44 (0, 1) | 2·14·44 | 0·41 | 15 | 4 |
| `zig-zls` | 2·11·66 (0, 0) | 2·11·66 | 0·24 | 46 | 5 |


- **0 of 414 proposed nodes map exactly one file** (0%), and 27 map none at all.
- Of 366 drilled deterministic aspects, **329 have at least one `violates-` case** and only **88 have any `satisfies-` case** — so "FA = 0" is a real claim for 88 of 366 and vacuous for the rest.
- Types carrying at least one aspect: **70 of 394** (18%) — the rest are directories grain cut as types with no rule attached, and a type with no rule is inert whatever else is true of it.
- Nodes reached by at least one verdict: **189 of 414**.
- Deterministic aspects refusing 100% of their own scope (the saturation the filenameshape fix removed): 0
- Deterministic aspects with pairs but ZERO refusals on the repository's own code (a rule that catches nothing today): 125 of 366.
- **Ownership sizing** (sizing.json, budget 200000 tokens, external constant; tokens estimated at 4 bytes/token): 394 proposed nodes — median 4009 est. tokens, p90 58335, max 1129897; **13 exceed the budget** (3%).

**The four false-alarming aspects, whole corpus:**

- `axum-full` : `grain/axum/partition-returns-result` — 2 FALSE-ALARM
- `bash-it` : `grain/completion/partition-lex-indent` — 2 FALSE-ALARM
- `flask` : `grain/src/partition-returns-t-any` — 1 FALSE-ALARM
- `serde-full` : `grain/serde-derive/partition-returns-option` — 1 FALSE-ALARM

- Repositories with zero refusals on their own code: `kotlin-datetime`, `leveldb`
- Repositories whose graph Yggdrasil refused to load: **none**
- Not measured: `cpp-json` — propose timed out after 1500s
- AS PROPOSED (every aspect `status: draft`): **0 pairs across all 17 repositories**, and no load-blocking code on any of them — the measured baseline for section 1.1, not an assumption.
- Wall time 3080 s total, 598.1 s max; peak RSS 1493.8 MB max.

### 3.2 What the distributions say

**Rules and types are cut fine; nodes are cut coarse.** Median files per type is 4–27 depending on the
repository (corpus median of medians ≈ 11), and the same for nodes because most proposed nodes ARE a type's
directory. **Not one of the 414 proposed nodes maps exactly one file**, and 27 map none at all — so the
one-file node the granularity ruling explicitly permits ("a single-file node is admissible when the file is its
own locality") never actually appears; the renderer's floor (`MIN_TYPE_FILES`) is what prevents it, and §5
measures exactly what lifting that floor buys.

**Rules per partition is bimodal.** The median number of aspects per type is **0** in every single repository —
most types carry nothing — while the maximum runs from 7 (`sinatra`) to 86 (`gin`). Granularity is not being
spent evenly: a handful of partitions carry the entire rule set.

**Ownership sizing holds, with a long tail.** Against `sizing.json`'s external 200 000-token budget (Anthropic's
published context window — not a Grain number, not tuned), the 394 proposed nodes have a median of ~4 000
estimated tokens and a p90 of ~58 000, and **13 (3%) exceed the budget**, the largest at ~1.13 M. So the
ownership-sized half of the two-granularities ruling is satisfied for 97% of proposed nodes as rendered, and the
3% that are not are large directory roots that a maintainer would split anyway. (Tokens estimated at 4 bytes per
token; the estimate is labelled, the budget is not.)

**Drill corpora are small and capped.** Median drill cases per aspect is 5 in sixteen of seventeen repositories,
which is the renderer's own per-side cap, not a property of the evidence.

---

## 4. Hostile repositories: degrade without crashing, and never fabricate

`tests/stress/edge-cases.mjs` builds hostile little repositories to prove GRAIN degrades honestly (it reports
`25/25 edge cases ok` — 25 assertions across 15 scenarios, leaving **17** repositories on disk). This leg asks
the next question: does the PROPOSAL degrade too? The contract has two halves and only the second is about
content:

- **NO CRASH** — `propose.mjs` exits 0 and a staged `yg check` LOADS the graph (no load-blocking error code).
- **NO FABRICATION** — every drafted aspect names a positive number of measured sites in its own
  `provenance.json`, and nothing is drafted over zero tracked files. **An empty or minimal proposal is a pass**;
  that is the ticket's own wording and it is what most of these repositories should produce.

**Result: 17 of 17 hold** — after one fix in the renderer and one correction to this instrument's own contract predicate. The full matrix is in §4.1 below.

Two things the first run got wrong, one in the renderer and one in this instrument's own predicate — both worth
recording because both are the shape of mistake this leg exists to catch:

- **`plain` (a directory of code with no git repository) crashed `propose.mjs`, exit 128.** Real defect, fixed
  (§8 #5). After the fix it degrades exactly as it should: the worktree walk finds the same 154 files
  `git ls-files` finds in the identical `fixture-src` control, 6 types and 8 nodes are proposed from the layout,
  and **0 aspects** are drafted because with no history there is nothing certified — a minimal proposal, which is
  a pass.
- **`shallow` was flagged as fabrication by a predicate that was itself too crude.** The first version called any
  aspect drafted where the export certified ZERO conventions a fabrication. On a shallow clone history is
  unavailable so nothing is certified, but the 5 aspects drafted there are SUB-GATE rows cut from the HEAD tree,
  each carrying its own share, n and sites. Evidence below the certification bound is not the absence of
  evidence. The predicate now reads each aspect's `provenance.json` and asks the only question that is actually
  about fabrication: does this aspect name a positive number of sites it was measured on?

Notable rows: `empty` (a git repo with no commits) and `nocode` (commits, no code file) produce a completely
empty graph that Yggdrasil still loads. `tests-only` — 40 test files, mining-excluded, below every floor —
produces 2 types, 2 nodes and **0 aspects**: silence, honestly. `hostile-files` (a 5 MB generated file, a 2 MB
minified bundle, latin-1 bytes, CRLF, a path with spaces and parentheses) produces the same 31 aspects as the
clean control, with 5 more tracked files and no crash.

### 4.1 The hostile matrix

| hostile repo | what it is | propose | wall s | files | types/nodes/aspects | certified / sub-gate | yg loads | contract |
|---|---|---|---|---|---|---|---|---|
| `empty` | git repo with no commits at all | exit 0 | 0.3 | 0 | 0/0/0 | 0 / 0 | yes | held |
| `nocode` | commits, but not one code file | exit 0 | 0.4 | 1 | 0/0/0 | 0 / 0 | yes | held |
| `shallow` | shallow clone — history unavailable | exit 0 | 0.5 | 154 | 6/8/5 | 0 / 5 | yes | held |
| `symlinks` | symlinked directory and symlinked file inside the tree | exit 0 | 0.7 | 156 | 7/9/31 | 26 / 5 | yes | held |
| `hostile-files` | 5 MB generated file, 2 MB minified bundle, latin-1 bytes, CRLF, spaces and parens in a path | exit 0 | 0.8 | 159 | 7/9/31 | 26 / 5 | yes | held |
| `renames` | a mass directory rename across the history | exit 0 | 0.9 | 154 | 6/8/31 | 26 / 5 | yes | held |
| `tests-only` | nothing but test files — mining-excluded, below every floor | exit 0 | 0.4 | 40 | 2/2/0 | 0 / 0 | yes | held |
| `with-submodule` | a git submodule inside the tree | exit 0 | 0.9 | 156 | 7/9/31 | 26 / 5 | yes | held |
| `monorepo` | nested package roots, each under the partition floor | exit 0 | 0.8 | 216 | 8/11/31 | 26 / 5 | yes | held |
| `race` | index left behind by two cold queries racing | exit 0 | 0.8 | 154 | 6/8/31 | 26 / 5 | yes | held |
| `detached` | detached HEAD, two commits back | exit 0 | 0.9 | 150 | 6/8/31 | 26 / 5 | yes | held |
| `noindex` | no grain index present at all | exit 0 | 2 | 154 | 6/8/31 | 26 / 5 | yes | held |
| `newfile` | an untracked new file and a deleted tracked file | exit 0 | 0.8 | 154 | 6/8/31 | 26 / 5 | yes | held |
| `outside` | the fixture, queried with a path outside the repo | exit 0 | 0.8 | 154 | 6/8/31 | 26 / 5 | yes | held |
| `plain` | a directory of code with NO git repository | exit 0 | 0.4 | 154 | 6/8/0 | 0 / 0 | yes | held |
| `fixture-src` | the plain fixture itself — the control | exit 0 | 2.1 | 154 | 6/8/31 | 26 / 5 | yes | held |
| `sub-src` | the fixture used as a submodule source — a second control | exit 0 | 2 | 154 | 6/8/31 | 26 / 5 | yes | held |

**Contract held on 17 of 17.**

---

## 5. `MIN_TYPE_FILES` measured as a floor to remove, not to defend

Ruling `granularity-bounded-by-evidence-not-taste` asks for `MIN_TYPE_FILES = 2` to be measured as a floor to
REMOVE. `propose.mjs` gained `--min-type-files` so it could be, and the same three repositories were run end to
end at 2 and at 1 — same flags otherwise, same clones, same Yggdrasil binary.

| repo | floor | types | nodes | aspects (det) | pairs | refused | drill pass/MISS/FA | sense types | sense nodes | sense det-aspects | files/type med |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `CleanArchitecture` | **2** | 26 | 28 | 29 (8) | 279 | 31 | 40/0/0 | 8% | 36% | 38% | 6 |
| `CleanArchitecture` | **1** | 28 | 29 | 29 (8) | 279 | 31 | 40/0/0 | 7% | 35% | 38% | 6 |
| `flask` | **2** | 14 | 16 | 90 (27) | 982 | 193 | 137/3/1 | 7% | 25% | 89% | 12 |
| `flask` | **1** | 15 | 16 | 90 (27) | 982 | 193 | 137/3/1 | 7% | 25% | 89% | 9 |
| `spring-petclinic` | **2** | 12 | 14 | 59 (38) | 915 | 176 | 169/14/0 | 17% | 21% | 87% | 20 |
| `spring-petclinic` | **1** | 13 | 16 | 59 (38) | 915 | 176 | 169/14/0 | 15% | 19% | 87% | 14 |

Pooled over the three:

| floor | types | nodes | aspects (det) | pairs | refused | FA | type funnel | node funnel | det-aspect funnel |
|---|---|---|---|---|---|---|---|---|---|
| **2** (shipped) | 52 | 58 | 178 (73) | 2176 | 400 | 1 | 52→52→6→6→5 = **10%** | 58→58→18→18→17 = **29%** | 73→73→73→61→60 = **82%** |
| **1** (removed) | 56 | 61 | 178 (73) | 2176 | 400 | 1 | 56→56→6→6→5 = **9%** | 61→61→18→18→17 = **28%** | 73→73→73→61→60 = **82%** |

**The cost of removing the floor is 4 types and 3 nodes, and nothing else at all.** Aspects, pairs, refusals,
drill outcomes and FALSE-ALARMs are byte-identical between the two runs. The type and node sense rates go DOWN
(10%→9%, 29%→28%) for a purely arithmetic reason: every element the floor was suppressing is a one- or two-file
directory with no rule attached, so it enters the denominator and never the numerator.

That is the answer the ruling asked for, and it is not "keep the floor because 2 is a good number". It is: on
this evidence the floor is **not load-bearing** — it does not gate a single thing Yggdrasil operates on. Removing
it buys finer granularity, which the ruling wants; it buys no additional operability, which is the ruling's own
test for whether granularity has earned its place. The decision of whether an inert one-file type is worth having
is therefore a product decision with a measured price tag (+7.7% types, +5.2% nodes, 0% pairs) and not a tuning
question, and this instrument now exposes the knob either way.

---

## 6. The family adapter's precision gap (ticket 100), measured and fixed

Ticket 100 disclosed that on Yggdrasil's `family-planted-polyglot` fixture the adapter "folds one cross-language
decoy into the TS cluster". Measured here against both fixtures, staged into real single-commit git repositories:

**The report's characterisation was half right, and the half it got wrong was the more serious one.** There is no
cross-language merge — the Python family is exactly the five planted `*_repository.py` files and the TypeScript
family is TypeScript-only, so the language stratum holds. What actually happened:

| | before | after |
|---|---|---|
| `family-planted-polyglot`: families | 2 | 2 |
| members | 11 (py 5, ts **6**) | 10 (py 5, ts 5) |
| wrong members | **1** — `src/ts/ConfigLoader.ts`, the fixture's SAME-LANGUAGE decoy | 0 |
| member precision | 10 correct of 11 = **0.909** | 10 of 10 = **1.000** |
| members the family's own fitted predicate selects | py 5/5, **ts 0/6** | py 5/5, ts 5/5 |
| `family-planted-mono`: families / members | 1 / 5 (exact) | 1 / 5 (exact) |
| members the predicate selects, mono | **0 of 5** | 5 of 5 |

The predicate was `\b[A-Za-z0-9_]*first[A-Za-z0-9_]*\b`, drafted from grain's own case-folded name token `first`.
It matches Python's `find_first` and nothing in TypeScript's `findFirst`. So on the fixture 100 called EXACT, the
adapter was handing `yg advise` a family whose fitted predicate described none of its members — the membership
was right and the rule attached to it was vacuous, which is worse than a visibly wrong member because nothing in
the shape of the output says so.

Two instrument-level fixes in `propose.mjs`, both of which can only ever remove:

1. **A case-folded token is rendered case-tolerantly.** `nameTokens` entries come from `core.mjs`'s `tokenize`,
   which lowercases; every other branch of `contentRegexFor` anchors on something spelled exactly as the code
   spells it (a decorator, a supertype, a member identifier, an import specifier), so this is the only branch
   that needed it. This also affects group-scoped ASPECT scopes drafted from the same helper.
2. **A predicate-fit gate.** A family is a PAIR — a member list and the predicate that is supposed to describe it,
   which `yg advise` renders as the draft scope a maintainer adopts. A member the predicate does not select is a
   claim the file itself refutes, and the adapter has the file on disk. Members that do not select are dropped;
   a family left under `FAMILY_MIN_MEMBERS` is dropped whole.

Both fixed on sight, guarded red-green against a fixture reproducing the polyglot shape (both languages, both
decoys) — with the fixes reverted, the guard fails; with them, it passes.

---

## 7. The 20-candidate sample from 097 §7, judged (bar 2)

Ticket 097's bar 2 was *"precision ≥ 0.80 on a 20-candidate sample classified (a)/(b)/(c)"*. Ruling
`layers-compatible-no-user-thresholds` moved that classification off the maintainer and onto an independent Opus
judge — **not the author of the instrument that produced the candidates**, which is why this section is here and
not in `law-loop-yggdrasil.md`. **Disclosure: the classifier is a model, not a person.** A fourth class **(d) not
a rule at all** is added explicitly, because the 097 report itself already suspected most of these rows are
minority usage rather than rules and forcing them into (c) would flatter the result.

The classes, as used here:

- **(a) miner miss** — a real rule the repository holds and grain failed to see or landed elsewhere.
- **(b) graph debt** — a real, decidable practice the code follows and the graph does not declare.
- **(c) undecidable** — cannot be settled from the code without a human.
- **(d) not a rule at all** — the row is a statistical artefact: minority usage read as a negative rule, a
  counting-unit artefact, an inverted direction, or an identifier that is not what the predicate says it is.

Per `oracle-is-fallible-report-disagreements-symmetrically`, precision is computed on **(a)+(b)** only. Every
row was judged by opening the files, not from the table.

| # | candidate rule | share | n / dev | class | evidence, read from the code at `/home/user/Yggdrasil/source/cli` |
|---|---|---|---|---|---|
| 1 | `tests/integration`: quote strings with **single quotes** | 1.000 | 23 / 0 | **b** | 8001 single- vs 410 double-quoted spans across the 68 files; `eslint.config.js` sets no `quotes` rule and no hand aspect mentions quoting — a real, exceptionless practice the graph does not declare. |
| 2 | `tests/e2e`: method names follow **`a(Ua)+`** | 0.815 | 502 / 114 | **d** | `a(Ua)+` requires a second camel segment, so it refuses every legitimate one-word name; the e2e tree defines `run(`, `git(`, `w(` and 1174 `it(` call sites — the 114 "deviating" sites are ordinary names. |
| 3 | `tests/unit`: do **not import `node:url`** | 0.799 | 179 / 45 | **d** | 82 of 346 unit files import `node:url` (23.7%). The row says "76% of files don't" — that is a usage distribution, not a decision. |
| 4 | `tests/unit`: do **not import `src/model/graph`** | 0.763 | 171 / 53 | **d** | 87 of 346 unit files import the graph model (25.1%), and importing it is exactly what a unit test OF the graph does (`tests/unit/bounty/eff-flows.test.ts`). |
| 5 | `tests/integration`: method names follow **`a(Ua)+`** | 0.758 | 47 / 15 | **d** | Same shape defect as row 2, on 68 files. |
| 6 | `tests/e2e`: do **not call `copyFixture`** | 0.752 | 683 / 225 | **d** | 57 of 133 e2e files define their OWN local `function copyFixture(label: string)`; the hand aspect `e2e-public-surface` explicitly ALLOWS shared e2e helpers ("Shared e2e helpers under support/ are fine"). The rule would refuse the files that use a helper. |
| 7 | `tests/integration`: do **not import `src/relations/extractors/registry`** | 0.730 | 27 / 10 | **d** | 14 of 68 integration files import it (20.6%) — the relation-extractor tests. Minority usage. |
| 8 | `tests/integration`: do **not import `src/relations/resolve-path`** | 0.730 | 27 / 10 | **d** | The same 14 of 68 files (20.6%). Minority usage. |
| 9 | `tests/e2e`: do **not import `l`** | 0.716 | 58 / 23 | **d** | ZERO import statements in `tests/e2e` name `l`: no specifier there has `l` as its last path segment. `l` appears only as a local binding / arrow parameter. The predicate names something that is not an import. |
| 10 | `tests/integration`: do **not import `src/relations/pass`** | 0.703 | 26 / 11 | **d** | 15 of 68 (22.1%); e.g. `tests/integration/feature-hash-guard.test.ts:32` imports `runRelationPass` from it. Minority usage. |
| 11 | `tests/e2e`: do **not import `line`** | 0.679 | 55 / 26 | **d** | ZERO import statements name `line`; it occurs only as a loop variable (`for (const line of all.split('\n'))`, 10 files). Same defect as row 9. |
| 12 | `src`: quote strings with **single quotes** | 1.000 | 109 / 0 | **b** | 12857 single vs 1188 double across 334 src files; no lint rule, no aspect. Real undeclared convention. |
| 13 | `src`: type names follow **`(Ua)+`** | 1.000 | 103 / 0 | **b** | 103 conforming, 0 deviating: `(Ua)+` accepts one-word PascalCase, so unlike rows 2/5 the shape does not refuse ordinary names. No naming aspect exists among the 51 hand aspects. |
| 14 | `tests/e2e`: quote strings with **single quotes** | 1.000 | 48 / 0 | **b** | 25502 single vs 1467 double across 133 files; undeclared. |
| 15 | `tests/unit`: quote strings with **single quotes** | 1.000 | 119 / 0 | **b** | 55495 single vs 1874 double across 346 files; undeclared. |
| 16 | `src`: indent with **2 spaces** | 0.964 | 110 / 6 | **b** | `eslint.config.js` sets no `indent` rule (its only rules are `no-unused-vars`, `explicit-function-return-type: off`, `no-explicit-any`) and none of the 51 hand aspects covers layout; grain's own count is 110 conforming to 6 deviating. A rule with six live exceptions, not an invariant — which is why this is the weakest of the six (b) rows. |
| 17 | `tests/fixtures`: do **not call `violations.push`** | 0.800 | 20 / 5 | **d** | 15 of 216 fixture files call `violations.push` and every one of them is a `check.mjs` implementing Yggdrasil's own deterministic-check contract (`tests/fixtures/ast-aspects/async-fs/check.mjs:4`). The rule refuses correct implementations of the contract. |
| 18 | `tests/unit`: do **not call `rmSync`** | 0.800 | 8 / 2 | **d** | 115 of 346 unit files call `rmSync` (33.2%), for temp-dir cleanup — which the hand aspect `test-deterministic` positively requires ("fresh temp dirs per test"). |
| 19 | `tests/integration`: do **not call `it`** | 0.796 | 152 / 39 | **d** | 67 of 68 integration files call `it(` (98.5%) — the practice is the exact opposite of the rule. The 0.796 is a counting-unit artefact: grain counts SCOPES, and the callbacks passed to `it` do not themselves call `it`. |
| 20 | `src`: do **not import `src/utils/posix`** | 0.794 | 162 / 42 | **d** | 57 of 334 src files import it (17.1%), and `src/utils/posix.ts` documents itself as "the single home for the normalize path separators idiom"; two hand aspects (`posix-paths-source`, `posix-paths-output`) push code TOWARD it. The candidate inverts an existing hand rule. |

### 7.1 The tally, the two populations, and the verdict

| class | rows | count |
|---|---|---|
| (a) miner miss | — | **0** |
| (b) graph debt | 1, 12, 13, 14, 15, 16 | **6** |
| (c) undecidable | — | **0** |
| (d) not a rule at all | 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 17, 18, 19, 20 | **14** |

Two populations, and they must not be mixed (097 §8 confound 11 says so itself):

- **The 11 rows with a held-out corpus** (rows 1–11 — the candidates that survived their own held-out drill with
  0 FALSE-ALARM and have no hand counterpart): (a)+(b) = **1 / 11 = 0.091**.
- **All 20 rows** (11 held-out + 9 with no corpus at all): (a)+(b) = **6 / 20 = 0.300**.

**Bar 2 was ≥ 0.80. FAILED, on both populations** — 0.091 on the population the bar was actually about, 0.300 on
the mixed one. Not a near miss.

**Sensitivity of the judgement.** The six (b) rows are all house style: single quotes (4 rows), 2-space indent,
PascalCase type names. Yggdrasil's own stated test for creating an aspect (`yg knowledge read aspects-overview`:
"the same pattern appears in 3+ files AND a reviewer can verify it against source code") is met by every one of
them, none is enforced by the linter, and none of the 51 hand aspects covers them — so on the repository's own
criteria they are genuine, undeclared, verifiable practice. A maintainer who holds that layout and quoting belong
to a formatter rather than to the architecture graph would move five of the six to (d), leaving row 13 alone:
**0 / 11 held-out and 1 / 20 = 0.05**. The bar fails either way; the disagreement changes 0.30 to 0.05, not the
verdict.

### 7.2 What the sample actually is, in four failure modes

Not one row is (a) and not one is (c) — every row could be decided by reading the code, which means the sample is
not hard, it is mostly artefactual. The 14 (d) rows fall into four named modes:

1. **Minority usage read as a negative rule** (rows 3, 4, 7, 8, 10, 17, 18, 20 — 8 of 20). A module used by
   17–33% of a directory's files produces "files here do not import Y" at share 0.68–0.80. The 097 report
   suspected this; the file counts confirm it.
2. **An identifier that is not an import** (rows 9, 11). `l` and `line` never appear in an import statement in
   `tests/e2e` — no specifier there has either as its last path segment. They are loop variables and arrow
   parameters. This is a grain-side extraction defect, observed here and left for the engine's own ticket.
3. **A counting-unit artefact** (row 19). 67 of 68 integration files call `it(`, yet the row says "do not call
   `it`" at 0.796 — because grain counts SCOPES, and the callbacks passed to `it` do not themselves call `it`.
4. **An inverted direction against an existing hand rule** (rows 6, 20, and 18 in effect). `src/utils/posix.ts`
   documents itself as "the single home for the normalize path separators idiom" and two hand aspects
   (`posix-paths-source`, `posix-paths-output`) push code toward it; the candidate says do not import it.
   `e2e-public-surface` explicitly permits shared e2e helpers; the candidate says do not call one.
   `test-deterministic` requires "fresh temp dirs per test"; the candidate says do not call `rmSync`.

Mode 4 is the sharpest confirmation of ruling `law-loop-b1-not-doing-it-with-numbers`: it is not that grain fails
to see the identifier — grain sees exactly the identifier the maintainer's rule is about, and renders the rule
with the opposite sign.

---

## 8. Six defects the real CLI found, and what fixing them was worth

Running the proposal through the actual Yggdrasil binary — rather than through this repository's own YAML reader —
found six defects in `propose.mjs`, five of them invisible to every previous ticket because 093/094/097/098 all
measured against Yggdrasil, a TypeScript repository with no submodules and no root-file bucket, where four of the
six happen not to fire. All six are fixed on sight (ruling `fix-bugs-on-sight`) with a red-green test in
`plugins/grain/tests/integration-stress.test.mjs`; the engine is untouched.

| # | defect | how it showed | fix |
|---|---|---|---|
| 1 | `module`'s allowed parents excluded the proposal's own types | `parent-type-forbidden`, a BLOCKING error on the first corpus repository: *"Node 'src/main' (type 'module') has parent 'src' of type 'src'"* — the graph did not come in | every active type is an allowed parent of `module`, derived from the cut this run made |
| 2 | the `imp` check matched a specifier only INSIDE QUOTES | **24 of the 38** rendered checks on spring-petclinic were `imp` checks; every single one scored 0 refusals on the repository and 4–5 of its 5 `violates-` cases MISS. Java writes `import jakarta.persistence.Entity;`, Python `import os`, Rust `use serde::Serialize;` — all unquoted | the specifier is matched as a bounded token anywhere in the import statement's text; the quoted spelling still matches, a longer name containing it does not |
| 3 | the `filenameshape` check tested an ANCHORED shape against the name WITH its extension | both rendered `filenameshape` checks refused **100%** of the files in their own scope, and the one with `satisfies-` cases FALSE-ALARMED on 5 of 5 — on the files grain itself certified as conforming. grain measures the shape as `nameShape(basename(rel, extname(rel)))` | the shape is tested against the stem, computed exactly as node's `basename(b, extname(b))` does |
| 4 | the family adapter emitted a predicate that selected none of its own members | on Yggdrasil's `family-planted-polyglot`: 2 families, 11 members, of which 1 wrong; the TS family's predicate `\b[A-Za-z0-9_]*first[A-Za-z0-9_]*\b` matched **0 of its 6 members** (`findFirst` has a capital F). On `family-planted-mono` — the fixture 100 reported as EXACT — the same predicate matched 0 of 5 | a case-folded `nameTokens` entry is rendered case-tolerantly (`[Ff][Ii][Rr][Ss][Tt]`), and a predicate-fit gate drops any member the predicate does not select, and any family that falls below the size floor as a result |
| 5 | `propose.mjs` crashed on a directory with NO git repository | `fatal: not a git repository`, exit 128 — on the one hostile repository whose entire point is the absence of git, and which `grain export` itself handles | `git ls-files` falls back to a worktree walk that skips `.git`, `.grain`, `.yggdrasil`, `node_modules`. Weaker (no `.gitignore` resolution) and stated as such — a degradation, which is the contract, not a crash, which is not |

| 6 | grain's synthetic partition name `_root` was rendered as a directory path, and a git SUBMODULE was rendered as a file | every type, node and aspect drawn from the root-file bucket got a `when` of `_root/**` that selects nothing, a `mapping` naming a path that is not on disk, and a scope that can never produce a pair. Across the corpus: 4 of 17 repositories, **168 drafted aspects scoped to `_root/**`** (17 of them deterministic), **every one producing ZERO pairs**; plus `mapping-path-missing` and `type-when-mismatch` errors in all four. leveldb's `third_party` gitlink produced a second `type-when-mismatch` the same way | derived, not listed by name: a partition name under which NO tracked file lives is not a directory — if its files all sit at the repository root it is drafted as the root glob (`path: '*'`), otherwise it is skipped. `git ls-files -s` lets a mode-160000 gitlink be dropped, which is what Yggdrasil's own loader does with a nested checkout anyway |

**What #2 and #3 were worth, measured on the same repository, same flags, before and after** (spring-petclinic,
`SUBGATE_PER_PARTITION=1000`):

| | before | after |
|---|---|---|
| deterministic aspects: rendered → pairs → catches → no-FA | 38 → 38 → 9 → 9 | 38 → 38 → 33 → 33 |
| **sense rate, deterministic aspects** | **24%** | **87%** |
| FALSE-ALARM (drill, whole repo) | 5 | **0** |
| refusals on the repository's own code | 100 of 915 | 176 of 915 |
| sense rate, types / nodes | 8% / 7% | 17% / 21% |

Two of these were rendering defects that made a check silently inert or silently saturated. Neither would be
caught by any test that reads the rendered YAML rather than running the rendered JavaScript against real code,
which is the whole argument for measuring through the neighbour's real binary.

### 8.1 One defect found and NOT fixed, deliberately

**A file-scoped check rendered from a sub-file-scoped convention can false-alarm on a file the corpus labels
conforming.** EVERY remaining FALSE-ALARM anywhere in this ticket — corpus leg and sensitivity leg alike — is
this, and only this. Three aspects across everything measured, two of them the same template:

- `grain/axum/partition-returns-result` — the convention is about METHODS (*"methods here do not declare a return
  type of `Result`"*, share 0.897, 1024 conforming / 105 deviating), the rendered check runs over the whole FILE.
  `axum/src/boxed.rs`, cut as a `satisfies-` case, contains `fn fmt(&self, f: &mut fmt::Formatter<'_>) ->
  fmt::Result` at line 56. The check refuses the file, correctly by its own text; the label is what is wrong.
- `grain/src/partition-returns-t-any` on flask — the same `returns` template, the same shape.
- `grain/completion/partition-lex-indent` on bash-it — the convention is *"files here indent with tabs"*
  (share 0.978, 45 conforming / 1 deviating), measured by grain as a file's DOMINANT indent unit; the rendered
  check fires on the first space-indented line. A majority-tabs file with any space-indented line false-alarms.

`cutDrills` already has the rule that fixes the first shape — *"a file that carries ANY deviating site is a
`violates-` case, whatever else it also carries"* — but it consults only the deviating-site list the export
publishes, which is a sample, not the complete set. The natural completion is to verify a `satisfies-` label
against the file's bytes before writing the case.

It is NOT applied here, and the reason is not effort: it changes what a drill corpus ASSERTS, which is 097's
contract, and it would move the FALSE-ALARM figure in three already-published reports. That is an acceptance
decision about the instrument's own ground truth, which is the escape hatch `fix-bugs-on-sight` names. Filed with
the evidence above; the two affected aspects are named in the matrix.

**What #6 was worth**, re-measured end to end on the four repositories that carried a `_root` element, plus
`spring-petclinic` as a control that carries none:

| repo | | types / nodes / aspects (det) | pairs | refused | sense det-aspects | `yg check` error codes |
|---|---|---|---|---|---|---|
| `gin` | before | 13 / 15 / 148 (22) | 329 | 72 | 55% | type-when-mismatch, mapping-path-missing |
| `gin` | **after** | 12 / 14 / **62 (14)** | 329 | 72 | **86%** | **none** |
| `leveldb` | before | 12 / 14 / 37 (5) | 0 | 0 | 0% | type-when-mismatch ×2, mapping-path-missing |
| `leveldb` | **after** | 10 / 12 / **0 (0)** | 0 | 0 | — (nothing drafted) | **none** |
| `kotlin-datetime` | before | 31 / 35 / 46 (5) | 0 | 0 | 0% | structural-cycle, type-when-mismatch, mapping-path-missing |
| `kotlin-datetime` | **after** | 30 / 34 / **0 (0)** | 0 | 0 | — (nothing drafted) | structural-cycle only |
| `groovy-spock` | before | 51 / 53 / 215 (44) | 5050 | 116 | 36% | structural-cycle, type-when-mismatch ×2, mapping-path-missing |
| `groovy-spock` | **after** | 50 / 52 / 211 (44) | 5050 | 116 | 36% | structural-cycle, type-when-mismatch |
| `spring-petclinic` (control) | before | 12 / 14 / 59 (38) | 915 | 176 | 87% | none |
| `spring-petclinic` (control) | **after** | 12 / 14 / 59 (38) | 915 | 176 | 87% | none |

Read that as three different things happening for one reason. On `gin` **86 inert aspects disappear and not one
pair, refusal or drill outcome changes** — the rate goes 55% → 86% because the denominator was full of rules
that could never fire. On `leveldb` and `kotlin-datetime` the proposal goes from 37 and 46 aspects that produce
nothing to **zero aspects**, which is strictly more honest: the renderer no longer emits a rule it cannot attach,
and `leveldb`'s graph now reports no errors at all. The control is byte-identical, so the fix touches only what
it should.

Corpus-wide this is arithmetic rather than a re-run, and it is exact because every element removed contributed
zero to every leg of the funnel (verified: 0 pairs from all 17 of the deterministic ones): the pooled
deterministic-aspect sense rate goes from **210/366 = 57% to 210/349 = 60%**, all-aspects from 13% to
**210/1503 = 14%**, and nodes from 36% to **151/409 = 37%**.

---

## 9. Confounds

1. **No corpus repository has a hand-written graph, so nothing here is recall.** This measures whether Yggdrasil
   OPERATES on what grain proposes, not whether what grain proposes is what a maintainer would have written.
   Recall against a hand graph is 093's number and stays 093's number.
2. **The enforcement-inflation caveat does not apply, but "a rule that catches nothing today" does.** Yggdrasil's
   own repository is green against its own gate, which is why 097 had to move to drill corpora. These
   repositories have no Yggdrasil gate at all, so a refusal here is a genuine catch on unguarded code. The other
   direction is live though: an aspect with 0 refusals on the repository is a rule that catches nothing TODAY,
   and the matrix carries the refusal count per repo so that is visible.
3. **The pair numbers are one deliberate step past what a maintainer receives** (§1.1): the proposal ships every
   aspect `draft`, which produces zero pairs by construction, and the measurement promotes the deterministic ones
   to `advisory`.
4. **Prose aspects are structurally unmeasurable for free** (§1.1). Their sense rate of 0 is a fact about the
   keyless gate, not a claim that the prose is wrong — it cannot be judged without a configured reviewer, and
   this run makes no reviewer call and needs no key.
5. **The drill corpora are grain's own.** A drill case is cut from the very sites grain mined, with no hold-out
   (`--holdout` exists and was not used here — a hold-out would have cut the corpora further and the ticket asks
   about operability, not generalisation). A drill number here is TEMPLATE FIDELITY — does the rendered check
   read the tree the way grain counted — not rule quality. 097 §8 confound 6 says the same thing.
6. **"FA = 0" is only as strong as the satisfies side.** The matrix reports how many drilled aspects had any
   `satisfies-` case at all; where that count is low, FA = 0 is close to vacuous and must be read as such.
7. **Wall time is not a clean benchmark.** The machine has 4 cores and other instrument work (the hostile leg,
   the guard test) ran concurrently with parts of the corpus leg. Wall times are upper bounds under contention.
   Peak RSS is sampled every 120 ms over the process tree and is a LOWER bound.
8. **`coverage.type_level` is left `false`, as the renderer writes it.** Ruling
   `two-granularities-rules-fine-nodes-ownership-sized` names `type_level` as part of the finest cut — a rule
   binding to a file through its type with no node at all. The proposal does not set it, so every pair here is
   reached through a node. That is a limit of what was measured, not a finding about `type_level`.
9. **One repository timed out and is reported as such, not dropped.** `cpp-json` (nlohmann/json) exceeded the
   1500 s propose budget on its history walk — 999 MB peak RSS at the kill — and is a labelled row in the matrix
   rather than a silent absence. The corpus figure is therefore 17 measured of 18 attempted.
10. **Seven repositories are not attempted**: `curl`, `nest`, `okhttp`, `playframework` and the three
    `symfony-*` entries were excluded for cold-build cost (the ticket permits it with the reason stated). `chi`
    is named in the ticket but is not in `corpus.json` at all. The corpus attempted here is 18 of 25 pinned
    entries.
11. **`edge-cases.mjs` builds 17 hostile repositories, not 25.** The "25" in the ticket is its ASSERTION count
    (`25/25 edge cases ok`), across 15 numbered scenarios. All 17 repositories it leaves on disk are measured.
12. **The runs are reproducible, and that was checked rather than assumed.** The sensitivity leg's
    `MIN_TYPE_FILES=2` arm re-measured `CleanArchitecture` and `spring-petclinic` independently of the corpus
    leg and returned identical figures on both (279 units / 31 refused / 38% and 915 / 176 / 87%) — same
    proposal, same pairs, same verdicts, same drill outcomes.

---

## 10. Reproducing this

```bash
# 1. the corpus, at the pinned shas from plugins/grain/tests/stress/corpus.json
#    (18 of the 25 entries; the five named in confound 9 are excluded for cold-build cost)
node plugins/grain/tests/stress/integration-stress.mjs \
  --clones <dir-of-clones> --out <out> \
  --subgate-per-partition 1000 --json <out>/corpus.json

# 2. the floor sensitivity, MIN_TYPE_FILES 2 (shipped) against 1 (floor removed)
node plugins/grain/tests/stress/integration-stress.mjs --clones <dir> --out <out2> \
  --repos spring-petclinic,CleanArchitecture,flask --subgate-per-partition 1000 --min-type-files 1

# 3. the hostile leg — build the repositories with the repo's own instrument, then measure the proposal
node tests/stress/edge-cases.mjs <work>
node plugins/grain/tests/stress/integration-stress.mjs --out <out3> --only hostile \
  --hostile-work <work> --json <out3>/hostile.json

# 4. the root-fix re-measurement (defect 6 in section 8)
node plugins/grain/tests/stress/integration-stress.mjs --clones <dir> --out <out4> \
  --repos leveldb,kotlin-datetime,gin,groovy-spock,spring-petclinic --subgate-per-partition 1000

# 5. the guard — 16 tests, red-green on all six fixes
cd plugins/grain && node --test tests/integration-stress.test.mjs
```

`--yg <path>` (or `YG_BIN`) points at a built Yggdrasil `bin.js`; the default is
`/home/user/Yggdrasil/source/cli/dist/bin.js`. Stages are deleted after each repository unless `--keep-stages`.
Every proposal, `proposal.json`, `sizing.json` and drill corpus stays under `<out>/proposals/<repo>/`.

