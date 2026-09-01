# 022 · `STRUCT_PID`'s `ret` alternative lacks a word boundary and swallows `auto.returns:`

**Status:** FIXED (verified independently; MODEL_V m21→m22)
**Found by:** fix-015-019 agent, 2026-09-01 (flagged, not touched)
**Severity:** unknown until confirmed — potentially "a whole fact family can never certify repo-wide"

## Symptom (as reported, NOT yet independently confirmed)

`STRUCT_PID`'s `ret` alternative reportedly has no word boundary, so it matches `auto.returns:` as a prefix — with
the consequence that `mine()` can never certify a repo-wide (`_all:`) `auto.returns:` fact; only local group/
directory contrasts would survive.

The reporting agent noted `where`/`export`'s marker path appears to read `s.rets` directly and so is probably
unaffected — but did not verify that, and did not touch anything.

## Why this needs confirming before fixing

If true, this is significant: it would mean an entire fact family is structurally barred from the strongest
population, and any repo-wide "methods here return X" convention has been silently unreachable. That is the same
class as 015 (a fact family quietly broken) but with wider blast radius.

If false — or if `STRUCT_PID`'s behavior here is deliberate (there may be a real reason return-type facts are
treated as structural and routed away from `_all`) — then this is a comment-clarity issue, not a bug.

**Do not "fix" the regex before establishing which.** Read `STRUCT_PID`'s definition and every use site, and
determine what the intended semantics are. `git log`/blame on that line may name the original reason.

## Interaction with 021

If 021 is fixed (C# starts producing `rets`), any defect here gets wider immediately. Sequence the two
deliberately: confirm 022's semantics first, since it determines whether 021's new data can certify anything.

## Acceptance

A written determination of what `STRUCT_PID` is meant to do for `auto.returns:`, with anchors — then either a
fix with a test proving a repo-wide return-type fact can certify, or a documented note that routing it away from
`_all` is intended, with the reason.
