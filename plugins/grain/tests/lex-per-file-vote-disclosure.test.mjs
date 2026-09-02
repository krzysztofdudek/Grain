// §042: a lexical style surface (`auto.lex:quote`, `:semi`, `:decl`, `:indent`) is scored as a per-FILE majority
// vote — `lexicalPreds` (core.mjs) collapses every string literal in a file into ONE categorical, `double` while at
// most 20% of them are single-quoted. `check` then compares that one value and reports the file conforming. So a
// file can hold, or gain, many literals that depart from the stated convention while `check` says nothing at all:
// measured on telescope.nvim, `lua/telescope/previewers/buffer_previewer.lua` absorbs 50 newly added single-quoted
// literals in silence and only flips at 51; express's `test/acceptance/mvc.js` absorbs 12 and flips at 15.
//
// The vote is the right unit to MINE and stays untouched here (a delimiter forced by the content — `'he said "hi"'`
// — is not a style choice; 11 of 11 minority literals in telescope.nvim are exactly that, and per-literal mining
// would widen the candidate universe that `idxCost` counts). What is wrong is what `check` SAYS: it reports a
// binary conforming verdict without disclosing that the verdict is a majority over instances it never names.
//
// These tests pin the disclosure: when the per-file vote hides departing instances, `check` must say how many, in
// both --json (`governed[].withinFile`) and the printed `conforms to:` line — and must stay silent when a file
// conforms instance-by-instance, so the clause is load-bearing rather than boilerplate.
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

// ModelC: DOUBLES double-quoted literals + SINGLES single-quoted ones. 3 of 23 = 13% stays under the vote's 20%
// tolerance, so the file's categorical is still `double` and `check` calls it conforming — the exact shape the
// reporter hit, committed rather than dirty so the conforming line is rendered without diff scoping.
const DOUBLES = 20,
  SINGLES = 3;
const body = (cls, dq, sq) => {
  const ms = [];
  for (let i = 0; i < dq; i++) ms.push(`  d${i}() {\n    return "v${i}";\n  }`);
  for (let i = 0; i < sq; i++) ms.push(`  s${i}() {\n    return 'v${i}';\n  }`);
  return `export class ${cls}Model {\n${ms.join('\n')}\n}\n`;
};

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-lexvote-'));
  repo = join(tmp, 'r');
  mkdirSync(repo);
  git({}, 'init', '-q', '-b', 'main');
  git({}, 'config', 'commit.gpgsign', 'false');
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  // 24 fully double-quoted corpus files establish "files here quote strings with double quotes"
  for (let i = 1; i <= 24; i++) w(`src/models/Model${i}.ts`, body(`Model${i}`, 2, 0));
  // one all-single file, so quote style is observably a CHOICE in this partition (lexDomain needs >= 2 values)
  w('src/models/ModelB.ts', body('ModelB', 0, 3));
  // the file under test: a majority-conforming file that nonetheless holds departing literals
  w('src/models/ModelC.ts', body('ModelC', DOUBLES, SINGLES));
  // the control: conforming at BOTH granularities — every literal is double-quoted
  w('src/models/ModelD.ts', body('ModelD', DOUBLES, 0));
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

test('a majority-conforming file still reports conforming — the acceptance criterion is deliberately unchanged', () => {
  const j = JSON.parse(grain(['check', 'src/models/ModelC.ts', '--json']).out);
  const f = quoteFact(j);
  assert.ok(f, `the quote convention must govern this file: ${JSON.stringify(j.governed)}`);
  assert.equal(f.conforming, f.scopes, 'the per-file vote still passes: this ticket changes disclosure, not mining');
  assert.equal(f.scopes, 1, 'a file-kind fact governs exactly one scope — the file itself');
});

test('--json discloses how many instances the per-file vote hid', () => {
  const j = JSON.parse(grain(['check', 'src/models/ModelC.ts', '--json']).out);
  const f = quoteFact(j);
  assert.ok(
    f.withinFile,
    `a file whose literals do not all conform must carry withinFile: ${JSON.stringify(f)}`
  );
  assert.equal(f.withinFile.total, DOUBLES + SINGLES, 'every string literal in the file is counted');
  assert.equal(f.withinFile.conforming, DOUBLES, 'only the double-quoted literals conform');
  assert.equal(f.withinFile.surface, 'auto.lex:quote', 'the disclosure names the surface it counted');
});

test('the printed `conforms to:` line says it, not only --json', () => {
  const out = grain(['check', 'src/models/ModelC.ts']).out;
  assert.match(out, /conforms to:/, `expected a conformance line: ${out}`);
  assert.match(
    out,
    new RegExp(`scored per file, not per string literal: ${SINGLES} of ${DOUBLES + SINGLES} string literals`),
    `the conformance claim must disclose the instances the vote could not see: ${out}`
  );
});

// the reported shape: a file 100% conforming at HEAD gains departing literals in an edit far from line 1. The vote
// does not move, and diff scoping keeps the fact off `conforms to:` (a file-kind pseudo-scope sits at line 1), so on
// main this edit produced no output whatsoever. The disclosure must not depend on where in the file the edit landed.
test('an edit deep in the file that adds departing literals is disclosed even though the vote holds', () => {
  const path = join(repo, 'src', 'models', 'ModelD.ts');
  const added = 3;
  writeFileSync(path, body('ModelD', DOUBLES, added));
  try {
    const diff = execFileSync('git', ['-C', repo, 'diff', '-U0', '--', 'src/models/ModelD.ts'], {
      encoding: 'utf8',
    });
    assert.doesNotMatch(diff, /^@@ -1\b/m, 'sanity: the edit must not touch line 1, the premise of the reported case');
    const j = JSON.parse(grain(['check', 'src/models/ModelD.ts', '--json']).out);
    const f = quoteFact(j);
    assert.equal(f.conforming, f.scopes, 'sanity: the per-file vote still passes — that is the whole complaint');
    assert.deepEqual(
      { c: f.withinFile.conforming, t: f.withinFile.total },
      { c: DOUBLES, t: DOUBLES + added },
      `the added literals must be disclosed: ${JSON.stringify(f)}`
    );
    const out = grain(['check', 'src/models/ModelD.ts']).out;
    assert.match(
      out,
      new RegExp(`scored per file, not per string literal: ${added} of ${DOUBLES + added} string literals`),
      `the printed output must disclose them too, not only --json: ${out}`
    );
  } finally {
    execFileSync('git', ['-C', repo, 'checkout', '-q', 'HEAD', '--', 'src/models/ModelD.ts']);
  }
});

test('a file conforming instance-by-instance carries no disclosure — the clause stays load-bearing', () => {
  const j = JSON.parse(grain(['check', 'src/models/ModelD.ts', '--json']).out);
  const f = quoteFact(j);
  assert.ok(f, `the quote convention must govern the control file too: ${JSON.stringify(j.governed)}`);
  assert.equal(f.withinFile, undefined, `nothing was hidden here, so nothing must be disclosed: ${JSON.stringify(f)}`);
  const out = grain(['check', 'src/models/ModelD.ts']).out;
  assert.doesNotMatch(out, /scored per file, not per/, `no disclosure clause belongs on a fully conforming file: ${out}`);
});
