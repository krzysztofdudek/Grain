# 038 · Module granularity conflates test and production source sets, so a test-only dependency reads as a production architecture cycle

**Status:** FIXED (verified independently) — option 3 shipped: CYCLE_GRANULARITY_NOTE discloses that modules are directory buckets, not build-declared source sets. Fires on every reported cycle in both report() and rules; no name-based test detection added.
**Found by:** round 4, Kotlin/okhttp, 2026-09-01
**Severity:** medium — the data is accurate; the conclusion a reader draws from it is not

## Symptom

`grain report` on okhttp reports a **9-module `cycle (strongly connected)`** including `okhttp/src` and
`okhttp-testing-support/src`.

Spot-checked by the tester: the edges backing that cycle come from Kotlin Multiplatform's **`jvmTest` source set**
importing test-support helpers (`okhttp/src/jvmTest/kotlin/okhttp3/JSSETest.kt` and similar) — **not from
production code** (`commonJvmAndroid`).

So the cycle is real at the granularity grain chose (top-level `src/` folders), and entirely an artefact of that
choice: a multiplatform project's test and production source sets live under one `src/`, so "module A depends on
module B" silently merges "A's tests depend on B" with "A depends on B".

## Why it matters

A reported architecture cycle is one of the strongest claims grain makes — it is the sort of thing a maintainer
acts on, or feels bad about. "Your production modules are circularly dependent" and "your tests use a shared test
helper" are completely different statements, and the second is normal, healthy design.

This is the same family as most of this register: the number is true, the sentence a reader forms from it is not.

## Not okhttp-specific

Any layout where one directory holds multiple source sets is exposed:
- Kotlin Multiplatform (`src/commonMain`, `src/jvmMain`, `src/jvmTest`, …)
- Gradle multi-sourceSet Java projects
- anything with `src/main` + `src/test` under a module root, which is most of the JVM world

Note grain deliberately has **no name-based test detection** ("kod to kod", `config.mjs`'s DESIGN RULING) — so any
fix must derive the distinction structurally, not by matching `test` in a path. That ruling is explicit that the
measured cost of removing name-based test detection was accepted, so this is a known trade-off resurfacing rather
than an oversight; the question is whether the *cycle claim specifically* deserves an exception or a caveat.

## Options, none obviously right

1. **Refine module granularity** for multi-source-set layouts (derived from build manifests — `build.gradle.kts`
   source-set declarations, `Cargo.toml`, etc., the same way Cargo workspace support was just added in 017).
   Most correct, most work, and manifest-shape-dependent.
2. **Caveat the cycle claim** when the participating edges all originate in a subtree that the module's own other
   files do not import — a structural "these edges look one-directional in practice" signal, no name matching.
   Cheaper; needs care not to become a heuristic in disguise.
3. **Disclose the granularity**: state what a "module" was taken to be when reporting a cycle, so the reader can
   judge. Cheapest, purely honest, consistent with the disclosure work throughout this release
   (`relCoverageNote`, `intraModuleNote`, `DIRTY_TREE_NOTE`).

Option 3 is the honest minimum and should ship regardless of whether 1 or 2 is ever attempted.

## Acceptance

A multi-source-set fixture where only the test source set creates the back-edge: either the cycle is not claimed,
or the report says plainly at what granularity modules were derived so the claim can be judged. A genuine
production cycle is still reported unchanged (regression).

## Recorded positives from the same run — do not regress these

- Mixed Kotlin+Java did **not** get split into separate partitions ("1 partition(s)") — correct.
- `report`'s `health` section flagged two structurally-identical `@Test` methods as probable duplicates **with a
  ready-to-run `grain decide steer` command** — rated "genuinely actionable".
- `export --compact`: valid JSON, `conventions.length === 41` matching the printed summary exactly, schema
  matching docs.
- `explain` is correct but "the least approachable of any command"; `check`'s narrative style communicates the
  same class of fact far more legibly. A UX gap between two commands, not a defect — worth remembering if anyone
  reworks `explain`'s rendering.
