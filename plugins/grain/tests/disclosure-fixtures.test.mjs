// Instrument D (loop-v2.md §3.D, "fixture'y ujawnień" — disclosure fixtures): one parameterised test over
// synthetic repositories with known blind spots, asserting for EACH that grain's disclosure FIRES and TELLS THE
// TRUTH. This is class D from §2 of the loop: "grain wie, że nie widzi, i nie mówi" (grain knows it can't see
// something, and doesn't say so) — the sharpest example is relCoverageNote (core.mjs) itself: "resolution does
// not cover N files (ext…)" exists so grain can name what it cannot see. Every case below is a repository shaped
// so that invariant is tested directly, on the actual CLI, not on a helper function in isolation.
//
// Cases marked `todo: true` are RED ON PURPOSE — they encode the CORRECT/desired disclosure text per the cited
// ticket's acceptance criteria, which the engine does not produce today. `{ todo: true }` (node:test) still RUNS
// every assertion (so today's real output is visible in the test-run report, and a future fix flips the case
// green automatically) but never fails the suite. Do not edit an assertion in a todo case to match today's wrong
// output — that defeats the instrument. Do not "fix" the engine here; this file is harness only (see the ticket).
//
// (History note: this file was first written against a pre-0.3.0 base where `035 partial clone` and
// `intra-module edges` genuinely had no implementation. Rebasing onto main (0.3.0) found both real:
// partialCloneFilter() (history.mjs) fires correctly; intraModuleNote() (core.mjs) fires too, but only on
// `report`/`rules`, not `status` — the original fixture asserted on `status` and got a false negative from its
// own wrong surface, not a product gap. Both are now regression pins (`todo: false`), fixed below.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const DATE_A = '2026-01-10T12:00:00Z';
const DATE_B = '2026-03-01T12:00:00Z'; // > freshDays (14d, config.mjs) after DATE_A: a later HEAD commit at this
  // date pushes DATE_A's code past the "established" age gate (mine() is fail-closed on fresh code, §9.4c) —
  // the same trick tests/superficial-check-caveat.test.mjs already uses.

