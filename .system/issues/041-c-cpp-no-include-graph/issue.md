# 041 · C/C++ has no dependency graph — and the coverage disclosure actively certifies that absence as real

**Status:** FIXED — relCoverageNote no longer certifies c/cpp as covered when resolver is include-only; relPathOnly(g) structural check in relations.mjs, no other REL_LANGS affected
**Found by:** round 3 field test, C++/google/leveldb, 2026-09-01
**Severity:** HIGH — a false assurance, not merely a gap

## Symptom (reproduced by me)

```
grain report  →  == architecture — 9 modules · 0 directed dependencies · 0 cycle(s) ==
                   resolution does not cover 1 file (yaml) — conventions layer only for those
```

134 files, 447 commits, index 16s. Every `where`/`how`/`check` line reads `(layer 0) · used by 0 modules`.

## The real defect is the second line, not the first

C++ expresses dependencies through `#include`, and those edges are not computed — that alone would be an honest
gap. But `relCoverageNote` **fires and names one YAML file**, while saying nothing about the 133 C++ files whose
dependencies are equally uncomputed.

A reader parses that as: *coverage is complete except for one YAML file, therefore `0 directed dependencies` is a
fact about leveldb.* It is a fact about grain. The disclosure converts an absence into a certified absence —
strictly worse than printing nothing, because it forecloses the doubt a bare `0` would have invited.

Compare Solidity, where the same note reads correctly:
`resolution does not cover 462 files (bash, json, solidity, toml, yaml)`.
So the mechanism works; C/C++ are counted as *covered* while yielding no edges.

**This is the disclosure register's own invariant failing**: `relCoverageNote` exists so grain can say what it
cannot see. Here it says the opposite.

## What to establish

1. Why are c/cpp counted as covered by `relCoverageNote` when they produce no edges? Is the note keyed on
   "grammar present" rather than "resolver present"? That distinction is the likely bug and it is general — any
   language with a grammar but no import resolver would be mis-certified the same way. **Check which other
   shipped languages are in that state; this may be broader than C++.**
2. Only then: is `#include` resolution feasible without a build system? A quoted `#include "db/db_impl.h"` is
   repo-relative and looks resolvable; angle-bracket includes are toolchain paths and are probably out of reach.
   Say so explicitly rather than half-implementing.

## Acceptance

**Floor (required):** the coverage note tells the truth on C++ — either by counting c/cpp among the uncovered, or
by distinguishing "no grammar" from "no dependency resolver" in what it says. A repo with zero computable edges
must never read as a repo with zero dependencies. Test asserting the note names the languages whose edges are
uncomputed, on a fixture with a grammar-but-no-resolver language.

**Optional, separately justified:** actual `#include` resolution for quoted includes.
