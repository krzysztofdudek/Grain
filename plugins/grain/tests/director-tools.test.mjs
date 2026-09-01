// The director skill's scripts: tk.mjs (tickets), queue.mjs (work queue), status.mjs
// (session digest), premerge.mjs (pre-merge checklist). All four live at
// .claude/skills/director/scripts/ and operate on a `.system/` tree — never on the
// real .system/ (this file always builds a temporary, `.system/`-shaped fixture).
//   node --test plugins/grain/tests/      (from the repo root)      or      npm test   (inside plugins/grain)
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(here, '..', '..', '..', '.claude', 'skills', 'director', 'scripts');
const TK = join(SCRIPTS, 'tk.mjs');
const QUEUE = join(SCRIPTS, 'queue.mjs');
const STATUS = join(SCRIPTS, 'status.mjs');
const PREMERGE = join(SCRIPTS, 'premerge.mjs');

function runNode(script, args) {
  const r = spawnSync('node', [script, ...args], { encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status };
}

function makeFixtureRoot(prefix) {
  const tmp = mkdtempSync(join(tmpdir(), `director-tools-${prefix}-`));
  mkdirSync(join(tmp, '.git')); // marker only — tk/queue never run git
  return tmp;
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

// ============================================================ tk.mjs ======

describe('tk.mjs', () => {
  let root;
  before(() => { root = makeFixtureRoot('tk'); });
  after(() => rmSync(root, { recursive: true, force: true }));

  test('new allocates 001, then 002, and writes the exact template', () => {
    const a = runNode(TK, ['new', 'first-bug', '--title', 'First bug', '--severity', 'high', '--found-by', 'tester', '--root', root]);
    assert.equal(a.code, 0, a.err);
    assert.equal(a.out, '001');
    const b = runNode(TK, ['new', 'second-bug', '--title', 'Second bug', '--root', root]);
    assert.equal(b.out, '002');

    const text = readFileSync(join(root, '.system', 'issues', '001-first-bug', 'issue.md'), 'utf8');
    assert.match(text, /^# 001 · First bug$/m);
    assert.match(text, /^\*\*Status:\*\* OPEN$/m);
    assert.match(text, /^\*\*Found by:\*\* tester, \d{4}-\d{2}-\d{2}$/m);
    assert.match(text, /^\*\*Severity:\*\* high$/m);
    assert.match(text, /^\*\*Class:\*\* -$/m);
    assert.match(text, /## Symptom/);
    assert.match(text, /## Acceptance/);
    assert.equal(existsSync(join(root, '.system', 'issues', '001-first-bug', 'log.md')), true);

    // no severity/found-by given -> defaults
    const text2 = readFileSync(join(root, '.system', 'issues', '002-second-bug', 'issue.md'), 'utf8');
    assert.match(text2, /^\*\*Found by:\*\* -, \d{4}-\d{2}-\d{2}$/m);
    assert.match(text2, /^\*\*Severity:\*\* unknown$/m);
  });

  test('new rejects a bad --severity', () => {
    const r = runNode(TK, ['new', 'bad-sev', '--title', 'x', '--severity', 'critical', '--root', root]);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /severity/);
  });

  test('next reports the next free id', () => {
    const r = runNode(TK, ['next', '--root', root]);
    assert.equal(r.out, '003');
  });

  test('list shows id state severity class title, sorted by id', () => {
    const r = runNode(TK, ['list', '--root', root]);
    assert.equal(r.code, 0, r.err);
    const lines = r.out.split('\n');
    assert.match(lines[0], /^id\s+state\s+severity\s+class\s+title/);
    assert.match(lines[1], /^001\s+open\s+high\s+-\s+First bug/);
    assert.match(lines[2], /^002\s+open\s+unknown\s+-\s+Second bug/);
  });

  test('list --json returns structured rows', () => {
    const r = runNode(TK, ['list', '--json', '--root', root]);
    const rows = JSON.parse(r.out);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { id: '001', state: 'open', severity: 'high', class: '-', title: 'First bug' });
  });

  test('status rewrites the Status line, with and without a note', () => {
    const withNote = runNode(TK, ['status', '001', 'fixed', 'verified independently', '--root', root]);
    assert.equal(withNote.code, 0, withNote.err);
    let text = readFileSync(join(root, '.system', 'issues', '001-first-bug', 'issue.md'), 'utf8');
    assert.match(text, /^\*\*Status:\*\* FIXED — verified independently$/m);

    const noNote = runNode(TK, ['status', '002', 'diagnosed', '--root', root]);
    assert.equal(noNote.code, 0, noNote.err);
    text = readFileSync(join(root, '.system', 'issues', '002-second-bug', 'issue.md'), 'utf8');
    assert.match(text, /^\*\*Status:\*\* DIAGNOSED$/m);
  });

  test('status refuses an unknown state and leaves the file untouched', () => {
    const before_ = readFileSync(join(root, '.system', 'issues', '001-first-bug', 'issue.md'), 'utf8');
    const r = runNode(TK, ['status', '001', 'bogus-state', '--root', root]);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /unknown state/);
    const after_ = readFileSync(join(root, '.system', 'issues', '001-first-bug', 'issue.md'), 'utf8');
    assert.equal(before_, after_);
  });

  test('status refuses a nonexistent ticket id', () => {
    const r = runNode(TK, ['status', '999', 'open', '--root', root]);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /no ticket/);
  });

  test('log appends a dated entry to log.md, creating it if missing', () => {
    const r = runNode(TK, ['log', '002', 'left a note here', '--root', root]);
    assert.equal(r.code, 0, r.err);
    const log = readFileSync(join(root, '.system', 'issues', '002-second-bug', 'log.md'), 'utf8');
    assert.match(log, /^## \d{4}-\d{2}-\d{2} \d{2}:\d{2} — left a note here$/m);
  });

  test('show prints issue.md; --log prints log.md', () => {
    const issue = runNode(TK, ['show', '2', '--root', root]); // unpadded id also resolves
    assert.match(issue.out, /^# 002 · Second bug/);
    const log = runNode(TK, ['show', '002', '--log', '--root', root]);
    assert.match(log.out, /left a note here/);
  });

  test('ledger counts by state and severity and lists open tickets, text and --json', () => {
    const text = runNode(TK, ['ledger', '--root', root]);
    assert.equal(text.code, 0, text.err);
    assert.match(text.out, /^total: 2$/m);
    assert.match(text.out, /fixed: 1/);
    assert.match(text.out, /diagnosed: 1/);

    const json = JSON.parse(runNode(TK, ['ledger', '--json', '--root', root]).out);
    assert.equal(json.total, 2);
    assert.equal(json.byState.fixed, 1);
    assert.equal(json.byState.diagnosed, 1);
    // 001 is fixed (closed) so open should only list 002
    assert.deepEqual(json.open.map((o) => o.id), ['002']);
  });

  test('grep matches lines across issue.md and log.md, prefixed by id', () => {
    const r = runNode(TK, ['grep', 'left a note', '--root', root]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^002: .*left a note here/m);
  });

  test('list filters by --state, --severity, --class and --open', () => {
    const byState = runNode(TK, ['list', '--state', 'fixed', '--root', root]);
    assert.match(byState.out, /001/);
    assert.doesNotMatch(byState.out, /002/);

    const bySeverity = runNode(TK, ['list', '--severity', 'high', '--root', root]);
    assert.match(bySeverity.out, /001/);
    assert.doesNotMatch(bySeverity.out, /002/);

    const open = runNode(TK, ['list', '--open', '--root', root]);
    assert.doesNotMatch(open.out, /001/); // fixed -> not open
    assert.match(open.out, /002/); // diagnosed -> open
  });

  test('--help exits 0 and unknown command exits non-zero', () => {
    const help = runNode(TK, ['--help']);
    assert.equal(help.code, 0);
    assert.match(help.out, /tk — ticket tracker/);
    const bad = runNode(TK, ['frobnicate', '--root', root]);
    assert.notEqual(bad.code, 0);
  });
});

describe('tk.mjs status/severity normalization (messy real-world text)', () => {
  test('normalizeState handles the documented mapping, case-insensitively, with trailing punctuation', async () => {
    const mod = await import(`file://${TK}`);
    const cases = [
      ['FIXED (verified independently)', 'fixed'],
      ['DONE — .properties shipped', 'fixed'],
      ['RESOLVED — measured unreachable', 'resolved'],
      ['RESOLVED + SHIPPED (disclosure A1/A2)', 'resolved'],
      ['OPEN', 'open'],
      ['OPEN — cosmetic, but it is an honesty defect', 'open'],
      ['DIAGNOSED (b) ranking bug', 'diagnosed'],
      ['ROOT CAUSE FOUND (via 054 measurement)', 'diagnosed'],
      ['MEASURED, patch APPROVED and QUEUED', 'measured'],
      ['APPROVED, QUEUED — measured', 'approved'],
      ['QUEUED for wave 2', 'queued'],
      ['LANDED on main', 'landed'],
      ['WONTFIX — out of scope', 'wontfix'],
      ['', 'unknown'],
      ['SOMETHING ELSE ENTIRELY', 'unknown'],
    ];
    for (const [raw, expected] of cases) {
      assert.equal(mod.normalizeState(raw), expected, `raw=${JSON.stringify(raw)}`);
    }
  });

  test('normalizeSeverity accepts only high/medium/low (case-insensitive), else unknown', async () => {
    const mod = await import(`file://${TK}`);
    assert.equal(mod.normalizeSeverity('HIGH — the worst finding'), 'high');
    assert.equal(mod.normalizeSeverity('medium — a real gap'), 'medium');
    assert.equal(mod.normalizeSeverity('low'), 'low');
    assert.equal(mod.normalizeSeverity('CRITICAL — central type'), 'unknown');
    assert.equal(mod.normalizeSeverity('low-medium'), 'unknown');
    assert.equal(mod.normalizeSeverity(''), 'unknown');
  });
});

// ========================================================= queue.mjs ======

describe('queue.mjs', () => {
  let root;
  before(() => { root = makeFixtureRoot('queue'); });
  after(() => rmSync(root, { recursive: true, force: true }));

  test('add validates kind/agent and rejects bad values', () => {
    const badKind = runNode(QUEUE, ['add', '047', '--kind', 'nope', '--agent', 'sonnet', '--branch', 'fix/047', '--root', root]);
    assert.notEqual(badKind.code, 0);
    assert.match(badKind.err, /--kind/);
    const badAgent = runNode(QUEUE, ['add', '047', '--kind', 'fix', '--agent', 'nope', '--branch', 'fix/047', '--root', root]);
    assert.notEqual(badAgent.code, 0);
    assert.match(badAgent.err, /--agent/);
  });

  test('add creates a queued item with id 1, then 2, and regenerates queue.md', () => {
    const a = runNode(QUEUE, ['add', '047', '--kind', 'fix', '--agent', 'sonnet', '--branch', 'fix/047', '--note', 'HIGH', '--root', root]);
    assert.equal(a.code, 0, a.err);
    const b = runNode(QUEUE, ['add', '054a', '--kind', 'fix', '--agent', 'opus', '--branch', 'fix/054a', '--root', root]);
    assert.equal(b.code, 0, b.err);

    const data = JSON.parse(readFileSync(join(root, '.system', 'queue.json'), 'utf8'));
    assert.equal(data.items.length, 2);
    assert.equal(data.items[0].id, 1);
    assert.equal(data.items[0].state, 'queued');
    assert.equal(data.items[1].id, 2);

    const md = readFileSync(join(root, '.system', 'queue.md'), 'utf8');
    assert.match(md, /## queued \(2\)/);
    assert.match(md, /\| 1 \| 047 \| fix \| sonnet \| fix\/047 \|/);
  });

  test('list --json and set transition state, regenerating the md grouping', () => {
    const list = JSON.parse(runNode(QUEUE, ['list', '--json', '--root', root]).out);
    assert.equal(list.length, 2);

    const setr = runNode(QUEUE, ['set', '1', 'running', '--sha', 'abc1234', '--root', root]);
    assert.equal(setr.code, 0, setr.err);
    const data = JSON.parse(readFileSync(join(root, '.system', 'queue.json'), 'utf8'));
    const item1 = data.items.find((i) => i.id === 1);
    assert.equal(item1.state, 'running');
    assert.equal(item1.sha, 'abc1234');

    const md = readFileSync(join(root, '.system', 'queue.md'), 'utf8');
    assert.match(md, /## running \(1\)/);
    assert.match(md, /## queued \(1\)/);
  });

  test('set by ticket name works too, and refuses an unknown state', () => {
    const byTicket = runNode(QUEUE, ['set', '054a', 'landed', '--root', root]);
    assert.equal(byTicket.code, 0, byTicket.err);
    const bad = runNode(QUEUE, ['set', '1', 'bogus', '--root', root]);
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /unknown state/);
  });

  test('next returns the first queued item honoring --agent/--kind filters', () => {
    runNode(QUEUE, ['add', '055', '--kind', 'measure', '--agent', 'opus', '--branch', 'measure/055', '--root', root]);
    const anyNext = runNode(QUEUE, ['next', '--json', '--root', root]);
    const anyItem = JSON.parse(anyNext.out);
    assert.equal(anyItem.ticket, '055'); // only remaining queued item (1 running, 054a landed)

    const noMatch = runNode(QUEUE, ['next', '--agent', 'sonnet', '--root', root]);
    assert.match(noMatch.out, /none queued/);
  });

  test('rm removes an item and regenerates queue.md', () => {
    const list = JSON.parse(runNode(QUEUE, ['list', '--json', '--root', root]).out);
    const target = list.find((i) => i.ticket === '055');
    const r = runNode(QUEUE, ['rm', String(target.id), '--root', root]);
    assert.equal(r.code, 0, r.err);
    const after_ = JSON.parse(readFileSync(join(root, '.system', 'queue.json'), 'utf8'));
    assert.equal(after_.items.find((i) => i.ticket === '055'), undefined);
  });

  test('missing queue.json but existing queue.md starts empty and says so, without touching the md', () => {
    const freshRoot = makeFixtureRoot('queue-fresh');
    try {
      mkdirSync(join(freshRoot, '.system'), { recursive: true });
      writeFileSync(join(freshRoot, '.system', 'queue.md'), '# hand-written queue\nnot JSON-backed yet\n');
      const r = runNode(QUEUE, ['list', '--json', '--root', freshRoot]);
      assert.equal(r.code, 0, r.err);
      assert.deepEqual(JSON.parse(r.out), []);
      assert.match(r.err, /queue\.md exists/);
      const mdStill = readFileSync(join(freshRoot, '.system', 'queue.md'), 'utf8');
      assert.match(mdStill, /hand-written queue/); // untouched — list is read-only
    } finally {
      rmSync(freshRoot, { recursive: true, force: true });
    }
  });

  test('render regenerates queue.md without changing queue.json', () => {
    const before_ = readFileSync(join(root, '.system', 'queue.json'), 'utf8');
    const r = runNode(QUEUE, ['render', '--root', root]);
    assert.equal(r.code, 0, r.err);
    const after_ = readFileSync(join(root, '.system', 'queue.json'), 'utf8');
    assert.equal(before_, after_);
  });
});

// ======================================================== status.mjs ======

describe('status.mjs', () => {
  let root;
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'director-tools-status-'));
    git(root, ['init', '-q', '-b', 'main']);
    mkdirSync(join(root, 'plugins', 'grain', 'engine'), { recursive: true });
    writeFileSync(join(root, 'plugins', 'grain', 'engine', 'config.mjs'),
      "export const ENGINE_VERSION = '9.9.9';\nexport const EXTR_V = 'g99';\nexport const HIST_V = 'h99';\nexport const MODEL_V = 'm99';\n");
    writeFileSync(join(root, 'README.md'), 'fixture\n');
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'init']);
    // fix/099 needs a commit of its own (touching something other than plugins/grain/) —
    // otherwise its tip is an ancestor of main and `git branch --merged main` calls it
    // "merged" even though no work was ever integrated.
    git(root, ['checkout', '-q', '-b', 'fix/099']);
    writeFileSync(join(root, 'NOTES.md'), 'wip\n');
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'fix/099 wip']);
    git(root, ['checkout', '-q', 'main']);
    runNode(TK, ['new', 'a-bug', '--title', 'A bug', '--severity', 'low', '--root', root]);
    runNode(TK, ['status', '001', 'fixed', '--root', root]);
    runNode(QUEUE, ['add', '001', '--kind', 'fix', '--agent', 'sonnet', '--branch', 'fix/001', '--root', root]);
    // .system/ is committed state (only .system/cache/ is gitignored) — commit it so the
    // fixture starts clean, the way a real checkout would.
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'seed .system/']);
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  test('buildDigest reports HEAD, versions, branches, worktrees, tickets, queue', async () => {
    const mod = await import(`file://${STATUS}`);
    const d = mod.buildDigest(root);
    assert.equal(d.head.branch, 'main');
    assert.equal(d.head.uncommitted, 0);
    assert.deepEqual(d.versions, { ENGINE_VERSION: '9.9.9', EXTR_V: 'g99', HIST_V: 'h99', MODEL_V: 'm99' });
    assert.equal(d.worktrees, 1);
    assert.equal(d.branches.length, 1);
    assert.equal(d.branches[0].branch, 'fix/099');
    assert.equal(d.branches[0].merged, false);
    assert.equal(d.branches[0].staleBase, false); // branched from main's own tip, nothing missed
    assert.equal(d.ledger.total, 1);
    assert.equal(d.ledger.byState.fixed, 1);
    assert.equal(d.queue.total, 1);
    assert.equal(d.queue.byState.queued, 1);
    assert.equal(d.lastSuite, null);
  });

  test('flags STALE BASE when main gains plugins/grain/ commits the branch lacks', () => {
    writeFileSync(join(root, 'plugins', 'grain', 'engine', 'config.mjs'),
      "export const ENGINE_VERSION = '9.9.10';\nexport const EXTR_V = 'g100';\nexport const HIST_V = 'h99';\nexport const MODEL_V = 'm99';\n");
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'bump on main']);
    const r = runNode(STATUS, ['--json', '--root', root]);
    const d = JSON.parse(r.out);
    const b = d.branches.find((x) => x.branch === 'fix/099');
    assert.equal(b.staleBase, true);
  });

  test('CLI --json output matches buildDigest shape and text mode prints a compact digest', () => {
    const jsonRun = runNode(STATUS, ['--json', '--root', root]);
    assert.equal(jsonRun.code, 0, jsonRun.err);
    const d = JSON.parse(jsonRun.out);
    assert.ok(d.head && d.versions && d.branches && d.ledger && d.queue);

    const textRun = runNode(STATUS, ['--root', root]);
    assert.equal(textRun.code, 0, textRun.err);
    assert.match(textRun.out, /^HEAD [0-9a-f]+ on main/m);
    assert.match(textRun.out, /^versions: ENGINE_VERSION=9\.9\.10/m);
    const lineCount = textRun.out.split('\n').length;
    assert.ok(lineCount <= 25, `expected a compact digest, got ${lineCount} lines`);
  });
});

