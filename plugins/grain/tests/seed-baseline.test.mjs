// `grain seed add` captures a baseline: a snapshot of how widely the seeded value was ALREADY practiced, at the
// moment the decision was recorded (core.mjs `baselineShare`) — the broadest already-accepted `_all:`-context fact
// for the same (kind, pid) in the exemplar's own partition, since the live group→dir→partition cascade `report`'s
// steer line otherwise walks needs per-scope data that only exists inside `learn()`, gone once it returns. `report`
// and `where` render the delta (core.mjs `baselineClause`) beside the existing `practicedBy` clause: evidence for a
// maintainer to judge, never a new "dead seed" verdict.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
let tmp, repo;
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
const lastSeed = () => JSON.parse(readFileSync(join(repo, '.grain', 'seeds.jsonl'), 'utf8').trim().split('\n').filter(Boolean).pop());
const today = new Date().toISOString().slice(0, 10);

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-baseline-')); repo = join(tmp, 'fixture'); execFileSync('node', [BUILDER, repo], { stdio: 'pipe' }); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('seed add captures a real baseline from an already-accepted fact, and report/where show it moving after a later commit', () => {
  // independently observe today's @Handler convention BEFORE seeding — report's own fact line, not the steer path
  const beforeReport = grain(['report', '--top', '60']).out;
  const factLine = beforeReport.match(/package src\/handlers: types here are annotated with `@Handler` — (\d+)% of (\d+) established/);
  assert.ok(factLine, `expected the @Handler convention in report before seeding:\n${beforeReport}`);
  const [, pct, n] = factLine;

  const add = grain(['seed', 'add', 'src/handlers/address.handler.ts#UpdateAddressHandler', '--surfaces', 'auto.deco:@Handler', '--author', 'kd']);
  assert.equal(add.code, 0, add.err);
  const id = add.out.match(/recorded seed ([0-9a-f]{8})/)[1];
  const rec = lastSeed();
  assert.equal(rec.id, id);
  // the captured baseline must equal what report independently showed a moment ago — real numbers, not fabricated
  assert.ok(rec.baseline, `expected a captured baseline: ${JSON.stringify(rec)}`);
  assert.equal(rec.baseline.context, 'package src/handlers');
  assert.equal(rec.baseline.at, today);
  assert.equal(rec.baseline.n, +n);
  assert.equal(Math.round(rec.baseline.share * 100), +pct);

  // report's steer line renders the delta right after `practicedBy` — today's raw scan already counts the fixture's
  // planted (still-fresh, not yet "established") deviant that the baseline's survivor-filtered fact excluded, so the
  // very first read already shows real, non-zero movement (down) even before any new commit lands
  const afterSeed = grain(['report', '--top', '60']).out;
  assert.match(afterSeed, new RegExp(`decision steer \\(id ${id}, kd [\\d-]+\\): types here are annotated with \`@Handler\` — practiced by \\d+% of \\d+ in [^(]+ today \\(down from ${n} of ${n} in package src/handlers when recorded ${today} to \\d+ of \\d+ now\\) · weight 8`));
  const whereSeed = grain(['where', 'handler']).out;
  assert.match(whereSeed, new RegExp(`decision steer \\(kd ${today}\\): types here are annotated with \`@Handler\` — practiced by \\d+% of \\d+ in [^(]+ today \\(down from ${n} of ${n} in package src/handlers when recorded ${today} to \\d+ of \\d+ now\\)`));

  // fix the planted deviant (mirrors grain.test.mjs's own "decorate dispute handler" commit) — a real commit changes
  // HEAD, so the next query re-mines and the live cascade's numbers genuinely move
  const f = join(repo, 'src', 'handlers', 'dispute.handler.ts');
  const src = readFileSync(f, 'utf8');
  const patched = src.replace('export class CreateDisputeHandler', '@Handler()\nexport class CreateDisputeHandler');
  assert.notEqual(patched, src, 'fixture no longer contains the expected CreateDisputeHandler declaration');
  writeFileSync(f, patched);
  git('commit', '-qam', 'fix: decorate dispute handler');

  const afterFix = grain(['report', '--top', '60']).out;
  assert.match(afterFix, new RegExp(`decision steer \\(id ${id}, kd [\\d-]+\\): types here are annotated with \`@Handler\` — practiced by 100% of \\d+ in [^(]+ today \\(up from ${n} of ${n} in package src/handlers when recorded ${today} to \\d+ of \\d+ now\\) · weight 8`));
});

test('seed add on a surface with no partition-wide accepted fact records baseline: null, and report/where print no delta clause', () => {
  // the "handle" group's `never call validate` pattern is a real, already-accepted fact — but only at GROUP context
  // ("this is the local default of this group — the wider package's norm differs here"), never at the partition-wide
  // `_all:` cell baselineShare reads; seeding it must not fabricate a baseline out of that narrower fact
  const before = grain(['check', 'src/handlers/dispute.handler.ts', '--all']).out;
  assert.match(before, /call `validate`/, `expected the planted validate deviation:\n${before}`);

  const add = grain(['seed', 'add', 'src/handlers/dispute.handler.ts#handle', '--surfaces', 'auto.call:validate', '--author', 'kd']);
  assert.equal(add.code, 0, add.err);
  const id = add.out.match(/recorded seed ([0-9a-f]{8})/)[1];
  const rec = lastSeed();
  assert.equal(rec.id, id);
  assert.strictEqual(rec.baseline, null, `expected no fabricated baseline: ${JSON.stringify(rec)}`);

  const report = grain(['report', '--top', '60']).out;
  const line = report.split('\n').find(l => l.includes(`id ${id}, kd`) && l.includes('methods here never call'));
  assert.ok(line, `expected the steer line in report:\n${report}`);
  assert.match(line, /practiced by \d+% of \d+ in group «handle» today · weight 8/, 'no delta clause, no crash, no fabricated 0 of 0');
  assert.doesNotMatch(line, /\(no movement|\(up from|\(down from/);

  const where = grain(['where', 'handler', 'validation']).out;
  const wline = where.split('\n').find(l => l.includes('never call'));
  assert.ok(wline, `expected the steer line in where:\n${where}`);
  assert.doesNotMatch(wline, /\(no movement|\(up from|\(down from/);
});
