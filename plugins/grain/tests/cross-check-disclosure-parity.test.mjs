// Cross-check: disclosure parity between `grain report` and `grain rules`, and the "no bare zero" invariant on
// the architecture section's dependency count.
//
// §004 diagnosed a real gap: on flask, `report`'s architecture section printed "13 modules · 0 directed
// dependencies" while the source is full of intra-package imports — 139 real file-level edges, all folded away
// by moduleGraph's own `a === b` intra-module skip because flask's non-dominant `src/flask/` package never gets
// split into more than one module node. The fix, `intraModuleNote(model)` (core.mjs), fires exactly when
// `moduleGraph.edges.length === 0 && model.edges.length > 0` and is wired into `report()` beside the older
// `relCoverageNote(model)` (§G21 — "resolution does not cover N files (...) — conventions layer only for those").
// §007 then found the SAME two notes missing from `rulesMarkdown()` (backing `grain rules`) — the artifact
// explicitly meant for a reader with no terminal and no grain installed, where a silent gap is worse, not better.
// Both are now FIXED; this file is not about re-proving either fix in isolation (rules-coverage-note.test.mjs and
// relation-coverage.test.mjs already do that in depth) — it is about the PARITY PROPERTY itself: whatever
// coverage/aggregation disclosure `report` makes about a model, `rules` must make too, expressed as a
// data-driven table so the next disclosure someone wires into `report` alone has an obvious place to be added
// here. It also asserts the "no bare zero" boundary: an architecture section may never print
// "0 directed dependencies" without an explanation when one is owed, AND must not fabricate an explanation when
// the zero is genuinely earned (no edges at all, every file's language resolution-supported).
//
// A grep of core.mjs for every note-generating helper wired into report()'s architecture section turns up exactly
// two: `relCoverageNote` and `intraModuleNote` (both `function`, not `export function` — private to core.mjs,
// reached here only through CLI output, as the task requires). The inline "established layering: N module
// pair(s) ..." line (report() and rulesMarkdown() both, off `model.archNorms`) is a third architecture-section
// disclosure-shaped line, but it is not extracted into a helper and — read directly at both call sites — already
// appears verbatim in both renderers, so it is not a new parity gap; it is not re-asserted here as a fixture-heavy
// third table row (it needs certified established-layering norms from replayed history, out of proportion to what
// this file needs to prove) but its GREEN-by-inspection status is recorded in this header for whoever extends this
// table next. `skipLineNote` (per-exemplar "(skip line N — its own deviation: ...)") and `factNotes`'s
// contested/rejected/cost/agentShare clauses are excluded on purpose: neither is a coverage/aggregation disclosure
// about the MODEL as a whole (the class 004/007 are about) — they are per-fact/per-exemplar calibration notes, and
// `report()`'s own inline `printFact` never calls `factNotes` either (it hand-rolls the same trend/held/authorConc
// subset `rulesMarkdown`'s `row()` does), so there is no report-vs-rules drift to check there in the first place.
// `statusLines`'s "no git history: ..." and "(+N truncated)" notes are `status`-only — `report()` never prints
// either, so there is nothing for `rules` to disagree with; out of scope for a report<->rules parity file.
//
// `mapSections` (backing `grain map`) was read end-to-end for the same parity question. It never calls
// `relCoverageNote`/`intraModuleNote`, and — more importantly — its architecture-adjacent "layers: ..." line never
// prints a dependency COUNT at all (just layer membership, i.e. which module ids sit at which depth); with no bare
// "0 dependencies"-shaped claim to make in the first place, there is no disclosure it could owe. That is asserted
// below as a documented, standing property (so if `map` ever starts printing a dependency count, this test goes
// red and flags the exact place this table needs a `map` row) rather than left as an unasserted note.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const initRepo = name => { const tmp = mkdtempSync(join(tmpdir(), name)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };
const modelPathOf = repo => join(repo, '.grain', 'cache', 'model.json');
const loadModel = repo => JSON.parse(readFileSync(modelPathOf(repo), 'utf8'));
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// (a) mixedFolded — flask's real shape from §004: JS files with a real relative import between them, all inside
// ONE module (pkg/), PLUS a couple of files in grammars with no relSupported() extractor (bash, yaml) elsewhere
// (infra/). Two disjoint top-level directories → moduleOf buckets them as 2 module nodes (pkg, infra), well under
// the §G11 dominant-module threshold (max(40, files.length*0.5) = 40 for a 4-file repo) so neither gets refined
// further. The one real edge (pkg/user.js → pkg/other.js) is intra-`pkg`, so it folds to 0 cross-module edges —
// triggering BOTH relCoverageNote (bash+yaml uncovered) and intraModuleNote (1 edge resolved, 0 surviving).
let tmp1, mixedFolded;
// (b) intraOnlyFolded — same intra-module fold, but every file is JS (fully relSupported): intraModuleNote only,
// no coverage gap. Mirrors python-module-deps.test.mjs's `pyIntra` shape (pkg/ + an unrelated tests/ file), in JS.
let tmp2, intraOnlyFolded;
// (c) noImportsAtAll — the honest bare zero: two JS files in two separate directories (2 module nodes, so the
// architecture section renders), NEITHER importing anything. model.edges.length === 0 (nothing resolved because
// nothing to resolve, not because resolution can't see it) and every file's grammar is relSupported — so NEITHER
// note is owed, and report's "0 directed dependencies" is a plain, honest fact.
let tmp3, noImportsAtAll;

