# How much of a hand-written `.yggdrasil/` can Grain PROPOSE, and how much of the proposal is right?

**Question.** 093 measured what grain's export already HOLDS of a hand-written graph. This measures what grain
can WRITE: point the proposal renderer at a repository that already has a hand graph, produce a complete
proposed `.yggdrasil/`, and count both directions — recall (for each hand element, is there a proposed one?) and
precision (for each proposed element, is there a hand one?).

**Answer, in one line.** On Yggdrasil — 3019 tracked files, 36 classifying hand types, 393 mapped hand nodes,
57 deterministic hand aspects — the renderer writes **82 node types, 72 nodes, 215 aspect drafts (43 of them
executable `check.mjs`), 960 drill cases and 284 finer type alternatives in 17 seconds** from an existing export.
Against the hand graph it recovers **21 of 36 types at J ≥ 0.5 (24 counting the alternatives it offers), beating
093's 19/36 baseline and reaching 92% of the 26/36 that report called the ceiling**, at a precision of **23/82**.
It recovers **30 of 393 node mappings** — a number the granularity stratification below dismantles — and names
the identifier behind **6 of the 37 hand mechanical rules that have an identifier at all**. Yggdrasil's own CLI
loads the proposal — every node, every aspect, 100% file coverage — and returns **exactly one error**: a
dependency cycle
that exists in the code and that `yg advise` independently nominates. A drill sweep of all 43 rendered checks
returns **208 pass, 29 MISS, 0 FALSE-ALARM** — the `errs: under` contract, held.

The oracle is fallible (`oracle-is-fallible-report-disagreements-symmetrically`): a proposed element with no
hand counterpart is a raw disagreement, not a defect, and §6 says which kind each is.

---

## 1. Method

`plugins/grain/tests/stress/propose.mjs` — a standalone instrument, zero changes under `plugins/grain/engine/`.
It reads a `grain export`, imports engine modules read-only for the lattice vocabulary, and writes a proposal
directory. It never writes into the repository's own `.yggdrasil/` and refuses an out-dir that would.
The mapping from export field to Yggdrasil artifact is [proposal-renderer-design.md](proposal-renderer-design.md).

**Scoring** (`--score`) reads both graphs with the reconstruction instrument's own YAML parser and `when` /
`mapping` expanders, so the two reports are commensurable. Every type's `when` and every node's `mapping` is
expanded against `git ls-files`; recall is "for each hand element, the best Jaccard against any proposed
element", precision is the same comparison run the other way. The proposal's **alternatives are scored as a
separate, labelled stratum** — they are candidates the maintainer chooses between, never folded into the active
number.

**Validation** is a staged copy: every tracked file of the repository copied to a scratch directory, the proposed
`.yggdrasil/` dropped in, and Yggdrasil's own `bin.js check` run there. The repository is read-only throughout;
the only thing written to it was `.grain/`, removed afterwards.

**Wall time.** Cold `grain export` on Yggdrasil: **≈300 s** (1510 commits / 14 835 blobs, then 2290 files).
The renderer on that export, including the per-partition lattice over 18 056 scopes and the scoring pass:
**17 s**. The drill sweep of all 43 rendered checks through Yggdrasil's CLI: **86 s**.

**One confound before any number.** The export is at `5cca6b1`, one commit past the state 093 measured; it
carries 149 certified conventions where 093's carried 182. Re-running `reconstruct.mjs` on this export
reproduces 093's headline exactly (19/36 types, 83/393 nodes, 61/68 relation pairs, 2/2 cycles, 11/57 aspects),
so the two reports are on the same footing.

---

## 2. What the renderer produces

| | count |
|---|---|
| node types (active) | 82 |
| finer type alternatives (appendix, not active) | 284 |
| nodes | 72 (70 mapped + 2 organizational) |
| aspect drafts | 215 |
| — rendered as a deterministic `check.mjs` | 43 |
| — prose `content.md` | 172 |
| drill cases cut | 960 (no hold-out) / 276 (hold-out 2026-07-01) |
| per-partition lattice cells | 6552 |
| — in the sub-gate band (≥ 2/3, < 0.875, n ≥ 8) | 587 |
| `default: deny` emitted | 0 |
| established negatives kept as backlog instead | 2 |
| dependency cycles in the proposed node graph | 8 |
| conventions left out as unrenderable group-scoped | 16 |
| conventions left out as history facts, not rules (`filebirth`) | 16 |

