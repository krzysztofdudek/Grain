# How much of a hand-written `.yggdrasil/` does Grain recover on its own?

**Question.** The north star (`north-star-brownfield-miner`) says Grain's job is to shorten the road from
`git clone` of a foreign repository to a working `.yggdrasil/`. Instrument G' answers the only question that
settles whether it does: point Grain at a repository that **already has** a hand-written graph, and count how
much of that graph Grain proposes by itself.

**Answer, in one line.** On Yggdrasil — 3019 tracked files, 38 node types, 427 nodes, 70 aspects — Grain's
`export` alone recovers **19 of 36 classifying node types at Jaccard ≥ 0.5 (12 at ≥ 0.8)**,
**1105 of 1236 declared node→node relations (recall 0.894) at precision 0.998**, **both dependency cycles
`yg advise` nominates**, and both of the architecture's `deny` facts it speaks about — but only **83 of 393
node mappings at J ≥ 0.5**, and it names the identifier behind **11 of 57 deterministic aspects**. The layer
Grain reproduces is the **architecture** (types, module boundaries, dependencies, cycles). The layer it does
not reproduce is the **rule content** (what each aspect forbids) and the hand graph's chosen **granularity**
(single-file nodes).

The oracle is fallible (`oracle-is-fallible-report-disagreements-symmetrically`): every disagreement below is
split into (a) miner miss, (b) Yggdrasil graph debt — informational, nothing here proposes changing Yggdrasil —
and (c) undecidable without a human.

---

## 1. Method

`plugins/grain/tests/stress/reconstruct.mjs` — a standalone instrument, zero changes under
`plugins/grain/engine/`. It drives `grain export` as a subprocess, reads the `.yggdrasil/` YAML, and counts.

- **Graph side.** `.yggdrasil/yg-architecture.yaml` `node_types.<id>.when` (path / content / all_of / any_of /
  not) and every `model/**/yg-node.yaml` `mapping:` are expanded against `git ls-files` with minimatch
  semantics (`*` within a segment, `**` across, `{a,b}`, a bare directory prefix covering everything beneath,
  `content:` as a regex over the first 256 KB). `coverage.excluded` from `yg-config.yaml` is honoured — on
  Yggdrasil itself it is empty; on the examples it removes 5 of 19 files, so the path is exercised.
- **Grain side.** Candidate file-sets are grain's partitions, its modules, its role groups and its directory
  cards, each labelled by which it is. Module assignment is not re-derived: the instrument imports
  `refineModOf` from `engine/relations.mjs`, so a module id here is byte-identical to the one grain's own
  `moduleGraph` used. The run's self-check (`moduleAssignmentMismatch`) came back **0** on Yggdrasil — every
  one of the 37 module file-counts reproduced exactly.
- **YAML.** The grain plugin has **zero runtime dependencies** and no `node_modules/` at all, so the `yaml`
  package is not available and adding it would give the plugin its first runtime dep for a test-only
  instrument. The instrument ships a YAML subset parser instead. It was validated by diffing its output
  against the real `yaml` package over **830 files** (all 521 under `.yggdrasil/`, plus `examples/**`,
  `source/cli/tests/fixtures/**` and `.github/**`), comparing every field including descriptions:
  **830 identical, 0 differing, 0 throwing.** Two real parser bugs were found and fixed by that diff (a flow
  collection opened on its own line; a blank line inside an open quoted scalar) and a third by the guard test
  (a trailing `#` comment on a sequence item).

**Wall time.** Cold `grain export` on Yggdrasil: **434 s** (180.5 s history walk over 1510 commits / 14 835
blobs, then 253.9 s indexing 2290 files). The instrument itself, on that export: **2.5 s**. Each example
end-to-end (fresh repo, `grain export --no-history`, `yg advise`, instrument): **0.39–0.42 s**, of which the
instrument is 0.3 s.

---

## 2. (a) Node types → grain partitions and modules

| stratum | types | J≥0.5 | J≥0.8 | mean J | disagreements a/b/c |
|---|---|---|---|---|---|
| all | 36 | 19 | 12 | 0.550 | 7 / 2 / 8 |
| source | 34 | 17 | 11 | 0.539 | 7 / 2 / 8 |
| test-dominated | 2 | 2 | 1 | 0.741 | 0 / 0 / 0 |
| grain parsed ≥50% of the set | 32 | 17 | 11 | 0.550 | 6 / 1 / 8 |
| grain parsed <50% (no grammar) | 4 | 2 | 1 | 0.547 | 1 / 1 / 0 |

