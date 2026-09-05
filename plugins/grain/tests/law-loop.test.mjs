// Guard for the law-loop instrument (ticket 097): tests/stress/law-loop.mjs.
//
// The instrument's headline claims rest on two pieces of arithmetic, and both are the kind that fails silently:
//
//   1. HOLD-OUT INTEGRITY (invariant I10). "Every drill case was born after the cut" is the ONLY thing standing
//      between this measurement and circular evidence — the rule and the drill being the same data twice. If
//      the birth test is wrong in the permissive direction the whole report is worthless and nothing else in it
//      would say so. So the test builds a REAL git repository with a real pre-cut commit and a real post-cut
//      commit, and asserts both directions: a pre-cut file is never admitted, a post-cut file always is, and
//      when a pre-cut case IS planted in a corpus the I10 verifier catches it, names it, and the ratio moves.
//      The birth test is by ANCESTRY, not by date, so the test also plants two commits on the same calendar day
//      on either side of the cut — the case a date comparison gets wrong.
//   2. VERDICT EQUALITY. "Reproduced in verdict" means the candidate refuses exactly the set the hand rule
//      refuses on the same units. That is derived from drill output, where a `violates-` case is refused when
//      it PASSES and a `satisfies-` case is refused when it FALSE-ALARMS — an inversion that reads wrong and
//      would quietly turn a rule that agrees on nothing into a rule that agrees on everything.
//
// Plus the two renderers whose output nobody reads before it runs: the provenance record every generated rule
// must carry (counsel-2 §2.3, and the meta-law that refuses a generated rule without one) and the superposition
// shape check the "template as shape check" bet is made of.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  chooseCut, firstAppearance, bornAfterCut, cutHoldoutCorpus, verifyI10, parseDrill, refusedSet,
  expectedRefusedSet, renderShapeCheck, provenanceFor, CASES_PER_SIDE,
} from './stress/law-loop.mjs';

let tmp, repo, env, cut, first;

// A repository with a planted rule ("a module under src/ imports node:path") and a real time boundary:
//   commit 1 (pre-cut)  — three conforming files
//   commit 2 (pre-cut)  — one more conforming file; THIS is the cut
//   commit 3 (post-cut) — two conforming files and one deviant, committed on the SAME CALENDAR DAY as the cut
//   commit 4 (post-cut) — one more deviant
// Commits 2 and 3 share a date, so anything that decides the hold-out by date rather than by ancestry admits a
// pre-cut file and the I10 assertions below fail.
function buildFixture(root) {
  mkdirSync(root, { recursive: true });
  const w = (rel, content) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
  const g = (...a) => execFileSync('git', ['-C', root, ...a], { env, encoding: 'utf8' });
  const conforming = n => `import { join } from 'node:path';\nexport function ${n}(v: string): string {\n  return join(v);\n}\n`;
  const deviant = n => `import { readFileSync } from 'node:fs';\nexport function ${n}(v: string): string {\n  return readFileSync(v, 'utf8');\n}\n`;

  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env });
  const commit = (msg, date) => {
    g('add', '-A');
    execFileSync('git', ['-C', root, 'commit', '-q', '-m', msg],
      { env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
    return g('rev-parse', 'HEAD').trim();
  };
  for (const n of ['alpha', 'beta', 'gamma']) w(`src/${n}.ts`, conforming(n));
  commit('one', '2026-01-10T09:00:00Z');
  w('src/delta.ts', conforming('delta'));
  const cutSha = commit('two — the cut', '2026-02-01T09:00:00Z');
  w('src/epsilon.ts', conforming('epsilon'));
  w('src/zeta.ts', conforming('zeta'));
  w('src/eta.ts', deviant('eta'));
  commit('three — same calendar day as the cut', '2026-02-01T21:00:00Z');
  w('src/theta.ts', deviant('theta'));
  commit('four', '2026-03-01T09:00:00Z');
  return cutSha;
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'law-loop-'));
  repo = join(tmp, 'repo');
  env = {
    ...process.env, HOME: tmp,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  };
  const cutSha = buildFixture(repo);
  cut = { sha: cutSha, date: '2026-02-01', index: 2, total: 4 };
  first = firstAppearance(repo);
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

// ---------- 1. the cut ----------
test('chooseCut names a commit at the requested fraction of history, with the count behind it', () => {
  const c = chooseCut(repo, 0.5);
  assert.equal(c.total, 4);
  assert.equal(c.index, 2);
  assert.equal(c.postCommits, 2);
  assert.equal(c.sha, cut.sha, 'the 50% cut of a four-commit history is the second commit');
});

// ---------- 2. first appearance, and the hold-out by ancestry ----------
test('first appearance is the commit that added the file, for every tracked file', () => {
  for (const f of ['src/alpha.ts', 'src/delta.ts', 'src/eta.ts', 'src/theta.ts']) {
    assert.ok(first.has(f), `no first appearance recorded for ${f}`);
  }
  assert.notEqual(first.get('src/alpha.ts').sha, first.get('src/delta.ts').sha);
});

