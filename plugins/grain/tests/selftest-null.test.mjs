// `grain selftest --null` — the false-certification counterpart of the mutation harness (docs/validation.md,
// "False certifications under a null"). Each family is re-run on a randomisation that keeps the marginals its own
// base rate is drawn from and destroys only the link it claims; what it still certifies is false by construction.
// These tests pin the randomisations themselves (a null that leaked a marginal, or kept the link, would measure
// nothing) and the command's shape on a small real repository.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregatesOf, curveball, permuteEdgeSources, rng } from '../engine/selftest-null.mjs';
import { architectureNorms } from '../engine/core.mjs';
import { shuffleFixes, shuffleMembers } from '../engine/learn.mjs';

const fps = [];
{
  const r = rng(7);
  for (let c = 0; c < 200; c++) {
    const files = new Set();
    const k = 1 + Math.floor(r() * 6);
    while (files.size < k) files.add(`d${Math.floor(r() * 4)}/f${Math.floor(r() * 30)}.ts`);
    const fs2 = [...files].sort();
    fps.push({ sha: 's' + c, ts: c, toks: ['tok' + (c % 7)], files: fs2, added: fs2.slice(0, 1), scopes: fs2.map(f => `${f}#method#m`), renames: [] });
  }
}
const colSums = xs => { const m = new Map(); for (const fp of xs) for (const f of fp.files) m.set(f, (m.get(f) || 0) + 1); return m; };

test('the curveball null keeps every commit\'s size and every file\'s commit count, and moves files', () => {
  const out = curveball(fps, rng(1));
  assert.deepEqual(out.map(fp => fp.files.length), fps.map(fp => fp.files.length), 'row sums');
  assert.deepEqual([...colSums(out)].sort(), [...colSums(fps)].sort(), 'column sums');
  const moved = out.filter((fp, i) => fp.files.join() !== fps[i].files.join()).length;
  assert.ok(moved > fps.length / 2, `the randomisation must actually move files (${moved} of ${fps.length} commits changed)`);
  for (const fp of out) {
    assert.equal(new Set(fp.files).size, fp.files.length, 'no file twice in one commit');
    for (const a of fp.added) assert.ok(fp.files.includes(a), 'a birth travels with its file');
    for (const k of fp.scopes) assert.ok(fp.files.includes(k.slice(0, k.indexOf('#'))), 'a touched scope travels with its file');
  }
  const births = xs => xs.flatMap(fp => fp.added).sort();
  assert.deepEqual(births(out), births(fps), 'every birth survives, once');
});

test('the curveball null is reproducible from its seed', () => {
  assert.deepEqual(curveball(fps, rng(3)), curveball(fps, rng(3)));
});

test('aggregates rebuilt from footprints agree with the footprints', () => {
  const H = aggregatesOf(fps);
  assert.equal(H.nonMegaCommits, fps.length);
  for (const [f, n] of colSums(fps)) assert.equal(H.fileCommits[f], n);
  for (const c of H.cochange) {
    const both = fps.filter(fp => fp.files.includes(c.a) && fp.files.includes(c.b)).length;
    assert.equal(c.sup, both);
  }
});

test('the edge null deals whole out-edge sets among the files that have one', () => {
  const edges = [];
  for (let i = 0; i < 30; i++) for (let j = 0; j <= i % 3; j++) edges.push({ from: `a/${i}.ts`, to: `b/${(i + j) % 7}.ts` });
  const out = permuteEdgeSources(edges, rng(5));
  const setOf = es => { const m = new Map(); for (const e of es) (m.get(e.from) || m.set(e.from, []).get(e.from)).push(e.to); return [...m.values()].map(v => v.sort().join()).sort(); };
  assert.deepEqual(setOf(out), setOf(edges), 'the multiset of out-edge sets is unchanged');
  assert.deepEqual([...new Set(out.map(e => e.from))].sort(), [...new Set(edges.map(e => e.from))].sort(), 'the same files keep having an out-edge set');
});