---

## 3. (a) Node types — both directions

| direction | n | J≥0.5 | J≥0.8 | mean J |
|---|---|---|---|---|
| **recall** — hand type → proposed active type | 36 | **21** | 14 | 0.579 |
| **recall + alternatives** — hand type → active type OR offered alternative | 36 | **24** | 16 | 0.637 |
| **precision** — proposed active type → hand type | 82 | **23** | 14 | 0.298 |
| 093 baseline (best partition or module, nothing written) | 36 | 19 | 12 | 0.550 |

**Recall by hand-type size** — the number the headline hides:

| hand type maps | types | active | + alternatives | mean J |
|---|---|---|---|---|
| 1 file | 4 | 0 | 1 | 0.031 |
| 2–4 files | 3 | 1 | 1 | 0.361 |
| 5–20 files | 19 | 12 | 14 | 0.659 |
| 21+ files | 10 | 8 | 8 | 0.711 |

On hand types of five files or more — every type a maintainer would call a layer — recall is **20 of 29
(0.69)**, rising to **22 of 29 (0.76)** with the alternatives. The four one-file types (`entry-point`,
`portal-frontend-vendor`, `portal-contract`, `llm-subprocess-base`) are the hand graph naming a single file as
a category; a two-file floor for a type excludes them by construction, and the alternatives recover one.

**The two class-(a) recoveries 093 named as the cheapest available are both realised**, and both are now active
types rather than latent group memberships (a third, `portal-frontend-view`, comes from the same level):

| hand type | files | 093's best partition/module | proposed | J |
|---|---|---|---|---|
| `portal-server` | 5 | 0.185 | `source-cli-src-portal-server` (directory card) | **1.00** |
| `portal-engine-api` | 10 | 0.370 | `source-cli-src-portal-api` (directory card) | **0.90** |
| `parser-adapter` | 6 | 0.240 | alternative `…-io-parse-aspect-list` (role group, explicit list) | 0.50 |
| `llm-provider` | 7 | 0.412 | alternative `…-llm-aspect-verify-list` (role group, explicit list) | 0.57 |
| `llm-subprocess-base` | 1 | 0.059 | alternative `…-llm-available-is-content` (role group, `content:` predicate) | 0.50 |

**Precision, split by which level proposed the type** — this is the trade the design is making, priced:

| level | proposed | with a hand counterpart at J≥0.5 | precision |
|---|---|---|---|
| grain partition | 18 | 12 | **0.67** |
| grain module | 25 | 7 | 0.28 |
| directory card (one level below a partition) | 38 | 4 | **0.11** |
| layout only (no grain evidence) | 1 | 0 | — |

The directory-card level is where **3** hand types are won — `portal-server`, `portal-engine-api` and
`portal-frontend-view` — and where 34 types the hand graph does not have are lost. Most of those 34 are inside
`source/cli/tests/**` and `.yggdrasil/aspects/**`, where the hand graph draws one type over the whole tree
(`test-suite`, `rule-script`) and grain draws one per sub-directory — 093 class (c), a granularity judgement,
not blindness. Dropping the level entirely takes precision from 23/82 to **19/44 (0.43)** and recall from 21/36
to **18/36**, below the 093 baseline. **The recall gain and the precision loss live at the same level, and this
is the price.**

Fourteen proposed types match a hand type at J ≥ 0.8, nine of them exactly: `test-fixture` (578 files),
`example` (120), `relations-adapter` (34), `utility` (17), `structure-adapter` (14), `build-script` (13),
`ast-adapter` (12), `formatter` (7), `types` (5), `portal-server` (5), `migration` (3), plus `engine` (0.98, 82
files), `reference-catalogue` (0.93, 328) and `portal-engine-api` (0.90). The confound 093 named still holds for
most of them: those are the types whose `when` is one directory and grain's cut is one directory.

