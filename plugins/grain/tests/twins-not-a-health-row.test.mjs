// §044 — structural twins are an OBSERVATION, not an instruction.
//
// `model.twins` (J3.4) fed two renderers: `where`'s group card (`twin: structurally the same as «B» …`, one
// line, at most one per group, printed only to a reader who asked about that group) and a `== health ==` row
// (§J5.5 signal 5) that turned the same evidence into an unsolicited
// `grain decide steer … --note "duplicate of «B» — unify or document why both exist"`.
//
// MEASURED (log: .temp/issues/044-twins-duplicate-noise/log.md). Criterion fixed before any pair was seen;
// cards showed only the claim and the member bodies; `shared`/coverage/co-change computed only after the
// verdicts were locked; ties scored REAL, so the figure is an upper bound:
//   OpenZeppelin (Solidity) 9/25 = 0.36 · flask (Python) 8/25 = 0.32 · gin (Go) 1/25 = 0.04 · 18/75 = 0.24
// The fault is a missing baseline, not a loose threshold: over 861 arbitrary same-root pool pairs in gin the
// median shared core is 10, and gin's ACCEPTED twins median 10 — the gate selects for nothing. It is also
// quadratic in one fact: 33 of OpenZeppelin's 83 rows were `Packing.sol` pairing with itself, and `rules` wrote
// all 83 into the user's committed CONVENTIONS.md.
//
// So this file pins BOTH directions, and the second half must pass in both arms — a guard that only holds after
// the change guards nothing:
//   (a)(b) the health row is gone from report and from rules   — red before the deletion, green after
//   (c)(d) model.twins, the published export shape, and `where`'s card line are UNTOUCHED — green in both arms
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { report, rulesMarkdown } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const TWIN_CLAIM = /are structurally the same shape/;
const TWIN_INSTRUCTION = /duplicate of «[^»]+» in .* — unify or document why both exist/;

// ---------- half 1: hand-built model, the same pattern health-section.test.mjs uses ----------
// pkgA carries a partition-wide fact (the cost row's anchor) and two role-defining facts (`r0:`/`r1:`), which
// is exactly what the twin row needed to resolve a `<path>#<name>`. Keeping them proves the deletion removed
// signal 5 alone and not the anchor machinery the archetype row still shares.
function modelWithTwins() {
  const costFact = { cid: '_all', kind: 'method', pid: 'auto.call:validate', exp: 'true', share: 0.9, sraw: 120, deviantsN: 12,
    exemplars: [{ rel: 'alpha/T0.ts', name: 'run', line: 2, endLine: 4 }],
    deviants: [{ rel: 'alpha/T1.ts', name: 'run', line: 2, obs: 'false' }],
    cost: { k: 11, n: 12, baseK: 13, baseN: 120, bits: 27.12 } };
  const role0Fact = { cid: 'r0:method', kind: 'method', pid: 'auto.deco:@Foo', exp: 'true', share: 1, sraw: 12, deviantsN: 0,
    exemplars: [{ rel: 'src/pkgA/Foo0.ts', name: 'Foo0', line: 1, endLine: 2 }] };
  const role1Fact = { cid: 'r1:method', kind: 'method', pid: 'auto.deco:@Bar', exp: 'true', share: 1, sraw: 9, deviantsN: 0,
    exemplars: [{ rel: 'src/pkgA/Bar0.ts', name: 'Bar0', line: 1, endLine: 2 }] };
  const pkgA = { name: 'pkgA', scopes: 200, medoids: [{ label: 'Foo group', feats: [] }, { label: 'Bar group', feats: [] }],
    files: ['alpha/T0.ts'], templates: [], facts: [costFact, role0Fact, role1Fact] };
  return { repo: 'test-repo', partitions: [pkgA], cochange: [], agentShare: null, steers: [], waivers: [], changeArchetypes: [],
    twins: [{ a: { part: 'pkgA', role: 0, label: 'Foo group' }, b: { part: 'pkgA', role: 1, label: 'Bar group' },
      sim: 0.91, namedDifferently: ['Foo', 'Bar'] }] };
}

test('(a) report: a model carrying twins emits NO health row about them, while other health signals still render', () => {
  const model = modelWithTwins();
  const text = report(model, {}).join('\n');
  // the deletion is real...
  assert.doesNotMatch(text, TWIN_CLAIM, `no twin claim may reach the health section:\n${text}`);
  assert.doesNotMatch(text, TWIN_INSTRUCTION, `no "unify or document why both exist" instruction may be emitted:\n${text}`);
  assert.doesNotMatch(text, /«Foo group» \(pkgA\) and «Bar group» \(pkgA\)/, text);
  // ...and surgical: the cost row (signal 1) is untouched, so `== health ==` itself still works
  assert.match(text, /== health — 1 signal ==/, `the section must still render its remaining signals:\n${text}`);
  assert.match(text, /costs 8\.5× more fixes when deviated from/, text);
});

