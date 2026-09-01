// J4.3b: `model.concepts` (learn()), `mapSections`'s `concepts:`/`changes:` lines, and `sessionContext`'s folded
// `Architecture (measured):` line plus its own new `concepts:`/`changes:` lines. J4.3a (layers, `decisions:`, the
// `in:` locator's `(layer n)`) is done and covered by map-command.test.mjs — not touched here.
//
// Fixture "solo": a minimal, hand-verified repo built so that EXACTLY ONE token ("widget") is shared between a
// commit message and a code identifier — every other token on either side is unique to its own side (padding
// consts carry a numeric suffix so no two files tokenize the same, and no commit message word besides "widget"
// spells any identifier in the tree). This makes `model.concepts` fully predictable: it must equal `['widget']`,
// not merely contain it.
//
// Fixture "layered": reuses J4.1's own proven change-archetypes fixture (8 "add handler <n>" + 8 "add status <n>"
// commits, certified to produce exactly two shapes — see change-archetypes.test.mjs's own bit-budget comment for
// why the certification margin is generous) plus a 3-layer module chain (modA -> modB -> modC, added once and
// never touched again, so it cannot perturb the archetype math) and one more isolated widget commit. Used to check
// that `grain map` / `session-context` render `concepts:`/`changes:` against whatever the model actually computed
// — assertions here read `model.concepts`/`model.changeArchetypes` back out of the model itself rather than
// hand-predicting the noisy multi-token overlap this richer fixture produces.
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
const pad = n => Array.from({ length: n }, (_, i) => `export const filler${i} = () => ${i};`).join('\n') + '\n';

const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
const Cap = s => s[0].toUpperCase() + s.slice(1);

let tmp, solo, plain, layered;

// ---- fixture "solo": exactly one commit-message/code overlap token ("widget") ----
function buildSolo(dir) {
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main'); gitIn(dir, 'config', 'commit.gpgsign', 'false');
  const d0 = new Date(T0).toISOString(), d1 = new Date(T0 + 86400000).toISOString();
  for (let i = 0; i < 5; i++) w(dir, `src/filler${i}.ts`, pad(6));
  w(dir, 'src/widget.ts', pad(6));
  gitIn(dir, 'add', '-A');
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'base scaffold'], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d0, GIT_COMMITTER_DATE: d0 } });
  w(dir, 'src/widget.ts', pad(7));
  gitIn(dir, 'add', '-A');
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'improve widget summary'], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d1, GIT_COMMITTER_DATE: d1 } });
}

// ---- fixture "layered": J4.1's own archetype fixture + a 3-layer module chain + one widget commit ----
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
const writeStatuses = (dir, names) => {
  w(dir, 'src/enums/order-status.enum.ts', `export class OrderStatus {\n${names.map(x => `  static ${x}(): string { return '${x}'; }`).join('\n')}\n}\n`);
  w(dir, 'src/dto/order.dto.ts', `export class OrderDto {\n  id = '';\n  known(): boolean { return [${names.map(x => `'${x}'`).join(', ')}].includes(this.id); }\n}\n`);
  w(dir, 'tests/fixtures/order.fixture.ts', `${names.map(x => `export function make${x}Order(): { id: string } { return { id: '${x}' }; }`).join('\n')}\n`);
  w(dir, 'tests/order.test.ts', `export function checkOrders(): boolean { return [${names.map(x => `make${x}Order()`).join(', ')}].every(o => o.id.length > 0); }\n`); };
