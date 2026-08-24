import { test } from 'node:test';
import { expect, javaResolve, makeResolver, SymbolTable } from '../_unit-harness.mjs';

// Ported from the java-name-resolution-matrix suite's "declaration-key shape & resolver
// invariants (not expressible in runCase)" describe block — a direct resolver assertion,
// not a runCase catalogue case.

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

test('a resolved-but-UNMAPPED .java is a coverage matter → absent (silence), never a violation (not expressible in runCase)', async () => {
  // The runCase harness maps EVERY embedded file to its parent-dir node, so a
  // resolved-but-unowned file is unreachable there. Verified directly: the resolver
  // returns `absent` when ownerOf yields undefined for the resolved file.
  const files = new Set([`${ROOT}/com/unmapped/Target.java`]);
  const deps = depsOver(files);
  const r = makeResolver({
    ownerIndex: { ownerOf: () => undefined },
    symbolTable: new SymbolTable(),
    resolvePathToFile: (specifier, fromFile, language, isPackage) =>
      isPackage ? undefined : javaResolve.resolveJavaFqn(specifier, fromFile, deps),
  });
  expect(
    r.classify({ kind: 'path', specifier: 'com.unmapped.Target' }, `${ROOT}/com/app/Use.java`, 'java'),
  ).toEqual({ kind: 'absent' });
});
