# 029 · `session-context` writes to stderr unconditionally; the other five hooks gate it on `GRAIN_DEBUG`

**Status:** FIXED (verified independently)
**Found by:** crosscheck-architect's hook-robustness matrix, 2026-09-01 (observed, deliberately left unticketed
for the orchestrator's call — ticketed here)
**Severity:** low

## Symptom

On a nonexistent cwd, `session-context`'s catch block writes to stderr unconditionally:

```
[grain] session-context failed: no such directory
```

The other five hooks (`check-hook`, `read-hook`, `how-hook`, `commit-hook`, `edit-hook`) all gate their catch-block
stderr behind `if (process.env.GRAIN_DEBUG)`. Exit code and stdout shape stay correct in every case — this is an
inconsistency, not a break, which is why it was observed rather than filed by its finder.

## Why it is still worth fixing

The hooks' shared contract, stated in their own comments, is that a hook never disturbs the host. Five of six take
that to include "say nothing on stderr unless explicitly debugging"; one does not. A host that surfaces hook stderr
(or a user running with a noisy terminal) sees grain complaining during session start, from the one hook that runs
on *every* session — the highest-frequency, most visible path of the six.

Note the asymmetry cuts the other way too: `session-context` is the hook where a genuine misconfiguration is most
worth surfacing, since a broken repo path there silently disables everything downstream. So this is a real
decision, not a mechanical alignment.

## Two defensible resolutions — pick one deliberately

1. **Align with the other five:** gate on `GRAIN_DEBUG`. Consistent, quiet, matches the documented contract.
2. **Keep it loud, and say why in the code:** if session-start failure is judged worth surfacing unconditionally,
   the comment must say so explicitly, so the next reader does not "fix" it into consistency and lose a
   deliberate signal.

Either is fine; silently differing from five siblings with no comment is not.

## Acceptance

Either the stderr is gated and a test pins that all six hooks are stderr-silent without `GRAIN_DEBUG`, or the
divergence is documented in `grain.mjs` at the call site with its reason, and a test pins the intended asymmetry.
The existing `cross-check-hook-robustness.test.mjs` matrix is the natural home for whichever assertion.
