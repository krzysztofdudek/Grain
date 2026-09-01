// Regression test for a FABRICATED-supertype bug (issue 049): when a language's extends clause is a
// CONSTRUCTOR CALL, `extractScopes`'s heritage walk collected the call's operands as supertypes. Play's
// commonest class shape —
//     class HomeController @Inject() (cc: ControllerComponents) extends AbstractController(cc)
// — recorded `auto.extends:cc`, so two structurally identical controllers landed in DIFFERENT synthetic
// groups purely because someone named a constructor parameter `cc` rather than `c`. grain was asserting a
// supertype relationship that does not exist, and clustering on a purely local name.
//
// `argument_list` sits in core.mjs's `heritageRe` for exactly one reason across all 19 shipped grammars:
// Python holds a class's base list in a `superclasses` FIELD that IS an argument_list (`class Foo(Bar)`),
// where the token buys real heritage. Everywhere else an argument-shaped node reached from a heritage node
// is the super-constructor call, in one of two roles — it IS the clause (Java/Groovy `enum_constant`'s
// `arguments` field) or it is NESTED beside the type inside a real clause (Scala/Kotlin/C#/Solidity/C++).
// Fixed by reading the role off the FIELD NAME the grammar gives the slot (`argRe`), so the type-named
// child of a clause always beats its argument list — structurally, for every grammar, with no language list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';
import { GRAMMAR_DIR } from '../engine/config.mjs';

async function typeScopes(ext, src) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  assert.ok(!tree.rootNode.hasError, `fixture must parse cleanly for ${ext}`);
  return extractScopes('X' + ext, tree, b, p._g).filter(s => s.kind === 'type');
}
const supOf = (scopes, name) => {
  const s = scopes.find(x => x.name === name);
  assert.ok(s, `expected a type scope named ${name}, got ${JSON.stringify(scopes.map(x => x.name))}`);
  return s.sup;
};

// ===== the reported defect =====

test('Scala: `extends AbstractController(cc)` records the TYPE, never the constructor argument', async () => {
  const scopes = await typeScopes('.scala', `package controllers
@Singleton
class HomeController @Inject() (cc: ControllerComponents) extends AbstractController(cc) {
  def index() = Action { implicit request => Ok("hi") }
}
`);
  assert.deepEqual(supOf(scopes, 'HomeController'), ['AbstractController'],
    'the supertype is AbstractController; `cc` is the argument passed to it, not a base type');
});

test('Scala: two controllers identical but for the constructor PARAMETER NAME cluster together', async () => {
  // the reported symptom: `…+cc` and `…+c` were different synthetic groups. Grouping runs on `feats`;
  // the two classes must differ only in the tokens of their own NAMES, never in a heritage fact.
  const scopes = await typeScopes('.scala', `package controllers
class HomeController @Inject() (cc: ControllerComponents) extends AbstractController(cc) {
  def index() = Action { implicit request => Ok("hi") }
}
class OtherController @Inject() (c: ControllerComponents) extends AbstractController(c) {
  def index() = Action { implicit request => Ok("hi") }
}
`);
  const a = scopes.find(s => s.name === 'HomeController'), b = scopes.find(s => s.name === 'OtherController');
  assert.deepEqual(a.sup, b.sup, `identical controllers must share one supertype set: ${JSON.stringify(a.sup)} vs ${JSON.stringify(b.sup)}`);
  const key = s => s.feats.filter(f => !f.startsWith('tok:')).sort();
  assert.deepEqual(key(a), key(b), 'the clustering key must not encode a local parameter name');
  for (const s of [a, b]) for (const bad of ['cc', 'c'])
    assert.ok(!s.sup.includes(bad), `${s.name}: \`${bad}\` is a parameter name, not a supertype: ${JSON.stringify(s.sup)}`);
});

// ===== the same shape in every other grammar that can reach it =====

test('Scala: mixins declared ALONGSIDE a parameterised base are all kept', async () => {
  const scopes = await typeScopes('.scala', `class WithMix(x: Int) extends Base(x) with Helper with Other { def h() = 3 }\n`);
  assert.deepEqual(supOf(scopes, 'WithMix'), ['Base', 'Helper', 'Other'],
    'dropping the argument `x` must not drop the `with` clauses sitting beside it');
});

test('Kotlin: a delegation specifier `: B(x), I` records B and I, not the argument x', async () => {
  const scopes = await typeScopes('.kt', `class A(x: Int) : B(x), I {
  fun f() = 1
}
class C : D(1, yy) {
  fun g() = 2
}
class R : S<T2>(zz) {
  fun n() = 6
}
`);
  assert.deepEqual(supOf(scopes, 'A'), ['B', 'I']);
  assert.deepEqual(supOf(scopes, 'C'), ['D'], '`yy` is a value_argument of the super-constructor call');
  assert.deepEqual(supOf(scopes, 'R'), ['S'], 'a generic base with call arguments keeps only the base');
});