Two of the 38 types are organizational (`project`, `module` — no `when`, nothing to recover). None of the 36
classifying types is unmeasurable: every `when` expands to at least one tracked file.

**Nine types come back exactly (J = 1.0):** `entry-point`, `migration`, `ast-adapter`, `structure-adapter`,
`relations-adapter`, `formatter`, `types`, `utility`, `build-script`. Another three land above 0.93:
`engine` (0.976, 80 files), `reference-catalogue` (0.935, 351), `test-fixture` (0.867, 578). The confound
worth naming: those are the types whose `when` is one directory, and grain's module rule is one directory —
they agree because both read the same layout, not because Grain inferred anything. The stratified line above
shows the test-dominated types are *not* what inflates the headline (2 types, and they score above average);
what inflates it is directory-shaped types generally.

### (a) class a — miner miss: 7 types Grain HAS but not as a partition or module

These are the actionable ones. Grain reproduces each set at a level the partition/module comparison does not
look at:

| type | files | best partition/module J | Grain has it as | at J |
|---|---|---|---|---|
| `portal-frontend-vendor` | 1 | 0.036 | group `templates/portal::r14 node+size` | **1.00** |
| `portal-server` | 5 | 0.185 | directory `source/cli/src/portal/server` | **1.00** |
| `portal-engine-api` | 10 | 0.370 | directory `source/cli/src/portal/api` | **0.90** |
| `portal-frontend-core` | 25 | 0.373 | directory `source/cli/src/templates/portal` | 0.61 |
| `llm-provider` | 7 | 0.412 | group `llm::r0 aspect+verify` | 0.57 |
| `parser-adapter` | 6 | 0.240 | group `io::r2 parse+aspect` | 0.50 |
| `reviewer-dispatch` | 2 | 0.024 | group `core::r18 llm+phase+run` | 0.50 |

**This is the single largest, cheapest recovery available.** Grain's own directory cards and role groups
already carry sets the hand graph turned into node types; nothing surfaces them as type candidates. Promoting
directory cards and role groups to first-class type proposals would move type recall from 19/36 to as many as
26/36 without any new mining. That is ticket 094's raw material.

### (a) class b — Yggdrasil graph debt (informational): 2 types

- `repo-config` (54 files, best J 0.255) — spreads over 10 grain modules, the largest (`.`) holding 26% of the
  set. It is a hand-drawn bucket of root dotfiles, `docs/public/**`, `tools/**` and CLI package files: a
  category, not a locality. No miner reading layout can propose it.
- `ci-config` (16 files, J 0.429) — spreads over 3 modules; `source/cli` is 56% of the set and 64% of the
  module. Same shape, smaller.

Both are legitimate as hand-written types. They are recorded here only so they are not scored as Grain's
failure.

### (a) class c — undecidable, 8 types: granularity, not blindness

Every one is "Grain drew the same locality one level coarser". `template` (4 files) `schema-doc` (6) and
`knowledge-doc` (16) are three hand types inside grain's single `source/cli/src/templates` module;
`portal-contract` (1) and `portal-pipeline` (11) sit inside grain's `source/cli/src/portal` partition;
`rule-script` (36) is a slice of grain's `.yggdrasil/aspects` partition; `command-support` (14) is a slice of
`source/cli/src/cli`; `llm-subprocess-base` (1) of `source/cli/src/llm`. Which grain is right is a maintainer's
call — but note that four of these hand types are separated from their neighbours by a `content:` predicate
(`command` vs `command-support` is literally "does this file export `register<X>Command`"), and Grain never
reads the graph's own `when` vocabulary. A renderer that offered the coarse cut plus grain's role markers as
the candidate sub-cut is the honest surface here.

---

## 3. (b) Node `mapping:` → grain partitions, modules, groups and directories

| | nodes | J≥0.5 | J≥0.8 | mean J | disagreements a/b/c |
|---|---|---|---|---|---|
| all with a mapping | 393 | 83 | 53 | 0.266 | 0 / 1 / 309 |
| maps 1 file | 250 | 40 | 29 | 0.218 | 0 / 0 / 210 |
| maps 2–4 files | 77 | 15 | 8 | 0.259 | 0 / 0 / 62 |
| maps 5+ files | 66 | 28 | 16 | 0.458 | 0 / 1 / 37 |
| grain parsed <50% of the set | 16 | 4 | 1 | 0.283 | 0 / 1 / 11 |

34 further nodes carry no `mapping:` at all (organizational nodes) and are excluded rather than scored.

