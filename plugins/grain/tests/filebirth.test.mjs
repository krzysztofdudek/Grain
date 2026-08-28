// New history-derived fact: `auto.filebirth` (type/method-kind scopes only) — whether a scope's birth commit also
// ADDED its file (git status 'A': a brand-new file) or landed inside a file already tracked (status 'M': e.g. a
// shared registry a maintainer keeps growing). Before this, grain's lifecycle layer (history.mjs) knew WHEN a scope
// was born but never whether that birth was a new-file event or an addition to an existing one — the one placement
// question it answered with silence for lack of a rule, not for lack of data.
//
// history.mjs: at the exact line a scope's lifecycle row is first created (`if (!L) { L = { ... }; ... }`), one field
// is added: `newFile: e.st === 'A'`, written once at birth and never revisited. core.mjs surfaces it as a categorical
// predicate `auto.filebirth` ('new'/'existing') in learn()'s prepare loop, for member-level (non-file, non-module)
// scopes only — a file-kind scope's own birth trivially always coincides with its file's birth, so the predicate
// would be tautological there.
//
// The critical negative case (mirrors the EXISTING rename protection this file's history.mjs already documents for
// a different reason — a directory move must not make every moved scope look newly "born"): a rename transplants a
// scope's lifecycle row from the old path key to the new one BEFORE the `if (!L)` birth check ever runs for that
// scope, so a renamed scope's `newFile` must stay exactly what it was at its ORIGINAL birth, never reset to `true`
// by the move.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBool } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo1, repo2;
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: `${iso}T12:00:00Z`, GIT_COMMITTER_DATE: `${iso}T12:00:00Z` });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } });
const w = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const cls = (name, ret) => `export class ${name} {\n  run() {\n    return ${ret};\n  }\n}\n`;
const grain = (repo, args) => spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' });
const grainOut = (repo, args) => { const r = grain(repo, args); assert.equal(r.status, 0, r.stdout + r.stderr); return (r.stdout || '').replace(/\n$/, ''); };
const grainJson = (repo, args) => JSON.parse(grainOut(repo, args));

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-filebirth-'));

  // repo1: a "new file" convention — 26 handlers born as the FIRST commit of their own brand-new file (status 'A'),
  // 1 born by being added into a file that was already tracked (a stub committed one commit earlier, status 'M')
  repo1 = join(tmp, 'r1'); mkdirSync(repo1);
  gitIn(repo1, {}, 'init', '-q', '-b', 'main'); gitIn(repo1, {}, 'config', 'commit.gpgsign', 'false');
  for (let i = 0; i < 26; i++) w(repo1, `src/handlers/Handler${i}.ts`, cls(`Handler${i}`, i));
  gitIn(repo1, dateEnv('2026-01-10'), 'add', '-A'); gitIn(repo1, dateEnv('2026-01-10'), 'commit', '-qm', 'add 26 new handler files');
  w(repo1, 'src/handlers/HandlerShared.ts', 'export {};\n'); // a stub — the file exists, but the class does not yet
  gitIn(repo1, dateEnv('2026-01-11'), 'add', '-A'); gitIn(repo1, dateEnv('2026-01-11'), 'commit', '-qm', 'add a stub shared handler file');
  w(repo1, 'src/handlers/HandlerShared.ts', cls('HandlerShared', 999)); // the class is born HERE, into an already-tracked file
  gitIn(repo1, dateEnv('2026-01-12'), 'add', '-A'); gitIn(repo1, dateEnv('2026-01-12'), 'commit', '-qm', 'flesh out the shared handler stub with a real class');
  w(repo1, 'NOTES.md', 'notes\n'); // pushes HEAD's own timestamp forward so the code above clears freshDays and is "established"
  gitIn(repo1, dateEnv('2026-03-01'), 'add', '-A'); gitIn(repo1, dateEnv('2026-03-01'), 'commit', '-qm', 'notes');
  const st1 = spawnSync('node', [BIN, 'status'], { cwd: repo1, encoding: 'utf8' }); assert.equal(st1.status, 0, st1.stdout + st1.stderr);

  // repo2: the opposite convention — 26 handlers born by being added into an already-tracked stub file, 1 born as a
  // brand-new file — a real, live pattern (a shared registry maintainers keep filling in)
  repo2 = join(tmp, 'r2'); mkdirSync(repo2);
  gitIn(repo2, {}, 'init', '-q', '-b', 'main'); gitIn(repo2, {}, 'config', 'commit.gpgsign', 'false');
  w(repo2, 'src/registry/RegistryLoneHandler.ts', cls('RegistryLoneHandler', 0));
  gitIn(repo2, dateEnv('2026-01-10'), 'add', '-A'); gitIn(repo2, dateEnv('2026-01-10'), 'commit', '-qm', 'add a standalone new registry handler');
  for (let i = 0; i < 26; i++) w(repo2, `src/registry/RegistryHandler${i}.ts`, 'export {};\n');
  gitIn(repo2, dateEnv('2026-01-11'), 'add', '-A'); gitIn(repo2, dateEnv('2026-01-11'), 'commit', '-qm', 'add 26 stub registry handler files');
  for (let i = 0; i < 26; i++) w(repo2, `src/registry/RegistryHandler${i}.ts`, cls(`RegistryHandler${i}`, i));
  gitIn(repo2, dateEnv('2026-01-12'), 'add', '-A'); gitIn(repo2, dateEnv('2026-01-12'), 'commit', '-qm', 'flesh out the 26 stub registry handlers with real classes');
  w(repo2, 'NOTES.md', 'notes\n');
  gitIn(repo2, dateEnv('2026-03-01'), 'add', '-A'); gitIn(repo2, dateEnv('2026-03-01'), 'commit', '-qm', 'notes');
  const st2 = spawnSync('node', [BIN, 'status'], { cwd: repo2, encoding: 'utf8' }); assert.equal(st2.status, 0, st2.stdout + st2.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('auto.filebirth is categorical, not boolean — it must not be swallowed by isBool', () => {
  assert.equal(isBool('auto.filebirth'), false);
});

test('a population mostly born as brand-new files establishes auto.filebirth as `new`, with the right share/count', () => {
  const out = grainOut(repo1, ['report']);
  assert.match(out, /repo-wide: types here usually start a new file — 96% of 27 established, 1 deviant/, out);
  assert.match(out, /repo-wide: methods here usually start a new file — 96% of 27 established, 1 deviant/, out);
});

test('a population mostly born into an already-existing file establishes auto.filebirth as `existing`, with the right share/count', () => {
  const out = grainOut(repo2, ['report']);
  assert.match(out, /repo-wide: types here are usually added to an existing file — 96% of 27 established, 1 deviant/, out);
  assert.match(out, /repo-wide: methods here are usually added to an existing file — 96% of 27 established, 1 deviant/, out);
});

test('auto.filebirth never appears on a file-kind (or module-kind) scope — the predicate is tautological there and must stay absent, not fabricated', () => {
  const j = grainJson(repo1, ['report', '--json']);
  const fb = j.partitions[0].conventions.filter(c => c.pid === 'auto.filebirth');
  assert.ok(fb.length > 0, 'sanity: the fact exists at all');
  assert.ok(fb.every(f => f.kind === 'type' || f.kind === 'method'), `auto.filebirth must only ever sit on type/method kinds, got: ${JSON.stringify(fb.map(f => f.kind))}`);
  assert.ok(!j.partitions[0].conventions.some(c => c.pid === 'auto.filebirth' && (c.kind === 'file' || c.kind === 'module')), 'a file/module-kind scope must never carry auto.filebirth');
});

test('THE critical negative case: renaming the lone existing-file-born class must not flip it to `new` — established share/count and the deviant must survive the move unchanged', () => {
  mkdirSync(join(repo1, 'src', 'moved'), { recursive: true });
  gitIn(repo1, dateEnv('2026-03-02'), 'mv', 'src/handlers/HandlerShared.ts', 'src/moved/HandlerShared.ts');
  gitIn(repo1, dateEnv('2026-03-02'), 'commit', '-qm', 'move the shared handler under src/moved/');

  const out = grainOut(repo1, ['report']);
  // if the rename were wrongly treated as a fresh birth (status 'A' for the new path), this would read
  // "100% of 27 established" with 0 deviants instead — the bug this test exists to catch
  assert.match(out, /repo-wide: types here usually start a new file — 96% of 27 established, 1 deviant/, `rename must not change the established share/count: ${out}`);

  const j = grainJson(repo1, ['report', '--json']);
  const typeFact = j.partitions[0].conventions.find(c => c.pid === 'auto.filebirth' && c.kind === 'type');
  assert.equal(typeFact.established, 27, 'no lifecycle row was duplicated by the rename');
  assert.equal(typeFact.deviantsN, 1);
  assert.equal(typeFact.deviants.length, 1);
  assert.equal(typeFact.deviants[0].rel, 'src/moved/HandlerShared.ts', 'the deviant follows the scope to its NEW path');
  assert.equal(typeFact.deviants[0].obs, 'existing', 'the moved scope\'s birth-file status must stay `existing` — a rename is neither a new-file nor an existing-file birth, so it must never re-derive one');
});

test('without history, auto.filebirth is simply absent — never a fabricated value (the general "without history nothing is established" rule)', () => {
  rmSync(join(repo1, '.grain', 'cache'), { recursive: true, force: true });
  const j = grainJson(repo1, ['report', '--json', '--no-history']);
  const conventions = j.partitions[0]?.conventions || [];
  assert.ok(!conventions.some(c => c.pid === 'auto.filebirth'), `auto.filebirth must not appear without history: ${JSON.stringify(conventions.map(c => c.pid))}`);
});
