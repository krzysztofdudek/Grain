// `grain oracle` — recording the correction an adopter made to a proposal, and scoring against it.
//
// Everything here runs against a REAL repository (a git checkout with a real hand-written `.yggdrasil/`) and a
// REAL `grain propose` run through the built CLI. Nothing is stubbed: the proposal is the one the product
// command writes, and the accepted graph is a graph on disk, because the whole claim of this command is that the
// difference between those two artifacts is measurable.
//
// Four things are pinned:
//   1. CONSENT. The command prints what it would store and where, and writes nothing until `--yes`. With no
//      `--out` and a repository that is not one of this repository's own fixtures there is no destination at all.
//   2. WHAT IS STORED. Structure and paths, never file contents — asserted by searching the whole record for a
//      string that appears only inside a source file's body.
//   3. THE SCORE. Precision and recall in both directions, on file sets recorded at record time, so scoring
//      works with the repository gone — that is what makes an oracle contributable by someone who cannot ship
//      their code.
//   4. THE CORRECTION. A merge and a split, planted in two accepted graphs over the same proposal, come back
//      named as a merge and a split.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

let tmp, repo, prop, out, env;

const w = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};

// six handlers and six helpers: enough files that a merge and a split are real events over file sets, not
// arithmetic on two-element sets
function buildRepo(root) {
  for (const n of ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']) {
    w(root, `src/api/${n}-handler.ts`,
      `import { normalise } from '../util/${n}-helper';\n` +
      `export function handle${n[0].toUpperCase()}${n.slice(1)}(input: string): string {\n  return normalise(input);\n}\n`);
    w(root, `src/util/${n}-helper.ts`, `export function normalise(value: string): string {\n  return value.trim(); // ${n} TRACE_ONLY_IN_A_FILE_BODY\n}\n`);
  }
  w(root, '.yggdrasil/yg-config.yaml', 'version: "5.2.0"\n');
  w(root, '.yggdrasil/yg-architecture.yaml', [
    'node_types:', '',
    '  handler:', '    description: "HTTP handlers."',
    '    when:', '      path: "src/api/*.ts"',
    '    aspects:', '      - id: no-direct-fs', '        status: enforced',
    '    relations:', '      calls: [helper]', '      default: deny', '',
    '  helper:', '    description: "Pure helpers."',
    '    when:', '      path: "src/util/*.ts"',
    '    relations:', '      default: deny', '',
  ].join('\n'));
  w(root, '.yggdrasil/model/api/yg-node.yaml',
    'name: Api\ntype: handler\ndescription: "The handlers."\naspects: []\nrelations:\n  - target: util\n    type: calls\nmapping:\n  - src/api/\n');
  w(root, '.yggdrasil/model/util/yg-node.yaml',
    'name: Util\ntype: helper\ndescription: "The helpers."\naspects: []\nrelations: []\nmapping:\n  [ src/util/ ]\n');
  w(root, '.yggdrasil/aspects/no-direct-fs/yg-aspect.yaml',
    'name: NoDirectFs\ndescription: "No direct fs."\nstatus: enforced\nreviewer:\n  type: deterministic\n');
  w(root, '.yggdrasil/aspects/no-direct-fs/check.mjs',
    "const FS_MODULES = new Set(['node:fs', 'node:fs/promises']);\nexport function check(ctx) { return FS_MODULES.size && ctx ? [] : []; }\n");
  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', root, 'add', '-A'], { env });
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture'], { env });
}

// the same twelve files under ONE node — the adopter merged the two the proposal drew
function buildMergedGraph(root) {
  w(root, '.yggdrasil/yg-config.yaml', 'version: "5.2.0"\n');
  w(root, '.yggdrasil/yg-architecture.yaml', [
    'node_types:', '',
    '  code:', '    description: "All of it."',
    '    when:', '      path: "src/**/*.ts"',
    '    relations:', '      default: deny', '',
  ].join('\n'));
  w(root, '.yggdrasil/model/everything/yg-node.yaml',
    'name: Everything\ntype: code\ndescription: "One node."\naspects: []\nrelations: []\nmapping:\n  - src/\n');
}

// the handlers cut in two — the adopter split the node the proposal drew over src/api/
function buildSplitGraph(root) {
  w(root, '.yggdrasil/yg-config.yaml', 'version: "5.2.0"\n');
  w(root, '.yggdrasil/yg-architecture.yaml', [
    'node_types:', '',
    '  handler:', '    description: "Handlers."',
    '    when:', '      path: "src/api/*.ts"',
    '    relations:', '      default: deny', '',
    '  helper:', '    description: "Helpers."',
    '    when:', '      path: "src/util/*.ts"',
    '    relations:', '      default: deny', '',
  ].join('\n'));
  w(root, '.yggdrasil/model/api-front/yg-node.yaml',
    'name: Front\ntype: handler\ndescription: "First three."\naspects: []\nrelations: []\nmapping:\n  - src/api/alpha-handler.ts\n  - src/api/beta-handler.ts\n  - src/api/gamma-handler.ts\n');
  w(root, '.yggdrasil/model/api-back/yg-node.yaml',
    'name: Back\ntype: handler\ndescription: "Last three."\naspects: []\nrelations: []\nmapping:\n  - src/api/delta-handler.ts\n  - src/api/epsilon-handler.ts\n  - src/api/zeta-handler.ts\n');
  w(root, '.yggdrasil/model/util/yg-node.yaml',
    'name: Util\ntype: helper\ndescription: "The helpers."\naspects: []\nrelations: []\nmapping:\n  - src/util/\n');
}

