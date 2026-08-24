// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — uses() emits SYMBOL hints (not path hints)')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);
const symbolKeys = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('IGNORES the alias of `import ... as B` — the hint is the real FQN', async () => {
  const { uses } = await run('import com.acme.util.Helpers as H\nclass C\n');
  const keys = symbolKeys(uses);
  expect(keys).toContain('com.acme.util.Helpers');
  // The alias `H` is a local binding only — never the dependency target.
  expect(keys).not.toContain('H');
  expect(keys.every((k) => !k.includes(' as '))).toBe(true);
});
