// J3.2 — kin completeness: two kinds of "your change left a relative behind", both rendered as `kin:` lines inside
// `missingLines`' existing `missing from your change:` block, and both accepted on evidence the engine already
// certifies elsewhere.
//
//   (A) VALUES. `learn()` certifies, per value container (one `model.valueSiblings` entry), the repo fact "the
//       members of this container travel together" — the same KT/BIC/idxCost cell shape as `architectureNorms`,
//       against a fixed 50/50 null, plus the one posterior-predictive λ bound. Files that qualify for the
//       population (they carry ≥ ⌈m·2/3⌉ of the container's members) but are NOT complete carriers are the
//       residual the norm reports against. A change that adds a NEW member to such a container is asked about
//       every complete carrier that did not get it.
//   (B) NAME STEMS. Within one partition, if ≥ 60% of role group A's ≥ 4 members have a `stem0`-matching partner
//       in role group B, a genuinely NEW file assigned to A whose change touches nothing in B is missing its
//       counterpart. Raw share, no MDL — deliberately the SAME evidence category as `impliedOf.companion`, which
//       already feeds `recipe:` lines from the same block.
//
// The `value-index.test.mjs` fixture from J3.1 is the regression control for the additive `vals` shape change
// (`addVal`'s new container-name field): it is run unmodified by the suite and must keep every assertion.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG } from '../engine/config.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const modelIn = repo => { grainIn(repo, ['status']); return JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8')); }; // `git clean -fd` in the per-test reset takes `.grain/` with it
const resetIn = repo => { gitIn(repo, {}, 'checkout', '-q', 'HEAD', '--', '.'); gitIn(repo, {}, 'clean', '-qfd'); };
const initRepo = name => { const tmp = mkdtempSync(join(tmpdir(), name)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };

// ===== fixture A ("values"): 21 code files, exactly ONE candidate container =====
// One enum `UserStatus { ACTIVE, SUSPENDED, PENDING }` declared identically in 5 files. Each member therefore has
// df 5, and ceil(CFG.valueDfMaxShare × 21) = 5, so all three clear J3.1's density gate — the cell needs the whole
// set indexed. Nothing else in the tree names a value twice, so there is exactly ONE container: `idxCost` scales
// with the number of CONTAINERS in the data, not the file count, and keeping it at ⌈log2 2⌉ = 1 bit is what lets
// the cell fire at neff = 5 = CFG.minRaw on a fixture this small.
// Every file carries a real class ON PURPOSE. `cmdReview` sources the changed file's current values from
// `checkFile`, and `checkFile` returns NO scopes at all — not even the file scope — for a file no partition
// covers, so a tree too thin to form a partition makes this half structurally mute.
const enumSrc = members => `export enum UserStatus { ${members.join(', ')} }\n`;
const readerSrc = i => `export class Status${i}Reader {\n  readStatus(id: number): UserStatus {\n    return this.store.lookup(id);\n  }\n}\n`;
const MEMBERS3 = ['ACTIVE', 'SUSPENDED', 'PENDING'];
const statusFile = (i, members) => enumSrc(members) + readerSrc(i);
const STATUS_FILES = [1, 2, 3, 4, 5].map(i => `src/status/s${i}.ts`);
let tmpA, repoA;
before(() => {
  ({ tmp: tmpA, repo: repoA } = initRepo('grain-kin-values-'));
  STATUS_FILES.forEach((rel, i) => wIn(repoA, rel, statusFile(i + 1, MEMBERS3)));
  for (let i = 1; i <= 16; i++) wIn(repoA, `src/fillers/filler${i}.ts`, `export class Filler${i}Service {\n  loadRecord(id: number): Record {\n    return this.store.fetch(id);\n  }\n}\n`);
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repoA, d1, 'add', '-A'); gitIn(repoA, d1, 'commit', '-qm', 'the value fixture');
  const st = grainIn(repoA, ['status']);
  assert.equal(st.code, 0, st.out + st.err);
  const m = modelIn(repoA);
  assert.equal(m.files, 21, 'the density bounds above depend on exactly 21 code files');
  assert.equal(m.partitions.length, 1, 'checkFile hands back no scopes at all for a file no partition covers');
  assert.equal(Object.keys(m.valueSiblings).length, 1, `exactly one candidate container keeps idxCost at 1 bit: ${JSON.stringify(m.valueSiblings)}`);
  assert.deepEqual(Object.values(m.valueSiblings)[0], ['enum:ACTIVE', 'enum:PENDING', 'enum:SUSPENDED']);
});
after(() => { if (tmpA) rmSync(tmpA, { recursive: true, force: true }); });

