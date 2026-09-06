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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseYaml, globToRe, pathMatcher, expandWhen, expandMapping, jaccard, readGraph,
  classifyMiss, aspectLiterals, parseAdviseCycles, compareTypes, grainCandidates, moduleAssigner, bestMatch,
} from './stress/reconstruct.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const RECON = join(here, 'stress', 'reconstruct.mjs');
const BIN = join(here, '..', 'bin', 'grain.mjs');   // the recorded oracles below are scored through the product command, not through this instrument

// ---------- the fixture: a real git repo, 6 files, a .yggdrasil/ with exactly 2 classifying types ----------
// Two identical copies: `repo` is where a real `grain export` runs (and leaves a .grain/ cache behind), while
// `repoPinned` never sees grain at all — the arithmetic tests drive it with a synthetic export, and a real cache
// there would silently override the pinned candidate sets and make the assertions meaningless.
let tmp, repo, repoPinned, repoBare, oracleDir;
function buildFixture(root, env, { withGraph = true } = {}) {
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

  // A brownfield target has no graph of its own — that is the whole point of an oracle held OUT of tree.
  if (!withGraph) {
    execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env });
    execFileSync('git', ['-C', root, 'add', '-A'], { env });
    execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture'], { env });
    return;
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
  // the same 6 sources with NO `.yggdrasil/` of their own, plus the hand graph held beside the repository —
  // the shape every oracle under tests/stress/oracles/ has: the graph is in THIS repo, the code is a clone
  repoBare = join(tmp, 'repo-bare');
  buildFixture(repoBare, env, { withGraph: false });
  oracleDir = join(tmp, 'oracle');
  mkdirSync(oracleDir, { recursive: true });
  cpSync(join(repoPinned, '.yggdrasil'), join(oracleDir, '.yggdrasil'), { recursive: true });
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

// ---------- 1b. the graph and the code it describes need not be the same directory ----------
// Every oracle under `tests/stress/oracles/<name>/.yggdrasil/` describes a repository that lives somewhere else
// (a clone). Without `--graph` the instrument can only ever score a repo against a graph committed INSIDE it,
// which is the one layout the Yggdrasil measurement happened to have.
test('--graph reads the hand graph from beside the repository, not from inside it', () => {
  const exp = join(tmp, 'exp-split-bare.json');
  writeFileSync(exp, JSON.stringify(syntheticExport([{ id: 'src/api', files: 3 }, { id: 'src/util', files: 3 }])));
  const o = runRecon(repoBare, ['--export', exp, '--graph', oracleDir]);
  assert.equal(o.graphRoot, oracleDir);
  assert.equal(o.files, 6, 'the target carries only its own 6 sources — no graph files of its own');
  assert.equal(o.graph.nodeTypes, 2);
  assert.equal(o.graph.nodes, 2);
  assert.equal(o.types.classifyingTypes, 2);
  assert.equal(o.types.ge50, 2);
  assert.equal(o.types.meanJaccard, 1);
  // the deterministic aspect ships beside the graph, so its check is still read from the oracle directory
  assert.equal(o.aspects.deterministicAspects, 1);
});

test('--graph over a copy of an in-tree graph reproduces the in-place numbers exactly', () => {
  const exp = join(tmp, 'exp-split-same.json');
  writeFileSync(exp, JSON.stringify(syntheticExport([{ id: 'src/api', files: 3 }, { id: 'src/util', files: 3 }])));
  const inPlace = runRecon(repoPinned, ['--export', exp]);
  const beside = runRecon(repoPinned, ['--export', exp, '--graph', oracleDir]);
  assert.deepEqual(beside.types.rows.map(r => [r.type, r.best.j]), inPlace.types.rows.map(r => [r.type, r.best.j]));
  assert.deepEqual(beside.nodes.rows.map(r => [r.node, r.best.j]), inPlace.nodes.rows.map(r => [r.node, r.best.j]));
  assert.equal(beside.relations.declaredPairs, inPlace.relations.declaredPairs);
  assert.equal(beside.aspects.deterministicAspects, inPlace.aspects.deterministicAspects);
});

