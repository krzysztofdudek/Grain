# Counsel 3 — the clean-slate rewrite, and the factory as one concept

**Two questions, in the maintainer's words.** (1) If a clean-slate rewrite of Yggdrasil were commissioned to do
everything the two counsel memos ask — would the code be better? (2) If a software factory were commissioned,
built from all the modules as one concept — what would Fable say?

**Answer in three sentences.** No: a rewrite could at best reach parity with a system whose last five months
consist mostly of learned negatives, and every change the memos actually land on Yggdrasil is additive and sits
at its edges, so the memos are not a reason to rewrite anything. The factory as one *concept* exists already —
it is the evidence chain requirement → flow → rule-with-provenance → content-addressed verdict → signed incident,
and the contracts at its seams — but as one *repository* or one *product claim* it would be fabrication today,
because three of its evidence rows have no number anyone has measured. The two questions meet in one place:
the factory's own miner is the only instrument that can guide a refactor of Yggdrasil without a name list, and
running it there (Grain on Yggdrasil, already measured twice) is the cheapest honest demo of the whole idea.

Everything below is measured on disk on 2026-09-05. Where I ran a command it is named; where a number comes
from an earlier report, the report is named. I never wrote into Yggdrasil or Horde. (One caveat on method: the
sandbox refused `git` against the Yggdrasil checkout, so its commit count comes from the reconstruction report
— 1 510 commits in the export, 1 564 after unshallow — and its tempo from the release dates in `CHANGELOG.md`.
The read-only commands I ran there — `yg check`, `yg advise`, `yg aspects --health`, `yg prime`, `yg knowledge
list`, `yg schemas list` — touch only Yggdrasil's own gitignored caches; the `.grain/` directory the earlier
workers left is gone.)

---

## Part A — the clean-slate rewrite of Yggdrasil

### A1. What "everything Fable said" actually asks of Yggdrasil

I went through both memos and the `ecosystem-design-scope-split` ruling and listed every change that lands on
the Yggdrasil repository rather than on Grain or Horde. For each: does it add to the current code, or fight
its shape?

| # | change | where it lands | additive or fights the shape |
|---|---|---|---|
| 1 | A committed deterministic catch/exposure stream, so `aspects --health` can retire a *generated* rule (counsel 2 §2.7; today every deterministic row reads `—`, confirmed live) | `events:` config, fill writer | **Fights the shape.** `yg-config.yaml` says why deterministic checks never write to the committed stream: "so the keyless CI gate stays byte-stable". CI runs `--approve --only-deterministic`; a committed stream would dirty the tree on every CI run. Counsel 2's own alternative — retirement from an auto-cut drill that stops catching on fresh history — needs no Yggdrasil change at all. Take the alternative. |
| 2 | `yg advise`'s "candidate rule family" class reads Grain's proposal instead of the in-house miner | `cli/advise.ts` `readFamilyCandidatesSource`, `core/advise-nominations.ts` | **Additive.** The class is already present-or-omit over a JSON file with a documented payload; the change is a source path and an adapter to `FamilyCandidatesData`, or Grain rendering into that shape. |
| 3 | Cut `scripts/family-without-law.mjs` (837 lines; `LINKAGE_CUTOFF` 1.5, `TIGHTNESS_MEDIAN_MAX` 0.75, `BROAD_ANCESTOR_MAX_FILES` 40, `MAX_STRATUM_FILES` 4000, `MIN_AFFIX_TOKEN` 3, `MAD_SCALE`, a member floor — the six-constant epistemology) | `scripts/`, three planted-family fixtures under `tests/fixtures/family-*` | **Additive (a deletion).** One thing must survive the cut: the miner was admitted into `advise` "ONLY after proven precision at BUILD time — the planted-family fixtures assert exact recall + zero false families". Whatever feeds that class next must pass the same fixture contract. Cut the miner, keep the gate. |
| 4 | Two meta-law aspects: a check with a numeric constant and no `signed-by` line refuses; a generated rule without `provenance.json` refuses | `.yggdrasil/aspects/`, on the existing `rule-script` type (already maps `aspects/*/check.mjs`) | **Additive.** The `meta-modeling` knowledge topic and the `rule-script` type exist for exactly this. One assumption to verify before writing them: the aspect loader must tolerate an unrecognised `provenance.json` beside `yg-aspect.yaml` (it tolerates `README.md` at the aspects root and reserves only `drills/`). |
| 5 | Flows as the durable home of a requirement (`description:` verbatim, `nodes:`, `aspects:`) | `flows/` | **Additive, no schema change.** 18 flows exist today with that shape. |
| 6 | A measurement aspect per threshold row: `check.mjs` reads `measurements/<R>.json` through `ctx.fs.read` and refuses past the signed number | an aspect + a `measurement` node reachable by a declared relation | **Additive.** The observation fold re-verifies the pair exactly when the file changes — the mechanism exists and is documented. The constraint is graph authoring (allowed-reads), not engine code. |
| 7 | The incident wire's Yggdrasil half: after `yg incident add --tag wrong-rule --aspect X`, cut the escaped code into `aspects/X/drills/violates-incident-<ts>/` | a small helper (Horde script or `yg` subcommand) | **Additive.** `incident add` with `--aspect` exists; the drill convention exists; the cut is a file copy into a reserved directory. |
| 8 | `yg simulate` replaying proposal candidates | nothing to change | **A limit to disclose.** Simulate's honest horizon is "commits whose committed graph schema equals the current one". Yggdrasil moved to schema 5.2.0 on 2026-06-21; on its own history the replay reaches no further back than that. Say so in every 097 table. |
| 9 | `yg drill --dir <proposal>/drills` on draft aspects; the built-in relation check as the free acceptance test of proposed relations | nothing to change | Already used by 094: 43 rendered checks drilled through the real CLI, the staged `yg check` loaded the proposal with one real error. |

