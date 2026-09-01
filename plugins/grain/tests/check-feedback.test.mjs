// J5.4: `check`/`review` warn about a deviation once and never follow up — there is no signal about whether a
// maintainer actually acted on a flagged deviation or kept ignoring it. This closes that loop with the same shape
// of mechanism the placement feedback loop already uses (placement-feedback.test.mjs): a pending record written the
// first time a deviation is seen `in your change` (`.grain/cache/check-pending.json`, keyed `rel#factKey`), resolved
// on a later `check` of the same file — gone entirely → acted; still present but the file's content hash changed
// (an edit happened and did not fix it) → ignored, tallied by the STABLE `partition::pid` key (never `cid`, which
// carries a role index that shuffles on every re-learn); unchanged content → left pending, not yet a verdict either
// way. A cumulative `.grain/cache/check-outcomes.json` feeds `grain status`'s own line, mirroring
// `placement-outcomes.json`/`placementOutcomeLine`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmdCheck } from '../engine/grain.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
let tmp, repo, PARTITION;
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };

const probeRel = 'src/handlers/probe.handler.ts';
const probePath = () => join(repo, probeRel);
// a hand-built handler that reuses the fixture's real OrderService (so no extra companion file is needed) and keeps
// every OTHER established surface (the validate(cmd) call, the constructor shape) — the ONLY deviation from the
// fixture's own "types here are annotated with `@Handler`" convention (build-fixture.mjs) is the missing decorator,
// so exactly one deviation group ever appears in `inChange`, keeping acted/ignored assertions unambiguous
const PROBE_DEVIANT = `import { Handler, validate, type Command } from '../core/handler';
import { OrderService } from '../services/order.service';

export interface ProbeCommand extends Command { readonly orderId: string; }

export class ProbeHandler {
  constructor(private readonly service: OrderService) {}

  async handle(cmd: ProbeCommand): Promise<void> {
    validate(cmd);
    const entity = await this.service.load(cmd.orderId);
    await this.service.apply(entity, 'probe');
  }
}
`;
const PROBE_FIXED = PROBE_DEVIANT.replace('export class ProbeHandler', '@Handler()\nexport class ProbeHandler');
// same single deviation (still no @Handler()), different file content/hash — the "edited but not acted on" case
const PROBE_DEVIANT_EDITED = PROBE_DEVIANT.replace("'probe'", "'probe-edited'");

const pendingPath = () => join(repo, '.grain', 'cache', 'check-pending.json');
const outcomesPath = () => join(repo, '.grain', 'cache', 'check-outcomes.json');
const readJsonFile = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const resetState = () => { rmSync(pendingPath(), { force: true }); rmSync(outcomesPath(), { force: true }); rmSync(probePath(), { force: true }); };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-check-fb-'));
  repo = join(tmp, 'fixture');
  execFileSync('node', [BUILDER, repo], { stdio: 'pipe' });
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
  assert.equal(st.status, 0, st.stdout + st.stderr);
  const cj = JSON.parse(grain(['check', 'src/handlers/order.handler.ts', '--json']).out);
  PARTITION = cj.partition; // whatever MDL cuts landed the @Handler norm on — read back, never hardcoded
  assert.ok(PARTITION, 'sanity: order.handler.ts is governed by a partition');
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('a fresh repo with no check-feedback history: `grain status` prints nothing about check notes', () => {
  resetState();
  const out = grain(['status']).out;
  assert.doesNotMatch(out, /check notes acted on/, 'silence until at least one outcome has resolved — no "0 of 0" noise');
});

test('(a) red -> green: a deviation removed after edit tallies as acted, and the pending entry clears', () => {
  resetState();
  writeFileSync(probePath(), PROBE_DEVIANT);
  const r1 = grain(['check', probeRel]);
  assert.equal(r1.code, 0, r1.err);
  assert.match(r1.out, /not annotated with `@Handler`/, 'sanity: the deviation fires and is in-change (untracked file, whole-file range)');
  const pending1 = readJsonFile(pendingPath());
  assert.ok(pending1, 'a pending record must be written on first sight of the deviation');
  const keys1 = Object.keys(pending1);
  assert.equal(keys1.length, 1);
  assert.ok(keys1[0].startsWith(probeRel + '#'), `pending key must be rel + '#' + factKey, got ${keys1[0]}`);
  assert.ok(!keys1[0].slice((probeRel + '#').length).includes(probeRel), 'factKey must not be duplicated/prefixed again');
  assert.equal(typeof pending1[keys1[0]].t, 'number');
  assert.equal(typeof pending1[keys1[0]].h, 'string');

  // fix it — same file, decorator added, still uncommitted
  writeFileSync(probePath(), PROBE_FIXED);
  const r2 = grain(['check', probeRel]);
  assert.equal(r2.code, 0, r2.err);
  assert.doesNotMatch(r2.out, /not annotated with `@Handler`/, 'the deviation is gone after the fix');

  const outcomes = readJsonFile(outcomesPath());
  assert.equal(outcomes.acted, 1);
  assert.equal(outcomes.ignored, 0);
  const pending2 = readJsonFile(pendingPath());
  assert.equal(pending2[keys1[0]], undefined, 'the resolved pending entry must be cleared, never double-counted');
});

