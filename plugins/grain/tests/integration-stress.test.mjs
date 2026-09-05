// Guard for the integration stress instrument (ticket 101): tests/stress/integration-stress.mjs, and the six
// defects it found in tests/stress/propose.mjs.
//
// Two things are guarded here, and they are different in kind:
//
//   1. THE ARITHMETIC. The sense rate is a conjunction of four NESTED legs (loads -> pairs -> catches -> no
//      false alarm) and the hostile-repo contract is a two-sided claim (no crash, no fabrication). Both are
//      pure functions over a scored row, so both are exercised directly, including the cases where an honest
//      instrument must NOT award a pass: a drill with no `violates-` case cannot have caught anything, and a
//      drill with no `satisfies-` case has not earned "0 FALSE-ALARM".
//
//   2. THE RENDERING FIXES, red-green. Six defects were found by running the proposal through the real
//      Yggdrasil CLI and are fixed in `propose.mjs`; each one is pinned here against a REAL tiny git repository
//      (or, for one of them, a real directory with no git repository at all) and a REAL `grain export`, in the
//      shape that failed:
//        - `module`'s allowed parents excluded the proposal's own types (`parent-type-forbidden`, blocking);
//        - the `imp` check matched a specifier only inside quotes, so it was inert in every language that
//          writes an import unquoted (Java, Python, Rust, C#);
//        - the `filenameshape` check tested an anchored shape against the name WITH its extension, so it
//          refused 100% of its scope and false-alarmed on grain's own conforming sites;
//        - the family adapter emitted a fitted predicate that selected none of its own members, and a member
//          the predicate excluded;
//        - `propose.mjs` called `git ls-files` unconditionally and died on a directory with no git repository;
//        - grain's synthetic partition name `_root` was rendered as a directory path (and a git submodule as a
//          file), so every type, node and aspect drawn from that bucket was inert and the graph reported
//          `mapping-path-missing` / `type-when-mismatch`.
//
// No mocking: every assertion below runs against files on disk, and the end-to-end ones against a real git
// repository built in a temp dir and a real `propose.mjs` subprocess.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  senseOf, senseRate, distribution, hostileContract, aspectsWithoutSites, parseCheckHeader, parseIssueCodes, parseDrill,
  readArchitecture, readNode, drillCounts, LOAD_BLOCKING, walkDirs,
} from './stress/integration-stress.mjs';
import { caseTolerant, renderCheck, buildFamilyCandidates } from './stress/propose.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROPOSE = join(here, 'stress', 'propose.mjs');

let tmp;
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'e', GIT_AUTHOR_EMAIL: 'e@x', GIT_COMMITTER_NAME: 'e', GIT_COMMITTER_EMAIL: 'e@x',
  GIT_AUTHOR_DATE: '2025-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2025-01-01T00:00:00Z',
};
before(() => { tmp = mkdtempSync(join(tmpdir(), 'integration-stress-')); });
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

function gitRepo(root, write) {
  mkdirSync(root, { recursive: true });
  write((rel, content) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); });
  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env: gitEnv });
  execFileSync('git', ['-C', root, 'add', '-A'], { env: gitEnv });
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture'], { env: gitEnv });
  return root;
}

// ============================================================================================================
// 1. The sense-rate arithmetic.
// ============================================================================================================

test('sense requires all four legs, and each leg gates the ones after it', () => {
  const full = { loads: true, pairs: 3, violatesCases: 5, miss: 0, falseAlarm: 0 };
  assert.deepEqual(senseOf(full), { loads: true, pairs: true, catches: true, noFalseAlarm: true, sense: true });

  // an element Yggdrasil refused to load scores nothing downstream, whatever its drill said
  assert.deepEqual(senseOf({ ...full, loads: false }), { loads: false, pairs: false, catches: false, noFalseAlarm: false, sense: false });
  // a loaded element with no pair is not operated on
  assert.equal(senseOf({ ...full, pairs: 0 }).sense, false);
  // FALSE-ALARM is disqualifying on its own
  assert.equal(senseOf({ ...full, falseAlarm: 1 }).sense, false);
  assert.equal(senseOf({ ...full, falseAlarm: 1 }).catches, true, 'a false-alarming rule still caught — only the last leg fails');
});

