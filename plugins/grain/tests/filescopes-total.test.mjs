// §099 — `model.partitions[].fileScopes` caps a file's scope list at 200 (core.mjs) so the model stays a
// bounded, diffable summary rather than a second copy of tree.json — kept, on the director's ruling. But a
// capped list alone cannot tell "this file has exactly 200 scopes" from "this file was truncated at 200", and
// a consumer that ranks files by scope count (the `too-much` stress instrument) silently under-reported a
// 326-scope file as 200 as a result. The fix is additive: `model.partitions[].fileScopesTotal` carries the true
// count for exactly the files whose list was actually truncated (sparse — a file at or under 200 gets no
// entry, and its true count is just `fileScopes[rel].length`).
//
// This guards, against a REAL repo with a REAL git history and a REAL file of more than 200 named scopes (no
// fixture under tests/fixtures/ happens to have one, so one is generated deterministically here):
//   1. `fileScopes[rel]` is capped at exactly 200 for the big file.
//   2. `fileScopesTotal[rel]` holds the true count (260), so "truncated by 60" is computable from the model
//      alone, with no re-parse and no `tree.json` involved.
//   3. A file that never crossed the cap gets no `fileScopesTotal` entry at all (the sparse half of the claim).
//   4. The `too-much` stress instrument's `size` dimension reports the TRUE count for the big file, not 200 —
//      both when it has `tree.json` available (the common case, unaffected by this fix) and when it does not
//      (the scenario the fix exists for), where its own disclosure names how many files needed the field.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_V } from '../engine/config.mjs';
import { collectStatistics, analyse } from './stress/too-much.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28 });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));
const treeIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'tree.json'), 'utf8'));

const BIG_FILE = 'src/big.mjs';
const TRUE_COUNT = 260; // well over the 200 cap, so truncation is unambiguous
const CAP = 200;

function buildFixture(root) {
  let src = '';
  for (let i = 0; i < TRUE_COUNT; i++) src += `export function fn${String(i).padStart(3, '0')}() {\n  return ${i};\n}\n\n`;
  w(root, BIG_FILE, src);
  // enough ordinary 2-scope files that the size dimension's own population (too-much.mjs's `fitBins`, unrelated
  // to this ticket) can actually certify a norm and fire on the outlier — a handful is not enough (measured: 8
  // fillers leaves the norm too wide to tell 260 apart from 2 at n=9; 30 mirrors too-much.test.mjs's own fixture
  // scale and reliably fires). One of them (filler01) doubles as the control file for claim 5 of the ticket.
  const FILLERS = 30;
  for (let i = 1; i <= FILLERS; i++) {
    const p = String(i).padStart(2, '0');
    w(root, `src/filler${p}.mjs`, `export function filler${p}(x) {\n  return x + ${i};\n}\n\nexport function helper${p}(x) {\n  return x - ${i};\n}\n`);
  }
  w(root, 'package.json', '{\n  "name": "filescopes-total-fixture",\n  "type": "module"\n}\n');
  gitIn(root, 'init', '-q', '-b', 'main');
  gitIn(root, 'config', 'commit.gpgsign', 'false');
  gitIn(root, 'add', '-A');
  gitIn(root, 'commit', '-q', '-m', `fixture: one ${TRUE_COUNT}-scope file, ${FILLERS} 2-scope fillers`);
}

let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'filescopes-total-'));
  repo = join(tmp, 'repo');
  mkdirSync(repo);
  buildFixture(repo);
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

test('setup: grain indexes the fixture', () => {
  const r = grainIn(repo, ['status']);
  assert.equal(r.code, 0, r.err);
});

function bigPartition(m) {
  for (const p of m.partitions || []) if (BIG_FILE in (p.fileScopes || {})) return p;
  return null;
}

test('the model was built at the current MODEL_V (this fixture exercises the m25 field)', () => {
  const meta = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'meta.json'), 'utf8'));
  assert.equal(meta.model, MODEL_V);
});

test('fileScopes caps the big file at exactly 200', () => {
  const m = modelIn(repo);
  const p = bigPartition(m);
  assert.ok(p, 'no partition carries the big file\'s fileScopes at all');
  assert.equal(p.fileScopes[BIG_FILE].length, CAP);
});

test('fileScopesTotal names the true count for the truncated file, and only for it', () => {
  const m = modelIn(repo);
  const p = bigPartition(m);
  assert.ok(p.fileScopesTotal, 'fileScopesTotal is missing from the partition entirely');
  assert.equal(p.fileScopesTotal[BIG_FILE], TRUE_COUNT, '"truncated by N" must be computable: TRUE_COUNT - 200 = 60');
  // sparse: a filler file (2 scopes, never truncated) must carry NO entry — its true count is just
  // `fileScopes[rel].length`, and the model must not spend a field on every single file to say so.
  for (const rel of Object.keys(p.fileScopes))
    if (rel !== BIG_FILE) assert.ok(!(rel in p.fileScopesTotal), `${rel} was never truncated but got a fileScopesTotal entry`);
  // and every named scope in the big file's OWN list is still real content (not an artifact of the cap logic):
  // the tuple shape [kind, name, line, endLine] survives, sorted by line, first 200 of 260.
  assert.equal(p.fileScopes[BIG_FILE][0][1], 'fn000');
  assert.equal(p.fileScopes[BIG_FILE].at(-1)[1], 'fn199');
});

