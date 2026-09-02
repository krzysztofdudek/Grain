// Regression test for a FABRICATED-supertype bug (issue 083): Kotlin's class-delegation clause
// (`class Foo(delegate: Bar) : Bar by delegate`) recorded the DELEGATE EXPRESSION after `by` — a
// constructor parameter name, or a function-call name — as a second `auto.extends`-shaped supertype claim,
// alongside the real interface name. Confirmed on okhttp (`ThrottledSink.kt`: `class ThrottledSink(...) :
// Sink by delegate` recorded `delegate`) and kotlin-datetime (10 instances of `by asKSerializer()`, an
// extension-function CALL, recording the function name `asKSerializer` as a supertype).
//
// This is the SAME failure class as already-fixed issue 049 (a constructor call's ARGUMENT mis-recorded as
// a supertype) but a DIFFERENT grammar construct: 049's fix (`argRe`, a field-driven predicate over
// argument-shaped nodes) covers a call's `value_arguments`/`argument_list`, never Kotlin's `by`-delegation
// clause (`explicit_delegation`), which has no argument list at all — it pairs a TYPE with an arbitrary
// EXPRESSION, structurally distinct from a call.
//
// Fixed by a new field-free structural fingerprint (`b.delegateClauseType`, core.mjs §083): a node type
// declaring no fields of its own whose only two possible children are exactly the categories `type` and
// `primary_expression` — checked against all 23 shipped node-types.json, unique to Kotlin's
// `explicit_delegation`. Only the child that resolves into the TYPE side's own supertype closure
// (`b.typeSuperSet`, expanded through the grammar's own subtype chain) is kept as heritage; the delegate
// expression is excluded whatever shape it takes — a bare identifier or a function call — with no field
// name, node-type name, or grammar name ever tested directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

async function typeScopes(src) {
  const p = await getParser('.kt');
  const b = bindingFor(p._g);
  const tree = p.parse(src);
  assert.ok(!tree.rootNode.hasError, 'fixture must parse cleanly');
  return extractScopes('X.kt', tree, b, p._g).filter(s => s.kind === 'type');
}
const supOf = (scopes, name) => {
  const s = scopes.find(x => x.name === name);
  assert.ok(s, `expected a type scope named ${name}, got ${JSON.stringify(scopes.map(x => x.name))}`);
  return s.sup;
};

// ===== the reported defect: okhttp's shape — delegate is a constructor parameter (a bare identifier) =====

test('Kotlin: `class Foo(delegate: Bar) : Bar by delegate` records exactly one supertype, never the parameter', async () => {
  const scopes = await typeScopes(`interface Bar {
  fun f()
}
class Foo(delegate: Bar) : Bar by delegate {
}
`);
  assert.deepEqual(supOf(scopes, 'Foo'), ['Bar'], 'the supertype is Bar; `delegate` is the expression after `by`, not a base type');
  for (const s of scopes) assert.ok(!s.sup.includes('delegate'), `${s.name}: \`delegate\` is a parameter name, not a supertype: ${JSON.stringify(s.sup)}`);
});

test('Kotlin (real shape, okhttp ThrottledSink.kt): `class ThrottledSink(...) : Sink by delegate`', async () => {
  const scopes = await typeScopes(`interface Sink {
  fun close()
}
class ThrottledSink(delegate: Sink, bytesPerSecond: Long) : Sink by delegate {
  override fun close() {}
}
`);
  assert.deepEqual(supOf(scopes, 'ThrottledSink'), ['Sink']);
});

// ===== the reported defect: kotlin-datetime's shape — delegate is a function CALL =====

test('Kotlin: `class X : KSerializer<Y> by someFunctionCall()` never records the function name as a supertype', async () => {
  const scopes = await typeScopes(`class X : KSerializer<String> by someFunctionCall() {
}
`);
  assert.deepEqual(supOf(scopes, 'X'), ['KSerializer'], 'someFunctionCall is the delegate expression, never a supertype');
  for (const s of scopes) assert.ok(!s.sup.includes('someFunctionCall'), `${s.name}: a function name is never a supertype: ${JSON.stringify(s.sup)}`);
});

test('Kotlin (real shape, kotlin-datetime serializers): `by asKSerializer()` never records `asKSerializer`', async () => {
  const scopes = await typeScopes(`class LocalDateIso8601Serializer : KSerializer<LocalDate> by LocalDate.serializer().asKSerializer() {
}
`);
  const sup = supOf(scopes, 'LocalDateIso8601Serializer');
  assert.deepEqual(sup, ['KSerializer']);
  assert.ok(!sup.includes('asKSerializer'), `a lowercase extension-function call must never be recorded: ${JSON.stringify(sup)}`);
  assert.ok(!sup.includes('LocalDate'), `the receiver of the delegate call chain is not a supertype either: ${JSON.stringify(sup)}`);
});

// ===== regression: a Kotlin class WITHOUT delegation still works exactly as before =====

test('GUARD: Kotlin heritage with no `by` clause is unaffected — plain, generic, and call-argument shapes', async () => {
  const scopes = await typeScopes(`class Plain : Base {
  fun m() = 1
}
class WithCtorCall : Base(1, extraneousArgName) {
  fun m() = 2
}
class WithGenericBase : Repo<Entity>() {
  fun m() = 3
}
class MultiHeritage(x: Int) : Base(x), IFace {
  fun m() = 4
}
`);
  assert.deepEqual(supOf(scopes, 'Plain'), ['Base']);
  assert.deepEqual(supOf(scopes, 'WithCtorCall'), ['Base'], '`extraneousArgName` is a call argument (§049), not a delegate expression, and must still be excluded');
  assert.deepEqual(supOf(scopes, 'WithGenericBase'), ['Repo'], 'a generic base with a constructor call keeps only the base');
  assert.deepEqual(supOf(scopes, 'MultiHeritage'), ['Base', 'IFace'], '`x` is still a constructor argument, excluded as before §083 ever existed');
});

// ===== structural derivation: the fingerprint is unique to Kotlin's explicit_delegation =====

test('b.delegateClauseType is derived, never hardcoded to a language name, and matches only Kotlin', async () => {
  const p = await getParser('.kt');
  const b = bindingFor(p._g);
  assert.deepEqual([...b.delegateClauseType], ['explicit_delegation']);
  assert.ok(b.typeSuperSet.has('user_type'), 'the type side of the duality resolves through the grammar\'s own supertype chain');
  assert.ok(!b.typeSuperSet.has('call_expression'), 'a call is never mistaken for the type side');
  assert.ok(!b.typeSuperSet.has('identifier'), 'a bare identifier is never mistaken for the type side');
});
