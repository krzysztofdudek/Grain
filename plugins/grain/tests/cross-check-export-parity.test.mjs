// Cross-check: `grain export`'s published schema (grain-export/1 — engine/export.mjs:1-5, "THE SCHEMA IS A
// PUBLISHED INTERFACE... field renames and semantic changes here are breaking changes") against the human-facing
// renderers of the SAME model (`report`, `check`, `where` via `check`'s placement note, `map`, `what`, `decide
// list`, `status`). THE INVARIANT: the published export and the text a maintainer reads must never disagree about
// the same fact. export was extended four times this release (changeArchetypes, twins, moves, reshaped
// valueSiblings) and none of those extensions was ever checked against the surfaces that render the same facts —
// exactly the drift class .temp/issues/007-rules-missing-relcoverage-note/issue.md found on a different pair of
// surfaces (`report` vs `rules`). This file is the export-side version of that audit.
//
// ONE shared fixture carries every fact family below (§ the task's own ask): tests/fixtures/build-fixture.mjs's
// deterministic TypeScript service (30 `@Handler` classes, 1 planted deviant `dispute.handler.ts`, co-change
// history, 5 waves of near-identical role groups) gives conventions/deviants/exemplars/twins/changeArchetypes for
// free, ALREADY CERTIFIED — confirmed live on this exact fixture (see probes below) before any assertion was
// written, per the task's "probe a real export output before asserting" instruction. On top of it: a certified
// value-sibling enum (2 files, mirrors tests/value-index.test.mjs's own proven df-based recipe), a grammar with no
// relSupported() extractor (zig) to make the coverage disclosure live, one `git mv` rename population (mirrors
// tests/placement-moves.test.mjs's repoA recipe with zq-prefixed names, on a brand-new `.report.ts` suffix so it
// never mixes with the base fixture's own `.handler.ts` convention), one `decide waive` and one `decide boundary`.
// zq-prefixed names throughout the additions, for grep-anchoring in prose output.
//
// DATA-DRIVEN TABLE (documents the mapping; each extractor is a real function invoked by its test, so the next
// export extension has an obvious row to add and an obvious function to write):
//
//   factFamily        | exportPath                              | renderer(s)                | extractor
//   conventions       | conventions[]                           | report                     | extractHandlerFact
//   deviants/exemplars| conventions[].deviatingSites[]/.nearest  | check --all                | extractWaiverVoiceLine
//   moves             | moves{}                                 | check (placementHit, via `where`'s placement advice) | extractMoveSentence
//   twins             | twins[]                                 | where (group card `twin:`) | extractTwinCardLine
//   changeArchetypes  | changeArchetypes[]                      | report (== changes ==), map| extractArchetypeLine
//   valueSiblings     | valueSiblings{}                         | what                       | extractWhatValuesLine
//   decisions         | waivers[]/boundaries[]                  | decide list, report        | extractDecideListLines
//   coverage          | (none found — see test)                 | report/status              | extractCoverageNote
//   schema version    | schema                                  | (export.mjs source itself) | extractSchemaLiteral
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pct, scopeLabel } from '../engine/core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const wIn = (dir, rel, content) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), content); };
const mvIn = (dir, from, to) => { mkdirSync(join(dir, dirname(to)), { recursive: true }); gitIn(dir, 'mv', from, to); };
const commitIn = (dir, msg) => { gitIn(dir, 'add', '-A'); gitIn(dir, 'commit', '-qm', msg); };

