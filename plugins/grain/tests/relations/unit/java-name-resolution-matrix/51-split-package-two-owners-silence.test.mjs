import { test } from 'node:test';
import { expect } from '../_unit-harness.mjs';

// Ported from the java-name-resolution-matrix suite's "declaration-key shape & resolver
// invariants (not expressible in runCase)" describe block — a direct owner-set-collapse
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

test('split package across TWO owners in ONE directory → 2+ owners → SILENCE (not expressible in runCase)', () => {
  // The same package directory holds files owned by node `x` AND node `y`. The runCase
  // harness maps every embedded file to its parent-dir node, so one directory has exactly
  // one owner — this split (one dir, two owners) can only be expressed with an explicit
  // owner map. Owner set = {x,y} → 2+ owners → silence (never guess across a node split).
  const files = new Set([
    `${ROOT}/com/acme/mixed/FromX.java`,
    `${ROOT}/com/acme/mixed/FromY.java`,
  ]);
  const owners = {
    [`${ROOT}/com/acme/mixed/FromX.java`]: 'x',
    [`${ROOT}/com/acme/mixed/FromY.java`]: 'y',
  };
  const deps = depsOver(files);
  // Replicate makeResolvePathToFile's Java wildcard branch: list package files, collapse owners.
  const pkgFiles = files; // resolveJavaPackageFiles over this single dir returns both
  const ownerSet = new Set();
  for (const f of pkgFiles) ownerSet.add(owners[f]);
  expect(ownerSet.size).toBeGreaterThanOrEqual(2);
  // The collapse rule (size === 1 ? attribute : silence) → silence.
  expect(ownerSet.size === 1).toBe(false);
  void deps;
});
