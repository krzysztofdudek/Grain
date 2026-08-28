// `grain review` aggregates the per-file `check` machinery (checkFile + the shared fileFindings() split of
// in-change vs pre-existing) across every file in an agent's WHOLE change, plus one whole-set co-change line from
// completenessDirectional — where every other command answers about one file or the whole repo's history, review
// is the one moment grain looks at everything touched since the last commit and gives one aggregated answer.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo, pairStartSha, pairEndSha;
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const git = (env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const handler = (i, body) => `@Handler()\nexport class Handler${i}Handler {\n  run() {\n    return ${body};\n  }\n}\n`;
// each test starts from HEAD's committed state — this is a throwaway fixture repo, so discarding worktree state
// between tests is the isolation mechanism (a shared `before()` builds the established history once; per-test
// mutations must not leak into the next test's file list)
const reset = () => { git({}, 'checkout', '-q', 'HEAD', '--', '.'); git({}, 'clean', '-qfd'); };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-review-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git({}, 'init', '-q', '-b', 'main'); git({}, 'config', 'commit.gpgsign', 'false');
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  // an established convention: 30 classes carrying @Handler(), its own commit (megaCap=30 excludes bulk commits
  // touching MORE than 30 files from co-change pairing — kept separate so it never dilutes the pair below)
  for (let i = 0; i < 30; i++) w(`src/handlers/Handler${i}.ts`, handler(i, i));
  git(d1, 'add', 'src/handlers'); git(d1, 'commit', '-qm', 'add handlers');
  // a real, directional co-change pair: 9 commits (this base + 8 more) always touching both together — 9/9 clears
  // both cochangeMinSup (8) and cochangeMinConf (0.75), the same fixture shape as completeness-hook.test.mjs
  w('src/pair-a.ts', 'export const a = () => 0;\n');
  w('src/pair-b.ts', 'export const b = () => 0;\n');
  git(d1, 'add', '-A'); git(d1, 'commit', '-qm', 'base'); pairStartSha = git({}, 'rev-parse', 'HEAD');
  for (let i = 1; i <= 8; i++) { w('src/pair-a.ts', `export const a = () => ${i};\n`); w('src/pair-b.ts', `export const b = () => ${i};\n`); git(d1, 'add', '-A'); git(d1, 'commit', '-qm', `pair change ${i}`); }
  pairEndSha = git({}, 'rev-parse', 'HEAD');
  // pushes HEAD's own timestamp forward so the code above clears freshDays (14) and its conventions are "established"
  // — evidence only "survives" once its scope is >= freshDays old AS OF HEAD, and every commit above shares one date
  w('NOTES.md', 'notes\n');
  const d2 = dateEnv('2026-03-01T12:00:00Z');
  git(d2, 'add', 'NOTES.md'); git(d2, 'commit', '-qm', 'notes');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
  assert.equal(st.status, 0, st.stdout + st.stderr);
  assert.match(st.stdout, /\d+ conventions/, `sanity: the fixture must establish at least one convention: ${st.stdout}`);
  assert.doesNotMatch(st.stdout, /: 0 conventions/, `sanity: the @Handler() convention must be established, not just parsed: ${st.stdout}`);
});
beforeEach(() => reset());
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('default/--worktree mode: reports a real deviation in changed lines, stays silent on a clean edit, includes an untracked file in scope', () => {
  w('src/handlers/Handler0.ts', 'export class Handler0Handler {\n  run() {\n    return 0;\n  }\n}\n'); // decorator dropped — a real deviation on the changed lines
  w('src/handlers/Handler1.ts', handler(1, '999 // edited, still conforms'));
  w('src/handlers/HandlerNew.ts', handler('New', 99)); // untracked, conforms
  const j = JSON.parse(grain(['review', '--json']).out);
  assert.deepEqual([...j.files].sort(), ['src/handlers/Handler0.ts', 'src/handlers/Handler1.ts', 'src/handlers/HandlerNew.ts'].sort(), 'all three changed/untracked files are in scope');
  assert.ok(Array.isArray(j.findings) && Array.isArray(j.cochangePartners) && typeof j.asOf === 'string', `expected the documented top-level --json shape: ${JSON.stringify(j)}`);
  assert.deepEqual(j.findings.map(f => f.file), ['src/handlers/Handler0.ts'], 'only the file WITH a finding appears in findings — a clean file, tracked or untracked, contributes nothing');
  assert.ok(j.findings[0].deviationsInChange.length, `Handler0.ts should carry the decorator deviation in --json too: ${JSON.stringify(j.findings[0])}`);
  const { out } = grain(['review']);
  assert.match(out, /^review 3 files · \d+ finding\(s\) across 1 file\(s\)$/m, out);
  assert.match(out, /== src\/handlers\/Handler0\.ts/, out);
  assert.match(out, /@Handler/, out);
  assert.doesNotMatch(out, /Handler1\.ts —/, 'a clean edit gets no section');
  assert.doesNotMatch(out, /HandlerNew\.ts —/, 'a clean untracked file gets no section (but is still in scope, per --json above)');
});

