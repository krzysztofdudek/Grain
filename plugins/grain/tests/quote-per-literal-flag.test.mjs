// §077 (director-approved follow-up to §042, esc-1): §042 shipped honest disclosure for the quote-style
// convention's per-FILE vote (`governed[].withinFile` + a `conforms to:` clause) but deliberately left the 22
// (express) / 12 (flask) minority literals that depart their file's majority WITHOUT a forcing delimiter counted,
// never flagged. This ticket adds the per-literal flag for exactly those genuine departures, reusing the same
// delimiter-forced content test §042 already measured (11/11 telescope.nvim, 19/31 flask, 2/24 express minority
// literals contain the majority delimiter in their own body and are therefore forced, not chosen) — see
// `quoteFlags`/`lexTally` in core.mjs and docs/validation.md's §042/§077 entries.
//
// No new constant: the flag exists only where the file-level convention already governs this file (the same
// `governed[].withinFile` gate §042 built), and renders as part of that SAME clause — never a new line/section.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const dateEnv = iso => ({
  GIT_AUTHOR_NAME: 'T',
  GIT_AUTHOR_EMAIL: 't@x',
  GIT_COMMITTER_NAME: 'T',
  GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: iso,
  GIT_COMMITTER_DATE: iso,
});
const git = (env, ...a) =>
  execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const w = (rel, content) => {
  mkdirSync(join(repo, dirname(rel)), { recursive: true });
  writeFileSync(join(repo, rel), content);
};
const grain = args => {
  const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status };
};
const quoteFact = json => json.governed.find(g => g.convention.endsWith('auto.lex:quote'));

// builds a TS class body one string-literal method at a time and reports, alongside the source, the exact 1-indexed
// line of each literal's `return` statement — so the fixture and the assertions can never drift on "which line".
function buildModel(cls, parts) {
  const lines = [`export class ${cls}Model {`];
  const litLines = [];
  parts.forEach((p, i) => {
    lines.push(`  m${i}() {`);
    lines.push(`    return ${p.q}${p.body}${p.q};`);
    litLines.push(lines.length);
    lines.push('  }');
  });
  lines.push('}');
  lines.push('');
  return { content: lines.join('\n'), litLines };
}
const doubles = (n, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({ q: '"', body: `v${offset + i}` }));

