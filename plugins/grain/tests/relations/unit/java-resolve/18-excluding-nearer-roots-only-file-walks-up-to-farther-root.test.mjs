import { test } from 'node:test';
import { expect, javaResolve } from '../_unit-harness.mjs';

const FROM = 'src/main/java/com/acme/app/OrderHandler.java';

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

test("excluding the nearer root's only file lets a wildcard import walk up to the farther root", () => {
  const isExcluded = (p) => p === nearFile;
  expect(javaResolve.resolveJavaPackageFiles('com.a', FROM, shadowDeps(isExcluded))).toEqual([farFile]);
});
