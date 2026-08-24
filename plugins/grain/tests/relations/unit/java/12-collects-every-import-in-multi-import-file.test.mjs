import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('collects every import in a multi-import file', async () => {
  const { uses } = await run(
    [
      'package com.acme.app;',
      'import com.acme.a.Alpha;',
      'import com.acme.b.Beta;',
      'class C {}',
      '',
    ].join('\n'),
  );
  const s = specs(uses);
  expect(s).toContain('com.acme.a.Alpha');
  expect(s).toContain('com.acme.b.Beta');
});