function buildLayered(dir) {
  let day = 0;
  const commit = msg => { day += 2; const d = new Date(T0 + day * 86400000).toISOString();
    gitIn(dir, 'add', '-A');
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } }); };
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main'); gitIn(dir, 'config', 'commit.gpgsign', 'false');
  w(dir, 'package.json', JSON.stringify({ name: 'layered-fixture', version: '1.0.0', private: true, type: 'module' }, null, 2) + '\n');
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
  // a 3-layer module chain, added once and never touched again: does not enter any footprint, so it cannot move
  // the archetype certification math above (verified empirically — both shapes still certify with this added)
  w(dir, 'modC/leaf.ts', "export const leaf = () => 'leaf';\n");
  w(dir, 'modB/mid.ts', "import { leaf } from '../modC/leaf';\nexport const mid = () => leaf() + 'mid';\n");
  w(dir, 'modA/top.ts', "import { mid } from '../modB/mid';\nexport const top = () => mid() + 'top';\n");
  commit('add mod chain scaffold');
  // one more isolated commit/file pair sharing the token "widget" between message and code
  w(dir, 'src/widget/panel.widget.ts', 'export const renderPanel = () => 1;\n');
  commit('add widget panel summary');
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-j43b-'));
  solo = join(tmp, 'solo'); buildSolo(solo);
  layered = join(tmp, 'layered'); buildLayered(layered);
  // "plain": the same solo tree with NO git history at all (no `.git`) — H === null
  plain = join(tmp, 'plain'); mkdirSync(plain, { recursive: true });
  for (let i = 0; i < 5; i++) w(plain, `src/filler${i}.ts`, pad(6));
  w(plain, 'src/widget.ts', pad(6));
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

// ===== (a) model.concepts: red -> green =====
test('(a1) a token shared by a commit message and a code identifier, and nothing else, is the whole of model.concepts', () => {
  const m = modelIn(solo);
  assert.deepEqual(m.concepts, ['widget'], `expected exactly ['widget'], got ${JSON.stringify(m.concepts)}`);
});

test('(a2) a repository with no history at all has model.concepts = []', () => {
  const m = modelIn(plain);
  assert.deepEqual(m.concepts, [], `no history ⇒ no concepts (H.msgTokCommits does not exist), got ${JSON.stringify(m.concepts)}`);
});

// ===== (b) `grain map`: concepts:/changes: lines =====
test('(b1) `grain map` prints a `concepts:` line naming the shared token', () => {
  const r = grain(['map'], solo);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^map: concepts: widget$/m, r.out);
});

test('(b2) `grain map` omits `concepts:` and `changes:` cleanly when neither is populated', () => {
  // "plain" has git history removed entirely, so isGit=false, no `map` history-derived fields at all
  const r = grain(['map'], plain);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /^map: concepts:/m, r.out);
  assert.doesNotMatch(r.out, /^changes:/m, r.out);
  assert.match(r.out, /^decisions: 0 maintainer decision\(s\) in force$/m, r.out); // regression: J4.3a's own line still there
});

test('(b3) `grain map` prints a `changes:` line reflecting the model\'s own change archetypes', () => {
  const m = modelIn(layered);
  assert.ok(m.changeArchetypes && m.changeArchetypes.length >= 1, `fixture must certify at least one shape: ${JSON.stringify(m.changeArchetypes)}`);
  const top = m.changeArchetypes[0]; // changeArchetypes is sorted by n desc (J4.1's own learn())
  const r = grain(['map'], layered);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^changes: /m, r.out);
  const line = r.out.split('\n').find(l => l.startsWith('changes: '));
  assert.ok(line, `no changes: line in:\n${r.out}`);
  assert.ok(line.includes(`"${top.label}" — ${top.n} change`), `expected the top archetype (${top.label}, n=${top.n}) cited verbatim, got: ${line}`);
  assert.ok(!/e\.g\.\s+[0-9a-f]{7}/.test(line), `mapSections' changes: line must not leak a bare, unmarked example-voice citation: ${line}`);
});

test('(b4) `grain map` prints a `concepts:` line when the model has concepts, sourced from the model itself', () => {
  const m = modelIn(layered);
  assert.ok(m.concepts && m.concepts.length >= 1, `fixture must produce at least one concept: ${JSON.stringify(m.concepts)}`);
  const r = grain(['map'], layered);
  const line = r.out.split('\n').find(l => l.startsWith('map: concepts: '));
  assert.ok(line, `no concepts: line in:\n${r.out}`);
  const shown = line.replace('map: concepts: ', '').split(', ');
  assert.deepEqual(shown, m.concepts, `map's concepts: line must list exactly model.concepts, got ${JSON.stringify(shown)} vs ${JSON.stringify(m.concepts)}`);
});