test('architecture norms certify nothing once the edges no longer belong to their files', () => {
  // A never reaches B, C always does: a real boundary. Dealt out at random, it must disappear.
  const files = ['B/idx.ts', 'A/base.ts', 'C/base.ts'];
  const edges = [];
  for (let i = 0; i < 25; i++) {
    files.push(`A/${i}.ts`, `C/${i}.ts`);
    edges.push({ from: `A/${i}.ts`, to: 'A/base.ts' }, { from: `C/${i}.ts`, to: 'B/idx.ts' });
  }
  const model = { filesAll: files, edges, pkgs: [] };
  assert.ok(architectureNorms(model).some(n => n.from === 'A' && n.exp === 'false'), 'sanity: the real boundary certifies');
  let certified = 0;
  for (let s = 0; s < 10; s++) certified += architectureNorms({ ...model, edges: permuteEdgeSources(edges, rng(100 + s)) }).length;
  assert.ok(certified <= 1, `shuffled edges certified ${certified} norms over 10 runs`);
});

// ===== the command, on a small real repository =====
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-null-'));
  repo = join(tmp, 'r');
  mkdirSync(join(repo, 'src'), { recursive: true });
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { env: { ...env, GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' } });
  git('init', '-q', '-b', 'main');
  for (let i = 0; i < 8; i++) {
    writeFileSync(join(repo, 'src', `m${i}.ts`), `export function run${i}(x: string): string {\n  return x + '${i}';\n}\n`);
    git('add', '-A');
    git('commit', '-qm', `add module ${i}`);
  }
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('`grain selftest --null --json` reports, per family, the real count and one null count per run', () => {
  const r = spawnSync('node', [BIN, 'selftest', '--null', '--runs', '2', '--json'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  assert.equal(j.runs, 2);
  for (const f of ['conventions', 'directories', 'arch', 'archAbsence', 'obligations', 'cochange', 'archetypes', 'bridge', 'valueNorms', 'deviationFix']) {
    assert.ok(j.families[f], `family ${f} is reported`);
    assert.equal(typeof j.families[f].real, 'number');
    assert.equal(j.families[f].null.length, 2, `${f}: one null count per run`);
  }
  assert.equal(typeof j.nullTotalMean, 'number');
});

test('the value null keeps every member\'s share of the declaring files and breaks the files\' joint sets', () => {
  const fm = new Map([['f1', new Set(['a', 'b'])], ['f2', new Set(['a', 'b'])], ['f3', new Set(['a'])], ['f4', new Set(['b'])]]);
  const share = (m, k) => [...m.values()].filter(x => x.has(k)).length;
  const counts = { a: share(fm, 'a'), b: share(fm, 'b') };
  const conts = new Map([[1, fm]]);
  shuffleMembers(conts, rng(7));
  assert.deepEqual({ a: share(conts.get(1), 'a'), b: share(conts.get(1), 'b') }, counts);
});

test('the fix-label null keeps each scope\'s edit count and the total fix count', () => {
  const lc = new Map([['x', { mods: 5, fix: 5 }], ['y', { mods: 3, fix: 0 }], ['z', { mods: 0, fix: 0 }], ['w', { mods: 4, fix: 1 }]]);
  const out = shuffleFixes(lc, rng(3));
  assert.equal([...out.values()].reduce((a, b) => a + b, 0), 6);
  for (const [k, L] of lc) assert.ok(out.get(k) <= L.mods, `${k}: no more fixes than edits`);
  assert.equal(out.get('z'), 0);
});

test('`grain selftest --null` text names every family and the total', () => {
  const r = spawnSync('node', [BIN, 'selftest', '--null', '--runs', '1'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /selftest --null \(1 run, \d+ commits\)/);
  for (const f of ['conventions', 'directories', 'arch', 'obligations', 'cochange', 'archetypes', 'bridge', 'valueNorms', 'deviationFix']) assert.match(r.stdout, new RegExp(`^  ${f}: `, 'm'));
  assert.match(r.stdout, /total false certifications, mean per run: /);
});
