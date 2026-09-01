#!/usr/bin/env node
// grain entry point.
//
// V8 compiles every grammar twice: a fast baseline (Liftoff) first, then an optimizing compile (TurboFan) on background
// threads. For the 3–5 MB grammars (C#, Kotlin, Scala, C++) that second compile costs ~500 MB of RSS within 50 ms of the first
// parse — measured: `check` on one Kotlin file 97 MB → 600 MB while sitting idle; a cold index 937 MB → 393 MB without it.
// A query parses one file and exits, so the optimized code never pays for itself: queries re-run themselves under
// `--liftoff-only` (one extra node start, ~40 ms). `refresh` — an explicit, long build — keeps the optimizer (≈ 35 % faster).
// GRAIN_V8=off disables the re-exec.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const FLAG = '--liftoff-only';
if (!process.execArgv.includes(FLAG) && process.env.GRAIN_V8 !== 'off' && process.argv[2] !== 'refresh') {
  const r = spawnSync(process.execPath, [FLAG, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, GRAIN_V8: 'off' },
  });
  process.exit(r.status ?? 1);
}
// Exits explicitly (the tree-sitter runtime keeps handles alive otherwise) — but only after stdout has drained: a pipe
// takes 64 KB synchronously and the rest asynchronously, so `process.exit` right after a large answer (export) truncated it.
const { main } = await import('../engine/grain.mjs');
let code = 1;
try {
  code = await main(process.argv.slice(2));
} catch (e) {
  console.error('[grain] ' + (process.env.GRAIN_DEBUG ? e.stack || e : e?.message || e));
  code = 1;
}
process.stdout.write('', () => process.stderr.write('', () => process.exit(code)));