test('a file born at or before the cut is never held out; one born after always is — by ANCESTRY, not date', () => {
  const cache = new Map();
  const born = f => bornAfterCut(repo, first.get(f).sha, cut.sha, cache);
  for (const f of ['src/alpha.ts', 'src/beta.ts', 'src/gamma.ts', 'src/delta.ts']) {
    assert.equal(born(f), false, `${f} predates the cut and must not enter a held-out corpus`);
  }
  // epsilon/zeta/eta land on the SAME CALENDAR DAY as the cut, one commit later: a date test admits none of
  // them (or admits delta too); ancestry gets all four right.
  for (const f of ['src/epsilon.ts', 'src/zeta.ts', 'src/eta.ts', 'src/theta.ts']) {
    assert.equal(born(f), true, `${f} was born after the cut and must be admissible`);
  }
  assert.equal(first.get('src/eta.ts').date, cut.date, 'the fixture must keep a post-cut file on the cut date');
});

// ---------- 3. corpus cutting, and the I10 arithmetic ----------
const CAND = {
  id: 'grain/src/candidate-auto-imp-node-path',
  dir: null,
  row: { origin: 'sub-gate-lattice', enumerator: 'imp', identifier: 'node:path', expected: 'true' },
  provenance: { partition: 'src' },
};

test('a held-out corpus contains only post-cut files, labelled by the LATER measurement', () => {
  const scopeFiles = ['src/alpha.ts', 'src/beta.ts', 'src/gamma.ts', 'src/delta.ts', 'src/epsilon.ts', 'src/zeta.ts', 'src/eta.ts', 'src/theta.ts'];
  const labels = { byKey: new Map(), byPid: new Map([['src|auto.imp:node:path|true|file', { deviating: new Set(['src/eta.ts', 'src/theta.ts']), source: 'head-lattice' }]]) };
  const c = cutHoldoutCorpus(CAND, { repo, files: scopeFiles, scopeFiles, labels, first, cutSha: cut.sha, ancCache: new Map() });
  assert.equal(c.labelled, true, 'the sub-gate candidate must find its later-measurement label');
  assert.equal(c.labelSource, 'head-lattice');
  assert.equal(c.scoped, 8);
  assert.equal(c.born, 4, 'four of the eight scoped files were born after the cut');
  assert.deepEqual(c.cases.violates.sort(), ['src/eta.ts', 'src/theta.ts']);
  assert.deepEqual(c.cases.satisfies.sort(), ['src/epsilon.ts', 'src/zeta.ts']);
  for (const f of [...c.cases.violates, ...c.cases.satisfies]) {
    assert.ok(!['src/alpha.ts', 'src/beta.ts', 'src/gamma.ts', 'src/delta.ts'].includes(f), `${f} predates the cut`);
  }
  assert.ok(c.cases.satisfies.length <= CASES_PER_SIDE && c.cases.violates.length <= CASES_PER_SIDE);
});

test('an unlabelled candidate yields no cases rather than a corpus labelled by its own check', () => {
  const c = cutHoldoutCorpus({ ...CAND, row: { ...CAND.row, identifier: 'node:nothing' } },
    { repo, files: [], scopeFiles: ['src/epsilon.ts'], labels: { byKey: new Map(), byPid: new Map() }, first, cutSha: cut.sha, ancCache: new Map() });
  assert.equal(c.labelled, false);
  assert.equal(c.cases.violates.length + c.cases.satisfies.length, 0,
    'without an independent label a corpus must be absent, not invented from the rule under test');
});

test('I10 counts corpora whose every case postdates the cut, and names a case that does not', () => {
  const clean = { id: 'a', written: [{ rel: 'src/epsilon.ts' }, { rel: 'src/eta.ts' }] };
  const leaky = { id: 'b', written: [{ rel: 'src/epsilon.ts' }, { rel: 'src/delta.ts' }] };
  const empty = { id: 'c', written: [] };
  const r = verifyI10([clean, leaky, empty], { repo, first, cutSha: cut.sha, ancCache: new Map() });
  assert.equal(r.corpora, 2, 'a corpus with no case is not counted in either direction');
  assert.equal(r.clean, 1);
  assert.equal(r.dirty, 1);
  assert.equal(r.cases, 4);
  assert.equal(r.ratio, 0.5);
  assert.deepEqual(r.leaked, [{ corpus: 'b', rel: 'src/delta.ts' }]);
});

test('I10 is 1.0 exactly when every corpus is clean, and never assumes it', () => {
  const r = verifyI10([{ id: 'a', written: [{ rel: 'src/eta.ts' }] }, { id: 'b', written: [{ rel: 'src/theta.ts' }] }],
    { repo, first, cutSha: cut.sha, ancCache: new Map() });
  assert.equal(r.ratio, 1);
  assert.equal(r.leaked.length, 0);
});

