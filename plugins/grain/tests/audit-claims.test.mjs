// Tests for the claim auditor (loop v2, instrument A): tests/stress/audit-claims.mjs.
//
// Two kinds of coverage:
//   1. End-to-end, against real `grain` output over a tiny planted-fabrication git repo (§049's constructor-arg
//      heritage bug, the catch/finally scope-naming quirk, and an undisclosed no-grammar extension) and, separately,
//      against the SAME clean fixture the rest of the suite uses (tests/fixtures/build-fixture.mjs) — real,
//      in-repo heritage (extends BaseService/BaseDto, implements CanActivate) must NOT be flagged.
//   2. Direct unit tests of the exported check functions for the three claim types real-engine reproduction can't
//      make deterministic on demand (a genuine macro-token-as-name mis-extraction, an over-claimed carrier count,
//      a `where` answer that silently stands in for a no-grammar file) — each with a matching clean/no-false-
//      positive case.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMacroTokenAsName, checkUsedByFileCount, checkNoDeclarationsAnywhere, collectSites } from './stress/audit-claims.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const AUDIT = join(here, 'stress', 'audit-claims.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');

function runAudit(repo, extraArgs = []) {
  const r = spawnSync('node', [AUDIT, repo, '--top-samples', '500', ...extraArgs], { encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
  const nl = r.stdout.indexOf('\n');
  return JSON.parse(r.stdout.slice(nl + 1));
}

// ---------- fixture 1: a planted fabrication of each end-to-end-reproducible type ----------
let tmp1, planted;
before(() => {
  tmp1 = mkdtempSync(join(tmpdir(), 'audit-claims-planted-'));
  planted = join(tmp1, 'repo');
  mkdirSync(planted, { recursive: true });
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z', HOME: tmp1 };
  const git = (...args) => execFileSync('git', ['-C', planted, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const w = (rel, content) => { const p = join(planted, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };

  // §049 shape: `extends Baz(cc)` grabs the constructor ARGUMENT `cc`, not the type `Baz`, as the supertype.
  // grain only records a marker (and so only exposes it as an auditable site) once ≥3 scopes carry it (core.mjs
  // `learn`: "markers: every decorator / supertype / declared return type with ≥ 3 carriers") — the real playframework
  // finding was many controllers sharing this exact shape, so three planted classes reproduces it rather than
  // approximating it.
  w('src/heritage.scala', [
    'package demo',
    '',
    'trait Bar',
    'class Baz(x: Bar)',
    '',
    'class Foo1(cc: Bar) extends Baz(cc) { def run(): Unit = () }',
    'class Foo2(cc: Bar) extends Baz(cc) { def run(): Unit = () }',
    'class Foo3(cc: Bar) extends Baz(cc) { def run(): Unit = () }',
    '',
  ].join('\n'));

  // a `catch` block is a real scope in grain's model, but it is displayed under the ENCLOSING method's name — so
  // "`catch` `doWork` declared here" is a claim about a location that never declares anything called `doWork`
  // (the real `doWork` declaration is several lines above the catch clause, not within its span). Grain only
  // exposes a scope as a site once it clusters with others into a role/group, so three near-identical shapes
  // (matching how it actually showed up in real repos: every catch in the corpus, not a lone one).
  for (const i of [1, 2, 3]) w(`src/Thrower${i}.java`, [
    `public class Thrower${i} {`,
    '  public void doWork() {',
    '    try {',
    '      risky();',
    '    } catch (Exception e) {',
    '      System.out.println("failed");',
    '    } finally {',
    '      System.out.println("done");',
    '    }',
    '  }',
    '  private void risky() throws Exception {}',
    '}',
    '',
  ].join('\n'));

  // an extension with no grammar at all (model.filesAll excludes it by construction) — the coverage note can
  // never mention it, so it is always an undisclosed gap once any such file exists. Three of them: the default
  // --coverage-min floor (3) exists so a single incidental non-code file doesn't read as a finding on its own.
  w('docs/notes.xml', '<notes><entry>hello</entry></notes>\n');
  w('docs/notes2.xml', '<notes><entry>world</entry></notes>\n');
  w('docs/notes3.xml', '<notes><entry>again</entry></notes>\n');

  // filler: grain merges any package under 100 scopes into a shared bucket, and drops that bucket entirely
  // (zero partitions, nothing queryable) below a 30-scope floor (core.mjs groupPartitions) — a two-class fixture
  // never crosses it. This is bulk, not signal: pad well past the floor so the two planted files above land in a
  // real partition.
  for (let i = 0; i < 20; i++) w(`src/filler/Filler${i}.scala`, `package demo.filler\n\nclass Filler${i} {\n  def value(): Int = ${i}\n  def doubled(): Int = value() * 2\n}\n`);

  git('init', '-q', '-b', 'main');
  git('config', 'commit.gpgsign', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'planted fabrications');
});
after(() => { rmSync(tmp1, { recursive: true, force: true }); });

test('end-to-end: the §049 constructor-argument-as-supertype fabrication is caught', () => {
  const out = runAudit(planted);
  assert.ok(out.byType.heritageTargetReal.fabricated >= 1, JSON.stringify(out.byType.heritageTargetReal));
  const sample = out.samples.find(s => s.type === 'heritageTargetReal' && s.claim.includes('`cc`'));
  assert.ok(sample, `expected a heritageTargetReal sample naming \`cc\`: ${JSON.stringify(out.samples)}`);
  assert.equal(sample.file, 'src/heritage.scala');
  assert.match(sample.detail, /§049 shape/);
});

test('end-to-end: a catch/finally scope claiming the enclosing method\'s name at its own line is caught', () => {
  const out = runAudit(planted);
  assert.ok(out.byType.declaredAtLine.fabricated >= 1, JSON.stringify(out.byType.declaredAtLine));
  const sample = out.samples.find(s => s.type === 'declaredAtLine' && /^src\/Thrower\d\.java$/.test(s.file));
  assert.ok(sample, `expected a declaredAtLine sample in a Thrower*.java: ${JSON.stringify(out.samples)}`);
  assert.match(sample.claim, /^(catch|finally) `doWork` declared here$/);
});

test('end-to-end: an undisclosed no-grammar extension is caught', () => {
  const out = runAudit(planted);
  assert.ok(out.byType.resolutionCoverage.fabricated >= 1, JSON.stringify(out.byType.resolutionCoverage));
  const sample = out.samples.find(s => s.type === 'resolutionCoverage' && s.detail.includes('.xml'));
  assert.ok(sample, `expected a resolutionCoverage sample for .xml: ${JSON.stringify(out.samples)}`);
  assert.match(sample.detail, /no grammar at all/);
});

// ---------- fixture 2: the suite's shared clean fixture — real heritage must not be flagged ----------
let tmp2, clean;
before(() => { tmp2 = mkdtempSync(join(tmpdir(), 'audit-claims-clean-')); clean = join(tmp2, 'fixture'); execFileSync('node', [BUILDER, clean], { stdio: 'pipe' }); });
after(() => { rmSync(tmp2, { recursive: true, force: true }); });

test('end-to-end: the shared clean fixture (real `extends BaseService`/`implements CanActivate`/`extends BaseDto`) produces zero fabrications', () => {
  const out = runAudit(clean);
  assert.equal(out.fabricated, 0, JSON.stringify(out, null, 1));
  // a meaningful number of claims were actually exercised — this must not be a silent no-op
  assert.ok(out.checked >= 20, `too few claims checked to mean anything: ${out.checked}`);
  assert.ok(out.byType.heritageTargetReal.checked >= 3, 'expected real heritage claims to be exercised (BaseService/CanActivate/BaseDto)');
  assert.equal(out.byType.heritageTargetReal.fabricated, 0);
});

// ---------- unit tests: claim types real-engine reproduction can't make deterministic on demand ----------

test('macroTokenAsName: a macro token before the real type name on the same line is caught', () => {
  const corpus = { text: new Map([['include/comparator.h', 'class LEVELDB_EXPORT Comparator {']]) };
  const sites = [{ rel: 'include/comparator.h', kind: 'type', name: 'LEVELDB_EXPORT', line: 1, endLine: 1, sources: new Set(['group']) }];
  const res = checkMacroTokenAsName(sites, corpus);
  assert.equal(res.fabricated, 1, JSON.stringify(res));
  assert.match(res.samples[0].detail, /Comparator/);
});

test('macroTokenAsName: no false positive on a real SHOUTY_SNAKE_CASE name with no other candidate on the line', () => {
  const corpus = { text: new Map([['a.h', 'class MY_CONST_TYPE {']]) };
  const sites = [{ rel: 'a.h', kind: 'type', name: 'MY_CONST_TYPE', line: 1, endLine: 1, sources: new Set(['group']) }];
  const res = checkMacroTokenAsName(sites, corpus);
  assert.equal(res.fabricated, 0, JSON.stringify(res));
});

test('macroTokenAsName: no false positive on a real all-caps-and-digits interface with a heritage list on the same line', () => {
  // `IERC4626` matches no macro shape (no underscore) so this is filtered before the heritage-list ever matters,
  // but it is exactly the shape (multiple real identifiers after the keyword) that a naive scanner would trip on.
  const corpus = { text: new Map([['I.sol', 'interface IERC4626 is IERC20, IERC20Metadata {']]) };
  const sites = [{ rel: 'I.sol', kind: 'type', name: 'IERC4626', line: 1, endLine: 1, sources: new Set(['group']) }];
  const res = checkMacroTokenAsName(sites, corpus);
  assert.equal(res.checked, 0, 'IERC4626 has no underscore — it should never even be treated as macro-shaped');
});

test('usedByFileCount: a claimed carrier count that exceeds the corpus-wide mention count is caught', () => {
  const model = { partitions: [{ markers: [{ type: 'supertype', name: 'Widget', carriers: [{ rel: 'a.ts' }, { rel: 'b.ts' }, { rel: 'c.ts' }] }] }] };
  const corpus = { index: new Map([['Widget', new Set(['a.ts'])]]) }; // only 1 file actually mentions it, 3 are claimed
  const res = checkUsedByFileCount(model, corpus, () => ({ real: true }));
  assert.equal(res.fabricated, 1, JSON.stringify(res));
  assert.match(res.samples[0].detail, /only 1 file/);
});

test('usedByFileCount: no false positive when the claimed count is within the corpus-wide mention count', () => {
  const model = { partitions: [{ markers: [{ type: 'supertype', name: 'Widget', carriers: [{ rel: 'a.ts' }, { rel: 'b.ts' }] }] }] };
  const corpus = { index: new Map([['Widget', new Set(['a.ts', 'b.ts', 'c.ts'])]]) };
  const res = checkUsedByFileCount(model, corpus, () => ({ real: true }));
  assert.equal(res.fabricated, 0, JSON.stringify(res));
});

test('noDeclarationsAnywhere: a confident `where` hit that never mentions the term\'s only (no-grammar) file is caught', (t) => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'audit-claims-cache-'));
  t.after(() => rmSync(cacheDir, { recursive: true, force: true }));
  mkdirSync(join(cacheDir, '.grain', 'cache'), { recursive: true });
  writeFileSync(join(cacheDir, '.grain', 'cache', 'model.json'), JSON.stringify({ filesAll: ['src/a.ts'], pathsAll: ['src/a.ts', 'schema.xml', 'schema2.xml'] }));
  const corpus = { index: new Map([['schemaLocation', new Set(['schema.xml', 'schema2.xml'])]]) }; // ≥2 no-grammar occurrences, per the check's own noise floor
  const res = checkNoDeclarationsAnywhere({}, cacheDir, corpus, { whereQueries: 5 },
    () => ({ hits: [{ type: 'file', label: 'src/a.ts', score: 0.8, members: [{ rel: 'src/a.ts' }] }] }));
  assert.equal(res.fabricated, 1, JSON.stringify(res));
  assert.equal(res.samples[0].file, 'schema.xml');
});

test('noDeclarationsAnywhere: no false positive when the hit correctly points at the no-grammar file', () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'audit-claims-cache-'));
  mkdirSync(join(cacheDir, '.grain', 'cache'), { recursive: true });
  writeFileSync(join(cacheDir, '.grain', 'cache', 'model.json'), JSON.stringify({ filesAll: ['src/a.ts'], pathsAll: ['src/a.ts', 'schema.xml', 'schema2.xml'] }));
  const corpus = { index: new Map([['schemaLocation', new Set(['schema.xml', 'schema2.xml'])]]) };
  try {
    const res = checkNoDeclarationsAnywhere({}, cacheDir, corpus, { whereQueries: 5 },
      () => ({ hits: [{ type: 'file', label: 'schema.xml', score: 0.9, members: [{ rel: 'schema.xml' }] }] }));
    assert.equal(res.checked, 1, 'expected the candidate to actually be exercised');
    assert.equal(res.fabricated, 0, JSON.stringify(res));
  } finally { rmSync(cacheDir, { recursive: true, force: true }); }
});

