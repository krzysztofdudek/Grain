// Guard for the verdict label reader in tests/stress/labels.mjs (research B3, issue 264). Yggdrasil writes every
// reviewer verdict to `.yggdrasil/yg-events.llm.jsonl` (committed) and `.yggdrasil/.yg-events.jsonl*` (local, with
// the reviewer's reason). A refusal of a (rule, unit) followed by an approval of the same unit on another content
// hash is a refusal-to-fix pair; git can then say whether the file or the rule moved in between.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { classifyPair, readVerdictEvents, refusalPairs, verdictSummary } from './stress/labels.mjs';
import { removeTemp } from './remove-temp.mjs';

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
after(() => { try { removeTemp(tmp); } catch { /* best effort */ } });

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

// Yggdrasil 379 (6.1.0): the committed stream is sealed by month — the first event of a new month renames
// `yg-events.llm.jsonl` to `yg-events.llm.<YYYY-MM>.jsonl` (in real history this shows up as a rename of the old
// current file) and starts a fresh current file. A reader that reads only `yg-events.llm.jsonl` loses every
// sealed month; the fix reads every `yg-events.llm.<YYYY-MM>.jsonl` too, oldest first, then the current file, with
// duplicate lines (a `merge=union` can leave the same line in two files) collapsed to one.
test('a sealed month file and the current file are both read, oldest first, with duplicate lines collapsed', () => {
  const t2 = mkdtempSync(join(tmpdir(), 'labels-verdicts-months-'));
  const repo2 = join(t2, 'repo');
  const env2 = { ...process.env, HOME: t2, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
  try {
    mkdirSync(repo2, { recursive: true });
    execFileSync('git', ['-C', repo2, 'init', '-q', '-b', 'main'], { env: env2 });
    const w2 = (rel, content) => { const p = join(repo2, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
    const commit2 = msg => {
      execFileSync('git', ['-C', repo2, 'add', '-A'], { env: env2 });
      execFileSync('git', ['-C', repo2, 'commit', '-q', '-m', msg], { env: env2 });
      return execFileSync('git', ['-C', repo2, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    };
    w2('src/a.ts', 'a1\n');
    const m1 = commit2('one'); // src/a.ts at its July content
    w2('src/a.ts', 'a2\n');
    const m2 = commit2('two'); // src/a.ts changed before the August approval

    const refusedLine = JSON.stringify(ev('2026-07-20T10:00:00Z', 'paths', 'file:src/a.ts', 'refused', 'h1', { sha: m1 }));
    // 2026-06 is sealed first, then 2026-07 — a plain filename sort must still read them oldest to newest
    w2('.yggdrasil/yg-events.llm.2026-06.jsonl', jsonl([ev('2026-06-01T09:00:00Z', 'paths', 'file:src/b.ts', 'refused', 'h0', { sha: m1 })]));
    w2('.yggdrasil/yg-events.llm.2026-07.jsonl', refusedLine + '\n');
    // the current file carries August's approval, plus the same July refusal line again — a merge-union artifact
    // that must not be counted twice, and must still pair with the approval across the sealed boundary
    w2('.yggdrasil/yg-events.llm.jsonl', refusedLine + '\n' + jsonl([ev('2026-08-01T10:00:00Z', 'paths', 'file:src/a.ts', 'approved', 'h2', { sha: m2 })]));

    const evs = readVerdictEvents(repo2);
    assert.equal(evs.length, 3); // h0, h1 once (deduplicated across the two files it appears in), h2
    assert.equal(evs.filter(e => e.hash === 'h1').length, 1);

    const { pairs, open } = refusalPairs(evs);
    assert.deepEqual(pairs.map(p => [p.rule, p.unit, p.refusedHash, p.approvedHash]), [['paths', 'file:src/a.ts', 'h1', 'h2']]);
    assert.deepEqual(open.map(o => [o.rule, o.unit]), [['paths', 'file:src/b.ts']]);

    // --git mode: the pair spanning the sealed boundary is still classified from the source file's git history
    const { summary } = verdictSummary(repo2, { withGit: true });
    assert.equal(summary.pairs, 1);
    assert.deepEqual(summary.recoverable, { file: 1 });
  } finally {
    removeTemp(t2);
  }
});
