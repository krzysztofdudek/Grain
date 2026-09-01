// §065 (G catalog §6.4) — `what <symbol>` never named the tests that cover it: 9 instances, 18 calls in the
// measured corpus, and no command answered it. A reader had to already know the test file's own name to look it
// up, which defeats the point of asking. The model already carries three signals for this, all scoring/rendering
// over data already extracted — no new extraction:
//   (1) same-stem naming: a file-stem convention (`UpdateTodoList.cs` -> `UpdateTodoListTests.cs`) or the
//       symbol's own name as a segment of an already test-like path (`res.sendStatus` -> `test/res.sendStatus.js`).
//   (2) model.cochange, at the single-file 1/3 floor §063's cochangeData already established for a single changed
//       file — restricted to partners whose own path reads as a test (`lib/express/collection.js` <->
//       `spec/spec.collection.js`, the ticket's own motivating example).
//   (3) model.edges: a test-like file importing the defining file.
// (1) wins outright when it fires; (2)/(3) are only ever a fallback. When none of the three finds anything, the
// answer says so honestly — "no test file identified", never a certified "no tests exist" (grain cannot see
// runtime coverage, only static naming/history/import evidence) — the same house style §037/§057 already
// established for other honest-negative disclosures.
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
const initRepo = prefix => { const tmp = mkdtempSync(join(tmpdir(), prefix)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };
// same recipe what-exact-match.test.mjs / what-honest-negative.test.mjs use to clear groupPartitions' 30-scope
// floor — below it no partition forms at all and every query, real symbols included, reads as "not found".
const fillers = (dir, n, ext = 'ts') => { for (let i = 1; i <= n; i++) w(dir, `src/filler${i}.${ext}`, `export function f${i}(): number { return ${i}; }\n`); };

// ===========================================================================================================
// repo A — (1) same-stem: `UpdateTodoList.cs` -> `UpdateTodoListTests.cs`, the ticket's own headline example.
// ===========================================================================================================
let tmpA, repoA;
before(() => {
  ({ tmp: tmpA, repo: repoA } = initRepo('grain-tested-by-samestem-'));
  w(repoA, 'src/Domain/UpdateTodoList.cs', 'namespace Domain;\npublic class UpdateTodoList\n{\n    public void Handle() { }\n}\n');
  w(repoA, 'tests/UpdateTodoListTests.cs', 'namespace Tests;\npublic class UpdateTodoListTests\n{\n    public void Handle_Works() { }\n}\n');
  fillers(repoA, 15);
  gitIn(repoA, 'add', '-A'); gitIn(repoA, 'commit', '-qm', 'add UpdateTodoList and its test');
  const st = grainIn(repoA, ['status']); assert.equal(st.code, 0, st.err);
});
after(() => { if (tmpA) rmSync(tmpA, { recursive: true, force: true }); });

test('(1) same-stem: `what UpdateTodoList` names the PascalCase-suffix test file', () => {
  const j = JSON.parse(grainIn(repoA, ['what', 'UpdateTodoList', '--json']).out);
  assert.ok(j.defined.some(d => d.rel === 'src/Domain/UpdateTodoList.cs'), JSON.stringify(j.defined));
  assert.ok(j.testedBy, `expected a testedBy signal: ${JSON.stringify(j)}`);
  assert.equal(j.testedBy.kind, 'same-stem', JSON.stringify(j.testedBy));
  assert.deepEqual(j.testedBy.files, ['tests/UpdateTodoListTests.cs']);

  const r = grainIn(repoA, ['what', 'UpdateTodoList']);
  const line = r.out.split('\n').find(l => l.startsWith('tested by:'));
  assert.ok(line, r.out);
  assert.equal(line, 'tested by: tests/UpdateTodoListTests.cs');
});

// ===========================================================================================================
// repo B — (2) cochange fallback, no same-stem candidate anywhere: `lib/express/collection.js` co-changes with
// `spec/spec.collection.js` in every commit (sup=9, commitsA=commitsB=9, confidence 1.0) — the ticket's own
// motivating cochange example. The declared symbol is `Collection` (capitalized) so it never accidentally
// segment-matches the spec file's own lowercase `collection` basename component, keeping this a clean fallback-
// only fixture (same-stem must find nothing here).
// ===========================================================================================================
let tmpB, repoB;
before(() => {
  ({ tmp: tmpB, repo: repoB } = initRepo('grain-tested-by-cochange-'));
  w(repoB, 'lib/express/collection.js', 'export class Collection {\n  push(x) { return x; }\n}\n');
  w(repoB, 'spec/spec.collection.js', 'export function helper() { return 1; }\n');
  fillers(repoB, 15, 'js');
  gitIn(repoB, 'add', '-A'); gitIn(repoB, 'commit', '-qm', 'base');
  for (let i = 1; i <= 8; i++) {
    w(repoB, 'lib/express/collection.js', `export class Collection {\n  push(x) { return x + ${i}; }\n}\n`);
    w(repoB, 'spec/spec.collection.js', `export function helper() { return ${i}; }\n`);
    gitIn(repoB, 'add', '-A'); gitIn(repoB, 'commit', '-qm', `collection change ${i}`);
  }
  const st = grainIn(repoB, ['status']); assert.equal(st.code, 0, st.err);
});
after(() => { if (tmpB) rmSync(tmpB, { recursive: true, force: true }); });

test('fixture sanity: no same-stem candidate exists for collection.js/spec.collection.js', () => {
  const j = JSON.parse(grainIn(repoB, ['what', 'Collection', '--json']).out);
  assert.ok(j.defined.some(d => d.rel === 'lib/express/collection.js'), JSON.stringify(j.defined));
});

test('(2) cochange fallback: `what Collection` names the co-changing spec file, never a same-stem claim', () => {
  const j = JSON.parse(grainIn(repoB, ['what', 'Collection', '--json']).out);
  assert.ok(j.testedBy, `expected a testedBy signal: ${JSON.stringify(j)}`);
  assert.equal(j.testedBy.kind, 'evidence', `must be the fallback, not a same-stem match: ${JSON.stringify(j.testedBy)}`);
  assert.equal(j.testedBy.files.length, 1, JSON.stringify(j.testedBy));
  assert.equal(j.testedBy.files[0].file, 'spec/spec.collection.js', JSON.stringify(j.testedBy));
  assert.equal(j.testedBy.files[0].dead, false);

  const r = grainIn(repoB, ['what', 'Collection']);
  const line = r.out.split('\n').find(l => l.startsWith('tested by:'));
  assert.ok(line, r.out);
  assert.match(line, /^tested by: spec\/spec\.collection\.js \(co-change\/import evidence, not a same-stem match\)$/, line);
});

// ===========================================================================================================
// repo C — (3) no coverage anywhere: no same-stem candidate, no cochange partner, no importing edge, and no
// test-like path in the whole repository. The honest answer must say so without certifying an absence grain
// cannot actually prove (it only ever looked at naming/history/import evidence, never runtime coverage).
// ===========================================================================================================
let tmpC, repoC;
before(() => {
  ({ tmp: tmpC, repo: repoC } = initRepo('grain-tested-by-none-'));
  w(repoC, 'src/domain/util.ts', 'export function calculateTotal(x: number): number { return x; }\n');
  fillers(repoC, 15);
  gitIn(repoC, 'add', '-A'); gitIn(repoC, 'commit', '-qm', 'add calculateTotal, no tests anywhere');
  const st = grainIn(repoC, ['status']); assert.equal(st.code, 0, st.err);
});
after(() => { if (tmpC) rmSync(tmpC, { recursive: true, force: true }); });

test('(3) honest negative: a genuinely untested symbol gets "no test file identified", never a certified absence', () => {
  const j = JSON.parse(grainIn(repoC, ['what', 'calculateTotal', '--json']).out);
  assert.ok(j.defined.some(d => d.rel === 'src/domain/util.ts'), JSON.stringify(j.defined));
  assert.equal(j.testedBy, null, JSON.stringify(j.testedBy));

  const r = grainIn(repoC, ['what', 'calculateTotal']);
  const line = r.out.split('\n').find(l => l.includes('tested by:'));
  assert.ok(line, r.out);
  assert.equal(line, 'map: tested by: no test file identified for this symbol — same-stem naming, co-change history and import edges found no match; that does not prove no test exists');
  assert.ok(/does not prove/.test(line), `must not read as a certified absence: ${line}`);
});
