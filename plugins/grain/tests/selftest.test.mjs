// `grain selftest` — the public, human-readable form of the mutate-test detection harness.
//   node --test plugins/grain/tests/      (from the repo root)      or      npm test   (inside plugins/grain)
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
let tmp, repo;
const grain = (args, opts = {}) => { const r = spawnSync('node', [BIN, ...args], { cwd: opts.cwd || repo, encoding: 'utf8', input: opts.input, env: { ...process.env, ...(opts.env || {}) } });
  return { out: (r.stdout || "").replace(/\n$/, ""), err: r.stderr, code: r.status }; };

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-selftest-')); repo = join(tmp, 'fixture'); execFileSync('node', [BUILDER, repo], { stdio: 'pipe' }); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('(a) selftest (text mode) prints one summary line with the expected shape', () => {
  grain(['status']);
  const { out, code } = grain(['selftest']);
  assert.equal(code, 0, out);
  assert.match(out, /^selftest: \d+\/\d+ planted deviations caught · \d+ false fires · \d+ unsupported$/m);
});

test('(b) the text line\'s numbers are consistent with mutate-test --json on the same fixture', () => {
  grain(['status']);
  const json = JSON.parse(grain(['mutate-test']).out.replace(/\nas of .*$/, ''));
  const plantable = json.detected + json.missed;
  const text = grain(['selftest']).out;
  const m = /^selftest: (\d+)\/(\d+) planted deviations caught · (\d+) false fires · (\d+) unsupported$/m.exec(text);
  assert.ok(m, text);
  assert.equal(+m[1], json.detected);
  assert.equal(+m[2], plantable);
  assert.equal(+m[3], json.falseFire);
  assert.equal(+m[4], json.unsupported);
});

test('(c) selftest --json is one parseable document: mutate-test\'s 6-key payload plus a folded `asOf` stamp', () => {
  grain(['status']);
  // `selftest --json` must itself be valid JSON — no trailing "as of <sha>" text line (025) — so it is parsed
  // directly here, unlike `mutate-test --json`, which stays a deliberately different two-part text+stamp format
  // (see grain.mjs's own comment on that asymmetry) and still needs the strip.
  const a = JSON.parse(grain(['selftest', '--json']).out);
  const b = JSON.parse(grain(['mutate-test']).out.replace(/\nas of .*$/, ''));
  assert.deepEqual(Object.keys(a).sort(), ['asOf', 'cases', 'detected', 'falseFire', 'missed', 'silentOK', 'unsupported'].sort());
  assert.match(a.asOf, /^[0-9a-f]{7,}(\+dirty)?( \(STALE\))?$/, `asOf must carry the freshness stamp's own payload: ${a.asOf}`);
  const { asOf, ...payload } = a;
  assert.deepEqual(payload, b, 'the detection payload itself must still be an unmodified passthrough of mutate-test\'s own result');
});

test('(d) selftest --how does not crash', () => {
  grain(['status']);
  const { code, err } = grain(['selftest', '--how']);
  assert.ok(code === 0 || (code !== null && !/at .*\.mjs:\d+/.test(err)), `unhandled exception:\n${err}`);
});
