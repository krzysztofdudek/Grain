// §056 — "a service id declared in YAML is unfindable": round 4's field test parsed a Symfony-shaped
// `services9.yml` (10+ named services, each with its own `class`/`arguments`/`tags`) and found `what "foo.baz"`
// (one service's own literal id) surfaced nothing that read as a declaration — only an undifferentiated
// string-literal-shaped value, indistinguishable from any other short string anywhere in the repository.
//
// Root cause, verified directly (see this file's own extraction assertions below): `CONTAINER_RE` (core.mjs) is
// a plain keyword list — "switch"/"object"/"dictionary"/"array"/"enum"/"case"/"match" — matched against a node's
// own TYPE NAME. JSON's mapping type is literally named `object`, so JSON containers already worked; YAML's is
// `block_mapping`/`flow_mapping`, which that list matches nothing in. Every key inside a YAML mapping therefore
// found NO container at all (`cont` stayed null), so `services9.yml`'s ten service ids never shared a container
// with one another — each was, findability-wise, exactly as isolated as an unrelated string anywhere else in the
// file. This is the general defect container-keypath.test.mjs's own top comment already flagged and explicitly
// left unfixed ("reported to the orchestrator, out of this ticket's own scope").
//
// The fix is two pieces, both general (data-grammar-uniform, never gated on a grammar name):
//   (1) `bindingFor`'s new `b.dataContainer` — a node type qualifies as a data-grammar mapping container when
//       its OWN declared children (node-types.json) admit a `b.keyField` type: JSON's `object` (child `pair`),
//       YAML's `block_mapping`/`flow_mapping` (child `block_mapping_pair`/`flow_pair`). Consulted ONLY when
//       `b.data` is true (a code grammar's container detection is exactly the untouched `CONTAINER_RE` path).
//   (2) `gatedValueEvidence`'s new sibling lookup: a `key`-kind value gated out of `model.valueIndex` by the
//       cross-file df floor (CFG.valueDfMin=2 — a service id declared once, in one file, can never clear a
//       CROSS-FILE bar) still has real WITHIN-container neighbors, computed straight off `rawScopes` (never off
//       `model.valueIndex`, so no other key's own frequency matters) and rendered as "Declared alongside: …".
//
// What is deliberately NOT changed: `model.valueSiblings` itself still requires every member to have cleared
// the df floor (that machinery answers a different, correctly-gated question — cross-file CONVENTION, e.g. "do
// most package.json `scripts` blocks carry the same script names" — see container-keypath.test.mjs); TOML's own
// `pair` (no `key` FIELD at all, only a `bare_key`/`quoted_key`/`dotted_key` CHILD) is left exactly as gated as
// before, a real, separately pre-existing gap, on purpose (see bindingFor's own §056 comment for why a fieldless-
// pair heuristic risks the ancestor walk stopping AT the pair instead of the table that holds it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

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
const fillers = (dir, n) => { for (let i = 1; i <= n; i++) w(dir, `src/filler${i}.ts`, `export function f${i}(): number { return ${i}; }\n`); };

// ===== direct extraction (no repo, no history) =====
async function valsOf(rel, src) {
  const p = await getParser(rel.slice(rel.lastIndexOf('.'))); const b = bindingFor(p._g); const tree = p.parse(src);
  const scopes = extractScopes(rel, tree, b, p._g); tree.delete();
  return scopes.find(s => s.kind === 'file').vals || [];
}

const SERVICES_YML = `services:
  foo.baz:
    class: App\\Service\\FooBaz
    arguments: ['@logger']
  foo.qux:
    class: App\\Service\\FooQux
    arguments: ['@foo.baz']
  bar.one:
    class: App\\Service\\BarOne
  bar.two:
    class: App\\Service\\BarTwo
  bar.three:
    class: App\\Service\\BarThree
  bar.four:
    class: App\\Service\\BarFour
  bar.five:
    class: App\\Service\\BarFive
  bar.six:
    class: App\\Service\\BarSix
  bar.seven:
    class: App\\Service\\BarSeven
  bar.eight:
    class: App\\Service\\BarEight
`;

