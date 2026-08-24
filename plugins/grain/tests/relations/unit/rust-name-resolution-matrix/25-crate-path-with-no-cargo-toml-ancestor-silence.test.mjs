import { test } from 'node:test';
import { expect, rustResolve } from '../_unit-harness.mjs';

const KNOWN = new Set([
  'src/lib.rs', 'src/a.rs', 'src/a/b.rs', 'src/a/b/deep.rs', 'src/a/sib.rs',
  'src/a/x.rs', 'src/x.rs', 'src/sib.rs', 'src/serde.rs',
]);
const exists = p => KNOWN.has(p);
const R = (specifier, fromFile, deps) => rustResolve.resolveRustPath(specifier, fromFile, exists, deps);

test('a crate path with NO Cargo.toml ancestor → SILENCE (no module-tree root to anchor)', () => {
  const noCrate = { crateRootFor: () => undefined };
  expect(R('crate::a::b::C', 'src/lib.rs', noCrate)).toBeUndefined();
});
