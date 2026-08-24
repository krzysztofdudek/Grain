import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('does NOT resolve via an ancestor include/ root (speculative walk dropped)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'c-include-resolve-'));
  try {
    mkdirSync(path.join(root, 'src', 'a'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'a', 'foo.c'), '#include "../inc/bar.h"\n', 'utf-8');
    // A header reachable via the `include/` root convention from src/a (src/a/include/root.h),
    // and one via an ancestor `include/` dir (include/proj/widget.h at repo root).
    mkdirSync(path.join(root, 'include', 'proj'), { recursive: true });
    writeFileSync(path.join(root, 'include', 'proj', 'widget.h'), '/* widget */\n', 'utf-8');

    // From src/a/foo.c, "proj/widget.h" is not under src/a. It exists only at
    // <root>/include/proj/widget.h — reachable solely through the old ancestor
    // include-root walk, which is gone. A real -Iinclude flag the resolver cannot
    // see would resolve this; without it we stay silent rather than guess.
    const resolve = makeResolvePathToFile(root);
    expect(resolve('proj/widget.h', 'src/a/foo.c', 'c')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
