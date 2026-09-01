// 001 — `spectrum`/`explain` marked a role-conditioned NORM row "← THIS FILE DEVIATES" on a file `check` reports as
// fully conforming. Root cause (core.mjs, `spectrum`'s row construction): `mine3` — the per-file population a row's
// `dev` flag is computed over — filtered only by `kind`, never by ROLE, even when the row's own `cid` is
// role-conditioned (`r<N>:kind`). A role-A row was therefore tested against every same-kind scope in the file,
// including a role-B (or unroled) sibling that was never part of that row's population — exactly the field-reported
// C# shape: a handler type (role, extends `IRequestHandler`) beside a command type in the SAME file that correctly
// does not. Fixed by reusing `roleOf` (already in `spectrum`'s own scope, already what the cell construction above
// uses) to filter `mine3` to the row's own role when `cid` starts `r<N>:`. `_all:`/`d[...]:` cids are untouched —
// their population already matches every same-kind scope in the file (see test (4)).
//
// FIXTURE NOTE: induceRoles's own clustering does not reliably split a role this small/uniform into its own group —
// measured directly on this fixture's natural `grain status` run: 0 accepted role-conditioned facts (the `_all:`-only
// signal that DOES form is not enough to reproduce the reported per-file contradiction, which only exists when the
// certifying fact is itself role-conditioned). So the one role assignment and the one fact under test are asserted
// directly onto a real, freshly-mined model — the same poisoning technique `cross-file-exemplar.test.mjs` and
// `answer-grammar.test.mjs` already use for a scenario too specific to coax out of `mine()`'s own heuristics. Every
// scope, predicate value and extracted `auto.extends:Command` reading is real (real TypeScript, really parsed) —
// only the role NUMBER a Command scope belongs to, and the existence of the one NORM fact for that role, are
// injected, standing in for what a much larger, real-world Command population would have made `mine()` accept on
// its own (as it evidently did in the field report this ticket is about).
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

// a `*Command` class extending the `Command` marker (role under test) beside a `*Handler` class that never extends
// anything (a different role, and legitimately so — `check` has never flagged this pairing)
const commandSrc = (name, extendsCommand = true) => `export class ${name}Command${extendsCommand ? ' extends Command' : ''} {\n  readonly id: number;\n  constructor(id: number) {\n    this.id = id;\n  }\n}\n`;
const handlerSrc = name => `export class ${name}Handler {\n  handle(cmd: ${name}Command): number {\n    return cmd.id;\n  }\n}\n`;

// PAIRED: the reported shape itself (Command + Handler, same file) — the population the injected fact certifies.
// EXTRA: Command-only files (no paired Handler) so the `_all:`/`d[...]` population is majority-`true` (14 true of
// 24), never a 50/50 tie that would make test (4)'s own boundary case fragile.
// Rogue: PAIRED shape, but its OWN Command scope does not extend `Command` — the genuine deviation test (2) needs.
const PAIRED = ['Order', 'Payment', 'Shipment', 'Refund', 'Invoice', 'Cart', 'Customer', 'Product'];
const EXTRA = ['Stock', 'Coupon', 'Notification', 'Audit', 'Report', 'Ticket'];

