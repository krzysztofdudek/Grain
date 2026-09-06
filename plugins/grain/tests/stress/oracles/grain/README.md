# A hand-written architecture graph for this repository — the Grain oracle

`.yggdrasil/` beside this file is an architecture graph for the Grain repository itself, written by
hand from the code and the design record. It is not a proposal, it is not generated, and nothing in it
was derived from, checked against, or informed by grain's own miner.

Its whole value is that independence. It exists so that grain's reconstruction and proposal can be
scored against a graph a careful maintainer would actually commit — precision and recall of recovered
types, nodes, relations, cycles and rules — and a measurement against a target the miner helped write
would be worth nothing.

## Provenance

| | |
|---|---|
| Written against | `3d249bf` (2026-09-05), branch `claude/grain-agent-tool-b89y0x` |
| Author | one worker session, no sub-agents |
| Yggdrasil version | v5.8.0, graph schema `5.2.0` |
| Written from | the repository's code and its design record |
| Validated with | the real `yg` binary, on a staged copy, never in the repository root |

### Updated since

**2026-09-06 — the ticket-117 split (`87de53a`).** `plugins/grain/engine/core.mjs` was split into thirty
modules, so the graph was updated the way a maintainer updates a graph when files move: the
`mining-core` type's `when` names the whole engine instead of one path, `engine-module` names its three
modules directly, `mining-core` may now call its own type (the engine's modules call each other), and
the one `Mining Core` node became four ownership-sized ones — `Engine Facade`, `Mining`, `Query
Implementations`, `Model Assembly`. Nothing else moved: no aspect, no rule, no threshold, no verdict.

**2026-09-06 — the ticket-124 split.** `plugins/grain/engine/propose.mjs` (265 284 characters) became a
facade over sixteen `propose-*.mjs` modules, and `plugins/grain/engine/grain.mjs` (160 272) kept `main`
and became the dispatcher alone beside nine `grain-*.mjs` modules. The graph followed the code the same
way it did for 117: `proposal-writer` and `cli-dispatch` name their families by prefix
(`plugins/grain/engine/propose*.mjs`, `.../grain*.mjs`) instead of one path each, `mining-core`'s
complement excludes those two prefixes rather than two files, and the `Proposal Writer` and `Query
Dispatcher` nodes map seventeen and ten files instead of one. The node count did not change: each of the
two is still one owner, one charter, one context. No aspect, no rule, no threshold and no verdict moved —
except that `engine/file-size-budget` now refuses nothing at all, and its description says so.

**2026-09-06 — ticket 123: `engine/file-size-budget` promoted, `max_prompt_chars` measured down.** With
the debt 117/124 paid and `engine/file-size-budget` costing nothing to satisfy, its `status` moved
`advisory` → `enforced` — nothing else about the rule changed, and a staged `yg check --approve
--only-deterministic` before and after is byte-identical output. Separately, `reviewer.tiers.standard.
max_prompt_chars` (600 000, set by a 572 KB file that no longer exists) was re-measured against the
CURRENT graph: `buildPairPrompt`'s own assembly (`source/cli/src/llm/prompt.ts`), replicated exactly
over every node carrying a prose aspect and its real mapped files, gives 279 770 characters for
`plugin/engine/mining` + `engine/no-language-name-lists` — the largest of the nine (node, aspect) pairs
measured, ahead of `plugin/engine/queries` (274 928) and `plugin/engine/model` (64 814); `plugin/dispatch`
(166 656 bytes of source across its ten files) cannot beat either. `max_prompt_chars` is set to 300 000 —
the smallest round ceiling above the measurement, not the measurement itself, so an ordinary file edit
does not require re-touching this config. (A staged `yg check --approve` was tried first to read the
figure back off a real fill's recorded `promptChars`; it aborted before any reviewer call — a pre-existing
`repo/docs` deterministic refusal unrelated to this ticket — which is why the number here comes from
reproducing the assembly function directly instead.)

**Every number below, and every number in the 108 measurement, was produced against the graph as of
`3d249bf`** — before these updates. They stay attributable to that graph; a re-measurement against the
updated one has not been run.

### What was read

- Every non-test source file under `plugins/grain/`: the two entry points, all nine engine modules
  (module boundaries, imports, headers, and the section structure of the 572 KB mining core), the
  vendored relation machinery and parser runtime, the grammar assets and their manifest, both build
  scripts, all nineteen command documents, the skill, all four hook configurations, and every manifest.
- The test tree by shape: which suites exist, what each imports, what each spawns, how the flat
  conformance suite differs from the split relation suites, and which guardian tests exist.
- `README.md`, the four documents under `docs/`, `.system/decisions.md` in full, and
  `.claude/skills/director/reference/system.md`.
- Yggdrasil's own format, from its source of truth only: `yg prime`, every schema under
  `yg schemas`, every topic under `yg knowledge`, and Yggdrasil's own hand-written `.yggdrasil/` read as
  a worked example.

### What was deliberately NOT read

Refused on purpose, to keep this graph independent of the thing it will be used to measure:

- `grain propose`, `grain export`, `grain report` — never run, in any form.
- Anything under `.yggdrasil-proposal/`, `plugins/grain/tests/stress/results/`, and the research reports
  `proposal-*.md`, `reconstruction-*.md`, `integration-stress.md`, `too-much-*.md`.
- `plugins/grain/engine/propose.mjs` — its output shape. Its **import lines only** were read, because
  the relation model has to be true and an import list carries nothing about what the file produces.
  Named here rather than left implicit.
- The bodies of the measurement instruments under `plugins/grain/tests/stress/`. They were classified,
  mapped and related from their filenames and their import lines alone. This is why the one rule about
  them, `instruments/measure-do-not-gate`, is advisory: it states their contract from the project's own
  working model, and nobody has checked that each instrument keeps it.

Two facts about the repository's own history and design were unavoidably in view and are declared here:
this repository's issue tracker contains a ticket about NUL bytes in the stress instruments, and one
about command reachability. Both informed rules below. Neither came from the miner.

## What is in it

| | |
|---|---|
| Node types | **35** — 2 organizational (`project`, `area`) and 33 classifying, 26 of them `enforce: strict` |
| Classifying coverage | 1470 / 1470 tracked files; every file matches **exactly one** type, none matches two |
| Nodes | **42** — 7 organizational areas, 35 owning files (**45** since the 117 update: the engine node became four) |
| Relations | **49** — 31 `calls`, 18 `uses`; `relations.default: deny` on every type |
| Ports | **1** — `constants` on the constant table, carrying one rule to all nine of its consumers |
| Flows | 0 |
| Aspects | **30** — 22 deterministic (`check.mjs`), 8 prose (`content.md`) |
| Aspect status | 23 enforced · 6 advisory · 1 draft |
| Drills | 11 aspects ship a `drills/` corpus, 30 cases in total — 30 pass, 0 miss, 0 false alarm |
| Dependency cycles | **0** in the product, by construction and confirmed by the structural-cycle validator |

### The 33 classifying types

Product runtime: `entry-cli`, `entry-mcp`, `cli-dispatch`, `mining-core`, `engine-config`,
`engine-history`, `engine-module`, `proposal-writer`, `vendored-relations`, `vendored-runtime`,
`grammar-asset`, `build-script`.

Agent surface: `agent-command`, `agent-skill`, `hook-config`, `plugin-manifest`,
`marketplace-manifest`.

Tests: `test-suite`, `test-relations-unit`, `test-relations-e2e`, `test-relations-e2e-cli`,
`test-harness`, `stress-instrument`, `stress-corpus`.

Repository: `repo-instrument`, `fixture-builder`, `product-readme`, `doc-page`, `ci-workflow`,
`director-tool`, `director-doc`, `director-state`, `repo-config`.

The type cut is finer than the node cut on purpose, per this project's own ruling that rules and types
are cut as fine as the evidence supports while nodes stay ownership-sized. `coverage.type_level` is on,
so a per-file rule binds to a file through its type with no node needed.

The sharpest example is `engine-history`. It is split off `engine-module` for exactly one reason: it is
the only pure-engine module that legitimately spawns a subprocess. Splitting it lets
`engine/no-subprocess-in-analysis-layer` be a plain type default on every other engine module — no
carve-out, no exception list, no suppression anywhere. The permission became a property of what the
module IS, visible in the graph.

### The rules

Deterministic (22) — free, keyless, and what a push could gate on today:

| Rule | Status | Errs | Holds today? |
|---|---|---|---|
| `engine/no-runtime-dependencies` | enforced | under | yes |
| `engine/no-network-at-runtime` | enforced | under | yes (first-party) |
| `engine/no-subprocess-in-analysis-layer` | enforced | under | yes |
| `engine/constants-only-in-config` | enforced | under | yes |
| `engine/no-test-or-instrument-import` | enforced | under | yes |
| `engine/file-size-budget` | enforced | exact | yes (since 124; promoted 123) |
| `source/no-raw-control-bytes` | **advisory** | under | **no — 3 files** |
| `vendor/generated-banner` | enforced | under | yes |
| `vendor/network-calls-are-browser-only` | **advisory** | over | 5 sites, all browser-only |
| `grammars/asset-triad` | enforced | exact | yes |
| `grammars/extension-map-bijection` | enforced | exact | yes |
| `agent-command/contract` | enforced | under | yes |
| `agent-command/verb-parity` | enforced | exact | yes |
| `hooks/verb-exists` | enforced | under | yes |
| `hooks/never-blocks` | **advisory** | over | yes, but the check under-constrains |
| `release/single-version-of-record` | enforced | exact | yes |
| `release/one-plugin-description` | enforced | exact | yes |
| `stress/instruments-are-not-tests` | enforced | under | yes |
| `stress/every-instrument-has-a-guardian-test` | **advisory** | under | **no — 1 instrument** |
| `tests/node-test-runner-only` | enforced | under | yes |
| `tests/relations-suites-are-black-box` | enforced | under | yes |
| `docs/internal-links-resolve` | enforced | under | yes |

Prose (8) — where prose is the only honest form:

| Rule | Status | Why prose |
|---|---|---|
| `answers/never-invent-authority` | enforced | what a printed number may appear without |
| `answers/degrade-never-crash` | enforced | "degrades honestly" is a judgement about wording |
| `engine/no-language-name-lists` | enforced | "this is a name list" is intent, not a pattern |
| `engine/cache-version-keys` | enforced | whether a change alters extraction output |
| `export/schema-is-a-published-interface` | enforced | "this rename is semantically breaking" |
| `instruments/measure-do-not-gate` | **advisory** | contract stated, conformance unread by design |
| `docs/claims-carry-their-measurement` | **advisory** | **the front door is stale in two places** |
| `director/state-through-tools-only` | **draft** | half of it was inferred, not confirmed |

### The refactor backlog this graph records

Rules the maintainer means but the code does not satisfy today. Each is advisory rather than enforced,
and each aspect's own description says where it is violated and what the exit is:

1. **`engine/file-size-budget` — three modules over the reviewer budget.** The mining core is 569 502
   characters (11.4× the 50 000-character default), the proposal writer 160 999 and the dispatcher
   158 867 (3.2× each). The number
   is derived, not chosen: it is the ceiling one assembled reviewer prompt is checked against, so a
   module above it cannot be judged as a whole by anything. This is also why the reviewer ceiling in
   `yg-config.yaml` is set an order of magnitude above the default, and that comment points back here.
   The largest standing structural debt in the product.
   **PAID IN FULL (tickets 117 and 124, 2026-09-06).** The mining core is thirty modules, the proposal
   writer seventeen and the dispatcher ten, every one of them inside the budget and every split a pure
   move with grain's output byte-identical to what the single files produced. This rule refuses nothing:
   three refusals, then two, now zero. The exception list in `tests/engine-module-size-budget.test.mjs`
   is empty and a test keeps it empty. What is left is a decision, not work: the rule could be promoted
   from `advisory` to enforced at no cost.
2. **`source/no-raw-control-bytes` — three files carry a raw control byte.** A literal SOH inside a
   comment in the mining core (the separator byte the original vendoring was meant to have escaped
   everywhere), and control bytes in two history test files. git treats such a file as binary, so it
   stops diffing.
3. **`stress/every-instrument-has-a-guardian-test` — seven of eight instruments have one.** The
   scale-ladder corpus runner does not.
4. **`docs/claims-carry-their-measurement` — the front door has drifted.** It describes the protocol
   server as exposing four tools where six ship, and lists eleven of the nineteen slash commands.
   Neither is a false measurement; both are the drift the rule exists to catch.
5. **`vendor/network-calls-are-browser-only` — five network call sites in the vendored parser
   runtime.** All in browser-only branches the platform never takes. Recorded rather than enforced,
   because enforcing it would demand editing vendored code, which this project deliberately does not do.
   What the rule buys is that the count is known: if it moves, someone looks.

### What is deliberately NOT in it

- **No flows.** A flow is a business process with node participants. This product is one query surface
  over one analysis pipeline; the honest number is zero, and inventing four would have inflated a recall
  denominator for free.
- **`log_required` is off on every type.** A maintainer adopting this on a live repository would turn it
  on for the engine types. It is off here because this graph has no history: the log gate is
  all-or-nothing at fill time, so a single node with drifted source and no entry makes `--approve` fill
  *nothing*, which would have made the per-rule results below unobtainable. That is a property of a
  graph written in one sitting, not a judgement about the gate.
- **No suppressions.** Not one `yg-suppress` marker anywhere. Every rule that the code violates is
  advisory and says so, which is the honest form; a suppression would have hidden the backlog this graph
  is partly for.
- **No agent-rules install.** `yg init` would write an `AGENTS.md` digest block into the repository
  root. This graph is an artifact, not an adopted installation, and writing outside its own directory
  was out of scope. `yg check` reports that as one advisory warning; it is not a graph defect.

## Validation

Validated on a staged copy at
`/tmp/.../w108-grain/stage/` — a full `cp -r` of the worktree with this `.yggdrasil/` placed at its
root. The repository root was never used and nothing was written to it.

### `yg check` — loads clean

```
yg check: FAIL  42 nodes · 1470/1470 files (1470 node-owned, 0 type-covered, 0 excluded) · 30 aspects
                · 0 flows · 1723 verified (1723 deterministic, 0 LLM) · 1 draft

Errors (10):
  plugin/dispatch        2 unverified (0 deterministic-free, 2 LLM), 0 refused
  plugin/engine/config   1 unverified (0 deterministic-free, 1 LLM), 0 refused
  plugin/engine/core     3 unverified (0 deterministic-free, 3 LLM), 0 refused
  plugin/engine/export   1 unverified (0 deterministic-free, 1 LLM), 0 refused
  plugin/engine/history  1 unverified (0 deterministic-free, 1 LLM), 0 refused
  plugin/entry           1 unverified (0 deterministic-free, 1 LLM), 0 refused
  plugin/mcp             1 unverified (0 deterministic-free, 1 LLM), 0 refused

Warnings (13):
  (repo)                          0 unverified, 0 refused, 1 other
  plugin/dispatch                 0 unverified, 1 refused
  plugin/engine/core              0 unverified, 2 refused
  plugin/engine/propose           0 unverified, 1 refused
  plugin/engine/vendor-runtime    0 unverified, 1 refused
  plugin/tests/stress             1 unverified (1 LLM), 0 refused
  plugin/tests/suite              0 unverified, 3 refused
  repo/docs                       1 unverified (1 LLM), 0 refused
  repo/instruments                1 unverified (1 LLM), 0 refused
  repo/readme                     1 unverified (1 LLM), 0 refused
```

**Zero load-blocking findings.** No `architecture-invalid`, no `architecture-cycle`, no
`type-strict-orphan` or `type-strict-misplaced`, no `strict-overlap-conflict`, no `unmapped-files`, no
`relation-undeclared-dependency`, no `structural-cycle`, no `port-missing-consumes`, no
`when-unknown-*`. Every one of the 33 classifying types resolves, all 42 nodes instantiate, all 49
relations are legal under the allow-list, and all 1470 tracked files are owned.

Three rounds were needed to get there, and all three failures were mine, not the repository's:

1. Every type was rootable only through `area`, which is its own parent — an `architecture-cycle` that
   traps the whole type system. Fixed by adding a rootable `project` type.
2. Three real dependencies were undeclared: the unit harness reaching the mining core and the vendored
   extractors, an instrument reaching the proposal writer, and the suite reaching the relation harness.
   The live relation-conformance check found all three, named the file and line, and printed the stanza
   to add. Declared.
3. Two checks reached outside their allowed reads (a directory listing where a component reference was
   the right tool) and one anchored a violation on a file it had not been given. Rewritten.

The remaining **10 errors are all unverified LLM pairs** — no reviewer was run for this graph, so no
prose rule has a verdict. They are errors rather than warnings because those five rules are genuinely
enforced; a maintainer adopting this graph buys those ten reviews once. The **13 warnings** are the four
advisory prose rules (also unverified), the eight advisory deterministic refusals that ARE the recorded
backlog, and one notice that no agent-rules digest is installed at the repository root — an install
artifact, deliberately not written (see above).

### `yg check --approve --only-deterministic` — the keyless gate

**1731 deterministic pairs, 1723 verified, 8 refused, 0 infrastructure failures, 0 reviewer calls.**

Per aspect:

| Deterministic aspect | Pairs | Result |
|---|---|---|
| `tests/node-test-runner-only` | 1052 | all pass |
| `source/no-raw-control-bytes` | 232 | **3 refused** — one SOH each at `core.mjs:2629`, `history-large-state.test.mjs:56`, `history-path-quoting.test.mjs:71` |
| `engine/constants-only-in-config` | 188 | all pass |
| `tests/relations-suites-are-black-box` | 53 | all pass |
| `engine/no-network-at-runtime` | 36 | all pass |
| `engine/no-runtime-dependencies` | 36 | all pass |
| `engine/no-test-or-instrument-import` | 36 | all pass |
| `engine/no-subprocess-in-analysis-layer` | 31 | all pass |
| `vendor/generated-banner` | 26 | all pass |
| `agent-command/contract` | 19 | all pass |
| `engine/file-size-budget` | 7 | **3 refused** — 569 502 / 160 999 / 158 867 characters |
| `docs/internal-links-resolve` | 5 | all pass |
| `agent-command/verb-parity` | 1 | pass |
| `grammars/asset-triad` | 1 | pass |
| `grammars/extension-map-bijection` | 1 | pass |
| `hooks/never-blocks` | 1 | pass |
| `hooks/verb-exists` | 1 | pass |
| `release/one-plugin-description` | 1 | pass |
| `release/single-version-of-record` | 1 | pass |
| `stress/instruments-are-not-tests` | 1 | pass |
| `stress/every-instrument-has-a-guardian-test` | 1 | **refused** — `run-corpus.mjs` |
| `vendor/network-calls-are-browser-only` | 1 | **refused** — 5 sites in the parser runtime |

**Every enforced deterministic rule passes. All eight refusals are on advisory aspects, and all eight
are the backlog this graph is meant to record.** No rule was made advisory to get a green run: each
advisory rule says in its own description what it is waiting for.

### `yg drill` — 30 cases, 11 aspects

```
engine/constants-only-in-config          3 pass · 0 MISS · 0 FALSE-ALARM · 0 unsupported
engine/file-size-budget                  1 pass · 0 MISS · 0 FALSE-ALARM · 0 unsupported
engine/no-network-at-runtime             4 pass · 0 MISS · 0 FALSE-ALARM · 0 unsupported
engine/no-runtime-dependencies           3 pass · 0 MISS · 0 FALSE-ALARM · 0 unsupported
engine/no-subprocess-in-analysis-layer   3 pass · 0 MISS · 0 FALSE-ALARM · 0 unsupported
engine/no-test-or-instrument-import      3 pass · 0 MISS · 0 FALSE-ALARM · 0 unsupported
hooks/never-blocks                       3 pass · 0 MISS · 0 FALSE-ALARM · 0 unsupported
source/no-raw-control-bytes              2 pass · 0 MISS · 0 FALSE-ALARM · 0 unsupported
tests/node-test-runner-only              3 pass · 0 MISS · 0 FALSE-ALARM · 0 unsupported
tests/relations-suites-are-black-box     2 pass · 0 MISS · 0 FALSE-ALARM · 0 unsupported
vendor/generated-banner                  3 pass · 0 MISS · 0 FALSE-ALARM · 0 unsupported
```

The eleven aspects with drills are the ones whose check is purely file-local and therefore runnable in
the graphless drill runner. The nine that read across components (the manifests, the verb tables, the
grammar triad, the instrument pairing) cannot be drilled without a graph, and shipping a drill for them
would be shipping a fixture that never runs.

Two `satisfies-*` cases are there specifically to pin the absence of a false alarm: a module that emits
source code as TEXT containing a package import (both the mining core and the proposal writer really do
this), and a file that mentions a networking name in a comment and a string. Both must pass, and do —
which is what earns `errs: under` on those two rules.

### `yg structure` — no cycles anywhere

```
At depth 1:  2 groups, 1 dependency    — all one way, no cycles
At depth 2: 14 groups, 14 dependencies — all one way, no cycles
At depth 3: 27 groups, 44 dependencies — all one way, no cycles
At depth 4: 30 groups, 49 dependencies — all one way, no cycles
```

The engine's dependency graph is acyclic with the constant table as its sink, and no cycle exists at any
level of the hierarchy. Anything scored against this oracle should expect **zero** recoverable cycles,
and a recovered cycle here is a false positive, not a find.

`yg structure` does name four tunnels — the relation harness and the relation unit cases reaching five
levels across the tree into the mining core and the vendored extractors. That is real and it is
deliberate: a unit case that pins what one extractor returns has to reach the extractor. It is recorded
here rather than designed away.

## Notes for whoever measures against this

- **Type names are opinions; type BOUNDARIES are the claim.** Score a recovered type against the file
  set it selects, not against what it is called. `mining-core` and "the big engine file" are the same
  claim.
- **The three-way split of `plugins/grain/tests/` is load-bearing and is the hardest thing here to
  recover.** The flat conformance suite is deliberately mixed white- and black-box; the relation suites
  are deliberately split by kind; the instruments are deliberately outside the gate. A recovery that
  reads all 1064 files under `tests/` as one thing has lost the only place in this repository where the
  test discipline is designed in.
- **Two nodes are single files by design** (`plugin/entry`, `plugin/mcp`) and several more are single
  files because the file IS its own locality. Do not score a single-file node as over-fragmentation
  without checking whether the file is a boundary.
- **The `constants` port carries one rule across nine boundaries.** A recovery that finds the nine
  import edges but not the rule they carry has found the dependency and missed the architecture.
- **Ten of the 49 relations have no import behind them.** Seven are declared so a rule may read across a
  boundary — a catalogue reading the manifests it must agree with, a command document reading the
  dispatcher whose verbs it must match, the grammar assets reading the extension map they are checked
  against — and each is commented as such in its node file. Three more record a spawn of the entry
  point rather than an import. A recovery scored on static imports alone will correctly not find any of
  these, and they should not count against it.
