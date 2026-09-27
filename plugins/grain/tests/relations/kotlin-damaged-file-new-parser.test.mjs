// The Runes seam for Kotlin parse recovery. A Kotlin file with a syntax error is read by re-parsing spans of it, and
// the Runes extractor takes the parser for that from the caller (ParsedFile.newParser) instead of importing the
// runtime itself. Without it the extractor throws, relFactsFor turns the throw into "no facts", and the damaged file
// silently loses every declaration and every edge. Only a damaged file takes that path, so only a damaged file proves
// the parser is wired: once at the engine's own seam (relFactsFor) and once end to end through `grain export`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile } from '../../engine/parse.mjs';
import { relFactsFor } from '../../engine/relations.mjs';
import { extractorForLanguage } from '../../engine/vendor/runes/dist/relations/index.mjs';
import { edgesOf, expectEdge } from './harness.mjs';

// `val x = ( }` leaves an ERROR in the tree; the import and the declarations around it are intact
const DAMAGED = 'package com.x.a\nimport com.x.b.Bar\nclass Foo {\n  fun f() { val x = ( }\n  val bar: Bar? = null\n}\n';

test('a damaged Kotlin file needs a parser to be read at all: without newParser the Runes extractor throws', async () => {
  const { tree } = await parseFile('.kt', DAMAGED);
  try {
    assert.ok(tree.rootNode.hasError, 'the fixture must carry a syntax error, or it does not reach recovery');
    assert.throws(() => extractorForLanguage('kotlin').uses({ path: 'src/a/Foo.kt', content: DAMAGED, tree, language: 'kotlin' }), /newParser/);
  } finally {
    tree.delete();
  }
});

test('relFactsFor hands the extractor Grain\'s parser: a damaged Kotlin file keeps its declarations and its import', async () => {
  const { p, tree } = await parseFile('.kt', DAMAGED);
  try {
    const facts = relFactsFor('src/a/Foo.kt', DAMAGED, tree, p._g);
    assert.ok(facts, 'no relation facts: the extractor threw, so newParser is not wired');
    assert.ok(facts.d.some(d => d.symbolKey === 'com.x.a.Foo'), JSON.stringify(facts.d));
    assert.ok(facts.u.some(u => u.kind === 'import' && u.candidates.some(c => c.symbolKey === 'com.x.b.Bar')), JSON.stringify(facts.u));
  } finally {
    tree.delete();
  }
});

test('grain export binds the import of a damaged Kotlin file', () => {
  const { edges, cleanup } = edgesOf({ 'src/a/Foo.kt': DAMAGED, 'src/b/Bar.kt': 'package com.x.b\nclass Bar\n' });
  try {
    expectEdge(edges, 'src/a/Foo.kt', 'src/b/Bar.kt', 'import');
  } finally {
    cleanup();
  }
});