let tmp, repo, waiverId, boundaryId;
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const dump = () => JSON.parse(grain(['export', '--compact']).out.split('\n').find(l => l.startsWith('{')));

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-export-parity-'));
  repo = join(tmp, 'r');
  execFileSync('node', [BUILDER, repo], { stdio: 'pipe' });

  // ---- value siblings: a certified enum container across two files (df=2 clears CFG.valueDfMin, well under
  // valueDfMaxShare x file-count on this ~164-file repo) — same recipe tests/value-index.test.mjs already proved.
  wIn(repo, 'src/zqValues/ZqStatusOne.ts', 'export enum ZqStatus { ZQACTIVE, ZQSUSPENDED }\n');
  wIn(repo, 'src/zqValues/ZqStatusTwo.ts', 'export enum ZqStatus { ZQACTIVE, ZQSUSPENDED }\n');

  // ---- coverage: a grammar with no relSupported() extractor (zig — same choice as tests/relation-coverage.test.mjs)
  // makes report/status's relCoverageNote live. The base fixture's own package.json (json grammar) already
  // contributes one such file, so this adds a second grammar to the same disclosure rather than creating it from
  // nothing — either way the note is live on this exact fixture (confirmed below).
  wIn(repo, 'src/zqLegacy/zqOldModule.zig', 'pub fn add(a: i32, b: i32) i32 {\n    return a + b;\n}\n');

  // ---- moves: mirrors tests/placement-moves.test.mjs's repoA recipe exactly — 3 files that stay forever
  // (establish "current" placement majority), 3 that are born alongside them, MOVED (a directory change), then
  // RETIRED (so they no longer pollute the current-tree population, but do leave rename history) — with zq-prefixed
  // names, on a brand-new `.report.ts` suffix so this population never mixes with the base fixture's own
  // `*.handler.ts` convention or its role clustering. The 4 `ZqSales*` fillers dilute the same-suffix population so
  // the `widget` token stays under placementHit's "too generic" gate (3 of 7, same ratio repoA itself uses: 3 of 7).
  for (const n of ['Alpha', 'Beta', 'Gamma']) wIn(repo, `src/zqStaging/ZqWidget${n}.report.ts`, `export function reportWidget${n}(): number {\n  return 1;\n}\n`);
  for (const n of ['One', 'Two', 'Three', 'Four']) wIn(repo, `src/zqStaging/ZqSales${n}.report.ts`, `export function reportSales${n}(): number {\n  return 1;\n}\n`);
  for (const n of ['M1', 'M2', 'M3']) wIn(repo, `src/zqStaging/ZqWidget${n}.report.ts`, `export function reportWidget${n}(): number {\n  return 1;\n}\n`);
  commitIn(repo, 'feat: zq additions (value siblings, coverage gap, moves population)');
  for (const n of ['M1', 'M2', 'M3']) mvIn(repo, `src/zqStaging/ZqWidget${n}.report.ts`, `src/zqHandlers2/ZqWidget${n}.report.ts`);
  commitIn(repo, 'chore: move the zq widget transients to their new home');
  for (const n of ['M1', 'M2', 'M3']) gitIn(repo, 'rm', '-q', `src/zqHandlers2/ZqWidget${n}.report.ts`);
  commitIn(repo, 'chore: retire the moved zq widget transients');

  assert.equal(grain(['status']).code, 0, 'the fixture must index cleanly before any decision is recorded');

  // ---- decisions: one waiver on the fixture's OWN planted @Handler deviant (dispute.handler.ts — see
  // build-fixture.mjs's own final commit), and one boundary. Waivers/boundaries are render-time only (never
  // reach mine() or the weights — core.mjs's own comment on model.waivers), so recording them here cannot perturb
  // any of the established/share numbers the conventions/deviants/twins/changeArchetypes tests below depend on.
  const w = grain(['decide', 'waive', 'src/handlers/dispute.handler.ts#CreateDisputeHandler', '--on', 'auto.deco:@Handler', '--note', 'zq legacy note', '--author', 'kd']);
  assert.equal(w.code, 0, w.err);
  waiverId = (w.out.match(/recorded waiver ([0-9a-f]{8})/) || [])[1];
  assert.ok(waiverId, w.out);
  const b = grain(['decide', 'boundary', 'src/dto', '--never-imports', 'src/handlers', '--note', 'zq boundary note', '--author', 'kd']);
  assert.equal(b.code, 0, b.err);
  boundaryId = (b.out.match(/recorded boundary ([0-9a-f]{8})/) || [])[1];
  assert.ok(boundaryId, b.out);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

