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

test('returns undefined for a type FQN whose path is a DIRECTORY of .java files', () => {
  // com.acme.audit is a package directory, NOT a type. A single-type hint
  // (isPackage absent) must not resolve it as a package — the old fall-through
  // would have returned a representative .java; the guard returns undefined.
  expect(javaResolve.resolveJavaFqn('com.acme.audit', FROM, deps)).toBeUndefined();
});
