// §036 — regression in §032's own fix: `exactLocal` (the gate that decides "external/vendor type, no declaration
// here") was computed from `defined` AFTER `defined.sort(...).splice(12)` had already thrown away everything past
// the 12th entry, and that sort was by PATH then LINE — not by relevance. On a query with heavy token collision
// (a common word/suffix shared by a dozen unrelated local declarations), the real exact-name declaration is easily
// pushed past position 12 by nothing more than alphabetically-earlier paths, and `exactLocal` goes false — which is
// PRECISELY §032's gate for "no declaration anywhere in this repository (likely an external/vendor type)". So the
// display cap manufactured a false claim about a type that IS declared right here.
//
// Measured live: Kotlin/okhttp, `grain what Interceptor` — `Interceptor.kt` declares `fun interface Interceptor`,
// arguably okhttp's most important public type, and grain called it external/vendor.
//
// Fix (core.mjs, whatCmd): `exactLocal` is now computed over the FULL `defined` set, before the splice(12) cap.
// The cap is a display concern; a display cap must never decide a semantic verdict. Also: `defined`'s sort now
// hoists an exact-name match to the front (stable otherwise), so the true answer is not merely counted correctly
// but actually SHOWN in the capped list, not just some other colliding entry.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const initRepo = prefix => { const tmp = mkdtempSync(join(tmpdir(), prefix)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };
const fillers = (dir, n) => { for (let i = 1; i <= n; i++) w(dir, `src/filler${i}.ts`, `export function f${i}(): number { return ${i}; }\n`); };
const pad = n => String(n).padStart(2, '0');

// ===========================================================================================================
// The okhttp shape, reproduced in miniature: 12 unrelated declarations all sharing the "intercept" token with the
// query, at paths that sort ALPHABETICALLY BEFORE the one file that declares the real, exact `Interceptor` type —
// 13 token-colliding declarations total, the real one sorting last. Under the old rel/line-only sort + splice(12)
// BEFORE computing exactLocal, the real declaration is the 13th entry and gets thrown away before exactLocal is
// ever computed — exactLocal goes false, and `what Interceptor` claims it is external/vendor.
// ===========================================================================================================
let tmp, repo;
before(() => {
  ({ tmp, repo } = initRepo('grain-what-exactlocal-trunc-'));
  for (let i = 1; i <= 12; i++) {
    w(repo, `src/collide/c${pad(i)}.ts`, `export class C${pad(i)}Interceptor { handle(): number { return ${i}; } }\n`);
  }
  // sorts after every src/collide/* path — the real declaration, pushed to 13th place by the old sort
  w(repo, 'src/zzzlate/Interceptor.ts', 'export interface Interceptor { intercept(x: number): number; }\n');
  fillers(repo, 13);
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'the token-collision fixture');
  const st = grainIn(repo, ['status']); assert.equal(st.code, 0, st.err);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(1) `what Interceptor` finds the real local declaration even though 12 colliding names sort before it', () => {
  const j = JSON.parse(grainIn(repo, ['what', 'Interceptor', '--json']).out);
  assert.ok(j.defined.some(d => d.name === 'Interceptor' && d.rel === 'src/zzzlate/Interceptor.ts'),
    `the real Interceptor declaration must be found: ${JSON.stringify(j.defined)}`);
  assert.equal(j.referenced, null, `a locally-declared type must not get the external/vendor disclosure: ${JSON.stringify(j.referenced)}`);
});

test('(2) the text rendering reports it as declared here, and does NOT claim external/vendor', () => {
  const r = grainIn(repo, ['what', 'Interceptor']);
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.out.includes('has no declaration anywhere in this repository'), r.out);
  assert.ok(!r.out.includes('external/vendor'), r.out);
  assert.match(r.out, /defined:.*Interceptor\.ts.*`Interceptor`/, r.out);
});

test('(3) the real declaration is actually SHOWN, not just counted — it sorts first among the capped 12', () => {
  const j = JSON.parse(grainIn(repo, ['what', 'Interceptor', '--json']).out);
  assert.ok(j.defined.length <= 12, `the display cap is unchanged: ${j.defined.length}`);
  assert.equal(j.defined[0].name, 'Interceptor', `the exact match should sort first so it survives the cap: ${JSON.stringify(j.defined)}`);
  assert.equal(j.defined[0].rel, 'src/zzzlate/Interceptor.ts');
});

test('(4) 032\'s genuine external-type case is unaffected — still no local declaration, still disclosed as one', () => {
  // same repo, a name that truly has no declaration or structural reference anywhere: honest absence, not a
  // regression into "everything is local now"
  const j = JSON.parse(grainIn(repo, ['what', 'TotallyAbsentTypeXyz', '--json']).out);
  assert.deepEqual(j.defined, []);
  assert.equal(j.referenced, null, JSON.stringify(j.referenced));
});