test('C#: a primary constructor forwarding to a base (`class Foo(int x) : Bar(x), IBaz`) records Bar and IBaz', async () => {
  const scopes = await typeScopes('.cs', `class Foo(int x) : Bar(x), IBaz { void M() {} }
record Rec(int A) : Base(A), IR;
`);
  assert.deepEqual(supOf(scopes, 'Foo'), ['Bar', 'IBaz']);
  assert.deepEqual(supOf(scopes, 'Rec'), ['Base', 'IR'], 'a positional record forwards its parameter to the base the same way');
});

test('Solidity: `contract D2 is E2(arg1), F2` records E2 and F2, not the call argument', async () => {
  const scopes = await typeScopes('.sol', `contract D2 is E2(arg1), F2 { function g() public {} }\n`);
  assert.deepEqual(supOf(scopes, 'D2'), ['E2', 'F2']);
});

test('Java/Groovy: an enum constant\'s constructor arguments are not supertypes', async () => {
  // `enum_constant` is a scope node whose `arguments` field IS an argument_list — the whole clause is a
  // call, so it contributes no heritage at all (the constant's real supertype, the enum, is never in `sup`).
  for (const [ext, src] of [
    ['.java', `enum E { A(1), B(zz) { void m(){} }; E(int q){} }\n`],
    ['.groovy', `enum E { A(1), B(zz); E(int q){} }\n`]])
    assert.deepEqual(supOf(await typeScopes(ext, src), 'B'), [], `${ext}: \`zz\` is a constructor argument`);
});

test('JavaScript: `extends mixin(A, B)` does not turn the mixin call\'s arguments into supertypes', async () => {
  const scopes = await typeScopes('.js', `class Baz extends mixin(A, B) { m(){} }\n`);
  assert.deepEqual(supOf(scopes, 'Baz'), ['mixin'], 'A and B are operands of the call in the extends clause');
});

test('Python: the base list IS an argument_list — that heritage is kept, which is why the token exists', async () => {
  const scopes = await typeScopes('.py', `class Plain(Simple):
    def h(self): pass
class Baz(mod.Base):
    def g(self): pass
`);
  assert.ok(supOf(scopes, 'Plain').includes('Simple'),
    'Python holds its base list in a `superclasses` field that is an argument_list — real heritage, never discarded');
  assert.ok(supOf(scopes, 'Baz').includes('mod.Base'), 'a dotted base is still recorded');
});

// ===== the guard: this must pass in BOTH arms (before and after the fix) =====

test('GUARD: an ordinary supertype is still recorded in every affected language', async () => {
  // Every case here is heritage with NO call arguments anywhere. It passed before the fix and must pass
  // after it: if narrowing the heritage walk ever costs a language a real supertype, this test fails.
  const cases = [
    ['.scala', `class Plain extends BaseThing { def f() = 1 }\ntrait Mixed extends A with B { def g() = 2 }\n`,
      { Plain: ['BaseThing'], Mixed: ['A', 'B'] }],
    ['.kt', `class P : Q {\n  fun m() = 5\n}\nobject O : G() {\n  fun k() = 4\n}\n`,
      { P: ['Q'], O: ['G'] }],
    ['.java', `class Foo extends Bar implements Baz {}\nclass Gen<T> extends Box<T> implements Tag<T, String> {}\n`,
      { Foo: ['Bar', 'Baz'], Gen: ['Box', 'Tag'] }],
    ['.ts', `class Foo extends Bar implements Baz { m(){} }\ninterface I2 extends J, K { m(): void }\n`,
      { Foo: ['Bar', 'Baz'], I2: ['J', 'K'] }],
    ['.cs', `class Plain : Bar2, IQux { void M() {} }\nclass Gen<T> : AbstractValidator<T>, IThing { void M() {} }\n`,
      { Plain: ['Bar2', 'IQux'], Gen: ['AbstractValidator', 'IThing'] }],
    ['.py', `class Plain(Simple):\n    def h(self): pass\n`, { Plain: ['Simple'] }],
    ['.groovy', `class G extends H implements I { def m(){} }\n`, { G: ['H', 'I'] }],
    ['.cpp', `class Foo : public Bar, private Baz { void m(); };\n`, { Foo: ['Bar', 'Baz'] }],
    ['.php', `<?php class Foo extends Bar implements Baz { function m(){} }`, { Foo: ['Bar', 'Baz'] }],
    ['.rs', `trait T: Send + Sync { fn f(&self); }\n`, { T: ['Send', 'Sync'] }],
    ['.sol', `contract Plain is Base { function h() public {} }\n`, { Plain: ['Base'] }],
    ['.js', `class Foo extends Bar { m(){} }\n`, { Foo: ['Bar'] }],
  ];
  for (const [ext, src, expected] of cases) {
    const scopes = await typeScopes(ext, src);
    for (const [name, sup] of Object.entries(expected))
      assert.deepEqual(supOf(scopes, name), sup, `${ext} ${name}: a plain supertype must survive the heritage walk`);
  }
});