Nine items; six additive, two already possible, one that fights the shape and has an alternative the same memo
supplies. Not one touches `pair-hash.ts`, the lock triad, the fill stage, the relation pass, the seven-channel
cascade, the manual's invariants, or the schema version. On a 69 093-line source tree the Yggdrasil-side delta
the memos require is two aspects, one script deleted, one source path re-pointed, one helper — well under one
percent, all at the boundary. **Whatever the case for a rewrite is, it is not in the memos.**

### A2. The code as it stands — measured

**Size and layering.** 306 TypeScript files, 69 093 lines under `source/cli/src`: `core/` 22 217 (66 entries,
with sub-directories `checks/`, `graph/`, `log/`, `parsing/`), `cli/` 12 814 (36 files, 22 registered commands),
`relations/` 7 362 (11 language extractors plus resolvers), `templates/` 7 226 (of which the agent manual
`rules.ts` 627 lines and 15 knowledge topics 6 090 lines), `io/` 5 666, `portal/` 4 932, `structure/` 2 798,
`llm/` 1 291, `ast/` 1 172, `model/` 682, `formatters/` 638, `migrations/` 142. The largest files are
`core/advise-nominations.ts` 1 351, `cli/aspect-test.ts` 1 241, `core/progressive-scope.ts` 1 116,
`knowledge/cli-reference.ts` 1 071, `relations/extractors/csharp.ts` 1 015. The named hot spot,
`core/check.ts`, is 608 lines: its header lists ten sibling `check-*.ts` files it orchestrates — the
responsibilities were already factored out. What Grain's 096 run ranks first about it is fan-in 44, fan-out
19, churn 51 and co-change breadth 376 — it is a **hub**, not a blob. And on all ten of Yggdrasil's
`responsibilities` rows the minimal role-cut gain is **negative** (advise.ts: −9.85 bits). The one repository
in this family whose god-file split pays by Grain's own arithmetic is Grain (`core.mjs`, 10 658 lines, 67 % of
the engine, +184.79 bits along 28 role groups). The maintainer asked whether to rewrite Yggdrasil; the
instrument says the codebase with a rewrite-shaped problem is the miner.

**Does the self-model match the code?** Closely. `yg-architecture.yaml` (737 lines) declares 38 types, 36
classifying, every one with `relations: default: deny` and an explicit allow-list, `enforce: strict` on all but
three; 427 nodes cover 1 368/1 368 files. Grain, given no configuration, recovers nine types at Jaccard 1.0 and
`engine` at 0.976, both cycles `yg advise` nominates, and the two `deny` facts it can speak about (093). The
debt it finds is small and named: `repo-config` (54 files) and `ci-config` are hand buckets no locality
supports; `relations-adapter → engine` is *allowed* while practice uses it in 2 dependencies out of 34 scopes
(share 0.941 against); 131 node-pair relations are declared through an intermediary (`loadGraphOrAbort`) —
legitimate under the one-directional check. The two real cycles are `cli ↔ portal` (weakest edge `portal →
cli`, 4 dependencies) and `core ↔ relations ↔ structure` (weakest `relations → core`, 2). Those are six
dependencies. That is the size of the layering problem.

**Tests and the gate.** 705 test files, 172 265 lines — 2.5 lines of test per line of source; roughly 8 100
`it`/`test` cases in 1 385 `describe` blocks; 47 fixture projects (38 with their own `.yggdrasil/`); 133 e2e
files that spawn the built `bin.js`; 12 Playwright specs driving real Chromium. The gate is 17 fail-fast steps
with coverage ≥ 90 % on lines, statements, functions and branches; the deterministic cache is rebuilt as a
test prerequisite; a prompt-headroom instrument prints the largest reviewer prompt's margin under the 72 000
ceiling (raised four times, each time for `check.ts`). On the checkout I measured, a bare `yg check` reports
3 933 unverified pairs on 389 nodes — the free cache is absent in a fresh clone, exactly as documented — and
the graph is otherwise clean.

