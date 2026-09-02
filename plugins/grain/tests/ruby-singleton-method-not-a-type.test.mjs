// §076 — a Ruby `singleton_method` (`def self.foo; end`, a class/module method) must classify as kind `method`,
// never `type`. Root cause: `TYPE_LIKE_RE` (core.mjs) carried the bare word `singleton`, meant to catch
// Kotlin/Scala/C++-style singleton-shaped TYPE declarations, but the ONLY node type in any of the 23 shipped
// grammars' `b.scope` sets containing that word at all is Ruby's own `singleton_method` — an unrelated construct
// (a class-level method) that happens to share the English word "singleton" for a completely different reason.
// TYPE_LIKE_RE matched it, FUNC_LIKE_RE also correctly matched it via "method", and `extractScopes` lets typeLike
// win ties — so every `def self.foo` in a Ruby corpus classified as kind `type`, not `method`.
//
// The fix (core.mjs, TYPE_LIKE_RE) removes the `singleton` entry outright rather than narrowing it: a census of
// every shipped grammar's b.scope set (tests/type-like-coverage.test.mjs) found it had ZERO legitimate matches
// anywhere — Ruby's own `singleton_class` (`class << self`) and Scala's `singleton_type` are not b.scope members
// (no name+body of their own) and were never reachable through this entry either — so removing it fixes the
// false positive with no loss of coverage in any grammar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

async function scopesOf(src) {
  const p = await getParser('.rb');
  const b = bindingFor(p._g);
  const tree = p.parse(src);
  const out = extractScopes('X.rb', tree, b, p._g);
  tree.delete();
  return out;
}
const byName = (ss, name, nt) => ss.find(s => s.name === name && (!nt || s.nt === nt));

test('§076: `def self.foo; end` classifies as method, not type', async () => {
  const ss = await scopesOf('class Foo\n  def self.bar\n    1\n  end\nend\n');
  const cls = byName(ss, 'Foo', 'class');
  const m = byName(ss, 'bar', 'singleton_method');
  assert.ok(cls, 'sanity: the class declaration must be extracted');
  assert.ok(m, 'sanity: the singleton method must be extracted');
  assert.equal(cls.kind, 'type', 'sanity: the enclosing class is still a type');
  assert.equal(m.kind, 'method', 'a Ruby singleton method (`def self.foo`) must classify as method, not type');
});

test('§076: a module-level `def self.foo` classifies as method too', async () => {
  const ss = await scopesOf('module Util\n  def self.helper\n    2\n  end\nend\n');
  const m = byName(ss, 'helper', 'singleton_method');
  assert.ok(m, 'sanity: the singleton method must be extracted');
  assert.equal(m.kind, 'method');
});

test('§076 control: a plain Ruby instance method (unaffected by this fix) was already, and remains, kind method', async () => {
  const ss = await scopesOf('class Foo\n  def bar\n    1\n  end\nend\n');
  const m = byName(ss, 'bar', 'method');
  assert.ok(m, 'sanity: the instance method must be extracted');
  assert.equal(m.kind, 'method');
});
