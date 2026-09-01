# Phase 1 work log — honest-negative fix for `what` (018/011/014 shared defect)

## Scope

Implemented the "answer shape" fix only: `whatCmd` (`plugins/grain/engine/core.mjs`) and its wrapper `cmdWhat`
(`plugins/grain/engine/grain.mjs`) now distinguish three cases when a `what` query finds nothing indexed:

1. **absent** — genuinely nothing, anywhere. Unchanged, terse message.
2. **gated** (§011) — the exact literal was seen during extraction, in `rawScopes` (the current tree's already-
   cached scope snapshot, via the existing `loadScopes()` helper in grain.mjs), but excluded from
   `model.valueIndex` by `CFG.valueDfMin`/`valueDfMaxShare`. Answer names the file(s), the df, and why.
3. **blind** (§018, and 014's shape reproduced without Go/Rust) — the exact query text was found, via a bounded
   raw-text re-scan, inside a file that parsed but contributed zero real scopes (`blindFiles(model)` — new
   exported pure function, `model.filesAll` minus the union of every partition's `fileScopes` keys). Answer names
   that file.

Neither `config.mjs` nor `CFG.valueDfMin`/extraction was touched. No `MODEL_V` bump needed — `blindFiles`/
`gatedValueEvidence` are pure reads of fields already in `model.json` (`filesAll`, `partitions[].fileScopes`), and
the value-gate check reuses the already-persisted, already-read current-tree scope cache (`loadScopes`), not a new
model field.

## Design decisions, with the option chosen and why

**Case 3 (file parsed to zero scopes) — evidence reachability.** `model.filesAll` (every parsed file) and each
partition's `fileScopes` (only files contributing ≥1 non-file/module scope) are both already persisted in
`model.json`. `blindFiles(model)` = `filesAll` − ∪(`fileScopes` keys). Measured directly:
- express: 16 of 148 files (package.json, several `.github/workflows/*.yml`, some pure re-export `.js`).
- gin: 14 of 110 (doc.go, version.go, YAML/goreleaser config — **not** errors.go/context.go/gin.go, see below).
- axum: 83 of 376, **including** `axum/src/extract/rejection.rs` (018's own file) and `axum-extra/src/extract/mod.rs`.

First attempt made this an UNCONDITIONAL repo-wide disclosure (append "N files parsed to zero declarations…"
whenever the count is nonzero) — modeled on `relCoverageNote`/`intraModuleNote`'s own precedent. **This was wrong,
caught by a concurrently-written test** (`cross-check-honest-silence.test.mjs`, tests (d2)/(d3)): since almost
every real repo has *some* blind file for unrelated reasons, the note fired identically for a genuinely-absent
query and a query naming a real macro-emitted type, defeating the fix's own purpose. Fixed by making it
query-specific: `cmdWhat` does a BOUNDED raw-text re-scan — `readFileSync` + `.includes(query)` — only over the
files `blindFiles` already names (never the whole repo, never a re-parse), and only on the rare path where the
plain answer would otherwise be empty. Cost is bounded by the (already small) blind-file count, not repo size.

**Case 2 (value seen but gated) — options considered, in the ticket's preference order:**
- (a) something already-present: `model.valueSiblings`/`valueContainer` only retain keys that ALREADY survived
  `valueIndex` (`Object.hasOwn(model.valueIndex, k)` gate) — no existing structure names gated keys. Ruled out.
- (b) a bounded model addition: measured on express (via a throwaway script replaying `learn()`'s own vPlaces
  computation using `walkFiles`/`getParser`/`bindingFor`/`extractScopes`, none of which are touched): 2463 distinct
  value keys total, 562 kept in `valueIndex`, but **1897 gated below `valueDfMin`** — more than 3× the kept set.
  Persisting the full gated-key set is not "small" by any reasonable bar; a single repo-wide COUNT would be
  O(1)-sized but can't answer "was THIS term specifically gated." Ruled out (would need a MODEL_V bump anyway —
  not applied, per instruction).
- (c) **check-time re-scan — chosen.** `loadScopes()` already exists in grain.mjs (used by `export` on every
  call) and returns the current tree's cached per-file scope list, INCLUDING each file-kind scope's `.vals` — the
  exact input `learn()`'s `vPlaces` computation consumes. No re-parsing: it's a single JSON read already on disk
  (measured: 27ms for axum's 6MB tree.json, the largest of the three corpora). `gatedValueEvidence(model,
  rawScopes, q)` replays the population-gate arithmetic (`CFG.valueDfMin`/`valueDfMaxShare`) for just the queried
  literal (exact string equality, grouped by value-kind, deliberately tighter than `valueHits`' token-coverage
  match — this makes a factual "this literal exists, here" claim, so a coincidental shared token is not enough
  evidence for it the way it is for the fuzzy `defined`/`values` matching above it).

## Real repos, before/after (all `--no-refresh`, cache built before this fix landed)

express, `what homepage` (a real, single-file `package.json` key, df=1):
```
BEFORE: map: «homepage» has no declarations or values anywhere in this repository's code
AFTER:  map: «homepage» was seen as a key in 1 file (package.json) — below the 2-file floor where concordance
        begins, so it is not indexed. Seen, not absent.
```

axum, `what JsonDataError` (018's own macro-emitted type):
```
BEFORE: map: «JsonDataError» has no declarations or values anywhere in this repository's code
AFTER:  map: «JsonDataError» is not indexed as a declaration or value — but that exact text appears in
        axum-extra/src/extract/mod.rs, a file that parsed with zero extracted scopes. Grain cannot see inside
        it, so this may be a real declaration it missed.
```
(Hit lands on `axum-extra/src/extract/mod.rs`, not `axum/src/extract/rejection.rs` — both are blind files and
both contain the literal text; `findBlindHit` returns the first match in sorted order, which happens to sort
first alphabetically. Still a true, verified hit — the disclosure's job is "grain cannot fully see," not "here is
the one true defining file.")

axum, `what TotallyMadeUpXyzNoSuchThing` (control — genuinely absent, on the SAME repo that has 83 blind files):
```
BEFORE and AFTER (unchanged): map: «TotallyMadeUpXyzNoSuchThing» has no declarations or values anywhere in this
repository's code
```
This is the key regression check for the design fix above: distinguishability survives even on a repo where
almost every negative query could otherwise have been swamped by an unconditional hedge.

gin, `what ErrorTypePrivate` (014's real case — **unchanged, as scoped**):
```
BEFORE and AFTER (unchanged): map: «ErrorTypePrivate» has no declarations or values anywhere in this repository's
code
```
**Confirmed NOT fixed by Phase 1, measured directly and expected:** gin's const/var-bearing files (errors.go,
context.go, gin.go — where `ErrorTypePrivate`/`MIMEJSON`/etc. actually live) all also declare real functions, so
they are never "zero-scope files" at all — `blindFiles` correctly does not name them. 014's gap is narrower and
per-declaration, not per-file, and needs real Go const/var extraction (014's own ticket), not an answer-shape fix.
The independently-written `cross-check-honest-silence.test.mjs` reproduces this exact shape (a Go-like file with a
real function AND an unextracted const in the SAME file) as tests (d3)/(d3-json) — **both remain red**, correctly
and expectedly, under this Phase 1 fix. Flagged to the team lead; not something this ticket's Phase 1 scope covers.

## JSON schema

`what --json` gains one new, optional field: `note` — `null` for the plain-absent case (byte-identical to before
for every existing success path and for genuinely-absent queries), `{kind:'gated', value, valueKind, df, files}`
or `{kind:'blind', value, file}` otherwise. Not part of any previously-published schema (`grain export`'s own
schema explicitly does NOT export the raw `valueIndex`, and nothing documents `what --json`'s shape as published)
— chosen after a first attempt (text-only, no JSON change, modeled on how `relCoverageNote`/`intraModuleNote`
never appear in any `--json` output) was caught by the same cross-check test requiring JSON distinguishability too
(`(d1-json)`/`(d2-json)`).

## Tests

New file `plugins/grain/tests/what-honest-negative.test.mjs` — 4 fixture repos + regression, TDD (RED confirmed
against unmodified code, then GREEN). RED was reconfirmed a second time after a mid-implementation redesign (see
above) by hand-reverting the exact core.mjs/grain.mjs hunks via Edit and restoring them — never git
stash/checkout, per instruction (shared working tree, many concurrent agents).

Also found and fixed against `plugins/grain/tests/cross-check-honest-silence.test.mjs`, an independently-written
cross-check for the SAME three tickets by another concurrent agent — did not write it, but used it as an
additional oracle once discovered via a full-suite run. It caught the unconditional-repo-wide-hedge design flaw
described above (tests (d2)/(d3) initially failed for the wrong reason) before I'd have found it any other way.

Full suite `node --test 'plugins/grain/tests/**/*.test.mjs'`:
- Start of this task (shared tree, before this fix landed): 1590 tests, 21 failing.
- Final (after this fix): 1605 tests, 19 failing (delta: +15 tests from concurrent agents' own work, +this
  ticket's own new file; -2 failures — the two `what`-related failures this fix closes; the remaining 19 failures
  are unrelated pre-existing/other-ticket concerns, see report to grain-34).

---

# Phase 2 work log — extraction of declarations from macro invocation bodies — **SHIPPED**

## Question 1: can the idents be recovered from the grammar at all?

Yes, and not as loose tokens — as **declarations the grammar itself recognises**.

tree-sitter parses `define_rejection! { pub struct JsonDataError(Error); }` into
`macro_invocation(identifier, !, token_tree(...))`. Inside that `token_tree` the tokens are all there —
`pub` and `struct` as ANONYMOUS nodes, `JsonDataError` as an `identifier` — but with no structure whatsoever:
the grammar tokenised the region and then deliberately declined to analyse it. That is exactly why the file
yielded zero scopes.

**The rule: re-parse the token region's own text with the same parser, and keep what comes back only if the
whole region parses cleanly (`hasError === false`).** Nothing decides what a declaration is except the
grammar — the inner tree is handed straight to `extractScopes` itself, so a macro-declared struct is
classified by precisely the code that classifies an ordinary one. No macro name appears anywhere; no
threshold is introduced (the gate is one boolean the parser already computes).

### The two predicates, derived from node-types.json (`bindingFor`, no language named)

- **`b.tokenRegion`** — a NAMED node type with no fields of its own whose declared children include ITSELF.
  That self-recursive, field-less shape *is* "an unstructured run of tokens" (Rust: `token_tree`,
  `token_tree_pattern`, `token_repetition`, `use_list`).
- **`b.macroCall`** — a node type that is not one of those and whose EVERY declared non-field child is one.

Measured against all 23 shipped `node-types.json` files: `macroCall` is non-empty for **exactly one grammar**
and names **exactly one node type** there (`macro_invocation`). The other 22 grammars derive an empty set and
get no new behaviour at all — asserted as a test, not just measured. Note this excludes a macro DEFINITION
(`macro_rules!`): `macro_rule` carries `left`/`right` FIELDS, so it is not a macro call, and a template's
`pub struct $x;` can never be mistaken for a declaration. That exclusion is structural, not a special case.

A third derived predicate, `b.kwRe`, is a pure cost filter: the word-shaped half of `b.anonTypes` (the
grammar's own keyword tokens, `pub`/`struct`/`fn`, as opposed to `{`/`;`) as one alternation. A body naming
none of them cannot spell a declaration. Halves the re-parse cost; loses no name anywhere on the corpus.

## Question 2: the before/after, on real repositories

Exact A/B: the SAME shipped `extractScopes` run twice per file — once with the derived `macroCall` set, once
with that one set emptied, which is byte-for-byte the pre-change code path. The difference IS the output; no
attribution heuristic in between.

| repo | parsed | macro invocations | scopes before | **NEW names** | blind files |
| --- | --- | --- | --- | --- | --- |
| axum | 300 | 2081 | 3006 | **+121** | 10 → 9 |
| tokio | 790 | 8360 | 9326 | **+682** | 70 → 55 |
| diesel | 840 | 7680 | 8835 | **+63** | 98 → 98 |
| serde | 208 | 941 | 3968 | **0** | 11 → 11 |
| bitflags | 105 | 309 | 314 | **0** | 8 → 8 |

**96–99% of macro invocations are rejected outright.** serde (a proc-macro repo: every `quote!` template
carries `#name` holes) and bitflags (`pub struct F: u32 { … }` is not a syntax Rust has) produce nothing at
all — the rule stays silent rather than guessing, which is the property that matters most here.

### Ground truth — how "the extracted names are real" was established

Two independent oracles over all 866 new names.

**(1) The macro's own definition, read from the repository.** For each macro, its `macro_rules!` body is
parsed and checked for whether the name written at the call site survives into the expansion — either the
whole item passes through (`$x:item`/`$x:tt` bound and re-emitted) or the ident is re-emitted behind the SAME
keyword it had in the matcher (`pub struct $name:ident;` → `pub struct $name;`). Machine-verdict:

| | proven pass-through | external macro (definition not in repo) |
| --- | --- | --- |
| axum | 98 (65 `ident-behind-enum`, 33 `ident-behind-struct`) | 23 |
| tokio | 588 (584 item-passthrough, 4 `ident-behind-fn`) | 94 |
| diesel | 0 | 63 |

**686 of 866 (79%) machine-proven.** Spot-verified by hand against the source:
`axum-core/src/macros.rs:38` `__define_rejection!` matches `pub struct $name:ident;` and emits
`pub struct $name;`; `:154` `__composite_rejection!` matches `pub enum $name:ident { $($variant:ident),+ }`
and emits both; `tokio/src/macros/cfg.rs` `feature!`/`cfg_*!` emit `$item` verbatim under a `#[cfg]`.

The remaining 180 external-macro names adjudicated by hand:
- **`pin_project!` — 110** (pin-project-lite). Emits the struct/enum written in its body. Confirmed against
  source: `axum/src/util.rs:40` `pin_project! { pub(crate) enum Either<A, B> { A {…}, B {…} } }` really does
  declare `Either`/`A`/`B`; `tokio::io::BufReader`, `BufWriter`, `BufStream`, `MaybeDone`,
  `axum::routing::RouteFuture`, `axum_extra::json_lines::JsonLines` are all real types. True positives.
- **`quote!` — 64** (1 axum, 63 diesel). Proc-macro templates with no holes in them. The name is literally
  written as a declaration at the reported line and really is emitted — but into the code of a *consuming*
  crate, not the crate under analysis. This is the one contestable class; see below.
- **`tokio::join!`/`try_join!` — 6.** `async { fn foo(…) {} }` in trybuild compile-fail fixtures: real inline
  items, expanded in place.

**(2) A reference oracle** across every name (does it occur elsewhere in the repo, outside its own call
body): axum 118/121, tokio 602/682, diesel 57/63. The 79 tokio misses are almost all `rt_test!`-declared test
functions and `cfg_*!`-wrapped public methods — real declarations that nothing in the repo calls by name.
This oracle corroborates; it does not adjudicate, and "unreferenced" is not evidence of falsity.

### False positives

**Phantom declarations — a name reported that is not written as a declaration at that line: 0 of 866**,
across 19,371 macro invocations in five repositories. The negative controls (a body of bare references, a
macro definition's template, a template with holes, a syntax the language does not have) all produce nothing,
and are pinned as tests.

Two honest caveats, neither a phantom:

1. **Proc-macro templates (64, 7.4%).** `diesel_derives/src/tests/*.rs` builds derive-test input with
   `quote! { struct User { id: i32 } }`; `axum-macros/src/debug_handler.rs:736` emits a `fn check<T>`.
   Grain will now say those files declare `User` / `check`. The text at that line IS a struct/fn definition,
   and it IS where the name comes from — but it is a template for another crate's code. Reported rather than
   filtered: excluding it would need to recognise a macro by name, which is exactly what "kod to kod" forbids.
2. **`struct_expression` (46 in tokio, 0 in axum).** `Foo { a: 1 }` is a value construction, not a
   declaration — but it has `name` and `body` fields, so `bindingFor` already makes it a scope **everywhere**:
   tokio had 896 of them before this change and gains 46. A pre-existing classification this change inherits,
   not one it introduces. Worth its own ticket; deliberately not special-cased here.

### Cost and model effect

- Rust parse time +34–66%; **cold `grain status` unchanged within noise** (tokio 11.76s → 11.35s; axum 3.5s →
  2.7s — parsing is a small share of a cold build).
- axum with full history, before → after: 70 → 81 conventions, 184 → 195 groups. The convention SET is stable
  (most "new" entries are the same convention under a group label that shifted as members joined). What
  changes is population and exemplars: `package axum: types here are named PascalCase` goes from
  *99% of 216 (`Layered`, `Html`, `Multipart`)* to *98% of 288 (`Layered`, `Html`, `InvalidFormContentType`)* —
  72 real public types that were invisible now counted, and a macro-declared type cited as an exemplar.
  `axum-core` 37 → 54, `axum-extra` 115 → 146. Every macro-derived type name is PascalCase in both repos, so
  none of them is flagged as a naming deviant.

## The symptom, closed

```
BEFORE  grain what JsonDataError
        map: «JsonDataError» is not indexed as a declaration or value — but that exact text appears in
        axum/src/extract/rejection.rs, a file that parsed with zero extracted scopes. Grain cannot see
        inside it, so this may be a real declaration it missed.        (phase 1's honest hedge)

AFTER   grain what JsonDataError
        defined: axum-extra/src/extract/json_deserializer.rs:149 · :178 · axum/src/extract/rejection.rs:18
                 · axum/src/extract/rejection.rs:134   (all `JsonDataError`, type)
```
`rejection.rs:18` is the exact line of `pub struct JsonDataError(Error);`. `:134` is its variant inside
`composite_rejection! { pub enum JsonRejection { … } }`. Line attribution was verified line-for-line.

The genuinely-absent control on the same repo is unchanged: `what TotallyMadeUpXyzNoSuchThing` still answers
"has no declarations or values anywhere in this repository's code".

## Relation to 031 — ORTHOGONAL, and 031's boundary statement stands

031 concluded that metaprogrammed identifiers are unreachable by any evidence-based rule, and this does not
contradict it. 031's case is sinatra's `set :views` — the identifier **exists in no syntax tree at all**,
because it is produced at runtime by `define_method`. Nothing here can reach that: this rule only reads
tokens that are literally present in the source text. 018 phase 2's case is the opposite one — the name IS
written, in full, and the grammar simply declined to analyse the region it sits in.

The two are complementary halves of the same family, and `docs/validation.md`'s Known boundaries entry needs
**no narrowing**: it is about runtime-generated names, which remain out of reach. If anything it becomes more
precise — grain now sees names inside macro bodies, and still cannot see names that no body contains. That is
a call for the maintainer, not made here; flagged, not applied.

## Changes

`plugins/grain/engine/core.mjs` only (never `config.mjs`):
1. `bindingFor` — `b.tokenRegion`, `b.macroCall`, `b.kwRe`, derived from node-types.json.
2. `macroParser(b)` — a second `Parser` per grammar, so the re-parse can never interact with the outer walk.
3. `extractScopes` — a 5th param `_depth` (recursion bound 2, never passed by a caller) and the macro branch
   in the existing else-arm. Inner scopes are re-based by the opening delimiter's row and spliced in place, so
   the outer function's own final pass fixes their `imports`/`feats`/`ord` exactly as for any other scope.

Tests: `plugins/grain/tests/macro-body-declarations.test.mjs` (15 tests) — the derivation and its no-op on 22
grammars, the positive cases with exact lines, the four phantom guards, an unchanged non-macro file, and an
end-to-end `what` on a macro-declared type plus an absent control.

**`plugins/grain/tests/cross-check-honest-silence.test.mjs`** — another agent's cross-check for 011/018/014.
Its precondition (p3) asserts `src/macro.rs` yields ZERO scopes, and the fixture used 018's original
`define_rejection! { pub struct ZqMacroType(Error); }`, which this change now correctly extracts. **No
assertion was weakened.** The fixture body was replaced with `declare_flags! { pub struct ZqMacroType: u32
{ … } }` — a body the grammar genuinely refuses, which is what "a file grain cannot see into" now means, and
which the measurement shows is the majority case, not a contrivance. Header comments updated to say so.

Full suite: **1772/1772 at start → 1797/1797 at end**, 0 failures throughout (+15 from this ticket's own
file, +10 from other agents landing work in the shared tree during the task). The only test that ever went
red was (p3), for the reason above.

**EXTR_V bump g30 → g31 is required and was NOT applied** (per instruction): extraction output changes, so
every cached tree/model must be rebuilt. Three places — `meta.json` "extractor", `blobs/VERSION`,
`history.json` "x".

---

# Addendum — does the pre-existing `macroDefs` heuristic still earn its place? (measured, NOT changed)

Asked by the team lead after Phase 2 landed. `core.mjs:545-549` (HEAD, untouched by this ticket) collects every
`identifier`/`type_identifier` inside every `macro_invocation`, keeps the multi-token ones, and puts them on the
**file scope's `sup`** as "the DEFINITIONS a macro emits", plus a `doc` token bag. Nothing here was changed —
three throwaway engine copies in a scratch directory were used as A/B arms.

Arms, all with Phase 2 on: **B** = HEAD (both halves), **C** = both halves off, **D** = `sup` half off,
`doc` half kept.

## What `macroDefs` actually contains

Every name it puts in `fileSups`, classified against what the engine itself can declare:

| repo | names | the invoked MACRO's own name | now a real scope here (phase 2) | already an ordinary scope here | declared in ANOTHER file | declared nowhere in the repo |
| --- | --- | --- | --- | --- | --- | --- |
| axum | 653 | 174 (27%) | 44 (7%) | 73 (11%) | 74 (11%) | 288 (44%) |
| tokio | 2761 | 854 (31%) | 114 (4%) | 340 (12%) | 586 (21%) | 867 (31%) |
| diesel | 1828 | 364 (20%) | 5 (0%) | 120 (7%) | 301 (16%) | 1038 (57%) |
| serde | 267 | 41 (15%) | 0 | 27 (10%) | 87 (33%) | 112 (42%) |
| bitflags | 147 | 49 (33%) | 0 | 11 (7%) | 26 (18%) | 61 (41%) |

Roughly **90% of what it calls a definition is not a definition of anything in that file.** Samples from axum:
`include_str`, `format_args`, `assert_eq`, `__impl_deref` (the invoked macro's own name); `unwrap_or`,
`type_name`, `is_none`, `StatusCode`, `INTERNAL_SERVER_ERROR`, `axum_core` (declared nowhere).

**Yes, it injects names the phase-2 gate refuses** — that is nearly all of it. Only 4–7% of its names come from
a body phase 2 accepts. bitflags is the extreme: phase 2 recovers 0 names there and refuses every body;
`macroDefs` injects 147.

## The live harm: `fileSups` is read as "implements/extends it"

`core.mjs:3153` matches a query's exact name against `fileSups` and reports it as *implements/extends*. Real
answers on today's engine, and what arms C/D give instead:

```
axum   what assert_eq   B: "referenced structurally in 70 files — implements/extends it in 70 files"
                        C/D: "has no declarations or values anywhere in this repository's code"
tokio  what assert_eq   B: "... implements/extends it in 230 files"          C/D: (claim gone)
tokio  what pin_project B: "... implements/extends it in 77 files"           C/D: (claim gone)
axum   what StatusCode  B: "...51 files — implements/extends it in 40 files · takes or returns it ... 14 files"
                        C/D: "...14 files — takes or returns it as a parameter/return type in 14 files"
axum   what axum_core   B: "... implements/extends it in 14 files"   (axum_core is a CRATE NAME)
```

Distinct names in `fileSups` that would produce such a claim (macro name + declared-nowhere): axum 195 of 308,
tokio 605 of 1128, diesel 642 of 864, serde 94 of 169, bitflags 38 of 62. This is the same family as 018's own
defect — a confident claim with nothing behind it.

`fileSups` is NOT only this: it also carries real type heritage. With `macroDefs` off, axum-full still has 51
real entries over 17 files (`FnOnce`, `Route`, `Send`, `Sync`, `Clone`, `Handler`). Only the macro-token
contamination goes.

## Does it carry anything real? Yes — but in its `doc` half, not its `sup` half

106-query sweep on axum-full (54 `where` + 52 `what`), queries chosen adversarially as the names ONLY
`macroDefs` carries:

- **B is the sole substantive answer in 0 of 106 queries** — against C and against D.
- In **11 of 106**, B's false heritage claim *suppressed* a substantive answer C and D both give.
- D and C are equal on substantive-answer count (0 / 0).
- File cards returned over the 53 `where` queries: **B 53, D 49, C 44.** So the `doc` half recovers 5 of the 9
  cards that dropping everything loses; the `sup` half accounts for the other 4.

The `doc` half's win is real and non-redundant with phase 2. `where deserialize_bool` → **B and D** name
`axum/src/extract/path/de.rs` (the right file — the method is generated by a macro whose body phase 2 correctly
refuses); **C does not**. That is a *mention* signal, which is exactly what it is, and `fileDocs` is only ever
used as match tokens, so it makes no claim it cannot support.

The `sup` half's 4 extra cards are worth less than they look: for `where matched_path`, B's extra card is a bare
file card, while C/D answer with a group card carrying real conventions and `pattern to copy:
axum/src/extract/matched_path.rs:225` — the same file, with an actual answer attached.

Neither half is covered by a single test: full suite is **1797/1797 green** with arm C and with arm D, same as
with HEAD.

Model/conventions effect on axum-full: **195 groups, 81 conventions in every arm** — identical. This heuristic
does not reach the mining layer at all; it only reaches `what`/`where` retrieval.

## Recommendation (not applied — flagged for the maintainer)

Split it, don't delete it wholesale:

1. **Drop the `sup` half.** Delete the `macroDefs = [...]` line and pass `sup: []` on the file scope. Removes
   the false "implements/extends" claims, and removes two of the three magic constants (the
   `tokenize(x).length >= 2` filter and its `.slice(0, 12)`).
2. **Keep the `doc` half** — it earns its place, measurably, on exactly the bodies the phase-2 gate refuses.
3. **The "kod to kod" violation can go at the same time, for free.** The remaining path can use the predicates
   phase 2 already derives: `b.nodeTypes.has('macro_invocation')` → `b.macroCall.size`, and
   `descendantsOfType('macro_invocation')` → `descendantsOfType([...b.macroCall])`. Byte-identical selection
   (`b.macroCall` is exactly `{macro_invocation}` for that grammar and empty for the other 22), and no node
   type is named any more.

This is a behaviour change to `what`/`where` output, so it wants its own EXTR_V-adjacent decision and its own
tests; it was NOT applied.

## Sharpened classification — the three-way split actually asked for

The table above classifies by "where else is this name declared". The question that matters is narrower: is a
`macroDefs` name a declaration **my gate also recovers** (redundant), a declaration **my gate refused**
(so this path is the complement of mine and earns its place), or **not a declaration at all** (a phantom of
exactly the kind my path produces zero of)?

Decided structurally, per file: a name is "refused-but-real" only if it appears inside a token region my gate
REFUSED, as an identifier whose immediately-preceding anonymous token is an item keyword.

| repo | names | redundant | refused-but-REAL | phantom: the macro's own name | phantom: other |
| --- | --- | --- | --- | --- | --- |
| axum | 653 | 117 (18%) | **0 (0%)** | 174 (27%) | 362 (55%) |
| tokio | 2761 | 460 (17%) | **13 (0%)** | 848 (31%) | 1440 (52%) |
| diesel | 1828 | 127 (7%) | **43 (2%)** | 362 (20%) | 1296 (71%) |
| serde | 267 | 27 (10%) | **3 (1%)** | 41 (15%) | 196 (73%) |
| bitflags | 147 | 11 (7%) | **21 (14%)** | 49 (33%) | 66 (45%) |
| **total** | **5656** | 742 (13%) | **80 (1.4%)** | 1474 (26%) | 3360 (59%) |

**4834 of 5656 (85.5%) are phantoms** — asserted as "the DEFINITIONS a macro emits" on the file scope's `sup`.
Against 0 of 866 for the phase-2 path. The 018 headline should be read as scoped to the new path, which is how
it is written, but this old path is injecting invented supertypes on the very same files.

It does earn its place, narrowly: **80 names (1.4%)** are real declarations inside bodies my gate refuses —
bitflags' `TestFlags`/`MyFlags`/`CapabilityFlags`, diesel's `CLIENT_LONG_PASSWORD`/`CapabilityFlags`. Precisely
where you would expect: `bitflags! { pub struct F: u32 { const A = 1; } }` is not Rust syntax, so the parser
refuses it and only a token scan can see the name. Concentrated in one repo (14% of bitflags' names, 0% of
axum's).

### 018's own file, as the illustration

`axum/src/extract/rejection.rs` — phase 2 recovers **36** declarations. `macroDefs` keeps **12** (its cap), of
which 6 are real:

```
redundant          JsonDataError · JsonSyntaxError · MissingJsonContentType · MissingExtension
                   MissingPathParams · InvalidFormContentType
phantomMacroName   define_rejection
phantomOther       UNPROCESSABLE_ENTITY · BAD_REQUEST · UNSUPPORTED_MEDIA_TYPE · INTERNAL_SERVER_ERROR · cfg_attr
```

So on the file this ticket exists for, grain currently asserts that `rejection.rs` implements/extends
`BAD_REQUEST` and `cfg_attr`. **The caps are load-bearing in the wrong direction**: the 12-name cap is spent on
whatever appears first, so real macro-declared types past it are dropped while the HTTP status constants from
`#[status = …]` are kept.

### Downstream effect on §037's `weakName` disclosure — measured, and it fires LESS, not more

Flagged as a possible knock-on when 045 lands. Traced in code and measured; the direction is the opposite of the
intuitive one, so it is recorded here before the change rather than diagnosed after it.

`weakName` (core.mjs:3304) is
`!!(defined.length || valueHits.length || referenced) && !exactLocal && !valueHits.some(…) && qt.size >= 2`.

- **`exactLocal` cannot be affected.** It is `defined.some(d => d.name.toLowerCase() === ql)` (3208) — computed
  over DECLARATIONS only, never over `fileSups` and never over the file card's exact-match `names` set (2731).
  The card `names` set feeds `where` card ranking; it does not reach `what`'s `exactLocal`. Two different
  exact-match mechanisms, easy to conflate.
- **`referenced` shrinks.** It is built at 3264-3269 from `typeRefHits(model, q)`, which reads `fileSups` at
  3153 — the field `macroDefs` contaminates. It is one of the three disjuncts that make an answer NON-EMPTY,
  and a non-empty answer is `weakName`'s precondition.

So removing the phantoms can only turn `referenced` from truthy to null. That makes `weakName`'s first conjunct
false more often, never less. Measured on the 106-query axum-full sweep:

| | weakName disclosure lines | empty-answer path (§018) | "implements/extends it in N files" |
| --- | --- | --- | --- |
| HEAD | 3 | 1 | 28 |
| macroDefs off (`doc` kept) | **1** | **17** | **0** |

The two queries that lose the disclosure are `axum_core` and `cfg_attr` — both phantoms. Under HEAD each gets a
non-empty answer built on a phantom `referenced` count, plus a `weakName` hedge about it. After the change each
gets §018's empty-answer disclosure instead, which is the correct one: there is nothing there to hedge about.

Sixteen queries move from "non-empty answer resting on a phantom" to the honest empty answer. That is the whole
effect, and it is confined to the one grammar that has `macro_invocation` at all — no non-Rust repo can move.
