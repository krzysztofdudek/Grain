
## 2026-09-01 23:45 — Spec = question-catalog.md §6.3. model.edges has the list (180 file edges on CleanArchitecture); what --json returns usedBy:{files:15} — return the list, truncated with a count. This is half of the blast-radius answer; 063 is the other half.

## 2026-09-02 01:35 — fixed: what --json usedBy now returns {files:[names, capped 12], total:N} instead of {files:count}; text output shows names + '+N more'; 4 new tests (small/large fan-in, JSON+text) + 2 existing tests updated; suite 1984 tests, 1982 pass, 2 pre-existing todo (046/053), 0 fail; commit ebaab9a on fix/064
