# Results

This is the complete measured record of grain, negatives first. Development on the 0.3.0 build paused on 2026-09-02
for the reasons in the second half of this page, then resumed on 2026-09-05 under a new objective
(`north-star-brownfield-miner` in `.system/decisions.md`): Grain mines a proposed `.yggdrasil/` architecture graph
for a repository that has none, for a maintainer adopting [Yggdrasil](https://github.com/krzysztofdudek/Yggdrasil),
not for an agent mid-edit. The section below is that objective's complete record, 093–107, every negative kept in.
The section after it is the earlier record, kept because the agent-facing surface it measured still exists and
still works — it is the second story now, not the first. The 093–107 measurements were made on the 0.3.0 build and the wave-9 ones
(108–119) on the code that became 0.4.0; waves 10 and 11 (120–148) landed in 0.4.0 as released on 2026-09-07, with
`grain advise` measured over four graphs and shipped as data rather than advice, the scope co-change budget cut over
two populations with no consumer's precision moving, and the first adopter-recorded oracle — the internal research
documents under `.system/research/` name the exact commit each ran against, and nothing in them was edited to match a
release.

## Brownfield-miner results (093–107), the current objective

Every number below comes from a run recorded in `.system/research/` or a ticket log under `.system/issues/`; the
memo link in each row is the primary source, re-derived rather than quoted from memory. Every disagreement Grain
had with a hand-written graph is classified (a) miner miss, (b) hand graph is stale, or (c) undecidable without a
human, and precision/recall are computed only on (a)+(b) — never assumed to be Grain's fault by default
(`oracle-is-fallible-report-disagreements-symmetrically`).

| # | instrument | question | method | numbers | verdict |
| --- | --- | --- | --- | --- | --- |
| 093 | graph reconstruction (G′) | How much of a hand-written `.yggdrasil/` does `grain export` recover with zero rendering? | Point `grain export` at Yggdrasil (3019 files, 38 node types, 427 nodes, 70 aspects) and compare partitions/modules/groups/directories against the hand graph's own `when`/`mapping`/relations/cycles. | Types 19/36 at J≥0.5 (12 at J≥0.8) · relations recall **0.894**, precision **0.998** (1105/1236 node pairs; precision inflated by Yggdrasil's own CI import gate) · cycles **2/2** · node mappings only 83/393 at J≥0.5, confounded by granularity (28/66 = 0.42 on 5+-file nodes) · deterministic aspects: 11/57 name a shared identifier, 20 unmeasurable (no identifier at all), 6 forbid an absence (invisible to a miner) | **Positive on architecture, silent on rule content.** [`.system/research/reconstruction-yggdrasil.md`](../.system/research/reconstruction-yggdrasil.md) |
| 094 | proposal renderer | Can Grain render that architecture as an actual `.yggdrasil/` tree, and does the tree it renders check out? | `propose.mjs` writes node types/nodes/aspects to a staging tree; stage it into a copy of Yggdrasil and run the real `yg check` and `yg drill`. | 82 active types (recall 21/36 at J≥0.5, 24/36 with alternatives — up from 093's 19/36 baseline) · 72 nodes · 215 aspect drafts (43 renderable as `check.mjs`) · drill sweep **208 pass / 29 MISS / 0 FALSE-ALARM** over 237 cases · `yg check` loads the staged proposal clean | **The renderer produces a graph Yggdrasil actually loads, with zero false alarms on its own corpus.** [`.system/research/proposal-yggdrasil.md`](../.system/research/proposal-yggdrasil.md) |
| 096 | "too much" diagnostic | Does a compression-based deviance ranking point at the file(s) each repository already knows are its problem? | Rank every file on 10 excess-bits dimensions on both Yggdrasil and Grain; compare the top ranks against each repo's own stated hot spots and `yg advise`'s cycle nominations. | Yggdrasil's named hot spot ranks 4/2290 (its other half ranks 1); Grain's two largest files rank 1 and 2 of 1142; both `yg advise` cycles reproduced exactly; **but** the union of all 10 dimensions flags 27.4% of Yggdrasil / 10.3% of Grain — too many files to ship as a flag list | **Positive as a top-N ranking with per-row evidence; explicitly rejected as a flag or a gate — 27.4% fails this project's own 18.6%-rejected/1.58%-shipped standard.** [`.system/research/too-much-yggdrasil-grain.md`](../.system/research/too-much-yggdrasil-grain.md) |
| 097 | the law loop (B1) | Does a mined rule, rendered as a deterministic check, reproduce a hand-written rule *in verdict* — the bet that practice converges on law? | Drill 89 mined candidates (49 rendered checks + 40 superposition shape checks) against the 45 drillable Yggdrasil hand aspects with a corpus; bar set in advance: ≥10/20 "miner-miss" hand rules reproduced. | **Bar was 10 of 20 miner-miss rules. Result: 2 of 20 — 0 of 20 once the candidate must also govern the same files as the rule it reproduces** (53 of 55 reproducing pairs share zero files with the rule they "reproduce"). Held-out sweep (182 cases, cut sha) does hold for the templates themselves: 156 pass / 25 MISS / 1 FALSE-ALARM. | **NEGATIVE — the bet is lost, with numbers.** Hand-written rules are negative and specific because a decision was made ("never `node:fs` here"), not because a majority was observed; Grain sees majorities. [`.system/research/law-loop-yggdrasil.md`](../.system/research/law-loop-yggdrasil.md) |
| 098 | graph currency at wave close | Does a hand-written graph accumulate silent drift as a repository grows, and can Grain's own comparison sensor it for free? | Re-run 093/094's comparisons at HEAD and at HEAD~200 on Yggdrasil (200 commits, +1049 tracked files, +81 nodes, +16 aspects in between). | **(b) graph debt: 4 rows at both ends — 0 new debt per 100 commits** over 200 commits of real growth on a repo that runs `yg check` in CI on every commit. The 4th debt row (`.yggdrasil/aspects` module, 11% node coverage) is new information 093/094 could not see. | **Positive control**: an actively-dogfooded graph does not visibly rot; this is one data point, not a general claim. [`.system/research/graph-currency-yggdrasil.md`](../.system/research/graph-currency-yggdrasil.md) |
| 100 / 102 | family seam contract | Can Yggdrasil's own `yg advise` nominate a family Grain mined, with zero code changes on Yggdrasil's side? | Grain emits Yggdrasil's own `.family-candidates.json` shape from role groups with no certified convention of their own; stage it into a fixture repo with a planted family. | Planted-mono fixture: **exactly the 1 planted family, 5 members, nothing else**; `yg advise` nominates 5 of 5. The planted-polyglot fixture folds in one cross-language decoy — a real, disclosed precision gap, not silently patched. Every proposed node also gets a `charter.md` (lives-in / depends-on / used-by / conventions / co-change), read back successfully by Horde's own `node.mjs show`. | **Positive**: the seam works on the case it was built for; one named gap carried forward to 101. [`.system/issues/100-family-seam-contracts/log.md`](../.system/issues/100-family-seam-contracts/log.md) |
| 101 | integration stress / sense rate | Of what Grain proposes, how much does Yggdrasil actually **load**, produce a **verdict** for, **catch** a violation with, and do so with **no false alarm**? | Full pipeline (propose → stage → `yg check` → promote deterministic aspects → `yg check --approve --only-deterministic` → `yg drill`) over 17 of 18 attempted public repositories, 9 languages, none with a hand graph, plus the 20-candidate sample from 097 judged by an independent Opus panel. | Sense rate: types **12%**, nodes **36%**, all aspects **13%** (deterministic **57%**, prose **0%** — 1305 of 1671 proposed aspects are prose a keyless CI cannot operate on at all). Loading: **17/17**, zero load-blocking errors. Bar 2 (097's sample, precision ≥0.80 on a/b): **FAILED — 0.091** on the 11 held-out-corpus rows, **0.300** over all 20 (14 of 20 rows are not rules at all — minority usage read as a negative rule). Hostile repos: **17/17** hold the contract, no crash, no fabricated claim. Six real `propose.mjs` defects found by running the neighbour's actual binary and fixed on sight (one pair took a repo's deterministic sense rate from 24% to 87% and its false alarms from 5 to 0). | **Mixed, negative on the headline bar.** Loading and hostile-input handling are solid; the rule-content sense rate is dominated by prose Yggdrasil cannot run at all, and bar 2 fails by a wide margin either way the sample is read. [`.system/research/integration-stress.md`](../.system/research/integration-stress.md) |
| 104 / 107 | `grain propose` ships as a product command | What does a maintainer actually receive by default, once `enforced` requires both a certified convention *and* a clean drill? | `enforced-requires-certified-origin` ruling implemented: a sub-gate-lattice-origin row that clears its drill earns `advisory` (Yggdrasil's `reviewer runs; refused → warning, no block`), never `enforced`. Default report: architecture + earned-`enforced` rules + a short advisory-candidate list; everything else counted, not printed, behind `--full`. | Yggdrasil's own self-proposal: 124 aspects → **10 enforced, 0 advisory, 114 draft** (91 prose, 22 caught-nothing, 1 file-scope approximation). Grain's own self-proposal (0 certified conventions, young repo): 81 aspects → **0 enforced, 22 advisory, 59 draft** — before this ruling it had promoted 22 of 22 lattice rows straight to `enforced`, including rules its own certification had refused. | **Positive**: the quiet default report is honest about what it has actually proven, and the fix is measured against the failure it replaces. [`.system/issues/104-grain-propose-product-command/log.md`](../.system/issues/104-grain-propose-product-command/log.md), [`.system/issues/107-lattice-rows-promoted-to-enforced/log.md`](../.system/issues/107-lattice-rows-promoted-to-enforced/log.md) |

**What this means, read across the table.** Grain reliably mines *architecture* — types, module boundaries,
dependencies, cycles, at recall/precision numbers that hold up on the one repository where they can currently be
checked (093, 098). It reliably renders that architecture into a graph Yggdrasil loads and drills clean (094, 100).
It does **not** reliably mine *law* — the maintainer's own negative, decided rules are not recoverable from what
the repository's code and history show a miner (097), and the rules it does render are mostly prose a keyless CI
cannot act on at all (101). The product design that follows from this, shipped in 104/107, is the honest one:
report the architecture and the rules that earned it with a real drill, put everything else on disk as a candidate
or a draft with its reason named, and never let a maintainer mistake a majority Grain observed for a decision only
they can make.

**Open, for the current objective.** Wave 9 (opened 2026-09-05, in progress as this page is written) is measuring
whether a maintainer-facing oracle for a/b/c disagreements can be built without a person in the loop for every one,
whether the sense rate in the 101 table above rises once the six fixed defects and the finer-type work land, and a
factory-process dry run end to end. None of that has a number yet; when it does, a row is added to the table above,
not a claim added here ahead of the measurement.

## Earlier results — the agent-facing surface (0.1.0 → 0.3.0), the superseded objective

Everything below measures the commands (`where`, `check`, `how`, the edit-time hooks) that answer an agent mid-task.
They are still true, the commands still work exactly as measured, and they are still documented in the README — but
they are no longer the reason this project exists, and the verdict below (a placement note that spoke *unbidden*
being the only demonstrated effect on a diff) is part of why the objective changed.

## The verdict in one paragraph

On every task where it was measured, an agent with grep, cat and its own judgement produced the same diff, in the same
place, with the same number of tool calls as an agent with grain. Two paired trials on this build (25 runs with grain
across 6 task pairs on 5 repositories) produced **zero diffs changed by a grain answer**. The one demonstrated effect in
the project's history came earlier and by a different route: a placement note that spoke *unbidden, before the write*
(trial 3 below), not an answer to a question the agent asked. The engine is in the best state it has ever been — 2181
tests, seven honesty instruments in CI, no fabrication class left open on the 25-repository corpus — and there is no
evidence that it helps anyone. Both statements are true at once.

## What was measured, and how

Everything below was measured by agents or harnesses that did not write the code under test, on repositories whose
history the engine had never seen, and every number that went against grain is reported at the same size as the ones
that went for it. Sources: `docs/validation.md` (the 0.1.0 record), the release commits of 0.2.0, 0.2.1 and the first
0.3.0 (field testing), `.system/research/` (the direction work and both paired trials) and `.system/decisions.md`
(every ruling, including the director's own disproven hypotheses).

## Truth audits (0.1.0)

Two independent sessions with no context beyond the tool's path re-verified grain's printed claims with find, grep and
git.

| audit | claims | exactly true | true but imprecise | unverifiable | false |
| --- | --- | --- | --- | --- | --- |
| 1, before the mathematical rebuild | 15 | 13 | 2 | 0 | 0 |
| 2, after the rebuild | 39 | 28 | 8 | 2 | **1 class** |

The false class: deviant counts were taken over one population while the percentage beside them came from another,
producing "100% of 29 established, 6 deviants" verbatim. Fixed at the source the same day. The same audit recorded
grain out-verifying the auditor once.

## Agent trials on a private repository (0.1.0)

Three A/B trials on a private production monorepo whose history begins after the worker model's knowledge cutoff.
Real tasks replayed from the repository's own history; both arms scored against the diff the author actually shipped.

- **Trial 1** (session-start advertisement only): the worker never called grain in any arm. The index was right about
  both placement errors the arms made. A correct oracle that waits to be asked never reaches the code.
- **Trial 2** (plus the post-edit check hook): zero notes across 27 edited files, verified three ways to be correct
  silence. Line-level checks are structurally blind to the failure class the trials exhibit, which is placement.
- **Trial 3** (plus placement-on-create): four notes, and the worker moved four files it had misplaced, writing
  "Following grain's placement signal" into its own transcript. **The only demonstrated effect on a diff in the
  project's history.** The files still landed off the author's choice for two reasons the trial named; both were fixed.

## Corpus, performance and the mutation harness (0.1.0)

Twelve public repositories indexed end to end: cold build from 5.9 s (spring-petclinic, 1 040 commits) to 2.9 min
(typeorm), peak RSS up to 1.5 GB, median query 83–312 ms. The mutation harness plants a violation of a mined convention
in a real file and asks `check` to catch it: 73 of 76 detected, 0 false fires; the three misses sit at 7.0–7.8 : 1
odds, below the 8 : 1 the loss constant demands. 25 hostile repositories degrade without a crash. `how` against a grep
baseline: median precision 0.154 vs 0.033, F1 0.223 vs 0.064, at lower recall (0.442 vs 1.0). The full tables are in
`docs/validation.md`.

## Field testing, 0.2.0 → 0.3.0

- **0.2.0**: a field report exposed six data-integrity bugs — generic type arguments recorded as phantom base types,
  constructors classified as types by a raw substring match, a lexical collision ranked with full confidence.
- **0.2.1**: eighteen agents, one per supported language, hunted grain on real public repositories: **22 real bugs**,
  among them a stack overflow on deeply nested expressions that lost whole review batches, a nonexistent `--repo` path
  silently turned into a fabricated empty index, non-ASCII filenames dropped, a symbol literally named `constructor`
  zeroing a repository's architecture graph, and counts inflated 35× by double-counted ambiguous members.
- **first 0.3.0**: four rounds across thirteen languages, 53 tracked issues, 41 closed, each fix verified by reverting
  its own hunk to red. `selftest --where` was added and reported that `where` **loses to a plain path-match baseline on
  seven of eight repositories**. That number is the reason the harness exists.

The pattern behind all three: every language tested for the first time produced high-severity defects on first
contact, and three fabricated-supertype bugs were found three separate times by chance. That is why the next step was
instruments, not more hunting.

## Seven failure classes, one instrument each (this build)

Fabrication, silence, surface disagreement, undisclosed limits, ranking, scale, question reach. Each has an instrument
that measures the whole 25-repository corpus (19 code grammars, SHA-pinned in `tests/stress/corpus.json`) and stays in
CI. First full run, 2026-09-02:

- **Claim auditor**: 0 new defects in C, C++, C#, Java, JavaScript, TypeScript, Go, PHP, Ruby, Scala; **three
  high-severity fabrication classes** in Python (dotted heritage), Kotlin (`by`-delegation delegate as supertype) and
  Rust (`'static` lifetime as trait) — all fixed in this build.
- **Declaration recall** against the grammar's own `node-types.json`: 0.74–1.00 per grammar; the gaps are named
  (C# auto-property accessors the oracle over-counts, TypeScript test-callback capture).
- **Disclosure fixtures**: 10 of 10 contracts hold; `selftest 0/0/0/0` now says why, coverage notes no longer certify
  absence, a secondary grammar with zero edges is disclosed instead of silent.
- **Scale ladder**: Symfony's full history (82 946 commits) completes every command loudly; cold build 33.1 → 24.1 min
  after a cache-shard fix. Silent process death (the pre-0.3.0 failure) is gone.
- **Command reachability**: 63 of 63 agent calls to grain went to commands named in the session-start advertisement,
  0 of 63 to the twelve that were not. A command an agent is not told about does not exist.

## The question catalog (this build)

Nineteen paired agent runs on five repositories, 1 277 tool calls, reduced to nineteen question types. An agent
spends a mean of 39 tool calls before its first write — 99 on realistic tasks, 61% of the run. That is the market.
Grain's grade against it: 5 types answered well, 3 partially, 1 worse than grep, 5 not at all. Of sixteen commands the
agents used two. The gap in one sentence: grain is good at "what does existing code look like" and absent at "what does
this repository require of me".

## Direction work (this build), every result on record

| question | result | shipped |
| --- | --- | --- |
| `where` on queries that name a symbol | hit@3 +0.184 across 12 repositories, one tuned constant deleted | yes |
| obligations from history ("adding a file under this module and suffix also touches O") | precision 0.958, coverage 0.048; two attempts to raise coverage rejected on precision | yes, disclosed |
| co-change promoted above lexical matches in `where` | only ever surfaces the repository's hub file | **no** |
| a `where` answer for a directory that does not exist yet | no mineable signal in history | **no** |
| obligation support floor 3 instead of 5 | precision falls below the bar | **no** |

## Paired trials on this build

Same task, same repository, one arm with grain and one without; metrics: tool calls before the first write, grain
calls by command, whether any answer changed the diff.

| trial | runs | grain calls per run | pre-write calls | diffs changed by a grain answer |
| --- | --- | --- | --- | --- |
| A, after the adoption fixes | 13 | 1 → 11 | +0.7 (noise floor sd 47) | **0** |
| B, after `obligation` became reachable | 12 | `obligation` 0 → 4, 6 of 16 commands used | −0.08 | **0** |

Trial B also probed fourteen guaranteed-new paths across six repositories directly: `obligation` certified nothing on
any of them, and the pre-write hook was silent on all fourteen writes.

## Why zero, as far as it is understood

1. **The tasks were easy.** About sixteen pre-write calls; the agent without grain got them right (placement identical in
   five of six pairs). An answer cannot improve a diff that is already correct. The realistic ~99-call runs, where
   agents flounder, were never put through the paired harness.
2. **Mechanisms were fixed instead of runs being dissected.** After each trial a ticket went to whatever the trial pointed
   at; nobody asked, run by run, where the agent went wrong and what one sentence at that moment would have turned it.
3. **A structural hypothesis, consistent with all five trials since August:** an agent does not ask questions it does not
   know it has. An oracle that must be asked loses to grep on timing, not on knowledge. The one effect ever observed
   came from a note that spoke first.

## What this means if you install it

Every answer grain prints is checked by instruments and is, as far as measured, true; where it cannot see, it says so.
It will not make your agent faster or its diffs better on ordinary tasks — that was measured and it did not. It may
help on the tasks nobody measured. Treat it as a portfolio of engineering and measurement, not as a productivity tool
with evidence behind it.

## Open

- A paired trial on hard tasks, selected because the agent *without* grain demonstrably fails, with a per-run
  counterfactual table before any capability is built.
- The product form: a guard that acts at write time ("you are writing X; this repository does Y") instead of an oracle.
- Obligation precision at support floor 4; `where` with a path as the query.
