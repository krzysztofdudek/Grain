# 102 · propose.mjs: skutki orzeczeń 101 — proza DRAFT domyślnie, file-scope approximation flag + DRAFT przy FA>0 w drillu, no-catch DRAFT, usunięcie MIN_TYPE_FILES, docs 'The proposal contract'

**Status:** FIXED — propose.mjs implements all four 101 rulings: prose stays draft always; deterministic checks are judged by a real yg drill against a throwaway copy of the just-rendered proposal (0 FA + >=1 catch -> enforced; FA>0 -> draft/file-scope-approximation-fa; 0 catches -> draft/no-catch); scopeApproximation:file-from-symbol recorded in provenance.json for symbol-level conventions; MIN_TYPE_FILES/--min-type-files removed entirely (proven not load-bearing, behavior unchanged). docs/reference.md documents the contract. New no-nul-bytes.test.mjs guard added (ticket 103). One unrelated NUL-byte bug found and fixed on sight in _unit-harness.mjs. Full suite 2263/2263 green.
**Found by:** director, odbiór 101, 2026-09-05
**Severity:** medium
**Class:** D

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
