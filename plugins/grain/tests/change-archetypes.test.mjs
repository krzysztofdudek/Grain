// J4.1 — change archetypes: the recurring SHAPES of past commits. `how` already cites individual example commits;
// nothing in the model could say "changes like this one always touch an enum, a DTO, a fixture and a test". This
// test builds a history in which exactly two such shapes exist, and asserts that the model finds both, names the
// cells that CARRY each shape, and stays silent about the cells the two shapes share.
//
// The fixture is built here rather than reused from tests/fixtures/build-fixture.mjs on purpose: every assertion
// below is about which commits cluster and which cells clear the codelength bound, so the test must own every
// commit message and every file name in the repository.
//
// ===== fixture arithmetic (verify this still holds if CFG.minRaw / CFG.lambda / the cell alphabet change) =====
// 23 commits → N = 23 footprints. Candidate-cell universe = every cell present in ≥ CFG.minRaw (5) of them:
// 4 cells both shapes share (m:src/dto, k:dto.ts, m:tests, k:test.ts) + 1 group cell they share + 6 cells owned by
// the handler shape + 8 owned by the status shape ≈ 20–21 → idxCost = ⌈log2 21⌉ = 5 bits. The 6 noise commits touch
// a module and a suffix nobody else touches, so none of their cells reaches 5 and none enters the universe.
//
// A cell present in all 8 members of an 8-commit archetype and in 8 of the 23 footprints repo-wide:
//   data = 8·log2( (8+0.5)/(8+1) ÷ (8+0.5)/(23+1) ) = 8·log2(0.9444/0.3542) = 11.32 bits
//   bits = 11.32 − 0.5·log2(8) − 5 = 11.32 − 1.50 − 5 = 4.82 > 0  → certified (λ: 0.944 ≥ 1 − 1/8 = 0.875 ✓)
// The SAME cell, unanimous inside the archetype but touched by 16 of the 23 footprints (the two shapes share it):
//   data = 8·log2(0.9444/0.6875) = 3.66 bits;  bits = 3.66 − 1.50 − 5 = −2.84 ≤ 0 → silent, as it must be.
// So the fixture clears the bound with ~4.8 bits of headroom on its carrying cells and fails it by ~2.8 on its
// shared ones: the universe would have to grow past C = 2^9 = 512 candidate cells before a carrying cell went quiet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { induceRoles } from '../engine/core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const grain = (args, cwd) => { const r = spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const modelIn = repo => { assert.equal(grain(['status'], repo).code, 0); return JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8')); };

const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
const Cap = s => s[0].toUpperCase() + s.slice(1);

// 23 commits: 1 scaffold · 8 "add handler <name>" (handler + dto + test) · 8 "add status <name>" (enum + dto +
// fixture + test) · 6 noise. The two shapes share `src/dto/` and `tests/` — the point of the fixture is that the
// SHARED places must not be certified for either shape, only the places each shape owns.
// Every noise commit touches a module and a file suffix no other commit touches, and declares scopes whose names
// share no vocabulary with each other: they may or may not agglomerate into one cluster, but no cell of theirs can
// ever reach a majority of that cluster, so the archetype (if one forms at all) certifies nothing and is dropped.
const HANDLERS = ['create', 'cancel', 'ship', 'refund', 'archive', 'restore', 'split', 'merge'];
const STATUSES = ['Pending', 'Approved', 'Rejected', 'Escrowed', 'Settled', 'Voided', 'Frozen', 'Lapsed']; // deliberately share NO name stem with HANDLERS: a status whose name tokenizes like a handler puts its scopes in the handler's role group and splits its own shape's footprint
const NOISE = [
  ['alpha', 'util', ['compress', 'inflate']],
  ['beta', 'helper', ['schedule', 'cancelTimer']],
  ['gamma', 'client', ['dial', 'hangup']],
  ['delta', 'guard', ['permit', 'refuse']],
  ['epsilon', 'mapper', ['flatten', 'nest']],
  ['zeta', 'runner', ['spawn', 'reap']],
];

