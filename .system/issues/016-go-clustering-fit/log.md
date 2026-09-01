# 016 · measurement log — is `featW` the cause, is the receiver a general signal, can `where` disclose test-only answers

**Run:** 2026-09-01 · measurement and analysis only, no engine code changed.
**Engine under test:** working tree at `2026-09-01 19:37`, `core.mjs` md5 `24210c2d087cb74d1cf2de5e75813512`,
`ENGINE_VERSION 0.3.0` / `EXTR_V g30` / `MODEL_V m23`. Every variant is a *copy* of that snapshot instrumented in
the scratchpad; `plugins/grain/engine/` was never written to.
**Workspace:** `…/scratchpad/m016/` — `armA…armH` (engine copies), `corpusA…corpusH` (one indexed corpus per arm),
`census2.mjs` / `q3.mjs` / `an.mjs` / `score2.mjs` (measurement instruments), `016-receiver.patch` (the recommended
change as a unified diff against the snapshot).
`core.mjs` moved on in the working tree while this ran (concurrent edits, md5 `6509356…` at 20:35). All eight
anchor lines the patch touches are still present and unique in the live file, so it lands with an offset — but
re-verify against HEAD before applying.

**Corpus:** 7 repositories, 6 languages — gin (Go, 2007 commits) · chi (Go) · spring-petclinic (Java) ·
axum (Rust) · flask (Python) · okhttp (Kotlin+Java, 6447 commits) · CleanArchitecture (C#).
Every arm indexes its own copy from cold, so no cache is shared between arms.

**Note on the ticket's own numbers.** The issue records gin at 68 groups / 37 conventions (round 2). The current
engine indexes the same HEAD at **122 groups / 64 conventions**. The behaviour complained about reproduces exactly;
the counts do not, and the ones below are the ones measured today.

---

## Q1 — is the 3× weighting on `dec:`/`sup:`/`ret:` (`featW`) the cause? **No.**

Arm B flattens `featW` to `f => 1`, so `jacW` becomes plain Jaccard. Nothing else changes.

| repo (language) | groups A → B | conventions A → B | groups that are 100% test-file, A → B |
|---|---|---|---|
| gin (Go) | 122 → 115 | 64 → **61** | 70% → **76%** |
| spring-petclinic (Java) | 12 → 14 | 6 → **4** | 42% → 43% |
| axum (Rust) | 184 → 184 | 70 → **47** | 19% → 20% |
| flask (Python) | 132 → 147 | 49 → **38** | 61% → 62% |
| okhttp (Kotlin) | 20 → 22 | 41 → 43 | 60% → 55% |

`where "context"` on gin returns **the same three cards** under A and under B: the `returns Context` marker
(4 carriers) and the two all-`*_test.go` groups the ticket names. The production `Context` API in `context.go`
does not appear in either. Counting test-file pointers in the rendered answer, flattening makes it *worse*:

| gin query | A | B |
|---|---|---|
| `where "context"` | 6/9 pointers in test files | **7/10** |
| `where "render json"` | 6/6 | **10/10** |
| `where "add a new middleware"` | 1/3 | 1/3 (byte-identical output) |

So the hypothesis is falsified twice over. Flattening does not surface the production API on the language that
motivated it, and it costs 23 conventions on Rust, 11 on Python and 2 on Java — the "heart of the model" blast
radius the ticket warns about, paid for nothing. **`featW` is not the cause and must not be flattened.**

The real cause is simpler and is the subject of Q2: in Go, `func (c *Context) Bind(...)` and
`func TestContextBind(t *testing.T)` are *both* top-level `function`-shaped declarations carrying only name
tokens, and grain records nothing that tells them apart. Two of three heavy signals being empty is a symptom of
that, not the mechanism.

---

## Q2 — the receiver signal. **General, derivable, and worth shipping — but only the receiver half.**

### Is "bound to a named type" a general notion? Yes — but grain currently records it for *no* language.

Read-only census (`census2.mjs`, parses HEAD with the engine's own `getParser`/`bindingFor`), counting how each
callable is bound to a named type: by its own `receiver` field, by an enclosing `impl`-shaped block, or by an
enclosing type-kind scope.

| repo (language) | callables | via `receiver` field | via `impl` block | via enclosing type | unbound | owners with ≥3 members |
|---|---|---|---|---|---|---|
| gin (Go) | 1323 | **428 (32%)** | 0 | 0 | 895 (68%) | 31, covering 334 |
| chi (Go) | 411 | **132 (32%)** | 0 | 0 | 279 (68%) | — |
| axum (Rust) | 2381 | 0 | **1132 (48%)** | 15 (1%) | 1234 (52%) | 145, covering 985 |
| flask (Python) | 1462 | 0 | 0 | **443 (30%)** | 1019 (70%) | 38, covering 366 |
| spring-petclinic (Java) | 202 | 0 | 0 | **202 (100%)** | 0 | 28, covering 174 |
| okhttp (Kotlin) | 7220 | 0 | 0 | **6806 (94%)** | 414 (6%) | 446, covering 6541 |

Go's top owners are exactly the production API: `Context`=145, `Engine`=33, `RouterGroup`=23 (chi: `Mux`=33).
The 68% unbound remainder is overwhelmingly the `func TestXxx(t *testing.T)` population — **in Go the receiver
separates the production method set from the test suite for free, because a test function cannot have one.**

**The asymmetry finding the ticket asks about is not the one it expects.** Java/C#/Kotlin do *not* get this
"for free through scope nesting": no scope record carries its parent. `serializeScope` emits
`kind/name/rel/line/…/sup/decos/rets/ptypes/calls/seen/shapes/preds/imports/feats/ownCount/vals` and nothing
about the enclosing type; `induceRoles` clusters on `s.feats` alone, which is name tokens + `sup:` + `dec:` +
`ret:` + `imp:`. So "which type this method belongs to" is invisible to clustering in **every** language today.
Go is not uniquely deprived — it is uniquely *unrescuable*, because for the nesting languages the file and the
directory partition are a serviceable proxy for the class, and for Go they are not (one Go package is one flat
directory holding production and tests side by side).

A second gap fell out of the census: **Rust `impl_item` is not a `b.scope` at all.** It has `body` and `type`
but no `name`, so `bindingFor`'s `f.body && (f.name || f.declarator)` rule never admits it and the loose-body
fallback's `_declaration|_definition` suffix test does not match it either. A Rust method is therefore attributed
to nothing — not even the file-level nesting an ordinary class would give it.

### Can it be derived from `node-types.json`? The receiver: cleanly. The `impl` block: only by a bespoke derivation.

Checked against all 23 shipped grammars:

* **R1 — a callable-shaped node (its own `body` *and* its own `parameters`) that also declares its own
  `receiver` field.** Hits exactly one node type in the whole grammar set: Go's `method_declaration`. Ruby's
  `call` declares a `receiver` too, and is correctly excluded — it has neither a body nor a parameter list of
  its own. This is the same field-presence shape as the accepted `b.namedValueSpec` (§014, also Go-only in
  effect) and `b.retField` (§021). No language is named.
  The receiver *type* must be read through `b.paramLike`'s slot `.type` field, exactly as §G26 fixed named
  return values: taking the first identifier instead yields the receiver's **binding name** (`c`, `r`, `engine`)
  rather than its type — the first census run made precisely that mistake and reported `c=146, r=43`.
* **R4 — an `impl`-shaped block: `body` + `type`, no `name`/`declarator`/`parameters`, and a body whose declared
  child types can hold scope nodes.** Also hits exactly one node type (Rust's `impl_item`) — but only after five
  clauses, each added to exclude a specific false positive (C/C++ `function_definition` by `declarator`, C#'s
  `operator_declaration`/`lambda_expression` by `parameters`, Go's `composite_literal` and TS's `catch_clause`
  by the body-holds-a-scope test). The looser two-clause version (`body` + `type`, no `name`) matches eight node
  types across six grammars. This derivation is *shaped to fit*, and it should be judged as such.

### Does it produce meaningful groups? Four variants measured.

`own:<Type>` added to `s.feats` (and to the medoid-label vocabulary), owner derived as marked:

| arm | owner source | `own:` weight | gin | chi | petclinic | axum | flask | okhttp | CleanArch |
|---|---|---|---|---|---|---|---|---|---|
| **A** | — (baseline) | — | 122g/64c | 39g/6c | 12g/6c | 184g/70c | 132g/49c | 20g/41c | 37g/17c |
| C | receiver + impl + nesting | 1× | 113g/**68c** | — | 16g/5c | 145g/**50c** | 126g/48c | 18g/38c | — |
| D | receiver + impl + nesting | 3× | 104g/**50c** | — | 11g/5c | 154g/**44c** | 140g/49c | 13g/**35c** | — |
| F | receiver + nesting | 1× | 113g/**68c** | — | 16g/5c | 185g/70c | 126g/48c | 18g/39c | — |
| **H** | **receiver only** | **1×** | 113g/**68c** | 38g/**7c** | 12g/6c | 184g/70c | 132g/49c | 20g/41c | 37g/17c |

* **D (3×) is the worst arm on every repo.** Treating the owner as a marker on par with a decorator overpowers
  everything else: gin drops to 50 conventions, below baseline. Rejected.
* **C loses 20 conventions on Rust** and collapses `where "extractor"` from three real role groups (with
  exemplars in `axum/src/extract/matched_path.rs`) to three bare directory cards saying "no convention certified
  here beyond placement". 260 distinct `impl` owners over 2381 callables fragments the name-based clusters that
  were carrying the facts. Rejected — the `impl` half is the damage.
* **F** removes the `impl` half and axum recovers (70 conventions), but nesting still costs Java a convention and
  makes `where "controller"` on petclinic worse (1/7 → 3/9 test-file pointers), and costs okhttp two conventions.
  Python gains (`where "blueprint"` 6/7 → 3/9, `where "session interface"` 1/5 → 0/9). Genuinely mixed; not
  landable on this evidence.
* **H — the receiver alone — is the clean result.** Verified by hashing every partition's fact set
  (`cid|pid|exp|share`) plus every medoid label:

  > **spring-petclinic, axum, flask, okhttp and CleanArchitecture are byte-identical to baseline.** Every
  > `where` and `report` answer on those five repos is byte-identical too, modulo the build timestamp line.
  > `grain export` on spring-petclinic differs only in `indexedAt`; `own` never reaches the export schema.

  Go is the only language that moves, which is what the derivation predicts.

**What changes on Go.** gin `where "context"`, third card, baseline → arm H:

| | baseline (A) | arm H |
|---|---|---|
| card | `group context+render+test` — 22 members | `group Context+bind+should` — 27 members |
| exemplars | `context_test.go:1149 TestContextRenderJSON`, `:1388`, `:1492` | `context.go:780 Bind`, `context.go:786 BindJSON`, `context.go:833 MustBindWith` |
| certified | calls `CreateTestContext` 100%; takes `testing.T` 100% | declares return type `error` 100% of 27; takes a parameter of type `any` 100%; always contains a `return_statement` 100% |

Test-file pointers in the rendered answer: `where "context"` 6/9 → **3/9**, `where "render json"` 6/6 → **3/6**,
`where "router group"` 1/7 → **0/9** (and 2 → 3 role-group cards). Group labels now name the type they belong to:
`bind+should` → `Context+bind+should`, `group` → `RouterGroup`, `run` → `Engine+run`, `get` → `Context+error+get`.
chi gains one convention (6 → 7), which happens to cross the `<8 facts per 100 files` sparse-model boundary, so
its answers lose the "a sparse model" note; the answer bodies are otherwise unchanged.

**Costs, stated plainly.**
* gin's production-only groups fall 37 → 29 (281 → 250 assigned members). The receiver splits name-based groups
  that were carrying facts: `check gin.go` goes from 6 governing conventions to 4, because the 11-member `run`
  group becomes a 9-member `Engine+run` and loses two facts. `check context.go` goes the other way: 13 → 14
  conventions, 2 → 1 pre-existing deviations. Net on gin: **64 → 68 conventions.**
* Structural twins on gin: **143 → 141.** The receiver does **not** address the ticket's third observation
  (~90% noise in twin suggestions). That remains open and is a separate problem.
* Landing changes extraction output (`own` on every method scope), so `EXTR_V` must be bumped: every cached
  repository pays a full re-parse and a full history re-walk, as with g27/g29/g30.
* `own:` enters the medoid-label vocabulary, so **Go group labels change**. Nothing else does.

**No new tuned constant.** `own:` rides at `featW`'s existing 1× default. The only numeric guard is the
`length <= 40` identifier cap already used verbatim by `ptypes` and `rets`. The recommended patch also *removes*
a near-duplicate list rather than adding one: `RET_ID_TYPES` is hoisted to module scope as `TYPE_REF_ID_TYPES`
and shared, so return-type and receiver extraction resolve a type reference identically. That matters — the
first draft used a separate list containing `generic_type`, which resolved `func (s *Stack[T]) Push()` to the
owner `Stack[T]` instead of `Stack`. Verified on a synthetic fixture; the shared list gives `Stack` for both a
pointer and a value receiver, and `Plain` for an anonymous receiver `func (Plain) Anon()`.

**Verification:** full suite `1772/1772 pass` on arm H (identical to baseline, which also passes 1772).

---

## Q3 — should `where` disclose that a query's best matches are all test-file groups? **No. Kill it.**

Grain may not detect tests by name (`config.mjs` DESIGN RULING), so the question is whether any *structural*
predicate says it. Measured over **458 role groups (≥3 members) across the five original repos**, against a
measurement-only ground truth (every member lives in a test file) that holds for 212 of them (**46% base rate**):

| candidate predicate (name-free) | fires on | precision | recall |
|---|---|---|---|
| every certified fact is from the `auto.call:` / `auto.ptype:` family | 17/458 (3.7%) | 59% | 5% |
| the group has no certified fact at all | 339/458 (74.0%) | 47% | 75% |
| the medoid carries no marker feature (`dec:`/`sup:`/`ret:`) | 207/458 (45.2%) | 67% | 66% |
| markerless **and** call/ptype-only | 12/458 (2.6%) | 83% | 5% |

Nothing here is usable. The only predicate with real coverage fires on **45% of every group in the corpus** at
**67% precision against a 46% base rate** — it is barely better than a coin weighted by the prior, and it is
exactly issue 018's round-1 failure: a hedge so common that "genuinely absent" and "cannot see" read the same.
Compare issue 037's shipped rule at 1.58% and its rejected first hypothesis at 18.6%. The only precise candidate
(83%) reaches 5% of the all-test groups, so it would stay silent on `where "context"` — the case that opened this
ticket.

The dependency graph carries no signal either. In gin, files with **zero inbound import edges** are 40/40 of the
test files — and also **52/59 (88%) of the production files**, because Go's same-package files never import one
another. The import graph cannot distinguish a test file from `context.go`.

Two further reasons to kill it rather than keep looking:

1. **The disclosure cannot know the query.** On this battery the ground-truth condition ("every role-group card
   in the answer is all-test") fires on 3 of the 17 answers that return role groups — 17.6%, or 9.4% of all 32
   answers. One of the three is `where "test for context"`, where an all-test answer is the *correct* answer.
   Even a perfect test detector would hedge on a query that asked for tests.
2. **The motivating case is fixed by the model change.** Under arm H, gin's `where "context"` no longer returns
   an all-test answer, so the disclosure would not have fired on the query that prompted it.

---

## Recommendation

**Ship the receiver-derived owner feature (arm H). Change nothing about `featW`. Drop option 3.**

* `Q1` — leave `featW` at 3×. Flattening is a measured regression on 4 of 5 repos and does not fix Go.
* `Q2` — land `…/scratchpad/m016/016-receiver.patch` (111 lines against `core.mjs`): derive `b.rcvCallable` from
  node-types.json, read the receiver type through the existing `b.paramLike` slot, record it as `s.own`, add
  `own:<Type>` to `s.feats` and to the label vocabulary, hoist `RET_ID_TYPES` to a shared `TYPE_REF_ID_TYPES`.
  Bump `EXTR_V`. **Do not** extend the owner to `impl` blocks or to enclosing type scopes on this evidence —
  both were measured and both cost more than they return.
* `Q3` — record as won't-do, with the 45.2%/67% number as the reason.

Two follow-ups this measurement uncovered, neither in scope here:
* **Rust `impl_item` is not a scope.** A Rust method is attributed to no type anywhere in the model. Whether that
  should be fixed at the *scope* level (rather than as a clustering feature, where it measurably hurt) is its
  own question.
* **The enclosing type is recorded for no language.** Java/C#/Kotlin/Python methods carry no link to their class
  either. Arm F says wiring it into clustering is not obviously a win; wiring it in elsewhere is untested.

---

## Landed — 2026-09-01, branch `fix/016`

`016-receiver.patch` applied against `core.mjs` at `509e786` (the base had moved past the patch's cut point,
through the 0.3.0 release commit). Worktree's branch was cut one commit behind `main` (`601aa23`); fast-forwarded
to `509e786` before applying — otherwise every anchor would have drifted against the pre-release file shape.

9 of 10 hunks applied cleanly via `patch -p9`. One hunk (`if (f.body && f.parameters && f.receiver)
b.rcvCallable.add(n.type);`, anchored on the `namedValueSpec.add` line in `bindingFor`) fell into the reject file
purely on a line-number offset the tool's fuzz matching didn't bridge — the anchor text itself was unique and
unchanged in the live file, so it was re-applied by hand, byte-identical to the patch. No other hunk needed
re-derivation.

`config.mjs`/`EXTR_V` intentionally left untouched, per instruction — the bump to g31 is batched by the
orchestrator with the other two extraction changes landing alongside this one.

Added `plugins/grain/tests/receiver-owner.test.mjs` (7 tests; the patch itself carried none): Go pointer/value/
anonymous/generic receivers all record the owning type name (not the binding name, not the generic instantiation);
a plain top-level Go function gets no owner; a Ruby `def` method is confirmed unaffected (`call`'s own `receiver`
field still doesn't qualify it, per R1's three-field conjunction); `own:<Type>` reaches `s.feats` for Go and never
for Ruby. Also ran `python-module-deps.test.mjs` (a non-Go, single-language test file) standalone to confirm it
still passes.

Full suite: 1825 → **1832/1832 pass** (1825 baseline + 7 new). Commit on `fix/016`.
