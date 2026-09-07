// Guard against ticket 103 (NUL) and ticket 117 (every other C0 control byte): an instrument or engine
// module that writes a raw separator character through a JS string/template literal, instead of its
// `\xNN` escape, puts a LITERAL control byte into the `.mjs` source file. `reconstruct.mjs` (9 literal
// NULs, fixed at the 093 merge), `too-much.mjs` (3 NULs, fixed 2026-09-05), `core.mjs:2629` (one literal
// SOH in a comment) and two history tests, `history-large-state.test.mjs` (3 literal SOHs) and
// `history-path-quoting.test.mjs` (1), all did this — the last four fixed together under ticket 117. Git
// then treats the file as BINARY (diffs stop rendering as text, `git log -p` shows "Binary files
// differ"), which is silent damage no lint step catches: the file still parses and runs fine, so nothing
// red-flags it short of noticing the diff went binary. Escaping the byte as `\x00`, `\x01`, etc. in
// source keeps the runtime behavior identical (a string literal with the escaped form IS the same
// string; a comment carries no runtime semantics to preserve) while keeping the FILE itself plain text.
//
// Tab (0x09), line feed (0x0A) and carriage return (0x0D) are the three C0 control bytes that legitimately
// occur in source text; every other code point in 0x00-0x1F does not belong in a checked-in `.mjs` file.
//
// This test scans every `.mjs` file this plugin ships for a raw byte in that range and fails naming every
// offender at once (file, line, and the offending byte), so a future instrument or edit that reintroduces
// the mistake is caught before its diff goes binary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..'); // plugins/grain

// C0 control bytes allowed in text source: tab, line feed, carriage return.
const ALLOWED = new Set([0x09, 0x0a, 0x0d]);

// Deliberate exception, not a gap: this is a drill fixture for the Grain oracle's own
// `source/no-raw-control-bytes` aspect (plugins/grain/tests/stress/oracles/grain/.yggdrasil) — it exists
// to PROVE that aspect's check.mjs flags a raw SOH byte, so it must keep containing one. It is a hand-written
// oracle artifact, not shipped instrument or engine code, and nothing under `tests/stress/oracles/**`
// participates in this repository's own build or runtime.
const EXCLUDE_FILES = new Set([
  join(ROOT, 'tests/stress/oracles/grain/.yggdrasil/aspects/source/no-raw-control-bytes/drills/violates-raw-soh/raw.mjs'),
]);

// Nothing under plugins/grain is a generated/vendored `.mjs` file today (the vendored relation extractors
// and parser runtime under `engine/vendor/` are hand-maintained plain JS, not code-generated), and the
// generated grammar assets (`engine/grammars/*.json`, `*.wasm`) are not `.mjs` files at all, so neither
// needs an extension- or path-based carve-out here. If a future vendoring step ever regenerates an `.mjs`
// file mechanically, add its path to EXCLUDE_FILES with a comment — never hand-edit it to pass this test.
function walkMjs(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkMjs(p, acc);
    else if (entry.isSymbolicLink()) continue;
    else if (entry.name.endsWith('.mjs') && !EXCLUDE_FILES.has(p)) acc.push(p);
  }
  return acc;
}

test('no *.mjs file under plugins/grain contains a raw C0 control byte other than tab/LF/CR', () => {
  const files = walkMjs(ROOT);
  assert.ok(files.length > 100, `expected to find plugins/grain's many .mjs files, only saw ${files.length} — the walk is probably broken`);
  const offenders = [];
  for (const p of files) {
    // statSync first: an offending file can be large (a rendered fixture), and reading as a Buffer (not
    // utf8) is what actually preserves the byte to test for — readFileSync(..., 'utf8') would replace an
    // invalid sequence before this test ever saw it. Every C0 code point is valid single-byte UTF-8 equal
    // to its own value, so a Buffer byte scan over that range is exactly a raw-byte scan of the text.
    if (statSync(p).size === 0) continue;
    const buf = readFileSync(p);
    let line = 1;
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      if (b === 0x0a) line++;
      if (b <= 0x1f && !ALLOWED.has(b)) {
        offenders.push(`${relative(ROOT, p)}:${line} (0x${b.toString(16).padStart(2, '0')})`);
        break; // one anchored report per file is enough to act on; a re-run catches any residue after the fix
      }
    }
  }
  assert.deepEqual(offenders, [], `raw C0 control byte(s) found — git will show these as binary files (tickets 103, 117):\n${offenders.join('\n')}`);
});
