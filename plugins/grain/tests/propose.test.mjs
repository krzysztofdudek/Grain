// Guard for the proposal renderer (G''): tests/stress/propose.mjs.
//
// The renderer writes a `.yggdrasil/` graph a maintainer is asked to adopt. Two things about that output are
// load-bearing and both are asserted here against a REAL tiny git repository and a REAL `grain export`:
//
//   1. YGGDRASIL ITSELF MUST BE ABLE TO LOAD IT. Not "the YAML parses" by our own parser — the actual CLI,
//      run from a staged copy of the repository with the proposal dropped in, must read the architecture, the
//      nodes and the aspects and report them. A proposal Yggdrasil refuses to load is a bug, so the test drives
//      `yg check`, keeps its exit code and its error codes, and fails on any code that means the graph did not
//      come in (`architecture-invalid`, a YAML/schema error, an unreadable node or aspect). Where the Yggdrasil
//      CLI is not present the staged check is skipped and the rest still runs — the renderer's own invariants
//      are checked either way. Point `YG_BIN` at a built `bin.js` to run it.
//   2. EVERY PROPOSED ELEMENT CARRIES AN EVIDENCE LINE. That is the whole difference between a proposal and a
//      guess: the maintainer has to be able to read what in their repository made grain say this. So every
//      node type, every node, every aspect and every relation block is required to have a matching row in
//      `proposal.json` AND an `# evidence:` line in the file it was written to, with counts in it.
//
// Plus unit coverage of the three pieces a wrong answer would come out of silently: the name-shape compiler,
// the `content:` predicate drafted for a role group, and the rule that decides which conventions may be
// rendered as a deterministic check at all.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shapeToRegex, contentRegexFor, renderableDirection, slug, yamlEmit, nodePathFor, nestedProjectRoots, PREAMBLE } from './stress/propose.mjs';
import { parseYaml } from './stress/reconstruct.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROPOSE = join(here, 'stress', 'propose.mjs');

// The Yggdrasil CLI is a reference this repository does not vendor. Look where it usually is, allow an override,
// and skip only the staged-check assertions when it is absent — never the rest.
const YG_BIN = process.env.YG_BIN || '/home/user/Yggdrasil/source/cli/dist/bin.js';
const HAVE_YG = existsSync(YG_BIN);

let tmp, repo, out;

