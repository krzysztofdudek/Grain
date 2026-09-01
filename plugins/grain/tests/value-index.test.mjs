// J3.1 — value concordance: `extractScopes` collects a per-file `vals` list (enum members + short string
// literals, each tagged with the hash of the CONTAINER it was found in), `serializeScope` carries it, and
// `learn()` folds it into two repo-wide maps on the model:
//   · `model.valueIndex['<k>:<v>'] = [[rel, line], …]` — where a value lives, for values whose document
//     frequency sits inside [CFG.valueDfMin, ceil(CFG.valueDfMaxShare × files)]. A value in one file alone is
//     a local detail; a value in a fifth of the repository is furniture. Neither is a concordance entry.
//   · `model.valueSiblings['<c>'] = ['<k>:<v>', …] — the surviving members of one container, so a later
//     ticket can ask "this container's other members appear in files this change did not touch".
//
// Two container-key shapes, deliberately: an ENUM container is keyed by IDENTITY (node type + the enum's own
// name), so the same enum declared in two files is ONE sibling set — that cross-file merge is the whole point
// of the sibling map. A STRING container is keyed by POSITION (node type + start offset), which is only
// meaningful within one file, so its key also carries the file path.
//
// The TypeScript bare-enum-member path is load-bearing and is exercised on purpose: `enum UserStatus { ACTIVE,
// SUSPENDED }` gives `property_identifier` LEAVES under `enum_body` with NO `name` field of their own, so the
// "declaration with a name field" rule (which is what fires for `enum Codes { A = 'a' }`'s `enum_assignment`)
// never sees them. Only the identifier-shaped-direct-child fallback finds them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';
import { CFG } from '../engine/config.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const wIn = (dir, rel, content) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), content); };
const statusIn = dir => { const r = spawnSync('node', [BIN, 'status'], { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));

// ===== direct extraction (no repo, no history): what `vals` a single parsed file yields =====
async function valsOf(rel, src) {
  const p = await getParser(rel.slice(rel.lastIndexOf('.'))); const b = bindingFor(p._g); const tree = p.parse(src);
  const scopes = extractScopes(rel, tree, b, p._g); tree.delete();
  const f = scopes.find(s => s.kind === 'file');
  assert.ok(f, 'expected a file-kind scope');
  return f.vals || [];
}
const keysOf = vals => vals.map(e => e.k + ':' + e.v).sort();

// ===== (a)+(b)+(c)+(d): one mined repository =====
// 17 code files, so the density gate's upper bound is ceil(0.2 × 17) = 4 and its lower bound is 2:
//   enum:ACTIVE / enum:SUSPENDED   df 2  → in    (the enum is declared in two files)
//   str:ACTIVE  / str:SUSPENDED    df 3  → in
//   str:PYVALUE                    df 2  → in    (the Python control)
//   str:ONLYHERE                   df 1  → out   (below CFG.valueDfMin)
//   str:EVERYWHERE                 df 9  → out   (above CFG.valueDfMaxShare × files)
const ENUM_SRC = `export enum UserStatus { ACTIVE, SUSPENDED }\n`;
const CONSUMER_SRC = `export function classify(x: string): number {
  switch (x) {
    case 'SUSPENDED': return 1;
    default: return 0;
  }
}
export const labels = { primary: 'ACTIVE' };
`;
const PY_SRC = `STATUS = {'state': 'PYVALUE'}\n\n\ndef read():\n    return STATUS\n`;

let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-value-index-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false');
  wIn(repo, 'src/status.ts', ENUM_SRC);
  wIn(repo, 'src/models/status.ts', ENUM_SRC);
  for (const n of ['a', 'b', 'c']) wIn(repo, `src/${n}.ts`, CONSUMER_SRC);
  wIn(repo, 'src/lonely.ts', `export const only = 'ONLYHERE';\n`);
  for (let i = 1; i <= 9; i++) wIn(repo, `src/f${i}.ts`, `export const f${i} = 'EVERYWHERE';\n`);
  for (const n of ['one', 'two']) wIn(repo, `src/py/${n}.py`, PY_SRC);
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'the fixture tree');
  statusIn(repo);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(a) the value index carries enum members and string literals with their places', () => {
  const model = modelIn(repo);
  assert.equal(model.files, 17, 'fixture must have exactly 17 code files for the density bounds below');
  assert.ok(model.valueIndex, 'model must carry a valueIndex');

  assert.deepEqual(model.valueIndex['enum:SUSPENDED'], [['src/models/status.ts', 1], ['src/status.ts', 1]]);
  assert.deepEqual(model.valueIndex['enum:ACTIVE'], [['src/models/status.ts', 1], ['src/status.ts', 1]]);
  assert.deepEqual(model.valueIndex['str:SUSPENDED'], [['src/a.ts', 3], ['src/b.ts', 3], ['src/c.ts', 3]]);
  assert.deepEqual(model.valueIndex['str:ACTIVE'], [['src/a.ts', 7], ['src/b.ts', 7], ['src/c.ts', 7]]);
});

