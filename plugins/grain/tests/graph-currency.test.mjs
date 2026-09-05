// Guard for the graph-currency instrument (ticket 098): tests/stress/graph-currency.mjs.
//
// This is a thin wrapper over reconstruct.mjs's own comparisons, so the guard's job is narrow: prove the
// wave-close report actually surfaces a PLANTED graph-debt row (a declared relation no import backs) as class
// (b), prove the new module-ownership comparison catches a module the hand graph never named, and prove the
// window mechanism (the one number, graph-debt rows per 100 commits) runs end to end over real git history.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { waveCloseReport, compareModuleOwnership } from './stress/graph-currency.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CURRENCY = join(here, 'stress', 'graph-currency.mjs');

let tmp, repo, env;

// Four one-file-per-directory modules: api (imports util — real), util, reports (imports const — real, but
// its DECLARED relation in the hand graph points at util, which no report file mentions at all), const. The
// planted debt row is exactly `reports -> util`: declared, textually unbacked, and reports has SOME resolved
// edge elsewhere (to const) so the comparison can tell "no code backing" apart from "grain saw nothing from
// this module at all" (the coverage-gap class c, not b).
function buildFixture(root) {
  mkdirSync(root, { recursive: true });
  const w = (rel, content) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };

  w('src/api/alpha-handler.ts', "import { normalise } from '../util/alpha-helper';\nexport function handleAlpha(x: string) { return normalise(x); }\n");
  w('src/util/alpha-helper.ts', 'export function normalise(v: string) { return v.trim(); }\n');
  w('src/reports/summary-report.ts', "import { LIMIT } from '../const/values';\nexport function summarise(n: number) { return n > LIMIT; }\n");
  w('src/const/values.ts', 'export const LIMIT = 10;\n');

  w('.yggdrasil/yg-config.yaml', 'version: "5.2.0"\n');
  w('.yggdrasil/yg-architecture.yaml', [
    'node_types:',
    '  handler:',
    '    description: "Handlers."',
    '    when:', '      path: "src/api/*.ts"',
    '  helper:',
    '    description: "Helpers."',
    '    when:', '      path: "src/util/*.ts"',
    '  report:',
    '    description: "Reports."',
    '    when:', '      path: "src/reports/*.ts"',
    '  constant:',
    '    description: "Constants."',
    '    when:', '      path: "src/const/*.ts"',
    '',
  ].join('\n'));
  w('.yggdrasil/model/api/yg-node.yaml', 'name: Api\ntype: handler\ndescription: "d"\nrelations:\n  - target: util\n    type: uses\nmapping:\n  - src/api/\n');
  w('.yggdrasil/model/util/yg-node.yaml', 'name: Util\ntype: helper\ndescription: "d"\nmapping:\n  - src/util/\n');
  // THE PLANTED ROW: reports declares a relation to util that no import or textual mention backs at all.
  w('.yggdrasil/model/reports/yg-node.yaml', 'name: Reports\ntype: report\ndescription: "d"\nrelations:\n  - target: util\n    type: uses\n  - target: constant\n    type: uses\nmapping:\n  - src/reports/\n');
  w('.yggdrasil/model/constant/yg-node.yaml', 'name: Constant\ntype: constant\ndescription: "d"\nmapping:\n  - src/const/\n');

  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', root, 'add', '-A'], { env });
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture'], { env });
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'graph-currency-'));
  repo = join(tmp, 'repo');
  env = {
    ...process.env, HOME: tmp,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
    GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
  };
  buildFixture(repo);
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

// ---------- 1. the planted graph-debt row is classified (b), through the library function ----------
test('a declared relation with no code backing at all is classified as graph debt (b)', async () => {
  const report = await waveCloseReport({ repo, noHistory: true, quiet: true });
  assert.equal(report.instrument, 'graph-currency/1');
  const planted = report.debtRows.find(r => r.source === 'relation' && r.id === 'src/reports -> src/util');
  assert.ok(planted, `expected the planted relation debt row among:\n${JSON.stringify(report.debtRows, null, 1)}`);
  assert.match(planted.why, /no code backing/);
  assert.ok(report.counts.debt >= 1);
  assert.equal(report.counts.debtBySource.relation, report.reconstruct.relations.missClassB);
  // the OTHER declared relation (api -> util) IS backed by a real import and must not show up as debt
  assert.ok(!report.debtRows.some(r => r.id === 'src/api -> src/util'), 'a real, imported relation must not be flagged as debt');
});

