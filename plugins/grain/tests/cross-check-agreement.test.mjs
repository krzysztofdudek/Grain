// cross-check-agreement.test.mjs — GENERALIZES tests (1)-(4) of spectrum-role-deviation.test.mjs into one LOOPED
// property asserted over every file in a fixture, instead of a handful of bespoke per-file cases: `checkFile` (the
// acceptance-gated, governance-aware surface) and `spectrum`/`explain` (the full, ungated lattice for one file) must
// never contradict each other about the SAME file.
//
// Motivated by .temp/issues/001-spectrum-role-deviation-false-positive/issue.md (FIXED, verified 1453/1453):
// `spectrum`'s per-file `dev` flag on a role-conditioned (`r<N>:`) row was computed over every same-kind scope in
// the file, not just the ones in that row's own role — so a sibling role's (or unroled) scope could make a NORM row
// spectrum shows at 100% share print "← THIS FILE DEVIATES" on a file `check` reports as fully conforming. Fixed by
// filtering the per-file population (`mine3`) through the same `roleOf` helper the cell construction already used.
//
// THE INVARIANT, asserted as a set/loop property, not bespoke per-file cases:
//
//   Direction U (universal — every file, every checkFile deviation): for every msg `checkFile` returns, the exact
//     (cid, pid) named by its `factKey` (`cid + '|' + pid`, built at the `msgs.push(...)` call sites in checkFile —
//     see ~line 2119 for the ordinary predicate-deviation path and ~line 2154 for the structural-shape path) must
//     appear as a row in `spectrum({minBits: NO_CUTOFF})`'s output for that file, with `dev === true`. Every entry
//     in `checkFile`'s `msgs` array IS a deviation — `governed`, `archHits`, `waiverHits`, `steerHits` and
//     `newScopeHits` are separate, non-deviation return fields (informational or "decided" voices), so nothing
//     needs to be filtered out of `msgs` itself. Check is the acceptance-gated subset of the lattice; the full
//     lattice must never call conforming what the gated view flags. Asserted as set inclusion: pids(check-deviations)
//     ⊆ pids(dev-rows), for the SAME cid, on every file.
//
//   Direction G (governed converse, on rows whose governance this fixture fixes by construction): for the two facts
//     this fixture poisons onto the model — a role fact `r<ROLE>:type` and a directory fact `d[src/handlers]:type`,
//     both on `auto.extends:Command` — spectrum's `dev` on that exact (cid, pid) row must equal whether `checkFile`
//     actually raised a deviation governed by that same (cid, pid). This is checked as an IFF, which is strictly
//     stronger than (and subsumes) both halves the issue's acceptance criterion asks for: "no NORM row governing a
//     conforming file's scopes may say dev=true while check is silent" (the ⟸ read: checkDeviates → row.dev, so a
//     false row.dev with checkDeviates=true is caught) AND "on the deliberately-deviant file, BOTH surfaces must
//     fire" (the ⟹ read: row.dev → checkDeviates, so a stray row.dev=true with nothing behind it in check is
//     caught). This is deliberately NOT asserted for a `d[...]`/`_all:` reading that ISN'T backed by a poisoned NORM
//     fact — spectrum legitimately shows plenty of lattice rows check does not govern (e.g. the uncertified
//     `_all:type`/`d[src/handlers]:type` rows in spectrum-role-deviation.test.mjs's test (4), `isNorm: false`), and
//     those are not disagreements, just the full lattice showing more than the gated view does.
//
// FIXTURE: builds on spectrum-role-deviation.test.mjs's exact shape and poisoning technique (a real repo, a real
// `grain status` run — induceRoles will not certify role facts naturally on a fixture this small/uniform — then the
// SAME poisoning: push a medoid, set `part.assignments`, push a fully-populated fact object onto `part.facts`, save
// the model back) — reusing its PAIRED/EXTRA/Rogue construction verbatim — and EXTENDS it with a SECOND poisoned
// fact, `d[src/handlers]:type` on the SAME pid (`auto.extends:Command`), so the loop exercises TWO cid families
// (`r<N>:` and `d[...]:`), not just roles, and exercises checkFile's own specificity governance for real (its
// `ctxRank`/`sraw` tie-break: "the most specific applicable context governs... among applicable facts the smallest
// evidence class wins" — see checkFile ~line 2067-2080). Both facts are given the SAME shape as the role fact's own
// established population (`counts: { true: 14 }`, no `false` key: only the 14 non-deviant Commands are "established",
// exactly test (1)'s reasoning in spectrum-role-deviation.test.mjs) so both pass checkFile's own KT/tau significance
// bar the same way — a directory fact poisoned instead with the raw, unfiltered 14-true/10-false split (mixing in
// every Handler) was verified NOT to reach checkFile's tau threshold (0 real deviations from a much noisier,
// 58%-share population), which is itself evidence the two surfaces are NOT trivially in agreement here: spectrum
// still renders that noisier row as `dev: true` from raw predicate values (bypassing minBits), while checkFile
// stays silent on a signal too weak to govern by its own math — exactly the "uncertified row" case the previous
// paragraph excludes from Direction G, encountered first-hand while building this fixture.
//
// Consequence of reusing the same pid for both facts: role beats directory by `sraw` (14 vs 14, tie broken by
// `ctxRank`: role's `r\d` prefix ranks 0, directory's `d[` prefix ranks 1) for every Command scope (all of which
// carry the poisoned role), so the role fact alone governs Commands exactly as in spectrum-role-deviation.test.mjs;
// every *Handler* scope (never assigned the poisoned role — sticky -1, and never extends anything) is governed
// exclusively by the directory fact instead, and IS a genuine, independently-arising deviation under that second
// family on every PAIRED file and on Rogue — not just the one file the role family already flags. That gives
// Direction G's loop real, repeated positive cases for the directory family, not just one.
//
// SCOPED OUT (by design, not oversight): waivers and steers are excluded from this invariant. A waived/steered scope
// is deliberately NOT reported as a deviation by `checkFile` — a "decided" voice (`waiverHits`/`steerHits`) takes
// its place, `msgs` stays clean — while `spectrum` has no concept of a waiver or steer at all and would still show
// that row as `dev`. That divergence is checkFile speaking with information (a maintainer decision) spectrum never
// had reason to have, not a disagreement grain's two commands have with each other. This fixture seeds no waivers
// or steers, so the question never arises here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spectrum, checkFile, partitionFor } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const initRepo = name => { const tmp = mkdtempSync(join(tmpdir(), name)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };
const modelPathOf = repo => join(repo, '.grain', 'cache', 'model.json');
const loadModel = repo => JSON.parse(readFileSync(modelPathOf(repo), 'utf8'));
const saveModel = (repo, model) => writeFileSync(modelPathOf(repo), JSON.stringify(model));

