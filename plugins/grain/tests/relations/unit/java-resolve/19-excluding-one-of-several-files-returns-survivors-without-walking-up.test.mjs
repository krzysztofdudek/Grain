import { test } from 'node:test';
import { expect, javaResolve } from '../_unit-harness.mjs';

const FROM = 'src/main/java/com/acme/app/OrderHandler.java';

const nearFile = 'src/main/java/com/a/Zzz.java';
const farFile = 'src/com/a/Zzz.java';

test("excluding one of several files in the nearer root's directory returns the survivors, without walking up", () => {
  const twoFiles = new Set([nearFile, 'src/main/java/com/a/Yyy.java', farFile]);
  const deps2 = {
    exists: (p) => twoFiles.has(p),
    javaFilesIn: (dir) => {
      const prefix = dir === '' ? '' : dir + '/';
      return [...twoFiles].filter(
        (f) => f.startsWith(prefix) && !f.slice(prefix.length).includes('/'),
      );
    },
    isExcluded: (p) => p === nearFile,
  };
  expect(javaResolve.resolveJavaPackageFiles('com.a', FROM, deps2)).toEqual(['src/main/java/com/a/Yyy.java']);
});
