// Tests for issue 125 — the extractor gap left by 117/120: no fact recorded which names a scope DECLARES as its
// own type parameter (`<T>`, `[T, +U]`), distinct from a domain type reference — so `S`/`V`/`T` in a `ptype`/
// `returns`/`extends` row could only be GUESSED render-side, by name shape (§120 class 2). Fix: `bindingFor`
// derives `b.tparamDecl`/`b.tparamContainer` from each grammar's own node-types.json alone (never a hand list of
// languages — a node type qualifies purely by containing the word "type_parameter" and not also being a
// list/constraint/modifier/clause wrapper around one), and `extract.mjs`'s new `declaredTypeParams(ch, b)` reads
// the actual declared names off a scope's own header and persists them as `s.tparams`.
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
const named = (scopes, name) => scopes.find(s => s.name === name);

// =====================================================================================================
// per-grammar: a generic type and a generic function/method each report exactly their OWN declared names,
// and a non-generic sibling in the same file reports none (never the enclosing type's, never a guess)
// =====================================================================================================

test('TypeScript: function<T>, class<T,U>, and a non-generic method of that class', async () => {
  const scopes = await scopesOf(
    '.ts',
    `function identity<T>(x: T): T { return x; }\nclass Box<T, U> { get(): T { return null; } }\n`
  );
  assert.deepEqual(named(scopes, 'identity').tparams, ['T']);
  assert.deepEqual(named(scopes, 'Box').tparams, ['T', 'U']);
  assert.deepEqual(named(scopes, 'get').tparams, [], 'a member declares none of its own — never inherits the class\'s');
});

test('Java: class<T, U extends Comparable<U>>, an ordinary method, and a static generic method', async () => {
  const scopes = await scopesOf(
    '.java',
    `class Box<T, U extends Comparable<U>> { T get() { return null; } static <S> S make(S s) { return s; } }\n`
  );
  assert.deepEqual(named(scopes, 'Box').tparams, ['T', 'U'], 'the bound (Comparable<U>) is not a second name');
  assert.deepEqual(named(scopes, 'get').tparams, []);
  assert.deepEqual(named(scopes, 'make').tparams, ['S']);
});

test('Kotlin: class<T>, a generic function member, and a top-level generic function', async () => {
  const scopes = await scopesOf(
    '.kt',
    `class Box<T> { fun <S> get(): S { return null } }\nfun <T> identity(x: T): T { return x }\n`
  );
  assert.deepEqual(named(scopes, 'Box').tparams, ['T']);
  assert.deepEqual(named(scopes, 'get').tparams, ['S']);
  assert.deepEqual(named(scopes, 'identity').tparams, ['T']);
});

test('Rust: struct<T,U>, a generic fn, and a plain fn on an impl block', async () => {
  const scopes = await scopesOf(
    '.rs',
    `struct Box<T, U> { x: T }\nfn identity<T>(x: T) -> T { x }\nimpl<T> Box<T, T> { fn get(&self) -> T { self.x } }\n`
  );
  assert.deepEqual(named(scopes, 'Box').tparams, ['T', 'U']);
  assert.deepEqual(named(scopes, 'identity').tparams, ['T']);
  assert.deepEqual(named(scopes, 'get').tparams, [], 'get<>() declares nothing of its own — the impl<T> is not get\'s own scope');
});

test('C#: class<T,U> with a `where` constraint clause, a plain class, and a generic method', async () => {
  const scopes = await scopesOf(
    '.cs',
    `class Box<T, U> where T : class { T Get() { return default; } }\nclass Plain { void M<S>() {} }\n`
  );
  assert.deepEqual(named(scopes, 'Box').tparams, ['T', 'U'], 'the constraint clause must never contribute a phantom third name');
  assert.deepEqual(named(scopes, 'Get').tparams, []);
  assert.deepEqual(named(scopes, 'Plain').tparams, []);
  assert.deepEqual(named(scopes, 'M').tparams, ['S']);
});

test('Go: a generic function with one shared constraint over two names ([T, U any])', async () => {
  const scopes = await scopesOf('.go', `package m\nfunc Identity[T any](x T) T { return x }\nfunc Pair[T, U any](a T, b U) T { return a }\n`);
  assert.deepEqual(named(scopes, 'Identity').tparams, ['T']);
  assert.deepEqual(named(scopes, 'Pair').tparams, ['T', 'U'], 'both names share one `any` constraint — a multiple `name` field, both must be collected');
});

test('Scala: class[T, +U, -V] (plain plus covariant/contravariant), and a generic method', async () => {
  const scopes = await scopesOf('.scala', `class Box[T, +U, -V] { def get[S](x: S): S = x }\ndef identity[T](x: T): T = x\n`);
  assert.deepEqual(named(scopes, 'Box').tparams, ['T', 'U', 'V'], 'the plain (unwrapped) T sits on the container\'s own name field, +U/-V on their own variant nodes — none double-counted');
  assert.deepEqual(named(scopes, 'get').tparams, ['S']);
  assert.deepEqual(named(scopes, 'identity').tparams, ['T']);
});

// =====================================================================================================
// absence — a grammar with no generic-declaration syntax at all must never fabricate a tparams entry, and a
// scope in a language that DOES have generics but declares none must report an empty list, not omit the field
// =====================================================================================================

test('absence: JavaScript has no type-parameter syntax at all — never a guess, never a crash', async () => {
  const scopes = await scopesOf('.js', `function plain(x) { return x; }\nclass C { m() {} }\n`);
  assert.deepEqual(named(scopes, 'plain').tparams, []);
  assert.deepEqual(named(scopes, 'C').tparams, []);
  assert.deepEqual(named(scopes, 'm').tparams, []);
});

test('absence: PHP has no type-parameter syntax at all', async () => {
  const scopes = await scopesOf('.php', `<?php class C { function m($x) { return $x; } }`);
  assert.deepEqual(named(scopes, 'C').tparams, []);
  assert.deepEqual(named(scopes, 'm').tparams, []);
});

test('absence: a non-generic type/method pair in a grammar that DOES have generics elsewhere', async () => {
  const scopes = await scopesOf('.ts', `class Plain { m(x: number): number { return x; } }\n`);
  assert.deepEqual(named(scopes, 'Plain').tparams, []);
  assert.deepEqual(named(scopes, 'm').tparams, []);
});

// =====================================================================================================
// the fact survives the round-trip every scope goes through on its way into the model/export (serializeScope /
// hydrateScope) — byte-identical for every field that already existed, `tparams` additive
// =====================================================================================================

test('serializeScope/hydrateScope round-trip carries tparams, and leaves every other field untouched', async () => {
  const { serializeScope, hydrateScope } = await import('../engine/partition.mjs');
  const scopes = await scopesOf('.ts', `class Box<T, U> { get(): T { return null; } }\n`);
  const box = named(scopes, 'Box');
  const before = JSON.parse(JSON.stringify(serializeScope(box)));
  const { tparams, ...beforeMinusTparams } = before;
  assert.deepEqual(tparams, ['T', 'U']);
  const rehydrated = hydrateScope(JSON.parse(JSON.stringify(serializeScope(box))));
  assert.deepEqual(rehydrated.tparams, ['T', 'U']);
  // every pre-existing field name is still present and unchanged in shape
  for (const k of Object.keys(beforeMinusTparams)) assert.ok(k in rehydrated, `field '${k}' must survive the round-trip`);
});
