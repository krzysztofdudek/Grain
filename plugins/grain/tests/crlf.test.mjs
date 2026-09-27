// Run from plugins/grain: node --import ./tests/git-env.mjs --test tests/crlf.test.mjs
// A repository whose sources are committed with CRLF line endings (issue 481) — what a Windows team often has — must be
// understood the same as the one with LF: the same conventions, the same places, the same deviations. The shared
// fixture is built twice, once with --crlf; the two histories differ in nothing but the line endings.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
let tmp;
const repos = {};

const grain = (dir, ...args) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
// what differs between the two builds: the commit ids (the blobs differ), the paths and the build time
const same = (dir, text) => text.replace(/[0-9a-f]{7,40}/g, '<sha>').replace(/built \S+ in \d+ms/g, 'built').split(dir).join('<repo>');

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-crlf-'));
  repos.lf = join(tmp, 'lf');
  repos.crlf = join(tmp, 'crlf');
  execFileSync(process.execPath, [BUILDER, repos.lf], { stdio: 'pipe' });
  execFileSync(process.execPath, [BUILDER, repos.crlf, '--crlf'], { stdio: 'pipe' });
});
after(() => rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));

test('the CRLF build really holds CRLF', () => {
  const blob = execFileSync('git', ['-C', repos.crlf, 'show', 'HEAD:src/handlers/refund.handler.ts'], { encoding: 'utf8' });
  assert.match(blob, /\r\n/);
});

for (const args of [['report'], ['where', 'handler'], ['check', 'src/handlers/refund.handler.ts', '--all']])
  test(`\`grain ${args.join(' ')}\` answers the same for CRLF sources as for LF`, () => {
    const lf = grain(repos.lf, ...args);
    assert.equal(same(repos.crlf, grain(repos.crlf, ...args)), same(repos.lf, lf));
    if (args[0] === 'check') assert.match(lf, /governed by [1-9]/, `a convention governs the file, so two empty answers are not what is compared: ${lf}`);
  });
