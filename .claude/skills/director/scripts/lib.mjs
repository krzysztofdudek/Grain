// Shared helpers for the director skill's toolset (handoff.mjs, decide.mjs, escalate.mjs, wave.mjs).
// Zero deps, Node ESM, node core modules only.

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Resolve the repo root by walking up from this file's own location until a
// directory containing `.git` is found. This is independent of process.cwd(),
// so the scripts behave the same regardless of where they're invoked from.
export function repoRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`repo root not found: no .git above ${dirname(fileURLToPath(import.meta.url))}`);
    }
    dir = parent;
  }
}

export function sysPath(root, ...parts) {
  return join(root, '.system', ...parts);
}

export function readJSON(file, fallback) {
  if (!existsSync(file)) return fallback;
  const raw = readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`invalid JSON in ${file}: ${e.message}`);
  }
}

export function writeJSON(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

export function readText(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

export function writeText(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

export function appendText(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, text);
}

export function nowIso() {
  return new Date().toISOString();
}

export function today() {
  return nowIso().slice(0, 10);
}

function gitOut(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

export function gitHead(root) {
  const sha = gitOut(root, ['rev-parse', '--short', 'HEAD']);
  const branch = gitOut(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!sha && !branch) return 'unknown';
  return `${branch || '?'}@${sha || '?'}`;
}

export function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

// A small, permissive CLI arg parser. `--json` and `--help` are always
// recognized as boolean flags. Any other `--name value` pair becomes
// flags[name] = value; a `--name` with no following value (or followed by
// another flag) becomes flags[name] = true. A flag repeated more than once
// collects into an array, in order of appearance. Everything else is
// positional, in order.
export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') { flags.json = true; continue; }
    if (a === '--help' || a === '-h') { flags.help = true; continue; }
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const next = argv[i + 1];
      let value;
      if (next === undefined || next.startsWith('--')) {
        value = true;
      } else {
        value = next;
        i++;
      }
      if (Object.prototype.hasOwnProperty.call(flags, name)) {
        flags[name] = Array.isArray(flags[name]) ? [...flags[name], value] : [flags[name], value];
      } else {
        flags[name] = value;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

export function asArray(v) {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function emitResult(flags, data, human) {
  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(human());
  }
}

// True when this module was invoked directly as a script (not imported).
// Compares realpaths rather than raw strings/URLs: on macOS, tmp dirs live
// under /var/folders/..., a symlink to /private/var/folders/...; Node
// resolves import.meta.url through that symlink but leaves process.argv[1]
// as typed, so a plain string comparison silently mismatches there.
export function isMain(moduleUrl) {
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
