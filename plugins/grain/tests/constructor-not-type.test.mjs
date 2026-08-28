// Regression test for a constructor-misclassified-as-type bug: `extractScopes`'s `typeLike` check
// matched node TYPE NAMES by raw substring, and the word `constructor_declaration` contains the
// substring `struct` (con-STRUCT-or_declaration) — so every constructor was classified `kind: 'type'`
// instead of `kind: 'method'`. A constructor being counted in the "type" population corrupts every
// convention denominator built from it (e.g. "types here are named PascalCase — 100%" partly counts
// constructors, which are PascalCase by LANGUAGE RULE and can never violate that "convention").
// Confirmed on a real production C# codebase, where `SearchQueryValidator (type, line 21)` turned
// out to be the constructor `public SearchQueryValidator()`, not a second type declaration.
// Fixed by matching `typeLike` (and the function/method exclusion used by the container/leaf rule)
// on whole underscore-bounded node-type NAME SEGMENTS, never on a raw substring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

async function scopesOf(ext, src) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  return extractScopes('X' + ext, tree, b, p._g);
}

test('C#: an explicit constructor is a method-kind scope, not a type-kind scope', async () => {
  const scopes = await scopesOf('.cs', `public class Foo {
    public Foo(int x) { Bar(x); }
}
`);
  const ctor = scopes.find(s => s.name === 'Foo' && s.nt === 'constructor_declaration');
  assert.ok(ctor, 'expected a scope for the constructor');
  assert.notEqual(ctor.kind, 'type', 'a constructor must never be kind:type');
  assert.equal(ctor.kind, 'method');
  const types = scopes.filter(s => s.kind === 'type' && s.name === 'Foo');
  assert.equal(types.length, 1, `the class's type population must not include the constructor: ${JSON.stringify(types.map(s => s.nt))}`);
});

test('C#: a destructor is a method-kind scope, not a type-kind scope', async () => {
  const scopes = await scopesOf('.cs', `public class Foo {
    ~Foo() { Cleanup(); }
}
`);
  const dtor = scopes.find(s => s.nt === 'destructor_declaration');
  assert.ok(dtor, 'expected a scope for the destructor');
  assert.notEqual(dtor.kind, 'type');
  assert.equal(dtor.kind, 'method');
});

test('C#: a constructor containing a nested local function is still a method-kind scope (container/leaf rule must not override)', async () => {
  const scopes = await scopesOf('.cs', `public class Foo {
    public Foo() {
        void Helper() { DoWork(); }
        Helper();
    }
}
`);
  const ctor = scopes.find(s => s.nt === 'constructor_declaration');
  assert.ok(ctor, 'expected a scope for the constructor');
  assert.equal(ctor.kind, 'method', 'a constructor with a nested scope must not be promoted to kind:type by the container/leaf rule');
});

test('Java: a constructor is a method-kind scope, not a type-kind scope', async () => {
  const scopes = await scopesOf('.java', `class Foo {
    Foo(int x) { bar(x); }
}
`);
  const ctor = scopes.find(s => s.nt === 'constructor_declaration');
  assert.ok(ctor, 'expected a scope for the constructor');
  assert.notEqual(ctor.kind, 'type');
  assert.equal(ctor.kind, 'method');
});

test('Java: a record\'s compact constructor is a method-kind scope, not a type-kind scope', async () => {
  const scopes = await scopesOf('.java', `record Foo(int x) {
    Foo {
        if (x < 0) throw new IllegalArgumentException();
    }
}
`);
  const ctor = scopes.find(s => s.nt === 'compact_constructor_declaration');
  assert.ok(ctor, 'expected a scope for the compact constructor');
  assert.notEqual(ctor.kind, 'type');
  assert.equal(ctor.kind, 'method');
});

test('Groovy: a constructor is a method-kind scope, not a type-kind scope', async () => {
  const scopes = await scopesOf('.groovy', `class Foo {
    Foo(int x) { bar(x) }
}
`);
  const ctor = scopes.find(s => s.nt === 'constructor_declaration');
  assert.ok(ctor, 'expected a scope for the constructor');
  assert.notEqual(ctor.kind, 'type');
  assert.equal(ctor.kind, 'method');
});

test('a constructor is eligible for method-only fact machinery (arity), exactly like any other method', async () => {
  const scopes = await scopesOf('.cs', `public class Foo {
    public Foo(int x, string y) { Bar(x, y); }
}
`);
  const ctor = scopes.find(s => s.nt === 'constructor_declaration');
  assert.equal(ctor.preds['auto.arity'], '2');
});
