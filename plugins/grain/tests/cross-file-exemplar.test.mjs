// The "In this file, `X` (line N) conforms." line (checkFile, core.mjs) points a deviation's reader at a conforming
// NEIGHBOUR IN THE SAME FILE — a field report called it the single most useful line `check` printed all session,
// because the reader can open one file and see both sides. But that pointer only ever looks inside the current
// file's own extracted `scopes` — when the file being checked has no other scope of the same kind (a small file, or
// one where every other scope is also a deviant), the pointer silently disappears and the reader gets nothing to
// copy from.
//
// This covers the fallback: when there is no same-file conforming neighbour, `checkFile` now points at the
// governing fact's own nearest conforming exemplar ANYWHERE in the repo — the same `{ rel, line, name }` data
// already read for the "See:" line just above it, not new data, just consulted one line earlier.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFile } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const BASE_ENV = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
const git = (args, extraEnv = {}) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, ...BASE_ENV, ...extraEnv } });
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return (r.stdout || '').replace(/\n$/, ''); };
// two commits, 20 days apart: `auto.deco:@Service` needs its established (majority) population to have SURVIVED
// `freshDays` (14d, measured from age at HEAD's own commit date, not wall-clock real time) — the planted deviants
// land in the later commit and never need to survive at all, exactly like the fixture's real planted deviant does
let day = 0; const T0 = Date.UTC(2024, 0, 15, 12, 0, 0);
const commit = (msg, daysLater = 20) => { day += daysLater; const d = new Date(T0 + day * 86400000).toISOString();
  git(['add', '-A']); git(['commit', '-q', '-m', msg], { GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d }); };

const cap = s => s[0].toUpperCase() + s.slice(1);
// 20 distinct-bodied carriers (never boilerplate-identical — the engine discounts near-duplicate scopes, which
// would otherwise starve the fact of the codelength evidence it needs to fire) establish `types here are annotated
// with `@Service`` well past both acceptance gates (bits > 0, and the printed share >= 1 - 1/lambda)
const nouns = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel2', 'india2', 'juliet',
  'kilo', 'lima', 'mike', 'november', 'oscar', 'papa', 'quebec', 'romeo', 'sierra', 'tango'];
const svc = n => `@Service()\nexport class ${cap(n)}Service {\n  run(): number {\n    return this.${n}Count();\n  }\n\n  private ${n}Count(): number {\n    return '${n}'.length;\n  }\n}\n`;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-xexemplar-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git(['init', '-q', '-b', 'main']); git(['config', 'commit.gpgsign', 'false']);
  for (const n of nouns) w(`src/svc/${n}.service.ts`, svc(n));
  // IndiaConforms establishes alongside the rest; IndiaDeviant is not born yet — it lands later, in the SAME file
  w('src/svc/india.ts', `@Service()\nexport class IndiaConforms {\n  run(): number {\n    return this.indiaCount();\n  }\n\n  private indiaCount(): number {\n    return 'india'.length;\n  }\n}\n`);
  commit('base: establish the @Service convention', 0);
  // HotelOnly: a lone type-kind scope in its own file — no same-file neighbour can ever exist for it.
  // IndiaDeviant: a second class appended into india.ts, right next to the now-established IndiaConforms.
  w('src/svc/HotelOnly.ts', `export class HotelOnly {\n  run(): number {\n    return this.hotelCount();\n  }\n\n  private hotelCount(): number {\n    return 'hotel'.length;\n  }\n}\n`);
  w('src/svc/india.ts', `@Service()\nexport class IndiaConforms {\n  run(): number {\n    return this.indiaCount();\n  }\n\n  private indiaCount(): number {\n    return 'india'.length;\n  }\n}\n\nexport class IndiaDeviant {\n  run(): number {\n    return this.deviantCount();\n  }\n\n  private deviantCount(): number {\n    return 'deviant'.length;\n  }\n}\n`);
  commit('feat: HotelOnly + IndiaDeviant (planted deviants)', 20);
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('non-regression: a same-file conforming neighbour still prints "In this file, X conforms." unchanged', () => {
  const out = grain(['check', 'src/svc/india.ts', '--all']);
  assert.match(out, /is not annotated with `@Service`/);
  assert.match(out, /\n  In this file, `IndiaConforms` \(line 2\) conforms\.\n/, `expected the same-file pointer: ${out}`);
  assert.doesNotMatch(out, /Nearest conforming exemplar/, 'a same-file neighbour exists — the cross-file fallback must not also fire');
});

test('new fallback: no same-file neighbour falls back to the nearest conforming exemplar anywhere in the repo', () => {
  const out = grain(['check', 'src/svc/HotelOnly.ts', '--all']);
  assert.match(out, /is not annotated with `@Service`/);
  assert.doesNotMatch(out, /In this file,/, 'sanity: HotelOnly.ts has no other type-kind scope to be a same-file neighbour');
  assert.match(out, /\n  Nearest conforming exemplar: src\/svc\/alpha\.service\.ts:2 `AlphaService`\.\n/,
    `expected a real cross-file pointer, not silence: ${out}`);
});

test('edge case: an exemplar list that (defensively) contains the deviant\'s own identity is filtered, never self-pointing', async () => {
  const model = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));
  for (const p of model.partitions) for (const f of p.facts) if (f.pid === 'auto.deco:@Service')
    f.exemplars = [{ rel: 'src/svc/HotelOnly.ts', line: 1, name: 'HotelOnly' }, ...f.exemplars]; // poison: self, prepended
  const r = await checkFile({ model, root: repo, rel: 'src/svc/HotelOnly.ts', exemplarOk: () => true });
  const msg = r.msgs.find(m => m.pid === 'auto.deco:@Service');
  assert.ok(msg, 'expected the deviation to still fire');
  assert.doesNotMatch(msg.text, /Nearest conforming exemplar: src\/svc\/HotelOnly\.ts/, 'must never point a file at itself');
  assert.match(msg.text, /Nearest conforming exemplar: src\/svc\/alpha\.service\.ts:2 `AlphaService`\./, 'falls through to the next, real exemplar');
});

test('edge case: zero exemplars available at render time falls back to the current (silent) behavior — never fabricated, never a crash', async () => {
  const model = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));
  const r = await checkFile({ model, root: repo, rel: 'src/svc/HotelOnly.ts', exemplarOk: () => false });
  const msg = r.msgs.find(m => m.pid === 'auto.deco:@Service');
  assert.ok(msg, 'expected the deviation to still fire');
  assert.doesNotMatch(msg.text, /Nearest conforming exemplar/, 'no exemplar survives render-time validation — nothing to print, exactly as before this change');
});