---

## 4. (b) Node mappings — both directions

| direction | n | J≥0.5 | J≥0.8 | mean J |
|---|---|---|---|---|
| recall — hand node → proposed node | 393 | 30 | 18 | 0.116 |
| precision — proposed node → hand node | 70 | 31 | 18 | 0.450 |

**The recall number measures the hand graph's granularity choice, not Grain's sight**, and the stratification
says so plainly:

| hand node maps | nodes | J≥0.5 | mean J |
|---|---|---|---|
| 1 file | 250 | **0** | 0.034 |
| 2–4 files | 77 | 6 | 0.136 |
| 5+ files | 66 | **24 (0.36)** | 0.403 |

250 of 393 hand nodes map exactly one file. The renderer deliberately does not imitate that (093 §3: how finely
to review is a decision, and grain has nothing to say about it), so it cannot score on that stratum by
construction — and 0/250 is the price of that decision, stated rather than hidden. On nodes of five files or
more the recall is 24/66 against 093's 28/66 for the same stratum; the renderer is slightly *worse* there than
"best of every level grain publishes", because it commits to one cut where the reconstruction was free to search
all of them.

Precision is the more meaningful direction here: **31 of 70 mapped nodes correspond to a hand node**, 18 of them
at J ≥ 0.8, including `cli/relations/extractors` (22 files, 1.00), `cli/utils` (0.94), `cli/structure` (1.00),
`cli/portal/tests/e2e` (1.00), `cli/portal/engine-api` (0.90), `cli/portal/server` (1.00) and `root/ci` (0.86).

---

## 5. (c) Relations, negatives and cycles

**Allow-lists.** 41 of the 82 types carry a `uses:` allow-list aggregated from 2161 resolved imports. These are
not scored against the hand graph's node relations here — 093 already did that comparison at both granularities
(recall 0.894, precision 0.998 at node level) and the same caveat governs the number: Yggdrasil's own
`relation-undeclared-dependency` check is enforced in CI, so its hand graph is complete by construction, and
that 0.998 must never be quoted as general.

**Established negatives.** Grain published exactly 2 `archNorms exp:"false"` module pairs. The renderer emitted
**0 `default: deny`** and put **both** in the backlog as class (c):

| from | to | share | became | why |
|---|---|---|---|---|
| `.yggdrasil/aspects` | `source/cli/src/core` | 0.997 | backlog only | `.yggdrasil/aspects` has resolved outgoing dependencies — a deny would contradict imports the code contains |
| `source/cli/src/relations` | `source/cli/src/core` | 0.941 | backlog only | same |

093 §4 warned specifically that the second must NOT be rendered as a deny, because the architecture explicitly
ALLOWS `relations-adapter → engine`. It is not. The first one 093 recorded as agreeing with a real hand `deny`
is also withheld, by the same rule — the renderer's condition is "no observed outgoing edge at all", and both
source types have one. **The rule is conservative in the right direction: it never contradicts the code, at the
cost of not proposing a deny the hand graph does have.**

**Cycles.** 8 loops in the proposed node graph, containing grain's own two module cycles and `yg advise`'s two.
An intermediate version broke each at its weakest edge to make the proposal green; measured, that turned **one**
`structural-cycle` error into **four** `relation-undeclared-dependency` errors asking for the edges back. The
renderer now declares everything and reports the loops at the top of the backlog.

---

## 6. (d) Aspect drafts against the 57 deterministic hand aspects

| | count |
|---|---|
| deterministic hand aspects | 57 |
| — that name any literal identifier at all (the measurable set) | 37 |
| aspect drafts written | 215 |
| — rendered as an executable `check.mjs` | 43 |
| hand aspects some draft names the same identifier as | **6** |

The six: `atomic-write-contract` (3 drafts name `writeFileSync`), `no-shell-injection` and
`portal/approve-shells-cli-only` (`spawnSync`), `portal/focused-file-exports` (8 drafts),
`prototype-safe-registry-lookup`, `self-contained-references`.

