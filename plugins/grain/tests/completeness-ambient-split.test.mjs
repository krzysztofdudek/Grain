// Ticket 074 — `completeness` must label ambient co-change partners separately from specific ones. Follows
// ticket 063 (max-directional-confidence ranking, unchanged here) and reuses ticket 073's exact machinery: a
// candidate's OWN global rate (commitsX / nonMegaCommits) is tested against the same λ=8 display bound
// `certifyObligationRules`' ambient gate already applies (`clearsOwnRate`, core.mjs) — no new constant.
//
// `.system/research/obligations-design.md` §2: pooled over 20 repos, raw co-change (0.285 recall@3) loses to the
// null "3 hottest recently-changed files" (0.336) — entirely because co-change's value lives in the NON-obvious
// half (0.198 there vs the null's 0.000). The product fix: split the partner list into "specific to this file"
// and "ambient (this repo touches these with almost everything)", and never merge them into one ranked list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cochangeData, completenessDirectional } from '../engine/core.mjs';

// one shared model: `src/foo.ts` is the queried file.
//   - `src/foo.spec.ts`: touched only alongside foo.ts (12 of its own 12 commits) — SPECIFIC: its own global rate
//     (12 of 53 non-mega commits) is nowhere near the λ bound, so the pairing itself is the only evidence.
//   - `src/foo.helper.ts`: also specific, but a weaker partner (8 of its own 10 commits) — used to confirm the
//     max-directional-confidence ranking within the specific set survives the ambient split untouched.
//   - `CHANGES`: touched in literally every one of the 53 non-mega commits in this history (a changelog-shaped
//     file) — AMBIENT: its own global rate (53 of 53) already clears the λ bound with no help from foo.ts at all.
const model = () => ({
  cochange: [
    { a: 'src/foo.ts', b: 'src/foo.spec.ts', sup: 12, commitsA: 13, commitsB: 12, conf: 1 },
    { a: 'src/foo.ts', b: 'src/foo.helper.ts', sup: 8, commitsA: 13, commitsB: 10, conf: 0.8 },
    { a: 'src/foo.ts', b: 'CHANGES', sup: 13, commitsA: 13, commitsB: 53, conf: 1 },
  ],
  nonMegaCommits: 53,
  pathsAll: ['src/foo.ts', 'src/foo.spec.ts', 'src/foo.helper.ts', 'CHANGES'],
  filesAll: ['src/foo.ts', 'src/foo.spec.ts', 'src/foo.helper.ts', 'CHANGES'],
});

test('a genuinely specific partner (low own base rate) is tagged ambient: false, with no k/n global-rate fields', () => {
  const hits = cochangeData(model(), ['src/foo.ts']);
  const spec = hits.find(h => h.file === 'src/foo.spec.ts');
  assert.ok(spec, `expected src/foo.spec.ts among the hits: ${JSON.stringify(hits)}`);
  assert.equal(spec.ambient, false);
  assert.equal(spec.k, undefined, 'a specific hit carries no global-rate fields');
});

test('a partner touched in nearly every commit (own base rate clears the λ bound by itself) is tagged ambient: true, with its OWN global rate as k/n', () => {
  const hits = cochangeData(model(), ['src/foo.ts']);
  const amb = hits.find(h => h.file === 'CHANGES');
  assert.ok(amb, `expected CHANGES among the hits: ${JSON.stringify(hits)}`);
  assert.equal(amb.ambient, true);
  assert.equal(amb.k, 53, 'k must be the partner\'s OWN global commit count, never the co-change sup');
  assert.equal(amb.n, 53, 'n must be model.nonMegaCommits, the same population commitsA/commitsB were drawn from');
});

test('`completeness <file>`: the ambient partner is listed under its own labelled section, never inside the specific list', () => {
  const lines = completenessDirectional(model(), ['src/foo.ts']);
  const specificIdx = lines.findIndex(l => l === '[grain] Edits like this historically also touch:');
  const ambientIdx = lines.findIndex(l => /^ambient \(this repo touches these with almost everything\):$/.test(l));
  assert.ok(specificIdx >= 0, `expected the specific-partners header: ${JSON.stringify(lines)}`);
  assert.ok(ambientIdx > specificIdx, `expected the ambient section after the specific header: ${JSON.stringify(lines)}`);

  const specificBlock = lines.slice(specificIdx + 1, ambientIdx);
  assert.ok(!specificBlock.some(l => l.includes('CHANGES')), `CHANGES must never appear in the specific block: ${JSON.stringify(specificBlock)}`);
  assert.match(lines[ambientIdx + 1], /^\s+CHANGES\s+53 of 53 commits$/, `expected CHANGES at its own global rate: ${lines[ambientIdx + 1]}`);
  // never merged into one ranked list: the ambient row must not carry the specific block's "(co-changed in x/y
  // commits)" phrasing at all — it is a structurally different statistic (own rate, not pairing evidence).
  assert.ok(!lines[ambientIdx + 1].includes('co-changed'), `ambient row must use its own wording, not the specific list's: ${lines[ambientIdx + 1]}`);
});

test('ticket 063\'s max-directional-confidence ranking within the specific set is preserved unchanged by the ambient split', () => {
  const lines = completenessDirectional(model(), ['src/foo.ts']);
  const specificIdx = lines.findIndex(l => l === '[grain] Edits like this historically also touch:');
  const ambientIdx = lines.findIndex(l => /^ambient /.test(l));
  const specificBlock = lines.slice(specificIdx + 1, ambientIdx);
  assert.equal(specificBlock.length, 2, `expected exactly the two specific partners: ${JSON.stringify(specificBlock)}`);
  // foo.spec.ts (confidence 12/12 = 1.0) must outrank foo.helper.ts (confidence 8/10 = 0.8) — unchanged from 063
  assert.match(specificBlock[0], /foo\.spec\.ts/, `expected the stronger partner first: ${JSON.stringify(specificBlock)}`);
  assert.match(specificBlock[1], /foo\.helper\.ts/, `expected the weaker partner second: ${JSON.stringify(specificBlock)}`);
});

test('a query with only an ambient partner still prints the named-threshold specific negative, then the ambient section — never merged, never silent', () => {
  const onlyAmbient = () => ({
    cochange: [{ a: 'src/foo.ts', b: 'CHANGES', sup: 13, commitsA: 13, commitsB: 53, conf: 1 }],
    nonMegaCommits: 53,
    pathsAll: ['src/foo.ts', 'CHANGES'],
    filesAll: ['src/foo.ts', 'CHANGES'],
  });
  const lines = completenessDirectional(onlyAmbient(), ['src/foo.ts']);
  assert.match(lines[0], /^no partner above 33% co-change confidence$/, `expected the honest specific-side negative first: ${JSON.stringify(lines)}`);
  assert.match(lines[1], /^ambient \(this repo touches these with almost everything\):$/, JSON.stringify(lines));
  assert.match(lines[2], /^\s+CHANGES\s+53 of 53 commits$/, JSON.stringify(lines));
});

test('with no nonMegaCommits on the model (degraded/no-history population), nothing is ever classified ambient', () => {
  const noHistoryPop = () => ({
    cochange: [{ a: 'src/foo.ts', b: 'CHANGES', sup: 13, commitsA: 13, commitsB: 53, conf: 1 }],
    pathsAll: ['src/foo.ts', 'CHANGES'],
    filesAll: ['src/foo.ts', 'CHANGES'],
  });
  const hits = cochangeData(noHistoryPop(), ['src/foo.ts']);
  assert.equal(hits[0].ambient, false, 'no population to test the own-rate against — must default to specific, never ambient');
});
