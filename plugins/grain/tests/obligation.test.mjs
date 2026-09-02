// Ticket 073 — `grain obligation <path>`: what a new file under this (module, suffix) class has historically
// required (the "birth obligation"). Mined from git status alone (A/M/D/R), gated by the SAME machinery
// `changeArchetypes` already uses (KT/BIC contrast, the λ=8 display bound, CFG.minRaw=5 support floor) — no new
// tunable constant. See `.system/research/obligations-design.md` §3/§6 for the full derivation.
//
// Every fixture below creates its companion/noise files in the SCAFFOLD commit only, so the numbered "birth"
// commits add exactly one new class-file each and never accidentally trigger a second, spurious birth class from
// a companion file being created for the first time — that would silently change the `universe`/`idxCost` this
// test's own hand-worked bit arithmetic assumes.
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
const grain = (args, cwd) => { const r = spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const modelIn = repo => { assert.equal(grain(['status'], repo).code, 0); return JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8')); };
const rebuild = repo => { rmSync(join(repo, '.grain', 'cache'), { recursive: true, force: true }); return modelIn(repo); };

const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);

function commitAt(dir, msg, day) {
  const d = new Date(T0 + day * 86400000).toISOString();
  gitIn(dir, 'add', '-A');
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } });
}
function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
}

// ===== fixture A: 6 births under d/*.x, a companion (reg.txt) touched only by births, an ambient file (CHANGES)
// touched by EVERY commit, and 10 noise commits that touch neither reg.txt nor d/*.x — the base-rate contrast
// needs those noise commits to give reg.txt's whole-history rate (6/17) real daylight below its class-conditional
// rate (6/6), the same "excess over the base rate" shape bridgeBits/changeArchetypes already require.
//   n=6, k(reg.txt)=6, gp(reg.txt)=6, N=17 ⇒ data = 6·log2((6.5/7)/(6.5/18)) = 6·log2(2.571) ≈ 8.18 bits
//   universe = {reg.txt, CHANGES} ⇒ idxCost = ceil(log2(2)) = 1 ⇒ bits ≈ 8.18 − 0.5·log2(6) − 1 ≈ 5.89 > 0
//   display bound: (6+0.5)/(6+1) = 0.929 ≥ 1 − 1/8 = 0.875 ✓ ⇒ CERTIFIED, "reg.txt 6 of 6"
//   CHANGES: gp=17=N ⇒ its own rate already clears the λ bound (17.5/18=0.972≥0.875) independent of any class ⇒
//   its class-conditional contrast (6 of 6, same as its own base rate) earns no bits ⇒ reported as ambient, not specific
function buildFixtureA(dir) {
  initRepo(dir);
  w(dir, 'src/base.ts', 'export class Base {}\n');
  w(dir, 'reg.txt', 'reg v0\n');
  w(dir, 'CHANGES', 'v0\n');
  w(dir, 'noise.txt', 'noise v0\n');
  commitAt(dir, 'scaffold', 0);
  for (let i = 1; i <= 6; i++) {
    w(dir, `d/new${i}.x`, `payload ${i}\n`);
    w(dir, 'reg.txt', `reg v${i}\n`);
    w(dir, 'CHANGES', `v${i}\n`);
    commitAt(dir, `add d/new${i}.x`, i * 2);
  }
  for (let i = 1; i <= 10; i++) {
    w(dir, 'noise.txt', `noise v${i}\n`);
    w(dir, 'CHANGES', `v${6 + i}\n`);
    commitAt(dir, `noise ${i}`, 12 + i * 2);
  }
}

let tmp, repoA;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-obligation-'));
  repoA = join(tmp, 'a');
  buildFixtureA(repoA);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

