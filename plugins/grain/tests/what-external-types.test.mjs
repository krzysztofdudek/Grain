// §032 — `what <external type>` silently undercounted real usage 4-8x while looking like a complete answer.
// Measured on PHP/Slim: `what MiddlewareInterface` said "6 hits / used by: 5 files" against a real 21; `what
// ResponseInterface` said "1 file" against a real 41. Root cause: `MiddlewareInterface`/`ResponseInterface` are
// vendor types (psr/*), never declared in the repo. With no local declaration (no card of its own) to anchor on,
// `whatCmd`'s (a) declaration search fell back to fuzzy name-TOKEN overlap over unrelated LOCAL declarations
// (`MiddlewareDispatcherInterface`, test method names containing "Interface") and missed every real
// `implements`/type-hint site.
//
// The structural facts these sites ARE recorded under already existed at learn() time (`sup` on each type scope,
// `ptypes`/`rets` on each method scope) but were never surfaced per-file in a form `what` could query — `fileSups`
// (heritage) had no sibling for parameter/return type hints. The fix (core.mjs):
//   1. `learn()` now also builds `fileTypeRefs` — `fileSups`'s sibling for parameter/return type hints — the
//      same per-file, threshold-free shape (no >=3-carrier gate the way `markers` has).
//   2. `whatCmd` computes `exactLocal` (does the query name something declared here, EXACTLY, not merely sharing
//      tokens with it?) and, when false, consults `fileSups`/`fileTypeRefs` for an EXACT-name (not token-overlap)
//      match — `typeRefHits`. A hit renders as a new, clearly hedged `referenced` line/field: the count is real
//      (an exact-name structural match) but the queried name resolves to no local declaration, so it is
//      disclosed exactly that way, never presented as an ordinary `defined:`/`used by:` fact (§032 fix 2, same
//      register as 011/018's "Seen, not absent").
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const initRepo = prefix => { const tmp = mkdtempSync(join(tmpdir(), prefix)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };
// filler files with real, extractable scopes — the same partitioning-floor pad what-command.test.mjs/
// what-honest-negative.test.mjs both use (a repo under ~30 total scopes gets zero partitions and every query,
// real symbols included, reads as "not found" — a separate model-sizing behavior, not this bug).
const fillers = (dir, n) => { for (let i = 1; i <= n; i++) w(dir, `src/filler${i}.ts`, `export function f${i}(): number { return ${i}; }\n`); };

// ===========================================================================================================
// The Slim shape, reproduced in miniature (PHP, real tree-sitter-php extraction, not a stub):
//   - `MiddlewareInterface` — the EXTERNAL/vendor type: never declared anywhere in this repo. 3 local classes
//     `implements` it (heritage — `fileSups`); 1 more (`App`) only takes it as a parameter type hint
//     (`fileTypeRefs`), never implementing it. Real total: 4 files.
//   - `RouteInterface` — the LOCAL control: declared in this repo (`src/Interfaces/RouteInterface.php`), 2
//     classes implement it. Must keep resolving through the existing (a) declaration path, untouched by this fix.
//   - `RouteResolverInterface` — an unrelated SIBLING type (also declared locally) that shares both of
//     `RouteInterface`'s query tokens ("route", "interface") — the pre-existing token-overlap blending §032's own
//     issue flagged in the *working* case. This fixture measures it; the fix does not touch it (see test 3).
//   - `TotallyAbsentInterface` — used nowhere, declared nowhere: the honest-negative control.
// ===========================================================================================================
let tmp, repo;
before(() => {
  ({ tmp, repo } = initRepo('grain-what-ext-'));

  // the external/vendor type: no declaration anywhere, 3 heritage sites + 1 type-hint-only site
  w(repo, 'src/Middleware/AuthMiddleware.php', '<?php\nclass AuthMiddleware implements MiddlewareInterface {\n  public function process($request) { return $request; }\n}\n');
  w(repo, 'src/Middleware/LoggingMiddleware.php', '<?php\nclass LoggingMiddleware implements MiddlewareInterface {\n  public function process($request) { return $request; }\n}\n');
  w(repo, 'src/Middleware/CorsMiddleware.php', '<?php\nclass CorsMiddleware implements MiddlewareInterface {\n  public function process($request) { return $request; }\n}\n');
  w(repo, 'src/App.php', '<?php\nclass App {\n  public function add(MiddlewareInterface $mw) { return $mw; }\n}\n');

  // the local control: RouteInterface, declared and implemented here
  w(repo, 'src/Interfaces/RouteInterface.php', '<?php\ninterface RouteInterface {\n  public function match(string $path): bool;\n}\n');
  w(repo, 'src/Routing/Route.php', '<?php\nclass Route implements RouteInterface {\n  public function match(string $path): bool { return true; }\n}\n');
  w(repo, 'src/Routing/StaticRoute.php', '<?php\nclass StaticRoute implements RouteInterface {\n  public function match(string $path): bool { return false; }\n}\n');

  // the unrelated sibling: also locally declared, shares both query tokens with RouteInterface
  w(repo, 'src/Interfaces/RouteResolverInterface.php', '<?php\ninterface RouteResolverInterface {\n  public function resolve(string $path): array;\n}\n');
  w(repo, 'src/Routing/Resolver.php', '<?php\nclass Resolver implements RouteResolverInterface {\n  public function resolve(string $path): array { return []; }\n}\n');

  fillers(repo, 13);
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'the external-type fixture');
  const st = grainIn(repo, ['status']); assert.equal(st.code, 0, st.err);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(1) an external type with no local declaration: the real N is reported, structurally, and disclosed as a name match', () => {
  const j = JSON.parse(grainIn(repo, ['what', 'MiddlewareInterface', '--json']).out);
  // it must never read as a resolved local declaration — nothing here is literally named MiddlewareInterface
  assert.ok(!j.defined.some(d => d.name === 'MiddlewareInterface'), `no declaration of MiddlewareInterface exists: ${JSON.stringify(j.defined)}`);
  // the real count: 3 heritage sites + 1 type-hint-only site = 4 files, structurally sourced
  assert.ok(j.referenced, `expected structural reference evidence, got null (defined=${JSON.stringify(j.defined)})`);
  assert.equal(j.referenced.files, 4, JSON.stringify(j.referenced));
  assert.equal(j.referenced.implements, 3, JSON.stringify(j.referenced));
  assert.equal(j.referenced.typeHint, 1, JSON.stringify(j.referenced));

  const r = grainIn(repo, ['what', 'MiddlewareInterface']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /has no declaration anywhere in this repository/, r.out);
  assert.match(r.out, /referenced structurally in 4 files/, r.out);
  assert.match(r.out, /implements\/extends it in 3 files/, r.out);
  assert.match(r.out, /parameter\/return type in 1 file/, r.out);
  assert.match(r.out, /not a resolved import/, r.out);
});

