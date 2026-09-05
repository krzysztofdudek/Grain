# 113 · propose na spring-petclinic: 0 relacji, 0 cykli mimo 10 rozwiązanych importów i 35 relacji w ręcznej wyroczni — mapowanie importów Java na węzły ginie; raport ma mówić 'brak prawa o zależnościach', nie '0 relations'

**Status:** FIXED — Java relations: recall against the petclinic hand oracle 4/35=.114 -> 29/35=.829, precision 1.000 -> .725 (every one of the 11 'extra' pairs is real code the oracle chose not to declare). All three stages fixed: source roots for resolution and for the module cut, same-package simple names, and static-call receivers. Report says where the dependencies were lost instead of '0 relations'. VERSIONS NOT BUMPED, director's call: EXTR_V g32->g33 and MODEL_V m25->m26 are both required — measured, an existing .grain cache reproduces the OLD numbers exactly.
**Found by:** 112 worker, 2026-09-05
**Severity:** high
**Class:** D

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