**The hash contract.** `core/pair-hash.ts` is marked FROZEN and pinned by `tests/fixtures/pair-hash-golden.json`
(seven golden values). Its exclusions are each argued in the header: status, reason text, node description, CLI
version, timeout, `when`/`implies`/`ports`. Its inclusions carry history: the tier folds by *name* only; a
companion's hash and observations fold only-when-present so that a plain LLM aspect stays byte-identical to the
pre-companion contract; a vanished observation folds to the sentinel `missing`, which is not a valid sha256 so it
can never equal a stored value; code-point key order, never `localeCompare`. Every committed
`yg-lock.nondeterministic.json` in every adopting repository (Yggdrasil's own is 200 KB, 1 126 LLM verdicts)
is valid only against this exact serialisation. **A rewrite that changes one byte of it re-bills every adopter's
reviewer for every pair.** A rewrite that reproduces it exactly is not a rewrite of this file — and the file's
"why" is the part a rewrite would be tempted to simplify.

**Migrations and schema.** Graph schema 5.2.0 (`CLI_SUPPORTED_SCHEMA`), separate from package 5.8.0. The live
registry holds one migration (`to-5.1.0`: remove `schemas/`, split the single lock into the triad), aggregated
from idempotent steps; 5.2.0 was a content-free bump gating `coverage.type_level`. The lock reader is an
explicit allow-list that *rejects* an entry with an unknown key (5.7.1) — so a rewrite must emit exactly the
current entry shape or every adopter's lock reads as malformed. What a rewrite owes existing graphs is
therefore not migrations (there is one) but byte-for-byte compatibility with three committed files and one
YAML dialect.

**The manual.** `yg prime` prints 60 935 characters; the 15 knowledge topics add 6 090 lines; the committed
digest is anchored by sha256 and gated by `rules-digest-stale` and by repo-check step 15. Half the product is
prose that describes exact behaviour — `tracked-file-gitignored` versus `file-mapping-gitignored`, the
all-or-nothing log gate, the three exits from a refusal, "never pipe `yg check` through `grep`". The 5.7.2
release is one entry: six agent-facing texts that contradicted the CLI or each other, fixed. The 5.6.0 release
is fifteen documentation entries of the same class. There are two command references to keep in step
(`docs/cli-reference.md` 1 180 lines and `knowledge/cli-reference.ts` 1 071) — that duplication is the one
piece of accidental complexity I would name without hesitation, and its cost is visible in the changelog.

**Issue codes.** 94 distinct codes named in `core/check-codes.ts`, 98 distinct `code:` literals emitted across
the source, partitioned into structural (blocking), completeness, approve-gating (abort before any reviewer
call), scoped (the only codes progressive mode may ever downgrade — "membership is doctrine, not convenience"),
their derived `-outside` twins, and four singleton-input codes. Each membership carries a rationale comment.
This is not accidental complexity; it is the accumulated answer to "which findings may a change be excused
from", and every entry was a decision.

**Rules as they run.** 70 aspects: 57 deterministic, 12 LLM, 1 aggregate; 67 enforced (37 explicit, 30 by
default), 3 advisory, 0 draft; `review_by` set on 65. `errs:` is declared on 56 of 57 deterministic checks
(30 `under`, 21 `over`, 5 `exact`). 45 of 57 carry a drill corpus — 96 `violates-*` and 94 `satisfies-*`
cases — and the 12 without are the ones a test forces into a reasoned exemption list. Eight `yg-suppress`
waivers are live (4 on `deterministic`, 4 on `silent-missing-files`). The committed LLM ledger holds 3 363
events; `aspects --health` shows 44 catches across six rules, three rules `decorative?` at 0/30, 0/114, 0/156,
three `quiet`, and `—` on every deterministic row. `yg advise` today: two overdue `review_by` dates, one
retirement proposal, three uncovered hot spots (`root/project-config` in 149 of the last 200 commits), the two
cycles, 0 incidents.

**Where the complexity is essential.** The seven-channel cascade with per-channel `status` and `max()`; the
`when` grammar at three sites; ports; the observation-folded hash; the lock triad and its garbage collection
with "prune only what the run can positively prove is gone"; progressive scope with the byte guard against
`--assume-unchanged`; the relation pass with fail-closed parse failures, per-language resolvers verified against
real interpreters (Python package-before-module, checked against CPython); the `errs:` labels and drill
convention; the message contract. **Where it is accidental.** The dual reference; the portal (4 932 lines, 12
portal aspects, its own e2e lane) as a read-only extension that could live beside the core rather than inside
its type table; `advise-nominations.ts` at 1 351 lines with eleven classes; `aspect-test.ts` with three modes in
one file; the six-dependency cycles. None of these is a reason to start over. All of them are ticket-sized.

**What the evolution bought.** 70 releases from 0.1.0 (2026-02-21) to 5.8.0 (2026-08-31): 7 in February, 26 in
March, 5 in April, 1 in May, 21 in June, 5 in July, 4 in August. The tempo fell by a factor of six between the
two building months and the last one — that is what "stabilised" looks like in a changelog. What was built in
the quiet is the negatives: the node description that was sent to the reviewer but never hashed ("a stale-green
generator", 5.7.1); the `--dry-run` that cost what a real run cost; the `--only-deterministic` summary that
claimed to prune LLM verdicts it never touched; `.mts`/`.cts` never parsed, so no rule ever ran on them;
`coverage.excluded` honoured in coverage counts and ignored in eight other callers, "contradicting itself
within one run"; four resolvers keeping an excluded candidate; the `--!>` terminator recorded as a waiver's
justification; a tracked-but-gitignored file invisible to mapping; owner resolution re-implemented in four
places until a rule forbade the fourth; three prototype-pollution lookups found by chance before a rule found
the fourth. Each is pinned now — by a test, a drill case, or one of the 53 "repo-internal dogfood graph"
entries that added a rule to the graph that governs the tool. A rewrite discards the graph's history with the
code.

### A3. Would the code be better?

**No.** Not as an artifact anyone would rather have. A clean-slate rewrite has a hard ceiling — parity with the
8 100 tests and the golden hash — and no floor: everything the tests do not pin (the manual's wording, the
what/why/next messages tuned by six months of dogfood, the reasons in the `check-codes.ts` comments) is lost by
default. Its measurable upside is codelength, and Grain has already measured that upside on Yggdrasil as
negative for every responsibilities cut it could compute. The remaining excess is coupling on hubs that any
system with one gate command will have. Three options, priced:

**(i) Rewrite from scratch.** *What improves:* fewer hub files by construction; no cycles; one reference
instead of two; a smaller or absent portal. *What is lost:* the lock contract unless reproduced exactly (and
then it is copied, not rewritten); some fraction of ~250 learned negatives; six months of manual–behaviour
correspondence; the gate's calibration. *Risk to adopters:* every committed LLM verdict re-billed if one hash
ingredient moves; the `rules-digest-stale` gate turning red in every adopting repo the day the manual changes;
schema 5.2.0 graphs needing a loader that reads them byte-identically. *Cost class:* Opus design, Sonnet
execution across, at Horde's sizing rule, roughly fifteen to twenty nodes (one per source directory plus the
test lanes), six to ten waves to parity, with an Opus auditor per wave. *What would decide it before
committing:* run the existing 133-file e2e suite and the pair-hash golden against the candidate binary; run
`yg check` on Yggdrasil's own graph and require an identical issue set (3 933 unverified pairs on a fresh
clone; after `--approve --only-deterministic` an identical verdict set); run the 96/94 drill sweep and require
identical outcomes; run the reconstruction instrument (093) on the new tree and require type recall ≥ 19/36 and
both cycles gone. Every one of those instruments exists and is free. Their best possible result is "the same".
**That is the whole argument: the acceptance test of a rewrite is a tie.**