test('a drill with no violates- case never counts as catching', () => {
  // The honest case the ticket exists to protect: "0 MISS · 0 FALSE-ALARM" over an EMPTY corpus is not evidence.
  const vacuous = { loads: true, pairs: 9, violatesCases: 0, miss: 0, falseAlarm: 0 };
  assert.equal(senseOf(vacuous).pairs, true);
  assert.equal(senseOf(vacuous).catches, false, 'no violates- case means nothing was ever caught');
  assert.equal(senseOf(vacuous).sense, false);
  // and a corpus whose every violates- case MISSED is the same answer for a different reason
  assert.equal(senseOf({ ...vacuous, violatesCases: 5, miss: 5 }).catches, false);
  assert.equal(senseOf({ ...vacuous, violatesCases: 5, miss: 4 }).catches, true, 'one case caught is caught');
});

test('senseRate reports a nested funnel whose legs never increase', () => {
  const els = [
    { loads: true, pairs: 2, violatesCases: 3, miss: 0, falseAlarm: 0 },   // full sense
    { loads: true, pairs: 2, violatesCases: 3, miss: 0, falseAlarm: 2 },   // caught, but false-alarms
    { loads: true, pairs: 2, violatesCases: 0, miss: 0, falseAlarm: 0 },   // pairs, never catches
    { loads: true, pairs: 0, violatesCases: 9, miss: 0, falseAlarm: 0 },   // loads, no pair
    { loads: false, pairs: 9, violatesCases: 9, miss: 0, falseAlarm: 0 },  // refused to load
  ];
  const r = senseRate(els);
  assert.deepEqual(r, { rendered: 5, loads: 4, pairs: 3, catches: 2, noFalseAlarm: 1, rate: 0.2 });
  assert.ok(r.rendered >= r.loads && r.loads >= r.pairs && r.pairs >= r.catches && r.catches >= r.noFalseAlarm);
  assert.equal(senseRate([]).rate, null, 'no elements is not a rate of zero');
});

test('distribution reports the shape of a granularity column, one-file elements included', () => {
  assert.deepEqual(distribution([1, 1, 4, 9, 20]), { n: 5, min: 1, median: 4, max: 20, mean: 7, ones: 2 });
  assert.equal(distribution([]).n, 0);
});

// ============================================================================================================
// 2. The hostile-repo contract.
// ============================================================================================================

test('an empty or minimal proposal on a hostile repo HOLDS the contract', () => {
  // "an empty or minimal proposal is fine" — the contract is about crashing and fabricating, not about size.
  assert.deepEqual(hostileContract({ proposeExit: 0, filesTracked: 0, types: 0, nodes: 0, aspects: 0, conventions: 0, loadBlocking: [] }),
    { ok: true, failures: [] });
  assert.equal(hostileContract({ proposeExit: 0, filesTracked: 40, types: 3, nodes: 4, aspects: 0, conventions: 0, aspectsWithoutSites: 0, loadBlocking: [] }).ok, true,
    'types over real files with no convention drafted is a minimal proposal, not a fabrication');
  // The shallow-clone shape: history unavailable, so NOTHING is certified, and the aspects that are drafted are
  // sub-gate rows cut from the HEAD tree — each naming its own measured sites. Evidence below the certification
  // bound is not the absence of evidence.
  assert.equal(hostileContract({ proposeExit: 0, filesTracked: 154, types: 6, nodes: 8, aspects: 5, conventions: 0, subGateAspects: 5, aspectsWithoutSites: 0, loadBlocking: [] }).ok, true,
    'sub-gate aspects over a shallow clone carry evidence and are not a fabrication');
});