// ===== fixture B ("name stems"): two role groups in one partition, paired by stem =====
// 12 handlers form role A, 11 specs form role B, and 11 of the 12 handlers have a same-`stem0` spec — 0.92 share
// over n = 12, clearing `impliedOf.companion`'s own ≥ 0.6 / n ≥ 4 floor. `lima` is the deliberate unpaired member
// that keeps the share below 1 and proves the rule is a share, not a universal.
const NAMES = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima'];
const cap = s => s[0].toUpperCase() + s.slice(1);
const handlerSrc = n => `@Handler()\nexport class ${cap(n)}Handler {\n  constructor(private readonly repo: Repo) {}\n  async run(cmd: ${cap(n)}Command): Promise<void> {\n    await this.repo.save(cmd);\n    await this.repo.flush();\n  }\n}\n`;
const specSrc = n => `export class ${cap(n)}Spec {\n  describeBehaviour(subject: Subject): Report {\n    expect(subject).toBeDefined();\n    expect(subject).toMatch('${cap(n)}');\n    return report(subject);\n  }\n}\n`;
let tmpB, repoB;
before(() => {
  ({ tmp: tmpB, repo: repoB } = initRepo('grain-kin-stems-'));
  NAMES.forEach((n, i) => { wIn(repoB, `src/handlers/${n}.handler.ts`, handlerSrc(n)); if (i < 11) wIn(repoB, `src/specs/${n}.spec.ts`, specSrc(n)); });
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repoB, d1, 'add', '-A'); gitIn(repoB, d1, 'commit', '-qm', 'the stem fixture');
  wIn(repoB, 'NOTES.md', 'notes\n'); // pushes HEAD past freshDays so the fixture's conventions are "established"
  const d2 = dateEnv('2026-03-01T12:00:00Z');
  gitIn(repoB, d2, 'add', '-A'); gitIn(repoB, d2, 'commit', '-qm', 'notes');
  const st = grainIn(repoB, ['status']);
  assert.equal(st.code, 0, st.out + st.err);
  const m = modelIn(repoB);
  assert.equal(m.partitions.length, 1, 'both groups must live in ONE partition — groupKin only pairs within a partition');
  const p = m.partitions[0];
  const byRole = new Map();
  for (const [k, r] of Object.entries(p.assignments)) { if (r === -1) continue; (byRole.get(r) || byRole.set(r, new Set()).get(r)).add(k.split('#')[0]); }
  const sizes = [...byRole.values()].map(s => s.size).sort((a, b) => b - a);
  assert.deepEqual(sizes, [12, 11], `sanity: the fixture must induce a 12-file group and an 11-file group, got ${JSON.stringify([...byRole].map(([r, s]) => [p.medoids[r]?.label, s.size]))}`);
});
beforeEach(() => { resetIn(repoA); resetIn(repoB); });
after(() => { if (tmpB) rmSync(tmpB, { recursive: true, force: true }); });

// ===== (a) the "values" half, red → green =====
test('(a) a new enum member added in one carrier names the complete carriers that did not get it', () => {
  wIn(repoA, STATUS_FILES[0], statusFile(1, [...MEMBERS3, 'ARCHIVED'])); // uncommitted: ARCHIVED joins the set in exactly one of the five declarations
  const { out, code } = grainIn(repoA, ['review']);
  assert.equal(code, 0, out);
  assert.match(out, /^missing from your change:$/m, out);
  assert.match(out, /^kin: `ARCHIVED` \(added to `UserStatus`\) — its siblings also appear in: src\/status\/s2\.ts, src\/status\/s3\.ts, src\/status\/s4\.ts, src\/status\/s5\.ts — not in your change$/m, out);
});

test('(a) the certified co-travel norm is a model fact with the shape J3.2 specifies', () => {
  const m = modelIn(repoA);
  const [c, sibs] = Object.entries(m.valueSiblings)[0];
  assert.ok(m.valueNorms, 'model must carry valueNorms');
  const N = m.valueNorms[c];
  assert.ok(N, `the one container must certify: ${JSON.stringify(m.valueNorms)}`);
  assert.equal(N.m, sibs.length);
  assert.equal(N.neff, 5, 'population = files carrying >= ceil(3*2/3) = 2 members');
  assert.equal(N.ne, 5, 'all five are complete carriers');
  assert.ok(N.bits > 0, `bits must be a positive codelength gain: ${N.bits}`);
  assert.deepEqual(N.full, STATUS_FILES);
  assert.deepEqual(N.near, []);
  assert.ok(N.neff >= CFG.minRaw && N.neff >= CFG.minEff);
  assert.equal(m.valueContainer[c], 'UserStatus', 'the container display name, so the line can say "(added to `UserStatus`)"');
});

