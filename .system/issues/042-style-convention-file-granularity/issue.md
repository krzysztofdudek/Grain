# 042 · A style convention is scored per FILE, not per literal — 7 violations in a 100%-conforming file flag nothing

**Status:** OPEN — reported with an exact repro; not yet reproduced by the orchestrator
**Found by:** round 3 field test, Lua/telescope.nvim, 2026-09-01
**Severity:** medium — `check` silently passes the exact edit it exists to catch

## Symptom

The model certifies a convention of the form "quote strings with double quotes". The reporter edited
`lua/telescope/make_entry.lua` (a file at 100% double quotes) adding a function using **7 single-quoted string
literals**, then:

```
grain check lua/telescope/make_entry.lua --json
  → that convention still reports "conforming":1, "share":1 — zero flags
```

The convention appears to be evaluated as a **file-granularity majority vote** (does this file predominantly use
double quotes?) rather than per literal. Seven new violations do not move a majority in a large file, so the
file stays "conforming" and `check` says nothing.

## Why it matters

`check` is the command this project's field tests rate highest ("would genuinely stop an agent mid-commit"), and
this is the single most common kind of style convention a reader would expect it to enforce. A convention that
can be violated repeatedly inside a passing file is worse than one that was never certified: it earns trust it
does not keep.

## What to establish before changing anything

1. **Confirm the granularity.** Is the predicate genuinely file-level (a per-file ratio), or per-literal but
   diluted by the file's existing conforming literals? These need different fixes.
2. **Is this general or Lua-specific?** The same question applies to any ratio-shaped predicate in other
   languages. Check at least one other language before assuming scope.
3. **Cost of a per-literal predicate.** Moving to per-literal multiplies the candidate population, which changes
   `idxCost` — the universe must still be counted ONCE repo-wide, and a widened universe is never split into
   separately-taxed sub-universes. Any change here touches acceptance, so it needs the same evidentiary bar as
   §008: measure churn in both directions before shipping.

**Do not** simply lower a threshold to make the file fail — the constitution collapsed six tuned thresholds into
one loss constant, and a new one needs explicit justification.

## Acceptance

Either the reported edit is flagged, or a measured explanation of why file-granularity is the correct reading of
this convention and what `check` should say instead so the reader is not misled. Recorded here either way.