// ---------- 1c. the three in-tree oracles, against the real repositories they describe ----------
// The synthetic fixture above proves the plumbing; these prove it on graphs nobody wrote for the instrument.
// The oracle graphs are committed here; the repositories are clones that are not, so the corpus directory has to
// be pointed at with GRAIN_CORPUS_CLONES and the test skips with a reason when it is not. What is asserted is the
// ORACLE side of every comparison — the denominators — because those are facts about a committed graph read
// against a real foreign tree, and a glob, `content:` predicate or mapping that silently stopped matching would
// move them without failing anything else. Grain's own scores are the measurement, not the guard, and are not
// pinned here: they are reported in `.system/research/oracles-4-measurement.md`.
const CLONES = process.env.GRAIN_CORPUS_CLONES;
const ORACLES = join(here, 'stress', 'oracles');
const ORACLE_FACTS = {
  express: {
    oracle: 'express', clone: 'express',
    files: 213, nodeTypes: 14, nodes: 20, aspects: 23,
    classifyingTypes: 13, nodesWithMapping: 15, declaredRelations: 15,
    deterministicAspects: 20, proseAspects: 3, filesWithAnOwningNode: 211,
  },
  'spring-petclinic': {
    oracle: 'spring-petclinic', clone: 'spring-petclinic',
    files: 131, nodeTypes: 30, nodes: 27, aspects: 28,
    classifyingTypes: 28, nodesWithMapping: 20, declaredRelations: 35,
    deterministicAspects: 23, proseAspects: 5, filesWithAnOwningNode: 77,
  },
};
// a throwaway git repo holding the clone's HEAD tree: the corpus clones are read-only, and `grain export` would
// otherwise leave a `.grain/` inside one
function stageClone(src, dst, env) {
  mkdirSync(dst, { recursive: true });
  const tar = spawnSync('sh', ['-c', `git -C '${src}' archive HEAD | tar -x -C '${dst}'`], { encoding: 'utf8' });
  assert.equal(tar.status, 0, tar.stderr);
  execFileSync('git', ['-C', dst, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', dst, 'add', '-A'], { env });
  execFileSync('git', ['-C', dst, 'commit', '-q', '-m', 'staged clone'], { env });
}

for (const [name, F] of Object.entries(ORACLE_FACTS)) {
  test(`the ${name} oracle scores against its own repository`, { skip: CLONES ? false : 'GRAIN_CORPUS_CLONES is not set — the corpus clones are not in this repository' }, () => {
    const clone = join(CLONES, F.clone);
    if (!existsSync(join(clone, '.git'))) {
      assert.ok(true, `skipped: no clone at ${clone}`);
      return;
    }
    const target = join(tmp, `clone-${name}`);
    stageClone(clone, target, {
      ...process.env, HOME: tmp,
      GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
      GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
    });
    const o = runRecon(target, ['--graph', join(ORACLES, F.oracle), '--no-history']);

    assert.equal(o.files, F.files, 'tracked files after coverage.excluded');
    assert.equal(o.graph.nodeTypes, F.nodeTypes);
    assert.equal(o.graph.nodes, F.nodes);
    assert.equal(o.graph.aspects, F.aspects);
    // every `when` and every `mapping` still expands against the real tree — the silent-failure mode
    assert.equal(o.types.classifyingTypes, F.classifyingTypes);
    assert.equal(o.types.unmeasurable, 0, 'a node type whose `when` matches no tracked file');
    assert.equal(o.nodes.nodesWithMapping, F.nodesWithMapping);
    assert.equal(o.nodes.unmeasurable, 0, 'a node whose `mapping` matches no tracked file');
    assert.equal(o.unknownWhenKeys.length, 0);
    assert.equal(o.relations.declaredRelations, F.declaredRelations);
    assert.equal(o.relations.nodeLevel.filesWithAnOwningNode, F.filesWithAnOwningNode);
    assert.equal(o.aspects.deterministicAspects, F.deterministicAspects);
    assert.equal(o.aspects.proseAspects, F.proseAspects);
    // grain's side is not pinned, but the tallies must close
    assert.equal(o.grain.moduleAssignmentMismatch, 0, 'the instrument must reproduce grain\'s own module file counts');
    assert.ok(o.relations.nodeLevel.matched <= Math.min(o.relations.nodeLevel.declaredPairs, o.relations.nodeLevel.grainPairs));
    const t = o.types.disagreementClasses;
    assert.equal(o.types.ge50 + t.a + t.b + t.c, o.types.classifyingTypes);
  });
}

// ---------- 1d. the RECORDED oracles — an adopter's correction, scored the same way ----------
// A fifth kind of oracle (ticket 143): not a graph written by hand for the instrument, but the difference
// between what `grain propose` wrote for a repository and the graph its maintainer accepted. `grain oracle
// record` stores it as five documents including the file set every predicate selected, so the score needs no
// checkout at all — which is why this runs unconditionally where the three graph oracles above skip without one.
// What is asserted is the ACCEPTED side (the denominators, facts about a committed record) and that the score's
// tallies close. Grain's own hit counts are the measurement, not the guard, and are reported in
// `.system/research/oracle-5-yggdrasil.md`.
const RECORDED = {
  yggdrasil: { files: 3056, acceptedTypes: 36, acceptedNodes: 436, acceptedRelations: 1298, acceptedRules: 70, acceptedPorts: 1 },
};
for (const [name, F] of Object.entries(RECORDED)) {
  test(`the recorded ${name} oracle scores from its own record, with no checkout of the repository`, () => {
    const dir = join(ORACLES, name);
    const manifest = JSON.parse(readFileSync(join(dir, 'oracle.json'), 'utf8'));
    assert.equal(manifest.schema, 'grain-oracle/1');
    assert.equal(manifest.target.files, F.files);
    assert.equal(manifest.counts.acceptedTypes, F.acceptedTypes);
    assert.equal(manifest.counts.acceptedNodes, F.acceptedNodes);
    assert.equal(manifest.counts.acceptedRelations, F.acceptedRelations);
    assert.equal(manifest.counts.acceptedRules, F.acceptedRules);
    assert.equal(manifest.counts.acceptedPorts, F.acceptedPorts);

    // every path index in the record resolves against the recorded file list
    const files = JSON.parse(readFileSync(join(dir, 'files.json'), 'utf8')).files;
    assert.equal(files.length, F.files);
    const accepted = JSON.parse(readFileSync(join(dir, 'accepted.json'), 'utf8'));
    for (const n of accepted.nodes) for (const i of n.files) assert.ok(files[i], `${name}: node ${n.id} names a path index the record does not have`);

    const r = spawnSync('node', [BIN, 'oracle', 'score', dir, '--json'], { encoding: 'utf8', maxBuffer: 1 << 28 });
    assert.equal(r.status, 0, r.stderr);
    const s = JSON.parse(r.stdout);
    assert.equal(s.schema, 'grain-oracle-score/1');
    // the tallies have to close: a hit is a row at J >= 0.5, in both directions and at both granularities
    for (const d of [s.types.recall, s.types.recallWithAlternatives, s.types.precision, s.nodes.recall, s.nodes.precision]) {
      assert.equal(d.n, d.rows.length, d.label);
      assert.equal(d.hit, d.rows.filter(x => x.best >= 0.5).length, d.label);
      assert.ok(d.hit8 <= d.hit, d.label);
    }
    assert.ok(s.types.recallWithAlternatives.hit >= s.types.recall.hit, 'the alternatives stratum is a ceiling, never a discount');
    assert.equal(s.types.recall.n, accepted.types.filter(t => t.classifying && t.files.length).length);
    assert.ok(s.relations.matched <= Math.min(s.relations.acceptedPairs, s.relations.proposedPairs));
    assert.equal(s.relations.acceptedDeclared, F.acceptedRelations);
    // the correction and the relation score are one computation, not two that can disagree
    const correction = JSON.parse(readFileSync(join(dir, 'correction.json'), 'utf8'));
    assert.equal(correction.relations.counts.kept, s.relations.matched);
    assert.equal(correction.relations.counts.added, s.relations.acceptedPairs - s.relations.matched);
    assert.equal(correction.relations.counts.removed, s.relations.proposedPairs - s.relations.matched);
  });
}

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