// identical to spectrum-role-deviation.test.mjs's fixture shapes — a `*Command` class extending the `Command`
// marker (role under test) beside a `*Handler` class that never extends anything (never assigned that role, and
// legitimately so — `check` has never flagged this pairing on its own)
const commandSrc = (name, extendsCommand = true) => `export class ${name}Command${extendsCommand ? ' extends Command' : ''} {\n  readonly id: number;\n  constructor(id: number) {\n    this.id = id;\n  }\n}\n`;
const handlerSrc = name => `export class ${name}Handler {\n  handle(cmd: ${name}Command): number {\n    return cmd.id;\n  }\n}\n`;

// PAIRED: the reported shape itself (Command + Handler, same file) — also the population BOTH poisoned facts
// certify (role: the Commands; directory: the same 14 Commands, re-used as the "established" set for that fact too).
// EXTRA: Command-only files, so the role's `_all:`/`d[...]` population is never a 50/50 tie and — more importantly
// for this file — gives Direction G's loop several files with NO Handler scope at all, hence no way to trip the
// directory family: genuinely, fully conforming files under BOTH poisoned facts.
// Rogue: PAIRED shape, but its own Command scope does not extend `Command` — trips the ROLE family.
// Every PAIRED file's Handler (and Rogue's) never extends anything — trips the DIRECTORY family, on every one of them.
const PAIRED = ['Order', 'Payment', 'Shipment', 'Refund', 'Invoice', 'Cart', 'Customer', 'Product'];
const EXTRA = ['Stock', 'Coupon', 'Notification', 'Audit', 'Report', 'Ticket'];