**(ii) Strangler refactor guided by Grain's own ranking — the factory eating its own miner.** *Backlog, from
096 and 093, no name list:* the two cycles at their weakest edges (`relations → core`, 2 dependencies; `portal
→ cli`, 4); the top-ten excess rows (`core/check.ts`, `cli/advise.ts`, `cli/check.ts`, `graph-loader.ts`,
`fill.ts`, `validator.ts`, `relations/pass.ts`, `resolve-path.ts`, `aspect-parser.ts`, `model/graph.ts`); the
structural twin `core::11 check ~ core::4 architecture+check` (78.85 bits); the dual command reference; the 12
enforced deterministic rules without drills (invariant I1); the two hand-bucket types as graph debt to keep or
retype. *What improves:* measurable per wave — `yg advise` cycle count 2 → 0, total excess bits on the ranked
rows, graph-debt rows per 100 commits (098), drill coverage 45/57 → 57/57. *What is lost:* nothing an adopter
can see, provided two files are never touched (below). *Risk:* low — every ticket runs under the 17-step gate,
the golden pins the hash, `yg check --approve --only-deterministic` is free. *Cost:* Sonnet tickets, one to two
waves for the cycles and drills, an Opus architect ruling on the `relations → core` cut (it is an architecture
change, so the maintainer confirms it). *What decides it:* re-run 096 on Yggdrasil after the first wave; if the
top rows do not move and the cycles are still nominated, stop — "not doing it, with numbers".

