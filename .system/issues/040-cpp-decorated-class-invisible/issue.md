# 040 · C++: a class carrying an export/attribute macro is not extracted — leveldb's entire public API is invisible

**Status:** OPEN — verified independently by the orchestrator
**Found by:** round 3 field test, C++/google/leveldb, 2026-09-01
**Severity:** HIGH — same class as 018: a confident, wrong answer about a file whose real content grain cannot see

## Symptom (reproduced by me, not just reported)

Source truth: `include/leveldb/comparator.h:20` is `class LEVELDB_EXPORT Comparator {`.

```
grain what Comparator
  → defined: db/skiplist_test.cc:23–33 `Comparator` (type) · benchmarks/db_bench.cc … `CountComparator` …
    (the real interface at include/leveldb/comparator.h:20 is NOT among the hits)
grain explain include/leveldb/comparator.h  →  "3 scopes"   (a class + ~6 virtual methods)
```

Two distinct triggers, both pervasive in real C++:
1. **Export macro before the class name** — `class LEVELDB_EXPORT Foo {`. Used on Comparator, Env, WriteBatch,
   Status, Table, Cache, FilterPolicy — i.e. leveldb's whole public API.
2. **Trailing attribute macros on methods** — `void CompactMemTable() EXCLUSIVE_LOCKS_REQUIRED(mutex_);`
   (`db/db_impl.h:124`). Standard Clang thread-safety annotation; ubiquitous in Chromium, Abseil, gRPC.

**Template classes are also missed, and this one is independent of macros:**
```
db/skiplist.h:40   template <typename Key, class Comparator>
                   class SkipList {
grain what SkipList → "has no declarations or values anywhere in this repository's code"
grain explain db/skiplist.h → "11 scopes"   (methods ARE extracted; the class itself is not)
```
So this is not "the file fails to parse" — extraction yields scopes and silently drops the declaration.

## Downstream damage

The reporter traced a false *positive* claim from it: `grain what WriteBatch` answers "has no declaration
anywhere in this repository (likely an external/vendor type)" although `db/write_batch.cc:29` defines it. Grain
does not merely stay silent — it asserts an external origin.

## Suspected area

`extractScopes` / `bindingFor`'s scope-name resolution for the C and C++ grammars: the name field of a decorated
or templated class declaration. **Establish first whether the grammar exposes the class name as a field on the
templated/decorated node** — if it does, this is a field-selection bug; if the macro is parsed as part of the
declarator, it is a different problem. Do not add a macro name list; "kod to kod" forbids it, and §018 phase 2
shows the shape of a legitimate answer (ask the grammar, don't pattern-match).

## Acceptance

`what Comparator` names `include/leveldb/comparator.h:20`; `what SkipList` names `db/skiplist.h:40`;
`what WriteBatch` stops claiming an external/vendor origin. Tests over a C++ fixture covering all three triggers
(export macro, trailing attribute macro, template class). No name lists.
