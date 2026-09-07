# Node-level co-change and split candidates — measured on four hand-written graphs

**Verdict, in one sentence: the change-together half of `grain advise` is not advice — over four hand-written
architecture graphs it names two node pairs in total, both of them connections those graphs already declare, so
it ships as `--json`-only data behind a disclosed weak-signal line; the split half is advice, and ships as
advice, because on the same four graphs it names a place holding a pile the evidence separates and never a place
that was already one thing.**

Written for ticket 131 (mission `.system/research/mission-one-system.md` §3, evidence row E4). **No constant was
added and none was changed**; two candidate changes the measurement turned up are filed as escalations 22 and 23
and were not made. The predecessor this memo is measured against is
`.system/research/where-cochange-promotion.md` — the file-level co-change lever that was built, gated five ways,
measured and rejected.

---

## 1. What was built, and what it is gated on

`grain advise [--json] [--graph <dir>]` reads the architecture graph a repository already has and emits
`grain-advice/1`. Two item kinds; `rule` and `port` are reserved and never fabricated (a test asserts it).

**`kind: relation`.** `model.scopeCochange` pairs SCOPES — a named declaration at its current path, `<path>#<kind>#<name>`,
not a file and not a directory. Each pair is mapped scope → file → owning node (the deepest node whose `mapping:`
selects the file), and a pair whose two ends land in one node is not an edge between nodes and is dropped. What
survives is gated on, in order:

1. **liveness at HEAD**, both ends, from the house-wide `pathsAll ∪ filesAll` set;
2. **support ≥ `CFG.cochangeMinSup`** (8 commits), the floor the store is already built with;
3. **mutual confidence ≥ 1/3** — `min(sup/commitsA, sup/commitsB)`, at the single-subject floor
   `cochangePartners` and `completenessDirectional` already apply.

Two decisions come straight out of the predecessor memo rather than being re-derived:

- **The strength of a node pair is its strongest SINGLE witness scope pair — never a sum, never a count.**
  §3 of the predecessor found that pooling votes from a shared neighbourhood *selects for* hubs: six
  `test/res.*.js` files naming `lib/response.js` is one fact counted six times. §3 of this memo shows the same
  shape at the scope level, so the aggregation refuses to count it. How many witnesses there are is reported
  beside the pair as disclosure and is never in the gate or the ordering.
- **Confidence is mutual, not directional.** One-way confidence says "A's commits usually touch B", which every
  file in a repository can say about its hub. Mutual is the anti-hub test, and it is what took the file-level
  lever to zero fires on two of three repositories.

**`kind: split`.** The measured policy of ticket 110 (`.system/research/type-levels.md`), applied with the node's
own mapped file set as the parent instead of a proposed type: a finer directory is a candidate only where it
**beats the level above it on that level's own evidence** — strictly more of the imports that touch it stay
inside than the parent's do, or grain could read none of its files while it could read the parent's. Same
`typeEvidence`, same `purityOf`, same shallowest-first walk, no threshold of its own.

**`declared`** is true when the graph joins the two nodes at all, and says how: `relation` (one names the other),
`ancestor-relation` (an ancestor of one names an ancestor of the other — the same edge stated coarser), or
`containment` (one is an ancestor of the other). Containment counts as declared deliberately: it is the one
connection every graph states loudest, and calling it a hidden edge would inflate the undeclared count with it.

## 2. The four oracles, at the shipped gate

Three committed hand graphs under `plugins/grain/tests/stress/oracles/` against the corpus clones, and the
Yggdrasil repository against its own live `.yggdrasil/` (a clone of `<yggdrasil>`, indexed with full
history). Every number below is `grain advise --json`'s own `survey` block on that run.

| oracle | HEAD | nodes owning files | pairs emitted | declared | undeclared | concentration | control | splits |
|---|---|---|---|---|---|---|---|---|
| grain | `f2ebaf4` | 38 of 45 | **0** | 0 | 0 | — | 59/703 = **8.4%** | 1 |
| express | `023767f` | 15 of 20 | **0** | 0 | 0 | — | 15/105 = **14.3%** | 1 |
| spring-petclinic | `818c413` | 20 of 27 | **0** | 0 | 0 | — | 35/190 = **18.4%** | 0 |
| Yggdrasil | `acd9114` | 400 of 434 | **2** | **2** | **0** | 1 of 2 = **50%** | 1769/79800 = **2.2%** | 2 |

