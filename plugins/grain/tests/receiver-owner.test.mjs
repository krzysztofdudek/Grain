// Regression/feature test for issue 016 (Q2): Go's `func (c *Context) Bind()` binds a method to a NAMED TYPE in
// its own signature, but nothing in the model recorded it — clustering saw the method as an untyped, unbound
// callable indistinguishable from a `func TestContextBind(t *testing.T)` top-level test function. Both are
// `function_declaration`-shaped in every other structural sense; only the receiver tells them apart.
//
// Root-cause fix (core.mjs `bindingFor`/`extractScopes`): a derived `b.rcvCallable` set — node types whose OWN
// fields (per node-types.json) declare a `body` AND a `parameters` AND a `receiver`. Across all 23 shipped
// grammars this hits exactly Go's `method_declaration`. Ruby's `call` also declares a `receiver` field, but has
// neither its own `body` nor its own `parameters`, so R1's three-field conjunction correctly excludes it — Ruby
// method extraction (kind `method`, from `def`/`method`) is untouched and never gets an `own`.
//
// The receiver's TYPE is read off the existing `b.paramLike` slot's `.type` field (the same fix §G26/issue 015
// made for named returns): reading the first identifier instead would record the receiver's BINDING NAME (`c`)
// rather than its TYPE (`Context`) — the mistake the first draft of this fix made.
//
// Deliberately NOT extended (measured and rejected, see .temp/issues/016-go-clustering-fit/log.md): Rust `impl`
// blocks (axum loses 20 conventions) and enclosing-type nesting for class-shaped languages (mixed on Java/Python).
// `s.own` is therefore Go-only today, by construction of R1, not by a language check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

async function scopesOf(ext, src) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  const out = extractScopes('X' + ext, tree, b, p._g); tree.delete(); return out;
}
async function methodScope(ext, src, name) { return (await scopesOf(ext, src)).find(s => s.kind === 'method' && s.name === name); }

test('Go: a pointer-receiver method records its receiver TYPE name, not the binding name', async () => {
  const s = await methodScope('.go', `package main
type Context struct{}
func (c *Context) Bind() error {
	return nil
}
`, 'Bind');
  assert.equal(s.own, 'Context', `expected owner "Context", got ${JSON.stringify(s.own)}`);
});

test('Go: a value-receiver method also records its receiver TYPE name', async () => {
  const s = await methodScope('.go', `package main
type Engine struct{}
func (e Engine) Run() {
}
`, 'Run');
  assert.equal(s.own, 'Engine');
});

test('Go: an anonymous (unnamed) receiver still records its TYPE', async () => {
  const s = await methodScope('.go', `package main
type Plain struct{}
func (Plain) Anon() {
}
`, 'Anon');
  assert.equal(s.own, 'Plain');
});

test('Go: a generic receiver resolves to the outer type name, not the full instantiation', async () => {
  const s = await methodScope('.go', `package main
type Stack[T any] struct{}
func (s *Stack[T]) Push(v T) {
}
`, 'Push');
  assert.equal(s.own, 'Stack', `expected "Stack" (not "Stack[T]"), got ${JSON.stringify(s.own)}`);
});

test('Go: a plain top-level function (no receiver, e.g. a test function) has no owner', async () => {
  const fn = (await scopesOf('.go', `package main
import "testing"
func TestContextBind(t *testing.T) {
}
`)).find(x => x.name === 'TestContextBind');
  assert.equal(fn.own, null, `expected null, got ${JSON.stringify(fn.own)}`);
});

test('Ruby: a `def` method is unaffected — `call`\'s own `receiver` field does not give it (or anything else) an owner', async () => {
  const s = await methodScope('.rb', `class Widget
  def render
    self.to_s
  end
end
`, 'render');
  assert.equal(s.own, null, `Ruby methods must never acquire an owner via this rule, got ${JSON.stringify(s.own)}`);
});

test('feats/label vocabulary: a Go method with an owner carries `own:<Type>`, a Ruby method carries none', async () => {
  const go = await methodScope('.go', `package main
type Context struct{}
func (c *Context) Bind() error { return nil }
`, 'Bind');
  assert.ok(go.feats.includes('own:Context'), `expected 'own:Context' in ${JSON.stringify(go.feats)}`);

  const rb = await methodScope('.rb', `class Widget
  def render
  end
end
`, 'render');
  assert.ok(!rb.feats.some(f => f.startsWith('own:')), `Ruby feats must carry no own: entry, got ${JSON.stringify(rb.feats)}`);
});
