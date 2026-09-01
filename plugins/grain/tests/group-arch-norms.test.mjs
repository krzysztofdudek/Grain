// J5.7(a) — a second candidate population inside architectureNorms(): (role-group, target module) pairs, decided
// by the IDENTICAL KT/BIC/idxCost test as the existing (source module, target module) population — see the doc
// comment on architectureNorms() itself (core.mjs) for the full cell shape. Three things this ticket's own review
// corrections called out as easy to get wrong, each with its own test below:
//
//   (a1) a role group's `neff` MUST be distinct FILES carrying a member of the group, never raw scope occurrences
//        — a file with several members of one role must not out-vote a file with one.
//   (a2) idxCost MUST be ONE value shared over BOTH populations (module-module and group-module together), counted
//        once before either's per-pair minRaw/minEff/bits filtering — never a separate, locally-taxed idxCost for
//        group candidates. Real consequence: archNorms is no longer byte-identical to a module-only computation on
//        the same input — adding the group population can correctly regress a previously-certifying module pair.
//   (a3) a group below CFG.minRaw/minEff DISTINCT FILES must stay silent even when its raw scope count alone would
//        have cleared the floor (the gate that (a1) exists to make honest).
//
// Part 2 exercises the real `grain check` wiring end to end: computeArchHits's new group-kind rendering, and the
// export.mjs schema-leak fix that keeps `fromKind: 'group'` rows out of the published `archNorms` array.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { architectureNorms } from '../engine/core.mjs';

// ===== Part 1: the acceptance math, on hand-built models =====

test('(a1) a group→module norm counts DISTINCT FILES, not raw scope occurrences, for neff/ne', () => {
  const files = [];
  for (let i = 1; i <= 14; i++) files.push(`A/${i}.ts`);
  files.push('A/0.ts'); // the one file that reaches B — and the one carrying MULTIPLE members of the group
  for (let i = 0; i < 15; i++) files.push(`C/${i}.ts`); // sibling reaching B fully — absence-boundary evidence
  files.push('B/idx.ts');
  const edges = [{ from: 'A/0.ts', to: 'B/idx.ts' }];
  for (let i = 0; i < 15; i++) edges.push({ from: `C/${i}.ts`, to: 'B/idx.ts' });
  const assignments = {};
  for (let i = 1; i <= 14; i++) assignments[`A/${i}.ts#type#Widget${i}`] = 0;
  // A/0.ts alone carries FIVE role-0 members — a naive scope-count population would inflate neff to 19 (14 + 5)
  // and, worse, count the one reaching file five times over against fourteen non-reaching files counted once each.
  for (let i = 0; i < 5; i++) assignments[`A/0.ts#method#m${i}`] = 0;
  const partitions = [{ name: 'grp', assignments, medoids: [{ label: 'Widget' }] }];
  const norms = architectureNorms({ filesAll: files, edges, pkgs: [], partitions });

  const g = norms.find(n => n.fromKind === 'group' && n.to === 'B');
  assert.ok(g, `expected an accepted group norm for grp#0 → B: ${JSON.stringify(norms)}`);
  assert.equal(g.from, 'grp#0');
  assert.equal(g.exp, 'false');
  assert.equal(g.neff, 15, `neff must count 15 DISTINCT FILES, not 19 raw scope occurrences: ${JSON.stringify(g)}`);
  assert.equal(g.ne, 14, `ne (the "does not reach" majority) must be 14 of 15 files, not deflated/inflated by A/0.ts's extra scope-keys: ${JSON.stringify(g)}`);

  // sanity: the module-level norm over the SAME file set is unaffected by the group's scope-key multiplicity either
  const m = norms.find(n => n.fromKind === 'module' && n.from === 'A' && n.to === 'B');
  assert.ok(m, `expected the module-level A→B norm to also certify: ${JSON.stringify(norms)}`);
  assert.equal(m.neff, 15); assert.equal(m.ne, 14);
});

