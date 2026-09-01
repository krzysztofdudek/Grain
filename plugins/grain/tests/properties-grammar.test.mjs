// 006 — `.properties` grammar: an ordinary grammar addition, structurally identical to what J7.2 already did three
// times for JSON/YAML/TOML (struct-grammars.test.mjs). `tree-sitter-properties@0.3.0` ships both a prebuilt wasm
// and node-types.json, so — like the three data grammars before it — the key/value distinction comes from the
// grammar's OWN node-types metadata (`b.data`, `b.keyField`/`KEY_LIKE_RE`), not from a hand-written parser.
//
// Real shape (verified by parsing `spring.jpa.hibernate.ddl-auto=none`): a `property` node with two UNNAMED-FIELD
// children, `key` and `value` — unlike JSON's `pair.key`/YAML's `block_mapping_pair.key`, tree-sitter-properties
// declares NO fields at all (`"fields": {}` on `property` in its own node-types.json), so `b.keyField` stays empty
// for this grammar. The key/value split instead comes from `KEY_LIKE_RE`'s namedChildren fallback (`keyNodeOf`,
// core.mjs) matching the CHILD's own type name — which is literally `key` — exactly the same fallback path TOML's
// bare_key/quoted_key already exercises. b.keyField being empty here is a real, reportable difference from
// JSON/YAML/TOML (which all populate it), not a broken mechanism: the fallback was built to cover exactly this case.
//
// FIXTURE CHOICE: three files mirroring a real Spring Boot layout (`application.properties` plus
// `-dev`/`-test` profile overrides) sharing several keys — mandatory per issue 011: a key seen in only ONE file has
// df=1 and is dropped by CFG.valueDfMin=2, so a single-file fixture would pass or fail for reasons unrelated to
// this ticket. 12 filler .ts files pad the corpus to 15 total code files so the population ceiling
// (dfMax=ceil(CFG.valueDfMaxShare * files)=ceil(0.2*15)=3) keeps every df=3 shared key instead of gating it out.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';
import { relSupported } from '../engine/relations.mjs';
import { loadHistory } from '../engine/history.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), content); };
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const statusIn = dir => { const r = spawnSync('node', [BIN, 'status'], { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr); };
const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));

async function scopesOf(rel, src) {
  const p = await getParser(rel.slice(rel.lastIndexOf('.'))); const b = bindingFor(p._g); const tree = p.parse(src);
  const out = extractScopes(rel, tree, b, p._g); tree.delete(); return out;
}
async function valsOf(rel, src) { return (await scopesOf(rel, src)).find(s => s.kind === 'file').vals || []; }
const keysOf = vals => vals.map(e => e.k + ':' + e.v).sort();

// ===========================================================================================================
// (1) FLAGSHIP: a Spring-shaped multi-file fixture — a key shared across all three `.properties` files is a
// cross-file fact, findable via `grain what`, exactly like struct-grammars.test.mjs's workflow-YAML flagship.
// ===========================================================================================================
let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-props-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false');
  const PROPS = (db, ddl) => `database=${db}\nspring.application.name=petclinic\nspring.jpa.hibernate.ddl-auto=${ddl}\n`;
  w(repo, 'src/main/resources/application.properties', PROPS('h2', 'none'));
  w(repo, 'src/main/resources/application-dev.properties', PROPS('h2', 'update'));
  w(repo, 'src/main/resources/application-test.properties', PROPS('hsqldb', 'create-drop'));
  for (let i = 1; i <= 12; i++) w(repo, `src/main/java/pkg/F${i}.ts`, `export const f${i} = ${i};\n`);
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'spring-shaped fixture');
  statusIn(repo);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(1) model.files is 15 (3 .properties + 12 .ts) — the arithmetic the df-window assertions below depend on', () => {
  assert.equal(modelIn(repo).files, 15);
});

test('(1a) a key shared by all three .properties files ("database") is a cross-file fact in model.valueIndex', () => {
  const model = modelIn(repo);
  const places = model.valueIndex['key:database'];
  assert.ok(places, `expected model.valueIndex to carry "key:database": ${JSON.stringify(Object.keys(model.valueIndex || {}))}`);
  assert.deepEqual(places.map(([rel]) => rel).sort(), [
    'src/main/resources/application-dev.properties',
    'src/main/resources/application-test.properties',
    'src/main/resources/application.properties',
  ]);
});

test('(1b) that shared key is findable via `grain what` — the (b) values lens, tagged "key" not "str"', () => {
  const j = JSON.parse(grainIn(repo, ['what', 'database', '--json']).out);
  const hit = (j.values || []).find(v => v.value === 'database');
  assert.ok(hit, `expected a "database" value hit: ${JSON.stringify(j.values)}`);
  assert.equal(hit.kind, 'key');
  assert.equal(hit.places.length, 3);
});

test('(1c) the shared multi-word key "spring.application.name" is likewise indexed and findable', () => {
  const model = modelIn(repo);
  assert.equal((model.valueIndex['key:spring.application.name'] || []).length, 3);
  const j = JSON.parse(grainIn(repo, ['what', 'spring.application.name', '--json']).out);
  const hit = (j.values || []).find(v => v.value === 'spring.application.name');
  assert.ok(hit, `expected a "spring.application.name" value hit: ${JSON.stringify(j.values)}`);
  assert.equal(hit.kind, 'key');
});

