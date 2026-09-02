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
let tmp, mixedRepo, tsRepo, phpNoComposerRepo, phpWithComposerRepo,
  kotlinJavaRepo, kotlinJavaBelowFloorRepo, kotlinJavaSameGrammarEdgeRepo,
  goRubyRepo, goRubyWithEdgeRepo;
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

  // issue 086: a repo dominated by one grammar (here: Kotlin) can hold a SMALLER secondary grammar (Java) that
  // is fully `relSupported() && !relPathOnly()` on its own — a standalone Java repo with this exact import shape
  // resolves fine (java-cross-node-fqn-import-detected.test.mjs) — yet every one of its files' references cross
  // INTO the dominant grammar's own declarations, which the vendored SymbolTable partitions by LANGUAGE on
  // purpose (a Java `import` never resolves a Kotlin-declared symbol, by design — same-named cross-language
  // collisions must never manufacture a false edge). The dominant grammar keeps one genuine internal edge here
  // so this fixture isolates the check to the secondary population, not a repo-wide zero. `kt/a` and `kt/b` sit
  // in distinct module buckets (moduleOf takes the first two path segments) so that edge crosses a module
  // boundary and the repo has >1 module overall — required for `report`'s architecture section to render at all.
  kotlinJavaRepo = join(tmp, 'kotlin-java'); initRepo(kotlinJavaRepo);
  w(kotlinJavaRepo, 'kt/a/Caller.kt', 'package a\nimport b.Util\nclass Caller {\n  val u: Util? = null\n}\n');
  w(kotlinJavaRepo, 'kt/b/Util.kt', 'package b\nclass Util { fun helper() {} }\n');
  w(kotlinJavaRepo, 'kt/a/Other.kt', 'package a\nclass Other { fun run() {} }\n');
  for (let i = 1; i <= 3; i++)
    w(kotlinJavaRepo, `java/internal/Cache${i}.java`, `package internal;\nimport b.Util;\npublic class Cache${i} {\n  Util u;\n}\n`);
  addAll(kotlinJavaRepo); commit(kotlinJavaRepo);

  // regression control: the identical cross-grammar shape, but the secondary (java) population is only 2 files —
  // below CFG.minEff's population floor (3), the same "too little evidence to claim anything" discipline this
  // codebase already applies to absence claims (§9.4) — so java must NOT be named in the coverage gap here.
  kotlinJavaBelowFloorRepo = join(tmp, 'kotlin-java-below-floor'); initRepo(kotlinJavaBelowFloorRepo);
  w(kotlinJavaBelowFloorRepo, 'kt/a/Caller.kt', 'package a\nimport b.Util\nclass Caller {\n  val u: Util? = null\n}\n');
  w(kotlinJavaBelowFloorRepo, 'kt/b/Util.kt', 'package b\nclass Util { fun helper() {} }\n');
  w(kotlinJavaBelowFloorRepo, 'kt/a/Other.kt', 'package a\nclass Other { fun run() {} }\n');
  for (let i = 1; i <= 2; i++)
    w(kotlinJavaBelowFloorRepo, `java/internal/Cache${i}.java`, `package internal;\nimport b.Util;\npublic class Cache${i} {\n  Util u;\n}\n`);
  addAll(kotlinJavaBelowFloorRepo); commit(kotlinJavaBelowFloorRepo);

  // regression control: the secondary (java) population meets the floor (3 files) but resolves a real SAME-
  // GRAMMAR edge among itself — java must NOT be named, proving the check fires on an observed zero, not merely
  // on "small population sitting next to a dominant grammar".
  kotlinJavaSameGrammarEdgeRepo = join(tmp, 'kotlin-java-same-grammar-edge'); initRepo(kotlinJavaSameGrammarEdgeRepo);
  w(kotlinJavaSameGrammarEdgeRepo, 'kt/a/Caller.kt', 'package a\nimport b.Util\nclass Caller {\n  val u: Util? = null\n}\n');
  w(kotlinJavaSameGrammarEdgeRepo, 'kt/b/Util.kt', 'package b\nclass Util { fun helper() {} }\n');
  w(kotlinJavaSameGrammarEdgeRepo, 'kt/a/Other.kt', 'package a\nclass Other { fun run() {} }\n');
  w(kotlinJavaSameGrammarEdgeRepo, 'java/a/Foo.java', 'package a;\nimport b.Bar;\npublic class Foo {\n  Bar bar;\n}\n');
  w(kotlinJavaSameGrammarEdgeRepo, 'java/b/Bar.java', 'package b;\npublic class Bar {}\n');
  w(kotlinJavaSameGrammarEdgeRepo, 'java/c/Baz.java', 'package c;\npublic class Baz {}\n');
  addAll(kotlinJavaSameGrammarEdgeRepo); commit(kotlinJavaSameGrammarEdgeRepo);

  // issue 086, a second grammar pair to confirm the fix generalizes (not tuned to Kotlin/Java): a Go repo
  // (dominant, one genuine in-module package edge) with a small standalone Ruby population (3 files, no
  // `require` of anything at all) — the exact real-world shape 086 measured for cpp-json's Python helper
  // scripts and axum-full's JS doc snippets: a secondary population that simply never references anything else
  // in the tree, indexed and relSupported but silently zero-edged.
  goRubyRepo = join(tmp, 'go-ruby'); initRepo(goRubyRepo);
  w(goRubyRepo, 'go.mod', 'module example.com/m\n\ngo 1.22\n');
  w(goRubyRepo, 'src/a/foo.go', 'package a\n\nimport "example.com/m/src/b"\n\nvar Foo = b.X\n');
  w(goRubyRepo, 'src/b/bar.go', 'package b\n\nvar X = 1\n');
  for (let i = 1; i <= 3; i++) w(goRubyRepo, `scripts/helper${i}.rb`, `def run\n  puts "helper ${i}"\nend\n`);
  addAll(goRubyRepo); commit(goRubyRepo);

  // regression control: same Go/Ruby shape, but one Ruby file requires another — ruby must NOT be named.
  goRubyWithEdgeRepo = join(tmp, 'go-ruby-with-edge'); initRepo(goRubyWithEdgeRepo);
  w(goRubyWithEdgeRepo, 'go.mod', 'module example.com/m\n\ngo 1.22\n');
  w(goRubyWithEdgeRepo, 'src/a/foo.go', 'package a\n\nimport "example.com/m/src/b"\n\nvar Foo = b.X\n');
  w(goRubyWithEdgeRepo, 'src/b/bar.go', 'package b\n\nvar X = 1\n');
  w(goRubyWithEdgeRepo, 'scripts/helper1.rb', 'require_relative \'helper2\'\ndef run\n  Helper2.new\nend\n');
  w(goRubyWithEdgeRepo, 'scripts/helper2.rb', 'class Helper2\nend\n');
  w(goRubyWithEdgeRepo, 'scripts/helper3.rb', 'def run3\n  puts "helper 3"\nend\n');
  addAll(goRubyWithEdgeRepo); commit(goRubyWithEdgeRepo);
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