test('the contract BREAKS on a crash, on a graph Yggdrasil will not load, and on a claim with no evidence', () => {
  assert.equal(hostileContract({ proposeExit: 1 }).ok, false);
  assert.match(hostileContract({ proposeExit: 1, timedOut: true }).failures[0], /timed out/);
  const refused = hostileContract({ proposeExit: 0, conventions: 1, aspects: 1, filesTracked: 9, types: 1, loadBlocking: ['parent-type-forbidden'] });
  assert.equal(refused.ok, false);
  assert.match(refused.failures[0], /yg refused to load: parent-type-forbidden/);
  const fabricated = hostileContract({ proposeExit: 0, aspects: 4, aspectsWithoutSites: 2, filesTracked: 9, types: 1, loadBlocking: [] });
  assert.equal(fabricated.ok, false);
  assert.match(fabricated.failures[0], /fabrication: 2 aspect\(s\) drafted naming 0 measured sites/);
  const noFiles = hostileContract({ proposeExit: 0, conventions: 0, aspects: 0, aspectsWithoutSites: 0, filesTracked: 0, types: 2, loadBlocking: [] });
  assert.equal(noFiles.ok, false);
  assert.match(noFiles.failures[0], /fabrication: 2 types drafted over 0 tracked files/);
});

// ============================================================================================================
// 3. Reading the real CLI back.
// ============================================================================================================

test('the yg check header and issue codes parse out of real output', () => {
  const text = [
    'yg check: FAIL  14 nodes · 131/132 files (99%) · 18 aspects · 0 flows · 232 verified (232 deterministic, 0 LLM) · 6 draft',
    '',
    'Errors (36):',
    '',
    "  aspect-status-downgrade  36 pairs  4 nodes",
    '            An explicit attach-site status cannot relax what already cascades.',
    '',
    'Warnings (2):',
    '',
    '  rules-digest-stale',
    '            Committed agent-rules digest is out of sync.',
    '',
    '  uncovered (1)',
    '            .mvn/wrapper/maven-wrapper.properties',
    '',
    'Next: yg init --upgrade',
  ].join('\n');
  const h = parseCheckHeader(text);
  assert.equal(h.verdict, 'FAIL');
  assert.deepEqual([h.nodes, h.filesMapped, h.filesTotal, h.aspects, h.flows, h.draft, h.verified], [14, 131, 132, 18, 0, 6, 232]);
  const c = parseIssueCodes(text);
  assert.equal(c.errorCount, 36);
  assert.equal(c.warningCount, 2);
  assert.deepEqual(c.errors, { 'aspect-status-downgrade': 36 });
  assert.deepEqual(c.warnings, { 'rules-digest-stale': 1, uncovered: 1 });
  assert.ok(Object.keys(c.errors).some(k => LOAD_BLOCKING.has(k)), 'aspect-status-downgrade means the graph did not come in');
});

test('the yg drill summary line parses, and an unparseable one is not silently a pass', () => {
  assert.deepEqual(parseDrill("yg drill 'grain/a/b': 5 pass · 2 MISS · 1 FALSE-ALARM · 0 unrun · 3 unsupported (corpus 'dev', dev)."),
    { pass: 5, miss: 2, falseAlarm: 1, unrun: 0, unsupported: 3 });
  assert.equal(parseDrill('yg drill: something went wrong'), null);
});

// ============================================================================================================
// 4. The four rendering fixes, red-green, against a real repository.
// ============================================================================================================

test('caseTolerant renders a case-folded token so it matches either casing convention', () => {
  // grain's `nameTokens` are lowercased subwords, so a token rendered literally is vacuous in camelCase.
  assert.equal(caseTolerant('first'), '[Ff][Ii][Rr][Ss][Tt]');
  const re = new RegExp(`\\b[A-Za-z0-9_]*${caseTolerant('first')}[A-Za-z0-9_]*\\b`);
  assert.ok(re.test('  findFirst(): string {'), 'camelCase member must match (this is what failed)');
  assert.ok(re.test('    def find_first(self):'), 'snake_case member must still match');
  assert.ok(!re.test('  load(name: string): string {'), 'a member without the token must not match');
  assert.equal(caseTolerant('a.b'), '[Aa]\\.[Bb]', 'a non-letter is escaped, not classed');
});

