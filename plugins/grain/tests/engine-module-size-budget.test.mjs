// The reviewer file-size budget, enforced here instead of only in the hand-written oracle.
//
// `plugins/grain/tests/stress/oracles/grain/.yggdrasil/aspects/engine/file-size-budget/` states the rule:
// a first-party module must fit inside one assembled reviewer prompt, whose default ceiling is 50 000
// characters. A module above it cannot be judged as a whole by anything — not by a reviewer, and in
// practice not by a reader either. That oracle is a frozen artifact, run by hand; nothing re-ran it on a
// push, so `engine/core.mjs` grew to 573 804 characters (11.5x) before anybody measured it.
//
// This test imports the oracle's OWN `check.mjs` rather than restating its number, so the budget has a
// single definition: change it there and this test changes with it. It runs that check over every
// first-party engine module and fails naming each one over the line.
//
// KNOWN_OVER was a shrinking list, and it has shrunk to nothing: ticket 117 split the mining core and
// ticket 124 the proposal writer and the dispatcher, so the rule now holds for every first-party engine
// module with no exception at all. The list stays in the file, empty, with a test of its own asserting
// it is empty — because an exception list that is gone is easy to re-introduce, and one that is present
// and provably empty is not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { check } from '../tests/stress/oracles/grain/.yggdrasil/aspects/engine/file-size-budget/check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..'); // plugins/grain
const ENGINE = join(ROOT, 'engine');

// EMPTY, AND IT STAYS EMPTY. Nothing may be added here: a name in this set turns the budget rule off
// for that file. `core.mjs` left it in ticket 117; `propose.mjs` and `grain.mjs` left it in ticket 124,
// when each became a facade over the modules that had been inside it.
const KNOWN_OVER = new Set();

// `engine/vendor/**` is third-party code taken as shipped — not ours to reshape, and deliberately outside
// the source-shape rules the first-party engine carries (the oracle's own `vendored-runtime` and
// `vendored-relations` types make the same carve-out).
function firstPartyEngineModules() {
  return readdirSync(ENGINE, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.mjs'))
    .map(e => e.name)
    .sort();
}

function violationsFor(files) {
  return check({
    files: files.map(name => ({
      path: relative(ROOT, join(ENGINE, name)),
      content: readFileSync(join(ENGINE, name), 'utf8'),
    })),
  });
}

test('the oracle\'s own budget check is the one being applied (50 000 characters, exact)', () => {
  const under = check({ files: [{ path: 'a.mjs', content: 'x'.repeat(50000) }] });
  const over = check({ files: [{ path: 'b.mjs', content: 'x'.repeat(50001) }] });
  assert.equal(under.length, 0, 'a module of exactly 50 000 characters is inside the budget');
  assert.equal(over.length, 1, 'a module of 50 001 characters is over it');
  assert.match(over[0].message, /50 000-character reviewer budget/);
});

test('every first-party engine module fits inside the reviewer budget', () => {
  const modules = firstPartyEngineModules();
  assert.ok(
    modules.length > 20,
    `expected the split engine's many modules under engine/, only saw ${modules.length} — the scan is probably broken`
  );

  const offenders = new Set(violationsFor(modules).map(v => v.file.split('/').pop()));
  const unexpected = [...offenders].filter(f => !KNOWN_OVER.has(f)).sort();
  const fixed = [...KNOWN_OVER].filter(f => !offenders.has(f)).sort();

  assert.deepEqual(
    unexpected,
    [],
    'these engine modules are over the 50 000-character reviewer budget:\n' +
      violationsFor(unexpected)
        .map(v => `  ${v.file}\n${v.message.split('\n')[0].replace(/^/, '    ')}`)
        .join('\n') +
      '\n  Split the module along a seam it already has — do not raise the ceiling, and do not add it to KNOWN_OVER.'
  );

  assert.deepEqual(
    fixed,
    [],
    `these modules are no longer over the budget: ${fixed.join(', ')} — remove them from KNOWN_OVER so the ` +
      'rule keeps holding for them.'
  );
});

test('the budget has no exception list left — every engine module answers for itself', () => {
  assert.deepEqual(
    [...KNOWN_OVER],
    [],
    'KNOWN_OVER is empty and must stay empty: every first-party engine module is inside the 50 000-character\n' +
      'reviewer budget today. Adding a name here turns the rule off for that file. If a module has grown past\n' +
      'the line, split it along a seam it already has — the way core.mjs, propose.mjs and grain.mjs were split.'
  );
});

test('core.mjs carries no engine code of its own — it is the re-export facade', () => {
  const src = readFileSync(join(ENGINE, 'core.mjs'), 'utf8');
  const code = src
    .split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('//'))
    .filter(l => !/^export\s*\{|^\s{2}[A-Za-z0-9_$]+,$|^\}\s*from\s*'\.\/[a-z-]+\.mjs';$/.test(l));
  assert.deepEqual(code, [], 'core.mjs should contain nothing but comments and `export … from` lines');
});
