# Counsel — the breakthrough toward a self-guarding software factory

**Question.** The maintainer's aim, verbatim: one agent ecosystem whose only human input is the requirements it has
to satisfy. Which single change — in Grain or Yggdrasil — moves the family decisively toward that, is built from what
exists, and can be measured before it is believed?

**Answer in one line.** Close the *law loop*: Grain's mined practice becomes Yggdrasil's candidate rules as generated
deterministic checks, each born with a history-cut drill corpus and a replay score, promoted and retired by Yggdrasil's
own catch/exposure telemetry; the human's recurring input shrinks to the renewal signature the family already reserves
for a human. The first two weeks decide it with numbers.

---

## 1. The factory as a control loop

| element | what it is today | evidence |
|---|---|---|
| **Reference** | the human's requirements — but today they enter in four hand-written forms: a Horde charter (goal, non-goals, evidence catalogue), Yggdrasil aspects (rules), the architecture (types, `when`, allowed relations), and the node cut | `templates/charter.md`: the evidence table is hand-filled, "never an adjective"; 51 aspect dirs / 57 deterministic `check.mjs` written by hand; Phase 0 "several days" (`docs/showcase.md`) |
| **Plant** | the repository plus its graph `.yggdrasil/` | 427 nodes, 38 types, 178 node logs, 3019 tracked files |
| **Actuator** | coding agents — Horde workers/owners/architect, or one agent under `yg prime` | agents never push; the human merges to base |
| **Sensor** | `yg check` (code vs law, content-addressed, keyless in CI); live relation conformance; `aspects --health` (catch/exposure); `advise` (nominations); `.feature-field.json` (15 structural deviants); drills; Grain (practice vs declaration); Horde verifiers and the per-wave auditor; the incident ledger | LLM ledger: 3363 fills, 3317 approved, 45 refused, 12 aspects exercised, 6 of them carry every refusal; incidents on record: **0** |
| **Controller** | the human, with the director as a Fable opinion | every `advise` nomination ends "requires your approval" |

The loop is closed exactly once: code → `yg check` → agent fixes → verdict in the lock. Everywhere else a sensor exists
and no wire leaves it:

1. **Sensor → law.** `yg advise` today nominates two overdue `review_by` dates, three rules labelled `decorative?`
   (`provider-redaction-cascade` 0 catches in 114 exposures), three uncovered hot spots (`root/project-config`
   touched in 149 of the last 200 commits, no enforced rule). Nobody closes these; they are proposals into a human
   queue with no instrument that decides them. The manual itself says only a drill tells deterrence from decoration —
   and 41 of 70 aspects have a drill corpus, all hand-cut.
2. **Practice → law.** Grain on Yggdrasil: 182 conventions, 37 modules, 2 cycles identical to `advise`, 2 `archNorms`
   equal to hand `deny` facts — and nothing turns a row into a rule. Reconstruction (`reconstruction-yggdrasil.md`):
   the architecture is recovered (relations 1105/1236 at precision 0.998, both cycles, 19/36 types with 7 more held in
   groups and directory cards); rule content is not (11/57 deterministic aspects; 20 identifiers sit in plain sight
   below the λ gate; 6 rules forbid an absence and are invisible to any miner of practice). Ticket 094 is the first
   wire being soldered — a proposal renderer — and 096 the second (excess as codelength).
3. **Law → measured.** Yggdrasil has the instruments — `simulate` ("what would this rule have caught"), `drill`, the
   events ledger — but no candidate generator feeds them. `simulate` accepts only a deterministic candidate that a
   human already wrote.
4. **Outside oracle.** `incident` is "the only signal from outside the graph" and it holds zero entries. Horde's auditor
   reproduces one merged ticket per wave and its verdict goes to the director, never to the ledger. The factory
   currently cannot know what it missed.
5. **Graph currency.** The graph is written once and drifts. Reconstruction already found the debt: `repo-config` and
   `ci-config` are hand buckets no locality supports; `relations-adapter → engine` is *allowed* while practice says it
   never happens (share 0.941 over 34 scopes); 131 node-pair relations are declared through an intermediary with no
   direct import. That is a drift sensor that exists (`reconstruct.mjs`, 2.5 s on an export) and runs by hand, once.
6. **Two miners, one constitution.** Yggdrasil's `family-without-law.mjs` carries six hand-tuned constants — the
   six-threshold shape Grain deleted for λ. Two miners of practice, two epistemologies.
