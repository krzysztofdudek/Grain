// Guard against ticket 103: an instrument that writes a `\0` key separator through a raw JS template literal
// puts a LITERAL NUL byte into the `.mjs` source file — `reconstruct.mjs` (9 occurrences, fixed at the 093
// merge) and `too-much.mjs` (3, fixed 2026-09-05) both did this. Git then treats the file as BINARY (diffs stop
// rendering as text, `git log -p` shows "Binary files differ"), which is silent damage no lint step catches: the
// file still parses and runs fine, so nothing red-flags it short of noticing the diff went binary. Escaping the
// separator as the two-character string `\x00` in source keeps the runtime behavior identical (it is still a
// NUL byte in the STRING VALUE at runtime) while keeping the FILE itself plain text.
//
// This test scans every `.mjs` file this plugin ships (excluding `node_modules`) for a literal NUL byte and
// fails naming every offender at once, so a future instrument that reintroduces the mistake is caught before
// its diff goes binary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..'); // plugins/grain

function walkMjs(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkMjs(p, acc);
    else if (entry.isSymbolicLink()) continue;
    else if (entry.name.endsWith('.mjs')) acc.push(p);
  }
  return acc;
}

test('no *.mjs file under plugins/grain contains a literal NUL byte', () => {
  const files = walkMjs(ROOT);
  assert.ok(files.length > 100, `expected to find plugins/grain's many .mjs files, only saw ${files.length} — the walk is probably broken`);
  const offenders = [];
  for (const p of files) {
    // statSync first: a NUL-bearing file can be large (a rendered fixture), and reading as a Buffer (not utf8)
    // is what actually preserves the byte to test for — readFileSync(..., 'utf8') would replace an invalid
    // sequence before this test ever saw it.
    if (statSync(p).size === 0) continue;
    const buf = readFileSync(p);
    if (buf.includes(0)) {
      const line = buf.subarray(0, buf.indexOf(0)).toString('utf8').split('\n').length;
      offenders.push(`${p.slice(ROOT.length + 1)}:${line}`);
    }
  }
  assert.deepEqual(offenders, [], `literal NUL byte(s) found — git will show these as binary files (ticket 103):\n${offenders.join('\n')}`);
});
