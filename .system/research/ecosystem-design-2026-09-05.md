# Counsel 2 — the ecosystem, end to end: requirements in, guarded software out

**Commission.** One agent ecosystem whose only human input is the requirements the software has to satisfy
(plus the signatures the family already reserves for a human). Design it completely; say whether the existing
blocks — Grain, Yggdrasil, Horde, and by description Ratatoskr, Urd, Researcher — are enough.

**Verdict in two sentences.** The middle of the loop already exists and is better than it looks: Grain
derives the architecture, Yggdrasil holds the law with content-addressed verdicts and free CI, Horde is the
organisation that makes many agents accountable, and the first counsel's law loop (adopted as
`law-loop-is-the-bet`) is the wire that turns practice into rules. What does not exist anywhere is the two
ends: an **intent compiler** (a requirement in plain words → evidence rows, flows, a threshold the human
owns) and an **outside-oracle wire** (an escape after merge → a proposed incident the human signs → a drill
that catches it next time) — and without the second, every number the law loop optimises is the factory
grading its own homework.

Everything below builds on `counsel-factory-2026-09-05.md`. Where I disagree with it I say so (§2.7, §3
row "events ledger", §5).

---

## 1. The contract with the human

### 1.1 What the human provides — requirements, in one file, in plain words

A requirement is one row. The form is the one Horde's charter already reserves for acceptance ("a
catalogue of evidence — never an adjective"), extended by the two columns the ecosystem cannot derive:

| column | who fills it | example |
|---|---|---|
| `id` | tool | `R7` |
| `requirement` — one sentence, plain words | **human** | "A refund never leaves the ledger and the payment provider disagreeing." |
| `how you would know` — in words | **human** (Ratatoskr voice: the ecosystem restates it back until the human says yes) | "Any refund path, interrupted anywhere, ends with both sides equal." |
| `threshold` — a number, if the sentence has one | **human**, signed | `p95 < 800 ms` |
| `never` — an absence, if the sentence forbids something | **human** | "no code outside `payments/` talks to the provider" |
| `evidence` — the reproducible artifact | ecosystem (Urd → architect) | `tests/refund-consistency.test.ts`, scenario `scenarios/refund-interrupt.md` |
| `flow` / `nodes` | ecosystem | `flows/refund-consistency` → `payments/*`, `ledger/*` |
| `reproduced by` | verifier / Researcher | `verify 041 @ sha`, `measurements/R7.json` |

The human writes the first five columns; the ecosystem writes the rest and comes back with the row
completed. Two columns are human-only by *evidence* not by policy: a threshold is a number no practice
contains (§6 of the first memo), and an absence rule — 6 of Yggdrasil's 57 measurable deterministic rules —
has no footprint in code for any miner to see.

Home, twice. The working copy is Horde's `charter.md` (`.horde/hordes/<m>/`, uncommitted, dies with the
mission). The durable copy is a Yggdrasil **flow**: `flows/<R-id>/yg-flow.yaml` with `description:` carrying
the requirement sentence verbatim, `nodes:` the participants, `aspects:` the rules that guard it — because a
flow is the one graph element whose stated purpose is "the WHY", it cascades rules to every participant
(channel 5), and it outlives the mission. `tk new --evidence "R7: …"` already refuses a catalogue id that is
not a charter row; the same check extended to flows makes a requirement without a flow a validator error.

### 1.2 What the human signs — and nothing else

Existing family law, unchanged: a `yg-suppress`; an incident (`yg incident add`); a `review_by` renewal;
any change to `yg-architecture.yaml`; a boundary claim; a charter change and a spent cost limit (Horde
items 1, 5, 6); `yg advise dismiss/defer`; the push. Added by this design, each justified:

1. **Enforcement of a generated rule** (draft→advisory is automatic on the 0 MISS / 0 FALSE-ALARM drill
   contract; advisory→enforced is a signature with catch, exposure, share and `asOf` beside it). Reason:
   majority is not virtue; the loop can only say what is practiced.
2. **Every threshold constant** inside a check (`// signed-by: <user> <date> R7`). Reason: an invented
   number is a requirement wearing a costume — the family's worst fabrication class. A meta-aspect refuses
   an unsigned threshold (§4.2).
