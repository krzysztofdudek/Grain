// J7.2 — structure grammars: JSON/YAML/TOML get a real tree-sitter grammar each. None of the three declares a
// name+body scope (`bindingFor(g).data === true`, derived from node-types.json, zero name lists) — a file of any
// of them yields ONLY a file-kind scope, never a type/method. What they DO carry is `vals`: every key and every
// short string value, tagged `k: 'key'` or `k: 'str'`, feeding the EXISTING `model.valueIndex` (J3.1) — a genuine
// cross-file fact ("the key `test` appears in these N files") without touching container identity, which stays on
// its current positional keying (J7.3, a later ticket, owns re-keying containers by key-path).
//
// FLAGSHIP FIXTURE CHOICE: a `.github/workflows/*.yml` pair, not the ticket's original "`scripts.test` across 12
// package.json" example — that example is empirically false on real monorepos (§ review-pre-faza7 measurement:
// heterogeneous script sets never certify a sibling population) and was retired by the corrected scope. Workflow
// YAML is chosen over an i18n JSON pair because it exercises the HARDER key-detection path — YAML's real parse
// chain wraps every scalar through `plain_scalar`/`flow_node` transparent nodes before reaching the `key` field,
// where JSON's `pair.key` is a direct field with no indirection at all.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getParser, bindingFor, extractScopes, lexicalPreds, mdlCuts } from '../engine/core.mjs';
import { relSupported } from '../engine/relations.mjs';
import { loadHistory } from '../engine/history.mjs';
import { CFG } from '../engine/config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), content); };
const statusIn = dir => { const r = spawnSync('node', [BIN, 'status'], { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr); };
const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));

async function scopesOf(rel, src) {
  const p = await getParser(rel.slice(rel.lastIndexOf('.'))); const b = bindingFor(p._g); const tree = p.parse(src);
  const out = extractScopes(rel, tree, b, p._g); tree.delete(); return out;
}
async function valsOf(rel, src) { return (await scopesOf(rel, src)).find(s => s.kind === 'file').vals || []; }
const keysOf = vals => vals.map(e => e.k + ':' + e.v).sort();

// ===========================================================================================================
// (1) FLAGSHIP: cross-file key visibility through model.valueIndex — two GitHub Actions workflows share `name`,
// `on`, `jobs`, `runs-on` as KEYS (never as string values) and their common `runs-on: ubuntu-latest` VALUE too.
// 6 total code files (2 yml + 4 ts filler) keeps every shared key's document frequency (2) inside
// [CFG.valueDfMin, ceil(CFG.valueDfMaxShare * files)] = [2, ceil(0.2*6)] = [2, 2] — right at the boundary, not
// a coincidence: any fewer filler files and the population gate (§J3.1, untouched by this ticket) would drop them.
// ===========================================================================================================
let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-struct-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false');
  const YML = n => `name: CI\non: push\njobs:\n  ${n}:\n    runs-on: ubuntu-latest\n`;
  w(repo, '.github/workflows/build.yml', YML('build'));
  w(repo, '.github/workflows/test.yml', YML('test'));
  for (const n of ['a', 'b', 'c', 'd']) w(repo, `src/${n}.ts`, `export const ${n} = 1;\n`);
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'the fixture tree');
  statusIn(repo);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(1) two workflow files\' shared top-level keys are a cross-file fact in model.valueIndex', () => {
  const model = modelIn(repo);
  assert.equal(model.files, 6, 'fixture must have exactly 6 code files for the density-gate arithmetic above');
  for (const key of ['key:name', 'key:on', 'key:jobs', 'key:runs-on'])
    assert.deepEqual(model.valueIndex[key], [['.github/workflows/build.yml', key === 'key:jobs' ? 3 : key === 'key:runs-on' ? 5 : key === 'key:on' ? 2 : 1],
      ['.github/workflows/test.yml', key === 'key:jobs' ? 3 : key === 'key:runs-on' ? 5 : key === 'key:on' ? 2 : 1]], `${key} must be visible in both workflow files`);
});

test('(1b) the shared VALUE `ubuntu-latest` is ALSO a cross-file fact, tagged `str` (not `key`)', () => {
  const model = modelIn(repo);
  assert.deepEqual(model.valueIndex['str:ubuntu-latest'], [['.github/workflows/build.yml', 5], ['.github/workflows/test.yml', 5]]);
});