7. **Intent plane.** A mission's "done" is a hand-written catalogue going green; the requirement→evidence translation
   is the human, every time; across missions the only memory is the node log.

With requirements as the only reference input, what matters is which wires consume human input *recurringly*: rules
(1, 2, 3) on every rule forever; the graph (5) per adoption and per drift; the catalogue (7) per mission. Incidents (4)
are reserved to the human by family law — a residue, not a target.

---

## 2. Candidate breakthroughs, ranked by human input removed

### B1 — The law loop: rules earn their status by measurement

**Gap closed.** Wires 1, 2, 3 and 6 at once: practice → candidate → replay → drill → advisory → (signed) enforced →
retirement, with the human's recurring act reduced to one renewal signature per rule, each presented with numbers.

**Mechanism, concrete.**
- *Source.* `grain export` already ships, per convention, a `check` descriptor (`scope`, `context`, `enumerator`,
  `argument`, `expected`, `negated`, `applicableNodeTypes`) plus `conformingSites` and `deviatingSites` with anchor
  lines and the nearest conforming exemplar. Both the certified set and the sub-gate lattice (`explain`'s `obs` rows —
  the maintainer surface the `sub-gate-rows-are-the-product` ruling already ordered) are sources; a sub-gate row is a
  candidate whose adoption share is disclosed, not hidden.
- *Renderer.* A `check.mjs` template per enumerator class (import-of, call-of, decorator, extends, returns, path
  placement, lexical layer), filled from the descriptor; scope from the partition or directory as a `scope.files`
  glob, from a marker as a `when.content` predicate. Grain and Yggdrasil parse with the same tree-sitter grammars for
  every language Yggdrasil's runner supports, so the rendered check reads the same tree Grain counted. Group-scoped
  conventions without a marker are **unrenderable** — the renderer discloses the count rather than approximating.
  Output is a proposal directory (`.grain/proposal/aspects/<id>/{yg-aspect.yaml,check.mjs,drills/}`), `status: draft`,
  `errs: under`, a `review_by` date, and provenance (`share`, `n`, `asOf` sha) in the description. Never a write into
  `.yggdrasil/`.
- *Drills, cut from history with a time hold-out.* `satisfies-*` from conforming sites and `violates-*` from deviating
  sites — but only sites whose first appearance post-dates a cut commit the rule was NOT mined on. This is the
  prospective held-out design `obligations-design.md §4` already validated, and it is what keeps rule and drill from
  being the same data twice.
- *Replay and telemetry.* On a repo with a graph, `yg simulate <candidate> --node <n>` scores historical catches
  (with its own survivorship caveat printed); `yg drill --dir <proposal drills> --corpus <sha>` scores MISS /
  FALSE-ALARM. On a brownfield with no graph history, `simulate` is `non-comparable` everywhere by construction, so the
  replay is Grain-side: the convention's lifecycle rows and its firing deviants over history are the catch count.
- *Ladder, no new constants.* `draft` → `advisory` when the held-out drill has 0 MISS and 0 FALSE-ALARM (a contract,
  not a threshold; advisory never blocks). `advisory` → `enforced` is a renewal-class signature: the human sees catch,
  exposure, fp and the drill and signs or retires. Retirement runs the other way on `aspects --health`: a
  `decorative?` label plus an auto-cut drill that still catches means *deterring* (keep); a `decorative?` label whose
  historical deviants are empty before and after the rule means *never needed* (propose retire). The loop closes the
  exact question the manual says only a drill can answer, using drills it cut itself.

**Why it is mathematics, not vibes.** Every candidate carries a codelength gain and a share; every promotion is a
drill contract; every demotion a count against an exposure; the hold-out is by time. No name lists, no new thresholds.

**Measurement (on Yggdrasil, read-only, in a throwaway clone).**
1. *Verdict reproduction:* of the 57 hand deterministic aspects, how many have a rendered candidate whose refused set
   on the same nodes equals the hand check's. Reconstruction matched 11/57 by identifier; the instrument now compares
   verdicts, and the 20 "miner miss" identifiers listed in §6 of the reconstruction are the target set.
2. *Novelty with precision:* candidates that survive drill + replay and exist nowhere in the hand graph, classified by
   the maintainer on a 20-item sample into the ruled (a) miner-miss / (b) graph-debt / (c) undecidable classes; precision
   on (a)+(b).
