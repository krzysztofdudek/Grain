// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — uses() emits SYMBOL hints (not path hints)')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);

test('emits NOTHING for EXPRESSION-position references (ctor call, qualified call, `::member`, `::class`)', async () => {
  // An EXPRESSION-position reference — a constructor call, a qualified member call, a
  // `::member` callable reference, a `::class` literal — parses as a navigation_expression /
  // member-access chain that is indistinguishable from `localVariable.field.method`, so
  // binding it could pick the wrong target. It is deliberately left silent (zero-FP boundary).
  const { uses } = await run(
    [
      'package com.acme.app',
      'fun m() {',
      '  val t = com.acme.metrics.Timer()',
      '  com.acme.audit.AuditLog.record("x")',
      '  val ref = com.acme.util.Helpers::format',
      '  val k = com.acme.model.Order::class',
      '}',
      '',
    ].join('\n'),
  );
  expect(uses).toHaveLength(0);
});