before(() => {
  ({ tmp: tmp1, repo: mixedFolded } = initRepo('grain-xcheck-mixed-'));
  wIn(mixedFolded, 'pkg/other.js', 'export const thing = () => 1;\n');
  wIn(mixedFolded, 'pkg/user.js', "import { thing } from './other';\nexport const useThing = () => thing();\n");
  wIn(mixedFolded, 'infra/deploy.sh', '#!/bin/sh\necho hello\n');
  wIn(mixedFolded, 'infra/config.yaml', 'key: value\n');
  { const d = dateEnv('2026-01-10T12:00:00Z'); gitIn(mixedFolded, d, 'add', '-A'); gitIn(mixedFolded, d, 'commit', '-qm', 'base'); }

  ({ tmp: tmp2, repo: intraOnlyFolded } = initRepo('grain-xcheck-intra-'));
  wIn(intraOnlyFolded, 'pkg/other.js', 'export const thing = () => 1;\n');
  wIn(intraOnlyFolded, 'pkg/user.js', "import { thing } from './other';\nexport const useThing = () => thing();\n");
  wIn(intraOnlyFolded, 'tests/test_x.js', 'export const testX = () => true;\n');
  { const d = dateEnv('2026-01-10T12:00:00Z'); gitIn(intraOnlyFolded, d, 'add', '-A'); gitIn(intraOnlyFolded, d, 'commit', '-qm', 'base'); }

  ({ tmp: tmp3, repo: noImportsAtAll } = initRepo('grain-xcheck-empty-'));
  wIn(noImportsAtAll, 'pkg/a.js', 'export const a = () => 1;\n');
  wIn(noImportsAtAll, 'other/b.js', 'export const b = () => 2;\n');
  { const d = dateEnv('2026-01-10T12:00:00Z'); gitIn(noImportsAtAll, d, 'add', '-A'); gitIn(noImportsAtAll, d, 'commit', '-qm', 'base'); }

  for (const r of [mixedFolded, intraOnlyFolded, noImportsAtAll]) { const s = grainIn(r, ['status']); assert.equal(s.code, 0, s.err); }
});
after(() => { for (const t of [tmp1, tmp2, tmp3]) if (t) rmSync(t, { recursive: true, force: true }); });

