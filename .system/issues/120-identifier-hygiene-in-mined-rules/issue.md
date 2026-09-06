# 120 · klasy problemów miningu z 109: typ węzła parsera jako identyfikator (call_expression), parametr generyczny jako typ domenowy (S, V), reguła zmierzona w jednym klastrze ról a egzekwowana na całym katalogu, typ bez niczego przypiętego nie zobowiązuje do niczego

**Status:** FIXED — Render-side identifier-hygiene guard landed in engine/propose.mjs buildAspects (+ propose() for class 4): parser-node-type-as-identifier and generic-type-parameter-as-domain-type dropped as not-a-rule with per-reason disclosure; sub-gate role-cluster scope narrowed to an exact explicit file list or shared content: predicate, or the row stays draft forever (cluster-narrower-than-scope) with no check rendered; a type with no aspect and no relation is now named under PROPOSAL.md's 'Types with no law'. Docs (docs/reference.md, commands/propose.md) and a new real-fixture + buildAspects-unit test file updated. Full suite 2395/2395 (baseline 2387 + 8 new). Measured on Yggdrasil/express/petclinic/grain: 287 rows dropped total, yg check loads 3/4 clean (express/petclinic/grain PASS); Yggdrasil's own check surfaces real mapping-path warnings traced to the test harness overlaying the proposal onto Yggdrasil's own self-hosted .yggdrasil/ content, not to this change. Extractor-side improvement for class 2 (exact declared-type-parameter facts) logged as a finding for after ticket 117.
**Found by:** 109 worker, 2026-09-05
**Severity:** medium
**Class:** D

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
