import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);

test('emits a SYMBOL hint for an inline fully-qualified TYPE reference (extends), but NOT for expression-position dotted calls or same-package bare names', async () => {
  // The inline fully-qualified TYPE reference `extends com.acme.base.Base` is the
  // outermost `scoped_type_identifier` in a TYPE position. A fully-qualified name is
  // shadow-free (JLS §6.5.5.2), so it now emits a `symbol` hint that resolves through
  // the shared SymbolTable like an import. The EXPRESSION-position dotted static call
  // `com.acme.audit.AuditLog.record(...)` parses as a field_access/method_invocation
  // chain — never a `scoped_type_identifier` — so it emits NOTHING (the zero-FP boundary);
  // the bare same-package supertype `Other` is a simple name, also no hint.
  const { uses } = await run(
    [
      'package com.acme.app;',
      'class C extends com.acme.base.Base implements com.acme.flow.Flowable {',
      '  void m() {',
      '    Object o = new com.acme.metrics.Timer();',
      '    com.acme.audit.AuditLog.record("x");',
      '  }',
      '}',
      'class D extends Other {}',
      '',
    ].join('\n'),
  );
  const symbolKeys = uses.flatMap((u) =>
    u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : [],
  );
  // Inline fully-qualified TYPE references → symbol hints (the type-position forms).
  expect(symbolKeys).toContain('com.acme.base.Base'); // extends
  expect(symbolKeys).toContain('com.acme.flow.Flowable'); // implements
  expect(symbolKeys).toContain('com.acme.metrics.Timer'); // new type
  // EVERY emitted hint here is a TYPE-position symbol hint, none a path hint.
  expect(uses.every((u) => u.candidates[0].kind === 'symbol')).toBe(true);
  // Expression-position dotted static call → NO hint (field_access/method_invocation chain).
  expect(symbolKeys.some((k) => k.startsWith('com.acme.audit'))).toBe(false);
  // Same-package bare simple-name supertype `Other` → NO hint.
  expect(symbolKeys).not.toContain('Other');
});