// ======================================================= premerge.mjs =====

describe('premerge.mjs', () => {
  let root;

  function writeConfig(dir, { extrV, widgetBody }) {
    writeFileSync(join(dir, 'plugins', 'grain', 'engine', 'config.mjs'),
      `export const ENGINE_VERSION = '0.1.0';\nexport const EXTR_V = '${extrV}';\nexport const HIST_V = 'h1';\nexport const MODEL_V = 'm1';\nexport function widget() { return '${widgetBody}'; }\n`);
  }

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'director-tools-premerge-'));
    mkdirSync(join(root, 'plugins', 'grain', 'engine'), { recursive: true });
    mkdirSync(join(root, 'plugins', 'grain', 'tests'), { recursive: true });
    git(root, ['init', '-q', '-b', 'main']);
    writeConfig(root, { extrV: 'g1', widgetBody: 'old' });
    writeFileSync(join(root, 'plugins', 'grain', 'tests', 'existing.test.mjs'),
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('existing passes', () => { assert.equal(1, 1); });\n");
    writeFileSync(join(root, 'plugins', 'grain', 'package.json'),
      '{ "name": "fixture", "type": "module", "scripts": { "test": "node --test tests/*.test.mjs" } }\n');
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'init']);
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  test('happy path: fresh base, version bumped, revert-test red on main, full suite green -> READY', () => {
    git(root, ['checkout', '-q', '-b', 'fix/happy']);
    writeConfig(root, { extrV: 'g2', widgetBody: 'new' });
    writeFileSync(join(root, 'plugins', 'grain', 'tests', 'widget.test.mjs'),
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { widget } from '../engine/config.mjs';\ntest('widget returns new', () => { assert.equal(widget(), 'new'); });\n");
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'fix widget']);
    git(root, ['checkout', '-q', 'main']);
    const wtPath = mkdtempSync(join(tmpdir(), 'director-tools-wt-happy-'));
    rmSync(wtPath, { recursive: true, force: true }); // worktree add requires the path not to exist
    git(root, ['worktree', 'add', '-q', wtPath, 'fix/happy']);

    try {
      const r = runNode(PREMERGE, ['fix/happy', '--json', '--root', root]);
      assert.equal(r.code, 0, r.err + r.out);
      const result = JSON.parse(r.out);
      assert.equal(result.allOk, true);
      assert.equal(result.staleBase, false);
      assert.equal(result.versionChanged, true);
      assert.equal(result.revertTest.ok, true);
      assert.equal(result.revertTest.files[0].fail, 1);
      assert.equal(result.suite.ok, true);
      assert.equal(result.suite.summary.fail, 0);
      assert.equal(result.suite.summary.tests, 2);

      // no leftover temp test file, and no tracked-file diff, on the main tree
      assert.equal(existsSync(join(root, 'plugins', 'grain', 'tests', 'widget.test.mjs')), false);
      const status = git(root, ['status', '--porcelain', '--', 'plugins/grain']).trim();
      assert.equal(status, '');

      const lastSuite = JSON.parse(readFileSync(join(root, '.system', 'cache', 'last-suite.json'), 'utf8'));
      assert.equal(lastSuite.tests, 2);
      assert.equal(lastSuite.fail, 0);
      assert.ok(lastSuite.sha);
      assert.ok(lastSuite.at);
    } finally {
      git(root, ['worktree', 'remove', '--force', wtPath]);
    }
  });

  test('config.mjs changed without a version bump -> version check fails', () => {
    git(root, ['checkout', '-q', '-b', 'fix/noverbump']);
    writeConfig(root, { extrV: 'g1', widgetBody: 'tweaked' }); // same EXTR_V, only body changed
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'tweak widget, forgot version bump']);
    git(root, ['checkout', '-q', 'main']);

    const r = runNode(PREMERGE, ['fix/noverbump', '--no-suite', '--json', '--root', root]);
    assert.notEqual(r.code, 0);
    const result = JSON.parse(r.out);
    assert.equal(result.allOk, false);
    assert.equal(result.configChanged, true);
    assert.equal(result.versionChanged, false);
    const versionCheck = result.checks.find((c) => c.name === 'version constants');
    assert.equal(versionCheck.ok, false);
  });

  test('a new test with zero failures on main is not load-bearing -> revert-test fails', () => {
    git(root, ['checkout', '-q', '-b', 'fix/zerofail']);
    writeFileSync(join(root, 'plugins', 'grain', 'tests', 'noop.test.mjs'),
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('always true', () => { assert.equal(1, 1); });\n");
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'add non-load-bearing test']);
    git(root, ['checkout', '-q', 'main']);

    const r = runNode(PREMERGE, ['fix/zerofail', '--no-suite', '--json', '--root', root]);
    assert.notEqual(r.code, 0);
    const result = JSON.parse(r.out);
    const revertCheck = result.checks.find((c) => c.name.startsWith('revert-test'));
    assert.equal(revertCheck.ok, false);
    assert.equal(result.revertTest.files[0].fail, 0);
    assert.equal(existsSync(join(root, 'plugins', 'grain', 'tests', 'noop.test.mjs')), false); // cleaned up
  });

  test('no new test files in the diff -> revert-test is trivially ok', () => {
    git(root, ['checkout', '-q', '-b', 'fix/notests']);
    writeFileSync(join(root, 'README.md'), 'unrelated doc change\n');
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'docs only']);
    git(root, ['checkout', '-q', 'main']);

    const r = runNode(PREMERGE, ['fix/notests', '--no-suite', '--json', '--root', root]);
    const result = JSON.parse(r.out);
    const revertCheck = result.checks.find((c) => c.name.startsWith('revert-test'));
    assert.equal(revertCheck.ok, true);
    assert.match(revertCheck.note, /no new test files/);
  });

  test('STALE BASE: main gains plugins/grain/ commits the (unmerged) branch lacks', () => {
    // The branch needs a commit of its own (unrelated to plugins/grain) — otherwise its
    // tip is an ancestor of main and `git branch --merged` calls it merged regardless.
    git(root, ['checkout', '-q', '-b', 'fix/stale']);
    writeFileSync(join(root, 'NOTES.md'), 'wip\n');
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'fix/stale wip']);
    git(root, ['checkout', '-q', 'main']);
    writeFileSync(join(root, 'plugins', 'grain', 'tests', 'existing.test.mjs'),
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('existing passes', () => { assert.equal(1, 1); });\ntest('extra', () => { assert.equal(2, 2); });\n");
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'advance main under plugins/grain']);

    const r = runNode(PREMERGE, ['fix/stale', '--no-suite', '--json', '--root', root]);
    assert.notEqual(r.code, 0);
    const result = JSON.parse(r.out);
    assert.equal(result.staleBase, true);
    const baseCheck = result.checks.find((c) => c.name === 'base freshness');
    assert.equal(baseCheck.ok, false);
    assert.match(baseCheck.note, /STALE BASE/);
  });

  test('--no-suite skips the full-suite check without blocking on it', () => {
    const r = runNode(PREMERGE, ['fix/notests', '--no-suite', '--json', '--root', root]);
    const result = JSON.parse(r.out);
    assert.equal(result.suite.skipped, true);
    const suiteCheck = result.checks.find((c) => c.name.startsWith('full suite'));
    assert.equal(suiteCheck.ok, true);
    assert.match(suiteCheck.note, /skipped/);
  });

  test('without --no-suite, a branch with no worktree fails the full-suite check', () => {
    const r = runNode(PREMERGE, ['fix/notests', '--json', '--root', root]);
    assert.notEqual(r.code, 0);
    const result = JSON.parse(r.out);
    const suiteCheck = result.checks.find((c) => c.name.startsWith('full suite'));
    assert.equal(suiteCheck.ok, false);
    assert.match(suiteCheck.note, /no worktree/);
  });

  test('an unknown branch fails cleanly', () => {
    const r = runNode(PREMERGE, ['does-not-exist', '--root', root]);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /no such branch/);
  });

  test('--help and no-args both print usage', () => {
    const help = runNode(PREMERGE, ['--help']);
    assert.equal(help.code, 0);
    assert.match(help.out, /premerge <branch>/);
    const noargs = runNode(PREMERGE, []);
    assert.notEqual(noargs.code, 0);
  });
});