// One method per status in the enum and the fixture (a scope BORN by each commit); one growing method in the dto and
// the test (a scope whose BODY each commit changes). Not decoration: nine `is<Status>()` twins are mutually
// equidistant under `jacW`, so the MDL agglomeration splits them at an arbitrary tie and whichever twin becomes the
// second cluster's medoid is the one commit whose footprint then differs from its own shape's other seven.
const writeStatuses = (dir, names) => {
  w(dir, 'src/enums/order-status.enum.ts', `export class OrderStatus {\n${names.map(x => `  static ${x}(): string { return '${x}'; }`).join('\n')}\n}\n`);
  w(dir, 'src/dto/order.dto.ts', `export class OrderDto {\n  id = '';\n  known(): boolean { return [${names.map(x => `'${x}'`).join(', ')}].includes(this.id); }\n}\n`);
  w(dir, 'tests/fixtures/order.fixture.ts', `${names.map(x => `export function make${x}Order(): { id: string } { return { id: '${x}' }; }`).join('\n')}\n`);
  w(dir, 'tests/order.test.ts', `export function checkOrders(): boolean { return [${names.map(x => `make${x}Order()`).join(', ')}].every(o => o.id.length > 0); }\n`); };

function buildFixture(dir) {
  let day = 0;
  const commit = msg => { day += 2; const d = new Date(T0 + day * 86400000).toISOString();
    gitIn(dir, 'add', '-A');
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } }); };

  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  w(dir, 'src/core/base.ts', `export class Base {\n  id(): string { return ''; }\n  kind(): string { return 'base'; }\n}\n`);
  writeStatuses(dir, ['Draft']);   // the status files exist from the start, so every "add status" commit is the SAME
  commit('core scaffolding');      // change to the same four files — a shape, not a creation followed by seven edits

  const writeHandler = n => {
    w(dir, `src/handlers/${n}.handler.ts`, `export class ${Cap(n)}Handler {\n  handle(input: string): string { return input + '${n}'; }\n  name(): string { return '${n}'; }\n}\n`);
    w(dir, `src/dto/${n}.dto.ts`, `export class ${Cap(n)}Dto {\n  payload = '';\n  valid(): boolean { return this.payload.length > 0; }\n  render(): string { return this.payload; }\n}\n`);
    w(dir, `tests/${n}.test.ts`, `export function test${Cap(n)}(): boolean { return true; }\nexport function bench${Cap(n)}(): number { return 1; }\n`); };

  const grown = ['Draft'];
  for (let i = 0; i < 8; i++) {
    writeHandler(HANDLERS[i]); commit(`add handler ${HANDLERS[i]}`);
    grown.push(STATUSES[i]); writeStatuses(dir, grown); commit(`add status ${STATUSES[i].toLowerCase()}`);
    if (i < NOISE.length) { const [g, suf, ms] = NOISE[i];
      w(dir, `src/${g}/${g}.${suf}.ts`, `export class ${Cap(g)}${Cap(suf)} {\n${ms.map((m2, k) => `  ${m2}(v: number): number { return v + ${k}; }`).join('\n')}\n}\n`);
      commit(`rework ${g} ${suf} internals`); } }
}

let tmp, repo, plain;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-shapes-'));
  repo = join(tmp, 'fixture'); buildFixture(repo);
  // (c)'s subject: the same source tree with no git history at all
  plain = join(tmp, 'plain'); mkdirSync(plain, { recursive: true });
  for (const n of HANDLERS) {
    w(plain, `src/handlers/${n}.handler.ts`, `export class ${Cap(n)}Handler {\n  handle(input: string): string { return input + '${n}'; }\n  name(): string { return '${n}'; }\n}\n`);
    w(plain, `src/dto/${n}.dto.ts`, `export class ${Cap(n)}Dto {\n  payload = '';\n  valid(): boolean { return this.payload.length > 0; }\n  render(): string { return this.payload; }\n}\n`); }
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

const cellsOf = a => a.cells.filter(c => c.certified).map(c => c.cell).sort();
const archWith = (m, cell) => (m.changeArchetypes || []).find(a => cellsOf(a).includes(cell));

