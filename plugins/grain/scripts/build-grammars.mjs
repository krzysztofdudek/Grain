#!/usr/bin/env node
// Copies the tree-sitter grammar assets the engine needs out of node_modules into engine/grammars/:
// for each grammar, `tree-sitter-<g>.wasm` (the parser) and `tree-sitter-<g>.node-types.json`
// (the grammar metadata the engine derives its language bindings from — §6.2 of the spec).
// Also vendors the web-tree-sitter runtime (js + wasm + LICENSE) into engine/vendor/web-tree-sitter/, so the
// installed plugin needs NO node_modules at runtime: grammars and the parser ship inside the plugin directory.
// Runs on demand (`npm run build:grammars`) after `npm install`. Idempotent; outputs are committed.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'engine', 'grammars');
mkdirSync(out, { recursive: true });

// grammar name → { package, wasm path inside the package, node-types path inside the package }
const GRAMMARS = {
  typescript: { pkg: 'tree-sitter-typescript', wasm: 'tree-sitter-typescript.wasm', nodeTypes: 'typescript/src/node-types.json' },
  tsx:        { pkg: 'tree-sitter-typescript', wasm: 'tree-sitter-tsx.wasm',        nodeTypes: 'tsx/src/node-types.json' },
  javascript: { pkg: 'tree-sitter-javascript', wasm: 'tree-sitter-javascript.wasm', nodeTypes: 'src/node-types.json' },
  python:     { pkg: 'tree-sitter-python',     wasm: 'tree-sitter-python.wasm',     nodeTypes: 'src/node-types.json' },
  go:         { pkg: 'tree-sitter-go',         wasm: 'tree-sitter-go.wasm',         nodeTypes: 'src/node-types.json' },
  java:       { pkg: 'tree-sitter-java',       wasm: 'tree-sitter-java.wasm',       nodeTypes: 'src/node-types.json' },
  c_sharp:    { pkg: 'tree-sitter-c-sharp',    wasm: 'tree-sitter-c_sharp.wasm',    nodeTypes: 'src/node-types.json' },
  ruby:       { pkg: 'tree-sitter-ruby',       wasm: 'tree-sitter-ruby.wasm',       nodeTypes: 'src/node-types.json' },
  rust:       { pkg: 'tree-sitter-rust',       wasm: 'tree-sitter-rust.wasm',       nodeTypes: 'src/node-types.json' },
  php:        { pkg: 'tree-sitter-php',        wasm: 'tree-sitter-php.wasm',        nodeTypes: 'php/src/node-types.json' },
  c:          { pkg: 'tree-sitter-c',          wasm: 'tree-sitter-c.wasm',          nodeTypes: 'src/node-types.json' },
  cpp:        { pkg: 'tree-sitter-cpp',        wasm: 'tree-sitter-cpp.wasm',        nodeTypes: 'src/node-types.json' },
  kotlin:     { pkg: '@tree-sitter-grammars/tree-sitter-kotlin', wasm: 'tree-sitter-kotlin.wasm', nodeTypes: 'src/node-types.json' },
  scala:      { pkg: 'tree-sitter-scala',      wasm: 'tree-sitter-scala.wasm',      nodeTypes: 'src/node-types.json' },
  bash:       { pkg: 'tree-sitter-bash',       wasm: 'tree-sitter-bash.wasm',       nodeTypes: 'src/node-types.json' },
  lua:        { pkg: '@tree-sitter-grammars/tree-sitter-lua', wasm: 'tree-sitter-lua.wasm', nodeTypes: 'src/node-types.json' },
  zig:        { pkg: '@tree-sitter-grammars/tree-sitter-zig', wasm: 'tree-sitter-zig.wasm', nodeTypes: 'src/node-types.json' },
  groovy:     { pkg: 'tree-sitter-groovy',     wasm: 'tree-sitter-groovy.wasm',     nodeTypes: 'src/node-types.json' },
  solidity:   { pkg: 'tree-sitter-solidity',   wasm: 'tree-sitter-solidity.wasm',   nodeTypes: 'src/node-types.json' },
};

// Tried and left out: dart (its npm wasm does not load in web-tree-sitter 0.26), elixir, haskell, ocaml, julia,
// powershell, fsharp (their grammars expose no name+body structure the generic binding rules can read — they would
// yield file-level facts only, at 1–12 MB each). swift ships no prebuilt wasm.
const manifest = {};
let missing = 0;
for (const [g, spec] of Object.entries(GRAMMARS)) {
  const pkgDir = join(root, 'node_modules', spec.pkg);
  const wasm = join(pkgDir, spec.wasm); const nt = join(pkgDir, spec.nodeTypes);
  if (!existsSync(wasm) || !existsSync(nt)) { console.error(`[grain] grammar ${g}: missing ${existsSync(wasm) ? nt : wasm}`); missing++; continue; }
  copyFileSync(wasm, join(out, `tree-sitter-${g}.wasm`));
  copyFileSync(nt, join(out, `tree-sitter-${g}.node-types.json`));
  const ver = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
  manifest[g] = { package: spec.pkg, version: ver };
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// vendor the runtime
const wtsSrc = join(root, 'node_modules', 'web-tree-sitter');
const wtsOut = join(root, 'engine', 'vendor', 'web-tree-sitter');
mkdirSync(wtsOut, { recursive: true });
for (const f of ['web-tree-sitter.js', 'web-tree-sitter.wasm', 'LICENSE']) copyFileSync(join(wtsSrc, f), join(wtsOut, f));
const wtsVer = JSON.parse(readFileSync(join(wtsSrc, 'package.json'), 'utf8')).version;
writeFileSync(join(wtsOut, 'VERSION'), wtsVer + '\n');
console.error(`[grain] vendored web-tree-sitter ${wtsVer}`);
console.error(`[grain] grammars built: ${Object.keys(manifest).join(', ')}${missing ? ` (${missing} missing)` : ''}`);
process.exit(missing ? 1 : 0);
