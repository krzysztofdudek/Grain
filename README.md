# Grain

**The conventions nobody wrote down.**

[![ci](https://github.com/krzysztofdudek/Grain/actions/workflows/ci.yml/badge.svg)](https://github.com/krzysztofdudek/Grain/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/krzysztofdudek/Grain)](https://github.com/krzysztofdudek/Grain/releases)
[![license](https://img.shields.io/github/license/krzysztofdudek/Grain)](LICENSE)

The grain of a piece of wood is the direction the material actually runs, not the direction you wish it ran. You can
cut across it. You should know where it is first.

## What Grain is for

Grain is a brownfield miner for [Yggdrasil](https://github.com/krzysztofdudek/Yggdrasil). Point it at a repository
that has no architecture graph yet, and `grain propose` writes one — node types, nodes, module dependencies, cycles,
and the rules the repository's own code and commit history can prove, each one carrying the evidence that produced
it — instead of a blank `.yggdrasil/` or a graph typed from memory. It is for the moment right after `git clone`:
adopting Yggdrasil on a codebase nobody has annotated, refactoring against a graph that did not exist an hour ago,
orienting in an unfamiliar tree, or planning a wave of agent work against a real map instead of none. The
agent-facing questions Grain has always answered — where does this belong, does my change conform — still work
exactly as before and are documented further down; they are the second thing this tool is for now, not the first.

## From clone to graph

For a repository that has no architecture graph yet, one command mines a proposed one:

```
grain propose
```

It writes a whole staging tree to `.yggdrasil-proposal/` — node types, nodes, relations, cycles, and mined rules
with the evidence that produced each one — and never touches the repository's own graph. What it prints back is
short on purpose, and every line of it carries a number or a path:

- the **architecture**: node types, nodes, relations, dependency cycles — with the node types split by the LEVEL
  each cut came from, and every finer cut it weighed but did not take listed beside them with the same numbers,
  so choosing a different level for one subtree is a decision you make rather than one made for you;
- the rules that **earned enforcement** — each one drilled against this repository's own code, kept only on zero
  false alarms and at least one caught violation, with those numbers beside the practice it was mined from, and
  beside how many places already break it today: the proposal names the branch your changes are measured
  against, so a rule blocks on what you touch while the debt that was already there stays a warning until you
  reach it;
- the **candidates**: rules the same drill proved but that grain itself has not certified — advisory, not
  enforced — plus drafts the same drill caught a violation with, strongest evidence first.

Everything else it drafted — the judgement calls, the rules nothing can be shown to violate, the finer cuts it
did not take — stays on disk and is summarised in one counted line. `--full` prints all of it. The proposal is a
proposal: a human reads it and decides. Its last line names the actual acceptance — `yg adopt <out-dir>
--dry-run` to preview, `yg adopt <out-dir>` to accept — and when a Yggdrasil CLI is on hand, `grain propose`
runs that dry run itself and prints the preview right there: how many sites in your own code the new rules
already refuse today, before you decide anything.

## What it can deduce, and what it can't

**Structure, yes.** Run against [Yggdrasil](https://github.com/krzysztofdudek/Yggdrasil) itself — the one repository
that carries both a hand-written `.yggdrasil/` graph and a full commit history to mine, so it is the only place this
can currently be checked at scale — `grain export` alone recovers 1105 of 1236 declared node-to-node relations
(recall 0.894, precision 0.998; the precision figure is inflated by Yggdrasil's own CI-enforced import gate, so read
it as a ceiling rather than a general number), both dependency cycles `yg advise` already nominates, and 19 of 36
classifying node types at Jaccard ≥ 0.5 (12 at ≥ 0.8). `grain propose` renders that architecture straight into a
`.yggdrasil/` shape — one run over Yggdrasil's own history produced 82 node types, 73 nodes, 210 relations and 8
cycles:

```
$ grain report
== architecture — 35 modules · 81 directed dependencies · 2 cycle(s) ==
  source/cli/src/cli/ → source/cli/src/core/ (87) · source/cli/src/io/ (69) · source/cli/src/utils/ (37) · …
  source/cli/src/core/ → source/cli/src/utils/ (69) · source/cli/src/io/ (68) · …
  cycle: source/cli/src/cli ↔ source/cli/src/portal
  cycle: source/cli/src/core ↔ source/cli/src/relations ↔ source/cli/src/structure
```

**Intent, forbiddance and "never" rules, no.** The same run drafted 124 aspects from Yggdrasil's own history: 10
earned real enforcement (a certified convention plus a drill with zero false alarms and at least one caught
violation), and 114 stayed draft — 91 of them prose no deterministic check can render, 22 that caught nothing
anywhere in their own corpus, 1 held back as a file-scope approximation. On Grain's own (younger, unenforced)
repository the same renderer produced 0 enforced rules, 22 advisory candidates and 59 drafts. A dedicated attempt
to go further — mining the *hand-written* rules themselves, not just an architecture that agrees with them — was
measured against a bar set before the run: of 20 hand-written rules a miner-miss could plausibly explain, a mined
candidate reproduced only 2 in verdict, and 0 once the candidate is also required to govern the same files as the
rule it reproduces; the bar was 10. Grain does not decide what a codebase must never do. That decision stays the
maintainer's, made from requirements — not mined from what already happened.

Two limits named plainly rather than papered over: Yggdrasil's own `examples/*` fixtures — the only other repositories with a hand-written graph at hand — are too small (14–24 files, no
independent commit history of their own) to serve as a second reconstruction check, so Yggdrasil's hand graph is,
for now, the only full-scale one there is. And when what Grain mines disagrees with what a hand graph declares, the
disagreement is reported as one of three symmetric classes — a miner miss, graph debt (the hand graph itself is
stale), or undecidable without a human — never assumed by default to be Grain's fault.

The complete measurement record behind every number above, negatives included, is in
[docs/results.md](docs/results.md).

## Grain, Yggdrasil, Horde

Three jobs, three tools, one family, each installed on its own: [Yggdrasil](https://github.com/krzysztofdudek/Yggdrasil)
**enforces** — it is what reads `.yggdrasil/` and fails a build when code violates it. Grain (this one) **mines** —
it produces the graph Yggdrasil enforces, from evidence, for a repository that does not have one yet. [Horde](https://github.com/krzysztofdudek/Horde)
**executes** — it is what raises more than one agent against an architecture graph and holds every one of them to
it. None of the three assumes the others are installed, and they talk to each other through versioned files on
disk rather than a shared codebase: a `grain propose` output is a `.yggdrasil/` tree Yggdrasil loads directly; each
proposed node gets its own `charter.md` (what lives there, what it depends on and is used by, its certified
conventions with their share and exemplars, its co-change partners) written for a human or for Horde's own tooling
to read, not for Grain itself; and grain's role groups are also emitted as Yggdrasil's own `.family-candidates.json`
shape, so `yg advise` can nominate families mined by Grain with no code change on Yggdrasil's side at all — verified
against a planted fixture where all 5 real families were nominated 5 of 5. Install whichever tools a repository
needs, in whichever order adopting them makes sense.

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
- slash commands covering the full command set: `/grain:propose`, `/grain:where`, `/grain:how`, `/grain:what`,
  `/grain:map`, `/grain:obligation`, `/grain:check`, `/grain:review`, `/grain:completeness`, `/grain:explain`,
  `/grain:status`, `/grain:report`, `/grain:rules`, `/grain:selftest`, `/grain:refresh`, `/grain:export`,
  `/grain:decide`, and `/grain:steer`, which is the slash name for the CLI verb `decide steer` under its original
  name `seed add`;
- an **MCP server** (started automatically via `.mcp.json`), for any MCP-speaking tool, not only Claude Code:
  `where`/`check`/`status`/`report` as JSON-RPC tools over stdio — see
  [docs/reference.md](docs/reference.md#mcp-server).

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

## What it costs you

1. It never blocks: no gate, no failing build, no policy file.
2. Nothing leaves your machine: no model calls, no API keys, no network at runtime.
3. It is silent when it has nothing certified to say, and a warm query answers in 0.08 to 0.31 s across the corpus.
4. It will tell you a place has no convention rather than invent one.

## The agent-facing commands

Before `grain propose` existed, this was the whole product, and it still works exactly as it did: an agent editing
this repository gets code that looks right but does not match how this repository actually does things — the import
style is off by a hair, the file lands one directory away from where its siblings live, the error is thrown instead
of mapped. Nobody wrote that rule down; it lives in the code, in ten thousand small decisions that agreed with each
other, and Grain reads that history and answers questions about it directly, at the terminal or through the hooks
below.

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
  …
  test/handlers/ → src/handlers/ (29)
as of 47da000
```

When you do have a question, `where` answers with places, expectations and the exemplar to copy, and after writing,
`check` says how the change sits against the local norm — deviations in the agent's own change first, pre-existing
ones folded into a count:

```
$ grain where handler

«handler» → marker @Handler — 29 carriers (package src/handlers, match 100%)
  lives in: src/handlers/ (100%)
  carriers to copy: src/handlers/address.handler.ts:7 `UpdateAddressHandler` (type) · …
  a new carrier comes with: a same-stem `*.dto.ts` companion (100% of 29 have one) · registration by a `*.test.ts` file (29 of 29 carriers)
«handler» → directory src/handlers/ — 30 files, 58 established (package src/handlers, match 100%)
  depends on: src/core/ (30) · src/services/ (30)
  …
as of 47da000

$ grain check src/handlers/dispute.handler.ts

check src/handlers/dispute.handler.ts — package src/handlers · 4 scopes + file · governed by 12 convention(s) · 0 deviation(s) in your change, 3 pre-existing
pre-existing (not in your change, not yours to fix — `--all` to list): handle: methods call `validate` ×1 · package src/handlers: types are annotated with `@Handler` ×1 · …
conforms to: package src/handlers: types here extend `Command` (100% of 29) · types here are named PascalCase (…) (100% of 58) · handle: methods here call `this.service.apply` (100% of 29) · +5 more
as of 47da000+dirty
```

A `where` hit is one of four kinds: a **group** of similar code with its conventions, a **marker** (`@decorator`,
`extends X`, `returns X`) with the code that carries it, a **directory**, or a **file** with the functions in it
that match the words you used. There is no test/example special-casing anywhere: code is code, and the partitions a
file is judged against are cut from the directory tree by compression alone (see below) — on express that cut
rediscovers `examples/ · lib/ · test/` by itself. The answers are percentages with denominators and paths you can
open — there is no essay, because the answer goes into an agent's context on every question and tokens are a cost.
Every convention can also say how alive it is (`held since 2024-02, last reinforced 2024-07`, `trend 80>100%`, `a
newer pattern is emerging: …`), which neighbours break it (`not to copy:`), and which scope in the same file you can
copy (`In this file, \`x\` (line 12) conforms.`). The vocabulary is not only syntax: the lexical layer sees quote
style, `var`/`let`/`const`, the `'use strict'` directive, indentation, semicolons and a UTF-8 BOM — and speaks only
where the repository shows a choice (double quotes in Go are the language, not a convention).

The full command surface:

| | |
|---|---|
| `grain where <intent words>` | where such things live (%), what is expected there (conventions with conformance %), the exemplar to copy, what historically co-changes with that place. No lexical hit → a compact map of the source groups, markers and directories, for the asking model to match itself. |
| `grain check <file>` | how the file — its uncommitted version, marked `+dirty` — sits against the local norm: the conventions that govern it (group, directory, then package-wide; the most specific one wins), every deviation in your change with evidence and exemplars, pre-existing ones folded. |
| `grain review` | the same check, aggregated over your WHOLE change at once — every uncommitted and untracked file by default, `--staged` or `--range <a>..<b>` to narrow it — one section per file that has a finding, highest-stakes first, plus the co-change partner your whole change is missing. A file with nothing to say is not listed; a fully clean change says so explicitly. |
| `grain completeness <file…>` | the other files this repo's own commits show reliably changing together with the ones given (`co-changed in N/M commits`, above a real confidence floor). The exact line the post-edit hook also appends, unprompted, whenever an edit has one. |
| `grain spectrum <file>` | the full local-to-global convention lattice around one file, with no acceptance cut — `NORM` rows are accepted conventions, `obs` rows are observations below the gate. |
| `grain status` / `grain report` | model size, a signal verdict ("a sparse model — expect placement, not shape"), freshness, history, the top conventions with trends, deviant counts and age. |
| `grain rules [--out <file>]` | the same top conventions `report` prints, generated as a standalone Markdown document with its own staleness header naming the commit it was computed from — for a maintainer or a coding tool with no terminal and no grain plugin installed. No `--out` prints it to stdout, so `grain rules > CONVENTIONS.md` already works. |
| `grain decide steer <path>#<name> --surfaces <pid,…> --note "why"` | a **maintainer decision**, recorded in the committed `.grain/decisions.jsonl`: promote one property of one exemplar. It mutes the retired majority or sharpens the chosen one — capped at half the real population, so it cannot invent a convention nobody has written — and prints on `where` cards and in `check` as `decision steer (who when)`, beside how far practice has caught up. `decide list` / `decide rm <id>`. |
| `grain advise` | for a repository that already HAS an architecture graph: what its own history and imports say about it — places a finer cut of their own files beats on their own evidence, and (as `--json` data, not as advice) places that change together with nothing in the graph connecting them. Measured on four hand-written graphs before it shipped, which is why one half of it is advice and the other half is a number with a disclosure attached. |
| `grain oracle record` / `grain oracle score` | keep the difference between the graph `grain propose` wrote and the graph you actually accepted, and score the proposal against it — precision and recall in both directions, on the same measure grain is held to on the hand-written graphs it is validated against. `record` prints what it would store and where and writes nothing until you say `--yes`; it stores structure and paths, never file contents, so a repository that cannot be shared can still contribute the oracle. |
| `grain export --out model.json` | the whole model as data: every convention with its context, evidence, trend, lifecycle, every conforming and deviating site (with the lines where the convention manifests and the nearest conforming exemplar), a machine check per convention, groups with their templates, markers, directories, co-change and the commit-message affinity. The schema is a published interface with a downstream consumer (a fine-tuning pipeline cuts training samples from the anchor lines): it changes deliberately or not at all. `where`, `check`, `report` and `status` take `--json` too. |

`how`, `what`, `map`, `obligation`, `explain` and `selftest` round out the surface — a past-commit search, a concept
card, a structural overview, birth obligations, the full convention lattice, and the mutation/leave-one-out harness
respectively. The full table, with every flag, is [docs/reference.md](docs/reference.md).

The agent hooks do not wait to be asked. On Claude Code and Codex the plugin registers three hooks: session start
(what grain is, the live index state), **PreToolUse on Write** — before a new file exists, its *path* is checked
against where its name-kin already live —

```
[grain] placement: 30 of 30 `*.handler.ts` files live under `src/handlers/`; this one is outside it (`src/misc/`).
Deliberate is fine — if you guessed, look there first.
```

— and **PostToolUse on Edit, Write and MultiEdit**: the edited file is re-checked against the index and grain speaks
ONLY when it has findings on the touched lines (deviations, maintainer decisions, architecture crossings), plus —
on its own line, capped to 3 partners — the other files this repo's history shows reliably co-changing with the one
you just touched. A clean edit with no history at all, a foreign repo, a missing index: silence, exit 0, never a
build step, never a block.

A repository is a majority vote, and sometimes the maintainer wants to move it. `decide steer` is the one place
grain lets a decision outrank the numbers, and it labels it as exactly that — `decision steer (kd 2026-08-26):
methods here never call \`validate\` — practiced by 3% of 30 in group «handle» today · validate() moves into the
framework — ADR-7`. Naming what a decision replaces (`--instead-of auto.deco:@app.route`) makes the retirement
enforceable for new code, and the pre-existing carriers are folded into one calm `transition in progress, not yours
to fix` line — existing code is never blamed for a decision that postdates it. A decision without `--surfaces` is
refused with the list of the exemplar's properties; grain does not guess which one you meant.

Similar code, laid on top of itself, is a statistic: a cluster's members anti-unify (Plotkin's least general
generalization) into one template with counted holes (`superposition: 9 members share this skeleton (~7% of an
average member): …`), and the code left behind — plain functions, `catch` blocks, route callbacks — is swept into
standalone templates the same way (express's `function(req res next)` middleware signature emerges ×32 with no
configuration). Every commit is also a translation pair — natural language in the message, code in the touched
files — so when a query word appears in no code card, grain consults the commits that say it and cites them
(`example (a1b2c3d): «endpoint» appears in no code card here, but commits saying it touched: …`); a repo whose
history never says the word stays silent, never a global dictionary.

Most tools in this shape invent authority. Grain will tell you that a place has no convention, because the
acceptance test is statistical and it fails honestly — a repository is allowed to be undecided about something.
And every answer carries the commit it was computed from (`as of 4176096`, `+dirty` from an uncommitted worktree):
uncommitted work never feeds the norm, by design, and the index refreshes itself before every query when history
moves (`--no-refresh` answers from the old index with a `STALE` banner instead).

`check` also enforces the mined architecture at edit time: an import creating the FIRST edge between two modules,
closing a cycle, or crossing a committed boundary decision (`grain decide boundary apps/frontend --never-imports
packages/infra --note "ADR-3"`) is reported with the established path (`today apps/frontend reaches packages/infra
via packages/core`). Existing crossings stay silent — practice already speaks there. `status` carries the counts,
the session hook announces the shape, `where` directory cards say `depends on:` / `used by:`, and `export` ships
every edge. Resolution covers 13 languages (TS/TSX/JS incl. workspace-package specifiers, Python, Go via go.mod,
Java, C#, Ruby, Rust via the crate tree, PHP via PSR-4, C, C++, Kotlin); the other shipped grammars keep the
conventions layer only.

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
statistical prior. Cross-file references are bound the same way: per-language extractors and a tri-state resolver
(resolved / ambiguous / absent: silence instead of a false edge), vendored from the battle-tested Yggdrasil relation
machinery (same author, MIT; regenerate with `npm run build:relations`).

There are no model calls anywhere in the engine, no API keys, and no network access at runtime. Your code stays on your
machine. Nothing about a language, a framework or a coding style is written down in the product: the language bindings
are derived from the tree-sitter grammars it ships with.

Languages today, all analysed by the same rules: TypeScript, TSX, JavaScript, Python, Go, Java, C#, Ruby, Rust, PHP,
C, C++, Kotlin, Scala, Groovy, Bash, Lua, Zig, Solidity. A language is in when its tree-sitter grammar ships a prebuilt
parser and exposes the name-and-body structure the generic rules read; Dart, Elixir, Haskell, OCaml, Julia,
PowerShell and F# were tried and left out (`plugins/grain/scripts/build-grammars.mjs` records each reason: a wasm
that does not load, or grammars exposing no name-and-body structure), and Swift ships no prebuilt parser.

## Memory and speed

A query parses one file and exits, so the binary re-runs itself under V8's baseline WASM compiler: `check` on a Kotlin
file takes 80 MB instead of the 600 MB the optimising compiler would spend on a 3 MB grammar it will use once. An
explicit `grain refresh` keeps the optimiser. Measured across a 12-repository corpus (express, flask, nest, axum, gin,
okhttp, typeorm, …): warm queries 83–312 ms; cold full-history builds from 4 s (a 900-commit repo) to ~2.9 min at the
extreme (okhttp, typeorm — 6 000+ commits, up to ~1.5 GB RSS during the explicit build). That range is this corpus's
own, not a hard ceiling: an external field report on a production codebase measured a cold first build at 460.6 s
(277.6 s walking history, 180.3 s mining) on 2 314 commits and 2 064 files, 91 MB on disk — past this corpus's own
2.9 min extreme, on a repository with fewer commits than either outlier (typeorm's 6 052, okhttp's 6 444). Commit
count alone does not predict the cost, on this corpus or that report's; the full case for why, and the boundary this
sets, is in [docs/validation.md](docs/validation.md)'s Known boundaries. On [Yggdrasil](https://github.com/krzysztofdudek/Yggdrasil)
itself, a cold `grain export` for a full `propose` run takes 434 s (180.5 s walking 1510 commits / 14 835 blobs, then
253.9 s indexing 2290 files); the reconstruction and proposal instruments that measure against it run in 2.5–5 s more
on top of that export.

## What it is not

It informs and it never blocks. There is no gate, no verdict that fails a build, no policy file.

There are no embeddings and no retrieval layer. When a query matches nothing lexically, Grain prints the compact map of
what exists and lets the asking model close the semantic gap itself. That is a design decision, not a gap.

It does not judge quality. A convention is a majority, not a virtue. And it does not decide what a codebase must
never do — a mined rule is a candidate the drill proved it can catch, never a substitute for the maintainer's own
requirement (see "What it can deduce, and what it can't" above).

## The evidence

Grain's own claims are held to grain's standard. What has actually been measured, negatives included, across both
the mining objective above and the agent-facing surface below:

**The complete record — the reconstruction and proposal numbers, the failed law-loop bet, the sense-rate measurement
against Yggdrasil's own CLI, and the earlier agent-facing results (truth audits, A/B trials, the mutation harness) —
is in [docs/results.md](docs/results.md). Read that first.**

- **Truth audits** (independent sessions, no shared context, every claim re-verified with find/grep/git): audit #1 —
  13/15 claims exactly true, 0 false; audit #2, after the mathematical rebuild — 39 claims: 28 exact, 8
  true-but-imprecise, 2 unverifiable, **1 false class** (deviant counts mixed populations with the percentage beside them — fixed at
  the source the same day, and the audit is why). Once, grain out-verified the auditor (it named the one real deviant
  where the auditor's grep was fooled by a comment).
- **Three A/B agent trials** on a private, post-cutoff repository, scored against the diffs its author actually
  shipped: trial 1 — the index was *right* (it named the exact directory and component both arms got wrong) and the
  agent never asked; trial 2 — the edit-time hook delivered zero notes on 27 edited files (correct silence, and
  the lesson that line-level checks cannot catch placement); trial 3 — the placement hook carried four notes, the
  worker moved four files citing grain by name (the first demonstrated effect on a diff), and the two defects that
  kept the move off-target (post-write timing, sequential competing notes) are fixed in this build. A feature that
  only extends existing modules draws no placement note — that boundary is structural and stated.
- **The mutation harness** over a 12-repo corpus plants a violation of a mined convention in a real file and
  asks `check` to catch it: **73 of 76 detected, 0 false fires**. The 3 misses are the loss constant made visible,
  not defects: all three cells sit at 7.0–7.8 : 1 odds, below the 8 : 1 that λ demands before grain accuses an
  instance. 25 of 25 hostile repositories (empty, shallow, no-git, symlinks, non-UTF-8, mass renames, races)
  degrade without a crash and with an honest stamp.
- **Performance** (the private trial monorepo, 1 117 files, full history): cold build 18 s / 1.0 GB RSS; forced warm rebuild 6.3 s;
  `check`/`where` 0.12 s on a warm index; the hook adds ~0.12 s to an edit. 2 288 tests, CI on node 22 and 24.

## Documentation

Four documents carry the depth this file only gestures at: [docs/results.md](docs/results.md), the complete measured
record — the brownfield-miner numbers first, the earlier agent-facing results after; [docs/mathematics.md](docs/mathematics.md),
the single objective and its special cases with the honest residue; [docs/validation.md](docs/validation.md), every
measurement with its method, the corpus tables and the known boundaries; [docs/reference.md](docs/reference.md),
commands, hooks, the store, environment switches, cache version keys, and the export, proposal and advice schema
contracts.

## Status

0.4.0. The interfaces are stable — the export schema established at 0.1.0 is unbroken, and every new convention
family added since flows through the same generic per-fact serialization, never a hand-listed schema addition — but
the objective changed under it: `grain propose` and the brownfield-miner numbers in this file are new since
2026-09-05; 0.4.0 is the first build that ships them (`grain propose`, the proposal contract, the type levels, the JVM source-root relations, and `grain advise` over a graph that already exists). The agent-facing surface (`where`, `check`, `how`, the hooks)
is the earlier objective, unchanged in behaviour, kept because it still works and nothing here has replaced it.

## The Yggdrasil family

Four tools, one thesis: **make an AI coding agent prove correctness, stage by stage.** Because "done" isn't done. Each is a checkpoint at a different point in the pipeline, where the agent has to show its work before it continues.

| Tool | Stage | What it makes the agent prove |
|---|---|---|
| **[Ratatoskr](https://github.com/krzysztofdudek/RatatoskrSkill)** | request → intent | Keeps the agent talking to you in plain words, not code, so you can follow what it's doing. |
| **[Urd](https://github.com/krzysztofdudek/UrdSkill)** | intent → code | When the spec is ambiguous, it consults the source of truth and asks — it doesn't guess. |
| **[Yggdrasil](https://github.com/krzysztofdudek/Yggdrasil)** | code → architecture | Every change satisfies the rules that govern it, checked before the agent moves on. |
| **[Researcher](https://github.com/krzysztofdudek/ResearcherSkill)** | code → measured result | Point it at a metric and it runs experiments — hypotheses kept and discarded. |

Two more sit alongside the chain rather than inside it. **[Horde](https://github.com/krzysztofdudek/Horde)** doesn't own a stage — it's what you add when a mission needs more than one agent to move through all four at once, holding every agent it raises to the same standards. **Grain** (this one) reads the conventions a codebase actually practices instead of the ones someone declared — the same seam as Yggdrasil from the other side, and the reason this repository exists.

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
A/B comparison of a coding agent's output and cost; `tests/stress/reconstruct.mjs`, `propose.mjs`, `too-much.mjs`,
`law-loop.mjs` and `integration-stress.mjs` are the reconstruction and proposal instruments behind
[docs/results.md](docs/results.md), each runnable against any repository that has (or, for the last, does not need)
a hand-written `.yggdrasil/` graph.

## Attribution and licence

The engine is derived from the roots prototype in [Yggdrasil](https://github.com/krzysztofdudek/Yggdrasil), MIT
licensed, and carries that licence forward. Grain has no runtime dependency on Yggdrasil.

MIT.
