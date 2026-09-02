// §063: `completeness <file>` (completenessDirectional/cochangeData, core.mjs) used to gate a candidate partner on
// the CHANGED file's own forward confidence alone (sup/commitsA when the changed file is `a`, sup/commitsB when
// it is `b`). For a heavily-committed hub file that denominator is enormous, so a real, reliable partner's ratio
// reads as noise no matter how tight the coupling actually is — measured at 44 of the 45 hottest files across a
// 3-repo corpus getting a false `(complete — no file historically changes with these)` (.system/research/
// question-catalog.md §3.2). The fix: gate/rank by the MAX of the two directional confidences (confidenceAB vs
// confidenceBA, both already carried on every model.cochange pair — no new extraction), and for a single changed
// file additionally apply the same looser 1/3 floor `cochangePartners`'s own single-file mode already uses for
// `where <file>` on the exact same data (closing the class-C where/completeness contradiction the ticket names).
// `(complete)` must never be printed again — the negative names its threshold instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cochangeData, completenessDirectional } from '../engine/core.mjs';

// a hub with a huge total commit count (38) and one small, tightly-coupled partner (8 commits, ALL of them
// alongside the hub — support=8 clears cochangeMinSup, confidenceBA = 8/8 = 1.0). The old gate tested only
// sup/commitsA = 8/38 = 0.21 (suppressed, well under 0.75); the fix must surface it via confidenceBA instead,
// and print the PARTNER's own (8/8) evidence, never the hub's own (8/38).
const hubModel = () => ({
  cochange: [{ a: 'src/hub.ts', b: 'src/partner.ts', sup: 8, commitsA: 38, commitsB: 8, conf: 1 }],
  pathsAll: ['src/hub.ts', 'src/partner.ts'],
  filesAll: ['src/hub.ts', 'src/partner.ts'],
});

test('a hub file (huge own commit count) gets its tightly-coupled partner printed with the PARTNER\'S OWN support numbers, not the hub\'s', () => {
  const hits = cochangeData(hubModel(), ['src/hub.ts']);
  assert.equal(hits.length, 1, `expected exactly one partner surfaced: ${JSON.stringify(hits)}`);
  // §074: `ambient` is false here because the fixture carries no `nonMegaCommits` (no history at all to test the
  // partner's own global rate against) — see completeness-ambient-split.test.mjs for the ambient=true case.
  assert.deepEqual(hits[0], { file: 'src/partner.ts', sup: 8, commits: 8, dead: false, ambient: false });
});

test('completeness <hub file> renders the partner line with real support numbers, never "(complete)"', () => {
  const lines = completenessDirectional(hubModel(), ['src/hub.ts']);
  assert.equal(lines[0], '[grain] Edits like this historically also touch:');
  assert.equal(lines[1], '  - src/partner.ts (co-changed in 8/8 commits)');
  assert.ok(!lines.some(l => /\(complete\)/i.test(l) || /no file historically changes/.test(l)), `must never certify completeness: ${JSON.stringify(lines)}`);
});

// a file that genuinely has no cochange partner at all (nothing in model.cochange names it) must NEVER get
// "(complete)" — the honest answer names the threshold that was actually applied (1/3 for a single changed file).
test('a genuinely partnerless file gets the named-threshold negative, never "(complete)"', () => {
  const model = { cochange: [], pathsAll: ['src/solo.ts'], filesAll: ['src/solo.ts'] };
  const lines = completenessDirectional(model, ['src/solo.ts']);
  assert.equal(lines.length, 1, JSON.stringify(lines));
  assert.match(lines[0], /^no partner above 33% co-change confidence$/, `expected the named-threshold negative: ${JSON.stringify(lines)}`);
  assert.ok(!/\(complete/i.test(lines[0]), `must never certify completeness: ${JSON.stringify(lines)}`);
});

// a multi-file changed set keeps the stricter CFG.cochangeMinConf (0.75) — more files already means more
// corroborating evidence, so the sparse-history 1/3 floor does not apply there. A pair whose best direction is
// 0.5 (below 0.75) must stay silent for a 2-file changed set, confirming the loosened floor is single-file-only.
test('a multi-file changed set is NOT loosened to 1/3 — a 0.5-confidence pair stays below the (unchanged) 0.75 floor', () => {
  const model = {
    cochange: [{ a: 'src/x.ts', b: 'src/y.ts', sup: 4, commitsA: 8, commitsB: 20, conf: 0.5 }],
    pathsAll: ['src/x.ts', 'src/y.ts', 'src/z.ts'],
    filesAll: ['src/x.ts', 'src/y.ts', 'src/z.ts'],
  };
  const hits = cochangeData(model, ['src/x.ts', 'src/z.ts']); // two files changed, x.ts's partner y.ts not among them
  assert.equal(hits.length, 0, `0.5 must not clear the multi-file 0.75 floor: ${JSON.stringify(hits)}`);
  const lines = completenessDirectional(model, ['src/x.ts', 'src/z.ts']);
  assert.match(lines[0], /^no partner above 75% co-change confidence$/, JSON.stringify(lines));
});