**(iii) Leave the core; build the new ends beside it.** This is what the memos actually propose (A1): two
aspects, one deletion, one re-point, one helper in Yggdrasil; everything else in Grain, Horde and the new
compiler. *Risk to adopters:* none. *Cost:* as sequenced in counsel 2 §5.

**Recommendation: (iii) now, (ii) as Yggdrasil's standing maintenance mode, (i) never.** Under every option,
do not rewrite: `pair-hash.ts` and the lock entry shape (every adopter's money is in them); the digest's eight
"never" invariants and the manual's honesty rules (they are the record of what agents did wrong, and the
`rules-digest-stale` gate distributes them); the relation-conformance check's one-directional,
mapped-target-only, unambiguous-only design (093 §4 is the warning — a check made bidirectional to "use" Grain's
established negatives would turn *practiced* into *permitted* and fabricate a `deny`); the fail-closed rule for
infrastructure failures; `errs:` and the drill convention; the 17-step gate.

### A4. The trap, counted

A stabilised system rewritten from scratch loses the negatives it learned, and the changelog is the ledger of
them. I parsed all 1 000 top-level entries and classified each by section and by an honesty/disclosure lexicon
(silent, stale, misleading, false green, fail closed, "said X while doing Y", "counted the wrong thing" and
their kin — the script is in the session scratchpad, deterministic, and can be re-run).

| era | entries | Added | Fixed | Fixed ÷ Added | disclosure-class | disclosure ÷ entries |
|---|---|---|---|---|---|---|
| v0–v3 (Feb–Mar) | 208 | 80 | 36 | 0.45 | 9 | 4 % |
| v4 (Apr–Jun) | 157 | 95 | 18 | 0.19 | 8 | 5 % |
| v5 (Jun–Aug) | 635 | 202 | 264 | **1.31** | **246** | **39 %** |
| all | 1 000 | 377 | 318 | 0.84 | 263 | 26 % |

Of the 263 disclosure-class entries, 114 sit under Fixed, 100 under Added (features whose entire point is that
the tool now says something true it previously did not: `rules-digest-stale`, `tracked-file-gitignored`, the
"hidden edit is still your edit" byte guard, the silent-typo checks on the architecture file), 34 under
Changed. The ratio inverted between April and June: the v4 era added five features per fix; the v5 era fixed
more than it added, and two of every five entries are about the tool telling the truth. That is the shape the
maintainer calls "stabilised", and it is the exact material a rewrite starts without. The 53 "repo-internal
dogfood graph" entries are the second half of the trap: a large part of the learning is encoded not in
`source/` but in `.yggdrasil/` — the `rule-script` type that made the rule scripts obey their own rules, the
`reviewer-dispatch` type that removed two suppressions by saying honestly why determinism cannot apply. A
rewrite of the code that keeps the graph inherits rules about code that no longer exists; a rewrite of both
starts from zero twice.

---

## Part B — the software factory as one concept

### B1. What "one concept" would mean concretely

**(α) One monorepo, one product.** *Easier:* one gate, one version, one changelog, atomic cross-tool
refactors, one `yg check`. *What breaks:* Yggdrasil's isolation is not incidental — its graph covers 1 368/1 368
files with `default: deny` on every type; Grain's engine (`core.mjs` alone reads and writes the filesystem
everywhere, by design, as a plugin) would either sit inside that graph and fail `no-direct-fs`, `deterministic`,
`sibling-test-file` and the size aspects on day one, or sit outside it as an exempt island — a hole in the
product whose pitch is that nothing is exempt. Release cadence: Yggdrasil has 70 releases as an npm package at
5.8.0; Grain is paused at 0.3.0 with a README that says, correctly, "zero diffs changed by a grain answer" in
25 runs; Horde is 0.1.0, released yesterday, "a prototype, expect rough edges". One version number either
drags a shipped tool down to prototype status or lets a prototype borrow a shipped tool's record — and Horde's
own README already prints Grain's 0/25 in the family table, which is the honest arrangement. Three test
disciplines (vitest + Playwright at 90 % coverage; `node --test` with zero dependencies over a 25-repo corpus;
`node --test` over temporary git repos) under one gate means the slowest lane (Grain's 434-second cold export
on Yggdrasil, its hours-long Symfony ladder) gates Yggdrasil's four-minute commit hook. Cost-class discipline:
Horde's cost limit is per charter; one repo is one trunk for three products' missions. *The human's daily
surface:* one red gate with three unrelated causes.