3. *Retirement:* for the three `decorative?` rules, does an auto-cut drill exist and catch.
Instruments: `reconstruct.mjs` (extend, no engine change), `yg simulate`, `yg drill`, `yg aspects --health`, the
events ledger. Bars stated before running: at least 10 of the 20 miner-miss rules reproduced in verdict; sample
precision at or above the 0.80 macro bar the project already uses for obligations. Below either bar, "not doing it,
with numbers" is the result.

**Cost and displacement.** One Opus design (renderer templates and the hold-out cut), two Sonnet workers, one Opus
measurement; zero LLM at runtime, forever, because every generated rule is deterministic. It displaces the part of
094 that drafts aspects as prose with a template as "what passing looks like" — prose cannot be simulated or drilled
for free, and the ledger says prose rules are expensive sensors (45 refusals in 3363 paid fills). Prose stays for
what has no shape.

**Failure modes and the disclosure that keeps it honest.** *Majority is not virtue* — the loop can enshrine practiced
mediocrity; hence advisory is automatic, enforced is signed, and every rule carries its share and `asOf`. *Rule
explosion* — 182 conventions must not become 182 aspects; a candidate with no historical catch stays draft, and
retirement is half the loop. *Circularity* — the time hold-out is non-negotiable and the corpus id names the cut sha.
*Absence rules* — the six "never does X" rules cannot come from practice; the renderer says so in its header.
*Enforcement inflation* — Yggdrasil's 0.998 relation precision is its own CI gate reflected back; no general precision
is quoted before a foreign graph.

**Human input removed.** Writing `check.mjs` (57 today), writing drills (41 corpora), deciding retirement, answering
`advise`. **Left:** one signature per rule at enforcement and at renewal, with numbers attached.

### B2 — Graph currency: the graph is re-derived every wave, not written once

