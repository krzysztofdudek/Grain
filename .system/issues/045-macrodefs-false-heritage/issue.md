# 045 · `macroDefs` injects macro tokens as file supertypes — `what assert_eq` claims "implements/extends it in 230 files"

**Status:** FIXED — macroDefs sup:[] deleted, macroDoc kept, shipped on fix/045 (merged, 1831/1831 green); decision macrodefs-sup-deleted-doc-kept ratifies. Bookkeeping-only: branch merged, status line never advanced.
**Found by:** orchestrator review of §018 phase 2, then measured by that ticket's agent on 5 repos, 2026-09-01
**Severity:** HIGH — a confident false claim, the exact failure class §018 exists to eliminate

## The defect

`core.mjs:545–549` (predates §018 phase 2) grabs every `identifier`/`type_identifier` inside a macro invocation,
filters to multi-token names, and pushes the result into the **file scope's `sup`** as "the DEFINITIONS a macro
emits". `core.mjs:3153` reads `fileSups` as **implements/extends it**.

Measured across 5 Rust repos — classification of every name it injects:

| repo | names | the invoked MACRO's own name | a real scope (ph2) | already an ordinary scope | declared in ANOTHER file | declared nowhere |
|---|---|---|---|---|---|---|
| axum | 653 | 27% | 7% | 11% | 11% | 44% |
| tokio | 2761 | 31% | 4% | 12% | 21% | 31% |
| diesel | 1828 | 20% | 0% | 7% | 16% | 57% |
| serde | 267 | 15% | 0% | 10% | 33% | 42% |
| bitflags | 147 | 33% | 0% | 7% | 18% | 41% |

