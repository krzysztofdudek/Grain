// §012 / question-catalog recommendation 2 — `where`'s ranking on the NAMED stratum (the query contains a word
// from the answer file's own name), measured by `selftest --where` as its worst: hit@3 0.443 against a naive
// path-match baseline's 0.881 over 11 repositories.
//
// The defect was a weighing one. `buildCards` folds a file's own name, its path, its doc comments, its
// supertypes AND the names of every scope it declares into one flat token bag (`addTok` keeps a max, so every
// one of them is worth 1). A 169-scope test file therefore has a vocabulary wide enough to cover an entire
// four-word query by accident and score 100%, while the three-scope file the query actually named covers half
// of it and scores 47%. Measured on express: `added res json test` answered `test/app.router.js`, then
// `test/res.send.js` — with `test/res.json.js` fifth.
//
// The fix separates the two channels (`baseToks` — what the file IS; `memberTok` — how many of its scopes carry
// each word) and weighs a scope-name token by the SHARE of the file it names. No constant: the divisor is the
// card's own `n`. A second, independent change removes a constant — a directory whose name matches a minority
// of the query is now worth exactly the coverage it earned, not a flat +0.25.
//
// The model here is hand-built (the idiom weak-match-signals.test.mjs and where-eval.test.mjs's §068 cases use):
// `whereCmd` consumes nothing but `buildCards(model)`'s output, so no git repository, no CLI and no indexing run
// is needed to pin the scoring maths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whereCmd, buildCards } from '../engine/core.mjs';

// one partition holding real file cards: `files` + `fileScopes` is exactly what buildCards' file-card branch
// reads. `assignments` is left empty so no directory or group card is built unless a test asks for one — every
// assertion below is about file-vs-file competition and must not be decided by a third card drifting in.
function fileModel(fileScopes, extra = {}) {
  const part = {
    name: '_root',
    medoids: [],
    assignments: extra.assignments || {},
    facts: [],
    markers: {},
    files: Object.keys(fileScopes),
    fileScopes,
  };
  return { partitions: [part], steers: [], filesAll: Object.keys(fileScopes) };
}
const rank = (model, query) =>
  whereCmd({ model, query, top: 10, mapRows: 0 }).hits.map(h => h.label);
const scoreOf = (model, query, label) => {
  const { cards } = whereCmd({ model, query, top: 10, mapRows: 0 });
  return cards.find(c => c.label === label).score;
};

// A small file whose NAME is the answer, against a large test file that merely mentions the word among its test
// descriptions — the `res.send.js` vs `response.js` shape from the catalog, reduced to its mechanism.
const RES_SEND = Array.from({ length: 60 }, (_, i) =>
  i < 3
    ? ['case', `should send json body ${i}`, 10 + i]
    : ['case', `should send chunk ${i}`, 10 + i]
);
const RESPONSE = [
  ['method', 'json', 10],
  ['method', 'send', 20],
  ['method', 'status', 30],
  ['method', 'vary', 40],
  ['method', 'links', 50],
];

test('§012: the small file the query NAMES outranks the large test file that merely mentions the word', () => {
  const model = fileModel({ 'lib/response.js': RESPONSE, 'test/res.send.js': RES_SEND });
  const order = rank(model, 'json');
  assert.equal(
    order[0],
    'lib/response.js',
    'the 5-scope file declaring `json` must lead the 60-scope test file that mentions json in 3 of its descriptions'
  );
  // the mechanism, pinned so a future re-weighting cannot pass this test by accident: the two cards must not be
  // TIED. Before the fix both carried `json` at a flat 1, tied at score 1.0, and the sort's `b.n - a.n`
  // tiebreak handed the win to whichever card held MORE scopes — the large test file, by construction.
  const small = scoreOf(model, 'json', 'lib/response.js');
  const large = scoreOf(model, 'json', 'test/res.send.js');
  assert.ok(
    small > large,
    `the declaring file must score strictly higher, not tie (got ${small} vs ${large})`
  );
  assert.ok(
    Math.abs(small - 1 / 5) < 1e-9 && Math.abs(large - 3 / 60) < 1e-9,
    `each score must be the SHARE of the file its scopes name — 1/5 and 3/60 (got ${small} and ${large})`
  );
});

