// §050 — a bodiless Scala `object` (and a bodiless companion `object` extending its class) must classify as
// kind `type`, exactly like a real `class`. Root cause: `TYPE_LIKE_RE` (core.mjs) carried Kotlin's node-type
// name `object_declaration` but not Scala's `object_definition` — a Scala `object` reached kind `type` only
// through `extractScopes`'s `hasChildScope` fallback (a nested scope-bearing declaration inside its body), so a
// companion object holding only vals/constants — no nested class/def — had no child scope and no matching
// TYPE_LIKE_RE entry, and fell through to the FUNC_LIKE default of `method`.
//
// The fix (core.mjs, TYPE_LIKE_RE) widens the literal `object_declaration` entry to the bare word `object` —
// TYPE_LIKE_RE is only ever tested against a node already gated through `isScope` (a real b.scope member), so
// the widening cannot pick up a JS/TS object LITERAL or a Java/C# `object_creation_expression` (neither is a
// b.scope member at all). See tests/type-like-coverage.test.mjs for the all-23-grammar regression net this
// widening is verified against.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

async function scopesOf(src) {
  const p = await getParser('.scala');
  const b = bindingFor(p._g);
  const tree = p.parse(src);
  const out = extractScopes('X.scala', tree, b, p._g);
  tree.delete();
  return out;
}
const byName = (ss, name, nt) => ss.find(s => s.name === name && (!nt || s.nt === nt));

test('§050: a bodiless `object` holding no braces at all classifies as type, same as a real class', async () => {
  const ss = await scopesOf('class ExecCtxUtils\n\nobject ExecCtxUtils extends ExecCtxUtils\n');
  const cls = byName(ss, 'ExecCtxUtils', 'class_definition');
  const obj = byName(ss, 'ExecCtxUtils', 'object_definition');
  assert.ok(cls, 'sanity: the class declaration must be extracted');
  assert.ok(obj, 'sanity: the companion object declaration must be extracted');
  assert.equal(cls.kind, 'type');
  assert.equal(obj.kind, 'type', 'a bodiless companion object extending its class must classify as type, not method');
});

test('§050: an `object` with a body holding only vals (no nested scope for the hasChildScope fallback) still classifies as type', async () => {
  const ss = await scopesOf('object DummyPlaceHolder {\n  val x = 1\n  val y = "constant"\n}\n');
  const obj = byName(ss, 'DummyPlaceHolder', 'object_definition');
  assert.ok(obj, 'sanity: the object declaration must be extracted');
  assert.ok(!obj.noBody, 'sanity: this object has a real brace body');
  assert.equal(obj.kind, 'type', 'a vals-only object must classify as type even though it has no child scope to fall back on');
});

test('§050: a real Scala class with only vals (control) was already type — unaffected by this fix', async () => {
  const ss = await scopesOf('class DummyPlaceHolder {\n  val x = 1\n}\n');
  const cls = byName(ss, 'DummyPlaceHolder', 'class_definition');
  assert.equal(cls.kind, 'type');
});
