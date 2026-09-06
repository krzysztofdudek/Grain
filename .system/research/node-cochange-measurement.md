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
Yggdrasil repository against its own live `.yggdrasil/` (a clone of `/home/user/Yggdrasil`, indexed with full
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
**escalation 23**; changing what the cap keeps changes acceptance, so it was not changed.

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
                                                     # /home/user/Yggdrasil are the other two
cd W/express && grain refresh --full                 # full history: the co-change side needs it
grain advise --json --graph <grain>/plugins/grain/tests/stress/oracles/express
```

`--graph` is what makes an oracle measurable at all: every committed oracle describes a repository that lives
somewhere else, so the graph is read from beside the tree rather than inside it. The Yggdrasil run needs no
`--graph` — that repository carries its own `.yggdrasil/`. The variant sweep of §4 and the cross-file listings of
§3 are throwaway readers over the same two stores (`model.json` and the history store) and are not committed;
each is fifty lines over `readNodeGraph`/`declaredVia`, which `engine/grain-advise.mjs` exports for exactly this.