// ===========================================================================================================
// (2) JSON/YAML/TOML files carry a file-level scope ONLY — no name+body scope of any kind
// ===========================================================================================================
test('(2) a JSON/YAML/TOML file yields exactly one scope, kind "file" — never a type or method', async () => {
  for (const [rel, src] of [['x.json', '{"a": 1}'], ['x.yaml', 'a: 1\n'], ['x.toml', 'a = 1\n']]) {
    const ss = await scopesOf(rel, src);
    assert.equal(ss.length, 1, `${rel}: expected exactly one scope, got ${ss.map(s => s.kind).join(',')}`);
    assert.equal(ss[0].kind, 'file', rel);
  }
});

test('(2b) bindingFor derives `.data` (scope.size === 0) for all three, and false for a control code grammar', async () => {
  assert.equal(bindingFor('json').data, true);
  assert.equal(bindingFor('yaml').data, true);
  assert.equal(bindingFor('toml').data, true);
  const p = await getParser('.ts'); assert.equal(bindingFor(p._g).data, false, 'TypeScript declares real name+body scopes');
});

// ===========================================================================================================
// (3) JSON: a key and its string value, in the SAME object, are correctly distinguished
// ===========================================================================================================
test('(3) JSON: an object key is tagged `key`, its string value is tagged `str`, in the same pair', async () => {
  const vals = await valsOf('x.json', '{"name": "grain"}');
  assert.deepEqual(keysOf(vals), ['key:name', 'str:grain']);
});

test('(3b) JSON: nested objects get their OWN container per level, key/value still distinguished at every level', async () => {
  const vals = await valsOf('x.json', '{"name": "grain", "jobs": {"a": "b"}}');
  const byV = Object.fromEntries(vals.map(e => [e.v, e]));
  assert.equal(byV.name.k, 'key'); assert.equal(byV.grain.k, 'str');
  assert.equal(byV.jobs.k, 'key'); assert.equal(byV.a.k, 'key'); assert.equal(byV.b.k, 'str');
  assert.notEqual(byV.jobs.c, byV.a.c, 'the outer pair and the nested object are different containers');
});

// ===========================================================================================================
// (4) YAML: key vs value survives the real wrapper-node indirection (string_scalar -> plain_scalar ->
// flow_node<key> -> block_mapping_pair) — a real parse, not a synthetic tree
// ===========================================================================================================
test('(4) YAML: a real `key: value` mapping pair distinguishes its key from its value', async () => {
  const vals = await valsOf('x.yaml', 'name: grain\n');
  assert.deepEqual(keysOf(vals), ['key:name', 'str:grain']);
});

test('(4b) YAML: a nested block mapping keeps key/value distinct at every level', async () => {
  const vals = await valsOf('x.yaml', 'jobs:\n  build:\n    runs-on: ubuntu-latest\n');
  const byV = Object.fromEntries(vals.map(e => [e.v, e]));
  assert.equal(byV.jobs.k, 'key'); assert.equal(byV.build.k, 'key');
  assert.equal(byV['runs-on'].k, 'key'); assert.equal(byV['ubuntu-latest'].k, 'str');
});

// ===========================================================================================================
// (5) TOML: a bare_key/dotted_key and a string value are correctly distinguished
// ===========================================================================================================
test('(5) TOML: a bare_key is tagged `key`, its string value is tagged `str`', async () => {
  const vals = await valsOf('x.toml', 'name = "grain"\n');
  assert.deepEqual(keysOf(vals), ['key:name', 'str:grain']);
});

test('(5b) TOML: a dotted key\'s full path is tagged `key`, its string value `str`', async () => {
  const vals = await valsOf('x.toml', 'owner.name = "grain"\n');
  const dottedKey = vals.find(e => e.v === 'owner.name');
  assert.ok(dottedKey, `expected a dotted_key entry "owner.name": ${JSON.stringify(vals)}`);
  assert.equal(dottedKey.k, 'key');
  const value = vals.find(e => e.v === 'grain');
  assert.equal(value.k, 'str');
});

