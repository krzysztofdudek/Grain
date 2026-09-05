# Sense iteration: can wording alone make a proposed rule a rule?

Ticket 109. Renderer: `plugins/grain/engine/propose.mjs`. Instrument: `plugins/grain/tests/stress/propose.mjs`.
Yggdrasil CLI `/home/user/Yggdrasil/source/cli/dist/bin.js` (read-only checkout). Corpus: the same pinned
clones ticket 101 used. Every number below comes from a run.

The maintainer's question, in their words: *rules that FUTURE agent sessions cannot argue with — the finer and
the more clearly worded, the better.* Ticket 101 measured what Yggdrasil can OPERATE on and, separately, had an
independent judge read twenty candidate rows: **14 of 20 came back "not a rule, an observation"**. This ticket
asks the next question and only that one: **how much of that is the WORDING?** Nothing is re-mined here. No
partition, convention, status, count, `check.mjs` body or drill outcome changes; the rounds are diffed to prove
it.

---

## 0. Read this first — what the "panel" is, and what it is worth

**The panel is ONE model judging in THREE passes, not three agents.** There is no second opinion anywhere in
this measurement. What the three passes measure is the STABILITY of one judgement under re-presentation —
different ordering, per-pass card numbering, no access to the earlier verdicts while judging — not the
independence of three judges. Pass-to-pass agreement is an UPPER BOUND on what an independent panel would
show, never a substitute for one. Ruling `layers-compatible-no-user-thresholds` puts the classification on an
independent model judge rather than on the maintainer; it does not make one model into three, and this report
does not pretend otherwise.

The protocol was written down and frozen BEFORE any card was judged (`PROTOCOL.md`, reproduced in §2). Two
amendments are recorded there, each made before the verdicts it affects.

---

## The answer, in one block

Seventeen repositories — ticket 101's corpus, minus the one it also could not finish — split by a recorded
coin into eight the wording was tuned on and nine it was never shown. 151 sampled items — every `enforced` and `advisory` aspect, a stratified sample of drafts,
twelve types and twelve node charters per arm — judged in three passes each, seeing only the sentence, its
description, its evidence line and its status.

| | rule (a) | true (b) | **SENSE (a & c)** |
|---|---|---|---|
| **HOLD-OUT (9 repos, 69 items), baseline** | 0.000 | 0.551 | **0.000** |
| **HOLD-OUT, final templates** | **0.928** | **0.710** | **0.493** |
| DEV (8 repos, 82 items), baseline | 0.000 | 0.500 | 0.000 |
| DEV, final templates | 0.866 | 0.659 | 0.305 |

- **Not one baseline sentence — 151 of 151 — was judged a rule an agent can obey or violate.** Ticket 101's
  "not a rule, an observation" was not a sampling accident; it is what the renderer said, everywhere.
- **Wording alone took that to 0.928 on the hold-out**, and took the share worth enforcing at its stated
  status from 0 to 0.493. **Nothing was re-mined**: every id, status, count, `check.mjs` body, drill corpus
  and `provenance.json` number is byte-identical across the change, repository by repository (§7), and
  `yg drill` returns the same transcript line for line (§11).
- **It generalises better than it fits.** The arm the wording was tuned on ended at 0.305; the arm it was
  never shown ended at 0.493.
- **Two rounds, not four.** Round 2 moved DEV sense by one item of 82, and the frozen stopping rule ended it.
- **Where wording did nothing: `enforced`.** 21 of 21 enforced items across both arms are rules an agent can
  obey and none is worth enforcing, for one reason the new evidence line now states outright — the status is
  earned by a drill proving the CHECK correct, and never asks whether the repository is already green (§10.1).
- **Six classes stay observations whatever the sentence says** (§10). They are mining problems, and the
  wording's contribution was to make each of them visible instead of hiding it behind a share.
- **Judge reliability, honestly: three passes agreed on (a) for all 151 items in every round — but on the two
  baseline rounds Cohen's kappa is UNDEFINED** (no variance to correct for), and where it is defined it is
  1.000 because question (a) became near-mechanical once obligations exist. §9 says what that is and is not
  worth.

---

## 1. Method

1. **Baseline render.** Every corpus repository is copied into a scratch working tree (`grain export` writes
   `.grain/` into the repository it reads, and the clones stay pristine), then rendered with
   `node plugins/grain/tests/stress/propose.mjs <repo> <out>` at the SHIPPED defaults. The reading cap
   `SUBGATE_PER_PARTITION` is NOT lifted here, unlike ticket 101 — 109 measures the wording an adopter actually
   receives, and ruling `propose-default-is-quiet` makes that cap part of the product rather than part of the
   measurement.
2. **Items.** Every rendered proposal is walked and each judgeable element becomes one ITEM carrying a stable
   id (`<repo>::<category>::<element-id>`): an **aspect** (its `name`, `description`, `#e` evidence line and
   `status:`), a **type** (its `description`, its `when:` and its `#e` line), or a **charter** (its first three
   sections — the opening paragraph, "what lives here", and the dependency section).
3. **The coin**, §3. **The sample**, §4 — drawn ONCE from the baseline and never re-drawn.
4. **Judging**, §2 — three passes, frozen protocol, cards only.
5. **Wording rounds on DEV only.** Each round re-renders from each repository's CACHED `grain export`, so
   nothing is re-mined, and is accepted only if a recursive diff against the previous round shows every id,
   status, count, `check.mjs` body, drill corpus and `provenance.json` byte-identical (§7).
