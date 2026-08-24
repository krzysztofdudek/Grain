import { test } from 'node:test';
import { expect, javaResolve } from '../_unit-harness.mjs';

const FROM = 'src/main/java/com/acme/app/OrderHandler.java';

const typePath = 'src/main/java/com/foo/Outer/Inner.java'; // the FQN's own (unusual) file
const parentTypePath = 'src/main/java/com/foo/Outer.java'; // the enclosing type's file
function nestedDeps(isExcluded) {
  const nestedFiles = new Set([typePath, parentTypePath]);
  return {
    exists: (p) => nestedFiles.has(p),
    javaFilesIn: () => [],
    isExcluded,
  };
}

test('excluding the parentTypePath candidate leaves the typePath resolution unaffected', () => {
  const isExcluded = (p) => p === parentTypePath;
  expect(javaResolve.resolveJavaFqn('com.foo.Outer.Inner', FROM, nestedDeps(isExcluded))).toBe(typePath);
});
