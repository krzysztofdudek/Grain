// §085 — `where` returned a confident, specific, WRONG top hit whenever the query was a COMPOUND identifier whose
// only real occurrence is a file grain has no grammar for (`.editorconfig`, `.md`, `.ps1`, `.svg`). `tokenize`
// splits such a name into ordinary words (`indent_style` → `indent`+`style`, `ClangFormat` → `clang`+`format`),
// each of which really does occur in parsed code — so the answer is ranked from FRAGMENTS of a name the model
// never declares, while every existing honest-negative check stands down:
//   · §057's never-parsed disclosure is gated on `!hits.length` (grain.mjs `cmdWhere`) — hits are non-empty here;
//   · §070's zero-foothold banner needs every hit's `lex0 === 0` — the fragments give real content overlap;
//   · `weak match:` needs score < 0.34 — a directory-name pin on one fragment reaches 1.0;
//   · `note: the top hit matches only …` needs `qt.size >= 3` — a one-word identifier query has at most two.
// Measured on 4 real repos (spec-kit, supersplat, opencode, openclaw): of the candidates that reach this ranked
// path, every silent confident-wrong answer whose query is identifier-shaped had this exact shape (61/61), while
// single common words (`users`, `handle`) — which are NOT identifier-shaped and where answering with code is
// correct — are untouched. Fire rate on ordinary queries across the same 4 repos: 1/1850 (0.054%).
//
// The gate adds no tunable constant: `unknownIdent` is `qraw` (whereCmd's own identifier-shaped-word set)
// non-empty AND no card's own `names` declaring any of it — both already computed for the exact-name pin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whereCmd } from '../engine/core.mjs';

// A model whose code genuinely contains BOTH fragments of the queried name, in unrelated places — the measured
// shape (opencode: `ClangFormat` → `packages/opencode/src/format/` at score 1.0, the real text living in a .md).
function fragmentModel() {
  const part = {
    name: '_root',
    medoids: [],
    assignments: {},
    facts: [],
    markers: {},
    files: ['src/format/Printer.ts', 'src/style/Theme.ts'],
    fileScopes: {
      'src/format/Printer.ts': [['method', 'format', 10]],
      'src/style/Theme.ts': [['method', 'style', 12]],
    },
  };
  return { partitions: [part], steers: [] };
}

test('§085: a compound identifier the model never declares is ranked from its FRAGMENTS — and that is exactly when every existing honest-negative check stands down', () => {
  const model = fragmentModel();
  const res = whereCmd({ model, query: 'indent_style', top: 3 });

  // document the failing shape first — this is what made the answer confident, specific and wrong.
  assert.ok(res.hits.length > 0, '§057 cannot fire: hits are NOT empty');
  assert.ok(res.hits[0].lex0 > 0, '§070 cannot fire: the fragments give real content overlap, so lex0 is off zero');
  assert.ok(res.hits[0].score >= 0.34, '`weak match:` cannot fire: the fragment match is not weak');

  // and the model really does not declare the name itself — only its pieces
  assert.equal(res.unknownIdent, true, 'the query is identifier-shaped and no card declares it');

  // with no never-parsed evidence supplied, the answer stays exactly as it was — no new banner invented
  assert.doesNotMatch(res.lines.join('\n'), /is not a name grain parsed anywhere/);
});

