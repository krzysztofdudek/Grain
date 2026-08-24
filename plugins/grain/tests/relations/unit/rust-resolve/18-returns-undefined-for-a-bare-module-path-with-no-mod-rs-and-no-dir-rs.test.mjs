import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('returns undefined for a bare module path with no mod.rs and no <dir>.rs', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'rust-resolve-'));
  try {
    writeFileSync(path.join(root, 'Cargo.toml'), '[package]\nname = "mycrate"\nversion = "0.1.0"\nedition = "2021"\n', 'utf-8');
    mkdirSync(path.join(root, 'src', 'a'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'a', 'b.rs'), '// b\n', 'utf-8');
    writeFileSync(path.join(root, 'src', 'a.rs'), 'pub mod b;\n', 'utf-8');
    mkdirSync(path.join(root, 'src', 'orders'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'orders', 'mod.rs'), '// orders\n', 'utf-8');
    writeFileSync(path.join(root, 'src', 'lib.rs'), 'pub mod a;\npub mod orders;\n', 'utf-8');

    const resolve = makeResolvePathToFile(root);
    // `crate` alone resolves to the crate src dir's own file -- but there is no src/mod.rs
    // and no src.rs at the crate root, so the empty-tail resolution finds nothing.
    expect(resolve('crate', 'src/lib.rs', 'rust')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
