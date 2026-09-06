# 125 · Drobne po 117/120: engine/learn.mjs 'const st2 = model.steers ? null : null' (martwe, komentarz kłamie); ekstraktor nie zapisuje zadeklarowanych parametrów typu osobno od referencji typu domenowego (120 klasa 2 zgadywana render-side) — fakt z pola type_parameters gramatyki do eksportu

**Status:** FIXED — tparams fact implemented (bindingFor's tparamDecl/tparamContainer + extract.mjs's declaredTypeParams), threaded through serializeScope/tree cache/grain export additively, EXTR_V bumped g33->g34 (MODEL_V untouched — verified tparams never reaches model.json). Dead st2 line removed. 13 new tests across 7 grammars + absence + round-trip, all green (2409/2409 full suite). Measured on Yggdrasil/express/petclinic/grain in scratch copies; exact follow-up edit for propose.mjs's buildAspects logged. Branch fix/125-type-parameter-fact, 2 commits, not pushed.
**Found by:** 117 and 120 workers, 2026-09-06
**Severity:** low
**Class:** D

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
