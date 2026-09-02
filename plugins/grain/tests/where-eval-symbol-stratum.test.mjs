// §071 — `selftest --where`'s pooled/named/unnamed strata build every query from `fp.toks`, which is the commit
// message run through `tokenize`+`normTok`: `sendStatus` becomes `send`+`status`, two separate words, forever.
// `whereCmd`'s own exact-name pin (`qraw`/`c.exact`, core.mjs ~6877) can only ever fire off a query's own WHOLE,
// unsplit word — so no query built purely from `toks` can ever exercise it. That is a hole in the HARNESS, not in
// `where`: typed by a human, `where sendStatus` pins correctly. This file proves, on one hand-built model, that
// (1) the pooled `where` arm genuinely misses a candidate whose message names a symbol verbatim — the split words
// alone are not enough to rank the right file inside the harness's own top@3 window — and (2) the additive
// `symbol` stratum this ticket adds, which keeps that word whole ALONGSIDE the split form, finds it. Low-level
// (`whereEval` called directly with a hand-built model/history), the same pattern `where-eval.test.mjs`'s own
// §068 tests use — no git or CLI needed, since only the scoring is under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whereEval } from '../engine/core.mjs';

// a file-card model built from `fileScopes` the way `buildCards` (core.mjs) reads it directly, bypassing `learn()`
// entirely — every file below is a single-member file card, `names` carries that member's name lowercased.
function fileScopePart(files) {
  const assignments = {};
  const fileScopes = {};
  for (const [rel, members] of Object.entries(files)) {
    fileScopes[rel] = members;
    for (const [kind, name, line] of members) assignments[`${rel}#${kind}#${name}#${line}`] = -1;
  }
  return { name: '_root', medoids: [], assignments, facts: [], files: Object.keys(files), fileScopes, markers: {} };
}

// `src/response.ts` (declares `sendStatus`) is the truth file. Five decoys are shaped so that, on the QUERY BUILT
// FROM THE SPLIT WORDS ALONE ("send status timeout"), plain lexical/idf overlap ranks four of them ahead of
// `response.ts` — none of the six file cards can win via the exact-name pin on that query, since none of its
// three words is, by itself, an identifier shape `qraw` would ever pin (`tokenize('send').length` is 1, not the
// ≥2 `qraw` requires). Only appending the untouched word `sendStatus` changes that, and only for `response.ts`.
const filesDef = {
  'src/response.ts': [['function', 'sendStatus', 3]],
  'src/decoyA.ts': [['function', 'sendTimeout', 3]],
  'src/decoyB.ts': [['function', 'statusTimeout', 3]],
  'src/decoyC.ts': [['function', 'sendTimeoutLog', 3]],
  'src/decoyD.ts': [['function', 'sendStatusAlt', 3]],
  'src/decoyE.ts': [['function', 'sendStatusOld', 3]],
};
const model = { partitions: [fileScopePart(filesDef)], steers: [], filesAll: Object.keys(filesDef) };

// one candidate: a commit whose message ("fix sendStatus timeout") both split (`toks`) and preserved-verbatim
// (`symToks`) forms are hand-supplied, exactly the shape `history.mjs`'s §071 addition now derives from `c.msg`.
const H = {
  fps: [{ ts: 1, toks: ['send', 'status', 'timeout'], symToks: ['sendStatus'], files: ['src/response.ts'], renames: [] }],
  lc: [['src/response.ts#x', { first: 1, newFile: true }]],
};

test('the pooled `where` arm misses a candidate whose message names its file only via a split identifier', () => {
  const res = whereEval({ model, H, last: 1 });
  assert.equal(res.n, 1);
  assert.equal(res.where.hit3, 0, 'the split-only query ("send status timeout") must not rank response.ts inside top@3');
});

test('the additive `symbol` stratum catches the same candidate once the verbatim identifier is kept whole', () => {
  const res = whereEval({ model, H, last: 1 });
  assert.equal(res.symbol.n, 1, 'the one candidate carries a verbatim identifier-shaped word (symToks), so it enters the stratum');
  assert.equal(res.symbol.where.hit3, 1, 'appending the unsplit word "sendStatus" lets the exact-name pin rank response.ts first');
});

test('a candidate with no identifier-shaped word in its message contributes nothing to the symbol stratum', () => {
  const H2 = {
    fps: [{ ts: 1, toks: ['send', 'status', 'timeout'], symToks: [], files: ['src/response.ts'], renames: [] }],
    lc: H.lc,
  };
  const res = whereEval({ model, H: H2, last: 1 });
  assert.equal(res.n, 1, 'the pooled/named/unnamed strata are unaffected by the absence of symToks');
  assert.equal(res.symbol.n, 0, 'no verbatim identifier in the message ⇒ excluded from the symbol stratum, not scored as a miss');
  assert.equal(res.symbol.where.hit3, 0, 'an empty stratum reports 0, never NaN or a crash');
});

test('the symbol stratum is purely additive: it changes no field the pooled/unnamed arms already reported', () => {
  const withSym = whereEval({ model, H, last: 1 });
  const H2 = { fps: [{ ...H.fps[0], symToks: [] }], lc: H.lc }; // same candidate, verbatim word withheld
  const withoutSym = whereEval({ model, H: H2, last: 1 });
  for (const arm of ['where', 'base']) {
    for (const k of ['hit3', 'mrr', 'place3', 'placeWidth']) {
      assert.equal(withSym[arm][k], withoutSym[arm][k], `${arm}.${k} must not depend on symToks`);
    }
  }
  assert.deepEqual(withSym.unnamed, withoutSym.unnamed, 'the unnamed stratum must not depend on symToks either');
  assert.equal(withSym.n, withoutSym.n);
  assert.equal(withSym.silent, withoutSym.silent);
});