// ---- fixture-soundness proof: each fixture's model.json actually holds the preconditions its test relies on ----
test('fixture soundness (a) mixedFolded: 1 real edge, folded to 0 cross-module, 2 files uncovered (bash, yaml)', () => {
  const m = loadModel(mixedFolded);
  assert.equal(m.edges.length, 1, `expected exactly the pkg/user.js -> pkg/other.js edge: ${JSON.stringify(m.edges)}`);
  assert.deepEqual([m.edges[0].from, m.edges[0].to], ['pkg/user.js', 'pkg/other.js']);
  assert.equal(m.moduleGraph.nodes.length, 2, `expected 2 module nodes (pkg, infra): ${JSON.stringify(m.moduleGraph.nodes)}`);
  assert.equal(m.moduleGraph.edges.length, 0, 'the one real edge must fold away as intra-pkg (a === b)');
  const uncovered = (m.filesAll || []).filter(f => /\.(sh|yaml)$/.test(f));
  assert.equal(uncovered.length, 2, `expected infra/deploy.sh + infra/config.yaml in filesAll: ${JSON.stringify(m.filesAll)}`);
});
test('fixture soundness (b) intraOnlyFolded: 1 real edge, folded to 0 cross-module, every file JS (fully covered)', () => {
  const m = loadModel(intraOnlyFolded);
  assert.equal(m.edges.length, 1, `expected exactly the pkg/user.js -> pkg/other.js edge: ${JSON.stringify(m.edges)}`);
  assert.equal(m.moduleGraph.nodes.length, 2, `expected 2 module nodes (pkg, tests): ${JSON.stringify(m.moduleGraph.nodes)}`);
  assert.equal(m.moduleGraph.edges.length, 0, 'the one real edge must fold away as intra-pkg (a === b)');
  assert.ok((m.filesAll || []).every(f => f.endsWith('.js')), `expected every file to be .js: ${JSON.stringify(m.filesAll)}`);
});
test('fixture soundness (c) noImportsAtAll: zero edges, 2 module nodes, every file JS (fully covered)', () => {
  const m = loadModel(noImportsAtAll);
  assert.equal(m.edges.length, 0, `expected no resolved edges at all: ${JSON.stringify(m.edges)}`);
  assert.equal(m.moduleGraph.nodes.length, 2, `expected 2 module nodes (pkg, other): ${JSON.stringify(m.moduleGraph.nodes)}`);
  assert.equal(m.moduleGraph.edges.length, 0);
  assert.ok((m.filesAll || []).every(f => f.endsWith('.js')), `expected every file to be .js: ${JSON.stringify(m.filesAll)}`);
});

// ---- INVARIANT 1: disclosure parity, data-driven ----
// Each row: a disclosure class, the fixture that triggers it, and a regex fragment (unanchored, no indentation)
// matching its core wording in `report`'s architecture section. The test EXTRACTS the literal line report() prints
// (so it can never silently drift from the real note text) and asserts an equivalent line — same wording, just
// without report's 2-space indent, and with an optional trailing period since Markdown prose may add one — exists
// in `grain rules`'s own Architecture section. Extend this table, not the assertion logic, for the next disclosure.
const disclosures = [
  { name: 'relCoverageNote (§G21) — resolution does not cover N files in an unsupported grammar', repo: () => mixedFolded,
    core: /resolution does not cover \d+ files? \([^)]*\) — conventions layer only for those/ },
  { name: 'intraModuleNote (§004) — N file-level edges resolved, none crossing a module boundary', repo: () => mixedFolded,
    core: /\d+ file-level edges? resolved, none crossing a module boundary — the architecture graph only counts cross-module dependencies/ },
  { name: 'intraModuleNote (§004) on a fully-covered repo — same note, no coverage gap alongside it', repo: () => intraOnlyFolded,
    core: /\d+ file-level edges? resolved, none crossing a module boundary — the architecture graph only counts cross-module dependencies/ },
];

