# Grain

Ask your repository what its own conventions are, before the agent writes code.

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

## What it does

Before creating a file, the agent asks where such things live and what is expected of them. This is real output on a
small service repository (the test fixture in `tests/fixtures/`):

```
$ grain where handler

«handler» → marker @Handler — 29 carriers (repo-wide, match 100%)
  lives in: src/handlers/ (100%)
  carriers to copy: src/handlers/address.handler.ts:7 `UpdateAddressHandler` (type) · src/handlers/audit.handler.ts:7 `CancelAuditHandler` (type) · …
  - types here are annotated with `@Handler` — 100% of 29
«handler» → directory src/handlers/ — 30 files, 58 established (repo-wide, match 100%)
  - files here import `~/src/core/handler` — 100% of 29
  - types here are annotated with `@Handler` — 100% of 29 · held since 2024-02, last reinforced 2024-07
  not to copy: src/handlers/dispute.handler.ts:6 `CreateDisputeHandler` (is not annotated with `@Handler`)
  pattern to copy: src/handlers/address.handler.ts:7 `UpdateAddressHandler` · src/handlers/audit.handler.ts:7 `CancelAuditHandler` · …
as of 47da000
```

A hit is one of four kinds: a **group** of similar code with its conventions, a **marker** (`@decorator`,
`extends X`, `returns X`) with the code that carries it, a **directory**, or a **file** with the functions in it that
match the words you used. Tests and examples live in their own partitions and rank below source unless you ask for
tests.

After writing, it asks how the change sits against the local norm — deviations in the agent's own change first,
pre-existing ones folded into a count:

```
$ grain check src/handlers/dispute.handler.ts

check src/handlers/dispute.handler.ts — repo-wide · 5 scopes + file · governed by 9 convention(s) · 1 deviation(s) in your change, 1 pre-existing
[grain] local (src/handlers/) convention: types here are annotated with `@Handler`
    29/29 established types conform. Your type `Extra` (line 15) is not annotated with `@Handler`.
  See: src/handlers/address.handler.ts:7 `UpdateAddressHandler` · src/handlers/audit.handler.ts:7 `CancelAuditHandler` · …
  (preference gap 5.73 bits)
pre-existing (not in your change, not yours to fix — `--all` to list): handle: methods call `validate` ×1
conforms to: repo-wide: types here are named PascalCase (`Command`, `AddressDto`, `AuditDto`) (100% of 149) · …
as of 47da000+dirty
```

The answers are percentages with denominators and paths you can open. There is no essay, because the answer goes into
an agent's context on every question and tokens are a cost.

Every convention can also say how alive it is (`held since 2024-02, last reinforced 2024-07`, `trend 80>100%`, `a
newer pattern is emerging: …`), which neighbours break it (`not to copy:`), and which scope in the same file you can
copy (`In this file, \`x\` (line 12) conforms.`). The vocabulary is not only syntax: the lexical layer sees quote
style, `var`/`let`/`const`, the `'use strict'` directive, indentation, semicolons and a UTF-8 BOM — and speaks only where
the repository shows a choice (double quotes in Go are the language, not a convention).

The questions:

