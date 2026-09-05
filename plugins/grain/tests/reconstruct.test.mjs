// Guard for the graph-reconstruction instrument (G'): tests/stress/reconstruct.mjs.
//
// The instrument turns "how much of a hand-written .yggdrasil/ does grain recover" into a number, so the number
// itself has to be guarded — a silently mis-parsed `when:`, a glob that stops matching, or a Jaccard tally that
// drifts would move the headline without anything failing. Three layers here:
//
//   1. End to end against a REAL tiny repository (a git repo with a 2-type .yggdrasil/ and 6 source files) with
//      a REAL `grain export` — the instrument must run the whole pipeline and see exactly two classifying types.
//   2. The type-recall ARITHMETIC, pinned by feeding the same fixture a synthetic export whose candidate sets are
//      known exactly: one shape where each type has its own grain module (both J=1), and one where grain lumps
//      both into a single module (both J=0.5 — over the >=0.5 bar, under the >=0.8 one).
//   3. Unit tests of the pieces every number rests on: the YAML subset parser, the glob matcher, `when:`
//      expansion including `not`/`all_of`/`content`, and the three-class disagreement verdict.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseYaml, globToRe, pathMatcher, expandWhen, expandMapping, jaccard, readGraph,
  classifyMiss, aspectLiterals, parseAdviseCycles, compareTypes, grainCandidates, moduleAssigner, bestMatch,
} from './stress/reconstruct.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const RECON = join(here, 'stress', 'reconstruct.mjs');

// ---------- the fixture: a real git repo, 6 files, a .yggdrasil/ with exactly 2 classifying types ----------
// Two identical copies: `repo` is where a real `grain export` runs (and leaves a .grain/ cache behind), while
// `repoPinned` never sees grain at all — the arithmetic tests drive it with a synthetic export, and a real cache
// there would silently override the pinned candidate sets and make the assertions meaningless.
let tmp, repo, repoPinned;
function buildFixture(root, env) {
  mkdirSync(root, { recursive: true });
  const w = (rel, content) => {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  };

  // three handlers and three helpers — a shape a miner can actually cluster
  for (const n of ['alpha', 'beta', 'gamma']) {
    w(`src/api/${n}-handler.ts`, `import { normalise } from '../util/${n}-helper';\n` +
      `export function handle${n[0].toUpperCase()}${n.slice(1)}(input: string): string {\n  return normalise(input);\n}\n`);
  }
  for (const n of ['alpha', 'beta', 'gamma']) {
    w(`src/util/${n}-helper.ts`, `export function normalise(value: string): string {\n  return value.trim();\n}\n`);
  }

  w('.yggdrasil/yg-config.yaml', 'version: "5.2.0"\n');
  w('.yggdrasil/yg-architecture.yaml', [
    'node_types:',
    '',
    '  handler:',
    '    description: "HTTP handlers."',
    '    when:',
    '      all_of:',
    '        - path: "src/api/*.ts"',
    '        - not:',
    '            path: "**/*.test.ts"',
    '    aspects:',
    '      - id: no-direct-fs',
    '        status: enforced',
    '    relations:',
    '      calls: [helper]',
    '      default: deny',
    '',
    '  helper:',
    '    description: "Pure helpers."',
    '    when:',
    '      path: "src/util/*.ts"',
    '    relations:',
    '      default: deny',
    '',
  ].join('\n'));
  w('.yggdrasil/model/api/yg-node.yaml', [
    'name: Api', 'type: handler', 'description: "The handlers."',
    'aspects: []',
    'relations:', '  - target: util', '    type: calls',
    'mapping:', '  - src/api/', '',
  ].join('\n'));
  w('.yggdrasil/model/util/yg-node.yaml', [
    'name: Util', 'type: helper', 'description: "The helpers."',
    'aspects: []',
    'relations: []',
    'mapping:', '  [ src/util/ ]', '',
  ].join('\n'));
  w('.yggdrasil/aspects/no-direct-fs/yg-aspect.yaml', 'name: NoDirectFs\ndescription: "No direct fs."\nreviewer:\n  type: deterministic\n');
  w('.yggdrasil/aspects/no-direct-fs/check.mjs',
    "const FS_MODULES = new Set(['node:fs', 'node:fs/promises']);\nexport function check(ctx) { return FS_MODULES.size && ctx ? [] : []; }\n");

  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', root, 'add', '-A'], { env });
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture'], { env });
}
// 6 sources + 4 graph YAMLs + the rule script + the aspect YAML = 12 tracked files
const FIXTURE_FILES = 12;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'reconstruct-'));
  repo = join(tmp, 'repo');
  repoPinned = join(tmp, 'repo-pinned');
  const env = {
    ...process.env, HOME: tmp,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
    GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
  };
  buildFixture(repo, env);
  buildFixture(repoPinned, env);
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

