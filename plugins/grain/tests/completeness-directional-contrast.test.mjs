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