// ===== (a) the two shapes, their certified cells, and the silence of everything they share =====
test('(a) two change archetypes are induced, each certified on the places it OWNS and silent on the places both shapes touch', () => {
  const m = modelIn(repo);
  assert.ok(Array.isArray(m.changeArchetypes), 'model.changeArchetypes must exist');
  assert.equal(m.changeArchetypes.length, 2, `exactly two shapes expected (the 6 noise commits certify nothing), got:\n${JSON.stringify(m.changeArchetypes, null, 1)}`);

  const handler = archWith(m, 'm:src/handlers'), status = archWith(m, 'm:src/enums');
  assert.ok(handler, `one shape must be certified on m:src/handlers, got: ${JSON.stringify(m.changeArchetypes.map(cellsOf))}`);
  assert.ok(status, `one shape must be certified on m:src/enums, got: ${JSON.stringify(m.changeArchetypes.map(cellsOf))}`);
  assert.notEqual(handler.id, status.id, 'the two shapes must be distinct archetypes');
  assert.equal(handler.n, 8, `the handler shape covers the 8 "add handler" commits, got n=${handler.n}`);
  assert.equal(status.n, 8, `the status shape covers the 8 "add status" commits, got n=${status.n}`);

  const hc = cellsOf(handler), sc = cellsOf(status);
  for (const cell of ['m:src/handlers', 'k:handler.ts']) assert.ok(hc.includes(cell), `the handler shape must certify ${cell}, got ${hc.join(' ')}`);
  for (const cell of ['m:src/enums', 'k:enum.ts', 'm:tests/fixtures', 'k:fixture.ts']) assert.ok(sc.includes(cell), `the status shape must certify ${cell}, got ${sc.join(' ')}`);
  // the shared places: unanimous INSIDE each shape (8 of 8), but touched by 16 of the 23 footprints repo-wide —
  // the contrast branch must read them as the repository's base rate, not as either shape's signature
  for (const cell of ['m:src/dto', 'k:dto.ts', 'm:tests', 'k:test.ts'])
    for (const [name, cs] of [['handler', hc], ['status', sc]])
      assert.ok(!cs.includes(cell), `${cell} is touched by BOTH shapes and must not be certified for the ${name} shape, got ${cs.join(' ')}`);
  // every shape names at least one role group, not only paths and suffixes
  assert.ok(hc.some(c => c.startsWith('g:')) && sc.some(c => c.startsWith('g:')), `both shapes must certify a g: role cell, got ${hc.join(' ')} / ${sc.join(' ')}`);

  for (const a of m.changeArchetypes) {
    // the FULL cell bag is persisted (J4.2 measures jacW against it), each cell flagged certified or not
    assert.ok(a.cells.some(c => !c.certified), `the un-filtered cell bag must be persisted, not only the certified subset: ${JSON.stringify(a.cells)}`);
    for (const c of a.cells) { assert.equal(typeof c.k, 'number'); assert.equal(typeof c.share, 'number'); assert.equal(typeof c.bits, 'number'); assert.equal(typeof c.certified, 'boolean'); }
    for (const c of a.cells.filter(x => x.certified)) assert.ok(c.k * 2 > a.n, `a certified cell must hold in a MAJORITY of the shape's members: ${JSON.stringify(c)} of n=${a.n}`);
    assert.equal(a.exemplars.length, 3, `three most recent exemplars expected, got ${JSON.stringify(a.exemplars)}`);
    for (const [sha, msg, ts] of a.exemplars) { assert.match(sha, /^[0-9a-f]{40}$/); assert.equal(typeof msg, 'string'); assert.equal(typeof ts, 'number'); }
    assert.ok(a.exemplars[0][2] >= a.exemplars[1][2] && a.exemplars[1][2] >= a.exemplars[2][2], 'exemplars are newest-first');
    assert.ok(a.toks.length && a.toks.length <= 8, `up to 8 message tokens expected, got ${JSON.stringify(a.toks)}`);
    assert.equal(typeof a.label, 'string'); assert.ok(a.label.length > 0); }

  assert.ok(status.toks.includes('statu'), `the status shape's own vocabulary must carry its word, got ${JSON.stringify(status.toks)}`);
  assert.ok(handler.toks.includes('handl'), `the handler shape's own vocabulary must carry its word, got ${JSON.stringify(handler.toks)}`);
  // the noise: no shape may be certified on a module only one commit ever touched
  for (const a of m.changeArchetypes) for (const c of cellsOf(a))
    assert.ok(!/^m:src\/(alpha|beta|gamma|delta|epsilon|zeta)$/.test(c), `a noise module must never carry a certified shape: ${c}`);
});

