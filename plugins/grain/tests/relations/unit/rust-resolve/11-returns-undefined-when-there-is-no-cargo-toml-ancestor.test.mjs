import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('returns undefined when there is no Cargo.toml ancestor', () => {
  const noCrate = mkdtempSync(path.join(tmpdir(), 'rust-nocrate-'));
  try {
    mkdirSync(path.join(noCrate, 'src'), { recursive: true });
    writeFileSync(path.join(noCrate, 'src', 'a.rs'), '// a\n', 'utf-8');
    const resolve = makeResolvePathToFile(noCrate);
    expect(resolve('crate::a', 'src/lib.rs', 'rust')).toBeUndefined();
  } finally {
    rmSync(noCrate, { recursive: true, force: true });
  }
});
