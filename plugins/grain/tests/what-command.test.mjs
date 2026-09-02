// J3.3 — `grain what <words>`: a fourth lens distinct from `where` (place for NEW code) and `how` (past change
// shape). Given a word or phrase, gather every kind of fact the model already carries about that CONCEPT into one
// card: declarations (a), indexed values (b), its spread across modules (c), historical commit mentions (e), and
// file-level fan-in (f). Source (d), sibling values, was DELETED by §052 (measured 0.364 per-value precision as
// a push surface) — see tests/what-siblings-not-a-push-line.test.mjs.
//
// Fixture (repo A): an enum `OrderStatus { PENDING_STATUS, SHIPPED_STATUS, CANCELLED }` declared identically in two
// files (src/orders/status.ts, src/billing/status.ts) — J3.1's cross-file identity merge means this is ONE sibling
// container. Two of its three members carry the word "status" in their own name (PENDING_STATUS, SHIPPED_STATUS);
// the third (CANCELLED) does not, so it is never independently matched by (b) — §052 deleted the (d) line that
// used to be the only place it surfaced. Three
// consumer files (src/consumers/{a,b,c}.ts) each hold a switch on both matched members as string literals, giving
// those two values df=3 as `str:` entries. src/consumers/importer.ts imports OrderStatus from orders/status.ts —
// the one file-level edge (f) fan-in counts. src/churn.ts (23 commits), src/misc.ts (1 commit) and src/orders/
// audit.ts (5 commits, message "review status audit") replicate bridge-acceptance.test.mjs's proven 30-commit,
// df=5/commitsN=30 shape so that «status» also earns a real `model.msgAffinity` row bridging to audit.ts, for
// source (e)'s commit-count line. 8 filler files pad the corpus to 17 total so the value index's density gate
// (CFG.valueDfMin=2, valueDfMaxShare=0.2 → dfMax=ceil(0.2*17)=4) keeps both df=2 and df=3 entries.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BIN_MCP = join(here, '..', 'bin', 'grain-mcp.mjs');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));

const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
function makeCommitter(dir) {
  let day = 0;
  return msg => { day += 2; const d = new Date(T0 + day * 86400000).toISOString();
    gitIn(dir, 'add', '-A');
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } }); };
}

