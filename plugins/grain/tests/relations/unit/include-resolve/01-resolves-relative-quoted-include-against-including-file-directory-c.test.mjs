import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

// The C/C++ include resolver maps a QUOTED `#include "header"` path → a repo-relative
// file. A quoted include resolves ONLY relative to the including file's directory (canonical
// quoted-include semantics). A miss → undefined (silence). The old speculative include-root
// walk has been dropped to prevent false cross-node edges from same-basename decoys.
// This test builds a real temp tree and drives the production makeResolvePathToFile
// (disk-backed existence).

test('resolves a relative quoted include against the including file directory (C)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'c-include-resolve-'));
  try {
    // src/a/foo.c  →  #include "../inc/bar.h"  resolves to src/inc/bar.h (relative).
    mkdirSync(path.join(root, 'src', 'a'), { recursive: true });
    mkdirSync(path.join(root, 'src', 'inc'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'a', 'foo.c'), '#include "../inc/bar.h"\n', 'utf-8');
    writeFileSync(path.join(root, 'src', 'inc', 'bar.h'), '/* bar */\n', 'utf-8');

    const resolve = makeResolvePathToFile(root);
    expect(resolve('../inc/bar.h', 'src/a/foo.c', 'c')).toBe('src/inc/bar.h');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