**This number is lower than 093's 11/57 and it is measuring a strictly harder thing.** 093 asked "does grain's
model ANYWHERE — a convention statement, a group label, a marker, a name token — name this identifier?". This
asks "does an aspect grain actually WROTE name it?". The proposal is a strict subset of the model, and it is the
subset that has to be defensible on its own. An earlier, looser matcher that scanned every backticked token in
the drafted prose returned 14/37; it was counting shared English words, and was tightened to the draft's own
`feature.argument` before any number here was recorded.

The 093 accounting of the other 51 stands unchanged and is the honest part: **20 assert a shape with no name to
match**, **6 forbid an absence** — which a miner of practice cannot see, not as a threshold but as a matter of
what evidence exists — and the rest are the miner misses whose identifiers sit below the λ gate. The sub-gate
lattice reaches some of them (`spawnSync`, `writeFileSync`, `execFileSync`, `node:fs`) and not others
(`Date.now`, `unhandledRejection`, `path.sep`, `localhost`, `noSecrets`) — because grain's vocabulary has a
support floor and an identifier used once or twice in a partition never enters it. **A rule that exists
*because* the repository avoids something will not come from mining, and neither will a rule about a name used
too rarely to be vocabulary.**

### 6.1 The drill sweep — does a rendered check do what it claims?

All 43 rendered checks drilled through Yggdrasil's own `yg drill` on the corpora the renderer cut:

| corpus | aspects with a corpus | cases | pass | MISS | FALSE-ALARM | unrun | unsupported |
|---|---|---|---|---|---|---|---|
| no hold-out | 43 | 237 | 208 | 29 | **0** | 0 | 0 |
| hold-out at 2026-07-01 | 14 | 61 | 61 | 0 | **0** | 0 | 0 |

For an `errs: under` check MISS is the permitted error direction and FALSE-ALARM is a broken contract. **Zero
false alarms** is the result that matters, and it took three measured closures to get there from the first
version's 53 (§4.2 of the design doc): positives render only where the file is the subject; group-scoped rules
never render; a file carrying any deviating site is a `violates-` case whatever else it carries.

**The hold-out row proves less than it looks.** At a 2026-07-01 cut only 14 of 43 checks have any corpus at all
(5804 sites across all 215 drafts were dropped as pre-cut, and the cut corpus falls from 960 cases to 276), and
almost every surviving case is a `satisfies-`, so it measures false alarms
and nothing else. It is included to show the hold-out works and is labelled, not as evidence the rules
generalise. Ticket 097 does the held-out version by cut sha with `yg simulate`.

---

## 7. Does Yggdrasil load it?

Staged copy of the repository + the proposed graph, `yg check`:

```
yg check: FAIL   59 nodes · 1366/1368 files (100%) · 215 aspects · 0 flows · 215 draft

Errors (1):
  structural-cycle
    Circular dependency: source/cli/src -> source/cli/src/cli -> source/cli/src/core
                         -> source/cli/src/structure -> source/cli/src/core.
Warnings (1):
  uncovered (2)   .clinerules/yggdrasil.md, examples/README.md
```

The graph loads completely — 59 nodes here because the harness had to drop the 13 that map the pattern repo's
own `.yggdrasil/` (see below) — every aspect, 100% file coverage, no schema, YAML, type or mapping error.
The one error is a dependency cycle in the repository's own imports, which grain and `yg advise` report
independently. Two files are uncovered, both singletons under a two-file floor, both non-blocking.

**Five load failures were found and fixed by exactly this staged check**, each invisible to any self-written
validator: 82 node files written and only 12 loaded (missing organizational nodes in the `model/` chain, and
dot-prefixed directories the walker does not descend into); 7 `parent-type-forbidden` (a nested node's parent
type must be declared); 11 `mapping-path-missing` (a subtree with its own `.yggdrasil/` is a separate project
every check skips); 591 `file-duplicate-mapping` from two nodes (child precedence applies to a directory glob,
not to an explicit file list). This is the whole argument for validating against the real CLI.

The full stage, without dropping those 13 nodes that map the pattern repo's OWN `.yggdrasil/`, adds 21 further
`mapping-path-missing` — an artefact of using as the pattern a repository that models its own graph directory,
which the harness had to replace. It is not a defect the renderer can fix and does not arise on a brownfield
repository, which has no graph directory to model.

