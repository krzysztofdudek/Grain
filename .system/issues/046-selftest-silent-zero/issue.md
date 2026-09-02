# 046 · `selftest` reports `0/0/0/0` on a repo with 7 certified conventions — a pass-shaped answer

**Status:** FIXED — harness bug: mutateTest filtered non-plantable pid kinds before the unsupported counter; now counted, no unexplained 0/0/0/0
reporter went idle before the follow-up could be answered. Verify before designing anything.
**Found by:** round 3 field test, Lua/telescope.nvim, 2026-09-01
**Severity:** medium — but on a trust surface, which raises it

## Observation (unconfirmed)

`grain selftest` (the plant/catch harness — not `--how`, not `--where`) returned **0/0/0/0** on telescope.nvim,
on a model carrying **7 certified conventions**. The reporter characterised it as "an empty case list, no
synthetic deviation could be planted anywhere".

For calibration, the same round's Solidity/OpenZeppelin run reported:
`11/12 planted deviations caught · 0 false fires · 33 unsupported`
— so the harness does maintain an "unsupported" accounting category.

## Why it matters more than the severity suggests

`selftest` is one of only two checks `docs/validation.md` invites a **user** to run unmodified against their own
repository. That makes it a trust surface: its output is read as evidence about grain, by someone with no way to
audit it. A bare `0/0/0/0` is pass-shaped — it reads as either "nothing to test" or "perfect score", and it is
neither.

## The two readings, which are different defects

1. **Empty by construction** — the harness needs a conforming exemplar with a mutable predicate, and this repo's
   7 conventions are all of a kind it cannot plant into. Then the defect is that the zeros **do not say so**, and
   the fix is disclosure, in the register of `relCoverageNote`/`CYCLE_GRANULARITY_NOTE`.
2. **Silent failure to plant** — it tried and produced nothing. Then it is a bug in the harness.

## First question to answer, before anything else

**Did the telescope run report 0 `unsupported` as well as 0 planted?** If the 7 conventions vanish from the
accounting entirely rather than landing in `unsupported`, that points at (2) and is the more serious reading.
If they appear as `unsupported`, this is (1) and is a disclosure ticket.

Reproduce first: index telescope.nvim and run `grain selftest`. The clone used was under this session's
scratchpad. **Do not design a fix before the accounting question is answered** — the two readings need opposite
work.

## Acceptance

Either `selftest` discloses why it planted nothing, or the planting failure is fixed. A repository with certified
conventions must never receive an unexplained `0/0/0/0`. Test covering the disclosure or the fix, whichever the
diagnosis warrants.
