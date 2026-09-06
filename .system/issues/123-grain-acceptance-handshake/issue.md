# 123 · Grain: propose emituje to, co transakcja przyjęcia Yggdrasil konsumuje (manifest propozycji z sha, statusami, existingViolations), i raport 'next' mówi 'yg adopt' zamiast 'mv'; wspólny kontrakt z 121

**Status:** FIXED — Three items landed: propose's next: line now names yg adopt (with a live --dry-run preview printed under it when a Yggdrasil CLI resolves); the Grain oracle's file-size-budget promoted to enforced and max_prompt_chars measured down to 300000 (largest real assembled prompt today is 279770 chars); the 125 type-parameter classifier follow-up landed (exact tparams/own fact replaces the name-shape guess), row-level measurement on Yggdrasil shows 0 disagreements today. Plus one incidental bugfix: two test files' grain() spawns lacked maxBuffer, exposed by the new export field. 4 commits on fix/123-adopt-handshake; 2415/2415 tests pass.
**Found by:** director, 2026-09-06
**Severity:** medium
**Class:** D

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
