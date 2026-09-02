# Class G — the question catalog

**What a coding agent actually asks a codebase while working, and whether grain answers it.**

Date: 2026-09-01. Engine graded: `plugins/grain` at the merge of `main` (1878 tests, 0 fail).
Corpus: 19 paired trial runs (`without.jsonl` / `with.jsonl`) over 5 repositories, under
`.temp/stress/trials/`.
Method note: every grade below comes from **running the command** on the same repository the agent
was working in, not from the docs. Where the trial's frozen engine disagreed with today's engine,
both are reported.

---

## 0. Executive summary

Three numbers carry this document.

1. **Orientation is the product.** Across 19 runs the agent issued a mean of **39.3 tool calls before
   its first write**; on the six realistic runs (a private post-cutoff monorepo, 100-turn budget) the
   mean is **99**. That pre-write spend *is* the market grain is in.
2. **Grain is a two-command product in practice.** Across 19 `with` arms: `where` 17 calls,
   `check` 18 calls, and **0 calls for all thirteen other commands** — `what`, `how`, `completeness`,
   `map`, `explain`, `report`, `rules`, `export`, `spectrum`, `decide`, `selftest`, `status`, `review`.
3. **The command built for the most expensive question cannot answer it.** `completeness` is gated at
   `CFG.cochangeMinConf = 0.75` measured against *the edited file's own commit count*. Of the **45
   most-committed files across flask, express and CleanArchitecture, exactly one** can receive a
   non-empty answer. The other 44 — every file an agent actually edits — get
   `(complete — no file historically changes with these)`, which is a false statement of absence.

And one sentence for the shape of the whole gap: **grain answers "what does the existing code look
like" well, and "what does this repo require of me" not at all.** Every question it cannot answer —
what must accompany this change, what will break, which rule applies, what contract pins this — is
about obligation rather than precedent.

The roadmap that follows is one theme: **grain already holds the answers to the expensive questions
and does not expose them.** Five of the six recommendations need no new extraction.

---

## 1. The corpus

| repo | trials | task |
|---|---|---|
| flask | 6 (`flask`, `-r2`, `-r3`, `-r4`, `-steer`, `-nosteer`) | add a JSON output to the `routes` CLI command; add a view test |
| express | 4 (`express`, `-r2`, `-r3`, `-r4`) | add `res.sendStatusText()` beside `res.sendStatus()` |
| CleanArchitecture | 3 (`CleanArchitecture`, `-r3`, `-r4`) | add an `ArchiveTodoList` command with handler, validator, endpoint, test |
| john-brief `4104e8c4` | 3 (`replay`, `replay2`, `replay3`) | admin-only route into the admin area from the brief header |
| john-brief `10509874` | 3 (`replay`, `replay2`, `replay3`) | let users skip a section without blocking completion |

Total tool calls observed on the `without` side: **1,277**. The 13 small runs were read call-by-call
by hand; the 6 replay runs were classified against the same taxonomy.

### 1.1 The price of orientation

`reads_before_first_write`, taken from each run's `metrics.json`:

| | mean reads before first write | mean tool calls | mean cost |
|---|---|---|---|
| all 19, without grain | **39.3** | 67.2 | $1.64 |
| all 19, with grain | 31.5 | 59.9 | $1.55 |
| the 14 runs that called grain at least once | 17.9 → 15.5 | 32.4 → 33.1 | — |
| the 5 runs that called grain zero times | 99.0 → 76.4 | 164.8 → 134.8 | — |

Read that last row carefully: **the runs where grain was ignored are the runs where orientation was
most expensive.** Grain got adopted on the cheap tasks and skipped on the expensive ones. That is the
adoption problem stated as a number, and it is the reason class G outranks the rest of the programme.

---

## 2. The typed question list

An **implicit question** is what the agent wanted to know that caused it to issue a tool call.
Consecutive calls serving one question are one instance; its **price** is the number of calls spent,
failed and retried calls included.

Counts below are over the **13 small runs** (317 `without`-side calls, hand-classified). The replay
runs are reported separately in §2.2 because their scale distorts medians.

