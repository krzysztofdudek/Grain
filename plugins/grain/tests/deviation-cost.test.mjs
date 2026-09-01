// J5.1 — the cost of deviating. An accepted convention says what the repo does; it never says what ignoring it
// costs. `f.cost` answers that from the lifecycle rows alone: of the fact's DEVIANTS, how many later needed a
// `fix:` commit, against the same rate over the fact's WHOLE observable population (conform ∪ deviants)?
//
// One cell per accepted fact, K = 2 (`has_fix` : `no_fix`), contrasted against a parent tally that CONTAINS the
// child's own counts — the shape `mine()`'s `_all:` cell, J4.1's `glob` and `bridgeBits`' base rate all already
// use. Observable means: a HEAD scope with its own `H.lc` row AND `ageFn(s) >= CFG.freshDays`, applied to BOTH
// sides of the cell, so a population that has not yet had time to need a fix cannot inflate either side.
//
// The gates, in order: `bits > 0` (KT/BIC codelength gain minus one repo-wide `idxCostD`), an EXCESS and never a
// deficit, and finally `mine()`'s own loss bound applied to `has_fix` — `(k + 0.5) / (n + K/2) >= 1 − 1/λ` =
// 0.875. That last one is the whole design: grain will not tell a maintainer that leaving a deviation in place
// will cost a repair when one deviant in four turned out fine.
//
// The four fixtures below, and their arithmetic (all with idxCostD = 1, since exactly ONE accepted fact in each
// repo has ≥ minRaw observable deviants, so C = 1 and ceil(log2(max(1, 2))) = 1):
//
//   (a) 11 of 12 deviants carry a fix; 13 of the whole 120 do.
//       kt_local = 11.5/13 = .884615 / 1.5/13 = .115385 · kt_glob = 13.5/121 = .111570 / 107.5/121 = .888430
//       data = 11·log2(7.928786) + 1·log2(.129874) = 32.8590 − 2.9449 = 29.9141
//       bits = 29.9141 − 0.5·log2(12) − 1 = 29.9141 − 1.7925 − 1 = 27.12   → speaks
//       excess .9167 > .1083 ✓ · λ: (11+.5)/13 = .8846 ≥ .875 ✓ · multiplier (11/12)/(13/120) = 8.46 → "8.5×"
//   (b) 2 of 12 deviants and 20 of 120 overall — the SAME rate: data = −0.04, bits = −2.83 ≤ 0, and the excess
//       gate independently refuses an equal rate. Silent.
//   (c) the ticket's own original "9 of 12" example, kept here as a NEGATIVE control: 9 of 12 vs 11 of 120 is
//       18.44 bits of perfectly real evidence and a 8.2× excess — and λ ((9+.5)/13 = .7308 < .875) refuses it
//       anyway. The corrected mechanism speaks only for near-unanimous deviant populations, on purpose.
//   (d) the age confound the design named in advance: deviants born 2025-04-01 (334 days before HEAD), conformers
//       born 2026-01-20 (40 days), and the SAME per-day fix rate on both sides — 6/12 over 334 days = .150%/day,
//       6/108 over 40 days = .139%/day. The binary `has_fix` outcome turns that equal rate into a 5.0× raw
//       excess (6/12 = 50% vs 12/120 = 10%) worth 5.80 bits, and λ ((6+.5)/13 = .5 < .875) is what keeps grain
//       silent. NOTE, precisely: the shared `CFG.freshDays` window is a FLOOR — it drops scopes too young to
//       have had a chance — not an exposure normaliser. λ is the gate that actually catches this one.
//
// (a) also carries six conformers born three days before HEAD. They are inside the fact (raw 126) and outside the
// cost cell (baseN 120): the assertion on `baseN` is what proves the freshness window reaches the population side
// as well as the deviant side.
//
// Every repo has the same shape: `alpha/` holds 120 established `Tn.ts` classes whose `run()` calls `validate()`,
// twelve of which do not; `beta/` holds 20 unrelated files whose only job is to make the MDL cut fall at the top
// level, so `alpha/` becomes a directory card that owns the fact and `grain where alpha` renders `factNotes` on
// it. A fix is applied by giving a scope one extra, uniquely-named call (`noteN()`): `L.fix` counts BODY-HASH
// modifications, so a fix commit must MODIFY a scope, never create one — and `bh` is built from the first
// statement, the seen node types, the calls, the decorators, the supertypes and the name, never from a literal,
// so changing `"ok"` to `"fine"` would not have registered as a modification at all.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { factNotes } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repoA, repoB, repoC, repoD;