const grain = (args, opts = {}) => {
  const r = spawnSync('node', [BIN, ...args], { encoding: 'utf8', maxBuffer: 1 << 28, env, cwd: opts.cwd || tmp });
  return { out: r.stdout || '', err: r.stderr || '', code: r.status };
};

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-oracle-'));
  env = {
    ...process.env, HOME: tmp,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
    GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
  };
  repo = join(tmp, 'repo');
  mkdirSync(repo, { recursive: true });
  buildRepo(repo);
  prop = join(tmp, 'prop');
  out = join(tmp, 'oracles');
  const r = grain(['propose', prop, '--repo', repo]);
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(prop, '.yggdrasil')), 'the propose run must have written a graph to score against');
  buildMergedGraph(mkdirSync(join(tmp, 'merged'), { recursive: true }) || join(tmp, 'merged'));
  buildSplitGraph(mkdirSync(join(tmp, 'split'), { recursive: true }) || join(tmp, 'split'));
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

// ---------- 1. consent ----------
test('record prints what it would store and where, and writes nothing without --yes', () => {
  const dest = join(out, 'demo');
  const r = grain(['oracle', 'record', '--repo', repo, '--proposal', prop, '--name', 'demo', '--out', out]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /it will store/);
  assert.match(r.out, /it will NOT store/);
  assert.match(r.out, /file contents/);
  assert.ok(r.out.includes(dest), `the plan must name the exact destination, got:\n${r.out}`);
  assert.match(r.out, /Nothing has been written/);
  assert.match(r.out, /--yes/);
  assert.equal(existsSync(dest), false, 'a preview must not create the destination');
});

test('with no --out and a repository that is not one of this repository\'s own fixtures there is no destination at all', () => {
  const r = grain(['oracle', 'record', '--repo', repo, '--proposal', prop, '--name', 'nowhere']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /destination\s+none/);
  assert.match(r.out, /not one of this repository's own fixtures/);
  assert.match(r.out, /--out <dir>/);
  assert.equal(existsSync(join(out, 'nowhere')), false);
});

// ---------- 2. what is stored ----------
test('--yes writes the record: structure and paths, and no file contents', () => {
  const dest = join(out, 'demo');
  const r = grain(['oracle', 'record', '--repo', repo, '--proposal', prop, '--name', 'demo', '--out', out, '--yes']);
  assert.equal(r.code, 0, r.err);
  for (const f of ['oracle.json', 'files.json', 'proposal.json', 'accepted.json', 'correction.json', 'README.md'])
    assert.ok(existsSync(join(dest, f)), `expected ${f} in the record`);

  const manifest = JSON.parse(readFileSync(join(dest, 'oracle.json'), 'utf8'));
  assert.equal(manifest.schema, 'grain-oracle/1');
  assert.equal(manifest.name, 'demo');
  assert.equal(manifest.counts.acceptedNodes, 2);
  assert.equal(manifest.counts.acceptedTypes, 2);
  assert.equal(manifest.counts.acceptedRules, 1);

  const files = JSON.parse(readFileSync(join(dest, 'files.json'), 'utf8'));
  const tracked = execFileSync('git', ['-C', repo, 'ls-files'], { encoding: 'utf8', env }).split('\n').filter(Boolean);
  assert.deepEqual(files.files, tracked, 'the record is the tracked file list at the recorded commit');
  assert.equal(manifest.target.files, tracked.length);

  // every element carries the paths its predicate selected, as indices into that list
  const accepted = JSON.parse(readFileSync(join(dest, 'accepted.json'), 'utf8'));
  const api = accepted.nodes.find(n => n.id === 'api');
  assert.deepEqual(api.files.map(i => files.files[i]).sort(), tracked.filter(f => f.startsWith('src/api/')).sort());
  assert.deepEqual(api.relations, [{ target: 'util', type: 'calls', consumes: [] }]);
  const rule = accepted.aspects.find(a => a.id === 'no-direct-fs');
  assert.equal(rule.status, 'enforced');
  assert.ok(rule.literals.includes('node:fs'), 'the identifiers a mechanical rule polices are read out of its check');

  // the one thing that must never be in there: the body of a source file
  const whole = ['oracle.json', 'files.json', 'proposal.json', 'accepted.json', 'correction.json', 'README.md']
    .map(f => readFileSync(join(dest, f), 'utf8')).join('\n');
  assert.ok(!whole.includes('TRACE_ONLY_IN_A_FILE_BODY'), 'a record must carry paths and structure, never file contents');
});

// ---------- 3. the score ----------
test('score prints precision and recall in both directions, on the same J >= 0.5 bar the hand-written oracles use', () => {
  const r = grain(['oracle', 'score', join(out, 'demo')]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /node types\s+recall \d+\/2 = [\d.]+/);
  assert.match(r.out, /precision \d+\/\d+ = [\d.]+/);
  assert.match(r.out, /nodes\s+recall \d+\/2 = [\d.]+/);
  assert.match(r.out, /relations\s+recall/);
  assert.match(r.out, /Jaccard >= 0\.5/);

  const j = JSON.parse(grain(['oracle', 'score', join(out, 'demo'), '--json']).out);
  assert.equal(j.schema, 'grain-oracle-score/1');
  // the proposal cuts src/api/ and src/util/ exactly as the hand graph does, under other names
  assert.equal(j.types.recall.n, 2);
  assert.equal(j.types.recall.hit, 2);
  assert.equal(j.nodes.recall.hit, 2);
  assert.equal(j.nodes.recall.rows.find(x => x.id === 'api').best, 1);
  assert.ok(j.types.precision.n >= j.types.recall.hit);
  assert.ok(j.relations.acceptedPairs >= 1);
  assert.equal(j.relations.matched, j.relations.acceptedPairs, 'the one declared relation survives into the proposal');
  assert.equal(j.rules.acceptedWithLiterals, 1);
  assert.deepEqual(j.correction.nodes.counts.merged, 0);
});

test('the file sets are recorded, so a score needs neither the repository nor a clone of it', () => {
  const moved = repo + '-moved';
  renameSync(repo, moved);
  try {
    const r = grain(['oracle', 'score', join(out, 'demo')]);
    assert.equal(r.code, 0, r.err);
    const j = JSON.parse(grain(['oracle', 'score', join(out, 'demo'), '--json']).out);
    assert.equal(j.types.recall.hit, 2, 'the same number with the repository gone — the record IS the measurement');
    assert.equal(j.nodes.recall.hit, 2);
  } finally { renameSync(moved, repo); }
});

test('score refuses a directory that holds no record, and says what to do instead', () => {
  const r = grain(['oracle', 'score', tmp]);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /no recorded oracle|holds no oracle\.json/);
  assert.match(r.err, /record/);
});

