// Issue 002 — `grain what <term>` was reporting an UNRELATED declaration or value as if it were a real hit, with
// the same confidence/formatting as a correct one. Root cause (ONE mechanism, two field-test shapes): `whatCmd`'s
// `nameHits`/valueHits predicates (core.mjs) matched on "the query's tokenized words and the candidate's tokenized
// words share AT LEAST ONE token" (`.some(t => qt.has(t))`), never requiring the query's OWN tokens to be fully
// covered. A single-word query (`status`, tested in what-command.test.mjs) degrades this to an exact single-token
// check, which is fine — but a multi-word query (a camelCase compound identifier, or a dotted config key) only
// needs ONE coincidentally-shared word with an utterly unrelated symbol to be reported as a confident hit:
//   - C#/CleanArchitecture: `what PriorityLevel` (tokens {priority, level}) matched `LogLevel` (tokens {log,
//     level}) on the shared word "level" alone — both as a declaration (a) and as an indexed value (b).
//   - Java/spring-petclinic: `what "management.endpoints.web.exposure.include"` (5 tokens) matched
//     `WebConfiguration.java`'s own class name on the shared word "web" alone — a `defined:` claim for a string
//     that appears nowhere in that file.
// Fixed by requiring every one of the query's own (non-stopword) tokens to be present in the candidate's tokens —
// a no-op for a single-token query (identical to the old `.some`), a real tightening for a multi-token one. This
// is the "tighten the match" strategy (not "label it as approximate"): grain's own constitution says silence is
// an acceptable answer, an unrelated file is not — and there is no genuine value in surfacing a match that shares
// one incidental word with an otherwise-unrelated symbol, so there is nothing here worth labelling as approximate.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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

// ===========================================================================================================
// repoA — the C# shape: `PriorityLevel` (real enum) and `LogLevel` (real, but entirely unrelated, declaration
// AND indexed value) share only the suffix word "level". A real `key:PriorityLevel` value (df=2, two JSON files)
// is ALSO present, so this fixture doubles as the true-positive guard: the fix must not silence a genuine hit
// while suppressing the coincidental one. 15 filler files keep valueDfMaxShare's dfMax (ceil(0.2*n)) comfortably
// above both real dfs (2 and 3) without discarding either as "too common".
// ===========================================================================================================
let tmpA, repoA;
before(() => {
  ({ tmp: tmpA, repo: repoA } = initRepo('grain-what-exact-a-'));
  w(repoA, 'src/domain/priorityLevel.ts', 'export enum PriorityLevel { None, Low, Medium, High }\n');
  w(repoA, 'src/domain/priorityConfig1.json', JSON.stringify({ PriorityLevel: 'High' }));
  w(repoA, 'src/domain/priorityConfig2.json', JSON.stringify({ PriorityLevel: 'Low' }));
  w(repoA, 'src/logging/logLevel.ts', 'export enum LogLevel { Debug, Info, Warn }\n');
  w(repoA, 'src/logging/settings1.json', JSON.stringify({ LogLevel: 'Info' }));
  w(repoA, 'src/logging/settings2.json', JSON.stringify({ LogLevel: 'Info' }));
  w(repoA, 'src/logging/settings3.json', JSON.stringify({ LogLevel: 'Info' }));
  fillers(repoA, 15);
  gitIn(repoA, 'add', '-A'); gitIn(repoA, 'commit', '-qm', 'the priority/log level fixture');
  const st = grainIn(repoA, ['status']); assert.equal(st.code, 0, st.err);
});
after(() => { if (tmpA) rmSync(tmpA, { recursive: true, force: true }); });

test('(1) `what PriorityLevel` never reports the unrelated `LogLevel` declaration', () => {
  const j = JSON.parse(grainIn(repoA, ['what', 'PriorityLevel', '--json']).out);
  assert.ok(!j.defined.some(d => d.rel === 'src/logging/logLevel.ts'),
    `LogLevel's declaration must not be attributed to a PriorityLevel query: ${JSON.stringify(j.defined)}`);
  assert.ok(!j.defined.some(d => d.name === 'LogLevel'), JSON.stringify(j.defined));
});

