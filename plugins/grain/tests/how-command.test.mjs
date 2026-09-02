// J2.2 — `grain how <intent>`: change by example. Finds the past commits whose message + touched file names best
// match the intent (over `H.fps`, added by J2.1), then reports which files a change like that actually touched.
//
// The fixture is built here rather than reused from tests/fixtures/build-fixture.mjs on purpose: every assertion
// below is about WHICH commits match and which do not, so the test must own every commit message and every file
// name in the repository — a shared fixture whose messages drift would turn "3 matches" into a lottery.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BIN_MCP = join(here, '..', 'bin', 'grain-mcp.mjs');

let tmp, repo;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const grain = (args, cwd) => { const r = spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };

const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };

// 9 commits, dates pinned so two builds are byte-identical:
//   scaffold · noise · "add status pending" · noise · "add status shipped" · noise · "add status cancelled" ·
//   noise · noise(empty message)
// The three "add status …" commits touch THE SAME four files, so every place must come back at 3/3. No noise
// commit's message or file name carries `add` or `status` (normTok: `statu`) — the matcher must find exactly three.
const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
let day = 0;
function commit(dir, msg, extraArgs = []) { day += 3; const d = new Date(T0 + day * 86400000).toISOString();
  gitIn(dir, 'add', '-A');
  execFileSync('git', ['-C', dir, 'commit', '-q', ...extraArgs, '-m', msg], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } }); }

const STATUS_FILES = ['src/enums/order-status.enum.ts', 'src/dto/order.dto.ts', 'tests/fixtures/order.fixture.ts', 'tests/order.test.ts'];

function writeStatusSet(dir, names) { // `names` grows by one on every "add status" commit — a real structural change each time
  w(dir, STATUS_FILES[0], `export class OrderStatus {\n${names.map(n => `  static ${n}(): string { return '${n}'; }`).join('\n')}\n}\n`);
  w(dir, STATUS_FILES[1], `export class OrderDto {\n  id = '';\n${names.map(n => `  is${n}(): boolean { return this.id.startsWith('${n}'); }`).join('\n')}\n}\n`);
  w(dir, STATUS_FILES[2], `${names.map(n => `export function make${n}Order(): { id: string } { return { id: '${n}' }; }`).join('\n')}\n`);
  w(dir, STATUS_FILES[3], `${names.map(n => `export function check${n}(): boolean { return make${n}Order().id === '${n}'; }`).join('\n')}\n`); }

function buildFixture(dir) {
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  w(dir, 'package.json', JSON.stringify({ name: 'how-fixture', version: '1.0.0', private: true, type: 'module' }, null, 2) + '\n');
  w(dir, 'src/core/base.ts', `export class Base { id = ''; }\n`);
  commit(dir, 'core scaffolding');

  w(dir, 'src/billing/invoice.ts', `export class Invoice { total = 0; }\n`);
  commit(dir, 'refactor billing invoice totals');

  writeStatusSet(dir, ['Pending']);
  commit(dir, 'add status pending');

  w(dir, 'src/config/lint.ts', `export const lint = { strict: true };\n`);
  commit(dir, 'bump lint config');

  writeStatusSet(dir, ['Pending', 'Shipped']);
  commit(dir, 'add status shipped');

  w(dir, 'src/payments/gateway.ts', `export class Gateway { retries = 3; }\n`);
  commit(dir, 'rework payment gateway retries');

  writeStatusSet(dir, ['Pending', 'Shipped', 'Cancelled']);
  commit(dir, 'add status cancelled');

  w(dir, 'src/logging/logger.ts', `export class Logger { level = 'info'; }\n`);
  commit(dir, 'tidy logger module');

  // (d) a commit with NO message at all: `toks` is [] and it must never crash the matcher. Its file name carries
  // neither query token either, so it can never clear the weak-match floor for "add status" — a message-less commit
  // CAN still match on its path tokens alone, by design; this one simply has none in common with the query.
  w(dir, 'src/logging/logger.ts', `export class Logger { level = 'info'; flush(): void { this.level = 'info'; } }\n`);
  commit(dir, '', ['--allow-empty-message']); }

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-how-')); repo = join(tmp, 'fixture'); day = 0; buildFixture(repo); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

const shaOf = subject => gitIn(repo, 'log', '--format=%H%x1f%s').trim().split('\n').map(l => l.split('\x1f')).find(([, s]) => s === subject)?.[0];