**This number is confounded and the stratification says how.** 250 of 393 nodes map exactly one file. A
one-file set can only reach J ≥ 0.5 against a candidate of one or two files, so the headline mostly measures
the hand graph's chosen granularity, not Grain's sight. On nodes that map five or more files the recall is
**28/66 (0.42)** with mean J 0.458 — nearly double the one-file stratum. Class (a) is **zero** here by
construction: the comparison already searches every level Grain publishes, so there is no finer level for
Grain to be hiding the set in.

The one class (b) is `cli/config/quality` (7 files, J 0.313): its mapping crosses `source/cli` and
`source/cli/src/core`, and is 36% of the larger module — a hand grouping by topic, not by place.

**Worst misses, named.** All are class (c) granularity: `cli/reference/relations/{go,rust,cpp,ruby,python}`
(12–22 files each, J 0.037–0.067) are per-language slices of grain's single `reference/relations` module;
`cli/knowledge-concepts` (5) and `cli/schemas` (6) are slices of `source/cli/src/templates`; and the whole
`cli/tests/e2e/*` and `cli/tests/unit/*` family (one file each, J 0.003–0.009) are slices of grain's e2e and
unit partitions. Where the best match came from is itself informative: **group 182 · directory 131 · module 72
· partition 8** — role groups and directory cards, not partitions, are what actually matches a hand node.

---

## 4. (c) Relations

**At the module→module granularity the ticket asked for:**

| declared relations | declared pairs | grain pairs | matched | recall (raw) | recall (measurable) | precision |
|---|---|---|---|---|---|---|
| 1261 | 68 | 65 | 61 | 0.897 | 0.924 | 0.938 |

| disagreement | class | n |
|---|---|---|
| declared pair, textual backing exists, grain resolved no edge | a — miner miss | 5 |
| declared pair with no code backing at HEAD at all | b — graph debt | 0 |
| declared pair out of a module grain resolves nothing from | c — undecidable (coverage gap) | 2 |
| grain-only pair the architecture allows but no node declares | b — graph debt | 0 |
| grain-only pair the architecture denies, or no dominant type | c — undecidable | 4 |

277 of the 1261 declared relations stay inside a single grain module and cannot appear at this granularity at
all — the module aggregation collapses 1261 relations into 68 pairs, so it measures the module graph, not the
relation graph.

**So the instrument also runs the same comparison at the hand graph's own granularity** (a file is owned by the
node whose `mapping:` names it most specifically; both sides aggregated to node→node):

| declared node pairs | grain node pairs | matched | recall | precision | files with an owning node |
|---|---|---|---|---|---|
| 1236 | 1107 | 1105 | **0.894** | **0.998** | 2087 / 3019 |

Precision 0.998 is real but must be read correctly: Yggdrasil's own `relation-undeclared-dependency` check is
enforced in CI, so essentially every static import in that repo is already declared. **This number measures
Yggdrasil's enforcement as much as Grain's accuracy** — on a repo without such a gate it would be much lower,
and only a run on such a repo can say how much.

The 131 node-pair misses are dominated by one shape: `cli/commands/* → cli/core/loader (calls)`,
`cli/check-render-{groups,header,views} → cli/core/check`, `cli/commands/{aspects,build-context,find,flows,
impact} → cli/core/loader`. These are relations declared for a dependency reached **through** an intermediary
(`loadGraphOrAbort` in the command-support layer), so no direct import exists for Grain to resolve. That is a
legitimate declaration, not a Grain defect — and it is the reason the module-level split reports 0 class-(b)
misses while the node level has 131: at module granularity the intermediary lives in the same module as the
declarer, so the pair matches anyway. Only 2 pairs are grain-only.

The 5 class-(a) module misses are real resolver gaps: `source/cli/src/{ast,portal,relations} →
source/cli/src/model` (files that textually name `graph` from the model module with no resolved edge),
`source/cli/src/migrations → source/cli/src/core`, and `source/cli/src/cli → source/cli/tests`. The 2 class-(c)
misses are `reference/**` modules, out of which Grain resolves no edge at all — `relCoverage` discloses 852
files in bash/json/yaml with no resolution, and this is that gap showing up.

**`archNorms exp:"false"` vs the architecture's own `deny`:** Grain published exactly 2 established-negative
module pairs.

- `.yggdrasil/aspects → source/cli/src/core` — **agrees**: the architecture denies `rule-script → engine`
  (`default: deny`). Grain derived a real boundary from evidence alone.
