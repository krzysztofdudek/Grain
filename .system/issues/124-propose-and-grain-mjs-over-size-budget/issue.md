# 124 · Po 117: engine/propose.mjs (247k) i engine/grain.mjs (159k) nadal ponad budżet 50k z wyroczni Graina (file-size-budget 2 odmowy); podział czystym przeniesieniem tą samą metodą co 117 (bramka bajt-w-bajt, test budżetu w CI traci wyjątki)

**Status:** FIXED — propose.mjs 265284 -> 6974 (facade over 16 modules) and grain.mjs 160272 -> 40750 (dispatcher alone, 9 modules), pure moves in six staged commits. Every first-party engine module now inside the 50000 reviewer budget; the budget test's exception list is empty and a test keeps it empty. Byte-identity gate 2474/2474 artefacts at every stage; npm test 2399/2399. Oracle updated (prefix predicates, ownership-sized mappings, dated README note): file-size-budget refusals 2 -> 0, no type-strict-orphan, no prompt-too-large, no new blocking code.
**Found by:** 117 worker, 2026-09-06
**Severity:** medium
**Class:** D

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