---

## 8. Smoke: the seven examples

Each copied to a throwaway directory, `git init`, one commit, `--no-history`, proposal + score + staged
`yg check`.

| example | types | nodes | aspects | types recall | types precision | nodes recall | `yg check` |
|---|---|---|---|---|---|---|---|
| checkout-flow | 5 | 5 | 0 | 2/2 | 1/5 | 0/4 | **PASS** |
| failing | 5 | 5 | 0 | 1/1 | 1/5 | 1/2 | **PASS** |
| layered-architecture | 4 | 4 | 0 | 0/3 | 0/4 | 0/3 | **PASS** |
| no-secrets-in-logs | 5 | 5 | 0 | 2/2 | 1/5 | 1/2 | **PASS** |
| passing | 5 | 5 | 0 | 1/1 | 1/5 | 1/2 | **PASS** |
| pure-transforms | 5 | 5 | 0 | 1/1 | 2/5 | 1/1 | **PASS** |
| type-level | 6 | 7 | 0 | 2/4 | 2/6 | 0/2 | **PASS** |

Totals: **9 of 14 classifying types**, **4 of 16 node mappings**, **0 aspects**, and **7 of 7 proposals pass
`yg check` cleanly**. Each run is 0.4–0.6 s end to end.

The examples confirm the renderer produces a loadable graph on a foreign repository and nothing more — 093 said
the same and it is still true. At 7–19 files grain produces zero partitions and zero conventions on every one of
them, so every type comes from the module fallback. `layered-architecture` scores 0/3 where 093's baseline
scored 3/3: its hand types are three one-file directories, and a two-file floor for a type excludes all three.
That is the measured cost of `MIN_TYPE_FILES = 2`, and on a nine-file repository grain has nothing to say
regardless.

---

## 9. The worst misses, named

**Types the proposal does not reach, and why** (all 15 below J = 0.5):

- **Class (c), granularity — 9 of them.** `template` (4 files), `schema-doc` (6), `knowledge-doc` (16) are three
  hand types inside one grain module (`source/cli/src/templates`); `rule-script` (36) is a slice of
  `.yggdrasil/aspects`; `command-support` (14) a slice of `source/cli/src/cli`; `portal-pipeline` (11) a slice
  of `source/cli/src/portal`; `portal-contract` (1) and `portal-frontend-vendor` (1) single files inside larger
  cuts. Four of these are separated from their neighbours by a `content:` predicate the renderer offers as an
  alternative and does not reach — the `command` / `command-support` split needs "does this file export
  `register<X>Command`", and grain's role groups in that partition do not name that shape.
- **Class (b), graph debt (informational) — 2.** `repo-config` (54 files: root dotfiles, `docs/public/**`,
  `tools/**`, CLI package files) and `ci-config` (16) are hand-drawn categories, not localities. No miner
  reading layout can propose them, and 093 recorded the same.
- **Class (a), miner miss — 4.** `entry-point` (1 file), `reviewer-dispatch` (2), `parser-adapter` (6) and
  `llm-provider` (7). The last two ARE reached by an offered alternative at J 0.50 and 0.57; the first two are
  one- and two-file types nothing in grain's model isolates.

**Nodes.** The whole `cli/tests/e2e/*` and `cli/tests/unit/*` family (one file each, J ≈ 0.005) and the
per-language `cli/reference/relations/{go,rust,cpp,ruby,python}` slices (12–22 files each) — the same misses 093
named, for the same reason, and the renderer's refusal to imitate a 250-single-file-node cut makes them
structural rather than incidental.

**Aspects.** The 20 hand rules whose identifier sits in plain sight below the λ gate. The sub-gate lattice
reaches a handful; the rest name identifiers that occur once or twice in their partition and never enter grain's
vocabulary at all. That is a support floor, not a threshold to tune.

---

## 10. Honest confounds

1. **The 0.998 relation precision from 093 is Yggdrasil's own CI gate reflected back**, and nothing in this
   report may be read as a general precision for `relations:`. On a repository without an enforced import gate,
   or with a dynamic dependency graph, the allow-lists will be incomplete in proportion.