6. **Hold-out**, rendered and judged exactly twice: baseline and final.

---

## 2. The judging protocol, as frozen

For each item, seeing ONLY the rendered sentence, its `description`, the evidence line and the bare `status:`
word — never the repository, never the code, never `check.mjs`, never the item id, never which round the card
came from:

- **(a) RULE** — is this a rule an agent editing this repository can OBEY or VIOLATE? Yes only if the sentence
  tells the agent what it must or must not do and a future edit could be checked against it. A sentence that
  merely reports what the code currently does is NO.
- **(b) TRUE** — is it true of this repository, as far as the evidence line itself shows?
- **(c) WORTH** — is it worth enforcing at its stated status? `enforced` must earn a blocking CI, `advisory` a
  warning, `draft` a maintainer's reading time; `n/a` (types, charters) is judged as "worth keeping in the
  graph at all".
- **free text**: *what would make this a rule* — one line, always, including when (a) is yes.

Three passes. Pass 1 in item-id order; pass 2 in `sha256(id + 'p2')` order; pass 3 in `sha256(id + 'p3')`
order, with per-pass card numbering, so the same item is a different number in every pass. A pass's verdicts
are written to disk and not re-read until all three are done.

Measures: **agreement** = fraction where all three passes give the same (a); **sense** = fraction where the
majority answer is yes to (a) AND yes to (c); **truth** = majority yes to (b), reported beside sense but not
part of it. Judge reliability: raw agreement and Cohen's kappa for each of the three pass pairs.
**A mean kappa below 0.4 means the judge is not reliable enough for a wording win to mean anything, and this
report says so before it says anything else.**

One amendment, recorded before the first verdict: the card carries the aspect's `description` as well as its
`name`, because that is a rendered field of the same file and both arms are shown it identically. The
alternative — a harness gloss explaining what `advisory` does to `yg check` — would have credited the harness
with a sentence the renderer either writes or does not, which is exactly what this ticket measures.

---

## 3. The coin

Recorded, deterministic, reproducible, and rolled before a single card was read:
`sha256("grain-109-sense-split:" + repoId)`, hex ascending, the first nine DEV and the last nine HOLD-OUT.
Re-roll it with `node split.mjs`.

| # | repo | sha256(salt+repo) | arm |
|---|---|---|---|
| 1 | `cpp-json` | `10830dc3cf9d5196…` | DEV |
| 2 | `tsx-zustand` | `3cf96af0a947bb6d…` | DEV |
| 3 | `serde-full` | `4f5aa281df4d6f71…` | DEV |
| 4 | `telescope.nvim` | `53408eda74148016…` | DEV |
| 5 | `axum-full` | `65ba5808b969c39b…` | DEV |
| 6 | `groovy-spock` | `66b6a0cf4ff132b3…` | DEV |
| 7 | `sinatra` | `7609f7b4e73487a0…` | DEV |
| 8 | `leveldb` | `90ada9504328c7ed…` | DEV |
| 9 | `spring-petclinic` | `983878f8901158f0…` | DEV |
| 10 | `flask` | `abf8de5c0f7b7ff7…` | HOLD-OUT |
| 11 | `kotlin-datetime` | `b8a476eab72c9bb4…` | HOLD-OUT |
| 12 | `gin` | `c5d3bf5275fcfc3f…` | HOLD-OUT |
| 13 | `Slim` | `c5f04d078ad51f53…` | HOLD-OUT |
| 14 | `zig-zls` | `d2a5dbf6ab4c32ea…` | HOLD-OUT |
| 15 | `bash-it` | `dc794e785b08199e…` | HOLD-OUT |
| 16 | `express` | `e1b526e91e76933f…` | HOLD-OUT |
| 17 | `openzeppelin-contracts` | `e6f1fd4710a7499f…` | HOLD-OUT |
| 18 | `CleanArchitecture` | `f5865664b1788258…` | HOLD-OUT |

---

## 4. The sample

Fixed seed `109-sense`, drawn ONCE from the baseline render and never re-drawn: within each stratum,
candidates are ranked by `sha256("109-sense:" + itemId)` ascending and the first *k* taken. Item ids are
stable across rounds, so every round re-judges the SAME items.

- **Every aspect at `status: enforced` and `status: advisory`**, both arms, no cap. These are the only aspects
  the quiet report shows a maintainer (ruling `propose-default-is-quiet`), so none may be sampled away.
- **Drafts**, stratified by `draftReason`, up to 6 per stratum per arm. Drafts are deliberately sampled
  LIGHTLY: they are the population the product keeps off the default report, and weighting them as heavily as
  the shown items would measure a surface no adopter reads first.
- **Types**: up to 12 per arm, stratified by how the type was admitted.
- **Charters**: up to 12 per arm, 6 mapping nodes and 6 organizational ones.

---

## 5. What changed in the templates

Six changes, all in `plugins/grain/engine/propose.mjs`, all prose, over two rounds. Nothing else in the
renderer moved. Rows 1–5 are round 1 (commit `c8ee591`, with the row-3 bug fix landed first as `db38a84`);
row 6 is round 1 for the type/charter headings and round 2 for the obligation wording (`5343fea`).