const runRecon = (target, extra = []) => {
  const out = join(tmp, `out-${Math.random().toString(36).slice(2)}.json`);
  const r = spawnSync('node', [RECON, target, out, '--quiet', ...extra], { encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(readFileSync(out, 'utf8'));
};

// ---------- 1. end to end, real grain export ----------
test('runs end to end over a real repo and sees exactly the two classifying types', () => {
  const o = runRecon(repo, ['--no-history']);
  assert.equal(o.instrument, 'reconstruct/1');
  assert.equal(o.files, FIXTURE_FILES);
  assert.equal(o.graph.nodeTypes, 2);
  assert.equal(o.graph.nodes, 2);
  assert.equal(o.types.classifyingTypes, 2);
  assert.equal(o.types.organizationalTypes, 0);
  assert.equal(o.types.unmeasurable, 0);
  // both node mappings expand (the `- src/api/` block form AND the `[ src/util/ ]` flow form)
  assert.equal(o.nodes.nodesWithMapping, 2);
  assert.equal(o.nodes.unmeasurable, 0);
  // the one deterministic aspect is counted and its literals are read out of the check
  assert.equal(o.aspects.deterministicAspects, 1);
  assert.equal(o.aspects.proseAspects, 0);
  // whatever grain returned, the tallies have to add up
  assert.equal(o.types.ge50, o.types.rows.filter(r => r.best && r.best.j >= 0.5).length);
  assert.ok(o.types.ge80 <= o.types.ge50);
  assert.equal(o.unknownWhenKeys.length, 0);
});

// ---------- 2. the type-recall arithmetic, against a pinned synthetic export ----------
const syntheticExport = modules => ({
  schema: 'grain-export/1',
  edges: [], partitions: [], conventions: [], archNorms: [], twins: [],
  moduleGraph: { nodes: modules, edges: [], cycles: [] },
});

test('type recall is exactly ge50/classifyingTypes when each hand type has its own grain module', () => {
  const exp = join(tmp, 'exp-split.json');
  writeFileSync(exp, JSON.stringify(syntheticExport([{ id: 'src/api', files: 3 }, { id: 'src/util', files: 3 }])));
  const o = runRecon(repoPinned, ['--export', exp]);
  assert.equal(o.types.classifyingTypes, 2);
  assert.equal(o.types.ge50, 2);
  assert.equal(o.types.ge80, 2);
  assert.equal(o.types.recallAt50, 1);
  assert.equal(o.types.recallAt80, 1);
  assert.equal(o.types.meanJaccard, 1);
  assert.deepEqual(o.types.disagreementClasses, { a: 0, b: 0, c: 0 });
  for (const row of o.types.rows) assert.equal(row.best.j, 1, row.type);
});

test('one grain module holding both hand types scores each at J=0.5 — over the 0.5 bar, under the 0.8 one', () => {
  const exp = join(tmp, 'exp-lumped.json');
  writeFileSync(exp, JSON.stringify(syntheticExport([{ id: 'src', files: 6 }])));
  const o = runRecon(repoPinned, ['--export', exp]);
  assert.equal(o.types.classifyingTypes, 2);
  assert.equal(o.types.ge50, 2);                   // 3 shared of 6 union = 0.5, which clears >= 0.5
  assert.equal(o.types.ge80, 0);
  assert.equal(o.types.recallAt50, 1);
  assert.equal(o.types.recallAt80, 0);
  assert.equal(o.types.meanJaccard, 0.5);
  for (const row of o.types.rows) assert.equal(row.best.j, 0.5, row.type);
});

test('an export with no modules leaves one catch-all bucket: recall 0, every type a disagreement', () => {
  // nothing is silently dropped — every tracked file still lands in the root module, so both hand types score
  // 3/12 against it, which is exactly the "grain proposed no structure" reading and not a zero from a gap
  const exp = join(tmp, 'exp-empty.json');
  writeFileSync(exp, JSON.stringify(syntheticExport([])));
  const o = runRecon(repoPinned, ['--export', exp]);
  assert.equal(o.types.classifyingTypes, 2);
  assert.equal(o.types.ge50, 0);
  assert.equal(o.types.ge80, 0);
  assert.equal(o.types.recallAt50, 0);
  assert.equal(o.types.meanJaccard, +(3 / FIXTURE_FILES).toFixed(3));
  const t = o.types.disagreementClasses;
  assert.equal(t.a + t.b + t.c, 2);
  assert.equal(t.c, 2, 'one bucket holding everything is a granularity call, not a miner miss');
});

// ---------- 3. the pieces the numbers rest on ----------
test('the YAML subset parser reads the shapes a Yggdrasil graph actually uses', () => {
  const doc = parseYaml([
    'name: Thing',
    'type: engine',
    'description: "a quoted value: with a colon,',
    '  continued on a second line"',
    'folded: >-',
    '  one',
    '  two',
    'aspects:',
    '  - bare-aspect',
    '  - id: object-aspect',
    '    status: enforced',
    'relations:',
    '  [',
    '    { target: a/b, type: uses },',
    '    { target: c/d, type: calls }',
    '  ]',
    'mapping:',
    '  - src/one.ts   # trailing comment',
    '  - src/two.ts',
    'when:',
    '  all_of:',
    '    - path: "src/*.ts"',
    '    - not:',
    '        path: "**/*.test.ts"',
    'flags: [a, b]',
    'n: 3',
    'off: false',
  ].join('\n'));
  assert.equal(doc.name, 'Thing');
  assert.equal(doc.description, 'a quoted value: with a colon, continued on a second line');
  assert.equal(doc.folded, 'one two');
  assert.deepEqual(doc.aspects, ['bare-aspect', { id: 'object-aspect', status: 'enforced' }]);
  assert.deepEqual(doc.relations, [{ target: 'a/b', type: 'uses' }, { target: 'c/d', type: 'calls' }]);
  assert.deepEqual(doc.mapping, ['src/one.ts', 'src/two.ts']);
  assert.deepEqual(doc.when, { all_of: [{ path: 'src/*.ts' }, { not: { path: '**/*.test.ts' } }] });
  assert.deepEqual(doc.flags, ['a', 'b']);
  assert.equal(doc.n, 3);
  assert.equal(doc.off, false);
});

test('globs follow minimatch semantics: * within a segment, ** across, {a,b} alternation', () => {
  assert.ok(globToRe('src/*.ts').test('src/a.ts'));
  assert.ok(!globToRe('src/*.ts').test('src/deep/a.ts'));
  assert.ok(globToRe('src/**/*.ts').test('src/deep/nest/a.ts'));
  assert.ok(globToRe('src/**/*.ts').test('src/a.ts'));           // `/**/` collapses to zero segments
  assert.ok(globToRe('src/{a,b}/x.ts').test('src/b/x.ts'));
  assert.ok(!globToRe('src/{a,b}/x.ts').test('src/c/x.ts'));
  assert.ok(globToRe('docs/**').test('docs/a/b/c.md'));
  // a bare directory prefix covers everything beneath it, written with or without the trailing slash
  assert.ok(pathMatcher('.claude/')('.claude/skills/x.md'));
  assert.ok(pathMatcher('src/api')('src/api/a.ts'));
  assert.ok(pathMatcher('README.md')('README.md'));
  assert.ok(!pathMatcher('README.md')('docs/README.md'));
});

test('when: expansion honours not / all_of / any_of and reads content', () => {
  const graph = readGraph(repo);
  const files = ['src/api/alpha-handler.ts', 'src/api/alpha-handler.test.ts', 'src/util/alpha-helper.ts'];
  const ctx = { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set() };
  const handler = expandWhen(graph.arch.node_types.handler.when, files, ctx);
  assert.deepEqual([...handler], ['src/api/alpha-handler.ts']);   // the `.test.ts` is excluded by `not`
  const helper = expandWhen(graph.arch.node_types.helper.when, files, ctx);
  assert.deepEqual([...helper], ['src/util/alpha-helper.ts']);
  // content: matches against the real file body
  const byContent = expandWhen({ all_of: [{ path: 'src/**/*.ts' }, { content: 'export function handle' }] }, files, ctx);
  assert.deepEqual([...byContent], ['src/api/alpha-handler.ts']);
  assert.equal(ctx.unknownWhenKeys.size, 0);
  // both mapping forms expand to the same three files
  assert.equal(expandMapping(graph.nodes.find(n => n.id === 'api').mapping, ['src/api/a.ts', 'src/util/b.ts'], ctx).size, 1);
});

test('jaccard is symmetric and behaves at the edges', () => {
  const A = new Set(['a', 'b', 'c']), B = new Set(['b', 'c', 'd']);
  assert.equal(jaccard(A, B), jaccard(B, A));
  assert.equal(+jaccard(A, B).toFixed(3), 0.5);
  assert.equal(jaccard(A, A), 1);
  assert.equal(jaccard(new Set(), new Set()), 0);
  assert.equal(jaccard(A, new Set()), 0);
});

test('a disagreement is classified as miner miss, graph debt or undecidable, never scored blindly', () => {
  const modOf = rel => rel.split('/').slice(0, 2).join('/');
  const mkCands = () => [
    { kind: 'module', name: 'src/api', files: new Set(['src/api/a.ts', 'src/api/b.ts', 'src/api/c.ts', 'src/api/d.ts']) },
    { kind: 'module', name: 'src/util', files: new Set(['src/util/x.ts', 'src/util/y.ts', 'src/util/z.ts']) },
    { kind: 'directory', name: 'src/api/inner', files: new Set(['src/api/a.ts', 'src/api/b.ts']) },
  ];
  // (a) grain HAS the set, just not as a partition or module
  const target = new Set(['src/api/a.ts', 'src/api/b.ts']);
  const modulesOnly = mkCands().filter(x => x.kind === 'module');
  const a = classifyMiss(target, modOf, mkCands(), bestMatch(target, modulesOnly));
  assert.equal(a.class, 'a');
  // (c) the set is a slice of one grain module — grain drew the same locality coarser
  const cands = mkCands().filter(c => c.kind === 'module');
  const c = classifyMiss(new Set(['src/api/a.ts']), modOf, cands, bestMatch(new Set(['src/api/a.ts']), cands));
  assert.equal(c.class, 'c');
  assert.match(c.label, /coarser/);
  // (c) the set is the union of two grain modules — grain drew it finer
  const union = new Set([...cands[0].files, ...cands[1].files]);
  const c2 = classifyMiss(union, modOf, cands, bestMatch(union, cands));
  assert.equal(c2.class, 'c');
  assert.match(c2.label, /finer/);
  // (b) the set crosses grain's clusters and is a majority of none of them
  const cross = new Set(['src/api/a.ts', 'src/api/b.ts', 'src/util/x.ts', 'src/util/y.ts']);
  const b = classifyMiss(cross, modOf, cands, bestMatch(cross, cands));
  assert.equal(b.class, 'b');
});

test('aspect literal extraction reads the names a rule polices, not the AST grammar it is written against', () => {
  const lits = aspectLiterals([
    "import { walk, report } from '@vendor/ast';",
    "const FS_MODULES = new Set(['node:fs', 'node:fs/promises']);",
    "const BANNED = ['buildIssueMessage', 'Date.now'];",
    "export function check(ctx) {",
    "  if (node.type !== 'import_statement') return;",
    "  const s = node.childForFieldName('source');",
    "  report(file, node, 'direct import — route through the helper instead');",
    "}",
  ].join('\n'));
  assert.ok(lits.has('node:fs'), [...lits].join(','));
  assert.ok(lits.has('node:fs/promises'));
  assert.ok(lits.has('buildIssueMessage'));
  assert.ok(lits.has('Date.now'));
  assert.ok(!lits.has('@vendor/ast'), 'the check\'s own import is harness vocabulary');
  assert.ok(!lits.has('import_statement'), 'a grammar node type is not a repo name');
  assert.ok(!lits.has('source'), 'a grammar field name is not a repo name');
});

test('advise loop nominations are read out of the headline, not guessed from the prose', () => {
  const cycles = parseAdviseCycles([
    '  Module groups \'cli/commands\', \'cli/portal\', \'cli/tests\' depend on each other in a loop.',
    '    at structure quotient depth 2, these module groups each reach the other by following declared dependencies.',
    '  Some other advisory that mentions a/b and c/d but no loop.',
  ].join('\n'));
  assert.equal(cycles.length, 1);
  assert.deepEqual(cycles[0], ['cli/commands', 'cli/portal', 'cli/tests']);
});

test('the candidate set carries every level grain proposes, each labelled by where it came from', async () => {
  const exp = {
    partitions: [{
      name: 'src', groups: [{ id: 'r0', label: 'handle', members: [{ rel: 'src/api/alpha-handler.ts' }] }],
      directories: [{ dir: 'src/api' }],
    }],
    moduleGraph: { nodes: [{ id: 'src/api', files: 3 }, { id: 'src/util', files: 3 }], edges: [], cycles: [] },
  };
  const modOf = await moduleAssigner(exp, null);
  const files = ['src/api/alpha-handler.ts', 'src/api/beta-handler.ts', 'src/util/alpha-helper.ts'];
  const cands = grainCandidates(exp, null, modOf, files);
  const kinds = new Set(cands.map(c => c.kind));
  assert.ok(kinds.has('module') && kinds.has('group') && kinds.has('directory'));
  const dir = cands.find(c => c.kind === 'directory' && c.name === 'src/api');
  assert.equal(dir.files.size, 2);
});

test('compareTypes counts an organizational type as nothing to recover, not as a miss', () => {
  const graph = {
    arch: { node_types: { project: { description: 'root' }, handler: { when: { path: 'src/api/*.ts' } } } },
    nodes: [], aspects: [],
  };
  const files = ['src/api/a.ts', 'src/util/b.ts'];
  const ctx = { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set() };
  const cands = [{ kind: 'module', name: 'src/api', files: new Set(['src/api/a.ts']) }];
  const modOf = rel => rel.split('/').slice(0, 2).join('/');
  const r = compareTypes(graph, files, ctx, cands, modOf);
  assert.equal(r.classifyingTypes, 1);
  assert.equal(r.organizationalTypes, 1);
  assert.equal(r.ge50, 1);
  assert.equal(r.recallAt50, 1);
});
