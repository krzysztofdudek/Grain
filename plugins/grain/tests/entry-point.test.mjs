// Ticket 028 ("Grain jako wejście do rodziny"), item (3): maintainer decisions (`.grain/seeds.jsonl`, written
// by `grain decide steer|boundary`) rendered INTO the proposal, not just left for `grain seed list` to report.
// `propose` did not read them at all before this ticket — `tests/propose.test.mjs` already guards the RENDERER
// end to end for the shape the proposal takes with no decisions; this file adds the one new shape: a `boundary`
// decision becomes a `deny` in the proposed `yg-architecture.yaml`, with provenance naming the decision.
//
// Only `boundary` renders. A `steer` decision's record (`grain-seed.mjs`: `id, scope, surfaces, retired,
// weight, topic, note, author, createdAt, baseline`) carries no field that is actual rule prose — rendering it
// as a draft aspect would mean GRAIN inventing the rule text, which the task's own stop-and-ask condition rules
// out. `steer` stays Grain-only (`grain seed list`, and the session hook's existing "Maintainer decisions in
// force" line) — a real architectural boundary, not a shortfall. See propose-nodes.mjs's own note at
// `buildMaintainerDenies` for the same call.
//
// New file rather than an extension of the propose-report family: everything here exercises the RENDERER
// (propose-nodes.mjs's `buildMaintainerDenies`, propose-write.mjs's `writeArchitecture`/`validateSeedsFile`) —
// propose-report.mjs's own text formatting is untouched by item (3) — so this sits beside `propose.test.mjs`'s
// concerns, not propose-report's.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../engine/yggdrasil-graph.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
const NO_YG = { YG_BIN: '/no/such/yg.js' }; // deterministic: rendering the deny does not need a drill to run

let tmp, repo, baselineArch;
const propose = (outName, env = {}) => {
  const outDir = join(tmp, outName);
  const r = spawnSync('node', [BIN, 'propose', outDir, '--json', join(tmp, outName + '.json')], {
    cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ...NO_YG, ...env },
  });
  return { r, outDir, jsonPath: join(tmp, outName + '.json') };
};
const writeSeeds = lines => writeFileSync(join(repo, '.grain', 'seeds.jsonl'), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
const boundary = (id, from, to, note = '') => ({ id, boundary: { from, to }, note, author: 't', createdAt: '2024-01-01' });

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'entry-point-'));
  repo = join(tmp, 'fixture');
  execFileSync('node', [BUILDER, repo], { stdio: 'pipe' });
  // captured once, before ANY .grain/seeds.jsonl ever exists in this fixture — the baseline every "no
  // decisions" regression check below compares against
  const { r, outDir } = propose('baseline');
  assert.equal(r.status, 0, r.stderr);
  baselineArch = readFileSync(join(outDir, '.yggdrasil', 'yg-architecture.yaml'), 'utf8');
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('no .grain/seeds.jsonl, no .grain/ at all: the graph is byte-identical to the pre-028 baseline', () => {
  rmSync(join(repo, '.grain', 'seeds.jsonl'), { force: true });
  const noSeedsFile = propose('no-seeds-file');
  assert.equal(noSeedsFile.r.status, 0, noSeedsFile.r.stderr);
  assert.equal(readFileSync(join(noSeedsFile.outDir, '.yggdrasil', 'yg-architecture.yaml'), 'utf8'), baselineArch, 'no .grain/seeds.jsonl must render exactly the pre-028 graph');
});

