// J5.1, issue 258 — the deviation's fix rate. An accepted convention says what the repo does; `f.cost` says how often
// EDITS to the scopes that break it were fix commits, against edits to the fact's whole observable population
// (conform ∪ deviants). It is an association, never a cost: the unit is one modification, because a scope edited
// more often meets more fix commits whatever it does, and "the scope had any fix" measured exactly that exposure.
//
// One cell per accepted fact, K = 2 (a fix edit : a plain edit), contrasted against a parent tally that CONTAINS the
// child's own counts — the shape `mine()`'s `_all:` cell, J4.1's `glob` and the bridge's base rate use. Observable
// means a HEAD scope with its own `H.lc` row and `ageFn(s) >= CFG.freshDays`, on both sides.
//
// The gates, in order: `bits > 0` (KT/BIC codelength gain minus one repo-wide `idxCostD`), an EXCESS and never a
// deficit, and the loss bound on that direction: the KT posterior Beta(fix + ½, plain + ½) of the deviants' per-edit
// fix rate may put at most 1/λ of its mass at or below the population's rate.
//
// Every repo has the same shape: `alpha/` holds 120 established `Tn.ts` classes whose `run()` calls `validate()`,
// twelve of which do not; `beta/` holds 20 unrelated files that make the MDL cut fall at the top level, so `alpha/`
// becomes a directory card that owns the fact. An edit gives a scope one extra, uniquely named call: `L.mods` and
// `L.fix` count BODY-HASH modifications, and a fix is an edit made by a `fix:` commit.
//
//   (a) scopes 0-59 edited once by `feat: tweak` (every deviant among them), then 11 of 12 deviants and 2 conformers
//       edited by fix commits: deviants 11 fix edits of 23, the population 13 of 73.
//       kt_local = 11.5/24 / 12.5/24 · kt_glob = 13.5/74 / 60.5/74
//       data = 11·log2((11.5/24)/(13.5/74)) + 12·log2((12.5/24)/(60.5/74)) = 15.3248 − 7.8062 = 7.5186
//       bits = 7.5186 − 0.5·log2(23) − 1 = 4.26 → speaks; (11/23)/(13/73) = 2.69 → "2.7×"
//   (b) the same per-edit rate on both sides (2 of 14 and 20 of 140): silent.
//   (c) exposure: every deviant edited ten times (nine plain edits, one fix), every conformer twice (one plain, one
//       fix for twelve of them) — one fix in ten edits on both sides. The old per-scope label read 12 of 12 deviants
//       "fixed" against 24 of 120 and spoke at 5×; per edit it is 12 of 120 against 24 of 240, silent.
//   (e) fixture (a)'s HEAD with its plain edits made and undone before HEAD, for `where`: 11 fix edits of 35 against
//       13 of 133, (11/35)/(13/133) = 3.2×.
//   (d) the age confound: deviants born 334 days before HEAD, conformers 40, every edit a fix on both sides: silent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { factNotes } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repoA, repoB, repoC, repoD, repoE;

