// The scope co-change budget, cut over TWO populations instead of one (ticket 146, escalation 23).
//
// `model.scopeCochange` carries at most 5000 pairs. Until this ticket that budget was one descending-support
// cut over the whole list, and the two populations underneath it are not comparable: two scopes in ONE file are
// touched together whenever that file is touched, so their support rises with the file's own commit count,
// while a CROSS-file pair needs the same two named declarations edited together eight or more times. On express
// the consequence was total — all 5000 retained pairs were inside one file and all 36 cross-file pairs the
// store held were dropped before any consumer saw them, so the surface was 100% within-file by construction
// (`.system/research/node-cochange-measurement.md` §3). Now each population is entitled to half the same
// budget, each cut by its own descending support, and whatever half one does not use goes to the other.
//
// THREE THINGS ARE GUARDED, each with a silent failure mode of its own:
//
//   1. THE OVERFLOW CASE, which is the only case where anything changes at all. The fixture below is built so
//      that a single descending cut PROVABLY drops the cross-file pair — the within-file population alone
//      overfills the budget and every one of its pairs outranks the cross-file pair on support — and the test
//      asserts both that the cross-file pair survives and that the old cut would have dropped it. Without the
//      second half the first would keep passing if the fixture ever stopped overflowing.
//   2. THE TOTAL. The split must not cost retention: a repository that overflows keeps exactly as many pairs
//      as before, the same `min(budget, total)`. A budget quietly halved would look like a fix and be a loss.
//   3. THE UNDER-BUDGET CASE. Nearly every repository is under the budget, and for those the model must be
//      byte-identical to the single cut — same pairs, same order. A reordering here would move which lines
//      `check` prints on repositories the ticket was never about.
//
// Everything runs against real git repositories: two built here, and the express oracle's own clone when the
// corpus is present — the repository the bias was measured on, indexed with full history, end to end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHistory } from '../engine/history.mjs';
import { CFG } from '../engine/config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUDGET = 5000; // learn.mjs's own scope-co-change budget, restated here so a change to it fails this file
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 'T',
  GIT_AUTHOR_EMAIL: 't@x',
  GIT_COMMITTER_NAME: 'T',
  GIT_COMMITTER_EMAIL: 't@x',
};
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env });
const commitAll = (dir, msg) => {
  gitIn(dir, 'add', '-A');
  gitIn(dir, 'commit', '-q', '-m', msg);
};
const initRepo = dir => {
  mkdirSync(join(dir, 'src'), { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
};
const fileOf = k => {
  const i = k.indexOf('#');
  return i < 0 ? k : k.slice(0, i);
};
const isCross = p => fileOf(p.a) !== fileOf(p.b);
const indexIt = repo => {
  const r = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
};
const modelOf = repo => JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));

// THE OVERFLOW FIXTURE. One file of 101 declarations, all edited together in 12 commits — C(101,2) = 5050
// within-file pairs at support 12, which alone overfills the 5000-pair budget. Beside it, ONE cross-file pair
// edited together in 8 commits of its own: exactly `CFG.cochangeMinSup`, so it is in the store, and strictly
// weaker than every within-file pair, so a single descending cut reaches the budget long before it.
// `helper<i>()` changes the CALLED name every commit so each body hash actually moves — a literal-only edit
// registers no touch past birth (the note `scope-cochange.test.mjs` carries, for the same reason). 101 scopes
// is under `CFG.scopePairCap` (200), so the commit pairs rather than being skipped as a mass edit.
const DECLS = 101;
function buildOverflowFixture(dir) {
  initRepo(dir);
  for (let i = 1; i <= 12; i++) {
    const body = Array.from({ length: DECLS }, (_, n) => `export function fn${n}() { helper${i}(); return ${n}; }`).join('\n');
    writeFileSync(join(dir, 'src/big.ts'), body + '\n');
    commitAll(dir, `big change ${i}`);
  }
  for (let i = 1; i <= 8; i++) {
    writeFileSync(join(dir, 'src/x.ts'), `export function alpha() { helper${i}(); return 1; }\n`);
    writeFileSync(join(dir, 'src/y.ts'), `export function omega() { helper${i}(); return 2; }\n`);
    commitAll(dir, `pair change ${i}`);
  }
}

// THE UNDER-BUDGET FIXTURE: two scopes in two files, moving together across nine commits. Nothing here comes
// near the budget, which is the point — this is the shape of nearly every repository.
function buildSmallFixture(dir) {
  initRepo(dir);
  for (let i = 1; i <= 9; i++) {
    writeFileSync(join(dir, 'src/pair-a.ts'), `export function validate() { helper${i}(); return 1; }\n`);
    writeFileSync(join(dir, 'src/pair-b.ts'), `export function schema() { helper${i}(); return 1; }\n`);
    commitAll(dir, `pair change ${i}`);
  }
}

