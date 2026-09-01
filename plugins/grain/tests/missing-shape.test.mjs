// J4.2 — `missing: change shape:`: a change that partially implements an established shape (touches some of its
// certified cells but not others) should say so, naming exactly which certified places are still untouched. Silent
// when the change is a complete match to the shape (nothing missing) or matches no archetype closely enough.
//
// The fixture is the SAME 23-commit, two-shape history as change-archetypes.test.mjs (see that file for the full
// codelength arithmetic behind which cells certify) — reused verbatim because every assertion here needs a REAL,
// already-certified archetype to match a change against, not a mocked one.
import { test, before, after, afterEach } from 'node:test';
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

const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
const Cap = s => s[0].toUpperCase() + s.slice(1);

// 23 commits: 1 scaffold · 8 "add handler <name>" (handler + dto + test) · 8 "add status <name>" (enum + dto +
// fixture + test) · 6 noise — identical to change-archetypes.test.mjs, which already proves this fixture induces
// exactly two certified shapes: a "handler" shape and a "status" shape (the one this file matches changes against).
const HANDLERS = ['create', 'cancel', 'ship', 'refund', 'archive', 'restore', 'split', 'merge'];
const STATUSES = ['Pending', 'Approved', 'Rejected', 'Escrowed', 'Settled', 'Voided', 'Frozen', 'Lapsed'];
const NOISE = [
  ['alpha', 'util', ['compress', 'inflate']],
  ['beta', 'helper', ['schedule', 'cancelTimer']],
  ['gamma', 'client', ['dial', 'hangup']],
  ['delta', 'guard', ['permit', 'refuse']],
  ['epsilon', 'mapper', ['flatten', 'nest']],
  ['zeta', 'runner', ['spawn', 'reap']],
];
const ALL_STATUSES = ['Draft', ...STATUSES]; // the names committed at HEAD, in commit order

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
  writeStatuses(dir, ['Draft']);
  commit('core scaffolding');

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

let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-missing-shape-'));
  repo = join(tmp, 'fixture'); buildFixture(repo);
  assert.equal(grain(['status'], repo).code, 0); // warm the cache once — every test below shares this committed model
});
// each test dirties the worktree with an uncommitted change; reset to HEAD before the next one runs
afterEach(() => { gitIn(repo, 'checkout', '-q', '--', '.'); gitIn(repo, 'clean', '-qfd'); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

const certifiedStatusCells = m => {
  const status = (m.changeArchetypes || []).find(a => a.cells.some(c => c.certified && c.cell === 'm:src/enums'));
  assert.ok(status, `sanity: the "add status" shape must be certified (see change-archetypes.test.mjs) — got: ${JSON.stringify(m.changeArchetypes)}`);
  return status.cells.filter(c => c.certified);
};
const touchEnumAndDto = () => {
  const enumPath = join(repo, 'src/enums/order-status.enum.ts');
  writeFileSync(enumPath, readFileSync(enumPath, 'utf8').replace(/\}\n$/, `  static Cancelled(): string { return 'Cancelled'; }\n}\n`));
  const dtoPath = join(repo, 'src/dto/order.dto.ts');
  writeFileSync(dtoPath, readFileSync(dtoPath, 'utf8').replace('].includes(this.id)', ", 'Cancelled'].includes(this.id)")); };

// ===== (a) red -> green: a partial match to the status shape =====
// Touching only the enum + dto files (never fixture/test) is the ticket's own example — "adds the enum member and
// a DTO field but forgets the fixture and the test file". The status shape certifies 5 cells (m:src/enums,
// k:enum.ts, m:tests/fixtures, k:fixture.ts, and one g: role for the fixture's make<Status>Order() functions —
// verified empirically against this exact fixture). The change's own cell-set is {m:src/enums, k:enum.ts} only:
// 2 of 5 touched, 3 absent. jacW against the archetype's FULL (certified+shared) 10-cell bag is 4/10 = 0.4, clear
// of CFG.minMemb (0.35) with the handler shape (the only other archetype) far below it as runner-up — unambiguous.
test('(a) a partial change matching the status shape prints `change shape:` naming the correct touched/absent cells', () => {
  const certified = certifiedStatusCells(modelIn(repo));
  assert.equal(certified.length, 5, `sanity: 5 certified cells expected for the status shape, got ${JSON.stringify(certified)}`);

  touchEnumAndDto();

  const r = grain(['review'], repo);
  assert.equal(r.code, 0, `exit 0 expected — stderr:\n${r.err}`);
  const lines = r.out.split('\n');
  const si = lines.findIndex(l => l.includes('change shape:'));
  assert.ok(si >= 0, `expected a "change shape:" line (this is the exact symptom absent before the fix), got:\n${r.out}`);
  const line = lines[si];
  assert.match(line, /^change shape: this change touches 2 of 5 certified cells of "[^"]+"/, `expected "touches 2 of 5", got: ${line}`);
  assert.match(line, / — absent: /, `absent segment via em dash (one block, one header), got: ${line}`);
  assert.match(line, /tests\/fixtures\/ \(8 of 8\)/, `the untouched fixture module cell must be named absent, got: ${line}`);
  assert.match(line, /\*\.fixture\.ts \(8 of 8\)/, `the untouched fixture suffix cell must be named absent, got: ${line}`);
  assert.match(line, /«[^»]+» \(8 of 8\)/, `the untouched role cell must be named absent too, got: ${line}`);
  // the header this line lives under is shared with cochange/recipe/kin — one block, one header (J0.2)
  assert.ok(lines.includes('missing from your change:'), `expected the shared "missing from your change:" header, got:\n${r.out}`);
});

// ===== (b) a complete match: every certified cell touched -> no shape line at all =====
test('(b) a change that touches every certified cell of a matched shape prints no `change shape:` line', () => {
  writeStatuses(repo, [...ALL_STATUSES, 'Cancelled']); // touches all 4 files exactly as every "add status" commit did
  const r = grain(['review'], repo);
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.out.includes('change shape:'), `a complete match to a shape is not a gap to report, got:\n${r.out}`);
});

// ===== (c) a change matching no archetype closely enough -> silence =====
test('(c) a change with no meaningful overlap to any archetype prints no `change shape:` line', () => {
  mkdirSync(join(repo, 'src/omega'), { recursive: true });
  writeFileSync(join(repo, 'src/omega/omega.widget.ts'), `export class OmegaWidget {\n  paint(x: number): number { return x + 1; }\n  resize(y: number): number { return y - 1; }\n}\n`);
  const r = grain(['review'], repo);
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.out.includes('change shape:'), `an unrelated new module/suffix must not clear CFG.minMemb against either shape, got:\n${r.out}`);
});

// ===== (d) --json: `shape` is deliberately NOT added to the JSON contract =====
// Unlike J3.2's `missing.kin[]` (explicitly required by that ticket's text), J4.2's ticket never asks for a JSON
// field, and `missing` is part of `cmdReview`'s published --json shape (docs/reference.md). This locks in that
// scope decision: the same partial change as (a) renders the text line but leaves `missing` carrying only `kin`.
test('(d) --json carries no `shape` field (only `kin`) — the text line has no JSON counterpart, by scope decision', () => {
  touchEnumAndDto();
  const r = grain(['review', '--json'], repo);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.deepEqual(Object.keys(j.missing).sort(), ['kin'], `missing.shape must not exist in --json, got: ${JSON.stringify(j.missing)}`);
});