test('§085 red→green: given the never-parsed hit, the ranked answer now discloses that the real text lives in a file grain cannot read', () => {
  const model = fragmentModel();
  const res = whereCmd({
    model,
    query: 'indent_style',
    top: 3,
    ungrammaredHit: { file: '.editorconfig', ext: '(no extension)' },
  });
  const text = res.lines.join('\n');
  assert.match(text, /"indent_style" is not a name grain parsed anywhere — the ranking below matches its separate words, not the whole\./);
  assert.match(text, /That exact text appears in \.editorconfig, and grain has no grammar for "\(no extension\)"/);
  // disclosure-only: the ranking is untouched, the list still prints below it
  assert.ok(res.hits.length > 0, 'the ranked list is still returned — this is a disclosure, not a suppression');
  assert.match(text, /src\/(format|style)\//, 'the ranked hits still print below the disclosure');
});

test('§085 control: a name the model DOES declare never asks for the scan, even when its text also sits in an unparsed file', () => {
  const part = {
    name: '_root',
    medoids: [],
    assignments: {},
    facts: [],
    markers: {},
    files: ['src/format/Printer.ts'],
    fileScopes: { 'src/format/Printer.ts': [['method', 'indent_style', 10]] },
  };
  const res = whereCmd({ model: { partitions: [part], steers: [] }, query: 'indent_style', top: 3 });
  assert.equal(res.unknownIdent, false, 'the repo declares this name — grain is not blind to it, so no file is ever opened');
});

test('§085 control: a plain English word is not identifier-shaped, so `where users` never pays for the scan and never disclaims', () => {
  const res = whereCmd({ model: fragmentModel(), query: 'format', top: 3 });
  assert.equal(res.unknownIdent, false, '`format` is one word — answering it from code is correct, not a fabrication');
});

// §057's scan discipline: "every other query, including every one with an exact-name hit, never opens a file at
// all". A multi-word intent must not start a file scan — §057 matches the query VERBATIM, so a sentence can never
// hit, and scanning for it is pure I/O. Measured on spec-kit before this clause was added: `unknownIdent` was true
// for 69 of 187 commit-message queries (36.9%) and found a file in none of them.
test('§085 keeps §057\'s scan discipline: a multi-word intent never asks for the never-parsed scan', () => {
  const model = fragmentModel();
  const res = whereCmd({ model, query: 'add indent_style support to the formatter', top: 3 });
  assert.ok(res.hits.length > 0, 'the sentence still gets a ranked answer');
  assert.equal(res.unknownIdent, false, 'a sentence is not an identifier lookup — no file is opened for it');
});

// The §085 banner runs AFTER the existing ladder, never before it. The ladder's last arm can SUPPRESS an
// uncorroborated top hit outright (`hits = []`, "no confident match") — a stronger honest negative than any
// banner — and an earlier placement silently pre-empted it: measured on opencode, 6 rankings the suppression arm
// had been discarding came back. A suppressed answer must stay suppressed and fall through to §057's own message,
// which names the same never-parsed file anyway.
test('§085 never revives a ranking the ladder suppressed — the stronger honest negative still wins', () => {
  // two runner-ups in unrelated areas, one contributing word out of three → the suppression arm's own shape
  const part = {
    name: '_root',
    medoids: [],
    assignments: {},
    facts: [],
    markers: {},
    files: ['src/alpha/Payment.ts', 'src/beta/Widget.ts', 'src/gamma/Report.ts'],
    fileScopes: {
      'src/alpha/Payment.ts': [['method', 'settle', 3]],
      'src/beta/Widget.ts': [['method', 'render', 4]],
      'src/gamma/Report.ts': [['method', 'settle', 5]],
    },
  };
  const model = { partitions: [part], steers: [] };
  const args = { model, query: 'settle quarterly invoices', top: 3 };
  const before = whereCmd(args);
  const after = whereCmd({ ...args, ungrammaredHit: { file: 'NOTES.md', ext: '.md' } });
  assert.deepEqual(
    after.hits.map(h => h.label),
    before.hits.map(h => h.label),
    'supplying the never-parsed hit must not change which hits survive the ladder'
  );
  if (!before.hits.length)
    assert.doesNotMatch(
      after.lines.join('\n'),
      /is not a name grain parsed anywhere/,
      'a suppressed answer gets §057\'s message, not a banner over a revived ranking'
    );
});

test('§085 does not disturb §070: an identifier pin with zero content foothold still gets the zero-foothold banner', () => {
  const part = {
    name: '_root',
    medoids: [],
    assignments: {},
    facts: [],
    markers: {},
    files: ['src/pet/Pet.ts'],
    fileScopes: { 'src/pet/Pet.ts': [['method', 'isNew', 10]] },
  };
  const res = whereCmd({ model: { partitions: [part], steers: [] }, query: 'isNew', top: 3 });
  assert.equal(res.unknownIdent, false, 'the card declares `isNew`, so §085 stands down and §070 keeps the case');
  assert.match(res.lines.join('\n'), /no card matches these words/);
});