test('--staged reports only staged files, ignoring an unstaged-only change', () => {
  w('src/handlers/Handler0.ts', 'export class Handler0Handler {\n  run() {\n    return 0;\n  }\n}\n');
  git({}, 'add', 'src/handlers/Handler0.ts');
  w('src/handlers/Handler1.ts', handler(1, 1000)); // unstaged only
  const j = JSON.parse(grain(['review', '--staged', '--json']).out);
  assert.deepEqual(j.files, ['src/handlers/Handler0.ts']);
  const { out } = grain(['review', '--staged']);
  assert.match(out, /Handler0\.ts/, out);
  assert.doesNotMatch(out, /== src\/handlers\/Handler1\.ts/, 'the unstaged-only file must not get its own section'); // it may still be cited as an exemplar of Handler0's own finding
});

test('the whole-set co-change line names an established partner outside the changed set', () => {
  w('src/pair-a.ts', 'export const a = () => 999; // edited\n'); // pair-b.ts not touched
  const { out } = grain(['review']);
  assert.match(out, /\[grain\] Edits like this historically also touch:/, out);
  assert.match(out, /src\/pair-b\.ts \(co-changed in 9\/9 commits\)/, out);
});

test('a changed set with a finding but no co-change partner prints nothing extra', () => {
  w('src/handlers/Handler0.ts', 'export class Handler0Handler {\n  run() {\n    return 0;\n  }\n}\n'); // has a finding, no cochange partner
  const { out } = grain(['review']);
  assert.match(out, /Handler0/, out);
  assert.doesNotMatch(out, /also touch/, out);
});

test('a worktree with changes but zero findings and zero co-change hits still prints a clear non-empty line, not silence', () => {
  w('src/handlers/Handler7.ts', handler(7, '7000 // edited, still conforms'));
  const { out, code } = grain(['review']);
  assert.equal(code, 0, out);
  assert.notEqual(out.trim(), '');
  assert.match(out, /clean/i, out);
  assert.doesNotMatch(out, /also touch/, out);
});

test('--json is valid JSON with the documented top-level shape, on both a finding and the all-clean path', () => {
  w('src/handlers/Handler8.ts', handler(8, '8000')); // conforms — the all-clean path
  const j = JSON.parse(grain(['review', '--json']).out);
  assert.deepEqual(j.files, ['src/handlers/Handler8.ts']);
  assert.deepEqual(j.findings, [], 'a conforming file contributes no findings entry');
  assert.deepEqual(j.cochangePartners, []);
  assert.match(j.asOf, /^[0-9a-f]{7}/);
});

test('--range reports files changed between two refs', () => {
  const j = JSON.parse(grain(['review', '--range', `${pairStartSha}..${pairEndSha}`, '--json']).out);
  assert.deepEqual([...j.files].sort(), ['src/pair-a.ts', 'src/pair-b.ts']);
});

test('--range with a bad ref surfaces git\'s own error instead of a silent/garbled failure', () => {
  const r = spawnSync('node', [BIN, 'review', '--range', 'not-a-real-ref..HEAD'], { cwd: repo, encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /\[grain\]/);
});

test('a non-git directory gets one clear line instead of crashing', () => {
  const nogit = mkdtempSync(join(tmpdir(), 'grain-review-nogit-'));
  writeFileSync(join(nogit, 'a.ts'), 'export const a = 1;\n');
  const r = spawnSync('node', [BIN, 'review'], { cwd: nogit, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /not a git repository/);
  rmSync(nogit, { recursive: true, force: true });
});