test('a control file at or under the cap is completely unaffected (claim 5): same list, no total entry', () => {
  const m = modelIn(repo);
  const p = bigPartition(m);
  const rel = 'src/filler01.mjs';
  assert.equal(p.fileScopes[rel].length, 2);
  assert.ok(!(rel in (p.fileScopesTotal || {})));
});

// ---------------------------------------------------------------------------------------------------
// the `too-much` stress instrument: must rank/print the TRUE count, with and without tree.json
// ---------------------------------------------------------------------------------------------------

test('too-much/size dimension reports the true count with tree.json present (unaffected by the fix)', () => {
  const cache = modelIn(repo);
  const tree = new Map();
  for (const [k, v] of Object.entries(treeIn(repo))) {
    const rel = k.slice(k.indexOf('|') + 1);
    tree.set(rel, (v?.s || []).map(s => ({ kind: s.kind, name: s.name, line: s.line, endLine: s.endLine ?? s.line })));
  }
  assert.ok(tree.get(BIG_FILE), 'tree.json must actually carry the big file for this to be a real test of the unaffected path');
  // tree.json's own raw list is uncapped but, unlike `fileScopes`, still carries the file's own pseudo-scope
  // entry (kind 'file') — one more than the 260 real named functions; `collectStatistics` filters it out (fixed
  // on sight alongside §099) so the two paths agree on one true count for the same file, asserted below.
  assert.equal(tree.get(BIG_FILE).length, TRUE_COUNT + 1);
  const { stats, scopeCountSource } = collectStatistics({ exp: { partitions: [], moduleGraph: {} }, cache, fps: null, tree });
  const sizePop = stats.get('size');
  let found = null;
  for (const byId of sizePop.values()) if (byId.has(BIG_FILE)) found = byId.get(BIG_FILE);
  assert.ok(found, 'the big file never entered the size population');
  assert.equal(found.t, TRUE_COUNT, 'tree.json path must already report the true count');
  assert.equal(scopeCountSource.fileScopesTotal, 0, 'tree.json was present, so fileScopesTotal must not even be consulted');
});

test('too-much/size dimension reports the true count WITHOUT tree.json, via fileScopesTotal (the fix)', () => {
  const cache = modelIn(repo);
  // simulate a consumer/environment that has model.json but no tree.json at all (the exact scenario the ticket
  // describes: a repository indexed without git, or simply a caller that never loads the tree cache) — tree=null.
  const { stats, scopeCountSource } = collectStatistics({ exp: { partitions: [], moduleGraph: {} }, cache, fps: null, tree: null });
  const sizePop = stats.get('size');
  let found = null;
  for (const byId of sizePop.values()) if (byId.has(BIG_FILE)) found = byId.get(BIG_FILE);
  assert.ok(found, 'the big file never entered the size population');
  assert.equal(found.t, TRUE_COUNT, 'without tree.json the size statistic must still be the TRUE count, not the capped 200');
  assert.equal(scopeCountSource.fileScopesTotal, 1, 'exactly the one truncated file must have used fileScopesTotal');
  assert.equal(scopeCountSource.staleCapped, 0);
  // the control file is still exactly 2 either way
  let control = null;
  for (const byId of sizePop.values()) if (byId.has('src/filler01.mjs')) control = byId.get('src/filler01.mjs');
  assert.equal(control.t, 2);
});

test('with fileScopesTotal absent AND no tree.json (a stale, pre-§099 cache), the count silently saturates at 200 and is disclosed as such', () => {
  const cache = modelIn(repo);
  const stale = JSON.parse(JSON.stringify(cache));
  for (const p of stale.partitions) delete p.fileScopesTotal;
  const res = analyse({ exp: { partitions: [], moduleGraph: {}, repo: 'stale-fixture' }, cache: stale, fps: null, tree: null });
  const row = res.dimensions.size.rows.find(r => r.id === BIG_FILE) || null;
  // whether it fires or not, the point under test is what it fires ON — find it in the raw stats via the same
  // collectStatistics path analyse() itself uses, since a 200-vs-260 count may or may not clear lambda depending
  // on the rest of the (tiny) fixture's population.
  const { stats } = collectStatistics({ exp: { partitions: [], moduleGraph: {} }, cache: stale, fps: null, tree: null });
  let found = null;
  for (const byId of stats.get('size').values()) if (byId.has(BIG_FILE)) found = byId.get(BIG_FILE);
  assert.equal(found.t, CAP, 'with neither fileScopesTotal nor tree.json, the pre-fix cap-saturation is the honest fallback');
  assert.ok(
    res.disclosure.some(d => /saturated at exactly 200/.test(d)),
    'the stale-cache saturation must be named in the run\'s own disclosure, not silently swallowed'
  );
  void row; // documented above: not asserted on directly, the count is what this test pins
});

test('too-much.mjs end to end (real spawn, real grain export) ranks the big file first on size with its true count', () => {
  const out = join(tmp, 'too-much-out.json');
  const r = spawnSync('node', [join(here, 'stress', 'too-much.mjs'), repo, out, '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
  const res = JSON.parse(readFileSync(out, 'utf8'));
  const sizeRows = res.dimensions.size.rows;
  assert.ok(sizeRows.length >= 1, 'size dimension fired on nothing at all');
  const top = sizeRows[0];
  assert.equal(top.id, BIG_FILE);
  assert.equal(top.t, TRUE_COUNT, `end-to-end size statistic must be ${TRUE_COUNT}, the true count, not the 200 cap`);
});
