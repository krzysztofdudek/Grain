// Regression test for a FABRICATED-supertype bug (issue 082): a Python class whose base is a DOTTED/QUALIFIED
// attribute chain (`class Foo(pkg.sub.Type):`) recorded ONE supertype claim PER NESTING LEVEL — `pkg`,
// `pkg.sub`, AND `pkg.sub.Type` — instead of collapsing to the single real base, `Type`. Confirmed on flask/
// flask (tests/test_views.py:201): `class BaseView(flask.views.MethodView):` alone produced claims against
// `flask`, `flask.views`, AND `flask.views.MethodView`, none of which match `declaredTypeNames` or
// `importTargets` — even though the bare `MethodView` would resolve correctly. Heritage-claim fabrication
// rate on flask: 78/158 = 49.4%, all of this shape.
//
// NOT the same bug as §049 (a constructor-CALL argument mistaken for a base type) or §062 (a qualified/member
// clause resolving to the NAMESPACE instead of the MEMBER — one wrong name per clause). This is Python-grammar-
// specific: tree-sitter-python nests a dotted heritage target as a chain of `attribute` nodes, each of which is
// independently identifier-shaped, and Python's dedicated `class_definition.superclasses` field (added to
// heritageRe by §049, since it's an argument_list) was read with its OWN naive walk —
// `sc.descendantsOfType('identifier').concat(sc.descendantsOfType('attribute'))` — that never applied §062's
// leaf-only resolution at all. Every nesting level's identifier AND every intermediate `attribute` node's own
// (partial) dotted text landed in `sup` independently.
//
// Fixed in core.mjs by routing the `superclasses` field through the same `heritageNamesOf` helper the generic
// per-clause heritage walk already uses — no `lang === 'python'` check: `b.qualName` already recognizes
// Python's `attribute` node as a qualified-name chain (§062's own structural derivation off node-types.json,
// verified in bindingFor), so the shared resolver suppresses every non-leaf node in the chain the same way it
// already does for JS/TS/Java/C#/Kotlin/Scala/Ruby's own qualified-name shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

async function typeScopes(src) {
  const p = await getParser('.py');
  const b = bindingFor(p._g);
  const tree = p.parse(src);
  assert.ok(!tree.rootNode.hasError, 'fixture must parse cleanly');
  return extractScopes('X.py', tree, b, p._g).filter(s => s.kind === 'type');
}
const supOf = (scopes, name) => {
  const s = scopes.find(x => x.name === name);
  assert.ok(s, `expected a type scope named ${name}, got ${JSON.stringify(scopes.map(x => x.name))}`);
  return s.sup;
};

test('§082: `class Foo(pkg.sub.Type)` records exactly ONE supertype, the resolved leaf `Type`', async () => {
  const scopes = await typeScopes(`class Foo(pkg.sub.Type):
    pass
`);
  const sup = supOf(scopes, 'Foo');
  assert.deepEqual(sup, ['Type'], `expected exactly one resolved leaf, got ${JSON.stringify(sup)}`);
  assert.ok(!sup.includes('pkg'), '`pkg` is a namespace segment, never its own claim');
  assert.ok(!sup.includes('pkg.sub'), '`pkg.sub` is a namespace prefix, never its own claim');
  assert.equal(scopes.find(s => s.name === 'Foo').supKind.Type, 'ext',
    'Python\'s superclasses field is always inheritance-shaped (§033)');
});

test('§082: the flask shape — `class BaseView(flask.views.MethodView)` — records only `MethodView`', async () => {
  // The exact reported reproduction (tests/test_views.py:201 in flask/flask), reduced to a standalone fixture:
  // a locally-declared MethodView so the correctly-resolved leaf is also independently checkable against
  // declaredTypeNames — the fabricated versions (`flask`, `flask.views`, `flask.views.MethodView`) never are.
  const scopes = await typeScopes(`class MethodView:
    pass

class BaseView(flask.views.MethodView):
    pass
`);
  const sup = supOf(scopes, 'BaseView');
  assert.deepEqual(sup, ['MethodView']);
  for (const bogus of ['flask', 'flask.views', 'flask.views.MethodView'])
    assert.ok(!sup.includes(bogus), `${bogus} must never be recorded — it is a namespace prefix, not a base type`);
});

test('§082: multiple bases mixing plain and dotted names all resolve correctly, in order', async () => {
  const scopes = await typeScopes(`class Foo(Bar, pkg.sub.Type, Baz):
    pass
`);
  assert.deepEqual(supOf(scopes, 'Foo'), ['Bar', 'Type', 'Baz']);
});

test('§082: a deeper dotted chain (four segments) still collapses to just the leaf', async () => {
  const scopes = await typeScopes(`class Foo(a.b.c.d.Type):
    pass
`);
  assert.deepEqual(supOf(scopes, 'Foo'), ['Type']);
});

// ===== guard: this must pass in BOTH arms (before and after the fix) =====

test('GUARD: a plain (non-dotted) Python base is still recorded, classified ext', async () => {
  const scopes = await typeScopes(`class Base:
    pass

class Child(Base):
    pass
`);
  const s = scopes.find(x => x.name === 'Child');
  assert.deepEqual(s.sup, ['Base']);
  assert.equal(s.supKind.Base, 'ext');
});

test('GUARD: a class with no bases records no supertypes', async () => {
  const scopes = await typeScopes(`class Foo:
    pass
`);
  assert.deepEqual(supOf(scopes, 'Foo'), []);
});