| # | change | before | after |
|---|---|---|---|
| 1 | **the obligation form** — a rule is `Every <unit> under <glob> must …` / `No <unit> under <glob> may …`, with the aspect's own scope glob inside the sentence and the `content:` half as a participial clause | ``methods here are annotated with `[Then]` `` | ``Every method under `tests/**`, in a file mentioning `counter`, must be annotated with `[Then]`.`` |
| 2 | **a prohibition reads as one** — `expected: false` lifts the negation out of the mined phrase instead of doubling it | ``files in `Slim/Interfaces` do not import `Psr\Http\Message\ServerRequestInterface` `` | ``No file under `Slim/Interfaces/**` may import `Psr\Http\Message\ServerRequestInterface`.`` |
| 3 | **a lattice row is worded from the value it was measured at**, not from its predicate id (this one is a BUG FIX — the categorical families carry their value in the row, and the rendered `check.mjs` was already compiling the right one) | ``methods in `Slim/Interfaces` follow the name shape `` `` `` ``  ·  ``files in `themes` have auto.lex:quote`` | ``Every method under `Slim/Interfaces/**` must be named camelCase.``  ·  ``Every file under `themes/**` must quote strings with double quotes.`` |
| 4 | **the evidence line leads with what decides belief** — how many sites hold the rule and how many break it today — then where it applies, then what to copy, then how grain came to propose it | `sub-gate candidate: share 0.765 · practised in 13 of 17 files · 4 sites do not · -6.4 bits · BELOW grain's certification bound (0.875) …` | ``holds for 13 of 17 files in scope; 4 break it today — a rule with a backlog, not a clean record · applies to files under `Slim/Interfaces/**` · below grain's own certification bound (0.875) …`` |
| 5 | **the role cluster leaves the sentence and stays in the evidence** — the scope predicate is the whole directory, so a sentence that named the narrower cluster claimed a subject the check does not enforce | ``methods in `Slim/Routing` (role group r5) have auto.first1`` | ``Every method under `Slim/Routing/**` must open with a `return_statement`.`` + evidence `measured within one role cluster (r5) of `Slim/Routing`` |
| 6 | **a type and a node say what they oblige** (round 1 stated the classification, round 2 made it an instruction and made a type with nothing attached say so), not how they were cut: a type's `relations:` are its one obligation, and Yggdrasil's relation-conformance check refuses an undeclared dependency at error severity on every run | type: ``Files under `.github` — proposed from grain's refined module graph.`` · charter: `## Depends on / used by` → `- depends on: (no resolved outgoing import)` | type: ``Put a file under `.github/` only if it belongs to this type: a file placed there is classified here with no further step, and every rule attached to this type applies to it from that moment. No rule and no relation are attached to this type yet, so today it constrains nothing.`` · charter: `## What this node may depend on` → `- may depend on: nothing is declared yet. `yg check` refuses a dependency on another node until it is declared here, so declare the relation before the first import.` |

