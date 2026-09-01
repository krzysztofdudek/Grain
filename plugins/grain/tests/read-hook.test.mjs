// The PostToolUse-on-`Read` hook (`grain read-hook`, §J6.2): when an agent reads a file that is itself one of the
// strongest deviants of some repo-wide convention (model: `deviants[].rel`, `topDeviants(f, ps, max=5)`,
// core.mjs), grain speaks unbidden — "don't copy what you just read, here is a conforming sibling instead." It
// must never fire for a conforming file, never for a file no partition covers, and never crash. Same shared
// `hook-seen.json` TTL gate (`seenGate`, §J6.1) as check-hook/how-hook, namespaced `read:<rel>` so it never
// collides with check-hook's own `check:<rel>` key.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo, tmpEmpty, repoEmpty;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
const git = (r, env, ...a) => execFileSync('git', ['-C', r, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv, ...env } });
const w = (r, rel, content) => { mkdirSync(join(r, dirname(rel)), { recursive: true }); writeFileSync(join(r, rel), content); };
const hook = (cmd, file_path, cwd) => { const r = spawnSync('node', [BIN, cmd], { cwd, encoding: 'utf8', input: JSON.stringify({ cwd, tool_name: cmd === 'read-hook' ? 'Read' : 'Edit', tool_input: { file_path } }) });
  return { out: (r.stdout || '').trim(), err: r.stderr, code: r.status }; };
const readHook = (rel, cwd = repo) => hook('read-hook', join(cwd, rel), cwd);

// 44 conforming `@Service`-decorated classes (share 44/50 = 0.88 clears the printed-share floor 1 - 1/lambda =
// 0.875) + 6 undecorated deviants — `topDeviants` caps at 5, so with all 6 tied on `gap` (identical missing
// value) the alphabetically-first 5 (dev1..dev5) make the cut and dev6 is correctly, silently excluded.
const letters = 'abcdefghijklmnopqrstuvwxyz';
const nouns = []; for (const a of letters) { for (const b of letters) { nouns.push(a + b); if (nouns.length === 44) break; } if (nouns.length === 44) break; }
const cap = s => s[0].toUpperCase() + s.slice(1);
const svc = n => `@Service()\nexport class ${cap(n)}Service {\n  run(): number {\n    return this.${n}Count();\n  }\n\n  private ${n}Count(): number {\n    return '${n}'.length;\n  }\n}\n`;
const devSvc = n => `export class Dev${n}Service {\n  run(): number {\n    return this.dev${n}Count();\n  }\n\n  private dev${n}Count(): number {\n    return 'dev${n}'.length;\n  }\n}\n`;
const devTouched = n => `export class Dev${n}Service {\n  run(): number {\n    // touched\n    return this.dev${n}Count();\n  }\n\n  private dev${n}Count(): number {\n    return 'dev${n}'.length;\n  }\n}\n`;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-readhook-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git(repo, {}, 'init', '-q', '-b', 'main'); git(repo, {}, 'config', 'commit.gpgsign', 'false');
  for (const n of nouns) w(repo, `src/svc/${n}.service.ts`, svc(n));
  git(repo, { GIT_AUTHOR_DATE: '2024-01-15T12:00:00Z', GIT_COMMITTER_DATE: '2024-01-15T12:00:00Z' }, 'add', '-A');
  git(repo, { GIT_AUTHOR_DATE: '2024-01-15T12:00:00Z', GIT_COMMITTER_DATE: '2024-01-15T12:00:00Z' }, 'commit', '-qm', 'base');
  for (let i = 1; i <= 6; i++) w(repo, `src/svc/dev${i}.ts`, devSvc(i));
  git(repo, { GIT_AUTHOR_DATE: '2024-02-04T12:00:00Z', GIT_COMMITTER_DATE: '2024-02-04T12:00:00Z' }, 'add', '-A');
  git(repo, { GIT_AUTHOR_DATE: '2024-02-04T12:00:00Z', GIT_COMMITTER_DATE: '2024-02-04T12:00:00Z' }, 'commit', '-qm', 'add deviants');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stdout + st.stderr);
  const model = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));
  const f = model.partitions[0].facts.find(f => f.pid === 'auto.deco:@Service');
  assert.ok(f, 'fixture must establish the @Service decorator convention');
  assert.equal(f.sraw, 44); assert.equal(f.share, 1);
  assert.deepEqual(f.deviants.map(d => d.rel).sort(), ['src/svc/dev1.ts', 'src/svc/dev2.ts', 'src/svc/dev3.ts', 'src/svc/dev4.ts', 'src/svc/dev5.ts'], 'dev6 must be truncated by topDeviants\' top-5 cap');
  assert.deepEqual(f.exemplars.map(e => e.rel), ['src/svc/aa.service.ts', 'src/svc/ab.service.ts', 'src/svc/ac.service.ts']);

  // a second, code-free repo: `learn()` produces zero partitions when there are no source scopes at all —
  // `partitionFor` then has nothing to fall back to and genuinely returns null (unlike a repo with any real
  // code, where the `_repo`/`partitions[0]` fallback chain always resolves to something).
  tmpEmpty = mkdtempSync(join(tmpdir(), 'grain-readhook-empty-'));
  repoEmpty = join(tmpEmpty, 'r'); mkdirSync(repoEmpty);
  git(repoEmpty, {}, 'init', '-q', '-b', 'main'); git(repoEmpty, {}, 'config', 'commit.gpgsign', 'false');
  w(repoEmpty, 'README.md', 'hello\n');
  git(repoEmpty, { GIT_AUTHOR_DATE: '2024-01-15T12:00:00Z', GIT_COMMITTER_DATE: '2024-01-15T12:00:00Z' }, 'add', '-A');
  git(repoEmpty, { GIT_AUTHOR_DATE: '2024-01-15T12:00:00Z', GIT_COMMITTER_DATE: '2024-01-15T12:00:00Z' }, 'commit', '-qm', 'base');
  const st2 = spawnSync('node', [BIN, 'status'], { cwd: repoEmpty, encoding: 'utf8' }); assert.equal(st2.status, 0, st2.stdout + st2.stderr);
  const modelEmpty = JSON.parse(readFileSync(join(repoEmpty, '.grain', 'cache', 'model.json'), 'utf8'));
  assert.equal(modelEmpty.partitions.length, 0, 'fixture must have zero partitions');
});
after(() => { rmSync(tmp, { recursive: true, force: true }); rmSync(tmpEmpty, { recursive: true, force: true }); });

