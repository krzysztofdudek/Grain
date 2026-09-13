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

## Feature-fingerprint lab (149–158), research on an extension — negative on the headline claim

The question behind these rows came from the AI Software House research (`.system/research/ai-software-house-*.md`):
can the deviation of a change from the environment it lands in — bits under the repository's own model, novelty of
identifiers and file shapes, Grain's convention and co-change instruments, the coupling between the change and
its brief — be measured as a "fingerprint" that says whether the change is defective or undelivered? Measured on
public repositories only, with every model built from history at or before a cutoff and labels taken only from
fixes after it. The harness and the run record are in `tests/stress/fingerprint/`; the full account, negatives
first, is [`.system/research/fingerprint-lab-2026-09-13.md`](../.system/research/fingerprint-lab-2026-09-13.md).

| # | instrument | question | method | numbers | verdict |
| --- | --- | --- | --- | --- | --- |
| 149 | naive surprise | Do bits per byte of the added lines under a zstd dictionary trained on the repository at the cutoff predict a later fix, beyond the ten just-in-time baseline features? | 9 repositories, 8 languages; first-parent landings; cutoff at 70% of history; SZZ-lite labels with provenance; 5-fold logistic regression, AUC, paired bootstrap. | All landings: jit **0.802** → +zstd **0.843** (wins 8/9) — an artifact, the surprise features encode "no code added". Code landings only: jit **0.684** → **0.703** (median Δ −0.006, wins 3/9, CI>0 0/9). Raw bits/byte alone: AUC **0.303**, i.e. the *more compressible* a change, the more often it is fixed — because larger additions compress better and break more. | **Negative.** The naive fingerprint is a re-encoding of size. |
| 150 | size-controlled surprise | Once size is held fixed — fixed-length 512-byte chunks against the cost of the repository's own chunks, residuals on log size, module and self dictionaries, a token trigram — does any compression measure carry signal? | Same corpus; single-feature AUC raw and after removing the least-squares line on log lines added; leave-one-repository-out transfer. | Lines added alone: AUC **0.745** single, **0.724** as a model, **0.745** in transfer — beating the ten-feature baseline (0.684 / 0.739). Chunk excess: 0.668 raw, **0.543** size-adjusted, 0.547 among landings with ≥512 bytes; size + chunk excess vs size: **−0.002** (wins 4/9, CI>0 0/9), transfer +0.002. Every other variant ≤ +0.014 with no CI above zero. Issue-linked labels and a tenfold L2 penalty: same picture. | **Negative.** No compression-based measure carries more than ~0.04 AUC above chance once size is removed, and none adds to a size-only model. |
| 151 | brief-to-code coupling, change-shape novelty | Is code the brief does not explain fixed more often? Is a file set without precedent fixed more often? | Brief = commit message plus, for a merge, the messages it brought in; identifier-level (unigram bits the brief pays for) and byte-level (1 − bits(code|brief)/bits(code)) coupling; shape novelty against up to 4000 earlier commits. | Byte-level coupling: AUC **0.386** (inverted as the thesis predicts: explained code is fixed less), size-adjusted 0.477; identifier coverage 0.440 / 0.526. Transfer: size **0.745** → size + brief **0.754** (+0.009, wins **8/9**); within-repository training loses it (0.698). Shape novelty: 0.586 alone in transfer, all features ≤ 0.46 after size adjustment — file count in disguise. | **Interesting, small** (brief); **negative** (shape). The one component that is size-independent, points the expected way and transfers — at about +0.01 AUC. |
| 152 | locator | Inside a defective landing, does surprise point at the file the fix blamed? | 176 labeled landings with ≥2 code files and a proper subset blamed; the landing's files ranked by surprise, self-surprise, size, prior change count; hit@1 against chance. | Chance hit@1 **0.34**; surprise **0.27** (within-landing AUC 0.44); self-surprise 0.33; size **0.48** (0.63); prior changes 0.42 (0.55); inverse surprise 0.35. The one repository where surprise works (sinatra, 23 landings, hit@1 0.57) is the one where no dictionary could be trained. | **Negative.** The fix lands in the largest, busiest file; per-byte surprise falls with size and points away from the fault. |
| 153 | missing file, popularity-matched | Is a co-change partner Grain named and the landing did not touch, touched — and fixed — later more often than a comparable file? | 808 landings, 2035 partners, window 50 landings; controls: a random same-directory file, and the file anywhere in the repository with the closest change count before the cutoff. | Partner: touched later **0.50**, by a later fix **0.16**. Random neighbour: 0.41 / 0.09. Popularity-matched control: **0.58 / 0.16**. Partner as a marker of the landing: defect rate 0.130 with vs 0.133 without, size-adjusted odds ratio **1.09** (issue-linked labels 1.28), per-repository 0.28–2.92 in both directions. | **Negative.** The partner's lift over a random neighbour is entirely its popularity. A useful reminder, not evidence of incompleteness. |
| 154 | window drift | Is a period's mean surprise a leading indicator of that period's fix share? | Landings after the cutoff cut into windows of 40 (and 30); Spearman of the window's mean chunk excess with its fix share, pooled after per-repository standardization, partial on the window's mean size and share of large landings. | 39 windows: **+0.46** raw, **+0.38** partial on size, **+0.29** partial on size and large-landing share; 53 windows of 30: +0.31 / +0.23 / +0.16. | **Underpowered, not a result.** Shrinks as windows multiply; kept as a suggestion for a corpus with power. |
| 155 | same-issue return | Can "the work came back" (a later landing referencing the same issue number within 200 landings) serve as a delivery label? | Issue references parsed from messages; label = same number referenced again later. | 8 of 9 repositories have fewer than 8 such cases; sinatra 17 of 213 (0.08) with no feature above AUC 0.58. | **Unmeasurable here.** A delivery label needs an issue tracker or the evidence layer, not history. |
| 156 | replication | Do 150–153 hold on six more repositories (click, requests, koa, mux, logrus, serde json), and on all fifteen pooled? | Same pipeline, same cutoff rule, same analyses; 15-repository leave-one-out transfer. | mux (3 positives) and serde json (6) fall below the 8-positive floor; 13 usable repositories, 2483 code landings, 361 positives. Four new usable repos: size **0.707 / 0.721** (within / transfer), jit 0.667 / 0.682, size + chunk excess 0.702 / 0.724, size + brief 0.701 / 0.726, shape 0.543 / 0.560. Fifteen pooled, transfer: size **0.737**, jit 0.732, size + chunk excess 0.741, size + brief **0.747** (wins **10/13**), brief alone 0.726, shape 0.581; within-repository: size 0.719, size + brief 0.699. Issue-linked labels: size 0.729 → size + brief 0.738, size + chunk excess 0.739 in transfer. Locator over 231 landings: chance hit@1 0.36, surprise **0.31**, size 0.47, prior changes 0.49. Missing file over 1250 landings / 3049 partners: partner 0.59 / 0.17, random neighbour 0.46 / 0.08, popularity-matched **0.60 / 0.17**; partner-as-marker odds ratio **1.03** over 2575 landings. Window drift: 70 windows of 30, +0.25 after size controls. | **Confirmed: no verdict moves.** The brief-coupling gain stays at +0.010 in transfer and still loses within-repository; size-controlled surprise gains +0.004 (+0.010 on issue-linked labels) with no confidence interval above zero; surprise still points away from the blamed file; the partner is still its popularity; window drift stays at the edge of significance on non-independent windows. |
| 157 | evidence carried by the landing | Is a landing that adds code without a test line, or removes assertions, fixed later more often? | Test lines, assertion lines added/removed from a diff of the landing's test files; defect rate with vs without each marker and its size-adjusted odds ratio, 13 repositories, 2705 code landings. | No test line added: rate 0.082 vs 0.195, size-adjusted OR **0.62** — the opposite sign. Any test touched: OR 1.59. Assertions removed: OR 1.39, **1.15** within landings that touch tests. Net test-line removal: 1.10, signs mixed. | **Negative as a risk marker; positive as an interpretation.** On public history "carries tests" means "adds behaviour", and behaviour is what gets fixed; the fix label sees exposure, not protection. |
| 158 | diff coverage | Does new code that no test executes come back as a fix? | `go test -coverprofile` / coverage.py at every code landing of chi, gin (100 sampled), mux, logrus, click; share and count of added statement lines no test executed; landings with statement lines only. | 470 landings run, 293 with statement lines, 278 usable (66 positives). Unobserved share: AUC **0.489** (0.523 size-adjusted); "has unobserved statements": OR **0.83** after size (issue-linked labels 0.78; per repo 0.30–1.59). Transfer: size 0.706 → size + coverage gap 0.706. | **Negative, underpowered, wrong sign.** An evidence policy cannot be graded from commit history at all; it needs the house's own labels (returns, incidents attributed to a bundle, reopened promises). |

**What this means, read across the table.** The fingerprint idea, as stated, does not survive contact with real
history: every byte-level deviation measure is size in disguise, and size — lines added — is the strongest single
predictor here as in the literature (LApredict, AUC ≈ 0.71 within project). What survives is one small,
size-independent, transferable component: code that its brief does not pay for is fixed more often. That is
enough for a soft explainability gate in the house design ("this bundle's brief does not explain its code — back
to the brief"), not for a proof of defect or delivery, and it says nothing about delivery at all, for which no
label can be read out of a repository. Grain's own instruments are not a fingerprint either: conventions are
silent on most landings and a co-change partner is exactly as predictive as any file that changes as often. The
changed concept — evidence instead of code — does not pass through history either (157, 158): a "later fix" label
measures exposure of new behaviour, not protection by tests, so an evidence policy can only be graded with labels
the house makes itself. The design consequence is recorded in the research memo: a bundle-size policy with an
origin, a soft brief-coupling gate, no fingerprint gate, no coverage gate justified by history.

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