test('a `boundary` decision on a live directory pair renders as `deny`, with provenance in the description', () => {
  writeSeeds([boundary('b1', 'src/guards', 'src/handlers', 'guards must stay leaf-level')]);
  const { r, outDir } = propose('one-boundary');
  assert.equal(r.status, 0, r.stderr);
  const archText = readFileSync(join(outDir, '.yggdrasil', 'yg-architecture.yaml'), 'utf8');
  const arch = parseYaml(archText);
  const guards = arch.node_types['src-guards'];
  assert.ok(guards, `fixture must still classify src/guards as its own type:\n${archText}`);
  assert.equal(guards.relations?.default, 'deny', 'the boundary must render as this type\'s relations.default: deny');
  assert.match(guards.description, /maintainer decision `b1` 2024-01-01/, guards.description);
  assert.match(guards.description, /guards must stay leaf-level/, 'the decision\'s own note must appear in the description');

  const proposal = JSON.parse(readFileSync(join(outDir, 'proposal.json'), 'utf8'));
  const denyRow = proposal.evidence.find(e => e.kind === 'deny' && e.id === 'src-guards');
  assert.ok(denyRow, 'no deny evidence row for src-guards');
  assert.equal(denyRow.origin, 'maintainer-decision');
  assert.equal(denyRow.decisionId, 'b1');
  assert.match(denyRow.evidence, /never imports `src\/handlers`/);
});

test('two `boundary` decisions on the same directory pair collapse to one deny, not two', () => {
  writeSeeds([boundary('b1', 'src/guards', 'src/handlers', 'first'), boundary('b2', 'src/guards', 'src/handlers', 'second')]);
  const { r, outDir } = propose('two-boundaries-same-pair');
  assert.equal(r.status, 0, r.stderr);
  const arch = parseYaml(readFileSync(join(outDir, '.yggdrasil', 'yg-architecture.yaml'), 'utf8'));
  assert.equal(arch.node_types['src-guards'].relations?.default, 'deny');
  const proposal = JSON.parse(readFileSync(join(outDir, 'proposal.json'), 'utf8'));
  const denyRows = proposal.evidence.filter(e => e.kind === 'deny' && e.id === 'src-guards');
  assert.equal(denyRows.length, 1, `expected exactly one deny row for src-guards, got ${denyRows.length}`);
});

test('a `boundary` naming a directory absent from the model is skipped, with an evidence[] note — never crashes the proposal', () => {
  writeSeeds([boundary('b1', 'src/does-not-exist', 'src/handlers')]);
  const { r, outDir } = propose('boundary-missing-dir');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(outDir, '.yggdrasil', 'yg-architecture.yaml')), 'the rest of the proposal must still be written');
  const proposal = JSON.parse(readFileSync(join(outDir, 'proposal.json'), 'utf8'));
  const skipRow = proposal.evidence.find(e => e.kind === 'boundary-skipped' && e.id === 'b1');
  assert.ok(skipRow, `no boundary-skipped evidence row:\n${JSON.stringify(proposal.evidence.filter(e => e.kind.startsWith('boundary')), null, 1)}`);
  assert.match(skipRow.evidence, /src\/does-not-exist/);
});

test('a decision note carrying non-ASCII text and an embedded newline stays valid YAML', () => {
  writeSeeds([boundary('b1', 'src/guards', 'src/handlers', 'granica architektury — nie mieszaj\nwarstw ⚠')]);
  const { r, outDir } = propose('boundary-unicode-note');
  assert.equal(r.status, 0, r.stderr);
  const archText = readFileSync(join(outDir, '.yggdrasil', 'yg-architecture.yaml'), 'utf8');
  const arch = parseYaml(archText); // throws on a document broken by an unescaped newline or a raw non-ASCII byte
  const desc = arch.node_types['src-guards'].description;
  assert.equal(typeof desc, 'string', `description must stay one scalar string, not be split by the embedded newline:\n${archText}`);
  assert.match(desc, /granica architektury/);
  assert.match(desc, /warstw/);
});

test('.grain/seeds.jsonl with an unparsable line refuses propose, naming the line, and writes nothing', () => {
  writeFileSync(join(repo, '.grain', 'seeds.jsonl'), [
    JSON.stringify(boundary('b1', 'src/guards', 'src/handlers')),
    'not valid json at all',
    JSON.stringify(boundary('b2', 'src/dto', 'src/handlers')),
  ].join('\n') + '\n');
  const { r, outDir } = propose('bad-seeds-line');
  assert.notEqual(r.status, 0, 'propose must refuse, not proceed on a maintainer decision it could not parse');
  assert.match(r.stderr, /\.grain\/seeds\.jsonl:2: not valid JSON/, r.stderr);
  assert.ok(!existsSync(outDir), 'nothing must be written once the seeds file is refused');
});
