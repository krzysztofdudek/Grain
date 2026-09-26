// `completeness <file>` (completenessDirectional/cochangeData) names a co-change partner for ONE direction at a
// time, the edited file's own (issue 259): of the edited file's commits, the share that also touched the partner
// must beat the partner's own base rate over the same commit population, by the co-change cell in facts.mjs (the
// obligation cell's KT data term, BIC half log and one index cost over every directed pair). It used to take the
// larger of the two directional confidences against a flat floor — a third for one file, 75% for several — so a hub
// named its test file for the TEST's confidence ("8/10") and a file touched by a third of all commits was named for
// being touched by a third of this file's. The printed denominator is now always the edited file's own count.
// `(complete)` is never printed: the negative says what was tested.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cochangeData, completenessDirectional } from '../engine/core.mjs';
import { partnerBits } from '../engine/facts.mjs';

// a hub with 38 of 200 commits and a partner whose 8 commits all came with it
const hubModel = () => ({
  cochange: [{ a: 'src/hub.ts', b: 'src/partner.ts', sup: 8, commitsA: 38, commitsB: 8, conf: 1 }],
  nonMegaCommits: 200,
  pathsAll: ['src/hub.ts', 'src/partner.ts'],
  filesAll: ['src/hub.ts', 'src/partner.ts'],
});

test('the co-change cell by hand: 8 of the hub\'s 38 commits against the partner\'s 8 of 200', () => {
  // kt(t) = 8.5/39, base kt = 8.5/201; kt(u) = 30.5/39, base 192.5/201; index cost ceil(log2 2) = 1
  const want = 8 * Math.log2((8.5 / 39) / (8.5 / 201)) + 30 * Math.log2((30.5 / 39) / (192.5 / 201)) - 0.5 * Math.log2(38) - 1;
  assert.equal(partnerBits(8, 38, 8, 200, 1), +want.toFixed(2));
  assert.ok(want > 0);
});

test('editing the hub names the partner with the HUB\'s own count; editing the partner names the hub with its own', () => {
  const fromHub = cochangeData(hubModel(), ['src/hub.ts']);
  assert.equal(fromHub.length, 1, JSON.stringify(fromHub));
  assert.deepEqual({ ...fromHub[0], bits: undefined }, { file: 'src/partner.ts', sup: 8, commits: 38, bits: undefined, dead: false, ambient: false });
  const fromPartner = cochangeData(hubModel(), ['src/partner.ts']);
  assert.equal(fromPartner[0].file, 'src/hub.ts');
  assert.equal(fromPartner[0].commits, 8, 'the partner\'s own 8 commits are the denominator');
  const lines = completenessDirectional(hubModel(), ['src/hub.ts']);
  assert.equal(lines[0], '[grain] Edits like this historically also touch:');
  assert.equal(lines[1], '  - src/partner.ts (co-changed in 8/38 commits)');
});

test('a partner touched beside this file no more often than it is touched anyway is not named', () => {
  // the changelog: 23 of this file's 57 commits (40%), and 419 of all 1141 commits (37%) — a Yggdrasil pair
  const model = {
    cochange: [{ a: 'src/check.ts', b: 'CHANGELOG.md', sup: 23, commitsA: 57, commitsB: 419 }],
    nonMegaCommits: 1141,
    pathsAll: ['src/check.ts', 'CHANGELOG.md'],
    filesAll: [],
  };
  assert.deepEqual(cochangeData(model, ['src/check.ts']), []);
  assert.deepEqual(completenessDirectional(model, ['src/check.ts']), ['no file changes with these more often than it changes anyway']);
});

test('a genuinely partnerless file gets the negative, never "(complete)"', () => {
  const lines = completenessDirectional({ cochange: [], nonMegaCommits: 10, pathsAll: ['src/solo.ts'], filesAll: [] }, ['src/solo.ts']);
  assert.deepEqual(lines, ['no file changes with these more often than it changes anyway']);
});

test('the same gate for one changed file and for several — no second floor for a multi-file set', () => {
  const model = hubModel();
  const one = cochangeData(model, ['src/hub.ts']).map(h => h.file);
  const two = cochangeData({ ...model, pathsAll: [...model.pathsAll, 'src/z.ts'] }, ['src/hub.ts', 'src/z.ts']).map(h => h.file);
  assert.deepEqual(two, one);
});

// Issue 366: the base rate accounts for commit size. A file committed with twenty others per commit meets a busy
// partner in about 1 − (1 − π)^20 of its commits by chance, π the partner's share of the touches the file leaves.
test('the commit-size base rate by hand: the partner\'s share of the other touches, over the edited file\'s mean commit size', () => {
  // 1000 commits, 10000 file touches; the edited file: 50 commits with 1000 other files beside it (m = 20);
  // the partner: 100 commits, met in 15 of the 50
  const S = 10000 - 50, m = 1000 / 50;
  const base = 1 - Math.pow(1 - 100.5 / (S + 1), m);
  const want = 15 * Math.log2((15.5 / 51) / base) + 35 * Math.log2((35.5 / 51) / (1 - base)) - 0.5 * Math.log2(50) - 1;
  const got = partnerBits(15, 50, 100, 1000, 1, 1000, 10000);
  assert.equal(got, want > 0 ? +want.toFixed(2) : null);
  assert.equal(got, null, 'fifteen meetings in fifty twenty-file commits are what chance gives a partner touched this often');
  assert.ok(partnerBits(15, 50, 100, 1000, 1) > 0, 'the rate per commit, blind to the size, names it');
});

test('the commit-size base rate still names a partner a small-commit file really travels with', () => {
  // 8 of the hub's 38 commits, the partner's 8 of 200, 400 touches; the hub's commits carry one other file each
  assert.ok(partnerBits(8, 38, 8, 200, 1, 38, 400) > 0);
});

test('without the commit sizes the rate is the partner\'s commits over all commits, as for scope pairs', () => {
  assert.equal(partnerBits(8, 38, 8, 200, 1, undefined, 400), partnerBits(8, 38, 8, 200, 1));
  assert.equal(partnerBits(8, 38, 8, 200, 1, 38, 0), partnerBits(8, 38, 8, 200, 1));
});

test('cochangeData reads each side\'s commit sizes from the pair and the touches from the model', () => {
  const model = {
    cochange: [{ a: 'src/big.ts', b: 'src/busy.ts', sup: 15, commitsA: 50, commitsB: 100, othersA: 1000, othersB: 400 }],
    nonMegaCommits: 1000,
    fileTouches: 10000,
    pathsAll: ['src/big.ts', 'src/busy.ts'],
    filesAll: [],
  };
  assert.deepEqual(cochangeData(model, ['src/big.ts']).filter(h => !h.ambient), [], 'editing the big-commit file: chance');
  assert.equal(cochangeData({ ...model, fileTouches: 0 }, ['src/big.ts'])[0].file, 'src/busy.ts', 'the rate per commit names it');
});