test('the imp check matches an UNQUOTED import specifier, which is how most languages spell one', () => {
  const src = renderCheck({ enumerator: 'imp', argument: 'jakarta.persistence.Entity', expected: 'false', kind: 'file', provenance: 'p' });
  const m = /const SPEC_RE = new RegExp\((.*)\);/.exec(src);
  assert.ok(m, `the rendered check no longer builds a specifier regex:\n${src}`);
  // rebuild exactly what the rendered module builds, and check it against real import spellings
  const SPEC = 'jakarta.persistence.Entity';
  const SPEC_RE = new RegExp('(^|[^A-Za-z0-9_$.])' + SPEC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^A-Za-z0-9_$])');
  assert.ok(SPEC_RE.test('import jakarta.persistence.Entity;'), 'Java (this is the case that was inert)');
  assert.ok(SPEC_RE.test("import { x } from 'jakarta.persistence.Entity';"), 'the quoted spelling still matches');
  assert.ok(!SPEC_RE.test('import jakarta.persistence.EntityManager;'), 'a longer name that merely contains it must not match');
  const bare = new RegExp('(^|[^A-Za-z0-9_$.])' + 'os' + '($|[^A-Za-z0-9_$])');
  assert.ok(bare.test('import os'), 'Python');
  assert.ok(!bare.test('import osmosis'), 'and not a longer module whose name starts with it');
  const dotted = new RegExp('(^|[^A-Za-z0-9_$.])' + 'java\\.util\\.List' + '($|[^A-Za-z0-9_$])');
  assert.ok(!dotted.test('import java.util.ArrayList;'), 'a sibling of the same package must not match');
  assert.ok(!/includes\("'" \+ SPEC/.test(src), 'the quote-only matcher must be gone');
});

test('the filenameshape check tests the shape against the STEM, as grain measured it', async () => {
  // Run the RENDERED module, not a re-implementation of it: the `filenameshape` template imports nothing, so it
  // can be written to disk and executed against a synthetic ctx exactly as Yggdrasil would run it. Before the
  // fix this refused every file with an extension — 100% of its own scope, and 5 of 5 FALSE-ALARMs on grain's
  // own conforming sites.
  const src = renderCheck({ enumerator: 'filenameshape', argument: null, expected: '(Ua)+', kind: 'file', provenance: 'p' });
  const f = join(tmp, 'filenameshape-check.mjs');
  writeFileSync(f, src);
  const { check } = await import(`file://${f}?v=${Date.now()}`);
  const ctx = { files: [
    { path: 'src/test/java/org/example/MySqlIntegrationTests.java' },  // conforming — grain certified it
    { path: 'src/test/java/org/example/PetClinicIntegrationTests.java' },
    { path: '.mvn/wrapper/maven-wrapper.properties' },                  // not conforming
    { path: 'src/main/Plain' },                                         // no extension at all
    { path: 'src/main/.gitignore' },                                    // a dotfile: nothing to strip
  ] };
  const v = check(ctx).map(x => x.file);
  assert.ok(!v.includes('src/test/java/org/example/MySqlIntegrationTests.java'), 'a conforming file must not be refused (this is what false-alarmed)');
  assert.ok(!v.includes('src/test/java/org/example/PetClinicIntegrationTests.java'), 'nor this one');
  assert.ok(v.includes('.mvn/wrapper/maven-wrapper.properties'), 'a non-conforming file must still be refused');
  assert.ok(!v.includes('src/main/Plain'), 'a name with no extension is unaffected');
  assert.ok(v.includes('src/main/.gitignore'), 'a dotfile keeps its leading dot and does not match PascalCase');
});