test('noDeclarationsAnywhere: no false positive when `where` returns no confident hit at all', () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'audit-claims-cache-'));
  mkdirSync(join(cacheDir, '.grain', 'cache'), { recursive: true });
  writeFileSync(join(cacheDir, '.grain', 'cache', 'model.json'), JSON.stringify({ filesAll: ['src/a.ts'], pathsAll: ['src/a.ts', 'schema.xml', 'schema2.xml'] }));
  const corpus = { index: new Map([['schemaLocation', new Set(['schema.xml', 'schema2.xml'])]]) };
  try {
    const res = checkNoDeclarationsAnywhere({}, cacheDir, corpus, { whereQueries: 5 }, () => ({ hits: [] }));
    assert.equal(res.checked, 1, 'expected the candidate to actually be exercised');
    assert.equal(res.fabricated, 0, JSON.stringify(res));
  } finally { rmSync(cacheDir, { recursive: true, force: true }); }
});

test('collectSites: a later (convention) source with a real span widens an earlier (group) source\'s 1-line window', () => {
  const model = {
    partitions: [{ groups: [{ members: [{ rel: 'a.java', kind: 'method', name: 'initCreationForm', line: 72 }] }], markers: [] }],
    conventions: [{ conformingSites: [{ rel: 'a.java', kind: 'method', name: 'initCreationForm', line: 72, endLine: 75 }], deviatingSites: [] }],
  };
  const [site] = collectSites(model, []);
  assert.equal(site.endLine, 75, 'the convention source\'s real endLine must survive the merge, not the group source\'s line-only default');
  assert.ok(site.sources.has('group') && site.sources.has('convention'));
});
