// G18: the scope identity key `skeyR` (core.mjs) is `rel#kind#name` with a 4th, OPTIONAL segment appended only for
// the 2nd+ occurrence of an identical (rel, kind, name) — an internal deduplication ORDINAL, never a line number.
// `cmdWhere`'s `--json` branch (grain.mjs) naively destructured that 4th segment as `line`, so a marker/group card's
// `members` (raw skeyR keys) came out wrong: a member with NO ordinal (the common case — first or only occurrence)
// got `line: null`, and a member that IS a later occurrence of a duplicate name got its raw ordinal (1, 2, ...)
// printed as if it were a line number. The text (non-JSON) `where` path was already correct for marker/group cards,
// via `scopeLine()`; the fix makes the JSON branch call that same function for those two types.
//
// A `file`-type card's members are a DIFFERENT key shape (`rel#kind#name#line`, built in core.mjs's file-card pass)
// that already bakes in the real line directly — never an ordinal. Naively applying `scopeLine()` to THOSE keys
// regressed them to `null` (verified while building this fix: `scopeLine`'s lookup index is keyed the skeyR way,
// so a file-card key's literal `#<line>` suffix never matches). The fix keeps the pre-existing naive split for
// `h.type === 'file'` (still correct, mirrors core.mjs's own `matching` text-rendering branch) and routes only
// marker/group through `scopeLine()` (mirrors core.mjs's `withLine`) — this file's third test locks that in.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const git = (env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-g18-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git({}, 'init', '-q', '-b', 'main'); git({}, 'config', 'commit.gpgsign', 'false');
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  // two `handle` overloads in ONE file — same (rel, kind, name) — real lines 3 and 9 (checked by direct
  // extractScopes probe: decorator line does not count, the method's own line does). skeyR gives the first no
  // ordinal suffix (`...#handle`) and the second ordinal 1 (`...#handle#1`).
  w('src/svc/multi.ts', `export class MultiSvc {
  @Trace()
  handle(a) {
    return 1;
  }


  @Trace()
  handle(a, b) {
    return 2;
  }
}
`);
  // a 3rd @Trace carrier with a UNIQUE name — clears the >=3-carrier marker floor and, unlike `handle`, never gets
  // an ordinal suffix at all (the common case for almost every scope in a real repo)
  w('src/svc/other.ts', `export class OtherSvc {
  @Trace()
  run() {
    return 3;
  }
}
`);
  // filler, undecorated: `groupPartitions` merges any package under 100 scopes into a partition only once the
  // repo-wide small-package bucket reaches >=30 scopes — without this, the 7 scopes above form NO partition at
  // all and `where` reports "no source partition" for every query
  for (let i = 0; i < 12; i++) w(`src/misc/filler${i}.ts`, `export class Filler${i} {\n  doWork() {\n    return ${i};\n  }\n}\n`);
  git(d1, 'add', '-A'); git(d1, 'commit', '-qm', 'add services');
  const d2 = dateEnv('2026-03-01T12:00:00Z');
  w('NOTES.md', 'notes\n'); git(d2, 'add', 'NOTES.md'); git(d2, 'commit', '-qm', 'notes');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
  assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

function traceHit() {
  const { out, code, err } = grain(['where', '@Trace marker', '--top', '5', '--json']);
  assert.equal(code, 0, `expected exit 0: ${out}\n${err}`);
  const j = JSON.parse(out);
  const hit = j.hits.find(h => h.type === 'marker' && h.label === '@Trace');
  assert.ok(hit, `expected the @Trace marker card among hits: ${out}`);
  return hit;
}
test('where --json: a marker card\'s members report real source lines, not the internal dedup ordinal', () => {
  const hit = traceHit();
  assert.equal(hit.members.length, 3, `expected all 3 @Trace carriers: ${JSON.stringify(hit.members)}`);
  const handles = hit.members.filter(m => m.rel === 'src/svc/multi.ts' && m.kind === 'method' && m.name === 'handle');
  const run = hit.members.find(m => m.rel === 'src/svc/other.ts' && m.name === 'run');
  assert.equal(handles.length, 2, `expected both handle() overloads: ${JSON.stringify(hit.members)}`);
  assert.ok(run, `expected the unique run() carrier: ${JSON.stringify(hit.members)}`);
  const lines = handles.map(m => m.line).sort((a, b) => (a ?? -1) - (b ?? -1));
  // GREEN: real source lines (3 and 9), matching the direct extractScopes probe and the text-path output below
  assert.deepEqual(lines, [3, 9], `expected the two handle() overloads' real lines 3 and 9, got: ${JSON.stringify(handles)}`);
  assert.equal(run.line, 3, `expected run()'s real line 3 — a member with NO ordinal must ALSO resolve correctly (it was NOT already fine pre-fix: naive split makes a keyless 4th segment 'undefined', so it too printed null), got: ${JSON.stringify(run)}`);
});

test('where (text, non-JSON) already reports correct lines for every carrier — unaffected by the JSON fix', () => {
  const { out } = grain(['where', '@Trace marker', '--top', '5']);
  assert.match(out, /carriers to copy:.*src\/svc\/other\.ts:3 `run`/s, out);
  assert.match(out, /carriers to copy:.*src\/svc\/multi\.ts:3 `handle`/s, out);
  assert.match(out, /carriers to copy:.*src\/svc\/multi\.ts:9 `handle`/s, out);
});

test('where --json: a `file`-type card\'s members (a different key shape, real line already baked in) keep their correct lines, not scopeLine\'s skeyR-keyed null', () => {
  const { out, code, err } = grain(['where', 'handle', '--top', '5', '--json']);
  assert.equal(code, 0, `expected exit 0: ${out}\n${err}`);
  const j = JSON.parse(out);
  const hit = j.hits.find(h => h.type === 'file' && h.label === 'src/svc/multi.ts');
  assert.ok(hit, `expected the multi.ts file card among hits: ${out}`);
  const type = hit.members.find(m => m.kind === 'type' && m.name === 'MultiSvc');
  const handles = hit.members.filter(m => m.kind === 'method' && m.name === 'handle').map(m => m.line).sort((a, b) => a - b);
  assert.equal(type.line, 1, `expected MultiSvc's real line 1, got: ${JSON.stringify(hit.members)}`);
  assert.deepEqual(handles, [3, 9], `expected both handle() overloads' real lines 3 and 9 on the file card too, got: ${JSON.stringify(hit.members)}`);
});