// ===== per-grammar canary: catch the NEXT language that has this shape =====

test('every grammar that can reach an ARGUMENT node from a heritage node is accounted for', async () => {
  // Derived from node-types.json, so adding or upgrading a grammar that introduces this shape fails here
  // and forces a decision rather than silently fabricating supertypes. Update the baseline only after
  // checking, per issue 049, whether the new grammar's argument node is a parent SPECIFICATION or a CALL.
  const heritageRe = /heritage|extends|implements|superclass|super_interfaces|base_|superclasses|argument_list|interface_clause|delegation_specifier|inheritance_specifier|trait_bounds/;
  const argRe = /(^|_)arg(ument)?s?(_list)?$/;
  const expected = {
    c: ['argument_list'], c_sharp: ['argument_list', 'attribute_argument_list', 'base_list', 'bracketed_argument_list', 'primary_constructor_base_type'],
    cpp: ['argument_list', 'base_class_clause'], go: ['argument_list'], groovy: ['annotation_argument_list'],
    java: ['annotation_argument_list'], kotlin: ['delegation_specifier', 'delegation_specifiers'], python: ['argument_list'],
    ruby: ['argument_list'], rust: ['trait_bounds'], scala: ['extends_clause'], solidity: ['inheritance_specifier'],
    tsx: ['class_heritage', 'extends_clause', 'extends_type_clause'], typescript: ['class_heritage', 'extends_clause', 'extends_type_clause'],
  };
  const actual = {};
  for (const f of readdirSync(GRAMMAR_DIR).filter(x => x.endsWith('.node-types.json')).sort()) {
    const g = f.replace(/^tree-sitter-|\.node-types\.json$/g, '');
    const nt = JSON.parse(readFileSync(join(GRAMMAR_DIR, f), 'utf8'));
    const byType = new Map(nt.map(n => [n.type, n]));
    const hit = [];
    for (const h of nt.filter(n => heritageRe.test(n.type)).map(n => n.type)) {
      const seen = new Set([h]); const q = [h]; let found = false;
      while (q.length && !found) {
        const n = byType.get(q.shift()); if (!n) continue;
        const kids = new Set();
        for (const fv of Object.values(n.fields || {})) for (const x of fv.types || []) kids.add(x.type);
        for (const x of (n.children?.types) || []) kids.add(x.type);
        for (const k of kids) { if (argRe.test(k)) { found = true; break; } if (!seen.has(k)) { seen.add(k); q.push(k); } }
      }
      if (found) hit.push(h);
    }
    if (hit.length) actual[g] = hit.sort();
  }
  assert.deepEqual(actual, expected,
    'a grammar gained (or lost) a heritage node that can reach an argument list — see issue 049 before updating this baseline');
});

test('exactly one grammar expresses a parent SPECIFICATION as an argument-shaped node', async () => {
  // This is the sole justification for `argument_list` living in `heritageRe`. If a second grammar ever
  // does the same, the field-name rule still handles it — but the reasoning in core.mjs must be revisited.
  const heritageRe = /heritage|extends|implements|superclass|super_interfaces|base_|superclasses|argument_list|interface_clause|delegation_specifier|inheritance_specifier|trait_bounds/;
  const argRe = /(^|_)arg(ument)?s?(_list)?$/;
  const found = [];
  for (const f of readdirSync(GRAMMAR_DIR).filter(x => x.endsWith('.node-types.json')).sort()) {
    const g = f.replace(/^tree-sitter-|\.node-types\.json$/g, '');
    for (const n of JSON.parse(readFileSync(join(GRAMMAR_DIR, f), 'utf8')))
      for (const [fn, fv] of Object.entries(n.fields || {}))
        if (heritageRe.test(fn) && (fv.types || []).some(x => argRe.test(x.type))) found.push(`${g}:${n.type}.${fn}`);
  }
  assert.deepEqual(found, ['python:class_definition.superclasses']);
});