test('(a2) report: a model whose ONLY health input is twins renders no health section at all', () => {
  const model = modelWithTwins();
  model.partitions[0].facts = model.partitions[0].facts.filter(f => !f.cost); // drop the one other signal
  const text = report(model, {}).join('\n');
  assert.doesNotMatch(text, /== health/, `twins alone must not conjure a health section:\n${text}`);
  assert.doesNotMatch(text, TWIN_CLAIM, text);
});

test('(b) rules: the generated CONVENTIONS.md carries no twin instruction, and still carries the other health rows', () => {
  const model = modelWithTwins();
  const md = rulesMarkdown(model, {}).join('\n');
  assert.doesNotMatch(md, TWIN_CLAIM, `a committed conventions document must not carry twin accusations:\n${md}`);
  assert.doesNotMatch(md, TWIN_INSTRUCTION, md);
  assert.match(md, /## Health/, md);
  assert.match(md, /costs 8\.5× more fixes when deviated from/, md);
});

// ---------- half 2: a real repo — model.twins, export and `where` must be UNCHANGED (green in both arms) ----------
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const modelIn = repo => { grainIn(repo, ['status']); return JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8')); };

// the same fixture shape structural-twins.test.mjs grows (dto/ + records/, identical skeleton, different
// suffix, plus the filler bucket that fixes where induceRoles' agglomeration cuts) — reproduced here so this
// file stands alone and would still fail if someone deleted that one.
const ENTITIES = ['Order', 'Payment', 'Shipment', 'Refund', 'Invoice'];
const dtoLikeSrc = (deco, name) => `${deco}\nexport class ${name} {\n  readonly id: number;\n  readonly amount: number;\n  readonly status: string;\n  readonly createdAt: number;\n  constructor(id: number, amount: number, status: string, createdAt: number) {\n    this.id = id;\n    this.amount = amount;\n    this.status = status;\n    this.createdAt = createdAt;\n  }\n}\n`;
let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-044-twins-')); repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false');
  for (const e of ENTITIES) {
    wIn(repo, `src/dto/${e}Dto.ts`, dtoLikeSrc('@JsonDto()', `${e}Dto`));
    wIn(repo, `src/records/${e}Record.ts`, dtoLikeSrc('@ReadRecord()', `${e}Record`));
  }
  for (let i = 1; i <= 16; i++) wIn(repo, `src/fillers/Filler${i}.ts`, `export class Filler${i}Service {\n  loadRecord(id: number): Record<string, unknown> {\n    return this.store.fetch(id);\n  }\n}\n`);
  const d = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repo, d, 'add', '-A'); gitIn(repo, d, 'commit', '-qm', 'the 044 twins fixture');
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(c) BOTH ARMS: model.twins still certifies the pair, and `export` still publishes it with namedDifferently', () => {
  const m = modelIn(repo);
  assert.ok(Array.isArray(m.twins), 'model.twins must survive — the deletion is render-only');
  const pair = m.twins.find(t => t.namedDifferently);
  assert.ok(pair, `the dto/record pair must still be certified: ${JSON.stringify(m.twins)}`);
  assert.deepEqual([...pair.namedDifferently].sort(), ['dto', 'record']);
  assert.ok(pair.sim > 0.9, `sim: ${pair.sim}`);

  // export is a PUBLISHED INTERFACE: same array, same entries, same field names, byte for byte
  const out = join(tmp, 'export.json');
  assert.equal(grainIn(repo, ['export', '--out', out]).code, 0);
  const d = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(d.twins, m.twins, 'export.twins must be model.twins verbatim');
  assert.deepEqual(Object.keys(pair).sort(), ['a', 'b', 'namedDifferently', 'sim'].sort());
  assert.deepEqual(Object.keys(pair.a).sort(), ['label', 'part', 'role'].sort());
});

test('(d) BOTH ARMS: `where`\'s group card still prints the `twin:` observation — the evidence keeps a home', () => {
  const out = grainIn(repo, ['where', 'OrderDto']).out;
  assert.match(out, /twin: structurally the same as .*ReadRecord\+record.* \(_repo\), named `\*Record` there/, out);
  // and it is an observation, never the deleted instruction
  assert.doesNotMatch(out, TWIN_INSTRUCTION, out);
});

test('(d2) BOTH ARMS: the twin evidence is bounded — a group card carries at most one twin line', () => {
  const out = grainIn(repo, ['where', 'OrderDto']).out;
  assert.equal((out.match(/twin: structurally the same as/g) || []).length, 1, out);
});
