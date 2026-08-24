import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('falls back to emitting each list item when a group has NO common prefix `use ::{a, b};`', async () => {
  // A leading-`::` group has no usable prefix path, so the edge is preserved by emitting
  // each list item individually rather than being silently dropped.
  const { uses } = await run('use ::{a, b};');
  expect(specs(uses).sort()).toEqual(['a', 'b']);
});