// ===== test 1: a fixture where adding under d/ has touched reg.txt 6 of 6 times =====
test('1) obligation names a certified companion "6 of 6" for a class with 6/6 births touching it', () => {
  const m = modelIn(repoA);
  assert.ok(Array.isArray(m.obligations), 'model.obligations must exist');
  const rec = m.obligations.find(o => o.module === 'd' && o.suffix === 'x');
  assert.ok(rec, `expected a (module: d, suffix: x) obligation record, got: ${JSON.stringify(m.obligations)}`);
  assert.equal(rec.n, 6, `6 births expected, got ${rec.n}`);
  assert.equal(rec.rules.length, 1, `exactly one certified rule expected, got: ${JSON.stringify(rec.rules)}`);
  assert.equal(rec.rules[0].file, 'reg.txt');
  assert.equal(rec.rules[0].k, 6);
  assert.equal(rec.rules[0].n, 6);

  const r = grain(['obligation', 'd/new.x'], repoA);
  assert.equal(r.code, 0, `exit 0 expected — stderr:\n${r.err}\nstdout:\n${r.out}`);
  assert.match(r.out, /a new \*\.x under d\/ has come with:/, `expected the "has come with" header, got:\n${r.out}`);
  assert.match(r.out, /^\s+reg\.txt\s+6 of 6 such commits$/m, `expected reg.txt named 6 of 6, got:\n${r.out}`);
});

// ===== test 2: the same shape at 3 births is silent — CFG.minRaw = 5 =====
test('2) below CFG.minRaw (3 births) nothing certifies — silent, but says how many births it has', () => {
  const dir = join(tmp, 'floor');
  initRepo(dir);
  w(dir, 'src/base.ts', 'export class Base {}\n');
  w(dir, 'companion2.txt', 'v0\n');
  commitAt(dir, 'scaffold', 0);
  for (let i = 1; i <= 3; i++) {
    w(dir, `d/new${i}.x`, `payload ${i}\n`);
    w(dir, 'companion2.txt', `v${i}\n`);
    commitAt(dir, `add d/new${i}.x`, i * 2);
  }
  const m = modelIn(dir);
  const rec = (m.obligations || []).find(o => o.module === 'd' && o.suffix === 'x');
  if (rec) {
    assert.equal(rec.n, 3, `3 births expected, got ${rec.n}`);
    assert.equal(rec.rules.length, 0, `below CFG.minRaw (5), no rule may certify, got: ${JSON.stringify(rec.rules)}`);
  }
  const r = grain(['obligation', 'd/new.x'], dir);
  assert.equal(r.code, 0, r.err);
  assert.ok(!/companion2\.txt/.test(r.out), `companion2.txt must not be named as an obligation below the floor, got:\n${r.out}`);
  assert.ok(!/has come with:/.test(r.out), `no "has come with" header when nothing certifies, got:\n${r.out}`);
  assert.match(r.out, /born 3 times/, `must disclose the actual birth count (3), never silence with no reason, got:\n${r.out}`);
});

// ===== test 3: a file the whole repo touches is reported under ambient, never as a specific obligation =====
test('3) an ambient (repo-wide) file is reported separately from specific obligations, never merged in', () => {
  const m = modelIn(repoA);
  const rec = m.obligations.find(o => o.module === 'd' && o.suffix === 'x');
  assert.ok(rec.ambient.some(a => a.file === 'CHANGES'), `CHANGES expected under ambient, got: ${JSON.stringify(rec.ambient)}`);
  assert.ok(!rec.rules.some(r => r.file === 'CHANGES'), `CHANGES must NEVER be a specific rule, got: ${JSON.stringify(rec.rules)}`);

  const r = grain(['obligation', 'd/new.x'], repoA);
  const lines = r.out.split('\n');
  const comeWithIdx = lines.findIndex(l => /has come with:/.test(l));
  const ambientIdx = lines.findIndex(l => /^ambient \(this repo touches these with almost everything\):$/.test(l));
  assert.ok(ambientIdx > comeWithIdx, `ambient section expected after the specific-obligations header, got:\n${r.out}`);
  assert.match(lines[ambientIdx + 1], /^\s+CHANGES\s+17 of 17 commits$/, `CHANGES expected at its OWN global rate (17 of 17), got: ${lines[ambientIdx + 1]}`);
  // never appears among the specific rows (between the two headers)
  const specificRows = lines.slice(comeWithIdx + 1, ambientIdx);
  assert.ok(!specificRows.some(l => /CHANGES/.test(l)), `CHANGES must not appear in the specific block, got:\n${specificRows.join('\n')}`);
});

