// §033 — `auto.extends:X` is rendered "extend" for every heritage relationship, in every language, even where the
// target is an INTERFACE the class only `implements` (PHP/Java/TS all distinguish the two keywords syntactically).
// The pid stays `auto.extends:` (see the issue — renaming it is a breaking change to a published schema for a
// cosmetic gain); only the SENTENCE changes, and only where the grammar's own AST already carries the distinction
// (bindingFor's extendsClauseRe/implementsClauseRe, core.mjs). Where it doesn't — C#'s single undifferentiated
// `base_list`, Kotlin/Rust/Scala's one shared clause, Go's implicit interfaces, Python's single inheritance model —
// the relationship is left unclassified (`s.supKind` carries no entry for that name) and verbalize/deviationPhrase
// fall back to their pre-existing "extend"/"extends" wording, byte-identical to before this fact existed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes, verbalize, deviationPhrase } from '../engine/core.mjs';

async function typeScope(ext, src, name) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  return extractScopes('X' + ext, tree, b, p._g).find(s => s.kind === 'type' && s.name === name);
}

// ---- extraction: is the distinction actually there in the AST, per grammar? ----

test('PHP: `implements` is classified impl, `extends` is classified ext (base_clause vs class_interface_clause)', async () => {
  const impl = await typeScope('.php', `<?php interface MiddlewareInterface {}\nclass ErrorMiddleware implements MiddlewareInterface { function process() {} }\n`, 'ErrorMiddleware');
  assert.deepEqual(impl.sup, ['MiddlewareInterface']);
  assert.equal(impl.supKind.MiddlewareInterface, 'impl');
  const ext = await typeScope('.php', `<?php class Base {}\nclass Child extends Base {}\n`, 'Child');
  assert.deepEqual(ext.sup, ['Base']);
  assert.equal(ext.supKind.Base, 'ext');
});

test('Java: superclass -> ext, super_interfaces (implements) -> impl, extends_interfaces (interface extends interface) -> ext', async () => {
  const cls = await typeScope('.java', `class Foo extends Base implements Runnable, Closeable {}\n`, 'Foo');
  assert.deepEqual(new Set(cls.sup), new Set(['Base', 'Runnable', 'Closeable']));
  assert.equal(cls.supKind.Base, 'ext');
  assert.equal(cls.supKind.Runnable, 'impl');
  assert.equal(cls.supKind.Closeable, 'impl');
  const iface = await typeScope('.java', `interface Sub extends Sup {}\n`, 'Sub');
  assert.equal(iface.supKind.Sup, 'ext'); // a real `extends` keyword between two interfaces — genuinely "extends", not "implements"
});

test('TypeScript: extends_clause -> ext, implements_clause -> impl (both nested inside the class_heritage wrapper)', async () => {
  const s = await typeScope('.ts', `class Guard extends Base implements CanActivate, Loggable {}\n`, 'Guard');
  assert.deepEqual(new Set(s.sup), new Set(['Base', 'CanActivate', 'Loggable']));
  assert.equal(s.supKind.Base, 'ext');
  assert.equal(s.supKind.CanActivate, 'impl');
  assert.equal(s.supKind.Loggable, 'impl');
});

test('C#: base_list holds the base class and every implemented interface with no syntactic marker at all — left unclassified', async () => {
  const s = await typeScope('.cs', `class Foo : Base, IBar, IBaz {}\n`, 'Foo');
  assert.deepEqual(new Set(s.sup), new Set(['Base', 'IBar', 'IBaz']));
  for (const name of ['Base', 'IBar', 'IBaz']) assert.equal(s.supKind[name], undefined, `${name} must stay unclassified — C# has no clause-level extends/implements distinction`);
});

test('Go: implicit interfaces — no node type of its own matches either classification regex (extendsClauseRe/implementsClauseRe)', async () => {
  const p = await getParser('.go'); const b = bindingFor(p._g);
  assert.deepEqual([...b.nodeTypes].filter(t => b.extendsClauseRe.test(t) || b.implementsClauseRe.test(t)), []);
});

test('Rust: a supertrait bound (`trait Sub: Super`) is left unclassified — trait_bounds carries no extends/implements marker', async () => {
  const s = await typeScope('.rs', `trait Super {}\ntrait Sub: Super {}\n`, 'Sub');
  assert.ok(s.sup.includes('Super'), `expected Super in sup, got ${JSON.stringify(s.sup)}`);
  assert.equal(s.supKind.Super, undefined);
});

test('Python: single-inheritance model, dedicated `superclasses` field — classified ext (single-inheritance-shaped, no interfaces to conflate with)', async () => {
  const s = await typeScope('.py', `class Base:\n    pass\n\nclass Child(Base):\n    pass\n`, 'Child');
  assert.deepEqual(s.sup, ['Base']);
  assert.equal(s.supKind.Base, 'ext');
});

// ---- rendering: verbalize/deviationPhrase read `f.heritageKind` off the fact object, never guess ----

test('verbalize: an unclassified target (no heritageKind, or heritageKind undefined) renders "extend" — the pre-existing wording, byte-identical', () => {
  const f = { pid: 'auto.extends:IFoo', exp: 'true', kind: 'type' };
  assert.equal(verbalize(f, ['X']), 'types here extend `IFoo`');
  const fFalse = { pid: 'auto.extends:IFoo', exp: 'false', kind: 'type' };
  assert.equal(verbalize(fFalse, ['X']), 'types here do not extend `IFoo`');
});

test('verbalize: heritageKind "impl" renders "implement", never "extend"', () => {
  const f = { pid: 'auto.extends:MiddlewareInterface', exp: 'true', kind: 'type', heritageKind: 'impl' };
  assert.equal(verbalize(f, ['ErrorMiddleware']), 'types here implement `MiddlewareInterface`');
  const fFalse = { pid: 'auto.extends:MiddlewareInterface', exp: 'false', kind: 'type', heritageKind: 'impl' };
  assert.equal(verbalize(fFalse, ['X']), 'types here do not implement `MiddlewareInterface`');
});

test('verbalize: heritageKind "ext" (explicit) still renders "extend" — genuine inheritance keeps its word', () => {
  const f = { pid: 'auto.extends:BaseDto', exp: 'true', kind: 'type', heritageKind: 'ext' };
  assert.equal(verbalize(f, ['CartDto']), 'types here extend `BaseDto`');
});

test('deviationPhrase: mirrors verbalize\'s choice of verb for both polarities', () => {
  const implFact = { pid: 'auto.extends:MiddlewareInterface', exp: 'true', heritageKind: 'impl' };
  assert.equal(deviationPhrase(implFact, 'false'), 'does not implement `MiddlewareInterface`');
  const implFactNeg = { pid: 'auto.extends:MiddlewareInterface', exp: 'false', heritageKind: 'impl' };
  assert.equal(deviationPhrase(implFactNeg, 'true'), 'implements `MiddlewareInterface`');
  const extFact = { pid: 'auto.extends:BaseDto', exp: 'true' }; // no heritageKind at all — must not throw, must fall back
  assert.equal(deviationPhrase(extFact, 'false'), 'does not extend `BaseDto`');
});
