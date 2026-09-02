// §070 (research/where-lever) — on the leak-free stratum, 36% of the files `where` should have named score EXACTLY
// zero on `where`'s own lexical scale (`.system/research/where-ranking-design.md` §1/§2.1). Ground truth is not
// available at query time, so `whereCmd` cannot detect "the right file scored zero" directly — but it CAN detect
// the reachable half of the same shape: a query whose surviving words carry no content-lexical weight at all (they
// are instruction fillers `QSTOP` already strips, e.g. an identifier like `isNew` — both "is" and "new" are on the
// list) still gets a "confident"-looking top hit purely because the identifier text pins a member NAME
// (`c.exact`/`qraw`, computed from the RAW query before QSTOP filtering) — with zero corroborating overlap in the
// card's own content tokens (`c.toks`, built from the identical `tokenize()`/`normTok()` pipeline). Before this
// fix, `whereCmd` printed that pinned hit at "match 100%" with no caveat at all: neither `weak match` (score is far
// above the 0.34 floor) nor `note:`/`no confident match` (those only ever look at `hits[0].toks`, never compare it
// against the query's OWN word set) had anything to say about it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whereCmd } from '../engine/core.mjs';

// One file card, one member (`isNew`) — deliberately the ONLY thing in the model, so the sole hit's own lexical
// grounding (or lack of it) is unambiguous. No directory or group cards are reachable from this `part` shape
// (empty `assignments`/`facts`), so `hits` cannot contain anything the identifier pin did not put there itself.
function noContentFootholdModel() {
  const part = {
    name: '_root',
    medoids: [],
    assignments: {},
    facts: [],
    markers: {},
    files: ['src/pet/Pet.ts'],
    fileScopes: { 'src/pet/Pet.ts': [['method', 'isNew', 10]] },
  };
  return { partitions: [part], steers: [] };
}

test('an identifier pin whose every word is an instruction filler discloses "no card matches these words" instead of a bare 100% match', () => {
  const model = noContentFootholdModel();
  const res = whereCmd({ model, query: 'isNew', top: 3 });

  // document the shape first: the pin really does win outright (both QSTOP words of the query, `is`+`new`, are
  // pinned by `isNew` alone), so neither pre-existing caveat's own condition is met.
  assert.equal(res.hits.length, 1);
  assert.equal(res.hits[0].score, 1, 'the exact-name pin still wins outright — this is a disclosure, not a scoring change');
  assert.equal(res.hits[0].lex0, 0, 'the card carries zero content-token overlap with the query — the pin is the only reason it is ranked at all');

  const text = res.lines.join('\n');
  assert.doesNotMatch(text, /weak match:/, 'the flat-score banner cannot catch this — the pinned score is 100%, not weak');
  assert.match(text, /no card matches these words — the ranking below is by an exact identifier\/name match, not text overlap/);
  assert.match(text, /→ file src\/pet\/Pet\.ts/, 'the ranked list still prints below the disclosure — this is disclosure-only, not suppression');
});

test('the same identifier pin WITH genuine content overlap elsewhere in the card is unaffected (no new caveat)', () => {
  const part = {
    name: '_root',
    medoids: [],
    assignments: {},
    facts: [],
    markers: {},
    files: ['src/pet/Pet.ts'],
    // a second member whose name shares no QSTOP-filtered word with the query, so the card's `toks` carries real
    // content the query's own surviving word never touches — control for the fix firing on every exact pin
    fileScopes: {
      'src/pet/Pet.ts': [
        ['method', 'isNew', 10],
        ['method', 'validateBirthDate', 20],
      ],
    },
  };
  const model = { partitions: [part], steers: [] };
  const res = whereCmd({ model, query: 'validateBirthDate', top: 3 });
  assert.equal(res.hits.length, 1);
  assert.ok(res.hits[0].lex0 > 0, 'this query\'s words ARE the card\'s own content, not just an instruction filler pinned by name');
  const text = res.lines.join('\n');
  assert.doesNotMatch(text, /no card matches these words|weak match:|note: the top hit|no confident match/);
});
