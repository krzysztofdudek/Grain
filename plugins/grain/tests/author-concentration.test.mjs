// New annotation on an already-accepted fact: `authorConcentration(f, ps, H)` in core.mjs answers a question `held`
// already gestures at but never names — does this convention rest on many contributors (durable, real team
// consensus) or effectively one (a bus-factor risk: if that person leaves, nobody else may even know the rule
// exists)? For each of the fact's CONFORMING scopes (`f.conform`, never `f.deviants`), the credited author is
// whoever wrote the LAST event in that scope's `H.vev` history whose decoded value (`valOf(f.pid, e.val)`) equals
// the fact's accepted value `f.exp` — walked forward exactly like `calibrate` walks its own events, but starting at
// index 0 (unlike `calibrate`, which treats index 0 as a baseline): a scope whose value was correct from its very
// first recorded event and never rewritten must still be credited to that first event's author, not skipped for
// "no rewrite exists". Fires (`report`/`where` print `· 1 author` or `· mostly one author (N of M)`) only when the
// credited population clears `CFG.minRaw` and one author's share of it is `>= 2/3` (the same supermajority bar
// `placementHit`/`altMarkerFor` already use) — silent otherwise, including when `f.pid` is outside the small family
// `valOf` decodes (nameshape/first1/ret/deco:/extends:), where every scope contributes no credited author at all.
//
// Three fixtures below, all built with real git commits under different GIT_AUTHOR_NAME/EMAIL identities:
//   repo1 — a scope (T11) created by Alice, deviated by Bob, restored by Carol: proves credit follows the LAST
//           matching event (Carol), not the scope's creator (Alice) — while its sibling `type` fact (T11's class
//           itself never rewritten, since editing a nested method's return statement never touches the class
//           scope's own body hash) is correctly credited to Alice alone, giving a genuine, observable 11-vs-12 split.
//   repo2 — the same shape, but each instance has its own distinct author, no one dominating: must stay silent.
//   repo3 — every instance authored by ONE identity in ONE commit: `auto.nameshape` (valOf-supported) correctly
//           fires "1 author" on both facts it governs, while `auto.filenameshape` (valOf has no case for it, so
//           every scope's credited author comes back `undefined` and is skipped) stays silent in the SAME report —
//           proving the floor is about credited-population size, not merely "was there literally one author".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo1, repo2, repo3;
const dateEnv = (iso, name, email) => ({ GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, GIT_AUTHOR_DATE: `${iso}T12:00:00Z`, GIT_COMMITTER_DATE: `${iso}T12:00:00Z` });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } });
const w = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const clsStr = (name, val) => `export class ${name} {\n  run() {\n    return "${val}";\n  }\n}\n`;
const clsNum = (name, val) => `export class ${name} {\n  run() {\n    return ${val};\n  }\n}\n`;
const grain = (repo, args) => spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' });
const grainOut = (repo, args) => { const r = grain(repo, args); assert.equal(r.status, 0, r.stdout + r.stderr); return (r.stdout || '').replace(/\n$/, ''); };
const lineStarting = (out, prefix) => { const l = out.split('\n').find(x => x.startsWith(prefix)); assert.ok(l, `no line starting "${prefix}" in:\n${out}`); return l; };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-authorconc-'));

  // repo1: 11 classes born and never touched again by Carol, plus one (T11) that changes hands — Alice creates it,
  // Bob deviates its return value, Carol restores it. 36 scopes total (12 files + 12 types + 12 methods) clears the
  // >=30-scope floor a partition needs to speak conventions at all.
  repo1 = join(tmp, 'r1'); mkdirSync(repo1);
  gitIn(repo1, {}, 'init', '-q', '-b', 'main'); gitIn(repo1, {}, 'config', 'commit.gpgsign', 'false');
  for (let i = 0; i < 11; i++) w(repo1, `src/things/T${i}.ts`, clsStr(`T${i}`, 'ok'));
  gitIn(repo1, dateEnv('2026-01-10', 'Carol', 'carol@x'), 'add', '-A');
  gitIn(repo1, dateEnv('2026-01-10', 'Carol', 'carol@x'), 'commit', '-qm', 'carol adds 11 things');
  w(repo1, 'src/things/T11.ts', clsStr('T11', 'ok'));
  gitIn(repo1, dateEnv('2026-01-11', 'Alice', 'alice@x'), 'add', '-A');
  gitIn(repo1, dateEnv('2026-01-11', 'Alice', 'alice@x'), 'commit', '-qm', 'alice adds T11');
  w(repo1, 'src/things/T11.ts', clsNum('T11', 1));
  gitIn(repo1, dateEnv('2026-01-20', 'Bob', 'bob@x'), 'add', '-A');
  gitIn(repo1, dateEnv('2026-01-20', 'Bob', 'bob@x'), 'commit', '-qm', 'bob deviates T11 to a number return');
  w(repo1, 'src/things/T11.ts', clsStr('T11', 'ok'));
  gitIn(repo1, dateEnv('2026-01-30', 'Carol', 'carol@x'), 'add', '-A');
  gitIn(repo1, dateEnv('2026-01-30', 'Carol', 'carol@x'), 'commit', '-qm', 'carol restores T11 to a string return');
  w(repo1, 'NOTES.md', 'notes\n'); // pushes HEAD's own timestamp forward so the code above clears freshDays and is "established"
  gitIn(repo1, dateEnv('2026-03-01', 'Carol', 'carol@x'), 'add', '-A');
  gitIn(repo1, dateEnv('2026-03-01', 'Carol', 'carol@x'), 'commit', '-qm', 'notes');
  const st1 = grain(repo1, ['status']); assert.equal(st1.status, 0, st1.stdout + st1.stderr);

  // repo2: the same 12-class shape, but each class is born in its own commit by its own distinct identity — no
  // author ever touches a second scope, so no one identity can dominate.
  repo2 = join(tmp, 'r2'); mkdirSync(repo2);
  gitIn(repo2, {}, 'init', '-q', '-b', 'main'); gitIn(repo2, {}, 'config', 'commit.gpgsign', 'false');
  for (let i = 0; i < 12; i++) { const iso = '2026-01-' + String(10 + i).padStart(2, '0');
    w(repo2, `src/things/T${i}.ts`, clsStr(`T${i}`, 'ok'));
    gitIn(repo2, dateEnv(iso, `Author${i}`, `author${i}@x`), 'add', '-A');
    gitIn(repo2, dateEnv(iso, `Author${i}`, `author${i}@x`), 'commit', '-qm', `author${i} adds T${i}`); }
  w(repo2, 'NOTES.md', 'notes\n');
  gitIn(repo2, dateEnv('2026-03-01', 'Author0', 'author0@x'), 'add', '-A');
  gitIn(repo2, dateEnv('2026-03-01', 'Author0', 'author0@x'), 'commit', '-qm', 'notes');
  const st2 = grain(repo2, ['status']); assert.equal(st2.status, 0, st2.stdout + st2.stderr);

  // repo3: 12 classes, all born in ONE commit by ONE identity ("Solo") and never touched again.
  repo3 = join(tmp, 'r3'); mkdirSync(repo3);
  gitIn(repo3, {}, 'init', '-q', '-b', 'main'); gitIn(repo3, {}, 'config', 'commit.gpgsign', 'false');
  for (let i = 0; i < 12; i++) w(repo3, `src/things/T${i}.ts`, clsStr(`T${i}`, 'ok'));
  gitIn(repo3, dateEnv('2026-01-10', 'Solo', 'solo@x'), 'add', '-A');
  gitIn(repo3, dateEnv('2026-01-10', 'Solo', 'solo@x'), 'commit', '-qm', 'solo adds everything');
  w(repo3, 'NOTES.md', 'notes\n');
  gitIn(repo3, dateEnv('2026-03-01', 'Solo', 'solo@x'), 'add', '-A');
  gitIn(repo3, dateEnv('2026-03-01', 'Solo', 'solo@x'), 'commit', '-qm', 'notes');
  const st3 = grain(repo3, ['status']); assert.equal(st3.status, 0, st3.stdout + st3.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('a scope never rewritten is credited to its sole creator: the class fact (11 single-event Carols + 1 single-event Alice) reads "mostly one author (11 of 12)"', () => {
  const out = grainOut(repo1, ['report']);
  const typeLine = lineStarting(out, '  repo-wide: types here are named PascalCase');
  assert.match(typeLine, /100% of 12 established/, typeLine);
  assert.match(typeLine, / · mostly one author \(11 of 12\)$/, typeLine);
});

test('THE critical case: a scope rewritten after birth is credited to the LAST matching event, not its creator — the method fact reads "1 author" (12 of 12), not "mostly one author (11 of 12)"', () => {
  const out = grainOut(repo1, ['report']);
  const methodLine = lineStarting(out, '  repo-wide: methods here are named a single lowercase word');
  assert.match(methodLine, /100% of 12 established/, methodLine);
  // T11's method scope was born under Alice, deviated under Bob, restored under Carol. Its name ("run") never
  // changes, so every one of those three events decodes to the SAME nameshape value — the bug this test exists to
  // catch is crediting the FIRST such event (Alice, the creator) instead of the LAST (Carol, the restorer); that
  // bug would read "mostly one author (11 of 12)" here, identical to the sibling type fact above.
  assert.match(methodLine, / · 1 author$/, methodLine);
  assert.ok(!/mostly one author/.test(methodLine), methodLine);
});

test('healthy diversity — 12 different authors, none dominant — stays silent on both facts', () => {
  const out = grainOut(repo2, ['report']);
  const typeLine = lineStarting(out, '  repo-wide: types here are named PascalCase');
  const methodLine = lineStarting(out, '  repo-wide: methods here are named a single lowercase word');
  assert.match(typeLine, /100% of 12 established/, typeLine);
  assert.ok(!/ · (1 author|mostly one author)/.test(typeLine), typeLine);
  assert.ok(!/ · (1 author|mostly one author)/.test(methodLine), methodLine);
});

test('a population below CFG.minRaw stays silent even when it is literally one author: `auto.filenameshape` has no valOf case, so its credited population is always 0, while `auto.nameshape` (valOf-supported) on the very same one-author repo correctly fires', () => {
  const out = grainOut(repo3, ['report']);
  const fileLine = lineStarting(out, '  repo-wide: files here are named PascalCase');
  assert.match(fileLine, /100% of 12 established/, fileLine);
  assert.ok(!/ · (1 author|mostly one author)/.test(fileLine), `auto.filenameshape must stay silent (valOf has no case for it, credited population is always 0): ${fileLine}`);

  const typeLine = lineStarting(out, '  repo-wide: types here are named PascalCase');
  const methodLine = lineStarting(out, '  repo-wide: methods here are named a single lowercase word');
  assert.match(typeLine, / · 1 author$/, typeLine);
  assert.match(methodLine, / · 1 author$/, methodLine);
});

test('without history, authorConcentration is simply absent — never a fabricated value', () => {
  rmSync(join(repo1, '.grain', 'cache'), { recursive: true, force: true });
  const out = grainOut(repo1, ['report', '--no-history']);
  assert.ok(!/ · (1 author|mostly one author)/.test(out), out);
});
