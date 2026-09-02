
## 2026-09-02 03:36 — Same family as 051/066: a published JSON surface strictly poorer than its text twin, silent about it. Additive only (published interface): add modules, edges, layers, cycles, and the coverage note to report --json; extend cross-check-report-rules/json parity to assert it. No engine change.

## 2026-09-02 04:29 — report --json now carries modules/edges/layers/cycles/relCoverage (additive, no field/version change); extended cross-check-json-text.test.mjs with a chain+cycle+truncation+uncovered-grammar fixture proving parity with report/map text; suite 2079->2080, 0 fail; commit f6633d7 on fix/072