// ===== (c) session-context: folded Architecture line, new concepts:/changes: lines, corrected budget =====
test('(c1) session-context folds layer count into the existing Architecture (measured) line, not a new one', () => {
  const m = modelIn(layered);
  const layers = new Set((m.moduleGraph?.nodes || []).map(n => n.layer)).size;
  assert.ok(layers >= 2, `fixture must have >= 2 layers, got ${layers}`);
  const r = grain(['session-context'], layered);
  assert.equal(r.code, 0, r.err);
  const text = JSON.parse(r.out).hookSpecificOutput.additionalContext;
  const lines = text.split('\n');
  const archLines = lines.filter(l => l.startsWith('Architecture (measured):'));
  assert.equal(archLines.length, 1, `expected exactly one Architecture line, got:\n${text}`);
  assert.match(archLines[0], new RegExp(`${layers} layer\\(s\\)`), `Architecture line must fold in the layer count (${layers}), got: ${archLines[0]}`);
});

test('(c2) session-context adds concepts:/changes: lines only when populated, and stays within the corrected <= 9 line budget', () => {
  const m = modelIn(layered);
  const r = grain(['session-context'], layered);
  const text = JSON.parse(r.out).hookSpecificOutput.additionalContext;
  const lines = text.split('\n');
  // 5 unconditional lines (intro, where, check, status|report, Index:) + Architecture (edges exist here) +
  // concepts: + changes: = 8 observed for this fixture (no steers recorded, so the "Maintainer decisions in
  // force" line does not fire) — within the ticket's corrected <= 9 budget (raised from an arithmetically
  // impossible "<= 6 total" to make room for these two new conditional lines; see plan.md J4.3's Opus corrections)
  assert.equal(lines.length, 8, `expected exactly 8 lines for this fixture, got ${lines.length}:\n${text}`);
  assert.ok(lines.length <= 9, `session-context must stay within the <= 9 line budget, got ${lines.length}`);
  const conceptsLine = lines.find(l => l.startsWith('map: concepts: '));
  const changesLine = lines.find(l => l.startsWith('changes: '));
  assert.ok(conceptsLine, `expected a concepts: line since model.concepts.length=${m.concepts.length}`);
  assert.ok(changesLine, `expected a changes: line since model.changeArchetypes.length=${m.changeArchetypes.length}`);
});

test('(c3) session-context omits concepts:/changes: lines when the model has neither', () => {
  const r = grain(['session-context'], plain);
  assert.equal(r.code, 0, r.err);
  const text = JSON.parse(r.out).hookSpecificOutput.additionalContext;
  assert.doesNotMatch(text, /\nmap: concepts:/, text);
  assert.doesNotMatch(text, /\nchanges: /, text);
});

// ===== (d) determinism =====
test('(d) incremental vs. full rebuild produce byte-identical model.concepts', () => {
  const before = modelIn(solo).concepts;
  w(solo, 'src/filler0.ts', pad(6) + 'export const untouched = 1;\n'); // content-only edit: same tokens, same commit-message overlap
  const d2 = new Date(T0 + 2 * 86400000).toISOString();
  gitIn(solo, 'add', '-A');
  execFileSync('git', ['-C', solo, 'commit', '-q', '-m', 'unrelated tidy'], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d2, GIT_COMMITTER_DATE: d2 } });
  const inc = grain(['status'], solo); assert.equal(inc.code, 0, inc.err);
  const afterIncremental = modelIn(solo).concepts;
  rmSync(join(solo, '.grain', 'cache'), { recursive: true });
  const full = grain(['status'], solo); assert.equal(full.code, 0, full.err);
  const afterFull = modelIn(solo).concepts;
  assert.deepEqual(afterIncremental, afterFull, 'incremental and full rebuild must agree on model.concepts');
  assert.deepEqual(before, afterFull, 'an unrelated content-only edit must not change model.concepts here');
});
