# Validation

Grain's own claims are held to grain's standard: every number below comes from a run that can be repeated, negatives
are reported beside wins, and anything unverified says so. The harnesses live in `tests/stress/`; the engine's test
suite (916 tests, one file per ported case) runs in CI on node 22 and 24 on every push.

## Truth audits

Two independent sessions, each with no context beyond the tool's path and the instruction to be adversarial,
re-verified grain's printed claims against the repositories with find, grep and git only.

**Audit 1** (before the mathematical rebuild): 15 claims sampled, 13 exactly true, 2 true but imprecise, 0 false.

**Audit 2** (after the rebuild; 39 claims across every surface, including superposition lines, templates, the history
bridge and held since dates): 28 exact, 8 true but imprecise, 2 unverifiable, and **one false class**: deviant counts
were taken over the raw population while the percentage beside them came from the survived population, producing the
self contradiction "100% of 29 established, 6 deviants" verbatim. Fixed at the source the same day (one population
per printed number), and the audit is the reason. The same audit recorded grain out-verifying the auditor once: it
named the single real deviant of an import convention where the auditor's grep had been fooled by a comment.
The true but imprecise findings (group labels naming a minority feature, an undisclosed recency window on the agent
share, a co-change denominator a reader could not reproduce) were each fixed the same day.

## Agent trials

Three A/B trials on a private production monorepo (TypeScript, backend, frontend and e2e suites) whose history begins
after the worker model's knowledge cutoff, so nothing was memorised. Each trial replays real tasks from the
repository's own history: the worker agent gets the task prompt in a clean checkout, with the plugin in one arm and
without it in the other, and both diffs are scored 0 to 5 against the diff the repository's author actually shipped.
The engine under test is frozen by `git archive` before each trial.

**Trial 1** (session start advertisement only): the worker never called grain in any arm. The index was right; probes
run afterwards named the exact directory and the exact component both arms got wrong. A correct oracle that waits to
be queried never reaches the code.

**Trial 2** (plus the post edit check hook): zero notes delivered across 27 edited files, verified three independent
ways to be correct silence; the worker's edits matched every certified convention. The lesson: line level checks are
structurally blind to the failure class the trials actually exhibit, which is placement.

**Trial 3** (plus placement on create): four notes delivered, and the worker moved four files it had misplaced,
writing "Following grain's placement signal" into its own transcript. The first demonstrated effect of grain on a
diff. The move still landed off the author's choice for two reasons the trial named precisely, and both are fixed in
the released build: notes arrived after the write (they now arrive before it, on the PreToolUse hook, while changing
the directory is still free) and competing name kin spoke sequentially with contradictory targets (they now argue
inside one note, strongest count first). A stated boundary remains: a feature that only extends existing modules
creates its files beside their namesakes and draws no placement note.

Noise cost measured in all three trials: zero irrelevant notes, no repeats past suppression, no wasted turns.

## The corpus

Twelve public repositories, indexed end to end by `tests/stress/run-corpus.mjs`: cold build from full history, warm
queries, an incremental refresh after one commit, a divergent checkout, and the mutation harness. Machine: one
laptop, no parallelism.

| repo | commits | cold build | peak RSS | median query | cache |
| --- | --- | --- | --- | --- | --- |
| spring-petclinic | 1 040 | 5.9 s | 392 MB | 83 ms | 13 MB |
| CleanArchitecture | 937 | 4.1 s | 298 MB | 94 ms | 6 MB |
| chi | 823 | 7.1 s | 292 MB | 107 ms | 6 MB |
| gin | 2 007 | 22.4 s | 406 MB | 110 ms | 17 MB |
| axum | 1 982 | 23.4 s | 435 MB | 105 ms | 23 MB |
| express | 6 163 | 26.7 s | 460 MB | 89 ms | 37 MB |
| flask | 5 556 | 37.7 s | 520 MB | 93 ms | 36 MB |
| sinatra | 4 684 | 41.4 s | 418 MB | 111 ms | 29 MB |
| Slim | 4 569 | 44.3 s | 487 MB | 109 ms | 32 MB |
| nest | 21 648 | 55.7 s | 1 119 MB | 300 ms | 79 MB |
| okhttp | 6 444 | 2.8 min | 1 021 MB | 170 ms | 141 MB |
| typeorm | 6 052 | 2.9 min | 1 483 MB | 312 ms | 117 MB |

The cold build is the explicit `refresh`, which deliberately keeps V8's optimising compiler; queries re-run under the
baseline compiler and answer in 0.08 to 0.31 s across the corpus. The post edit hook is one warm check, about 0.12 s.

## The mutation harness

For each mined convention the harness takes a real conforming exemplar, plants a violation in its source (removes the
decorator, renames against the shape, injects the forbidden import), and asks `check` to catch it. The harness holds
itself to a contract: a mutation that breaks the parse (proved by re-extraction with the scope's node type intact)
counts unsupported, not missed; a fact that does not actually govern its exemplar before the mutation (an ambiguous
member sits outside role governance by design) counts unsupported; and the firing odds run on the same population the
accusation prints.

| repo | detected | missed | false fires |
| --- | --- | --- | --- |
| nest | 26 | 2 | 0 |
| flask | 13 | 0 | 0 |
| typeorm | 13 | 1 | 0 |
| CleanArchitecture | 6 | 0 | 0 |
| spring-petclinic | 4 | 0 | 0 |
| Slim, okhttp | 3 each | 0 | 0 |
| express, gin | 2 each | 0 | 0 |
| axum | 1 | 0 | 0 |
| chi, sinatra | 0 plantable | 0 | 0 |

**Total: 73 of 76 detected, 0 false fires.** The three misses are not defects but the loss constant made visible:
all three cells sit at 7.0 to 7.8 : 1 odds, below the 8 : 1 that λ demands before grain accuses an instance
(see [mathematics.md](mathematics.md)). Lower the constant and they fire, at the price the constant exists to refuse.

## Hostile repositories

`tests/stress/edge-cases.mjs` builds 25 hostile repositories and asserts the contract "degrade, never crash, never
lie": an empty repository, commits with no code, a shallow clone, no git at all, detached HEAD, symlinks, huge and
non UTF-8 files, mass renames, submodules, two cold queries racing, a file outside the repository, a deleted file, a
brand new untracked file. 25 of 25 pass; every answer exits cleanly and carries its `as of` stamp.

## Known boundaries

Stated, not hidden: a feature extending existing modules draws no placement note (name kin already live beside it);
markdown documents are not indexed, so misplaced docs are invisible; after the removal of the test axis a test file
can outrank the source it tests in `where` for a source intent (the source hit survives in the top three, and the
skill tells the agent to take it); cold builds of very large repositories cost minutes and around 1.5 GB RSS; and
`where` closes no semantic gaps by itself, which is what the compact map and the history bridge are for.
