# Grain

**The conventions nobody wrote down.**

[![ci](https://github.com/krzysztofdudek/Grain/actions/workflows/ci.yml/badge.svg)](https://github.com/krzysztofdudek/Grain/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/krzysztofdudek/Grain)](https://github.com/krzysztofdudek/Grain/releases)
[![license](https://img.shields.io/github/license/krzysztofdudek/Grain)](LICENSE)

The grain of a piece of wood is the direction the material actually runs, not the direction you wish it ran. You can
cut across it. You should know where it is first.

## The problem

Your agent writes code that looks right and does not match how this repository does things. The import style is off by
a hair, the file lands one directory away from where its siblings live, the error is thrown instead of mapped, the test
asserts in a shape nobody here uses.

The rules that would have prevented that were never written down. What is written down is the subset somebody
remembered to write, on the day they remembered it. The rest lives in the code, in ten thousand small decisions that
agreed with each other, and no agent can see it because nothing points at it.

Grain reads that. It mines the conventions your repository actually holds, from the syntax trees of every file and from
the whole git history, and answers questions about them. Grain asks; if you want conventions *enforced*, that is
[Yggdrasil](https://github.com/krzysztofdudek/Yggdrasil)'s job, and the two split exactly there.

## Where it sits

Every tool that enforces intent assumes somebody already knows what should be true and has written it down, and that
assumption fails wherever the practiced norm was never legible. One tool enforces the architecture you declared;
Grain surfaces the architecture the repository practices. You cannot legislate well over a codebase you cannot read,
and this is the instrument that reads it.

## Install

Requires Node 22 or newer and git. The plugin is self-contained: the parser runtime and every grammar ship inside it,
and nothing is downloaded at runtime.

Claude Code:

```
/plugin marketplace add krzysztofdudek/Grain
/plugin install grain@grain
```

That gives you:

- a **skill** that teaches the agent when to ask, which matters more than the commands do: agents do not ask
  questions they do not know they should ask;
- a **session-start hook**: what grain answers here, and the live state of this repository's index;
- the **pre-write and post-edit hooks**: placement advice before a file exists, findings after an edit, silence
  otherwise;
- slash commands for a human at the keyboard: `/grain:where`, `/grain:check`, `/grain:spectrum`, `/grain:status`,
  `/grain:report`, `/grain:refresh`, `/grain:export`, and `/grain:steer`, which is the slash name for the CLI verb
  `seed add`.

Update with `claude plugin update grain@grain` and restart the session to apply. Codex CLI, Cursor and GitHub Copilot
CLI are packaged from the same plugin directory but have not been smoke-tested against a live install; treat those
three as unverified.

For a human at a terminal, from any repository:

```
node /path/to/Grain/plugins/grain/bin/grain.mjs report
node /path/to/Grain/plugins/grain/bin/grain.mjs where "background job"
```

The first query builds the index under `<repo>/.grain/cache/` (gitignored; `.grain/.gitignore` is created for you):
full git history once, incremental afterwards. Delete the cache any time; the next query rebuilds the same bytes.

## What it looks like

Real output on the deterministic fixture repository the test suite builds; nothing below is mocked up. `grain report`
needs no question. It prints what the repository already practices, a denominator on every claim:

```
$ grain report

== package src/handlers — 12 conventions · 9 groups · 151 scopes · 30 files ==
  package src/handlers: files here import `~/src/core/handler` — 100% of 29 established
  package src/handlers: types here are annotated with `@Handler` — 100% of 29 established trend[100>100>97%] · held since 2024-02
  group «handle»: methods here call `this.service.apply` — 100% of 29 established · held since 2024-02
  template (unclustered methods ×30, ~89% of an average one): method_definition(constructor formal_parameters(…) statement_block)
  …
== architecture — 6 modules · 5 directed dependencies · 0 cycle(s) ==
  src/handlers/ → src/core/ (30) · src/services/ (30)
  test/handlers/ → src/handlers/ (29)
as of 47da000
```

When you do have a question, `where` answers with places, expectations and the exemplar to copy:

```
$ grain where handler

«handler» → marker @Handler — 29 carriers (package src/handlers, match 100%)
  lives in: src/handlers/ (100%)
  carriers to copy: src/handlers/address.handler.ts:7 `UpdateAddressHandler` (type) · …
  a new carrier comes with: a same-stem `*.dto.ts` companion (100% of 29 have one) · registration by a `*.test.ts` file (29 of 29)
«handler» → directory src/handlers/ — 30 files, 58 established (package src/handlers, match 100%)
  depends on: src/core/ (30) · src/services/ (30)
as of 47da000
```

The full cards, the `check` view and everything the hooks say unbidden are further down.

## What it costs you

1. It never blocks: no gate, no failing build, no policy file.
2. Nothing leaves your machine: no model calls, no API keys, no network at runtime.
3. It is silent when it has nothing certified to say, and a query answers in about a tenth of a second on a warm index.
4. It will tell you a place has no convention rather than invent one.

## Four results

- On express, the compression cut over the directory tree rediscovered `examples/`, `lib/` and `test/` with no name
  list anywhere in the product.
- The express middleware signature `function(req res next)` emerged as a template thirty-two times, on its own.
- The mutation harness across twelve repositories: 73 of 76 planted violations detected, zero false fires, and the
  three misses sit at 7.0 to 7.8 : 1 odds, just under the 8 : 1 the loss constant demands before grain accuses an
  instance.
- In the third agent trial a worker moved four files it had misplaced, writing "Following grain's placement signal"
  into its own transcript.

## The questions

| | |
|---|---|
| `grain where <intent words>` | where such things live (%), what is expected there (conventions with conformance %), the exemplar to copy, what historically co-changes with that place. No lexical hit → a compact map of the source groups, markers and directories, for the asking model to match itself. |
| `grain check <file>` | how the file — its uncommitted version, marked `+dirty` — sits against the local norm: the conventions that govern it (group, directory, then package-wide; the most specific one wins), every deviation in your change with evidence and exemplars, pre-existing ones folded. |
| `grain spectrum <file>` | the full local-to-global convention lattice around one file, with no acceptance cut — `NORM` rows are accepted conventions, `obs` rows are observations below the gate. |
| `grain status` / `grain report` | model size, a signal verdict ("a sparse model — expect placement, not shape"), freshness, history, the top conventions with trends, deviant counts and age. |
| `grain seed add <path>#<name> --surfaces <pid,…> --note "why"` | a **maintainer decision**, recorded in the committed `.grain/seeds.jsonl`: promote one property of one exemplar. It mutes the retired majority or sharpens the chosen one — capped at half the real population, so it cannot invent a convention nobody has written — and prints on `where` cards and in `check` as `steer (maintainer decision, who when)`, beside how far practice has caught up. `seed list` / `seed rm <id>`; `.grain/decisions.jsonl` is the audit trail. |
| `grain export --out model.json` | the whole model as data: every convention with its context, evidence, trend, lifecycle, every conforming and deviating site (with the lines where the convention manifests and the nearest conforming exemplar), a machine check per convention, groups with their templates, markers, directories, co-change and the commit-message affinity. The schema is a published interface with a downstream consumer (a fine-tuning pipeline cuts training samples from the anchor lines): it changes deliberately or not at all. `where`, `check`, `report` and `status` take `--json` too. |

## The evidence

Grain's own claims are held to grain's standard. What has actually been measured, negatives included:

- **Truth audits** (independent sessions, no shared context, every claim re-verified with find/grep/git): audit #1 —
  13/15 claims exactly true, 0 false; audit #2, after the mathematical rebuild — 39 claims: 28 exact, 8
  true-but-imprecise, **1 false class** (deviant counts mixed populations with the percentage beside them — fixed at
  the source the same day, and the audit is why). Once, grain out-verified the auditor (it named the one real deviant
  where the auditor's grep was fooled by a comment).
- **Three A/B agent trials** on a private, post-cutoff repository, scored against the diffs its author actually
  shipped: trial 1 — the index was *right* (it named the exact directory and component both arms got wrong) and the
  agent never asked; trial 2 — the edit-time hook delivered zero notes on 27 well-formed edits (correct silence, and
  the lesson that line-level checks cannot catch placement); trial 3 — the placement hook carried four notes, the
  worker moved four files citing grain by name (the first demonstrated effect on a diff), and the two defects that
  kept the move off-target (post-write timing, sequential competing notes) are fixed in this build. A feature that
  only extends existing modules draws no placement note — that boundary is structural and stated.
- **The mutation harness** over the same 12-repo corpus plants a violation of a mined convention in a real file and
  asks `check` to catch it: **73 of 76 detected, 0 false fires**. The 3 misses are the loss constant made visible,
  not defects: all three cells sit at 7.0–7.8 : 1 odds, below the 8 : 1 that λ demands before grain accuses an
  instance. 25 of 25 hostile repositories (empty, shallow, no-git, symlinks, non-UTF-8, mass renames, races)
  degrade without a crash and with an honest stamp.
- **Performance** (a private repo, 1 117 files, full history): cold build 18 s / 1.0 GB RSS; forced warm rebuild 6.3 s;
  `check`/`where` 0.12 s on a warm index; the hook adds ~0.12 s to an edit. 916 tests, CI on node 22 and 24.

## The answers, in detail

Before creating a file, the agent asks where such things live and what is expected of them. This is real output on a
small service repository (the test fixture in `tests/fixtures/`):

```
$ grain where handler

«handler» → marker @Handler — 29 carriers (package src/handlers, match 100%)
  lives in: src/handlers/ (100%)
  carriers to copy: src/handlers/address.handler.ts:7 `UpdateAddressHandler` (type) · src/handlers/audit.handler.ts:7 `CancelAuditHandler` (type) · …
  a new carrier comes with: a same-stem `*.dto.ts` companion (100% of 29 have one, e.g. `src/dto/address.dto.ts`) · registration by a `*.test.ts` file (29 of 29)
  - types here are annotated with `@Handler` — 100% of 29 · held since 2024-02, last reinforced 2024-07
«handler» → directory src/handlers/ — 30 files, 58 established (package src/handlers, match 100%)
  depends on: src/core/ (30) · src/services/ (30)
  used by: test/handlers/ (29)
  - files here import `~/src/core/handler` — 100% of 29
  - types here extend `Command` — 100% of 29 · held since 2024-02, last reinforced 2024-10
  pattern to copy: src/handlers/address.handler.ts:4 `UpdateAddressCommand` · src/handlers/audit.handler.ts:4 `CancelAuditCommand` · …
as of 47da000
```

A hit is one of four kinds: a **group** of similar code with its conventions, a **marker** (`@decorator`,
`extends X`, `returns X`) with the code that carries it, a **directory**, or a **file** with the functions in it that
match the words you used. There is no test/example special-casing anywhere: code is code, and the partitions a file is
judged against are cut from the directory tree by compression alone (see below) — on express that cut rediscovers
`examples/ · lib/ · test/` by itself.

After writing, it asks how the change sits against the local norm — deviations in the agent's own change first,
pre-existing ones folded into a count:

```
$ grain check src/handlers/dispute.handler.ts

check src/handlers/dispute.handler.ts — package src/handlers · 4 scopes + file · governed by 12 convention(s) · 0 deviation(s) in your change, 3 pre-existing
pre-existing (not in your change, not yours to fix — `--all` to list): handle: methods call `validate` ×1 · package src/handlers: types are annotated with `@Handler` ×1 · …
conforms to: package src/handlers: types here extend `Command` (100% of 29) · types here are named PascalCase (…) (100% of 58) · handle: methods here call `this.service.apply` (100% of 29) · +5 more
as of 47da000
```

The answers are percentages with denominators and paths you can open. There is no essay, because the answer goes into
an agent's context on every question and tokens are a cost.

Every convention can also say how alive it is (`held since 2024-02, last reinforced 2024-07`, `trend 80>100%`, `a
newer pattern is emerging: …`), which neighbours break it (`not to copy:`), and which scope in the same file you can
copy (`In this file, \`x\` (line 12) conforms.`). The vocabulary is not only syntax: the lexical layer sees quote
style, `var`/`let`/`const`, the `'use strict'` directive, indentation, semicolons and a UTF-8 BOM — and speaks only where
the repository shows a choice (double quotes in Go are the language, not a convention).

## The measured architecture

The same parse that mines conventions binds cross-file references — per-language extractors and a tri-state resolver
(resolved / ambiguous / absent: silence instead of a false edge) vendored from the battle-tested Yggdrasil relation
machinery (same author, MIT; regenerate with `npm run build:relations`). The result is file→file edges and their
module-level aggregation: which modules exist, who depends on whom, where the cycles are.

```
$ grain report
== architecture — 35 modules · 81 directed dependencies · 2 cycle(s) ==
  source/cli/src/cli/ → source/cli/src/core/ (87) · source/cli/src/io/ (69) · source/cli/src/utils/ (37) · …
  source/cli/src/core/ → source/cli/src/utils/ (69) · source/cli/src/io/ (68) · …
  cycle: source/cli/src/cli ↔ source/cli/src/portal
  cycle: source/cli/src/core ↔ source/cli/src/relations ↔ source/cli/src/structure
```

`check` enforces it at edit time: an import creating the FIRST edge between two modules, closing a cycle, or crossing
a committed boundary decision (`grain seed add-boundary apps/frontend --never-imports packages/infra --note "ADR-3"`)
is reported with the established path (`today apps/frontend reaches packages/infra via packages/core`). Existing
crossings stay silent — practice already speaks there.

`status` carries the counts, the session hook announces the shape (`Architecture (measured): 25 modules, 31
dependencies, 0 cycles; most depended-on: packages/core/`), `where` directory cards say `depends on:` / `used by:`,
and `export` ships every edge. Resolution covers 13 languages (TS/TSX/JS incl. workspace-package specifiers, Python,
Go via go.mod, Java, C#, Ruby, Rust via the crate tree, PHP via PSR-4, C, C++, Kotlin); the other shipped grammars
keep the conventions layer only — `status` says so rather than guessing. Conformance is pinned by one test file per
case under `plugins/grain/tests/relations/`, ported from the Yggdrasil e2e suites.

## The superposition

Similar code, laid on top of itself, is a statistic. A cluster's members anti-unify (Plotkin's least general
generalization) into ONE template with counted holes: the elements every instance shares stay in the skeleton
literally (`validate(cmd)` in every handler), a slot each instance fills differently is named as such (each handler's
own command type — "9 distinct values in 9"), a merely skewed slot gets its distribution (`Get` 6/9). Group cards say
it (`superposition: 9 members share this skeleton (~7% of an average member): …`), and the code the clustering leaves
behind — plain functions with no markers, `catch` blocks, route callbacks — is swept by the same machinery into
standalone templates ("catch always logs" falls out mechanically, with `logger.error` literally in the skeleton;
express's `function(req res next)` middleware signature emerges ×32). Every template carries its arrival process:
`held since 2026-06 · 8 new in 180d`.

## The language bridge

Every commit is a translation pair — natural language in the message, code in the touched files. When a query word
appears in no code card, grain consults the commits that say it and cites them:

```
history bridge: «endpoint» appears in no code card here, but commits saying it
touched: `src/health/controller.ts` (2) — e.g. "add health endpoint liveness probe" (a1b2c3d)
```

Never a global dictionary: a repo whose history never says the word stays silent, and repo fillers (`feat`, `fix`)
are demoted by document frequency over that repo's own commits, not by a word list.

## Placement, before the write

The agent hooks do not wait to be asked. On Claude Code and Codex the plugin registers three hooks: session start
(what grain is, the live index state), **PreToolUse on Write** — before a new file exists, its *path* is checked
against where its name-kin already live, and the note arrives while changing the directory is still free:

```
[grain] placement: `*.spec.ts` files named like `admin` live in `apps/e2e/tests/admin-panel/` — 13 of 17;
`apps/e2e/tests/sign-in/` holds none. Weaker name-kin point elsewhere: `header` → `…/onboarding-and-navigation/`
(2 of 3) — the leading count is the one to argue with. Deliberate placement is fine — but if you guessed, ask first.
```

— and **PostToolUse on Edit/Write**: the edited file is re-checked against the index and grain speaks ONLY when it
has findings on the touched lines (deviations, maintainer decisions, architecture crossings, capped at 8; identical
findings repeat at most once per 15 minutes). A clean edit, a foreign repo, a missing index: silence, exit 0, never a
build step, never a block.

## Decided, beside practiced

A repository is a majority vote, and sometimes the maintainers want to move it. A seed is the one place grain lets a
decision outrank the numbers, and it labels it as exactly that:

```
$ grain seed add src/handlers/dispute.handler.ts#handle --surfaces auto.call:validate --note "validate() moves into the framework — ADR-7" --author kd
recorded seed 95a3c9fc in .grain/seeds.jsonl — methods here never call `validate` (weight 8, capped at half the real population of each cell). Commit .grain/seeds.jsonl and .grain/decisions.jsonl; the next query re-mines with it.

$ grain where handler validation
«handler validation» → group handle — 30 members …
  steer (maintainer decision, kd 2026-08-26): methods here never call `validate` — practiced by 3% of 30 in group «handle» today · validate() moves into the framework — ADR-7 · copy src/handlers/dispute.handler.ts:9 `handle`
  …

$ grain check src/handlers/new.handler.ts          # a NEW file written the old way
… · 1 maintainer decision(s) your change departs from
[grain] maintainer decision (kd 2026-08-26): methods here never call `validate` — practiced by 3% of 30 in group «handle» today. Your method `handle` (line 10) calls `validate`.
  validate() moves into the framework — ADR-7
  Copy: src/handlers/dispute.handler.ts:9 `handle`
as of 47da000+dirty
```

Naming what a decision replaces (`--instead-of auto.deco:@app.route`) makes the retirement enforceable for new code:
`check` then flags a scope still written the old way against the decision, prints the live adoption count
(`adopted by 11 of 235 (app.route 224)`), and folds the pre-existing carriers into one calm
`transition in progress, not yours to fix` line — existing code is never blamed for a decision that postdates it.

The seed is a pseudo-count on one exemplar's property, capped at half the real population of each cell, excluded from
every `n of N` it prints, and carried along to the correlated surfaces of the same pattern. A retirement reaches every
cell where the retired rule fires, so the old majority is muted or marked `superseded by maintainer decision <id>`
wherever it would still argue back; the session hook announces the decisions in force. A seed without `--surfaces`
is refused with the list of the exemplar's properties — grain does not guess which one you meant.

## "No strong convention here" is an answer

Most tools in this shape invent authority. Grain will tell you that a place has no convention, because the acceptance
test is statistical and it fails honestly. Treat that answer as freedom rather than as a broken query. A repository is
allowed to be undecided about something.

## Never silently stale

Every answer carries the commit it was computed from (`as of 4176096`), and a file read from a dirty worktree says so
(`+dirty`). Uncommitted work never feeds the norm, by design: the norm is the accepted past — the index is mined from
HEAD's tree — and an edit in progress must not drag it toward itself. The index refreshes itself before every query when
the history moves: new commits on the same line cost exactly their new blobs; a switch to a divergent line rebuilds on
the warm blob cache; `--no-refresh` answers from the old index with a `STALE` banner instead.

## How it works

Tree-sitter parses every file. The engine derives what a "scope", an "import", a "decorator" or a "supertype" is from
each grammar's own metadata, enumerates features generically from the syntax trees and paths, induces groups of similar
code from what it finds rather than from a list somebody configured, and weights every instance by how long it has
survived in git history, who wrote it, and whether it was rewritten early.

One principle carries the whole thing: **a claim exists iff stating it compresses the repository** (two-part
codelength, with a multiple-comparison cost inside). Everything else is a special case of that. The decision to *speak*
is one loss constant, λ = 8: grain names an expected value only when the posterior predictive bounds the error at one
wrong steer per eight followed ones — there is no tuned margin, no share threshold, no per-family tau. What counts as
the repository is git's own answer: anything gitignored is never processed, anything tracked is code (name lists like
`node_modules|dist|fixtures` gate nothing on tracked paths). And the partitions a file is judged against are cut from
the directory tree by the same compression criterion — the deleted test/example name-heuristics re-emerged as
mathematics on the measurement corpus (express: `examples/ · lib/ · test/`; flask: `docs/ · examples/ · src/ ·
tests/`). Manifests (`package.json`, `go.mod`) are read for *resolution* — workspaces, the module graph — never as a
statistical prior.

There are no model calls anywhere in the engine, no API keys, and no network access at runtime. Your code stays on your
machine. Nothing about a language, a framework or a coding style is written down in the product: the language bindings
are derived from the tree-sitter grammars it ships with.

Languages today, all analysed by the same rules: TypeScript, TSX, JavaScript, Python, Go, Java, C#, Ruby, Rust, PHP,
C, C++, Kotlin, Scala, Groovy, Bash, Lua, Zig, Solidity. A language is in when its tree-sitter grammar ships a prebuilt
parser and exposes the name-and-body structure the generic rules read; Dart, Elixir, Haskell, OCaml, Julia,
PowerShell and F# were tried and left out for one of those two reasons (see `plugins/grain/scripts/build-grammars.mjs`),
Swift ships no prebuilt parser.

## Memory and speed

A query parses one file and exits, so the binary re-runs itself under V8's baseline WASM compiler: `check` on a Kotlin
file takes 80 MB instead of the 600 MB the optimising compiler would spend on a 3 MB grammar it will use once. An
explicit `grain refresh` keeps the optimiser. Measured across a 12-repository corpus (express, flask, nest, axum, gin,
okhttp, typeorm, …): warm queries 83–312 ms; cold full-history builds from 4 s (a 900-commit repo) to ~2.9 min at the
extreme (okhttp, typeorm — 6 000+ commits, up to ~1.5 GB RSS during the explicit build).

## What it is not

It informs and it never blocks. There is no gate, no verdict that fails a build, no policy file.

There are no embeddings and no retrieval layer. When a query matches nothing lexically, Grain prints the compact map of
what exists and lets the asking model close the semantic gap itself. That is a design decision, not a gap.

It does not judge quality. A convention is a majority, not a virtue.

## Status

0.1.0. The number describes the age of the interfaces, not the weight of the evidence above: this is the first
published version, the export schema is already treated as a stable contract, and nothing has yet earned the right to
break compatibility. The engine is the validated prototype vendored into this repository, made self-contained and
incremental, then rebuilt on the single-objective mathematics above, with every rebuild measured on the corpus before
it was kept.

## Developing

```
cd plugins/grain
npm install                 # dev dependencies only: the grammar packages and the runtime to vendor
npm run build:grammars      # refresh engine/grammars/ and engine/vendor/ from node_modules (outputs are committed)
npm test                    # end-to-end tests over the deterministic fixture repository
```

`node tests/fixtures/build-fixture.mjs <dir>` builds the fixture repository the tests use; its history is pinned, so two
builds are byte-identical.

Stress tooling (nothing is committed by it): `node tests/stress/run-corpus.mjs <dir-of-clones> <out>` indexes every
repository in a directory and records timings, memory, every answer and the mutation harness;
`node tests/stress/edge-cases.mjs <work>` builds 25 hostile repositories (empty, shallow, symlinks, huge and
non-UTF-8 files, mass renames, submodules, races…) and asserts grain degrades without crashing;
`tests/stress/agent-trial.sh <repo> <out> <model> "<task>"` runs the same task with and without the plugin for an
A/B comparison of a coding agent's output and cost.

## Attribution and licence

The engine is derived from the roots prototype in [Yggdrasil](https://github.com/krzysztofdudek/Yggdrasil), MIT
licensed, and carries that licence forward. Grain has no runtime dependency on Yggdrasil.

MIT.
