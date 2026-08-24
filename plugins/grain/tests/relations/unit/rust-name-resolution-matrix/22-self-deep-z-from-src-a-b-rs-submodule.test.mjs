import { test } from 'node:test';
import { expect, rustResolve } from '../_unit-harness.mjs';

const KNOWN = new Set([
  'src/lib.rs', 'src/a.rs', 'src/a/b.rs', 'src/a/b/deep.rs', 'src/a/sib.rs',
  'src/a/x.rs', 'src/x.rs', 'src/sib.rs', 'src/serde.rs',
]);
const baseDeps = { crateRootFor: () => ({ srcDir: 'src', crateName: 'mycrate' }) };
const exists = p => KNOWN.has(p);
const R = (specifier, fromFile, deps = baseDeps) => rustResolve.resolveRustPath(specifier, fromFile, exists, deps);

test('`self::deep::Z` from `src/a/b.rs` → `src/a/b/deep.rs` (submodule of the own module)', () => {
  expect(R('self::deep::Z', 'src/a/b.rs')).toBe('src/a/b/deep.rs');
});
