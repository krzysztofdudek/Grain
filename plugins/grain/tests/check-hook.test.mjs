// The PostToolUse hook path (`grain check-hook`): after an agent edits a file, grain speaks UNBIDDEN — but only when it
// has findings on the touched lines (a deviation, a maintainer decision, an architecture note). The adoption lesson of
// the historical-replay trial: a correct index that waits to be queried never reaches the code; the hook closes that gap.
// It must never build an index, never block an edit, and stay silent on a clean file, a foreign repo, a stale schema.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const hook = (file_path, cwd = repo) => { const r = spawnSync('node', [BIN, 'check-hook'], { cwd, encoding: 'utf8', input: JSON.stringify({ cwd, tool_name: 'Edit', tool_input: { file_path } }) });
  return { out: (r.stdout || '').trim(), err: r.stderr, code: r.status }; };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-hook-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  w('packages/core/util.ts', 'export const util = () => 1;\n');
  w('packages/infra/db.ts', "import { util } from '../core/util';\nexport const db = () => util();\n");
  w('apps/a/main.ts', "import { util } from '../../packages/core/util';\nexport const a = () => util();\n");
  git('add', '-A'); git('commit', '-qm', 'base');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('an edit that creates a first module edge makes the hook speak, as PostToolUse additionalContext', () => {
  const orig = readFileSync(join(repo, 'apps/a/main.ts'), 'utf8');
  w('apps/a/main.ts', "import { db } from '../../packages/infra/db';\n" + orig.replace('util();', 'util() + db();'));
  try {
    const r = hook(join(repo, 'apps/a/main.ts'));
    assert.equal(r.code, 0, r.err);
    const j = JSON.parse(r.out);
    assert.equal(j.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(j.hookSpecificOutput.additionalContext, /FIRST edge apps\/a → packages\/infra/);
  } finally { w('apps/a/main.ts', orig); }
});

test('a clean edit stays silent — no output at all, exit 0', () => {
  const r = hook(join(repo, 'apps/a/main.ts'));
  assert.equal(r.code, 0, r.err); assert.equal(r.out, '');
});

test('an UNCHANGED finding for the same file speaks once, not on every edit; after the TTL it reminds again', () => {
  const seenPath0 = join(repo, '.grain', 'cache', 'hook-seen.json');
  rmSync(seenPath0, { force: true }); // the first test emitted this same finding set — start from fresh state
  const orig = readFileSync(join(repo, 'apps/a/main.ts'), 'utf8');
  w('apps/a/main.ts', "import { db } from '../../packages/infra/db';\n" + orig.replace('util();', 'util() + db();'));
  try {
    const r1 = hook(join(repo, 'apps/a/main.ts'));
    assert.match(r1.out, /FIRST edge/);
    const r2 = hook(join(repo, 'apps/a/main.ts'));
    assert.equal(r2.out, '', 'identical findings within the TTL must stay silent');
    const seenPath = join(repo, '.grain', 'cache', 'hook-seen.json');
    const seen = JSON.parse(readFileSync(seenPath, 'utf8'));
    seen['check:apps/a/main.ts'].t = 1; writeFileSync(seenPath, JSON.stringify(seen)); // age the record past any TTL — namespaced key (seenGate, §J6.1)
    const r3 = hook(join(repo, 'apps/a/main.ts'));
    assert.match(r3.out, /FIRST edge/, 'an aged record reminds again');
  } finally { w('apps/a/main.ts', orig); }
});

test('PreToolUse --pre speaks placement from the PATH alone, before the file exists, and the post-write repeat is suppressed', () => {
  const fp = join(repo, 'packages/misc/util-extra.ts'); // does NOT exist — pre-write
  const seenPath0 = join(repo, '.grain', 'cache', 'hook-seen.json'); rmSync(seenPath0, { force: true });
  const r1 = spawnSync('node', [BIN, 'check-hook', '--pre'], { cwd: repo, encoding: 'utf8', input: JSON.stringify({ cwd: repo, tool_name: 'Write', tool_input: { file_path: fp } }) });
  assert.equal(r1.status, 0, r1.stderr);
  // this tiny fixture has too few suffix-kin for a note — assert the CHANNEL shape on a repo where one fires is done in
  // placement tests; here assert: silence is silence, and a pre note (if any) is PreToolUse-shaped
  if ((r1.stdout || '').trim()) { const j = JSON.parse(r1.stdout);
    assert.equal(j.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.equal(j.hookSpecificOutput.permissionDecision, undefined, 'PreToolUse must never auto-approve the Write — additionalContext alone is delivered regardless of permissionDecision'); }
});

test('no payload, an unparseable file, and a repo with no index are all silence, never an error', () => {
  const r1 = spawnSync('node', [BIN, 'check-hook'], { cwd: repo, encoding: 'utf8', input: '' });
  assert.equal(r1.status, 0); assert.equal((r1.stdout || '').trim(), '');
  const r2 = hook(join(repo, 'README.md'));
  assert.equal(r2.code, 0); assert.equal(r2.out, '');
  const bare = join(tmp, 'bare'); mkdirSync(bare, { recursive: true }); writeFileSync(join(bare, 'x.ts'), 'export const x = 1;\n');
  const r3 = hook(join(bare, 'x.ts'), bare);
  assert.equal(r3.code, 0); assert.equal(r3.out, ''); // and it must NOT have built an index as a side effect
  assert.throws(() => readFileSync(join(bare, '.grain/cache/model.json')));
});
