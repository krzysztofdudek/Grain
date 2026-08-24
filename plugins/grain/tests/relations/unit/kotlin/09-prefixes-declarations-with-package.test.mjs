// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — declarations() produce <package>.<Name> FQN keys')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);

test('prefixes class / interface / object / function / property / typealias with the package', async () => {
  const { declarations } = await run(
    [
      'package com.acme.app',
      'class Foo',
      'interface Bar',
      'object Baz',
      'fun qux() {}',
      'val quux = 1',
      'typealias Money = Long',
      '',
    ].join('\n'),
  );
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('com.acme.app.Foo');
  expect(keys).toContain('com.acme.app.Bar'); // interface parses as class_declaration
  expect(keys).toContain('com.acme.app.Baz');
  expect(keys).toContain('com.acme.app.qux');
  expect(keys).toContain('com.acme.app.quux');
  expect(keys).toContain('com.acme.app.Money');
});
