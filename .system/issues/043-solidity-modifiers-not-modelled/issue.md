# 043 · Solidity modifiers are not modelled — a function missing `onlyOwner` passes `check` clean

**Status:** FIXED — landed in fix-040-043 (wave 1): modifier_invocation derived as a decoration from node-types.json (0→140 on OpenZeppelin, onlyOwner learnable); the planted-omission miss moved to 047 (deviant exclusion), which shipped its disclosure at 0.78% fire rate
**Found by:** round 3 field test, Solidity/OpenZeppelin, 2026-09-01
**Severity:** HIGH — the safety-net command silently passes the exact edit it exists to catch

## Symptom

Added `emergencyTransferOwnership` to `Ownable.sol`: body identical to `transferOwnership`, **omitting
`onlyOwner`**.

```
grain check  → nearest «ownership+transfer» (4 members) at 0.67 … no nearby group certifies a convention
grain review → review 1 file · 0 finding(s) … clean
```

A public state-mutating function missing OZ's single most important access-control idiom, sitting next to a
67%-similar structural twin, passes silently.

Confirmed general, not a ranking accident: **0 of 134 learned conventions mention `onlyOwner` / `nonReentrant` /
`onlyRole`** across the whole repository. `grain what onlyOwner` finds the definition but none of the 21 real
call-sites (53 for `nonReentrant`).

## Why this is the important one

Modifiers are Solidity's decorator equivalent. Grain already weights decorators (`dec:`) as one of three heavy
clustering signals and certifies decorator conventions in Java/Python/C#. On the language where the decorator
equivalent carries *security* meaning, it is not modelled at all — so the feature every field test has rated
grain's best ("would genuinely stop an agent mid-commit") is absent exactly where it matters most.

## What to establish

1. Does the Solidity grammar expose a modifier invocation on a function as a distinct node with its own field?
   If yes, this belongs in `bindingFor`'s `b.deco` derivation — the same field-driven route as every other
   decorator. **Do not add `onlyOwner` or any modifier name to the engine**; "kod to kod" forbids it and the
   language's own users define arbitrary modifiers.
2. If the grammar does NOT distinguish them structurally, say so — that is a boundary to record, not a licence
   to pattern-match on a name.
3. Check whether the same gap exists for other languages whose annotation-equivalents aren't `b.deco`-shaped.

## Acceptance

`onlyOwner` is learnable as a convention on OZ, and the planted `emergencyTransferOwnership` is flagged; or a
recorded, measured explanation of why the grammar makes that impossible. Test over a Solidity fixture.
