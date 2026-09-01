# 017 · Cargo workspace: cross-crate `use` never resolves, so the architecture graph misses the actual coupling

**Status:** FIXED (verified independently; MODEL_V m21→m22)
**Found by:** round 2, Rust/axum, 2026-09-01
**Severity:** medium-high — the dependency graph is empty precisely where a workspace's real structure lives

## Symptom

axum is a Cargo workspace (axum, axum-core, axum-extra, axum-macros + examples). grain **partitions it correctly**
— 6 packages, sensibly split, not flattened. But:

```
architecture — 11 modules · 0 directed dependencies · 0 cycle(s)
278 file-level edges resolved, none crossing a module boundary
```

Reality, counted by the tester: **33 files in `axum/src` do `use axum_core::...`; 25 files in `axum-extra/src` do
`use axum::...`.** Heavy, real cross-crate coupling that the resolver never sees — the 278 resolved edges are all
intra-crate.

## Relationship to 004 — same symptom, different cause, do not conflate

004 fixed a *disclosure* gap where real edges existed but folded away because one module swallowed the repo. That
fix is working here: the "278 file-level edges resolved, none crossing a module boundary" line IS the 004
disclosure doing its job.

But here the underlying claim is *wrong*, not just unexplained: edges that SHOULD cross a boundary are never
resolved in the first place. A `use axum_core::extract::Request` in `axum/src` should produce an edge into the
`axum-core` crate's files. Fixing 017 means the 004 line correctly stops appearing on this repo.

## Suspected area

`relations.mjs`'s Rust import resolution. A crate-name-qualified path (`use axum_core::...`) has to be mapped to
the workspace member whose `Cargo.toml` declares `name = "axum_core"` (note the `-`/`_` normalisation:
directory `axum-core`, crate name `axum_core`). grain already reads workspace metadata for other ecosystems
(`model.workspaces` exists, and `pkgs`/`refineModOf` use it) — check whether Cargo workspaces populate it at all,
and whether the Rust resolver consults it.

Establish first: does grain parse `Cargo.toml` `[workspace] members` today? If not, that is the gap, and it is
the same shape as the npm-workspace support that already exists rather than a new mechanism.

## Constraint

"kod to kod" — no hardcoded crate names. The mapping must come from the workspace manifests themselves.

## Acceptance

A two-crate Cargo-workspace fixture where crate A does `use crate_b::thing`: the edge appears in `model.edges` and
crosses a module boundary in `moduleGraph`. The 004 intra-module disclosure correctly does NOT fire for it. npm
workspace behavior byte-identical (regression).
