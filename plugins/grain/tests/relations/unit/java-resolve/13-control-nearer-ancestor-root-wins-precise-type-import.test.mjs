import { test } from 'node:test';
import { expect, javaResolve } from '../_unit-harness.mjs';

const FROM = 'src/main/java/com/acme/app/OrderHandler.java';

// Two ancestor source roots both hold the same FQN's file — a half-migrated or flat
// layout, not a normal multi-module Maven tree. Unlike Python's/PHP's multi-root
// search, Java's ancestor walk is nearest-first-wins, never "collect and decide
// ambiguous": the importer at src/main/java/com/app/Main.java climbs its own
// ancestor chain, so 'src/main/java/com/a/Zzz.java' (found at the 'src/main/java'
// ancestor) is NEARER than 'src/com/a/Zzz.java' (found only at the 'src' ancestor,
// one hop further up) and wins whenever both exist.
const nearFile = 'src/main/java/com/a/Zzz.java';
const farFile = 'src/com/a/Zzz.java';
const shadowFiles = new Set([nearFile, farFile]);
function shadowDeps(isExcluded) {
  return {
    exists: (p) => shadowFiles.has(p),
    javaFilesIn: (dir) => {
      const prefix = dir === '' ? '' : dir + '/';
      return [...shadowFiles].filter(
        (f) => f.startsWith(prefix) && !f.slice(prefix.length).includes('/'),
      );
    },
    isExcluded,
  };
}

test('control: with nothing excluded, the nearer ancestor root wins a precise type import', () => {
  expect(javaResolve.resolveJavaFqn('com.a.Zzz', FROM, shadowDeps())).toBe(nearFile);
});