*Concentration* is the share of emitted pairs touching the single hottest node — undefined where nothing is
emitted. *Control* is the declared rate over **every** pair of nodes that owns a file, enumerated rather than
sampled: at these sizes the whole population is cheap, and it is the limit of the random-pair control the ticket
asked for, with no seed and no sampling error.

**Two pairs across four repositories, both already declared, zero undeclared.** The two are, verbatim from the
run:

- `cli/io/parsers/config` ↔ `cli/tests/unit/support/io/config-parser` — `parseConfig` and the `config-parser`
  test case, 15 commits, 15 of 22 and 15 of 23. Declared by relation.
- `cli/commands/build-context` ↔ `cli/commands/owner` — `contextAction` and `registerOwnerCommand`, 10 commits,
  10 of 20 and 10 of 19. Declared by relation.

## 3. Why it is silent: the evidence is not there, and where it is, it is one fact repeated

The gate is not what empties the result. The surface underneath it is nearly empty of cross-file pairs at all.

| oracle | scope pairs in the store (`sup ≥ 8`) | of those, **cross-file** | cross-file **and** mutual ≥ 1/3 |
|---|---|---|---|
| grain | 25 | **0** | 0 |
| express | 28 534 | **36** (0.13%) | **0** |
| spring-petclinic | **0** | 0 | 0 |
| Yggdrasil | 5 | **4** | 3 |

For a cross-file scope pair to exist at all, **the same two named declarations** must be edited together in eight
or more commits. That is a far stronger requirement than the same floor puts on a FILE pair, and it is why
petclinic (1042 commits) produces no scope pair whatsoever while producing 63 file pairs. Filed as **escalation
22** — a separate, lower support floor for cross-file scope pairs would be a new constant, so it was not added.

Express's 36 cross-file pairs are the predecessor memo's own finding, arriving from the other side. Every one of
them is one declaration of `lib/response.js` against an **anonymous test block** in that declaration's own test
file — 34 of them `send` against blocks of `test/res.send.js`, the other 2 `redirect` against
`test/res.redirect.js`:

```
10  0.22  0.59  lib/response.js#method#send + test/res.send.js#method#<anon>#33
10  0.22  0.50  lib/response.js#method#send + test/res.send.js#method#<anon>#34
 …  (32 more `send` rows against 32 more blocks of the same file, then 2 `redirect` rows)
```

That is one fact — `res.send` and its test file move together — split across thirty-four rows. Pooling them
would have made it the strongest pair in the repository; the strongest-single-witness rule refuses to, and the
mutual gate then rejects each row on its own merits, because `send`'s 45 commits dwarf any one test block's 17.
Both halves of the design earn their place on this one repository.

One further surface fact, which does not change the verdict but does change how the surface should be read:
**`model.scopeCochange` is capped at 5000 pairs sorted by descending support**, and within-file pairs saturate
that budget on any repository with large files. On express all 5000 retained pairs are inside one file, the
retained support floor is 14, and all 36 cross-file pairs are dropped before any consumer sees them — the
model's scope co-change there is 100% within-file by construction. The verdict does not turn on it (the uncapped
store gives the same zero under the mutual gate), but any later reader of this surface should know it. Filed as
**escalation 23**; changing what the cap keeps changes acceptance, so it was not changed. **It has since been
changed — §9 below is the re-measurement, and the numbers in this section are the pre-146 surface.**

## 4. The variant sweep — what looser gates buy, and what they cost

Same four repositories, same node mapping, same liveness and support floor; only the pair source and the
confidence test change. `pairs / undeclared / concentration on the hottest node`.

