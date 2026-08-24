import { test } from 'node:test';
import { expect, rustResolve } from '../_unit-harness.mjs';

// A reusable resolver-deps fixture: crate `mycrate`, `src/` as the module-tree root, with a
// concrete in-repo module layout. Existence is checked against a fixed known-set keyed by
// repo-relative POSIX path. The same-LEAF traps are baked in:
//   crate::x  → src/x.rs        vs  crate::a::x → src/a/x.rs   (top-level vs nested, leaf `x`)
//   crate::a::sib → src/a/sib.rs vs crate::sib → src/sib.rs    (sibling vs top-level, leaf `sib`)
// `src/serde.rs` exists ON PURPOSE so the external-crate guard is proven NOT to be a file probe.
const KNOWN = new Set([
  'src/lib.rs', // crate root module
  'src/a.rs', // module crate::a (file form)
  'src/a/b.rs', // module crate::a::b
  'src/a/b/deep.rs', // module crate::a::b::deep (submodule of b)
  'src/a/sib.rs', // module crate::a::sib (sibling of b)
  'src/a/x.rs', // module crate::a::x (leaf `x`, nested)
  'src/x.rs', // module crate::x (leaf `x`, top-level — the trap twin of a::x)
  'src/sib.rs', // module crate::sib (leaf `sib`, top-level — the trap twin of a::sib)
  'src/serde.rs', // an in-repo module NAMED like the external crate `serde` (FP trap)
]);
const baseDeps = { crateRootFor: () => ({ srcDir: 'src', crateName: 'mycrate' }) };
const exists = p => KNOWN.has(p);
const R = (specifier, fromFile, deps = baseDeps) => rustResolve.resolveRustPath(specifier, fromFile, exists, deps);

test('`crate::x::Y` → `src/x.rs`, NEVER the nested `src/a/x.rs` (leaf `x` collision)', () => {
  expect(R('crate::x::Y', 'src/lib.rs')).toBe('src/x.rs');
});
