# 099 · Cap fileScopes=200 w model.json wiąże największe pliki w rankingu (core.mjs czyta 200 zamiast 326); konsument exportu/modelu nie widzi prawdziwego rozmiaru

**Status:** FIXED — fileScopesTotal added (sparse, per-file true count for truncated files), MODEL_V m24->m25, too-much.mjs reads true count (field -> tree.json fallback -> disclosed stale-cap), two related bugs fixed on sight (size-evidence tree fallback gap, tree.json off-by-one from its own pseudo-scope). New real-fixture test, 9 cases. npm test 2269/2269 pass.
**Found by:** 096 worker, 2026-09-05
**Severity:** medium
**Class:** D

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