// ===== extractors (renderer text -> a comparable value) — the table's own "extractor" column, made real =====
const extractHandlerFact = reportText => {
  const line = reportText.split('\n').find(l => l.includes('annotated with `@Handler`'));
  const m = line && line.match(/— (\d+)% of (\d+) established(?:, (\d+) deviant)?/);
  return m && { pctText: +m[1], established: +m[2], deviants: +(m[3] || 0) };
};
const extractWaiverVoiceLine = (checkAllText, id) => {
  const re = new RegExp(`decision waiver \\(id ${id}, kd [\\d-]+\\): \`(\\w+)\` \\(line (\\d+)\\) deliberately departs from .*@Handler.* — (\\d+)/(\\d+) established do it the other way`);
  const m = checkAllText.match(re);
  return m && { name: m[1], line: +m[2], conform: +m[3], sraw: +m[4] };
};
const extractMoveSentence = checkText => {
  const m = checkText.match(/(\d+) of (\d+) such files born here were later moved to `([^`]+)\/`/);
  return m && { moved: +m[1], total: +m[2], dir: m[3] };
};
// §044 re-pointed this extractor from report's `== health ==` row to `where`'s group card, which is now the only
// renderer of model.twins. The card names ONE partner per group (`model.twins.find`), so the parity claim is
// "the side the card names is a twin partner export agrees on", not "this exact pair".
const extractTwinCardLine = whereText => {
  const m = whereText.match(/twin: structurally the same as «([^»]+)» \(([^)]+)\)(?:, named `\*([^`]+)` there)?/);
  return m && { label: m[1], part: m[2], suffix: m[3] || null };
};
const extractArchetypeLine = (text, label) => {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp(`${esc}"?\\s*—\\s*(\\d+) changes?`)) || text.match(new RegExp(`${esc}[^\\n]*?(\\d+) changes?`));
  return m && +m[1];
};
const extractWhatValuesLine = whatText => {
  const m = whatText.match(/`(\w+)` in (\d+) places? \(([^)]+)\)/);
  return m && { value: m[1], places: +m[2], kind: m[3] };
};
const extractDecideListLines = listText => listText.split('\n');
const extractCoverageNote = text => {
  // `status` prints this note at column 0; `report` indents it 2 spaces under its architecture heading (both call
  // the same relCoverageNote(model) — core.mjs) — tolerate either so this extractor works for both renderers.
  const m = text.match(/^ {0,2}resolution does not cover (\d+) files? \(([^)]+)\) — conventions layer only for those$/m);
  return m && { n: +m[1], grammars: m[2].split(', ') };
};
const extractSchemaLiteral = () => {
  const src = readFileSync(join(here, '..', 'engine', 'export.mjs'), 'utf8');
  return (src.match(/schema:\s*'([^']+)'/) || [])[1];
};

test('schema versioning: the exported schema field is the literal export.mjs itself hard-codes', () => {
  const d = dump();
  const literal = extractSchemaLiteral();
  assert.ok(literal, 'export.mjs must carry a schema: \'...\' literal for this test to compare against');
  assert.equal(d.schema, literal);
  assert.equal(d.schema, 'grain-export/1');
});

test('conventions: report\'s per-partition convention COUNT and export\'s per-partition convention count are identical, for every partition', () => {
  const full = grain(['report', '--top', '999']).out;
  const d = dump();
  for (const p of d.partitions) {
    const label = scopeLabel(p.name);
    const header = full.split('\n').find(l => l.startsWith(`== ${label} — `));
    assert.ok(header, `report must render a section header for partition ${p.name} (${label})`);
    const n = +header.match(/— (\d+) conventions/)[1];
    assert.equal(p.conventions.length, n, `partition ${p.name}: report says ${n} conventions, export's P.conventions carries ${p.conventions.length}`);
    // and the flat top-level list agrees with the per-partition one
    assert.equal(d.conventions.filter(c => c.partition === p.name).length, n);
  }
});

test('conventions: the @Handler convention\'s printed share/population/deviant-count are the SAME numbers export carries', () => {
  const full = grain(['report', '--top', '999']).out;
  const fact = extractHandlerFact(full);
  assert.ok(fact, `report must print the @Handler convention line:\n${full}`);
  const conv = dump().conventions.find(c => c.feature.enumerator === 'deco' && c.feature.argument === '@Handler' && c.expected === 'true' && c.partition === 'src/handlers');
  assert.ok(conv, 'export must carry the @Handler convention for the src/handlers partition');
  assert.equal(conv.established, fact.established, 'established population must match');
  assert.equal(pct(conv.share), fact.pctText, 'the SAME pct() function report itself uses, applied to export\'s raw share, must reproduce the printed percentage');
  assert.equal(conv.sites.deviating, fact.deviants, 'deviant count must match');
});