test('reading a top-5 deviant file names the convention (verbalize, not factLabel) and a conforming sibling, with evidence numbers', () => {
  rmSync(join(repo, '.grain', 'cache', 'hook-seen.json'), { force: true });
  const r = readHook('src/svc/dev1.ts');
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.hookSpecificOutput.hookEventName, 'PostToolUse');
  const text = j.hookSpecificOutput.additionalContext;
  assert.match(text, /departs from its group/);
  assert.match(text, /types here are annotated with `@Service`/, 'must use verbalize\'s convention text, not factLabel\'s "group «...»" population label');
  assert.doesNotMatch(text, /group «/, 'factLabel\'s population label must not appear');
  assert.match(text, /a conforming sibling: src\/svc\/aa\.service\.ts:2–10 `AaService`/);
  assert.match(text, /44\/44 established/, 'evidence numbers must be present, house-voice style');
});

test('reading a conforming file (not a deviant of anything) stays silent, exit 0', () => {
  const r = readHook('src/svc/aa.service.ts');
  assert.equal(r.code, 0, r.err); assert.equal(r.out, '');
});

test('a 6th-ranked deviant, beyond topDeviants\' top-5 cap, is correctly silent — not a bug', () => {
  const r = readHook('src/svc/dev6.ts');
  assert.equal(r.code, 0, r.err); assert.equal(r.out, '');
});

test('a file with no partition covering it is silence, exit 0, never crashes', () => {
  const st = spawnSync('node', [BIN, 'status'], { cwd: repoEmpty, encoding: 'utf8' }); assert.equal(st.status, 0, st.stdout + st.stderr);
  const r = readHook('README.md', repoEmpty);
  assert.equal(r.code, 0, r.err); assert.equal(r.out, '');
});

test('a repeated Read within the TTL is silent; the `read:` key does not collide with check-hook\'s own `check:` key', () => {
  rmSync(join(repo, '.grain', 'cache', 'hook-seen.json'), { force: true });
  const r1 = readHook('src/svc/dev2.ts');
  assert.match(r1.out, /departs from its group/);
  const r2 = readHook('src/svc/dev2.ts');
  assert.equal(r2.out, '', 'an unchanged read-hook finding must be suppressed within the TTL');

  // check-hook fires independently on the SAME file, under its own `check:` key — needs the deviating scope
  // actually touched by the worktree, or cmdCheck's default (non---all) view treats it as pre-existing and mute.
  const orig = readFileSync(join(repo, 'src/svc/dev2.ts'), 'utf8');
  w(repo, 'src/svc/dev2.ts', devTouched(2));
  try {
    const c1 = hook('check-hook', join(repo, 'src/svc/dev2.ts'), repo);
    assert.match(c1.out, /not annotated with `@Service`/, 'check-hook must still fire — its own TTL key is unaffected by read-hook\'s');
  } finally { w(repo, 'src/svc/dev2.ts', orig); }

  const seen = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'hook-seen.json'), 'utf8'));
  assert.ok(seen['read:src/svc/dev2.ts'], 'the read: key must be present');
  assert.ok(seen['check:src/svc/dev2.ts'], 'the check: key must be present, independent of read:');
});

test('a deviant whose only conforming-sibling candidates have all been deleted from disk falls through cleanly — no crash, note suppressed', () => {
  rmSync(join(repo, '.grain', 'cache', 'hook-seen.json'), { force: true });
  const backups = ['aa', 'ab', 'ac'].map(n => [n, readFileSync(join(repo, `src/svc/${n}.service.ts`), 'utf8')]);
  for (const [n] of backups) rmSync(join(repo, `src/svc/${n}.service.ts`));
  try {
    const r = readHook('src/svc/dev3.ts');
    assert.equal(r.code, 0, r.err); assert.equal(r.out, '', 'no exemplar survives existsMemo re-validation — nothing left to point at');
  } finally { for (const [n, content] of backups) w(repo, `src/svc/${n}.service.ts`, content); }
});

test('no payload and an unindexed cwd are silence, never an error', () => {
  const r = spawnSync('node', [BIN, 'read-hook'], { cwd: repo, encoding: 'utf8', input: '' });
  assert.equal(r.status, 0, r.stderr); assert.equal((r.stdout || '').trim(), '');
});
