#!/usr/bin/env node
// The grammar pipeline: turns every pin in engine/grammars/manifest.json into the two files the engine loads,
// `tree-sitter-<g>.wasm` (the parser) and `tree-sitter-<g>.node-types.json` (the grammar metadata the engine derives
// its language bindings from — §6.2 of the spec), and vendors the web-tree-sitter runtime (js + wasm + LICENSE) into
// engine/vendor/web-tree-sitter/, so the installed plugin needs NO node_modules at runtime. Outputs are committed.
//
// manifest.json IS the pin file. Every grammar is pinned by the sha256 of both files, and a file is written only after
// its bytes were hashed and matched against the pin, whatever its source:
//
// - `npm`: read from the installed devDependency (`source.package`, `source.wasmPath`, `source.nodeTypesPath`), whose
//   version must equal the pin's `version`.
// - `github-release`: the release's wasm asset (`source.wasmUrl`) is downloaded; node-types.json is read from the
//   repository at the pinned commit.
// - `source`: the repository is fetched at the pinned commit, the listed patches (scripts/grammar-patches/) are
//   applied, the listed `deps` repositories are checked out beside it, `tree-sitter generate` runs when asked, and
//   `tree-sitter build --wasm` compiles `source.dir` with the tree-sitter-cli devDependency, which must be the pin's
//   `cli` version. The output is byte-reproducible, so the pinned sha256 is also the reproducibility check.
//
// The grammars Yggdrasil ships are pinned to the very same bytes (`sharedWith`), built by the same pipeline: its
// scripts/grammars.mjs, from which this one is ported. Downloaded and built files land in a content-addressed cache
// named by their sha256 (GRAIN_GRAMMAR_CACHE, default ~/.cache/grain/grammars) and are re-hashed on every read.
// GRAIN_GRAMMAR_REBUILD=1 ignores the cache; GRAIN_GRAMMAR_OFFLINE=1 forbids downloads and builds.
//
//   node scripts/build-grammars.mjs [--only <grammar>,...]
//
// Changing a pin is a reviewed decision: set the new version/commit/source, run this with the two sha256 values of the
// old pin, read the mismatch it reports, review the node-types.json diff and the full test suite, then pin the new
// hashes. tests/grammar-pins.test.mjs fails whenever a shipped file's bytes differ from its pin.
//
// Tried and left out: dart (its npm wasm does not load in web-tree-sitter), elixir, haskell, ocaml, julia, powershell,
// fsharp (their grammars expose no name+body structure the generic binding rules can read — file-level facts only, at
// 1–12 MB each). swift ships no prebuilt wasm. The UNSCOPED `tree-sitter-yaml` and `tree-sitter-toml` packages are
// abandoned and ship no wasm. XML ships node-types.json but no prebuilt wasm (issue 006).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'engine', 'grammars');
const requireFromRoot = createRequire(path.join(ROOT, 'package.json'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const REPIN_HINT =
  'If the pin in engine/grammars/manifest.json was changed on purpose, set the sha256 to the value above after reviewing ' +
  'the grammar change (the node-types.json diff and the full test suite); otherwise what was read, downloaded or built is ' +
  'not the pinned grammar.';

function fail(message) {
  process.stderr.write(`[grain] grammars: FAIL: ${message}\n`);
  process.exit(1);
}
function verifyPinned(what, bytes, expected) {
  const actual = sha256(bytes);
  if (actual !== expected)
    throw new Error(`grammar pin mismatch for ${what}: expected sha256 ${expected}, got ${actual}. Nothing was written. ${REPIN_HINT}`);
  return bytes;
}
function readCache(cacheDir, expected) {
  const p = path.join(cacheDir, expected);
  if (!existsSync(p)) return undefined;
  const bytes = readFileSync(p);
  if (sha256(bytes) === expected) return bytes;
  rmSync(p, { force: true });
  process.stderr.write(`[grain] grammars: evicted a damaged cache entry ${p}\n`);
  return undefined;
}
function writeCache(cacheDir, bytes) {
  mkdirSync(cacheDir, { recursive: true });
  const name = sha256(bytes);
  const tmp = path.join(cacheDir, `.${name}.${process.pid}.tmp`);
  writeFileSync(tmp, bytes);
  renameSync(tmp, path.join(cacheDir, name));
}
async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`grammar download failed: ${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
function git(cwd, args) {
  execFileSync('git', ['-c', 'advice.detachedHead=false', ...args], { cwd, stdio: ['ignore', 'ignore', 'inherit'] });
}
function checkout(dir, repo, commit) {
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '.']);
  git(dir, ['fetch', '-q', '--depth', '1', repo, commit]);
  git(dir, ['checkout', '-q', 'FETCH_HEAD']);
}
function treeSitterCli(wanted) {
  let bin;
  try {
    bin = path.join(path.dirname(requireFromRoot.resolve('tree-sitter-cli/package.json')), 'tree-sitter');
  } catch {
    throw new Error('building a grammar from source needs the tree-sitter-cli devDependency: run `npm ci` in plugins/grain.');
  }
  const version = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim().split(/\s+/)[1];
  if (version !== wanted)
    throw new Error(`the grammar pin was built with tree-sitter-cli ${wanted}, but ${version} is installed: run \`npm ci\` in plugins/grain.`);
  return bin;
}
function buildFromSource(pin) {
  const src = pin.source;
  const bin = treeSitterCli(pin.cli);
  const work = mkdtempSync(path.join(os.tmpdir(), 'grain-grammar-'));
  try {
    const repoDir = path.join(work, 'repo');
    checkout(repoDir, pin.repo, pin.commit);
    for (const patch of src.patches ?? []) git(repoDir, ['apply', path.join(ROOT, 'scripts', 'grammar-patches', patch)]);
    for (const dep of src.deps ?? []) checkout(path.join(repoDir, dep.path), dep.repo, dep.commit);
    const grammarDir = path.join(repoDir, src.dir);
    if (src.generate) execFileSync(bin, ['generate'], { cwd: grammarDir, stdio: ['ignore', 'ignore', 'inherit'] });
    const out = path.join(work, 'out.wasm');
    execFileSync(bin, ['build', '--wasm', '-o', out, grammarDir], { cwd: repoDir, stdio: ['ignore', 'ignore', 'inherit'] });
    return { wasm: readFileSync(out), nodeTypes: readFileSync(path.join(grammarDir, 'src', 'node-types.json')) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
const rawNodeTypesUrl = pin =>
  `https://raw.githubusercontent.com/${pin.repo.replace(/^https:\/\/github\.com\//, '')}/${pin.commit}/src/node-types.json`;

async function materialize(g, pin, opts) {
  const src = pin.source;
  const what = file => `${g} (${file})`;
  if (src.kind === 'npm') {
    const pkgJsonPath = requireFromRoot.resolve(`${src.package}/package.json`);
    const installed = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version;
    if (installed !== pin.version)
      throw new Error(`grammar ${g}: ${src.package}@${installed} is installed, but its pin is ${pin.version} — a 0.x grammar minor can rename or restructure node types, so a bump is reviewed, not taken silently (or run \`npm ci\` if node_modules drifted from the lockfile).`);
    const pkgDir = path.dirname(pkgJsonPath);
    return {
      wasm: verifyPinned(what('wasm'), readFileSync(path.join(pkgDir, src.wasmPath)), pin.wasmSha256),
      nodeTypes: verifyPinned(what('node-types.json'), readFileSync(path.join(pkgDir, src.nodeTypesPath)), pin.nodeTypesSha256),
    };
  }
  if (!opts.rebuild) {
    const wasm = readCache(opts.cacheDir, pin.wasmSha256);
    const nodeTypes = readCache(opts.cacheDir, pin.nodeTypesSha256);
    if (wasm && nodeTypes) return { wasm, nodeTypes };
  }
  if (opts.offline) throw new Error(`grammar ${g} is not in the cache (${opts.cacheDir}) and GRAIN_GRAMMAR_OFFLINE=1 forbids fetching or building it.`);
  let files;
  if (src.kind === 'github-release') {
    process.stderr.write(`[grain] grammars: downloading ${g} ${pin.version} from ${src.wasmUrl}\n`);
    files = { wasm: await download(src.wasmUrl), nodeTypes: await download(rawNodeTypesUrl(pin)) };
  } else if (src.kind === 'source') {
    process.stderr.write(`[grain] grammars: building ${g} from ${pin.repo} at ${pin.commit} with tree-sitter-cli ${pin.cli}\n`);
    files = buildFromSource(pin);
  } else throw new Error(`grammar ${g}: unknown source kind ${src.kind}`);
  verifyPinned(what('wasm'), files.wasm, pin.wasmSha256);
  verifyPinned(what('node-types.json'), files.nodeTypes, pin.nodeTypesSha256);
  writeCache(opts.cacheDir, files.wasm);
  writeCache(opts.cacheDir, files.nodeTypes);
  return files;
}

const argv = process.argv.slice(2);
let only = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--only') only = new Set(argv[++i].split(','));
  else fail(`unknown argument ${argv[i]}`);
}
const opts = {
  cacheDir: process.env.GRAIN_GRAMMAR_CACHE || path.join(os.homedir(), '.cache', 'grain', 'grammars'),
  rebuild: process.env.GRAIN_GRAMMAR_REBUILD === '1',
  offline: process.env.GRAIN_GRAMMAR_OFFLINE === '1',
};
try {
  const manifest = JSON.parse(readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  const names = Object.keys(manifest).filter(g => !only || only.has(g));
  if (only && names.length !== only.size) fail(`--only names a grammar the manifest does not pin: ${[...only].join(', ')}`);
  // materialize everything first, write after: a failing pin leaves no partial set behind
  const outputs = [];
  for (const g of names) outputs.push([g, await materialize(g, manifest[g], opts)]);
  for (const [g, files] of outputs) {
    writeFileSync(path.join(OUT, `tree-sitter-${g}.wasm`), files.wasm);
    writeFileSync(path.join(OUT, `tree-sitter-${g}.node-types.json`), files.nodeTypes);
  }
  process.stderr.write(`[grain] grammars: wrote ${outputs.length} pinned grammars (wasm + node-types.json, sha256-verified)\n`);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

// vendor the runtime — the pinned devDependency version, exactly
const wtsSrc = path.join(ROOT, 'node_modules', 'web-tree-sitter');
const wtsOut = path.join(ROOT, 'engine', 'vendor', 'web-tree-sitter');
mkdirSync(wtsOut, { recursive: true });
for (const f of ['web-tree-sitter.js', 'web-tree-sitter.wasm', 'LICENSE']) copyFileSync(path.join(wtsSrc, f), path.join(wtsOut, f));
const wtsVer = JSON.parse(readFileSync(path.join(wtsSrc, 'package.json'), 'utf8')).version;
writeFileSync(path.join(wtsOut, 'VERSION'), wtsVer + '\n');
process.stderr.write(`[grain] vendored web-tree-sitter ${wtsVer}\n`);