2. **Nine of the fourteen strongest type matches are one-directory types**, where grain and the maintainer agree
   because both read the same layout — not because anything was inferred.
3. **Node recall (30/393) is dominated by a granularity choice.** 250 hand nodes map one file; the renderer
   deliberately proposes no such node. Read the 5+-file stratum (24/66) or the precision direction (31/70).
4. **Precision is measured against ONE hand graph** and a proposed type with no counterpart is a disagreement,
   not an error. Under the fallibility ruling those 59 rows are unclassified until a maintainer sorts them into
   (a)/(b)/(c); the level breakdown in §3 is the best available proxy and says most of them are class (c).
5. **The drills carry no hold-out by default**, and every `CORPUS.md` says so in its own words. A passing drill
   on that corpus shows only that the rendered check reproduces grain's own count.
6. **`errs: under` is a contract the templates keep by construction and the drill sweep confirms on 237 cases**
   — not a proof. It is a claim about the shipped templates on one repository's grammars.
7. **215 aspect drafts is a lot to read.** They cost nothing (all `draft`, reviewer skipped) but the counsel
   memo's warning stands: rules must be retired as well as added, and nothing here does that. 172 of them are
   prose, which the same memo classes as an expensive sensor.
8. **The examples are a smoke test, not evidence** (093 §7, unchanged).
9. **Only one constant's sensitivity was measured** (`MIN_TYPE_FILES`, §8). `MIN_PROMOTE_FILES`,
   `MIN_CONVENTION_SITES` and `SUBGATE_PER_PARTITION` are stated admission floors whose cost is unmeasured.

---

## 11. Verdict

Grain can now write the architecture layer of a `.yggdrasil/`, and the proposal is a real artifact rather than a
sketch: Yggdrasil loads it, reports every node and every aspect, covers 100% of the repository, and returns one
error which is a fact about the repository. On the layer it is good at — types of five files or more, the layers
a maintainer would name — it recovers 20 of 29 outright and 22 with the alternatives it offers, above 093's
baseline and at 92% of the ceiling that report set without new mining; the two types 093 singled out as the
cheapest available recall, `portal-server` and `portal-engine-api`, come back at J 1.00 and 0.90. The price is
stated and is not small: 59 of 82 proposed types have no counterpart in the hand graph, almost all of them from
the one level that bought the recall, and 250 hand nodes are unreachable by design. On the rule layer the
picture is the one 093 predicted and this report sharpens: 43 executable checks that hold `errs: under` across
237 drill cases with zero false alarms, naming 6 of the 37 hand rules that have a name to match — and a
principled account of why the other 31 do not come out of a miner, of which the sturdiest is that six of them
forbid something the repository never does. The single most useful thing built here may not be any of those
numbers but the staged validation itself: five distinct classes of broken graph, every one of which our own
parser accepted, were caught only by running the adopter's real CLI against the real repository. Any future
claim that Grain proposes a graph should be made through that gate or not at all.

---

## 12. Reproducing this

```
# 1. the export (≈300 s cold, or reuse one)
node plugins/grain/bin/grain.mjs export --repo <repo> --out ygg-export.json --compact --no-anchors

# 2. the proposal, scored against the repo's own hand graph
node plugins/grain/tests/stress/propose.mjs <repo> <out-dir> \
  --export ygg-export.json --score <repo> --json score.json

# 3. validation: stage the repo + the proposal, run Yggdrasil's own CLI there
#    (copy every tracked file to a scratch dir, drop <out-dir>/.yggdrasil/ in, then)
node <yggdrasil>/source/cli/dist/bin.js check

# 4. the drill sweep, per rendered check
node <yggdrasil>/source/cli/dist/bin.js drill --aspect <id>
```

Guarded by `plugins/grain/tests/propose.test.mjs` (11 tests), including the staged `yg check` — skipped with a
reason when the Yggdrasil CLI is absent, and pointed at a build with `YG_BIN`. Yggdrasil was treated as read-only
throughout: the only thing written there was `.grain/`, removed afterwards.