test('(b) a deviation that survives an unrelated edit tallies as ignored, keyed by partition::pid (stable across a re-learn)', () => {
  resetState();
  writeFileSync(probePath(), PROBE_DEVIANT);
  const r1 = grain(['check', probeRel]);
  assert.equal(r1.code, 0, r1.err);
  const pending1 = readJsonFile(pendingPath());
  const key1 = Object.keys(pending1)[0];

  // edit the file (changes its content hash) WITHOUT fixing the deviation
  writeFileSync(probePath(), PROBE_DEVIANT_EDITED);
  const r2 = grain(['check', probeRel]);
  assert.equal(r2.code, 0, r2.err);
  assert.match(r2.out, /not annotated with `@Handler`/, 'the SAME deviation is still present');

  const outcomes = readJsonFile(outcomesPath());
  assert.equal(outcomes.ignored, 1);
  assert.equal(outcomes.acted, 0);
  const byFactKeys = Object.keys(outcomes.byFact);
  assert.equal(byFactKeys.length, 1);
  assert.equal(byFactKeys[0], `${PARTITION}::auto.deco:@Handler`, 'byFact must key on partition::pid, not on cid (which carries a shuffling role index) and not on the raw factKey');
  assert.equal(outcomes.byFact[byFactKeys[0]], 1);

  // the (rel, factKey) key is identity-stable regardless of content, so the resolved entry is immediately re-armed
  // fresh (current hash/timestamp) — it is the SAME still-present deviation, now tracked from this new baseline; it
  // must not have been left as the stale, already-tallied record
  const pending2 = readJsonFile(pendingPath());
  assert.ok(pending2[key1], 'the still-present deviation keeps a live pending record so a future edit can still resolve it');
  assert.notEqual(pending2[key1].t, pending1[key1].t, 'the re-armed record is fresh, not the already-resolved one');
  assert.notEqual(pending2[key1].h, pending1[key1].h, 'the re-armed record\'s hash reflects the CURRENT (edited) content');

  // a THIRD check with no further edit must not double-count the same ignored instance again
  const r3 = grain(['check', probeRel]);
  assert.equal(r3.code, 0, r3.err);
  assert.deepEqual(readJsonFile(outcomesPath()), outcomes, 'no further edit since the re-arm — nothing new to tally');
});

test('(c) an unchanged file between two checks: neither acted nor ignored increments, the pending entry survives untouched', () => {
  resetState();
  writeFileSync(probePath(), PROBE_DEVIANT);
  const r1 = grain(['check', probeRel]);
  assert.equal(r1.code, 0, r1.err);
  const pendingBefore = readJsonFile(pendingPath());

  const r2 = grain(['check', probeRel]); // no edit at all in between
  assert.equal(r2.code, 0, r2.err);
  assert.equal(existsSync(outcomesPath()), false, 'no verdict either way yet — content has not changed since the deviation was first flagged');
  const pendingAfter = readJsonFile(pendingPath());
  assert.deepEqual(pendingAfter, pendingBefore, 'the pending entry must be left exactly as-is when the file has not changed');
});

test('(d) `grain status` prints the combined acted/ignored line', () => {
  writeFileSync(outcomesPath(), JSON.stringify({ acted: 3, ignored: 1, byFact: { [`${PARTITION}::auto.deco:@Handler`]: 1 } }));
  const out = grain(['status']).out;
  assert.match(out, /^check notes acted on: 3 of 4 \(75%\)$/m);
});

test('(e) TTL pruning: a stale pending entry is dropped without affecting acted/ignored counts', () => {
  resetState();
  writeFileSync(probePath(), PROBE_DEVIANT);
  const r1 = grain(['check', probeRel]);
  assert.equal(r1.code, 0, r1.err);
  const pending1 = readJsonFile(pendingPath());
  const key1 = Object.keys(pending1)[0];
  pending1[key1].t = 1; // age the record past any TTL — same technique as placement-feedback.test.mjs
  writeFileSync(pendingPath(), JSON.stringify(pending1));

  const r2 = grain(['check', probeRel]); // same content, but the pending record is now stale
  assert.equal(r2.code, 0, r2.err);
  assert.equal(existsSync(outcomesPath()), false, 'a pruned, never-resolved pending entry tallies nothing at all');
  const pending2 = readJsonFile(pendingPath());
  assert.notEqual(pending2[key1] && pending2[key1].t, 1, 'the stale entry must not survive with its old timestamp (it is pruned, optionally re-armed fresh since the deviation is still present)');
});

test('(f) cmdCheck called without a store does not throw and writes no feedback files (mirrors answer-grammar.test.mjs\'s own call pattern)', async () => {
  const tmp2 = mkdtempSync(join(tmpdir(), 'grain-check-fb-nostore-'));
  const repo2 = join(tmp2, 'fixture');
  try {
    execFileSync('node', [BUILDER, repo2], { stdio: 'pipe' });
    const st = spawnSync('node', [BIN, 'status'], { cwd: repo2, encoding: 'utf8' });
    assert.equal(st.status, 0, st.stdout + st.stderr);
    const model = JSON.parse(readFileSync(join(repo2, '.grain', 'cache', 'model.json'), 'utf8'));
    let lines;
    await assert.doesNotReject(async () => { lines = await cmdCheck({ model, root: repo2, isGit: true, args: ['src/handlers/dispute.handler.ts'], opts: {}, stamp: d => `as of test${d ? '+dirty' : ''}` }); });
    assert.ok(Array.isArray(lines) && lines.length > 0);
    assert.equal(existsSync(join(repo2, '.grain', 'cache', 'check-pending.json')), false, 'no store means no pending file can be written');
    assert.equal(existsSync(join(repo2, '.grain', 'cache', 'check-outcomes.json')), false, 'no store means no outcomes file can be written');
  } finally { rmSync(tmp2, { recursive: true, force: true }); }
});