// ---------- 4. verdict equality ----------
const DRILL_OUT = [
  'pass         violates-a/case  [expected refused, got refused]  (case 1 · rule 2)',
  'MISS         violates-b/case  [expected refused, got satisfied]  (case 3 · rule 2)',
  'FALSE-ALARM  satisfies-c/case  [expected satisfied, got refused]  (case 4 · rule 2)',
  'pass         satisfies-d/case  [expected satisfied, got satisfied]  (case 5 · rule 2)',
  "yg drill 'x': 2 pass · 1 MISS · 1 FALSE-ALARM · 0 unrun · 0 unsupported (corpus 'h', holdout).",
].join('\n');

test('drill output parses into the five outcomes and the summary agrees with the lines', () => {
  const d = parseDrill(DRILL_OUT);
  assert.equal(d.ran, true);
  assert.deepEqual([d.pass, d.miss, d.fa, d.unrun, d.unsupported], [2, 1, 1, 0, 0]);
  assert.equal(d.cases.length, 4);
});

test('the refused set inverts correctly: a violates- case is refused when it PASSES, a satisfies- when it FALSE-ALARMS', () => {
  const d = parseDrill(DRILL_OUT);
  assert.deepEqual([...refusedSet(d)].sort(), ['satisfies-c/case', 'violates-a/case']);
  assert.deepEqual([...expectedRefusedSet(d)].sort(), ['violates-a/case', 'violates-b/case']);
});

test('verdict equality holds exactly when the drill is clean, and a clean drill is the only way to reach it', () => {
  const clean = parseDrill([
    'pass         violates-a/case  [expected refused, got refused]  (case 1 · rule 2)',
    'pass         satisfies-d/case  [expected satisfied, got satisfied]  (case 5 · rule 2)',
    "yg drill 'x': 2 pass · 0 MISS · 0 FALSE-ALARM · 0 unrun · 0 unsupported (corpus 'h', holdout).",
  ].join('\n'));
  assert.deepEqual([...refusedSet(clean)], [...expectedRefusedSet(clean)]);
  const dirty = parseDrill(DRILL_OUT);
  assert.notDeepEqual([...refusedSet(dirty)].sort(), [...expectedRefusedSet(dirty)].sort());
});

test('a corpus with no violates- case can never be "reproduced in verdict" — the empty agreement is refused', () => {
  const d = parseDrill([
    'pass         satisfies-d/case  [expected satisfied, got satisfied]  (case 5 · rule 2)',
    "yg drill 'x': 1 pass · 0 MISS · 0 FALSE-ALARM · 0 unrun · 0 unsupported (corpus 'h', holdout).",
  ].join('\n'));
  assert.equal(expectedRefusedSet(d).size, 0,
    'agreeing on an empty refused set is what a green repository gives for free; it must not count as reproduction');
});

// ---------- 5. provenance ----------
test('provenance carries the cut, the source rule and the class — every field the meta-law would look for', () => {
  const p = provenanceFor({
    id: 'grain/src/partition-imp-node-path', hasCheck: true, description: '',
    row: { id: 'src::partition::auto.imp:node:path', origin: 'certified-convention', enumerator: 'imp', identifier: 'node:path', expected: 'true', evidence: 'certified convention: share 0.940 · n 12 conforming, 2 deviating (adoption 86%) · partition `src`' },
  }, { cutSha: cut.sha, cutDate: cut.date, asOf: 'abc1234', repo: 'fixture' });
  assert.equal(p.cutSha, cut.sha);
  assert.equal(p.enumeratorClass, 'imp');
  assert.equal(p.identifier, 'node:path');
  assert.equal(p.share, 0.94);
  assert.equal(p.n, 12);
  assert.equal(p.deviating, 2);
  assert.equal(p.partition, 'src');
  assert.equal(p.reviewer, 'deterministic');
  assert.equal(p.asOf, 'abc1234');
});

// ---------- 6. the shape-check bet ----------
test('a superposition renders as a shape check that names node types and no identifier', () => {
  const src = renderShapeCheck({
    label: 'g', profile: { skel: 'function_declaration(⟨·⟩ statement_block(return_statement))', coverage: 0.4, req: { function_declaration: 1, statement_block: 1, return_statement: 1, 'id:Thing': 1 } },
  }, 'test');
  assert.ok(src.includes('const ROOT = "function_declaration"'));
  assert.ok(src.includes('"statement_block":1'));
  assert.ok(!src.includes('id:Thing'), 'an `id:` entry is a NAME; the shape bet is about shape and must drop it');
  assert.ok(!src.includes('"function_declaration":1'), 'the root type is the subject, not a requirement on itself');
  assert.ok(src.includes('export function check(ctx)') && !/\basync\b/.test(src));
});

test('a group with no superposition renders nothing rather than an empty rule', () => {
  assert.equal(renderShapeCheck({ label: 'g', profile: {} }, 'x'), null);
  assert.equal(renderShapeCheck({ label: 'g' }, 'x'), null);
  assert.equal(renderShapeCheck({ label: 'g', profile: { skel: 'function_declaration(x)', req: { function_declaration: 1 } } }, 'x'), null,
    'a skeleton whose only requirement is its own root asserts nothing');
});