// ===== test 4: a rule whose named file is dead at HEAD does not speak =====
test('4) a companion deleted before HEAD is dropped from the answer entirely (liveness gate)', () => {
  const dir = join(tmp, 'dead');
  initRepo(dir);
  w(dir, 'src/base.ts', 'export class Base {}\n');
  w(dir, 'companion3.txt', 'v0\n');
  w(dir, 'noise.txt', 'v0\n');
  commitAt(dir, 'scaffold', 0);
  for (let i = 1; i <= 6; i++) {
    w(dir, `d/new${i}.x`, `payload ${i}\n`);
    w(dir, 'companion3.txt', `v${i}\n`);
    commitAt(dir, `add d/new${i}.x`, i * 2);
  }
  for (let i = 1; i <= 10; i++) {
    w(dir, 'noise.txt', `v${i}\n`);
    commitAt(dir, `noise ${i}`, 20 + i * 2);
  }
  // sanity: the rule is certified while the file is still alive
  const before = modelIn(dir);
  const recBefore = before.obligations.find(o => o.module === 'd' && o.suffix === 'x');
  assert.ok(recBefore.rules.some(r => r.file === 'companion3.txt'), `fixture sanity — companion3.txt must certify BEFORE deletion, got: ${JSON.stringify(recBefore)}`);

  gitIn(dir, 'rm', '-q', 'companion3.txt');
  commitAt(dir, 'retire companion3', 60);
  const after = rebuild(dir);
  const recAfter = after.obligations.find(o => o.module === 'd' && o.suffix === 'x');
  assert.ok(recAfter, 'the class record itself must still exist (births are historical facts)');
  assert.equal(recAfter.n, 6, 'the birth count does not change just because a companion died');
  assert.ok(!recAfter.rules.some(r => r.file === 'companion3.txt'), `a dead file must never speak, got: ${JSON.stringify(recAfter.rules)}`);
  assert.ok(!recAfter.ambient.some(a => a.file === 'companion3.txt'), `a dead file must not appear as ambient either, got: ${JSON.stringify(recAfter.ambient)}`);

  const r = grain(['obligation', 'd/new.x'], dir);
  assert.equal(r.code, 0, r.err);
  assert.ok(!/companion3\.txt/.test(r.out), `a dead companion must never be named, got:\n${r.out}`);
});

