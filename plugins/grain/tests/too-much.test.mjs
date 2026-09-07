// Guard for the "too much" diagnostic instrument: tests/stress/too-much.mjs.
//
// The instrument turns "which parts of this code do too much" into a ranked number, so the number itself has to
// be guarded. Three layers, the same shape the reconstruction instrument's guard uses:
//
//   1. End to end against a REAL repository (a git repo of 36 files: 20 conforming sibling handlers, 14 leaf
//      modules and ONE planted god-file that plays every role group at once and imports thirteen modules) with
//      a REAL `grain export`. The god-file must rank first on the responsibilities and fan-out categories, and
//      no conforming sibling may fire on anything.
//   2. The arithmetic every number rests on, pinned: the binary-magnitude alphabet, the certified-norm prefix,
//      the leave-one-out KT excess, the lambda bound, and the minRaw silence.
//   3. The counterfactual: the role-split cut must pay on a large multi-role file and must NOT pay on a small
//      one — a negative gain is a result, not a bug, and has to stay reachable.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG } from '../engine/config.mjs';
import { logBin, fitBins, excessBits, fires, entropyBits, responsibilityCut, LAMBDA_BITS } from './stress/too-much.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TM = join(here, 'stress', 'too-much.mjs');

const SIBLINGS = 20; // >= 14 is required for a 1-of-n population to clear the display bound at all; 20 leaves room
const LEAVES = 14;
const VERBS = ['parse', 'validate', 'render', 'log'];
const pad = i => String(i).padStart(2, '0');

let tmp, repo;

function buildFixture(root, env) {
  mkdirSync(root, { recursive: true });
  const w = (rel, c) => {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, c);
  };
  w('src/normalise.mjs', 'export function normalise(value) {\n  return String(value).trim();\n}\n');
  for (let i = 1; i <= LEAVES; i++)
    w(`src/l${pad(i)}.mjs`, `export function legacy${pad(i)}(value) {\n  return value;\n}\n`);
  // the conforming siblings: one import each, four scopes, one per role group — identical shape, 20 times over
  for (let i = 1; i <= SIBLINGS; i++) {
    let src = "import { normalise } from './normalise.mjs';\n\n";
    for (const v of VERBS) src += `export function ${v}Request(request) {\n  return normalise(request.${v});\n}\n\n`;
    w(`src/h${pad(i)}.mjs`, src);
  }
  // the planted god-file: thirteen imports, and ten scopes spread over all four role groups at once
  let hub = "import { normalise } from './normalise.mjs';\n";
  for (let i = 1; i <= 12; i++) hub += `import { legacy${pad(i)} } from './l${pad(i)}.mjs';\n`;
  hub += '\n';
  for (const [v, c] of [['parse', 3], ['validate', 2], ['render', 2], ['log', 3]])
    for (let j = 0; j < c; j++)
      hub += `export function ${v}Request${'ABC'[j]}(request) {\n  return normalise(request.${v}${j});\n}\n\n`;
  w('src/hub.mjs', hub);
  w('package.json', '{\n  "name": "too-much-fixture",\n  "type": "module"\n}\n');

  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', root, 'add', '-A'], { env });
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture'], { env });
}
const FIXTURE_FILES = 1 + LEAVES + SIBLINGS + 1; // normalise + leaves + siblings + hub (package.json is not indexed as source)

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'too-much-'));
  repo = join(tmp, 'repo');
  buildFixture(repo, {
    ...process.env, HOME: tmp,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
    GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
  });
});
after(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

let cached = null;
const runInstrument = () => {
  if (cached) return cached;
  const out = join(tmp, 'out.json');
  const r = spawnSync('node', [TM, repo, out, '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
  cached = JSON.parse(readFileSync(out, 'utf8'));
  return cached;
};

// ---------- 1. end to end, real repository, real grain export ----------

test('the planted god-file ranks first on responsibilities and on fan-out', () => {
  const o = runInstrument();
  assert.equal(o.instrument, 'too-much/1');
  assert.equal(o.universe.files, FIXTURE_FILES);
  for (const dim of ['responsibilities', 'fanout']) {
    const rows = o.dimensions[dim].rows;
    assert.ok(rows.length >= 1, `${dim} fired on nothing at all`);
    assert.equal(rows[0].id, 'src/hub.mjs', `${dim} ranks ${rows[0].id} first, not the god-file`);
  }
  // and it leads the joint ranking, which is what a maintainer actually reads
  assert.equal(o.ranked.file[0].id, 'src/hub.mjs');
  assert.ok(Object.keys(o.ranked.file[0].dims).length >= 3, 'the god-file should be excessive on several dimensions at once');
});

test('no conforming sibling fires on any dimension', () => {
  const o = runInstrument();
  const offenders = [];
  for (const [dim, d] of Object.entries(o.dimensions))
    for (const r of d.rows) if (/(^|\/)h\d\d\.mjs/.test(r.id)) offenders.push(`${dim}: ${r.id}`);
  assert.deepEqual(offenders, [], 'a conforming sibling was accused');
});

test('the god-file plays several role groups and the siblings play one apiece', () => {
  const o = runInstrument();
  const row = o.dimensions.responsibilities.rows[0];
  assert.ok(row.evidence.groups >= 3, `the god-file should span several groups, spans ${row.evidence.groups}`);
  assert.ok(row.evidence.assignedScopes >= 6);
  // every sibling sits at or under the certified norm, so none of them can be excessive
  assert.ok(row.normMass >= 1 - 1 / CFG.lambda, 'the norm must cover at least 1 - 1/lambda of the population');
});

test('the fire rate is reported per dimension, and the populations too small to fit are disclosed', () => {
  const o = runInstrument();
  for (const d of Object.values(o.dimensions))
    assert.ok(d.fireRate === null || (d.fireRate >= 0 && d.fireRate <= 100));
  assert.ok(Array.isArray(o.silentPopulations));
  assert.ok(Array.isArray(o.underpoweredPopulations));
  assert.ok(o.disclosure.length >= 5, 'the surface must carry its disclosure');
  assert.equal(o.lambda, CFG.lambda);
  assert.equal(o.lambdaBits, +Math.log2(CFG.lambda).toFixed(2));
});

// ---------- 2. the arithmetic, pinned ----------

test('the alphabet is the binary magnitude of the statistic', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 7, 8, 200].map(logBin), [0, 1, 1, 2, 2, 3, 3, 7]);
});

