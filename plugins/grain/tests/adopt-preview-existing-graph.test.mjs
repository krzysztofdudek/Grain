// `grain propose` previews its own proposal with `yg adopt <out> --dry-run`. In a repository that already has a
// graph, `yg adopt` refuses to merge over it before it reaches its dry run, so the preview printed nothing but
// that refusal, and the `next:` line sent the reader to the same refused command. With a graph present both
// carry `--replace`, which a dry run still never acts on. The Yggdrasil CLI here is a real program that
// records the arguments it was started with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');

function repoWith({ graph }) {
  const tmp = mkdtempSync(join(tmpdir(), 'adopt-preview-'));
  const repo = join(tmp, 'repo');
  mkdirSync(join(repo, 'src'), { recursive: true });
  for (const n of ['a', 'b', 'c']) writeFileSync(join(repo, 'src', `${n}.ts`), `export const ${n} = 1;\n`);
  if (graph) {
    mkdirSync(join(repo, '.yggdrasil'), { recursive: true });
    writeFileSync(join(repo, '.yggdrasil', 'yg-config.yaml'), 'version: 1\n');
  }
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  execFileSync('git', ['init', '-q'], { cwd: repo, env });
  execFileSync('git', ['add', '-A'], { cwd: repo, env });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo, env });
  const calls = join(tmp, 'calls.log');
  const yg = join(tmp, 'yg-stub.mjs');
  writeFileSync(yg, `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2)) + '\\n');\nif (process.argv[2] === 'adopt') console.log('stub adopt preview');\n`);
  return { tmp, repo, calls, yg };
}

function propose({ repo, tmp, yg }) {
  return spawnSync('node', [BIN, 'propose', join(tmp, 'out'), '--no-history', '--no-family-candidates'], {
    cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 120_000, env: { ...process.env, YG_BIN: yg },
  });
}

const adoptCall = (calls) => readFileSync(calls, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).find((a) => a[0] === 'adopt');

test('with a graph already in the repository, the adopt preview and the next line carry --replace', () => {
  const ctx = repoWith({ graph: true });
  try {
    const r = propose(ctx);
    assert.equal(r.status, 0, r.stderr);
    const call = adoptCall(ctx.calls);
    assert.ok(call, 'the preview never ran yg adopt');
    assert.ok(call.includes('--replace') && call.includes('--dry-run'), `the preview ran \`yg ${call.join(' ')}\``);
    const out = `${r.stdout}${r.stderr}`;
    assert.match(out, /already has a graph, so `yg adopt \S+ --replace --dry-run` previews accepting it/);
  } finally { rmSync(ctx.tmp, { recursive: true, force: true }); }
});

test('with no graph yet, the preview is the plain dry run', () => {
  const ctx = repoWith({ graph: false });
  try {
    const r = propose(ctx);
    assert.equal(r.status, 0, r.stderr);
    const call = adoptCall(ctx.calls);
    assert.ok(call && call.includes('--dry-run') && !call.includes('--replace'), `the preview ran \`yg ${call && call.join(' ')}\``);
  } finally { rmSync(ctx.tmp, { recursive: true, force: true }); }
});
