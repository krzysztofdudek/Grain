import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('keeps both classes in a per-clause-typed group with no function/const clause (positive guard)', async () => {
  // POSITIVE / anti-over-silencing: a perfectly ordinary grouped class import
  // must still emit BOTH class hints. The per-clause guard must not silence
  // clauses that carry no function/const token.
  const { uses } = await run('<?php\nuse App\\Payment\\{Charge, Refund};\nclass C {}\n');
  const s = specs(uses);
  expect(s).toContain('App\\Payment\\Charge');
  expect(s).toContain('App\\Payment\\Refund');
  expect(s).toHaveLength(2);
});
