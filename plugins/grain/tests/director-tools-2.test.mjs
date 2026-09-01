// director skill toolset, part 2 — handoff.mjs, decide.mjs, escalate.mjs, wave.mjs.
//
// Every test runs the real scripts as child processes against a throwaway
// fixture directory (its own git repo, its own .system/), never the real
// repo's .system/. The scripts resolve their repo root by walking up from
// their own file location to find `.git` (see lib.mjs), so each fixture
// gets its own copy of the scripts directory rather than an env-var
// override — that's what makes "runnable from repo root, no cwd
// assumptions" actually get exercised by the tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REAL_SCRIPTS = join(here, '..', '..', '..', '.claude', 'skills', 'director', 'scripts');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', TZ: 'UTC' };
const today = () => new Date().toISOString().slice(0, 10);

function mkFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'director-tools-2-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, env: { ...process.env, ...gitEnv } });
  writeFileSync(join(dir, 'README.md'), 'fixture\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir, env: { ...process.env, ...gitEnv } });

  const scriptsDir = join(dir, '.claude', 'skills', 'director', 'scripts');
  mkdirSync(scriptsDir, { recursive: true });
  cpSync(REAL_SCRIPTS, scriptsDir, { recursive: true });
  return dir;
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function run(dir, script, args) {
  const scriptPath = join(dir, '.claude', 'skills', 'director', 'scripts', script);
  const r = spawnSync('node', [scriptPath, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: (r.stderr || '').replace(/\n$/, ''), code: r.status };
}

function readSys(dir, rel) {
  return readFileSync(join(dir, '.system', rel), 'utf8');
}

function writeSys(dir, rel, content) {
  const p = join(dir, '.system', rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

// ---------------------------------------------------------------- handoff.mjs

test('handoff read on a fresh fixture says so and exits 0', () => {
  const dir = mkFixture();
  const r = run(dir, 'handoff.mjs', ['read']);
  assert.equal(r.code, 0);
  assert.equal(r.out, 'no handoff — fresh start');
  assert.equal(existsSync(join(dir, '.system', 'handoff.json')), false);
  cleanup(dir);
});

test('handoff read --json on a fresh fixture returns null', () => {
  const dir = mkFixture();
  const r = run(dir, 'handoff.mjs', ['read', '--json']);
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.out), null);
  cleanup(dir);
});

test('handoff write requires --summary', () => {
  const dir = mkFixture();
  const r = run(dir, 'handoff.mjs', ['write']);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /--summary/);
  cleanup(dir);
});

test('handoff write rejects an invalid --by', () => {
  const dir = mkFixture();
  const r = run(dir, 'handoff.mjs', ['write', '--summary', 's', '--by', 'nobody']);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /--by/);
  cleanup(dir);
});

test('handoff write auto-fills head, inFlight from queue.json, lastActions from plan.md', () => {
  const dir = mkFixture();
  writeSys(dir, 'queue.json', JSON.stringify({
    items: [
      { name: '049', state: 'running', agentId: 'fix-049', branch: 'fix/049', task: 'fix extends-arg bug' },
      { name: '016', state: 'done', task: 'old, not running' },
    ],
  }));
  writeSys(dir, 'plan.md', Array.from({ length: 12 }, (_, i) => `- line ${i + 1}`).join('\n') + '\n');

  const r = run(dir, 'handoff.mjs', ['write', '--summary', 'kicking off', '--next', 'do x', '--next', 'do y', '--note', 'careful']);
  assert.equal(r.code, 0);

  const doc = JSON.parse(run(dir, 'handoff.mjs', ['read', '--json']).out);
  assert.match(doc.head, /^main@[0-9a-f]+$/);
  assert.equal(doc.summary, 'kicking off');
  assert.deepEqual(doc.nextActions, ['do x', 'do y']);
  assert.deepEqual(doc.notes, ['careful']);
  assert.equal(doc.inFlight.length, 1);
  assert.equal(doc.inFlight[0].name, '049');
  assert.equal(doc.inFlight[0].agentId, 'fix-049');
  assert.equal(doc.inFlight[0].branch, 'fix/049');
  // last 10 non-blank lines of a 12-line plan.md
  assert.equal(doc.lastActions.length, 10);
  assert.equal(doc.lastActions[0], '- line 3');
  assert.equal(doc.lastActions[9], '- line 12');

  const md = run(dir, 'handoff.mjs', ['read']).out;
  assert.match(md, /kicking off/);
  assert.match(md, /049 agent:fix-049 branch:fix\/049 — fix extends-arg bug/);
  cleanup(dir);
});