// ---------- 4. the correction ----------
test('a merge is recorded as a merge', () => {
  const r = grain(['oracle', 'record', '--repo', repo, '--proposal', prop, '--graph', join(tmp, 'merged'), '--name', 'merged', '--out', out, '--yes']);
  assert.equal(r.code, 0, r.err);
  const c = JSON.parse(readFileSync(join(out, 'merged', 'correction.json'), 'utf8'));
  assert.equal(c.schema, 'grain-correction/1');
  assert.equal(c.nodes.counts.merged, 1, JSON.stringify(c.nodes.counts));
  const m = c.nodes.merged[0];
  assert.equal(m.accepted, 'everything');
  assert.ok(m.from.length >= 2, 'the two proposed nodes the adopter folded into one');
  assert.match(r.out, /1 merged/);
});

test('a split is recorded as a split', () => {
  const r = grain(['oracle', 'record', '--repo', repo, '--proposal', prop, '--graph', join(tmp, 'split'), '--name', 'split', '--out', out, '--yes']);
  assert.equal(r.code, 0, r.err);
  const c = JSON.parse(readFileSync(join(out, 'split', 'correction.json'), 'utf8'));
  const s = c.nodes.split.find(x => x.into.includes('api-front') && x.into.includes('api-back'));
  assert.ok(s, `expected the proposed node over src/api/ to be recorded as split, got ${JSON.stringify(c.nodes)}`);
  assert.equal(c.nodes.counts.split, 1);
  // and the score reads each half against the whole the proposal drew: exactly 3 of 6, J = 0.5, which is ON the
  // bar and counts as a hit — the same arithmetic `reconstruct.test.mjs` pins for one module holding two hand
  // types. The split is visible in the correction, not in the hit count, and that is the honest reading of it.
  const j = JSON.parse(grain(['oracle', 'score', join(out, 'split'), '--json']).out);
  assert.equal(j.nodes.recall.n, 3);
  assert.equal(j.nodes.recall.rows.find(x => x.id === 'api-front').best, 0.5);
  assert.equal(j.nodes.recall.rows.find(x => x.id === 'api-back').best, 0.5);
});

test('a graph directory with no .yggdrasil/ is refused with what it needed instead', () => {
  const r = grain(['oracle', 'record', '--repo', repo, '--proposal', join(tmp, 'nope'), '--out', out]);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /no \.yggdrasil\//);
  assert.match(r.err, /grain propose/);
});

test('an unknown subcommand names the two that exist', () => {
  const r = grain(['oracle', 'publish']);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /oracle record/);
  assert.match(r.err, /oracle score/);
});
