// G24: history.mjs's walk() has the identical git core.quotePath bug already fixed for `review`'s file listing
// (G4), but here it corrupts the WHOLE history layer, not just one diff. `git log --raw` without `-c
// core.quotePath=false` quotes and octal-escapes any non-ASCII (or otherwise "unusual") byte in a path — e.g.
// `src/café.js` prints as `"src/caf\303\251.js"`. Two DIFFERENT failure modes fall out of the SAME corruption:
//   · co-change/per-file commit counts (state.pairSup/fileCommits, keyed on every touched path unconditionally)
//     get keyed on the garbled quoted string instead of the real path — present, but wrong.
//   · the per-scope lifecycle replay (state.lc/state.vev) is worse: a quoted path like `"src/caf\303\251.js"`
//     ends in a literal `"`, so it fails `CODE_RE.test(path)` (which requires the string to END in `.js` etc.) —
//     the event never reaches replay() at all, so the file's lifecycle data is silently and totally ABSENT, not
//     just mis-keyed. This holds through a rename too: the renamed-to path is quoted the same way, so it also
//     never reaches replay()'s "a renamed file's scopes keep their timelines" transfer logic pre-fix.
// This reads .grain/cache/history.json directly (the persisted replay state) since that is where the corruption
// lives, before it ever reaches a query surface.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const dateEnv = i => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: `2026-01-${String(10 + i).padStart(2, '0')}T12:00:00Z`, GIT_COMMITTER_DATE: `2026-01-${String(10 + i).padStart(2, '0')}T12:00:00Z` });
const git = (i, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...dateEnv(i) } });
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const cls = (name, ret) => `export class ${name} {\n  run() {\n    return ${ret};\n  }\n}\n`;
const status = () => { const r = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr); };
const historyState = () => JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'history.json'), 'utf8'));
const QUOTED = '\\303\\251'; // git's octal escape for é's UTF-8 bytes when core.quotePath quotes a path

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-g24-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git(0, 'init', '-q', '-b', 'main'); git(0, 'config', 'commit.gpgsign', 'false');
  // café.js (non-ASCII), plain.js and other.js (ASCII controls) co-touched across 4 commits — a real co-change
  // triple, and real per-scope lifecycle rows (a type + a method each)
  w('src/café.js', cls('Cafe', 0));
  w('src/plain.js', cls('Plain', 0));
  w('src/other.js', cls('Other', 0));
  git(0, 'add', '-A'); git(0, 'commit', '-qm', 'add cafe, plain and other');
  for (let i = 1; i <= 3; i++) {
    w('src/café.js', cls('Cafe', i));
    w('src/plain.js', cls('Plain', i));
    w('src/other.js', cls('Other', i));
    git(i, 'add', '-A'); git(i, 'commit', '-qm', `touch all three #${i}`);
  }
  status();
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('per-file commit counts key the non-ASCII file under its REAL path, never git-quoted octal garbage', () => {
  const state = historyState();
  assert.equal(state.fileCommits['src/café.js'], 4, `expected src/café.js keyed by its real path with 4 commits, got: ${JSON.stringify(state.fileCommits)}`);
  assert.ok(!Object.keys(state.fileCommits).some(k => k.includes(QUOTED)), `no quoted/octal-escaped path may appear: ${JSON.stringify(Object.keys(state.fileCommits))}`);
  // regression control: the ordinary ASCII files are byte-identical to what they always were
  assert.equal(state.fileCommits['src/plain.js'], 4);
  assert.equal(state.fileCommits['src/other.js'], 4);
});

test('co-change support is keyed on the REAL non-ASCII path in both pair positions', () => {
  const state = historyState();
  const keys = Object.keys(state.pairSup);
  const cafePairs = keys.filter(k => k.includes('café.js'));
  assert.equal(cafePairs.length, 2, `expected café.js paired with plain.js and other.js: ${JSON.stringify(keys)}`);
  for (const k of cafePairs) assert.equal(state.pairSup[k], 4, `expected support 4 for ${k}`);
  assert.ok(!keys.some(k => k.includes(QUOTED)), `no quoted/octal-escaped path may appear in a pairSup key: ${JSON.stringify(keys)}`);
  // regression control: the all-ASCII pair is unaffected
  assert.equal(state.pairSup['src/other.jssrc/plain.js'], 4);
});

test('the non-ASCII file gets real per-scope lifecycle rows — before the fix this data is silently ABSENT, not just mis-keyed', () => {
  const state = historyState();
  const cafeKeys = Object.keys(state.lc).filter(k => k.startsWith('src/café.js#'));
  assert.equal(cafeKeys.length, 2, `expected a type and a method lifecycle row for src/café.js, got lc keys: ${JSON.stringify(Object.keys(state.lc))}`);
  for (const k of cafeKeys) { const L = state.lc[k];
    assert.equal(L.path, 'src/café.js'); assert.equal(L.newFile, true); assert.equal(L.mods, 0); assert.equal(L.first, state.lc['src/plain.js#type#Plain'].first); }
  assert.ok(!Object.keys(state.lc).some(k => k.includes(QUOTED)), `no quoted/octal-escaped path may appear in an lc key: ${JSON.stringify(Object.keys(state.lc))}`);
  // regression control: the ASCII files' own lifecycle rows are unaffected
  assert.ok(Object.keys(state.lc).some(k => k.startsWith('src/plain.js#')));
  assert.ok(Object.keys(state.lc).some(k => k.startsWith('src/other.js#')));
});

test('a rename of the non-ASCII file transfers its lifecycle rows to the new REAL path — before the fix nothing exists to transfer', () => {
  mkdirSync(join(repo, 'src', 'moved'), { recursive: true });
  git(4, 'mv', 'src/café.js', 'src/moved/café2.js');
  git(4, 'commit', '-qm', 'move the cafe file under src/moved/');
  status();
  const state = historyState();
  assert.ok(!Object.keys(state.lc).some(k => k.startsWith('src/café.js#')), `the old path's lifecycle rows must be gone, not duplicated: ${JSON.stringify(Object.keys(state.lc))}`);
  const newKeys = Object.keys(state.lc).filter(k => k.startsWith('src/moved/café2.js#'));
  assert.equal(newKeys.length, 2, `expected both lifecycle rows transferred to the real new path: ${JSON.stringify(Object.keys(state.lc))}`);
  for (const k of newKeys) { const L = state.lc[k]; assert.equal(L.path, 'src/moved/café2.js'); assert.equal(L.mods, 0, 'a rename is not a modification'); assert.equal(L.newFile, true, 'newFile reflects the ORIGINAL birth, untouched by the rename'); }
  assert.equal(state.fileCommits['src/moved/café2.js'], 1);
  assert.ok(!Object.keys(state.fileCommits).some(k => k.includes(QUOTED)) && !Object.keys(state.lc).some(k => k.includes(QUOTED)),
    'no quoted/octal-escaped path may appear anywhere after a rename');
});
