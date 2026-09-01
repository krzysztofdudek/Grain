# 021 log

## Verification (before designing anything)

Read `tree-sitter-c_sharp.node-types.json` directly. Confirmed: `method_declaration`'s fields are
`body, name, parameters, returns, type_parameters` — the field really is named `returns`, and `method_declaration`
has **no** `type` field of its own at all. `extractScopes`'s old lookup chain
(`result` → `return_type` → `type`, the last one only when `kind === 'method'`) never finds it, so `s.rets` was
always `[]` for every ordinary C# method. Also checked every other C# node type with a return-type-shaped field:
`local_function_statement`, `operator_declaration`, `conversion_operator_declaration`, `lambda_expression` all use
`type` (not `returns`) and were already working, coincidentally, via the old `type` fallback — the bug is specific
to `method_declaration`, the single most common C# scope.

## Fix

`bindingFor` (core.mjs) derives a new per-node-type `b.retField: Map<nodeType, fieldName>`. For every node type
that is "callable-shaped" (declares BOTH a `body` field and a `parameters` field of its own — the same
structural test that already distinguishes a real function/method from a bodiless declaration elsewhere in this
file), the candidate result field is whichever of its OTHER fields (excluding the structural ones:
`body`/`name`/`parameters`/`type_parameters`/`receiver`/`attributes`) declares a child node type that names "type"
as a whole word segment (`type`, `_simple_type`, `type_annotation`, `bottom_type`, `type_identifier`, …), via a new
`RESULT_FIELD_RE = wordBounded(['type'])` — the same word-bounded technique `TYPE_LIKE_RE`/`FUNC_LIKE_RE` already
use. Verified across every shipped grammar's callable-shaped node types that at most one field per node type ever
matches (no ambiguity, no zero-match surprise): Go's `result` (declares `_simple_type`), TS/PHP/Rust/Scala's
`return_type`, Java/Groovy's `type`, and — newly discovered by the SAME rule, not a hardcoded fourth name — C#
`method_declaration`'s own `returns`. Also confirmed the technique correctly REJECTS every other leftover field
found on a callable node across the corpus (`dimensions`, `operator`, `reference_modifier`, `static_modifier`,
`interfaces`, `object`, `arguments`, a lone unparenthesized arrow `parameter`) — none of those fields' declared
child types contain the word "type".

`extractScopes`'s return-type extraction now reads `b.retField.get(ch.type)` to get the field name (or `null` if
the node type has none), then `ch.childForFieldName(retFieldName)` — replacing the old three-alternative hardcoded
chain entirely, including dropping the `kind === 'method'` guard (no longer needed: the callable-shape requirement
in the derivation itself already excludes every type-kind/class-shaped node structurally, confirmed by inspecting
every TYPE_LIKE node type in every grammar — none of them has both `body` and `parameters` fields together, except
Java/Groovy `record_declaration`, whose only extra field is `interfaces`, which does not match the type-word test
either).

## Red → green evidence

- Direct extraction check before any fix (via a throwaway script calling `extractScopes` on a
  `Task<Result<T>> Handle(...)` method): `s.rets` was `[]`.
- After the fix: `s.rets` is `['Task']` (the outer generic type name only, matching this codebase's existing,
  deliberate policy for generic return types — same policy Go/TS/Java already follow).
- Hand-reverted the `b.retField` line in `extractScopes` via `Edit` back to the old hardcoded chain, reran the
  direct check: `Handle`'s rets went back to `[]` (bug reproduced), while `local_function_statement`'s rets stayed
  `['int']` (proving that path was never broken). Restored via `Edit`; `Handle`'s rets is `['Task']` again.
- New tests in `plugins/grain/tests/declaration-extraction.test.mjs`: a `Task<Result<T>>`-returning method, a
  plain `int`-returning method, and a `void`-returning method, all passing.

## Other languages

Ran `named-return-type.test.mjs` (issue 015's own regression suite) unmodified: all 10 tests still pass — Go,
Scala, TypeScript, Java, Rust rets extraction is byte-identical. Directly enumerated `b.retField` for all 23
shipped grammars and pinned the exact map in a new regression test: only `c_sharp`, `go`, `groovy`, `java`, `php`,
`python`, `rust`, `scala`, `tsx`, `typescript` have any entries at all, and each entry matches what the OLD
hardcoded chain already produced except the one new C# `method_declaration` → `returns` entry. Kotlin and Ruby
have zero entries (unaffected, unchanged — Kotlin declares no fields at all for its callable node types in its own
node-types.json, so no field-based derivation can see into it; Ruby is untyped).

Note: `named-return-type.test.mjs`'s own header comment (lines ~20–23) says "C# methods do not reach this code
path at all today — a separate pre-existing silence, reported not fixed" — that comment is now stale as of this
fix. Left untouched (out of this ticket's scope, and that test file has no C# assertions that would need
changing), flagging here for whoever next touches that file.

## EXTR_V

Extraction output changes for C# (`.cs` files: `method_declaration` scopes now carry non-empty `rets` where they
previously carried `[]`). **`EXTR_V` (config.mjs, currently `'g28'`) needs a bump** so cached scopes/blobs from
before this fix are invalidated and rebuilt. Not bumped — reporting per instructions; `config.mjs` was not
touched.