test('conventions: export is a genuine superset of a truncated report — some facts report hides at a small --top are still in export', () => {
  const small = grain(['report', '--top', '1']).out;
  const d = dump();
  const part = d.partitions.find(p => p.name === 'src/handlers');
  const label = scopeLabel('src/handlers');
  const start = small.indexOf(`== ${label} — `);
  assert.ok(start >= 0);
  const nextHeader = small.indexOf('\n==', start + 1);
  const section = small.slice(start, nextHeader >= 0 ? nextHeader : undefined);
  const printedFactLines = section.split('\n').filter(l => /— \d+% of \d+ established/.test(l));
  const overflow = section.match(/… and (\d+) more — run with --top (\d+) for all/);
  assert.ok(overflow, `--top 1 must genuinely truncate this partition's domain tier:\n${section}`);
  assert.ok(printedFactLines.length < part.conventions.length, `report printed ${printedFactLines.length} fact line(s) but export carries ${part.conventions.length} for this partition — must be a strict superset`);
});

test('deviants/exemplars: the waiver voice names the same scope, line, and established/conforming numbers export\'s deviatingSites carries; the anchor line is real', () => {
  const checkAll = grain(['check', 'src/handlers/dispute.handler.ts', '--all']).out;
  const voice = extractWaiverVoiceLine(checkAll, waiverId);
  assert.ok(voice, `expected the decision-waiver voice line for waiver ${waiverId}:\n${checkAll}`);
  assert.equal(voice.name, 'CreateDisputeHandler');
  assert.equal(voice.line, 6);

  const conv = dump().conventions.find(c => c.feature.enumerator === 'deco' && c.feature.argument === '@Handler' && c.expected === 'true' && c.partition === 'src/handlers');
  const dev = conv.deviatingSites.find(x => x.rel === 'src/handlers/dispute.handler.ts');
  assert.ok(dev, 'the planted deviant must be a deviating site in export');
  assert.equal(dev.name, voice.name, 'export\'s deviating site name must agree with the text surface');
  assert.equal(dev.line, voice.line, 'export\'s deviating site line must agree with the text surface');
  assert.equal(conv.established, voice.sraw, 'export\'s established population must agree with the waiver voice\'s denominator');
  assert.equal(conv.sites.conforming, voice.conform, 'export\'s conforming-site count must agree with the waiver voice\'s numerator');
  assert.ok(dev.nearest && dev.nearest.rel.startsWith('src/handlers/'), 'export must carry a nearest conforming exemplar in the same directory');

  // spot-check: export's anchor line is a REAL line in the fixture file, not a guess beyond the scope
  const fileLines = readFileSync(join(repo, 'src', 'handlers', 'dispute.handler.ts'), 'utf8').split('\n');
  assert.match(fileLines[dev.line - 1], /class CreateDisputeHandler/, `export's site.line ${dev.line} must point at the real class declaration`);
  assert.deepEqual(dev.focus, [dev.line], 'a decorator (absence) convention anchors its focus to the declaration line by construction (schemaNotes.focus)');
});

test('moves: export.moves agrees with the fixture\'s renames, and the ONE renderer of model.moves (check\'s placement advice, via placementHit) says the same thing', () => {
  const d = dump();
  assert.deepEqual(d.moves['report.ts#widget'], { 'src/zqStaging→src/zqHandlers2': 3 }, 'export.moves must record the 3 zq widget renames exactly (suffix#token -> {oldDir→newDir: count})');

  // trigger placementHit: the query file must be untracked (placementHit bails if the path is already indexed)
  const freshRel = 'src/zqNew/ZqWidgetFresh.report.ts';
  wIn(repo, freshRel, 'export function reportWidgetFresh(): number {\n  return 1;\n}\n');
  try {
    const c = grain(['check', freshRel]);
    assert.equal(c.code, 0, c.err);
    assert.match(c.out, /\[grain\] placement: `\*\.report\.ts` files named like `widget` live in `src\/zqStaging\/` — 3 of 3; `src\/zqNew\/` holds none/, 'the base name-kin note must fire');
    const sentence = extractMoveSentence(c.out);
    assert.ok(sentence, `expected the move sentence in check's placement note:\n${c.out}`);
    assert.equal(sentence.moved, 3);
    assert.equal(sentence.total, 3);
    assert.equal(sentence.dir, 'src/zqHandlers2');
    // grep confirms `check`'s placementHit is the ONLY consumer of model.moves in the engine (report/rules/map/where's
    // own text never touch it directly — `where` reaches the same note only by calling into checkFile itself)
  } finally { rmSync(join(repo, freshRel)); }
});

