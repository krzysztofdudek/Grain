# 018 · Macro-generated declarations are invisible, and `what` reports a bare false negative

**Status:** FIXED (verified independently) — Phase 2 shipped: a macro body is re-parsed with the same parser and kept only if the whole region parses cleanly (`hasError` false), so the GRAMMAR decides what is a declaration. No macro named, no threshold. 0 phantom declarations in 866 names over 19,371 invocations; axum +121 scopes, tokio +682, serde/bitflags correctly 0. Needs EXTR_V g30 to g31 (pending, applied by orchestrator).
**Found by:** round 2, Rust/axum, 2026-09-01
**Severity:** HIGH — "the worst finding" per the tester; a silent, confident wrong answer

## Symptom

`axum/src/extract/rejection.rs` defines ~15 important public error types (`JsonDataError`,
`MissingJsonContentType`, …) — used throughout the crate — entirely through macro invocations:

```rust
define_rejection! { pub struct JsonDataError(Error); }
```

grain extracts **0 scopes** from this ~200-line file. Consequently:

```
grain what "JsonDataError"  →  "has no declarations or values anywhere in this repository's code"
```

A developer asking about a real, central, public type gets a flat denial. **No hedge, no "this file yielded no
scopes", no "may be macro-generated."**

## The unifying defect — shared with 014 and 011

Three round-1/round-2 findings are the same failure at heart: **absence of evidence rendered as evidence of
absence.**

- **011** — a value excluded by the df floor: reported as "not found anywhere."
- **014** — Go package-level const/var never extracted: reported as "no declarations anywhere."
- **018** — macro-generated types never extracted: reported as "no declarations anywhere."

In each case grain has the information needed to hedge (it knows the file parsed to zero scopes; it knows the
value was seen but gated) and instead emits its strongest negative claim. Whatever is done about extraction, the
*answer shape* should be fixed once, centrally: `what` must distinguish "I looked and it is not there" from "I
cannot see into this."

That central fix is cheap and languages-agnostic, and would have softened all three findings. **Do it first,
independently of any extraction work.**

## The extraction half (separate, harder, optional)

Recognising idents inside macro invocation bodies is a real feature with real risk: a macro body is not
necessarily the declaration it appears to be, and "kod to kod" forbids special-casing `define_rejection!` or any
named macro. A tree-sitter `macro_invocation` node's token stream can be scanned structurally, but whether the
result is trustworthy is exactly the sort of question that needs measurement, not intuition. The tester's own
minimum bar is the honest one: *"at minimum flag '0 scopes, macro-heavy file' instead of answering `what` with a
bare false negative."*

## Acceptance

**Phase 1 (do this):** a file that parsed but yielded zero scopes is known to `what`, and a query that matches
nothing says so distinguishably from "nothing exists" — e.g. naming the unindexed file(s) it could not see into.
Covers Rust macros, Go const/var (014) and any future extraction gap without naming any language.

**Phase 2 (only with measurement):** extract declaration idents from macro invocation bodies. Requires a
before/after on ≥2 real macro-heavy repos showing the extracted names are real and false positives are near zero.
