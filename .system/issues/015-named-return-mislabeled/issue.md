# 015 · A named return's IDENTIFIER is recorded as the return TYPE

**Status:** FIXED (verified independently by orchestrator; EXTR_V bumped g26→g27)
**Found by:** round 2, Go/gin, 2026-09-01 (grain 0.3.0, extractor g26)
**Severity:** medium-high — produces a bogus certified convention, i.e. grain states something false

## Symptom

`export` and `where` report gin methods as declaring **"a return type of `err`"**. Real signature
(`gin.go`): `func (engine *Engine) Run(addr ...string) (err error)`.

`err` is the *name* of the named return value; `error` is its type. Grain is reading the identifier and recording
it as `auto.returns:err`, producing a bogus convention that sits alongside the correct "returns error" one.

Reported as likely affecting most of gin's idiomatic named-return functions — Go uses this form widely, and other
languages have analogues worth checking.

## Why this is worse than a cosmetic slip

This is not silence or a missing feature — it is grain **certifying a fact that is not true about the code**. The
whole product rests on "every claim carries its evidence and the evidence is real". A convention named after a
variable rather than a type is exactly the class of error the truth audits (docs/validation.md) exist to catch.

It may also inflate the candidate universe: two functions returning `(err error)` and `(e error)` would look like
two different return conventions rather than one.

## Suspected area

`extractScopes`'s return-type extraction in `core.mjs` (the `rets`/`auto.returns:` path). Go's
`method_declaration`/`function_declaration` puts named results in a `parameter_list` result node where each entry
has BOTH a name and a type; the extractor appears to be taking the first identifier it finds rather than the type
field.

Check whether the same bug reaches other languages with named/tuple returns before deciding the fix's shape.

## Constraint

"kod to kod" — derive from `node-types.json` field metadata (a result parameter's `type` field), never a Go-
specific node-name list.

## Acceptance

A Go fixture with `func f() (err error)` records `error`, not `err`. A plain `func f() error` is unchanged. Two
functions with differently-NAMED but identically-TYPED returns produce ONE convention, not two. Other languages
byte-identical (regression test).
