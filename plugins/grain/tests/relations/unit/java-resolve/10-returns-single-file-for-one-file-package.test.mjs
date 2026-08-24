import { test } from 'node:test';
import { expect, javaResolve } from '../_unit-harness.mjs';

const files = new Set([
  'src/main/java/com/acme/payments/PaymentService.java',
  'src/main/java/com/acme/audit/AuditLog.java',
  'src/main/java/com/acme/audit/AuditWriter.java',
  'src/main/java/com/foo/Outer.java',
  'src/main/java/com/acme/app/OrderHandler.java',
]);

const deps = {
  exists: (p) => files.has(p),
  javaFilesIn: (dir) => {
    const prefix = dir === '' ? '' : dir + '/';
    return [...files].filter(
      (f) => f.startsWith(prefix) && !f.slice(prefix.length).includes('/'),
    );
  },
};

const FROM = 'src/main/java/com/acme/app/OrderHandler.java';

test('returns the single file for a one-file package', () => {
  // com.acme.payments has exactly one .java.
  expect(javaResolve.resolveJavaPackageFiles('com.acme.payments', FROM, deps)).toEqual([
    'src/main/java/com/acme/payments/PaymentService.java',
  ]);
});
