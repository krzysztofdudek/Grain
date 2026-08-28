// `where`'s group/marker cards already fold companion-file and registration-file evidence into one "a new
// member/carrier comes with:" line (groupImplied/markerImplied). Separately, `auto.filebirth` ('new' vs
// 'existing', history.mjs + core.mjs) answers the exact same underlying question — "what does a new instance of
// this pattern look like" — but used to surface only as one of the card's ordinary top-6 fact bullets, disconnected
// from the "comes with" line. This test fixture plants BOTH an accepted `auto.filebirth` fact and companion
// evidence for the same @Handler population, so the "comes with" line reads as one recipe instead of two.
//
// It also exercises the negative case for free: a role-level group carved out of the SAME 27 handlers never earns
// its OWN accepted `auto.filebirth` fact (only the repo-wide `_all:type` cid does — a role-cid fact would say
// nothing beyond what `_all` already says, so mine() never emits one) — so the group's "comes with" line must stay
// exactly as it was before this change: a same-stem companion clause only, no fabricated filebirth clause.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: `${iso}T12:00:00Z`, GIT_COMMITTER_DATE: `${iso}T12:00:00Z` });
const git = (env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } });
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return (r.stdout || '').replace(/\n$/, ''); };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-where-recipe-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git({}, 'init', '-q', '-b', 'main'); git({}, 'config', 'commit.gpgsign', 'false');
  // 27 decorated handler classes, each born as the first commit of its own brand-new file (git status 'A'), each
  // with a same-stem `.meta.json` companion — a marker AND a group population at once, both a companion and a
  // filebirth verdict for `where` to fold together
  for (let i = 0; i < 27; i++) {
    w(`src/handlers/Handler${i}.ts`, `@Handler()\nexport class Handler${i} {\n  run() {\n    return ${i};\n  }\n}\n`);
    w(`src/handlers/Handler${i}.meta.json`, `{"id":${i}}\n`);
  }
  git(dateEnv('2026-01-10'), 'add', '-A'); git(dateEnv('2026-01-10'), 'commit', '-qm', 'add 27 handler files with companions');
  w('NOTES.md', 'notes\n'); // pushes HEAD's own timestamp forward so the code above clears freshDays and is "established"
  git(dateEnv('2026-03-15'), 'add', '-A'); git(dateEnv('2026-03-15'), 'commit', '-qm', 'notes');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('a marker\'s "comes with" line folds an accepted auto.filebirth verdict together with its companion evidence', () => {
  const out = grain(['where', '@Handler marker', '--top', '5']);
  assert.match(out, /→ marker @Handler/, `sanity: the marker card must be found: ${out}`);
  assert.match(out,
    /a new carrier comes with: usually starts a new file \(100% of 27\) · a same-stem `\*\.meta\.json` companion \(100% of 27 have one, e\.g\. `src\/handlers\/Handler0\.meta\.json`\)/,
    `expected the combined recipe line: ${out}`);
  // the filebirth fact must not ALSO print as its own ordinary bullet on the same card — one statement, once
  const marker = out.split(/«@Handler marker» → /).find(b => b.startsWith('marker @Handler'));
  assert.doesNotMatch(marker, /^\s*-.*usually start(s)? a new file/m, `filebirth must not double-print as an ordinary bullet on the marker card: ${marker}`);
});

test('a group carved out of the same population, with NO accepted filebirth fact of its own, keeps its "comes with" line unchanged (companion only)', () => {
  const out = grain(['where', 'group Handler', '--top', '5']);
  assert.match(out, /→ group Handler/, `sanity: the group card must be found: ${out}`);
  const group = out.split(/«group Handler» → /).find(b => b.startsWith('group Handler'));
  assert.match(group,
    /a new member comes with: a same-stem `\*\.meta\.json` companion \(100% of 20 have one, e\.g\. `src\/handlers\/Handler0\.meta\.json`\)/,
    `expected the pre-existing companion-only recipe line, unchanged: ${group}`);
  assert.doesNotMatch(group, /starts a new file|added to an existing file/, `no fabricated filebirth clause when none is accepted for this role's own population: ${group}`);
});
