# 014 log

## Diagnosis

Confirmed both candidate mechanisms, and both were real:

1. **`defined:` blindness (scope mechanism).** Go's `const_spec`/`var_spec` node types have a `name` field and a
   `value` field but declare **no `body` field at all** (checked `tree-sitter-go.node-types.json` directly). Their
   wrapping container (`const_declaration`/`var_declaration`) has no fields of its own either. `bindingFor`'s scope
   rule (`f.body && (f.name || f.declarator)`) requires a body, so neither node type is ever added to `b.scope` —
   they are structurally incapable of being scopes, not merely unrecognised. **Deliberately left this way**: the
   cross-check suite's own precondition `(p4)` in `cross-check-honest-silence.test.mjs` asserts a Go const must
   *never* become a declared scope, so `defined:` staying silent for const/var is the intended contract, not a bug
   to route around.
2. **`values:` blindness (value-scan mechanism).** The pre-existing value scan only recognised `ENUM_LIKE_RE`
   (node types containing the word "enum") plus raw string literals. Go's const/var specs match neither, so their
   NAMES (`ErrorTypePrivate`, `MIMEJSON`, …) were never captured as values either. This is the mechanism actually
   fixed.

## Fix

`bindingFor` (core.mjs) derives a new `b.namedValueSpec` set: node types whose `name` field is itself declared
`"multiple": true` (can bind SEVERAL identifiers to one shared `value`, e.g. Go's `a, b = 1, 2`) and which carry a
`value` field but no `body`. Scanned every shipped grammar's own name+value-no-body node (JS/TS
`variable_declarator`, Python `keyword_argument`/`named_expression`/`default_parameter`, Rust
`const_item`/`static_item`, PHP `enum_case`/`static_variable_declaration`, C# `enum_member_declaration`, Solidity's
various declarations, …) — every single one of them binds exactly ONE name. Only Go's `const_spec`/`var_spec`
declare `name.multiple: true`. This is the load-bearing, non-Go-specific test — no Go node-type name appears
anywhere in the derivation.

`extractScopes` gained a new value-scan pass (`(a2)`, right after the existing enum scan): for every node matching
`b.namedValueSpec`, pulls every named child under the `name` field (via `childrenForFieldName`, filtered to
`isNamed` to drop comma tokens the field also carries), and records each as a value tagged with the grammar's own
word for what it is (`sp.type.replace(/_spec$/, '')` → `'const'`/`'var'` — read off the node type string itself,
not an invented label). The container is the spec's own PARENT node (`const_declaration`/`var_declaration`/
`var_spec_list`), so a grouped `const ( A; B )` block's members share one sibling set, exactly like one enum's
members already do.

This intentionally captures const/var wherever they appear in the tree (module-level or local to a function body),
matching the existing string-literal/enum scan's own flat, scope-agnostic style — there is no schema-level way to
distinguish "package-level" from "local" `const_declaration` in Go's grammar (same node type either way), and the
existing value scan never made that distinction for string literals either.

## Considered and rejected

A broader "any name+value-no-body node, anywhere" rule was tried first and rejected: it also matches JS/TS
`variable_declaration`/`lexical_declaration` (i.e. every `var`/`let`/`const` statement, local variables included),
which would have flooded the value index for JS/TS and violated "byte-identical for every other language." The
`name.multiple` cardinality check is what cleanly excludes that shape while keeping Go's.

## Red → green evidence

- `cross-check-honest-silence.test.mjs` (d3)/(d3-json): RED before the fix (confirmed — both asserted
  `notEqual`/`notDeepStrictEqual` and failed with identical output on both sides), GREEN after. All 4 preconditions
  (including `(p4)`, which asserts the const must never become a scope) stayed GREEN throughout — the fix routes
  through the value surface only, never through `b.scope`.
- Hand-reverted the `(a2)` scan block via `Edit`, reran `cross-check-honest-silence.test.mjs`: `(d3)`/`(d3-json)`
  flipped back to RED with the exact same failure shape (identical `--json` output on both sides). Restored via
  `Edit`; GREEN again.
- New tests in `plugins/grain/tests/declaration-extraction.test.mjs` cover: single-line const, grouped const block
  (siblings), a single spec binding multiple names (`a, b = 1, 2`), `var` blocks, and an end-to-end repo proving
  `model.valueIndex` and `grain what` itself surface a real cross-file (df=2) Go const/var as a `values:` line,
  never a `defined:` line.

## Other languages

`b.namedValueSpec` is empty for every one of the other 22 shipped grammars (verified directly and pinned in the
regression test) — Go is the only one with the `name.multiple` shape, so no other language's `vals` output
changes.

## EXTR_V

Extraction output changes for Go (`.go` files now yield additional `vals` entries for package/local const and var
names). **`EXTR_V` (config.mjs, currently `'g28'`) needs a bump** so cached scopes/blobs from before this fix are
invalidated and rebuilt. Not bumped — reporting per instructions; `config.mjs` was not touched.
