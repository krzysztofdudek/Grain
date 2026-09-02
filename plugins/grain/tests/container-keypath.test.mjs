// J7.3 — data containers keyed by key-path, and a general population-math fix this ticket was born from measuring.
// Two independent things, verified separately below:
//
//   (A) NEW, `b.data`-gated: a data-grammar (JSON/YAML/TOML) container's identity becomes its key-PATH
//       (`hashStr(cont.type + '|' + grammar + '#' + keyPathOf(cont, b))`) instead of file+byte-offset — so the
//       SAME conceptual container (every package.json's own `scripts` object) is recognized as ONE cross-file
//       population, the way an enum already is by name. `keyPathOf` climbs from a container node through its
//       ancestors, collecting the key text of every pair it sits on the VALUE side of; an array contributes no
//       segment of its own, so N array elements (`steps: [...]`'s objects) share one container. A code-grammar
//       (`b.data` false) container's identity is byte-for-byte unchanged — still positional.
//
//   (B) BUG FIX, general, not `b.data`-gated: `learn()`'s existing sibling/population computation
//       (core.mjs's value-concordance block) had two pre-existing bugs, both present since J3.1/J3.2 shipped,
//       affecting every container kind including enums:
//         1. the sibling SET was the UNION of every member ever seen anywhere under a container id, not the
//            CORE — members present in a 2/3 supermajority of the files that actually declare the container
//            (the same 2/3 threshold markers/groupKin/J3.2 completeness already use elsewhere, no new constant).
//         2. a file was credited with "carrying" a member if that member's value appeared ANYWHERE in the file
//            (`model.valueIndex[k]`'s GLOBAL place list), not specifically inside THIS container.
//       Together these let a container falsely certify "these members always travel together" when they
//       demonstrably do not on a per-file basis — verified directly on this repo's own `.grain/cache/model.json`
//       before the fix: 76 certified `valueNorms`, only ~8 distinct `(ne,neff)` signatures, one repeated 19 times.
//
// NOTE on a real gap found while building these fixtures, reported to the orchestrator and left AS IS at the
// time (out of this ticket's own scope): `CONTAINER_RE` (core.mjs, word-bounded on switch|object|dictionary|
// array|enum|case|match) does not match YAML's `block_mapping`/`block_sequence` node types, nor TOML's
// `table`/`inline_table` — verified by direct parse. A YAML mapping (e.g. a GitHub Actions workflow's `jobs:`)
// therefore never found a `cont` at all, so §(A)'s path-keying (gated on `cont` being truthy) never fired for
// YAML mappings or TOML tables — only JSON objects/arrays and TOML arrays exercised it. §(B)'s general fix is
// unaffected by this (it does not depend on `cont`), which is why the YAML/TOML-independent enum fixture below
// is the proof that §(B) is general.
//
// §056 later closed the YAML-mapping half of this gap directly (`bindingFor`'s new `b.dataContainer`, data-
// grammar-only, derived from node-types.json: a node type qualifies when its own declared children admit a
// `b.keyField` type — JSON's `object` and YAML's `block_mapping`/`flow_mapping` both now find a `cont`; see
// data-grammar-key-siblings.test.mjs). Left open on purpose: YAML's `block_sequence` (still unmatched — only
// `flow_sequence` incidentally qualifies, via its own `flow_pair` child type) and TOML's `table`/`inline_table`
// (whose `pair` carries no `key` FIELD at all, only a `bare_key`/`quoted_key`/`dotted_key` CHILD — a fieldless-
// pair heuristic was tried and dropped: TOML's `table`/`inline_table` themselves also admit a bare/dotted/quoted
// key as a DIRECT child for their own header, so the same heuristic that finds TOML's `pair` also misclassifies
// `pair` itself as a container, stopping the ancestor walk one level too early).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getParser, bindingFor, extractScopes, hashStr } from '../engine/core.mjs';
import { CFG } from '../engine/config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), content); };
const statusIn = dir => { const r = spawnSync('node', [BIN, 'status'], { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr); };
const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));
const initRepo = prefix => { const tmp = mkdtempSync(join(tmpdir(), prefix)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };
const fillers = (dir, n) => { for (let i = 1; i <= n; i++) w(dir, `filler${i}.ts`, `export const f${i} = ${i};\n`); };

// ===== direct extraction (no repo, no history) — for the container-hash assertions that don't need `learn()` =====
async function scopesOf(rel, src) {
  const p = await getParser(rel.slice(rel.lastIndexOf('.'))); const b = bindingFor(p._g); const tree = p.parse(src);
  const out = extractScopes(rel, tree, b, p._g); tree.delete(); return out;
}
async function valsOf(rel, src) { return (await scopesOf(rel, src)).find(s => s.kind === 'file').vals || []; }

// ===========================================================================================================
// (1) FLAGSHIP: 5 package.json-shaped files with a HETEROGENEOUS `scripts` object — `build`/`test` in all 5,
// `lint` in only 2 (a genuinely mixed set, not a homogeneous one that would pass for the wrong reason, mirroring
// the real-world heterogeneity `opinion-j72-container-keying` measured on real monorepos). 21 total code files
// (5 json + 16 filler.ts) keeps ceil(CFG.valueDfMaxShare * 21) = 5, exactly `build`'s df — the same boundary
// arithmetic the shipped kin-completeness.test.mjs fixture A uses at neff = CFG.minRaw = 5.
// ===========================================================================================================
let tmp1, repo1;
before(() => {
  ({ tmp: tmp1, repo: repo1 } = initRepo('grain-ckp-flagship-'));
  const pkgs = [
    { build: 'webpack', test: 'jest', lint: 'eslint .' },
    { build: 'webpack', test: 'jest', lint: 'eslint .' },
    { build: 'webpack', test: 'jest' },
    { build: 'webpack', test: 'jest' },
    { build: 'webpack', test: 'jest' },
  ];
  pkgs.forEach((scripts, i) => w(repo1, `pkgs/p${i + 1}/package.json`, JSON.stringify({ name: `p${i + 1}`, scripts })));
  fillers(repo1, 16);
  gitIn(repo1, 'add', '-A'); gitIn(repo1, 'commit', '-qm', 'the flagship fixture');
  statusIn(repo1);
});
after(() => { if (tmp1) rmSync(tmp1, { recursive: true, force: true }); });

test('(1) heterogeneous `scripts` containers across 5 files certify the CORE members, never the minority one', () => {
  const m = modelIn(repo1);
  assert.equal(m.files, 21, 'fixture must have exactly 21 code files for the density-gate arithmetic above');
  assert.ok(m.valueIndex['key:lint'], '`lint` must survive the df population gate (df=2, well inside [2,5]) — its exclusion below is the CORE-not-UNION fix at work, not the population gate');
  const [c, sibs] = Object.entries(m.valueSiblings).find(([, ms]) => ms.includes('key:build'));
  assert.ok(sibs.includes('key:test'), `'test' (present in all 5 files) must be a certified sibling: ${sibs}`);
  assert.ok(!sibs.includes('key:lint'), `'lint' (present in only 2 of 5 declaring files, below the 2/3 supermajority) must NOT be a sibling: ${sibs}`);
  const N = m.valueNorms[c];
  assert.ok(N, `the scripts container must certify a co-travel norm: ${JSON.stringify(m.valueNorms)}`);
  assert.equal(N.ne, 5); assert.equal(N.neff, 5);
  assert.ok(N.bits > 0, `bits must be a positive codelength gain: ${N.bits}`);
  assert.deepEqual(N.full, ['pkgs/p1/package.json', 'pkgs/p2/package.json', 'pkgs/p3/package.json', 'pkgs/p4/package.json', 'pkgs/p5/package.json']);
  assert.equal(m.valueContainer[c], '$.scripts', "a data container's label is its key-path, not null");
});

// ===========================================================================================================
// (2) REGRESSION: the UNION+global-valueIndex bug, if still present, WOULD falsely certify "every scripts object
// carries both `build` and `test`" — but 3 of 5 files put `test` under an unrelated `jestConfig` object, not
// `scripts`. Only the global `model.valueIndex['key:test']` (which does not know WHICH container a place came
// from) can make those 3 files look like scripts-carriers of `test`; the per-container `contFiles` map cannot.
// Manually verified during development (never left in this file, per the ticket's own instruction): hand-reverting
// `model.valueSiblings`'s CORE filter back to a plain UNION, and the co-travel loop's `h(f)` back to reading
// `model.valueIndex[k]` directly, makes this exact fixture certify `{key:build, key:test}` at ne=5/neff=5 over
// ALL 5 files (bits > 0) — a false claim, since p3–p5's `scripts` object never had `test` in it. The fixed code
// below must certify no such thing.
// ===========================================================================================================
let tmp2, repo2;
before(() => {
  ({ tmp: tmp2, repo: repo2 } = initRepo('grain-ckp-regress-'));
  w(repo2, 'pkgs/p1/package.json', JSON.stringify({ scripts: { build: 'b1', test: 't1' } }));
  w(repo2, 'pkgs/p2/package.json', JSON.stringify({ scripts: { build: 'b2', test: 't2' } }));
  w(repo2, 'pkgs/p3/package.json', JSON.stringify({ scripts: { build: 'b3' }, jestConfig: { test: 't3' } }));
  w(repo2, 'pkgs/p4/package.json', JSON.stringify({ scripts: { build: 'b4' }, jestConfig: { test: 't4' } }));
  w(repo2, 'pkgs/p5/package.json', JSON.stringify({ scripts: { build: 'b5' }, jestConfig: { test: 't5' } }));
  fillers(repo2, 16);
  gitIn(repo2, 'add', '-A'); gitIn(repo2, 'commit', '-qm', 'the regression fixture');
  statusIn(repo2);
});
after(() => { if (tmp2) rmSync(tmp2, { recursive: true, force: true }); });

test('(2) `test` living OUTSIDE `scripts` in most files is never certified as a scripts-container sibling', async () => {
  const m = modelIn(repo2);
  assert.equal(m.files, 21);
  assert.ok(m.valueIndex['key:build'] && m.valueIndex['key:test'], 'both keys must survive the df gate globally (df=5 each)');
  const scriptsId = (await valsOf('x/package.json', JSON.stringify({ scripts: { build: 'x' } }))).find(e => e.v === 'build').c;
  const sibs = m.valueSiblings[scriptsId];
  assert.ok(!sibs || !(sibs.includes('key:build') && sibs.includes('key:test')),
    `must not certify build+test together for scripts: ${JSON.stringify(sibs)}`);
  for (const N of Object.values(m.valueNorms)) assert.ok(!(N.ne === 5 && N.neff === 5 && N.full.length === 5 && Object.values(m.valueSiblings).some(s => s.includes('key:build') && s.includes('key:test'))),
    'no container may falsely claim all 5 files carry both build and test');
});

// ===========================================================================================================
// (3) The pre-existing duplication bug, reproduced on a CODE grammar (TypeScript enum) — proves fix (B) is
// general, not gated to `b.data`. Two files declare `enum Priority { LOW, HIGH }`. Three OTHER files declare
// `enum Priority { LOW }` (no HIGH) alongside an unrelated `enum Other { HIGH }` — so the VALUE `HIGH` tagged
// `enum` appears SOMEWHERE in every one of the 5 files (globally, `model.valueIndex['enum:HIGH']` lists all 5),
// but only 2 of them actually have it inside the `Priority` enum's own container. The old global-lookup `h(f)`
// cannot tell the difference; the per-container `contFiles` map can.
// ===========================================================================================================
let tmp3, repo3;
before(() => {
  ({ tmp: tmp3, repo: repo3 } = initRepo('grain-ckp-enum-'));
  w(repo3, 'src/priority1.ts', 'export enum Priority { LOW, HIGH }\n');
  w(repo3, 'src/priority2.ts', 'export enum Priority { LOW, HIGH }\n');
  w(repo3, 'src/priority3.ts', 'export enum Priority { LOW }\nexport enum Other { HIGH }\n');
  w(repo3, 'src/priority4.ts', 'export enum Priority { LOW }\nexport enum Other { HIGH }\n');
  w(repo3, 'src/priority5.ts', 'export enum Priority { LOW }\nexport enum Other { HIGH }\n');
  fillers(repo3, 16);
  gitIn(repo3, 'add', '-A'); gitIn(repo3, 'commit', '-qm', 'the enum duplication fixture');
  statusIn(repo3);
});
after(() => { if (tmp3) rmSync(tmp3, { recursive: true, force: true }); });

test('(3) the duplication fix is general: an enum sharing a member VALUE with an unrelated enum is not falsely certified', () => {
  const m = modelIn(repo3);
  assert.equal(m.files, 21);
  assert.ok(m.valueIndex['enum:HIGH'], "HIGH's global df must survive the gate (appears in all 5 files, one way or another)");
  for (const sibs of Object.values(m.valueSiblings))
    assert.ok(!(sibs.includes('enum:LOW') && sibs.includes('enum:HIGH')),
      `Priority's LOW and HIGH must not be certified as siblings — only 2 of 5 files' OWN Priority enum has both: ${JSON.stringify(m.valueSiblings)}`);
  assert.equal(Object.keys(m.valueNorms).length, 0, `no container should certify anything on this fixture: ${JSON.stringify(m.valueNorms)}`);
});

// ===========================================================================================================
// (4)-(7): direct extraction assertions, no repo/history needed
// ===========================================================================================================
test('(4) two files with the same key-path hash to the IDENTICAL container id', async () => {
  const v1 = await valsOf('a/package.json', JSON.stringify({ scripts: { build: 'x', test: 'y' } }));
  const v2 = await valsOf('b/package.json', JSON.stringify({ scripts: { build: 'z' } }));
  const c1 = v1.find(e => e.v === 'build').c, c2 = v2.find(e => e.v === 'build').c;
  assert.equal(c1, c2, 'the same key-path ($.scripts) in two different files must hash identically');
});

test('(5) a code-grammar (non-`b.data`) container\'s identity is byte-identical to the pre-J7.3 formula', async () => {
  const vals = await valsOf('src/status.ts', 'export enum UserStatus { ACTIVE, SUSPENDED }\n');
  assert.equal(new Set(vals.map(e => e.c)).size, 1, 'both members share one container');
  // the exact, untouched formula for a code (non-data) enum container: hashStr(en.type + '|' + enName.text) —
  // 'enum_declaration' is TypeScript's real node type for a named enum declaration
  assert.equal(vals[0].c, hashStr('enum_declaration|UserStatus'));
  assert.equal(vals[0].cn, 'UserStatus');
});

test('(5b) a code-grammar positional string container keeps its `cn` null, exactly as before J7.3', async () => {
  const vals = await valsOf('src/a.ts', `export const labels = { primary: 'ACTIVE' };\n`);
  assert.equal(vals.find(e => e.v === 'ACTIVE').cn, null);
});

test('(6) a JSON array of objects under one key shares ONE container across elements, no per-index segment', async () => {
  const vals = await valsOf('c/workflow.json', JSON.stringify({ steps: [{ run: 'a' }, { run: 'b' }] }));
  const a = vals.find(e => e.v === 'a'), b = vals.find(e => e.v === 'b');
  assert.ok(a && b);
  assert.equal(a.c, b.c, 'both array elements must share one container id');
  assert.equal(a.cn, '$.steps'); assert.equal(b.cn, '$.steps');
});

test('(7) `valueContainer`\'s label for a data-grammar container is its key-path, not null', async () => {
  const vals = await valsOf('a/package.json', JSON.stringify({ scripts: { build: 'x' } }));
  assert.equal(vals.find(e => e.v === 'build').cn, '$.scripts');
});
