# Validation

Grain's own claims are held to grain's standard: every number below comes from a run that can be repeated, negatives
are reported beside wins, and anything unverified says so. The harnesses live in `tests/stress/`; the engine's test
suite (2962 tests under engine 6.1.0 — `node --test` over `tests/*.test.mjs` plus the relations sub-suites,
one file per ported case) runs in CI on node 22 and 24 on every push; `grain selftest` and `grain selftest --how`
(below) are the two of those checks any user can also run, unmodified, against their own repository.

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

Measured under engine 0.2.0, one machine, one point in time — not a ceiling and not current: grammar support added
since (JSON/YAML/TOML, `.properties`) walks and parses more files in every cold build by construction, so a run on
a later engine reads higher than the row above for that reason alone, before any other machine difference is even
considered (see Known boundaries below for the one direct remeasurement taken, and a same-repo cross-check on a
later engine and a different machine).

The cold build is the explicit `refresh`, which deliberately keeps V8's optimising compiler; queries re-run under the
baseline compiler and answer in 0.08 to 0.31 s across the corpus. The post edit hook is one warm check, about 0.12 s.

## The mutation harness

`grain selftest` runs this exact procedure against the repository it is called in — the numbers below are what
`tests/stress/run-corpus.mjs` recorded running the same harness on the twelve public repositories above; a
maintainer can reproduce the shape of this table on their own repository with one command. For each mined
convention the harness takes a real conforming exemplar, plants a violation in its source (removes the
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

## False certifications under a null

The mutation harness counts false fires; `grain selftest --null` counts false certifications. Each family of claims is re-run on a copy of the repository's own evidence where the link it claims has been destroyed and its marginals kept. The role labels and the directory each scope is read in are dealt out again within each scope kind. The out-edge sets are dealt out among the files that have one. The commit × file matrix is swap-randomised (curveball trades keep every commit's size and every file's commit count, and a file's birth flag and touched scopes travel with it). The commit message tokens are dealt out among the commits. Whatever a family still certifies is false by construction. The history families are counted over the retained footprints in both arms, so their real column can differ from what the shipped model prints.

Measured 2026-09-25 on two repositories of the family, 3 runs each with seeds 1 to 3, on the same model and history. "Before" is the 6.1.0 mathematics; "after" is this build. Cells read *real · null mean per run (runs)*.

| family | Grain before | Grain after | Yggdrasil before | Yggdrasil after |
| --- | --- | --- | --- | --- |
| role conventions | 22 · 0 | 22 · 0 | 34 · 0 | 39 · 0 |
| directory conventions | 12 · 0 | 12 · 0 | 4 · 0 | 13 · 0 |
| architecture norms | 4 · 12.7 (10, 12, 16) | 15 · 0 | 9 · 19.7 (21, 19, 19) | 34 · 0 |
| of which absences | 3 · 12.7 | 2 · 0 | 8 · 19.7 | 23 · 0 |
| birth obligations | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 |
| co-change partners | 20 · 6.7 (6, 8, 6) | same | 392 · 191 (202, 187, 184) | same |
| commit-archetype cells | 38 · 39.3 (45, 32, 41) | same | 96 · 39 (39, 43, 35) | same |
| language bridge | 1 · 0 | 1 · 0 | 10 · 0 | 10 · 0 |
| **total under the null** | **58.7** | **46** | **249.7** | **230** |

The target is at most one false certification per repository across all families. This build does not meet it, and the table says where:

- **Architecture norms met it.** Under the old flat 50/50 coin, shuffled edges certified more absence norms than the real edges did (12.7 against 3 on Grain, 19.7 against 8 on Yggdrasil). The two-population contrast certifies 0 on shuffled edges in every run on both, and 0 over 20 further permutations each. It now certifies boundaries nobody has crossed, such as `tests/e2e -/-> src/model` on Yggdrasil (0 of 77 against 323 of 807 elsewhere), which the old candidate universe could not contain.
- **Role and directory conventions, obligations and the bridge were already at 0**, and the group and directory absences the contrast now certifies in place of the 30% floor (five more role cells and nine more directory cells on Yggdrasil) stay at 0.
- **Co-change was not** under 6.1.0. A partner was named on a raw confidence share (a third of the edited file's commits), and two files that are each touched often co-occur often by chance: 191 pairs a run on Yggdrasil, half the real count. The base-rate contrast below takes that to 3.67.
- **Commit archetypes are not.** An archetype's cells are chosen by the clustering and then certified on the same footprints, so a shuffled history yields about as many certified cells as the real one on Grain (39.3 against 38) and 39 against 96 on Yggdrasil. The contrast is paid twice on the same data. Corrected by issue 357, below: *Commit archetypes, held to a test the clustering does not decide*.

The mutation harness on the same two repositories, after the change: Grain 7 of 7 planted deviations caught, 0 false fires (6 of 6 before); Yggdrasil 25 of 25 caught, 0 false fires (14 of 14 before). The extra plantable cases are the directory absences the contrast now certifies.

### Co-change, value norms and the deviation fix rate (issues 258, 259, 260)

Measured 2026-09-26 on the same clones, 3 runs each with seeds 1 to 3, after the history re-walk the scope population counter needs. Two new families enter the harness: value norms, whose members are given at random to as many declaring files as carried each, and deviation fix rates, whose fix flags are dealt out again among all modification events. Their "before" column is this build's harness with the 6.1.0 mathematics for those two cells (a flat 50/50 coin for value norms, "the scope ever had a fix" for the deviation cell). The second learn pass per run consumes the random source, so the curveball history differs from the table above; the commit-archetype cells, unchanged by this build, read 37.33 on Grain and 46.67 on Yggdrasil under it. Express and typeorm are public corpus repositories (`9a34acf`, `f279fd1`), "before" there being the 6.1.0 engine.

| family | Grain before | Grain after | Yggdrasil before | Yggdrasil after | express before | express after | typeorm before | typeorm after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| co-change partners | 20 · 6.7 (6, 8, 6) | 19 · 0 (0, 0, 0) | 392 · 191 (202, 187, 184) | 199 · 3.67 (2, 7, 2) | 71 · 7.67 (8, 6, 9) | 85 · 0.33 (0, 1, 0) | 48 · 10.67 (9, 14, 9) | 37 · 12 (14, 13, 9) |
| value norms | 2 · 2 (2, 2, 2) | 1 · 0 (0, 0, 0) | 1 · 1 (1, 1, 1) | 1 · 0 (0, 0, 0) | not counted | 0 · 0 | not counted | 0 · 0 |
| deviation fix rate | 0 · 0 | 0 · 0.33 (0, 1, 0) | 0 · 0 | 1 · 0 (0, 0, 0) | not counted | 0 · 0 | not counted | 3 · 0 (0, 0, 0) |

- **Co-change.** A partner is now named for the edited file's direction only, when its rate over that file's commits beats its own rate over all commits by the obligation cell (mathematics.md, *Co-change partners*). The null drops to 0 on Grain, 3.67 on Yggdrasil and 0.33 on express. It does not on typeorm, 10.67 → 12: a repository that commits many files at once makes any two busy files co-occur above their base rates, because the base rate ignores commit size. The target of at most one false certification per repository is still not met for co-change: 3.67 a run on Yggdrasil and 12 on typeorm. The prospective measurement below is the one that decided the gate. The commit-size base rate (issue 366, below) takes both to 0.
- **Value norms.** Under the flat coin, shuffling the members among the declaring files certified every norm the real data certified, 2 of 2 on Grain and 1 of 1 on Yggdrasil: they were schema keys every declaring file carries, complete whatever the joint structure. Against independence, the shuffle certifies nothing. Of the four schema-key norms the research counted, three stop certifying (`$.scope` `per`/`file` on both, and `$.relations` `target`/`uses` was already gone at this snapshot). `$` `description`/`name` on Grain survives at 4.5 bits instead of 145.4: 175 of 177 qualifying files complete against 0.889 under independence. Yggdrasil gains one: twelve keys of `$.node_types.leaf`, 8 of 8 complete against 0.061, all in copies of one test-fixture architecture file. The twelve corpus repositories measured certify no value norm before or after, so the survivors the research expected (enum and switch sets in code) could not be inspected here.
- **Deviation fix rate.** The old per-scope label with its 7-of-8 bound certified no claim on any of the 14 repositories below. Per edit, 4 claims certify (1 on Yggdrasil, 3 on typeorm), and the fix-label shuffle certifies 0.33 a run on Grain and 0 elsewhere. Each surviving claim was checked against the popularity-matched control of result 153: every deviant paired with the non-deviant scope of the same fact with the nearest edit count. Deviant edits were fixes at 0.80, 0.39, 0.26 and 0.18; the matched controls at 0.27, 0.00, 0.06 and 0.05, and the whole populations at 0.32, 0.04, 0.07 and 0.05. The matched control shows no lift over the population, so none of the four is exposure. The deviants are not the hottest scopes either: their median edit count is 0, 7, 0 and 1 against 0, 6, 2 and 3 in the population. The per-edit bound treats edits as independent, and edits cluster within scopes, so the note now says how many deviants the fix edits fell on (issue 368): on Yggdrasil 12 fix edits in 12 of 47 deviants; on typeorm 9 in 3 of 5, 9 in 7 of 44 and 96 in 80 of 318. The first typeorm claim rests on three scopes. No scope-level bound is applied.
- **Pair cap.** The model keeps the 5000 file pairs with the most support and pays the co-change index cost over them; the null harness used to pay it over every pair it rebuilt. Both now keep the same 5000 (issue 368). No repository measured stores more than 976 pairs (typeorm), so no number on this page moves.

The mutation harness after this build: Grain 7 of 7 planted deviations caught, Yggdrasil 25 of 25, 0 false fires on both.

### Commit archetypes, held to a test the clustering does not decide (issue 357)

The in-shape contrast now only makes a cell a candidate. A candidate is certified when, over every commit of the history that carries the shape's other candidates in files of their own, the files left over touch it more often than as many files drawn from the history's anchor-free touches would (mathematics.md, *Commit archetypes*). Measured 2026-09-26 on the same clones, the harness with 3 runs and seeds 1 to 3; "before" is this harness's run on the build of issues 258 to 260.

| repository | archetype cells, before | after | all families under the null, before → after |
| --- | --- | --- | --- |
| Grain | 38 · 37.33 | 23 · 0.67 (2, 0, 0) | 37.66 → 1 |
| Yggdrasil | 96 · 46.67 | 36 · 0 (0, 0, 0) | 50.34 → 3.67 |
| express | 208 · 112.33 | 105 · 0 (0, 0, 0) | 112.66 → 0.33 |
| typeorm | 172 · 76.67 | 27 · 0 (0, 0, 0) | 88.67 → 12 |

The harness consumes its random source in two learn passes before it shuffles the history, so it can only be run on a repository that is fully learned. For a wider view the certification alone was re-run on ten repositories, each on the real footprints and on five swap-randomised copies (seeds 1 to 5), without the learn passes. Cells read *real · null mean per run*.

| repository | footprints | 6.1.0 | this build |
| --- | --- | --- | --- |
| Grain | 445 | 38 · 36.4 | 23 · 0 |
| Yggdrasil | 1427 | 96 · 49.8 | 36 · 0 |
| express | 5675 | 208 · 122.4 | 105 · 0 |
| typeorm | 5035 | 172 · 80.6 | 27 · 0 |
| koa | 1132 | 75 · 82 | 15 · 0.4 |
| flask | 3808 | 192 · 134.8 | 59 · 0 |
| click | 2163 | 98 · 93.6 | 34 · 0.2 |
| gin | 1798 | 83 · 98.8 | 10 · 0 |
| CleanArchitecture | 835 | 77 · 53 | 20 · 0 |
| Slim | 3291 | 167 · 150.8 | 32 · 0 |

The target of at most one false certification per repository is met for commit archetypes on all ten: the worst single run is 2 cells (Grain in the harness, koa once in five). What 6.1.0 certified beyond its own null (real minus null) was about 2 cells on Grain, 46 on Yggdrasil, 86 on express, 91 on typeorm, 57 on flask, 24 on CleanArchitecture and 16 on Slim; on koa and gin the null certified more than the real history. This build certifies more than that excess on seven of the ten, and less on typeorm (27 against 91) and Yggdrasil (36 against 46). The certified cells read as co-change: on Yggdrasil the unit tests with the code under test (342 of 389 commits against 0.66 expected), root Markdown files with source and test changes, the `.cursor/rules` files with the CLI's own files; on Grain the tests with the engine (123 of 139 commits against 0.37 expected) and an issue's JSON with its Markdown. Fewer shapes are shown: 15 → 7 on Grain, 40 → 14 on Yggdrasil.

The three remedies the issue named, and two more, measured the same way (real · null mean per run, Grain, Yggdrasil, express, typeorm):

- **A permutation threshold, family-wise.** Seven swap-randomised copies (λ − 1, so a fresh null beats them all at most one time in λ), and a cell certified only above the largest bits any of them certified: null 1.33, 0, 0, 0, but real 11, 10, 2 and 3. The in-shape bits grow with the members (858 bits for one null cell on express), so the largest null cell sits above almost every real one.
- **A permutation threshold per cell** (the cell's own largest bits over the seven copies): real 23, 44, 44, 20, null 2.67, 1.33, 11, 7.67. Not shipped: the null stays above one on three of four.
- **Charging the selection in the code length.** Not built. A null cell earns 29 bits in a 28-member shape on Grain and 858 on express; a charge that does not grow with the members cannot absorb it, and one that does is the contrast itself.
- **The conditional test with a flat base rate** (the cell's share of all commits, ignoring how many files a commit leaves over; measured on an earlier form of the test population): null 0.33, 16.33, 1, 50. Commits that carry an anchor are bigger than most, and a big commit touches more by chance.
- **Sample splitting: members selected, the rest tested.** The shape's own members left out of the test population: null 0 on all ten repositories, but real 12, 10, 51, 14 (and 0 on koa), about half of what the whole-history test keeps. The whole history is shipped: its null is at most 0.4 a run on every repository, and it keeps twice the real cells.

The mutation harness after this build: Grain 7 of 7, Yggdrasil 25 of 25, express 2 of 2, typeorm 21 of 21 (21 of 21 before), 0 false fires on all four.

### Drift and nucleation as a change point in birth order (issue 256)

A fact's instances are ordered by the commit that bore them, each commit contributing one observation per distinct value, and a change point is certified when two KT codes split at a commit boundary beat one KT code by more than naming the boundary and one index cost over every fact that had a boundary to cut at (mathematics.md, *Drift and nucleation*). The 90-day windows are gone, with the four hand thresholds they needed.

- **A known migration.** typeorm renamed `@Table` to `@Entity` on 2017-01-13 (`82249a4`, "renamed all tables into entities and deprecated table decorator"). Three `@Entity` facts in its tests are cut exactly there in birth order: 0 of the 10 (and 0 of 9) entities born before the cut carry `@Entity`, 56 of 56 (and 77 of 78) born after do, at 22.4, 21.8 and 5.4 bits. No entity of those groups was born between the last birth before the cut and the rename, or between the rename and the first birth after it, so no cut can sit closer. In commits, those empty gaps are wide: the rename is 237 commits after the last birth before the cut and 61 before the first after it (32 and 183 for the relations directory). A fourth cut, on `extends TypeORMError` in `src/error`, falls at the commit that created the base error (`137bec7`, 2021-06-24, "refactor: create base error"): 0 of the 57 error classes born up to and including it extend it, all 3 born since do, 3.1 bits. The target of a cut within a few commits of a known migration is met in birth order; in commit order the resolution is the gap between two births of the same group.
- **Spot checks.** Grain: 6 facts carry a readable birth sequence, 0 change points. Yggdrasil: 14 facts, 0. express: no fact of the five value families the history decodes. flask, koa, CleanArchitecture, Slim, gin: 0. click: 1. Its test commands in `tests/test_basic.py` carried `@click.command` and `@click.option` for their first 18 births (2014 to 2016); the 5 born since 2018-09-13 carry `@click.group` and no option. The rule is marked fading and `check` stops accusing a new group command of lacking `@click.option`. That is right: the old rule would have been a false accusation.
- **Counted per birth instead of per commit, rejected.** One rename commit on typeorm (2026-03-23, #12244) generated 11 one-word `connection` accessors in the drivers, and per birth that made the drivers' camelCase method names "fading" (16 births since, 31% camelCase). Two naming-shape cuts over 1338 and 1878 births came from the same effect. Per commit, all three are gone and the four cuts above remain.
- **Young, fast repositories.** A 60-day fixture of 25 commits (`tests/rejected-values.test.mjs`) certifies nucleation that the windowed detector, with one window, could never see. On Grain, 32 days and 601 commits old at this clone, the axis now exists, and nothing on it has moved.
- The mutation harness is unchanged (above). `selftest --null` has no drift family: a change point claims an order, and the swap randomisation of commits keeps no birth order to destroy.
- **`check` stands down on a fading convention**, tested through `checkFile` (issue 383, `tests/fading-check.test.mjs`): a fixture that fades without any value nucleating accuses no new code under the convention, and the same file is accused once the fading flag is cleared.
- **Calibration still reads the calendar (issue 383, not done).** The change point moved to commits; calibration did not. It measures how often departures were later repaired, over departures between 365 and 30 days old (`calibHorizonDays`, `calibSettleDays`), and it does not run at all on a history shorter than 365 days. At these clones that rules it out on Grain (32 days) and Yggdrasil (219 days); the older corpus repositories can calibrate. Moving it to the commit axis needs a horizon and a settling time in commits, two new numbers nothing here measures, so it stays as it is and every `check` on a young repository accuses at the uncalibrated log₂ λ.

### Co-change partners, prospective

The protocol of maintainer note *obligations-design* §2, rebuilt: train on the oldest 80% of the retained footprints, score on the newest 20%, and for every file of a held-out commit of 2 to 40 files, name at most three partners and compare them with the files the commit really touched. hit@3 is the share of cases where one of the three was touched; "non-obvious" counts only companions outside the 10 hottest files of the training window; precision@1 is over the cases where anything was named. Pooled over 14 repositories (Grain, Yggdrasil, express, gin, flask, chi, sinatra, Slim, axum, CleanArchitecture, typeorm, koa, click, requests), 16 964 cases; the null count is the curveball null summed over the 14, mean per run, counted by the same harness over all partners it would name.

| gate | hit@3 | non-obvious hit@3 | precision@1 | named cases | null, summed |
| --- | --- | --- | --- | --- | --- |
| 6.1.0: max of both directions ≥ 1/3 | 0.215 | 0.105 | 0.443 | 0.375 | 454.1 |
| the edited file's direction ≥ 1/3, no contrast | 0.202 | 0.073 | 0.632 | 0.289 | 227.6 |
| **the contrast (this build)** | **0.228** | **0.107** | **0.501** | **0.380** | **175.3** |
| the contrast and a KT rate ≥ 1/3 | 0.185 | 0.073 | 0.624 | 0.270 | 21.4 |
| the contrast and a KT rate ≥ 1/2 | 0.151 | 0.051 | 0.699 | 0.206 | 7.4 |
| the contrast and the λ bound (7 of 8) | 0.025 | 0.009 | 0.965 | 0.026 | 0.7 |
| null: the 3 hottest files | 0.364 | 0.000 | 0.282 | 1.000 | — |

`grain selftest --cochange` now runs this protocol on one repository. The base rate in this table is per commit; the commit-size base rate that replaced it is measured below. The contrast beats the 6.1.0 gate on every accuracy column, pooled and per repository in most (hit@3 higher on 10 of 14, lower on 2; precision@1 higher on 9, lower on 4), and certifies 61% fewer partners under the null. It is not better everywhere on the null: typeorm 22.7 → 93.7, Slim 20.7 → 37.7 and flask 2.7 → 5.3 per run under this harness (the shipped `selftest --null` counts fewer, 10.67 → 12 on typeorm, because it counts only live partners). The λ bound the research proposed names a partner in 2.6% of cases and was rejected. A floor on the edited file's own rate cuts the null to about one per repository but loses a third of the non-obvious hits, which are the half of the answer co-change is for: the hub-to-test partners that only the reverse direction used to reach. The hottest-files null still has the higher hit@3, as under 6.1.0.

### Co-change base rate by commit size (issue 366)

The contrast above compared a partner's rate over the edited file's commits with its rate over all commits. A file committed with twenty others meets a busy partner in many of its commits by nothing but their size, so repositories that commit many files at once named partners the swap-randomised null named too. The base rate now accounts for commit size (mathematics.md, *Co-change partners*): the partner's share of the file touches the edited file leaves, over the edited file's mean number of other files per commit.

Measured 2026-09-26 with `grain selftest --cochange`, which runs the protocol above on one repository, on the same 14 clones and the same 16 964 cases. Each cell reads *base rate per commit → base rate by commit size*; the null counts every partner the cell names on 3 swap-randomised copies of the whole history (seeds 1 to 3), dead ones included.

| repository | cases | hit@3 | non-obvious hit@3 | precision@1 | partners named, real | null per run |
| --- | --- | --- | --- | --- | --- | --- |
| Grain | 418 | 0.246 → 0.246 | 0.013 → 0.013 | 0.912 → 0.912 | 49 → 42 | 0.67 → 0 |
| Yggdrasil | 2468 | 0.118 → 0.088 | 0.033 → 0.039 | 0.431 → 0.472 | 230 → 146 | 4.67 → 0 |
| express | 1942 | 0.404 → 0.402 | 0.053 → 0.046 | 0.685 → 0.682 | 310 → 305 | 0.67 → 0 |
| gin | 718 | 0.493 → 0.444 | 0.200 → 0.145 | 0.697 → 0.751 | 109 → 64 | 0.67 → 0 |
| flask | 1855 | 0.281 → 0.265 | 0.225 → 0.238 | 0.381 → 0.404 | 464 → 360 | 5.33 → 0 |
| chi | 223 | 0.224 → 0.220 | 0.086 → 0.086 | 0.543 → 0.557 | 59 → 42 | 0.67 → 0 |
| sinatra | 1181 | 0.233 → 0.237 | 0.204 → 0.204 | 0.476 → 0.468 | 296 → 293 | 12.67 → 5.33 |
| Slim | 706 | 0.065 → 0.057 | 0.041 → 0.041 | 0.347 → 0.317 | 566 → 342 | 37.67 → 2.67 |
| axum | 845 | 0.303 → 0.269 | 0.146 → 0.137 | 0.431 → 0.459 | 406 → 323 | 8 → 0 |
| CleanArchitecture | 373 | 0.064 → 0.062 | 0.033 → 0.033 | 0.321 → 0.340 | 80 → 65 | 5.67 → 0 |
| typeorm | 4103 | 0.175 → 0.169 | 0.096 → 0.093 | 0.447 → 0.462 | 1408 → 933 | 93.67 → 0 |
| koa | 311 | 0.090 → 0.071 | 0.030 → 0.030 | 0.198 → 0.150 | 29 → 20 | 0 → 0 |
| click | 808 | 0.345 → 0.333 | 0.150 → 0.186 | 0.470 → 0.464 | 285 → 187 | 4 → 0 |
| requests | 1013 | 0.145 → 0.172 | 0.116 → 0.120 | 0.536 → 0.425 | 207 → 216 | 0.67 → 0.67 |
| **pooled** | **16 964** | **0.228 → 0.217** | **0.108 → 0.108** | **0.503 → 0.512** | **4498 → 3338** | **175.0 → 8.7 (sum)** |

- **The null.** Summed over the 14, 175 partners a run → 8.7; typeorm 93.67 → 0 and flask 5.33 → 0. Slim keeps 2.67 and sinatra 5.33. Those are not what commit size explains: they are files that shared the few large commits of histories whose commits are mostly one or two files (`Slim/Exception/Pass.php` and `Stop.php`, sinatra's README translations), and 5 trades per commit do not move a file out of a 20-file commit when almost every trade partner holds one file. With 50 trades per commit the new cell names 0 a run on Slim, sinatra, typeorm and flask, and the base rate per commit still names 19, 2.67, 55 and 8.67. Both harnesses now make 50 trades per commit (*Curveball mixing*, below): the new cell then names 0.33 a run summed over the 14 (CleanArchitecture, one partner in one run), and the base rate per commit 118.3.
- **`selftest --null`, live partners only, 3 runs:** Grain 0 → 0, Yggdrasil 3.67 → 0, typeorm 12 → 0 (real 37 → 33), Slim 0 (real 48), flask 0.67 (real 234; one run named 2).
- **What the answer loses.** Pooled hit@3 falls from 0.228 to 0.217: 271 cases lose their hit and 81 gain one. In 201 of the 271, every partner that had hit was one of the 10 files the training window touched most. The non-obvious hit@3 is unchanged at 0.108, and precision@1 rises. The hits that go are the ones naming the busiest files, which the null that always names the 3 hottest files gets more of (0.364). Yggdrasil, whose commits carry 4.5 files on average, loses most (0.118 → 0.088) and gains in non-obvious hits and precision@1.
- **Rejected on the way.** Each commit's own size in place of the mean (hit@3 0.221, non-obvious 0.106, null 9.0 summed): no better on the null, worse on the non-obvious hits, and it would store a size histogram per file. The partner's own rate among commits of each size (hit@3 0.199, non-obvious 0.088, null 0): it explains away real partners that both favour large commits.

### Every commit weighs the same (issue 369)

Grain no longer reads who wrote a commit. Code last touched by an agent used to enter a convention's evidence at 0.15 of a person's weight, rising to full weight over 180 days, and a commit counted as an agent's when its author or a `Co-authored-by:` trailer named one. On a repository built mostly with an agent that discounted nearly all young code (95% of Yggdrasil's young code and 88% of Grain's counted as agent-written). Measured 2026-09-26 on the Yggdrasil clone above (`65bfb39`) and the Grain clone (`16581fb`), same history, before and after. Yggdrasil's "after" is this change alone; Grain's also carries the commit-size base rate below, which moves only its co-change row.

| measure | Yggdrasil before | Yggdrasil after | Grain before | Grain after |
| --- | --- | --- | --- | --- |
| conventions certified | 90 | 163 | 71 | 267 |
| role conventions · null per run | 39 · 0 | 84 · 0 | 22 · 0 | 125 · 9 (9, 9, 9) |
| directory conventions · null per run | 13 · 0 | 23 · 0 | 12 · 0 | 22 · 0 |
| mutation harness | 25 of 25 caught, 0 false fires, 65 unsupported | 35 of 35, 0, 124 | 7 of 7, 0, 64 | 23 of 23, 0, 239 |
| `selftest --null`, total per run | 3.67 (all co-change) | 3.67 (all co-change) | 1 | 9.67 |

On Yggdrasil the role and directory nulls stay at 0, so the conventions the discount used to hide are not ones a shuffled repository also yields. On Grain they are, in part: with the role labels dealt out again, 9 role cells certify in every run, the same 9 whatever the seed. They restate a partition's own majority at the level of one of its groups, in small partitions where almost every method has the value anyway: camelCase method names in `plugins/grain/tests` (85 of 87 members), in the Ruby relation unit tests (19 of 19, with three structural facts of the same 19) and in three groups of the root partition, and "does not call `runExtractor`" (28 of 28). The agent weight of 0.15 kept their evidence under the index cost; at full weight it clears it. That is a weakness of role cells that restate their partition, not of the weight; the next section fixes it.

### Partition-wide absences against the other partitions (issue 358)

A "never X" across a whole partition used to need X accepted as present in another cell of the partition and used by 10% of it, a declared floor. It is now contrasted with the same predicate in the repository's other partitions, the way the sub-gate lattice already did, and keeps the first requirement (mathematics.md, *Architecture norms*). Measured 2026-09-26 on the 14 clones, the partition-wide absences each learns (floor → contrast): Grain 2 → 2, Yggdrasil 0 → 1, gin 2 → 3, click 1 → 2, flask 2 → 1, typeorm 2 → 0, Slim 1 → 0, axum 1 → 0, the other six 0 → 0; 11 → 9 in all. None of the 11 survives the contrast. Among them are flask's source "does not use `@setupmethod`", a decorator only its source uses (10 to 17 times in each of three files), and typeorm's source "does not take a boolean parameter" and "does not return a string". Among the 9 that replace them, Yggdrasil's end-to-end test methods do not return a Promise, which methods in its other partitions do far more often. A repository cut into one partition states none, where the floor could. Dropping the second requirement as well (the contrast alone) gives 76, and falling back to the floor where there is no outside population 127; neither ships.

The same review's other points: the sub-gate band's direction test is now symmetric (a row other than an absence must carry its value more often than its reference; no row of the bands above moves); the band keeps its own index cost, because the certification's candidate count, one bit cheaper, grows it from 36 to 62 rows on Grain (mathematics.md, *The sub-gate band*); the λ bound in the band reads `CFG.lambda`; the absence tests' second index cost is kept and stated as deliberate; `shuffleLabels` has a test that group sizes, ambiguity counts, the assigned scopes and each kind's directories survive a shuffle.

### Curveball mixing (issue 386)

The swap-randomised history behind `selftest --null` and `selftest --cochange` is built by curveball trades between two commits. At 5 trades per retained commit, a file in one of the few large commits of a history made mostly of one-file commits rarely left it, because almost every trade partner holds a single file, so pairs from those commits survived the shuffle (Slim, sinatra). Measured 2026-09-26 on the same clones: the number of partners the co-change cells name under the null, mean over 5 runs (seeds 1 to 5), by trades per commit, and the time the 5 shuffles and counts took.

| repository · cell | 5 | 20 | 50 | 100 | 200 |
| --- | --- | --- | --- | --- | --- |
| Grain · shipped cell | 0 | 0 | 0 | 0 | 0 |
| Slim · shipped cell | 2.8 | 0 | 0 | 0 | 0 |
| sinatra · shipped cell | 3.6 | 0 | 0 | 0 | 0 |
| typeorm · shipped cell | 0.2 | 0 | 0 | 0 | 0 |
| Slim · base rate per commit | 39.4 | 19.8 | 17.2 | 18.2 | 13.4 |
| sinatra · base rate per commit | 13.6 | 1.4 | 1.8 | 2.8 | 1.8 |
| typeorm · base rate per commit | 88.6 | 60.2 | 52 | 59.4 | 61.6 |
| time for 5 runs, Slim · typeorm | 0.25 s · 1.1 s | 0.44 s · 1.3 s | 0.65 s · 2.3 s | 1.2 s · 3.3 s | 2.2 s · 5.4 s |

- **Where the counts settle.** The shipped cell reaches 0 at 20 trades and stays there; the comparison arm stops falling at 20 to 50 and then moves only with the seed. The default is now 50 trades per commit, above the point where both settle. A run of `selftest --null` spends its time in the two learn passes, so the extra trades add at most a second or two.
- **The other history families.** Birth obligations, co-change and commit archetypes on all 14 repositories (5 runs, 5 to 100 trades): every mean is 0 except single-run residues of at most 0.4 (archetypes on click and koa at 5 trades, co-change on flask at 20), with no trend in the trade count. They were not under-mixed. The full `selftest --null` at 50 trades (3 runs, seeds 1 to 3) gives a total of 1.33 false certifications a run summed over the 14 (express archetypes 0.67, axum and typeorm co-change 0.33 each), against 1.67 at 5 trades (Grain archetypes 0.67, flask 0.67 and click 0.33 co-change); every other family stays at 0 on every repository.
- **`selftest --cochange` at 50 trades**, same 14 repositories, 3 runs: the shipped cell names 0.33 a run summed (was 8.7 at 5 trades), the base rate per commit 118.3 (was 175). The accuracy columns do not depend on the shuffle and are unchanged.

### Role cells against the assigned scopes (issue 385)

The 9 cells above had one thing in common. Role induction assigns only scopes with some content of their own, and every scope it assigned in those partitions had the value: camelCase method names, where the methods left unassigned are one-word `it` callbacks. Each group beat the partition only by being assigned, and the label null deals labels among the assigned scopes, so it certified the same cells whatever the seed. A role cell is now coded against every scope of its kind assigned to any group, and a group absence against the rest of those scopes (mathematics.md, *Groups*). Where a kind has one group, the group is that population and keeps the partition as its reference. Measured 2026-09-26 on the same clones, `selftest --null` with 3 runs and seeds 1 to 3, before (the build of issues 366 and 369) and after this change alone. Each cell reads *real · null per run*.

| repository | role conventions before | role conventions after |
| --- | --- | --- |
| Grain | 125 · 9 (9, 9, 9) | 96 · 0 |
| Yggdrasil | 84 · 0 | 77 · 0 |
| typeorm | 57 · 0 | 52 · 0 |
| express | 27 · 0 | 24 · 0 |
| flask | 41 · 0 | 38 · 0 |
| requests | 20 · 0 | 17 · 0 |
| click | 68 · 0 | 67 · 0 |
| koa | 11 · 0 | 10 · 0 |
| CleanArchitecture | 8 · 0 | 7 · 0 |
| gin | 59 · 0 | 60 · 0 |
| chi | 3 · 0 | 4 · 0 |
| axum, Slim, sinatra | 59, 7, 2 · 0 | unchanged |

- **The null.** Grain's 9 role cells a run go to 0; every other family and every other repository is unchanged, so Grain's total falls from 9.67 to 0.67 a run (the commit-archetype residue).
- **What is lost.** 571 role conventions across the 14 become 520. On Grain the 29 that go restate the assigned scopes: camelCase names in six groups, and small unit-test partitions whose groups hold nearly every non-trivial method (the Ruby and Rust name-resolution tests, a stress-test oracle). A few that go were the lead of a set of facts with one conform set, and a sibling now leads. On Yggdrasil 7 go, of the same kind: camelCase in three test groups, a return type (`void`, `Promise`, `ValidationIssue`) or a statement shape in groups where the other assigned methods have it too, and with them one partition-wide absence that needed a group presence beside it. gin and chi each gain one, a group that differs from the other groups more than from the partition.
- **Conventions certified.** Grain 267 → 238, Yggdrasil 163 → 155.
- **Mutation harness.** Grain 19 of 19 caught, 0 false fires, 217 unsupported (was 23 of 23, 239); Yggdrasil 35 of 35, 0, 116 (was 35, 0, 124).
- **The sub-gate band** codes a role row against the same population. Over one model, the band goes from 37 to 36 rows on Grain, 60 to 52 on Yggdrasil and 67 to 48 on typeorm.
- **No single-group case moved.** No repository measured certifies a role cell of a kind with one group (the null would reproduce every such cell, and it reproduced none before this change beyond Grain's 9, all in kinds with several groups). The fixture repository does: its 30 command handlers are the only group of methods in their partition, and "handlers call `validate`" is stated against the partition's constructors, as before.

### A lone group against the other partitions (issue 390)

The change above left one case on the partition: a kind with a single role group, which is the assigned scopes of that kind in its partition. Against the partition it still wins by being assigned, and the label null deals labels among the assigned scopes, which leaves a lone group exactly as it was. So the null could not test it, and a lone group that restated "has content of its own" would have passed both. A lone group is now contrasted with the scopes of its kind assigned in every other partition, a boolean predicate those partitions' vocabularies lack counting as `false`, and a placement predicate not contrasted at all (mathematics.md, *Groups*). The label null also deals the assigned scopes' predicates out again across partitions, which a lone group needs. Measured 2026-09-26 on the same 14 clones as above, before (the build of issue 385) and after.

- **What changes.** Role conventions 520 → 523. Three appear, each a lone group in its partition: on Grain, methods of the C# name-resolution test matrix are `async` (54 of 54) and its test cases call `runCase` (19 of 19); on CleanArchitecture, methods of `src/Application` return `Task` (23 of 23), which is the handlers' contract in that layer. None disappears on the 14.
- **The null.** `selftest --null`, 3 runs, seed 1: role conventions 0 in every run on all 14. With the cross-partition deal switched off and everything else the same, Grain's `runCase` cell certifies in every run (1, 1, 1), because relabelling inside its partition cannot move it; with the deal, 0. Other families' residues move only because the deal draws from the same random source first: Grain's deviation fix rate 0 → 0.33 and its archetypes 0.67 → 0 a run, Yggdrasil's archetypes 0 → 0.33, sinatra's deviation fix rate 0 → 0.33.
- **The fixture.** Its 30 command handlers are the only group of methods in their partition. "Handlers call `validate`" (29 of 30) stays: no assigned method elsewhere calls `validate` often enough to put it in its partition's vocabulary, and those methods count as not calling it. Contrasted with the other partitions without that rule, the cell had no reference and disappeared, and three fixture tests failed. The placement rule keeps out "handlers live under `handlers/`", which the other partitions made certain.
- **The sub-gate band** uses the same reference and does not move: Grain 36, Yggdrasil 52, typeorm 48, CleanArchitecture 7, express 3 rows.
- **Mutation harness.** Yggdrasil 35 of 35 caught, 0 false fires; CleanArchitecture 6 of 6, 0; Grain 20 of 20 with 1 false fire, `r2:method` "calls `filePath.split`" accusing its own exemplar `nodeOf` in the Go name-resolution matrix. The build before this change gives the same false fire on this clone (19 of 19, 1), so it is not this change's; issue 385 recorded 0 on its clone.
- `spectrum`, which reads one partition, still codes a lone group against the partition; its rows are display only, and the NORM mark comes from the model.

### Repair as a tiering signal: measured, not shipped (issue 255)

The research behind 6.1.0 (GM-3) proposed that a convention a team enforces shows it in history: a departure from it is later repaired. Grain measures that in one place, calibration, which never runs on the family's repositories (it needs 365 days) and decodes values for five kinds of predicate only (name shape, first statement, return shape, decorators, supertypes). The proposal: decode every kind, contrast the repair rate of departures with a base rate, certify it with the KT code, the BIC penalty, one index cost and λ, and use it when choosing a rule's tier. Measured 2026-09-26 on scratch builds, before building it.

The cell measured: for each accepted convention, every in-place change of a scope's value away from the expected one is a departure, repaired when the scope later carries the expected value again; the base rate is the same outcome for every other change of that value (a change toward the expected value, or between two others), returning to the value it left. Departures coded at their own KT rate against that rate, the BIC half log, one index cost over the conventions with a departure, and the λ bound on the repair rate. The history cut is by commit order: the first 70% of commits train, departures after the cut test. The wider decoding stored each scope's calls, node types, statement shapes and declared return types in every value event.

| repository | conventions | with a decoded event | departures, repaired | other changes, returned | certified "repaired in practice", whole history | history size with the wider decoding |
|---|---|---|---|---|---|---|
| Grain | 240 | 121 | 0 | 0 | 0 | +33% |
| Yggdrasil | 156 | 115 | 31, 0 | 9, 0 | 0 | +17% |
| express | 29 | 24 | 0 | 0 | 0 | +32% |
| flask | 42 | 39 | 29, 27 | 67, 23 | 2 (`@setupmethod` on source methods, `@app.route` on test functions) | +33% |
| click | 72 | 64 | 171, 149 | 281, 97 | 7 (return types in three source groups, `@click.group`, `@click.option`, `@click.command` in test groups) | +27% |
| typeorm | 185 | 125 | 154, 62 | 1405, 26 | 3 | +24% |

- **On the family's own repositories there is nothing to measure.** A name change is a new scope, so a name never departs in place, and on Grain and Yggdrasil almost nothing else does: 31 departures on Yggdrasil, none repaired, 0 on Grain. The four hand-written oracles (express, Grain, spring-petclinic, Yggdrasil) are where a tier could be scored against hand rules; on the three measured here nothing is repaired (none of Yggdrasil's 31 departures, and no departure at all on express and Grain), so the AUC against hand deterministic rules the research asked for cannot be computed.
- **On older repositories written by people it exists,** 12 conventions over three repositories. With the old five decodings alone it is 10 of them (click 7, flask 2, typeorm 1).
- **It does not predict.** Learned on the first 70% of commits, the cell certifies 0 conventions on click and flask and 2 on typeorm, and none of those has a departure after the cut, so there is nothing to test it on. The departures after the cut are repaired at 0.76 on click and 0.92 on flask whatever the cell said.
- **The cost.** The wider decoding grows the history store by 17% to 33%, and changes the extractor version, so every existing store re-extracts every historical blob.

Not shipped: the tier would rest on a cell that certifies nothing on the family's repositories, has no prospective test, and cannot be scored against a hand rule, at the price of a full re-extraction for every adopter. Calibration stays as it was. Kept for a later release: the base-rate contrast above, which on the old decodings alone already reads click, flask and typeorm.

### The imports that hold a cycle together (issue 266)

`report`, `report --json` and the proposal's refactor backlog now name, for each module cycle, the smallest set of module edges that breaks it and the file references behind each (mathematics.md, *Cycle cuts*). On Yggdrasil (`65bfb39`) the two cycles 093 found are the same two, and each is held by a handful of references: `portal → cli` (3 of the cycle's 19, both in `portal/engine-api.ts`), and `relations → core` plus `structure → core` (4 of 55, in `relations/allowed-types.ts`, `relations/type-gate.ts`, `structure/allowed-reads.ts` and `structure/observations.ts`). typeorm's 26-module component is above the exact bound: the local search names 60 module edges carrying 217 of its 1740 references, marked as not proven smallest.

Does the cut point at what maintainers actually remove? Measured 2026-09-26 on the history of the six corpus repositories that ever had a module cycle (Slim, axum, express, sinatra, typeorm and Yggdrasil): the module graph and its cuts at 120 commits evenly spaced along each first-parent history (fewer where the history is shorter), and for every cycle a later snapshot no longer holds, the module edges inside it that had disappeared by then. A random edge of the same component is the baseline, and so is naming the component's lightest edges, as many as the cut has.

| | removed edges in the cut | broken cycles with a removed edge in the cut | removed references in the cut |
|---|---|---|---|
| the cut | 13 of 19 (0.68) | 10 of 14 | 0.66 |
| a random edge of the component | 0.36 expected (P of 13 or more = 0.001) | 6.5 expected (P of 10 or more = 0.044) | 0.17 |
| the lightest edges, as many as the cut | 14 of 19 | 10 of 14 | |

- **Better than a random edge, no better than the lightest edges.** When a cycle breaks, the edges that went are in the cut more often than chance puts them there, but naming the lightest edges does as well: maintainers remove light dependencies, and the smallest cut is made of light ones. What the cut adds over that list is that removing it provably breaks the cycle.
- **A small sample.** 14 broken cycles, in four of the six repositories (Slim, express, sinatra and Yggdrasil; none in axum or typeorm); 459 snapshot pairs kept their cycle and 13 lost it because a member module disappeared. A snapshot pair spans many commits, so an edge that went may have gone for reasons that had nothing to do with the cycle.

### A sibling surface under a more specific cell (issue 393)

The one false fire the mutation harness reported on Grain (issue 390's row above) was real `check` output. On `plugins/grain/tests/relations/unit/go-name-resolution-matrix/01-go-single-import-edge.test.mjs`, `check` told `nodeOf` both that it deviates from "methods never call `filePath.split`" and that it conforms to "methods here call `filePath.split`" (29 of 29). The first came from the root partition's `_all:method` fact whose lead surface is "never calls `byPath.get`" and which carries `filePath.split` as a sibling surface with the same conform set; the second from the role cell `r2:method`, which is the fact that governs `filePath.split` for that scope. A sibling surface was checked without asking which fact governs its own pid. It is now silent where a more specific fact governs that pid, by the same specificity order that picks the governing fact (smaller evidence class first, then role before directory before partition). Measured 2026-09-26 with `grain selftest` on this repository at `a04b7c2`: before, 20 caught, 0 missed, 82 silent, 1 false fire, 212 unsupported; after, 20, 0, 83, 0, 213. The fact that used to false-fire now counts as unsupported, because the harness has no mutation for a "does call" fact.

## Match-by-example (`how`) vs. a grep baseline

`grain selftest --how [--last N]` runs a leave-one-out evaluation of `how`: for each of the last N real commits
touching ≥2 files, the commit's own message tokens become the intent, the commit itself is removed from the
evidence, and `how` is asked to predict which files that intent touched — scored against a naive baseline that
greps every tracked path's name and content for the same tokens. Both arms run over the same file universe, truth
is the commit's own files, and a candidate with zero predicted places still counts as a P=0/R=0 result — a "no
match" is never excluded, which would make the gate gameable by only ever answering the easy intents.

The originally-frozen criterion asked for `how`'s coverage (recall) to meet or beat the grep baseline's, at ≥2×
grep's precision, in the median. Run on ten of the twelve public repositories above (chi/CleanArchitecture/gin/
flask/axum/express/sinatra/Slim/nest/spring-petclinic; okhttp and typeorm skipped for cold-build time once the
signal was already consistent across ten):

| | `how` median precision | `how` median recall | grep median precision | grep median recall |
| --- | --- | --- | --- | --- |
| aggregate (median of medians) | 0.154 | 0.442 | 0.033 | 1.000 |

`how` cleared 2× grep's precision in 7 of 10 repositories (4.6× in aggregate) but never approached grep's recall in
9 of 10: grep's baseline, built from the same path/content tokens `how` itself uses, returns 8–79% of the entire
repository at that recall (measured directly: 91–102 of gin's 130 files, 520 of nest's 2307) — a baseline that
answers "almost everything" is close to unbeatable on recall by construction, precision entirely aside. The
recall half of the frozen criterion effectively demanded that `how` also return most of the repository, which a
precise answer cannot do by design; the precision half passed with a wide margin. **Verdict on the frozen
criterion: not met (1 of 10 repositories passed both halves).**

Re-run on the same ten repositories and indexes with F1 (the harmonic mean of precision and recall) added as an
additional, purely additive metric — the same run, no change to `how`'s own matching:

| | `how` median F1 | grep median F1 |
| --- | --- | --- |
| aggregate (median of medians) | 0.223 | 0.064 |

`how` beat grep's F1 in 7 of 10 repositories, tied in 1 (spring-petclinic), and lost in 2 (CleanArchitecture, chi)
— both of the losses are the two repositories with the highest "no match" rate (30% and 51% of intents), where
`how` is not wrong so much as silent, and silence there is the same honest "no match, see the map instead" `where`
already gives, never a fabricated answer. **Decision: proceed** (the recall-parity framing measured a baseline's
breadth, not `how`'s quality; F1, computed on the identical evidence with no code change, shows a real, repeatable
precision advantage in most of the corpus). `no-match` ranged 6–51% across the ten repositories (mean 21.6%) —
recorded here as a real, named limitation: on some repositories, especially smaller or older ones, `how` has
nothing to say for a meaningful share of past intents.

## Hostile repositories

`tests/stress/edge-cases.mjs` builds 25 hostile repositories and asserts the contract "degrade, never crash, never
lie": an empty repository, commits with no code, a shallow clone, no git at all, detached HEAD, symlinks, huge and
non UTF-8 files, mass renames, submodules, two cold queries racing, a file outside the repository, a deleted file, a
brand new untracked file. 25 of 25 pass; every answer exits cleanly and carries its `as of` stamp.

## Language support: validated vs. parsed

`docs/validation.md`'s "12-repo corpus" above predates the grammar list roughly doubling. Support for a language is
not "grain ships a tree-sitter grammar for it" — it is proven by instruments on the corpus, or it is not proven yet.
This section runs the pinned, SHA-frozen corpus (`plugins/grain/tests/stress/corpus.json`, 25 entries across 19 code
grammars plus 4 incidental config grammars) through instrument **A** (claim auditor, `tests/stress/audit-claims.mjs`
— every verifiable claim in `export`/`report`/sampled `where` checked against source), **B** (declaration coverage,
`selftest --extract` — recall against a node-types.json-derived oracle, plus its inverse: scopes the oracle would
not count as declarations that grain records anyway), **D** (disclosure fixtures — confirmed green as a precondition:
`tests/disclosure-fixtures.test.mjs`, 10/10 pass, 0 todo), and **E** (ranking harnesses, `selftest --where` and
`selftest --obligation`, judged on the leak-free stratum per the standing `where-judged-on-leak-free-stratum`
ruling, never the pooled number).

**Run, not run.** 23 of 25 entries ran the full A/B/D/E pipeline end to end: a fresh clone at the pinned sha, a cold
`export` (which A's harness triggers itself), then `selftest --extract`/`--where`/`--obligation` against the warm
cache. `symfony-mid` (79,767 commits) was skipped without running: its commit count is 96% of `symfony-full`'s
(82,946), which this wave's instrument F already measured as a 30-minute cold-build timeout with no completion
(`tests/stress/results/baseline-2026-09-02-6a65969.json`); re-discovering the same wall on a near-identical scale
was not worth the time this wave and would not have changed which grammar rows exist (PHP is already validated
twice over below, via `Slim` and `symfony-shallow`). `symfony-full` itself was likewise skipped — same reason,
already measured. `symfony-shallow` (depth-1 clone, 1 commit, 14,887 files) DID run: its cold build took 116 s
(well inside budget) and A/B ran cleanly (PHP recall 1.00, precision 0.98); E correctly declined rather than
faking a ranking — `selftest --where`/`--obligation` both report "needs commit history to evaluate against (this
repository has no readable commit history)" instead of a hollow zero, which is the exact disclosure this entry
exists to exercise. `curl` (39,604 commits, the corpus's dedicated pure-C entry) was the slowest completed run —
cold build took roughly 19 minutes, driven by history-walk cost scaling with commit count more than file count
(compare `symfony-shallow`'s 14,887-file, 1-commit clone at 116 s) — but it finished clean within this session.

**Instrument A — what the fabrication rate actually contains.** Raw per-repo rates ranged from 0.15% (serde-full)
to 40.8% (zig-zls) of checkable claims. Before reporting those numbers as a language quality signal, every
`declaredAtLine` fabrication across all 23 repos (2,101 total instances) was re-run through the checker directly
(bypassing the sample cap) and classified: **100% of them**, in every single repo, are the already-known,
already-accepted §061 shape — a `catch`/`finally` scope's raw model `.name` field carries its enclosing method's
name by design (`061`'s own log: "Extraction data (.name) left untouched by design — zero EXTR_V impact"; only the
renderer was fixed, to print "catch in X" rather than "X"). Zero genuinely new `declaredAtLine` defects were found
in this wave, in any of the 19 code grammars. `zig-zls`'s outlier 41% is fully explained by Zig's idiomatic
`expr catch |err| {...}` density (many inline catches per function); `curl` and `symfony-shallow` show the same
shape at ordinary volume (0.1–2.5%). Similarly, B's own "inverse" metric (scopes an oracle would not count as
declarations) is dominated by three benign, already-understood idioms, not defects: JS/TS test-framework callbacks
(`describe`/`it` named after their string literal — `nest`'s TypeScript precision 0.47 is 53% of exactly this),
Lua's `local M = {}; function M.foo() end; return M` module-table idiom (`telescope.nvim`'s precision 0.23 — this
is the axis that repo was pinned to exercise, and recall stayed 1.00, i.e. nothing was missed), and JS/TS/TSX
const-bound arrow functions (`tsx-zustand`'s precision 0.18). Recall was 1.00 or 0.94+ in every one of these; the
"low precision" is grain recognizing more than a narrow keyword-declaration oracle does, exactly what B's inverse
metric is designed to surface, not a fabrication.

What genuinely new, non-061-shaped defects instrument A did surface this wave, each filed as a ticket rather than
fixed here (no-engine-change ticket):

- **082 (HIGH)** — Python: `class Foo(pkg.sub.Type):` records THREE separate, mostly-bogus supertype claims (one
  per dotted-path prefix: `pkg`, `pkg.sub`, `pkg.sub.Type`) instead of resolving to the one real base. 78 of 158
  (49%) of `flask`'s heritage claims are this shape. Distinct from the already-fixed `062` (qualified heritage
  takes the namespace, not the member) and `049` (constructor-call argument recorded as the supertype): those each
  fix a single mis-resolution per clause; this is Python's attribute-node nesting emitting several overlapping
  claims per clause. Not observed in any other of the 22 other-language repos.
- **083 (HIGH)** — Kotlin: a class-delegation clause (`class Foo(x: Bar) : Bar by x`, or `by someFn()`) records the
  delegate EXPRESSION as a second, bogus supertype. 13 instances across both Kotlin repos (`okhttp` 3, `kotlin-
  datetime` 10) — the audit's own heuristic recognizes several as the same shape as `049`'s constructor-argument
  case, but `049`'s fix (an `argument_list`-descent guard) does not reach Kotlin's separate `by`-clause node.
- **084 (HIGH)** — Rust: a trait-bound list's `'static` lifetime is recorded as its own heritage/trait target
  (`Listener extends/implements 'static`). 5 of 29 (17%) of `axum-full`'s heritage claims; `serde-full` (also Rust,
  same wave) shows zero — tied to axum's heavier use of `'static` bounds in generic handler/extractor signatures,
  not universal to the grammar, but reproducible.
- **086 (HIGH)** — in a repo dominated by one grammar, a smaller SECOND grammar's files get zero in/out relation
  edges anywhere, and the coverage-disclosure line never names it (only genuinely no-grammar file extensions are
  named — the already-fixed `041`/`059` class covered a whole grammar having no edges; this is a per-repo secondary
  population). Measured on six repos, four grammar pairs: `okhttp` (71 java files — 100% of that repo's `.java`
  population), `playframework` (24 javascript), `groovy-spock` (5 kotlin), `cpp-json` (7 python), `kotlin-datetime`
  (4 java), `axum-full` (5 javascript). All three of the corpus's dedicated "mixed-source-sets" axis repos (`okhttp`,
  `playframework`, `groovy-spock`) show it — directly touching the axis they were pinned to validate. Each of the
  four affected grammars (java, javascript, kotlin, python) is independently clean when it is the DOMINANT grammar
  of its own dedicated repo (`spring-petclinic`, `express`, `kotlin-datetime`/`okhttp` themselves, `flask`), so this
  is treated below as a cross-cutting relation-resolution caveat on mixed-source repos, not a per-language
  disqualifier.
- **085 (MEDIUM, queued for further diagnosis)** — `where` returns a confident (score ≥ 0.3) but factually WRONG
  top hit when a query term's only real occurrence is a file grain assigns no grammar to (config/dotfiles). Measured
  on 20 of 22 tested repos at 8–58% of the 12-identifier sample each (worst: `bash-it` 7/12, all `.editorconfig`
  keys like `indent_style`). Not yet diagnosed to a fixable root cause vs. an inherent property of lexical ranking;
  queued (`research/085`) rather than ticketed as a defect with a known fix.
- Two narrow **auditor limitations**, not engine defects, also surfaced and are noted for completeness rather than
  ticketed: PHP's `stdClass` and C++'s `std::integral_constant`/`bool_constant` are real base classes the audit's
  own "is this at least type-shaped" fallback rejects because both violate the PascalCase assumption (lowercase
  first letter) the heuristic uses — `symfony-shallow` (8 instances) and `cpp-json` (12 instances).

**Instrument E — leak-free `where` and `obligation`, honestly.** Per the standing ruling, only the leak-free
("query does not name the file") stratum is reported as meaningful; the pooled number is not. Across the 21 repos
with real history, `where`'s leak-free `hit3` beat the naive path-match baseline in 6 (`kotlin-datetime`, `zig-zls`,
`bash-it`, `openzeppelin-contracts`, plus two more within noise) and lost in the rest — consistent with, not new
information beyond, the already-open `079` ("promote co-change above lexical file cards") ranking ticket; this run
quantifies that gap at corpus scale rather than discovering it, so it is disclosed here as a corpus-wide E caveat,
not a per-language failure. `selftest --obligation` fired (nonzero coverage) on only 6 of 22 repos with history —
consistent with the already-accepted `078` finding (coverage is genuinely low; precision when it fires is not) —
and when it fired, precision@1 tied or beat the null-hot baseline in every case but one (`openzeppelin-contracts`,
a single fired event that missed): `zig-zls` 1.00 vs. 0.20, `curl` 1.00 vs. 0.15 (27% coverage, the corpus's best,
27 of 27 non-obvious predictions correct), `flask` and `telescope.nvim` 1.00 vs. 1.00 (tied), `cpp-json` 0.60 vs.
0.60 (tied).

**Validated vs. parsed, by grammar.** "Validated" means instruments A, B, D and E all ran and A/B cleared the bar
above (no new, non-benign-shape high-severity fabrication; recall ≥ 0.74 with any gap explained; D green
project-wide); "parsed, not validated" means grain indexes the grammar via tree-sitter but this wave's instrument
run surfaced a HIGH-severity, grammar-specific defect not yet fixed.

| grammar | corpus repos | instrument A (adjusted) | instrument B (recall / precision) | instrument E | status |
| --- | --- | --- | --- | --- | --- |
| c | curl | 0 new defects | 0.885 / 1.00 | obligation 0.27 cov, 1.00 vs 0.15 null | **validated** |
| cpp | leveldb, cpp-json | 0 new (17 low-volume TMP name-capture artifacts, cpp-json only) | 0.86–0.95 / 0.98–1.00 | ran | **validated** |
| c_sharp | CleanArchitecture | 0 new | 0.74 / 0.98 (gap = trivial auto-property accessors, oracle over-counts) | ran | **validated** |
| java | spring-petclinic, groovy-spock(+) | 0 new | 1.00 / 0.96–0.98 | ran | **validated** |
| javascript | express, +many | 0 new | 1.00 / 0.87–1.00 | ran | **validated** |
| typescript | nest | 0 new | 0.94 / 0.47 (test-callback capture, benign) | ran | **validated** |
| tsx | tsx-zustand | 0 new | 1.00 / 0.18 (arrow-fn-as-decl, benign) | ran | **validated** |
| python | flask | **082, HIGH** | 1.00 / 0.95 | ran | **parsed, not validated** |
| go | gin | 0 new | 1.00 / 0.83 | ran | **validated** |
| kotlin | kotlin-datetime, okhttp | **083, HIGH** | 0.94–0.98 / 1.00 | ran | **parsed, not validated** |
| rust | axum-full, serde-full | **084, HIGH** (axum only) | 1.00 / 0.96–1.00 | ran | **parsed, not validated** |
| php | Slim, symfony-shallow | 0 new | 1.00 / 0.92–0.98 | ran (Slim); shallow correctly declines (symfony-shallow) | **validated** |
| ruby | sinatra | 0 new | 0.99 / 0.92 | ran | **validated** |
| scala | playframework | 0 new | 1.00 / 0.92 | ran | **validated** |
| lua | telescope.nvim | 0 new | 1.00 / 0.23 (module-table idiom, benign) | ran | **validated** |
| zig | zig-zls | 0 new | 1.00 / 0.69 (inline `catch`, benign) | ran | **validated** |
| groovy | groovy-spock | 0 new | 0.995 / 0.99 | ran | **validated** |
| solidity | openzeppelin-contracts | 0 new | 1.00 / 0.997 | ran | **validated** |
| bash | bash-it | 0 new | 1.00 / 1.00 | ran | **validated** |
| json / yaml / toml / properties | incidental across most repos | N/A | "boundary" — no declaration-shaped node in these grammars' own schema; handled via the separate value/container mechanism (§056), not scopes | N/A | **parsed** (validated via the value-index path, not this table's criteria) |

`082`/`083`/`084`/`086` are filed and open; none is fixed by this ticket (measurement + triage only, no engine
changes). `085` is queued for further diagnosis. Once `082`/`083`/`084` are fixed and re-measured clean, Python,
Kotlin and Rust move to validated on the same bar the other 16 code grammars already clear.

## Node-level co-change: measured on four hand-written graphs, and mostly not shipped as advice

`grain advise` reads the architecture graph a repository already has and reports two things about it. One of the
two ships as advice; the other does not, and the reason is a measurement, not a preference. The full record with
every table is the maintainer note *node-cochange-measurement*, kept outside this repository;
the headline is here because it is the second time this project measured co-change as a lever and the second time
the numbers said no.

**The change-together side.** Node pairs are aggregated from grain's scope-level co-change — a pair of NAMED
DECLARATIONS, not files — mapped to the nodes that own them, gated on liveness at HEAD, the existing support floor
of 8 commits, and MUTUAL confidence (both directions at or above 1/3). Across four hand-written graphs — this
repository's own oracle, express, spring-petclinic, and Yggdrasil's live `.yggdrasil/` — it emits **two pairs in
total, both of them connections those graphs already declare, and none undeclared**:

| oracle | nodes owning files | pairs | declared | undeclared | concentration | control (declared rate over all node pairs) |
|---|---|---|---|---|---|---|
| grain | 38 of 45 | 0 | 0 | 0 | — | 8.4% |
| express | 15 of 20 | 0 | 0 | 0 | — | 14.3% |
| spring-petclinic | 20 of 27 | 0 | 0 | 0 | — | 18.4% |
| Yggdrasil | 400 of 434 | 2 | 2 | 0 | 50% | 2.2% |

The gate is not what empties this. Cross-FILE scope pairs above the support floor are 0 of 25 (grain), 36 of
28 534 (express), 0 of 0 (spring-petclinic) and 4 of 5 (Yggdrasil): two named declarations in different files
must be edited together in eight or more commits before a pair exists at all. And express's 36 are one fact —
`lib/response.js#send` against thirty-four anonymous blocks of `test/res.send.js` — which is exactly the
"corroboration selects for hubs" finding that killed the file-level lever
(maintainer note *where-cochange-promotion* §3), arriving from the other
side. Loosening the gate does not rescue it: the file-level, one-way form — the rejected lever's own shape lifted
to nodes — gives 6/9/6/57 pairs with **67%/56%/50%/61%** of them touching a single node, and that node is the
repository's churn centre every time (the changelog and the package manifest, on Yggdrasil). Five undeclared pairs
from the looser variants were spot-checked by reading the code: three real, two artefacts of a release ritual and
a repository-wide sweep.

**The floor stays (issue 368).** The single-file readers of co-change replaced their one-third floors with a contrast against the partner's base rate, and the witness pair here could take the same test: its two declarations have commit counts, and the model counts the commits they are drawn from. Measured 2026-09-26 with the pair required to pass that contrast in both directions instead of the floor: Yggdrasil (`65bfb39`, its own graph) goes from 2 pairs to 6, the 2 declared ones plus 1 more declared and 3 undeclared; express (the oracle above) from 0 to 1, `response` against the unit tests, which is the `res.send` hub the floor rejects; grain 0 to 0. A declaration's base rate over every commit is close to zero, so nearly every pair stored at 8 or more commits passes the contrast both ways, and it no longer tells a hub from a pair. On 5 swap-randomised copies of Yggdrasil's footprints both gates name 0 pairs, so the null does not separate them either. Not shipped.

So the pairs ship as `--json` data with a disclosed weak-signal line, and the text surface prints their count, the
concentration and the two rates instead of the pairs themselves — recomputed on every run, so a repository where
this does not hold says so in its own output.

**One bias the measurement turned up has since been removed.** Scope co-change is held to a fixed budget of
pairs, and until it was re-cut that budget was one ranking by how often a pair changed together — which pairs of
declarations inside a single large file win outright, because they move whenever the file does. On express that
was total: the budget was spent entirely inside one file and all 36 pairs spanning two files were dropped before
any command could see them. The budget is now shared between the two kinds, each ranked against its own kind, so
a repository with large files can no longer starve the cross-file half. Re-measured before the change shipped, on
all four graphs: the number of pairs kept is the same, every command that already read this evidence answers
identically (0 lines gained or lost anywhere, and its precision against held-out commits is unchanged to four
decimals), and `grain advise` emits the same two pairs it did before — express's 36 now reach the gate and are
still rejected by it, on their own merits. The record is §9 of the same memo.

**The split side does ship as advice**, on the same four graphs: it names `Project State` on grain (327 files, 286
of them ticket directories), `Examples` on express (80 files, nine independent programs and template directories),
`Test Fixtures` and `Docs Site Config` on Yggdrasil — and **nothing at all** on spring-petclinic, whose nodes are
already the size of one thing. That last row is what makes the other four worth reading, and both answers are
pinned by tests against the real oracles.

## A fifth kind of oracle: the correction an adopter made

The four graphs above were each written by hand, by a session forbidden to look at grain's output, which is why
they can measure it — and why there are four of them and not forty. `grain oracle record` makes a fifth kind
cheap: every adopter who runs `grain propose`, reads it, and accepts a different graph with `yg adopt` has
already produced the two artifacts a measurement needs, and the difference between them is a graph a maintainer
of that repository decided to live with. Recording it is the adopter's decision, taken twice — the command
prints what it would store and where and writes nothing until it is run again with `--yes` — and what it stores
is structure and paths, never file contents, so a repository that cannot be shared can still contribute the
oracle. The full record shape is in [the reference](reference.md#the-oracle-contract).

The first one recorded is **Yggdrasil at `3a351e1`**: 3056 tracked files, a proposal of 107 node types, 85 nodes,
216 relations and 173 rule drafts, against an accepted graph of 36 node types, 436 nodes, 1298 relations, 1 port
and 70 rules.

| | recall | precision |
|---|---|---|
| node types | 23/36 = 0.639 (25/36 = 0.694 counting the alternatives it offered) | 25/107 = 0.234 |
| nodes | 43/402 = 0.107 | 44/83 = 0.530 |
| relations, between the 44 nodes both graphs agree on | 29/39 = 0.744 | 29/41 = 0.707 |

Read it with its denominators. The relation row covers 39 of 1298 declared relations: the accepted graph has 436
nodes to the proposal's 85, so 1259 declared relations have an end no proposed node matches and are scored
neither way. The node row is the same fact from the other side — a 436-node hand graph cut at the size of one
owner is not recoverable from a proposal that draws 85. Rules: 8 of the 37 accepted mechanical rules are named
by some draft, and **no draft appears in the accepted graph under its own name at all**, which the command says
out loud, because that graph was not grown from that proposal.

**This first record is a calibration, not new evidence.** Its target is the same repository as one of the four
hand-written oracles, so it says nothing about a fifth repository — what it shows is that the recorded-oracle
measure lands where the established instrument lands: the maintainer note *oracles-4-measurement* scored the same
comparison at 21/36 type recall (23/36 with alternatives) and 30/393 node recall on an older commit and an older
engine, against 23/36, 25/36 and 43/402 here. The obligation stated above — that the type-level policy be
re-measured when a fifth repository arrives — is not discharged by it.

### The same record read as two partitions (issue 263)

The node row and the relation row above are one fact seen twice: the accepted graph is cut about four times finer than the proposal, so a best-match Jaccard misses an accepted node that sits entirely inside a proposed one exactly as it misses a node drawn across the grain. `grain oracle score` now also reads both graphs as partitions of the files they own (a file belongs to the deepest node that maps it) and projects every accepted relation onto the proposed nodes by file majority, so no relation leaves the denominator (reference.md, *The oracle contract*). Measured 2026-09-26 on the committed record and on a fresh record made the same day: a clone of Yggdrasil at `65bfb39`, its own graph, and a proposal by this build.

| | the committed record (`3a351e1`, grain 0.4.0) | a fresh record (`65bfb39`, this build) |
|---|---|---|
| files both graphs own | 1416 | 1806 |
| H(P\|A): how much finer grain cuts | 0.102 bits | 0.161 bits |
| H(A\|P): how much finer the accepted graph cuts | 2.038 bits | 2.017 bits |
| NMI · ARI, leaves | 0.844 · 0.479 | 0.839 · 0.498 |
| closest depth of the accepted tree | 4 (VI 1.517, NMI 0.878, ARI 0.662) | 4 (VI 1.603, NMI 0.871, ARI 0.643) |
| relations, projected: recall | 205/230 = 0.891 | 236/261 = 0.904 |
| relations, projected: precision | 205/216 = 0.949 | 236/244 = 0.967 |
| accepted relations inside one proposed node · unmappable | 194 · 0 of 1298 | 261 · 0 of 1775 |
| (for comparison) node recall · relations scored by Jaccard | 43/402 · 39 of 1298 | 46/471 · 44 of 1775 |

- **What it says.** H(P|A) is near zero: almost every accepted node sits inside one proposed node. The accepted graph needs about two more bits per file, a factor of about four, which is its finer granularity. The proposal cuts where the accepted tree cuts at its fourth level, and the finer nodes below that are the maintainer's to add. The projected relations agree with 093's file-pair numbers (recall 0.894, precision 0.998), which the node-matched score could not see.
- **A synthetic check** (`tests/oracle-partition.test.mjs`): splitting every proposed node in two across the accepted seams raises H(P|A) from 0 to 1 bit and leaves H(A|P) at 1 bit; merging them raises H(A|P) from 1 to 2 bits and leaves H(P|A) at 0; a proposal equal to the accepted tree cut at depth 1 is found there at VI 0.
- **What it does not cover.** Only the Yggdrasil oracle is a recorded proposal beside an accepted graph. The express, Grain and spring-petclinic oracles are hand-written graphs scored by `tests/stress/propose.mjs`, which does not read this block. The fresh record is not committed: it is the same repository as the committed one and adds no fifth repository.

The record is at `plugins/grain/tests/stress/oracles/yggdrasil/`, the memo is
the maintainer note *oracle-5-yggdrasil*, and
`tests/reconstruct.test.mjs` scores it on every run — with no checkout of Yggdrasil anywhere, because the file
sets were expanded once, when it was recorded.

## Known boundaries

Stated, not hidden: a feature extending existing modules draws no placement note (name kin already live beside it);
markdown documents are not indexed, so misplaced docs are invisible; after the removal of the test axis a test file
can outrank the source it tests in `where` for a source intent (the source hit survives in the top three, and the
skill tells the agent to take it); cold builds cost minutes, not seconds, and the corpus above does not bound how
many: an external field report on a production codebase measured 460.6 s (277.6 s walking history, 180.3 s mining) on
2 314 commits and 2 064 files, 91 MB on disk — past this corpus's own 2.9 min extreme (typeorm, 6 052 commits) on a
repository with fewer commits than either corpus outlier, and confirming what the table alone already hints (nest's
21 648 commits build in 55.7 s, faster than typeorm's 6 052): commit count does not predict cold-build cost, a
densely-scoped or generic-heavy codebase can run well past this corpus's range, and 1.5 GB is this corpus's own peak
RSS (typeorm), not a ceiling; `where` closes no semantic gaps by itself, which is what the compact map and the
example-voice bridge line are for; and the corpus table above was measured under engine 0.2.0, predates JSON/YAML/
TOML and `.properties` support, and has not been re-run end-to-end since — the one full remeasurement taken at the
time was narrower: walking the newly-widened `CODE_RE` through history on CleanArchitecture cost +361% wall time
before a scopeless-blob skip in the blob-parsing path (data files carry no scopes worth extracting a skeleton for)
brought it back down to +3.0%, which is the number that shipped. A later, different-machine cross-check on nest
alone (engine 0.3.0, pre-release) timed its cold build at 114 s against the table's 55.7 s — roughly 2× — consistent
with more files now entering every build plus ordinary hardware/OS/node-version drift, not a regression; the table
above is left as originally measured rather than quietly overwritten to match one new machine, which is exactly why
this note exists instead; and value concordance's own container-membership fix (see [mathematics.md](mathematics.md))
was measured on this repository's own model before and after: 76 certified value norms collapsed to 8 distinct
(evidence, population) signatures once membership was read globally rather than per container — one signature
repeated 19 times — and to 0 once membership was read per container as specified, on a repository whose containers
turned out not to clear the acceptance floor at that granularity; the same fix measured on two other real
repositories (in the corpus table above) produced 3–4 distinct, non-duplicated norms each, confirming the fix does
not certify zero by construction, only when a repository's own data does not support more; and a role group's
defining decorator or base type is measured by the same signal that forms the group's own membership, so a new
scope omitting it is placed outside the group by that very omission and judged only against the package-wide
baseline — grain cannot judge it against that group, and says so rather than staying silent: such a scope is
named in `check` as new to the index, with its nearest certifying group and what that group requires, and the
summary line counts it as an unclassified scope so a clean deviation count is never read as approval of code
grain could not place; the underlying
tautology (a role fact whose own pid is the marker that formed the group, so unanimity is guaranteed by
construction) measured 82%, 55%, 33% and 100% of role facts across four partitions in three repositories (flask,
CleanArchitecture, spring-petclinic) — a measured range, not a law; and a declaration that exists only as a
runtime product of metaprogramming is invisible to `what`, with no disclosure — Sinatra's `views`, `root` and every
`set :x` value are created in `base.rb` through `define_singleton`/`define_method`, with no literal `def` anywhere,
and every signal grain's blind-file disclosure runs on is absent there by construction: measured on sinatra,
`base.rb` parses to real scopes so it is not a blind file at all, neither `environment` nor `views` appears in any
blind file, and both queries carry a genuine exact-name match somewhere else (`environment` is a real method in
`test/integration_helper.rb`), which is precisely the condition under which the disclosure must stay silent; the
file-level fallback that suggests itself — flag any file containing a dynamic-definition construct — was measured
too and is not selective enough to disclose anything, firing on 26% of sinatra's parsed files and 24% of flask's,
which tells a reader only that a quarter of the repository might hold their answer; and Scala's grammar does not
fully parse ordinary Play framework code — measured directly with grain's own parser against a fresh clone of
playframework/playframework (main, commit `61ec059`, 2026-09-01): 97 of 843 `.scala` files (11.5%) carry parser
error nodes, the same `hasError` signal `check`'s "parse degraded" caveat and `review`'s aggregate (§053, fixed
above) both key off. It clusters on one idiom, not evenly: 74 of the 97 (76%) contain a Guice-style annotated
primary constructor (`class X @Inject() (deps) extends Y`), and 45 (46%, overlapping with the first) also carry a
curried implicit parameter list (`(implicit ec: ExecutionContext)`); a long tail of infix/function-type
ascriptions (12) and inline XML literals (2) accounts for most of the rest, and 14 files carry an error under none
of the three. Both dominant idioms are ordinary Play/Guice convention, not exotic syntax — the corpus is not
unusual, so the gap is the grammar's.

That the grammar cannot parse the broken constructor does not mean it recovers nothing else nearby: §060 found
that of those same 97 error-bearing files, tree-sitter's own error recovery had already parsed a fully clean,
correctly-typed subtree — a nested `package … { }` holding a well-formed `object`, or a sibling `class`/`def` —
sitting right beside the unparseable constructor inside the SAME error node, in 58 of the 97 (60%); the tutorial's
own canonical example (`HelloController.scala`) nests a `package views { object html { … } }` right above the
broken `class HelloController @Inject() (cc: …)(implicit …)`. Grain's walk was throwing that clean subtree away
too, unconditionally, because it stopped descending the instant it hit the ERROR node wrapping the whole
statement list rather than only the broken statement — a walk-logic gap, not a second grammar limitation. Fixed
by pushing an ERROR node's own children onto the walk (engine/scopes.mjs, `extractScopes`) so the traversal keeps
going exactly as it does past any other non-scope node; nothing is ever extracted from the ERROR node itself, only
from descendants the grammar already typed with zero errors of their own, so this adds no fabrication risk (the
same instinct as §018's macro-body reparse, applied at node granularity instead of re-parsing a text span — a
whole-region reparse would refail on the still-broken constructor sharing the same span and recover nothing at
all, measured directly against this exact file). Measured on the same clone/commit: 145 declarations recovered
across those 58 files: 81 types, 58 methods, 6 `finally` micro-scopes. The genuinely unparseable
part is unaffected and stays disclosed exactly as before — the file's own `hasError` never flips, so `check`'s
"parse degraded" caveat and `review`'s aggregate (§053) still fire for every one of the 97 files.

A style convention (`auto.lex:quote`, `:semi`, `:decl`, `:indent`) is
scored per FILE, never per literal — `lexicalPreds` collapses a file's string literals into one categorical that
reads `double` while at most 20% of them are single-quoted, so `check` can call a file conforming while literals
inside it depart, and the silent budget is 0.25 × the majority count, growing with file size. Measured end to end:
telescope.nvim's `lua/telescope/previewers/buffer_previewer.lua` absorbs 50 newly added single-quoted literals
with zero flags and flips only at 51; express's smaller `test/acceptance/mvc.js` absorbs 12 and flips at 15;
repo-wide the budget is 957 literals on telescope.nvim, 2 050 on express and 1 067 on flask. The vote is kept as
the mining unit deliberately, because the minority is mostly not a style choice at all: of the literals departing
their file's majority, 11 of 11 on telescope.nvim, 19 of 31 on flask and 2 of 24 on express contain the majority
delimiter in their own body, so the other quote is forced by the content rather than chosen. What was wrong was
what `check` SAID — a binary conforming verdict over instances it never named — so it now discloses the tally it
scored (`governed[].withinFile` in `--json`, and a clause on the conformance line, printed even when diff scoping
keeps a file-kind fact off it). Acceptance, `idxCost` and the candidate universe are untouched: the counts are an
out-parameter of `lexicalPreds`, never a predicate. The residue this left stated rather than hidden — the 22
literals on express and 12 on flask that depart their file's majority WITHOUT a forcing delimiter — is exactly
what §077 (director-approved follow-up, esc-1) turned into a per-literal flag: `quoteFlags` (engine/report-facts.mjs) reuses this
same delimiter-forced content test on the instances `lexicalPreds` already scans, and `withinFile` now also
carries `flagged`/`flagLines` for the minority-quote literals that are genuine departures, rendered as part of the
same tally clause (never a new line, never a new constant — the file-level convention's own certification is what
turns the flag on). Measured on clean, unmodified checkouts of the fire-rate gate's own standard (§018/§037): of
140 files across telescope.nvim/express/flask whose per-file vote already conforms, 3 (2.14%) now carry a flag —
0/69 telescope.nvim, 0/18 express, 3/53 (5.66%) flask, all single-quoted literals nested inside an f-string
(`'on'`/`'off'`, `'<string>'`, `'/'`) that contain no `"` of their own — comfortably inside the acceptable range.

A data-grammar (JSON/YAML/TOML) mapping's own KEY — a service id in a
Symfony-style `services.yml`, say — is findable by `what`, but only ever as a gated, honestly-disclosed value,
never as a `defined:` declaration the way a `class`/`function` is (§056): a key declared once, in one file, can
never clear the cross-file population floor (`CFG.valueDfMin`=2) that `model.valueIndex`'s value-concordance
math is built around, so `what "foo.baz"` on such a file names the file it was seen in, why it is not indexed,
and — since §056 — every other key sharing its own mapping (`Declared alongside: …`, read straight off the raw
per-file scan, independent of any other key's own frequency), but it is never listed as a first-class `defined:`
hit and carries no `used by:`/`tested by:`/`spread:` treatment. Promoting every data-grammar mapping key to a
`defined:`-shaped declaration was considered and rejected: nothing in a JSON/YAML/TOML mapping's own shape
distinguishes "this key names an entity referenced elsewhere" (a DI-container service id) from "this is a plain
data field" (`name`/`version` in a package.json, a locale string's own key in a translations file) without either
a hand-picked per-domain rule (explicitly out of scope — grain's own binding names no language, and this would
have to name a convention) or an unbounded per-file scope count (a single translations.json can carry thousands
of leaf keys, next to nothing like a source file's own natural size limit); the honest, gated-and-cross-
referenced disclosure was shipped instead, general across all three data grammars, because it needed no such
distinction. What §056 did fix, general and un-gated on any grammar name: `CONTAINER_RE`'s plain keyword list
(`switch`/`object`/`dictionary`/`array`/`enum`/`case`/`match`, matched against a node's own TYPE NAME) already
recognized JSON's mapping type (literally named `object`) but nothing in YAML's (`block_mapping`/`flow_mapping`)
— so two keys in the very same YAML mapping never shared a container at all, each exactly as isolated,
findability-wise, as an unrelated string anywhere else in the file; `bindingFor`'s new `b.dataContainer` (derived
from node-types.json alone — a node type qualifies when its own declared children admit a `b.keyField` type, so
JSON's `object` and YAML's `block_mapping`/`flow_mapping` are found the same way, no grammar named) closes that
specific gap, verified directly (`tests/data-grammar-key-siblings.test.mjs`) on a 10-service YAML fixture shaped
like round 4's own Symfony field report. Left open, on purpose, as a narrower, separately pre-existing gap first
flagged by `tests/container-keypath.test.mjs`: YAML's `block_sequence` (unmatched — only `flow_sequence`
incidentally qualifies) and TOML's `table`/`inline_table` (whose `pair` carries no `key` FIELD at all, only a
`bare_key`/`quoted_key`/`dotted_key` CHILD) — a fieldless-pair heuristic was tried for TOML and dropped: TOML's
`table`/`inline_table` themselves also admit a bare/dotted/quoted key as a DIRECT child, for their own header, so
the same heuristic that finds TOML's `pair` also misclassifies `pair` itself as a container, stopping the
ancestor walk at the pair instead of the table that actually holds it.