// ===========================================================================================================
// (2) a `.properties` file yields a file-level scope only — no name+body scope of any kind
// ===========================================================================================================
test('(2) a .properties file yields exactly one scope, kind "file" — never a type or method', async () => {
  const ss = await scopesOf('x.properties', 'a=1\nb.c=2\n');
  assert.equal(ss.length, 1, `expected exactly one scope, got ${ss.map(s => s.kind).join(',')}`);
  assert.equal(ss[0].kind, 'file');
});

test('(2b) bindingFor derives .data (scope.size === 0) for properties, matching json/yaml/toml', async () => {
  assert.equal(bindingFor('properties').data, true);
});

test('(2c) bindingFor.keyField stays EMPTY for properties — property declares no `key` FIELD (unlike JSON/YAML/TOML) — the key/value split comes entirely from the KEY_LIKE_RE namedChildren fallback', async () => {
  assert.equal(bindingFor('properties').keyField.size, 0);
});

// ===========================================================================================================
// (3) key vs value distinguished on a real `foo.bar=baz` line
// ===========================================================================================================
test('(3) a real "foo.bar=baz" line: the key is tagged `key`, the value `str`', async () => {
  const vals = await valsOf('x.properties', 'foo.bar=baz\n');
  assert.deepEqual(keysOf(vals), ['key:foo.bar', 'str:baz']);
});

test('(3b) an unquoted value containing spaces is captured whole, not truncated at the first space', async () => {
  const vals = await valsOf('x.properties', 'foo.bar = baz with spaces\n');
  const byV = Object.fromEntries(vals.map(e => [e.v, e]));
  assert.equal(byV['foo.bar'].k, 'key');
  assert.equal(byV['baz with spaces'].k, 'str');
});

// ===========================================================================================================
// (4) history cost gate: a scopeless-grammar (.properties) blob is never handed to the parser by parseBlobs,
// and its rename is still tracked in fps — mirrors struct-grammars.test.mjs's JSON case exactly (test 8 there)
// ===========================================================================================================
function freshStore(dir) { const store = { dir: join(dir, 'cache'), historyPath: join(dir, 'cache', 'history.json') };
  mkdirSync(store.dir, { recursive: true }); return store; }

test('(4) a scopeless-grammar (.properties) blob is never parsed by parseBlobs, and its rename is still tracked in fps', async () => {
  const tmp2 = mkdtempSync(join(tmpdir(), 'grain-props-histgate-'));
  try {
    const gitdir = join(tmp2, 'repo');
    mkdirSync(gitdir, { recursive: true }); gitIn(gitdir, 'init', '-q', '-b', 'main'); gitIn(gitdir, 'config', 'commit.gpgsign', 'false');
    w(gitdir, 'src/a.js', 'export function alpha() { return 1; }\n');
    w(gitdir, 'application.properties', 'a=1\n');
    gitIn(gitdir, 'add', '-A'); gitIn(gitdir, 'commit', '-qm', 'add files');
    gitIn(gitdir, 'mv', 'application.properties', 'application2.properties');
    gitIn(gitdir, 'commit', '-qm', 'rename config');
    const shas = gitIn(gitdir, 'log', '--format=%H', '--reverse').trim().split('\n');
    assert.equal(shas.length, 2);
    const [shaAdd, shaRename] = shas;

    const { H, parsed } = await loadHistory({ gitdir, store: freshStore(join(tmp2, 'store')), log: () => {} });
    assert.equal(parsed, 1, 'only the JS blob should be parsed; the .properties blob must be skipped before getParser is ever called');

    const bySha = Object.fromEntries(H.fps.map(fp => [fp.sha, fp]));
    assert.deepEqual(bySha[shaAdd].files.sort(), ['application.properties', 'src/a.js']);
    assert.deepEqual(bySha[shaRename].renames, [['application.properties', 'application2.properties']]);
  } finally { rmSync(tmp2, { recursive: true, force: true }); }
});

// ===========================================================================================================
// (5) relSupported is false for properties (no relation extractor) — confirmed, not assumed
// ===========================================================================================================
test('(5) relSupported is false for properties', () => {
  assert.equal(relSupported('properties'), false);
});

// ===========================================================================================================
// (6) regression: `grain version` lists properties, and json/yaml/toml behavior is unchanged by the STR_TYPES
// addition properties needed ('key'/'value' — see header note)
// ===========================================================================================================
test('(6) `grain version` lists properties among its grammars', () => {
  const r = spawnSync('node', [BIN, 'version'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /\bproperties\b/);
});

test('(6b) JSON key/value distinction is unchanged by the properties STR_TYPES addition', async () => {
  const vals = await valsOf('x.json', '{"name": "grain"}');
  assert.deepEqual(keysOf(vals), ['key:name', 'str:grain']);
});

test('(6c) YAML key/value distinction is unchanged by the properties STR_TYPES addition', async () => {
  const vals = await valsOf('x.yaml', 'name: grain\n');
  assert.deepEqual(keysOf(vals), ['key:name', 'str:grain']);
});

test('(6d) TOML key/value distinction is unchanged by the properties STR_TYPES addition', async () => {
  const vals = await valsOf('x.toml', 'name = "grain"\n');
  assert.deepEqual(keysOf(vals), ['key:name', 'str:grain']);
});
