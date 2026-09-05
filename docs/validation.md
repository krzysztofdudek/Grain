# Validation

Grain's own claims are held to grain's standard: every number below comes from a run that can be repeated, negatives
are reported beside wins, and anything unverified says so. The harnesses live in `tests/stress/`; the engine's test
suite (2288 tests under engine 0.3.0 — `node --test` over `tests/*.test.mjs` plus the relations sub-suites,
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
what §077 (director-approved follow-up, esc-1) turned into a per-literal flag: `quoteFlags` (core.mjs) reuses this
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
