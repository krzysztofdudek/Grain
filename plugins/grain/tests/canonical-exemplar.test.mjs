// J5.3 — the canonical exemplar, with a reason to copy it; the per-fact share of code held by agents.
//
// `where`'s "pattern to copy" today shows whichever conforming scope it happens to encounter FIRST (ascending
// scope index) — no matter whether that scope is itself a deviant of some OTHER convention in the same
// partition, was rewritten right after it landed, or was last touched by an agent. A maintainer copying it gets
// no signal that a cleaner, human-authored original sits a few files over.
//
// The fix ranks each fact's conforming pool by a 5-key tuple BEFORE slicing to 3 (only when `H` is available):
//   (1) never a deviant on another fact of the same partition (ascending count — 0 first)
//   (2) `L.churn === false` first (never rewritten within 14 days of its own birth)
//   (3) `!L.agentLast` first (a human made the last touch)
//   (4) `L.first` ascending (firstborn)
//   (5) `L.last` descending (freshest touch, final tiebreak)
// A scope with no `H.lc` row of its own (never `mkWeightFn`'s file-level fallback — the same trap J5.1 avoided)
// sorts worst on every key. `exemplars[0].why` is set only when the winner clears keys (1)-(3) cleanly — never
// merely because it happened to sort first.
//
// Fixture (a)/(c)/(d): alpha/ holds 120 `@Service`-decorated `Tnnn` classes (T000..T119, zero-padded so lexical
// order == numeric order == extraction order), beta/ holds 20 unrelated files whose only job is the one
// `deviation-cost.test.mjs`'s fixture already established — forcing the MDL cut so alpha/ becomes its own
// directory+group card owning the partition-wide facts (`cid` `d[alpha]:type`/`r0:type`).
//   T000 (lowest gi — the scope every OLD version of this code would show first): decorated, but the ONLY class
//     that does not `extends Base` — a deviant on `auto.extends:Base`, the other accepted fact of this partition
//     (119/120 = 0.992 established share, comfortably above the 0.875 acceptance floor).
//   T050: born ALONE on 2026-01-05 (human), never touched again (`churn` stays false), decorated AND extends
//     Base — the clean firstborn. Every other class (T001..T119, except T000 and T050) is born together on
//     2026-01-10 (human, also never touched again again) — strictly LATER than T050, so T050 uniquely wins key
//     (4) among an otherwise-tied field.
// `auto.deco:@Service`: all 120 conform, 0 deviants (an all-true fact is a real convention, never vacuous per
// `mine()`'s own vacuity rule) — this is the fact under test.
//
// Fixture (b): a single `src/` directory of exactly 10 `@Service`-decorated `SvcN` classes — small ON PURPOSE.
// `f.agentShare`'s denominator is "`f.conform` scopes with ANY history row", unfiltered by age: padding the
// population with an unrelated 100+-scope crowd (the way (a)'s fixture does) would silently change what "10"
// means. `agentCount` of the ten are authored — created AND never touched again — by `Claude
// <claude@anthropic.com>` on 2026-01-05; the rest by a human the next day. A final commit on 2026-05-03 (118
// days later — inside `CFG.survDays` = 120, well outside `CFG.freshDays` = 14) makes all ten established,
// "fresh" conformers, clearing `CFG.minRaw` = 5 on the denominator with room to spare.
// 118 days of `stable` also matters for a second, unrelated reason: `mkWeightFn`'s agent discount
// (`agentBase` = 0.15 ramping to 1.0 over `promoteDays` = 180) would otherwise crush the WEIGHTED evidence of 8
// heavily-discounted scopes in a population this small below the `bits > 0` floor for every fact in the
// partition (verified empirically: at 40 days' `stable`, `auto.deco:@Service` at agentCount=8 never even
// clears acceptance). Landing the agent commit close to (but under) the 120-day boundary keeps the discount
// mild enough (`wp ≈ 0.71`) for the fact to still be accepted.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { factNotes } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repoA, repoAgent8, repoAgent2, repoNoGit;

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

  // (b): agent-share fixtures — 8 of 10, then 2 of 10
  const buildAgentShareRepo = (name, agentCount) => {
    const repo = join(tmp, name); mkdirSync(repo);
    gitIn(repo, '2026-01-01', 'Dev', 'dev@x', 'init', '-q', '-b', 'main');
    gitIn(repo, '2026-01-01', 'Dev', 'dev@x', 'config', 'commit.gpgsign', 'false');
    const svc = i => `@Service()\nexport class Svc${i} {\n  x(): number {\n    return ${i};\n  }\n}\n`;
    for (let i = 0; i < agentCount; i++) w(repo, `src/Svc${i}.ts`, svc(i));
    commit(repo, '2026-01-05', 'feat: agent-created services', 'Claude', 'claude@anthropic.com');
    for (let i = agentCount; i < 10; i++) w(repo, `src/Svc${i}.ts`, svc(i));
    commit(repo, '2026-01-06', 'feat: human-created services');
    w(repo, 'NOTES.md', 'notes\n');
    commit(repo, '2026-05-03', 'chore: notes'); // 118 days after 2026-01-05 — inside survDays(120), outside freshDays(14)
    return repo; };
  repoAgent8 = buildAgentShareRepo('agent8', 8);
  repoAgent2 = buildAgentShareRepo('agent2', 2);

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
  assert.match(f.exemplars[0].why, /^started this pattern \(2026-01\), was never rewritten right after it landed, human-authored$/,
    `expected a why clause on the winning exemplar, got ${JSON.stringify(f.exemplars[0])}`);
  assert.ok(f.exemplars.slice(1).every(e => e.why === undefined), '.why must be set on exs[0] only, never on the others');
});

