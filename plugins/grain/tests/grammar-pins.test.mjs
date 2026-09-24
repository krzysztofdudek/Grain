// Every shipped grammar is pinned: engine/grammars/manifest.json records the sha256 of its wasm and its
// node-types.json, and where the bytes come from (an npm package version, a GitHub release asset, or a source build
// at a commit with a named tree-sitter-cli). scripts/build-grammars.mjs writes a file only when its bytes match the
// pin; this test holds the committed files to the same pins, so a grammar can never change without the manifest
// saying so. The grammars Yggdrasil also ships carry the very same bytes as Yggdrasil's own pins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'engine', 'grammars');
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
const sha = f => createHash('sha256').update(readFileSync(join(DIR, f))).digest('hex');

test('every shipped wasm and node-types.json matches its sha256 pin in the manifest', () => {
  for (const [g, pin] of Object.entries(manifest)) {
    assert.equal(sha(`tree-sitter-${g}.wasm`), pin.wasmSha256, `${g}: the shipped wasm is not the pinned grammar`);
    assert.equal(sha(`tree-sitter-${g}.node-types.json`), pin.nodeTypesSha256, `${g}: the shipped node-types.json is not the pinned one`);
  }
});

test('the manifest pins exactly the grammars that ship, each with a version and a source', () => {
  const shipped = readdirSync(DIR).filter(f => f.endsWith('.wasm')).map(f => f.replace(/^tree-sitter-|\.wasm$/g, '')).sort();
  assert.deepEqual(Object.keys(manifest).sort(), shipped);
  for (const [g, pin] of Object.entries(manifest)) {
    assert.ok(pin.version, `${g}: no version`);
    assert.match(pin.wasmSha256, /^[0-9a-f]{64}$/, `${g}: wasm pin is not a sha256`);
    assert.match(pin.nodeTypesSha256, /^[0-9a-f]{64}$/, `${g}: node-types pin is not a sha256`);
    const s = pin.source || {};
    if (s.kind === 'npm') assert.ok(s.package && s.wasmPath && s.nodeTypesPath, `${g}: npm source without package/paths`);
    else if (s.kind === 'github-release') assert.ok(pin.repo && pin.commit && s.wasmUrl, `${g}: release source without repo/commit/url`);
    else if (s.kind === 'source') assert.ok(pin.repo && pin.commit && pin.cli && s.dir, `${g}: source build without repo/commit/cli/dir`);
    else assert.fail(`${g}: unknown source kind ${s.kind}`);
    for (const p of s.patches || []) readFileSync(join(ROOT, 'scripts', 'grammar-patches', p)); // a named patch must exist
  }
});

test('the grammars shared with Yggdrasil are the 6.1.0 pins, and the runtime is web-tree-sitter 0.27.0', () => {
  const YGG = {
    typescript: '9372e129ff96136fc856dd9dd9316e5e7c3bcb1436427c34bc521eb240f17977',
    tsx: '605d5c125b7291a388ea408ef86150876fceae6d623d0810692f85c1ec34d799',
    javascript: '5fb488d0cabb4775a594bab85682de5ad6ce83c0d6ac997a9f82dd084d571240',
    python: '16108b50df4ee9a30168794252ab55e7c93bfc5765d7fa0aa3e335752c515f47',
    go: '9504573f352b20be7f2f1911754d710622aedc15afff16d5ed8fb5645681aee7',
    rust: '24c89bd9252255e4aebbcbd7d2d308bd92c86dd95a130fdc80efa49577b8d738',
    java: '6476728734128931bd50de2d1e5e9c75c506b51e278f54eaf709836a0de35759',
    c_sharp: '315d54ed50bb56940e978ea75c75b74743407fa113c3c98b87aad72c919aaf18',
    c: '83e8d7902b9d7f8c7c5cd4bd9acb5c7eb5faf42c09f85546b183964d3b5f48f9',
    cpp: 'ab9e891709f5dc88fd6b1b4d33f110fb23e5ddc5e64296caf4a41d0a3e585ebe',
    ruby: 'e255f2dd39812e9730a824f85e4f5c8660426bd8e8d9a4790e8e7e6e41da3761',
    json: '564e489724cbcf9b4563cd758a7fb7f355f896b11127819ae9e8ef71e7c15e60',
    kotlin: '5d44eef5c02b4546f01ddc376ed237294b18604f727b192a832a5ce08a040e8f',
    yaml: 'f89cf2a8ccd4f29292e502f1c37efb4f1dead281246605e0a890c697d4db88c7',
    toml: '057f48e81072cb0eb5969632a7cf032fc6d33cd4ba3198c3f58227346c012d97',
  };
  for (const [g, h] of Object.entries(YGG)) assert.equal(manifest[g].wasmSha256, h, `${g}: not the grammar Yggdrasil 6.1.0 pins`);
  assert.equal(readFileSync(join(ROOT, 'engine', 'vendor', 'web-tree-sitter', 'VERSION'), 'utf8').trim(), '0.27.0');
});
