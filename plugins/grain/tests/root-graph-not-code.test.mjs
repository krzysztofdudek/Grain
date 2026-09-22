// After `yg adopt`, the repository's own `.yggdrasil/` holds the proposal's drill corpora: full copies of the
// repository's files, committed. Grain's git mode mined every tracked file but its own stores, so those copies
// were counted as code a second time and even became a module of their own. The root graph is not the
// repository's code; a `.yggdrasil/` deeper down still marks a nested project and is left to the node layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARD_EXCL } from '../engine/config.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');

test('the root graph is excluded, a nested one is not', () => {
  assert.ok(HARD_EXCL.test('.yggdrasil/aspects/x/drills/violates-a/src/m1.ts'));
  assert.ok(HARD_EXCL.test('.yggdrasil'));
  assert.ok(!HARD_EXCL.test('packages/api/.yggdrasil/model/api/yg-node.yaml'), 'a nested graph marks a nested project');
  assert.ok(!HARD_EXCL.test('src/.yggdrasilish.ts'));
});

test('drill-corpus copies under the adopted graph are never mined as code', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'root-graph-'));
  try {
    const repo = join(tmp, 'repo');
    mkdirSync(join(repo, 'src'), { recursive: true });
    for (let i = 1; i <= 6; i++) writeFileSync(join(repo, 'src', `m${i}.ts`), `export const m${i} = ${i};\n`);
    const copy = join(repo, '.yggdrasil', 'aspects', 'x', 'drills', 'violates-src-a', 'src');
    mkdirSync(copy, { recursive: true });
    writeFileSync(join(copy, 'm1.ts'), 'export const m1 = 1;\n');
    const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
    execFileSync('git', ['init', '-q'], { cwd: repo, env });
    execFileSync('git', ['add', '-A'], { cwd: repo, env });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo, env });
    const r = spawnSync('node', [BIN, 'export', '--no-history'], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 120_000 });
    assert.equal(r.status, 0, r.stderr);
    const modules = (JSON.parse(r.stdout).moduleGraph?.nodes || []).map((n) => [n.id, n.files]);
    assert.deepEqual(modules, [['src', 6]], `mined modules: ${JSON.stringify(modules)}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