test('(1) direct extraction: YAML block_mapping keys under the same mapping share ONE container id', async () => {
  const vals = await valsOf('config/services9.yml', SERVICES_YML);
  const serviceIds = ['foo.baz', 'foo.qux', 'bar.one', 'bar.two', 'bar.three'];
  const conts = new Set(vals.filter(e => serviceIds.includes(e.v)).map(e => e.c));
  assert.equal(conts.size, 1, `every top-level service id must share the $.services container: ${JSON.stringify(vals)}`);
  const one = vals.find(e => e.v === 'foo.baz');
  assert.equal(one.cn, '$.services', 'the container label must be the services mapping\'s own key-path');
  // a NESTED mapping (foo.baz's own class/arguments) must be a DIFFERENT, deeper container — not merged upward
  const classEntry = vals.find(e => e.v === 'class' && vals.find(e2 => e2.c === e.c && e2.v === 'App\\Service\\FooBaz'));
  assert.notEqual(classEntry.c, one.c, 'a service\'s own body must not collapse into the services mapping\'s own container');
});

test('(2) a code grammar\'s own container detection is untouched — b.dataContainer exists but is never consulted', async () => {
  const b = bindingFor((await getParser('.ts'))._g);
  assert.equal(b.data, false, 'TypeScript must not be classified as a data grammar');
  // JS/TS object literals DO show up in b.dataContainer's own structural derivation (it has nothing to do with
  // b.data) — the guarantee this test pins is that it is never CONSULTED for a code grammar, i.e. this fixture's
  // own object-literal value grouping renders byte-identical to the pre-§056 CONTAINER_RE-only path.
  const vals = await valsOf('src/x.ts', `export const labels = { primary: 'ACTIVE', other: 'INACTIVE' };\n`);
  const conts = new Set(vals.filter(e => ['ACTIVE', 'INACTIVE'].includes(e.v)).map(e => e.c));
  assert.equal(conts.size, 1, 'CONTAINER_RE alone ("object") must still group a TS object literal\'s own values, unaffected by the new data-grammar-only path');
});

// ===========================================================================================================
// end-to-end: a real, cold-built repo, mirroring round 4's own Symfony-shaped fixture
// ===========================================================================================================
let tmp, repo;
test('setup: a YAML DI-container fixture with 10 named services, each declared exactly once', () => {
  ({ tmp, repo } = initRepo('grain-056-yaml-services-'));
  w(repo, 'config/services9.yml', SERVICES_YML);
  fillers(repo, 15);
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'a symfony-shaped services file');
  const st = grainIn(repo, ['status']); assert.equal(st.code, 0, st.err);
});

test('(3) `what` on a once-only YAML service id now names its own container siblings, not just "seen, not absent"', () => {
  const r = grainIn(repo, ['what', 'foo.baz']);
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.out.includes('has no declarations or values anywhere'), `must not claim absence of a value that was seen:\n${r.out}`);
  assert.match(r.out, /below the 2-file floor/, r.out);
  assert.match(r.out, /Declared alongside:/, r.out);
  // the other 9 service ids must all be named (capped display at 8 + "+N more" is fine; JSON carries the full set)
  const j = JSON.parse(grainIn(repo, ['what', 'foo.baz', '--json']).out);
  const others = ['foo.qux', 'bar.one', 'bar.two', 'bar.three', 'bar.four', 'bar.five', 'bar.six', 'bar.seven', 'bar.eight'];
  for (const o of others) assert.ok(j.note.siblings.includes(o), `sibling set must include ${o}: ${JSON.stringify(j.note.siblings)}`);
  assert.ok(!j.note.siblings.includes('foo.baz'), 'the query itself must not be listed as its own sibling');
  // a NESTED field name (e.g. `class`) must never leak into the services-level sibling set — proof the container
  // fix keys on the right MAPPING, not "every key anywhere in this file"
  assert.ok(!j.note.siblings.includes('class'), `a nested field name must not appear as a services-level sibling: ${JSON.stringify(j.note.siblings)}`);
});
test('teardown: yaml services repo', () => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });
