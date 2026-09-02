// G21: a grammar with no relation/edge extractor (relSupported() false — Scala, Bash, Lua, Zig, Groovy, Solidity)
// contributes zero file/module edges, indistinguishable in `status`/`report`'s architecture summary from a real,
// measured "this language imports nothing" — unless the summary discloses which files it never resolved.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, mixedRepo, tsRepo, phpNoComposerRepo, phpWithComposerRepo;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const grainIn = repo => args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const w = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const initRepo = repo => { mkdirSync(repo, { recursive: true }); execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']); execFileSync('git', ['-C', repo, 'config', 'commit.gpgsign', 'false']); };
const commit = repo => execFileSync('git', ['-C', repo, 'commit', '-qm', 'base'], { env: { ...process.env, ...gitEnv } });
const addAll = repo => execFileSync('git', ['-C', repo, 'add', '-A']);

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-relcov-'));

  // mixed repo: two TS modules wired by one import (so moduleGraph has >1 node and report's architecture section
  // renders), plus three .zig files (a grammar with no relSupported() extractor) — zig is 3/5 = 60% of indexed files
  mixedRepo = join(tmp, 'mixed'); initRepo(mixedRepo);
  w(mixedRepo, 'packages/core/util.ts', 'export const util = () => 1;\n');
  w(mixedRepo, 'apps/a/main.ts', "import { util } from '../../packages/core/util';\nexport const a = () => util();\n");
  w(mixedRepo, 'src/main.zig', 'const std = @import("std");\n\npub fn main() void {\n    std.debug.print("hello\\n", .{});\n}\n');
  w(mixedRepo, 'src/lib.zig', 'pub fn add(a: i32, b: i32) i32 {\n    return a + b;\n}\n');
  w(mixedRepo, 'src/util.zig', 'pub fn double(a: i32) i32 {\n    return a * 2;\n}\n');
  addAll(mixedRepo); commit(mixedRepo);

  // regression control: an all-relSupported repo (pure TS) with the same >1-module shape, no uncovered grammar at all
  tsRepo = join(tmp, 'ts-only'); initRepo(tsRepo);
  w(tsRepo, 'packages/core/util.ts', 'export const util = () => 1;\n');
  w(tsRepo, 'apps/a/main.ts', "import { util } from '../../packages/core/util';\nexport const a = () => util();\n");
  addAll(tsRepo); commit(tsRepo);

  // issue 059: PHP's extractor is NOT relPathOnly (it resolves call/type-ref/instanceof through the symbol
  // table, not a literal-path grep), so relSupported()&&!relPathOnly() alone reads it as covered — but every
  // one of those resolutions bottoms out in a PSR-4 lookup that can never succeed with no composer.json psr-4
  // map anywhere in the tree. Two `use`s that would resolve with a PSR-4 map present resolve to nothing here.
  phpNoComposerRepo = join(tmp, 'php-no-composer'); initRepo(phpNoComposerRepo);
  w(phpNoComposerRepo, 'src/Foo.php', '<?php\nnamespace App;\nuse App\\Bar\\Baz;\nclass Foo {\n  private Baz $b;\n}\n');
  w(phpNoComposerRepo, 'src/Bar/Baz.php', '<?php\nnamespace App\\Bar;\nclass Baz {}\n');
  addAll(phpNoComposerRepo); commit(phpNoComposerRepo);

  // regression control: the identical two-class shape, but with a composer.json psr-4 map present — the `use`
  // resolves to a real edge, so php must NOT be named in the coverage gap here.
  phpWithComposerRepo = join(tmp, 'php-with-composer'); initRepo(phpWithComposerRepo);
  w(phpWithComposerRepo, 'composer.json', '{\n  "autoload": {\n    "psr-4": {\n      "App\\\\": "src/"\n    }\n  }\n}\n');
  w(phpWithComposerRepo, 'src/Foo.php', '<?php\nnamespace App;\nuse App\\Bar\\Baz;\nclass Foo {\n  private Baz $b;\n}\n');
  w(phpWithComposerRepo, 'src/Bar/Baz.php', '<?php\nnamespace App\\Bar;\nclass Baz {}\n');
  addAll(phpWithComposerRepo); commit(phpWithComposerRepo);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('status discloses the relation-coverage gap for a real fraction of files in a non-relSupported grammar', () => {
  const grain = grainIn(mixedRepo);
  const r = grain(['status']);
  assert.equal(r.code, 0, r.err);
  // the existing numeric architecture fields are untouched by the disclosure — same counts as before the fix
  assert.match(r.out, /architecture: 3 modules · 1 file edges · 1 module edges · 0 cycle\(s\)/);
  assert.match(r.out, /^resolution does not cover 3 files \(zig\) — conventions layer only for those$/m);
});

test('report discloses the same gap, indented under the architecture heading', () => {
  const grain = grainIn(mixedRepo);
  const r = grain(['report']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /== architecture — 3 modules · 1 directed dependencies · 0 cycle\(s\) ==/);
  assert.match(r.out, /^  resolution does not cover 3 files \(zig\) — conventions layer only for those$/m);
});

test('a repo entirely in relSupported grammars gets no disclosure line, in status or report', () => {
  const grain = grainIn(tsRepo);
  const s = grain(['status']); assert.equal(s.code, 0, s.err);
  const rep = grain(['report']); assert.equal(rep.code, 0, rep.err);
  // confirm the architecture section actually rendered (not just trivially absent because it was skipped)
  assert.match(s.out, /architecture: 2 modules · 1 file edges · 1 module edges · 0 cycle\(s\)/);
  assert.match(rep.out, /== architecture — 2 modules · 1 directed dependencies · 0 cycle\(s\) ==/);
  assert.doesNotMatch(s.out, /resolution does not cover/);
  assert.doesNotMatch(rep.out, /resolution does not cover/);
});

// issue 059: PHP is `relSupported() && !relPathOnly()` unconditionally — it must not read as "covered" on a
// repo where no composer.json psr-4 map exists anywhere, since every namespaced `use` then resolves to nothing.
test('status/report name php in the coverage gap when no composer.json psr-4 map exists anywhere in the tree', () => {
  const grain = grainIn(phpNoComposerRepo);
  const s = grain(['status']); assert.equal(s.code, 0, s.err);
  const rep = grain(['report']); assert.equal(rep.code, 0, rep.err);
  assert.match(s.out, /^resolution does not cover 2 files \(php\) — conventions layer only for those$/m);
  assert.match(rep.out, /^  resolution does not cover 2 files \(php\) — conventions layer only for those$/m);
});

test('php is NOT named in the coverage gap once a composer.json psr-4 map lets its use-statements actually resolve', () => {
  // composer.json itself is a plain JSON file with no relation extractor at all (unrelated to PHP resolution —
  // json is not in REL_LANGS), so it still shows up in the gap; the assertion is specifically that `php` is not
  // named alongside it now that its own `use` resolves to a real edge.
  const grain = grainIn(phpWithComposerRepo);
  const s = grain(['status']); assert.equal(s.code, 0, s.err);
  const rep = grain(['report']); assert.equal(rep.code, 0, rep.err);
  assert.match(s.out, /^resolution does not cover 1 file \(json\) — conventions layer only for those$/m);
  assert.doesNotMatch(s.out, /resolution does not cover.*\bphp\b/);
  assert.doesNotMatch(rep.out, /resolution does not cover.*\bphp\b/);
});
