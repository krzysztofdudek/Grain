# Results

This is the complete measured record of grain, negatives first. It exists because the README's evidence section was
written while the project was moving; this page is written at the point where it stopped. Development paused on
2026-09-02. The build released as **0.3.0** is the one that was developed under the working number 0.4.0 — the
internal research documents under `.system/research/` keep that working number, and nothing in them was edited to
match the release.

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
