# Validation

Grain's own claims are held to grain's standard: every number below comes from a run that can be repeated, negatives
are reported beside wins, and anything unverified says so. The harnesses live in `tests/stress/`; the engine's test
suite (1772 tests under engine 0.3.0 — `node --test` over `tests/*.test.mjs` plus the relations sub-suites,
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
by pushing an ERROR node's own children onto the walk (engine/core.mjs, `extractScopes`) so the traversal keeps
going exactly as it does past any other non-scope node; nothing is ever extracted from the ERROR node itself, only
from descendants the grammar already typed with zero errors of their own, so this adds no fabrication risk (the
same instinct as §018's macro-body reparse, applied at node granularity instead of re-parsing a text span — a
whole-region reparse would refail on the still-broken constructor sharing the same span and recover nothing at
all, measured directly against this exact file). Measured on the same clone/commit: 145 declarations recovered
across those 58 files: 81 types, 58 methods, 6 `finally` micro-scopes. The genuinely unparseable
part is unaffected and stays disclosed exactly as before — the file's own `hasError` never flips, so `check`'s
"parse degraded" caveat and `review`'s aggregate (§053) still fire for every one of the 97 files.