| id | question | instances | calls | median price | max |
|---|---|---|---|---|---|
| **Q2** | **exemplar** — "what is the closest existing thing to what I'm about to write, so I can copy it" | **20** | **81** | 3 | 31 |
| Q10 | build/test invocation — "how do I run the tests here" *(harness-confounded, see note)* | 10 | 76 | 4.5 | 38 |
| Q1 | locate-symbol — "where is X declared" | 11 | 21 | 2 | 5 |
| **Q15** | **schema/migration obligation** — "does changing this entity need a migration, and how is the test DB built?" *(new)* | **3** | **22** | **7** | 8 |
> **Correction (2026-09-02, obligations-design.md §3):** Q15 IS derivable from git status alone as a birth obligation — 94.2%/81.1% precision, zero new constants; the "needs ORM config" reading was wrong.
| Q6 | test-for-X — "where are the tests covering X" | 9 | 18 | 2 | 3 |
| Q4 | convention — "how is Y done here; do all siblings have a validator?" | 4 | 11 | 2.5 | 5 |
| Q3 | wiring companions — "what else must I touch: changelog, docs, type defs" | 7 | 10 | 1 | 2 |
| **Q14** | **ambient availability** — "is `NotFoundException` already in scope via GlobalUsings, or must I import it?" *(new)* | **2** | **9** | 4.5 | 5 |
| Q8 | type contract — "what does this inherit; what must I satisfy" | 4 | 7 | 2 | 3 |
| Q11 | repo shape — "what is the top-level layout" | 4 | 7 | 2 | 3 |
| Q5 | callers — "who uses Z" | 2 | 2 | 1 | 1 |
| Q7 | existence check — "does something that does V already exist?" | 2 | 2 | 1 | 1 |
| Q12 | registration point — "where is the list new things get added to" | 2 | 2 | 1 | 1 |
| Q13 | read-for-edit *(bookkeeping, not a question)* | — | ~50 | — | — |

