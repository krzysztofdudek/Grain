// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — uses() emits SYMBOL hints (not path hints)')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);
const symbolKeys = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('emits a SYMBOL hint for an inline fully-qualified TYPE reference (type position is shadow-free)', async () => {
  // A multi-segment user_type written inline in a TYPE position — supertype list,
  // by-delegation supertype, property / parameter / return type — is a fully-qualified
  // name with exactly one meaning, so it resolves through the SymbolTable like an import.
  const { uses } = await run(
    [
      'package com.acme.app',
      'class C : com.acme.base.Base(), com.acme.flow.Flowable by delegate {',
      '  val r: com.acme.model.Repo? = null',
      '  fun m(l: com.acme.metrics.Logger): com.acme.model.Result = TODO()',
      '}',
      '',
    ].join('\n'),
  );
  const keys = symbolKeys(uses);
  expect(keys).toContain('com.acme.base.Base'); // superclass
  expect(keys).toContain('com.acme.flow.Flowable'); // by-delegation supertype
  expect(keys).toContain('com.acme.model.Repo'); // property type
  expect(keys).toContain('com.acme.metrics.Logger'); // parameter type
  expect(keys).toContain('com.acme.model.Result'); // return type
  // The hints are SYMBOL hints (Kotlin resolves through the SymbolTable, never a path).
  expect(uses.every((u) => u.candidates[0].kind === 'symbol')).toBe(true);
});
