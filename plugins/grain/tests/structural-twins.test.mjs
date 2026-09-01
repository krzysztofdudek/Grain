// J3.4 — structural twins (H4): two role-group templates — possibly in different partitions — that are the
// same shape under a different name accumulate silently today (`OrderDto`/`OrderModel`) with no signal. This
// ticket's ORIGINAL text ("<=10% edit distance over the rendered `skel` string", "shared >= 8") was superseded
// by an independent design review (traced live against `skAu`/`skAlign`) before implementation:
//   · comparison is over the raw ANTI-UNIFIED TEMPLATE (`profileOf`'s pre-`skNumber` tree, exposed as a
//     non-enumerable `_tpl` so it never reaches the persisted model cache or export.mjs's published schema),
//     not the rendered/truncated `skel` string, which is lossy in both directions;
//   · the acceptance threshold is DERIVED, not chosen: twins when the shared core (`shared = min(skCount(skAu(A,B)),
//     skCount(skAu(B,A)))` — `skAu` tests its hole marker only on its first argument, so the two directions can
//     disagree; taking the min is the conservative reading) outweighs everything that tells the two groups apart —
//     `3*shared > A.shared + B.shared`, i.e. a cross-group share > 2/3, the same majority proportion as
//     `induceRoles`' own medoid labels and J3.2's kin-completeness threshold. No new "shared >= 8" floor: that
//     number was `mineTemplates`'s OWN constant for an unrelated, unclustered population and does not transfer.
//
// A DISCOVERED-AND-FIXED GAP: `namedDifferently`'s "last token of the suffix candidate's name, by majority"
// originally ran each candidate through `nameTokens`, which routes every token through `PL_STOP` — a stopword
// set that deliberately drops generic architecture words as noise for `nameTokens`'s OTHER callers (placement,
// name-kin heuristics). "model" (also "service", "controller", "component", "view", "type", "module", …) is one
// of them. For a `*Model`-suffixed group, `nameTokens(name)`'s LAST SURVIVING token was therefore the
// per-instance ENTITY token (`order`, `payment`, …), not "model" — there was no majority across the group, and
// the mode picked whichever entity name sorted first alphabetically, e.g. `['dto', 'invoice']` instead of the
// intended `['dto', 'model']`. Fixed by using the plain `tokenize` (no stopword filtering) for this computation
// only — `nameTokens`/`PL_STOP` and their other callers are untouched, since "model" etc. really are noise there.
// Fixture A below uses suffixes outside `PL_STOP` (`dto`/`record`) as a control proving the general mechanism;
// fixture C is the regression case that pins the `PL_STOP` fix itself (`dto`/`model`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { profileOf, twinsOf, skAu } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const modelIn = repo => { grainIn(repo, ['status']); return JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8')); };
const initRepo = name => { const tmp = mkdtempSync(join(tmpdir(), name)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };

// a filler bucket of scopes sharing one identical method name is load-bearing, not decoration: `induceRoles`
// clusters by feature-bag Jaccard similarity over a single greedy agglomeration path, and (measured on this
// fixture) the DTO/record clusters are dropped entirely from the final cut when they are the ONLY candidate
// population — the presence of a third, unrelated, tightly-identical cluster changes which point along that
// path the description-length minimum lands on. 16 members matches the other J3.x fixtures' filler size.
const fillers = repo => { for (let i = 1; i <= 16; i++) wIn(repo, `src/fillers/Filler${i}.ts`, `export class Filler${i}Service {\n  loadRecord(id: number): Record<string, unknown> {\n    return this.store.fetch(id);\n  }\n}\n`); };

const ENTITIES = ['Order', 'Payment', 'Shipment', 'Refund', 'Invoice'];
// four plain field declarations (not their own scope, so they are NOT collapsed to an opaque leaf the way a
// nested method is) give the class-level skeleton enough literal structure to clear `profileOf`'s `shared < 6`
// floor; the constructor is a real scope and is opaque in the class's own skeleton either way.
const dtoLikeSrc = (deco, name) => `${deco}\nexport class ${name} {\n  readonly id: number;\n  readonly amount: number;\n  readonly status: string;\n  readonly createdAt: number;\n  constructor(id: number, amount: number, status: string, createdAt: number) {\n    this.id = id;\n    this.amount = amount;\n    this.status = status;\n    this.createdAt = createdAt;\n  }\n}\n`;
const otherSrc = name => `@Component()\nexport class ${name} {\n  private items: string[] = [];\n  add(x: string): void {\n    for (let i = 0; i < 3; i++) {\n      this.items.push(x + i);\n    }\n  }\n}\n`;

// ===== fixture A: dto/ + records/ (identical skeleton, different suffix) + other/ (different skeleton) =====
let tmpA, repoA;
before(() => {
  ({ tmp: tmpA, repo: repoA } = initRepo('grain-twins-core-'));
  for (const e of ENTITIES) {
    wIn(repoA, `src/dto/${e}Dto.ts`, dtoLikeSrc('@JsonDto()', `${e}Dto`));
    wIn(repoA, `src/records/${e}Record.ts`, dtoLikeSrc('@ReadRecord()', `${e}Record`));
  }
  const OTHERS = ['Basket', 'Ledger', 'Router', 'Cache', 'Queue'];
  for (const o of OTHERS) wIn(repoA, `src/other/${o}.ts`, otherSrc(o));
  fillers(repoA);
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repoA, d1, 'add', '-A'); gitIn(repoA, d1, 'commit', '-qm', 'the twins fixture');
});
after(() => { if (tmpA) rmSync(tmpA, { recursive: true, force: true }); });

