
## 2026-09-02 04:02 — Fixed: TYPE_LIKE_RE widened object_declaration -> bare word object (safe, gated by isScope); verified against all 23 grammars, only Kotlin object_declaration/Scala object_definition/package_object match. Added tests/scala-object-type.test.mjs + tests/type-like-coverage.test.mjs (23-grammar regression net). Suite green 2021/2021. Commit 285b46f on fix/050.