const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'Dev', GIT_AUTHOR_EMAIL: 'dev@x', GIT_COMMITTER_NAME: 'Dev', GIT_COMMITTER_EMAIL: 'dev@x', TZ: 'UTC', GIT_AUTHOR_DATE: `${iso}T12:00:00Z`, GIT_COMMITTER_DATE: `${iso}T12:00:00Z` });
const gitIn = (repo, iso, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...dateEnv(iso) } });
const w = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = (repo, args) => spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' });
const grainOut = (repo, args) => { const r = grain(repo, args); assert.equal(r.status, 0, r.stdout + r.stderr); return (r.stdout || '').replace(/\n$/, ''); };
const modelIn = repo => { assert.equal(grain(repo, ['status']).status, 0); return JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8')); };
const validateFact = model => { const fs2 = model.partitions.flatMap(p => p.facts).filter(f => f.pid === 'auto.call:validate');
  assert.equal(fs2.length, 1, `exactly one accepted \`calls validate\` fact expected, got ${fs2.length}`); return fs2[0]; };

// a `run()` body: the conforming one calls `validate()`, the deviant one does not; every edit appends one uniquely
// named call, which changes the body hash (and so bumps `L.mods`, and `L.fix` in a fix commit) without changing which
// side of the fact the scope is on
const cls = (i, body) => `export class T${i} {\n  run() {\n${body}  }\n}\n`;
const calls = (i, edits) => edits.map(e => `    ${e}${i}();\n`).join('');
const conform = (i, edits = []) => cls(i, `    validate();\n${calls(i, edits)}    return "ok";\n`);
const deviant = (i, edits = []) => cls(i, `${calls(i, edits)}    return "ok";\n`);
const DEVIANTS = 12, TOTAL = 120; // 108 conformers: (108 + 0.5) / (120 + 1) = .897 ≥ .875, so the fact itself is accepted
const commit = (repo, iso, msg) => { gitIn(repo, iso, 'add', '-A'); gitIn(repo, iso, 'commit', '-qm', msg); };
const initRepo = name => { const repo = join(tmp, name); mkdirSync(repo);
  gitIn(repo, '2025-01-01', 'init', '-q', '-b', 'main'); gitIn(repo, '2025-01-01', 'config', 'commit.gpgsign', 'false');
  for (let j = 0; j < 20; j++) w(repo, `beta/B${j}.ts`, `export class B${j} {\n  emit() {\n    return ${j};\n  }\n}\n`);
  return repo; };
// `edits(i)` lists the calls scope i carries so far — one name per edit it has had
const writeAll = (repo, edits, { from = 0, to = TOTAL } = {}) => {
  for (let i = from; i < to; i++) w(repo, `alpha/T${i}.ts`, i < DEVIANTS ? deviant(i, edits(i)) : conform(i, edits(i))); };
const isDev = i => i < DEVIANTS;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-devcost-'));

  // (a) one plain edit everywhere, then 11 of 12 deviants and 2 of 108 conformers edited by fix commits; plus six
  // conformers born three days before HEAD (inside the fact, outside the cell)
  repoA = initRepo('a');
  writeAll(repoA, () => []); commit(repoA, '2026-01-05', 'feat: the things');
  const tw = i => (i < 60 ? ['tweak'] : []);
  writeAll(repoA, tw); commit(repoA, '2026-01-20', 'feat: tweak half the things');
  writeAll(repoA, i => (isDev(i) && i < 11 ? [...tw(i), 'note'] : tw(i))); commit(repoA, '2026-02-01', 'fix: handle the empty payload');
  writeAll(repoA, i => ((isDev(i) && i < 11) || i === 20 || i === 21 ? [...tw(i), 'note'] : tw(i))); commit(repoA, '2026-02-05', 'fix: guard the null case');
  writeAll(repoA, () => [], { from: TOTAL, to: TOTAL + 6 }); commit(repoA, '2026-02-26', 'feat: six more things');
  w(repoA, 'NOTES.md', 'notes\n'); commit(repoA, '2026-03-01', 'chore: notes');

  // (e) fixture (a) with its plain edits undone before HEAD: scopes 0-59 gain a call in one feature commit and lose
  // it in the next, so HEAD holds exactly the code fixture (a) held before issue 258 and `where alpha` ranks the
  // directory card that owns the fact first (edits that stay in HEAD change the partition cut and the card order)
  repoE = initRepo('e');
  writeAll(repoE, () => []); commit(repoE, '2026-01-05', 'feat: the things');
  writeAll(repoE, i => (i < 60 ? ['tweak'] : [])); commit(repoE, '2026-01-20', 'feat: tweak half the things');
  writeAll(repoE, () => []); commit(repoE, '2026-01-25', 'feat: undo the tweak');
  writeAll(repoE, i => (isDev(i) && i < 11 ? ['note'] : [])); commit(repoE, '2026-02-01', 'fix: handle the empty payload');
  writeAll(repoE, i => ((isDev(i) && i < 11) || i === 20 || i === 21 ? ['note'] : [])); commit(repoE, '2026-02-05', 'fix: guard the null case');
  writeAll(repoE, () => [], { from: TOTAL, to: TOTAL + 6 }); commit(repoE, '2026-02-26', 'feat: six more things');
  w(repoE, 'NOTES.md', 'notes\n'); commit(repoE, '2026-03-01', 'chore: notes');

  // (b) one plain edit everywhere, then 2 of 12 deviants and 18 of 108 conformers fixed — the same per-edit rate
  repoB = initRepo('b');
  writeAll(repoB, () => []); commit(repoB, '2026-01-05', 'feat: the things');
  writeAll(repoB, () => ['tweak']); commit(repoB, '2026-01-20', 'feat: tweak the things');
  const fixedB = i => (isDev(i) ? i < 2 : i < DEVIANTS + 18);
  writeAll(repoB, i => (fixedB(i) ? ['tweak', 'note'] : ['tweak'])); commit(repoB, '2026-02-01', 'fix: handle the empty payload');
  w(repoB, 'NOTES.md', 'notes\n'); commit(repoB, '2026-03-01', 'chore: notes');

  // (c) exposure: deviants edited nine more times, then one fix commit touching every deviant and 12 conformers
  repoC = initRepo('c');
  writeAll(repoC, () => []); commit(repoC, '2026-01-05', 'feat: the things');
  writeAll(repoC, () => ['tweak']); commit(repoC, '2026-01-10', 'feat: tweak the things');
  const plain = r => Array.from({ length: r }, (_, k) => `step${k}x`);
  for (let r = 1; r <= 9; r++) { writeAll(repoC, i => (isDev(i) ? ['tweak', ...plain(r)] : ['tweak'])); commit(repoC, `2026-01-${String(10 + r).padStart(2, '0')}`, `feat: rework the odd ones ${r}`); }
  writeAll(repoC, i => (isDev(i) ? ['tweak', ...plain(9), 'note'] : i < DEVIANTS + 12 ? ['tweak', 'note'] : ['tweak'])); commit(repoC, '2026-02-01', 'fix: guard the null case');
  w(repoC, 'NOTES.md', 'notes\n'); commit(repoC, '2026-03-01', 'chore: notes');

  // (d) the age confound: deviants born 334 days before HEAD, conformers 40 — every edit a fix, on both sides
  repoD = initRepo('d');
  writeAll(repoD, () => [], { to: DEVIANTS }); commit(repoD, '2025-04-01', 'feat: the first twelve');
  writeAll(repoD, i => (i < 6 ? ['note'] : []), { to: DEVIANTS }); commit(repoD, '2025-08-01', 'fix: the early breakage');
  writeAll(repoD, i => (i < 6 ? ['note'] : [])); commit(repoD, '2026-01-20', 'feat: the rest of the things');
  writeAll(repoD, i => (i < 6 || (i >= DEVIANTS && i < DEVIANTS + 6) ? ['note'] : [])); commit(repoD, '2026-02-10', 'fix: guard the null case');
  w(repoD, 'NOTES.md', 'notes\n'); commit(repoD, '2026-03-01', 'chore: notes');
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(a) edits to deviants that were fixes more often are named, with edit counts and the ratio', () => {
  const f = validateFact(modelIn(repoA));
  assert.equal(f.exp, 'true'); assert.equal(f.sraw, TOTAL, 'the printed population is the established one');
  assert.deepEqual(f.cost, { k: 11, n: 23, baseK: 13, baseN: 73, scopes: 12, fixScopes: 11, bits: 4.26 },
    `11 fix edits of the deviants' 23 against 13 of the population's 73, worth 4.26 bits — got ${JSON.stringify(f.cost)}`);
  // baseN 73 = 60 plain + 13 fix edits: the six conformers born three days before HEAD are inside the fact and outside the cell
  assert.equal(f.raw, TOTAL + 6, 'the raw population does include the six young conformers');
});