test('handoff write with no queue.json / plan.md yields empty inFlight and lastActions', () => {
  const dir = mkFixture();
  const r = run(dir, 'handoff.mjs', ['write', '--summary', 's']);
  assert.equal(r.code, 0);
  const doc = JSON.parse(run(dir, 'handoff.mjs', ['read', '--json']).out);
  assert.deepEqual(doc.inFlight, []);
  assert.deepEqual(doc.lastActions, []);
  cleanup(dir);
});

test('handoff write preserves pendingDecisions and waitingOn added by other commands', () => {
  const dir = mkFixture();
  run(dir, 'handoff.mjs', ['add-decision', 'which store?', '--context', 'A or B']);
  run(dir, 'handoff.mjs', ['add-waiting', 'lead', 'green ci']);
  run(dir, 'handoff.mjs', ['write', '--summary', 'refresh']);
  const doc = JSON.parse(run(dir, 'handoff.mjs', ['read', '--json']).out);
  assert.equal(doc.pendingDecisions.length, 1);
  assert.equal(doc.pendingDecisions[0].question, 'which store?');
  assert.equal(doc.waitingOn.length, 1);
  assert.equal(doc.waitingOn[0].who, 'lead');
  cleanup(dir);
});

test('handoff add-inflight upserts by name; rm-inflight removes it', () => {
  const dir = mkFixture();
  run(dir, 'handoff.mjs', ['add-inflight', 'x', '--task', 'first version']);
  let doc = JSON.parse(run(dir, 'handoff.mjs', ['read', '--json']).out);
  assert.equal(doc.inFlight.length, 1);
  assert.equal(doc.inFlight[0].task, 'first version');

  run(dir, 'handoff.mjs', ['add-inflight', 'x', '--task', 'updated version', '--reports-to', 'director']);
  doc = JSON.parse(run(dir, 'handoff.mjs', ['read', '--json']).out);
  assert.equal(doc.inFlight.length, 1, 'upsert, not append');
  assert.equal(doc.inFlight[0].task, 'updated version');
  assert.equal(doc.inFlight[0].reportsTo, 'director');

  const r = run(dir, 'handoff.mjs', ['rm-inflight', 'x']);
  assert.equal(r.code, 0);
  doc = JSON.parse(run(dir, 'handoff.mjs', ['read', '--json']).out);
  assert.equal(doc.inFlight.length, 0);
  cleanup(dir);
});

test('handoff add-decision assigns sequential ids; resolve-decision removes; unknown id errors', () => {
  const dir = mkFixture();
  const r1 = run(dir, 'handoff.mjs', ['add-decision', 'q1', '--json']);
  const d1 = JSON.parse(r1.out);
  assert.equal(d1.id, 'd1');
  const r2 = run(dir, 'handoff.mjs', ['add-decision', 'q2', '--blocks', 'feature/x', '--json']);
  const d2 = JSON.parse(r2.out);
  assert.equal(d2.id, 'd2');
  assert.equal(d2.blockedBranch, 'feature/x');

  const rr = run(dir, 'handoff.mjs', ['resolve-decision', 'd1']);
  assert.equal(rr.code, 0);
  const doc = JSON.parse(run(dir, 'handoff.mjs', ['read', '--json']).out);
  assert.equal(doc.pendingDecisions.length, 1);
  assert.equal(doc.pendingDecisions[0].id, 'd2');

  const bad = run(dir, 'handoff.mjs', ['resolve-decision', 'd99']);
  assert.notEqual(bad.code, 0);
  cleanup(dir);
});

test('handoff add-waiting / rm-waiting', () => {
  const dir = mkFixture();
  run(dir, 'handoff.mjs', ['add-waiting', 'lead', 'green ci']);
  let doc = JSON.parse(run(dir, 'handoff.mjs', ['read', '--json']).out);
  assert.equal(doc.waitingOn.length, 1);
  assert.equal(doc.waitingOn[0].who, 'lead');
  assert.equal(doc.waitingOn[0].what, 'green ci');

  const r = run(dir, 'handoff.mjs', ['rm-waiting', 'lead']);
  assert.equal(r.code, 0);
  doc = JSON.parse(run(dir, 'handoff.mjs', ['read', '--json']).out);
  assert.equal(doc.waitingOn.length, 0);
  cleanup(dir);
});

