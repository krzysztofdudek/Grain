import { test } from 'node:test';
import { expect, javaResolve } from '../_unit-harness.mjs';

// Fixed resolution universe (repo-relative POSIX). Two source roots are present —
// a flat `src/main/java/...` Maven layout and a sibling `lib/...` root — to prove
// the ancestor-source-root search works regardless of layout.
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

test('resolves a type FQN via an ancestor source root', () => {
  expect(javaResolve.resolveJavaFqn('com.acme.payments.PaymentService', FROM, deps)).toBe(
    'src/main/java/com/acme/payments/PaymentService.java',
  );
});