test('twins: `where`\'s group-card `twin:` line names a (label, partition) pairing and namedDifferently token export.twins agrees with', () => {
  const d = dump();
  if (!d.twins.length) {
    console.log('[cross-check-export-parity] LIMITATION: model.twins is empty on this run (an engine change may have altered certification) — asserting only the well-formed-empty-shape minimum.');
    assert.ok(Array.isArray(d.twins));
    return;
  }
  const t = d.twins.find(x => x.namedDifferently) || d.twins[0];
  // drive `where` at side a using the group label's own tokens — the same words the card is keyed on
  const card = grain(['where', ...t.a.label.split(/[^A-Za-z0-9]+/).filter(Boolean)]).out;
  const got = extractTwinCardLine(card);
  assert.ok(got, `expected a group-card twin: line for «${t.a.label}» (${t.a.part}):\n${card}`);
  // the named side must be a partner export really does record for this group — not necessarily `t` itself
  const partners = d.twins.filter(x => (x.a.part === t.a.part && x.a.label === t.a.label) || (x.b.part === t.a.part && x.b.label === t.a.label))
    .map(x => (x.a.label === t.a.label && x.a.part === t.a.part) ? x.b : x.a);
  const match = partners.find(pr => pr.label === got.label && pr.part === got.part);
  assert.ok(match, `card names «${got.label}» (${got.part}); export's partners for «${t.a.label}» are ${JSON.stringify(partners)}`);
  const pair = d.twins.find(x => [x.a, x.b].some(z => z.label === t.a.label && z.part === t.a.part) && [x.a, x.b].some(z => z.label === got.label && z.part === got.part));
  if (pair && pair.namedDifferently) {
    assert.ok(got.suffix, `export carries namedDifferently ${JSON.stringify(pair.namedDifferently)} but the card printed no suffix: ${card}`);
    assert.ok(pair.namedDifferently.some(tok => tok.toLowerCase() === got.suffix.toLowerCase()),
      `the card's suffix \`*${got.suffix}\` must be one of export's namedDifferently tokens ${JSON.stringify(pair.namedDifferently)}`);
  }
});

// §044: the same evidence must NOT come back as an actionable health row. Guarding the removal here, next to the
// parity claim, is what stops a future export extension quietly re-adding the renderer this row used to describe.
test('twins: report\'s health section carries no twin row (§044 — measured 0.24 precision, removed)', () => {
  const full = grain(['report', '--top', '999']).out;
  assert.doesNotMatch(full, /are structurally the same shape/, full);
  assert.doesNotMatch(full, /unify or document why both exist/, full);
  const md = grain(['rules']).out;
  assert.doesNotMatch(md, /unify or document why both exist/, 'a committed conventions document must not carry it either');
});

test('changeArchetypes: report\'s "== changes ==" section and map\'s "changes:" line agree with export.changeArchetypes on label and population', () => {
  const d = dump();
  if (!d.changeArchetypes.length) {
    console.log('[cross-check-export-parity] LIMITATION: model.changeArchetypes is empty on this run — asserting only the well-formed-empty-shape minimum.');
    assert.ok(Array.isArray(d.changeArchetypes));
    return;
  }
  const a = d.changeArchetypes[0];
  const full = grain(['report', '--top', '999']).out;
  const mapOut = grain(['map']).out;
  const reportN = extractArchetypeLine(full, a.label);
  const mapN = extractArchetypeLine(mapOut, a.label);
  assert.ok(reportN !== undefined && reportN !== null, `report's == changes == section must name archetype ${a.label}:\n${full}`);
  assert.ok(mapN !== undefined && mapN !== null, `map's changes: line must name archetype ${a.label}:\n${mapOut}`);
  assert.equal(reportN, a.n, 'report\'s population count must match export\'s');
  assert.equal(mapN, a.n, 'map\'s population count must match export\'s');
});