test('(2) `what PriorityLevel` never reports the unrelated `LogLevel` indexed value', () => {
  const j = JSON.parse(grainIn(repoA, ['what', 'PriorityLevel', '--json']).out);
  assert.ok(!j.values.some(v => v.value === 'LogLevel'),
    `LogLevel's value places must not be attributed to a PriorityLevel query: ${JSON.stringify(j.values)}`);
});

test('(3) true positive: `what PriorityLevel` still reports its OWN real declaration and real value', () => {
  const j = JSON.parse(grainIn(repoA, ['what', 'PriorityLevel', '--json']).out);
  const decl = j.defined.find(d => d.rel === 'src/domain/priorityLevel.ts');
  assert.ok(decl, `the real PriorityLevel declaration must still be reported: ${JSON.stringify(j.defined)}`);
  assert.equal(decl.name, 'PriorityLevel'); assert.equal(decl.kind, 'type'); assert.equal(decl.line, 1);

  const val = j.values.find(v => v.value === 'PriorityLevel');
  assert.ok(val, `the real PriorityLevel value entries must still be reported: ${JSON.stringify(j.values)}`);
  assert.equal(val.kind, 'key');
  assert.equal(val.places.length, 2, JSON.stringify(val));
});

test('(4) the text rendering never mentions LogLevel when asked about PriorityLevel', () => {
  const r = grainIn(repoA, ['what', 'PriorityLevel']);
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.out.includes('LogLevel'), `output must not mention the unrelated symbol at all:\n${r.out}`);
  assert.match(r.out, /defined:.*priorityLevel\.ts.*`PriorityLevel`/);
  assert.match(r.out, /values:.*`PriorityLevel`/);
});

// ===========================================================================================================
// repoB — the Java shape: a dotted config-key-shaped query with NO real declaration or value anywhere in the
// repo, but ONE declared symbol (`WebController`) shares exactly one of its five words ("web") with the query.
// Expected: the honest "no declarations or values" map answer — never an unqualified `defined:` naming that file.
// ===========================================================================================================
let tmpB, repoB;
before(() => {
  ({ tmp: tmpB, repo: repoB } = initRepo('grain-what-exact-b-'));
  w(repoB, 'src/config/webController.ts', 'export class WebController { handle(): number { return 1; } }\n');
  fillers(repoB, 15);
  gitIn(repoB, 'add', '-A'); gitIn(repoB, 'commit', '-qm', 'the dotted-config-key fixture');
  const st = grainIn(repoB, ['status']); assert.equal(st.code, 0, st.err);
});
after(() => { if (tmpB) rmSync(tmpB, { recursive: true, force: true }); });

test('(5) a config-key query with no real match anywhere returns the honest "nothing found" answer, not an unrelated file', () => {
  const j = JSON.parse(grainIn(repoB, ['what', 'management.endpoints.web.exposure.include', '--json']).out);
  assert.deepEqual(j.defined, [], `must not attribute WebController to an unrelated dotted key: ${JSON.stringify(j.defined)}`);
  assert.deepEqual(j.values, []);
});

test('(6) the text rendering speaks the honest absence, never an unqualified `defined:` naming WebController', () => {
  const r = grainIn(repoB, ['what', 'management.endpoints.web.exposure.include']);
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.out.split('\n').some(l => l.startsWith('defined:')), `no defined: line is honest here, got:\n${r.out}`);
  assert.ok(!r.out.includes('WebController') && !r.out.includes('webController.ts'), `must not mention the unrelated file at all:\n${r.out}`);
  assert.match(r.out, /has no declarations or values anywhere in this repository's code/, r.out);
});
