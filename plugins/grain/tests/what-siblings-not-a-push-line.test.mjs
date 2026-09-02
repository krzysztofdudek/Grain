// §052 — `what`'s `siblings:` line is deleted. Measured (see .system/issues/052-what-siblings-noise/log.md):
// per-value precision 0.364 [0.29–0.44] against a pre-registered 0.70 bar and an unsure-counts-as-hit tie-break,
// over 165 blind hand verdicts across 7 languages; a mean of 72.7 sibling values per firing line, worst single
// line 759; firing on 218 of 420 of the repositories' own vocabulary queries. The line is a PUSH surface — it is
// volunteered inside the answer to "what is «q» here", and by construction it prints exactly the values that did
// NOT match «q» (`others = sibs.filter(k2 => !matchedKeys.has(k2))`).
//
// The evidence keeps its home. What is deleted is only `what`'s unbidden rendering of raw container membership:
//   - `model.valueSiblings` / `valueContainer` / `valueNorms` are untouched, and `export`'s published
//     `valueSiblings` field is that data verbatim — the §044 precedent for `model.twins` exactly.
//   - `check`/`review`'s `kin:` line still speaks about the same containers. That is the PULL surface: it fires
//     only when the reader's own change touched that container, and unlike `what` it consults `model.valueNorms`,
//     the KT/λ-certified co-travel test. Across the 7-repo corpus that certification accepts 3 of 2393
//     containers — `what` was rendering all 2393 under the `practiced` (statistical-claim) voice.
//
// The second half of this file is deliberately arm-invariant: it must pass BOTH before and after the deletion,
// because a guard that only holds afterwards guards nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));

const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
let tmp, repo;

// The same shape as what-command.test.mjs's repo A, and deliberately the surface's BEST case: a NAMED enum
// container (`model.valueContainer` non-null), only three members, and the one sibling that would be printed
// (`CANCELLED`) is a genuine peer alternative. If the deletion is real it must hold even here.
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-052-'));
  repo = join(tmp, 'a');
  mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main');
  gitIn(repo, 'config', 'commit.gpgsign', 'false');

  const ENUM_SRC = `export enum OrderStatus { PENDING_STATUS, SHIPPED_STATUS, CANCELLED }\n`;
  w(repo, 'src/orders/status.ts', ENUM_SRC);
  w(repo, 'src/billing/status.ts', ENUM_SRC);
  const CONSUMER_SRC = `export function classify(x: string): number {
  switch (x) {
    case 'PENDING_STATUS': return 1;
    case 'SHIPPED_STATUS': return 2;
  }
  return 0;
}
`;
  for (const n of ['a', 'b', 'c']) w(repo, `src/consumers/${n}.ts`, CONSUMER_SRC);
  w(repo, 'src/consumers/importer.ts', `import { OrderStatus } from '../orders/status';\nexport const z = OrderStatus;\n`);
  for (let i = 0; i < 10; i++) w(repo, `src/filler/f${i}.ts`, `export function f${i}(): number { return ${i}; }\n`);

  let day = 0;
  const commit = msg => {
    day += 2;
    const d = new Date(T0 + day * 86400000).toISOString();
    gitIn(repo, 'add', '-A');
    execFileSync('git', ['-C', repo, 'commit', '-q', '-m', msg], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } });
  };
  commit('init');
  grainIn(repo, ['refresh']);
});

after(() => rmSync(tmp, { recursive: true, force: true }));

// ---------- half 1: the deletion itself (RED before the change, GREEN after) ----------

test('(a) §052: `what` renders NO siblings: line, while its other sources still render', () => {
  const r = grainIn(repo, ['what', 'status']);
  assert.equal(r.code, 0, r.err);
  const lines = r.out.split('\n');
  assert.equal(
    lines.find(l => l.startsWith('siblings:')),
    undefined,
    `§052: the siblings: line is deleted — got:\n${r.out}`
  );
  // surgical, not a broken renderer: the sources either side of (d) still speak
  assert.ok(lines.find(l => l.startsWith('defined:')), `defined: must survive:\n${r.out}`);
  assert.ok(lines.find(l => l.startsWith('values:')), `values: must survive:\n${r.out}`);
  assert.ok(lines.find(l => l.startsWith('spread:')), `spread: must survive:\n${r.out}`);
  assert.ok(lines[0].includes('«status» → what it is here:'), lines[0]);
});

test('(b) §052: `what --json` carries no `siblings` field, and its other fields are intact', () => {
  const r = grainIn(repo, ['what', 'status', '--json']);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.ok(!('siblings' in j), `§052: the JSON siblings field is deleted — got keys ${Object.keys(j).join(',')}`);
  assert.equal(j.query, 'status');
  assert.equal(j.defined.length, 2, JSON.stringify(j.defined));
  assert.equal(j.values.length, 4, JSON.stringify(j.values));
  assert.equal(j.spread.length, 3, JSON.stringify(j.spread));
});

test('(c) §052: the deletion is a RENDERING decision — the container is still fully certified in the model', () => {
  // If this fixture had simply stopped producing a sibling container, (a) and (b) would pass for the wrong
  // reason. It has not: the model still carries the container, its name, and all three members.
  const m = modelIn(repo);
  const hit = Object.entries(m.valueSiblings).find(([, ms]) => ms.includes('enum:PENDING_STATUS'));
  assert.ok(hit, `the sibling container must still be learned: ${JSON.stringify(Object.keys(m.valueSiblings))}`);
  assert.deepEqual(hit[1], ['enum:CANCELLED', 'enum:PENDING_STATUS', 'enum:SHIPPED_STATUS']);
  assert.equal(m.valueContainer[hit[0]], 'OrderStatus', 'a NAMED container — the surface\'s best case, still modelled');
  assert.ok(Object.hasOwn(m.valueIndex, 'enum:CANCELLED'), 'the value `what` would have shown is still indexed');
});

// ---------- half 2: arm-invariant guards — these must pass BEFORE the deletion too ----------

test('(d) both arms — `export` still publishes valueSiblings verbatim, with the container name and members', () => {
  const r = grainIn(repo, ['export']);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  const entries = Object.values(j.valueSiblings || {});
  const hit = entries.find(e => (e.members || []).includes('enum:PENDING_STATUS'));
  assert.ok(hit, `export must still publish the container: ${JSON.stringify(j.valueSiblings)}`);
  assert.equal(hit.container, 'OrderStatus');
  assert.deepEqual(hit.members, ['enum:CANCELLED', 'enum:PENDING_STATUS', 'enum:SHIPPED_STATUS']);
});

test('(e) both arms — the published export schema still documents valueSiblings', () => {
  const r = grainIn(repo, ['export']);
  const j = JSON.parse(r.out);
  assert.match(
    (j.schemaNotes && j.schemaNotes.valueSiblings) || '',
    /value concordance/i,
    'the export schema note is a published interface and is not touched by §052'
  );
});

test('(f) both arms — `what` never claimed a container the model does not hold', () => {
  // The guard that outlives the deletion: whatever `what` says about values, every value it names is one the
  // value index actually carries. Written against the JSON so it keeps working if the renderer changes again.
  const j = JSON.parse(grainIn(repo, ['what', 'status', '--json']).out);
  const m = modelIn(repo);
  for (const v of j.values) assert.ok(Object.hasOwn(m.valueIndex, v.kind + ':' + v.value), `${v.kind}:${v.value} must be indexed`);
});