test('handoff --help exits 0 and prints usage without requiring a command', () => {
  const dir = mkFixture();
  const r = run(dir, 'handoff.mjs', ['--help']);
  assert.equal(r.code, 0);
  assert.match(r.out, /usage: handoff\.mjs/);
  cleanup(dir);
});

// ----------------------------------------------------------------- decide.mjs

test('decide add + show round-trip, including a multi-line ruling', () => {
  const dir = mkFixture();
  const ruling = 'Use the JSON store.\nSQLite is overkill for this scale.';
  const r = run(dir, 'decide.mjs', ['add', 'store-choice', ruling, '--ticket', '49', '--class', 'B']);
  assert.equal(r.code, 0);

  const show = run(dir, 'decide.mjs', ['show', 'store-choice']);
  assert.equal(show.code, 0);
  assert.match(show.out, new RegExp(`^## ${today()} · store-choice · ticket 49 · class B$`, 'm'));
  assert.match(show.out, /Use the JSON store\.\nSQLite is overkill for this scale\./);

  const raw = readSys(dir, 'decisions.md');
  assert.match(raw, /^## \d{4}-\d{2}-\d{2} · store-choice · ticket 49 · class B$/m);
  cleanup(dir);
});

test('decide add refuses a duplicate slug and leaves the file unchanged', () => {
  const dir = mkFixture();
  run(dir, 'decide.mjs', ['add', 'dup-slug', 'first ruling']);
  const before = readSys(dir, 'decisions.md');
  const r = run(dir, 'decide.mjs', ['add', 'dup-slug', 'second ruling']);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /duplicate slug/);
  assert.equal(readSys(dir, 'decisions.md'), before);
  cleanup(dir);
});

test('decide list filters by --ticket, --class and --grep', () => {
  const dir = mkFixture();
  run(dir, 'decide.mjs', ['add', 'a', 'Ruling A text.', '--ticket', '1', '--class', 'X']);
  run(dir, 'decide.mjs', ['add', 'b', 'Ruling B text.', '--ticket', '2', '--class', 'Y']);
  run(dir, 'decide.mjs', ['add', 'c', 'Something about caching.', '--ticket', '1']);

  const byTicket = run(dir, 'decide.mjs', ['list', '--ticket', '1']).out.split('\n');
  assert.equal(byTicket.length, 2);
  assert.ok(byTicket.every((l) => / 1 /.test(l)));

  const byClass = run(dir, 'decide.mjs', ['list', '--class', 'Y']).out;
  assert.match(byClass, /^\S+ b 2 Y Ruling B text\.$/m);

  const byGrep = run(dir, 'decide.mjs', ['list', '--grep', 'cach']).out.split('\n');
  assert.equal(byGrep.length, 1);
  assert.match(byGrep[0], /^\S+ c 1 - Something about caching\.$/);
  cleanup(dir);
});

test('decide list --json returns structured entries with full body', () => {
  const dir = mkFixture();
  run(dir, 'decide.mjs', ['add', 'z', 'line one\nline two']);
  const entries = JSON.parse(run(dir, 'decide.mjs', ['list', '--json']).out);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].slug, 'z');
  assert.equal(entries[0].body, 'line one\nline two');
  cleanup(dir);
});

test('decide show on an unknown slug errors', () => {
  const dir = mkFixture();
  const r = run(dir, 'decide.mjs', ['show', 'nope']);
  assert.notEqual(r.code, 0);
  cleanup(dir);
});