let tmp, repo;
before(() => {
  ({ tmp, repo } = initRepo('grain-spectrum-role-dev-'));
  for (const e of PAIRED) wIn(repo, `src/handlers/${e}.ts`, commandSrc(e) + '\n' + handlerSrc(e));
  for (const e of EXTRA) wIn(repo, `src/handlers/${e}Only.ts`, commandSrc(e));
  wIn(repo, 'src/handlers/Rogue.ts', commandSrc('Rogue', false) + '\n' + handlerSrc('Rogue'));
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repo, d1, 'add', '-A'); gitIn(repo, d1, 'commit', '-qm', 'the role-deviation fixture');
  assert.equal(grainIn(repo, ['status']).code, 0);

  const model = loadModel(repo);
  const part = partitionFor(model, 'src/handlers/Order.ts');
  const ROLE = part.medoids.length; // a fresh, never-colliding role index
  part.medoids.push({ label: 'Command', feats: ['sup:Command'] });
  for (const e of PAIRED) { part.assignments[`src/handlers/${e}.ts#type#${e}Command`] = ROLE; part.assignments[`src/handlers/${e}.ts#type#${e}Handler`] = -1; }
  for (const e of EXTRA) part.assignments[`src/handlers/${e}Only.ts#type#${e}Command`] = ROLE;
  part.assignments['src/handlers/Rogue.ts#type#RogueCommand'] = ROLE;
  part.assignments['src/handlers/Rogue.ts#type#RogueHandler'] = -1;
  // the 14 non-deviant Commands (8 paired + 6 extra) are the established population; Rogue is deliberately excluded
  part.facts.push({ cid: `r${ROLE}:type`, kind: 'type', pid: 'auto.extends:Command', exp: 'true',
    parentExp: null, counts: { true: 14 }, srawCounts: { true: 14 }, alphabet: ['true', 'false'],
    raw: 14, sraw: 14, share: 1, bpi: 1, tau: 3, nSurfaces: 1, siblings: [],
    suppressedValue: null, denyEligible: false, exemplars: [], deviantsN: 0, deviants: [], altMarker: null });
  saveModel(repo, model);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

// bits is naturally negative on a fixture this small (idxCost overhead dwarfs a 14/24-scope population's own
// evidence) — irrelevant to the bug under test (a display-cutoff concern, not a `dev` correctness one), so every
// call bypasses the cutoff with a minBits far below anything a real bits value could be.
const NO_CUTOFF = -1e9;
const extendsRow = rows => rows.find(r => /^r\d+:/.test(r.cid) && r.pid === 'auto.extends:Command');

test('(1) THE REPORTED FALSE POSITIVE: a role-conditioned NORM row does not deviate on a file whose own scope in that role conforms', async () => {
  const model = loadModel(repo);
  const { rows } = await spectrum({ model, root: repo, rel: 'src/handlers/Order.ts', minBits: NO_CUTOFF });
  const row = extendsRow(rows);
  assert.ok(row, `expected a role-conditioned auto.extends:Command row: ${JSON.stringify(rows)}`);
  assert.equal(row.isNorm, true, 'this must be the certified NORM row the bug report is about');
  assert.equal(row.dev, false, `OrderCommand itself extends Command — OrderHandler (a different role, legitimately not extending anything) must not contaminate this row: ${JSON.stringify(row)}`);
});

test('(2) a genuine deviation in the role-conditioned scope itself still fires', async () => {
  const model = loadModel(repo);
  const { rows } = await spectrum({ model, root: repo, rel: 'src/handlers/Rogue.ts', minBits: NO_CUTOFF });
  const row = extendsRow(rows);
  assert.ok(row, `expected a role-conditioned auto.extends:Command row: ${JSON.stringify(rows)}`);
  assert.equal(row.dev, true, `RogueCommand itself does not extend Command — this must still be flagged: ${JSON.stringify(row)}`);
});

test('(3) check and spectrum agree: neither raises a deviation for the conforming file', async () => {
  const model = loadModel(repo);
  const { msgs } = await checkFile({ model, root: repo, rel: 'src/handlers/Order.ts' });
  assert.ok(!msgs.some(m => m.pid === 'auto.extends:Command'), `check must not raise this deviation: ${JSON.stringify(msgs)}`);
  const { rows } = await spectrum({ model, root: repo, rel: 'src/handlers/Order.ts', minBits: NO_CUTOFF });
  assert.equal(extendsRow(rows).dev, false, 'spectrum must not contradict check on the same file');
});

test('(4) `_all:`/`d[...]:` rows are unaffected: still flagged when one of the file\'s scopes lacks the expected value', async () => {
  const model = loadModel(repo);
  const { rows } = await spectrum({ model, root: repo, rel: 'src/handlers/Order.ts', minBits: NO_CUTOFF });
  const all = rows.find(r => r.cid === '_all:type' && r.pid === 'auto.extends:Command');
  const dir = rows.find(r => r.cid === 'd[src/handlers]:type' && r.pid === 'auto.extends:Command');
  assert.ok(all, `expected an _all:type row: ${JSON.stringify(rows)}`);
  assert.ok(dir, `expected a d[src/handlers]:type row: ${JSON.stringify(rows)}`);
  // OrderHandler (kind type, never extends anything) is part of both the _all: and directory populations —
  // both rows must still see it and flag the file, exactly as before this fix
  assert.equal(all.dev, true, `_all:type must still flag this file: ${JSON.stringify(all)}`);
  assert.equal(dir.dev, true, `d[src/handlers]:type must still flag this file: ${JSON.stringify(dir)}`);
});
