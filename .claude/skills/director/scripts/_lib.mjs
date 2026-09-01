// Shared internals for the director skill's scripts (tk.mjs, queue.mjs, status.mjs, premerge.mjs).
// Not a user-facing command — imported only. Zero dependencies, Node ESM.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- repo root -------------------------------------------------------------
// Default: walk up from the calling script's own location until a `.git`
// entry (dir or file — worktrees use a file) is found. `--root <path>` on
// any script, or GRAIN_DIRECTOR_ROOT in the environment, overrides this —
// useful for pointing a script at a different checkout — but neither is
// ever written into a file; the default is always the automatic walk-up.
export function findRepoRoot(fromUrl, override) {
  if (override) return override;
  if (process.env.GRAIN_DIRECTOR_ROOT) return process.env.GRAIN_DIRECTOR_ROOT;
  let dir = dirname(fileURLToPath(fromUrl));
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`could not find repo root (.git) walking up from ${fromUrl}`);
    dir = parent;
  }
}

export function systemDir(root) { return join(root, '.system'); }
export function issuesDir(root) { return join(systemDir(root), 'issues'); }
export function queueJsonPath(root) { return join(systemDir(root), 'queue.json'); }
export function queueMdPath(root) { return join(systemDir(root), 'queue.md'); }
export function cacheDir(root) { return join(systemDir(root), 'cache'); }
export function lastSuitePath(root) { return join(cacheDir(root), 'last-suite.json'); }

// --- small utilities ---------------------------------------------------
export function pad3(n) { return String(n).padStart(3, '0'); }

export function todayDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

export function readJSONSafe(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`invalid JSON in ${path}: ${e.message}`);
  }
}

export function writeJSON(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

export function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

export { basename };

// --- arg parsing ---------------------------------------------------------
// Splits argv into { positional, flags }. `--name value` for any flag not
// listed in `boolean`; `--name` alone (no value) for those that are.
// `--root` and `--json` are always recognized (root: string, json: bool).
export function parseArgs(argv, { boolean = [] } = {}) {
  const bools = new Set(['json', ...boolean]);
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      if (bools.has(name)) {
        flags[name] = true;
      } else {
        flags[name] = argv[++i];
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

// --- table printing --------------------------------------------------------
export function printTable(rows, columns) {
  if (rows.length === 0) {
    console.log('(none)');
    return;
  }
  const widths = columns.map((c) =>
    Math.max(c.header.length, ...rows.map((r) => String(r[c.key] ?? '').length))
  );
  const line = (cells) => cells.map((s, i) => s.padEnd(widths[i])).join('  ').trimEnd();
  console.log(line(columns.map((c) => c.header)));
  for (const r of rows) {
    console.log(line(columns.map((c) => String(r[c.key] ?? ''))));
  }
}