3. **The initial graph acceptance** — folded into (existing) `yg-architecture.yaml` confirmation: the
   proposal becomes law only when the human signs the types and the allowed relations. Allowed-versus-practiced
   is class (c) by ruling and stays theirs.
4. **A change to what the product claims** (Horde item 3, today ruled by the director). In a
   requirements-only regime a product claim *is* a requirement; the director cannot amend requirements.

What the human never touches: YAML, `check.mjs`, drill corpora, node mappings, relations, tickets, briefs,
merges below the trunk, any lock file, any cache, node logs, evidence paths, the wave journal, cost
bookkeeping, the next mission's boot.

### 1.3 The question channel, bounded by construction

A question is asked **iff** the ecosystem can show two admissible answers that produce *different evidence
rows* — a criterion, not a cap, in the same spirit as λ: speak only when the answer changes a gate. Four
sources qualify: a requirement whose evidence cannot be named as a reproducible artifact after consulting
the graph (`yg find`, `yg flows`, `yg context`) and the practice (`grain where`, `grain report`); a threshold;
an allowed-vs-practiced relation (reconstruction class c); an absence rule the system *suspects* from an
incident. Questions are batched at exactly the two moments Horde already reserves for the chairman —
framing and wave close — never mid-wave: a mid-wave ambiguity parks the ticket (`queue set NNN waiting`)
behind a `charter`-kind escalation. The count is a published number (invariant I8, §4) — questions per
requirement per mission — reported, never thresholded, because a factory that avoids asking is a factory
that invents.

Ratatoskr and Urd are known to me only by description. **Assumption:** Ratatoskr is a conversational skill
that keeps the exchange in the human's language and register (the Yggdrasil `onboarding` topic's contract is
the nearest artifact on disk); Urd is a skill that, given an ambiguous spec, reads the source of truth and
asks rather than guesses. Neither is a compiler; neither writes graph elements. In this design they are the
*voice* of stage 1 and the *discipline* of stage 2; the compiler that produces rows and flows has to be built
(§3).

---

## 2. The reference architecture

One loop, eight stages. Every arrow is an interface that exists today unless marked **BUILD**.

```
  R0 ground      R1 capture      R2 intent        R3 architecture     R4 work
  grain export → charter rows  → flows + rules  → proposal → graph  → tickets in worktrees
  (.grain/proposal)  (.horde)     (.yggdrasil/flows, aspects draft)   (Horde waves)
        ▲                                                                   │
        │                                                                   ▼
  R7 memory ◄── R6 operation ◄── R5 law loop ◄──────────────── R4' verification
  (flows, aspects,  (incident,   (candidates, drills,           (verifier key, lock,
   logs, incidents)  drill)       simulate, health, retire)     Researcher, gate)
```

