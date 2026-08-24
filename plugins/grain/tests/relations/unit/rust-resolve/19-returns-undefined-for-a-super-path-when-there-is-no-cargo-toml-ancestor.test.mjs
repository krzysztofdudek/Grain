import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('returns undefined for a super:: path when there is no Cargo.toml ancestor', () => {
  // `super::`/`self::` resolution still needs a crate root to anchor `src/`; with no
  // Cargo.toml ancestor the relative resolver yields silence.
  const noCrate = mkdtempSync(path.join(tmpdir(), 'rust-nocrate-rel-'));
  try {
    mkdirSync(path.join(noCrate, 'src'), { recursive: true });
    writeFileSync(path.join(noCrate, 'src', 'a.rs'), '// a\n', 'utf-8');
    const resolve = makeResolvePathToFile(noCrate);
    expect(resolve('super::Type', 'src/a.rs', 'rust')).toBeUndefined();
    expect(resolve('self::x', 'src/a.rs', 'rust')).toBeUndefined();
  } finally {
    rmSync(noCrate, { recursive: true, force: true });
  }
});
