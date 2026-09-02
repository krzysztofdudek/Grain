# 087 · report takes 38.6 min / 5.2 GB RSS on Symfony full history (82,946 commits) — ~5,600× the 1-commit cost; cold build 31.7 min

**Status:** RESOLVED — ticket premise disproven by profiling: report is 0.46s warm, not 38.6min (the number was a corrupted-cache full-rebuild artifact from instr/F-2's own timeout). Real bottleneck found and fixed: BlobCache shard-eviction thrashing, shard width 2->3 hex, cold build 33.1->24.1 min (-27.2%), byte-identical model output. fpsCap-walk-capping left as a director decision (needs HIST_V + class-D disclosure design).
**Found by:** instr/F-2 scale ladder (baseline-2026-09-02), 2026-09-02
**Severity:** high
**Class:** F

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
