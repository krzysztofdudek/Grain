import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('resolves a multi-segment name through the include/ probe when it has exactly one hit', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'c-include-resolve-'));
  try {
    mkdirSync(path.join(root, 'src', 'a'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'a', 'foo.c'), '#include "../inc/bar.h"\n', 'utf-8');
    // A header reachable via the `include/` root convention from src/a (src/a/include/root.h),
    // and one via an ancestor `include/` dir (include/proj/widget.h at repo root).
    mkdirSync(path.join(root, 'include', 'proj'), { recursive: true });
    writeFileSync(path.join(root, 'include', 'proj', 'widget.h'), '/* widget */\n', 'utf-8');

    const resolve = makeResolvePathToFile(root);
    // From src/a/foo.c, "proj/widget.h" is not under src/a. Without a compilation database the probe tries <root>/proj/widget.h (absent) and <root>/include/proj/widget.h (present): one hit → resolved.
    expect(resolve('proj/widget.h', 'src/a/foo.c', 'c')).toBe('include/proj/widget.h');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