// ModelC: the original 042 repro, exactly 7 single-quoted literals landing in an otherwise all-double file — but
// unlike 042's own fixture, 3 of the 7 contain the file's majority delimiter (`"`) in their own body (delimiter-
// forced: switching them to double would need escaping) and 4 do not (genuine style departures). 7/37 = 18.9%
// stays under the per-file vote's 20% tolerance, so the categorical is still `double` and the file still reports
// conforming — the exact shape the original reporter hit.
const GENUINE = ['plain0', 'plain1', 'plain2', 'plain3'];
const FORCED = ['has "quote" a', 'has "quote" b', 'has "quote" c'];
const modelCParts = [
  ...doubles(30),
  ...GENUINE.map(body => ({ q: "'", body })),
  ...FORCED.map(body => ({ q: "'", body })),
];
const modelC = buildModel('C', modelCParts);
const genuineLines = modelC.litLines.slice(30, 30 + GENUINE.length);
const forcedLines = modelC.litLines.slice(30 + GENUINE.length);

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-quoteflag-'));
  repo = join(tmp, 'r');
  mkdirSync(repo);
  git({}, 'init', '-q', '-b', 'main');
  git({}, 'config', 'commit.gpgsign', 'false');
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  // 24 fully double-quoted corpus files establish "files here quote strings with double quotes"
  for (let i = 1; i <= 24; i++) w(`src/models/Model${i}.ts`, buildModel(`Model${i}`, doubles(2, i * 10)).content);
  // one all-single file, so quote style is observably a CHOICE in this partition
  w('src/models/ModelB.ts', buildModel('B', [{ q: "'", body: 'x0' }, { q: "'", body: 'x1' }, { q: "'", body: 'x2' }]).content);
  // the file under test: a majority-conforming file that holds both forced and genuine minority literals
  w('src/models/ModelC.ts', modelC.content);
  // requirement (c): a file with too few string literals (< 2) for the per-file vote to run at all — no local
  // `auto.lex:quote` categorical is ever computed for it, so the fact cannot govern it, no matter how strongly
  // established the convention is corpus-wide.
  w('src/models/ModelE.ts', buildModel('E', [{ q: '"', body: 'only' }]).content);
  git(d1, 'add', '-A');
  git(d1, 'commit', '-qm', 'add models');
  w('NOTES.md', 'notes\n');
  git(dateEnv('2026-03-10T12:00:00Z'), 'add', 'NOTES.md');
  git(dateEnv('2026-03-10T12:00:00Z'), 'commit', '-qm', 'notes');
  const rep = spawnSync('node', [BIN, 'report', '--top', '60'], { cwd: repo, encoding: 'utf8' });
  assert.match(
    rep.stdout,
    /quote strings with double quotes/,
    `sanity: the quote-style convention must be established: ${rep.stdout}`
  );
});
after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// (a) the original 042 repro: flags the violating literals, specifically the ones NOT delimiter-forced
test('7 single-quoted literals land in a 100%-double file — only the 4 not delimiter-forced are flagged', () => {
  const j = JSON.parse(grain(['check', 'src/models/ModelC.ts', '--json']).out);
  const f = quoteFact(j);
  assert.ok(f, `the quote convention must govern ModelC.ts: ${JSON.stringify(j.governed)}`);
  assert.ok(f.withinFile, `the per-file vote must disclose the hidden instances: ${JSON.stringify(f)}`);
  assert.equal(f.withinFile.total, 37, 'every string literal in the file is counted');
  assert.equal(f.withinFile.conforming, 30, 'only the double-quoted literals conform');
  assert.equal(f.withinFile.flagged, GENUINE.length, `exactly the ${GENUINE.length} non-forced literals are flagged`);
  assert.deepEqual(
    [...f.withinFile.flagLines].sort((a, b) => a - b),
    [...genuineLines].sort((a, b) => a - b),
    'the flagged lines are exactly the genuine (non-delimiter-forced) minority literals'
  );
  const out = grain(['check', 'src/models/ModelC.ts']).out;
  assert.match(out, /conforms to:/, `expected a conformance line: ${out}`);
  assert.match(
    out,
    new RegExp(`scored per file, not per string literal: 7 of 37 string literals`),
    `the tally clause must still disclose the full departing count: ${out}`
  );
  assert.match(
    out,
    new RegExp(`${GENUINE.length} flagged as a genuine violation`),
    `the printed line must carry the flag, not only --json: ${out}`
  );
});

// (b) a delimiter-forced literal — one containing the majority delimiter in its own body — must never flag, even
// though it is itself a minority-quote literal counted in the same tally as the genuine violations above.
test('a delimiter-forced minority literal is excluded from the flag', () => {
  const j = JSON.parse(grain(['check', 'src/models/ModelC.ts', '--json']).out);
  const f = quoteFact(j);
  for (const ln of forcedLines)
    assert.ok(
      !f.withinFile.flagLines.includes(ln),
      `line ${ln} contains the majority delimiter in its own body and must not be flagged: ${JSON.stringify(f.withinFile)}`
    );
  const out = grain(['check', 'src/models/ModelC.ts']).out;
  for (const ln of forcedLines)
    assert.doesNotMatch(
      out,
      new RegExp(`line ${ln}\\b`),
      `forced line ${ln} must not appear as a flagged line in: ${out}`
    );
});

// (c) a file with no certified quote convention for it — too few string literals to run the per-file vote at all
// — flags nothing from this mechanism (indeed, the surface does not govern the file at all).
test('a file with too few string literals to run the per-file vote carries no quote flag', () => {
  const j = JSON.parse(grain(['check', 'src/models/ModelE.ts', '--json']).out);
  const f = quoteFact(j);
  assert.equal(f, undefined, `a file with fewer than 2 string literals must not be governed by auto.lex:quote at all: ${JSON.stringify(j.governed)}`);
  const out = grain(['check', 'src/models/ModelE.ts']).out;
  assert.doesNotMatch(out, /flagged as a genuine violation/, `no per-literal flag belongs on an ungoverned file: ${out}`);
});