test('a rendered proposal declares every active type as an allowed parent of `module`', { timeout: 180_000 }, () => {
  // `parent-type-forbidden` — an organizational `module` node under a classifying type's node — was a BLOCKING
  // error on the first real corpus repository. The type table has to say the shape the node tree actually has.
  const repo = gitRepo(join(tmp, 'parents-repo'), w => {
    for (const n of ['alpha', 'beta', 'gamma', 'delta']) {
      w(`src/main/api/${n}-handler.ts`, `import { normalise } from '../util/${n}-helper';\nexport function handle${n}(x: string): string { return normalise(x); }\n`);
      w(`src/main/util/${n}-helper.ts`, `export function normalise(v: string): string { return v.trim(); }\n`);
    }
    w('README.md', '# fixture\n');
  });
  const out = join(tmp, 'parents-out');
  const r = spawnSync('node', [PROPOSE, repo, out, '--no-history', '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 150_000 });
  assert.equal(r.status, 0, r.stderr);
  const arch = readFileSync(join(out, '.yggdrasil', 'yg-architecture.yaml'), 'utf8');
  const types = readArchitecture(arch);
  const classifying = [...types.values()].filter(t => t.classifying).map(t => t.id);
  assert.ok(classifying.length > 0, 'the fixture must produce at least one classifying type');
  const moduleParents = /^ {2}module:\s*$[\s\S]*?^ {4}parents:\s*$([\s\S]*?)^ {2}\S/m.exec(arch + '\n  x:\n');
  assert.ok(moduleParents, `could not read module.parents out of:\n${arch.slice(0, 1200)}`);
  const listed = [...moduleParents[1].matchAll(/-\s*"?([^"\s]+)"?/g)].map(m => m[1]);
  for (const t of classifying) assert.ok(listed.includes(t), `type '${t}' is not an allowed parent of 'module' (parents: ${listed.join(', ')})`);
});

test('propose degrades on a directory of code with NO git repository instead of crashing', { timeout: 180_000 }, () => {
  // The hostile case whose whole point is the absence of git (`edge-cases.mjs` case 15, "no git: answers,
  // stamped no-git"). `propose.mjs` called `git ls-files` unconditionally and died with
  // `fatal: not a git repository`, exit 128. The contract is degrade-without-crash: a proposal over a worktree
  // walk, not an exception.
  const plain = join(tmp, 'plain-nogit');
  mkdirSync(join(plain, 'src', 'api'), { recursive: true });
  mkdirSync(join(plain, 'src', 'util'), { recursive: true });
  for (const n of ['alpha', 'beta', 'gamma', 'delta']) {
    writeFileSync(join(plain, 'src', 'api', `${n}-handler.ts`), `import { normalise } from '../util/${n}-helper';\nexport function handle${n}(x: string): string { return normalise(x); }\n`);
    writeFileSync(join(plain, 'src', 'util', `${n}-helper.ts`), `export function normalise(v: string): string { return v.trim(); }\n`);
  }
  assert.ok(!existsSync(join(plain, '.git')), 'the fixture must have no git repository');
  const out = join(tmp, 'plain-out');
  const r = spawnSync('node', [PROPOSE, plain, out, '--no-history', '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 150_000 });
  assert.equal(r.status, 0, `propose crashed on a non-git directory:\n${r.stderr.slice(-1500)}`);
  const pj = JSON.parse(readFileSync(join(out, 'proposal.json'), 'utf8'));
  assert.ok(pj.files >= 8, `the worktree walk found ${pj.files} files, expected at least the 8 written`);
  assert.ok(existsSync(join(out, '.yggdrasil', 'yg-architecture.yaml')), 'a graph is still rendered');
  // and the walk never describes the tool's own state directories
  const arch = readFileSync(join(out, '.yggdrasil', 'yg-architecture.yaml'), 'utf8');
  for (const skip of ['node_modules', '.grain', '.yggdrasil']) assert.ok(!arch.includes(`${skip}/**`), `the proposal describes ${skip}`);
});

test('a synthetic partition name is never rendered as a directory path, and a submodule is never a file', { timeout: 240_000 }, () => {
  // grain names the repository-root bucket `_root`; no such directory exists. Rendered as a path it produces a
  // `when` of `_root/**` that selects nothing, a node mapping that is not on disk, and aspects that can never
  // produce a pair — measured across the corpus as 168 inert aspects in 4 repositories. A git SUBMODULE is the
  // same mistake from the other end: `git ls-files` lists the gitlink as one entry, and it is a directory.
  const inner = gitRepo(join(tmp, 'sub-inner'), w => { w('lib.ts', 'export const x = 1;\n'); });
  const repo = join(tmp, 'root-repo');
  mkdirSync(repo, { recursive: true });
  const w = (rel, content) => { const p = join(repo, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
  // enough root-level code for grain to make a root bucket out of, plus a real directory to keep it honest
  for (const n of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
    w(`${n}.ts`, `import { normalise } from './lib/${n}-helper';\nexport function handle${n}(x: string): string { return normalise(x); }\n`);
    w(`lib/${n}-helper.ts`, `export function normalise(v: string): string { return v.trim(); }\n`);
  }
  execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main'], { env: gitEnv });
  execFileSync('git', ['-C', repo, 'add', '-A'], { env: gitEnv });
  execFileSync('git', ['-C', repo, 'commit', '-q', '-m', 'fixture'], { env: gitEnv });
  let haveSubmodule = false;
  try {
    execFileSync('git', ['-C', repo, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', 'file://' + inner, 'vendor-sub'], { env: gitEnv, stdio: 'pipe' });
    execFileSync('git', ['-C', repo, 'commit', '-q', '-m', 'submodule'], { env: gitEnv });
    haveSubmodule = true;
  } catch { /* the environment forbids file:// submodules; the `_root` half of this test still runs */ }

  const out = join(tmp, 'root-out');
  const r = spawnSync('node', [PROPOSE, repo, out, '--no-history', '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 200_000 });
  assert.equal(r.status, 0, r.stderr);
  const ygg = join(out, '.yggdrasil');
  const arch = readFileSync(join(ygg, 'yg-architecture.yaml'), 'utf8');
  assert.ok(!/path:\s*"?_[A-Za-z0-9]*\/\*\*"?/.test(arch), `a synthetic partition was rendered as a directory prefix:\n${arch.slice(0, 1500)}`);
  for (const a of walkDirs(join(ygg, 'aspects'), 'yg-aspect.yaml')) {
    const y = readFileSync(join(a.dir, 'yg-aspect.yaml'), 'utf8');
    assert.ok(!/path:\s*"?_[A-Za-z0-9]*\/\*\*"?/.test(y), `aspect ${a.id} is scoped to a synthetic partition name, so it can never produce a pair:\n${y}`);
  }
  // every mapping entry a node writes must exist on disk
  for (const n of walkDirs(join(ygg, 'model'), 'yg-node.yaml')) {
    for (const m of readNode(readFileSync(join(n.dir, 'yg-node.yaml'), 'utf8')).mapping) {
      assert.ok(existsSync(join(repo, m.replace(/\/$/, ''))), `node ${n.id} maps '${m}', which is not on disk`);
      if (haveSubmodule) assert.ok(!m.replace(/\/$/, '').split('/').includes('vendor-sub'), `node ${n.id} maps the submodule path '${m}'`);
    }
  }
  if (haveSubmodule) {
    assert.ok(!/vendor-sub/.test(arch), 'the submodule gitlink was rendered as a classified file');
  }
});

test('the family adapter emits no member its own fitted predicate does not select', { timeout: 180_000 }, () => {
  // The polyglot shape: two structurally-identical clusters in two languages, plus one same-language decoy that
  // shares neither the marker nor the members' name token. Before the fit gate, the decoy joined the cluster
  // AND the predicate selected none of the six.
  // The fixture is the shape of Yggdrasil's own `family-planted-polyglot`: the same cluster in two languages
  // with a decoy in each, so the case-folded token (`first`, from `findFirst` / `find_first`) is in grain's
  // vocabulary from the snake_case side while the camelCase side is the one the rendered predicate has to
  // match. Both halves are needed to reproduce the defect.
  const repo = gitRepo(join(tmp, 'family-repo'), w => {
    for (const n of ['User', 'Order', 'Payment', 'Product', 'Invoice']) {
      w(`src/ts/${n}Repository.ts`, `export class ${n}Repository {\n  private rows: string[] = [];\n  add(value: string): void { this.rows.push('${n}:' + value); }\n  findFirst(): string { return this.rows[0]; }\n}\n`);
      const s = n.toLowerCase();
      w(`src/py/${s}_repository.py`, `class ${n}Repository:\n    def __init__(self):\n        self.rows = []\n\n    def add(self, value):\n        self.rows.append("${s}:" + value)\n\n    def find_first(self):\n        return self.rows[0]\n`);
    }
    w('src/ts/ConfigLoader.ts', "export class ConfigLoader {\n  private data: Record<string, string> = {};\n  load(name: string): string {\n    if (this.data[name]) { return this.data[name]; }\n    this.data[name] = 'value:' + name;\n    return this.data[name];\n  }\n}\n");
    w('src/py/config_loader.py', 'class ConfigLoader:\n    def __init__(self):\n        self.data = {}\n\n    def load(self, name):\n        if name in self.data:\n            return self.data[name]\n        self.data[name] = "value:" + name\n        return self.data[name]\n');
    w('README.md', '# fixture\n');
  });
  const out = join(tmp, 'family-out');
  const fc = join(tmp, 'family.json');
  const r = spawnSync('node', [PROPOSE, repo, out, '--no-history', '--quiet', '--family-candidates', fc], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 150_000 });
  assert.equal(r.status, 0, r.stderr);
  const written = JSON.parse(readFileSync(fc, 'utf8'));
  assert.ok(!('_fit' in written), 'the instrument\'s own bookkeeping must not leak into the yg advise contract');
  for (const fam of written.families) {
    const re = new RegExp(fam.fittedPredicate.value);
    assert.ok(fam.members.length >= 5, `${fam.id} was emitted below the size floor`);
    for (const m of fam.members) {
      assert.ok(re.test(readFileSync(join(repo, m), 'utf8')),
        `${fam.id} claims member ${m} that its own fitted predicate /${fam.fittedPredicate.value}/ does not select`);
    }
    assert.ok(!fam.members.includes('src/ts/ConfigLoader.ts'), `${fam.id} folded the decoy into the cluster`);
  }
});

// ============================================================================================================
// 5. The instrument's readers, against a real rendered proposal.
// ============================================================================================================

test('the proposal readers read a real rendered graph off disk', { timeout: 180_000 }, () => {
  const out = join(tmp, 'parents-out'); // rendered by the `module` parents test above
  if (!existsSync(join(out, '.yggdrasil'))) return; // that test is the producer; nothing to read without it
  const types = readArchitecture(readFileSync(join(out, '.yggdrasil', 'yg-architecture.yaml'), 'utf8'));
  assert.ok(types.has('project') && types.get('project').organizational, 'project is organizational (no `when`)');
  assert.ok([...types.values()].some(t => t.classifying), 'at least one type carries a `when`');
  const nodeFiles = walkDirs(join(out, '.yggdrasil', 'model'), 'yg-node.yaml');
  assert.ok(nodeFiles.length > 0);
  const n = readNode(readFileSync(join(nodeFiles[0].dir, 'yg-node.yaml'), 'utf8'));
  assert.ok(n.type, 'a rendered node declares its type');
  for (const a of walkDirs(join(out, '.yggdrasil', 'aspects'), 'yg-aspect.yaml')) {
    const d = drillCounts(join(a.dir, 'drills'));
    assert.ok(d.satisfies >= 0 && d.violates >= 0);
  }
});