test('the bound is exactly log2(lambda), and nothing else', () => {
  assert.equal(LAMBDA_BITS, Math.log2(CFG.lambda));
  assert.equal(fires(LAMBDA_BITS), true);
  assert.equal(fires(LAMBDA_BITS - 1e-9), false);
});

test('a population below CFG.minRaw is silent, never defaulted', () => {
  const tooFew = Array.from({ length: CFG.minRaw - 1 }, () => 1);
  assert.equal(fitBins(tooFew), null);
  assert.equal(excessBits(null, 1000), 0);
  const enough = Array.from({ length: CFG.minRaw }, () => 1);
  assert.notEqual(fitBins(enough), null);
});

test('the norm is the smallest prefix of bins clearing the same display bound a convention must clear', () => {
  // 19 elements at bin 1, one at bin 4: the prefix through bin 1 holds (19 + 1/2)/(20 + K/2) = 0.907, over
  // 1 - 1/8, so the norm is "at most bin 1" and the outlier sits outside it. Nineteen is the smallest count
  // that clears it here — with eighteen the bound fails at 0.860 and the norm swallows the outlier instead.
  const fit = fitBins([...Array(19).fill(1), 20]);
  assert.equal(fit.modeBin, 1);
  assert.equal(fit.normBin, 1);
  assert.ok((19 + 0.5) / (20 + fit.K / 2) >= 1 - 1 / CFG.lambda);
  assert.ok((18 + 0.5) / (20 + fit.K / 2) < 1 - 1 / CFG.lambda);
  // a population with no such prefix says nothing: the norm degenerates to its own largest bin
  const flat = fitBins([0, 1, 3, 7, 15, 31, 63, 127]);
  assert.equal(flat.normBin, logBin(127));
  assert.equal(excessBits(flat, 127), 0);
});

test('the excess is one-sided, leave-one-out, and zero inside the norm', () => {
  const fit = fitBins([...Array(19).fill(1), 40]);
  assert.equal(excessBits(fit, 0), 0, 'below the mode is not "too much"');
  assert.equal(excessBits(fit, 1), 0, 'at the mode costs nothing');
  assert.equal(excessBits(fit, 2), 0, 'inside the norm costs nothing');
  const bits = excessBits(fit, 40);
  assert.ok(fires(bits), `the lone outlier should clear the bound, got ${bits}`);
  // leave-one-out: the outlier is NOT counted in the distribution it is judged against, so its own bin is unseen
  const looCounts = { ...fit.counts };
  delete looCounts[logBin(40)];
  const n = fit.n - 1;
  const expected = Math.log2(((19 + 0.5) / (n + fit.K / 2)) / ((0 + 0.5) / (n + fit.K / 2)));
  assert.ok(Math.abs(bits - expected) < 1e-9, `${bits} vs ${expected}`);
  assert.deepEqual(Object.keys(looCounts), [String(fit.modeBin)]);
});

test('CFG.minRaw is exactly where the bound first becomes reachable', () => {
  // the largest excess any member of a population of n can carry is log2(2n-1)
  const attainable = n => fitBins([...Array(n - 1).fill(1), 1 << 20]).attainableBits;
  assert.ok(attainable(CFG.minRaw) >= LAMBDA_BITS, 'at minRaw the bound must be reachable');
  assert.ok(Math.log2(2 * (CFG.minRaw - 1) - 1) < LAMBDA_BITS, 'one element fewer and it must not be');
});

test('entropy is zero for one group and log2(k) for k equal ones', () => {
  assert.equal(entropyBits(new Map([[0, 12]])), 0);
  assert.equal(entropyBits(new Map([[0, 5], [1, 5], [2, 5], [3, 5]])), 2);
});

// ---------- 3. the counterfactual ----------

test('the role-split cut pays on a large multi-role file and does not on a small one', () => {
  const big = responsibilityCut({ H: 4.54, assignedScopes: 104, groups: 28, partGroups: 41, partFiles: 6 });
  assert.ok(big.gainBits > 0, `splitting a 104-scope, 28-role file should pay, got ${big.gainBits}`);
  assert.equal(big.parts, 28);
  const small = responsibilityCut({ H: 2, assignedScopes: 4, groups: 4, partGroups: 30, partFiles: 200 });
  assert.ok(small.gainBits < 0, `splitting a four-scope file must not pay, got ${small.gainBits}`);
  assert.equal(responsibilityCut({ H: 0, assignedScopes: 40, groups: 1, partGroups: 30, partFiles: 200 }), null);
});
