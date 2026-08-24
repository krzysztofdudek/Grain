import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('strips the alias of a renamed `use crate::db::Repository as Repo;`', async () => {
  const { uses } = await run('use crate::db::Repository as Repo;');
  const s = specs(uses);
  expect(s).toContain('crate::db::Repository');
  expect(s).not.toContain('Repo');
});