// issue 086 — the mixed-source-set shape: a small SECONDARY grammar (java) whose own files are fully
// relSupported()/!relPathOnly() (a standalone repo with this exact shape resolves fine) but every one of its
// references crosses into the DOMINANT grammar (kotlin), which the SymbolTable never bridges by design — so the
// java population's real out-edges are silently zero, and 041/059's existing checks never catch it (java is
// neither relPathOnly nor missing a psr-4-style map). relCoverageData must name java anyway, the same way it
// already names a whole uncovered grammar for c/cpp and php.
test('status/report name java in the coverage gap when its cross-grammar references into the dominant kotlin population never resolve', () => {
  const grain = grainIn(kotlinJavaRepo);
  const s = grain(['status']); assert.equal(s.code, 0, s.err);
  const rep = grain(['report']); assert.equal(rep.code, 0, rep.err);
  assert.match(s.out, /^resolution does not cover 3 files \(java\) — conventions layer only for those$/m);
  assert.match(rep.out, /^  resolution does not cover 3 files \(java\) — conventions layer only for those$/m);
  assert.doesNotMatch(s.out, /resolution does not cover.*\bkotlin\b/);
});

test('java is NOT named when its zero-edged population sits below the coverage-population floor', () => {
  const grain = grainIn(kotlinJavaBelowFloorRepo);
  const s = grain(['status']); assert.equal(s.code, 0, s.err);
  const rep = grain(['report']); assert.equal(rep.code, 0, rep.err);
  assert.doesNotMatch(s.out, /resolution does not cover/);
  assert.doesNotMatch(rep.out, /resolution does not cover/);
});

test('java is NOT named once it resolves a real edge among its own (same-grammar) files, even sitting next to a dominant grammar', () => {
  const grain = grainIn(kotlinJavaSameGrammarEdgeRepo);
  const s = grain(['status']); assert.equal(s.code, 0, s.err);
  const rep = grain(['report']); assert.equal(rep.code, 0, rep.err);
  assert.doesNotMatch(s.out, /resolution does not cover/);
  assert.doesNotMatch(rep.out, /resolution does not cover/);
});

// issue 086, a second grammar pair — a different failure mechanism (a standalone secondary population with no
// internal references at all, not a cross-grammar miss) confirming the check is outcome-keyed, not tuned to one
// language pair's resolver shape.
test('status/report name ruby in the coverage gap when its standalone population next to a dominant go module never references anything', () => {
  const grain = grainIn(goRubyRepo);
  const s = grain(['status']); assert.equal(s.code, 0, s.err);
  const rep = grain(['report']); assert.equal(rep.code, 0, rep.err);
  assert.match(s.out, /^resolution does not cover 3 files \(ruby\) — conventions layer only for those$/m);
  assert.match(rep.out, /^  resolution does not cover 3 files \(ruby\) — conventions layer only for those$/m);
});

test('ruby is NOT named once one of its files resolves a real require_relative edge to another', () => {
  const grain = grainIn(goRubyWithEdgeRepo);
  const s = grain(['status']); assert.equal(s.code, 0, s.err);
  const rep = grain(['report']); assert.equal(rep.code, 0, rep.err);
  assert.doesNotMatch(s.out, /resolution does not cover/);
  assert.doesNotMatch(rep.out, /resolution does not cover/);
});
