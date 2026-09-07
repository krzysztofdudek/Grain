// grain engine · the cell-key sentinels and the two path/extension primitives every layer shares
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { sep } from 'node:path';
import { EXT2GRAMMAR } from './config.mjs';

export const S = '\u0001'; // cell-key separator (was a literal SOH byte in the prototype)
export const UNSEEN = '\u0000'; // "value never observed" sentinel for the smoothed-count lookup (was a literal NUL byte)
export const toPosix = p => (sep === '/' ? p : p.split(sep).join('/'));
export const CODE_RE = new RegExp(
  '(' +
    Object.keys(EXT2GRAMMAR)
      .map(e => '\\' + e)
      .join('|') +
    ')$'
);