// ===== test 5: a renamed file is not counted as a birth =====
test('5) a file renamed INTO the class directory does not count as a birth', () => {
  const dir = join(tmp, 'renamed');
  initRepo(dir);
  w(dir, 'src/base.ts', 'export class Base {}\n');
  w(dir, 'misc/old.x', 'old content, never touched again until the rename\n');
  w(dir, 'companion4.txt', 'v0\n');
  w(dir, 'noise.txt', 'v0\n');
  commitAt(dir, 'scaffold', 0);
  for (let i = 1; i <= 5; i++) {
    w(dir, `d/new${i}.x`, `payload ${i}\n`);
    w(dir, 'companion4.txt', `v${i}\n`);
    commitAt(dir, `add d/new${i}.x`, i * 2);
  }
  for (let i = 1; i <= 10; i++) {
    w(dir, 'noise.txt', `v${i}\n`);
    commitAt(dir, `noise ${i}`, 20 + i * 2);
  }
  gitIn(dir, 'mv', 'misc/old.x', 'd/moved.x'); // a rename INTO d/*.x — must never be mined as a 6th birth
  commitAt(dir, 'reorganize misc/old.x into d/', 60);

  const m = modelIn(dir);
  const rec = m.obligations.find(o => o.module === 'd' && o.suffix === 'x');
  assert.ok(rec, `expected a (d, x) obligation record, got: ${JSON.stringify(m.obligations)}`);
  // if the rename were (incorrectly) counted, n would be 6 and the display bound (5+0.5)/(6+1)=0.786 < 0.875
  // would fail, silencing the rule entirely — asserting n===5 AND that the rule certifies proves both at once
  assert.equal(rec.n, 5, `the rename must not be counted as a birth — expected n=5, got ${rec.n}`);
  assert.ok(rec.rules.some(r => r.file === 'companion4.txt' && r.k === 5 && r.n === 5), `expected companion4.txt certified at 5 of 5, got: ${JSON.stringify(rec.rules)}`);

  const r = grain(['obligation', 'd/new.x'], dir);
  assert.match(r.out, /^\s+companion4\.txt\s+5 of 5 such commits$/m, `expected "5 of 5", got:\n${r.out}`);
});

// ===== test 7: empty history, and a class with zero births, each say so =====
test('7a) a repository with no git history at all says so, never a hollow zero', () => {
  const dir = join(tmp, 'no-history');
  mkdirSync(dir, { recursive: true });
  w(dir, 'src/base.ts', 'export class Base {}\n'); // tracked-file conventions still apply — no git init at all
  const r = grain(['obligation', 'd/new.x'], dir);
  assert.equal(r.code, 0, `exit 0 expected — stderr:\n${r.err}`);
  assert.match(r.out, /no recorded births/, `must name the absence honestly, got:\n${r.out}`);
  assert.ok(!/\(complete\)/.test(r.out), `must never say "(complete)" — see .system/decisions.md, got:\n${r.out}`);
});
test('7b) a class with zero births (in a repo WITH plenty of other history) says so too', () => {
  const r = grain(['obligation', 'zzznotreal/file.qqqq'], repoA);
  assert.equal(r.code, 0, `exit 0 expected — stderr:\n${r.err}`);
  assert.match(r.out, /no recorded births/, `must name the absence honestly, got:\n${r.out}`);
  assert.ok(!/\(complete\)/.test(r.out), `must never say "(complete)", got:\n${r.out}`);
});

// ===== test 8: --json shape is stable and carries schemaNotes =====
test('8) --json carries a stable schema with schemaNotes, matching export.mjs\'s own convention', () => {
  const r = grain(['obligation', 'd/new.x', '--json'], repoA);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.schema, 'grain-obligation/1');
  assert.equal(j.path, 'd/new.x');
  assert.equal(j.module, 'd');
  assert.equal(j.suffix, 'x');
  assert.equal(j.births, 6);
  assert.equal(typeof j.asOf, 'string');
  assert.ok(Array.isArray(j.rules) && j.rules.length === 1);
  assert.deepEqual(Object.keys(j.rules[0]).sort(), ['bits', 'file', 'k', 'n', 'share'].sort());
  assert.equal(j.rules[0].file, 'reg.txt');
  assert.equal(j.rules[0].k, 6);
  assert.equal(j.rules[0].n, 6);
  assert.ok(Array.isArray(j.ambient) && j.ambient.some(a => a.file === 'CHANGES'));
  assert.ok(j.schemaNotes && typeof j.schemaNotes === 'object', `schemaNotes expected, got: ${JSON.stringify(j)}`);
  for (const key of ['births', 'rules', 'ambient']) assert.equal(typeof j.schemaNotes[key], 'string', `schemaNotes.${key} expected, got: ${JSON.stringify(j.schemaNotes)}`);

  // --top is accepted and never changes the reported birth count, only how many rows of each set are rendered
  const r2 = grain(['obligation', 'd/new.x', '--top', '1', '--json'], repoA);
  const j2 = JSON.parse(r2.out);
  assert.equal(j2.rules.length, 1);
  assert.equal(j2.ambient.length, 1);
  assert.equal(j2.births, 6, '--top caps the rendered lists, never the reported birth count');
});