| stage | owner (model) | produces | home | gate (who checks) |
|---|---|---|---|---|
| **R0 Ground** (brownfield only) | Grain, Sonnet worker | `grain export` → 094 proposal: `yg-architecture.yaml`, `model/**`, draft aspects with drills, flows skeletons, refactor backlog (095/096), `sizing.json` | `.grain/proposal/` — never a write into `.yggdrasil/` | human signs types/relations → architect copies into `.yggdrasil/` after `yg init --no-reviewer` → `yg check --approve --only-deterministic` green; the **built-in relation-conformance check is the free acceptance test of the proposed relations**; `reconstruct.mjs` on the accepted graph reports 0 (a)/(b) rows by construction, and is the drift sensor from then on (098) |
| **R1 Capture** | Ratatoskr voice, director (Fable/Opus opinion only) | charter rows (§1.1), non-goals, cost limit | `.horde/hordes/<m>/charter.md` (`horde init`) | every row has `how you would know`; rows lacking it are the framing question batch |
| **R2 Intent → evidence** | Urd discipline; architect (Opus) | per row: participants, evidence path(s), guarding rules — deterministic where a shape exists, prose only where none; `flows/<R>/yg-flow.yaml`; threshold rows → a measurement aspect (§2.5) | `.yggdrasil/flows/`, `.yggdrasil/aspects/<id>/` at `status: draft` | `yg check` loads (graph integrity); every row names a flow; questions batched once; **BUILD: the compiler** (§3) |
| **R3 Architecture & cut** | Grain (094) + architect; human signs | node cut = Yggdrasil nodes (`node.mjs bind` reads them); node charters/contracts beside `yg-node.yaml`; size per node from Grain's per-module codelength | `.yggdrasil/model/**`, `sizing.json` in the proposal | relation-conformance green; contracts exist as tests; a node whose charter+contracts+code exceed the sizing number is cut before staffing — the number replaces the judgement Horde's model names as its only cutting rule |
| **R4 Work** | Horde: steward (Sonnet), owners, workers (cheapest that passes; Haiku with a checker) | ticket branches in worktrees, each naming catalogue ids; `yg context --file` before every edit; `yg check --approve --only-deterministic` first action | `<horde>/t-NNN`, `.horde/.../issues/` | `premerge.mjs`: rooted at tip, two keys + owner approval sha-bound, diff inside node boundary, revert test red on base, gate green, journal fresh |
| **R4' Verification** | verifier (never author, fresh context); Researcher for threshold rows; the lock | `verify.mjs record` with one `--item` per acceptance line; LLM pairs filled by `yg check --approve` on the developer leg (Yggdrasil's own tier: `claude-code`/sonnet — keyless, not free: every pair is a subprocess call on the account); `measurements/<R>.json` | ticket log; `yg-lock.nondeterministic.json` committed; `measurements/` mapped to a `measurement` node | wave close: evidence delta ≥ 0; trunk: `yg check --full` (progressive mode makes a bare check on the reference branch pass by construction — the integration leg must be `--full`); auditor redoes one merged ticket per wave |
| **R5 Law loop** (B1) | Grain renderer (Sonnet), Opus design once | candidates as `check.mjs` + hold-out drills; `yg drill --dir … --corpus holdout-<sha>`; `yg simulate <id> --node`; ladder draft→advisory (contract)→enforced (signature); retirement from `aspects --health` + auto-cut drill | `.grain/proposal/aspects/<id>/` → copied as `draft` into `.yggdrasil/aspects/` for drill/simulate (draft aspects run under both) | 097 bars: ≥10/20 miner-miss rules reproduced in verdict; sample precision ≥ 0.80 on (a)+(b); below either, "not doing it, with numbers" |
| **R6 Operation & incidents** | auditor, steward, human signature | an *escape* — auditor `not-reproduced` after merge, a contract test red on base, a requirement row green→red, a user-reported bug — becomes a **proposed incident** (`escalate.mjs add --kind incident`, **BUILD**: the kind and the renderer) → human `yg incident add --tag <cause> [--aspect]` → `wrong-rule --aspect X` cuts the escaped code into `aspects/X/drills/violates-incident-<ts>/`; `no-rule` runs the 095 lattice on the touched partition and renders the top candidate as draft | `.yggdrasil/incidents.md` (committed, human testimony), drill corpora | `yg advise` shows the count; `aspects --health` `wrong-rule` column per rule; escape→drill latency measured (I6) |
| **R7 Memory** | the graph | flows = requirements in force; aspects = law with provenance; node logs = WHY; incidents = misses; `advise-decisions.jsonl` = case law; `.horde/` dies (cold boot from files is already Horde's design) | `.yggdrasil/` | the next mission boots from `yg flows`, `yg aspects --health`, `yg advise`, `yg incident read`, `grain report` — nothing from anyone's head |

### 2.1 Why the graph is the spine and Horde is not

Horde's own model says it: "the horde invents no meta level". Its operational state is uncommitted by
design; the durable knowledge — node charters, contracts, logs — lives beside `yg-node.yaml`. So the
ecosystem's memory is `.yggdrasil/`, full stop, and every stage above writes its durable artifact there
through `yg` or by the architect's hand, never into `.horde/`. This is also why Grain's output must land as a
*proposal directory* and never as a write into the graph: the graph is signed law, the proposal is
evidence.

### 2.2 The three concrete formats that carry a requirement

1. **Charter row** (§1.1) — Horde template, columns extended; validated by `tk new --evidence`.
2. **Flow** — `flows/<R-id>/yg-flow.yaml`: `description` = the sentence, `nodes` = participants,
   `aspects` = guards. Exists; needs no schema change.
3. **Measurement aspect** for a threshold row — `aspects/req-<R>-threshold/check.mjs` reads
   `measurements/<R>.json` through `ctx.fs.read` (the file mapped to a `measurement` node the flow's
   participants reach by a declared relation — the allowed-reads set is the contract); refuses when the value
   breaks the signed threshold. Yggdrasil's observation fold re-verifies the pair exactly when the
   measurement changes and never otherwise — the mechanism exists and is designed for this. Researcher
   (**assumed**: runs experiments against a named metric and records hypotheses kept and discarded) writes
   the file with `{metric, value, method, asOf, runs}`; the verifier re-runs the measurement, so author ≠
   verifier holds for numbers too.

### 2.3 The law-loop artifact, exactly

```
.grain/proposal/aspects/<id>/
  yg-aspect.yaml        status: draft · errs: under · review_by: <date> · description carries share, n, asOf
  check.mjs             rendered from the export's check descriptor (enumerator, argument, expected, negated, scope)
  provenance.json       { convention id, partition, share, n, asOf sha, cut sha, enumerator class }
  drills/violates-*/…   from deviatingSites — ONLY sites first appearing after the cut sha
  drills/satisfies-*/…  from conformingSites — same hold-out
```

`yg drill --aspect <id> --dir <proposal>/drills --corpus holdout-<cutsha>` scores MISS / FALSE-ALARM for
free; `yg simulate <id> --node <n>` replays history where a graph exists (and prints `non-comparable` before
`yg init`, so on a brownfield the replay is Grain-side: the convention's lifecycle rows and firing deviants).
Group-scoped conventions without a marker are unrenderable and say so in the header.

### 2.4 Sizing, as a number

Horde's only cutting rule is "charter + contracts + code fit one Sonnet context with room to work" — a
judgement made with the user. Grain's export already has bytes, scopes and codelength per module and per
partition. `sizing.json` in the proposal lists, per proposed node, its code size and the brief's measured
size; Horde's `node.mjs map` prints the ratio. No constant enters Grain; the budget is a fact of the model
(200K) minus a measured brief. Whether the ratio predicts owner success is a bet (§6).

### 2.5 Cost classes per stage

Fable: opinions only (this memo; the director's rulings). Opus: the intent compiler's design, the renderer
templates, the architect, the auditor, hard nodes, 097's measurement. Sonnet: renderer execution, stewards,
owners, verifiers, workers with a spec. Haiku: mechanical transforms with a checker (drill cutting from
sites, provenance stamping). Zero LLM: every generated rule at runtime, every CI leg, every drill of a
deterministic rule, `simulate`, `reconstruct.mjs`, `aspects --health`.

### 2.6 What the record already killed, and why this design does not resurrect it

Twenty-five agent runs, zero diffs changed by a grain answer: nothing here lands on the coding agent's
prompt. Grain speaks to the *graph* (proposal) and to the *maintainer* (lattice, backlog, sizing); the worker
meets it only as a Yggdrasil rule that refuses. Prose rules cost per pair and rarely catch — Yggdrasil's own
committed ledger: 3 363 LLM fills, 44 catches across six rules (1.3 %), three enforced LLM rules at 0 catches
in 30–156 exposures — so the loop renders shape as `check.mjs` and reserves prose for what has no shape.
The "skipped, then fixed" ground truth ran backwards in 20 of 20 repositories; every corpus here is cut by
time, prospectively, and the corpus id names the cut.

### 2.7 Where I disagree with the first counsel

Not on B1; on two mechanics it leans on. First, its retirement half reads `aspects --health` catch/exposure
for generated deterministic rules — but deterministic events never leave the machine: `events.committed_llm`
graduates LLM fills only, and in this checkout every deterministic row reads `—`. The committed record can
retire a prose rule and cannot retire a generated one. Either the loop retires from drills alone (an
auto-cut drill that stops catching on fresh history), or Yggdrasil grows a committed deterministic event
stream — a Yggdrasil ticket for the maintainer, not a Grain change. Second, on ordering: the memo puts the
whole intent plane after B1. The *cheap half* of it — the incident wire and the flow as the requirement's
durable home — costs a Horde escalation kind and a convention, and without it B1's promotion and retirement
numbers are self-referential. Wire that half in parallel (§5); keep the compiler after B1.

---

## 3. Are the blocks enough?

| block | the design needs | it already does | missing | disposition |
|---|---|---|---|---|
| **Grain** | architecture proposal; rule candidates as `check.mjs` + hold-out drills; per-partition lattice with adoption %; "too much" backlog; sizing per module; drift sensor | export with check descriptor, conforming/deviating sites, partitions, modules, cycles, archNorms, twins, templates, seeds, boundaries, birth obligations (0.942 pooled / 0.811 macro); `reconstruct.mjs`; recovers relations 0.894/0.998, cycles 2/2, types 19→26/36 | renderer (094), lattice surface (095), diagnostics (096), drill cutter with time hold-out (097), currency at wave close (098), `sizing.json`; a **template-as-shape** enumerator so the 20 "no identifier" rules have a rendering path (bet) | tickets — all but the last are in flight or queued |
| **Yggdrasil** | signed law, content-addressed verdicts, free CI, drills, simulate, health, incidents, flows, meta-modeling | all of it, shipped; `advise` nominates; `simulate` refuses LLM candidates by design | committed deterministic catch/exposure (see §2.7); `advise`'s "candidate rule family" class reads `.family-candidates.json` from its own miner | one Yggdrasil ticket (events); the family class re-pointed at the proposal directory |
| **`scripts/family-without-law.mjs`** (Yggdrasil) | a second miner is a second epistemology | 837 lines; seven env-tunable constants (tightness, linkage, `MIN` members 5, `BROAD_ANCESTOR_MAX_FILES` 40, `MAX_STRATUM_FILES` 4000, `MIN_AFFIX_TOKEN` 3, MAD scale) over ten-dimensional per-file feature vectors | nothing the proposal directory does not do with λ instead of seven constants | **cut**; its consumer (`advise`) reads Grain's proposal instead |
| **Horde** | organisation, keys, catalogue, escalation to the human, cost, cold boot | all shipped; `tk new --evidence` validates catalogue ids; `wave close --evidence`; `premerge`; `verify`; `cost`; graph via `yg` only | `--kind incident` escalation + proposed-incident renderer; charter columns `threshold`, `never`, `flow`; `node.mjs map` sizing ratio; "product claim" escalation forwarded to the user | small tickets in Horde |
| **Grain's director skill + `scripts/`** (`tk`, `queue`, `handoff`, `escalate`, `decide`, `wave`, `premerge`) | one organisation layer | a working prototype of Horde, same tool names, same failure lessons (`decisions.md` lessons are Horde's liveness and worktree rules in Polish) | nothing Horde lacks except the seven-class instrument matrix and the corpus runner, which are Grain instruments, not organisation | **merge into Horde**: Grain becomes a Horde mission repository; keep `tests/stress/*` as instruments; the director skill shrinks to the north star + rulings |
| **Ratatoskr** (assumed) | the human's voice at R1 and at every question | plain-words exchange | is not a compiler; writes nothing | keep as the R1 voice; the compiler is separate |
| **Urd** (assumed) | R2 discipline: consult, then ask | ask-don't-guess | does not produce rows, flows or drafts | keep as R2 discipline inside the compiler's prompt |
| **Researcher** (assumed) | threshold rows measured, method recorded | metric → experiments | no artifact contract | give it one: `measurements/<R>.json` (§2.2) |
| **The intent compiler** | requirement row → participants, evidence path, flow, draft guards, threshold aspect, questions | **does not exist** | everything | **BUILD** (Opus design, Sonnet execution); measured on Yggdrasil's 18 flows and Horde charters as oracles |
| **The incident wire** | escape → proposed incident → signature → drill | `yg incident add` exists; auditor verdict goes to the director and stops; ledger holds **0** entries | the proposal step, the drill cut, the `no-rule` lattice hop | **BUILD** (small) |
| **Meta-law** | every generated rule carries provenance; every threshold a signature | meta-modeling exists (a node may map `.yggdrasil/aspects/**`) | the two deterministic aspects | **BUILD** (one afternoon) |

So: enough for R0, R3–R5 and R7 with tickets already open; two merges and one cut; three things to build
that no repository contains — the compiler, the incident wire, the meta-law — of which only the compiler
is large.

---

## 4. Self-guarding, made falsifiable

### 4.1 Invariants and the instrument behind each number

| id | invariant | number | instrument (today / to build) |
|---|---|---|---|
| I1 | every enforced rule has a drill that catches | enforced aspects with ≥ 1 `violates-*` case and 0 MISS ÷ enforced | `yg drill` per aspect + a loop script; today 57 drill dirs / 70 aspects, catch-coverage unknown |
| I2 | decorative rules trend to zero | `decorative?` labels among enforced, per wave | `yg aspects --health` (today 3: 0/114, 0/156, 0/30) |
| I3 | requirement → evidence coverage | rows with reproducible evidence ÷ rows; rows filled by hand (`wave evidence --by`) ÷ rows | `wave.mjs close` prints green/total; add the hand-filled count |
| I4 | verification is real | verifier `reproduced` ÷ verdicts; auditor findings ÷ audits | `verify.mjs`, `wave audit` |
| I5 | the graph stays current | graph-debt rows per 100 commits | `reconstruct.mjs` at wave close (098) |
| I6 | the outside oracle is alive | incidents per mission by tag; commits between an incident and the drill case that catches it | `yg incident read`, drill corpus ids |
| I7 | cost is known | weighted runs per merged ticket, per accepted rule | `cost.mjs` |
| I8 | questions are honest | questions to the human ÷ requirement rows | `escalate list --to-user` count over rows |
| I9 | prose earns its price | LLM catches per 1 000 exposures | events ledger (today 13) |
| I10 | hold-out integrity | corpora whose every case postdates their cut sha ÷ corpora | a check over `provenance.json` + git first-appearance |

None of these is a threshold; each is a trend or a ratio published at wave close beside cost.

### 4.2 How the system can lie to itself, and what stops each

| failure | mechanism of the lie | structural check / disclosure |
|---|---|---|
| **rule explosion** | 182 conventions become 182 aspects; verdict surface grows, catches do not | a candidate with no historical catch stays draft; retirement is half the loop; I2 and rule count are printed beside I9; the false-block budget in `--health` |
| **majority as virtue** | practiced mediocrity enshrined | advisory is automatic, enforced is signed with share and `asOf`; a seed marks a decision that outranks practice and the renderer turns it into a draft rule so the decision, not the majority, becomes law |
| **circular evidence** | drills are the data the rule was mined on; simulate replays code the old gate already refused | time hold-out, non-negotiable, corpus id names the cut (I10); `simulate` prints its survivorship caveat; author ≠ verifier; a random auditor per wave |
| **enforcement-inflated precision** | Yggdrasil's 0.998 is its own CI gate reflected back | no general precision quoted before a foreign graph; the second-repository step (§5 S6) is the control |
| **Goodhart — the factory optimises its own metrics** | I1–I5, I7–I10 are all computed by the system about itself | I6 is the only number from outside and it is human-signed; a wave whose I1–I5 improve while I6 rises is flagged in the close report; the auditor sample is random, not chosen |
| **laundering a verdict** | cosmetic edits to re-roll, an agent approving an LLM pair, a hand-edited lock | no verdict-drop command exists; Horde forbids approving nondeterministic pairs and writing suppressions for every role; tampering degrades to unverified, never green |
| **a green that means nothing** | `--only-deterministic` never closes a log cycle; bare `yg check` on the reference branch passes by construction | CI encodes both: the integration leg is `yg check --full`; one recording `--approve` per wave on the developer leg |
| **question starvation** | the system invents a threshold to look autonomous | **meta-law**: a deterministic aspect on `.yggdrasil/aspects/**` refuses a numeric constant in a check without a `signed-by` line, and a generated rule without `provenance.json`; free, and it verifies the law itself |
| **the oracle is the tool's own repo** | every number so far is on Yggdrasil | reconstruction on the maintainer's private deployments the moment one is available; until then every number carries "on Yggdrasil" |
| **absence rules by omission** | a miner cannot see what never happens | the renderer's header says so; the charter's `never` column is human-only by design; an incident tagged `no-rule` is the trigger to ask |

---

## 5. Sequencing

Respecting what is in flight (094 renderer as `check.mjs` + drills; 096 diagnostics; 097 queued behind 094;
098 after 094) and the cost classes.

| step | what | where | measurement that gates the next step |
|---|---|---|---|
| **S0 now** | 094, 096 land | Grain | 094: maintainer accepts ≥ 80 % of a 20-row proposal sample unedited; 096 reports its excess rows on Yggdrasil's own named hot spots (`cli/commands/check`, `core.mjs`) |
| **S1** | 097 — the law loop measured in a throwaway clone; add `provenance.json` and the I10 check | Grain | ≥ 10/20 miner-miss rules reproduced in verdict; precision ≥ 0.80 on (a)+(b) after the maintainer's classification; retirement: an auto-cut drill exists and catches for the three `decorative?` rules. Below a bar: B1 stops as the primary wire, with numbers; B2 continues |
| **S2** | 098 graph currency + `sizing.json`; cut `family-without-law.mjs` and point `advise`'s family class at the proposal (Yggdrasil ticket) | Grain, Yggdrasil | graph-debt rows per 100 commits measured on Yggdrasil's last 200; ≥ 80 % of 20 rows accepted |
| **S3** | merge the organisation layers: Grain runs as a Horde mission; Horde gains `--kind incident`, the charter columns, the sizing ratio; the meta-law aspects | Horde, Grain, `.yggdrasil/` of each | one full Grain maintenance wave under Horde with identical `premerge` outcomes and a cost report; the meta-law refuses a planted unsigned threshold |
| **S4** | the incident wire end to end: auditor `not-reproduced` → proposed incident → signature → drill case | Horde, Yggdrasil | first mission in which every escape produced a proposal; I6 latency published; ledger count > 0 for the first time |
| **S5** | the intent compiler (Opus design; Sonnet execution) with Urd as its discipline and Ratatoskr as its voice; measurement aspects for thresholds | Horde (charter side), a new tool in the family or in Horde — not Grain, which stays a miner | oracle = Yggdrasil's 18 hand flows + past Horde charters: derived rows and flows vs hand ones, ≥ 80 % accepted; I8 published, not thresholded; a threshold row goes red when its measurement file crosses the signed number |
| **S6** | the second repository — a brownfield with a hand graph and no relation gate | Grain | reconstruction numbers that are not enforcement-inflated; the first general precision the family may quote |

**Stop doing.** Agent-facing oracle work on Grain (`where`, hooks, MCP trials — suspended by ruling; keep the
instruments). Calibrating `family-without-law.mjs`. Hand-writing `check.mjs` for any rule whose shape the
renderer reproduces once S1 passes. Prose aspects for anything with a shape. Two ticket systems with the
same tool names. Quoting Yggdrasil-only numbers as general.

---

## 6. Residue and honest limits

**What this ecosystem will never do without a human, and why.**

1. State the requirements, and every threshold inside them — the only place a number can come from.
2. Rules about absence — 6 of 57 in the reference graph; no practice contains "never".
3. Allowed versus practiced — a sensor says "never happens"; only intent says "must never".
4. The signatures: suppress, incident, renewal, enforcement, architecture, boundary, cost, product claim,
   push. Each is where the family put the judgement it could not mechanise; this design adds four and
   removes none.
5. The outside oracle. A system reasoning about itself cannot observe the concern that has neither a rule
   nor a practice. The incident ledger holds zero entries today not because nothing escaped but because
   nothing carries an escape to the ledger; after S4 it will hold what a human was willing to sign, and no
   more.
6. Majority versus virtue — the loop proposes what is practiced; whether that is good is the signature at
   enforcement, and the numbers beside it are what make signing cheap.

**Where this is a bet, not a derivation.**

- B1 itself — decided by S1's two bars, already written.
- That a template (a superposition skeleton with holes) renders as a deterministic shape check and moves
  the 20 "no identifier" rules into reach — untested; the renderer should try it on those 20 first.
- That requirement→evidence fidelity can be measured at all: the only oracle is a human accepting rows, and
  S5's 80 % is a sample the maintainer classifies, exactly like 097's.
- That per-module codelength predicts a right-sized node — plausible, unmeasured; publish the ratio and the
  owner-lease reclaims beside it for a few missions before believing it.
- That a measurement aspect over a committed file will not be gamed by whoever writes the file — author ≠
  verifier and the observation fold are the defence; an incident tagged `not-enforcement` is how it would
  show up.
- That Ratatoskr, Urd and Researcher are what their one-line descriptions say. Everything here that names
  them is an assumption; the design survives their absence with a plainer voice and a Sonnet worker running
  a script.

Everything else — the graph, the cut, the rules, the drills, retirement, the catalogue's participants and
evidence paths, the incident *proposal*, the next mission's boot — is derivable, and the six steps above say
in what order the family finds out how much.
