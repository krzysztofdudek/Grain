import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('does NOT resolve a header bare at an ancestor root (walk dropped)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'c-include-resolve-'));
  try {
    mkdirSync(path.join(root, 'src', 'a'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'a', 'foo.c'), '#include "../inc/bar.h"\n', 'utf-8');
    // A header sitting bare at the repo root (no include/ dir).
    writeFileSync(path.join(root, 'top.h'), '/* top */\n', 'utf-8');

    // From src/a/foo.c, "top.h" exists only as <root>/top.h — a same-basename
    // file at an ancestor root. The old walk would have grabbed it (a decoy);
    // the canonical-relative-only resolver returns undefined.
    const resolve = makeResolvePathToFile(root);
    expect(resolve('top.h', 'src/a/foo.c', 'c')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