test('(a) the Dto/Record groups (identical skeleton) are reported as twins with namedDifferently', () => {
  const m = modelIn(repoA);
  assert.ok(Array.isArray(m.twins), 'model.twins must exist and be an array once the fix lands');
  const dtoRole = Object.entries(m.partitions[0].medoids).find(([, md]) => md.label === 'JsonDto+dto')?.[0];
  const recRole = Object.entries(m.partitions[0].medoids).find(([, md]) => md.label === 'ReadRecord+record')?.[0];
  assert.ok(dtoRole !== undefined && recRole !== undefined, `both groups must have formed: ${JSON.stringify(m.partitions[0].medoids)}`);
  const pair = m.twins.find(t => (+t.a.role === +dtoRole && +t.b.role === +recRole) || (+t.a.role === +recRole && +t.b.role === +dtoRole));
  assert.ok(pair, `expected a twin pair between the dto and record groups: ${JSON.stringify(m.twins)}`);
  assert.equal(pair.a.part, '_repo'); assert.equal(pair.b.part, '_repo');
  assert.deepEqual([...pair.namedDifferently].sort(), ['dto', 'record']);
  assert.ok(pair.sim > 0.9, `sim should be near 1 for a byte-identical skeleton: ${pair.sim}`);
});

test('(b) the structurally different "other" group produces no twin pair with anything', () => {
  const m = modelIn(repoA);
  const otherRole = Object.entries(m.partitions[0].medoids).find(([, md]) => md.label === 'Component')?.[0];
  assert.ok(otherRole !== undefined, `the "other" group must have formed its own role: ${JSON.stringify(m.partitions[0].medoids)}`);
  const involvesOther = m.twins.filter(t => +t.a.role === +otherRole || +t.b.role === +otherRole);
  assert.deepEqual(involvesOther, []);
});

test('(e) an incremental refresh yields a byte-identical model.twins to a full rebuild', () => {
  const d = dateEnv('2026-04-01T12:00:00Z');
  wIn(repoA, 'src/late.ts', 'export const late = () => 0;\n');
  gitIn(repoA, d, 'add', '-A'); gitIn(repoA, d, 'commit', '-qm', 'a later commit');
  assert.equal(grainIn(repoA, ['status']).code, 0);
  const incremental = JSON.stringify(modelIn(repoA).twins);
  assert.notEqual(incremental, '[]', 'the comparison must have something to compare');
  rmSync(join(repoA, '.grain', 'cache'), { recursive: true });
  assert.equal(grainIn(repoA, ['status']).code, 0);
  assert.equal(JSON.stringify(modelIn(repoA).twins), incremental, 'full rebuild must equal the incremental model');
});

test('(where card) a twinned group prints a `twin:` line naming the other side and its differing suffix', () => {
  const out = grainIn(repoA, ['where', 'OrderDto']).out;
  assert.match(out, /twin: structurally the same as .*ReadRecord\+record.* \(_repo\), named `\*Record` there/);
});

// ===== fixture B: same-suffix control — two structurally identical Dto groups, both suffixed `dto` =====
let tmpB, repoB;
before(() => {
  ({ tmp: tmpB, repo: repoB } = initRepo('grain-twins-samesuffix-'));
  for (const e of ENTITIES) {
    wIn(repoB, `src/dtoOne/${e}Dto.ts`, dtoLikeSrc('@JsonDto()', `${e}Dto`));
    wIn(repoB, `src/dtoTwo/${e}Dto.ts`, dtoLikeSrc('@WireDto()', `${e}Dto`));
  }
  fillers(repoB);
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repoB, d1, 'add', '-A'); gitIn(repoB, d1, 'commit', '-qm', 'the same-suffix control fixture');
});
after(() => { if (tmpB) rmSync(tmpB, { recursive: true, force: true }); });

test('(c) namedDifferently is absent when both twinned groups share the same dominant suffix', () => {
  const m = modelIn(repoB);
  assert.equal(m.twins.length, 1, `expected exactly one twin pair: ${JSON.stringify(m.twins)}`);
  assert.equal(m.twins[0].namedDifferently, undefined);
  assert.ok(m.twins[0].sim > 0.9);
});

