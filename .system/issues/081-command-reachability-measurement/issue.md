# 081 · measure why 11 of 16 commands were never called in 13 runs (obligation 0×) before adding a 17th

**Status:** RESOLVED — measured: 61/63 calls went to a command named in sessionContext, 2 to SKILL-only, 0 to the 12 named nowhere including obligation. Obligation's PreToolUse hook already exists and fires (8/8 in trial data), it just certifies nothing there -- the gate for a 17th command should be its own selftest coverage, not advertisement. Also found the trial harness undercounts real placement-hook activity by missing .grain/cache/*.json. Recommendation escalated for wave planning.
**Found by:** trial-0.4.0 §6, 2026-09-02
**Severity:** high
**Class:** G

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
