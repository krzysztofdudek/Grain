import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('deduplicates a class repeated in one grouped use on the same line (`{Foo, Foo}`)', async () => {
  const { uses } = await run('<?php\nuse App\\Pkg\\{Foo, Foo};\nclass C {}\n');
  // Same FQN, same line → one hint, not two.
  expect(specs(uses).filter((x) => x === 'App\\Pkg\\Foo')).toHaveLength(1);
});
