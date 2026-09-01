# Log — 015 named return mislabeled

## Diagnosis

Traced `rets`/`auto.returns:` to `extractScopes`'s return-type block (`core.mjs`, ~line 327 pre-fix). `retN`
(Go's `result` field) resolves to a `parameter_list` for a NAMED return; that list holds a `parameter_declaration`
with both a `name` field (`err`) and a `type` field (`error`). The extractor scanned `retN.descendantsOfType([...
'identifier'])[0]` — a flat pre-order scan — which finds the NAME identifier before the TYPE identifier, since
`name` sits before `type` in source order within one `parameter_declaration`. Confirmed empirically against a real
Go fixture: `Run` (`(err error)`) → `rets: ["err"]`; `Other` (`error`, unnamed) → `rets: ["error"]` (already
correct, no parameter_list wrapper for an unnamed single return).

Checked every shipped grammar's `result`/`return_type` field declarations (`node-types.json`) for any OTHER
node type whose declared alternatives include a container of "named slot" elements (both `name` + `type` fields
on the element): only Go's `parameter_list` (via `result`) and Scala 3's `named_tuple_type` (via `return_type`,
element type `name_and_type`) qualify. Confirmed Scala is affected the identical way: `def f(): (name: String,
age: Int) = ...` → `rets: ["name"]` pre-fix.

Also found, empirically (not from grammar inspection alone — verified by parsing), a related but DISTINCT case:
TypeScript/tsx return types that are themselves function types embed named parameters, e.g. `(): (x: number) =>
void` → pre-fix `rets: ["x"]` (same root cause — a bound name picked up during the descendant scan — but the
paramLike node is nested, not a direct child of retN).

Checked and confirmed UNAFFECTED: Java (return type field `type` is never a named-slot container), Rust (tuple
returns are UNNAMED — `(i32, String)` has no name/type confusion since there is no name), C# — but note: C#
methods do not reach this extraction path AT ALL today. `method_declaration`'s return-type field is literally
named `returns` in the C# grammar; the code only checks `result`/`return_type`/(for `kind==='method'`) `type`.
This is a separate, pre-existing SILENCE (no return type ever recorded for a C# method), not a false claim —
reported here, not fixed (out of this ticket's scope; the ticket is about a false claim, not a missing one).

## Fix

Root cause fix, `bindingFor` (core.mjs): added `b.paramLike` — a generic, node-types.json-field-driven set of
"named slot" node types (any node type whose OWN fields declare BOTH `name` and `type` — Go's
`parameter_declaration`/`variadic_parameter_declaration`, TS's `required_parameter`/`optional_parameter`, Scala's
`name_and_type`, C#'s `tuple_element`, and ordinary function-parameter node types generally). Same derivation
style as the existing `b.scope`/`b.imp`/`b.deco` sets — no per-language node-name list ("kod to kod").

Return-type extraction: when `retN`'s own DIRECT children are ALL `paramLike` (Go's named result list, Scala's
named-tuple return), read each slot's `.type` field directly (same sub-extraction technique the existing `ptypes`
parameter-type code already uses) instead of scanning raw identifiers. This fully and correctly fixes both the Go
and Scala cases with no additional caveats.

For the TypeScript nested-paramLike case (a paramLike node NOT a direct child of retN): two fix attempts were
tried and reverted before shipping:
1. Excluding the WHOLE nested paramLike node (name AND type) from the fallback scan — this "fixed" the TS
   function-type-return case (picked `void` instead of `x`) but caused a real regression: a TS return type that is
   an object LITERAL, `{ id: string }`, is ALSO `paramLike` per property (`property_signature` has both `name` and
   `type` fields) but is common, ordinary code, not a nested/unrelated construct — excluding its `.type` field
   silently dropped a real, previously-reported value (`rets` went from `["string"]` to `[]`). This changed
   `s.feats` (which folds in `ret:` tokens) for scopes in this repo's own `change-archetypes.test.mjs` /
   `missing-shape.test.mjs` fixtures (their `tests/fixtures/order.fixture.ts` has exactly this shape,
   `make<Status>Order(): { id: string }`), shifting role-cluster feature bags and breaking 2 previously-passing
   tests (both asserted "5 certified cells" / "both shapes certify a g: role cell" — got 4 / missing one). Caught
   by running the full suite, root-caused by bisecting (reverted just this hunk, both tests passed again),
   reverted.
2. Excluding only the `.name` field target of a nested paramLike node (narrower) — this does NOT regress the
   object-literal case (its `property_signature`'s populated field for `id` isn't `identifier`-typed and was never
   a false candidate anyway), but it ALSO doesn't fix the TS function-type-return case: empirically, TS's
   `required_parameter` for a plain identifier parameter binds its name through a `pattern` field at RUNTIME, not
   `name` — despite `node-types.json` listing `name` as a structurally valid field for that node type too (a
   per-instance/per-production grammar quirk, not a stable generic signal). `childForFieldName('name')` returned
   `undefined`; `childForFieldName('pattern')` returned the identifier. Verified via direct node inspection.

Given neither attempt cleanly and safely fixed the TS case, and it is NOT part of this ticket's acceptance
criteria (found voluntarily during the "check other languages" diagnosis step), it was left UNFIXED: the fallback
branch for `retN` is now byte-identical to the original pre-fix code. This is reported as a known, narrower,
residual gap rather than shipped as a fragile or regression-prone fix. A regression test for the object-literal
case (`{ id: string }` unaffected) is included as a permanent guard against re-attempting the broader (broken)
exclusion.

## EXTR_V

Extraction output changes for Go (named returns) and Scala (named-tuple returns) only — every other grammar's
`rets` output is byte-identical (verified: Java, C#, Rust, TS/tsx all unchanged; TS's plain and object-literal
return-type cases explicitly regression-tested). **`EXTR_V` needs a bump** — not applied here per instructions
(orchestrator applies it); `config.mjs` was not touched.

## Tests

`plugins/grain/tests/named-return-type.test.mjs` — 10 tests. RED confirmed against the unmodified extractor (5/10
failed: the two "differently-named" identity/collapse cases, the Go named-return case, and the Scala named-tuple
case; the two "plain return unchanged" cases and Java/Rust already passed, as expected). Fix applied → 10/10
green. A later regression (found via the full-suite run, see above) was root-caused, the offending fallback-branch
change reverted, and the full red→green cycle re-run against the FINAL code: 4/10 red (Go named-return + its two
derived tests, Scala named-tuple) → 10/10 green after restoring the final fix.

No pre-existing test asserted the buggy behavior (grepped for `auto.returns:`/`declares a return type` — no hits
before this ticket).

## Full suite

Start (before this ticket's two new test files existed, i.e. before my session's own changes): not independently
measured — see 019's log for the shared full-suite numbers, since both issues share one working tree and one
final suite run. Final, with both issues' fixes and both new test files applied: **1505/1505 passing** (1483
pre-existing + 22 new: 10 here + 12 in 019's `argless-command-args.test.mjs`). The dispatch's stated baseline was
1482/1482; this session measured 1483 pre-existing tests before adding its own two files — a 1-test discrepancy,
most plausibly explained by concurrent work in this shared working tree (see the many other agent names in this
session's roster) rather than anything this ticket touched. Reported as observed, not reconciled further.

## Nearby, not fixed (reported per instructions)

1. **C# methods never get a `rets` value at all.** `method_declaration`'s return-type field is named `returns` in
   the C# grammar; extraction only checks `result`/`return_type`/`type`. Confirmed via `node-types.json` and via a
   direct extraction probe (`rets: []` for every C# method tested). A silence, not a false claim — different
   severity class per this project's own doctrine — but likely worth its own ticket, since `auto.returns:`/marker
   indexing is described elsewhere as "the strongest role signal" for typed languages, and C# gets none of it.
2. **`STRUCT_PID` regex over-matches `auto.returns:`.** `core.mjs`: `export const STRUCT_PID =
   /^auto\.(has|stshape|varshape|first1|ret|arity)/;` — the `ret` alternative has no word boundary, so it matches
   the PREFIX of `auto.returns:error` too (not just the intended, unrelated `auto.ret` single-value "last-return-
   statement-shape" predicate). Consequence: `mine()`'s post-loop filter
   (`out.filter(f => !STRUCT_PID.test(f.pid) || (!f.cid.startsWith('_all') && ...))`) treats every `auto.returns:`
   fact as "structural" and REMOVES it whenever `cid` is `_all:*` — meaning a `declares a return type of X`
   convention can seemingly never certify repo-wide via `mine()`, only ever as a local group/dir CONTRAST.
   Confirmed empirically: 8 Go methods uniformly returning `error` (100% share, well past every threshold)
   produced ZERO `auto.returns:` facts from `mine()` at the `_all:method` cid. This may or may not matter in
   practice if `where`/`export`'s marker rendering (`markers[pre+':'+x]`, built directly from `s.rets`,
   independent of `mine()`) is the actual code path the original bug report's "export and where" wording refers
   to — but it looks like a genuine, separate naming-collision bug worth its own look. Not touched here — outside
   this ticket's scope and risky to fix blind under time pressure with a shared model-format cascade
   (`mine()`/`STRUCT_PID` feed many other fact families).
3. **`check`/`explain`/`spectrum` read only `args[0]`**, silently ignoring a second positional argument
   (`grain check a.js b.js` checks only `a.js`). Same general shape as 019 but these are NOT "argument-less"
   commands, so 019's fix doesn't touch them. Flagged for a possible future ticket.