test('(a) `how "add status"` finds the three matching commits and reports the four places they touched, each 3/3', () => {
  const r = grain(['how', 'add status'], repo);
  assert.equal(r.code, 0, `exit 0 expected — stderr:\n${r.err}\nstdout:\n${r.out}`);

  const lines = r.out.split('\n');
  const header = lines.find(l => l.startsWith('map: «add status»'));
  assert.ok(header, `expected a map: header naming the query, got:\n${r.out}`);
  assert.match(header, /3 past changes match/, `expected exactly 3 matches in the header, got: ${header}`);

  const examples = lines.filter(l => l.startsWith('example ('));
  assert.equal(examples.length, 3, `one example line per matched commit expected, got:\n${examples.join('\n')}`);
  // ranking: score first, ties broken by recency — the three commits all score 1.0, so the newest leads
  assert.match(examples[0], /"add status cancelled" — 4 files/, `the newest of the three tied matches must be shown first, got: ${examples[0]}`);
  assert.match(examples[0], /^example \([0-9a-f]{7} 2026-\d\d\): /, `the example must carry its sha and YYYY-MM, got: ${examples[0]}`);
  assert.match(examples[1], /"add status shipped"/);
  assert.match(examples[2], /"add status pending"/);

  assert.ok(lines.includes('places such a change touched:'), `expected the places header, got:\n${r.out}`);
  for (const f of STATUS_FILES) {
    const pl = lines.find(l => l.trim().startsWith(f + ' '));
    assert.ok(pl, `expected a place line for ${f}, got:\n${r.out}`);
    assert.match(pl, /\(3\/3\)/, `${f} was touched by all three matches, so it must read 3/3 — got: ${pl}`); }
  assert.ok(!lines.some(l => /src\/billing\/invoice\.ts|src\/payments\/gateway\.ts|src\/logging\/logger\.ts/.test(l)),
    `no noise-commit file may appear among the places:\n${r.out}`);
  assert.match(r.out, /\nas of [0-9a-f]{7}/, 'every answer ends with the freshness stamp');
});

test('(a2) an intent nothing in the history matches falls back to the structural map, with zero places', () => {
  const r = grain(['how', 'nonexistent thing that never happened'], repo);
  assert.equal(r.code, 0, `exit 0 expected — stderr:\n${r.err}`);
  assert.match(r.out, /^map: /m, `the zero-match fallback speaks in the map voice, got:\n${r.out}`);
  assert.match(r.out, /no past change matches/, `the fallback must say plainly that no example was found, got:\n${r.out}`);
  assert.ok(!r.out.includes('places such a change touched:'), `zero matches means zero places, got:\n${r.out}`);
  assert.ok(!r.out.split('\n').some(l => l.startsWith('example (')), `zero matches means no example line, got:\n${r.out}`);

  const j = JSON.parse(grain(['how', 'nonexistent thing that never happened', '--json'], repo).out);
  assert.deepEqual(j.matches, []);
  assert.deepEqual(j.places, []);
});

test('(b) determinism: two runs against the same unchanged repository are byte-identical', () => {
  const a = grain(['how', 'add status'], repo);
  const b = grain(['how', 'add status'], repo);
  assert.equal(a.code, 0); assert.equal(b.code, 0);
  assert.equal(a.out, b.out, 'text output must be byte-identical across runs');
  assert.equal(grain(['how', 'add status', '--json'], repo).out, grain(['how', 'add status', '--json'], repo).out, '--json must be byte-identical too');
});

test('(c) --json carries the documented shape, and MCP grain_how returns the same data', async () => {
  const r = grain(['how', 'add status', '--json'], repo);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);

  assert.equal(j.query, 'add status');
  assert.ok(Array.isArray(j.matches) && Array.isArray(j.places) && Array.isArray(j.missing), `matches/places/missing must all be arrays: ${r.out}`);
  assert.equal(j.matches.length, 3);
  for (const m of j.matches) {
    assert.match(m.sha, /^[0-9a-f]{40}$/, 'a match cites its full sha');
    assert.equal(typeof m.ts, 'number');
    assert.equal(typeof m.msg, 'string');
    assert.ok(Array.isArray(m.files) && m.files.length === 4, `each matched commit touched 4 files: ${JSON.stringify(m.files)}`); }
  assert.equal(j.matches[0].msg, 'add status cancelled');
  assert.equal(j.matches[0].sha, shaOf('add status cancelled'));

  assert.equal(j.places.length, 4);
  const byRel = Object.fromEntries(j.places.map(p => [p.rel, p]));
  for (const f of STATUS_FILES) {
    const p = byRel[f]; assert.ok(p, `place missing for ${f}: ${JSON.stringify(j.places)}`);
    assert.equal(p.k, 3); assert.equal(p.of, 3);
    assert.equal(p.exists, true);
    assert.equal(typeof p.module, 'string');
    assert.ok(Array.isArray(p.scopes), 'scopes come from the top-ranked match, as names'); }
  assert.ok(byRel[STATUS_FILES[0]].scopes.length > 0, `the enum file's own scopes changed in the top match: ${JSON.stringify(byRel[STATUS_FILES[0]])}`);

  // the empty-message commit must not be among the matches (nothing to match on) and must not have crashed anything
  const emptySha = gitIn(repo, 'log', '--format=%H%x1f%s').trim().split('\n').map(l => l.split('\x1f')).find(([, s]) => s === '')?.[0];
  assert.ok(emptySha, 'fixture sanity: an empty-message commit exists');
  assert.ok(!j.matches.some(m => m.sha === emptySha), 'a commit with no message can never clear the floor for this query');

  const mcp = await mcpCall(repo, 'grain_how', { query: 'add status' });
  assert.deepEqual(JSON.parse(mcp), j, 'grain_how must return exactly what `how --json` returns');
});

