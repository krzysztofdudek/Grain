// grain engine · the cell-key sentinels and the two path/extension primitives every layer shares
// Split out of core.mjs: the statements below are the ones that stood there, unchanged.
import { renameSync } from 'node:fs';
import { sep } from 'node:path';
import { extname } from 'node:path/posix';
import { EXT2GRAMMAR, BASENAME_EXT } from './config.mjs';

export const S = '\u0001'; // cell-key separator (was a literal SOH byte in the prototype)
export const UNSEEN = '\u0000'; // "value never observed" sentinel for the smoothed-count lookup (was a literal NUL byte)
export const toPosix = p => (sep === '/' ? p : p.split(sep).join('/'));
// A temporary file moved over the real one. On Windows the move fails for a moment while another process (a second
// grain, a hook, a virus scanner) has the target open: EPERM, EACCES or EBUSY. It is tried again for up to a second.
export function renameOver(tmp, path) {
  for (let i = 0; ; i++) {
    try {
      return renameSync(tmp, path);
    } catch (e) {
      if (process.platform !== 'win32' || i >= 20 || !['EPERM', 'EACCES', 'EBUSY'].includes(e?.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}
export const CODE_RE = new RegExp(
  '(' +
    Object.keys(EXT2GRAMMAR)
      .map(e => e.replace(/[.+]/g, m => '\\' + m))
      .concat(Object.keys(BASENAME_EXT).filter(b => EXT2GRAMMAR[BASENAME_EXT[b]]).map(b => '(?:^|/)' + b))
      .join('|') +
    ')$'
);
// the extension that selects a path's grammar: its own, or the one an extension-less file of a fixed name stands for
// (`Rakefile` → `.rb`, config.mjs BASENAME_EXT). Every grammar lookup keyed by a PATH goes through this, never a bare
// extname, so a `Rakefile` is parsed, mined and related as the Ruby it is.
export const langExt = rel => {
  const s = String(rel);
  const base = s.slice(s.lastIndexOf('/') + 1);
  return Object.hasOwn(BASENAME_EXT, base) ? BASENAME_EXT[base] : extname(base);
};
// Vue and Svelte single-file components: no grammar parses one whole, but their `<script>` blocks carry relation facts
// (relations.mjs `sfcRelations`), so they join the relation universe and never the mined partition.
export const SFC_RE = /\.(vue|svelte)$/i;