| | |
|---|---|
| `grain where <intent words>` | where such things live (%), what is expected there (conventions with conformance %), the exemplar to copy, what historically co-changes with that place. No lexical hit → a compact map of the source groups, markers and directories, for the asking model to match itself. |
| `grain check <file>` | how the file — its uncommitted version, marked `+dirty` — sits against the local norm: the conventions that govern it (group, directory, then package-wide; the most specific one wins), every deviation in your change with evidence and exemplars, pre-existing ones folded. |
| `grain spectrum <file>` | the full local-to-global convention lattice around one file, with no acceptance cut — `NORM` rows are accepted conventions, `obs` rows are observations below the gate. |
| `grain status` / `grain report` | model size, a signal verdict ("a sparse model — expect placement, not shape"), freshness, history, the top conventions with trends, deviant counts and age. |
| `grain seed add <path>#<name> --surfaces <pid,…> --note "why"` | a **maintainer decision**, recorded in the committed `.grain/seeds.jsonl`: promote one property of one exemplar. It mutes the retired majority or sharpens the chosen one — capped at half the real population, so it cannot invent a convention nobody has written — and prints on `where` cards and in `check` as `steer (maintainer decision, who when)`, beside how far practice has caught up. `seed list` / `seed rm <id>`; `.grain/decisions.jsonl` is the audit trail. |
| `grain export --out model.json` | the whole model as data: every convention with its context, evidence, trend, lifecycle, every conforming and deviating site (with the lines where the convention manifests and the nearest conforming exemplar), a machine check per convention, groups, markers, directories, co-change. For training-data pipelines (LoRA on a repository's conventions) and audits. `where`, `check`, `report` and `status` take `--json` too. |

## The measured architecture

The same parse that mines conventions binds cross-file references — per-language extractors and a tri-state resolver
(resolved / ambiguous / absent: silence instead of a false edge) vendored from the battle-tested Yggdrasil relation
machinery (same author, MIT; regenerate with `npm run build:relations`). The result is file→file edges and their
module-level aggregation: which modules exist, who depends on whom, where the cycles are.

```
$ grain report
== architecture — 32 modules · 68 directed dependencies · 2 cycle(s) ==
  src/cli/ → src/core/ (87) · src/io/ (69) · src/utils/ (37) · …
  src/core/ → src/utils/ (69) · src/io/ (68) · …
  cycle: src/cli ↔ src/portal
  cycle: src/core ↔ src/relations ↔ src/structure
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

## Decided, beside practiced

A repository is a majority vote, and sometimes the maintainers want to move it. A seed is the one place grain lets a
decision outrank the numbers, and it labels it as exactly that:

```
$ grain seed add src/handlers/dispute.handler.ts#handle --surfaces auto.call:validate --note "validate() moves into the framework — ADR-7"
recorded seed 2606adc3 in .grain/seeds.jsonl — methods here never call `validate` (weight 8, capped at half the real population of each cell) …

# naming what a decision replaces makes it enforceable for new code:
$ grain seed add tests/test_basic.py#do_get --surfaces auto.deco:@app.get --instead-of auto.deco:@app.route --note "New test routes use app.get — team decision"
$ grain check tests/test_basic.py       # a new test written with @app.route
… · 1 maintainer decision(s) your change departs from
[grain] maintainer decision (maintainer 2026-08-23): methods here are annotated with `@app.get`, not `@app.route` — adopted by 11 of 235 (app.route 224) in tests/ today. Your method `ping` (line 1977) still carries `@app.route`.
  Copy: tests/test_basic.py:244 `do_get`
  (91 more existing scopes still on the retired pattern — a transition in progress, not yours to fix)

$ grain where handler validation
«handler validation» → group handle — 30 members (repo-wide, match 100%)
  steer (maintainer decision, kd 2026-08-23): methods here never call `validate` — practiced by 3% of 30 in group «handle» today · validate() moves into the framework — ADR-7 · copy src/handlers/dispute.handler.ts:9 `handle`
  …

$ grain check src/handlers/new.handler.ts          # written the old way
… · 1 maintainer decision(s) your change departs from
[grain] maintainer decision (kd 2026-08-23): methods here never call `validate` — practiced by 3% of 30 in group «handle» today. Your method `handle` (line 10) calls `validate`.
  validate() moves into the framework — ADR-7
  Copy: src/handlers/dispute.handler.ts:9 `handle`
```

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
code from what it finds rather than from a list somebody configured, keeps a convention only when describing it
separately compresses the repository better than leaving it out (an MDL criterion with a multiple-comparison cost), and
weights every instance by how long it has survived in git history, who wrote it, and whether it was rewritten early.

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
explicit `grain refresh` keeps the optimiser (a cold index of a 6 000-commit repository: ~12 s, ~400 MB).

## Install

Requires Node 22 or newer and git. The plugin is self-contained — the parser runtime and every grammar ship inside it;
nothing is downloaded at runtime.

Claude Code:

```
/plugin marketplace add krzysztofdudek/Grain
/plugin install grain@grain
```

That gives you:

- a **skill** that teaches the agent *when* to ask — before creating a source file, before introducing a pattern into an
  existing file, after writing one. This matters more than the commands do: agents do not ask questions they do not
  know they should ask;
- a **session-start hook** that tells the agent, at the start of every session, that grain is available, what it
  answers, why one query is cheaper than reading sibling files, and the live state of the index for this repository;
- slash commands for a human at the keyboard: `/grain:where`, `/grain:check`, `/grain:spectrum`, `/grain:status`,
  `/grain:report`, `/grain:refresh`.

Codex CLI, Cursor and GitHub Copilot CLI are packaged from the same plugin directory (`.agents/plugins/marketplace.json`,
`.cursor-plugin/marketplace.json`, `.github/plugin/marketplace.json`, and the per-runtime manifests under
`plugins/grain/`). Those three are packaged the way their plugin docs prescribe but have not been smoke-tested against a
live install here; treat them as unverified until they are.

For a human at a terminal, from any repository:

```
node /path/to/Grain/plugins/grain/bin/grain.mjs where "background job"
node /path/to/Grain/plugins/grain/bin/grain.mjs check src/some/file.ts
```

The first query builds the index under `<repo>/.grain/cache/` (gitignored; `.grain/.gitignore` is created for you) —
full git history once, incremental afterwards. Delete the cache any time; the next query rebuilds the same bytes.

## What it is not

It informs and it never blocks. There is no gate, no verdict that fails a build, no policy file.

There are no embeddings and no retrieval layer. When a query matches nothing lexically, Grain prints the compact map of
what exists and lets the asking model close the semantic gap itself. That is a design decision, not a gap.

It does not judge quality. A convention is a majority, not a virtue.

## Status

Early. The engine is the validated prototype vendored into this repository, made self-contained and incremental, with
the corrections its second implementation found folded in. Measured on `fastify/fastify` and `encode/starlette` at
pinned commits: a cold index of the full history takes tens of seconds, every query on a warm index answers well under
a second, one new commit costs exactly its new file versions, and the mutation harness detects every planted deviation
it can plant with zero false fires — the exact numbers and their caveats travel with the maintainers' notes rather than
with this repository.

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