test('valueSiblings/valueIndex: `what`\'s place-count identifies the same container/members export.valueSiblings carries — but export cannot reproduce the place COUNT itself (documented, not silent)', () => {
  const w = grain(['what', 'ZQACTIVE']).out;
  const hit = extractWhatValuesLine(w);
  assert.ok(hit, `expected a values: line for ZQACTIVE:\n${w}`);
  assert.equal(hit.value, 'ZQACTIVE');
  assert.equal(hit.places, 2, 'planted in exactly 2 files');

  const d = dump();
  const entry = Object.entries(d.valueSiblings).find(([, v]) => v.members.includes('enum:ZQACTIVE'));
  assert.ok(entry, 'export.valueSiblings must carry the ZqStatus container');
  const [, cval] = entry;
  assert.equal(cval.container, 'ZqStatus');
  assert.deepEqual(cval.members.slice().sort(), ['enum:ZQACTIVE', 'enum:ZQSUSPENDED']);
  // 2 files is below CFG.minRaw/minEff for a co-travel norm to certify (see core.mjs's own comment on valueNorms) —
  // schemaNotes.valueSiblings documents this as expected, not a gap
  assert.equal(cval.norm, null);

  // THE GAP: `what`'s "2 places" is a per-VALUE place count (model.valueIndex['enum:ZQACTIVE'].length). export
  // deliberately drops model.valueIndex (schemaNotes.valueSiblings: "NOT exported... internal working data") and
  // valueSiblings entries carry only {container, members, norm} — no per-member place count or location at all.
  // A training-pipeline consumer of `grain export` can confirm ZQACTIVE/ZQSUSPENDED travel together, but cannot
  // recover the "2 places" number `what` prints for either one. This is DOCUMENTED (schemaNotes explains the
  // omission), unlike ticket 007's silent gap — reported here as the honest limit of this family, not a defect.
  assert.deepEqual(Object.keys(cval).sort(), ['container', 'members', 'norm'], 'confirms no place-count/location field exists on a valueSiblings entry');
});

test('decisions: the waiver and boundary from `decide` appear in export and agree with `decide list`\'s rendering, including the waiver\'s found/liveness field', () => {
  const listOut = grain(['decide', 'list']).out;
  const lines = extractDecideListLines(listOut);
  const d = dump();

  const wv = d.waivers.find(x => x.id === waiverId);
  assert.ok(wv, 'export.waivers must carry the recorded waiver');
  assert.equal(wv.path, 'src/handlers/dispute.handler.ts');
  assert.equal(wv.name, 'CreateDisputeHandler');
  assert.equal(wv.pid, 'auto.deco:@Handler');
  assert.equal(wv.note, 'zq legacy note');
  assert.equal(wv.found, true, 'the waived scope still exists at HEAD — found must be true');
  const wvLine = lines.find(l => l.startsWith(waiverId));
  assert.ok(wvLine, `decide list must render the waiver:\n${listOut}`);
  assert.equal(wvLine, `${waiverId}  waiver: ${wv.path}#${wv.name} on ${wv.pid}  — ${wv.note}  (${wv.author} ${wv.createdAt})`);

  const bd = d.boundaries.find(x => x.id === boundaryId);
  assert.ok(bd, 'export.boundaries must carry the recorded boundary');
  assert.equal(bd.boundary.from, 'src/dto');
  assert.equal(bd.boundary.to, 'src/handlers');
  assert.equal(bd.note, 'zq boundary note');
  assert.equal(bd.fromLive, true, 'src/dto has real indexed files');
  assert.equal(bd.toLive, true, 'src/handlers has real indexed files');
  const bdLine = lines.find(l => l.startsWith(boundaryId));
  assert.ok(bdLine, `decide list must render the boundary:\n${listOut}`);
  assert.equal(bdLine, `${boundaryId}  boundary: ${bd.boundary.from}/ never imports ${bd.boundary.to}/  — ${bd.note}  (${bd.author} ${bd.createdAt})`);

  // and report's own == boundaries == / == waivers == sections carry the identical ids/notes (report is the OTHER
  // renderer of the same seeds.jsonl records `decide list` reads — a second cross-check, not a duplicate one)
  const rep = grain(['report']).out;
  assert.match(rep, new RegExp(`decision boundary \\(id ${boundaryId}, kd ${bd.createdAt}\\): src/dto/ never imports src/handlers/ — zq boundary note`));
  assert.match(rep, new RegExp(`decision waiver \\(id ${waiverId}, kd ${wv.createdAt}\\): src/handlers/dispute\\.handler\\.ts#CreateDisputeHandler \\(line 6\\) is excused from auto\\.deco:@Handler — zq legacy note`));
});

