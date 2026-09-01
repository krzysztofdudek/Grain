# 016 · Go: clustering finds test scaffolding instead of the real API — a language-fit finding, not a defect

**Status:** MEASURED, patch APPROVED and QUEUED (third of three extraction changes into core.mjs; single EXTR_V g31 applied by orchestrator at the end)

**Answers:** (1) `featW` is NOT the cause — leave at 3x. (2) The receiver signal is real; receiver-only lands. (3) Disclosing all-test answers is DEAD — measured unreachable.
**Found by:** round 2, Go/gin, 2026-09-01
**Severity:** medium — the tool works but answers the wrong question on this language

## Observations (gin, 2007 commits, 68 groups / 37 conventions)

- `where "context"` — arguably THE central query for this codebase — returns only three `*_test.go` groups (all
  characterised as "calls CreateTestContext, takes testing.T") and never the actual `Context` struct/API in
  `context.go`.
- `where "add a new middleware"` matched lexically against `TestAddRoute`/`addRoute`, missing the real answer
  (a new `HandlerFunc` file at repo root, the `logger.go`/`recovery.go` pattern).
- `report`'s structural-twin suggestions were judged **~90% noise**: dozens of pairs like
  `«context+render+test» ≈ «binding+test»` whose only shared trait is "calls a test helper, takes `testing.T`".

## Diagnosis (hypothesis — needs confirming)

Grain's role clustering weights `dec:` (decorators), `sup:` (supertypes) and `ret:` (return types) at 3× — see
`featW` in `core.mjs`. Go has **no decorators and no inheritance**, so two of the three heavy signals are always
empty; clustering falls back to name tokens and return types. In a repo where a large share of functions take
`testing.T` and call a shared helper, that becomes the dominant structure grain can see — so it clusters the test
suite, confidently, and the production API disappears into undifferentiated singletons.

This is consistent with issue 003's finding that role facts are frequently marker tautologies: with no markers,
Go produces either tautologies on test scaffolding or nothing.

## What this issue is NOT

Not a request to add Go-specific heuristics ("kod to kod" forbids it), and not a claim the tool is broken — the
check/review/hook path was rated the standout on this same repo ("precise, actionable, would genuinely stop an
agent mid-commit"). The convention-enforcement half works; the discovery half (`where`/twins) does not.

## What to establish

1. Is the 3× weighting on `dec:`/`sup:`/`ret:` (`featW`) actually the cause? Measure: what do gin's groups look
   like with those weights flattened to 1×? Does the production API surface?
2. Is there a structural signal Go DOES offer that grain currently ignores — receiver type (`func (c *Context)`)
   is the obvious candidate, and is a real structural fact, not a name. Does grouping by receiver produce
   meaningful Go groups? This would be a general "methods grouped by their receiver/self type" notion, not a Go
   special case — check whether it also holds for Rust `impl` blocks (see round-2 axum report) and Python classes.
3. Should `where` disclose when a query's best matches are all test-file groups? (Cheap, honest, no model change —
   the same disclosure pattern as 004/007/013.)

Do NOT change clustering weights without a measured before/after across ≥3 repos of different languages — that
is a change to the heart of the model, with the same blast radius as 008.

## Acceptance

A written analysis with numbers answering (1) and (2), and a decision recorded here. Code change only if the
analysis justifies one.