test('(2) the locally-declared control still resolves correctly through the existing declaration path', () => {
  const j = JSON.parse(grainIn(repo, ['what', 'RouteInterface', '--json']).out);
  const decl = j.defined.find(d => d.name === 'RouteInterface');
  assert.ok(decl, `RouteInterface's own declaration must still be found: ${JSON.stringify(j.defined)}`);
  assert.equal(decl.kind, 'type');
  // a type that IS declared locally already has a correct, complete answer through (a) — the new structural
  // branch must not fire (and must not double-report) once a real declaration exists
  assert.equal(j.referenced, null, `no structural disclosure needed once a local declaration resolves: ${JSON.stringify(j.referenced)}`);

  const r = grainIn(repo, ['what', 'RouteInterface']);
  assert.match(r.out, /defined:.*RouteInterface/, r.out);
  assert.ok(!r.out.includes('has no declaration anywhere'), r.out);
});

test('(3) sibling-type noise in the locally-declared case is unchanged by this fix (measured, not silently fixed here)', () => {
  const j = JSON.parse(grainIn(repo, ['what', 'RouteInterface', '--json']).out);
  // §032 is explicit that this pre-existing token-overlap blend (RouteResolverInterface shares both of
  // RouteInterface's query tokens) is a SEPARATE concern from the external-type undercount this ticket fixes —
  // measured here so a future fix has a baseline, not asserted as correct behavior.
  const names = j.defined.map(d => d.name);
  assert.ok(names.includes('RouteInterface'), JSON.stringify(names));
  assert.ok(names.includes('RouteResolverInterface'), `sibling-noise baseline: RouteResolverInterface is still blended in by (a)'s token-overlap match, unchanged by §032's fix — got ${JSON.stringify(names)}`);
  assert.equal(names.length, 2, `exactly the real match plus the one sibling — no further drift: ${JSON.stringify(names)}`);
});

test('(4) a genuinely absent type still gets the short, clean "not found" answer — no verbosity creep', () => {
  const j = JSON.parse(grainIn(repo, ['what', 'TotallyAbsentInterface', '--json']).out);
  assert.deepEqual(j.defined, []);
  assert.deepEqual(j.values, []);
  assert.equal(j.referenced, null, JSON.stringify(j.referenced));
  // `cmdWhat`'s JSON rendering deliberately nulls out the 'absent' note kind (it is the expected/default case,
  // not worth serializing — see grain.mjs's own `note.kind !== 'absent' ? note : null`); the text rendering below
  // is where the honest-absence wording is actually asserted.
  assert.equal(j.note, null, JSON.stringify(j.note));

  const r = grainIn(repo, ['what', 'TotallyAbsentInterface']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /has no declarations or values anywhere in this repository's code/, r.out);
  assert.ok(!r.out.includes('referenced structurally'), r.out);
  // short: header + the one honest-absence line + the freshness stamp, nothing more
  assert.equal(r.out.trim().split('\n').length, 3, r.out);
});
