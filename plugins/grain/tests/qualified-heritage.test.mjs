// Regression test for a FABRICATED-supertype bug (issue 062): when a heritage clause's base type is a
// QUALIFIED/MEMBER-EXPRESSION name (`ns.Base`, a Java/Groovy FQN, …), `extractScopes`'s heritage walk matched
// identifier-shaped node types naively across the whole clause subtree and picked up the NAMESPACE half of the
// chain (`ns`, `com.google.inject`) instead of — or, for C#'s `qualified_name`, in addition to — the actual
// type/member name. openzeppelin-contracts' `test/helpers/signers.js:6` (`extends ethers.AbstractSigner`)
// recorded `ethers`; a Java fully-qualified base class (`extends com.google.inject.AbstractModule`) recorded
// the wrong segment the same way. Same failure CLASS as §049 (wrong identifier out of a compound heritage
// clause, fixed there for a constructor-call argument) — here for the member-access/scoped-name shape.
//
// Fixed by deriving, per grammar and purely from node-types.json's own field shapes (`b.qualName` in
// core.mjs's `bindingFor`, never a language name), which node types are "qualified/member name" chains — and,
// within one, walking to its LAST name-shaped child instead of collecting every identifier reachable inside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

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

// ===== the reported defect, per grammar =====

test('JavaScript: `extends ethers.AbstractSigner` records AbstractSigner, never the namespace `ethers`', async () => {
  const scopes = await typeScopes('.js', `import { ethers } from "ethers";
class Foo extends ethers.AbstractSigner {
  run() {}
}
`);
  assert.deepEqual(supOf(scopes, 'Foo'), ['AbstractSigner'],
    '`ethers` is the imported namespace, not a base type — only the member is a real supertype');
});

test('TypeScript: `implements ns.Base` (nested_identifier) and `extends ns.IBase` (nested_type_identifier) both keep only the tail', async () => {
  const scopes = await typeScopes('.ts', `class Foo implements ns.Base {
  m(): void {}
}
interface IFoo extends ns.IBase {
  n(): void;
}
`);
  assert.deepEqual(supOf(scopes, 'Foo'), ['Base']);
  assert.deepEqual(supOf(scopes, 'IFoo'), ['IBase']);
});

test('Java: a fully-qualified base class (`extends com.google.inject.AbstractModule`) records only AbstractModule', async () => {
  const scopes = await typeScopes('.java', `public class GuiceApplicationLoaderTest extends com.google.inject.AbstractModule {
  void m() {}
}
`);
  assert.deepEqual(supOf(scopes, 'GuiceApplicationLoaderTest'), ['AbstractModule'],
    'none of com/google/inject — the intermediate package segments — may leak into sup');
});

test('Groovy: the same Java-shaped FQN heritage keeps only the last segment', async () => {
  const scopes = await typeScopes('.groovy', `class Foo extends com.example.pkg.Base {
  def m() {}
}
`);
  assert.deepEqual(supOf(scopes, 'Foo'), ['Base']);
});

test('C#: `class Foo : Ns.Base` (qualified_name) records Base, not `Ns.Base` or `Ns`', async () => {
  const scopes = await typeScopes('.cs', `class Foo : Ns.Base {
  void M() {}
}
`);
  assert.deepEqual(supOf(scopes, 'Foo'), ['Base']);
});

test('C#: a qualified name combined with a generic base (`Ns.AbstractValidator<T>`) keeps only AbstractValidator', async () => {
  const scopes = await typeScopes('.cs', `class Gen<T> : Ns.AbstractValidator<T>, IThing {
  void M() {}
}
`);
  assert.deepEqual(supOf(scopes, 'Gen'), ['AbstractValidator', 'IThing'],
    'neither the namespace `Ns` nor the type argument `T` is a base type');
});

test('Kotlin: a delegation specifier with a qualified base (`: ns.Base()`) records Base, not ns', async () => {
  const scopes = await typeScopes('.kt', `class Foo : ns.Base() {
  fun m() = 1
}
`);
  assert.deepEqual(supOf(scopes, 'Foo'), ['Base']);
});

test('Scala: `extends ns.Base` (stable_type_identifier) records Base, not ns', async () => {
  const scopes = await typeScopes('.scala', `class Foo extends ns.Base {
  def m() = 1
}
`);
  assert.deepEqual(supOf(scopes, 'Foo'), ['Base']);
});

test('Scala: a qualified base combined with constructor forwarding (§049 shape) keeps only the type', async () => {
  const scopes = await typeScopes('.scala', `class HomeController(cc: Int) extends pkg.AbstractController(cc) {
  def f() = 1
}
`);
  assert.deepEqual(supOf(scopes, 'HomeController'), ['AbstractController'],
    'neither `pkg` (the namespace) nor `cc` (the §049 constructor argument) is a base type');
});

test('Ruby: `class Foo < Bar::Baz` (scope_resolution) records Baz, not Bar', async () => {
  const scopes = await typeScopes('.rb', `class Foo < Bar::Baz
  def m
  end
end
`);
  assert.deepEqual(supOf(scopes, 'Foo'), ['Baz']);
});

// ===== the guard: plain (non-qualified) heritage must be entirely unaffected =====

test('GUARD: an ordinary, non-qualified supertype is still recorded in every affected grammar', async () => {
  const cases = [
    ['.js', `class Foo extends Bar { m(){} }\n`, { Foo: ['Bar'] }],
    ['.ts', `class Foo extends Bar implements Baz { m(){} }\ninterface I2 extends J, K { m(): void }\n`,
      { Foo: ['Bar', 'Baz'], I2: ['J', 'K'] }],
    ['.java', `class Foo extends Bar implements Baz {}\n`, { Foo: ['Bar', 'Baz'] }],
    ['.groovy', `class G extends H implements I { def m(){} }\n`, { G: ['H', 'I'] }],
    ['.cs', `class Plain : Bar2, IQux { void M() {} }\n`, { Plain: ['Bar2', 'IQux'] }],
    ['.kt', `class P : Q {\n  fun m() = 5\n}\n`, { P: ['Q'] }],
    ['.scala', `class Plain extends BaseThing { def f() = 1 }\n`, { Plain: ['BaseThing'] }],
    ['.rb', `class Foo < Bar\n  def m\n  end\nend\n`, { Foo: ['Bar'] }],
  ];
  for (const [ext, src, expected] of cases) {
    const scopes = await typeScopes(ext, src);
    for (const [name, sup] of Object.entries(expected))
      assert.deepEqual(supOf(scopes, name), sup, `${ext} ${name}: a plain supertype must survive unchanged`);
  }
});