test('(a) the enum declaration is ONE container across both files, with both members as siblings', () => {
  const model = modelIn(repo);
  assert.ok(model.valueSiblings, 'model must carry a valueSiblings map');
  const hits = Object.entries(model.valueSiblings).filter(([, ms]) => ms.includes('enum:SUSPENDED'));
  assert.equal(hits.length, 1, `the same enum in two files is one container: ${JSON.stringify(hits)}`);
  assert.deepEqual(hits[0][1], ['enum:ACTIVE', 'enum:SUSPENDED']);
});

test('(b) a value living in a single file is not a concordance entry', () => {
  const model = modelIn(repo);
  assert.equal(model.valueIndex['str:ONLYHERE'], undefined, `df 1 < CFG.valueDfMin ${CFG.valueDfMin}`);
});

test('(c) a value living in more than valueDfMaxShare of the files is not a concordance entry', () => {
  const model = modelIn(repo);
  assert.equal(model.valueIndex['str:EVERYWHERE'], undefined, `df 9 > ceil(${CFG.valueDfMaxShare} x 17)`);
});

test('(d) Python control: a language with no enum node still has its string literals indexed', () => {
  const model = modelIn(repo);
  assert.deepEqual(model.valueIndex['str:PYVALUE'], [['src/py/one.py', 1], ['src/py/two.py', 1]]);
  assert.deepEqual(model.valueIndex['str:state'], [['src/py/one.py', 1], ['src/py/two.py', 1]]);
});

// ===== extraction-level behaviour =====
test('TS bare enum members (no `name` field of their own) are collected via the identifier fallback', async () => {
  const vals = await valsOf('src/status.ts', ENUM_SRC);
  const enums = vals.filter(e => e.k === 'enum');
  assert.deepEqual(enums.map(e => e.v).sort(), ['ACTIVE', 'SUSPENDED']);
  assert.equal(new Set(enums.map(e => e.c)).size, 1, 'both members share one container hash');
  assert.ok(enums.every(e => e.line === 1));
});

test('TS enum members declared with a value use the name field, and the value is a string entry', async () => {
  const vals = await valsOf('src/codes.ts', `enum Codes { A = 'aa', B = 'bb' }\n`);
  assert.deepEqual(keysOf(vals), ['enum:A', 'enum:B', 'str:aa', 'str:bb']);
});

test('string literals are keyed to their nearest container node', async () => {
  const vals = await valsOf('src/a.ts', CONSUMER_SRC);
  const susp = vals.find(e => e.k === 'str' && e.v === 'SUSPENDED');
  const act = vals.find(e => e.k === 'str' && e.v === 'ACTIVE');
  assert.ok(susp && act);
  assert.notEqual(susp.c, act.c, 'a switch case and an object literal are different containers');
});

test('a positional string container is scoped to its file: identical files do not share a container', async () => {
  const one = await valsOf('src/py/one.py', PY_SRC);
  const two = await valsOf('src/py/two.py', PY_SRC);
  assert.deepEqual(keysOf(one), ['str:PYVALUE', 'str:state']);
  assert.notEqual(one[0].c, two[0].c, 'same offset in two different files must not collide');
});

test('import specifiers are never values', async () => {
  const vals = await valsOf('src/imp.ts', `import { x } from './neighbour';\nexport const y = x;\n`);
  assert.deepEqual(keysOf(vals), []);
});

test('(e) values dedupe per (v, k) within a file, and a scan that HITS the 200 cap drops the file\'s vals entirely', async () => {
  // §J7.2: a capped scan is a non-representative PREFIX of itself (measured: vendored node-types.json,
  // package-lock.json) — the file's vals are dropped wholesale, not truncated to the first 200
  const many = Array.from({ length: 250 }, (_, i) => `'v${i}'`).join(', ');
  const vals = await valsOf('src/big.ts', `export const all = [${many}];\n`);
  assert.equal(vals.length, 0, 'capped scan: all vals dropped, not a 200-entry prefix');

  const dup = await valsOf('src/dup.ts', `export const a = ['same', 'same', 'same', 'same', 'same'];\n`);
  assert.deepEqual(keysOf(dup), ['str:same'], 'five occurrences of one value are one entry, well under the cap');
});