const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'Dev', GIT_AUTHOR_EMAIL: 'dev@x', GIT_COMMITTER_NAME: 'Dev', GIT_COMMITTER_EMAIL: 'dev@x', TZ: 'UTC', GIT_AUTHOR_DATE: `${iso}T12:00:00Z`, GIT_COMMITTER_DATE: `${iso}T12:00:00Z` });
const gitIn = (repo, iso, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...dateEnv(iso) } });
const w = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = (repo, args) => spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' });
const grainOut = (repo, args) => { const r = grain(repo, args); assert.equal(r.status, 0, r.stdout + r.stderr); return (r.stdout || '').replace(/\n$/, ''); };
const modelIn = repo => { assert.equal(grain(repo, ['status']).status, 0); return JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8')); };
const validateFact = model => { const fs2 = model.partitions.flatMap(p => p.facts).filter(f => f.pid === 'auto.call:validate');
  assert.equal(fs2.length, 1, `exactly one accepted \`calls validate\` fact expected, got ${fs2.length}`); return fs2[0]; };

// a `run()` body: the conforming one calls `validate()`, the deviant one does not; a fix appends one uniquely
// named call, which changes the body hash (and so bumps `L.fix`) without changing which side of the fact it is on
const cls = (i, body) => `export class T${i} {\n  run() {\n${body}  }\n}\n`;
const conform = (i, fixed) => cls(i, `    validate();\n${fixed ? `    note${i}();\n` : ''}    return "ok";\n`);
const deviant = (i, fixed) => cls(i, `${fixed ? `    note${i}();\n` : ''}    return "ok";\n`);

const DEVIANTS = 12, TOTAL = 120; // 108 conformers: (108 + 0.5) / (120 + 1) = .897 ≥ .875, so the fact itself is accepted
const commit = (repo, iso, msg) => { gitIn(repo, iso, 'add', '-A'); gitIn(repo, iso, 'commit', '-qm', msg); };
const initRepo = name => { const repo = join(tmp, name); mkdirSync(repo);
  gitIn(repo, '2025-01-01', 'init', '-q', '-b', 'main'); gitIn(repo, '2025-01-01', 'config', 'commit.gpgsign', 'false');
  for (let j = 0; j < 20; j++) w(repo, `beta/B${j}.ts`, `export class B${j} {\n  emit() {\n    return ${j};\n  }\n}\n`);
  return repo; };
const writeAll = (repo, { devFixed = 0, confFixed = [], from = 0, to = TOTAL }) => {
  for (let i = from; i < to; i++) w(repo, `alpha/T${i}.ts`, i < DEVIANTS ? deviant(i, i < devFixed) : conform(i, confFixed.includes(i))); };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-devcost-'));

  // (a) 11 of 12 deviants fixed, 2 of 108 conformers fixed, plus six conformers born 3 days before HEAD
  repoA = initRepo('a');
  writeAll(repoA, {}); commit(repoA, '2026-01-05', 'feat: the things');
  writeAll(repoA, { devFixed: 11 }); commit(repoA, '2026-02-01', 'fix: handle the empty payload');
  writeAll(repoA, { devFixed: 11, confFixed: [20, 21] }); commit(repoA, '2026-02-05', 'fix: guard the null case');
  writeAll(repoA, { from: TOTAL, to: TOTAL + 6 }); commit(repoA, '2026-02-26', 'feat: six more things');
  w(repoA, 'NOTES.md', 'notes\n'); commit(repoA, '2026-03-01', 'chore: notes');

  // (b) 2 of 12 deviants and 18 of 108 conformers fixed — 2/12 and 20/120 are the same rate
  repoB = initRepo('b');
  writeAll(repoB, {}); commit(repoB, '2026-01-05', 'feat: the things');
  const CONF_B = Array.from({ length: 18 }, (_, k) => DEVIANTS + k);
  writeAll(repoB, { devFixed: 2 }); commit(repoB, '2026-02-01', 'fix: handle the empty payload');
  writeAll(repoB, { devFixed: 2, confFixed: CONF_B }); commit(repoB, '2026-02-05', 'fix: guard the null case');
  w(repoB, 'NOTES.md', 'notes\n'); commit(repoB, '2026-03-01', 'chore: notes');

  // (c) the ticket's own original example: 9 of 12 deviants, 2 of 108 conformers
  repoC = initRepo('c');
  writeAll(repoC, {}); commit(repoC, '2026-01-05', 'feat: the things');
  writeAll(repoC, { devFixed: 9 }); commit(repoC, '2026-02-01', 'fix: handle the empty payload');
  writeAll(repoC, { devFixed: 9, confFixed: [20, 21] }); commit(repoC, '2026-02-05', 'fix: guard the null case');
  w(repoC, 'NOTES.md', 'notes\n'); commit(repoC, '2026-03-01', 'chore: notes');

  // (d) the age confound: deviants born 334 days before HEAD, conformers 40 — same per-day fix rate on both sides
  repoD = initRepo('d');
  writeAll(repoD, { to: DEVIANTS }); commit(repoD, '2025-04-01', 'feat: the first twelve');
  writeAll(repoD, { devFixed: 6, to: DEVIANTS }); commit(repoD, '2025-08-01', 'fix: the early breakage');
  writeAll(repoD, { devFixed: 6 }); commit(repoD, '2026-01-20', 'feat: the rest of the things');
  const CONF_D = Array.from({ length: 6 }, (_, k) => DEVIANTS + k);
  writeAll(repoD, { devFixed: 6, confFixed: CONF_D }); commit(repoD, '2026-02-10', 'fix: guard the null case');
  w(repoD, 'NOTES.md', 'notes\n'); commit(repoD, '2026-03-01', 'chore: notes');
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(a) deviants that later needed a fix are named, with the counts and the multiplier', () => {
  const f = validateFact(modelIn(repoA));
  assert.equal(f.exp, 'true'); assert.equal(f.sraw, TOTAL, 'the printed population is the established one');
  assert.deepEqual(f.cost, { k: 11, n: 12, baseK: 13, baseN: 120, bits: 27.12 },
    `the cost cell must be 11 of 12 deviants against 13 of the 120 established, worth 27.12 bits — got ${JSON.stringify(f.cost)}`);
  // baseN 120, not 126: the six conformers born three days before HEAD are inside the fact and outside the cell
  assert.equal(f.raw, TOTAL + 6, 'the raw population does include the six young conformers');
});