let tmp, repo, ROLE;
before(() => {
  ({ tmp, repo } = initRepo('grain-cross-check-agreement-'));
  for (const e of PAIRED) wIn(repo, `src/handlers/${e}.ts`, commandSrc(e) + '\n' + handlerSrc(e));
  for (const e of EXTRA) wIn(repo, `src/handlers/${e}Only.ts`, commandSrc(e));
  wIn(repo, 'src/handlers/Rogue.ts', commandSrc('Rogue', false) + '\n' + handlerSrc('Rogue'));
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repo, d1, 'add', '-A'); gitIn(repo, d1, 'commit', '-qm', 'the cross-check-agreement fixture');
  assert.equal(grainIn(repo, ['status']).code, 0);

  const model = loadModel(repo);
  const part = partitionFor(model, 'src/handlers/Order.ts');
  ROLE = part.medoids.length; // a fresh, never-colliding role index
  part.medoids.push({ label: 'Command', feats: ['sup:Command'] });
  for (const e of PAIRED) { part.assignments[`src/handlers/${e}.ts#type#${e}Command`] = ROLE; part.assignments[`src/handlers/${e}.ts#type#${e}Handler`] = -1; }
  for (const e of EXTRA) part.assignments[`src/handlers/${e}Only.ts#type#${e}Command`] = ROLE;
  part.assignments['src/handlers/Rogue.ts#type#RogueCommand'] = ROLE;
  part.assignments['src/handlers/Rogue.ts#type#RogueHandler'] = -1;
  // FAMILY 1 — role: the 14 non-deviant Commands (8 paired + 6 extra) are the established population; Rogue is
  // deliberately excluded (exactly spectrum-role-deviation.test.mjs's fact object, same numbers, same shape).
  part.facts.push({ cid: `r${ROLE}:type`, kind: 'type', pid: 'auto.extends:Command', exp: 'true',
    parentExp: null, counts: { true: 14 }, srawCounts: { true: 14 }, alphabet: ['true', 'false'],
    raw: 14, sraw: 14, share: 1, bpi: 1, tau: 3, nSurfaces: 1, siblings: [],
    suppressedValue: null, denyEligible: false, exemplars: [], deviantsN: 0, deviants: [], altMarker: null });
  // FAMILY 2 — directory: same established population, same shape, DIFFERENT cid family (`d[...]:` instead of
  // `r<N>:`). Governs every type-kind scope under src/handlers/ that the (smaller-or-equal-sraw, smaller-ctxRank)
  // role fact does not already claim — i.e. every Handler, in every PAIRED file and in Rogue.
  part.facts.push({ cid: 'd[src/handlers]:type', kind: 'type', pid: 'auto.extends:Command', exp: 'true',
    parentExp: null, counts: { true: 14 }, srawCounts: { true: 14 }, alphabet: ['true', 'false'],
    raw: 14, sraw: 14, share: 1, bpi: 1, tau: 3, nSurfaces: 1, siblings: [],
    suppressedValue: null, denyEligible: false, exemplars: [], deviantsN: 0, deviants: [], altMarker: null });
  saveModel(repo, model);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

// bits is naturally negative on a fixture this small (idxCost overhead dwarfs a 14-scope population's own evidence)
// — irrelevant to either direction under test (a display-cutoff concern, not a `dev`-correctness one), so every
// call bypasses the cutoff with a minBits far below anything a real bits value could be.
const NO_CUTOFF = -1e9;
// `factKey` is built at checkFile's own `msgs.push` sites as `cid + '|' + pid` (or, for the structural-shape path,
// `'r'+role+':'+kind + '|' + 'auto.shape:'+sig` — same shape, same separator). Parsing it out here, rather than
// re-deriving governance ourselves, is what makes Direction U a check against checkFile's OWN stated cid, not our
// guess at one.
const cidOf = factKey => factKey.slice(0, factKey.indexOf('|'));
const filesOf = model => partitionFor(model, 'src/handlers/Order.ts').files.slice();

test('(1) DIRECTION U, looped over every file in the fixture: every checkFile fact-deviation is a dev=true spectrum row on the same (cid, pid)', async () => {
  const model = loadModel(repo);
  const files = filesOf(model);
  assert.equal(files.length, PAIRED.length + EXTRA.length + 1, `fixture sanity — expected exactly the ${PAIRED.length} paired + ${EXTRA.length} extra + 1 rogue files: ${JSON.stringify(files)}`);
  let checked = 0;
  for (const rel of files) {
    const { msgs } = await checkFile({ model, root: repo, rel });
    const { rows } = await spectrum({ model, root: repo, rel, minBits: NO_CUTOFF });
    for (const m of msgs) {
      checked++;
      const cid = cidOf(m.factKey);
      const row = rows.find(r => r.cid === cid && r.pid === m.pid);
      assert.ok(row, `${rel}: checkFile flagged a deviation at ${cid}|${m.pid} that spectrum has NO row for at all — msg=${JSON.stringify(m)}, spectrum rows=${JSON.stringify(rows.map(r => ({ cid: r.cid, pid: r.pid, dev: r.dev })))}`);
      assert.equal(row.dev, true, `${rel}: checkFile flagged ${cid}|${m.pid} as a deviation (exp ${m.exp}, obs ${m.obs}, scope ${m.scope}) but spectrum's matching row says dev=false — check and spectrum contradict each other about the SAME file: msg=${JSON.stringify(m)}, row=${JSON.stringify(row)}`);
    }
  }
  // fixture sanity: this fixture is built to produce real checkFile deviations (Rogue's role deviation, every
  // PAIRED/Rogue Handler's directory deviation) — if this were ever 0, Direction U would be vacuously true and
  // proving nothing, which is itself worth catching.
  assert.ok(checked > 0, 'fixture sanity: expected checkFile to raise at least one real deviation across the fixture — Direction U would otherwise be checked vacuously');
});

test('(2) DIRECTION G, looped over every file: spectrum dev IFF checkFile deviates under the SAME governing (cid, pid), for both the role and the directory family', async () => {
  const model = loadModel(repo);
  const files = filesOf(model);
  const PID = 'auto.extends:Command';
  const FAMILIES = [[`r${ROLE}:type`, 'role'], ['d[src/handlers]:type', 'directory']];
  let roleDeviations = 0, dirDeviations = 0;
  for (const rel of files) {
    const { msgs } = await checkFile({ model, root: repo, rel });
    const { rows } = await spectrum({ model, root: repo, rel, minBits: NO_CUTOFF });
    for (const [cid, label] of FAMILIES) {
      const row = rows.find(r => r.cid === cid && r.pid === PID);
      assert.ok(row, `${rel}: expected a ${label} row at ${cid}|${PID} (every file here has at least one type-kind scope contributing to both populations) — rows=${JSON.stringify(rows.map(r => ({ cid: r.cid, pid: r.pid })))}`);
      assert.equal(row.isNorm, true, `${rel}: the ${label} row ${cid}|${PID} was expected to be a certified NORM row by construction (this fixture poisons exactly that fact) — row=${JSON.stringify(row)}`);
      const checkDeviates = msgs.some(m => cidOf(m.factKey) === cid && m.pid === PID);
      if (checkDeviates) { if (label === 'role') roleDeviations++; else dirDeviations++; }
      assert.equal(row.dev, checkDeviates,
        `${rel}: ${label} row ${cid}|${PID} — spectrum says dev=${row.dev}, checkFile says it ${checkDeviates ? 'DOES' : 'does NOT'} raise a deviation governed by this exact (cid, pid). ` +
        `A NORM row's dev flag must never contradict what check itself decided for the population that same row describes. ` +
        `msgs for this file=${JSON.stringify(msgs.map(m => ({ factKey: m.factKey, pid: m.pid, scope: m.scope, exp: m.exp, obs: m.obs })))}, row=${JSON.stringify(row)}`);
    }
  }
  // fixture sanity: both families must actually fire somewhere, and both must also stay silent somewhere (else the
  // iff above degenerates to checking a constant) — Rogue is the role family's one deviant; every PAIRED file's
  // Handler (8) plus Rogue's own Handler (1) trip the directory family; every EXTRA-only file (no Handler at all)
  // must stay silent on the directory family, and every non-Rogue file must stay silent on the role family.
  assert.equal(roleDeviations, 1, `fixture sanity: expected exactly Rogue to trip the role family, got ${roleDeviations}`);
  assert.equal(dirDeviations, PAIRED.length + 1, `fixture sanity: expected every PAIRED file's Handler plus Rogue's own Handler (${PAIRED.length + 1} files) to trip the directory family, got ${dirDeviations}`);
});

test('(3) `explain <file>` and `spectrum <file>` are documented aliases: byte-identical CLI output for the same file', () => {
  const rel = 'src/handlers/Rogue.ts'; // the deviant file — exercises the "← THIS FILE DEVIATES" render path in both
  const a = grainIn(repo, ['explain', rel]);
  const b = grainIn(repo, ['spectrum', rel]);
  assert.equal(a.code, 0, `explain exited ${a.code}: ${a.err}`);
  assert.equal(b.code, 0, `spectrum exited ${b.code}: ${b.err}`);
  assert.equal(a.out, b.out, `explain and spectrum are documented aliases of the same command (engine/grain.mjs: 'case \\'spectrum\\': case \\'explain\\': lines = await cmdSpectrum(ctx);') and must produce byte-identical output for the same file`);
});
