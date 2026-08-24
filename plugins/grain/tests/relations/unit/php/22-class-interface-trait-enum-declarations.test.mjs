import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);

test('returns class / interface / trait / enum names', async () => {
  const { declarations } = await run(
    ['<?php', 'class Foo {}', 'interface Bar {}', 'trait Baz {}', 'enum Qux {}', ''].join('\n'),
  );
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('Foo');
  expect(keys).toContain('Bar');
  expect(keys).toContain('Baz');
  expect(keys).toContain('Qux');
});
