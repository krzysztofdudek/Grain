// 007 — `rulesMarkdown()` (backing `grain rules`) never calls `relCoverageNote(model)` or `intraModuleNote(model)`,
// so the generated Markdown — the artifact meant for a reader with NO terminal and NO grain plugin installed —
// can present an architecture picture without either coverage disclosure `report()` prints for the identical
// model (§G21, §004). An undisclosed gap is worse there, not better: `report()` and `rules` must not disagree
// about what the resolution layer actually knows.
//
// Fixture (a) — relCoverageNote: reuses the `relation-coverage.test.mjs` shape (TS wired by one import + files in
// a grammar with no relSupported() extractor — zig).
// Fixture (b) — intraModuleNote: reuses the `python-module-deps.test.mjs` `pyIntra` shape (a small Python package,
// under the §G11 dominant-module refinement threshold, whose real intra-package imports all fold to zero at
// module level).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, mixedRepo, pyIntra;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const grainIn = repo => args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const w = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const initRepo = repo => { mkdirSync(repo, { recursive: true }); execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']); execFileSync('git', ['-C', repo, 'config', 'commit.gpgsign', 'false']); };
const commit = repo => execFileSync('git', ['-C', repo, 'commit', '-qm', 'base'], { env: { ...process.env, ...gitEnv } });
const addAll = repo => execFileSync('git', ['-C', repo, 'add', '-A']);

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-rules-cov-'));

  // (a) same shape as relation-coverage.test.mjs's `mixedRepo`: two TS modules wired by one import, plus three
  // .zig files (no relSupported() extractor) — zig is 3/5 = 60% of indexed files.
  mixedRepo = join(tmp, 'mixed'); initRepo(mixedRepo);
  w(mixedRepo, 'packages/core/util.ts', 'export const util = () => 1;\n');
  w(mixedRepo, 'apps/a/main.ts', "import { util } from '../../packages/core/util';\nexport const a = () => util();\n");
  w(mixedRepo, 'src/main.zig', 'const std = @import("std");\n\npub fn main() void {\n    std.debug.print("hello\\n", .{});\n}\n');
  w(mixedRepo, 'src/lib.zig', 'pub fn add(a: i32, b: i32) i32 {\n    return a + b;\n}\n');
  w(mixedRepo, 'src/util.zig', 'pub fn double(a: i32) i32 {\n    return a * 2;\n}\n');
  addAll(mixedRepo); commit(mixedRepo);

  // (b) same shape as python-module-deps.test.mjs's `pyIntra`: a small Python package (well under the §G11
  // dominant-module threshold) with real intra-package imports that all fold to zero at module level.
  pyIntra = join(tmp, 'py-intra'); mkdirSync(pyIntra);
  { const git = (...args) => execFileSync('git', ['-C', pyIntra, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
    git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
    w(pyIntra, 'pkg/__init__.py', '');
    w(pyIntra, 'pkg/other.py', 'class Thing:\n    pass\n');
    w(pyIntra, 'pkg/rel_user.py', 'from .other import Thing\n\n\nclass RelUser:\n    def make(self):\n        return Thing()\n');
    w(pyIntra, 'pkg/abs_user.py', 'from pkg.other import Thing\n\n\nclass AbsUser:\n    def make(self):\n        return Thing()\n');
    w(pyIntra, 'tests/test_x.py', 'def test_x():\n    pass\n');
    git('add', '-A'); git('commit', '-qm', 'base'); }

  for (const r of [mixedRepo, pyIntra]) { const s = grainIn(r)(['status']); assert.equal(s.code, 0, s.err); }
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('`grain rules` carries the same relation-coverage disclosure as `grain report`, for the identical model', () => {
  const grain = grainIn(mixedRepo);
  const reportOut = grain(['report']).out;
  assert.match(reportOut, /^  resolution does not cover 3 files \(zig\) — conventions layer only for those$/m,
    `fixture sanity: report() itself must carry the disclosure: ${reportOut}`);

  const r = grain(['rules']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^## Architecture$/m, `expected an Architecture section, got:\n${r.out}`);
  assert.match(r.out, /^resolution does not cover 3 files \(zig\) — conventions layer only for those\.?$/m,
    `grain rules must carry the same coverage disclosure report() does, got:\n${r.out}`);
});

test('`grain rules` carries the same intra-module-fold disclosure as `grain report` (§004), for the identical model', () => {
  const grain = grainIn(pyIntra);
  const reportOut = grain(['report']).out;
  assert.match(reportOut, /^  2 file-level edges resolved, none crossing a module boundary/m,
    `fixture sanity: report() itself must carry the §004 disclosure: ${reportOut}`);

  const r = grain(['rules']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^## Architecture$/m, `expected an Architecture section, got:\n${r.out}`);
  assert.match(r.out, /^2 file-level edges resolved, none crossing a module boundary/m,
    `grain rules must carry the same intra-module disclosure report() does, got:\n${r.out}`);
});

test('a repo entirely in relSupported grammars with real cross-module edges gets neither disclosure line in `grain rules`', () => {
  const tsRepo = join(tmp, 'ts-only'); initRepo(tsRepo);
  w(tsRepo, 'packages/core/util.ts', 'export const util = () => 1;\n');
  w(tsRepo, 'apps/a/main.ts', "import { util } from '../../packages/core/util';\nexport const a = () => util();\n");
  addAll(tsRepo); commit(tsRepo);
  const grain = grainIn(tsRepo);
  assert.equal(grain(['status']).code, 0);
  const r = grain(['rules']);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /resolution does not cover/, r.out);
  assert.doesNotMatch(r.out, /file-level edges? resolved, none crossing/, r.out);
});