test('(a) `where`\'s "pattern to copy" line renders the winning exemplar with its reason', () => {
  const out = grainOut(repoA, ['where', 'alpha']);
  assert.match(out, /pattern to copy:.*`T050`[^·\n]* — started this pattern \(2026-01\), was never rewritten right after it landed, human-authored/,
    `expected T050 with its reason on the pattern-to-copy line, got:\n${out}`);
});

test('(b) 8 of 10 fresh conformers last-touched by an agent author speaks the clause', () => {
  const model = modelIn(repoAgent8);
  const f = factsOf(model, 'auto.deco:@Service')[0];
  assert.ok(f, 'expected the @Service convention to be accepted');
  assert.equal(f.sraw, 10);
  assert.equal(f.agentShare, 0.8, `expected 8/10 = 0.8, got ${f.agentShare}`);
  assert.match(factNotes(f), /held mostly by agent-authored code \(80% of recent conformers\)/, `got: ${factNotes(f)}`);
});

test('(b) 2 of 10 fresh conformers last-touched by an agent author says nothing', () => {
  const model = modelIn(repoAgent2);
  const f = factsOf(model, 'auto.deco:@Service')[0];
  assert.ok(f, 'expected the @Service convention to be accepted');
  assert.equal(f.agentShare, undefined, `2/10 = 0.2 < 2/3 — no clause may be claimed, got ${f.agentShare}`);
  assert.doesNotMatch(factNotes(f), /agent-authored/, `got: ${factNotes(f)}`);
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

test('(d) incremental vs. full rebuild produce byte-identical exemplar ordering and agentShare', () => {
  const inc0 = dirFact(modelIn(repoA), 'auto.deco:@Service');
  const before1 = JSON.stringify({ exemplars: inc0.exemplars, agentShare: inc0.agentShare });

  w(repoA, 'NOTES2.md', 'more notes\n');
  commit(repoA, '2026-02-20', 'chore: more notes');
  const inc1 = dirFact(modelIn(repoA), 'auto.deco:@Service');
  const incremental = JSON.stringify({ exemplars: inc1.exemplars, agentShare: inc1.agentShare });
  assert.equal(incremental, before1, 'sanity: an unrelated commit must not disturb this fact\'s exemplars/agentShare');

  rmSync(join(repoA, '.grain', 'cache'), { recursive: true });
  const full = dirFact(modelIn(repoA), 'auto.deco:@Service');
  const fullStr = JSON.stringify({ exemplars: full.exemplars, agentShare: full.agentShare });
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