**Gap closed.** Wire 5, and the Horde node cut. Grain's export becomes the standing drift sensor for the graph; the
architecture proposal (094's core) runs on every wave close, and every disagreement is reported symmetrically.

**Mechanism.** `reconstruct.mjs` already computes types vs partitions, mappings vs modules/groups/directories,
relations vs edges, `archNorms exp:false` vs `deny`, cycles vs `advise`. Turn it from a one-shot instrument into a
report the steward runs at `wave.mjs close`: (b)-class rows are graph debt — a declared-but-never-practiced relation, a
type whose `when` no longer follows the compression cut, a module with no node; (a)-class rows are miner gaps; (c) go
to the architect. The 7 types Grain holds in groups and directory cards but does not offer become type proposals
(the cheapest recall in the whole report: 19/36 → up to 26/36 with no new mining). For Horde's first cut, the module
graph plus per-module codelength gives the one sizing rule the skill has — "fits one Sonnet context" — a number
instead of a judgement.

**Measurement.** Already exists: type recall at J ≥ 0.5, node-mapping recall on 5+-file nodes (28/66 today), relation
recall/precision at node level, and the (a)/(b)/(c) split ruled on 2026-09-05. New number: graph-debt rows per 100
commits, which should fall to zero when the wire is live. Bar: the maintainer accepts ≥ 80 % of a 20-row proposal
sample without edits.

**Cost.** Small — the instrument is 2.5 s on an export, the export incremental after the first 434 s. **Displaces** the
manual `yg type-suggest` sweep of Phase 0.

**Failure mode.** Permitted is not practiced: rendering `relations-adapter → engine` as a proposed `deny` because
practice never uses it would be wrong; it is class (c), a human decides what is *allowed*. Granularity: 250 of 393 hand
nodes map one file; the proposal offers the coarse cut plus markers as the sub-cut, never a one-file node it cannot
justify. `yg-architecture.yaml` changes stay user-confirmed by family law.

**Human input removed.** Phase 0 graph authoring (days), the Horde node cut, keeping the graph current. **Left:**
what is *allowed* versus what is *practiced*, and the `when` vocabulary for content predicates (Grain never reads it;
it could read markers as exactly that).

### B3 — The intent plane: requirements in, evidence catalogue derived, incidents recorded

**Gap closed.** Wires 4 and 7. The human states requirements; the ecosystem derives the evidence catalogue (contract
tests, scenarios with thresholds) as Yggdrasil flows and flow-level aspects, so "done" is `yg check --full` plus the
catalogue green, and the catalogue persists into the next mission as standing law. The Horde auditor's
"not reproduced after merge" becomes a proposed incident the human signs — feeding the only outside oracle, which is
empty today.

**Why third.** It removes the largest ultimate input, but no instrument on disk measures requirement→evidence
fidelity except the human reading it. Measurable now: catalogue rows derived versus hand-filled (`wave.mjs evidence
<id> --by` marks the hand ones), the auditor's reproduction rate, incidents per mission once the wire exists. Build it
after B1 — a derived catalogue is only as good as the rule loop it lands in. **Failure mode:** thresholds inside
requirements ("fast enough") are numbers only a human can own; inventing them is fabrication in the family's worst
class.

---

## 3. The bet

B1. It removes the input that recurs most (every rule, forever), every instrument it needs exists today, it inherits
both constitutions unchanged (λ for speech, content-addressed verdicts, signatures where the family already puts
them), and it is falsifiable in two weeks. B2 is the same wire's other half and 094 is already building it; B1 is what
094 does not contain — rules that carry their own measurement.

**First two weeks.** Week 1 (Opus design, Sonnet execution): renderer templates for the enumerator classes present in
the 20 miner-miss identifiers of the reconstruction; time hold-out at a chosen sha; drills cut from sites; run
`yg simulate` and `yg drill` on Yggdrasil in a throwaway clone, Yggdrasil untouched. Deliverable: one table —
per hand rule, reproduced-in-verdict yes/no; per candidate, drill result, replay catches, presence in the hand graph.
Week 2 (Opus measurement, maintainer sample): the 20-item (a)/(b)/(c) classification, the precision number, and the
decision against the bars in §2. Extend the instrument to a second repository the moment one with a hand graph and no
relation gate is available — Yggdrasil's precision is enforcement-inflated and the examples are too small to partition.

---

## 4. What not to do

- **Do not build another oracle the agent must ask.** 25 runs, 0 diffs changed; adoption was fixed and nothing
  changed. Everything above lands on the graph and the maintainer, never on the agent's prompt.
- **Do not have a model write the rules from Grain output as the primary path.** Prose cannot be replayed
  (`simulate` refuses LLM candidates by design), costs per pair, and catches rarely (1.3 % of paid fills). Render
  checks; reserve prose for what has no shape.
- **Do not re-import tuned thresholds** into the ladder or into a merged miner — Yggdrasil's `family-without-law.mjs`
  has six; Grain deleted six for λ. Two miners with two epistemologies is a wire to cut, not to keep.
- **Do not auto-enforce, auto-suppress, auto-approve LLM pairs, or auto-record incidents.** The family reserves these
  to a human on purpose; the ladder stops at advisory and asks for a signature with numbers.
- **Do not fabricate ground truth from "skipped, then fixed".** Measured 0.246 vs 0.452, wrong direction in 20 of 20
  repositories. Held-out by time, prospective, is the only design the record supports.
- **Do not judge the loop on Yggdrasil alone,** and do not quote its 0.998 as general.
- **Do not add rules without retiring rules.** Six of twelve exercised LLM aspects carry every catch; a rule that
  never catches is cost, and the loop is a cycle only if it runs backwards too.

---

## 5. The residue — what cannot be removed, and why

1. **The requirements**, including every threshold inside them. A derived number is a guess wearing a requirement's
   clothes.
2. **Absence rules.** A rule about what the repository never does ("no network egress", "no secret strings") has no
   evidence in practice — it is a requirement, and the six in the reconstruction are the proof. The miner will never
   supply them; the human always will.
3. **Allowed versus practiced.** Whether an unused permitted relation should stay permitted is design intent. The
   sensor can only say "never happens".
4. **The signatures the family already reserves** — suppressions, incidents, renewals, boundary claims, cost limits —
   and, in this memo's ladder, enforcement. The incident is irreducible for a structural reason: a system reasoning
   about itself cannot observe the concern that has neither a rule nor a practice; the outside oracle is the human by
   definition, and it is empty today.
5. **Majority versus virtue.** The loop proposes what is practiced; it cannot know whether practice is good. The
   signature at enforcement is where that judgement lives, and the numbers beside it are what make the signature
   cheap.

Everything else — rules, drills, retirement, the graph, the node cut, most of the evidence catalogue — is derivable,
and the first two weeks say how much.