let tmp, repo, repoB;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-what-'));

  // ===== repo A: the primary concept-card fixture =====
  repo = join(tmp, 'a'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false');
  const commit = makeCommitter(repo);

  const ENUM_SRC = `export enum OrderStatus { PENDING_STATUS, SHIPPED_STATUS, CANCELLED }\n`;
  w(repo, 'src/orders/status.ts', ENUM_SRC);
  w(repo, 'src/billing/status.ts', ENUM_SRC);
  const CONSUMER_SRC = `export function classify(x: string): number {
  switch (x) {
    case 'PENDING_STATUS': return 1;
    case 'SHIPPED_STATUS': return 2;
    default: return 0;
  }
}
`;
  w(repo, 'src/consumers/a.ts', CONSUMER_SRC);
  w(repo, 'src/consumers/b.ts', CONSUMER_SRC);
  w(repo, 'src/consumers/c.ts', CONSUMER_SRC);
  w(repo, 'src/consumers/importer.ts', `import { OrderStatus } from '../orders/status';\nexport const s: OrderStatus = OrderStatus.PENDING_STATUS;\n`);
  w(repo, 'src/orders/audit.ts', `export function audit(): number { return 0; }\n`);
  w(repo, 'src/churn.ts', `export function churn(): number { return 0; }\n`);
  w(repo, 'src/misc.ts', `export function misc(): number { return 0; }\n`);
  // each filler file holds a function (not just a const) so the fixture clears groupPartitions' 30-scope floor
  // (core.mjs: `if (small.length >= 30) merged.set(...)`) below which NO partition forms at all — a plain const
  // per file left this fixture at 27 scopes, one short, and (a)'s declarations silently vanished
  for (let i = 1; i <= 8; i++) w(repo, `src/filler/f${i}.ts`, `export function f${i}(): number { return ${i}; }\n`);
  commit('scaffold repo'); // C1

  for (let i = 1; i <= 20; i++) { w(repo, 'src/churn.ts', `export function churn(): number { return ${i}; }\n`); commit('tweak churn path'); } // C2..C21
  for (let i = 21; i <= 23; i++) { w(repo, 'src/churn.ts', `export function churn(): number { return ${i}; }\n`); commit('adjust churn extra'); } // C22..C24
  w(repo, 'src/misc.ts', `export function misc(): number { return 1; }\n`); commit('misc audit trail'); // C25
  for (let i = 1; i <= 5; i++) { w(repo, 'src/orders/audit.ts', `export function audit(): number { return ${i}; }\n`); commit('review status audit'); } // C26..C30

  const st = grainIn(repo, ['status']); assert.equal(st.code, 0, st.err);

  // ===== repo B: absent from code, present only in history (reuses bridge-acceptance.test.mjs's proven shape) =====
  repoB = join(tmp, 'b'); mkdirSync(repoB);
  gitIn(repoB, 'init', '-q', '-b', 'main'); gitIn(repoB, 'config', 'commit.gpgsign', 'false');
  const commitB = makeCommitter(repoB);
  w(repoB, 'src/hot.ts', 'export class Hot { run() { return 0; } }\n');
  w(repoB, 'src/other/a.ts', 'export const a = () => 0;\n');
  commitB('base tree');
  for (let i = 1; i <= 20; i++) { w(repoB, 'src/hot.ts', `export class Hot { run() { return ${i}; } }\n`); commitB('tweak hot path'); }
  for (let i = 21; i <= 23; i++) { w(repoB, 'src/hot.ts', `export class Hot { run() { return ${i}; } }\n`); commitB('payment retry hot path'); }
  w(repoB, 'src/other/a.ts', 'export const a = () => 1;\n'); commitB('payment audit trail');
  for (let i = 1; i <= 5; i++) { w(repoB, 'src/rare/levy.ts', `export const levy = () => ${i};\n`); commitB('refund batch levy'); }
  const stB = grainIn(repoB, ['status']); assert.equal(stB.code, 0, stB.err);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(a) fixture sanity: the model carries the enum, its value index and message affinity this whole file assumes', () => {
  const m = modelIn(repo);
  assert.equal(m.files, 17, 'fixture must have exactly 17 code files for the density bounds this file assumes');
  assert.deepEqual(m.valueIndex['enum:PENDING_STATUS'], [['src/billing/status.ts', 1], ['src/orders/status.ts', 1]]);
  assert.deepEqual(m.valueIndex['enum:SHIPPED_STATUS'], [['src/billing/status.ts', 1], ['src/orders/status.ts', 1]]);
  assert.deepEqual(m.valueIndex['str:PENDING_STATUS'], [['src/consumers/a.ts', 3], ['src/consumers/b.ts', 3], ['src/consumers/c.ts', 3]]);
  const hits = Object.entries(m.valueSiblings).filter(([, ms]) => ms.includes('enum:PENDING_STATUS'));
  assert.equal(hits.length, 1);
  assert.deepEqual(hits[0][1], ['enum:CANCELLED', 'enum:PENDING_STATUS', 'enum:SHIPPED_STATUS']);
});