test('decide tolerates a preamble and a non-dated "Lekcje" heading when parsing', () => {
  const dir = mkFixture();
  writeSys(dir, 'decisions.md', [
    '# Decisions',
    '',
    'This file records durable rulings. Free text preamble, no heading pattern here.',
    '',
    '## 2026-01-01 · early-call · ticket 3',
    'An entry that predates this session.',
    '',
    '## Lekcje',
    '- learned that mocks lie',
    '- learned that fixtures rot',
    '',
  ].join('\n'));

  const list1 = run(dir, 'decide.mjs', ['list']).out.split('\n');
  assert.equal(list1.length, 1);
  assert.match(list1[0], /^2026-01-01 early-call 3 - An entry that predates this session\.$/);

  const r = run(dir, 'decide.mjs', ['add', 'new-call', 'A fresh ruling.']);
  assert.equal(r.code, 0);
  const list2 = run(dir, 'decide.mjs', ['list']).out.split('\n');
  assert.equal(list2.length, 2, 'Lekcje section must not be mistaken for an entry');
  assert.ok(list2.some((l) => l.includes('new-call')));

  const raw = readSys(dir, 'decisions.md');
  assert.match(raw, /## Lekcje/, 'preamble/Lekcje content must survive the append');
  cleanup(dir);
});

test('decide --help exits 0', () => {
  const dir = mkFixture();
  const r = run(dir, 'decide.mjs', ['--help']);
  assert.equal(r.code, 0);
  assert.match(r.out, /usage: decide\.mjs/);
  cleanup(dir);
});

// --------------------------------------------------------------- escalate.mjs

test('escalate add requires a valid --kind', () => {
  const dir = mkFixture();
  const missing = run(dir, 'escalate.mjs', ['add', 'why though']);
  assert.notEqual(missing.code, 0);
  assert.match(missing.err, /--kind/);

  const invalid = run(dir, 'escalate.mjs', ['add', 'why though', '--kind', 'nonsense']);
  assert.notEqual(invalid.code, 0);
  cleanup(dir);
});

test('escalate add defaults --by to lead and records state open', () => {
  const dir = mkFixture();
  const r = run(dir, 'escalate.mjs', ['add', 'ambiguous boundary', '--kind', 'boundary', '--json']);
  const item = JSON.parse(r.out);
  assert.equal(item.by, 'lead');
  assert.equal(item.state, 'open');
  assert.equal(item.kind, 'boundary');
  assert.equal(item.id, '1');
  cleanup(dir);
});

test('escalate list sorts open before ruled, newest first within each group', () => {
  const dir = mkFixture();
  run(dir, 'escalate.mjs', ['add', 'first', '--kind', 'high']);
  run(dir, 'escalate.mjs', ['add', 'second', '--kind', 'other']);
  run(dir, 'escalate.mjs', ['add', 'third', '--kind', 'claim']);
  run(dir, 'escalate.mjs', ['rule', '1', 'ruled on first']);

  const items = JSON.parse(run(dir, 'escalate.mjs', ['list', '--json']).out);
  assert.equal(items.length, 3);
  // ruled items last
  const states = items.map((i) => i.state);
  const lastOpenIdx = states.lastIndexOf('open');
  const firstRuledIdx = states.indexOf('ruled');
  assert.ok(firstRuledIdx === -1 || lastOpenIdx < firstRuledIdx);
  // newest-first among the two open items (3 added after 2)
  const openIds = items.filter((i) => i.state === 'open').map((i) => i.id);
  assert.deepEqual(openIds, ['3', '2']);

  const openOnly = JSON.parse(run(dir, 'escalate.mjs', ['list', '--state', 'open', '--json']).out);
  assert.equal(openOnly.length, 2);
  cleanup(dir);
});

test('escalate rule marks ruled and records the decision via decide.mjs\'s own appender', () => {
  const dir = mkFixture();
  run(dir, 'escalate.mjs', ['add', 'conflicting instructions', '--kind', 'conflict', '--ticket', '7']);
  const r = run(dir, 'escalate.mjs', ['rule', '1', 'go with the newer instruction']);
  assert.equal(r.code, 0);
  assert.match(r.out, /esc-1/);

  const item = JSON.parse(run(dir, 'escalate.mjs', ['show', '1', '--json']).out);
  assert.equal(item.state, 'ruled');
  assert.equal(item.ruling, 'go with the newer instruction');
  assert.ok(item.ruledAt);

  const decisionShow = run(dir, 'decide.mjs', ['show', 'esc-1']);
  assert.equal(decisionShow.code, 0);
  assert.match(decisionShow.out, /· esc-1 · ticket 7/);
  assert.match(decisionShow.out, /go with the newer instruction/);
  cleanup(dir);
});

test('escalate rule on an unknown id, or a second time on the same id, errors', () => {
  const dir = mkFixture();
  run(dir, 'escalate.mjs', ['add', 'x', '--kind', 'version']);
  const bad = run(dir, 'escalate.mjs', ['rule', '99', 'whatever']);
  assert.notEqual(bad.code, 0);

  run(dir, 'escalate.mjs', ['rule', '1', 'first ruling']);
  const twice = run(dir, 'escalate.mjs', ['rule', '1', 'second ruling']);
  assert.notEqual(twice.code, 0);
  assert.match(twice.err, /already ruled/);
  cleanup(dir);
});

test('escalate show on an unknown id errors', () => {
  const dir = mkFixture();
  const r = run(dir, 'escalate.mjs', ['show', '1']);
  assert.notEqual(r.code, 0);
  cleanup(dir);
});

test('escalate --help exits 0', () => {
  const dir = mkFixture();
  const r = run(dir, 'escalate.mjs', ['--help']);
  assert.equal(r.code, 0);
  assert.match(r.out, /usage: escalate\.mjs/);
  cleanup(dir);
});

// -------------------------------------------------------------------- wave.mjs

test('wave current on a fresh fixture prints none', () => {
  const dir = mkFixture();
  const r = run(dir, 'wave.mjs', ['current']);
  assert.equal(r.code, 0);
  assert.equal(r.out, 'none');
  cleanup(dir);
});

test('wave close with no open wave errors', () => {
  const dir = mkFixture();
  const r = run(dir, 'wave.mjs', ['close']);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /no open wave/);
  cleanup(dir);
});