test('(a) factNotes, `where` and `check` all render the clause', () => {
  const f = validateFact(modelIn(repoA));
  assert.match(factNotes(f), / · deviants get fixes 8\.5× more often \(11 of 12 vs 13 of 120\)$/);
  const where = grainOut(repoA, ['where', 'alpha']);
  assert.match(where, /methods here call `validate` — 90% of 120 · held since [\d-]+, last reinforced [\d-]+ · deviants get fixes 8\.5× more often \(11 of 12 vs 13 of 120\)/,
    `\`where\` must carry the clause on the fact's bullet, got:\n${where}`);
  const check = grainOut(repoA, ['check', '--all', 'alpha/T0.ts']);
  assert.match(check, /\n {2}\(held since [\d-]+, last reinforced [\d-]+ · deviants get fixes 8\.5× more often \(11 of 12 vs 13 of 120\)\)/,
    `\`check\` must carry the clause under the deviation, got:\n${check}`);
});

test('(b) an even fix rate between the deviants and the population says nothing', () => {
  const f = validateFact(modelIn(repoB));
  assert.equal(f.cost, undefined, `2 of 12 against 20 of 120 is the same rate — no cost may be claimed, got ${JSON.stringify(f.cost)}`);
});

test('(c) the ticket\'s own "9 of 12" example is refused by the loss bound, 18 bits of evidence notwithstanding', () => {
  const f = validateFact(modelIn(repoC));
  assert.equal(f.cost, undefined, `(9 + 0.5) / 13 = .731 < .875 — one deviant in four was fine, so grain must stay silent, got ${JSON.stringify(f.cost)}`);
});

test('(d) deviants that are merely OLDER, at the same per-day fix rate, earn no cost clause', () => {
  const f = validateFact(modelIn(repoD));
  assert.equal(f.cost, undefined, `an exposure difference is not a cost — got ${JSON.stringify(f.cost)}`);
});

test('(e) an incremental refresh yields a byte-identical `cost` to a full rebuild', () => {
  w(repoA, `alpha/T${TOTAL + 6}.ts`, conform(TOTAL + 6, false));
  commit(repoA, '2026-03-05', 'feat: one more thing');
  const incremental = JSON.stringify(validateFact(modelIn(repoA)).cost);
  assert.notEqual(incremental, undefined, 'the comparison must have something to compare');
  rmSync(join(repoA, '.grain', 'cache'), { recursive: true });
  assert.equal(JSON.stringify(validateFact(modelIn(repoA)).cost), incremental, 'a full rebuild must equal the incremental model byte for byte');
});