// A repository with two localities a miner can actually see: three handlers that import three helpers.
function buildFixture(root, env) {
  mkdirSync(root, { recursive: true });
  const w = (rel, content) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
  for (const n of ['alpha', 'beta', 'gamma']) {
    w(`src/api/${n}-handler.ts`, `import { normalise } from '../util/${n}-helper';\nimport { join } from 'node:path';\n` +
      `export function handle${n[0].toUpperCase()}${n.slice(1)}(input: string): string {\n  return normalise(join(input, input));\n}\n`);
  }
  for (const n of ['alpha', 'beta', 'gamma']) {
    w(`src/util/${n}-helper.ts`, `import { join } from 'node:path';\nexport function normalise(value: string): string {\n  return join(value.trim());\n}\n`);
  }
  w('README.md', '# fixture\n');
  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', root, 'add', '-A'], { env });
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture'], { env });
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'propose-'));
  repo = join(tmp, 'repo');
  out = join(tmp, 'proposal');
  const env = {
    ...process.env, HOME: tmp,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
    GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
  };
  buildFixture(repo, env);
  const r = spawnSync('node', [PROPOSE, repo, out, '--no-history', '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

const sidecar = () => JSON.parse(readFileSync(join(out, 'proposal.json'), 'utf8'));

// ---------- 1. the proposal directory is written, outside the repository ----------
test('writes a complete proposal directory and never into the repository', () => {
  for (const f of ['.yggdrasil/yg-config.yaml', '.yggdrasil/yg-architecture.yaml', 'PROPOSAL.md', 'REFACTOR-BACKLOG.md', 'alternatives.md', 'proposal.json']) {
    assert.ok(existsSync(join(out, f)), `missing ${f}`);
  }
  assert.ok(!existsSync(join(repo, '.yggdrasil')), 'the renderer must never create a graph inside the repository');
  const j = sidecar();
  assert.equal(j.instrument, 'propose/1');
  assert.ok(j.counts.types >= 2, `expected at least the two source localities, got ${j.counts.types}`);
  assert.ok(j.counts.nodes >= j.counts.types - 1);
});

test('refuses an out-dir that is the repository itself', () => {
  const r = spawnSync('node', [PROPOSE, repo, repo, '--no-history', '--quiet'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /refusing to write into the repository/);
});

// ---------- 2. every proposed element carries an evidence line ----------
const walkFiles = (d, pred, acc = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walkFiles(p, pred, acc);
    else if (pred(p)) acc.push(p);
  }
  return acc;
};

test('every proposed element has an evidence row in proposal.json', () => {
  const j = sidecar();
  const byKind = k => j.evidence.filter(e => e.kind === k);
  const arch = parseYaml(readFileSync(join(out, '.yggdrasil', 'yg-architecture.yaml'), 'utf8'));
  const typeIds = Object.keys(arch.node_types);
  assert.deepEqual(byKind('type').map(e => e.id).sort(), typeIds.sort());

  const nodeFiles = walkFiles(join(out, '.yggdrasil', 'model'), p => p.endsWith('yg-node.yaml'));
  assert.equal(byKind('node').length, nodeFiles.length);
  const aspectDirs = existsSync(join(out, '.yggdrasil', 'aspects'))
    ? walkFiles(join(out, '.yggdrasil', 'aspects'), p => p.endsWith('yg-aspect.yaml')) : [];
  assert.equal(byKind('aspect').length, aspectDirs.length);

  for (const e of j.evidence) {
    assert.ok(e.evidence && e.evidence.length > 20, `evidence too thin for ${e.kind} ${e.id}: ${e.evidence}`);
    // an organizational element classifies nothing and owns nothing, so it has no count to carry — its
    // evidence line says exactly that instead, and is the only shape allowed to have no number in it
    if (e.level === 'organizational' || e.organizational) { assert.match(e.evidence, /organizational/); continue; }
    assert.match(e.evidence, /\d/, `evidence for ${e.kind} ${e.id} carries no count: ${e.evidence}`);
  }
});

test('every written YAML carries the honest preamble and an inline `# evidence:` line per element', () => {
  const yamls = walkFiles(join(out, '.yggdrasil'), p => p.endsWith('.yaml'));
  assert.ok(yamls.length >= 3);
  for (const p of yamls) {
    const text = readFileSync(p, 'utf8');
    assert.ok(text.startsWith('# PROPOSAL —'), `${p} does not open with the proposal preamble`);
    assert.ok(text.includes(PREAMBLE[5]), `${p} does not carry the absence-rule disclosure`);
    if (p.endsWith('yg-config.yaml')) continue;
    assert.match(text, /^\s*# .+\d/m, `${p} carries no evidence comment with a count in it`);
  }
  // the architecture carries one evidence comment per type, and every type has a `description`
  const archText = readFileSync(join(out, '.yggdrasil', 'yg-architecture.yaml'), 'utf8');
  const arch = parseYaml(archText);
  for (const [id, t] of Object.entries(arch.node_types)) {
    assert.ok(t.description, `type ${id} has no description`);
  }
  const body = archText.slice(archText.indexOf('node_types:'));
  const comments = body.split('\n').filter(l => /^\s+# /.test(l)).length;
  assert.ok(comments >= Object.keys(arch.node_types).length, `${comments} evidence comments for ${Object.keys(arch.node_types).length} types`);
});

test('every aspect draft is status: draft and ships exactly one rule source', () => {
  const dir = join(out, '.yggdrasil', 'aspects');
  if (!existsSync(dir)) return; // a fixture this small may certify nothing — that is an honest outcome
  for (const p of walkFiles(dir, x => x.endsWith('yg-aspect.yaml'))) {
    const doc = parseYaml(readFileSync(p, 'utf8'));
    assert.equal(doc.status, 'draft', `${p} is not a draft`);
    assert.ok(doc.name && doc.description, `${p} is missing name/description`);
    const d = dirname(p);
    const hasCheck = existsSync(join(d, 'check.mjs')), hasContent = existsSync(join(d, 'content.md'));
    assert.ok(hasCheck !== hasContent, `${p} must ship exactly one of check.mjs / content.md`);
    if (hasCheck) assert.equal(doc.errs, 'under', `${p} renders a check and must declare its error direction`);
  }
});

// ---------- 3. Yggdrasil's own CLI must be able to load it ----------
// These codes mean the graph did not come in at all. Anything else `yg check` says (an uncovered file, a real
// architectural finding such as a dependency cycle) is a statement ABOUT the repository, not a defect in the
// proposal, and this test deliberately does not fail on it.
const LOAD_FAILURES = /architecture-invalid|graph-load|yaml|schema|node-invalid|aspect-invalid|aspect-reviewer-missing|description-missing|type-undefined|parent-type-forbidden|file-duplicate-mapping|mapping-path-missing/;

test('Yggdrasil loads the proposed graph from a staged copy of the repository', { skip: HAVE_YG ? false : `Yggdrasil CLI not found at ${YG_BIN} (set YG_BIN)` }, () => {
  const stage = join(tmp, 'stage');
  mkdirSync(stage, { recursive: true });
  for (const rel of execFileSync('git', ['-C', repo, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)) {
    const dst = join(stage, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(join(repo, rel), dst);
  }
  cpSync(join(out, '.yggdrasil'), join(stage, '.yggdrasil'), { recursive: true });

  const r = spawnSync('node', [YG_BIN, 'check'], { cwd: stage, encoding: 'utf8', maxBuffer: 1 << 26 });
  const text = (r.stdout || '') + (r.stderr || '');
  // the graph loaded: the header names the nodes and aspects it read
  const header = /yg check: (\w+)[^\n]*?(\d+) nodes/.exec(text);
  assert.ok(header, `yg check printed no graph header — the graph did not load:\n${text.slice(0, 2000)}`);
  const j = sidecar();
  assert.equal(Number(header[2]), j.counts.nodes, `Yggdrasil loaded ${header[2]} nodes, the proposal wrote ${j.counts.nodes}`);
  const codes = [...new Set([...text.matchAll(/^ {2}([a-z][a-z-]+)/gm)].map(m => m[1]))];
  const fatal = codes.filter(c => LOAD_FAILURES.test(c));
  assert.deepEqual(fatal, [], `Yggdrasil refused to load the proposal:\n${text.slice(0, 4000)}`);
  assert.equal(r.status, 0, `expected a clean check on this fixture, got:\n${text.slice(0, 4000)}`);
});

// ---------- 4. the pieces a wrong answer would come out of silently ----------
test('the name-shape compiler turns grain shapes into anchored regexes, and refuses the ones it cannot', () => {
  assert.equal(shapeToRegex('(Ua)+'), '^(?:[A-Z]+[a-z0-9]+)+$');
  assert.equal(shapeToRegex('a(Ua)+'), '^[a-z0-9]+(?:[A-Z]+[a-z0-9]+)+$');
  assert.equal(shapeToRegex('a'), '^[a-z0-9]+$');
  assert.equal(shapeToRegex('a(-a)+(.a)+'), '^[a-z0-9]+(?:\\-[a-z0-9]+)+(?:\\.[a-z0-9]+)+$');
  assert.equal(shapeToRegex('a?a'), null, 'a shape carrying `?` (grain\'s "anything else") must not compile');
  assert.equal(shapeToRegex(''), null);
  // and the compiled regexes actually classify
  assert.ok(new RegExp(shapeToRegex('(Ua)+')).test('AspectUsage'));
  assert.ok(!new RegExp(shapeToRegex('(Ua)+')).test('aspectUsage'));
  assert.ok(new RegExp(shapeToRegex('a(-a)+(.a)+')).test('derive-nodes.test.ts'));
});

test('a role group\'s content predicate comes from its own evidence, in a stated order', () => {
  const withMarker = { markers: [{ type: 'decorator', name: 'Handler', carriers: [1, 2, 3] }], members: [], nameTokens: [], imports: [] };
  assert.match(contentRegexFor(withMarker).regex, /@Handler/);
  const withAffix = {
    markers: [], imports: [], nameTokens: [],
    members: [{ name: 'registerCheckCommand' }, { name: 'registerFindCommand' }, { name: 'registerLogCommand' }],
  };
  const cr = contentRegexFor(withAffix);
  assert.match(cr.regex, /register\[A-Za-z0-9_\]\*Command/);
  assert.ok(new RegExp(cr.regex).test('export function registerAdviseCommand('));
  assert.ok(!new RegExp(cr.regex).test('export function loadGraphOrAbort('));
  assert.equal(contentRegexFor({ markers: [], members: [], nameTokens: [], imports: [] }), null,
    'a group with no marker, no name shape and no shared import is not a type and must say so');
});

test('only rules a file-scoped check can keep as `errs: under` are rendered', () => {
  // a negative at partition scope: provable on sight, renders
  assert.equal(renderableDirection('call', 'false', 'method', 'partition'), true);
  // the same rule inside a role group: the check's unit is the file, the group's is a scope — never rendered
  assert.equal(renderableDirection('call', 'false', 'method', 'group'), false);
  // a positive about a declaration would refuse the file for every other declaration in it
  assert.equal(renderableDirection('returns', 'true', 'method', 'partition'), false);
  // a positive whose subject IS the file renders
  assert.equal(renderableDirection('imp', 'true', 'file', 'partition'), true);
  assert.equal(renderableDirection('lex', 'space2', 'file', 'partition'), true);
  // a shape with no name in it never renders
  assert.equal(renderableDirection('stshape', 'true', 'method', 'partition'), false);
  assert.equal(renderableDirection('has', 'false', 'method', 'partition'), false);
});

test('node paths, slugs and the nested-project scan', () => {
  assert.equal(nodePathFor('.yggdrasil/aspects'), 'dot-yggdrasil/aspects');
  assert.equal(nodePathFor(null), 'repo-root');
  assert.equal(slug('source/cli/src/core'), 'source-cli-src-core');
  assert.deepEqual(nestedProjectRoots(['a/b/.yggdrasil/yg-config.yaml', 'a/b/src/x.ts', '.yggdrasil/yg-config.yaml']), ['a/b']);
});

test('the YAML emitter quotes what YAML would otherwise re-read as something else', () => {
  assert.equal(yamlEmit({ a: 'plain' }), 'a: plain\n');
  assert.equal(yamlEmit({ a: 'true' }), 'a: "true"\n');
  assert.equal(yamlEmit({ a: '5.2.0' }), 'a: "5.2.0"\n');
  assert.equal(yamlEmit({ a: 'has: colon' }), 'a: "has: colon"\n');
  assert.equal(yamlEmit({ a: [] }), 'a: []\n');
  assert.equal(yamlEmit({ when: { path: 'src/**' } }), 'when:\n  path: "src/**"\n');
  // and it round-trips through the reader the instruments actually use
  const doc = { name: 'X', when: { all_of: [{ path: 'a/**' }, { not: { path: '**/*.test.ts' } }] }, mapping: ['a/'] };
  assert.deepEqual(parseYaml(yamlEmit(doc)), doc);
});
