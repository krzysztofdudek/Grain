// J5.3 — the canonical exemplar, with a reason to copy it. Issue 369: who wrote the code is never read.
//
// `where`'s "pattern to copy" used to show whichever conforming scope it happened to encounter FIRST (ascending
// scope index) — no matter whether that scope is itself a deviant of some OTHER convention in the same
// partition, or was rewritten right after it landed. A maintainer copying it got no signal that a cleaner
// original sits a few files over.
//
// The fix ranks each fact's conforming pool by a 4-key tuple BEFORE slicing to 3 (only when `H` is available):
//   (1) never a deviant on another fact of the same partition (ascending count — 0 first)
//   (2) `L.churn === false` first (never rewritten within 14 days of its own birth)
//   (3) `L.first` ascending (firstborn)
//   (4) `L.last` descending (freshest touch, final tiebreak)
// A scope with no `H.lc` row of its own (never `mkWeightFn`'s file-level fallback — the same trap J5.1 avoided)
// sorts worst on every key. `exemplars[0].why` is set only when the winner clears keys (1)-(2) cleanly — never
// merely because it happened to sort first.
//
// Fixture (a)/(c)/(d): alpha/ holds 120 `@Service`-decorated `Tnnn` classes (T000..T119, zero-padded so lexical
// order == numeric order == extraction order), beta/ holds 20 unrelated files whose only job is the one
// `deviation-cost.test.mjs`'s fixture already established — forcing the MDL cut so alpha/ becomes its own
// directory+group card owning the partition-wide facts (`cid` `d[alpha]:type`/`r0:type`).
//   T000 (lowest gi — the scope every OLD version of this code would show first): decorated, but the ONLY class
//     that does not `extends Base` — a deviant on `auto.extends:Base`, the other accepted fact of this partition
//     (119/120 = 0.992 established share, comfortably above the 0.875 acceptance floor).
//   T050: born ALONE on 2026-01-05, never touched again (`churn` stays false), decorated AND extends
//     Base — the clean firstborn. Every other class (T001..T119, except T000 and T050) is born together on
//     2026-01-10 (also never touched again) — strictly LATER than T050, so T050 uniquely wins key
//     (3) among an otherwise-tied field.
// `auto.deco:@Service`: all 120 conform, 0 deviants (an all-true fact is a real convention, never vacuous per
// `mine()`'s own vacuity rule) — this is the fact under test.
//
// Fixture (b): a single `src/` directory of exactly 10 `@Service`-decorated `SvcN` classes, built twice. In one
// copy eight of the ten are committed by `Claude <claude@anthropic.com>`, in the other by a person; the rest, and a
// later unrelated commit, are identical. Grain does not tell authors apart (issue 369): both copies must learn the
// same convention with the same numbers and the same exemplars, and neither may say anything about agents.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { factNotes } from '../engine/core.mjs';
import { LOG_FORMAT } from '../engine/history.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repoA, repoAgent8, repoHuman8, repoNoGit;

