// THE LEVEL IS PUBLISHED, AND THE CUT IS DERIVED FROM MEASURED NUMBERS (ticket 110).
//
// Ticket 108 measured four hand-written oracles and found no single level of the tree wins: the module level
// recovers most of express, the directory level most of spring-petclinic, the role group most of Yggdrasil and
// of grain itself. So the renderer names the level every candidate came from, publishes the ones it did not
// activate with the same intrinsic numbers, and derives which ones go active from those numbers.
//
// Four things are guarded here, and each has a way of failing silently:
//
//   1. THE INVARIANT. Active types are path prefixes, so any two are nested or disjoint and Yggdrasil's child
//      precedence gives every file exactly one owner. A `content:`-gated type activated by accident would break
//      that with no error anywhere — two types over one directory have no ordering between them.
//   2. THE POLICY'S SECOND DISJUNCT, on a real repository: a directory of files grain parsed NONE of becomes a
//      type of its own. This is where most of the recovered recall is, and it is invisible to every other level
//      because grain publishes a directory card only where it mined scopes.
//   3. THE PUBLICATION. Every alternative carries its level and its intrinsic numbers, in `alternatives.md`
//      grouped by level and in `proposal.json` as a row of the audit trail — a maintainer choosing a different
//      level per subtree needs the same numbers for the cut that was offered as for the cut that was made.
//   4. THE FLOOR. With the corpus clones available, type recall against the express and spring-petclinic
//      oracles does not fall below what ticket 110 measured. Those numbers are a FLOOR, not a target.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPE_LEVELS, typeEvidence, levelSentence } from '../engine/propose.mjs';
import { scoreProposal, propose as runPropose } from './stress/propose.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROPOSE = join(here, 'stress', 'propose.mjs');
const ORACLES = join(here, 'stress', 'oracles');

let tmp, repo, out, env, sidecar, alternativesMd, proposalMd;

// A fixture with both shapes the policy is about: `src/main/java/app/**` is code grain parses and partitions,
// and `src/main/resources/**` holds files it has no grammar for at all — the shape spring-petclinic has, which
// is where ticket 108 found 9 of that repository's 28 hand types living at a level nothing published.
const PKGS = ['owner', 'vet', 'visit', 'clinic', 'system'];
const KINDS = ['Service', 'Repository', 'Controller', 'Validator', 'Mapper'];
const cap = s => s[0].toUpperCase() + s.slice(1);

