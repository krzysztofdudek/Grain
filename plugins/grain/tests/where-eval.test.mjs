// `grain selftest --where` — the sibling of `selftest --how`'s J2.3 gate, over the same automatically-derived
// ground truth: a commit that ADDED a file is this repository's own record of where such a thing lives, so the
// commit's message is the query and the file it created is the relevant answer.
//
// The fixture is built here rather than reused from tests/fixtures/build-fixture.mjs for the same reason
// how-command.test.mjs builds its own: every assertion below is about WHICH commits become candidates and which
// do not, so the test must own every commit message, every added path and every file's fate (renamed, deleted,
// added in bulk) — a shared fixture whose commits drift would turn "5 candidates" into a lottery.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { whereEval } from '../engine/core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

let tmp, repo, bare;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const grain = (args, cwd) => { const r = spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };

// dates pinned so two builds are byte-identical, and so every commit lands on its own timestamp — the birth
// lookup pairs a file's lifecycle `first` with the footprint carrying the same `ts`
const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
let day = 0;
function commit(dir, msg) { day += 3; const d = new Date(T0 + day * 86400000).toISOString();
  gitIn(dir, 'add', '-A');
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } }); }

const cls = (name, methods) => `export class ${name} {\n${methods.map(m => `  ${m}(): string { return '${m}'; }`).join('\n')}\n}\n`;

// Seven commits. Exactly FIVE of them may ever become candidates, and the reasons the other two may not are the
// three properties of the truth derivation this file exists to pin:
//   1 scaffold                 — 6 added files, all surviving  → a candidate
//   2 "add invoice printer"    — adds src/print/invoice-printer.ts, whose own NAME is in the message → a candidate, `named`
//   3 "support currency conversion" — adds src/money/exchange.ts, whose name shares no token with the message → a candidate, `unnamed`
//   4 bulk import (31 files)   — over CFG.megaCap, so it has no footprint at all → NEVER a candidate
//   5 "add shipping label"     — adds src/ship/label-maker.ts …
//   6 rename                   — …which commit 6 moves to src/ship/waybill.ts: commit 5 stays the candidate, and
//                                its truth is the path the file carries at HEAD
//   7 "add legacy adapter" then deleted in 8 → the file is gone at HEAD, so it is not a truth file, and commit 7
//                                becomes a candidate only if it added something else (it does not) → NOT a candidate
function buildFixture(dir) {
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  w(dir, 'package.json', JSON.stringify({ name: 'where-eval-fixture', version: '1.0.0', private: true, type: 'module' }, null, 2) + '\n');
  for (const n of ['alpha', 'beta', 'gamma', 'delta', 'epsilon'])
    w(dir, `src/core/${n}.ts`, cls(n[0].toUpperCase() + n.slice(1), ['load', 'save', 'reset']));
  commit(dir, 'core scaffolding');

  w(dir, 'src/print/invoice-printer.ts', cls('InvoicePrinter', ['render', 'paginate', 'emit']));
  commit(dir, 'add invoice printer');

  w(dir, 'src/money/exchange.ts', cls('Exchange', ['quote', 'settle', 'rate']));
  commit(dir, 'support currency conversion');

  for (let i = 0; i < 31; i++) w(dir, `src/bulk/mod${i}.ts`, cls(`Mod${i}`, ['run']));
  commit(dir, 'bulk import of generated modules');

  w(dir, 'src/ship/label-maker.ts', cls('LabelMaker', ['stamp', 'weigh', 'frank']));
  commit(dir, 'add shipping label');

  gitIn(dir, 'mv', 'src/ship/label-maker.ts', 'src/ship/waybill.ts');
  commit(dir, 'rename to waybill');

  w(dir, 'src/legacy/adapter.ts', cls('LegacyAdapter', ['wrap', 'unwrap']));
  commit(dir, 'add legacy adapter');

  rmSync(join(dir, 'src/legacy/adapter.ts'));
  commit(dir, 'drop legacy adapter');
}

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-whereeval-')); repo = join(tmp, 'repo'); bare = join(tmp, 'bare');
  buildFixture(repo); grain(['status'], repo);
  mkdirSync(bare, { recursive: true }); }); // a directory that is not a git repository at all
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

