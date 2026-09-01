// The PreToolUse hook path on Bash (`grain commit-hook`, §J6.3): a `git commit` about to run gets one unbidden
// `review` of the change it is about to record — staged content by default, falling back to the worktree diff for
// `-a`/`-am` (which stages AT commit time, so `--staged` would see nothing yet). Never blocks (additionalContext
// only), and stays silent on any other Bash command, `--help`, a stale schema, or a change with nothing to report.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const git = (env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const handler = (i, body) => `@Handler()\nexport class Handler${i}Handler {\n  run() {\n    return ${body};\n  }\n}\n`;
const hook = (command, cwd = repo) => { const r = spawnSync('node', [BIN, 'commit-hook'], { cwd, encoding: 'utf8', input: JSON.stringify({ cwd, tool_name: 'Bash', tool_input: { command } }) });
  return { out: (r.stdout || '').trim(), err: r.stderr, code: r.status }; };
// each test starts from HEAD's committed state — a shared `before()` builds the established history once; per-test
// worktree/index mutations must not leak into the next test (mirrors review-command.test.mjs's own reset()). `-e
// .grain` is required here (unlike review-command.test.mjs, which never needs it): a plain command like `review`
// self-heals `.grain/.gitignore` via `ensureStore` on every call, but hooks (commit-hook included) never rebuild,
// so once an untracked `.grain/.gitignore` is stripped by one `clean`, cache/ (model.json, hook-seen.json, …)
// stops looking ignored and the NEXT `clean` deletes the whole index — excluding `.grain` avoids that entirely.
const reset = () => { git({}, 'checkout', '-q', 'HEAD', '--', '.'); git({}, 'clean', '-qfd', '-e', '.grain');
  rmSync(join(repo, '.grain', 'cache', 'hook-seen.json'), { force: true }); }; // each test gets its own clean TTL state; the TTL test itself calls the hook twice WITHIN its own body, which this does not touch

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-commit-hook-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git({}, 'init', '-q', '-b', 'main'); git({}, 'config', 'commit.gpgsign', 'false');
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  for (let i = 0; i < 30; i++) w(`src/handlers/Handler${i}.ts`, handler(i, i)); // establishes @Handler()
  git(d1, 'add', 'src/handlers'); git(d1, 'commit', '-qm', 'add handlers');
  // pair-a/pair-b get their OWN commits (never bundled with the 30 handler files above): megaCap (30) excludes any
  // bulk commit touching MORE than 30 files from co-change pairing, so mixing them in would silently drop a pair
  // commit (the same fixture shape review-command.test.mjs uses, for the same reason)
  w('src/pair-a.ts', 'export const a = () => 0;\n');
  w('src/pair-b.ts', 'export const b = () => 0;\n');
  git(d1, 'add', '-A'); git(d1, 'commit', '-qm', 'base');
  for (let i = 1; i <= 8; i++) { w('src/pair-a.ts', `export const a = () => ${i};\n`); w('src/pair-b.ts', `export const b = () => ${i};\n`); git(d1, 'add', '-A'); git(d1, 'commit', '-qm', `pair change ${i}`); }
  w('NOTES.md', 'notes\n'); // pushes HEAD's own date forward so the evidence above clears freshDays (14) and is "established"
  const d2 = dateEnv('2026-03-01T12:00:00Z');
  git(d2, 'add', 'NOTES.md'); git(d2, 'commit', '-qm', 'notes');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
  assert.equal(st.status, 0, st.stdout + st.stderr);
  assert.doesNotMatch(st.stdout, /: 0 conventions/, `sanity: @Handler() must be established: ${st.stdout}`);
});
beforeEach(() => reset());
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('git commit -m "x" with a staged deviant surfaces the finding as PreToolUse additionalContext, no permissionDecision', () => {
  w('src/handlers/Handler0.ts', 'export class Handler0Handler {\n  run() {\n    return 0;\n  }\n}\n'); // decorator dropped
  git({}, 'add', 'src/handlers/Handler0.ts');
  const r = hook('git commit -m "x"');
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(j.hookSpecificOutput.permissionDecision, undefined);
  assert.match(j.hookSpecificOutput.additionalContext, /Handler0/);
  assert.match(j.hookSpecificOutput.additionalContext, /@Handler/);
});

test('a non-commit Bash command stays silent', () => {
  w('src/handlers/Handler0.ts', 'export class Handler0Handler {\n  run() {\n    return 0;\n  }\n}\n');
  git({}, 'add', 'src/handlers/Handler0.ts');
  const r = hook('npm test');
  assert.equal(r.code, 0, r.err); assert.equal(r.out, '');
  const r2 = hook('git status');
  assert.equal(r2.out, '');
});

