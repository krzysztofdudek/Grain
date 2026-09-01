# 032 · `what <external type>` silently undercounts real usage 4–8× while looking like a complete answer

**Status:** FIXED — structural reference lookup + honest fallback disclosure; MODEL_V m22→m23; verified independently
**Found by:** round 3, PHP/Slim, 2026-09-01 (grain 0.3.0, extractor g28)
**Severity:** HIGH — "the one that could actively mislead someone", per the tester, and the only misleading case
they found in a repo where every other negative was honest

## Symptom

Measured on Slim (72 src + 53 test files), counts verified by grep:

| query | grain reported | reality |
|---|---|---|
| `what MiddlewareInterface` | 6 hits / "used by: 5 files" | **21 files** |
| `what ResponseInterface` | 1 file | **41 files** |

Worse than the undercount: the hits grain DID return were **incidental camelCase token matches**
(`MiddlewareDispatcherInterface`, test names containing "Interface") — it missed *every actual*
`implements MiddlewareInterface` site: all 6 middleware classes, `App.php`, `Route.php`, `RouteGroup.php`,
`MiddlewareDispatcher.php`.

## Root cause (tester's diagnosis, plausible — confirm before fixing)

`MiddlewareInterface`/`ResponseInterface` are **vendor** types (`psr/*`), never declared in this repo. With no
local declaration to anchor on, `what` falls back to fuzzy name-token search over locally-declared symbols,
instead of indexing `implements` / type-hint *references*.

The locally-declared control behaves correctly: `what RouteInterface` finds 23 files. But even there it blends in
5 unrelated sibling `*Interface` types via the same token overlap — so the noise exists in the good case too, just
masked by a correct core answer.

## Why this is the sharp one

Everything else this tester probed degraded **honestly**: docblock-only generics → "no declarations or values
anywhere"; single-file `composer.json` keys → "seen as a key in 1 file… below the 2-file floor… Seen, not absent"
(the 011 fix working correctly in the field). This case alone *looks complete while being 4–8× wrong*. There is no
caveat that the answer came from name-token search rather than reference search.

Note the structural information exists: grain records `sup:` (supertypes) per scope and `explain` demonstrably
uses it (see 033) — so `implements MiddlewareInterface` IS in the model. `what` simply is not consulting it.

## Two separable fixes

1. **Consult the structural facts.** If `sup:`/type-hint data can answer "which scopes reference this type",
   `what` should use it before falling back to name tokens — external types then work exactly like local ones.
   Establish what is actually reachable at query time from the persisted model before designing.
2. **Disclose the fallback.** When an answer comes from name-token matching rather than a resolved declaration,
   say so — the same register as the honest-negative work already shipped (`018`/`011`). Even with (1), an
   unresolvable name should not be presented as an authoritative count.

(2) is the minimum and should ship regardless. Relates to 031's second half (single-token queries surfacing
incidental token-containers) — same presentation problem, different trigger; keep them distinct but cross-check
the fixes do not fight.

## Acceptance

A fixture with a vendor/undeclared interface implemented by N local classes: `what <that interface>` either
reports all N, or states plainly that it matched by name and may be incomplete. The locally-declared control case
stays correct. Sibling-type noise (`*Interface` blending) is measured before/after so the fix is not judged on
the headline count alone.