**Q10 is confounded and is excluded from the roadmap ranking.** Most of its 76 calls are the sandbox
denying `pytest`/`mocha` and the agent retrying — 38 of them in `flask-r2` alone, which ends with the
agent writing a hello-world script to test whether Bash works at all. The genuine residue ("this repo
runs under `uv`, not bare `python`") is real but small.

### 2.1 The two new question types

Neither existed in the starting taxonomy; both were forced by the CleanArchitecture runs.

**Q15 — schema/migration obligation.** *"I am adding a property to a domain entity. Does this repo
require an EF migration? Where do migrations live? How does the functional-test database get
created — `EnsureCreated`, `Migrate()`, Respawn, Testcontainers?"* All three CleanArchitecture runs
asked it and none inherited the answer from the others. Prices 7, 7, 8 — **the most expensive
question type in the corpus by median.** The call sequence in `CleanArchitecture-r4` is
`#15 → #22`: grep `EnsureCreated|Migrate\(\)|UseSqlite|UseNpgsql|UseSqlServer` in tests/, glob
`**/TodoListConfiguration.cs`, glob `**/Migrations/**`, read `TestAppHost.csproj`, read the entity
configuration, grep `EnsureCreated|Migrate|Respawn|DbUp` repo-wide, `find . -iname "*Migrations*"`,
read `ApplicationDbContextInitialiser.cs`. Eight calls to learn that this repo has no migrations
directory and the test DB is created, not migrated.

**Q14 — ambient availability.** *"Is this symbol already in scope, or do I need an import?"*
`CleanArchitecture-r4` `#32 → #36`: find `*GlobalUsings*` in tests, read it, grep
`class NotFoundException`, grep `NotFoundException` repo-wide, find and read
`src/Application/GlobalUsings.cs`. Five calls. `CleanArchitecture-r3` paid four for the same thing.
This is a C#/Rust/Kotlin-shaped question (global usings, prelude, `mod` re-exports) that gets more
expensive the more implicit the language is.

### 2.2 The replay runs — where the question mix changes

The six john-brief runs are the realistic end of the corpus: a private monorepo whose history begins
after the worker model's cutoff, 100-turn budget, 109–180 tool calls each (the without-grain runs are 134–169; 109 is the replay3 with-grain run), **960** `without`-side
calls in total. **Orientation dominates absolutely** — mean `reads_before_first_write` is **97.3** against
160.0 total tool calls, so **61% of the run happens before the first line is written.**

Counts, both replay tasks combined (`10509874` = "let users skip a section"; `4104e8c4` = "admin-only
route into the admin area"), bookkeeping types excluded:

| id | question | instances | calls | median price |
|---|---|---|---|---|
| Q1 | locate-symbol | 51 | 83 | 1 |
| **Q12** | **registration point** — dominated by *"which `yg-node.yaml` owns this file"* | **24** | **54** | 1 |
| **Q9** | **blast radius** — "what breaks if I add this field" | **26** | **53** | 1–2 |
| **N2** | **governance-rule lookup** *(new)* | **9** | **76** | 3 |
| Q8 | type contract | 38 | 76 | 1–4 |
| Q4 | convention | 31 | 55 | 1–2 |
| Q6 | test-for-X | 22 | 37 | 1–2 |
| **N1** | **data-flow path** *(new)* | **4** | **37** | **9.5** |
| Q11 | repo shape | 19 | 40 | 1–2 |
| **N3/Q16** | **tool-availability probe** *(new)* | 13 | 54 | 1–5.5 |
| Q7 | existence check | 20 | 26 | 1 |
| Q2 | exemplar | 25 | 60 | 1–3 |
| Q5 | callers | 17 | 17 | 1 |
| **N4** | **delegate-report re-read** *(new, bookkeeping)* | 3 | 32 | 10 |
| **N5** | **acceptance-contract lookup** *(new)* | 5 | 10 | 2 |

**Three shifts from the small runs matter.**

1. **Blast radius arrives and is frequent.** Effectively absent from the small tasks, Q9 is **26
   instances and 53 calls** here — because a monorepo change to a shared type propagates. Grain
   cannot answer it. This alone promotes it from a plausible candidate to a measured gap.
2. **The registration-point question explodes** (54 calls) and is *entirely* "which module owns this
   file, and what rules does it declare". Grain's module map targets exactly this and was not used.
3. **Type contract becomes expensive** — 76 calls, and in the `4104e8c4` runs the median price is 4.
   `what` gives a location, not a contract.

### 2.3 Four more new question types

**N1 — data-flow path.** *"How does a value travel from where it is produced to where I need it?"*
Not locate-symbol; no single declaration answers it. The priciest type per instance in the whole
corpus at **median 9.5 calls**. Worked example (11 calls): grep `isAdmin|role` → `routes/admin.tsx`
→ `admin-session.server.ts` → grep `isAdmin` in root/auth/auth-client → `root.tsx` →
`auth.server.ts` → `brief.$id.tsx` → `brief._index.tsx` → `auth-client.ts` → grep `isAdmin` frontend
→ grep `isAdmin` backend. Grain has no command for it, and `model.edges` is file-level, so it is
**not derivable today** — a value-level flow would need new extraction.

**N2 — governance-rule lookup.** *"Which machine-checked house rules apply to the files I am about to
touch, and what do they require?"* The largest single sink in the replay set at **76 calls**. The
agent read the checkers themselves to predict a pass — one instance cost 40 calls reading a 41KB
aspect listing, eleven unrelated UI aspects, and one architecture file in three slices. This is
partly an artefact of that repo's own tooling, but the question generalises, and it is precisely
the territory `check`, `rules` and `decide` occupy. All three were used zero times.

**N3/Q16 — tool-availability probe.** *"Can I run tool T here, and why not?"* 54 calls, nearly all
retries of one approval-gated command plus reads of `settings.json` and hook scripts. Sandbox
artefact; excluded from the roadmap ranking alongside Q10. It matters for one reason only — see the
adoption finding in §4.

**N5/Q17 — acceptance-contract lookup.** *"Is there an existing spec or scenario document that pins
the expected behaviour, test path and title?"* Distinct from Q7 (does the code exist) and Q2 (what to
copy). Decisive in these runs: planned scenario docs dictated the spec filename and the exact test
title. Grain indexes code, not `references/`, and cannot answer.

**On the two types found in the small runs:** Q14 (ambient availability) was confirmed in both replay
tasks — 6 instances, ~9 calls, e.g. *"are jest-dom matchers ambiently available in this vitest
setup?"* Q15 (schema/migration obligation) appears 6 times in `10509874` (~15 calls) — *"does adding
a required `skippedSections` field create a Zod/Prisma/DTO migration obligation?"* — and not at all in
`4104e8c4`, which has no schema change. Both survive as real types.

---

## 3. Grain's grade, per question type

Graded by running the command on the same repository. **answers well** / **worse than the grep the
agent actually did** / **cannot answer**.

| id | question | command | grade | evidence |
|---|---|---|---|---|
| Q1 | locate-symbol | `what <name>` | **well** | `what routes_command` → `src/flask/cli.py:1061–1107 (method)`, warm in <1s. `what sendStatus` → `lib/response.js:323–330`. One call, exact line range; the agent spent 2–5. |
| Q7 | existence check | `what <name>` | **well** | `what statusText` → *"«statusText» has no declarations or values anywhere in this repository's code"*. Strictly stronger than the agent's grep, which covered only `*.js` and `*.md`. |
| Q11 | repo shape | `map` | **well** | dependency layers 0–3 with module names, plus concept tokens. Replaces `find -maxdepth 2 -type d`. |
| Q2 | exemplar | `where <intent>` | **mixed — well on structured repos, unreliable on flat ones** | see §3.1 |
| Q4 | convention | `check`, `where` | **well** | `check tests/test_basic.py` names 11 governing conventions with `n of N`; `where` surfaced a maintainer steer (`@app.get`, team decision 2026-08) that no grep can produce. |
| Q3 | wiring companions | `completeness` | **cannot answer** | see §3.2 — the headline finding |
| Q5 | callers | `what <name>` | **worse than grep** | `what IApplicationDbContext` → `used by: 15 files`. A **count with no names**. The agent needs the list; grep gives it in one call. |
| Q6 | test-for-X | — | **cannot answer** | no command maps production symbol → its tests. `what UpdateTodoListCommand` does not mention `UpdateTodoListTests.cs`; you must already know the test's name to ask for it. |
| Q8 | type contract | `what <name>` | **partial** | gives `file:line` for `BaseAuditableEntity` (saves the *find*) but not its members or who extends it (does not save the *read*). |
| Q12 | registration point | `where` (marker `importedBy`) | **partial** | the `recipe:` line in `check` can name a registration file, but it fires only for genuinely new files and did not fire in any observed run. |
| Q9 | blast radius | — | **cannot answer** | no command. Nothing consumes `model.edges` (180 file edges in CleanArchitecture) for "what depends on this". |
| Q14 | ambient availability | — | **cannot answer** | no command; no model field holds "symbols in scope without an explicit import". |
| Q15 | migration obligation | — | **cannot answer** | no command. |
| Q10 | build/test invocation | — | **cannot answer** | no command. |

Distribution over the 14 types: **5 answer well, 3 partial, 1 worse than grep, 5 cannot answer.**
Weighted by tool calls spent (excluding the confounded Q10): the types grain answers well account for
**32 of 241 calls (13%)**; the types it cannot answer or answers worse account for **62 (26%)**; the
mixed/partial Q2 alone accounts for **81 (34%)**.

### 3.1 Q2 (exemplar) — the biggest question, and grain's most volatile answer

Q2 is 34% of the classified spend. `where` is the right command for it and its behaviour splits hard
by repository shape.

**Structured repo — excellent.** `where archive a todo list command` on CleanArchitecture returns, in
one sub-second call:

```
directory src/Application/TodoLists/Commands/ — 5 files, 18 scopes (match 67%)
  files to look at: .../CreateTodoList/CreateTodoList.cs · .../CreateTodoListCommandValidator.cs · .../DeleteTodoList/DeleteTodoList.cs · +2 more
directory tests/Application.FunctionalTests/TodoLists/Commands/ — 3 files, 11 scopes (match 67%)
directory src/Application/TodoItems/Commands/ — 6 files, 20 scopes (match 54%)
```

That is the exact answer `CleanArchitecture-r4` spent calls #1–#8 and #24–#26 (eleven calls) building
by hand, and it additionally names the sibling `TodoItems/Commands/` the agent found only at #24.

**Flat repo — unreliable, and query-brittle.** On express, three near-identical queries from three
trials produced three different outcomes on the frozen engines:

| trial | query | result |
|---|---|---|
| `express` | `where response helper sendStatus method on res object` | **`no lexical match`** + a compact directory map |
| `express-r2` | `where response status helper` | **`no lexical match`** + *"the model holds no groups or directory norms"* |
| `express-r3` | `where response helper sendStatus method on res` | `lib/response.js — match 100%`, `sendStatus` named first |

One word (`object`) separated a perfect hit from a total miss. On flask the same pattern: `where cli
command flask routes` returned three *test* groups in `tests/test_testing.py` and never named
`src/flask/cli.py`, while `where a new flask cli command` put `cli.py` first at 75% and listed
`carriers to copy: routes_command · run_command · shell_command`.

**Today's engine has largely fixed the brittleness** — re-running all six queries on the merged
`main`, `no lexical match` is gone and the flask query now returns `cli.py` at 100% match. This is a
real improvement and should be recorded as such. But a new ranking weakness is visible in its place:
on express, both `where response helper sendStatus method on res` and the `…on res object` variant now
rank **`test/res.send.js` first (76–79%)** and `lib/response.js` third. The agent wanted the source
file. Grain currently ranks a large test file above the small source file it tests, because the test
file carries more matching scopes.

### 3.2 Q3 (wiring companions) — `completeness` is structurally silent on the files that matter

This is the most consequential finding in the document.

**The contradiction.** On flask, over the same model, at the same commit:

```
$ grain where cli command
  ... file src/flask/cli.py — 42 scopes (match 100%)
      historically co-changes with: CHANGES.rst (35/60 commits) · tests/test_cli.py (23/60 commits)

$ grain completeness src/flask/cli.py
  (complete — no file historically changes with these)
```

Reproduced on express (`where` names `lib/response.js ↔ test/res.send.js 33/64`; `completeness
lib/response.js` → `(complete)`) and on CleanArchitecture (`completeness` on
`src/Application/TodoLists/Commands/UpdateTodoList/UpdateTodoList.cs` → `(complete)`).
**Three repos, three tasks, three times the command whose job is this question denied the answer on
the exact file the task centred on.**

**Why — and it is not a threshold to be nudged.** `cochangeData` (`engine/core.mjs`) tests
`support / commits<edited side> >= CFG.cochangeMinConf`, with `cochangeMinConf = 0.75`
(`engine/config.mjs`). The denominator is *the edited file's own total commit count*. For a hub file
that denominator is enormous, so the ratio is structurally tiny no matter how reliable the partner is:

```
lib/response.js <-> test/res.attachment.js   support=8  commitsA=392  commitsB=10
    confidence A→B = 0.02   (suppressed)
    confidence B→A = 0.80   ("when res.attachment.js changes, response.js changes 80% of the time")

src/flask/cli.py <-> tests/test_cli.py       support=23 commitsA=60  commitsB=75
    confidence for the cli.py side = 0.38   (suppressed)
CHANGES.rst      <-> src/flask/cli.py        support=35 commitsA=341 commitsB=60
    confidence for the cli.py side = 0.58   (suppressed)
```

**The measurement.** Taking the 15 most-committed files in each of flask, express and
CleanArchitecture — 45 files, the hottest in each repo — and computing the best forward confidence
`completeness` could ever see:

| repo | hot files that can get an answer | best case among them |
|---|---|---|
| flask | 0 of 15 | `src/flask/app.py` at 0.46 |
| express | 0 of 15 | `History.md` at 0.73 |
| CleanArchitecture | 1 of 15 | `README-template.md` at 0.83 |

**44 of the 45 hottest files in the corpus receive `(complete — no file historically changes with
these)`.** The more central a file is — that is, the more likely an agent is editing it — the more
certainly `completeness` claims, falsely, that nothing accompanies it.

Repo-wide the picture is the same. Distinct files that can ever receive a non-empty `completeness`
answer: **flask 17 of 99 HEAD files, express 20 of 148, CleanArchitecture 11 of 187.** And of the
pairs that do clear the gate with both partners still alive at HEAD, once build/docs plumbing
(lockfiles, `.csproj`, `requirements/*.txt`, generated API specs, docs HTML) is removed:
**flask 2, express 2, CleanArchitecture 0.** All 46 co-change pairs in CleanArchitecture are
dependency-bump and template plumbing; not one is a feature-code recipe.

**The answer is in the model.** `model.cochange` carries `support`, `commitsA`, `commitsB`,
`confidenceAB` and `confidenceBA` for every pair, and `grain export` surfaces all five. At the looser
1/3 threshold `where` already uses, the counts are flask 151 pairs, express 116, CleanArchitecture 40
— and it is at that level that `CHANGES.rst (35/60)` and `tests/test_cli.py (23/60)` live, which are
precisely the partners the flask agents needed. Nothing new must be extracted.

### 3.3 What `how` does with Q3 instead

`how` is the other command aimed at "what does a change like this touch", and on this corpus it is
**worse than grep**. `how add a new todo list command` on CleanArchitecture returns 28 files at
`1/5` support, of which **13 are marked `(deleted)`** — a list headed by
`tests/Application.UnitTests/ApplicationDbContextFactory.cs (deleted)` and
`src/WebUI/Controllers/WeatherForecastController.cs (deleted)`. `how add a cli command` on flask
returns a docs-only footprint (`docs/cli.rst 5/5`, `docs/config.rst 2/5`, …) because the lexical
match landed on two 2018 commits titled *"fix @click.command example by adding parens"*. An agent
acting on either list would be led into dead code. `how` did produce one genuinely good artefact —
express's `certified shape "*.router.js + test/" (29 of 29)` — which is the shape of the answer Q3
wants, on the wrong subject.

### 3.4 Surface divergence worth recording

`map` prints a `changes:` line (`"src/Web/ + *.json" — 80 changes`, +26 more) and a `concepts:` line.
`map --json` returns only `{nodes, decisions, asOf}`. The change-archetype data — 30 entries in
`model.changeArchetypes`, the closest thing grain has to a "recipe" — **is not reachable from any JSON
surface except the full `export`.** That is a class-C divergence with a class-G cost: a programmatic
consumer cannot get at it.

---

## 4. Cross with the `with` arms: what was consulted, and why not

**Command adoption across 19 `with` arms:**

| command | calls |
|---|---|
| `check` | 18 |
| `where` | 17 |
| every other command (`what`, `how`, `completeness`, `map`, `explain`, `report`, `rules`, `export`, `spectrum`, `decide`, `selftest`, `status`, `review`) | **0** |

**Zero grain calls in 5 of 19 runs** — and all five are the realistic replay runs. `replay-SUMMARY.md`
records the same for the earlier round: *"Zero grain invocations across all eight arms … despite the
SessionStart hook firing and injecting grain's advertisement in every `with` arm. The trial is a clean
negative on adoption."*

**The usage shape is: `where` to orient, `check` to validate, nothing in between.** The agent asks
grain one question at the start of the task and one at the end. Everything in the middle — the 80% of
tool calls where Q2, Q3, Q6, Q14 and Q15 are being paid for — happens without grain.

Reasons visible in the transcripts:

- **`where` failing early kills the session's trust in the tool.** In `express` and `express-r2`,
  `where` returned `no lexical match` on the first call; neither run called `where` again, and both
  reverted to grep for the whole task. In `express-r3`, where `where` hit at 100%, the agent went on
  to make four grain calls.
- **`check` is used as a lint gate, not a source of knowledge.** Every one of the 18 `check` calls is
  after the edits. The agents' own summaries phrase it that way: *"`grain check` reports zero
  deviations on all four files."* It is being used to confirm, not to learn.
- **`check`'s noise costs trust.** In the trial, `check lib/response.js` on express emitted **9
  deviations** on pre-existing anonymous functions for a `member_expression` convention, citing
  `examples/auth/index.js` as the exemplar. In `CleanArchitecture-r4` the agent wrote the rebuttal
  itself: *"one false-positive flag on the `Handle` method name (grain's local heuristic mistook
  property-accessor keywords `get`/`init` for method names) … so this is consistent with the
  established pattern."* An agent that has to argue with a finding will stop asking.

  **Today's engine has fixed that particular noise** — the same command now reports `governed by 0
  convention(s) · 0 known deviation(s)` and says so honestly (*"that is not approval, open the nearest
  neighbour and copy it"*). But it has been replaced by a different kind: the same run now emits five
  lines of the form `co-change (scopes): `<anon>` ↔ `<anon>` in package lib (49/53)`. `scopeCochange`
  is exactly the mechanism gap #1 needs at scope granularity, and in JavaScript it renders both sides
  as `<anon>`, which no agent can act on. Worth fixing alongside recommendation 1.
- **Some zero-adoption commands hold the answer but not in answer shape.** `explain` on
  `UpdateTodoList.cs` returns `[NORM] r4:type auto.extends:IRequestHandler = true share 1.00 n 6` —
  which *is* the type-contract answer (Q8) the CleanArchitecture agents spent calls hunting, and
  `auto.namesuffix = handler share 1.00 n 6` is the naming convention (Q4). It arrives as
  `533 cells computed · 209 rows (n≥3)` with `r1:`/`r4:`/`_all:` prefixes and `bits` columns. That is
  a debug dump, not an answer, and it was called zero times in 19 runs. The content is not the problem.

- **The one demonstrated behaviour change came from a push, not a pull.** `replay3-SUMMARY.md`:
  placement-on-create notes moved four files, with the worker citing grain by name — in a run that made
  **0 CLI calls**. Where grain has changed a diff, it did so by speaking unbidden.

### 4.1 Three structural reasons the replay runs never called grain

The replay set is where grain was needed most and used least. The transcripts give causes, not
guesses, and none of the three is about answer quality.

**(a) Grain's advertised invocation form was caught in a blanket "node is blocked" generalisation.**
The SessionStart hook advertises grain as `node "<path>/grain.mjs" where <intent words>`. In
`replay-10509874`'s `with` arm the agent tried `node --version && pnpm --version`, which the sandbox
denied because of `pnpm`, and concluded verbatim:

> *"`yg`, `pnpm`, and `node` invocations all require approval that can't be granted in this
> non-interactive environment … I'll implement the code and tests directly and skip trying to execute
> `yg`/build/test commands."*

**Grain was then never attempted at all.** There is no evidence it would have been blocked — the
agent inferred it from a neighbouring failure. A tool whose advertised form starts with the name of a
runtime inherits every permission failure that runtime suffers.

**(b) The sub-agent that does the searching never sees the advertisement.** In four of the six replay
runs the Q1/Q2/N1 work was delegated to an `Explore` sub-agent. SessionStart context goes to the
parent; the sub-agent's prompt never mentions grain. So the component actually asking "where does X
live" — 83 calls of Q1 across the replay set — was structurally unaware the oracle existed. The one
trace of grain in the entire `10509874` set is a sub-agent *prompt* written by the parent: *"a
monorepo, has packages/core, packages/ui, apps/e2e etc per grain metadata"* — the architecture line
consumed as passive prior knowledge, with no command ever run.

**(c) The one call that did happen confirmed rather than replaced.** `replay2-4104e8c4` #76 ran
`where a header pill component that links to the admin area, next to ModeToggle in BriefWorkspace`
*after* the Explore sub-agent had already done eight greps and finds and the parent had re-read both
files. Grain's top hit was `ModeToggle.tsx` at 51% — **which is where the author actually put the
change**. The agent then wrote a new `AdminPill.tsx` instead, rationalising in its summary: *"the pill
sits in `apps/frontend/app/components/briefing/` beside `ModeToggle` (per the repo's own placement
conventions)."* It read a **file-level** hit as a **directory-level** one. Grain was right and was
misread; ranking is not the only surface that needs work, phrasing is too.

**A caution against over-claiming.** In `flask-r2` the `with` arm updated `CHANGES.rst` and the
`without` arm did not, which looks like a co-change win. It is not: the `where` output that arm
received contained **no co-change line at all**, and the agent reached `CHANGES.rst` on its own at
call #30 via `git log --oneline -5 -- CHANGES.rst`. In `flask-r3` both arms updated it. There is no
observed instance in this corpus of grain's co-change data changing a diff.

---

## 5. The gap list, ranked

Rank = frequency × price × derivability. **Derivability** is the honest question: does the answer
already sit in the model, or does it need new extraction?

Frequencies below are the **whole corpus** — 13 small runs plus 6 replay runs.

| # | gap | freq | price | derivable from | rank |
|---|---|---|---|---|---|
| **1** | **blast radius + true co-change** — "what else does a change here touch / what breaks" | **33 instances, 63 calls** (26 of them in the replay set alone) plus silent under-asking wherever nothing answers | 1–2 calls when asked; the real cost is the companions never touched | `model.cochange` (support + **both** directional confidences) and `model.edges` — both already exported, neither surfaced as an answer | **highest** |
| **2** | **exemplar** — "the closest thing to copy" | **45 instances, 141 calls** — the largest type in the corpus | median 3, max 31 | `where` exists; needs source-over-test ranking, a symbol-first path, and file-vs-directory phrasing that cannot be misread | **highest** |
| **3** | **callers, by name** — "who uses Z" | **19 instances, 19 calls** | 1 call, but grain's answer is a bare count | `model.edges` (180 pairs in CleanArchitecture) — held, never surfaced | high |
| **4** | **type contract** (Q8) — members and descendants, not just location | **42 instances, 83 calls** | median 1–4 | scopes + `edges` + `explain`'s lattice (which already prints `extends:IRequestHandler share 1.00 n 6`) — all held | high |
| **5** | **test-for-X** — "where are the tests covering this symbol" | **31 instances, 55 calls** | median 2 | `model.cochange` + same-stem structure + `model.edges` — held | high |
| 6 | **governance-rule lookup** (N2) — "which house rules apply to my files" | 9 instances, 76 calls | median 3 | partly — `check`/`rules`/`decide` occupy this ground and got 0 use; repo-tooling-specific in this corpus | medium |
| 7 | **migration/schema obligation** (Q15) | 9 instances, ~37 calls | **median 7 — most expensive answerable type** | *not derivable* — needs new extraction (ORM config, migration dirs, test-DB bootstrap) | medium |
| 8 | **data-flow path** (N1) — "how does this value reach here" | 4 instances, 37 calls | **median 9.5 — priciest per instance** | *not derivable* — `edges` is file-level; would need value-level flow | medium |
| 9 | **ambient availability** (Q14) | 8 instances, ~14 calls | median 4.5 | *partly* — needs an import/prelude index grain does not build | medium |
| 10 | **acceptance-contract lookup** (N5) | 5 instances, 10 calls | median 2 | *not derivable* — grain indexes code, not `references/` | low |
| — | build/test invocation (Q10), tool-availability (N3) | 23 instances, 130 calls | confounded by the sandbox | excluded from ranking | — |

---

## 6. Recommendation — the top five, and one that is not a question

### 1. Make `completeness` answer. Rank by lift, not by the hub's denominator.

*The gap.* `completeness` answers for 6–17% of files and for **1 of the 45 hottest files** in the
corpus, while asserting `(complete — no file historically changes with these)` — a false absence.

*What already answers it.* `model.cochange` holds `support`, `commitsA`, `commitsB`, `confidenceAB`,
`confidenceBA` per pair. The fix is the scoring, not the data: rank a partner by the **maximum of the
two directional confidences** (or by lift against the partner's base rate) instead of by the edited
file's own forward confidence alone, and **print the number**. `src/flask/cli.py` would then answer
`tests/test_cli.py (23/60)` and `CHANGES.rst (35/60)`; `lib/response.js` would answer
`test/res.send.js (33/64)`. Both are the right answers, and `where` already prints them from the same
data at the looser 1/3 threshold — so this also closes a live `where`/`completeness` contradiction
(class C) as a side effect.

*And when it still has nothing:* say `no partner above <n>` with the threshold named, never
`(complete)`. The current phrasing certifies an absence the model cannot see (class D).

### 2. Give `where` a symbol-first path, and rank source above tests.

*The gap.* Q2 is 34% of all classified tool calls. `where` is excellent on directory-structured repos
(CleanArchitecture: eleven agent calls collapsed to one) and unreliable on flat ones. Today's engine
fixed `no lexical match`; what remains is that a large test file outranks the small source file it
tests (`test/res.send.js` at 76% over `lib/response.js`).

*What already answers it.* The scope index. When a query token matches a **declared name** exactly
(`sendStatus`, `routes_command`), that declaration's file should lead — `where sendStatus` already
returns `lib/response.js` at 100%, so the machinery exists; it is the multi-word path that loses it.
Normalising the match score by scope count would stop large test files winning on volume alone.

### 3. Turn `used by: N files` into `used by: <names>`.

*The gap.* The only case in the corpus where grain's answer is strictly **worse than grep** — and it
is asked 19 times. `what IApplicationDbContext` → `used by: 15 files`, no names. A count cannot be
acted on.

*What already answers it.* `model.edges` — 180 file-level edges in CleanArchitecture, already in the
export. `what --json` returns `"usedBy":{"files":15}`; it should return the list, truncated with a
count. **This is also the cheapest half of recommendation 1**: "who uses Z" plus "what co-changes with
Z" is the blast-radius answer, and both halves are already in the model.

### 4. `what <symbol>` should name the tests that cover it.

*The gap.* Nine instances, 18 calls, and no command answers it. You must already know the test's name
to ask for it.

*What already answers it.* Three signals grain holds: same-stem structure (`UpdateTodoList.cs` →
`UpdateTodoListTests.cs`, `res.sendStatus` → `res.sendStatus.js`), `model.cochange` (the source↔test
pairs the 0.75 gate currently suppresses — `lib/express/collection.js ↔ spec/spec.collection.js`
at 0.84 is exactly this), and `model.edges`. A `tested by:` line on `what` costs no new extraction.

### 5. Expose the change archetypes — and stop `how` naming dead files.

*The gap.* `how` returns lists dominated by deleted files (13 of 28 on CleanArchitecture) and, on
flask, a docs-only footprint drawn from two 2018 typo commits. An agent following it edits dead code.
Meanwhile `model.changeArchetypes` holds 30 entries and `map --json` does not expose them at all.

*What already answers it.* Filter `how`'s `places such a change touched` to files live at HEAD — the
liveness set (`model.pathsAll` ∪ `model.filesAll`) is already computed inside `cochangeData` for
exactly this purpose and simply is not applied here — and drop the `1/N` tail. Add `changes` and
`concepts` to `map --json`. Express's `certified shape "*.router.js + test/" (29 of 29)` shows the
output shape is right when the evidence is clean.

---

### 6a. And one thing that is not a question: make grain reachable

Three findings in §4.1 are adoption bugs, not answer bugs, and they gate everything above. None
requires engine work.

- **Do not advertise grain as `node "<path>/grain.mjs"`.** One agent generalised a `pnpm`-caused
  denial into *"`node` invocations require approval"* and never tried grain at all. Ship a bare
  `grain` shim on PATH, or advertise a form that does not begin with a runtime's name.
- **Put the advertisement where the searching happens.** Four of six replay runs delegated all Q1/Q2
  work to an `Explore` sub-agent whose prompt never mentions grain, because SessionStart context
  reaches only the parent. 83 calls of locate-symbol were issued by a component that did not know the
  oracle existed.
- **Say file or directory unambiguously.** `replay2-4104e8c4` had grain's correct, author-matching
  answer (`ModeToggle.tsx`) on screen and acted on it as though it named a directory.

## 7. What this says about the programme

Class G's answer is not "grain needs more commands". Grain has sixteen and the agents used two.

The corpus says four things in order.

**First**, the expensive questions are the ones grain was built for. Exemplar (45 instances, 141
calls) and the blast-radius/co-change pair (33 instances, 63 calls, and under-asked wherever nothing
answers) are the top two, and grain has a command for each — one volatile, one structurally silent.

**Second**, five of the six recommendations are exposure and ranking changes over data the model
already holds. `model.cochange` carries both directional confidences; `model.edges` carries 180 file
edges; `explain` already computes `extends:IRequestHandler share 1.00 n 6`. Only Q15 (migration
obligation) and N1 (data-flow) need new extraction, and they rank 7th and 8th.

**Third**, the questions grain *cannot* answer cluster in one place: they are about **obligations**
rather than **precedents**. "What must accompany this change" (Q3, Q15), "what will break" (Q9),
"what rule applies to me" (N2), "what contract pins this" (N5). Grain is excellent at "what does the
existing code look like" and absent at "what does this repo require of me". That is the shape of the
product gap, stated once.

**Fourth**, adoption is inversely correlated with need: the runs that ignored grain are the runs that
spent 99 tool calls orienting, and the reasons are mechanical — an advertised invocation form that
inherited another tool's permission failure, and a search sub-agent that never received the
advertisement. Fixing `completeness` and `where` is worth more than any new command, because those
two are the only doors an agent has been observed to open. Fixing §6a is worth more still, because in
the runs that mattered most no door was opened at all.

---

## Appendix — reproduction

All figures were produced by running the merged-`main` engine against the trial repositories'
`with-repo` copies (which carry a warm `.grain/` cache) under `.temp/stress/trials/`:

- adoption counts: the `grain_calls` field of each run's `with.metrics.json`, cross-checked by
  grepping the extracted transcripts for `grain.mjs <verb>`;
- orientation price: `reads_before_first_write` and the `tools` histogram in each `metrics.json`;
- the co-change measurements in §3.2: `grain export --out <file>` per repo, then the
  `confidenceAB`/`confidenceBA`/`support`/`commitsA`/`commitsB` fields of `cochange`, filtered against
  `git ls-tree -r --name-only HEAD` for liveness;
- every command grade in §3: the command run directly, warm, with `--repo` pointed at the trial copy.
