import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('still resolves the plain `crate::` keyword via srcDir (crateName undefined, no crash)', () => {
  // [package] is present (so the section-tracking `inPackage` flips true) but the
  // ONLY line inside it is `version = "..."`, which the name regex attempts and
  // misses — unlike a line outside [package] (skipped before the match is tried).
  const bareRoot = mkdtempSync(path.join(tmpdir(), 'resolve-path-noname-'));
  try {
    mkdirSync(path.join(bareRoot, 'src'), { recursive: true });
    writeFileSync(path.join(bareRoot, 'Cargo.toml'), '[package]\nversion = "0.1.0"\n', 'utf-8');
    writeFileSync(path.join(bareRoot, 'src', 'lib.rs'), '// lib\n', 'utf-8');
    writeFileSync(path.join(bareRoot, 'src', 'a.rs'), '// a\n', 'utf-8');
    const resolve = makeResolvePathToFile(bareRoot);
    expect(resolve('crate::a', 'src/lib.rs', 'rust')).toBe('src/a.rs');
  } finally {
    rmSync(bareRoot, { recursive: true, force: true });
  }
});
