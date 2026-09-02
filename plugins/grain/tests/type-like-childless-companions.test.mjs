// §076 — the SAME childless-companion bug §050 fixed for Scala's bodiless `object`, recurring in five more node
// types that §050's own tests/type-like-coverage.test.mjs surfaced: Java/Groovy `module_declaration`, Ruby
// `module`, TypeScript `internal_module`/`module`, and Solidity `library_declaration`. Each is a declaration that
// SHOULD classify as kind `type` even when it holds only simple value declarations (vals/constants) and no
// nested class/method — but with no child scope for `extractScopes`'s `hasChildScope` fallback to catch, and no
// TYPE_LIKE_RE entry naming its own node type, each fell through to the FUNC_LIKE default of kind `method`.
//
// The fix (core.mjs, TYPE_LIKE_RE) adds the bare words `module` and `library` — same technique as §050's `object`
// widening, verified the same way: TYPE_LIKE_RE only ever runs on a node already gated through `isScope`
// (b.scope), and a census of every one of the 23 shipped grammars' OWN b.scope sets found `module` matches
// exactly the four genuinely type-like constructs below (seven node types total, TS counting both `tsx` and
// `typescript`) and `library` matches only Solidity's `library_declaration` — see tests/type-like-coverage.test.mjs
// and the core.mjs comment for the full census.
//
// This same §076 fix also removes the pre-existing false positive where Ruby's `singleton_method` (`def
// self.foo`, a plain instance method) matched TYPE_LIKE_RE via the word `singleton` and won the typeLike/FUNC_LIKE
// tie in extractScopes — see tests/ruby-singleton-method-not-a-type.test.mjs for that fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

async function scopesOf(ext, src) {
  const p = await getParser(ext);
  const b = bindingFor(p._g);
  const tree = p.parse(src);
  const out = extractScopes('X' + ext, tree, b, p._g);
  tree.delete();
  return out;
}
const byName = (ss, name, nt) => ss.find(s => s.name === name && (!nt || s.nt === nt));

test('§076 (Java): a module-info declaration with no nested class/method classifies as type, not method', async () => {
  const ss = await scopesOf(
    '.java',
    'module com.example.foo {\n  exports com.example.foo.api;\n  requires java.base;\n}\n'
  );
  const mod = byName(ss, 'com.example.foo', 'module_declaration');
  assert.ok(mod, 'sanity: the module declaration must be extracted');
  assert.equal(mod.kind, 'type', 'a childless Java module declaration must classify as type, not method');
});

test('§076 (Groovy): the same module-info construct classifies as type', async () => {
  const ss = await scopesOf('.groovy', 'module com.example.foo {\n  exports com.example.foo.api\n}\n');
  const mod = byName(ss, 'com.example.foo', 'module_declaration');
  assert.ok(mod, 'sanity: the module declaration must be extracted');
  assert.equal(mod.kind, 'type', 'a childless Groovy module declaration must classify as type, not method');
});

test('§076 (Ruby): a `module` holding only constants (no nested class/def) classifies as type, not method', async () => {
  const ss = await scopesOf('.rb', 'module Config\n  MAX = 10\n  NAME = "grain"\nend\n');
  const mod = byName(ss, 'Config', 'module');
  assert.ok(mod, 'sanity: the module declaration must be extracted');
  assert.equal(mod.kind, 'type', 'a vals-only Ruby module must classify as type, not method');
});

test('§076 (TypeScript): a `namespace Foo { ... }` (internal_module) holding only a const classifies as type', async () => {
  const ss = await scopesOf('.ts', 'namespace Bar {\n  export const Y = 2;\n}\n');
  const mod = byName(ss, 'Bar', 'internal_module');
  assert.ok(mod, 'sanity: the namespace declaration must be extracted');
  assert.equal(mod.kind, 'type', 'a vals-only TS namespace must classify as type, not method');
});

test('§076 (TypeScript): a `module Foo { ... }` holding only a const classifies as type', async () => {
  const ss = await scopesOf('.ts', 'module Foo {\n  export const X = 1;\n}\n');
  const mod = byName(ss, 'Foo', 'module');
  assert.ok(mod, 'sanity: the module declaration must be extracted');
  assert.equal(mod.kind, 'type', 'a vals-only TS module must classify as type, not method');
});

test('§076 (Solidity): a `library` holding only a constant classifies as type, not method', async () => {
  const ss = await scopesOf('.sol', 'library MathLib {\n  uint constant X = 1;\n}\n');
  const lib = byName(ss, 'MathLib', 'library_declaration');
  assert.ok(lib, 'sanity: the library declaration must be extracted');
  assert.equal(lib.kind, 'type', 'a vals-only Solidity library must classify as type, not method');
});

test('§076 control: a Java class with only fields (no module involved) was already type — unaffected by this fix', async () => {
  const ss = await scopesOf('.java', 'class Config {\n  static final int MAX = 10;\n}\n');
  const cls = byName(ss, 'Config', 'class_declaration');
  assert.equal(cls.kind, 'type');
});
