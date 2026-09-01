// Regression test for issue 015: a named return value's BINDING NAME was recorded as its declared TYPE.
//
// `export`/`where` reported Go/gin methods as declaring "a return type of `err`". The real signature
// (`func (engine *Engine) Run(addr ...string) (err error)`) names its return `err`; the TYPE is `error`. Go's
// `parameter_list` result node holds a `parameter_declaration` with BOTH a `name` field (`err`) and a `type`
// field (`error`) — extraction's flat `descendantsOfType` scan found the NAME identifier first, since it sits
// before the TYPE in source order, and recorded it as if it were the type. This is not a missing feature or a
// silence: grain was CERTIFYING a false claim about the code (docs/validation.md's truth-audit standard), and it
// could split one real convention into several (`(err error)` and `(e error)` reading as two different
// "declared return type" markers instead of one).
//
// Root-cause fix (core.mjs `bindingFor`): a generic `b.paramLike` set — node types whose OWN fields (per the
// grammar's node-types.json) declare BOTH a `name` and a `type`, exactly the shape `bindingFor`'s existing
// `b.scope`/`b.imp`/`b.deco` derivations already use ("kod to kod": no per-language node-name list). Return-type
// extraction now reads each slot's `.type` field directly whenever retN's own direct children are ALL `paramLike`
// slots (Go's named result list, Scala 3's named-tuple return type) — the exact shape the bug report named.
//
// Languages checked during diagnosis: Go (affected — the reported case, fixed), Scala (affected — Scala 3's
// `named_tuple_type`/`name_and_type` is structurally identical to Go's named-return shape, fixed), Java, C#, Rust
// (unaffected: their return-type grammars never nest a `paramLike` node inside the return-type expression itself —
// Rust tuple returns are UNNAMED so there is no name/type confusion to begin with; C# methods do not reach this
// code path at all today — `method_declaration`'s field is named `returns`, not `result`/`return_type`/`type`, a
// separate pre-existing silence unrelated to this bug, reported not fixed).
//
// TypeScript/tsx: a RELATED but DISTINCT case was found and deliberately left UNFIXED, reported instead — a
// return type that is itself a function type, `(x: number) => void`, still surfaces the inner parameter's binding
// name `x`. Two fix attempts were tried and reverted: excluding a nested paramLike slot's `.name` field doesn't
// even reach it (TS's plain-identifier `required_parameter` binds through a `pattern` field at runtime, not
// `name`, despite node-types.json listing `name` as a valid field too — a per-instance grammar quirk, not a stable
// generic signal); excluding the whole slot (name AND type) "fixed" that rare case but broke common, real code
// instead — a TS return type that is an object literal, `{ id: string }`, is ALSO `paramLike` per property, and
// dropping its `.type` field silently discarded a real, previously-reported type (measured: it broke this repo's
// own change-archetypes/missing-shape test fixtures via role-cluster feature drift). The object-literal case is
// regression-guarded below instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes, buildVocab } from '../engine/core.mjs';

async function scopesOf(ext, src) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  const out = extractScopes('X' + ext, tree, b, p._g); tree.delete(); return out;
}
async function methodScope(ext, src, name) { return (await scopesOf(ext, src)).find(s => s.kind === 'method' && s.name === name); }

test('Go: a named return records the TYPE, not the binding name — `(err error)` yields `error`, never `err`', async () => {
  const s = await methodScope('.go', `package main
type Engine struct{}
func (engine *Engine) Run(addr ...string) (err error) {
	return nil
}
`, 'Run');
  assert.deepEqual(s.rets, ['error'], `expected ["error"], got ${JSON.stringify(s.rets)}`);
});

test('Go: a plain (unnamed) return type is unchanged — `func f() error` still yields `error`', async () => {
  const s = await methodScope('.go', `package main
type Engine struct{}
func (engine *Engine) Other() error {
	return nil
}
`, 'Other');
  assert.deepEqual(s.rets, ['error']);
});

