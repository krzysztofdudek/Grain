import { test } from 'node:test';
import { expect, javaResolve } from '../_unit-harness.mjs';

// Ported from the java-name-resolution-matrix suite's "declaration-key shape & resolver
// invariants (not expressible in runCase)" describe block — a direct resolveJavaFqn unit
// assertion, not a runCase catalogue case.

const ROOT = 'src/main/java';

/** A JavaResolveDeps over a fixed in-memory `.java` file universe (repo-rel POSIX). */
function depsOver(files) {
  return {
    exists: (p) => files.has(p),
    javaFilesIn: (dir) => {
      const prefix = dir === '' ? '' : dir + '/';
      return [...files].filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes('/'));
    },
  };
}

test('a single-type-import whose FQN is a package DIRECTORY (not a type file) → undefined (no package fall-through)', () => {
  // resolveJavaFqn does NO package fall-through: a TYPE hint whose FQN is actually a
  // directory of `.java` resolves to nothing. (The wildcard branch handles packages.)
  const files = new Set([
    `${ROOT}/com/acme/audit/AuditLog.java`,
    `${ROOT}/com/acme/audit/AuditWriter.java`,
  ]);
  const deps = depsOver(files);
  expect(javaResolve.resolveJavaFqn('com.acme.audit', `${ROOT}/com/app/Use.java`, deps)).toBeUndefined();
});
