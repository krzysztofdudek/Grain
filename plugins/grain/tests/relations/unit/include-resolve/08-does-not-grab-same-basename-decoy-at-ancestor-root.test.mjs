import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('does NOT grab a same-basename decoy at an ancestor root when the relative join misses', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'c-include-resolve-'));
  try {
    mkdirSync(path.join(root, 'src', 'a'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'a', 'foo.c'), '#include "../inc/bar.h"\n', 'utf-8');

    // src/a/foo.c includes "bar.h". A real sibling does NOT exist next to foo.c, but a
    // same-basename decoy lives at <root>/include/proj — created here to model the trap.
    mkdirSync(path.join(root, 'include', 'proj'), { recursive: true });
    writeFileSync(path.join(root, 'include', 'proj', 'bar.h'), '/* decoy */\n', 'utf-8');

    // The relative join <root>/src/a/bar.h misses; with the walk dropped, the decoy is
    // never reached → silence (the old resolver would have returned a wrong path).
    const resolve = makeResolvePathToFile(root);
    expect(resolve('bar.h', 'src/a/foo.c', 'c')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