| variant | grain | express | spring-petclinic | Yggdrasil |
|---|---|---|---|---|
| **V1 scope · mutual ≥ 1/3 (shipped)** | 0 | 0 | 0 | 2 / 0 / 0.50 |
| V1b scope · mutual ≥ 1/3 · uncapped store | 0 | 0 | 0 | 2 / 0 / 0.50 |
| V2 scope · one-way ≥ 1/3 · uncapped | 0 | 1 / 1 / 1.00 | 0 | 2 / 0 / 0.50 |
| V3 scope · one-way ≥ 0.75 · uncapped | 0 | 0 | 0 | 0 |
| V4 file · mutual ≥ 1/3 | 1 / 0 / 1.00 | 1 / 1 / 1.00 | 3 / 2 / 0.33 | 15 / 2 / 0.20 |
| **V5 file · one-way ≥ 1/3** (the rejected lever's shape, at node level) | 6 / 3 / **0.67** | 9 / 8 / **0.56** | 6 / 3 / **0.50** | 57 / 42 / **0.61** |

V5 is the row the predecessor memo predicts, and it lands exactly where it predicted: **more than half the pairs
touch one node on every repository**, and that node is the repository's own churn centre — `plugin/engine/core`
on grain, `tests/unit` on express, `app/owner/web` on petclinic, `root/project-config` (the changelog and the
package manifest) on Yggdrasil. On Yggdrasil, 35 of the 57 pairs have `root/project-config` on one side, with
mutual confidences of 0.03–0.13. Promoting that would be printing "the release ritual touches everything" 35
times.

V4 — the file level with the mutual gate — is the one variant that is neither silent nor a hub list (Yggdrasil:
15 pairs, concentration 0.20, 13 of 15 already declared). It is **not shipped**: it is the file-level lever this
project already measured and rejected once, revived at a different aggregation, and reviving it is a design call
with its own corpus measurement, not something a worker slips in under a ticket about scope pairs. It is
recorded here as the one candidate a follow-up ticket could be written against.

## 5. Five undeclared pairs, read in the code

The shipped gate produces **no** undeclared pair on any of the four repositories, so there is nothing of its own
to spot-check. The five below are the strongest undeclared pairs the *looser* variants surface — which is the
question that actually matters, because the case for loosening rests on them being real. Each was checked by
opening the files.

| # | oracle · variant | pair | read | verdict |
|---|---|---|---|---|
| 1 | Yggdrasil · V4 | `cli/knowledge` ↔ `docs/guides` (`docs/cli-reference.md` + `src/templates/knowledge/cli-reference.ts`), 33 commits, 0.53 | Two hand-maintained copies of the same command reference — 1302 lines and 1142 lines — one the docs site, one the agent-facing knowledge document. Neither imports the other; nothing structural connects them. | **Real seam.** A genuine hidden edge, and one no import graph can find. |
| 2 | Yggdrasil · V4 | `cli/commands/impact` ↔ `cli/tests/unit/core/operations/other/impact` (`src/cli/impact.ts` + `tests/unit/core/impact.test.ts`), 8 commits, 0.33 | The command and its own test. The node *does* declare `uses cli/tests/unit/cli`, but the test that actually moves with it lives in a different test node. | **Real, but trivial** — graph debt of the source↔its-own-test kind a naming convention already finds. |
| 3 | express · V4/V5 | `repo/config` ↔ `repo/docs` (`package.json` + `History.md`), **721 commits**, 0.60 | The last six shared commits are `deps: bump body-parser…`, `build(deps-dev): bump hbs…`, `build(deps-dev): bump morgan…`. Every dependency bump edits the manifest and the changelog. | **False.** The release ritual — and the single highest-support pair in the whole corpus. |
| 4 | spring-petclinic · V4 | `tests/integration` ↔ `tests/support` (`MySqlIntegrationTests.java` + `MysqlTestApplication.java`), 10 commits, 0.59 | Both pin `MySQLContainer(DockerImageName.parse("mysql:9.7"))` and the same `@ServiceConnection` wiring, in two files, with no import between them. | **Real seam.** A duplicated constant that must move as one. |
| 5 | spring-petclinic · V4/V5 | `tests/data-slice` ↔ `tests/web-slice` (`OwnerControllerTests.java` + `ClinicServiceTests.java`), 11 commits, 0.38 | The shared commits are `Updated Copyright to year 2025`, `Upgrad to Spring Boot 4.0.0-RC2`, `Refactor code logic <refactor>…` — repository-wide sweeps. | **False.** Ambient co-change: two files carried along by the same maintenance pass. |

Three of five real, two of them (1 and 4) genuinely invisible to an import graph — and **none of them from the
shipped gate**. The signal exists; it is at the file level, under a mutual gate, and it is thin enough that it
sits behind a design decision rather than inside this ticket.

## 6. The split side, which does ship as advice

Four for four, and each one is a place holding a pile the evidence separates rather than a place that was
already one thing:

| oracle | node | held | offered | on what evidence |
|---|---|---|---|---|
| grain | `Project State` | 327 files | `.system/issues` (286), `.system/research` (32) | grain parsed none of either, while it did parse the node above them |
| express | `Examples` | 80 files | 9 directories: 5 example programs, 4 template directories | 5 tighter import boundaries, 4 unparsed |
| Yggdrasil | `Test Fixtures` | 590 files | 13 fixture directories | 12 tighter import boundaries, 1 unparsed |
| Yggdrasil | `Docs Site Config` | 12 files | `docs/public` (7) | unparsed under a node of code |
| spring-petclinic | — | — | **nothing** | every node is already the size of one thing |

The petclinic row is the one that makes the other four worth reading: an instrument that offered a split
everywhere would be saying nothing. Both answers are pinned by tests (`tests/advise-command.test.mjs`).

## 7. What ships

- **`grain advise --json`** emits the whole `grain-advice/1` document — every pair with its two directional
  confidences, the two declarations behind it, the commit counts, `declared`/`declaredVia`, and the `survey`
  block every number in this memo came from.
- **The text surface never lists a co-change pair.** It prints the count, how many are undeclared, the
  concentration, and the two rates — recomputed on every run, so a repository where this finding does not hold
  says so in its own numbers instead of being covered by this memo. Where there is nothing, it says the evidence
  is usually silent and that silence is its honest answer.
- **The split side is listed**, as advice, on the text surface.

## 8. How to re-run this

```
git clone <corpus>/express W/express                 # and spring-petclinic; the Grain repo and a clone of
                                                     # <yggdrasil> are the other two
cd W/express && grain refresh --full                 # full history: the co-change side needs it
grain advise --json --graph <grain>/plugins/grain/tests/stress/oracles/express
```

`--graph` is what makes an oracle measurable at all: every committed oracle describes a repository that lives
somewhere else, so the graph is read from beside the tree rather than inside it. The Yggdrasil run needs no
`--graph` — that repository carries its own `.yggdrasil/`. The variant sweep of §4 and the cross-file listings of
§3 are throwaway readers over the same two stores (`model.json` and the history store) and are not committed;
each is fifty lines over `readNodeGraph`/`declaredVia`, which `engine/grain-advise.mjs` exports for exactly this.

---

## 9. The cap, re-cut over two populations — and what it cost the consumers that were already reading it

**Ticket 146, escalation 23's ruling.** The 5000-pair budget on `model.scopeCochange` is no longer one
descending-support cut over the whole list. Within-file pairs and cross-file pairs are now cut **separately**,
each by its own descending support, out of the **same** total budget: each population is entitled to half, and
whatever half one does not use goes to the other. **No constant was added and no floor moved** —
`CFG.cochangeMinSup` is still 8 for both populations, which is what escalation 22's ruling requires — and the
number of pairs retained is unchanged at `min(budget, total)`. Only *which* pairs, and only on a repository whose
store overflows.

Why half-and-half rather than a share proportional to the two populations' sizes: proportional is the policy that
produces the bias. On express the cross-file population is 0.13% of the store, so a proportional share is 6 pairs
of 36 — the budget would still be spent almost entirely on the population that saturates it, which is the thing
escalation 23 objected to. An equal entitlement with spill-over is the only rule that (a) needs no number that is
not already there, (b) costs nothing when a population is under its half — which is every repository but one
here — and (c) leaves the total retention exactly as it was.

### 9a. What the cut now keeps

| oracle | store (`sup ≥ 8`) | cross in store | retained before · of which cross | retained after · of which cross | weakest retained support |
|---|---|---|---|---|---|
| grain | 25 | 0 | 25 · 0 | 25 · 0 | 8 → 8 |
| express | 28 534 | 36 | **5000 · 0** | **5000 · 36** | 14 → **8** |
| spring-petclinic | 0 | 0 | 0 · 0 | 0 · 0 | — |
| Yggdrasil | 5 | 4 | 5 · 4 | 5 · 4 | 8 → 8 |

Express is the only repository of the four that overflows, and it is the whole change: **0 → 36 cross-file pairs
reach a consumer**, paid for by the 36 weakest within-file pairs (support 14, at the bottom of a population of
28 498). The other three are under budget and byte-identical, order included.

### 9b. The condition on the ruling: every existing consumer, re-measured, before merge

Three consumers, on the same four repositories, each run twice over the same store — once with the old single
cut, once with the split — so the two arms differ in nothing but the cut.

| oracle | `check`'s scope co-change lines (files · lines) before → after | lines lost | lines gained | `where`'s partners differing | `what`'s tested-by differing | `completeness` differing |
|---|---|---|---|---|---|---|
| grain | 2 · 7 → 2 · 7 | 0 | 0 | 0 of 2026 | 0 of 2026 | 0 of 2026 |
| express | 10 · 31 → 10 · 31 | 0 | 0 | 0 of 213 | 0 of 213 | 0 of 213 |
| spring-petclinic | 0 · 0 → 0 · 0 | 0 | 0 | 0 of 132 | 0 of 132 | 0 of 132 |
| Yggdrasil | 1 · 1 → 1 · 1 | 0 | 0 | 0 of 3047 | 0 of 3047 | 0 of 3047 |

Two facts explain the zeros, and both are worth stating because neither is luck.

- **`where`'s partners and `what`'s tested-by never read this surface at all.** Both are built on
  `model.cochange` — FILE pairs — which this ticket does not touch. They were re-run anyway, over every live
  file of all four repositories, because "it cannot be affected" is an argument and 5418 files is a measurement.
- **`check`'s scope co-change lines are gated at `CFG.cochangeMinConf` = 0.75**, and the 36 express pairs that
  newly arrive have confidences of 0.22–0.59 (§3). They enter the model and are then rejected by the consumer's
  own gate, which is exactly the order escalation 22's ruling asks for: remove the upstream bias first, let the
  gate decide afterwards. The 36 within-file pairs that leave were at the bottom of their file's top-5 and none
  of them was on a rendered line.

**Precision, leave-one-out.** A past commit is a recorded answer. For each of the last 200 commits of each
repository the scope-pair table is rebuilt **without that commit** — its own contribution subtracted from the
accumulator, both support and per-scope commit counts — the cut is applied under each policy, and the consumer
is asked about the files that commit touched. A line is **correct** when the partner declaration it named was in
fact touched by that same commit.

| oracle | held-out commits | commits where a line fired | lines emitted before → after | precision before → after |
|---|---|---|---|---|
| grain | 200 | 48 | 198 → 198 | **0.1212 → 0.1212** |
| express | 200 | 42 | 315 → 315 | **0.1778 → 0.1778** |
| spring-petclinic | 200 | 0 | 0 → 0 | — (never speaks) |
| Yggdrasil | 200 | 6 | 6 → 6 | **0.8333 → 0.8333** |

Identical in every arm, to four decimals, on every repository. **No consumer's precision drops, so the split
ships.** (The absolute values are a property of the consumer, not of this change: this instrument's only claim is
that the two policies are indistinguishable to it. The three-way spread — 0.12 on grain, 0.18 on express, 0.83 on
Yggdrasil off six lines — is itself worth a ticket, and is not this one.)

### 9c. `grain advise`, re-run at the same mutual gate and the same floor

Same command, same `--graph`, same `MUTUAL_CONF_FLOOR` of 1/3, same `CFG.cochangeMinSup` of 8. The only input
that changed is which pairs the cut kept.

| oracle | pairs before → after | declared | undeclared | concentration | control | splits |
|---|---|---|---|---|---|---|
| grain | 0 → **0** | 0 | 0 | — | 59/703 = 8.4% | 1 |
| express | 0 → **0** | 0 | 0 | — | 15/105 = 14.3% | 1 |
| spring-petclinic | 0 → **0** | 0 | 0 | — | 35/190 = 18.4% | 0 |
| Yggdrasil | 2 → **2** | **2** | **0** | 1 of 2 = 50% | 1769/79800 = 2.2% | 2 |

Unchanged, pair for pair — the two Yggdrasil pairs are the same two declarations, the same supports and the same
`declared: relation`. Express's 36 newly-retained cross-file pairs still emit nothing, and §3 already said why:
every one of them is `lib/response.js`'s `send` (or `redirect`) against one anonymous block of its own test file,
and `send`'s 45 commits dwarf any one block's 17, so the mutual gate rejects each on its own merits. **This is the
row §4's V1b variant predicted from the uncapped store, now arrived at through the shipped cut instead of a
throwaway reader.**

**The verdict of §1 therefore stands unchanged: the change-together half is data, not advice, and the disclosure
line is not touched.** What has changed is that it is now data drawn from a surface that is not biased by
construction — a repository with large files can no longer starve every cross-file consumer upstream of its own
gate — and a future measurement of that half will be measuring the gate rather than the cap.

### 9d. How to re-run §9

Same recipe as §8. The two policies are compared over one already-built store rather than by rebuilding twice:
`model.json` and the history store are read once per repository, `model.scopeCochange` is recomputed under each
policy from `H.scopeCochange`, and the consumers are called on the two resulting models. The leave-one-out arm
reads `scopePairSup`/`scopeCommits` out of the persisted replay state and subtracts one commit's own footprint
(`H.fps[*].scopes`) at a time. It is fifty lines over exports the engine already has and is not committed; what
is committed is `plugins/grain/tests/scope-cochange-cap-split.test.mjs`, which pins the overflow case, the
retention total, the under-budget no-op, and express's own 36 pairs end to end.
