// Regression test for G17: a Kotlin `//` line comment terminated by a LONE carriage return (0x0D,
// not part of a CRLF pair — no following 0x0A) silently swallows the top-level declarations that
// follow it. Confirmed field repro (okhttp): a file with a comment ending in a bare CR reported
// `scopes: 1` instead of 4 — the class immediately after the malformed comment vanished from the
// mined model with no error, no warning, nothing in the output to suggest anything was lost.
//
// Mechanism: the vendored tree-sitter-kotlin grammar doesn't treat a bare 0x0D as a line-comment
// terminator (a grammar limitation, not a bug in this codebase). Fixed by normalizing every lone CR
// to LF (`normalizeCR`, core.mjs) at every place raw source text is read into a string just before
// being handed to a tree-sitter parser (extractTree, checkFile, parseBlobs) — the replacement
// preserves byte length and line count exactly, so line/endLine/startIndex stay consistent with the
// file's real content, and CRLF pairs (negative lookahead) and LF-only files are untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFile } from '../engine/core.mjs';

const vocab = { NT: [], CALL: [], IMP: [], EXT: [], SHAPE: [], DECO: [], RET: [], PT: [], DNT: null, ENT: null, RNT: null, PNT: null, LEX: {} };
const model = { pkgs: ['.'], partitions: [{ name: '_root', vocab, medoids: [], assignments: {}, facts: [] }] };
const check = src => checkFile({ model, root: process.cwd(), rel: 'X.kt', content: src, exemplarOk: () => true });
const realScopes = r => r.scopes.filter(s => s.kind !== 'file');
const byName = (r, name) => realScopes(r).find(s => s.name === name);

// byte-for-byte: a `//` comment ending in a lone `\r` (no `\n` after it), immediately followed by
// two real Kotlin class declarations (each with one method) on subsequent lines.
const LONE_CR = '// a comment\rclass Foo {\n    fun a() {}\n}\nclass Bar {\n    fun b() {}\n}\n';
const LF = '// a comment\nclass Foo {\n    fun a() {}\n}\nclass Bar {\n    fun b() {}\n}\n';
const CRLF = LF.replace(/\n/g, '\r\n');

test('Kotlin: a `//` comment ended by a lone CR (no LF) does not swallow the declarations that follow', async () => {
  const r = await check(LONE_CR);
  const real = realScopes(r);
  assert.equal(real.length, 4, `expected 4 real scopes (Foo, Foo.a, Bar, Bar.b), got ${JSON.stringify(real.map(s => [s.kind, s.name, s.line]))}`);
  const foo = byName(r, 'Foo'), bar = byName(r, 'Bar'), a = byName(r, 'a'), b = byName(r, 'b');
  assert.ok(foo && bar && a && b, `expected Foo, Bar, a, and b all present: ${JSON.stringify(real.map(s => [s.kind, s.name, s.line]))}`);
  assert.equal(foo.line, 2); assert.equal(a.line, 3); assert.equal(bar.line, 5); assert.equal(b.line, 6);
});

test('regression control: an LF-terminated comment produces identical scope count/names to the normalized lone-CR file', async () => {
  const rLoneCr = await check(LONE_CR), rLf = await check(LF);
  const shape = r => realScopes(r).map(s => [s.kind, s.name, s.line]);
  assert.deepEqual(shape(rLoneCr), shape(rLf), `normalizing the lone CR must yield the exact same scopes as the already-well-formed LF file: ${JSON.stringify(shape(rLoneCr))} vs ${JSON.stringify(shape(rLf))}`);
});

test('regression control: a CRLF-throughout file is completely unaffected — identical to the LF-only version', async () => {
  const rCrlf = await check(CRLF), rLf = await check(LF);
  const shape = r => realScopes(r).map(s => [s.kind, s.name, s.line]);
  assert.deepEqual(shape(rCrlf), shape(rLf), `CRLF line endings must be left untouched by normalizeCR: ${JSON.stringify(shape(rCrlf))} vs ${JSON.stringify(shape(rLf))}`);
});