- `source/cli/src/relations → source/cli/src/core` — **contradicts**: the architecture explicitly ALLOWS
  `relations-adapter → engine` (`calls: [engine, …]`), while Grain says the pair is established as not
  happening (share 0.941 over 34 scopes). Both are true statements about different things — the architecture
  states what is *permitted*, Grain what is *practiced* — and a renderer that presented the second as a
  proposed `deny` would be wrong. Recorded as class (c): a human decides.

---

## 5. (d) Cycles

`yg advise` nominates 2 loops; Grain's `moduleGraph.cycles` has 2. Both match at J ≥ 0.5; recall **1.0**,
advise-only 0, grain-only 0.

- advise `cli/core, cli/relations, cli/structure` → grain `source/cli/src/{core, relations, structure}`,
  J = 0.75 (the advise nodes' subtree also reaches `source/cli/src/migrations`).
- advise `cli/commands, cli/portal, cli/tests` → grain `source/cli/src/{cli, portal}`, J = 0.50. Grain's cycle
  is the two-member core of the same loop; the third member (`cli/tests`) is in the hand graph's version and
  not in Grain's, because Grain folds test files into their own modules.

This is the one comparison where Grain reproduces a hand-derived architectural judgement outright, on a
1500-commit repository, with no configuration.

---

## 6. (e) Deterministic aspects

| deterministic aspects | matched | a — miner miss | c — invisible by construction | unmeasurable | match rate (all) | match rate (measurable) |
|---|---|---|---|---|---|---|
| 57 | 11 | 20 | 6 | 20 | 0.297 | **0.355** |

13 further aspects are prose (`content.md`, judged by a model) and out of scope for a mechanical comparison.

Method: from each `check.mjs`, take the names it actually polices — members of a `new Set([...])` or of a
SHOUTY-const array, module specifiers, dotted API paths, camel/Pascal identifiers — excluding the check's own
imports and the tree-sitter grammar vocabulary it is written against (`'import_statement'`, `'body'`,
`'source'`), which is the AST library's alphabet and not the repository's. Then ask whether any Grain
convention statement, feature argument, observed value, group label, name token or marker on that aspect's own
attach set names the same identifier. Attachment follows Yggdrasil's real semantics: node aspects cascade to
the whole subtree, and an aggregate aspect (`source-hygiene`) expands through its `implies:` list.

**The three classes are the finding.**

- **20 unmeasurable** — the check names no literal at all. `source-no-raw-control-chars`, `portal/focused-file-size`,
  `command-contract-shape`, `command-exit-codes`, `e2e-public-surface`, `no-direct-console`,
  `no-side-effects-on-import`, `parser-yaml-guard`, `read-or-default-via-helper`, `docs-internal-links`, the
  five `reference/*` shape rules, and others are purely structural: they assert a shape, not a name. There is
  no identifier for a name-matcher to hit, in either direction.
- **6 invisible by construction** — the names the rule mentions occur **nowhere** in its attach set:
  `ci-actions-pinned` (`docker://`), `portal/no-network-egress` (`fetch`, `XMLHttpRequest`, `WebSocket`,
  `EventSource`, `sendBeacon`, `importScripts`), `portal/no-secrets-strings` (`yg-secrets`, `api_key`),
  `portal/focused-file-exports`, `schema-bump-bookkeeping`, `sibling-test-file`. **These rules forbid an
  absence.** A miner of what a repository *does* cannot see a rule about what it never does — not as a
  threshold to tune, but as a matter of what evidence exists. This is the honest boundary of the whole
  approach and it should be stated in any adoption surface rather than papered over.
- **20 miner misses** — the identifier is right there in the attach set and no Grain convention or marker names
  it. `no-direct-fs` (`node:fs` occurs in `core/fill-shared.ts`), `no-nondeterminism-direct` (`Date.now` in
  `core/advise-feed.ts`), `top-level-error-handler` (`unhandledRejection` in `bin.ts`),
  `portal/loopback-only` (`localhost`), `portal/loadgraph-nosecrets-flag` (`noSecrets`),
  `portal/approve-shells-cli-only` (`spawn`), `runcheck-injected-input-parity` and
  `portal/count-parity-via-reuse` (`runCheck`), `no-shell-injection` (`exec`), `posix-paths-source`
  (`path.sep`), `provider-redaction` (`prompt`), and nine more. This is the same fact
  `sub-gate-rows-are-the-product` already recorded from the other side: the real house rules sit **below** the
  λ gate as low-share candidates, so nothing certified names them. For an agent mid-edit, refusing to certify
  is correct. For a maintainer drafting aspects, the sub-gate row is the draft — and the 20 names above are the
  concrete list that surface would have to carry to be worth anything.

---

## 7. Smoke: the seven examples

Each example is a subtree of the Yggdrasil repo, not a repo of its own, so each was copied to a throwaway
directory, `git init`ed with one commit, and run with `--no-history`.

| example | files | types J≥0.5 | mean J | nodes J≥0.5 | relations (node level) | aspects | grain partitions | conventions | wall |
|---|---|---|---|---|---|---|---|---|---|
| checkout-flow | 14 | 2/2 | 1.000 | 0/4 | 3/3 | 0/1 (1 unmeasurable) | 0 | 0 | 0.3 s |
| failing | 12 | 1/1 | 1.000 | 1/2 | 1/1 | — | 0 | 0 | 0.3 s |
| layered-architecture | 9 | 3/3 | 1.000 | 3/3 | 2/2 | — | 0 | 0 | 0.3 s |
| no-secrets-in-logs | 10 | 2/2 | 1.000 | 1/2 | 1/1 | 0/1 | 0 | 0 | 0.3 s |
| passing | 13 | 1/1 | 1.000 | 1/2 | 1/1 | — | 0 | 0 | 0.3 s |
| pure-transforms | 9 | 1/1 | 0.667 | 1/1 | — | 0/1 (1 unmeasurable) | 0 | 0 | 0.3 s |
| type-level | 19 | 3/4 | 0.813 | 1/2 | — | 0/3 (3 unmeasurable) | 1 | 0 | 0.3 s |

Totals: **13 of 14 classifying types at J ≥ 0.5**, **8 of 16 node mappings**, **8 of 8 node-level relation
pairs**, **0 of 6 deterministic aspects** (5 of them unmeasurable). The examples confirm the instrument runs
on a foreign graph and that `coverage.excluded` is honoured (5 of 19 files removed in checkout-flow) — and
nothing more. At 9–19 files Grain produces **zero partitions and zero conventions** on every one of them: the
type matches all come from the module fallback, which on a repo this size is just "one directory per type".
These are a smoke test, not evidence.

---

## 8. Verdict

Grain today is a competent **architecture** miner and not yet a **rule** miner. Given a 1500-commit repository
and no configuration, it reproduces the dependency graph at the hand graph's own granularity to within 11%
(1105/1236), both of the architectural cycles a human derived, and half the node types outright — and, more
usefully, it already holds sets matching seven more node types inside its role groups and directory cards
where nothing currently surfaces them. Those seven are the cheapest recall available anywhere in this report.
Against that, it names the identifier behind 11 of 57 deterministic rules, and the accounting of the other 46
is the honest part: 20 rules assert a shape with no name to match, 6 forbid something the repository never
does — which a miner of practice cannot see at all — and 20 are genuine misses whose identifiers sit in plain
sight below the λ gate. The two numbers that flatter Grain and should not be quoted alone are the 0.998
relation precision (Yggdrasil's own CI forbids an undeclared import, so the hand graph is complete by
construction) and the exact type matches (nine of the twelve strongest are one-directory types, where Grain
and the maintainer agree because both read the same layout). The two that unfairly penalise it are the node
mapping recall (250 of 393 nodes map a single file, a granularity choice no Jaccard against a cluster can
reward) and any reading of the module→module relation table as the relation graph. Nothing here says Grain
cannot draft a `.yggdrasil/`; it says the draft it can write today is the architecture, that the rules would
have to come from the sub-gate lattice rather than the certified set, and that a rule about an absence will
never come from mining at all.

---

## 9. Reproducing this

```
node plugins/grain/tests/stress/reconstruct.mjs <repo-with-.yggdrasil> <out.json> --md \
  [--export <existing grain export json>] [--advise <captured yg advise text>] \
  [--yg <path/to/yggdrasil/bin.js>] [--no-history]
```

Without `--export` the instrument runs `grain export` itself and writes it to `<repo>/.grain/`. Without
`--advise`/`--yg`, comparison (d) is reported as `unmeasurable: N` rather than guessed. The instrument is
guarded by `plugins/grain/tests/reconstruct.test.mjs` (13 tests): an end-to-end run over a real 12-file git
repo with a 2-type `.yggdrasil/`, the type-recall arithmetic pinned against three synthetic exports with known
candidate sets, and unit coverage of the YAML parser, the glob matcher, `when:` expansion, the Jaccard tally,
the three-class verdict, the aspect literal extraction and the advise parser.

Yggdrasil was treated as read-only throughout: the only thing written there was `.grain/`, removed afterwards.
