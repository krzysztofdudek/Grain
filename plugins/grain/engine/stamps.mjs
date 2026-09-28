// grain engine · the stamps of what extraction reads besides the extractor's own code: the grammar bytes and the
// vendored Runes release. Every cache that holds extraction output keys on them together with EXTR_V — the index
// meta (grain-context.mjs), the history blob cache and the replay state (history.mjs) — so `runes:update` or a
// rebuilt grammar invalidates all of them without anyone remembering to bump EXTR_V.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXTR_V, GRAMMAR_DIR, SHIPPED_GRAMMAR_DIR, GRAMMAR_MANIFEST, RUNES_PIN, GRAMMARS } from './config.mjs';

const readJson = p => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};
// the pinned bytes, not a version label: a grammar rebuilt at the same version still re-indexes. The shipped set reads
// the Runes grammar manifest (a grammar is named by its wasm, `tree-sitter-c_sharp.wasm` → c_sharp, as GRAMMARS names
// it); a GRAIN_GRAMMAR_DIR set brings its own manifest.json or is stamped by its names alone.
export const grammarStamp = () => {
  if (GRAMMAR_DIR === SHIPPED_GRAMMAR_DIR) {
    const m = readJson(GRAMMAR_MANIFEST);
    if (m && Array.isArray(m.grammars))
      return m.grammars
        .map(g => g.wasmFile.replace(/^tree-sitter-|\.wasm$/g, '') + '@' + g.sha256.wasm.slice(0, 8))
        .join(',');
  }
  const m = readJson(join(GRAMMAR_DIR, 'manifest.json'));
  return m
    ? Object.entries(m)
        .map(([g, v]) => g + '@' + (v.wasmSha256 ? v.wasmSha256.slice(0, 8) : v.version))
        .join(',')
    : GRAMMARS.join(',');
};
// the vendored Runes release, `<tag>@<commit>`: relation facts are Runes' extractors' output and ride the tree cache,
// so a moved pin is an extraction change exactly like an EXTR_V bump (an unreadable pin stamps as `none`)
export const runesStamp = () => {
  const pin = readJson(RUNES_PIN);
  return pin && pin.tag && pin.commit ? pin.tag + '@' + String(pin.commit).slice(0, 12) : 'none';
};
// everything a parsed blob depends on, in one line: the history blob cache and the replay state are keyed on it
export const extractionStamp = () => `${EXTR_V} ${grammarStamp()} ${runesStamp()}`;
