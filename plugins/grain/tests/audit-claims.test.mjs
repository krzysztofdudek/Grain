// Tests for the claim auditor (loop v2, instrument A): tests/stress/audit-claims.mjs.
//
// Two kinds of coverage:
//   1. End-to-end, against real `grain` output over a tiny planted-fabrication git repo (the catch/finally
//      scope-naming quirk and an undisclosed no-grammar extension, plus a THIRD site — `extends ns.Member`,
//      a member-expression heritage shape, the same class as §049's constructor-arg bug — that is now a
//      NO-FALSE-POSITIVE case: it found §062 (the qualified-heritage bug this instrument itself flagged) and
//      is kept here, inverted, as its regression guard) and, separately, against the SAME clean fixture the
//      rest of the suite uses (tests/fixtures/build-fixture.mjs) — real, in-repo heritage (extends
//      BaseService/BaseDto, implements CanActivate) must NOT be flagged.
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

  // `extends ns.Member` (a namespace-qualified base, e.g. `extends ethers.AbstractSigner` in openzeppelin-contracts'
  // test/helpers/signers.js) USED TO record the NAMESPACE (`lib`), not the member (`Base1`), as the supertype —
  // the heritage-identifier scan (core.mjs extractScopes) matched node types identifier/type_identifier/… but
  // never property_identifier, so a member_expression's object was picked up and its property never was. Same
  // failure class as §049 (wrong identifier out of a compound heritage clause); §062 fixed this shape too (a
  // qualified/member heritage node now resolves to its LAST name-shaped child, structurally, for every grammar
  // that has the shape). This fixture is kept as §062's own regression guard: it must go on producing NO
  // `heritageTargetReal` fabrication for these three classes, now that `Base1` — not `lib` — is what grain
  // actually records. Needs an actual `import` (not a same-file local binding) to reproduce the ORIGINAL bug —
  // a locally-declared object was observed not to trigger it — so the fixture keeps that shape even though it
  // is no longer load-bearing for this test's assertion. grain only records a marker once >=3 scopes carry it
  // (core.mjs `learn`), so three planted classes exercises it rather than approximating it. The import target's
  // file basename must NOT equal the namespace identifier, or this harness's own import-target allowance (a
  // bare name matching an imported module's basename is treated as external/legitimate) would coincidentally
  // clear `lib` for the wrong reason — moot post-fix, but left intact so the fixture still reproduces the
  // pre-062 failure verbatim if ever needed for comparison.
  w('src/nsmod.js', 'export const lib = { Base1: class {} };\n');
  w('src/heritage.js', [
    "import { lib } from './nsmod.js';",
    '',
    'export class Foo1 extends lib.Base1 { run() { return 1; } }',
    'export class Foo2 extends lib.Base1 { run() { return 2; } }',
    'export class Foo3 extends lib.Base1 { run() { return 3; } }',
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

test('end-to-end (§062 regression guard): `extends lib.Base1` is checked and produces NO fabrication naming `lib`', () => {
  // Pre-§062, grain recorded the NAMESPACE (`lib`) as Foo1/Foo2/Foo3's supertype, and this instrument correctly
  // flagged `lib` as fabricated (undeclared, not import-shaped, not type-shaped). §062 fixed the extraction to
  // record the actual member (`Base1`) instead — so the claim this instrument now checks is `extends Base1`,
  // never `lib`, and `Base1` (PascalCase-shaped, unproven but plausibly external) does not fabricate either.
  const out = runAudit(planted);
  const heritageJs = out.samples.filter(s => s.type === 'heritageTargetReal' && s.file === 'src/heritage.js');
  assert.deepEqual(heritageJs, [], `expected no heritageTargetReal fabrication for src/heritage.js post-§062: ${JSON.stringify(heritageJs)}`);
  assert.ok(!out.samples.some(s => s.type === 'heritageTargetReal' && s.claim.includes('`lib`')),
    'the namespace `lib` must never be the recorded heritage target again — that was exactly the §062 bug');
  assert.ok(out.byType.heritageTargetReal.checked >= 3, 'expected the three lib.Base1 claims to actually be exercised');
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

// §089 — the exact bug the 085 worker's escalation reported: `where --json` used to carry no disclosure text at
// all, so this instrument kept counting a confident-but-DISCLOSED hit as silent fabrication even after `where`'s
// own text answer had already told the reader the real text sits in a file grain cannot read (§057/§085). Now
// that --json carries the identical { kind: 'ungrammared', text } entry the text renderer emits, the SAME
// confident-wrong hit as the red test above must no longer be flagged — this is red BEFORE §089's `disclosed`
// check (proved by the sibling test above, whose mock carries no `disclosures` field) and green after it.
test('noDeclarationsAnywhere: a confident hit that ALSO carries a matching "ungrammared" disclosure is NOT counted as fabrication (§089)', () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'audit-claims-cache-'));
  mkdirSync(join(cacheDir, '.grain', 'cache'), { recursive: true });
  writeFileSync(join(cacheDir, '.grain', 'cache', 'model.json'), JSON.stringify({ filesAll: ['src/a.ts'], pathsAll: ['src/a.ts', 'schema.xml', 'schema2.xml'] }));
  const corpus = { index: new Map([['schemaLocation', new Set(['schema.xml', 'schema2.xml'])]]) };
  try {
    // identical shape to the red test above (a confident hit that does not point at the truth) EXCEPT this
    // response also carries the disclosures[] entry §089 added to `where --json`
    const res = checkNoDeclarationsAnywhere({}, cacheDir, corpus, { whereQueries: 5 }, () => ({
      hits: [{ type: 'file', label: 'src/a.ts', score: 0.8, members: [{ rel: 'src/a.ts' }] }],
      disclosures: [{ kind: 'ungrammared', text: '"schemaLocation" is not a name grain parsed anywhere — that exact text appears in schema.xml, and grain has no grammar for ".xml"' }],
    }));
    assert.equal(res.checked, 1, 'expected the candidate to actually be exercised — disclosure must not skip the check itself');
    assert.equal(res.fabricated, 0, `a disclosed weak/never-parsed answer must not be counted as fabrication: ${JSON.stringify(res)}`);
  } finally { rmSync(cacheDir, { recursive: true, force: true }); }
});

// a disclosure of an UNRELATED kind (not `ungrammared`) must not launder an otherwise-undisclosed confident-wrong
// hit — §089 only suppresses the exact class of caveat that actually applies to this check's own sampling shape
// (candidates that appear ONLY in a no-grammar file), never any disclosure whatsoever.
test('noDeclarationsAnywhere: a disclosure of a DIFFERENT kind does not suppress a genuine, undisclosed fabrication', () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'audit-claims-cache-'));
  mkdirSync(join(cacheDir, '.grain', 'cache'), { recursive: true });
  writeFileSync(join(cacheDir, '.grain', 'cache', 'model.json'), JSON.stringify({ filesAll: ['src/a.ts'], pathsAll: ['src/a.ts', 'schema.xml', 'schema2.xml'] }));
  const corpus = { index: new Map([['schemaLocation', new Set(['schema.xml', 'schema2.xml'])]]) };
  try {
    const res = checkNoDeclarationsAnywhere({}, cacheDir, corpus, { whereQueries: 5 }, () => ({
      hits: [{ type: 'file', label: 'src/a.ts', score: 0.8, members: [{ rel: 'src/a.ts' }] }],
      disclosures: [{ kind: 'weak-answer', text: 'weak match: the best hit covers 31% of the query\'s weight' }],
    }));
    assert.equal(res.fabricated, 1, `an unrelated disclosure kind must not launder a genuine confident-wrong hit: ${JSON.stringify(res)}`);
  } finally { rmSync(cacheDir, { recursive: true, force: true }); }
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