// ---------- 2. module ownership: a module the hand graph never named at all ----------
test('compareModuleOwnership flags a grain module no hand node maps as graph debt', () => {
  const modOf = rel => rel.split('/').slice(0, 2).join('/');
  const graph = {
    nodes: [
      { id: 'api', mapping: ['src/api/'] },
      { id: 'util', mapping: ['src/util/'] },
    ],
  };
  const files = ['src/api/a.ts', 'src/util/b.ts', 'src/orphan/c.ts', 'src/orphan/d.ts'];
  const ctx = { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set() };
  const cands = [
    { kind: 'module', name: 'src/api', files: new Set(['src/api/a.ts']) },
    { kind: 'module', name: 'src/util', files: new Set(['src/util/b.ts']) },
    { kind: 'module', name: 'src/orphan', files: new Set(['src/orphan/c.ts', 'src/orphan/d.ts']) },
  ];
  void modOf;
  const r = compareModuleOwnership(graph, files, ctx, cands);
  assert.equal(r.modules, 3);
  const orphan = r.rows.find(x => x.module === 'src/orphan');
  assert.equal(orphan.verdict.class, 'b');
  assert.match(orphan.verdict.why, /no owning node/);
  // the two mapped modules must NOT be flagged
  assert.ok(!r.rows.find(x => x.module === 'src/api')?.verdict);
  assert.ok(!r.rows.find(x => x.module === 'src/util')?.verdict);
  assert.equal(r.classes.b, 1);
});

// ---------- 2b. the `.yggdrasil/` self-exemption (a bug this ticket found and fixed on sight) ----------
// A first version of compareModuleOwnership flagged `.yggdrasil/model` (605 files) and `.yggdrasil/flows` (18)
// as "graph debt" on the real Yggdrasil measurement — an artifact, not a finding: Yggdrasil's own
// `file-when-evaluator` node auto-exempts `.yggdrasil/` paths from coverage, so nothing is SUPPOSED to own the
// graph's own definition. `.yggdrasil/aspects` is the one carved-out exception: Yggdrasil's own `graph-rules`
// node maps `.yggdrasil/aspects/*/check.mjs` as ordinary source, so an unowned rule script there is real debt.
test('a module under .yggdrasil/ is exempt from ownership, except .yggdrasil/aspects itself', () => {
  const graph = { nodes: [{ id: 'rules', mapping: ['.yggdrasil/aspects/x/check.mjs'] }] };
  const files = ['.yggdrasil/model/a/yg-node.yaml', '.yggdrasil/aspects/x/check.mjs', '.yggdrasil/aspects/x/content.md'];
  const ctx = { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set() };
  const cands = [
    { kind: 'module', name: '.yggdrasil/model', files: new Set(['.yggdrasil/model/a/yg-node.yaml']) },
    { kind: 'module', name: '.yggdrasil/aspects', files: new Set(['.yggdrasil/aspects/x/check.mjs', '.yggdrasil/aspects/x/content.md']) },
  ];
  const r = compareModuleOwnership(graph, files, ctx, cands);
  // .yggdrasil/model is skipped outright — not scored, not flagged, not even a row
  assert.ok(!r.rows.some(x => x.module === '.yggdrasil/model'), 'the graph\'s own model/ must be exempt, not scored as debt');
  // .yggdrasil/aspects IS scored — it maps 2 files but the node only claims 1, so it is real, reportable debt
  const aspects = r.rows.find(x => x.module === '.yggdrasil/aspects');
  assert.ok(aspects, 'aspects/ must still be scored — it is the carved-out exception, not exempt');
});

// ---------- 3. end to end via the CLI, --skip-window (fast path) ----------
test('CLI end to end with --skip-window: writes a report and prints the debt count', () => {
  const out = join(tmp, 'out-skip.json');
  const r = spawnSync('node', [CURRENCY, repo, out, '--no-history', '--skip-window', '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.ok(j.counts.debt >= 1);
  assert.deepEqual(j.window, { skipped: true, why: '--skip-window' });
  assert.match(r.stdout, /debt \d+/);
});

// ---------- 4. the window mechanism runs end to end over real (tiny) history ----------
test('the window number runs over real git history and states its method', () => {
  // three more commits on top of the fixture's one, each touching an unrelated file, so HEAD~2 exists and
  // differs from HEAD only in commit count, not in content — the debt count should be identical at both ends,
  // which is exactly the "a repo that never changes shows zero drift" case the method promises.
  for (let i = 0; i < 3; i++) {
    writeFileSync(join(repo, `NOTE-${i}.md`), `note ${i}\n`);
    execFileSync('git', ['-C', repo, 'add', '-A'], { env });
    execFileSync('git', ['-C', repo, 'commit', '-q', '-m', `note ${i}`], { env });
  }
  const out = join(tmp, 'out-window.json');
  const r = spawnSync('node', [CURRENCY, repo, out, '--no-history', '--window', '2', '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 120_000 });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  assert.ok(j.window && !j.window.skipped, `window was skipped: ${JSON.stringify(j.window)}`);
  assert.equal(j.window.commits, 2);
  assert.equal(j.window.debtAtHead, j.counts.debt);
  assert.equal(j.window.deltaDebtRows, j.window.debtAtHead - j.window.debtAtOld);
  assert.equal(j.window.debtRowsPer100Commits, +((j.window.deltaDebtRows) / (2 / 100)).toFixed(2));
  assert.match(j.window.method, /HEAD~2/);
  assert.match(r.stdout, /graph-debt rows\/100 commits/);
});