const json = (args = []) => { const r = grain(['selftest', '--where', '--json', ...args], repo);
  assert.equal(r.code, 0, `selftest --where exited ${r.code}: ${r.err}`);
  return JSON.parse(r.out.split('\n').filter(l => !l.startsWith('[grain]')).join('\n')); };

test('every commit that added a surviving, indexed file is a candidate — and only those', () => {
  const j = json();
  // commits 1, 2, 3, 5 and 7 each added at least one file; 7's file is deleted before HEAD and 4 is over
  // megaCap, so neither can contribute a truth file. 6 renamed rather than added.
  assert.equal(j.n, 4, `expected the scaffold, the printer, the exchange and the shipping label to be the four candidates, got ${j.n}`);
});

test('a file born in a bulk commit is never a candidate — that commit has no footprint to draw a query from', () => {
  const j = json();
  // 31 > CFG.megaCap: had the bulk commit been eligible it would have contributed 31 truth files in one
  // candidate and its message ("bulk import of generated modules") as the query
  assert.ok(j.n < 5, 'the bulk commit must not appear among the candidates');
});

test('a renamed file is credited to the commit that ADDED it, under the path it carries at HEAD', () => {
  // `--last 1` keeps only the most recent candidate: "add shipping label", whose file now lives at
  // src/ship/waybill.ts. Without the rename lineage there would be no truth file at all and n would be 0.
  const j = json(['--last', '1']);
  assert.equal(j.n, 1, 'the shipping-label commit must survive as a candidate despite the later rename');
});

test('the leak-free stratum holds exactly the candidates whose query does not name the added file', () => {
  const j = json();
  // "support currency conversion" → src/money/exchange.ts and "core scaffolding" → five files named after Greek
  // letters: neither message shares a token with any file it created. "add shipping label" named its file at the
  // time (`label-maker.ts`) but commit 6 renamed it to `waybill.ts`, and the stratum is decided on the name the
  // file carries at HEAD — which is the name any arm actually has to work with. Only "add invoice printer" still
  // names its own file, so three of the four candidates are leak-free.
  assert.equal(j.unnamed.n, 3, `expected every candidate but the invoice printer in the leak-free stratum, got ${j.unnamed.n}`);
});

test('both arms report the same three measures, all of them shares in [0,1]', () => {
  const j = json();
  for (const [name, arm] of [['where', j.where], ['base', j.base], ['unnamed.where', j.unnamed.where], ['unnamed.base', j.unnamed.base]]) {
    for (const k of ['hit3', 'mrr', 'place3']) {
      assert.equal(typeof arm[k], 'number', `${name}.${k} must be a number`);
      assert.ok(arm[k] >= 0 && arm[k] <= 1, `${name}.${k} = ${arm[k]} is not a share`); }
    assert.ok(arm.place3 >= arm.hit3, `${name}: a place hit is implied by a file hit, so place3 (${arm.place3}) can never sit below hit3 (${arm.hit3})`); }
  assert.ok(j.silent >= 0 && j.silent <= j.n, 'silent counts candidates, so it cannot exceed n');
});

test('a query that names its own file is found by both arms', () => {
  // "add invoice printer" → src/print/invoice-printer.ts. The whole point of the `unnamed` split is that this
  // case is winnable on the name alone, so the naive path-match baseline must win it outright.
  const j = json();
  assert.ok(j.base.hit3 > 0, 'the path-match baseline must rank at least one named file inside the top 3');
});

test('the text report prints both strata and carries the as-of stamp', () => {
  const r = grain(['selftest', '--where'], repo);
  assert.equal(r.code, 0, r.err);
  const lines = r.out.split('\n').filter(l => !l.startsWith('[grain]'));
  assert.match(lines[0], /^where: hit@3=\d\.\d\d MRR=\d\.\d\d place@3=\d\.\d\d cardW=\d+\.\d · path-match baseline: hit@3=\d\.\d\d MRR=\d\.\d\d place@3=\d\.\d\d cardW=\d+\.\d · n=\d+ · nothing-ranked=\d+$/);
  assert.match(lines[1], /^query does not name the file \(n=\d+\) — where: hit@3=/);
  // §071 — additive symbol stratum, reported beside (never instead of) the two strata above
  assert.match(lines[2], /^message names a symbol verbatim \(n=\d+\) — where: hit@3=/);
  assert.match(lines[3], /^as of [0-9a-f]{7}/);
});

