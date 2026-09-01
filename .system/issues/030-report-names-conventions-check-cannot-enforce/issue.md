# 030 · `report` names an established convention that `check`/`review`/hooks cannot enforce

**Status:** FIXED (verified independently; EXTR_V g29→g30 for 033)
**Found by:** round 3, Ruby/sinatra, 2026-09-01
**Severity:** HIGH — "the single worst finding" per the tester, and it is a cross-surface contradiction of the
kind the cross-check suite exists to catch, in a pair the suite does not currently cover

## Symptom

`grain report` on sinatra surfaces, as an established fact:

> 8 one-line HTTP-verb methods (`get`/`post`/…/`unlink`) in `base.rb`, "one slot per-instance (8/8)", held
> since 2008

The tester added a 9th (`trace`) that breaks that exact shape — a multi-line body with side effects (`puts`,
`logger.info`) instead of the established one-liner — staged it, and ran **all four** enforcement surfaces:
`check lib/sinatra/base.rb`, `review`, `check --staged`, and `commit-hook`/`check-hook`.

**All four reported "0 deviations", "clean".**

So grain's own report names a pattern as established practice, and the surfaces a developer actually meets
mid-edit and at commit are structurally unable to act on it.

## Suspected mechanism — confirm before designing

`report`'s "template" lines come from `mineTemplates`/`profileOf` (structural superposition templates,
`core.mjs`). `check`'s deviations come from `part.facts` (mined predicate cells). **Templates are not facts** —
they are a render-only concept, so a template-shaped departure has no cell to fail.

J5.8 added a partial bridge: `part.profiles[r].req` (literal-signature occurrence counts) plus a shape-deviation
pass in `checkFile`. But `req` only fires when a scope is **missing** a signature every member carries. The
sinatra case is the opposite — the new method *adds* statements without removing any required one, so no `req`
entry is short and nothing fires. That asymmetry is probably correct in isolation (extra code is not automatically
a violation) but it means "this group's members are all one-liners" is unenforceable by construction.

## Why this matters more than a single missed deviation

It is a **trust asymmetry**: `report` is the surface that convinces a maintainer the tool understands their
codebase; `check` is the surface that acts. A convention visible in one and invisible in the other means the
tool's demonstrated understanding overstates its actual enforcement. A reader who sees the 8/8 template in
`report` will reasonably assume `check` guards it.

## Options — needs a decision, not a reflexive fix

1. **Make it enforceable**: extend the shape pass to cover "this group's members are uniformly SMALL/simple" (a
   size or statement-count property), not only "missing a required signature". Risks a new tuned threshold —
   which the constitution (`config.mjs`'s CFG comment) collapsed six of on purpose. Any proposal must derive the
   bound from codelength or reuse an existing constant, or argue explicitly why an exception is warranted.
2. **Make the asymmetry honest**: mark template lines in `report`/`rules` as descriptive-not-enforced, so a reader
   knows which of grain's claims have teeth. Cheap, no new machinery, in the same register as the coverage
   disclosures already shipped (`relCoverageNote`, `intraModuleNote`, `DIRTY_TREE_NOTE`).
3. Both.

Option 2 is the honest minimum and should ship regardless of whether 1 is attempted.

## Cross-check gap this exposes

`cross-check-agreement.test.mjs` covers `check` ⇄ `spectrum`/`explain`. It does NOT cover `report`'s template
claims ⇄ `check`'s enforcement. Whatever is decided, that pair deserves an invariant: **every convention `report`
presents as established is either enforceable by `check` or visibly marked as not.**

## Acceptance

A fixture with a certified template: either `check` flags a member breaking it, or `report` marks that line as
descriptive. Plus the cross-check invariant above, so the next render-only concept cannot silently join the same
gap.