// ===== wiring: `check <file> --as <path>` gains an obligation line =====
// A real grammar extension is needed here (unlike the pure data-layer tests above): `checkFile` must assign a
// PARTITION to the simulated path before cmdCheck ever reaches the obligation line, and grain.mjs's early
// no-grammar/no-partition returns exit before that — this fixture establishes a normal TS partition under `d/`
// so partition assignment succeeds, then asks about a NEW file in that same class.
function buildFixtureCheckWiring(dir) {
  initRepo(dir);
  w(dir, 'reg5.txt', 'v0\n');
  w(dir, 'noise5.txt', 'v0\n');
  commitAt(dir, 'scaffold', 0);
  // groupPartitions (core.mjs) merges directories under 100 scopes into one bucket only when the pooled total
  // reaches >= 30 scopes — a handful of one-method classes never clears that floor and `checkFile` reports "no
  // partition covers this file" (an early return `cmdCheck` takes BEFORE the obligation line, so this fixture
  // must genuinely establish a partition, not just birth history). 6 classes x 6 methods = 42 scopes.
  const methods = ['run', 'stop', 'name', 'describe', 'reset', 'clone'];
  const body = c => `export class ${c} {\n${methods.map(m => `  ${m}(): void {}`).join('\n')}\n}\n`;
  for (let i = 1; i <= 6; i++) {
    w(dir, `d/Class${i}.ts`, body(`Class${i}`));
    w(dir, 'reg5.txt', `v${i}\n`);
    commitAt(dir, `add d/Class${i}.ts`, i * 2);
  }
  for (let i = 1; i <= 10; i++) {
    w(dir, 'noise5.txt', `v${i}\n`);
    commitAt(dir, `noise ${i}`, 20 + i * 2);
  }
}
test('wiring) `check --as` names the top certified obligation for the simulated path', () => {
  const dir = join(tmp, 'check-wiring');
  buildFixtureCheckWiring(dir);
  // fixture sanity: the data layer alone must already certify this before asking `check` to surface it
  const rec = modelIn(dir).obligations.find(o => o.module === 'd' && o.suffix === 'ts');
  assert.ok(rec && rec.rules.some(x => x.file === 'reg5.txt'), `fixture sanity — expected reg5.txt certified for (d, ts), got: ${JSON.stringify(rec)}`);

  w(dir, 'scratch-source.ts', 'export class ClassNew {\n  run(): void {}\n  stop(): void {}\n  name(): void {}\n  describe(): void {}\n  reset(): void {}\n  clone(): void {}\n}\n');
  const r = grain(['check', 'scratch-source.ts', '--as', 'd/ClassNew.ts'], dir);
  assert.equal(r.code, 0, `exit 0 expected — stderr:\n${r.err}\nstdout:\n${r.out}`);
  assert.match(r.out, /obligation: a new \*\.ts under d\/ has come with reg5\.txt \(6 of 6\)/, `expected an obligation line, got:\n${r.out}`);
});

// ===== wiring: `map --json` gains the obligation table =====
test('wiring) `map --json` carries the full obligation table alongside concepts/changes/edges', () => {
  const r = grain(['map', '--json'], repoA);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.ok(Array.isArray(j.obligations), `map --json must carry obligations[], got: ${JSON.stringify(Object.keys(j))}`);
  const rec = j.obligations.find(o => o.module === 'd' && o.suffix === 'x');
  assert.ok(rec, `expected the (d, x) record inside map --json, got: ${JSON.stringify(j.obligations)}`);
  assert.equal(rec.n, 6);
  assert.ok(rec.rules.some(x => x.file === 'reg.txt'));
});
