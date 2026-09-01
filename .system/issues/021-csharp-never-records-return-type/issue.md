# 021 · C# never records a return type at all — `rets` is always empty

**Status:** FIXED — derived from node-types.json (b.namedValueSpec / b.retField); EXTR_V g28→g29; verified independently
**Found by:** fix-015-019 agent, 2026-09-01 (reported, deliberately not fixed — out of that issue's scope)
**Severity:** medium — a whole fact family is silently absent for one of the shipped languages

## Symptom

While auditing every grammar's result/return-type field for issue 015, C# was found never to reach the `rets`
extraction path at all: its node-types.json names the field **`returns`**, while `extractScopes` looks for
`result` / `return_type` / `type`. So `s.rets` is always empty for C#, and `auto.returns:` facts can never be
mined from a C# codebase.

This is pre-existing (not introduced by 015's fix) and silent — nothing reports that the family is unavailable.

## Why it matters

Round 1's C#/CleanArchitecture field test rated `check`/`review` the standout. It would have been stronger still:
in an ASP.NET/MediatR codebase, "handlers return `Task<Result<T>>`" is exactly the kind of convention a developer
would want enforced, and grain cannot currently see it.

Note this compounds with 016 (Go's clustering fit): `ret:` is one of the three features weighted 3× in `featW`.
A language where `rets` is always empty loses one of the three heavy clustering signals — so C#'s role groups are
formed on strictly less evidence than the model intends, silently.

## Fix shape

015 introduced `b.paramLike`, derived from each grammar's own node-types.json field metadata. The same derivation
style applies: discover the return/result field name from the grammar rather than from a hardcoded list of three
names. "kod to kod" forbids adding `'returns'` as a fourth hardcoded alternative without deriving it.

Verify the claim first — read C#'s node-types.json and confirm the field is `returns` before designing.

## Acceptance

A C# fixture with `Task<Result<T>> Handle(...)` records the return type in `s.rets`. Every other grammar's `rets`
output is byte-identical (regression). Ideally the fix removes the hardcoded field-name list rather than extending it.