function buildFixture(root) {
  mkdirSync(root, { recursive: true });
  const w = (rel, content) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
  for (const p of PKGS) for (const k of KINDS) {
    // ONE ROLE SPANS EVERY PACKAGE AND CARRIES ITS OWN MARKER. The repository role is deliberately not a
    // directory: its members sit one per package, so no path predicate can select them and the candidate can
    // only ever be offered at the `role group` level. That matters for what this fixture has to keep proving —
    // see the grouping test below.
    w(`src/main/java/app/${p}/${cap(p)}${k}.java`, k === 'Repository'
      ? `package app.${p};\n\nimport java.util.List;\n\npublic class ${cap(p)}${k} extends BaseRepository {\n` +
        `  @Transactional\n  public List<String> findAll() {\n    return List.of("${p}");\n  }\n` +
        `  @Transactional\n  public String findOne(String id) {\n    return id;\n  }\n}\n`
      : `package app.${p};\n\nimport java.util.List;\n\npublic class ${cap(p)}${k} {\n` +
        `  public List<String> all() {\n    return List.of("${p}");\n  }\n` +
        `  public String one() {\n    return "${p}";\n  }\n}\n`);
  }
  // the directories grain parses NONE of, under one it does
  for (const n of ['index', 'detail', 'list', 'error', 'owners']) w(`src/main/resources/templates/${n}.html`, `<!doctype html>\n<h1>${n}</h1>\n`);
  for (const n of ['en', 'de', 'fr', 'pt']) w(`src/main/resources/messages/messages_${n}.properties`, `welcome=hello ${n}\n`);
  w('README.md', '# fixture\n');
  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', root, 'add', '-A'], { env });
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture'], { env });
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'propose-levels-'));
  repo = join(tmp, 'repo');
  out = join(tmp, 'proposal');
  env = {
    ...process.env, HOME: tmp,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
    GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
  };
  buildFixture(repo);
  const r = spawnSync('node', [PROPOSE, repo, out, '--no-history', '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 28, env });
  assert.equal(r.status, 0, r.stderr);
  sidecar = JSON.parse(readFileSync(join(out, 'proposal.json'), 'utf8'));
  alternativesMd = readFileSync(join(out, 'alternatives.md'), 'utf8');
  proposalMd = readFileSync(join(out, 'PROPOSAL.md'), 'utf8');
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

const typeRows = () => sidecar.evidence.filter(r => r.kind === 'type' && r.level !== 'organizational');
const altRows = () => sidecar.evidence.filter(r => r.kind === 'alternative');

// ---------------------------------------------------------------------------- 1. the invariant

test('every active type is cut at a named level, and the two organizational types say so', () => {
  for (const r of typeRows()) assert.ok(TYPE_LEVELS.includes(r.level), `type ${r.id} carries level "${r.level}", which is not one of ${TYPE_LEVELS.join(', ')}`);
  assert.deepEqual(sidecar.evidence.filter(r => r.kind === 'type' && r.level === 'organizational').map(r => r.id).sort(), ['module', 'project']);
});

test('`role group` is never an active level — a content-gated type would leave a file with two owners', () => {
  assert.ok(!typeRows().some(r => r.level === 'role group'));
  assert.ok(!Object.keys(sidecar.counts.typesByLevel).includes('role group'));
});

test('the active cut owns every classified file exactly once, deepest type winning', () => {
  const files = execFileSync('git', ['-C', repo, 'ls-files', '-z'], { encoding: 'utf8', env }).split('\0').filter(Boolean);
  const dirs = typeRows().map(r => r.dir).filter(Boolean);
  // laminar by construction: any two path prefixes are nested or disjoint, and that is what makes "deepest
  // wins" a function rather than a preference
  for (const a of dirs) for (const b of dirs) {
    if (a === b) continue;
    const nested = a.startsWith(b + '/') || b.startsWith(a + '/');
    const disjoint = !nested;
    assert.ok(nested || disjoint);
  }
  const owner = new Map();
  for (const r of [...typeRows()].filter(x => x.dir).sort((x, y) => x.dir.split('/').length - y.dir.split('/').length)) {
    for (const f of files) if (f === r.dir || f.startsWith(r.dir + '/')) owner.set(f, r.id);
  }
  const unowned = files.filter(f => !owner.has(f) && f.includes('/'));
  assert.deepEqual(unowned, [], 'a tracked file under a directory that no active type claims');
  assert.equal(new Set(owner.values()).size <= typeRows().length, true);
});

test('a finer cut that wraps types already covering everything is not made at all', async () => {
  // The failure this guards: a candidate that is not finer than anything. With no active type ABOVE it and no
  // file of its own, it is a WRAPPER over directories that were already classified — a node that owns nothing
  // once its children take their files, which no rule can attach to and no charter can describe. It appears on
  // a repository grain mined NOTHING in: with no partitions, every directory reads as unparsed and the "grain
  // read none of these files" half of the policy has no contrast to fire against, so it fired on the top of the
  // tree. Driven at the unit that decides, with the exact inputs that shape produces.
  const { buildTypes } = await import('./stress/propose.mjs');
  const files = ['src/api/a.ts', 'src/api/b.ts', 'src/api/c.ts', 'src/util/a.ts', 'src/util/b.ts', 'src/util/c.ts', 'README.md'];
  const exp = { partitions: [], moduleGraph: { nodes: [{ id: 'src/api', files: 3, layer: 0 }, { id: 'src/util', files: 3, layer: 0 }] } };
  const loc = { partitions: [], directories: [], groups: [] };
  const ctx = { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set(), parsed: new Set(files) };
  const { active } = buildTypes(exp, loc, files, ctx);
  const dirs = active.map(a => a.dir).filter(Boolean).sort();
  assert.deepEqual(dirs, ['src/api', 'src/util'], 'a type was cut over directories two other types already cover entirely');
  // And the case that MUST still be made, which is the same shape with the contrast present: a directory of
  // files grain read none of, no active type above it, holding files nothing else claims — spring-petclinic's
  // `src/main/scss`, which recovers a hand type of its own.
  const files2 = [...files, 'src/scss/one.scss', 'src/scss/two.scss', 'src/scss/three.scss'];
  const part = { name: 'src/api', files: 3, scopes: 6, kind: 'source', groups: [], directories: [] };
  const loc2 = { partitions: [{ level: 'partition', name: 'src/api', part, files: new Set(files.slice(0, 3)) }], directories: [], groups: [] };
  const exp2 = { ...exp, partitions: [part] };
  const ctx2 = { ...ctx, pathCache: new Map(), parsed: new Set(files2) };
  const r2 = buildTypes(exp2, loc2, files2, ctx2);
  assert.ok(r2.active.some(a => a.dir === 'src/scss'), `\`src/scss\` brings three files nothing else claims and was dropped: ${r2.active.map(a => a.dir).join(', ')}`);
});

// ---------------------------------------------------------------------------- 2. the policy

test('a directory whose files grain parsed none of becomes a type of its own, at the layout level', () => {
  const t = typeRows().find(r => r.dir === 'src/main/resources');
  assert.ok(t, `no type for src/main/resources among ${typeRows().map(r => r.dir).join(', ')}`);
  assert.equal(t.level, 'layout');
  assert.equal(t.intrinsic.mined, 0, 'the whole point: grain read none of these files');
  assert.equal(t.intrinsic.files, 9);
  assert.match(t.evidence, /grain parsed none of them/);
  // and the level above it, which grain DID read, still ships — both cuts classify
  assert.ok(typeRows().some(r => r.dir === 'src/main'), 'the level above was dropped when the finer one was cut');
  // the cut does not run away down the tree: once an unread directory is a type, its own unread children are
  // not carved out of it again, because their parent is no longer a place grain could read
  assert.ok(!typeRows().some(r => r.dir === 'src/main/resources/templates'), 'the finer cut ran away down the tree');
});

test('every active type carries the intrinsic numbers, and the evidence line states them with the level', () => {
  for (const r of typeRows()) {
    assert.ok(r.intrinsic, `type ${r.id} carries no intrinsic evidence`);
    for (const k of ['files', 'importsInside', 'importsCrossing', 'cochangeInside', 'cochangeCrossing', 'nameShape', 'nameShapeFiles', 'mined', 'rules']) {
      assert.ok(k in r.intrinsic, `type ${r.id} is missing intrinsic.${k}`);
    }
    assert.match(r.evidence, new RegExp(`cut at the ${r.levels[0]} level`), `type ${r.id}: ${r.evidence}`);
    assert.match(r.evidence, /mined rules? could attach here|mined rule could attach here/);
  }
});

test('the import boundary is reported as a match and a miss, never as a coefficient', () => {
  for (const r of typeRows()) {
    const touching = r.intrinsic.importsInside + r.intrinsic.importsCrossing;
    assert.match(r.evidence, touching
      ? new RegExp(`${r.intrinsic.importsInside} of ${touching} imports? that touch it stay inside`)
      : /no resolved import touches it in either direction/, `type ${r.id}: ${r.evidence}`);
    // never a ratio: 0.62 is not a fact a maintainer can act on, "3 of 5 stay inside" is
    assert.ok(!/purity|boundary purity 0\./.test(r.evidence), `type ${r.id} reports a coefficient: ${r.evidence}`);
  }
});

// ---------------------------------------------------------------------------- 3. the publication

test('counts split types and alternatives by level, and each split sums to its own total', () => {
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  assert.equal(sum(sidecar.counts.typesByLevel), sidecar.counts.types);
  assert.equal(sum(sidecar.counts.alternativesByLevel), sidecar.counts.alternatives);
  for (const l of Object.keys(sidecar.counts.typesByLevel)) assert.ok(TYPE_LEVELS.includes(l), l);
  for (const l of Object.keys(sidecar.counts.alternativesByLevel)) assert.ok(TYPE_LEVELS.includes(l), l);
});

test('every alternative is a row of the audit trail, with its level and the same intrinsic numbers', () => {
  assert.equal(altRows().length, sidecar.counts.alternatives);
  for (const r of altRows()) {
    assert.ok(TYPE_LEVELS.includes(r.level), `alternative ${r.id} carries level "${r.level}"`);
    assert.ok(['content', 'path', 'list'].includes(r.form), `alternative ${r.id} carries form "${r.form}"`);
    assert.ok(r.of, `alternative ${r.id} names no host type`);
    assert.ok(r.intrinsic && typeof r.intrinsic.files === 'number', `alternative ${r.id} carries no intrinsic evidence`);
    assert.match(r.evidence, /cut at the .+ level:/);
  }
});

test('alternatives.md is grouped by level and every group carries the intrinsic columns', () => {
  // The fixture must actually OFFER something, or this asserts nothing. It is built to keep doing so under a
  // finer cut of the code: the repository role spans every package, so it is not a place in the layout and can
  // only ever be a `role group` candidate — the one level that is alternatives-only by construction. An earlier
  // version of this fixture offered five per-package domain candidates instead, and ticket 113's Java package
  // module cut promoted every one of them to an active type, leaving this file empty and the assertion vacuous.
  assert.ok(sidecar.counts.alternatives > 0, 'the fixture offers no alternatives, so this test proves nothing');
  assert.ok(sidecar.counts.alternativesByLevel['role group'] > 0,
    `the durable level is gone; alternatives are now ${JSON.stringify(sidecar.counts.alternativesByLevel)}`);
  const levels = [...alternativesMd.matchAll(/^## Level: (.+?) \((\d+)\)$/gm)].map(m => [m[1], Number(m[2])]);
  assert.ok(levels.length > 0, 'alternatives.md is not grouped by level');
  const seen = Object.fromEntries(levels);
  for (const [l, n] of Object.entries(sidecar.counts.alternativesByLevel)) assert.equal(seen[l], n, `level ${l}`);
  const cols = ['candidate', 'of', 'form', 'group files', 'selects', 'J', 'viable', 'imports inside', 'grain read', 'rules', 'evidence'];
  assert.match(alternativesMd, new RegExp('^\\|' + cols.map(c => `\\s*${c.replace(' ', '\\s')}\\s*\\|`).join('') + '$', 'm'), 'the level tables lost a column');
  // the two-column head every consumer of this file already parses is unchanged
  for (const r of altRows()) assert.ok(alternativesMd.includes(`### \`${r.id}\``), `no predicate block for ${r.id}`);
});

test('PROPOSAL.md prints the level of every type and the per-level tally', () => {
  assert.match(proposalMd, /^\|\s*type\s*\|\s*level\s*\|\s*levels agreeing\s*\|/m);
  assert.match(proposalMd, /^\|\s*level\s*\|\s*active types\s*\|\s*candidates offered\s*\|/m);
  for (const [l, n] of Object.entries(sidecar.counts.typesByLevel)) {
    assert.match(proposalMd, new RegExp(`^\\|\\s*${l}\\s*\\|\\s*${n}\\s*\\|`, 'm'), `no tally row for level ${l}`);
  }
});

// ---------------------------------------------------------------------------- the unit under all of it

test('typeEvidence counts a boundary as a match and a miss, and reports no purity where nothing crosses', () => {
  const ctx = {
    edges: [{ from: 'a/one.ts', to: 'a/two.ts', n: 3 }, { from: 'a/one.ts', to: 'b/x.ts', n: 1 }, { from: 'c/y.ts', to: 'c/z.ts', n: 9 }],
    cochange: [{ a: 'a/one.ts', b: 'a/two.ts' }, { a: 'a/one.ts', b: 'b/x.ts' }],
    mined: new Set(['a/one.ts', 'a/two.ts']),
    ruleSites: [new Set(['a/one.ts', 'a/two.ts']), new Set(['a/one.ts', 'b/x.ts'])],
  };
  const m = typeEvidence(new Set(['a/one.ts', 'a/two.ts', 'a/note.md']), ctx);
  assert.equal(m.files, 3);
  assert.equal(m.importsInside, 3);
  assert.equal(m.importsCrossing, 1);
  assert.equal(m.cochangeInside, 1);
  assert.equal(m.cochangeCrossing, 1);
  assert.equal(m.mined, 2);
  assert.equal(m.rules, 1, 'only the rule whose every site is inside the set could attach here');
  assert.equal(m.nameShape, 'a.a');
  assert.equal(m.nameShapeFiles, 3);
  const none = typeEvidence(new Set(['d/p.html', 'd/q.html']), ctx);
  assert.equal(none.importsInside + none.importsCrossing, 0);
  assert.match(levelSentence({ source: 'layout', levels: ['layout'], evidence: none }), /no resolved import touches it in either direction/);
});

test('levelSentence names every level that agreed on the same directory', () => {
  const m = typeEvidence(new Set(['a/one.ts']), { edges: [], cochange: [], mined: new Set(['a/one.ts']), ruleSites: [] });
  const s = levelSentence({ source: 'partition', levels: ['partition', 'module', 'directory'], evidence: m });
  assert.match(s, /^cut at the partition level, and the module and directory levels name the same directory: /);
  const one = levelSentence({ source: 'module', levels: ['module', 'directory'], evidence: m });
  assert.match(one, /^cut at the module level, and the directory level names the same directory: /);
});

// ---------------------------------------------------------------------------- 4. the measured floor

// The numbers ticket 110 measured with this policy, on the exact commits the oracles were written against.
// They are a FLOOR, not a target: a change that recovers MORE hand types passes, one that recovers fewer is a
// regression in the thing this ticket exists to move. Recorded alongside what the policy replaced, so a reader
// of a failure knows how much headroom there was.
const RECALL_FLOOR = {
  express: { oracle: 'express', clone: 'express', handTypes: 13, recall: 7, before: 6 },
  'spring-petclinic': { oracle: 'spring-petclinic', clone: 'spring-petclinic', handTypes: 28, recall: 6, before: 2 },
};
const CLONES = process.env.GRAIN_CORPUS_CLONES;

function stageClone(src, dst) {
  mkdirSync(dst, { recursive: true });
  const tar = spawnSync('sh', ['-c', `git -C '${src}' archive HEAD | tar -x -C '${dst}'`], { encoding: 'utf8' });
  assert.equal(tar.status, 0, tar.stderr);
  execFileSync('git', ['-C', dst, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', dst, 'add', '-A'], { env });
  execFileSync('git', ['-C', dst, 'commit', '-q', '-m', 'staged clone'], { env });
}

for (const [name, F] of Object.entries(RECALL_FLOOR)) {
  test(`type recall against the ${name} oracle does not fall below the measured floor`, { skip: CLONES ? false : 'GRAIN_CORPUS_CLONES is not set — the corpus clones are not in this repository' }, async () => {
    const clone = join(CLONES, F.clone);
    if (!existsSync(join(clone, '.git'))) { assert.ok(true, `skipped: no clone at ${clone}`); return; }
    const target = join(tmp, `clone-${name}`);
    const outDir = join(tmp, `prop-${name}`);
    stageClone(clone, target);
    // A DELIBERATELY UNRESOLVABLE `ygBin`: a drill measures whether a CHECK is right, and this test measures
    // where the CUT fell. Passing null would fall back to `YG_BIN` from the environment and spend minutes
    // drilling every draft for a number this test never reads.
    const r = await runPropose(target, outDir, { noHistory: true, quiet: true, ygBin: join(tmp, 'no-yggdrasil-here') });
    const s = scoreProposal(join(ORACLES, F.oracle), outDir, r.files, target);
    assert.equal(s.types.recall.n, F.handTypes, 'the oracle denominator moved — the floor below is measured against a different graph');
    assert.ok(s.types.recall.hit >= F.recall,
      `type recall fell to ${s.types.recall.hit}/${s.types.recall.n}; ticket 110 measured ${F.recall}/${F.handTypes} with this policy (${F.before}/${F.handTypes} before it)`);
  });
}