test('git commit -am "x" with an UNSTAGED-but-dirty deviant still surfaces the finding (the -a fallback to the worktree diff)', () => {
  w('src/handlers/Handler1.ts', 'export class Handler1Handler {\n  run() {\n    return 1;\n  }\n}\n'); // decorator dropped, never staged
  const r = hook('git commit -am "x"');
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.match(j.hookSpecificOutput.additionalContext, /Handler1/);
});

test('git commit --help is not treated as a real commit', () => {
  w('src/handlers/Handler0.ts', 'export class Handler0Handler {\n  run() {\n    return 0;\n  }\n}\n');
  git({}, 'add', 'src/handlers/Handler0.ts');
  const r = hook('git commit --help');
  assert.equal(r.code, 0, r.err); assert.equal(r.out, '');
});

test('an identical staged set + findings repeats-suppresses within the TTL; a different staged set speaks again immediately, under a commit: key', () => {
  const seenPath = join(repo, '.grain', 'cache', 'hook-seen.json');
  rmSync(seenPath, { force: true });
  w('src/handlers/Handler0.ts', 'export class Handler0Handler {\n  run() {\n    return 0;\n  }\n}\n');
  git({}, 'add', 'src/handlers/Handler0.ts');
  const r1 = hook('git commit -m "x"');
  assert.match(r1.out, /Handler0/);
  const r2 = hook('git commit -m "x"');
  assert.equal(r2.out, '', 'identical staged set + findings within TTL must stay silent');
  const seen = JSON.parse(readFileSync(seenPath, 'utf8'));
  const commitKeys = Object.keys(seen).filter(k => k.startsWith('commit:'));
  assert.equal(commitKeys.length, 1, `expected exactly one commit: key, got: ${JSON.stringify(seen)}`);
  w('src/handlers/Handler2.ts', 'export class Handler2Handler {\n  run() {\n    return 2;\n  }\n}\n'); // a DIFFERENT staged file set
  git({}, 'add', 'src/handlers/Handler2.ts');
  const r3 = hook('git commit -m "x"');
  assert.notEqual(r3.out, '', 'a different staged file set must speak again immediately, not wait out the TTL');
  assert.match(r3.out, /Handler2/);
});

test('nothing staged and nothing dirty stays silent — no "0 findings" noise', () => {
  const r = hook('git commit -m "x"');
  assert.equal(r.code, 0, r.err); assert.equal(r.out, '');
});

test('more deviant sections than the cap still keeps the "missing from your change:" block, with a "+N more" note for the truncated sections', () => {
  for (let i = 0; i <= 5; i++) { // 6 deviant files — one more than the 5-section cap
    w(`src/handlers/Handler${i}.ts`, `export class Handler${i}Handler {\n  run() {\n    return ${i};\n  }\n}\n`);
    git({}, 'add', `src/handlers/Handler${i}.ts`);
  }
  w('src/pair-a.ts', 'export const a = () => 999; // edited, pair-b.ts not touched\n');
  git({}, 'add', 'src/pair-a.ts');
  const r = hook('git commit -m "x"');
  const j = JSON.parse(r.out);
  const ctx = j.hookSpecificOutput.additionalContext;
  assert.match(ctx, /\(\+1 more file\(s\)/, `expected a "+1 more file(s)" overflow note: ${ctx}`);
  assert.match(ctx, /^missing from your change:$/m, `expected the missing block to survive the cap: ${ctx}`);
  assert.match(ctx, /co-change: src\/pair-b\.ts \(co-changed in 9\/9 commits\)/, ctx);
});

test('`git -C <path> commit` and a commit chained after `&&` are both detected (the widened regex)', () => {
  w('src/handlers/Handler0.ts', 'export class Handler0Handler {\n  run() {\n    return 0;\n  }\n}\n');
  git({}, 'add', 'src/handlers/Handler0.ts');
  const r1 = hook(`git -C ${repo} commit -m x`);
  assert.match(JSON.parse(r1.out).hookSpecificOutput.additionalContext, /Handler0/, r1.out);
  reset();
  w('src/handlers/Handler0.ts', 'export class Handler0Handler {\n  run() {\n    return 0;\n  }\n}\n');
  git({}, 'add', 'src/handlers/Handler0.ts');
  const r2 = hook('npm test && git commit -m "y"');
  assert.match(JSON.parse(r2.out).hookSpecificOutput.additionalContext, /Handler0/, r2.out);
});

test('no payload and a non-git directory are silence, never an error', () => {
  const r1 = spawnSync('node', [BIN, 'commit-hook'], { cwd: repo, encoding: 'utf8', input: '' });
  assert.equal(r1.status, 0); assert.equal((r1.stdout || '').trim(), '');
  const nogit = mkdtempSync(join(tmpdir(), 'grain-commit-hook-nogit-'));
  writeFileSync(join(nogit, 'x.ts'), 'export const x = 1;\n');
  const r2 = hook('git commit -m x', nogit);
  assert.equal(r2.code, 0); assert.equal(r2.out, '');
  rmSync(nogit, { recursive: true, force: true });
});