test('(a) `grain what status` reports declarations, values and spread with correct counts', () => {
  const r = grainIn(repo, ['what', 'status', '--json']);
  assert.equal(r.code, 0, `exit 0 expected — stderr:\n${r.err}\nstdout:\n${r.out}`);
  const j = JSON.parse(r.out);
  assert.equal(j.query, 'status');

  // declarations: the enum, declared once in each of two files
  assert.equal(j.defined.length, 2, `expected the enum declaration in both files: ${JSON.stringify(j.defined)}`);
  const byRel = Object.fromEntries(j.defined.map(d => [d.rel, d]));
  assert.ok(byRel['src/orders/status.ts'], JSON.stringify(j.defined));
  assert.ok(byRel['src/billing/status.ts'], JSON.stringify(j.defined));
  // scope kind is the engine's own coarse classification (core.mjs's TYPE_LIKE_RE folds class/struct/enum/interface/…
  // into 'type'), not the raw grammar node name — same vocabulary `where`'s own card members use
  for (const d of j.defined) { assert.equal(d.name, 'OrderStatus'); assert.equal(d.kind, 'type'); assert.equal(d.line, 1); }

  // values: the two members that carry "status" in their own name, both as the enum member and as a string literal
  assert.equal(j.values.length, 4, JSON.stringify(j.values));
  const byValueKind = Object.fromEntries(j.values.map(v => [v.kind + ':' + v.value, v]));
  assert.equal(byValueKind['enum:PENDING_STATUS'].places.length, 2);
  assert.equal(byValueKind['enum:SHIPPED_STATUS'].places.length, 2);
  assert.equal(byValueKind['str:PENDING_STATUS'].places.length, 3);
  assert.equal(byValueKind['str:SHIPPED_STATUS'].places.length, 3);
  assert.ok(!('enum:CANCELLED' in byValueKind), 'CANCELLED never carries the word "status" and must not independently match (b)');

  // spread: consumers (3 files) ahead of billing/orders (1 file each)
  assert.equal(j.spread.length, 3, JSON.stringify(j.spread));
  const byModule = Object.fromEntries(j.spread.map(s => [s.module, s.n]));
  assert.equal(byModule['src/consumers'], 3);
  assert.equal(byModule['src/orders'], 1);
  assert.equal(byModule['src/billing'], 1);
  assert.equal(j.spread[0].module, 'src/consumers', 'most-files-first ordering');

  // §052 — source (d) is deleted, so there is no `siblings` field to assert. `CANCELLED` is still the enum's
  // only member never independently matched by (b), and it is still in the model (see
  // tests/what-siblings-not-a-push-line.test.mjs (c)); what changed is that `what` no longer volunteers it.
  assert.ok(!('siblings' in j), `§052: the siblings field is deleted — got keys ${Object.keys(j).join(',')}`);

  // fan-in: importer.ts is the one file that imports one of the two declaration files — §064: the actual name,
  // not just a count
  assert.deepEqual(j.usedBy.files, ['src/consumers/importer.ts'], JSON.stringify(j.usedBy));
  assert.equal(j.usedBy.total, 1, JSON.stringify(j.usedBy));

  assert.match(typeof j.asOf === 'string' ? j.asOf : '', /^[0-9a-f]{7}/, 'asOf strips the "as of " prefix and carries a sha');
});

test('(a2) the text rendering carries the same facts in the documented voices', () => {
  const r = grainIn(repo, ['what', 'status']);
  assert.equal(r.code, 0, r.err);
  const lines = r.out.split('\n');
  assert.ok(lines[0].includes('«status» → what it is here:'), lines[0]);
  const defined = lines.find(l => l.startsWith('defined:'));
  assert.ok(defined, r.out);
  assert.match(defined, /src\/orders\/status\.ts:1 `OrderStatus` \(type\)/);
  assert.match(defined, /src\/billing\/status\.ts:1 `OrderStatus` \(type\)/);
  const values = lines.find(l => l.startsWith('values:'));
  assert.ok(values, r.out);
  assert.match(values, /`PENDING_STATUS` in 2 places/);
  assert.match(values, /`PENDING_STATUS` in 3 places/);
  const spread = lines.find(l => l.startsWith('spread:'));
  assert.match(spread, /src\/consumers \(3\)/);
  assert.equal(lines.find(l => l.startsWith('siblings:')), undefined, `§052: no siblings: line:\n${r.out}`);
  const usedBy = lines.find(l => l.startsWith('used by:'));
  assert.equal(usedBy, 'used by: src/consumers/importer.ts', `§064: text output must show the actual file name, not a count: ${usedBy}`);
  assert.match(r.out, /\nas of [0-9a-f]{7}/, 'every answer ends with the freshness stamp');
});

test('(e) with real history loaded, the commit-count source cites the exact fps count and latest month', () => {
  const j = JSON.parse(grainIn(repo, ['what', 'status', '--json']).out);
  // 5 commits ("review status audit") carry the token "status" in their message; the model has no way to see a
  // commit dated in the future of the fixture's own clock, so `last` must be this fixture's own last such month.
  if (j.changes && j.changes.commits !== undefined) {
    assert.equal(j.changes.commits, 5, JSON.stringify(j.changes));
    assert.match(j.changes.last, /^2026-\d\d$/, JSON.stringify(j.changes));
  } else {
    assert.fail(`expected a populated changes: source (model.msgAffinity should bridge "status" to src/orders/audit.ts) — got ${JSON.stringify(j.changes)}`);
  }
  const r = grainIn(repo, ['what', 'status']);
  const changes = r.out.split('\n').find(l => l.startsWith('changes:'));
  assert.ok(changes, r.out);
  assert.match(changes, /5 commits mention it, last 2026-\d\d — `grain how "status"` for the shape/);
});

