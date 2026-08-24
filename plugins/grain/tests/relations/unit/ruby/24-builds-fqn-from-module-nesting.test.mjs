// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — declarations() build FQNs from nesting
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);

test('builds App::Services::OrderService from module nesting', async () => {
  const { declarations } = await run(
    ['module App', '  module Services', '    class OrderService', '    end', '  end', 'end', ''].join('\n'),
  );
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('App');
  expect(keys).toContain('App::Services');
  expect(keys).toContain('App::Services::OrderService');
});
