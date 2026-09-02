// Regression test for a weak `where`-match calibration bug: a coincidental lexical collision could clear BOTH existing
// weak-match signals (score >= 0.34, and more than one query word "contributing" some weight) while being no real
// answer at all. Confirmed on a real production C# codebase: `grain where "upstream facade error map"` returned a
// `[Theory]` xUnit-attribute marker as the top hit at "match 75%" — that marker has no relationship to the query;
// two of its many, otherwise-unrelated carrier files each happened to contain one of the query's rarer words
// ("error", "map"), which was enough lexical mass to clear both existing thresholds even though "upstream" and
// "facade" — the words that actually name the intent — went completely untouched, and nothing else near the top of
// the ranking agreed on where that hit even lives.
//
// Fixed in `whereCmd` (core.mjs) by generalizing the single "exactly one contributing word" cliff into two structural
// signals, evaluated together: (1) mass concentration — how much of the top hit's matched weight sits in its single
// heaviest word (ratio 1 subsumes the old "exactly one word" case); (2) cross-hit agreement — whether the runner-up
// hits (already computed, top-sliced) point at the same area of the repo as the top hit, using each card's own
// `topDirs`. A concentrated hit with a coverage gap AND zero agreement among its runner-ups is suppressed outright
// (same compact-map path as a genuine zero-hit, honestly worded); a concentrated hit that still has some corroboration
// keeps the older, softer caveat.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { whereCmd } from '../engine/core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');

// A minimal synthetic model reproducing the field failure's SHAPE, built by hand (no git/parsing needed — `whereCmd`
// only ever consumes `buildCards(model)`'s output, and a marker card needs nothing but `part.markers`).
// The marker `[Theory]`-style attribute has exactly two carriers, in a directory ("tests/data") that shares nothing
// with either of the two other cards in the model. Its two carrier files each coincidentally contain one of the
// query's rarer words in their own name ("MapEdgeCase.ts", "ErrorEdgeCase.ts") — the same mechanism the field report
// describes: two independently-unrelated carriers, each contributing a different word, inflate `contributing.length`
// past 1 without the hit meaning anything. The other two cards ("src/upstream/Thing.ts", "src/other/Facade.ts") each
// pick up exactly one of the query's other two words ("upstream", "facade") — modeling a repo where the words that
// actually name the intent exist, elsewhere, disagreeing with the marker on where the answer lives.
function coincidentalCollisionModel() {
  const markers = { 'deco:Theory': [
    'tests/data/MapEdgeCase.ts#method#RunMap',
    'tests/data/ErrorEdgeCase.ts#method#RunError',
  ] };
  const part = {
    name: '_root', medoids: [], assignments: {}, facts: [], markers,
    files: ['src/upstream/Thing.ts', 'src/other/Facade.ts'],
  };
  return { partitions: [part], steers: [] };
}

test('a coincidental multi-word lexical collision that clears both OLD signals is suppressed, not ranked', () => {
  const model = coincidentalCollisionModel();
  const query = 'upstream facade error map';

  const res = whereCmd({ model, query, top: 3 });

  // document the failure shape first: the OLD signals, recomputed from the same scored cards, both miss it —
  // score clears the 0.34 weak-match floor, and more than one query word contributes weight to the top hit.
  const marker = res.cards.find(c => c.type === 'marker');
  assert.ok(marker.score >= 0.34, `expected the coincidental hit to clear the old weak-match floor, got ${marker.score}`);
  const qt = new Set(['upstream', 'facad', 'error', 'map']); // normTok'd query words
  const contributing = [...qt].filter(t => (marker.toks.get(t) || 0) > 0);
  assert.equal(contributing.length, 2, `expected the OLD single-contributing-word check to also miss it: ${JSON.stringify(contributing)}`);
  const text = res.lines.join('\n');
  assert.equal(res.hits.length, 0, `the untrustworthy hit must not be ranked: ${text}`);
  assert.doesNotMatch(text, /weak match:/, 'the old flat-score banner is not what should have caught this');
  assert.doesNotMatch(text, /→ marker @Theory/, 'the coincidental marker must not be printed as an answer');
  assert.match(text, /no confident match for "upstream facade error map"/);
  assert.match(text, /its words are covered by unrelated, disagreeing parts of the repo/);
  assert.match(text, /\[marker\] @Theory \(2\) → tests\/data\//, 'falls back to the same compact-map path as a genuine zero-hit');
});

let tmp, repo;
before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-weak-')); repo = join(tmp, 'fixture'); execFileSync('node', [BUILDER, repo], { stdio: 'pipe' }); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return (r.stdout || '').replace(/\n$/, ''); };

test('a pinned-identifier exact hit is unaffected: still 100%, no caveat, no suppression', () => {
  const out = grain(['where', 'CreateDisputeHandler']);
  assert.match(out, /«CreateDisputeHandler» → file src\/handlers\/dispute\.handler\.ts .*match 100%/);
  assert.doesNotMatch(out, /weak match:|note: the top hit|no confident match|no lexical match/);
});

test('a genuinely well-matched multi-signal query (full word coverage, agreeing runner-ups) is unaffected', () => {
  // "handler create dispute" (3 words) lands on the real dispute handler file, covering all three words, with
  // the runner-up groups agreeing on the same directory (src/handlers/) — the shape check (2) must NOT flag.
  //
  // §012/G2: this hit used to print `match 100%`. It no longer does, and should not: `handler` and `dispute` are
  // the file's own name (full weight, unchanged), but `create` names only 2 of its 4 scopes, and a scope-name
  // token is now worth the share of the file it names rather than a flat 1. The file still LEADS, ahead of both
  // agreeing groups — which is what this test is about — it simply no longer claims a perfect match to a word
  // that describes half of it. Asserting the leading position rather than a literal percentage keeps the test
  // pinned to the property it exists for.
  const out = grain(['where', 'handler', 'create', 'dispute']);
  const firstHit = out.split('\n').find(l => l.startsWith('map: '));
  assert.match(firstHit, /«handler create dispute» → file src\/handlers\/dispute\.handler\.ts .*match 8\d%/);
  assert.doesNotMatch(out, /weak match:|note: the top hit|no confident match|no lexical match/);
  assert.match(out, /→ group .* — \d+ members \(package src\/handlers, match \d+%\)/, 'runner-up groups agree on src/handlers/');
});
