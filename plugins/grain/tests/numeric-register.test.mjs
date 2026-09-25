// The numeric register (docs/mathematics.md, "The numeric register") is the page's promise that a reader can see
// every number the engine compares against. This test keeps the promise honest in both directions:
//   1. every named constant in config.mjs (CFG, NCAP, SUP, TOPK) has a row, and the row's value equals the code's;
//   2. every audited literal in engine/*.mjs code — a non-integer number, a literal ratio such as `2 / 3` or
//      `(n * 2) / 3`, a literal day window `N * 86400` or `/ 86400 <= N` — sits on a line that a register row
//      covers (same file, the row's code fragment on that line, the literal inside the fragment);
//   3. every register row's code fragment still appears in its file, so a changed value cannot keep a stale row.
// Integer floors (`n >= 4`) are not audited; the page says so. Strings and comments are stripped before scanning, so
// a literal inside a template string's `${…}` is not seen (the page lists the one such gate by hand).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG, NCAP, SUP, TOPK } from '../engine/config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const engineDir = join(here, '..', 'engine');
const mathMd = readFileSync(join(here, '..', '..', '..', 'docs', 'mathematics.md'), 'utf8');

const section = (() => {
  const i = mathMd.indexOf('\n## The numeric register');
  assert.ok(i >= 0, 'docs/mathematics.md has no "## The numeric register" section');
  const rest = mathMd.slice(i + 1);
  const j = rest.indexOf('\n## ', 3);
  return j < 0 ? rest : rest.slice(0, j);
})();
const tableRows = section
  .split('\n')
  .filter(l => l.startsWith('| ') && !l.startsWith('|---'))
  .map(l => l.slice(1, -1).split(' | ').map(c => c.trim()));

// strings replaced by "", then a trailing `//` comment dropped; a line that is itself a comment yields ''
export function codeOf(line) {
  if (/^\s*(\/\/|\*|\/\*)/.test(line)) return '';
  return line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\/.*$/, '');
}
const norm = s => s.replace(/\s+/g, '');
const LITERAL_RES = [
  /(?<![\w.])\d+\.\d+(?![\w.])/g, // non-integer number
  /(?<![\w.)\]])\d+\s*\/\s*\d+(?![\w.])/g, // literal ratio
  /\*\s*\d+\)\s*\/\s*\d+(?![\w.])/g, // `(n * 2) / 3`
  /\d+\s*\*\s*86400/g, // day window
  /86400\s*(?:<=|<|>=|>)\s*\d+/g, // day window
];

const engineFiles = readdirSync(engineDir).filter(f => f.endsWith('.mjs'));
const sources = Object.fromEntries(engineFiles.map(f => [f, readFileSync(join(engineDir, f), 'utf8').split('\n')]));

const named = tableRows.filter(r => r.length === 3 && /^`\w+`$/.test(r[0]));
const literalRows = tableRows
  .filter(r => r.length === 5 && r[0] !== 'value')
  .map(r => ({ files: r[1] === '*' ? engineFiles : r[1].split(',').map(x => x.trim()), frag: r[2].replace(/^`|`$/g, ''), raw: r }));

test('sanity: the register was parsed', () => {
  assert.ok(named.length >= 20, `named-constant rows parsed: ${named.length}`);
  assert.ok(literalRows.length >= 50, `literal rows parsed: ${literalRows.length}`);
});

test('every named constant in config.mjs has a register row with the code value', () => {
  const fmt = o => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ');
  const code = { ...Object.fromEntries(Object.entries(CFG).map(([k, v]) => [k, String(v)])), NCAP: String(NCAP), SUP: fmt(SUP), TOPK: fmt(TOPK) };
  const doc = Object.fromEntries(named.map(r => [r[0].slice(1, -1), r[1]]));
  const problems = [];
  for (const [k, v] of Object.entries(code)) {
    if (!(k in doc)) problems.push(`${k} = ${v} has no row`);
    else if (doc[k] !== v) problems.push(`${k}: register says ${doc[k]}, config.mjs says ${v}`);
  }
  for (const k of Object.keys(doc)) if (!(k in code)) problems.push(`${k} has a row but no constant in config.mjs`);
  assert.deepEqual(problems, []);
});

test('every register row names real files and its code still appears there', () => {
  const problems = [];
  for (const row of literalRows) {
    for (const f of row.files) if (!sources[f]) problems.push(`row ${row.raw.join(' | ')}: no engine file ${f}`);
    const found = row.files.some(f => sources[f] && sources[f].some(l => !/^\s*(\/\/|\*|\/\*)/.test(l) && norm(l).includes(norm(row.frag))));
    if (!found) problems.push(`row \`${row.frag}\` (${row.raw[1]}): code not found — the value changed or the line moved away`);
  }
  assert.deepEqual(problems, []);
});

test('every audited numeric literal in engine code is on the register', () => {
  const missing = [];
  for (const f of engineFiles) {
    const rows = literalRows.filter(r => r.files.includes(f));
    sources[f].forEach((line, i) => {
      const c = codeOf(line);
      if (!c) return;
      const nc = norm(c);
      for (const re of LITERAL_RES)
        for (const m of c.matchAll(re)) {
          const lit = norm(m[0]);
          if (!rows.some(r => nc.includes(norm(r.frag)) && norm(r.frag).includes(lit)))
            missing.push(`${f}:${i + 1}: ${m[0]}   | ${c.trim().slice(0, 120)}`);
        }
    });
  }
  assert.deepEqual(missing, [], 'add a row to "The numeric register" in docs/mathematics.md (or derive the number) for:\n' + missing.join('\n'));
});

test('the audit catches an unlisted gate (self-check on a synthetic line)', () => {
  const c = codeOf('  if (share >= 0.42 && n / m >= 3 / 5) keep(x); // a comment 0.99');
  const hits = LITERAL_RES.flatMap(re => [...c.matchAll(re)].map(m => m[0]));
  assert.deepEqual(hits.sort(), ['0.42', '3 / 5'].sort());
});
