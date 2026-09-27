#!/usr/bin/env node
// The grammar pipeline: turns every pin of the family's grammar manifest into the two files the engine loads,
// `tree-sitter-<g>.wasm` (the parser) and `tree-sitter-<g>.node-types.json` (the grammar metadata the engine derives
// its language bindings from — §6.2 of the spec), and vendors the web-tree-sitter runtime (js + wasm + LICENSE) into
// engine/vendor/web-tree-sitter/, so the installed plugin needs NO node_modules at runtime. Outputs are committed.
//
// The pins, the patches and the recipe are Runes' (engine/vendor/runes/: grammars/manifest.json, grammars/patches/,
// dist/grammars' buildGrammars), vendored under engine/vendor/runes.pin.json, so Grain and Yggdrasil ship the same
// bytes from one manifest. Every file is written only after its bytes matched the pinned sha256, whatever its source
// (an npm devDependency at its pinned version, a release asset, or a source build at a commit with the pinned
// tree-sitter-cli). A pin changes in Runes, and reaches Grain by `node scripts/runes.mjs update`, never here.
//
// Downloads and builds land in Runes' content-addressed cache (RUNES_GRAMMAR_CACHE, default ~/.cache/runes/grammars).
// GRAIN_GRAMMAR_REBUILD=1 ignores the cache; GRAIN_GRAMMAR_OFFLINE=1 forbids downloads and builds.
//
//   node scripts/build-grammars.mjs [--only <language>,...]      (Runes language ids: csharp, not c_sharp)
//
// Tried and left out: dart (its npm wasm does not load in web-tree-sitter), elixir, haskell, ocaml, julia, powershell,
// fsharp (their grammars expose no name+body structure the generic binding rules can read — file-level facts only, at
// 1–12 MB each). swift ships no prebuilt wasm. The UNSCOPED `tree-sitter-yaml` and `tree-sitter-toml` packages are
// abandoned and ship no wasm. XML ships node-types.json but no prebuilt wasm (issue 006).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGrammars } from '../engine/vendor/runes/dist/grammars/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'engine', 'grammars');

function fail(message) {
  process.stderr.write(`[grain] grammars: FAIL: ${message}\n`);
  process.exit(1);
}

const argv = process.argv.slice(2);
let only;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--only' && argv[i + 1]) only = argv[++i].split(',');
  else fail(`unknown argument ${argv[i]}`);
}
try {
  const built = await buildGrammars({
    outDir: OUT,
    only,
    resolveFrom: ROOT,
    rebuild: process.env.GRAIN_GRAMMAR_REBUILD === '1',
    offline: process.env.GRAIN_GRAMMAR_OFFLINE === '1',
    log: line => process.stderr.write(`[grain] grammars: ${line}\n`),
  });
  process.stderr.write(`[grain] grammars: ${built.length} pinned grammars in place (wasm + node-types.json, sha256-verified)\n`);
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