let tmp, over, small;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-capsplit-'));
  over = join(tmp, 'overflow');
  small = join(tmp, 'small');
  buildOverflowFixture(over);
  buildSmallFixture(small);
  indexIt(over);
  indexIt(small);
});
after(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

test('a repository that overflows the budget keeps its cross-file pairs — which a single descending cut provably dropped', async () => {
  const { H } = await loadHistory({
    gitdir: over,
    store: { dir: join(tmp, 'ostore'), historyPath: join(tmp, 'ostore', 'history.json') },
    log: () => {},
  });
  const store = H.scopeCochange || [];
  const storeWithin = store.filter(p => !isCross(p));
  const storeCross = store.filter(isCross);
  // fixture sanity, stated as assertions so the test cannot pass for the wrong reason
  assert.ok(storeWithin.length > BUDGET, `the within-file population must alone overfill the budget, got ${storeWithin.length}`);
  assert.equal(storeCross.length, 1, `expected exactly one cross-file pair in the store, got ${JSON.stringify(storeCross)}`);
  assert.equal(storeCross[0].sup, CFG.cochangeMinSup, 'the cross-file pair sits exactly on the support floor');
  const weakestWithin = Math.min(...storeWithin.map(p => p.sup));
  assert.ok(
    weakestWithin > storeCross[0].sup,
    `every within-file pair must outrank the cross-file pair on support (weakest within ${weakestWithin} vs cross ${storeCross[0].sup}) — otherwise a single descending cut might have kept it by luck`
  );

  const m = modelOf(over);
  const cross = (m.scopeCochange || []).filter(isCross);
  assert.equal(cross.length, 1, `the cross-file pair must survive the cut: ${JSON.stringify(cross)}`);
  assert.deepEqual(
    [cross[0].a, cross[0].b].map(fileOf).sort(),
    ['src/x.ts', 'src/y.ts'],
    'and it must be the pair the fixture built'
  );
});

test('the split costs no retention: an overflowing repository keeps exactly the budget, as before', async () => {
  const m = modelOf(over);
  assert.equal(m.scopeCochange.length, BUDGET, 'the total is still min(budget, total) — the budget is shared, not halved');
  const within = m.scopeCochange.filter(p => !isCross(p)).length;
  assert.equal(within, BUDGET - 1, 'the one cross-file pair costs exactly one within-file pair, the weakest of them');
  // the retained pairs are still ordered by descending support, one list, as every consumer reads them
  for (let i = 1; i < m.scopeCochange.length; i++)
    assert.ok(m.scopeCochange[i - 1].sup >= m.scopeCochange[i].sup, 'the emitted list stays sorted by descending support');
});

test('a repository under the budget is untouched — same pairs, same order, as a single descending cut', () => {
  const m = modelOf(small);
  const sc = m.scopeCochange || [];
  assert.ok(sc.length > 0, 'fixture sanity: the pair must be present for this comparison to mean anything');
  assert.ok(sc.length < BUDGET, 'fixture sanity: this repository must be under the budget');
  const single = [...sc].sort((a, b) => b.sup - a.sup || (a.a < b.a ? -1 : a.a > b.a ? 1 : a.b < b.b ? -1 : 1));
  assert.equal(JSON.stringify(sc), JSON.stringify(single), 'under the budget the split must be a no-op, order included');
});

// ------------------------------------------------------------------ the oracle the bias was measured on

// express is the repository escalation 23 was raised from: 28 534 scope pairs in the store, 36 of them
// cross-file, and a single cut kept none of the 36. Full history is what scope co-change is made of, so this
// one indexes the real clone end to end rather than reading a fixture.
const CLONES = process.env.GRAIN_CORPUS_CLONES;
test(
  'the express oracle keeps every cross-file scope pair its store holds, without spending more than the budget',
  { skip: CLONES ? false : 'GRAIN_CORPUS_CLONES is not set — the corpus clones are not in this repository' },
  async () => {
    const clone = join(CLONES, 'express');
    if (!existsSync(join(clone, '.git'))) {
      assert.ok(true, `skipped: no clone at ${clone}`);
      return;
    }
    // A scope pair needs eight commits to exist at all, so this measures nothing on a shallow or single-commit
    // checkout — which is what a CI `actions/checkout` gives by default. Say so and stop, rather than failing on
    // a missing history that has nothing to do with the cut.
    const depth = Number(gitIn(clone, 'rev-list', '--count', 'HEAD').trim());
    if (!Number.isFinite(depth) || depth < 1000) {
      assert.ok(true, `skipped: the express clone carries ${depth} commits — scope co-change needs real history`);
      return;
    }
    // the corpus clones are read-only and indexing writes a store, so work on a copy of the checkout
    const target = join(tmp, 'clone-express');
    execFileSync('cp', ['-a', clone, target]);
    rmSync(join(target, '.grain'), { recursive: true, force: true });
    const r = spawnSync('node', [BIN, 'refresh', '--full'], { cwd: target, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const { H } = await loadHistory({
      gitdir: target,
      store: { dir: join(target, '.grain', 'cache'), historyPath: join(target, '.grain', 'cache', 'history.json') },
      log: () => {},
    });
    const storeCross = (H.scopeCochange || []).filter(isCross).length;
    assert.ok(storeCross > 0, `fixture sanity: express's store must hold cross-file pairs, got ${storeCross}`);
    assert.ok((H.scopeCochange || []).length > BUDGET, 'fixture sanity: express must overflow the budget');

    const m = modelOf(target);
    assert.equal(m.scopeCochange.length, BUDGET, 'the budget is spent in full, not halved');
    assert.equal(
      m.scopeCochange.filter(isCross).length,
      storeCross,
      'every cross-file pair the store holds reaches the model — this is the whole finding of escalation 23'
    );
  }
);
