# Work log — 017

## Confirmed: Cargo workspaces were never parsed at all

`findPackageRoots` (core.mjs) already finds every `Cargo.toml` directory via `PKG_ROOT_RE` — this is why grain
already partitions axum into 6 packages correctly (partitioning only needs `pkgs`, a directory list).

But `model.workspaces` — the array the relation layer actually resolves cross-package specifiers through — was
built ONLY from `package.json` (npm/pnpm/yarn): `pkgs.filter(d => d !== '.').map(d => { try { readFileSync(...,
'package.json') ...`. For a pure-Cargo repo this produced `[]`. Confirmed no `Cargo.toml`/`cargo` reference
anywhere in `core.mjs`/`relations.mjs` before this fix (`grep -rn "Cargo.toml\|cargo"` — zero hits outside comments).

Separately, the vendored Rust resolver (`engine/vendor/relations/extractors/rust-resolve.mjs`, generated from
Yggdrasil, "do not edit") can ONLY ever resolve a `use` path back into the CALLING file's own crate — its `deps`
object (`makeRustResolveDeps` in `resolve-path.mjs`) derives crate identity purely from `crateRootFor(fromFile)`,
which walks UP from the file being resolved to its nearest `Cargo.toml`. It has no channel to look up a SIBLING
crate by name at all. So even with `model.workspaces` populated, the vendored resolver alone would still never
resolve `use axum_core::…` written inside `axum` — confirmed both facts were required, not just one.

## Fix — same shape as npm workspace support, not a new mechanism

Did not touch the vendored `resolve-path.mjs`/`rust-resolve.mjs` (generated, "do not edit", would be silently
overwritten by the next `build-relations.mjs` run against Yggdrasil). Instead extended the two places npm
workspaces already flow through:

1. **core.mjs** (workspace discovery, ~line 1683): each package-root directory now contributes 0/1/2 workspace
   entries — the existing npm branch (`package.json` name + resolvable entry file) unchanged, plus a new Cargo
   branch reading `Cargo.toml`'s `[package] name` (new exported helper `readCargoCrateName`, dash→underscore
   normalized exactly as Rust `use` paths reference it — same parse the vendored `rust-resolve.mjs` already does
   for the CALLING file's own crate, duplicated rather than imported since that helper isn't exported and this
   one runs at model-build time over every workspace member, not resolve-time over one file). Entry shape:
   `{ name, dir, srcDir }` (no `entry` field — Rust has no single-entry-point concept the way `main`/`index.ts` does).

2. **relations.mjs** (`wsResolverFor` — the same channel bare TS/JS workspace specifiers already resolve through):
   added a `language === 'rust'` branch. Splits the specifier on `::`, maps the root segment to a workspace crate
   by name, then re-runs the IDENTICAL segment-shrinking module search the vendored resolver already uses for
   `crate::…` (`<part>.rs` before `<part>/mod.rs`, longest prefix first) — just rooted at the FOREIGN crate's
   `srcDir` instead of the caller's own. TS/JS branch untouched (early-return added before it, gated on language).

"kod to kod": crate names come from each crate's own `Cargo.toml`, nothing hardcoded.

## Verification

Direct fixture check (scratchpad, before writing the automated test) confirmed the full pipeline end to end:
`model.workspaces` → `[{"name":"crate_a",...},{"name":"crate_b",...}]`, `model.edges` contains
`crate_a/src/lib.rs → crate_b/src/thing.rs`, `model.moduleGraph.edges` contains `crate_a → crate_b`, and `grain
report`'s architecture section shows `crate_a/ → crate_b/ (1)` with NO §004 "resolved, none crossing a module
boundary" disclosure.

**Real-world check against the reproduction axum clone** (`corpus-a4b1/axum`, cache rebuilt):
- Before: `architecture: 11 modules · 0 directed dependencies · 0 cycle(s)`, "278 file-level edges resolved,
  none crossing a module boundary" (§004 disclosure firing).
- After: `architecture: 11 modules · 599 file edges · 11 module edges · 1 cycle(s)`. `report` shows real directed
  edges: `axum-macros/ → axum/ (74) · axum-extra/ (17)`, `examples/ → axum/ (74) · axum-extra/ (5)`,
  `axum-extra/ → axum/ (35) · axum-core/ (26) · axum-macros/ (1)`, `axum/ → axum-core/ (49) · axum-macros/ (3)`,
  `axum-core/ → axum/ (1) · axum-macros/ (1)` — plus a genuine cycle across all four crates, now visible for the
  first time (`established layering: 1 module pair(s)...`). §004 disclosure line correctly gone.

## Test

`plugins/grain/tests/cargo-workspace-edges.test.mjs` (new, 5 cases, via `grain status`/`report` CLI on real
mkdtemp'd git fixtures, same pattern as `python-module-deps.test.mjs`):
1. `model.workspaces` carries each Cargo crate's own name + `srcDir`, normalized.
2. A crate-qualified `use` resolves into a real cross-crate file edge.
3. That edge crosses a real module boundary in `moduleGraph`.
4. `report` shows the real directed dependency; the §004 disclosure correctly does NOT fire.
5. Regression: npm/pnpm/yarn bare-specifier workspace resolution (separate two-package fixture) is byte-identical.

Confirmed RED before GREEN: hand-reverted the `relations.mjs` hunk via Edit, reran — tests 2–4 failed exactly as
expected (0 directed dependencies, §004 disclosure fires, edge/module-edge absent), test 1 and 5 unaffected as
expected. Restored via Edit; all 5 green again.

All 5 pass. Full suite green (see shared start/end counts reported to team lead).

## Follow-up needed (not done here — instructed not to touch config.mjs)

This changes `model.edges`/`model.moduleGraph`/`model.workspaces` for previously-indexed Cargo-workspace repos
with no change to per-file extraction (`EXTR_V` unaffected — relFacts/scopes are unchanged; only the resolution/
aggregation step downstream of them changed). `MODEL_V` should be bumped so a stale cached model.json gets
relearned with the fixed edges. Reported to team lead; not applied here.