**~90% of what it calls a definition is not one.** Samples: `include_str`, `assert_eq`, `__impl_deref` (the
invoked macro's own name); `unwrap_or`, `StatusCode`, `axum_core` (declared nowhere — `axum_core` is a *crate*).

Live consequences:
```
what assert_eq   → "implements/extends it in 70 files" (axum) / 230 files (tokio)
what pin_project → 77 files
what axum_core   → 14 files          (a crate name)
what StatusCode  → "51 files — implements/extends it in 40 files"
                   (without it the true fileTypeRefs half survives: "14 files — takes or returns it")
```
Distinct names capable of producing such a claim: axum 195/308, tokio 605/1128, diesel 642/864.

It is also a **"kod to kod" violation**: it hardcodes the node type `macro_invocation` and carries three magic
caps (60/12/60).

## What must NOT be removed

The same block's **`macroDoc`** half is measured to earn its place, and the two must not be conflated.
106-query adversarial sweep on axum (queries chosen as names only this block carries):
- the `sup` half is the sole substantive answer in **0 of 106** queries;
- its false claim **suppressed the correct answer in 11 of 106**;
- file cards over 53 `where` queries: HEAD 53, doc-only 49, both-off 44.

`where deserialize_bool` finds the right file (`axum/src/extract/path/de.rs`) from a macro body phase 2 correctly
refuses — a *mention* signal. `fileDocs` only ever becomes match tokens, so it claims nothing it cannot support.
That is the honest half; `sup` is the dishonest one.

`fileSups` also carries real heritage independently: with `macroDefs` off, axum keeps 51 genuine entries
(`FnOnce`, `Send`, `Clone`, `Handler`). Only the macro-token contamination goes.

Conventions/groups are identical in every arm (195/81) — this never reaches the mining layer, so acceptance is
untouched.

## Agreed change

1. Delete the `macroDefs = [...]` assignment; pass `sup: []` at the file-scope push. Kills the false claims and
   two of the three magic constants.
2. **Keep `macroDoc`.**
3. Remove the kod-to-kod violation at the same time, at zero behavioural cost: `b.nodeTypes.has('macro_invocation')`
   → `b.macroCall.size`, and `descendantsOfType('macro_invocation')` → `descendantsOfType([...b.macroCall])` —
   byte-identical selection, no node type named.

Full suite is 1797/1797 green with either half removed — **no test covers this**, which is why it survived. Tests
required: `what assert_eq` makes no heritage claim; a real supertype is still recorded; the `doc` signal still
finds `deserialize_bool`'s file.

## Note on §018's headline

§018 phase 2 reported 0 phantom declarations in 866 names. That number is about the NEW path only and remains
correct. This ticket is the old path, and it was injecting phantoms the whole time.

## Refined measurement — 85.5% phantoms, and the caps fail in the wrong direction

Full three-way classification, 5 repos, 5656 names. "Refused-but-real" counted structurally: an identifier
inside a token region phase 2 REFUSED, whose immediately-preceding anonymous token is an item keyword.

| repo | names | redundant | refused-but-REAL | phantom: the macro's own name | phantom: other |
|---|---|---|---|---|---|
| axum | 653 | 117 (18%) | **0** | 174 (27%) | 362 (55%) |
| tokio | 2761 | 460 (17%) | **13 (0%)** | 848 (31%) | 1440 (52%) |
| diesel | 1828 | 127 (7%) | **43 (2%)** | 362 (20%) | 1296 (71%) |
| serde | 267 | 27 (10%) | **3 (1%)** | 41 (15%) | 196 (73%) |
| bitflags | 147 | 11 (7%) | **21 (14%)** | 49 (33%) | 66 (45%) |
| **total** | **5656** | 742 (13%) | **80 (1.4%)** | 1474 (26%) | 3360 (59%) |

**4834 of 5656 (85.5%) are phantoms**, against 0 of 866 for the phase-2 path on the same files.

### The caps are load-bearing in the wrong direction

`018`'s own file, `axum/src/extract/rejection.rs`: phase 2 recovers **36** declarations; `macroDefs` keeps
**12** — its cap — of which 6 are real. The other six are `define_rejection` (the macro's own name),
`UNPROCESSABLE_ENTITY`, `BAD_REQUEST`, `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL_SERVER_ERROR`, `cfg_attr`.

So grain currently asserts that `rejection.rs` **implements/extends `BAD_REQUEST` and `cfg_attr`**. The 12 slots
are filled in encounter order, so real types past the cap are dropped while `#[status = …]` constants are kept.
The magic constants are not a harmless truncation — they actively prefer noise over signal.

### CORRECTION — the real names are downgraded, not preserved intact (4 file cards is the measured cost)

**An earlier version of this ticket claimed the change "loses no information". That was wrong**, written by the
orchestrator and corrected by the measuring agent against its own sweep. Recorded rather than silently edited,
because the accurate version is the better argument.

Both halves derive from the same `ids` list, so no name is lost *as a string*. But they reach the file card
through two different doors (verified in `core.mjs`):

```
2724  fileDocs → addTok(toks, t, TOKW.doc)                       // weight 0.5
2725  fileSups → addTok(toks, tokenize(x), TOKW.name)            // weight 1.0
2731  names: new Set([...members…, ...fileSups[rel].map(lower)]) // the EXACT-MATCH set
```

`fileDocs` never populates the exact-match `names` set. So dropping `macroDefs` costs two things: those tokens
fall from `TOKW.name` to `TOKW.doc` weight, and the names leave exact-match entirely.

**Measured cost: 4 file cards.** Over 53 `where` queries — HEAD 53, doc-only 49, both-off 44.

Inspected directly, the 4 extra cards are the weaker answer anyway: `where matched_path` gains a bare file card
under HEAD, while the arms without it return a group card naming the same file **plus**
`pattern to copy: axum/src/extract/matched_path.rs:225`.

**The trade, stated honestly: 4 weak file cards, for retiring 4834 false assertions and unblocking the 11 of 106
queries where the false heritage claim suppressed the correct answer.** Decision unchanged.

Also corrected: "those names were in the wrong field regardless — declarations, not supertypes" holds only for
the 13% redundant and the 1.4% refused-but-real. The other **85.5% are not declarations at all** — they are the
invoked macro's own name, or a bare reference.

The 80 genuinely-real names do survive as doc tokens, at the lower weight and without exact-match.

**Test rationale:** the guard asserting the `doc` signal still finds `deserialize_bool`'s file is exactly right,
because that one survives the weight drop. The four that do not are a knowingly accepted cost, not an oversight.

## CORRECTION 2 — the disclosure prediction was inverted; `weakName` will fire LESS, and the disclosure KIND changes

The orchestrator predicted that removing phantom names from exact-match would make §037's `weakName` disclosure
fire *more often*. **That was wrong, in direction.** Traced and measured by the 018 agent, verified in code:

```
exactLocal = defined.some(d => d.name.toLowerCase() === ql)          // DECLARATIONS only
weakName   = !!(defined.length || valueHits.length || referenced) && !exactLocal && …
```

`exactLocal` never reads `fileSups`, and never reads the card `names` set — **those are two different
exact-match mechanisms.** The card set feeds `where` ranking; it does not reach `what`'s `exactLocal`. (The
orchestrator conflated them after CORRECTION 1 above raised the card set.)

Meanwhile `referenced` (via `typeRefHits` → `fileSups`) is one of the three disjuncts that make an answer
**non-empty**, and non-empty is `weakName`'s precondition. Removing phantoms turns `referenced` truthy → null,
so the first conjunct fails more often. It cannot fire more.

Measured on the 106-query axum-full sweep:

| | weakName lines | §018 empty-answer path | "implements/extends it in N files" |
|---|---|---|---|
| HEAD | 3 | 1 | 28 |
| macroDefs off | **1** | **17** | **0** |

The two queries that lose `weakName` are `axum_core` and `cfg_attr` — both phantoms. Under HEAD each got a
non-empty answer resting on a phantom `referenced` count, **plus a hedge about the phantom**. After this change
each gets §018's empty-answer disclosure, which is the correct one: there is nothing there to hedge about.

**Expected signature after landing: `weakName` flat-to-down, §018's empty-answer path up.** If the 1.58% rate
drops, that is the change working, not a regression. Confined to the one grammar with macro invocations, so a
nine-repo global rate moves far less than the Rust-only slice.

**Required test, beyond the three already agreed:** the ~16 queries that move to the empty-answer path get
§018's deliberately *looser* substring scan over blind files — a lower evidentiary bar, correct because an
answer already saying "nothing found" cannot be made overconfident by a hedge. So those queries change
disclosure **kind**, not merely presence. Pin `what assert_eq` to the empty-answer wording so nobody later reads
the shift as a regression.

## Trap for whoever writes the "a real supertype survives" guard

The obvious fixture is a generic bound:
```rust
pub fn zq<T: ZqMarkerTrait + Send>(x: T)      // produces NO `sup` at all
```
`b.heritageRe` matches `trait_bounds` only as a **direct child** of the declaration, and a generic bound is
nested inside `type_parameters`. The shape that actually populates `sup` is a supertrait list:
```rust
pub trait ZqChildTrait: ZqMarkerTrait + Send {}
```
Written from intuition, the generic-bound version comes back empty and reads as "the fix broke `fileSups`" —
when `fileSups` never populated for that shape in the first place. Cost of not knowing this: a false regression
report against a correct change.

## Test set as built (scratchpad; red-against-HEAD / green-against-fix proven before landing)

| | HEAD | with fix |
|---|---|---|
| (p) precondition — the flags body really is refused by the gate | pass | pass |
| (1) a reference-only macro body contributes NO supertype | **fail** | pass |
| (2) `what assert_eq` makes no implements/extends claim | **fail** | pass |
| (3) `what assert_eq` pinned to the empty-answer wording | **fail** | pass |
| (4) a real supertype still recorded | pass | pass |
| (5) the `doc` half still finds the file | pass | pass |

(4) and (5) pass in **both** arms deliberately — they are the don't-lose-this guards, and a guard that only
passes after the change guards nothing.

The red reason is the defect in miniature: a file containing nothing but two functions calling `assert_eq!`
records its supertypes as `["ZqWidgetKind", "assert_eq"]` — a phantom plus the macro's own name — and
`what assert_eq` then answers "implements/extends it in 1 file".

All six live in one new test file, deliberately not touching the contended function.
