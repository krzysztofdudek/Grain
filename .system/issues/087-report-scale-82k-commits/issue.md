# 087 · report takes 38.6 min / 5.2 GB RSS on Symfony full history (82,946 commits) — ~5,600× the 1-commit cost; cold build 31.7 min

**Status:** MEASURED — Premise disproven and cost attributed: report is 0.46 s on a warm store, not 38.6 min; learn()'s derived tables are 3.58% of the cold build, parseBlobs is 76.14%. A memory-safe fix for the one real super-linearity (BlobCache shard width 2->3) is on research/087: cold build 1986.6 s -> 1446.2 s (-27.2%), model byte-identical, suite 2166/0. Left for a director ruling: whether to cap the WALK at fpsCap (-45% blobs, measured) given it truncates history and needs disclosure + a HIST_V bump.
**Found by:** instr/F-2 scale ladder (baseline-2026-09-02), 2026-09-02
**Severity:** high
**Class:** F

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