test('(a) a member added everywhere the norm expects it is silent', () => {
  STATUS_FILES.forEach((rel, i) => wIn(repoA, rel, statusFile(i + 1, [...MEMBERS3, 'ARCHIVED']))); // every complete carrier is inside the change
  const { out } = grainIn(repoA, ['review']);
  assert.doesNotMatch(out, /^kin:/m, out);
});

test('(a) an edit that adds no member at all is silent', () => {
  wIn(repoA, STATUS_FILES[0], statusFile(1, MEMBERS3) + 'export class Status1Extra {\n  spare(): void {}\n}\n');
  const { out } = grainIn(repoA, ['review']);
  assert.doesNotMatch(out, /^kin:/m, out);
});

// ===== (b) the "name stem" half, red → green =====
test('(b) a new member of a stem-paired role group with no counterpart in the change is named', () => {
  wIn(repoB, 'src/handlers/mike.handler.ts', handlerSrc('mike')); // untracked new member of group A, no spec anywhere
  const { out, code } = grainIn(repoB, ['review']);
  assert.equal(code, 0, out);
  assert.match(out, /^missing from your change:$/m, out);
  assert.match(out, /^kin: src\/handlers\/mike\.handler\.ts has no «[^»]+» counterpart \(11 of 12 members of «[^»]+» do\)$/m, out);
});

test('(b) the same new member WITH its counterpart in the change is silent', () => {
  wIn(repoB, 'src/handlers/mike.handler.ts', handlerSrc('mike'));
  wIn(repoB, 'src/specs/mike.spec.ts', specSrc('mike'));
  const { out } = grainIn(repoB, ['review']);
  assert.doesNotMatch(out, /^kin:/m, out);
});

test('(b) the group pairing is a certified partition fact', () => {
  const p = modelIn(repoB).partitions[0];
  assert.ok(p.groupKin, 'partition must carry groupKin');
  const entries = Object.entries(p.groupKin);
  assert.ok(entries.length >= 1, `at least the 12-member group must pair: ${JSON.stringify(p.groupKin)}`);
  const twelve = entries.find(([, k]) => k.of === 12);
  assert.ok(twelve, `the 12-member group's pairing: ${JSON.stringify(p.groupKin)}`);
  assert.equal(twelve[1].n, 11);
  assert.ok(twelve[1].share >= 0.6);
  assert.notEqual(String(twelve[1].role), twelve[0], 'a group is never its own kin');
});

// ===== (c) the JSON contract =====
test('(c) review --json carries missing.kin with the value/container/gaps shape', () => {
  wIn(repoA, STATUS_FILES[0], statusFile(1, [...MEMBERS3, 'ARCHIVED']));
  const { out, code } = grainIn(repoA, ['review', '--json']);
  assert.equal(code, 0, out);
  const j = JSON.parse(out);
  assert.ok(j.missing && Array.isArray(j.missing.kin), `missing.kin must exist: ${out}`);
  assert.equal(j.missing.kin.length, 1, out);
  const g = j.missing.kin[0];
  assert.equal(g.file, STATUS_FILES[0]);
  assert.equal(g.value, 'ARCHIVED');
  assert.equal(g.container, 'UserStatus');
  assert.deepEqual(g.gaps, STATUS_FILES.slice(1));
  assert.ok(g.bits > 0);
});

test('(c) a change with no kin gap carries an empty missing.kin, not a missing field', () => {
  wIn(repoA, 'src/fillers/filler1.ts', `export class Filler1Service {\n  loadRecord(id: number): Record {\n    return this.store.fetch(id); // touched\n  }\n}\n`);
  const j = JSON.parse(grainIn(repoA, ['review', '--json']).out);
  assert.deepEqual(j.missing.kin, []);
});

// ===== (e) determinism =====
test('(e) an incremental refresh yields byte-identical valueNorms / valueContainer / groupKin', () => {
  const pick = repo => { const m = modelIn(repo); return JSON.stringify({ valueNorms: m.valueNorms, valueContainer: m.valueContainer, groupKin: m.partitions.map(p => p.groupKin) }); };
  for (const repo of [repoA, repoB]) {
    const d = dateEnv('2026-04-01T12:00:00Z');
    wIn(repo, 'src/late.ts', 'export const late = () => 0;\n');
    gitIn(repo, d, 'add', '-A'); gitIn(repo, d, 'commit', '-qm', 'a later commit');
    assert.equal(grainIn(repo, ['status']).code, 0);
    const incremental = pick(repo);
    assert.notEqual(incremental, '{}', 'the comparison must have something to compare');
    rmSync(join(repo, '.grain', 'cache'), { recursive: true });
    assert.equal(grainIn(repo, ['status']).code, 0);
    assert.equal(pick(repo), incremental, `${repo}: full rebuild must equal the incremental model`);
  }
});