test('§012: a word carried by more of the file counts for more — the same file, the same word, two densities', () => {
  // identical everything except how much of the file the word names: 3 of 6 versus 3 of 60.
  const dense = Array.from({ length: 6 }, (_, i) =>
    i < 3 ? ['case', `should send json body ${i}`, i] : ['case', `should send chunk ${i}`, i]
  );
  const model = fileModel({ 'test/a.js': dense, 'test/b.js': RES_SEND });
  assert.ok(
    scoreOf(model, 'json', 'test/a.js') > scoreOf(model, 'json', 'test/b.js'),
    'three matching scopes out of six must beat three out of sixty'
  );
});

// The leak-free guard. `where`'s other stratum — the query names no part of the file's path — can only ever be
// answered THROUGH the scope-name channel, so the change above must not blind it. A word that appears in no
// filename and no path, only in one declaration, must still find its file and still rank it first.
test('§012 guard: a file found ONLY through a scope name it declares is still ranked first (leak-free shape)', () => {
  const model = fileModel({ 'lib/response.js': RESPONSE, 'test/res.send.js': RES_SEND });
  const order = rank(model, 'vary');
  assert.equal(
    order[0],
    'lib/response.js',
    '`vary` is in no path and no filename — the member-name channel is the only way to reach this file, and must still work'
  );
});

test('§012 guard: a single-token query still pins the file that declares the symbol', () => {
  // recommendation 2's own worked example (`where sendStatus` → lib/response.js at 100%). The ≥2-token gate that
  // §037's disclosure logic depends on lives in `what`, not here, and is reached by neither channel — but a
  // one-word `where` query is the case most exposed to a per-word re-weighting, so it is pinned explicitly.
  const model = fileModel({ 'lib/response.js': RESPONSE, 'test/res.send.js': RES_SEND });
  assert.equal(rank(model, 'links')[0], 'lib/response.js');
  assert.equal(rank(model, 'status')[0], 'lib/response.js');
});

test('§012 guard: every OTHER consumer of a card sees it unchanged — `toks` still holds scope names at full weight', () => {
  // the two new fields are additive. `toks` is what `what`'s fan-in, the bridge lines and the weak-answer
  // disclosure all read; if this drifts, a change scoped to `where`'s ranking has silently changed other
  // commands' answers.
  const model = fileModel({ 'lib/response.js': RESPONSE, 'test/res.send.js': RES_SEND });
  const card = buildCards(model).find(c => c.label === 'test/res.send.js');
  assert.equal(card.toks.get('json'), 1, 'a scope name is still a full-weight token in the shared bag');
  assert.equal(card.toks.get('send'), 1);
  assert.equal(card.memberTok.get('json'), 3, 'and the new channel counts how many scopes carry it');
  assert.equal(card.n, 60);
  assert.equal(card.baseToks.has('json'), false, 'the file itself is not named json — only its scopes mention it');
  assert.equal(card.baseToks.get('res'), 1, "the file's own basename stays full weight");
});

// The second change: the flat +0.25 for a directory whose name matches part of the query is gone.
test('§012: a directory matching one word of four is worth that quarter, not a flat +0.25 on top of its score', () => {
  const assignments = {};
  for (let i = 0; i < 10; i++) assignments[`src/handlers/h${i}.js#method#run${i}`] = -1;
  const model = fileModel(
    { 'src/handlers/dispatch.js': [['method', 'dispatch', 1]], 'lib/response.js': RESPONSE },
    { assignments }
  );
  const { cards } = whereCmd({ model, query: 'handlers json vary links', top: 10, mapRows: 0 });
  const dir = cards.find(c => c.type === 'directory' && c.label === 'src/handlers/');
  assert.ok(dir, 'the directory card must exist (10 scopes clears the dirContextMinScopes floor)');
  // `handlers` is one of the four query words and is the directory's own name, so its coverage is exactly 1/4.
  // The card also has a nonzero lexical score of its own (that same word sits in its token bag), so under the
  // old rule its score was `raw + 0.25`, strictly greater than 0.25 — pinning the exact quarter is therefore a
  // real regression guard, not a restatement.
  assert.equal(
    dir.score,
    0.25,
    'a directory matching 1 of 4 query words is worth exactly that quarter — not its own score plus a flat 0.25'
  );
});