// ===== fixture C: PL_STOP regression — the ticket's own headline example, `*Dto` vs `*Model` =====
// "model" is in `nameTokens`'s PL_STOP set (noise for its OTHER callers); for THIS computation it is the
// dominant kind-label suffix, not noise, so the fix reads the plain `tokenize` of the candidate name instead.
let tmpC, repoC;
before(() => {
  ({ tmp: tmpC, repo: repoC } = initRepo('grain-twins-dtomodel-'));
  for (const e of ENTITIES) {
    wIn(repoC, `src/dto/${e}Dto.ts`, dtoLikeSrc('@JsonDto()', `${e}Dto`));
    wIn(repoC, `src/model/${e}Model.ts`, dtoLikeSrc('@DomainModel()', `${e}Model`));
  }
  fillers(repoC);
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repoC, d1, 'add', '-A'); gitIn(repoC, d1, 'commit', '-qm', 'the dto/model PL_STOP regression fixture');
});
after(() => { if (tmpC) rmSync(tmpC, { recursive: true, force: true }); });

test('(g) namedDifferently reports the PL_STOP-collision suffix `model` correctly, not an entity-name artifact', () => {
  const m = modelIn(repoC);
  assert.equal(m.twins.length, 1, `expected exactly one twin pair: ${JSON.stringify(m.twins)}`);
  assert.deepEqual([...m.twins[0].namedDifferently].sort(), ['dto', 'model']);
  assert.ok(m.twins[0].sim > 0.9);
});

// ===== (d) TWIN_PROFILE_CAP: unit test twinsOf directly — cheaper and just as conclusive as a stress fixture =====
// entries all share ONE literal (no-hole) skeleton and one constant `shared`, chosen so that skAu of ANY two
// entries' identical templates recovers the full skCount and clears both acceptance inequalities regardless of
// which subset the cap keeps — so `out.length` is EXACTLY C(200,2) if (and only if) the pool was truncated to
// 200, independent of tie-break order.
test('(d) twinsOf caps its input population at TWIN_PROFILE_CAP (200) and logs the truncation', () => {
  const bigTpl = ['class_declaration', ...Array.from({ length: 20 }, (_, i) => 'lit' + i)];
  const entries = Array.from({ length: 250 }, (_, i) => ({ key: 'k' + String(i).padStart(3, '0'), part: '_repo', role: i, label: 'g', tpl: bigTpl, shared: 10 }));
  const logs = [];
  const out = twinsOf(entries, m => logs.push(m));
  assert.ok(logs.some(m => /twin profile cap 200/.test(m) && /dropped 50/.test(m)), `expected a cap-truncation log line: ${JSON.stringify(logs)}`);
  const nChoose2 = n => n * (n - 1) / 2;
  assert.equal(out.length, nChoose2(200), 'exactly the 200-entry pool\'s pairs, regardless of which 50 were dropped');
});

test('(d) twinsOf does not log or truncate a population at or under the cap', () => {
  const bigTpl = ['class_declaration', 'a', 'b', 'c', 'd', 'e', 'f'];
  const entries = Array.from({ length: 4 }, (_, i) => ({ key: 'k' + i, part: '_repo', role: i, label: 'g', tpl: bigTpl, shared: 5 }));
  const logs = [];
  const out = twinsOf(entries, m => logs.push(m));
  assert.deepEqual(logs, []);
  assert.equal(out.length, 6); // C(4,2)
});

// ===== (f) profileOf: _tpl is a real, non-enumerable side channel — never Object.keys, JSON.stringify, or {...} =====
test('(f) profileOf attaches the raw pre-skNumber template as a non-enumerable _tpl, invisible to enumeration', () => {
  // four skeletons: one shared literal method shape with one identifier that varies per instance (a hole once
  // anti-unified) — mirrors a real role group's own skeleton shape closely enough to exercise profileOf for real.
  const sk = idName => ['method_definition', 'id:' + idName, ['formal_parameters'], ['statement_block',
    ['expression_statement', ['call_expression', 'id:validate', ['arguments']]], ['return_statement', 'num']]];
  const skels = ['alpha', 'bravo', 'charlie', 'delta'].map(sk);
  const pf = profileOf(skels);
  assert.ok(pf, 'profileOf must certify this four-member, structurally-identical-but-for-one-name population');
  // `req` (§J5.8) is the DERIVED, bounded form of the same template — literal-signature counts, an ordinary
  // enumerable field precisely because `check` needs it back out of .grain/cache/model.json. `_tpl` itself stays
  // non-enumerable: that is what the rest of this test pins.
  assert.deepEqual(Object.keys(pf).sort(), ['coverage', 'n', 'perInstance', 'req', 'shared', 'skel', 'slots'].sort());
  assert.ok(!('_tpl' in JSON.parse(JSON.stringify(pf))), '_tpl must not survive a JSON round-trip');
  assert.ok(!('_tpl' in { ...pf }), '_tpl must not survive an object spread');
  assert.equal(Object.prototype.propertyIsEnumerable.call(pf, '_tpl'), false);
  // cross-check _tpl's actual VALUE against an independently-computed anti-unification of the same skeletons
  let expected = skels[0]; for (let i = 1; i < skels.length; i++) expected = skAu(expected, skels[i]);
  assert.deepEqual(pf._tpl, expected);
});
