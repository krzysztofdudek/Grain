// IDENTIFIER HYGIENE (ticket 120, `.system/research/sense-iteration.md` §10 (2)-(5)). Four ways a mined row
// reads as nonsense however it is worded, caught in `buildAspects` before the row ever becomes an aspect draft.
//
// Three real fixtures drive the actual pipeline (a real temp git repo, a real `grain export`, the real
// renderer) — no fabricated export data — because each class is a genuine, reproducible mining outcome, not a
// hypothetical: (1) a STRUCT_PID family (`first1`/`ret`/`stshape`) is ALWAYS node-type-valued by construction
// (core.mjs `auto.first1 = stmts[0].type`), and a real function/call target can also just happen to be NAMED
// like a node type (`identifier`, exactly the ticket's own example); (2) a real generic identity function's
// return type is genuinely `T`. Classes 3 and 4 are exercised at the `buildAspects` unit level, the same
// precedented pattern `propose.test.mjs` already uses for the renderer's own classification logic (a role
// group's content predicate, a node's own description) — engineering a REAL repository whose mining naturally produces
// a role-group cluster of a chosen, exact size relative to its host directory is not reproducible without
// reaching into the same MDL machinery the unit test exists to keep decoupled from.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAspects } from './stress/propose.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROPOSE = join(here, 'stress', 'propose.mjs');

const GIT_ENV = tmp => ({
  ...process.env, HOME: tmp,
  GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
});

function commit(root, env) {
  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', root, 'add', '-A'], { env });
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture'], { env });
}