// ===========================================================================================================
// (6) THE NORMALIZATION BUG this ticket's own STR_TYPES extension would otherwise introduce: a bare YAML plain
// scalar has no code-style quote PREFIX to strip — the shared regex (`replace(/^[A-Za-z@$]+/, '')`, kept
// untouched for Rust raw strings etc.) would mis-truncate `ubuntu-latest` to `-latest`. The data branch strips
// only surrounding quote characters.
// ===========================================================================================================
test('(6) a bare YAML plain scalar like `ubuntu-latest` is NOT mis-truncated by the code-prefix-stripping regex', async () => {
  const vals = await valsOf('x.yaml', 'os: ubuntu-latest\n');
  const v = vals.find(e => e.k === 'str');
  assert.equal(v.v, 'ubuntu-latest', 'must NOT be truncated to "-latest"');
});

test('(6b) control: the shared regex still strips a CODE quote prefix (Python raw string `r\'...\'`) — proves the data branch is a separate normalization, not a relaxation of the shared one', async () => {
  const vals = await valsOf('x.py', "x = r'abc'\n");
  assert.deepEqual(keysOf(vals), ['str:abc']);
});

// ===========================================================================================================
// (7) VAL_CAP-truncation rule: a scan that HITS the cap drops ALL of that file's vals, not a truncated prefix —
// this is what keeps vendored/generated files (measured: tree-sitter-*.node-types.json, package-lock.json) out
// of model.valueIndex without any name-based exclusion list. General rule (core.mjs), not gated to `b.data`.
// ===========================================================================================================
test('(7) a JSON file whose value scan hits VAL_CAP has ALL its vals dropped, not the first 200', async () => {
  const obj = {}; for (let i = 0; i < 250; i++) obj['k' + i] = 'v' + i; // 250 pairs => 500 STR_TYPES nodes (key+value each)
  const vals = await valsOf('big.json', JSON.stringify(obj));
  assert.equal(vals.length, 0, 'a capped scan is a non-representative prefix of itself and must be dropped wholesale');
});

test('(7b) control: a JSON file comfortably under the cap keeps its vals', async () => {
  const vals = await valsOf('small.json', JSON.stringify({ a: 'x', b: 'y' }));
  assert.equal(vals.length, 4);
});

// ===========================================================================================================
// (8) history cost gate: a scopeless-grammar blob is skipped by parseBlobs BEFORE the parser is ever invoked
// (not merely parsed-then-filtered-to-nothing) — and the gate lives in parseBlobs, not walk(), so
// fps[*].renames still covers a renamed config file.
// ===========================================================================================================
function freshStore(dir) { const store = { dir: join(dir, 'cache'), historyPath: join(dir, 'cache', 'history.json') };
  mkdirSync(store.dir, { recursive: true }); return store; }

test('(8) a scopeless-grammar (JSON) blob is never parsed by parseBlobs, and its rename is still tracked in fps', async () => {
  const tmp2 = mkdtempSync(join(tmpdir(), 'grain-histgate-'));
  try {
    const gitdir = join(tmp2, 'repo');
    mkdirSync(gitdir, { recursive: true }); gitIn(gitdir, 'init', '-q', '-b', 'main'); gitIn(gitdir, 'config', 'commit.gpgsign', 'false');
    w(gitdir, 'src/a.js', 'export function alpha() { return 1; }\n');
    w(gitdir, 'config.json', '{"a": 1}\n');
    gitIn(gitdir, 'add', '-A'); gitIn(gitdir, 'commit', '-qm', 'add files');
    gitIn(gitdir, 'mv', 'config.json', 'config2.json');
    gitIn(gitdir, 'commit', '-qm', 'rename config');
    const shas = gitIn(gitdir, 'log', '--format=%H', '--reverse').trim().split('\n');
    assert.equal(shas.length, 2);
    const [shaAdd, shaRename] = shas;

    const { H, parsed } = await loadHistory({ gitdir, store: freshStore(join(tmp2, 'store')), log: () => {} });
    // 2 distinct historical blobs total (a.js, config.json content) — only the JS one is ever handed to the
    // parser; parsed++ only happens on the success path AFTER a real parse, so this is a direct measurement of
    // "never reaches the parser", not an inference from an empty result
    assert.equal(parsed, 1, 'only the JS blob should be parsed; the JSON blob must be skipped before getParser is ever called');

    const bySha = Object.fromEntries(H.fps.map(fp => [fp.sha, fp]));
    assert.deepEqual(bySha[shaAdd].files.sort(), ['config.json', 'src/a.js']);
    assert.deepEqual(bySha[shaRename].renames, [['config.json', 'config2.json']], 'the gate lives in parseBlobs, not walk() — CODE_RE still covers config paths for rename tracking');
  } finally { rmSync(tmp2, { recursive: true, force: true }); }
});

