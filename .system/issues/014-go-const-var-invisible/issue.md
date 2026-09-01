# 014 · `what` is blind to Go package-level `const`/`var` — an entire category of API surface

**Status:** FIXED — derived from node-types.json (b.namedValueSpec / b.retField); EXTR_V g28→g29; verified independently
**Found by:** round 2, Go/gin, 2026-09-01 (grain 0.3.0, extractor g26)
**Severity:** HIGH — makes `what` unreliable for "what is X" on any Go codebase

## Symptom

Every one of these is a real, referenced, package-level declaration in gin, and every one returns
"has no declarations or values anywhere":

```
grain what ErrorTypePrivate     → nothing
grain what ErrorTypePublic      → nothing
grain what MIMEJSON             → nothing
grain what abortIndex           → nothing
grain what default404Body       → nothing
```

Both single-line (`const x = ...`) and grouped (`const ( ... )` / `var ( ... )`) forms are affected. Functions and
methods work correctly on the same repo (`what CreateTestContext` succeeds), so this is specific to const/var, not
a broken index.

Confirmed general across five distinct symbols, not a one-off.

## Why it matters disproportionately in Go

Idiomatic Go puts a large share of the public API in package-level constants and vars: sentinel errors
(`ErrNotFound`), bitflag/enum-like const blocks (`ErrorTypePrivate`), MIME and header constants (`MIMEJSON`),
size limits, default bodies. A `what` that cannot see them answers "nothing" for a large fraction of the
questions a Go developer would actually ask it.

Contrast: C#/Java/Python round-1 repos mostly express these as enum members or class fields, which grain DOES
index (`enum` values are a first-class value kind — see `core.mjs`'s enum branch in the value scan).

## Suspected area

`extractScopes` / the value scan in `core.mjs`. Two candidate mechanisms, establish which before fixing:
1. Go's `const_declaration`/`var_declaration` node types never produce a scope (no `name`+`body` shape, so
   `bindingFor`'s scope detection skips them) — so nothing is declared for `what` to find.
2. The value scan's enum branch (`ENUM_LIKE_RE`) does not match Go's const-block node types, so grouped constants
   are not captured as values either.

Both may be true simultaneously — one blinds `defined:`, the other blinds `values:`. Diagnose both paths.

## Constraint

"kod to kod": any fix must derive from the grammar's own `node-types.json`, never a hardcoded list of Go node
names. Note `bindingFor` already builds its sets from node-type metadata — extend that machinery rather than
special-casing a language. If Go's const/var genuinely cannot be recognised structurally without naming Go, say
so explicitly and propose the honest alternative.

## Acceptance

`what <a real package-level const>` on a Go fixture names its declaration site. A grouped `const ( ... )` block's
members are individually findable. Non-Go languages' behavior is byte-identical (regression test).

---

## Not fixed by 018 Phase 1 — measured, and the reason is precise

018's Phase 1 (honest-negative answer shape) closed 011 and 018's own shape, but **deliberately does not close
this one**, and the implementer measured why on real gin:

`errors.go` / `context.go` / `gin.go` all contain real functions alongside their `const`/`var` blocks, so none of
them is ever a "blind" (zero-scope) file. Phase 1's hedge keys on *whole files that parsed to zero scopes* — the
Rust macro shape. A Go file with 20 working functions and one invisible `const` block looks perfectly healthy to
it.

So 014 is a **narrower, per-declaration gap**: the file is seen, the functions are seen, and one category of
declaration inside it is silently dropped. That needs real extraction work (recognising `const_declaration` /
`var_declaration` as declarations), not a disclosure clause.

The independent cross-check suite's `(d3)`/`(d3-json)` reproduce exactly this shape and **remain red on purpose**
— they are the acceptance test for this ticket. When 014 is fixed they flip green with no test edit.
