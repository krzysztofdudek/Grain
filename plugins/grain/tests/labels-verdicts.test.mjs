// Guard for the verdict label reader in tests/stress/labels.mjs (research B3, issue 264). Yggdrasil writes every
// reviewer verdict to `.yggdrasil/yg-events.llm.jsonl` (committed) and `.yggdrasil/.yg-events.jsonl*` (local, with
// the reviewer's reason). A refusal of a (rule, unit) followed by an approval of the same unit on another content
// hash is a refusal-to-fix pair; git can then say whether the file or the rule moved in between.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { classifyPair, readVerdictEvents, refusalPairs, verdictSummary } from './stress/labels.mjs';

let tmp, repo, env, c1, c2;
const w = (rel, content) => { const p = join(repo, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const commit = msg => {
  execFileSync('git', ['-C', repo, 'add', '-A'], { env });
  execFileSync('git', ['-C', repo, 'commit', '-q', '-m', msg], { env });
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
};
const ev = (ts, rule, unit, disposition, hash, extra = {}) => ({ v: 1, ts, source: 'fill', aspectId: rule, unitKey: unit, kind: 'llm', disposition, hash, ...extra });
const jsonl = xs => xs.map(x => JSON.stringify(x)).join('\n') + '\n';

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'labels-verdicts-'));
  repo = join(tmp, 'repo');
  env = { ...process.env, HOME: tmp, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main'], { env });
  w('src/a.ts', 'a1\n'); w('src/b.ts', 'b1\n'); w('.yggdrasil/aspects/paths/content.md', 'rule v1\n');
  c1 = commit('one');
  w('src/a.ts', 'a2\n'); w('.yggdrasil/aspects/names/content.md', 'another rule\n');
  c2 = commit('two');
  w('.yggdrasil/aspects/paths/content.md', 'rule v2\n');
  commit('three');
  w('.yggdrasil/yg-events.llm.jsonl', jsonl([
    ev('2026-07-01T10:00:00Z', 'paths', 'file:src/a.ts', 'refused', 'h1', { sha: c1 }),
    ev('2026-07-01T10:06:00Z', 'paths', 'file:src/a.ts', 'approved', 'h2', { sha: c2 }), // file moved between the two commits
    ev('2026-07-02T10:00:00Z', 'paths', 'file:src/b.ts', 'refused', 'h3', { sha: c2 }),
    ev('2026-07-02T10:01:00Z', 'paths', 'file:src/b.ts', 'refused', 'h3', { sha: c2 }), // the same content again: one refusal
    ev('2026-07-02T10:02:00Z', 'paths', 'file:src/b.ts', 'approved', 'h3', { sha: c2 }), // the same content approved: no fix
    ev('2026-07-02T10:09:00Z', 'paths', 'file:src/b.ts', 'approved', 'h4', { sha: c2 }),
    ev('2026-07-03T10:00:00Z', 'names', 'file:src/a.ts', 'refused', 'h5'), // no sha: an old verdict
    ev('2026-07-03T11:00:00Z', 'names', 'file:src/a.ts', 'approved', 'h6'),
    ev('2026-07-04T10:00:00Z', 'names', 'file:src/b.ts', 'refused', 'h7'), // never approved: open
    ev('2026-07-04T10:00:01Z', 'names', 'file:src/b.ts', 'infra', undefined),
  ]));
  // the local copy of one committed event carries the reason; a local-only event is added
  w('.yggdrasil/.yg-events.jsonl.1', jsonl([
    ev('2026-07-01T10:00:00Z', 'paths', 'file:src/a.ts', 'refused', 'h1', { sha: c1, reason: 'src/a.ts:3 builds a path with join' }),
    { ...ev('2026-07-05T10:00:00Z', 'det', 'node:x', 'approved', 'h8'), kind: 'deterministic' },
  ]));
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

test('committed and local events are read once each, and a local copy lends its reason', () => {
  const evs = readVerdictEvents(repo);
  assert.equal(evs.length, 11);
  assert.equal(evs.find(e => e.hash === 'h1').reason, 'src/a.ts:3 builds a path with join');
  assert.ok(evs.some(e => e.kind === 'deterministic'));
});

test('each refused hash pairs with the next approval on another hash; the same content approved is not a fix', () => {
  const { pairs, open } = refusalPairs(readVerdictEvents(repo));
  assert.deepEqual(pairs.map(p => [p.rule, p.unit, p.refusedHash, p.approvedHash]), [
    ['paths', 'file:src/a.ts', 'h1', 'h2'],
    ['paths', 'file:src/b.ts', 'h3', 'h4'],
    ['names', 'file:src/a.ts', 'h5', 'h6'],
  ]);
  assert.equal(pairs[0].hours, 0.1);
  assert.equal(pairs[0].reason, 'src/a.ts:3 builds a path with join');
  assert.deepEqual(open.map(o => [o.rule, o.unit]), [['names', 'file:src/b.ts']]);
});

test('git says what moved between the refusal and the approval', () => {
  const { pairs } = refusalPairs(readVerdictEvents(repo));
  assert.equal(classifyPair(repo, pairs[0]), 'file');
  assert.equal(classifyPair(repo, pairs[1]), 'same-commit, file not committed later');
  assert.equal(classifyPair(repo, pairs[2]), 'no-sha');
  assert.equal(classifyPair(repo, { ...pairs[0], refusedSha: c2, approvedSha: execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), unit: 'file:src/b.ts' }), 'rule');
});

test('the summary counts verdicts, pairs per rule and the reviewer re-judging one content', () => {
  const { summary } = verdictSummary(repo, { withGit: true });
  assert.equal(summary.pairs, 3);
  assert.equal(summary.open, 1);
  assert.equal(summary.pairsWithReason, 1);
  assert.deepEqual(summary.rules.paths, { kind: 'llm', approved: 3, refused: 3, pairs: 2, open: 0, withReason: 1 });
  assert.equal(summary.rejudgedFlipped, 1); // h3 was refused twice and then approved
  assert.deepEqual(summary.recoverable, { file: 1, 'same-commit, file not committed later': 1, 'no-sha': 1 });
});
