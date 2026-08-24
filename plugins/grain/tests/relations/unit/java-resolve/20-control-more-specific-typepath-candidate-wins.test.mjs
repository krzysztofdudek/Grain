import { test } from 'node:test';
import { expect, javaResolve } from '../_unit-harness.mjs';

const FROM = 'src/main/java/com/acme/app/OrderHandler.java';

// The exclusion tests above all shadow across TWO ancestor ROOTS (near vs far).
// None of them exercise the OTHER candidate list resolveType tries per root: the
// nested-type longest-match fallback (typePath, then parentTypePath) AT THE SAME
// root. The file's own doc comment promises an excluded candidate is skipped and
// the search "keeps walking (the same candidate list at the current ancestor
// root, then further-out roots)" — this pins the first half of that sentence,
// which nothing above touches: an excluded typePath must fall through to a live
// parentTypePath in the SAME root, not skip straight to a farther root.
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

test('control: with nothing excluded, the more specific typePath candidate wins over parentTypePath', () => {
  expect(javaResolve.resolveJavaFqn('com.foo.Outer.Inner', FROM, nestedDeps())).toBe(typePath);
});