test('Go: differently-NAMED, identically-TYPED named returns extract the SAME value', async () => {
  const ss = await scopesOf('.go', `package main
type Engine struct{}
func (e *Engine) Run() (err error) { return nil }
func (e *Engine) Start() (e2 error) { return nil }
`);
  const run = ss.find(s => s.name === 'Run'), start = ss.find(s => s.name === 'Start');
  assert.deepEqual(run.rets, ['error']);
  assert.deepEqual(start.rets, ['error']);
  assert.deepEqual(run.rets, start.rets, 'a naming difference alone must not produce a different extracted value');
});

// The user-visible consequence of the bug: `buildVocab`'s RET vocabulary is the set of DISTINCT declared-return-type
// values that become separate candidate `auto.returns:` markers. Under the bug, `(err error)` and `(e error)` methods
// contribute two DIFFERENT vocabulary entries ("err", "e") — the candidate-universe inflation the ticket describes,
// which either splits one real convention into two, or (as here, with too few of either name to clear the support
// floor alone) silences it altogether. Fixed, both contribute the SAME entry ("error") and the convention is whole.
test('Go: differently-named, identically-typed returns collapse into ONE candidate convention, not two', async () => {
  let src = 'package main\ntype Engine struct{}\n';
  for (let i = 0; i < 4; i++) src += `func (e *Engine) Run${i}() (err error) { return nil }\n`;
  for (let i = 0; i < 4; i++) src += `func (e *Engine) Start${i}() (e2 error) { return nil }\n`;
  const ps = (await scopesOf('.go', src)).filter(s => s.kind === 'method');
  assert.equal(ps.length, 8);
  const vb = buildVocab(ps);
  assert.deepEqual(vb.RET, ['error'], `expected one candidate return-type value, got ${JSON.stringify(vb.RET)}`);
});

test('Scala 3: a named-tuple return records the TYPES, not the binding names — `(name: String, age: Int)`', async () => {
  const s = await methodScope('.scala', `class Foo {
  def f(): (name: String, age: Int) = (name = "a", age = 1)
}
`, 'f');
  assert.deepEqual(s.rets, ['String', 'Int'], `expected the two element TYPES, got ${JSON.stringify(s.rets)}`);
});

test('Scala: a plain return type is unchanged', async () => {
  const s = await methodScope('.scala', `class Foo {
  def g(): String = "x"
}
`, 'g');
  assert.deepEqual(s.rets, ['String']);
});

test('TypeScript: a plain return type is unchanged', async () => {
  const s = await methodScope('.ts', `function plain(): void {}\n`, 'plain');
  assert.deepEqual(s.rets, ['void']);
});

// The regression a stronger fix attempt caused (see the file header): an object-LITERAL return type's own
// property is ALSO `paramLike` (a `property_signature` has both a `name` and a `type` field, same as a Go
// `parameter_declaration`) — but it sits nested inside an `object_type`, never as retN's own direct child, so it
// must NOT be read through the named-result-list path, and its `.type` field must stay a valid fallback candidate.
test('TypeScript: an object-literal return type still reports the property TYPE — byte-identical to before this fix', async () => {
  const s = await methodScope('.ts', `function makeOrder(): { id: string } { return { id: 'x' }; }\n`, 'makeOrder');
  assert.deepEqual(s.rets, ['string'], `expected the property's type to survive unchanged, got ${JSON.stringify(s.rets)}`);
});

test('Java: unaffected (no paramLike shape ever nests inside a Java return type) — byte-identical', async () => {
  const s = await methodScope('.java', `class Foo {
  String plain() { return "x"; }
}
`, 'plain');
  assert.deepEqual(s.rets, ['String']);
});

test('Rust: unaffected — an unnamed tuple return has no name to confuse with its type — byte-identical', async () => {
  const s = await methodScope('.rs', `struct Foo;
impl Foo {
  fn calc(&self) -> (i32, String) { (1, "x".to_string()) }
}
`, 'calc');
  assert.deepEqual(s.rets, ['i32']);
});
