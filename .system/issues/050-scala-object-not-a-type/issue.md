# 050 · A bodiless Scala `object` is classified as kind `method` — companion objects holding only vals are invisible as types

**Status:** FIXED — TYPE_LIKE_RE widened to bare word object (gated by isScope), derived not per-language; 23-grammar regression test added; 5 more pre-existing gaps found and split into ticket 076
**Found by:** round 4 field test, Scala/playframework, 2026-09-01
**Severity:** medium

## Symptom

```
object DummyPlaceHolder                       → what --json gives "kind": "method"
object ExecCtxUtils extends ExecCtxUtils       → "kind": "method"   (companion, bodiless)
class  ExecCtxUtils                            → "kind": "type"     (correct)
```

## Root cause — confirmed

`TYPE_LIKE_RE` (`core.mjs` ~222) carries `object_declaration` — **Kotlin's** node name — and not
`object_definition`, which is **Scala's**. Verified in the source: `object_declaration` appears once,
`object_definition` zero times.

So a Scala `object` reaches kind `type` only through the "has a child scope" fallback. Any companion object
holding just vals or constants has no child scope and is therefore never a type.

## Why it matters

Companion objects are where Scala puts constants, factories and implicits. Classifying them as methods makes
them unfindable as types and mis-clusters them against real methods. It also directly answers a question this
round asked: a companion object is not treated as a duplicate or twin of its class — frequently it is not seen
as a type at all.

## Constraint — the fix is not "add the string"

Adding `object_definition` to a regex is a name list by another route, and the near-miss with Kotlin's
`object_declaration` is evidence that this vocabulary is already being maintained by hand per language. Prefer a
derivation from `node-types.json` — a node that declares a body of scope-shaped children, or whatever
field-driven property actually distinguishes a type — in the style of `bindingFor`'s other predicates.

If a derivation is genuinely unreachable, adding the token is acceptable **only** with an explicit note saying
why, and with a test that enumerates every shipped grammar's type-shaped node so the next gap is caught by the
suite rather than by a field test.

## Acceptance

A bodiless Scala `object` is kind `type`. A test covering all 23 grammars' type-like node coverage, so this class
of omission cannot recur silently.
