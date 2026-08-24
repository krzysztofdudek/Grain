// Placement on create (grain-authored): a NEW file whose name-kin already live in one place draws a note at creation
// time — path evidence only, phrased as observation, never a command. This is the replay trials' measured failure
// class: line-level checks were structurally silent while both arms filed admin e2e specs one directory away from
// `admin-panel/`. Negative space matters as much: a file created where its kin already live must draw nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const check = rel => { const r = spawnSync('node', [BIN, 'check', rel], { cwd: repo, encoding: 'utf8' }); return { out: r.stdout || '', code: r.status }; };
const hook = rel => { const fp = join(repo, rel); const r = spawnSync('node', [BIN, 'check-hook'], { cwd: repo, encoding: 'utf8', input: JSON.stringify({ cwd: repo, tool_name: 'Write', tool_input: { file_path: fp } }) }); return (r.stdout || '').trim(); };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-place-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  const H = n => `export function h${n}() { return ${n}; }\n`;
  ['order-created', 'order-shipped', 'order-cancelled', 'order-paid'].forEach((n, i) => w(`src/orders/${n}.handler.ts`, H(i)));
  ['invoice-issued', 'invoice-voided'].forEach((n, i) => w(`src/billing/${n}.handler.ts`, H(10 + i)));
  ['user-created', 'user-deleted'].forEach((n, i) => w(`src/users/${n}.handler.ts`, H(20 + i)));
  ['mail-sent', 'mail-bounced', 'sms-sent', 'push-sent'].forEach((n, i) => w(`src/notify/${n}.handler.ts`, H(30 + i)));
  const SP = "export const t = () => 1;\n";
  ['a1', 'a2', 'a3'].forEach(n => w(`tests/alpha/${n}.spec.ts`, SP));
  ['b1', 'b2', 'b3'].forEach(n => w(`tests/beta/${n}.spec.ts`, SP));
  ['u1', 'u2', 'u3'].forEach(n => w(`src/lib/${n}.ts`, `export const ${n} = 1;\n`));
  git('add', '-A'); git('commit', '-qm', 'base');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('a new file whose name-kin live elsewhere draws the note, with counts and the kin directory', () => {
  w('src/misc/order-refunded.handler.ts', 'export function hx() { return 0; }\n');
  const c = check('src/misc/order-refunded.handler.ts');
  assert.match(c.out, /\[grain\] placement: `\*\.handler\.ts` files named like `order` live in `src\/orders\/` — 4 of 4; `src\/misc\/` holds none/);
  assert.match(c.out, /Deliberate placement is fine/);
});

test('the same file created where its kin already live draws nothing', () => {
  w('src/orders/order-refunded.handler.ts', 'export function hy() { return 0; }\n');
  const c = check('src/orders/order-refunded.handler.ts');
  assert.doesNotMatch(c.out, /\[grain\] placement/);
});

test('a suffix kept only in named subdirectories flags a file at the root of that tree', () => {
  w('tests/zz-stray.spec.ts', 'export const t = () => 1;\n');
  const c = check('tests/zz-stray.spec.ts');
  assert.match(c.out, /\[grain\] placement: every `\*\.spec\.ts` file under `tests\/` lives in a named subdirectory — `alpha\/` \(3\) · `beta\/` \(3\); none sit at the root/);
});

test('the hook carries the placement note for a freshly WRITTEN file', () => {
  w('src/misc2/order-disputed.handler.ts', 'export function hz() { return 0; }\n');
  const out = hook('src/misc2/order-disputed.handler.ts');
  assert.ok(out, 'hook must speak');
  const j = JSON.parse(out);
  assert.match(j.hookSpecificOutput.additionalContext, /placement: `\*\.handler\.ts` files named like `order` live in `src\/orders\/`/);
});