test('(a2) idxCost is ONE shared value over both populations — archNorms is no longer byte-identical to a module-only computation', () => {
  const files = [];
  for (let i = 0; i < 15; i++) files.push(`C/${i}.ts`); // survivor: large margin, must still certify under the widened idxCost
  for (let i = 0; i < 5; i++) files.push(`X/${i}.ts`);  // flipper: small margin, must stop certifying
  files.push('B/idx.ts');
  const edges = [];
  for (let i = 0; i < 15; i++) edges.push({ from: `C/${i}.ts`, to: 'B/idx.ts' });
  for (let i = 0; i < 5; i++) edges.push({ from: `X/${i}.ts`, to: 'B/idx.ts' });

  const withoutGroups = architectureNorms({ filesAll: files, edges, pkgs: [], partitions: [] });
  const cWithout = withoutGroups.find(n => n.from === 'C' && n.to === 'B');
  const xWithout = withoutGroups.find(n => n.from === 'X' && n.to === 'B');
  assert.ok(cWithout && xWithout, `sanity: both module pairs certify against the module-only idxCost: ${JSON.stringify(withoutGroups)}`);

  // 10 decoy single-file role-groups, each its OWN partition, all reaching B — enough extra candidates to push the
  // shared idxCost from ceil(log2(2))=1 to ceil(log2(12))=4, a 3-bit rise applied to EVERY candidate, module-module
  // included. None of these decoys itself clears CFG.minRaw (neff=1 each): they exist purely to widen the ONE
  // shared candidate universe idxCost is counted over, never to certify on their own.
  const partitions = [];
  for (let i = 0; i < 10; i++) partitions.push({ name: `decoy${i}`, assignments: { 'X/0.ts#type#Decoy': 0 }, medoids: [{ label: 'Decoy' }] });
  const withGroups = architectureNorms({ filesAll: files, edges, pkgs: [], partitions });
  assert.ok(!withGroups.some(n => n.fromKind === 'group'), `sanity: none of the 10 decoys individually certifies (neff=1 < CFG.minRaw): ${JSON.stringify(withGroups)}`);

  const xWith = withGroups.find(n => n.fromKind === 'module' && n.from === 'X' && n.to === 'B');
  assert.ok(!xWith, `X→B (bits=${xWithout.bits} at the old idxCost) must correctly FAIL once the shared idxCost widens by 3 bits: ${JSON.stringify(withGroups)}`);

  const cWith = withGroups.find(n => n.fromKind === 'module' && n.from === 'C' && n.to === 'B');
  assert.ok(cWith, `C→B has enough margin to survive the widened idxCost (sanity that widening does not simply blank the function): ${JSON.stringify(withGroups)}`);
  // The ONLY term that differs between these two calls for the SAME (C,B) pair is idxCost — `data`/the BIC penalty
  // are pure functions of (ne, neff), unaffected by model.partitions. So this bits delta IS the idxCost delta,
  // directly proving a SINGLE idxCost shared over both populations: a wrongly-separate, locally-taxed idxCost for
  // group candidates would leave module-module bits (and this delta) at exactly 0.
  assert.equal(cWithout.bits - cWith.bits, 3, 'archNorms must not be byte-identical to a module-only computation: bits must drop by exactly the idxCost delta (ceil(log2(12)) - ceil(log2(2)) = 3)');
});

test('(a3) a group with fewer than CFG.minRaw DISTINCT FILES stays silent, even when its raw scope count alone would clear the floor', () => {
  const files = ['A/0.ts', 'A/1.ts', 'A/2.ts', 'B/idx.ts'];
  const edges = [{ from: 'A/0.ts', to: 'B/idx.ts' }];
  const assignments = {
    'A/0.ts#method#m0': 0, 'A/0.ts#method#m1': 0, 'A/0.ts#method#m2': 0, // 3 scope-keys, but ONE file
    'A/1.ts#type#T1': 0,
    'A/2.ts#type#T2': 0,
  }; // raw scope count = 5 (would clear CFG.minRaw=5 if counted per-scope) — but only 3 DISTINCT FILES
  const partitions = [{ name: 'grp', assignments, medoids: [{ label: 'Widget' }] }];
  const norms = architectureNorms({ filesAll: files, edges, pkgs: [], partitions });
  assert.ok(!norms.some(n => n.fromKind === 'group'), `a 3-distinct-file group must stay silent regardless of its raw (5) scope count: ${JSON.stringify(norms)}`);
});

