// 017: a Cargo workspace's cross-crate `use` never resolved, so the architecture graph reported "N modules · 0
// directed dependencies" on axum even though 33 files in `axum/src` do `use axum_core::…` and 25 in
// `axum-extra/src` do `use axum::…` — real, heavy coupling the resolver never saw.
//
// Root cause: the vendored rust-resolve.mjs's `resolveRustPath` can only ever resolve a `use` path back into the
// CALLING file's own crate — it derives crate identity purely from `deps.crateRootFor(fromFile)`, which walks UP
// from `fromFile` to the nearest `Cargo.toml`. It has no notion of a SIBLING crate at all, so `use
// axum_core::extract::Request` written inside `axum` always returned `undefined`. Cargo workspaces were also never
// fed into `model.workspaces` in the first place — that array only ever came from `package.json` (npm/pnpm/yarn).
//
// Fixed the same shape as the existing npm-workspace support ("kod to kod" — no hardcoded crate names): core.mjs's
// workspace-discovery pass now also reads each package-root directory's `Cargo.toml` `[package] name` (dash/
// underscore-normalized, exactly how Rust `use` paths reference it) and records its `src/` dir; relations.mjs's
// `wsResolverFor` (already the channel bare TS/JS workspace specifiers resolve through) gained a `language ===
// 'rust'` branch that maps a specifier's root segment to that crate and re-runs the vendored resolver's own
// segment-shrinking module search, rooted at the FOREIGN crate's `srcDir` instead of the caller's own.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, cargo, npmWs;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const gitFor = dir => (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
const wFor = dir => (rel, content) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), content); };
const grainIn = dir => args => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const modelOf = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-cargo-ws-'));

  // cargo: a two-crate workspace. crate_a's ONLY reference to crate_b is a crate-qualified `use` — the exact
  // shape (`use axum_core::…`) the ticket named. `Widget` is a real item so this is genuine coupling, not a
  // synthetic path never exercised by a compiler.
  cargo = join(tmp, 'cargo'); mkdirSync(cargo);
  { const git = gitFor(cargo), w = wFor(cargo), grain = grainIn(cargo);
    git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
    w('Cargo.toml', '[workspace]\nmembers = ["crate_a", "crate_b"]\nresolver = "2"\n');
    w('crate_a/Cargo.toml', '[package]\nname = "crate_a"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\ncrate_b = { path = "../crate_b" }\n');
    w('crate_a/src/lib.rs', 'use crate_b::thing::Widget;\n\npub fn make() -> Widget {\n    Widget\n}\n');
    w('crate_b/Cargo.toml', '[package]\nname = "crate_b"\nversion = "0.1.0"\nedition = "2021"\n');
    w('crate_b/src/lib.rs', 'pub mod thing;\n');
    w('crate_b/src/thing.rs', 'pub struct Widget;\n');
    git('add', '-A'); git('commit', '-qm', 'base');
    const r = grain(['status']); assert.equal(r.code, 0, r.err); }

  // npmWs: regression control — the pre-existing npm/pnpm/yarn bare-specifier workspace channel, unrelated to
  // Rust, must resolve exactly as it did before this fix touched the same function.
  npmWs = join(tmp, 'npm-ws'); mkdirSync(npmWs);
  { const git = gitFor(npmWs), w = wFor(npmWs), grain = grainIn(npmWs);
    git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
    w('package.json', '{"name":"root","private":true,"workspaces":["packages/*"]}\n');
    w('packages/a/package.json', '{"name":"@scope/a","main":"src/index.ts"}\n');
    w('packages/a/src/index.ts', "import { thing } from '@scope/b';\nexport const useIt = () => thing();\n");
    w('packages/b/package.json', '{"name":"@scope/b","main":"src/index.ts"}\n');
    w('packages/b/src/index.ts', 'export const thing = () => 1;\n');
    git('add', '-A'); git('commit', '-qm', 'base');
    const r = grain(['status']); assert.equal(r.code, 0, r.err); }
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('model.workspaces carries each Cargo crate\'s own declared name and src/ dir, dash/underscore-normalized', () => {
  const ws = modelOf(cargo).workspaces;
  assert.deepEqual(ws.sort((a, b) => a.name < b.name ? -1 : 1), [
    { name: 'crate_a', dir: 'crate_a', srcDir: 'crate_a/src' },
    { name: 'crate_b', dir: 'crate_b', srcDir: 'crate_b/src' } ]);
});

test('a crate-qualified `use` resolves into a real cross-crate file edge', () => {
  const edges = modelOf(cargo).edges;
  assert.ok(edges.some(e => e.from === 'crate_a/src/lib.rs' && e.to === 'crate_b/src/thing.rs'),
    `expected a crate_a → crate_b file edge: ${JSON.stringify(edges)}`);
});

test('that edge crosses a real module boundary in moduleGraph', () => {
  const mg = modelOf(cargo).moduleGraph;
  assert.ok(mg.nodes.some(n => n.id === 'crate_a') && mg.nodes.some(n => n.id === 'crate_b'), `expected crate_a and crate_b as separate modules: ${JSON.stringify(mg.nodes)}`);
  assert.ok(mg.edges.some(e => e.from === 'crate_a' && e.to === 'crate_b' && e.n === 1), `expected a real crate_a → crate_b module edge: ${JSON.stringify(mg.edges)}`);
});

test('report shows the real directed dependency, and the §004 intra-module disclosure correctly does NOT fire', () => {
  const r = grainIn(cargo)(['report']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^== architecture — 3 modules · 1 directed dependencies · 0 cycle\(s\) ==$/m, r.out);
  assert.match(r.out, /crate_a\/ → crate_b\/ \(1\)/, r.out);
  assert.doesNotMatch(r.out, /file-level edge.*resolved, none crossing/, r.out);
});

test('regression: npm/pnpm/yarn bare-specifier workspace resolution is unaffected by the Rust branch', () => {
  const edges = modelOf(npmWs).edges;
  assert.ok(edges.some(e => e.from === 'packages/a/src/index.ts' && e.to === 'packages/b/src/index.ts'),
    `expected the pre-existing npm workspace edge, unchanged: ${JSON.stringify(edges)}`);
  const mg = modelOf(npmWs).moduleGraph;
  assert.ok(mg.edges.some(e => e.from === 'packages/a' && e.to === 'packages/b' && e.n === 1), `expected the module-level edge, unchanged: ${JSON.stringify(mg.edges)}`);
});
