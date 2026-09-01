// UserPromptSubmit hook (§J6.1): `how` speaks unbidden ONLY when the prompt itself resembles a certified change
// archetype or strongly matches several past commits — never the raw commit examples (J0.1), never built from
// `howCmd`'s own `lines` array (never empty — it falls back to a structural map at zero matches), and never by
// walking or refreshing the history cache (the same "never builds, never refreshes" contract `check-hook` holds).
//
// The certified-archetype fixture is the same one §J4.1's own test builds (duplicated here, not imported, on the
// same principle that test already states: every assertion is about which commits cluster and what a query's own
// words land on, so this file must own every commit message and file name too).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };

const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
const Cap = s => s[0].toUpperCase() + s.slice(1);
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
const seenPath = () => join(repo, '.grain', 'cache', 'hook-seen.json');
const historyPath = () => join(repo, '.grain', 'cache', 'history.json');
const hook = (prompt, extra = {}) => {
  const r = spawnSync('node', [BIN, 'how-hook'], { cwd: repo, encoding: 'utf8',
    input: JSON.stringify({ cwd: repo, session_id: 's1', prompt_id: 'p1', transcript_path: join(tmp, 'transcript.jsonl'), permission_mode: 'default', hook_event_name: 'UserPromptSubmit', prompt, prompt_source: 'user_input', ...extra }) });
  return { out: (r.stdout || '').trim(), err: r.stderr, code: r.status }; };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-how-hook-'));
  repo = join(tmp, 'fixture'); buildFixture(repo);
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('a prompt matching a certified change archetype strongly injects the shape and places, no example/commit text', () => {
  rmSync(seenPath(), { force: true });
  const r = hook('please add status');
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  const ctx = j.hookSpecificOutput.additionalContext;
  assert.match(ctx, /certified shape "/, `expected a certified-shape line, got:\n${ctx}`);
  assert.match(ctx, /\(8 of 8\)/, `each cell must carry its k-of-n, got:\n${ctx}`);
  assert.match(ctx, /places such a change touched:/, `expected a places block, got:\n${ctx}`);
  assert.match(ctx, /src\/enums\/order-status\.enum\.ts \(3\/3\)/, `expected a place with its k/of count, got:\n${ctx}`);
  assert.doesNotMatch(ctx, /example \(/, `no commit-example voice allowed (J0.1), got:\n${ctx}`);
  assert.doesNotMatch(ctx, /add status (lapsed|frozen|voided|settled|escrowed)/i, `no cited commit message text allowed, got:\n${ctx}`);
});

test('a prompt with no meaningful match stays silent, exit 0', () => {
  const r = hook('totally unrelated banana spaceship');
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, '');
});

test('the same matching prompt repeated within the TTL stays silent the second time', () => {
  rmSync(seenPath(), { force: true });
  const r1 = hook('please add status');
  assert.match(r1.out, /certified shape/);
  const r2 = hook('please add status');
  assert.equal(r2.out, '', 'a repeat landing on the same matched commits must stay silent inside the TTL window');
});

test('a stale history.json (lastSha no longer HEAD) makes the hook bail cleanly, and never rewrites it', () => {
  rmSync(seenPath(), { force: true });
  const raw = readFileSync(historyPath(), 'utf8');
  const state = JSON.parse(raw); state.lastSha = 'f'.repeat(40);
  writeFileSync(historyPath(), JSON.stringify(state));
  try {
    const r = hook('please add status');
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, '', 'a stale history state must never speak, and must never trigger a walk to refresh itself');
    assert.equal(readFileSync(historyPath(), 'utf8'), JSON.stringify(state), 'the hook must never write history.json');
  } finally { writeFileSync(historyPath(), raw); }
});

test('a missing history.json makes the hook bail cleanly, and never creates one', () => {
  rmSync(seenPath(), { force: true });
  const raw = readFileSync(historyPath(), 'utf8');
  rmSync(historyPath());
  try {
    const r = hook('please add status');
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, '');
    assert.equal(existsSync(historyPath()), false, 'the hook must never build/write history.json as a side effect');
  } finally { writeFileSync(historyPath(), raw); }
});

test('a prompt_source other than user_input (slash command / skill / sub-agent) is skipped', () => {
  rmSync(seenPath(), { force: true });
  const r = hook('please add status', { prompt_source: 'slash_command' });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, '', 'a deliberate slash-command/skill invocation gets no unsolicited injection');
});

test('no payload, unparseable input, and a repo with no index are all silence, never an error', () => {
  const r1 = spawnSync('node', [BIN, 'how-hook'], { cwd: repo, encoding: 'utf8', input: '' });
  assert.equal(r1.status, 0); assert.equal((r1.stdout || '').trim(), '');
  const bare = join(tmp, 'bare'); mkdirSync(bare, { recursive: true });
  const r2 = spawnSync('node', [BIN, 'how-hook'], { cwd: bare, encoding: 'utf8', input: JSON.stringify({ cwd: bare, hook_event_name: 'UserPromptSubmit', prompt: 'please add status', prompt_source: 'user_input' }) });
  assert.equal(r2.status, 0); assert.equal((r2.stdout || '').trim(), '');
  assert.throws(() => readFileSync(join(bare, '.grain/cache/model.json'))); // and it must NOT have built an index as a side effect
});
