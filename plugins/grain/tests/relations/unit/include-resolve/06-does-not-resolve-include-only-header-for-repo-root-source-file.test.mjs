import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('does NOT resolve an include/-only header for a repo-root source file (walk dropped)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'c-include-resolve-'));
  try {
    // A header sitting bare at the repo root (no include/ dir), and a root-level
    // source file — for the include-root walk and the root-directory (fromDir === '.')
    // cases. cfg.h exists ONLY under <root>/include/, so a root-level includer misses
    // the relative join and reaches the include-root walk with the root start dir.
    writeFileSync(path.join(root, 'main.c'), '#include "cfg.h"\n', 'utf-8');
    mkdirSync(path.join(root, 'include'), { recursive: true });
    writeFileSync(path.join(root, 'include', 'cfg.h'), '/* cfg */\n', 'utf-8');

    // main.c lives at the repo root; cfg.h exists only under <root>/include/cfg.h.
    // The canonical relative join (<root>/cfg.h) misses, and the speculative
    // include-root probe is gone → silence.
    const resolve = makeResolvePathToFile(root);
    expect(resolve('cfg.h', 'main.c', 'c')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
