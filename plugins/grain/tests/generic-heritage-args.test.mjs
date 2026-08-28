// Regression test for a phantom-supertype bug: `extractScopes`'s heritage walk collected every
// identifier under a base/heritage clause with no regard for generic type ARGUMENTS, so a class
// like `SearchQueryValidator<...> : AbstractValidator<TQuery>` recorded `TQuery` — a generic
// argument filling a slot in the base type, not a base type itself — into `sup`. That corrupts
// the `auto.extends:` fact family, the marker index (`where` results), `carries: extends X`
// lines and the `types here extend X — N%` convention cards for every generics-capable
// language (confirmed on a real production C# codebase, where `AbstractValidator<TQuery>`
// polluted the marker index with phantom supertypes `TColumnId`, `TFilter`, `TQuery`, …).
// Fixed by excluding identifiers nested under a generic/template argument-list node
// (core.mjs `genArgRe`) from the heritage walk, structurally, for every supported grammar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

async function typeScope(ext, src, name) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  return extractScopes('X' + ext, tree, b, p._g).find(s => s.kind === 'type' && s.name === name);
}

test('C#: a generic type ARGUMENT in the base-list (`AbstractValidator<TQuery>`) is not a phantom supertype', async () => {
  const s = await typeScope('.cs', `public class SearchQueryValidator<TColumnId, TFilter, TResponse, TQuery, TFilterValidator>
    : AbstractValidator<TQuery>
    where TColumnId : struct, Enum
{
    public SearchQueryValidator() {}
}
`, 'SearchQueryValidator');
  assert.ok(s.sup.includes('AbstractValidator'), `expected AbstractValidator in sup, got ${JSON.stringify(s.sup)}`);
  assert.ok(!s.sup.includes('TQuery'), `TQuery is a generic argument, not a base type: sup = ${JSON.stringify(s.sup)}`);
  for (const own of ['TColumnId', 'TFilter', 'TResponse', 'TFilterValidator'])
    assert.ok(!s.sup.includes(own), `the type's own declared type parameter \`${own}\` must never appear in sup: sup = ${JSON.stringify(s.sup)}`);
});

test('Java: generic type ARGUMENTS in extends/implements clauses are excluded from sup, the base types are kept', async () => {
  const s = await typeScope('.java', `class Foo<T> extends Bar<T> implements Baz<T, String> {}\n`, 'Foo');
  assert.deepEqual(s.sup, ['Bar', 'Baz']);
});