test('--last bounds the candidates evaluated, newest first', () => {
  assert.equal(json(['--last', '2']).n, 2);
  assert.equal(json(['--last', '99']).n, json().n);
});

test('selftest --where takes no positional arguments', () => {
  const r = grain(['selftest', '--where', 'extra'], repo);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /usage: grain selftest .*--where/);
});

test('a repository with no history says so instead of reporting a hollow zero', () => {
  const r = grain(['selftest', '--where', '--json'], bare);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out.split('\n').filter(l => !l.startsWith('[grain]')).join('\n'));
  assert.match(j.note, /needs commit history/);
  assert.equal(j.where, null);
  assert.equal(j.n, 0);
});

// §068 — `place@3` was gameable by card width: a directory or group card wide enough to cover most of the
// repository contains the truth file almost by construction, so the OLD scoring (`place3 = at(rows,'wPlace',3)`,
// a flat 1 for any row where SOMETHING — hit or mere containment — landed by rank 3) credited a 64%-of-repo card
// exactly as much as an actual named hit. `whereEval` is exercised directly here (as weak-match-signals.test.mjs
// does for `whereCmd`) with a hand-built model/history — no git or CLI needed, since the only thing under test is
// the scoring math, not the ranker or the candidate-derivation machinery already covered above.
//
// Both fixtures below use a MARKER card (never a directory) as the credited card, specifically so the credit is
// unambiguous: a marker can never itself register as an exact `hit` (only `type === 'file'` can), and its query
// token ('widemk' / 'narrowmk') appears NOWHERE in any carrier file's own path, so every carrier's individual
// file-card scores exactly 0 for that query and is filtered out before ranking — the marker is the ONLY hit,
// its width is exactly its carrier count, and hit3 comes out 0 in both, proving this is pure containment credit,
// not an accidental exact match.
function markerModel(carrierKeys, markerName) {
  const files = carrierKeys.map(k => k.split('#')[0]);
  const part = {
    name: '_root',
    medoids: [],
    assignments: {},
    facts: [],
    markers: { ['deco:' + markerName]: carrierKeys },
    files,
  };
  return { partitions: [part], steers: [], filesAll: files };
}
function whereEvalFor(model, truthFile, query) {
  const H = {
    fps: [{ ts: 1, toks: [query], files: [truthFile], renames: [] }],
    lc: [[truthFile + '#x', { first: 1, newFile: true }]],
  };
  return whereEval({ model, H, last: 1 });
}

test('§068: a card spanning 20 files earns only 1/20 of a hit — not the full 1 a precise hit gets', () => {
  const keys = Array.from({ length: 19 }, (_, i) => `src/w/filler${i}.ts#method#Run${i}`);
  keys.push('src/w/truth.ts#method#RunTruth');
  const model = markerModel(keys, 'widemk');
  const res = whereEvalFor(model, 'src/w/truth.ts', 'widemk');
  assert.equal(res.n, 1);
  assert.equal(res.where.hit3, 0, 'the marker is not a file, so this must be pure containment, not an exact hit');
  assert.equal(res.where.place3, 1 / 20, 'a 20-file card must earn exactly 1/20 of a real hit, not a flat 1');
  assert.equal(res.where.placeWidth, 20, 'the credited card width must be reported, not left for a researcher to dig out by hand');
});

test('§068: a 2-file card earns 1/2 — proportionally more than the 20-file card above for the identical scenario shape', () => {
  const keys = ['src/n/fileA.ts#method#RunA', 'src/n/truth2.ts#method#RunB'];
  const model = markerModel(keys, 'narrowmk');
  const res = whereEvalFor(model, 'src/n/truth2.ts', 'narrowmk');
  assert.equal(res.n, 1);
  assert.equal(res.where.hit3, 0);
  assert.equal(res.where.place3, 1 / 2, 'a narrower, more precise card must be worth more place@3 credit than a wide one');
  assert.equal(res.where.placeWidth, 2);
});

test('§068: a genuine hit (a one-file card, by construction) still earns full place@3 credit — the discount never inverts hit3 ≤ place3', () => {
  const keys = ['src/f/truth.ts#method#Run'];
  const model = markerModel(keys, 'onlymk');
  const res = whereEvalFor(model, 'src/f/truth.ts', 'onlymk');
  assert.equal(res.where.place3, 1, 'a 1-file card is the narrowest possible — full credit, matching a real hit');
  assert.equal(res.where.placeWidth, 1);
});