// ----- fixture helpers (mirrors the git-building convention already used by relation-coverage.test.mjs and
// superficial-check-caveat.test.mjs in this directory, rather than tests/fixtures/build-fixture.mjs's scripted
// multi-wave history — these fixtures are tiny and each one isolates exactly one blind spot) -----
const w = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const gitEnvAt = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const git = (repo, env, ...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
const initRepo = repo => { mkdirSync(repo, { recursive: true }); git(repo, gitEnvAt(DATE_A), 'init', '-q', '-b', 'main'); git(repo, {}, 'config', 'commit.gpgsign', 'false'); };
const commitAll = (repo, msg, iso = DATE_A) => { git(repo, {}, 'add', '-A'); git(repo, gitEnvAt(iso), 'commit', '-qm', msg); };
// stdout only (grain's progress/log lines go to console.error — engine/grain.mjs's `log`), same convention the
// rest of this test directory already uses so a fixture's own indexing chatter never pollutes an assertion
const grain = (repo, args) => (spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }).stdout || '');
const toRegex = pat => (pat instanceof RegExp ? pat : new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

// enough TS scopes (>=30 total) that groupPartitions' small-bucket floor (core.mjs: `if (small.length >= 30)`)
// actually forms a partition — below that, `where`/`spectrum`/`check` all answer "no partition", which would
// mask every bug below behind an unrelated, correct disclosure instead of the one under test
function padFiller(repo, dir, n = 15) { for (let i = 0; i < n; i++) w(repo, `${dir}/util${i}.ts`, `export function util${i}() { return ${i}; }\nexport function helper${i}() { return util${i}() + 1; }\n`); }

const cases = [
  // ---- §041: C/C++ has no dependency graph, and relCoverageNote certifies that absence as real ----
  {
    name: '041: coverage note must name cpp when it yields zero edges — not just a genuinely-uncovered grammar',
    todo: false, // fixed: relCoverageData (core.mjs) now also folds in relPathOnly(g) grammars (relations.mjs) —
    // c/cpp's extractor is registered (relSupported is true) but its ENTIRE `uses` is the shared include-only
    // walker, so it is named alongside bash instead of silently passing as "covered".
    buildRepo(tmp) {
      const repo = join(tmp, 'r'); initRepo(repo);
      // 5 cpp files whose only #include is their own header (same dir → 0 cross-module edges even if resolved) —
      // this quoted, same-directory include DOES resolve today (resolveIncludePath is dir-relative), so this half
      // alone contributes real, nonzero file-level edges; it's the cross-module/architecture signal that stays 0.
      for (let i = 1; i <= 5; i++) { w(repo, `src/a/mod${i}.h`, `#pragma once\nclass Mod${i} {\npublic:\n  int compute();\n};\n`);
        w(repo, `src/a/mod${i}.cpp`, `#include "mod${i}.h"\nint Mod${i}::compute() {\n  return ${i};\n}\n`); }
      // 5 more in a second module, whose header include is angle-bracket (toolchain-style, not repo-relative) —
      // the extractor never even forms a candidate for an angle-bracket include (c-cpp-shared.mjs's
      // quotedIncludePath requires a string_literal node), so this cross-module reference is invisible from the
      // start — the exact leveldb symptom in miniature (issue 041: most of a real C++ repo's #include edges are
      // silently uncomputed while relCoverageNote used to stay silent about it)
      for (let i = 6; i <= 10; i++) { w(repo, `src/b/mod${i}.h`, `#pragma once\n#include <mod${i - 5}.h>\nclass Mod${i} {\npublic:\n  int compute();\n};\n`);
        w(repo, `src/b/mod${i}.cpp`, `#include "mod${i}.h"\nint Mod${i}::compute() {\n  return ${i};\n}\n`); }
      // bash: a real grammar with NO relation extractor at all (relations.mjs's registry) — the "zero capability"
      // uncovered case, standing in for the yaml file in the original leveldb report (this build's ALL_EXT2GRAMMAR,
      // config.mjs, ships no yaml/toml/json grammar at all, so yaml itself can never appear in relCoverageNote here)
      w(repo, 'scripts/build.sh', '#!/bin/bash\necho building\n');
      commitAll(repo, 'base');
      return repo; },
    commands: [
      // fixed output: "== architecture — 3 modules · 0 directed dependencies · 0 cycle(s) ==" then
      // "  resolution does not cover 11 files (bash, cpp) — conventions layer only for those" — bash (zero
      // capability) and cpp (include-only, near-zero real-world resolution) both named, instead of cpp silently
      // passing as covered because SOME of its same-directory includes happen to resolve.
      { args: ['report'], mustContain: [
        /== architecture — 3 modules · 0 directed dependencies · 0 cycle\(s\) ==/,
        /resolution does not cover[^\n]*\bcpp\b/ ] } ],
  },

  // ---- §057: XML content is silently unread, and both `spectrum` and `where` present that as a confident
  // negative ("no scopes", "no lexical match") instead of naming the ungrammared files ----
  {
    name: '057: spectrum/where must disclose ungrammared files, not read the absence as empty content',
    // fixed: spectrum now distinguishes "no grammar for .xml" (never parsed) from "(no scopes extracted)"
    // (parsed, genuinely empty); where's zero-hit path now checks the ungrammared file set (core.mjs
    // `ungrammaredFiles`, grain.mjs `findUngrammaredHit`) for the query's literal text before claiming absence —
    // regression pin for the same invariant as the `check` line below, which already got this right.
    todo: false,
    buildRepo(tmp) {
      const repo = join(tmp, 'r'); initRepo(repo);
      padFiller(repo, 'src');
      // a code file beside the xml so `config/` gets a real partition and spectrum reaches its "(no scopes
      // extracted)" branch instead of "no partition covers" — matches the psalm.xml case (adjacent PHP files)
      w(repo, 'config/loader.ts', 'export function loadConfig() { return {}; }\n');
      for (let i = 0; i < 5; i++) w(repo, `config/schema${i}.xml`,
        `<?xml version="1.0"?>\n<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://example.com/schema${i}.xsd">\n  <entry id="${i}"/>\n</config>\n`);
      commitAll(repo, 'base');
      return repo; },
    commands: [
      { args: ['where', 'schemaLocation'], mustContain: [/xml/i], mustNotContain: [/^no lexical match for "schemaLocation" — compact map/m] },
      { args: ['spectrum', 'config/schema0.xml'], mustContain: [/no grammar/i], mustNotContain: [/no scopes extracted/i] },
      // check already gets this right today — pinned here so a future fix to spectrum/where cannot regress it
      { args: ['check', 'config/schema0.xml'], mustContain: [/no grammar for "\.xml"/] } ],
  },

  // ---- §053: `check` carries the parse-degraded caveat; `review` (check aggregated over many files) drops it ----
  {
    name: '053: review must carry the parse-degraded caveat that check already carries for the same file',
    todo: true, // today: check prints the caveat; review's fileFindings() (grain.mjs) never reads r.hasError at
                // all, so an aggregated "review" of the identical file says nothing about the degraded parse
    buildRepo(tmp) {
      const repo = join(tmp, 'r'); initRepo(repo);
      padFiller(repo, 'src');
      commitAll(repo, 'base');
      // left UNTRACKED (not committed) so `review`'s default mode (uncommitted + untracked) picks it up too —
      // a deliberate syntax error inside a real function, so the file still yields scopes (r.hasError but
      // scopesN>0 — the "parse degraded" branch, not the separate "parse failed" one for a wholly unparseable file)
      w(repo, 'src/broken.ts', 'export function util99() { return 99; }\n\nexport function broken(x: <<not valid) {\n  return x\n');
      return repo; },
    commands: [
      { args: ['check', 'src/broken.ts'], mustContain: [/\(parse degraded — part of this file sits in error nodes/] },
      { args: ['review'], mustContain: [/\(parse degraded — part of this file sits in error nodes/] } ],
  },

  // ---- §046: `mutate-test` (the "selftest" plant/catch harness) returns a bare, unexplained 0/0/0/0 when a
  // repo's certified conventions are all of a kind it has no mutation for (lexical/shape, not deco/extends/imp/
  // call/nameshape — see mutate() in core.mjs) ----
  {
    name: '046: mutate-test must say WHY it planted nothing instead of an unexplained 0/0/0/0',
    todo: true, // today: an empty `cands` list (core.mjs mutateTest — only auto.deco/extends/imp/call/nameshape
                // facts are candidates) silently yields {detected:0,missed:0,silentOK:0,falseFire:0,unsupported:0,
                // cases:[]} even though `status` reports real, certified conventions in the same model
    buildRepo(tmp) {
      const repo = join(tmp, 'r'); initRepo(repo);
      // varied name shapes (camel/Pascal/snake/SCREAMING/single-letter) so no one naming shape dominates enough
      // to certify auto.nameshape (mutable); no imports, no decorators, no extends, no shared calls — arithmetic
      // only — so the sole certifiable fact is lexical quote style (auto.lex:quote), which mutate() cannot plant
      // a deviation into.
      const names = ['computeTotal', 'ComputeTotal', 'compute_total', 'COMPUTE_TOTAL', 'x', 'fetchAll', 'FetchAll', 'fetch_all', 'y', 'z',
        'runTask', 'RunTask', 'run_task', 'w', 'v', 'sumValues', 'SumValues', 'sum_values', 'u', 't'];
      // quote style gets real variation (18 single vs 2 double) — lexDomain (core.mjs) requires >=2 observed
      // values for a lexical surface to count as a CHOICE at all, so this mines into one real, established,
      // still-not-mutable `auto.lex:quote` convention
      names.forEach((n, i) => { const q = i < 18 ? `'label${i}'` : `"label${i}"`;
        w(repo, `src/f${i}.ts`, `export function ${n}() {\n  const label = ${q};\n  return label + (${i} * 2 + 1);\n}\n`); });
      commitAll(repo, 'base', DATE_A);
      w(repo, 'NOTES.md', 'notes\n');
      commitAll(repo, 'notes', DATE_B); // clears freshDays so the quote-style fact actually gets certified
      return repo; },
    commands: [
      // sanity: this repo really does have certified conventions — this assertion must pass even though the
      // overall case is todo, otherwise the case would be vacuous
      { args: ['status'], mustContain: [/· \d+ groups · [1-9]\d* conventions? ·/] },
      { args: ['mutate-test'], mustNotContain: [/"detected":\s*0[\s\S]*?"unsupported":\s*0[\s\S]*?"cases":\s*\[\]/] } ],
  },

  // ---- existing disclosures, pinned as regressions (loop-v2.md §3.D: "the existing ones, one case each, so
  // they can't regress") ----
  {
    name: 'existing: dirty worktree — an uncommitted edit is disclosed via the "+dirty" stamp',
    todo: false,
    buildRepo(tmp) {
      const repo = join(tmp, 'r'); initRepo(repo);
      padFiller(repo, 'src');
      commitAll(repo, 'base');
      w(repo, 'src/util0.ts', 'export function util0() { return 999; }\n'); // uncommitted edit, same file
      return repo; },
    commands: [ { args: ['check', 'src/util0.ts'], mustContain: [/as of [0-9a-f]{7}\+dirty$/m] } ],
  },
  {
    name: 'existing: shallow clone — history unavailable is disclosed by name, never silently reported as full',
    todo: false,
    buildRepo(tmp) {
      const origin = join(tmp, 'origin'); const clone = join(tmp, 'clone');
      initRepo(origin);
      w(origin, 'src/a.ts', 'export const a = 1;\n'); commitAll(origin, 'first', DATE_A);
      w(origin, 'src/b.ts', 'export const b = 2;\n'); commitAll(origin, 'second', DATE_B);
      execFileSync('git', ['clone', '--depth', '1', `file://${origin}`, clone], { stdio: 'pipe' });
      return clone; },
    commands: [ { args: ['status'], mustContain: [/history none \(shallow clone — history unavailable, weights flat\)/] } ],
  },
  {
    name: 'existing: a promisor partial clone is disclosed like a shallow clone (§035)',
    // §035's partialCloneFilter() (history.mjs) ships on main (0.3.0) — this session's original worktree
    // branched from a pre-0.3.0 base (601aa23) where the function genuinely did not exist yet; rebasing onto
    // main confirmed it fires. Regression pin, not a contract gap.
    todo: false,
    buildRepo(tmp) {
      const origin = join(tmp, 'origin'); const clone = join(tmp, 'clone');
      initRepo(origin);
      w(origin, 'src/a.ts', 'export const a = 1;\n'); commitAll(origin, 'base');
      execFileSync('git', ['clone', '--filter=blob:none', `file://${origin}`, clone], { stdio: 'pipe' });
      return clone; },
    commands: [ { args: ['status'], mustContain: [/partial clone \(blob:none\) — history unavailable, weights flat/] } ],
  },
  {
    name: 'existing: module cycle granularity — a strongly-connected set is disclosed as a set, not a false chain',
    todo: false,
    buildRepo(tmp) {
      const repo = join(tmp, 'r'); initRepo(repo);
      // a genuine 3-module cycle: mod-a -> mod-b -> mod-c -> mod-a
      w(repo, 'src/mod-a/index.ts', "import { b } from '../mod-b/index';\nexport const a = () => b() + 1;\n");
      w(repo, 'src/mod-b/index.ts', "import { c } from '../mod-c/index';\nexport const b = () => c() + 1;\n");
      w(repo, 'src/mod-c/index.ts', "import { a } from '../mod-a/index';\nexport const c = () => 1;\n");
      commitAll(repo, 'base');
      return repo; },
    commands: [ { args: ['report'], mustContain: [
      /cycle \(strongly connected\): src\/mod-a, src\/mod-b, src\/mod-c — every member reaches every other, not necessarily in this order/ ] } ],
  },
  {
    name: 'existing: intra-module edges are named on `report`, explaining a "0 module edges" gap (§004)',
    // loop-v2.md listed an "intra-module note" as existing; the ORIGINAL fixture asserted on `status`, which
    // returned a false negative — intraModuleNote() (core.mjs) is real on main (0.3.0) but is wired into
    // report()/rulesMarkdown() only, never into statusLines(). `status` legitimately says nothing here; that
    // was this test's own bug, not a product gap. Fixed by asserting on the surface the note actually reaches.
    todo: false,
    buildRepo(tmp) {
      const repo = join(tmp, 'r'); initRepo(repo);
      for (let i = 0; i < 8; i++) w(repo, `src/core/a${i}.ts`, i === 0 ? 'export const a0 = 0;\n' : `import { a${i - 1} } from './a${i - 1}';\nexport const a${i} = a${i - 1} + 1;\n`);
      w(repo, 'src/other/standalone.ts', 'export const standalone = 1;\n'); // a 2nd module so architecture even renders
      commitAll(repo, 'base');
      return repo; },
    commands: [
      { args: ['status'], mustContain: [/architecture: 2 modules · 7 file edges · 0 module edges · 0 cycle\(s\)/] }, // sanity: the gap this note explains is real
      { args: ['report'], mustContain: [/7 file-level edges resolved, none crossing a module boundary — the architecture graph only counts cross-module dependencies/] } ],
  },
  {
    name: 'existing: relation coverage note (truthful case) — a genuinely uncovered grammar is named correctly',
    todo: false, // regression pin for the same invariant as tests/relation-coverage.test.mjs, run through this instrument
    buildRepo(tmp) {
      const repo = join(tmp, 'r'); initRepo(repo);
      w(repo, 'packages/core/util.ts', 'export const util = () => 1;\n');
      w(repo, 'apps/a/main.ts', "import { util } from '../../packages/core/util';\nexport const a = () => util();\n");
      w(repo, 'src/main.zig', 'const std = @import("std");\n\npub fn main() void {\n    std.debug.print("hello\\n", .{});\n}\n');
      w(repo, 'src/lib.zig', 'pub fn add(a: i32, b: i32) i32 {\n    return a + b;\n}\n');
      w(repo, 'src/util.zig', 'pub fn double(a: i32) i32 {\n    return a * 2;\n}\n');
      commitAll(repo, 'base');
      return repo; },
    commands: [ { args: ['status'], mustContain: [/^resolution does not cover 3 files \(zig\) — conventions layer only for those$/m] } ],
  },
];

for (const c of cases) {
  test(c.name, { todo: c.todo || false }, () => {
    const tmp = mkdtempSync(join(tmpdir(), 'grain-disclosure-'));
    try {
      const repo = c.buildRepo(tmp);
      for (const cmd of c.commands) {
        const out = grain(repo, cmd.args);
        for (const pat of cmd.mustContain || [])
          assert.match(out, toRegex(pat), `[${c.name}] grain ${cmd.args.join(' ')} — expected output to contain ${pat}\n--- actual ---\n${out}`);
        for (const pat of cmd.mustNotContain || [])
          assert.doesNotMatch(out, toRegex(pat), `[${c.name}] grain ${cmd.args.join(' ')} — expected output NOT to contain ${pat}\n--- actual ---\n${out}`);
      }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
}