// ===== (b) `how` names the shape before its examples =====
test('(b) `how "add status"` assigns the intent to the status shape and prints it before the example commits', () => {
  const r = grain(['how', 'add status'], repo);
  assert.equal(r.code, 0, `exit 0 expected — stderr:\n${r.err}\nstdout:\n${r.out}`);
  const lines = r.out.split('\n');
  const si = lines.findIndex(l => l.trim().startsWith('certified shape "'));
  assert.ok(si >= 0, `expected a certified-shape line, got:\n${r.out}`);
  const ei = lines.findIndex(l => l.startsWith('example ('));
  assert.ok(ei >= 0, `expected example lines, got:\n${r.out}`);
  assert.ok(si < ei, `the shape must be named BEFORE the example commits, got:\n${r.out}`);
  assert.match(lines[si], /\(8 changes\)/, `the shape names its own population, got: ${lines[si]}`);
  assert.match(lines[si], /\(8 of 8\)/, `each cell carries its k-of-n, got: ${lines[si]}`);
  assert.match(lines[si], /\*\.enum\.ts|src\/enums\//, `the status shape's own places must be named, got: ${lines[si]}`);
  assert.ok(!/\*\.dto\.ts|src\/dto\//.test(lines[si]), `a place both shapes touch is not part of either signature, got: ${lines[si]}`);

  const j = JSON.parse(grain(['how', 'add status', '--json'], repo).out);
  assert.ok(j.shape, `--json must carry the matched shape, got: ${JSON.stringify(j)}`);
  assert.ok(j.shape.cells.every(c => c.certified), 'only certified cells are reported as the shape');
  assert.ok(j.shape.cells.map(c => c.cell).includes('m:src/enums'), `the status shape expected, got ${JSON.stringify(j.shape.cells)}`);
  assert.equal(j.shape.n, 8);

  // an intent that matches commits but no shape gets no shape line and a null `shape`
  const r2 = grain(['how', 'core scaffolding', '--json'], repo);
  assert.equal(r2.code, 0, r2.err);
  assert.equal(JSON.parse(r2.out).shape, null, `an intent matching no archetype must report shape: null, got ${r2.out}`);
});

// ===== (c) no history at all =====
test('(c) a repository with no history has no shapes, and `how` still answers without one', () => {
  const m = modelIn(plain);
  assert.deepEqual(m.changeArchetypes, [], 'no history ⇒ no shapes (J4.3 renders `changes:` off exactly this)');
  const r = grain(['how', 'add status'], plain);
  assert.equal(r.code, 0, `exit 0 expected — stderr:\n${r.err}`);
  assert.ok(!r.out.includes('certified shape'), `no history means no shape line, got:\n${r.out}`);
  const rep = grain(['report'], plain);
  assert.equal(rep.code, 0, rep.err);
  assert.ok(!rep.out.includes('== changes'), `no shapes means no changes section, got:\n${rep.out}`);
});

// ===== (d) induceRoles regression: a CONTROL, green before and after the induceClusters extraction =====
// `induceRoles` keeps its own eligibility filter, its own label rule and its own assignAll call; only the middle
// block (bucket → sample → agglomerate → medoid) moves into `induceClusters`. The expected value below was
// captured from the unmodified function and must survive the extraction byte for byte.
test('(d) induceRoles is byte-identical after the induceClusters extraction', () => {
  const ROLES = [
    { deco: 'Handler', sup: 'BaseHandler', ret: 'Promise', toks: ['handle', 'command'] },
    { deco: 'Injectable', sup: 'BaseRepo', ret: 'Entity', toks: ['repo', 'find'] },
    { deco: 'Controller', sup: 'BaseCtl', ret: 'Response', toks: ['route', 'get'] },
  ];
  const ps = [];
  ROLES.forEach((r, ri) => { for (let i = 0; i < 7; i++) {
    const feats = new Set([`dec:${r.deco}`, `sup:${r.sup}`, `ret:${r.ret}`, ...r.toks.map(t => `tok:${t}`), `tok:n${i % 3}`]);
    ps.push({ kind: 'type', rel: `src/r${ri}/f${i}.ts`, name: `R${ri}N${i}`, ord: 0, feats, ownCount: 4 }); } });
  ps.push({ kind: 'file', rel: 'src/a.ts', name: 'a.ts', ord: 0, feats: new Set(['tok:a']), ownCount: 9 });       // filtered: file kind
  ps.push({ kind: 'type', rel: 'src/b.ts', name: 'B', ord: 0, feats: new Set(['tok:b']), ownCount: 1 });          // filtered: ownCount < 2

  const ri = induceRoles(ps);
  const got = { assign: [...ri.assign], amb: [...ri.amb], medoids: ri.medoids.map(m => ({ feats: [...m.feats].sort(), label: m.label })) };
  assert.deepEqual(got, {
    assign: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],
      [14, 2], [15, 2], [16, 2], [17, 2], [18, 2], [19, 2], [20, 2]],
    amb: [],
    medoids: [
      { feats: ['dec:Handler', 'ret:Promise', 'sup:BaseHandler', 'tok:command', 'tok:handle', 'tok:n0'], label: 'Handler+BaseHandler+command' },
      { feats: ['dec:Injectable', 'ret:Entity', 'sup:BaseRepo', 'tok:find', 'tok:n0', 'tok:repo'], label: 'Injectable+BaseRepo+find' },
      { feats: ['dec:Controller', 'ret:Response', 'sup:BaseCtl', 'tok:get', 'tok:n0', 'tok:route'], label: 'Controller+BaseCtl+get' },
    ] });
});