Plus, folded into the same round because they are the same sentences: the `status:` word gains one sentence
saying what it does to `yg check` (`yg knowledge read aspect-status`'s own table, said where the decision is
made); `J=1.00` becomes `selects N of M tracked files; exactly the K the evidence names (Jaccard 1.00)`; and
plural/article agreement is fixed (`these 1 file`, `a assignment_expression`, and "the rest belong to a nested
node" on a node that owns everything it maps).

---

## 6. Scope — what this ticket did not touch

Named here so no number below is read as more than it is:

- **Nothing was re-mined.** No partition, no convention, no lattice row, no status, no drill. §7 is the proof.
- **`verbalize` was not touched.** Grain's own report surface still says "methods here …" — that is the right
  mood for a reader who asked what the code does, and the README's examples, `grain where`, `grain what` and
  `grain explain` all speak it.
- **Attachment was not touched**, including the defect §10 names: a partition called `_root` has no host type,
  so every rule mined inside it is dropped. That is what a rule REACHES code through, not how it is worded.
- **`grain export --no-history` was ruled out as a shortcut, by measurement rather than by assumption.** On
  `spring-petclinic` it changes what is mined — 18 aspects become 12, 12 rendered checks become 9, 82 drill
  cases become 50 — so every repository here is exported with the full history walk, however long that takes
  on a shared machine.
- **`cpp-json` is out of the corpus**, for the reason ticket 101 already recorded: its history walk (12 146
  blobs) does not finish inside any usable budget. The coin (§3) is unchanged and it stays listed as DEV; DEV
  is therefore eight repositories and HOLD-OUT nine.

---

## 7. The proof that a round changed wording and nothing else

Every round is diffed against the previous one with `nonwording-diff.mjs`, file by file across every rendered
repository. The rule it enforces:

| artefact | what must hold |
|---|---|
| the set of paths | identical — same aspect ids, same node directories, same drill corpora |
| `check.mjs` | the EXECUTABLE body byte-identical. Its `// PROVENANCE` comment quotes the rule's own sentence, so that comment is prose exactly like the sentence it quotes |
| `provenance.json` | byte-identical, every field — it carries only ids, numbers and statuses |
| drill corpus files | byte-identical |
| `sizing.json` | byte-identical |
| `yg-aspect.yaml` | `status:`, `review_by:` and the whole `scope:` block identical |
| `yg-node.yaml` | identical outside `#e`/`description` |
| `yg-architecture.yaml` | identical outside comments and `description:` |
| `proposal.json` | `counts` identical except `charterAvgLines` (a count OF PROSE — a charter that gained a sentence is longer by design), and every `evidence[]` row identical outside its own prose field |

`charter.md`, `content.md`, `PROPOSAL.md`, `alternatives.md` and `REFACTOR-BACKLOG.md` are prose end to end
and are where a round is allowed to differ.

---

## 8. The result

### 8.1 The hold-out, which is the answer

Nine repositories the wording was never tuned on, 69 items, judged twice — once with the baseline templates,
once with the final ones — under the protocol of §2.

| | rule (a) | true (b) | **SENSE (a & c)** | all three passes agree on (a) |
|---|---|---|---|---|
| HOLD-OUT, baseline | **0.000** | 0.551 | **0.000** | 1.000 |
| HOLD-OUT, final | **0.928** | 0.710 | **0.493** | 1.000 |

**It moved.** Not one of the 69 baseline sentences was judged a rule an agent can obey or violate; 64 of 69 of
the final ones were, and 34 of 69 were judged a rule worth enforcing at the status it carries. The DEV arm,
where the wording was tuned, moved less than the hold-out did: **0.000 → 0.305** sense on 82 items. The
wording generalises; it was not fitted.

### 8.2 Per category and per status, on the hold-out

| group | n | rule (a) base → final | true (b) base → final | SENSE base → final |
|---|---|---|---|---|
| ALL | 69 | 0.000 → 0.928 | 0.551 → 0.710 | 0.000 → **0.493** |
| aspects | 45 | 0.000 → 0.956 | 0.400 → 0.578 | 0.000 → 0.289 |
| types | 12 | 0.000 → 0.750 | 0.667 → 0.917 | 0.000 → 0.750 |
| charters | 12 | 0.000 → 1.000 | 1.000 → 1.000 | 0.000 → **1.000** |
| — origin: certified convention | 17 | 0.000 → 0.941 | 0.824 → 0.882 | 0.000 → 0.176 |
| — origin: sub-gate lattice | 28 | 0.000 → 0.964 | 0.143 → 0.393 | 0.000 → 0.357 |
| status `enforced` | 9 | 0.000 → 1.000 | 1.000 → 0.889 | 0.000 → **0.000** |
| status `advisory` | 22 | 0.000 → 1.000 | 0.182 → 0.500 | 0.000 → 0.455 |
| status `draft` | 14 | 0.000 → 0.857 | 0.357 → 0.500 | 0.000 → 0.214 |
| status `n/a` (types, charters) | 24 | 0.000 → 0.875 | 0.833 → 0.958 | 0.000 → 0.708 |

### 8.3 DEV, round by round

| round | n | rule (a) | true (b) | SENSE | cards changed vs previous |
|---|---|---|---|---|---|
| baseline | 82 | 0.000 | 0.500 | 0.000 | — |
| round 1 | 82 | 0.866 | 0.598 | 0.293 | 82 of 82 |
| round 2 | 82 | 0.866 | 0.659 | **0.305** | 18 of 82 (all 12 types, 6 charters) |

Round 2 moved sense by one item of 82. By the frozen stopping rule (§2), that ended the iteration: two wording
rounds, not four.

---

## 9. How reliable is the judge — read this before believing §8

Three numbers, and a caveat that matters more than any of them.

| round / arm | pass 1–2 | pass 1–3 | pass 2–3 | Cohen kappa |
|---|---|---|---|---|
| DEV baseline | 1.000 | 1.000 | 1.000 | **undefined** — (a) is constant (all NO), so `p_e` = 1 |
| DEV round 1 | 1.000 | 1.000 | 1.000 | 1.000 (71 yes / 11 no — there is variance to correct for) |
| DEV round 2 | 1.000 | 1.000 | 1.000 | 1.000 |
| HOLD-OUT baseline | 1.000 | 1.000 | 1.000 | **undefined** — (a) is constant (all NO) |
| HOLD-OUT final | 1.000 | 1.000 | 1.000 | 1.000 (64 yes / 5 no) |

Two things to say plainly about this:

- **On the baseline rounds kappa cannot be computed at all.** Every item is a NO, so chance agreement is 1 and
  the coefficient is undefined — not perfect. Only raw agreement can be reported there, and it says only that
  the judge did not contradict itself.
- **On the rounds where kappa IS defined it is 1.000, and that is a weaker fact than it looks.** Once the
  obligation form exists, question (a) stops being a judgement call and becomes close to mechanical: *does the
  sentence tell the agent what to do or not do?* A sentence beginning "Every … must" or "No … may" answers
  yes; "methods here are annotated with X" answers no; a type whose whole content is "put a file here only if
  it belongs here" answers no. **Perfect agreement on (a) measures the determinacy of that criterion, not the
  insight of the judge.** The judgement that carries real information is (c) — *is it worth enforcing at this
  status* — and the free text, and both of those are one model's opinion, three times.
- **And the panel is one model, not three.** §0 says it; it is repeated here because §8's headline number
  depends on it. An independent panel would very likely agree about (a) — the criterion is nearly mechanical —
  and could easily disagree about (c), which is exactly where the sense number lives.

One further disclosure about procedure: DEV round 2 changed only 18 of the 82 cards. Those 18 were judged
fresh in three passes; for the 64 cards left byte-identical, round 1's verdict was carried forward rather than
re-typed (PROTOCOL.md amendment 2). Every other round-arm was judged by reading all of its cards, three times,
in three different orders.

---

## 10. What stays an observation whatever the wording — the mining problems

Six classes. Wording made every one of them VISIBLE; it could not make any of them a rule. Each is named here
so it can become its own ticket.

**(1) A majority reported as a prohibition.** The largest class by far. `No file under `axum-core/**` may
import `http`` — 4 of 19 files do. `No method under `axum-macros/src/**` may call `Some`` — 26 of 115 do.
`No file under `src/test/**` may import …RestTemplateBuilder` — 4 of 20 do. The obligation form is exactly
right and the rule is exactly wrong: a module used by 15–30% of a directory becomes "nothing here may use it".
This is ticket 101 §7.2's mode 1, now measured on the arm that matters: **truth (b) on sub-gate-lattice rows is
0.143 at baseline and 0.393 after the rewording** — the evidence line saying "5 break it today" is what lets a
reader see it, and seeing it is all wording can do. **The direction is mined, not written.**

**(2) An identifier that is a parser's node type, not anything a developer writes.** `Every method under
`contracts/access/**` must contain a `call_expression``; `must use the structure
`statement(assembly_statement(assembly_flags,yul_assignment))``. These are the `has` / `stshape` / `first1` /
`varshape` families. They are true, they are checkable, and no agent can obey them, because the identifier
belongs to tree-sitter's grammar rather than to the language a person writes. Judged (a) NO in every pass, in
both arms, under both wordings.

**(3) A generic type parameter read as a domain type.** `must take a parameter of type `S`` / `V`. The rule is
obeyable and useless.

**(4) A rule measured in one role cluster and enforced over the whole directory.** `Every method under
`axum/**` must take exactly 1 parameter` was measured over 15 methods in one cluster; the scope is the whole
crate. `Every named callback under `test/utils/**` must live under `math/`` was measured over 12. The old
wording hid this by naming the cluster in the sentence; the new wording makes the sentence match the scope the
check is judged over, which makes the over-broad scope obvious. **The fix is a narrower scope predicate, not a
different sentence.**

**(5) A type with no rule and no relation obliges nothing.** On the hold-out, types whose description carries a
`may depend on` clause are judged rules; the ones without it are not — the placement sentence alone is
circular ("put a file here only if it belongs here"). Round 2 made the type say so outright, which raised
truth to 0.917 and left (a) where it was. **Only attaching something makes a type a rule.**

**(6) A `_root` partition has no host type, so every rule mined in it is dropped.** Introduced by ticket 101's
own root-glob fix. `kotlin-datetime` (251 mined files) and `leveldb` (134 mined files, 9 certified
conventions) now propose **zero aspects**; `gin` (43 files in `_root`) and `groovy-spock` (5) lose theirs too.
Four of seventeen repositories affected, two of them totally. Not touched here — it is attachment, not
wording — and it is the single largest hole this ticket walked past.

### 10.1 And one that is not a mining problem but is not wording either

**`enforced` is earned by a correct check, never by a repository that already holds the rule.** Every enforced
item in both arms scored (a) yes and (c) NO — 12 of 12 on DEV, 9 of 9 on the hold-out — for one reason the new
evidence line states in its first clause: `holds for 520 of 527 files in scope; 7 break it today`. A status
that blocks CI, on a rule 7 files already break, on the day the proposal is delivered. Ruling
`enforced-requires-certified-origin` requires a certified origin AND a clean drill; the drill proves the CHECK
correct and the origin proves grain would certify the CONVENTION, and neither of them asks whether the
repository is already green. **Sense at `enforced` is 0.000 in every round of this report and the wording
cannot move it.** The wording's contribution was to make the number visible on the card.

---

## 11. The two things ticket 101 could not check

**(i) The obligation form does not change the drill.** `yg drill --aspect <id>` was run for every aspect that
shipped a `check.mjs` in three repositories — `spring-petclinic`, `tsx-zustand`, `telescope.nvim`, 22 aspects
— against the baseline tree and against the reworded tree. The two transcripts are **identical, line for
line**. That is what the separation is supposed to buy: the sentence is the `name:` field, the drill reads
`check.mjs` and its corpus, and neither knows about the other.

**(ii) `yg check` still loads every repository.** All seventeen were staged onto their own worktree with the
final rendered `.yggdrasil/` and checked with the real binary. **17 of 17 load, with zero load-blocking error
codes** — no `architecture-invalid`, no `graph-load-*`, no `aspect-invalid`, no `parent-type-forbidden`, no
`file-duplicate-mapping`. Eight report PASS. The nine that report FAIL do so for reasons a proposal is
supposed to report and this ticket did not touch: `unverified` pairs (a graph nobody has run `yg check
--approve` on yet — every enforced aspect is an unverified pair by construction), `structural-cycle` (a real
dependency loop in the repository, which the renderer declares rather than hides — ticket 101 §"buildNodes"),
`type-when-mismatch`, and `rules-digest-stale` (the staged copy carries no agent-rules install, an artefact of
the staging and not of the proposal). Same result as ticket 101's own load leg, on a corpus one repository
larger.

---

## 12. The sampled item ids, verbatim

Drawn once from the baseline render, seed `109-sense`, never re-drawn; the same ids were re-judged after
every wording round.

### DEV sample (82 items)

- `axum-full::aspect::grain/axum-core/candidate-auto-imp-http`
- `axum-full::aspect::grain/axum-core/candidate-auto-imp-std-future-future`
- `axum-full::aspect::grain/axum-core/candidate-auto-ptype-s`
- `axum-full::aspect::grain/axum-core/candidate-auto-returns-result`
- `axum-full::aspect::grain/axum-extra/candidate-auto-returns-self`
- `axum-full::aspect::grain/axum-macros-src/candidate-auto-call-some`
- `axum-full::aspect::grain/axum-macros-src/candidate-auto-imp-crate`
- `axum-full::aspect::grain/axum-macros-src/candidate-auto-imp-std`
- `axum-full::aspect::grain/axum-macros-tests/candidate-auto-imp-axum-macros-debug-handler`
- `axum-full::aspect::grain/axum-macros-tests/candidate-auto-imp-axum-macros-fromrequest`
- `axum-full::aspect::grain/axum-macros-tests/partition-filenameshape`
- `axum-full::aspect::grain/axum-macros-tests/partition-nameshape`
- `axum-full::aspect::grain/axum/candidate-auto-arity`
- `axum-full::aspect::grain/axum/deserialize-struct-ptype-v`
- `axum-full::aspect::grain/axum/partition-returns-result`
- `axum-full::aspect::grain/examples/candidate-auto-call-router-new`
- `axum-full::aspect::grain/examples/partition-imp-axum`
- `axum-full::aspect::grain/examples/partition-nameshape`
- `axum-full::type::axum-core-src`
- `axum-full::type::axum-macros-src`
- `axum-full::type::examples-customize-extractor-error`
- `groovy-spock::aspect::grain/build-logic/candidate-auto-filenameshape`
- `groovy-spock::aspect::grain/build-logic/candidate-auto-lex-quote`
- `groovy-spock::aspect::grain/spock-core-src-main-java/directory-deco-override`
- `groovy-spock::aspect::grain/spock-core-src-main-java/partition-filenameshape`
- `groovy-spock::aspect::grain/spock-core-src-main-java/retention-target-container-deco-retention`
- `groovy-spock::aspect::grain/spock-guice/candidate-auto-deco-override`
- `groovy-spock::aspect::grain/spock-guice/candidate-auto-returns-def`
- `groovy-spock::aspect::grain/spock-junit4/candidate-auto-lex-indent`
- `groovy-spock::aspect::grain/spock-junit4/directory-nameshape`
- `groovy-spock::aspect::grain/spock-junit4/partition-filenameshape`
- `groovy-spock::aspect::grain/spock-specs-src-test-groovy/partition-lex-quote`
- `groovy-spock::aspect::grain/spock-spring/candidate-auto-extends-specification`
- `groovy-spock::aspect::grain/spock-spring/candidate-auto-lex-indent`
- `groovy-spock::aspect::grain/spock-spring/partition-filenameshape`
- `groovy-spock::aspect::grain/spock-spring/partition-lex-quote`
- `groovy-spock::aspect::grain/spock-testkit/candidate-auto-extends-spockenginebase`
- `groovy-spock::charter::repo-root`
- `groovy-spock::charter::spock-core/src/main`
- `groovy-spock::charter::spock-junit4`
- `groovy-spock::charter::spock-specs/src/test`
- `groovy-spock::type::config`
- `groovy-spock::type::github-workflows`
- `groovy-spock::type::spock-core-src-main-groovy`
- `groovy-spock::type::spock-guice-src`
- `leveldb::charter::helpers`
- `serde-full::aspect::grain/serde-derive/partition-nameshape`
- `serde-full::aspect::grain/serde-derive/partition-returns-option`
- `serde-full::aspect::grain/test-suite-tests-ui/partition-nameshape`
- `serde-full::aspect::grain/test-suite-tests/candidate-auto-nameshape`
- `serde-full::aspect::grain/test-suite-tests/from-test-unit-stshape-expression-statement-call-expression-gen`
- `serde-full::charter::repo-root`
- `serde-full::charter::serde`
- `serde-full::charter::test_suite/tests/ui`
- `sinatra::aspect::grain/rack-protection-lib/candidate-auto-filenameshape`
- `sinatra::aspect::grain/rack-protection-lib/candidate-auto-lex-quote`
- `sinatra::aspect::grain/sinatra-contrib-lib/candidate-auto-lex-indent`
- `sinatra::aspect::grain/test/partition-filenameshape`
- `sinatra::charter::dot-github`
- `spring-petclinic::aspect::grain/src-main-java/candidate-auto-filenameshape`
- `spring-petclinic::aspect::grain/src-main-java/candidate-auto-imp-jakarta-persistence-entity`
- `spring-petclinic::aspect::grain/src-main-java/candidate-auto-imp-jakarta-persistence-table`
- `spring-petclinic::aspect::grain/src-main-java/candidate-auto-nameshape`
- `spring-petclinic::aspect::grain/src-test/candidate-auto-deco-springboottest`
- `spring-petclinic::aspect::grain/src-test/candidate-auto-deco-webmvctest`
- `spring-petclinic::aspect::grain/src-test/candidate-auto-imp-org-springframework-boot-restclient-resttemplatebuilder`
- `spring-petclinic::aspect::grain/src-test/candidate-auto-imp-org-springframework-boot-test-context-springboottest-webenvironment`
- `spring-petclinic::aspect::grain/src-test/candidate-auto-imp-org-springframework-boot-test-web-server-localserverport`
- `spring-petclinic::charter::gradle`
- `spring-petclinic::type::src-main-java`
- `telescope.nvim::aspect::grain/lua-telescope/partition-lex-quote`
- `telescope.nvim::aspect::grain/lua-tests/candidate-auto-filenameshape`
- `telescope.nvim::type::data`
- `telescope.nvim::type::lua-telescope-previewers`
- `telescope.nvim::type::lua-tests-automated`
- `telescope.nvim::type::repo-root-file`
- `tsx-zustand::aspect::grain/tests/candidate-auto-imp-set`
- `tsx-zustand::aspect::grain/tests/candidate-auto-imp-v`
- `tsx-zustand::aspect::grain/tests/candidate-auto-imp-vitest`
- `tsx-zustand::aspect::grain/tests/candidate-auto-lex-indent`
- `tsx-zustand::charter::examples`
- `tsx-zustand::charter::examples/starter`

### HOLD-OUT sample (69 items)

- `CleanArchitecture::aspect::grain/src-application/candidate-auto-extends-irequest`
- `CleanArchitecture::aspect::grain/src-application/candidate-auto-extends-irequesthandler`
- `CleanArchitecture::charter::src/Shared`
- `CleanArchitecture::charter::templates`
- `Slim::aspect::grain/slim-interfaces/candidate-auto-imp-psr-http-message-serverrequestinterface`
- `Slim::aspect::grain/slim-interfaces/candidate-auto-nameshape`
- `Slim::aspect::grain/slim-interfaces/candidate-auto-returns-routeinterface`
- `Slim::aspect::grain/tests/partition-filenameshape`
- `Slim::charter::Slim/Exception`
- `Slim::charter::Slim/Interfaces`
- `Slim::type::tests`
- `bash-it::aspect::grain/completion/candidate-auto-lex-quote`
- `bash-it::aspect::grain/completion/partition-lex-indent`
- `bash-it::aspect::grain/plugins/candidate-auto-filenameshape`
- `bash-it::aspect::grain/themes/candidate-auto-filenameshape`
- `bash-it::aspect::grain/themes/candidate-auto-lex-quote`
- `bash-it::aspect::grain/themes/partition-lex-indent`
- `bash-it::charter::test/fixtures`
- `bash-it::charter::vendor`
- `express::aspect::grain/examples/candidate-auto-call-res-render`
- `express::aspect::grain/examples/candidate-auto-nameshape`
- `express::aspect::grain/examples/partition-filenameshape`
- `express::aspect::grain/lib/candidate-auto-call-this-get`
- `express::aspect::grain/test-acceptance/redirect-should-to-call-request`
- `express::aspect::grain/test/candidate-auto-call-it`
- `express::type::repo-root-file`
- `flask::aspect::grain/src/partition-deco-setupmethod`
- `flask::aspect::grain/src/partition-returns-t-any`
- `flask::aspect::grain/tests/partition-nameshape`
- `flask::charter::dot-github`
- `flask::charter::dot-github/workflows`
- `flask::charter::examples`
- `gin::aspect::grain/render/candidate-auto-filenameshape`
- `gin::aspect::grain/render/candidate-auto-nameshape`
- `gin::charter::codec`
- `kotlin-datetime::charter::core/linux`
- `kotlin-datetime::charter::dot-github`
- `kotlin-datetime::type::core-jvm`
- `kotlin-datetime::type::core-windows`
- `kotlin-datetime::type::idea`
- `openzeppelin-contracts::aspect::grain/contracts-access/candidate-auto-extends-iaccesscontrol`
- `openzeppelin-contracts::aspect::grain/contracts-access/candidate-auto-has-call-expression`
- `openzeppelin-contracts::aspect::grain/contracts-governance/candidate-auto-imp-contracts-utils-math-math`
- `openzeppelin-contracts::aspect::grain/contracts-interfaces/candidate-auto-filenameshape`
- `openzeppelin-contracts::aspect::grain/contracts-interfaces/candidate-auto-nameshape`
- `openzeppelin-contracts::aspect::grain/contracts-interfaces/partition-nameshape`
- `openzeppelin-contracts::aspect::grain/contracts-mocks/onlyrole-deco-onlyrole`
- `openzeppelin-contracts::aspect::grain/contracts-mocks/partition-filenameshape`
- `openzeppelin-contracts::aspect::grain/contracts-utils/extract-stshape-statement-assembly-statement-assembly-fl`
- `openzeppelin-contracts::aspect::grain/contracts-utils/partition-nameshape`
- `openzeppelin-contracts::aspect::grain/test-access/candidate-auto-imp-chai`
- `openzeppelin-contracts::aspect::grain/test-account/candidate-auto-filenameshape`
- `openzeppelin-contracts::aspect::grain/test-governance/candidate-auto-imp-hardhat`
- `openzeppelin-contracts::aspect::grain/test-governance/candidate-auto-imp-nomicfoundation-hardhat-ethers-chai-matchers-withargs`
- `openzeppelin-contracts::aspect::grain/test-proxy/candidate-auto-imp-chai`
- `openzeppelin-contracts::aspect::grain/test-token/candidate-auto-imp-hardhat`
- `openzeppelin-contracts::aspect::grain/test-token/partition-imp-chai`
- `openzeppelin-contracts::aspect::grain/test-token/partition-lex-quote`
- `openzeppelin-contracts::aspect::grain/test-utils/candidate-auto-dir3`
- `openzeppelin-contracts::aspect::grain/test-utils/candidate-auto-lex-indent`
- `openzeppelin-contracts::aspect::grain/test-utils/compares-strings-two-call-this-mock-equal`
- `openzeppelin-contracts::aspect::grain/test-utils/partition-filenameshape`
- `openzeppelin-contracts::type::contracts-governance`
- `openzeppelin-contracts::type::github`
- `openzeppelin-contracts::type::scripts-generate`
- `openzeppelin-contracts::type::test-account`
- `openzeppelin-contracts::type::test-account-utils`
- `openzeppelin-contracts::type::test-governance-extensions`
- `openzeppelin-contracts::type::test-token-erc20`

---

## 13. Six hold-out sentences, before and after

Verbatim, from `openzeppelin-contracts`, `Slim`, `CleanArchitecture`, `bash-it` and `express` — repositories no
wording decision was ever made from.

| before | after |
|---|---|
| ``types in `src/Application` do not extend `IRequest` `` | ``No type under `src/Application/**` may extend `IRequest`.`` |
| ``methods in `Slim/Interfaces` follow the name shape `` ` ` `` | ``Every method under `Slim/Interfaces/**` must be named camelCase.`` |
| ``files in `themes` have auto.lex:quote`` | ``Every file under `themes/**` must quote strings with double quotes.`` |
| ``cases in `test` do not call `it` `` | ``No named callback under `test/**` may call `it`.`` |
| ``methods here are annotated with `onlyRole` `` | ``Every method under `contracts/mocks/**`, in a file mentioning `withdraw`, must be annotated with `onlyRole`.`` |
| ``Files under `.github/workflows` — proposed from grain's refined module graph.`` | ``Put a file under `.github/workflows/` only if it belongs to this type: a file placed there is classified here with no further step, and every rule attached to this type applies to it from that moment. No rule and no relation are attached to this type yet, so today it constrains nothing — it is where they will attach.`` |

And one charter opening, which is the change the judge scored 1.000 on:

| before | after |
|---|---|
| `Organizational node — no mapping of its own; every file is owned by a child under `model/templates/`.` … `## Depends on / used by` … `- depends on: (no resolved outgoing import)` | `Organizational node — it owns no file of its own. Every file under `model/templates/` belongs to one of its children; attach a rule to the child that owns the file, never here.` … `## What this node may depend on` … `- may depend on: nothing is declared yet. `yg check` refuses a dependency on another node until it is declared here, so declare the relation before the first import.` |

The last row is the whole method in one line: **the same fact, said as the thing the reader must do about it.**

---

## 14. What this answers, and what it does not

The maintainer asked whether the WORDING could be changed so that an independent judge, seeing only the
sentence and its evidence, agrees the item is a rule an agent can obey, true of the repository, and worth
enforcing at its status — and how high agreement can go without changing what is mined.

**How high it went, on a hold-out, with nothing re-mined: 0.000 → 0.493.** "Is this a rule at all" went
0.000 → 0.928. Every charter in the sample became a rule an agent can obey. Every enforced aspect became a
rule an agent can obey and none of them became worth enforcing.

**What it does not answer.** The panel is one model (§0, §9). The (c) judgement — the half of the sense
measure that is not mechanical — is that one model's opinion, taken three times. A second opinion would very
likely agree about (a) and could easily move (c) in either direction, and the number to re-measure first, if
anyone does, is (c) on the 45 hold-out aspects.

**What it hands to the next ticket.** Five wording-shaped things are done and committed. Six things are not
wording and are named in §10: the mined direction of a prohibition, the parser-vocabulary identifier, the
generic type parameter, the cluster-measured-directory-enforced scope, the type with nothing attached, and
`_root` partitions dropping every rule mined in them. Plus one that is neither mining nor wording (§10.1):
`enforced` is earned by a correct check and never asks whether the repository is already green, and sense at
`enforced` is 0.000 in every round of this report because of it.

---

## 15. Reproducing this

The instruments live in the run's scratch directory, not in the repository — they measure the renderer, they
are not part of it (`CONTRIBUTING`, "the scripts directory"). Each is small and self-describing:

| script | what it does |
|---|---|
| `split.mjs` | the coin: `sha256("grain-109-sense-split:" + repo)`, hex ascending, first nine DEV |
| `render.sh` / `render2.sh` | render the corpus; round 2+ reuses each repository's cached `grain export` so nothing is re-mined |
| `extract.mjs` | walk a rendered tree and emit one JSONL item per judgeable element, with a stable id |
| `sample.mjs` | draw the fixed stratified sample for one arm, seed `109-sense` |
| `cards.mjs` | render one pass's cards in that pass's order, and write its card→item key beside them |
| `score.mjs` | read three passes' verdicts and compute agreement, sense, truth and Cohen's kappa |
| `carddiff.mjs` / `changed.mjs` | which sampled cards a round actually changed, and print just those |
| `nonwording-diff.mjs` | the §7 proof: fail if a round changed anything outside a prose field |
| `ygdrill.sh` / `ygcheck.sh` | the §11 legs: a real `yg drill` per aspect, and a real `yg check` on a staged tree |

`PROTOCOL.md`, the per-pass card files, the per-pass verdict files and the per-round score tables are beside
them, so every number in §8 can be recomputed from the verdicts without re-judging anything.

---

## 16. Tests

`npm test` in `plugins/grain/` with `YG_BIN` and `HORDE_DIR` set, on the final templates:

```
# tests 2293
# suites 10
# pass 2293
# fail 0
```

The three suites the renderer's contract lives in — `propose.test.mjs` (20 tests, two of them new for this
ticket), `propose-command.test.mjs` (9) and `cross-check-propose-parity.test.mjs` (6) — pass inside that run
and were also run alone after every round.
