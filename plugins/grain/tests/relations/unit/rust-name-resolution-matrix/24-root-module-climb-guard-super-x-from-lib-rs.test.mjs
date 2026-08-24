import { test } from 'node:test';
import { expect, rustResolve } from '../_unit-harness.mjs';

const KNOWN = new Set([
  'src/lib.rs', 'src/a.rs', 'src/a/b.rs', 'src/a/b/deep.rs', 'src/a/sib.rs',
  'src/a/x.rs', 'src/x.rs', 'src/sib.rs', 'src/serde.rs',
]);
const baseDeps = { crateRootFor: () => ({ srcDir: 'src', crateName: 'mycrate' }) };
const exists = p => KNOWN.has(p);
const R = (specifier, fromFile, deps = baseDeps) => rustResolve.resolveRustPath(specifier, fromFile, exists, deps);

test('root-module climb guard: `super::X` from `src/lib.rs` → SILENCE (crate root has no parent module)', () => {
  expect(R('super::X', 'src/lib.rs')).toBeUndefined();
});