// ===== (f) report =====
test('(f) `report` prints a `== changes — N shapes ==` section, one practiced line per shape', () => {
  const out = grain(['report', '--top', '40'], repo).out;
  const lines = out.split('\n');
  const hi = lines.findIndex(l => /^== changes — 2 shapes ==$/.test(l));
  assert.ok(hi >= 0, `expected the changes section header, got:\n${out}`);
  const rows = [];
  for (let i = hi + 1; i < lines.length && !/^== /.test(lines[i]); i++) if (/^  "/.test(lines[i])) rows.push(lines[i]);
  assert.equal(rows.length, 2, `one line per shape expected, got:\n${rows.join('\n')}`);
  for (const row of rows) {
    assert.match(row, /^  "[^"]+" — 8 changes · /, `each row names its shape and its population, got: ${row}`);
    assert.match(row, /\(8 of 8\)/, `each cell carries its k-of-n, got: ${row}`); }
  assert.ok(rows.some(r => /\*\.handler\.ts/.test(r)) && rows.some(r => /\*\.enum\.ts/.test(r)), `both shapes' own suffixes must be named, got:\n${rows.join('\n')}`);
});

// ===== (e) determinism (last: it adds a commit to the fixture) =====
test('(e) an incremental refresh yields a byte-identical model.changeArchetypes to a full rebuild', () => {
  const d = new Date(T0 + 200 * 86400000).toISOString();
  w(repo, 'src/handlers/reconcile.handler.ts', `export class ReconcileHandler {\n  handle(input: string): string { return input + 'reconcile'; }\n  name(): string { return 'reconcile'; }\n}\n`);
  w(repo, 'src/dto/reconcile.dto.ts', `export class ReconcileDto {\n  payload = '';\n  valid(): boolean { return this.payload.length > 0; }\n  render(): string { return this.payload; }\n}\n`);
  w(repo, 'tests/reconcile.test.ts', `export function testReconcile(): boolean { return true; }\nexport function benchReconcile(): number { return 1; }\n`);
  gitIn(repo, 'add', '-A');
  execFileSync('git', ['-C', repo, 'commit', '-q', '-m', 'add handler reconcile'], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } });

  const incremental = JSON.stringify(modelIn(repo).changeArchetypes);
  assert.notEqual(incremental, '[]', 'the comparison must have something to compare');
  rmSync(join(repo, '.grain', 'cache'), { recursive: true });
  assert.equal(JSON.stringify(modelIn(repo).changeArchetypes), incremental, 'a full rebuild must equal the incremental model byte for byte');
});