function runPropose(repo, out) {
  const r = spawnSync('node', [PROPOSE, repo, out, '--no-history', '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(readFileSync(join(out, 'proposal.json'), 'utf8'));
}

// ==================================================================================================
// Class 1 + class 4, one fixture: `first1`/`ret`/`stshape` are ALWAYS node-type-valued (core.mjs's own
// construction, no artificial naming needed), and a directory whose only candidates are all of that class ends
// up with no aspect at all — exactly the "type with no law" disclosure class 4 asks for.
// ==================================================================================================
let tmp1, repo1, out1, sidecar1;

// 30 of 36 functions' first statement is `return join(...)` (majority `first1`/`ret`/`stshape`, all node-type
// values by construction); the other 6 declare a local first, so the row sits inside the sub-gate band.
function buildStructFixture(root) {
  mkdirSync(join(root, 'src'), { recursive: true });
  const N = 36, DECL = 6;
  for (let i = 0; i < N; i++) {
    const name = `task${i}`;
    const body = i < DECL
      ? `  const x = join(base, '${name}');\n  return x;\n`
      : `  return join(base, '${name}');\n`;
    writeFileSync(join(root, 'src', `${name}.ts`), `import { join } from 'node:path';\n\nexport function ${name}(base: string): string {\n${body}}\n`);
  }
  writeFileSync(join(root, 'README.md'), '# fixture\n');
}

before(() => {
  tmp1 = mkdtempSync(join(tmpdir(), 'propose-hygiene-struct-'));
  repo1 = join(tmp1, 'repo');
  out1 = join(tmp1, 'proposal');
  mkdirSync(repo1, { recursive: true });
  buildStructFixture(repo1);
  commit(repo1, GIT_ENV(tmp1));
  sidecar1 = runPropose(repo1, out1);
});
after(() => { try { rmSync(tmp1, { recursive: true, force: true }); } catch { /* best effort */ } });

test('class 1: a STRUCT_PID row (first1/ret/stshape) is dropped, not drafted as prose', () => {
  const aspects = sidecar1.evidence.filter(e => e.kind === 'aspect');
  assert.ok(!aspects.some(a => a.enumerator === 'first1' || a.enumerator === 'ret' || a.enumerator === 'stshape'),
    'a node-type-valued row must never reach the aspect list, prose or not');
  assert.ok(sidecar1.counts.aspectsSkippedNotARuleByReason['parser-node-type-as-identifier'] >= 3,
    JSON.stringify(sidecar1.counts.aspectsSkippedNotARuleByReason));
  // every one of these families is composed ENTIRELY of node types (`return_statement`, `call_expression`,
  // the nested `stshape` structure) — none of it should leak into `proseByClass` either, since it never became
  // a draft in the first place.
  assert.equal(sidecar1.counts.proseByClass.first1 || 0, 0);
  assert.equal(sidecar1.counts.proseByClass.ret || 0, 0);
  assert.equal(sidecar1.counts.proseByClass.stshape || 0, 0);
});

test('class 4: a type with no aspect and no relation is disclosed, not silently dropped', () => {
  assert.equal(sidecar1.counts.typesWithNoLaw, 1, JSON.stringify(sidecar1.counts));
  const md = readFileSync(join(out1, 'PROPOSAL.md'), 'utf8');
  assert.match(md, /## Types with no law/);
  assert.match(md, /carry no aspect draft and appear on neither side/);
});

// ==================================================================================================
// Class 1, second fixture: the coincidence case named explicitly in the ticket — a real function LITERALLY
// named `identifier`, called from most files in a directory. The mined `call` fact is genuine; its VALUE just
// happens to collide with a tree-sitter node type name.
// ==================================================================================================
let tmp2, repo2, out2, sidecar2;

function buildCallCoincidenceFixture(root) {
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', '_util.ts'), `export function identifier(x: string): string {\n  return x;\n}\n`);
  const CALLS = 26, SKIP = 6;
  for (let i = 0; i < CALLS; i++) {
    writeFileSync(join(root, 'src', `caller${i}.ts`), `import { identifier } from './_util';\n\nexport function task${i}(x: string): string {\n  return identifier(x);\n}\n`);
  }
  for (let i = 0; i < SKIP; i++) {
    writeFileSync(join(root, 'src', `plain${i}.ts`), `export function plain${i}(x: string): string {\n  return x.trim();\n}\n`);
  }
  writeFileSync(join(root, 'README.md'), '# fixture\n');
}

before(() => {
  tmp2 = mkdtempSync(join(tmpdir(), 'propose-hygiene-call-'));
  repo2 = join(tmp2, 'repo');
  out2 = join(tmp2, 'proposal');
  mkdirSync(repo2, { recursive: true });
  buildCallCoincidenceFixture(repo2);
  commit(repo2, GIT_ENV(tmp2));
  sidecar2 = runPropose(repo2, out2);
});
after(() => { try { rmSync(tmp2, { recursive: true, force: true }); } catch { /* best effort */ } });

test('class 1: a call target that happens to be named like a node type is dropped, not "call `identifier`"', () => {
  const aspects = sidecar2.evidence.filter(e => e.kind === 'aspect');
  assert.ok(!aspects.some(a => a.enumerator === 'call' && a.identifier === 'identifier'),
    '"Every file … must call `identifier`" is not a rule an agent can act on');
  assert.ok(sidecar2.counts.aspectsSkippedNotARuleByReason['parser-node-type-as-identifier'] >= 1,
    JSON.stringify(sidecar2.counts.aspectsSkippedNotARuleByReason));
  // a real, non-colliding import survives untouched — this is a targeted guard, not a broad refusal of `call`/`imp`
  assert.ok(aspects.some(a => a.enumerator === 'imp'), 'the unrelated import row must still be proposed');
});

// ==================================================================================================
// Class 2: a real generic identity function's return type is genuinely `T` — never declared as a real type
// anywhere in this repository — held inside the sub-gate band so the row is neither certified away nor
// invisible to `subGate`.
// ==================================================================================================
let tmp3, repo3, out3, sidecar3;

function buildGenericFixture(root) {
  mkdirSync(join(root, 'src'), { recursive: true });
  const GENERIC = 25, CONCRETE = 5;
  for (let i = 0; i < GENERIC; i++) {
    writeFileSync(join(root, 'src', `identity${i}.ts`), `export function identity${i}<T>(x: T): T {\n  return x;\n}\n`);
  }
  for (let i = 0; i < CONCRETE; i++) {
    writeFileSync(join(root, 'src', `label${i}.ts`), `export function label${i}(x: string): string {\n  return x;\n}\n`);
  }
  writeFileSync(join(root, 'README.md'), '# fixture\n');
}

before(() => {
  tmp3 = mkdtempSync(join(tmpdir(), 'propose-hygiene-generic-'));
  repo3 = join(tmp3, 'repo');
  out3 = join(tmp3, 'proposal');
  mkdirSync(repo3, { recursive: true });
  buildGenericFixture(repo3);
  commit(repo3, GIT_ENV(tmp3));
  sidecar3 = runPropose(repo3, out3);
});
after(() => { try { rmSync(tmp3, { recursive: true, force: true }); } catch { /* best effort */ } });

test('class 2: a generic type parameter read as a domain type is dropped (`returns`/`ptype` `T`)', () => {
  const aspects = sidecar3.evidence.filter(e => e.kind === 'aspect');
  assert.ok(!aspects.some(a => a.identifier === 'T'), '"must take a parameter of type `T`" is not a rule about the domain');
  assert.equal(sidecar3.counts.aspectsSkippedNotARuleByReason['generic-type-parameter-as-domain-type'], 2,
    JSON.stringify(sidecar3.counts.aspectsSkippedNotARuleByReason));
  const md = readFileSync(join(out3, 'PROPOSAL.md'), 'utf8');
  assert.match(md, /a generic type parameter as a domain type/);
});

// ==================================================================================================
// Class 2, at the `buildAspects` unit level (same precedent as `propose.test.mjs`'s content-predicate and
// node-description tests). Ticket 123 / issue 125: the name-shape guess (a bare uppercase letter, `T<Word>`, tested
// against a GLOBAL census of declared type names) is gone. The test is now exact and PER ROW — its own host
// site's `tparams` (or, for a member with none of its own, its owner's, via `own`) — so shape carries no weight
// at all any more: a single uppercase letter that is nobody's declared type parameter keeps its rule, and a
// multi-letter name that genuinely IS one is still dropped.
// ==================================================================================================
function activeType(id, files) {
  const set = new Set(files);
  return { id, dir: id, files: set, selected: set, fidelity: 1, source: 'directory', levels: ['directory'], evidence: {}, aspectIds: [] };
}

test('exact type-parameter fact: a row is dropped only when its OWN host site declares the identifier, never by shape', () => {
  const active = [activeType('src', Array.from({ length: 12 }, (_, i) => `src/f${i}.ts`))];
  const exp = { asOf: 'deadbeefcafebabe', indexedAt: '2026-01-01T00:00:00Z', conventions: [], partitions: [{ name: 'src', groups: [] }] };
  const rowFor = (arg, n, extra = {}) => ({
    partition: 'src', cid: '_all:type', pid: `auto.extends:${arg}`, exp: 'true',
    share: 0.8, n, ne: Math.round(n * 0.8), bits: 5, isNorm: false, role: null, kind: 'type',
    deviants: Array.from({ length: n - Math.round(n * 0.8) }, (_, i) => `src/dev${i}.ts#Dev${i}`),
    tparams: [], own: null,
    ...extra,
  });
  const sub = [
    rowFor('T', 10, { tparams: ['T'] }), // the row's own host site declares `T` in its header — dropped
    rowFor('Widget', 10),                // multi-letter, no shape resemblance at all, but never declared either
  ];
  const { aspects, skipped } = buildAspects(exp, active, sub, {});
  assert.ok(!aspects.some(a => a.argument === 'T'), '`T` is the host site\'s own declared type parameter and must be dropped');
  assert.ok(aspects.some(a => a.argument === 'Widget'), 'a name nobody declared as a type parameter must keep its rule');
  assert.equal(skipped.notARuleByReason['generic-type-parameter-as-domain-type'], 1);
});

test('exact type-parameter fact: a single uppercase letter that nobody declares as a type parameter keeps its rule', () => {
  // The exact opposite of the old guess's blind spot: `V` looks EXACTLY like the shape the old regex fired on,
  // but no site anywhere declares it — under the exact fact it is read as a real (if oddly named) domain type.
  const active = [activeType('src', Array.from({ length: 12 }, (_, i) => `src/f${i}.ts`))];
  const exp = { asOf: 'deadbeefcafebabe', indexedAt: '2026-01-01T00:00:00Z', conventions: [], partitions: [{ name: 'src', groups: [] }] };
  const row = {
    partition: 'src', cid: '_all:type', pid: 'auto.extends:V', exp: 'true',
    share: 0.8, n: 10, ne: 8, bits: 5, isNorm: false, role: null, kind: 'type',
    deviants: ['src/dev0.ts#Dev0', 'src/dev1.ts#Dev1'], tparams: [], own: null,
  };
  const { aspects, skipped } = buildAspects(exp, active, [row], {});
  assert.ok(aspects.some(a => a.argument === 'V'), 'shape alone must never drop a row any more');
  assert.equal(skipped.notARuleByReason['generic-type-parameter-as-domain-type'] || 0, 0);
});

test('exact type-parameter fact: a member with no header of its own reads its OWNER type\'s type parameters', () => {
  const active = [activeType('src', Array.from({ length: 12 }, (_, i) => `src/f${i}.ts`))];
  // `Box` is declared as a real type elsewhere in the export, carrying its own `<T>` — a certified convention's
  // own site is one of the two places the export schema carries a scope's kind/name AND its tparams together.
  const exp = {
    asOf: 'deadbeefcafebabe', indexedAt: '2026-01-01T00:00:00Z',
    conventions: [{
      partition: 'src', context: { type: 'partition' }, kind: 'type',
      feature: { enumerator: 'nameshape', argument: null }, expected: 'Ua', statement: 'types are named Ua',
      established: 5, share: 0.9, bitsPerInstance: 1,
      conformingSites: [{ rel: 'src/box.ts', kind: 'type', name: 'Box', tparams: ['T'], own: null }],
      deviatingSites: [], exemplars: [],
    }],
    partitions: [{ name: 'src', groups: [] }],
  };
  const row = {
    // the method's own header declares nothing (`tparams: []`) — only its receiver type `Box` declares `T`
    partition: 'src', cid: '_all:method', pid: 'auto.returns:T', exp: 'true',
    share: 0.8, n: 10, ne: 8, bits: 5, isNorm: false, role: null, kind: 'method',
    deviants: ['src/dev0.ts#dev0', 'src/dev1.ts#dev1'], tparams: [], own: 'Box',
  };
  const { aspects, skipped } = buildAspects(exp, active, [row], {});
  assert.ok(!aspects.some(a => a.argument === 'T'), 'a member with no tparams of its own must still read its owner\'s, via `own`');
  assert.equal(skipped.notARuleByReason['generic-type-parameter-as-domain-type'], 1);
});

// ==================================================================================================
// Class 3, at the `buildAspects` unit level: a sub-gate row measured within one role-group cluster narrower
// than its host type's own directory. Three shapes, matching `clusterScopeFor`'s own three branches.
// ==================================================================================================
test('class 3: a cluster scope narrowed by a shared `content:` predicate renders a check against it', () => {
  const active = [activeType('src', Array.from({ length: 20 }, (_, i) => `src/f${i}.ts`))];
  const group = {
    // `size` exceeds the (simulated) member-list cap, so the explicit-list branch — tried first, since it is
    // more precise than a regex — refuses to trust an incomplete list and falls back to the shared marker.
    id: 'r0', label: 'widgets', size: 300,
    members: [{ rel: 'src/f0.ts' }, { rel: 'src/f1.ts' }, { rel: 'src/f2.ts' }],
    markers: [{ type: 'decorator', name: 'Widget', carriers: [1, 2, 3] }], imports: [], nameTokens: [],
  };
  const exp = { asOf: 'deadbeefcafebabe', indexedAt: '2026-01-01T00:00:00Z', conventions: [], partitions: [{ name: 'src', groups: [group] }] };
  const row = {
    partition: 'src', cid: 'r0:file', pid: 'auto.lex:quote', exp: 'single',
    share: 0.8, n: 5, ne: 4, bits: 5, isNorm: false, role: '0', kind: 'file',
    deviants: ['src/other1.ts#other1.ts'],
  };
  const { aspects } = buildAspects(exp, active, [row], {});
  const a = aspects.find(x => x.enumerator === 'lex');
  assert.ok(a, 'the row must still be drafted');
  assert.ok(a.check, 'a content-narrowable cluster must still render a deterministic check');
  assert.deepEqual(a.scope, { per: 'file', files: { all_of: [{ path: 'src/**' }, { content: '@Widget\\b' }] } });
  assert.equal(a.draftReason, undefined, 'a narrowed-but-expressible scope earns no permanent draft reason');
});

test('class 3: a cluster scope narrowed by a complete, explicit file list', () => {
  const active = [activeType('src', Array.from({ length: 20 }, (_, i) => `src/f${i}.ts`))];
  const group = { id: 'r1', label: 'pair', size: 2, members: [{ rel: 'src/f3.ts' }, { rel: 'src/f4.ts' }], markers: [], imports: [], nameTokens: [] };
  const exp = { asOf: 'deadbeefcafebabe', indexedAt: '2026-01-01T00:00:00Z', conventions: [], partitions: [{ name: 'src', groups: [group] }] };
  const row = {
    partition: 'src', cid: 'r1:file', pid: 'auto.lex:indent', exp: 'space2',
    share: 0.8, n: 5, ne: 4, bits: 5, isNorm: false, role: '1', kind: 'file',
    deviants: ['src/other2.ts#other2.ts'],
  };
  const { aspects } = buildAspects(exp, active, [row], {});
  const a = aspects.find(x => x.enumerator === 'lex' && x.argument === 'indent');
  assert.ok(a && a.check, 'a complete, small role group must narrow to its own files and still render a check');
  assert.deepEqual(a.scope, { per: 'file', files: { any_of: [{ path: 'src/f3.ts' }, { path: 'src/f4.ts' }] } });
});

test('class 3: a cluster with no exact scope on offer renders no check and stays draft forever', () => {
  const active = [activeType('src', Array.from({ length: 20 }, (_, i) => `src/f${i}.ts`))];
  // `size` far exceeds the export's own member-list cap (200) and the members offered here carry no marker,
  // no shared name affix and no shared import — there is nothing `contentRegexFor` can draft a predicate from,
  // and the member list itself is too incomplete to trust as an explicit file list.
  const group = { id: 'r2', label: 'odds', size: 300, members: [{ rel: 'src/f5.ts' }], markers: [], imports: [], nameTokens: [] };
  const exp = { asOf: 'deadbeefcafebabe', indexedAt: '2026-01-01T00:00:00Z', conventions: [], partitions: [{ name: 'src', groups: [group] }] };
  const row = {
    partition: 'src', cid: 'r2:file', pid: 'auto.filenameshape', exp: '(Ua)+',
    share: 0.8, n: 5, ne: 4, bits: 5, isNorm: false, role: '2', kind: 'file',
    deviants: ['src/other3.ts#other3.ts'],
  };
  const { aspects, skipped } = buildAspects(exp, active, [row], {});
  const a = aspects.find(x => x.enumerator === 'filenameshape');
  assert.ok(a, 'the row is still drafted, as prose, never silently dropped');
  assert.equal(a.check, null, 'no check may enforce a scope wider than what was ever measured');
  assert.equal(a.draftReason, 'cluster-narrower-than-scope');
  assert.equal(skipped.clusterNarrowerThanScope, 1);
  assert.match(a.content, /no exact scope/);
});
