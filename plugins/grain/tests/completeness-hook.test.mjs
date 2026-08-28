// The post-edit hook (`grain check-hook`) surfaces co-change alongside conventional findings: after an agent edits a
// file, grain names the OTHER files that reliably change WITH it in this repo's own history — even when the edit
// itself raises no convention finding, since that is precisely the case where the agent has no other way to learn it.
// `completenessDirectional` (core.mjs) already computes this for the standalone `completeness` command; this test
// covers wiring the SAME function into check-hook: capped to 3 partners, one line, folded into the hook's existing
// signature/suppression so a file edited repeatedly with the same findings AND the same co-change partners speaks
// once per TTL, not on every edit.
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
  tmp = mkdtempSync(join(tmpdir(), 'grain-cc-hook-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  w('src/pair-a.ts', 'export const a = () => 0;\n');
  w('src/pair-b.ts', 'export const b = () => 0;\n');
  w('src/solo.ts', 'export const s = () => 0;\n');
  git('add', '-A'); git('commit', '-qm', 'base');
  // 8 more commits that always touch pair-a.ts and pair-b.ts together (plus the base commit, 9 in all) — a real,
  // established directional partner at 9/9 = 1.0 confidence, above cochangeMinConf (0.75) and cochangeMinSup (8) —
  // and 4 commits that touch solo.ts alone, never paired with anything at the support floor
  for (let i = 1; i <= 8; i++) { w('src/pair-a.ts', `export const a = () => ${i};\n`); w('src/pair-b.ts', `export const b = () => ${i};\n`); git('add', '-A'); git('commit', '-qm', `pair change ${i}`); }
  for (let i = 1; i <= 4; i++) { w('src/solo.ts', `export const s = () => ${i};\n`); git('add', '-A'); git('commit', '-qm', `solo change ${i}`); }
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('an edit to a file with an established co-change partner gets a capped, single-line finding with counts', () => {
  rmSync(join(repo, '.grain', 'cache', 'hook-seen.json'), { force: true });
  w('src/pair-a.ts', 'export const a = () => 999; // edited\n');
  const r = hook(join(repo, 'src/pair-a.ts'));
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(j.hookSpecificOutput.additionalContext, /^\[grain\] edits like this also touch: src\/pair-b\.ts \(co-changed in 9\/9 commits\)$/m);
});

test('an edit to a file with no partner above the confidence floor gets no co-change line', () => {
  rmSync(join(repo, '.grain', 'cache', 'hook-seen.json'), { force: true });
  w('src/solo.ts', 'export const s = () => 999; // edited\n');
  const r = hook(join(repo, 'src/solo.ts'));
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /edits like this also touch/);
  assert.equal(r.out, '', 'this fixture has no other convention findings either — a solo edit is fully silent');
});

test('the co-change line obeys the SAME repeat-suppression window as other findings, not a second mechanism', () => {
  rmSync(join(repo, '.grain', 'cache', 'hook-seen.json'), { force: true });
  w('src/pair-a.ts', 'export const a = () => 1000; // edited again\n');
  const r1 = hook(join(repo, 'src/pair-a.ts'));
  assert.match(r1.out, /edits like this also touch/, 'first edit speaks');
  const r2 = hook(join(repo, 'src/pair-a.ts'));
  assert.equal(r2.out, '', 'an unchanged co-change finding must not repeat within the TTL');
  const seenPath = join(repo, '.grain', 'cache', 'hook-seen.json');
  const seen = JSON.parse(readFileSync(seenPath, 'utf8'));
  seen['src/pair-a.ts'].t = 1; writeFileSync(seenPath, JSON.stringify(seen)); // age the record past any TTL
  const r3 = hook(join(repo, 'src/pair-a.ts'));
  assert.match(r3.out, /edits like this also touch/, 'an aged record reminds again');
});