// ===== Part 2: wiring into `check`/`export`, on a real git-backed fixture =====

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const model = () => JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-grouparchnorms-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  w('packages/target/util.ts', 'export const util = () => 1;\n');
  // consumer: 15 files, ALL reach target — the established, majority practice, needed as absence-boundary evidence
  for (let i = 0; i < 15; i++) w(`packages/consumer/C${i}.ts`, `import { util } from '../target/util';\nexport const c${i} = () => util();\n`);
  // handlers: 15 near-identical @Handler() classes — a real role group, not just a module — h0 is the ONE exception
  // that reaches target; h1..h14 do not (mirrors architecture-norms.test.mjs's own proven outlier/majority split)
  // the method's own signature (`run`/`Promise<void>`), not the class's decorator, is what clusters here: a unique
  // per-file name token (`H0Handler`, `H1Handler`, …) actively resists merging under the same MDL clustering
  // induceRoles/induceClusters uses (each unique token costs more to code once shared than to leave as noise on a
  // singleton) — the identical, repeated `run`/`Promise<void>` signature is the real, uniform group signal.
  w('packages/handlers/h0.ts', "import { util } from '../target/util';\n@Handler()\nexport class H0Handler {\n  constructor(private readonly repo: Repo) {}\n  async run(cmd: Cmd): Promise<void> {\n    util();\n  }\n}\n");
  for (let i = 1; i <= 14; i++) w(`packages/handlers/h${i}.ts`, `@Handler()\nexport class H${i}Handler {\n  constructor(private readonly repo: Repo) {}\n  async run(cmd: Cmd): Promise<void> {\n    await this.repo.save(cmd);\n    await this.repo.flush();\n  }\n}\n`);
  git('add', '-A'); git('commit', '-qm', 'base');
  const r = grain(['status']); assert.equal(r.code, 0, r.err);
  const m = model();
  assert.ok((m.archNorms || []).some(n => n.fromKind === 'group' && n.exp === 'false'), `fixture sanity: expected at least one accepted group→module norm: ${JSON.stringify(m.archNorms)}`);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('(a4) computeArchHits renders a group-kind note for a file violating an established group→module norm', () => {
  const m = model();
  const gnorm = m.archNorms.find(n => n.fromKind === 'group' && n.exp === 'false' && n.to === 'packages/target');
  assert.ok(gnorm, `expected an accepted group norm targeting packages/target: ${JSON.stringify(m.archNorms)}`);
  const gi = gnorm.from.lastIndexOf('#'); const part = m.partitions.find(p => p.name === gnorm.from.slice(0, gi));
  const role = +gnorm.from.slice(gi + 1);
  assert.ok(part, `expected to find the partition named ${gnorm.from.slice(0, gi)}: ${JSON.stringify(m.partitions.map(p => p.name))}`);
  const label = part.medoids[role].label;

  const c = grain(['check', 'packages/handlers/h0.ts', '--all']);
  const expected = `architecture: your import of \`packages/target/util.ts\` (line 1) reaches packages/target — «${label}» established practice is not to (${gnorm.neff - gnorm.ne} of ${gnorm.neff} files do, yours now included). Not forbidden, but it departs from what the rest of «${label}» does.`;
  assert.ok(c.out.includes(expected), `expected the group-kind architecture note in check output:\n${expected}\n\ngot:\n${c.out}`);
});

test('(a5) `grain export`\'s published archNorms never carries a fromKind:"group" entry', () => {
  const r = grain(['export', '--compact', '--no-anchors']);
  const dump = JSON.parse(r.out.split('\n').find(l => l.startsWith('{')));
  assert.ok(Array.isArray(dump.archNorms) && dump.archNorms.length > 0, `sanity: export still carries module-level archNorms: ${JSON.stringify(dump.archNorms)}`);
  assert.ok(!dump.archNorms.some(n => n.fromKind === 'group'), `export must never leak a fromKind:"group" archNorms row: ${JSON.stringify(dump.archNorms)}`);
  assert.match(dump.schemaNotes.archNorms, /group/i, 'schemaNotes.archNorms must document the group-row exclusion');
});