const dateEnv = (iso, name = 'Dev', email = 'dev@x') => ({ GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, TZ: 'UTC', GIT_AUTHOR_DATE: `${iso}T12:00:00Z`, GIT_COMMITTER_DATE: `${iso}T12:00:00Z` });
const gitIn = (repo, iso, name, email, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...dateEnv(iso, name, email) } });
const w = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const commit = (repo, iso, msg, name = 'Dev', email = 'dev@x') => { gitIn(repo, iso, name, email, 'add', '-A'); gitIn(repo, iso, name, email, 'commit', '-qm', msg); };
const grain = (repo, args) => spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' });
const grainOut = (repo, args) => { const r = grain(repo, args); assert.equal(r.status, 0, r.stdout + r.stderr); return (r.stdout || '').replace(/\n$/, ''); };
const modelIn = repo => { assert.equal(grain(repo, ['status']).status, 0); return JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8')); };
const factsOf = (model, pid) => model.partitions.flatMap(p => p.facts).filter(f => f.pid === pid);
const dirFact = (model, pid) => { const fs2 = factsOf(model, pid).filter(f => f.cid.startsWith('d[')); assert.equal(fs2.length, 1, `expected exactly one directory-level ${pid} fact, got ${fs2.length}`); return fs2[0]; };

const pad = i => String(i).padStart(3, '0');
const cls = (i, { ext = true } = {}) => `@Service()\nexport class T${pad(i)} ${ext ? 'extends Base ' : ''}{\n  x(): number {\n    return ${i};\n  }\n}\n`;
const N = 120;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-exemplar-'));

  // (a)/(c)/(d): the exemplar-ranking + export-schema + determinism fixture
  repoA = join(tmp, 'a'); mkdirSync(repoA);
  gitIn(repoA, '2026-01-01', 'Dev', 'dev@x', 'init', '-q', '-b', 'main');
  gitIn(repoA, '2026-01-01', 'Dev', 'dev@x', 'config', 'commit.gpgsign', 'false');
  for (let j = 0; j < 20; j++) w(repoA, `beta/B${j}.ts`, `export class B${j} {\n  emit(): number {\n    return ${j};\n  }\n}\n`);
  w(repoA, 'alpha/T050.ts', cls(50));
  commit(repoA, '2026-01-05', 'feat: the first thing');
  for (let i = 0; i < N; i++) { if (i === 50) continue; w(repoA, `alpha/T${pad(i)}.ts`, cls(i, { ext: i !== 0 })); }
  commit(repoA, '2026-01-10', 'feat: the rest of the things');
  w(repoA, 'NOTES.md', 'notes\n');
  commit(repoA, '2026-02-15', 'chore: notes');

  // (b): the same ten services, eight of them committed by an agent in one copy and by a person in the other
  const buildAuthorRepo = (name, author, email) => {
    const repo = join(tmp, name); mkdirSync(repo);
    gitIn(repo, '2026-01-01', 'Dev', 'dev@x', 'init', '-q', '-b', 'main');
    gitIn(repo, '2026-01-01', 'Dev', 'dev@x', 'config', 'commit.gpgsign', 'false');
    const svc = i => `@Service()\nexport class Svc${i} {\n  x(): number {\n    return ${i};\n  }\n}\n`;
    for (let i = 0; i < 8; i++) w(repo, `src/Svc${i}.ts`, svc(i));
    commit(repo, '2026-01-05', 'feat: services', author, email);
    for (let i = 8; i < 10; i++) w(repo, `src/Svc${i}.ts`, svc(i));
    commit(repo, '2026-01-06', 'feat: more services');
    w(repo, 'NOTES.md', 'notes\n');
    commit(repo, '2026-05-03', 'chore: notes'); // well outside freshDays(14), so all ten are established
    return repo; };
  repoAgent8 = buildAuthorRepo('agent8', 'Claude', 'claude@anthropic.com');
  repoHuman8 = buildAuthorRepo('human8', 'Alice', 'alice@example.com');

  // (e): no git at all — H is always null, fail-closed (pre-existing invariant: 0 facts without history)
  repoNoGit = join(tmp, 'nogit'); mkdirSync(repoNoGit);
  for (let i = 0; i < 10; i++) w(repoNoGit, `src/Svc${i}.ts`, `@Service()\nexport class Svc${i} {\n  x(): number {\n    return ${i};\n  }\n}\n`);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(a) the true firstborn, clean on every criterion, is ranked exs[0] — not the scope merely encountered first', () => {
  const model = modelIn(repoA);
  const f = dirFact(model, 'auto.deco:@Service');
  assert.equal(f.exp, 'true'); assert.equal(f.sraw, N, 'all 120 alpha classes are established conformers');
  assert.equal(f.exemplars[0].name, 'T050', `expected the clean firstborn first, got ${JSON.stringify(f.exemplars.map(e => e.name))}`);
  assert.ok(!f.exemplars.some(e => e.name === 'T000'), 'T000 is a deviant on auto.extends:Base in the same partition — it must never be offered as the pattern to copy');
  assert.match(f.exemplars[0].why, /^started this pattern \(2026-01\), was never rewritten right after it landed$/,
    `expected a why clause on the winning exemplar, got ${JSON.stringify(f.exemplars[0])}`);
  assert.ok(f.exemplars.slice(1).every(e => e.why === undefined), '.why must be set on exs[0] only, never on the others');
});

test('(a) `where`\'s "pattern to copy" line renders the winning exemplar with its reason', () => {
  const out = grainOut(repoA, ['where', 'alpha']);
  assert.match(out, /pattern to copy:.*`T050`[^·\n]* — started this pattern \(2026-01\), was never rewritten right after it landed/,
    `expected T050 with its reason on the pattern-to-copy line, got:\n${out}`);
});