// ===========================================================================================================
// (9) relSupported / lexicalPreds / mdlCuts: confirmed working, and the partition-shape change made explicit
// ===========================================================================================================
test('(9a) relSupported is false for all three data grammars', () => {
  assert.equal(relSupported('json'), false);
  assert.equal(relSupported('yaml'), false);
  assert.equal(relSupported('toml'), false);
});

test('(9b) lexicalPreds\' indent predicate is present on a YAML file (grammar-independent, raw-text derived)', async () => {
  const p = await getParser('.yaml'); const b = bindingFor(p._g);
  const src = 'a:\n  b:\n    c: 1\n    d: 2\ne:\n  f:\n    g: 3\n    h: 4\n';
  const tree = p.parse(src);
  const out = lexicalPreds(tree, b); tree.delete();
  assert.ok('auto.lex:indent' in out, 'YAML indentation is structurally forced rather than chosen, but the predicate itself is still computed');
});

test('(9c) mdlCuts: config files sharing a directory with code files change the partition cut set — demonstrated explicitly, not assumed byte-identical', async () => {
  const TS = i => `export const v${i} = ${i};\n`;
  const srcFiles = [1, 2, 3, 4, 5].map(i => [`src/f${i}.ts`, TS(i)]);
  // BEFORE: config/ holds plain TS files with the SAME lexical style as src — nothing distinguishes them, so
  // merging the whole tree into one partition is cheaper than splitting
  const beforeConfig = [1, 2, 3, 4, 5].map(i => [`config/c${i}.ts`, TS(i)]);
  // AFTER: config/ holds real JSON files instead — the ONLY thing that changed is the grammar tag (`s.g`), which
  // mdlCuts partitions by directly
  const afterConfig = [1, 2, 3, 4, 5].map(i => [`config/c${i}.json`, JSON.stringify({ v: i, name: 'x', on: true })]);

  const before = await Promise.all([...srcFiles, ...beforeConfig].map(([r, s]) => scopesOf(r, s).then(ss => ss[0])));
  const after = await Promise.all([...srcFiles, ...afterConfig].map(([r, s]) => scopesOf(r, s).then(ss => ss[0])));

  const cutsBefore = mdlCuts(before), cutsAfter = mdlCuts(after);
  assert.deepEqual(cutsBefore, [], 'sanity: with no grammar divergence, the tree stays merged as one partition');
  assert.deepEqual(cutsAfter, ['config', 'src'], 'config/ becomes its own cut once its files carry a different grammar tag than src/');
});

// ===========================================================================================================
// (10) end-to-end smoke: `grain status` / model.json stay valid and loadable with the new grammars present, on
// a fixture mixing code + JSON/YAML/TOML files
// ===========================================================================================================
test('(10) a repo mixing TS, JSON, YAML and TOML files builds a valid, loadable model', () => {
  const tmp2 = mkdtempSync(join(tmpdir(), 'grain-smoke-'));
  try {
    const dir = join(tmp2, 'r'); mkdirSync(dir, { recursive: true });
    gitIn(dir, 'init', '-q', '-b', 'main'); gitIn(dir, 'config', 'commit.gpgsign', 'false');
    w(dir, 'src/a.ts', 'export class A {\n  run(): number { return 1; }\n}\n');
    w(dir, 'package.json', JSON.stringify({ name: 'smoke', version: '1.0.0' }, null, 2) + '\n');
    w(dir, 'config/settings.yaml', 'env: production\nfeature:\n  enabled: true\n');
    w(dir, 'Cargo.toml', '[package]\nname = "smoke"\nversion = "0.1.0"\n');
    gitIn(dir, 'add', '-A'); gitIn(dir, 'commit', '-qm', 'mixed fixture');

    const r = spawnSync('node', [BIN, 'status'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const model = JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));
    assert.equal(model.files, 4);

    const exp = spawnSync('node', [BIN, 'export'], { cwd: dir, encoding: 'utf8' });
    assert.equal(exp.status, 0, exp.stdout + exp.stderr);
    JSON.parse(exp.stdout); // must not throw

    const rep = spawnSync('node', [BIN, 'report', '--json'], { cwd: dir, encoding: 'utf8' });
    assert.equal(rep.status, 0, rep.stdout + rep.stderr);
    JSON.parse(rep.stdout); // must not throw
  } finally { rmSync(tmp2, { recursive: true, force: true }); }
});