test('(e) with no history available (--no-history) `how` says so plainly and exits 0', () => {
  const r = grain(['how', 'add status', '--no-history'], repo);
  assert.equal(r.code, 0, `--no-history must not crash how — stderr:\n${r.err}`);
  assert.match(r.out, /no history available/i, `expected a clear no-history message, got:\n${r.out}`);
  assert.match(r.out, /grain where/, 'the message points the reader at the command that can still answer');
  assert.ok(!r.out.split('\n').some(l => l.startsWith('example (')), 'nothing may be cited as an example without history');

  const j = JSON.parse(grain(['how', 'add status', '--no-history', '--json'], repo).out);
  assert.deepEqual(j.matches, []); assert.deepEqual(j.places, []);
});

test('(f) a place whose file has since moved is reported at its current path; one since deleted from HEAD is omitted entirely (§066)', () => {
  // lineage is NOT read off `H.lc`: that map rewrites its keys forward on a rename (the old path is deleted from
  // it), so an old path can never be looked up there. `fps[*].renames` records both sides of every code-file
  // rename, and that is what `how` chases forward.
  const moved = join(tmp, 'moved'); day = 0; buildFixture(moved);
  mkdirSync(join(moved, 'src/models'), { recursive: true });
  gitIn(moved, 'mv', 'src/dto/order.dto.ts', 'src/models/order.dto.ts');
  gitIn(moved, 'rm', '-q', 'tests/fixtures/order.fixture.ts');
  commit(moved, 'move the dto into models and drop the fixture helper');

  const j = JSON.parse(grain(['how', 'add status', '--json'], moved).out);
  assert.equal(j.matches.length, 3, 'the rename commit carries neither query token, in its message or its paths, so it must not match');
  const byRel = Object.fromEntries(j.places.map(p => [p.rel, p]));
  assert.ok(byRel['src/models/order.dto.ts'], `the moved file must be reported at its CURRENT path: ${JSON.stringify(j.places)}`);
  assert.equal(byRel['src/models/order.dto.ts'].k, 3, 'following the rename must not split its 3/3 into two half-places');
  assert.equal(byRel['src/models/order.dto.ts'].exists, true);
  assert.ok(!byRel['src/dto/order.dto.ts'], 'the historical path must not also appear');

  // §066: a place with no successor — dead at HEAD — is no longer reported at all (an agent following this list
  // would edit dead code otherwise). Neither the JSON places array nor the text rendering may mention it.
  assert.ok(!byRel['tests/fixtures/order.fixture.ts'], `a place with no successor must be omitted, not reported: ${JSON.stringify(j.places)}`);
  const text = grain(['how', 'add status'], moved).out;
  assert.ok(!text.includes('tests/fixtures/order.fixture.ts'), `the deleted file must not appear in the text rendering either, got:\n${text}`);
  assert.ok(!text.includes('(deleted)'), `how no longer uses a (deleted) marker — dead places are omitted, not labeled, got:\n${text}`);
});

// a minimal MCP client over the real server subprocess — same technique as tests/mcp-server.test.mjs
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
      await send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'how-test', version: '0' } });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
      const r = await send('tools/call', { name, arguments: args });
      clearTimeout(t); child.stdin.end(); child.kill();
      if (r.error) return reject(new Error(JSON.stringify(r.error)));
      if (r.result?.isError) return reject(new Error(r.result.content.map(c => c.text).join('\n')));
      resolve(r.result.content[0].text);
    })().catch(e => { clearTimeout(t); try { child.kill(); } catch { /* already dead */ } reject(e); });
  }); }
