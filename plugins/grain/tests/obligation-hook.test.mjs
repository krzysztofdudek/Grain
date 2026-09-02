// Ticket 088 — the PreToolUse `check-hook --pre` (the hook that already fires on every `Write` of a NEW path,
// per ticket 081's own measurement) also speaks `obligation <path>`'s two labelled sets (specific/ambient, §073),
// but ONLY when the birth-obligation table actually CERTIFIES a specific rule for that path's (module, suffix)
// class — never on "nothing certifies" or ambient-only, which would print a hollow note on nearly every file
// creation (ticket 081 measured 0 of 8 real trial creation events certifying anything; corpus-wide coverage is
// 0.096, 6 of 20 repos). This file proves BOTH halves: a fixture where the birth rule certifies something real
// (the fires-correctly case) and a class with no certifiable rule in the SAME model (the stays-silent case) —
// reusing fixture A's exact shape from tests/obligation.test.mjs (6 births under d/*.x, `reg.txt` certified 6 of
// 6, `CHANGES` reported separately as ambient).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const grain = (args, cwd) => { const r = spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };

const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
function commitAt(dir, msg, day) {
  const d = new Date(T0 + day * 86400000).toISOString();
  gitIn(dir, 'add', '-A');
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } });
}
function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
}

// identical to tests/obligation.test.mjs's buildFixtureA — n=6 births under d/*.x, reg.txt certified 6 of 6,
// CHANGES ambient (its own 17-of-17 global rate already clears the display bound independent of any class)
function buildFixtureA(dir) {
  initRepo(dir);
  w(dir, 'src/base.ts', 'export class Base {}\n');
  w(dir, 'reg.txt', 'reg v0\n');
  w(dir, 'CHANGES', 'v0\n');
  w(dir, 'noise.txt', 'noise v0\n');
  commitAt(dir, 'scaffold', 0);
  for (let i = 1; i <= 6; i++) {
    w(dir, `d/new${i}.x`, `payload ${i}\n`);
    w(dir, 'reg.txt', `reg v${i}\n`);
    w(dir, 'CHANGES', `v${i}\n`);
    commitAt(dir, `add d/new${i}.x`, i * 2);
  }
  for (let i = 1; i <= 10; i++) {
    w(dir, 'noise.txt', `noise v${i}\n`);
    w(dir, 'CHANGES', `v${6 + i}\n`);
    commitAt(dir, `noise ${i}`, 12 + i * 2);
  }
}

// invokes `check-hook --pre` exactly as hooks.json wires it for a Write PreToolUse — the target path need not
// (and, for the fires-correctly case, must not) exist on disk yet.
const preHook = (cwd, fp) => {
  const r = spawnSync('node', [BIN, 'check-hook', '--pre'], {
    cwd,
    encoding: 'utf8',
    input: JSON.stringify({ cwd, tool_name: 'Write', tool_input: { file_path: join(cwd, fp) } }),
  });
  return { out: (r.stdout || '').trim(), err: r.stderr || '', code: r.status };
};

let tmp, repoA;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-obligation-hook-'));
  repoA = join(tmp, 'a');
  buildFixtureA(repoA);
  assert.equal(grain(['status'], repoA).code, 0, 'fixture precondition: the index must build cleanly');
});
after(() => rmSync(tmp, { recursive: true, force: true }));

test('fires: a NEW file under a class the birth rule certifies gets both labelled sets, unbidden, before the write', () => {
  const r = preHook(repoA, 'd/new7.x'); // does not exist on disk — genuinely pre-write
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out, 'expected the hook to speak — this class has a certified rule');
  const j = JSON.parse(r.out);
  assert.equal(j.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(j.hookSpecificOutput.permissionDecision, undefined, 'must never auto-approve the Write');
  const text = j.hookSpecificOutput.additionalContext;
  assert.match(text, /\[grain\] obligation: a new \*\.x under d\/ has come with:/, `expected the obligation header, got:\n${text}`);
  assert.match(text, /reg\.txt \(6 of 6\)/, `expected the certified rule named 6 of 6, got:\n${text}`);
  assert.match(text, /ambient \(touched by almost everything regardless\): CHANGES \(17 of 17\)/, `expected CHANGES reported separately as ambient, got:\n${text}`);
  assert.match(text, /grain obligation d\/new7\.x/, `expected a pointer to the full \`grain obligation\` table, got:\n${text}`);
});

test('stays silent: a NEW file under a class with no certified rule prints nothing about obligation — never a hollow header', () => {
  const r = preHook(repoA, 'other/new.zzz'); // a (module, suffix) class absent from the table entirely (n: 0)
  assert.equal(r.code, 0, r.err);
  // this fixture is far below placementHit's own 20-file floor too, so the WHOLE hook is silent here — the
  // stronger and more honest assertion than merely grepping the text for the word "obligation"
  assert.equal(r.out, '', `expected complete silence when nothing certifies, got:\n${r.out}`);
});

test('stays silent: a class present in the table but below CFG.minRaw certifies nothing, and the hook says nothing about it', () => {
  const dir = join(tmp, 'floor');
  initRepo(dir);
  w(dir, 'src/base.ts', 'export class Base {}\n');
  w(dir, 'companion.txt', 'v0\n');
  commitAt(dir, 'scaffold', 0);
  for (let i = 1; i <= 3; i++) { // 3 births — below CFG.minRaw = 5, so certifyObligationRules returns early
    w(dir, `d/new${i}.x`, `payload ${i}\n`);
    w(dir, 'companion.txt', `v${i}\n`);
    commitAt(dir, `add d/new${i}.x`, i * 2);
  }
  assert.equal(grain(['status'], dir).code, 0);
  const r = preHook(dir, 'd/new4.x');
  assert.equal(r.code, 0, r.err);
  assert.ok(!/obligation:/.test(r.out), `must not speak about obligation below CFG.minRaw, got:\n${r.out}`);
});