test('wave start/note/merged/audit/close/current, and the exact bullet formats', () => {
  const dir = mkFixture();
  run(dir, 'wave.mjs', ['start', 'alpha', '--note', 'kickoff']);
  assert.equal(run(dir, 'wave.mjs', ['current']).out, 'alpha');

  run(dir, 'wave.mjs', ['note', 'digging into 049']);
  run(dir, 'wave.mjs', ['merged', '049', 'abc1234']);
  run(dir, 'wave.mjs', ['audit', '049', 'pass', 'verified fix works']);
  run(dir, 'wave.mjs', ['close', '--versions', 'EXTR_V g30→g31', '--suite', '1878', '--note', 'clean']);
  assert.equal(run(dir, 'wave.mjs', ['current']).out, 'none');

  const plan = readSys(dir, 'plan.md');
  assert.match(plan, /^# Fala alpha — start \d{4}-\d{2}-\d{2}$/m);
  assert.match(plan, new RegExp(`^- ${today()} kickoff$`, 'm'));
  assert.match(plan, new RegExp(`^- ${today()} digging into 049$`, 'm'));
  assert.match(plan, new RegExp(`^- ${today()} merged: 049 abc1234$`, 'm'));
  assert.match(plan, new RegExp(`^- ${today()} audit: 049 pass — verified fix works$`, 'm'));
  assert.match(plan, /^# Fala alpha — close \d{4}-\d{2}-\d{2}$/m);
  assert.match(plan, /^versions: EXTR_V g30→g31$/m);
  assert.match(plan, /^suite: 1878$/m);
  assert.match(plan, /^note: clean$/m);
  cleanup(dir);
});

test('wave never rewrites pre-existing plan.md content, only appends', () => {
  const dir = mkFixture();
  const priorContent = '# Fala zero — start 2026-01-01\n- 2026-01-01 an entry from before this tool existed\n';
  writeSys(dir, 'plan.md', priorContent);

  run(dir, 'wave.mjs', ['note', 'a fresh note']);
  const after = readSys(dir, 'plan.md');
  assert.ok(after.startsWith(priorContent), 'prior content must be an unmodified prefix');
  assert.match(after, new RegExp(`- ${today()} a fresh note`));
  cleanup(dir);
});

test('wave current tracks the latest start not yet matched by its own close (last-started wins)', () => {
  const dir = mkFixture();
  run(dir, 'wave.mjs', ['start', 'one']);
  run(dir, 'wave.mjs', ['start', 'two']);
  assert.equal(run(dir, 'wave.mjs', ['current']).out, 'two', 'the later start supersedes the unclosed earlier one');

  run(dir, 'wave.mjs', ['close']);
  assert.equal(run(dir, 'wave.mjs', ['current']).out, 'none');
  cleanup(dir);
});

test('wave --help exits 0', () => {
  const dir = mkFixture();
  const r = run(dir, 'wave.mjs', ['--help']);
  assert.equal(r.code, 0);
  assert.match(r.out, /usage: wave\.mjs/);
  cleanup(dir);
});