**(β) One distribution.** One marketplace, one install, one manual over separate repos with their own gates.
*Easier:* an adopter installs the family once; the family table in Horde's README becomes the index page.
*What breaks:* little at the manifest level — each plugin already ships from its own repo and both Grain and
Horde are already marketplaces. "One manual" is the trap: `yg prime` is 61 KB, Grain's skill and Horde's
SKILL.md add their own; the command-reachability result (63 of 63 agent calls went to advertised commands, 0 to
the twelve that were not) says a merged manual raises the reachability of everything and the attention on
nothing. The honest middle is what `yg knowledge` already does: one index, each tool's manual on demand. *Daily
surface:* one install line, three tools, three gates.

**(γ) One graph, one evidence chain, repos as modules.** The chain is: requirement row (Horde charter) → flow
(`.yggdrasil/flows/<R>/`, description verbatim) → rule with `provenance.json` (Grain proposal → Yggdrasil draft
→ advisory on the 0 MISS / 0 FALSE-ALARM contract → enforced by signature) → content-addressed verdict (the lock)
→ signed incident (`incidents.md`) → drill case. "One concept" here means **one schema for the artifacts at the
seams** — `.grain/proposal/`, `provenance.json`, `measurements/<R>.json`, the charter columns, `incidents.md` —
and a seam test wherever two tools meet, of which 094's staged `yg check` is the template ("any future claim
that Grain proposes a graph should be made through that gate or not at all"). *Easier:* the maintainer reasons
about one pipeline while each repo keeps its own gate, cadence and honest status line. *What breaks:*
nothing structural. *The cost:* the seam contracts must be versioned, and a seam test only runs where both
binaries are present (094's `propose.test.mjs` skips with a reason when `YG_BIN` is absent) — so the family
needs one CI matrix that checks out the neighbours. The director's framing lands here: the seam is between
two epistemologies, Grain's single λ and Yggdrasil's contracts-and-signatures, and the one place they mix today
is `family-without-law.mjs` inside Yggdrasil. Cut it and the seam is clean: **one chain, two epistemologies,
three gates.** That is the concept, and it is (γ).

### B2. The charter, as far as it can be written today

If the factory were a Horde mission framed this morning, this is the charter — written to the template, and
stopped where a number would have to be invented.

> **Goal.** A change enters as a requirement in plain words and leaves as merged code whose rules were mined
> from the repository's own practice, verified by content-addressed verdicts a keyless CI re-proves, and whose
> escapes come back as signed incidents that become drills — with the human's recurring input reduced to the
> requirement rows, the thresholds inside them, and the signatures the family already reserves.
>
> **Non-goals.** Merging the repositories. An oracle the coding agent must ask (0 diffs changed in 25 runs).
> Auto-enforcement, auto-suppression, auto-recorded incidents, auto-approved LLM pairs. Tuned thresholds in the
> miner. Quoting a Yggdrasil-only number as general.
>
> **Constraints.** Agents never push. Fable opinion only; Opus design and judging; Sonnet execution; Haiku with
> a checker. Every generated rule carries provenance; every constant in a check carries a signature. Yggdrasil's
> hash contract and manual invariants are protected paths.
>
> **Acceptance — the evidence catalogue.**
>
> | id | evidence | node | number | who owns the number |
> |---|---|---|---|---|
> | E1 | Grain's proposal on a repo with a hand graph: type recall at J ≥ 0.5 and maintainer-accepted share of a 20-row sample | Grain | record: 21/36 (24 with alternatives), precision 23/82 on Yggdrasil; acceptance bar **unsigned** — counsel 2 wrote "≥ 80 %" by analogy with the obligations bar | **the maintainer** |
> | E2 | Law loop: miner-miss rules reproduced in verdict; sample precision on (a)+(b) | Grain, Yggdrasil (read-only) | ≥ 10/20 and ≥ 0.80 — set by director ruling `law-loop-is-the-bet`, on record, not yet user-signed | director set it; the maintainer confirms or moves it |
> | E3 | Every enforced deterministic rule has a `violates-*` drill or a reasoned exemption (I1) | Yggdrasil | a contract, already a test there: 45/57 + 12 exempt | none needed |
> | E4 | The proposal loads under the adopter's real CLI with no error except real cycles (seam test) | Grain × Yggdrasil | a contract: 094 measured exactly one error | none needed |
> | E5 | Graph-debt rows per 100 commits at wave close (I5) | Grain × Yggdrasil | trend to 0; a contract | none needed |
> | E6 | Incidents on the ledger > 0 and escape → drill latency (I6) | Horde × Yggdrasil | ledger is **0/0** today; latency has **no measurement anywhere** | **the maintainer**, after S4 exists |
> | E7 | Cost per merged ticket in weighted runs (I7) and a mission cost limit | Horde | **no baseline exists**: Horde has run zero missions; Grain's director prototype merged 52 tickets with no cost book | **the maintainer**, after one calibration mission |
> | E8 | Intent compiler: derived rows/flows accepted against Yggdrasil's 18 hand flows and past charters | new tool | **unsigned**; "≥ 80 %" is a number borrowed from a different quantity | **the maintainer** |
> | E9 | Questions to the human per requirement row (I8) | Horde | published, never thresholded — by design | — |
>
> **Nodes.** Touched: Grain (miner; Opus for the renderer's design, Sonnet otherwise), Yggdrasil (law; read-only
> except the four items in A1; Sonnet), Horde (organisation; Sonnet). New: the intent compiler (Opus design,
> Sonnet execution), reason: no repository contains a requirement → evidence translation. The incident wire is a
> contract ticket between Horde and Yggdrasil, so both owners approve.
>
> **Decision rights.** To the maintainer, beyond the standard list: any change to `yg-architecture.yaml` in any
> repo; enforcement of a generated rule; every threshold constant; every incident; a product claim ("factory")
> on any README; the cost limit once E7 has a baseline.
>
> **Cost.** Policy: cheapest class that passes verification, class on every ticket, weights haiku 1 · sonnet 3 ·
> opus 10 · fable 30 as Horde ships them. Limit: **cannot be set** — see E7.

The charter can be written down to the evidence table. Three rows (E6 latency, E7 cost, E8 fidelity) have no
number anyone has measured; two rows (E1, E8) reuse 0.80 from a different quantity and need a signature; one
row (E2) has a director-set number awaiting the user's. **That is the finding:** the concept lives in the
maintainer's head exactly at the thresholds and nowhere else — everything above and below them is derivable
from committed state today. And a footnote the framing exposes: Horde's `.horde/` is uncommitted by design, so a
factory charter written there dies with the session; the durable home has to be a committed flow in each
repo's `.yggdrasil/flows/` plus one family-level charter document — the concept out of his head and into a file
that survives a respawn, which is the failure mode Horde exists to prevent.

### B3. What Fable says to "commission the factory now"

**Ready, with numbers.** *Ground (R0):* from a 300-second export, the renderer writes 82 types, 72 nodes, 215
drafts (43 executable), 960 drill cases in 17 seconds; Yggdrasil loads the result with one error, which is a
real cycle; the drill sweep is 208 pass / 29 MISS / 0 FALSE-ALARM; on hand types of five or more files recall
is 20/29. *Law (R4′, R7):* 427 nodes, 70 aspects, 18 flows, 3 363 recorded fills, 44 catches, a lock every
fresh clone re-proves for free; `simulate`, `drill`, `aspects --health`, `advise`, `incident` all shipped.
*Organisation (R4):* Horde 0.1.0 with `premerge`'s six mechanical items, two keys and one approval, a random
auditor per wave — and, in this repository, the only lived evidence that the organisation layer works: six
waves, 52 merged tickets, 21 escalations ruled, five dropped with reasons, all through tools, all committed.

**Bets, each with the measurement that decides it.** B1 — 097's two bars, queued. Retirement from drills —
does an auto-cut drill exist and catch for the three `decorative?` rules. Sizing as a number — publish the
per-module codelength ratio beside owner-lease reclaims for a few missions before believing it. Template as a
shape check — try it on the 20 no-identifier rules first. The proposal's three unmeasured admission floors
(`MIN_PROMOTE_FILES`, `MIN_CONVENTION_SITES`, `SUBGATE_PER_PARTITION`) — measured sensitivity on a second
repository, or disclosed as stated floors until then.

**Fabrication, if built today.** The intent compiler: its only oracle is a human accepting rows, and the only
corpus is 18 flows in one repository the compiler's author also wrote. The incident wire's numbers: the ledger
holds zero entries, so every I6 figure is 0/0 and every retirement decision is self-referential until an escape
has been carried to the ledger by someone. A cost limit: no run has ever been booked. The word "factory" on a
README: Grain's says "not demonstrated", Horde's says "prototype", and only Yggdrasil has a shipped record — a
family landing page claiming a factory is a product claim, item 3 of Horde's own escalation list, and it goes
to the user.

**The order.** Counsel 2's S0–S6 stands, with two amendments. First, run **one real Horde mission before any
factory claim** — the natural candidate is Grain's own queue (S3), since it already runs a Horde-shaped process
under a prototype of the same tools; it produces the one thing the charter cannot state, a cost baseline, and it
tests whether `premerge`'s six items reproduce the director scripts' outcomes. Second, do the Yggdrasil-side
cleanups early because they are cheap and clean the seam: cut `family-without-law.mjs`, re-point `advise` at
the proposal, keep the planted-family fixture contract as the precision gate for whatever feeds that class.

**The one thing only the maintainer can do.** Write the requirement rows and sign the thresholds — E1, E2, E6,
E7, E8 above — and commit the charter where a respawned session finds it. No agent can supply a number for
"how good must the proposal be before I trust it", because the number is a statement about his tolerance, not
about the code. Related, and also his alone: the (a)/(b)/(c) classification of the 59 proposed types with no
hand counterpart and of the 20-item candidate sample — until he sits down with them, every precision figure in
this family is a raw disagreement, by his own ruling.

**Cost picture.** Fable: this memo and the director's rulings, nothing else. Opus: 097's measurement, the
compiler's design, the architect's veto on the `relations → core` cut, one auditor per wave. Sonnet: 097's
execution, 098, the two meta-law aspects, the advise re-point, the Horde tickets (`--kind incident`, charter
columns, sizing ratio), the strangler tickets. Haiku with a checker: drill cutting from sites, provenance
stamping. Waves: W1 = S1 (097) with the Yggdrasil small tickets; W2 = S2 (098, sizing, the cut); W3 = S3, one
calibration mission of Grain under Horde, which yields E7's baseline; W4 = S4, the incident wire; W5–W7 = S5,
the compiler, Opus-heavy; S6 when a second repository with a hand graph exists. Seven to nine waves. I will not
turn that into money: with Horde's weights the maintainer can price it himself after W3, from runs × class per
merged ticket, and any figure before that is a guess wearing a budget's clothes.

**The failure mode where the factory optimises its own metrics.** Nine of the ten invariants are computed by
the system about itself; only I6 comes from outside and it is human-signed. The concrete mechanism is rule
explosion: 094 already writes 215 drafts, 172 of them prose, and a loop rewarded for "rules reproduced" will
render more rules and catch no more escapes — the verdict surface grows, the catch count does not, and every
green looks earned. The guards are structural, not exhortations: a candidate with no historical catch stays
draft; retirement is half the loop; I2 (decorative rules) and I9 (catches per 1 000 exposures — 13 today) are
printed beside I1; a wave whose I1–I5 improve while I6 rises is flagged; Grain's λ makes speech scarce by
construction (fan-out's fire rate sits at the derived ceiling 1/λ = 12.5 %, and the ruling says ranking, never
flag). The second mechanism is subtler: every number so far is on Yggdrasil, whose 0.998 relation precision is
its own CI gate reflected back and whose hand graph was tuned by the same person who will classify the
disagreements. S6 — a foreign brownfield with a hand graph and no relation gate — is the control, and until it
runs the family may not quote a general number.

### B4. Where the two questions meet

**Does the factory need the rewrite?** No. Every Yggdrasil-side change the factory requires is additive and
sits at the boundary (A1); a rewrite would delay the factory by the parity work and put every adopter's
committed lock at risk for no measured gain. **Does the rewrite need the factory?** The rewrite does not — but
the *strangler* does: the factory's miner is the only instrument in the family that ranks Yggdrasil's own
excess with no name list, and it has already done so twice, putting the known hot spot at ranks 1 and 4 of 627
and both known cycles at the top. A Yggdrasil that consumes Grain's ranking as its refactor backlog, one gated
ticket at a time, is simultaneously the cheapest credible demonstration that the product does what it claims
and the only form of "rewrite" whose result can be measured before it is believed.

**Recommendation.** Do not rewrite Yggdrasil; adopt Grain's ranking as its standing maintenance backlog and
take the two cycles first, under the 17-step gate, with the hash contract and the manual's invariants as
protected paths. Do not merge the repositories; write the factory as one chain with two epistemologies and
three gates — a committed charter, seam contracts at `.grain/proposal/`, `provenance.json`, `measurements/`,
`incidents.md`, and a seam test through each neighbour's real binary — and let no README call it a factory
until the incident ledger holds an entry a human signed. **The first measurement is 097 as queued**: its two
bars decide whether the law loop is real, which decides whether the factory has a middle; a second, cheap
measurement decides the rewrite question in the same wave — after the first strangler tickets land, re-run 096
on Yggdrasil and read whether the top rows moved and `yg advise` still nominates a cycle. If they did not,
"not doing it, with numbers" is the complete result for both questions.

---

*Assumptions carried throughout.* Ratatoskr, Urd and Researcher are known here only by their one-line
descriptions; nothing above depends on them beyond a voice at capture, a discipline at intent, and a file
contract for measurements. The aspect loader's tolerance of `provenance.json` beside `yg-aspect.yaml` is
asserted from the loader's treatment of `README.md` and the reserved `drills/` name and should be verified
before the meta-law aspects are written. Yggdrasil's commit tempo is read from release dates, not `git log`.