// FIXED: .temp/issues/027-export-missing-coverage-data/ (this test's own former finding). export now carries
// `relCoverage: {n, grammars}` — the same fact relCoverageData(model)/relCoverageNote(model) (core.mjs) compute
// for report/status's prose — so PARITY is asserted here, not the gap.
test('coverage disclosures: report/status\'s relation-coverage note and export\'s relCoverage field agree on this fixture (007/027-class parity, not a gap)', () => {
  const statusOut = grain(['status']).out;
  const reportOut = grain(['report']).out;
  const sNote = extractCoverageNote(statusOut);
  const rNote = extractCoverageNote(reportOut);
  assert.ok(sNote, `status must disclose the coverage gap live on this fixture:\n${statusOut}`);
  assert.ok(rNote, `report must disclose the SAME gap:\n${reportOut}`);
  assert.deepEqual(sNote, rNote, 'status and report must not disagree about the same coverage fact');
  assert.ok(sNote.grammars.includes('zig'), 'the planted zig file must be part of the disclosed gap');
  assert.ok(sNote.n >= 1);

  // export's own field must reproduce the identical (n, grammars) pair prose discloses — a consumer of `grain
  // export` alone (the training-pipeline/audit consumer this schema is published for) can now derive exactly what
  // report/status say instead of having no candidate field to look at (§G21/§007's indistinguishability, closed).
  const d = dump();
  assert.ok(d.relCoverage, 'export must carry a relCoverage field');
  assert.deepEqual(d.relCoverage, sNote, 'export.relCoverage must agree with report/status\'s live disclosure, not merely exist');
});

test('coverage disclosures: a fixture with full relation coverage exports relCoverage in its honest empty/complete shape', () => {
  // NOT the base build-fixture: it plants its own package.json (json grammar, no relSupported() extractor — see
  // this file's own before() comment above), so it always carries a coverage gap. A genuinely full-coverage
  // fixture needs an all-relSupported-grammar repo from scratch — same "ts-only" recipe tests/relation-coverage
  // .test.mjs already proves gets no disclosure line at all.
  const tmp2 = mkdtempSync(join(tmpdir(), 'grain-export-parity-full-cov-'));
  const repo2 = join(tmp2, 'r');
  try {
    mkdirSync(repo2, { recursive: true }); gitIn(repo2, 'init', '-q', '-b', 'main'); gitIn(repo2, 'config', 'commit.gpgsign', 'false');
    wIn(repo2, 'packages/core/util.ts', 'export const util = () => 1;\n');
    wIn(repo2, 'apps/a/main.ts', "import { util } from '../../packages/core/util';\nexport const a = () => util();\n");
    commitIn(repo2, 'base');
    const r = spawnSync('node', [BIN, 'export', '--compact'], { cwd: repo2, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    assert.equal(r.status, 0, r.stderr);
    const d2 = JSON.parse((r.stdout || '').split('\n').find(l => l.startsWith('{')));
    assert.deepEqual(d2.relCoverage, { n: 0, grammars: [] }, 'a fully-covered fixture must export the honest empty shape, not omit the field or leave it null');
  } finally { rmSync(tmp2, { recursive: true, force: true }); }
});