for (const d of disclosures) {
  test(`disclosure parity: ${d.name}`, () => {
    const repo = d.repo();
    const reportOut = grainIn(repo, ['report']).out;
    const reportLine = reportOut.match(new RegExp('^  (' + d.core.source + ')$', 'm'));
    assert.ok(reportLine, `fixture sanity: report() itself must carry this disclosure: ${reportOut}`);
    const noteText = reportLine[1];
    const rulesOut = grainIn(repo, ['rules']).out;
    assert.match(rulesOut, /^## Architecture$/m, `expected an Architecture section in rules, got:\n${rulesOut}`);
    assert.match(rulesOut, new RegExp('^' + escapeRe(noteText) + '\\.?$', 'm'),
      `grain rules must carry the same disclosure report() does (report said "${noteText}"):\n${rulesOut}`);
  });
}

test('disclosure parity, both at once: mixedFolded carries BOTH notes in report, and BOTH in rules, in the same relative order', () => {
  const reportOut = grainIn(mixedFolded, ['report']).out;
  const repCov = reportOut.match(/^  (resolution does not cover .+)$/m);
  const repIntra = reportOut.match(/^  (\d+ file-level edges? resolved, none crossing a module boundary.+)$/m);
  assert.ok(repCov && repIntra, `fixture sanity: report() must carry both notes: ${reportOut}`);
  assert.ok(reportOut.indexOf(repCov[1]) < reportOut.indexOf(repIntra[1]), 'report prints the coverage note before the intra-module note');

  const rulesOut = grainIn(mixedFolded, ['rules']).out;
  const rulCovIdx = rulesOut.indexOf(repCov[1]);
  const rulIntraIdx = rulesOut.indexOf(repIntra[1]);
  assert.ok(rulCovIdx >= 0, `rules must carry the coverage note too: ${rulesOut}`);
  assert.ok(rulIntraIdx >= 0, `rules must carry the intra-module note too: ${rulesOut}`);
  assert.ok(rulCovIdx < rulIntraIdx, 'rules must preserve the same relative order report uses');
});

// ---- INVARIANT 2: no bare zero ----
// "0 directed dependencies" may only ever appear unexplained when the zero is genuinely earned: no edges resolved
// at all (nothing to fold, nothing uncovered). Whenever model.edges.length > 0 despite a 0-dependency module
// graph, intraModuleNote is owed; whenever uncovered files exist, relCoverageNote is owed. Both are read straight
// off model.json so this test cannot be fooled by report()/rules() disagreeing with what the model actually holds.
test('no bare zero (a): 0 directed dependencies + model.edges.length > 0 (folded) + uncovered files -> BOTH notes present, in report and rules', () => {
  const m = loadModel(mixedFolded);
  assert.equal(m.moduleGraph.edges.length, 0); assert.ok(m.edges.length > 0, 'precondition: edges were resolved, then folded');
  const reportOut = grainIn(mixedFolded, ['report']).out;
  assert.match(reportOut, /== architecture — 2 modules · 0 directed dependencies · 0 cycle\(s\) ==/, reportOut);
  assert.match(reportOut, /^  resolution does not cover 2 files \(bash, yaml\) — conventions layer only for those$/m, reportOut);
  assert.match(reportOut, /^  1 file-level edge resolved, none crossing a module boundary/m, reportOut);
  const rulesOut = grainIn(mixedFolded, ['rules']).out;
  assert.match(rulesOut, /^resolution does not cover 2 files \(bash, yaml\) — conventions layer only for those\.?$/m, rulesOut);
  assert.match(rulesOut, /^1 file-level edge resolved, none crossing a module boundary/m, rulesOut);
});

test('no bare zero (b): 0 directed dependencies + model.edges.length > 0 (folded) + no coverage gap -> intra-module note only, in report and rules', () => {
  const m = loadModel(intraOnlyFolded);
  assert.equal(m.moduleGraph.edges.length, 0); assert.ok(m.edges.length > 0, 'precondition: edges were resolved, then folded');
  const reportOut = grainIn(intraOnlyFolded, ['report']).out;
  assert.match(reportOut, /== architecture — 2 modules · 0 directed dependencies · 0 cycle\(s\) ==/, reportOut);
  assert.doesNotMatch(reportOut, /resolution does not cover/, `no coverage gap in this fixture — every file is .js: ${reportOut}`);
  assert.match(reportOut, /^  1 file-level edge resolved, none crossing a module boundary/m, reportOut);
  const rulesOut = grainIn(intraOnlyFolded, ['rules']).out;
  assert.doesNotMatch(rulesOut, /resolution does not cover/, rulesOut);
  assert.match(rulesOut, /^1 file-level edge resolved, none crossing a module boundary/m, rulesOut);
});

test('no bare zero (c): 0 directed dependencies + model.edges.length === 0 + no coverage gap -> the honest zero, no note owed, in report or rules', () => {
  const m = loadModel(noImportsAtAll);
  assert.equal(m.edges.length, 0, 'precondition: genuinely nothing resolved (nothing imports anything)');
  const reportOut = grainIn(noImportsAtAll, ['report']).out;
  assert.match(reportOut, /== architecture — 2 modules · 0 directed dependencies · 0 cycle\(s\) ==/, reportOut);
  assert.doesNotMatch(reportOut, /resolution does not cover/, reportOut);
  assert.doesNotMatch(reportOut, /file-level edges? resolved, none crossing/, reportOut);
  const rulesOut = grainIn(noImportsAtAll, ['rules']).out;
  assert.match(rulesOut, /## Architecture\n\n2 modules · 0 directed dependencies · 0 cycle\(s\)/, rulesOut);
  assert.doesNotMatch(rulesOut, /resolution does not cover/, rulesOut);
  assert.doesNotMatch(rulesOut, /file-level edges? resolved, none crossing/, rulesOut);
});

// ---- `grain map`: read for the same parity question, decided not to assert the same regexes (documented above) ----
test('`grain map` never prints a bare dependency-count claim, so this file\'s parity/no-bare-zero invariants do not apply to it (a standing, checked assumption, not an unasserted note)', () => {
  const r = grainIn(mixedFolded, ['map']);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /\d+\s+directed dependenc/i, `mapSections() never called relCoverageNote/intraModuleNote and never printed a dependency count when this was checked — if that changes, this table needs a 'map' row: ${r.out}`);
});
