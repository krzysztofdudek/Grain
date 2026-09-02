// Regression test for a FABRICATED-supertype bug (issue 084): Rust's heritage walk records a `'static`
// (or any other) LIFETIME bound inside a trait-bound list as though it were a real trait, alongside the
// genuine ones. `pub trait Handler: Clone + Send + Sync + 'static` recorded `auto.extends:'static` on
// axum-full — 5/29 (17%) of that corpus's checkable heritage claims were exactly this shape, confirmed
// at `serve/listener.rs:16`, `connect_info.rs:74`, `serve/mod.rs:162`, `extract/ws.rs:416` and
// `handler/mod.rs:148`. `'static` is a lifetime annotation, never a trait or type, so this is fabricated
// by construction.
//
// `trait_bounds` (already in core.mjs's `heritageRe`) lists `lifetime` as one of its own child types right
// alongside `_type` (node-types.json) — the heritage walk's `descendantsOfType` finds `'static`'s inner
// `identifier` exactly like it finds `Clone`'s, and nothing before this told them apart. Fixed the same
// way issue 049 excluded a call-argument list: a new structural predicate, `lifetimeRe`, keyed off the
// GRAMMAR NODE TYPE NAME `lifetime` (not the literal text `'static` — any lifetime is excluded, `'a` and
// `'de` included), read by the same ancestor walk that already excludes generic-argument slots and call
// arguments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

async function typeScope(ext, src, name) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  assert.ok(!tree.rootNode.hasError, `fixture must parse cleanly for ${ext}`);
  return extractScopes('X' + ext, tree, b, p._g).find(s => s.kind === 'type' && s.name === name);
}

// ===== the reported defect =====

test("Rust: `trait Foo: Bar + Send + Sync + 'static {}` records the real trait bounds, never 'static", async () => {
  const s = await typeScope('.rs', `pub trait Foo: Bar + Send + Sync + 'static {}\n`, 'Foo');
  assert.deepEqual(s.sup, ['Bar', 'Send', 'Sync'],
    `'static is a lifetime, not a trait: sup = ${JSON.stringify(s.sup)}`);
});

test("Rust: a NON-'static lifetime bound (`'a`) is excluded the same way — this is not a hardcoded string match on 'static", async () => {
  const s = await typeScope('.rs', `pub trait Foo: Bar + Send + Sync + 'a {}\n`, 'Foo');
  assert.deepEqual(s.sup, ['Bar', 'Send', 'Sync'],
    `'a is a lifetime, not a trait, exactly like 'static: sup = ${JSON.stringify(s.sup)}`);
  assert.ok(!s.sup.includes('a'), `the bare identifier inside the lifetime node must never leak into sup: sup = ${JSON.stringify(s.sup)}`);
});

test("Rust: a lifetime bound nested inside a higher-ranked trait bound (`for<'b> Bar<'b> + 'a`) is still excluded", async () => {
  const s = await typeScope('.rs', `pub trait Foo<'a>: for<'b> Bar<'b> + 'a {}\n`, 'Foo');
  assert.deepEqual(s.sup, ['Bar'], `only the real trait bound survives: sup = ${JSON.stringify(s.sup)}`);
});

test('Rust: axum-shaped `handler` trait bound list keeps Clone/Send/Sync, drops the trailing lifetime', async () => {
  const s = await typeScope('.rs', `pub trait Handler<T, S = ()>: Clone + Send + Sync + 'static {\n    fn call(self, req: Request) -> Response;\n}\n`, 'Handler');
  assert.deepEqual(s.sup, ['Clone', 'Send', 'Sync']);
});

// ===== the guard: ordinary Rust heritage, and ordinary generic-bound lifetimes elsewhere, still work =====

test("GUARD: a plain Rust trait bound list with no lifetime is unaffected", async () => {
  const s = await typeScope('.rs', `trait T: Send + Sync { fn f(&self); }\n`, 'T');
  assert.deepEqual(s.sup, ['Send', 'Sync']);
});

test('GUARD: a supertype-only extends (no bounds at all) is unaffected', async () => {
  const s = await typeScope('.rs', `trait Super {}\ntrait Sub: Super {}\n`, 'Sub');
  assert.deepEqual(s.sup, ['Super']);
});

test("GUARD: a lifetime-bounded generic PARAMETER (`<'x: 'y>`) never contaminates the type's own trait bounds", async () => {
  const s = await typeScope('.rs', `pub trait Listener<'x: 'y>: Sync + Send + 'static {}\n`, 'Listener');
  assert.deepEqual(s.sup, ['Sync', 'Send']);
});
