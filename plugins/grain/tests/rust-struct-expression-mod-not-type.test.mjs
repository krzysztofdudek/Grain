// Regression test for G15: two independent misclassifications in `extractScopes`'s type/method
// classification, both surfaced on a real production Rust codebase (ripgrep).
//
// (a) `TYPE_LIKE_RE` matched node type NAMES by underscore-bounded segment, and Rust's
// `struct_expression` (a VALUE-CONSTRUCTION expression like `Foo::S { x: 1 }` inside a method
// body, not a declaration) starts with the segment `struct_` — so every struct-literal
// construction was classified `kind: 'type'`, flagging idiomatic construction expressions as
// PascalCase-naming "violations". Fixed by excluding any node type carrying an `expression`
// segment from ever counting as type-like (expression != declaration, a language-agnostic
// AST signal).
//
// (b) Rust's `mod_item` (a `mod tests { ... }` block) matches neither TYPE_LIKE_RE nor
// FUNC_LIKE_RE, so it fell through the "container with nested real scopes, not func-like =>
// type" fallback and got classified as a type, flagging `mod tests`/`mod convert` as
// PascalCase violations on completely idiomatic Rust. Fixed by treating `mod` the same way
// `namespace`/`package` are already treated (a location, not a unit of code, walked through
// but never itself a scope and never counted as a "real" nested scope for its parent) via a
// word-bounded `mod` match — NOT a raw substring, which would also catch Ruby's real
// type-like `module` node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

async function scopesOf(ext, src) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  return extractScopes('X' + ext, tree, b, p._g);
}

test('Rust: a struct_expression (value construction) inside a method body is not kind:type', async () => {
  const scopes = await scopesOf('.rs', `pub enum Foo { S { x: u32 } }
fn f() -> Foo { Foo::S { x: 1 } }
`);
  const structExprTypes = scopes.filter(s => s.nt === 'struct_expression' && s.kind === 'type');
  assert.equal(structExprTypes.length, 0, `a struct_expression construction must never be kind:type: ${JSON.stringify(scopes.map(s => [s.kind, s.name, s.nt]))}`);
});

test('Rust: a real struct/impl declaration is still kind:type (regression control)', async () => {
  const scopes = await scopesOf('.rs', 'struct Bar;\nimpl Bar {}\n');
  const types = scopes.filter(s => s.kind === 'type' && s.name === 'Bar');
  assert.ok(types.length >= 1, `expected at least one kind:type scope named Bar, got ${JSON.stringify(scopes.map(s => [s.kind, s.name, s.nt]))}`);
});

test('Rust: a `mod tests { ... }` block is not kind:type', async () => {
  const scopes = await scopesOf('.rs', 'mod tests {\n    fn a() {}\n}\n');
  const modTypes = scopes.filter(s => s.name === 'tests' && s.kind === 'type');
  assert.equal(modTypes.length, 0, `mod tests must never be kind:type: ${JSON.stringify(scopes.map(s => [s.kind, s.name, s.nt]))}`);
});

test('Ruby: a `module Foo` is still kind:type (regression control — word-bounded `mod` must not catch `module`)', async () => {
  const scopes = await scopesOf('.rb', "module Foo\n  def bar\n    1\n  end\nend\n");
  const types = scopes.filter(s => s.kind === 'type' && s.name === 'Foo');
  assert.equal(types.length, 1, `expected Foo's module to still be kind:type, got ${JSON.stringify(scopes.map(s => [s.kind, s.name, s.nt]))}`);
});