test('(b) a concept absent from code but present in commit-message affinity: map: + example bridge', () => {
  const r = grainIn(repoB, ['what', 'refund']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^map: /m, `no code presence must speak in the map voice, got:\n${r.out}`);
  const example = r.out.split('\n').find(l => l.startsWith('example ('));
  assert.ok(example, `expected a bridge example line, got:\n${r.out}`);
  assert.match(example, /src\/rare\/levy\.ts/, example);

  const j = JSON.parse(grainIn(repoB, ['what', 'refund', '--json']).out);
  assert.deepEqual(j.defined, []);
  assert.deepEqual(j.values, []);
});

test('(c) a concept absent everywhere: map: alone, no crash', () => {
  const r = grainIn(repo, ['what', 'zzznonexistentconcept']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^map: /m, r.out);
  assert.ok(!r.out.split('\n').some(l => l.startsWith('example (')), `no history mentions this token either, got:\n${r.out}`);
  assert.ok(!r.out.split('\n').some(l => l.startsWith('defined:') || l.startsWith('values:') || l.startsWith('spread:') || l.startsWith('siblings:') || l.startsWith('used by:') || l.startsWith('changes:')),
    `every other source must stay silent, got:\n${r.out}`);

  const j = JSON.parse(grainIn(repo, ['what', 'zzznonexistentconcept', '--json']).out);
  assert.deepEqual(j.defined, []); assert.deepEqual(j.values, []); assert.deepEqual(j.spread, []);
  assert.ok(!('siblings' in j), '§052: no siblings field at all, empty or otherwise');
});

test('(d) determinism: two runs against the same unchanged repository are byte-identical', () => {
  const a = grainIn(repo, ['what', 'status']);
  const b = grainIn(repo, ['what', 'status']);
  assert.equal(a.code, 0); assert.equal(b.code, 0);
  assert.equal(a.out, b.out, 'text output must be byte-identical across runs');
  assert.equal(grainIn(repo, ['what', 'status', '--json']).out, grainIn(repo, ['what', 'status', '--json']).out, '--json must be byte-identical too');
});

test('(e-json) --json carries the documented shape', () => {
  const j = JSON.parse(grainIn(repo, ['what', 'status', '--json']).out);
  assert.equal(typeof j.query, 'string');
  for (const k of ['defined', 'values', 'spread']) assert.ok(Array.isArray(j[k]), `${k} must be an array: ${JSON.stringify(j)}`);
  for (const k of ['changes', 'usedBy']) assert.equal(typeof j[k], 'object', `${k} must be an object: ${JSON.stringify(j)}`);
  assert.equal(typeof j.asOf, 'string');
  for (const d of j.defined) { assert.equal(typeof d.rel, 'string'); assert.equal(typeof d.name, 'string'); assert.equal(typeof d.kind, 'string'); assert.equal(typeof d.line, 'number'); }
  for (const v of j.values) { assert.equal(typeof v.value, 'string'); assert.equal(typeof v.kind, 'string'); assert.ok(Array.isArray(v.places)); }
});

test('(f) MCP grain_what returns exactly what `what --json` returns', async () => {
  const j = JSON.parse(grainIn(repo, ['what', 'status', '--json']).out);
  const mcp = await mcpCall(repo, 'grain_what', { query: 'status' });
  assert.deepEqual(JSON.parse(mcp), j, 'grain_what must return exactly what `what --json` returns');
});

// a minimal MCP client over the real server subprocess — same technique as tests/how-command.test.mjs / tests/mcp-server.test.mjs
function mcpCall(cwd, name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [BIN_MCP], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderrBuf = ''; child.stderr.on('data', d => { stderrBuf += d.toString(); });
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const pending = new Map(); let nextId = 1;
    const t = setTimeout(() => { child.kill(); reject(new Error(`MCP timeout — stderr:\n${stderrBuf}`)); }, 30000);
    rl.on('line', line => { let msg; try { msg = JSON.parse(line); } catch { return; }
      if (msg && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
    const send = (method, params) => { const id = nextId++;
      const p = new Promise(res => pending.set(id, res));
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); return p; };
    (async () => {
      await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'what-test', version: '0' } });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
      const r = await send('tools/call', { name, arguments: args });
      clearTimeout(t); child.stdin.end(); child.kill();
      if (r.error) return reject(new Error(JSON.stringify(r.error)));
      if (r.result?.isError) return reject(new Error(r.result.content.map(c => c.text).join('\n')));
      resolve(r.result.content[0].text);
    })().catch(e => { clearTimeout(t); try { child.kill(); } catch { /* already dead */ } reject(e); });
  });
}