// `where` is checked on fixture (e): with half the population still carrying a uniquely named call at HEAD, `where
// alpha` here ranks file cards first.
test('(a) factNotes and `check` render the clause as an association', () => {
  const f = validateFact(modelIn(repoA));
  assert.match(factNotes(f), / · edits to deviants were fixes 2\.7× as often \(11 of 23 edits vs 13 of 73; fixes in 11 of 12 deviants\)$/);
  const check = grainOut(repoA, ['check', '--all', 'alpha/T0.ts']);
  assert.match(check, /\n {2}\(held since [\d-]+, last reinforced [\d-]+ · edits to deviants were fixes 2\.7× as often \(11 of 23 edits vs 13 of 73; fixes in 11 of 12 deviants\)\)/,
    `\`check\` must carry the clause under the deviation, got:\n${check}`);
  assert.doesNotMatch(factNotes(f) + check, /cost/, 'never worded as a cost');
});

test('(e) `where` renders the clause on the directory card that owns the fact', () => {
  const f = validateFact(modelIn(repoE));
  assert.deepEqual({ ...f.cost, bits: undefined }, { k: 11, n: 35, baseK: 13, baseN: 133, scopes: 12, fixScopes: 11, bits: undefined },
    `11 fix edits of the deviants' 35 (two plain each, eleven fixes) against 13 of 133 — got ${JSON.stringify(f.cost)}`);
  const where = grainOut(repoE, ['where', 'alpha']);
  assert.match(where, /methods here call `validate` — 90% of 120 · held since [\d-]+, last reinforced [\d-]+ · edits to deviants were fixes 3\.2× as often \(11 of 35 edits vs 13 of 133; fixes in 11 of 12 deviants\)/,
    `\`where\` must carry the clause on the fact's bullet, got:\n${where}`);
});

test('(b) an even per-edit fix rate between the deviants and the population says nothing', () => {
  const f = validateFact(modelIn(repoB));
  assert.equal(f.cost, undefined, `2 of 14 against 20 of 140 is the same rate — got ${JSON.stringify(f.cost)}`);
});

test('(c) deviants that were merely edited more often, at the same per-edit fix rate, earn no clause', () => {
  const f = validateFact(modelIn(repoC));
  assert.equal(f.cost, undefined, `12 of 120 edits against 24 of 240 is exposure, not an excess — got ${JSON.stringify(f.cost)}`);
});

test('(d) deviants that are merely OLDER earn no clause', () => {
  const f = validateFact(modelIn(repoD));
  assert.equal(f.cost, undefined, `an exposure difference is not an association — got ${JSON.stringify(f.cost)}`);
});

test('(e) an incremental refresh yields a byte-identical `cost` to a full rebuild', () => {
  w(repoA, `alpha/T${TOTAL + 6}.ts`, conform(TOTAL + 6));
  commit(repoA, '2026-03-05', 'feat: one more thing');
  const incremental = JSON.stringify(validateFact(modelIn(repoA)).cost);
  assert.notEqual(incremental, undefined, 'the comparison must have something to compare');
  rmSync(join(repoA, '.grain', 'cache'), { recursive: true });
  assert.equal(JSON.stringify(validateFact(modelIn(repoA)).cost), incremental, 'a full rebuild must equal the incremental model byte for byte');
});