test('(b) code committed by an agent is learned exactly like code committed by a person', () => {
  const fa = factsOf(modelIn(repoAgent8), 'auto.deco:@Service')[0];
  const fh = factsOf(modelIn(repoHuman8), 'auto.deco:@Service')[0];
  assert.ok(fa && fh, 'expected the @Service convention to be accepted in both copies');
  assert.equal(fa.sraw, 10);
  for (const k of ['cid', 'exp', 'sraw', 'raw', 'share', 'bpi', 'counts', 'srawCounts'])
    assert.deepEqual(fa[k], fh[k], `${k} must not depend on who committed the code`);
  assert.deepEqual(fa.exemplars, fh.exemplars, 'exemplars must not depend on who committed the code');
  for (const f of [fa, fh]) {
    assert.ok(!('agentShare' in f), 'no fact carries an agent share');
    assert.doesNotMatch(factNotes(f), /agent/, `got: ${factNotes(f)}`);
  }
});

test('(b) no output names an agent share, and the history keeps no agent flag', () => {
  assert.doesNotMatch(LOG_FORMAT, /trailers|Co-authored-by/i, 'the history walk reads no co-author trailer');
  for (const repo of [repoAgent8, repoHuman8]) {
    assert.doesNotMatch(grainOut(repo, ['status']), /agent-authored|agent share|ALARM/i);
    assert.doesNotMatch(grainOut(repo, ['report']), /agent-authored|agent share|ALARM/i);
    const dump = grainOut(repo, ['export', '--no-anchors']);
    assert.doesNotMatch(dump, /agentShare|lastByAgent|agentLast/);
    const hist = readFileSync(join(repo, '.grain', 'cache', 'history.json'), 'utf8');
    assert.doesNotMatch(hist, /"agent(Last)?":/);
  }
});

test('(c) `grain export`\'s published schema drops `.why`; the in-memory model keeps it', () => {
  const model = modelIn(repoA);
  const inMemory = dirFact(model, 'auto.deco:@Service');
  assert.ok(inMemory.exemplars[0].why, 'sanity: the in-memory model must carry .why');

  const dump = JSON.parse(grainOut(repoA, ['export', '--no-anchors']));
  const seen = [];
  (function walk(node) { if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) { if (k === 'why') seen.push(v); else walk(v); } })(dump);
  assert.deepEqual(seen, [], `grain export must never leak .why anywhere in the published schema, found: ${JSON.stringify(seen)}`);

  const conv = dump.conventions.find(c => c.feature.enumerator === 'deco' && c.feature.argument === '@Service' && c.context.type === 'directory');
  assert.ok(conv && conv.exemplars.length, 'exemplars must still be exported, just without .why');
  assert.ok(!('why' in conv.exemplars[0]), 'exported exemplar objects must never carry .why');
  assert.ok(dump.schemaNotes.exemplars, 'schemaNotes must document that .why is dropped deliberately');
});

test('(d) incremental vs. full rebuild produce byte-identical exemplar ordering', () => {
  const inc0 = dirFact(modelIn(repoA), 'auto.deco:@Service');
  const before1 = JSON.stringify({ exemplars: inc0.exemplars });

  w(repoA, 'NOTES2.md', 'more notes\n');
  commit(repoA, '2026-02-20', 'chore: more notes');
  const inc1 = dirFact(modelIn(repoA), 'auto.deco:@Service');
  const incremental = JSON.stringify({ exemplars: inc1.exemplars });
  assert.equal(incremental, before1, 'sanity: an unrelated commit must not disturb this fact\'s exemplars');

  rmSync(join(repoA, '.grain', 'cache'), { recursive: true });
  const full = dirFact(modelIn(repoA), 'auto.deco:@Service');
  const fullStr = JSON.stringify({ exemplars: full.exemplars });
  assert.equal(fullStr, incremental, 'a full rebuild must equal the incremental model byte for byte');
});

test('(e) without history (no git), exemplar selection is unchanged and no `.why` is fabricated', () => {
  const r = grain(repoNoGit, ['status']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const model = JSON.parse(readFileSync(join(repoNoGit, '.grain', 'cache', 'model.json'), 'utf8'));
  const allFacts = model.partitions.flatMap(p => p.facts);
  assert.equal(allFacts.length, 0, 'fail-closed: without history nothing is established, so nothing is spoken (pre-existing invariant — not a regression from this change)');
  assert.doesNotMatch(JSON.stringify(model), /"why"/, 'no `.why` field may ever be fabricated when there is no history to justify one');
});
