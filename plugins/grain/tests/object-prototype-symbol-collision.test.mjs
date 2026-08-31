// Regression test (G6): a source symbol literally named `constructor` — an entirely ordinary C/JS/TS identifier
// (redis's vendored `lparser.c` has one) — used to zero the WHOLE architecture layer of a repo, silently.
// `compactDecls` (relations.mjs) indexes every declared symbol into a plain `{}` keyed by the raw symbol name:
// `byLang['constructor']` inherits the truthy, non-array `Object.prototype.constructor` instead of `||=`-ing a
// fresh array, so `arr.includes` throws `TypeError: arr.includes is not a function`. One broad catch in
// `learn()` (core.mjs) swallows that and resets `model.edges`/`moduleGraph`/`archNorms`/`relDecls` to empty for
// the entire model — `status`/`report`/`export`/`check` then present "0 modules · 0 edges · 0 cycles" as a
// measured fact, with only an easy-to-miss stderr line as any trace. `toString`, `valueOf`, `hasOwnProperty` and
// `__proto__` are the same trap. Fixed with `Object.create(null)` for the maps `compactDecls` builds.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const grain = repo => args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };

// two C source files + a shared header: main.c and util.c both `#include "util.h"` (a genuine cross-file
// reference, resolved by include-resolve.mjs) — the real-world class of case (a C repo, an ordinary function
// name) rather than a synthetic one. util.c defines the two dangerous symbols as real function bodies
// (`function_definition` nodes — what `compactDecls` actually indexes), alongside an ordinary `add`.
function buildRepo(repo, { dangerous }) {
  mkdirSync(repo, { recursive: true });
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
  const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  const [f1, f2] = dangerous ? ['constructor', 'toString'] : ['ctor', 'stringify'];
  w('src/util.h', `int ${f1}(void);\nint ${f2}(void);\nint add(int a, int b);\n`);
  w('src/util.c', `#include "util.h"\nint ${f1}(void) { return 1; }\nint ${f2}(void) { return 2; }\nint add(int a, int b) { return a + b; }\n`);
  w('src/main.c', `#include "util.h"\nint main(void) { return add(1, 2); }\n`);
  git('add', '-A'); git('commit', '-qm', 'base');
}

let tmp, repoDangerous, repoOrdinary;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-ctorcollision-'));
  repoDangerous = join(tmp, 'dangerous'); buildRepo(repoDangerous, { dangerous: true });
  repoOrdinary = join(tmp, 'ordinary'); buildRepo(repoOrdinary, { dangerous: false });
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

const archLine = out => { const m = out.match(/architecture: (\d+) modules · (\d+) file edges/); return m && { modules: +m[1], edges: +m[2] }; };

test('a symbol literally named `constructor` (an ordinary C identifier) must not silently zero the architecture layer for the whole repo', () => {
  const st = grain(repoDangerous)(['status']);
  assert.equal(st.code, 0, st.out + st.err);
  assert.doesNotMatch(st.err, /relation pass failed/, `the relation pass must not crash on a symbol named 'constructor': ${st.err}`);
  const arch = archLine(st.out);
  assert.ok(arch, `expected an architecture summary line: ${st.out}`);
  assert.ok(arch.edges > 0, `expected real #include-derived cross-file edges, got 0 (architecture layer silently zeroed): ${st.out}\nstderr: ${st.err}`);
});

test('negative control: the same structure with ordinary symbol names produces an identical edge count', () => {
  const a = grain(repoDangerous)(['status']);
  const b = grain(repoOrdinary)(['status']);
  assert.equal(a.code, 0, a.out + a.err); assert.equal(b.code, 0, b.out + b.err);
  const ea = archLine(a.out), eb = archLine(b.out);
  assert.ok(ea && eb, `${a.out}\n---\n${b.out}`);
  assert.equal(ea.edges, eb.edges, 'a symbol name must never change the resolved edge count');
  assert.equal(ea.modules, eb.modules);
});
