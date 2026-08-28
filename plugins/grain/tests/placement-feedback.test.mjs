// The placement feedback loop: `check-hook --pre` (PreToolUse on Write) tells an agent where a new file's name-kin
// already live (placementHit, core.mjs) — but until now grain never learned whether that advice was actually acted
// on. This covers the purely local, never-transmitted signal added to close that loop: a PreToolUse hit is recorded
// as a pending suggestion (`.grain/cache/placement-pending.json`); when a later write is confirmed on disk via a
// PostToolUse hook, the outcome — did it land in the suggested directory, or complete at the originally-flagged
// path, or neither — is tallied into a cumulative counter (`.grain/cache/placement-outcomes.json`), and a resolved
// pending entry is cleared so it can never double-count.
//
// Correlation is by SUFFIX + NAME-KIN TOKEN (`sufOf`/`nameTokens`, core.mjs — the same keys placementHit itself
// groups candidates by), NOT by the exact `rel` grain was asked about. A single Write's PreToolUse and PostToolUse
// always observe the IDENTICAL path, and placementHit only ever fires when that path's CURRENT directory does NOT
// already hold the name-kin — so resolving against that same `rel` can only ever produce "deviated" (or nothing):
// dirname(rel) was already established as wrong the instant Pre looked at it, and writing the file does not change
// its own path. The real "followed" case is a SEPARATE, corrective write at a DIFFERENT path, whose own PreToolUse
// finds no hit at all (the destination is already correct) — so it never creates its own pending entry. Keying by
// suffix+token lets that second write's PostToolUse still find the first write's pending suggestion and resolve it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const preHook = fp => { const r = spawnSync('node', [BIN, 'check-hook', '--pre'], { cwd: repo, encoding: 'utf8', input: JSON.stringify({ cwd: repo, tool_name: 'Write', tool_input: { file_path: fp } }) });
  return { out: (r.stdout || '').trim(), code: r.status }; };
const postHook = fp => { const r = spawnSync('node', [BIN, 'check-hook'], { cwd: repo, encoding: 'utf8', input: JSON.stringify({ cwd: repo, tool_name: 'Write', tool_input: { file_path: fp } }) });
  return { out: (r.stdout || '').trim(), code: r.status }; };
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return (r.stdout || '').replace(/\n$/, ''); };
const pendingPath = () => join(repo, '.grain', 'cache', 'placement-pending.json');
const outcomesPath = () => join(repo, '.grain', 'cache', 'placement-outcomes.json');
const readJsonFile = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const resetState = () => { rmSync(pendingPath(), { force: true }); rmSync(outcomesPath(), { force: true }); };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-placement-fb-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  // same fixture shape as pathsall-widening.test.mjs: 16 padding code files clear placementHit's `< 20` files
  // floor on their own, and 5 non-code docs all under docs/guides/ give a clean, deterministic placement pattern
  // (the fallback/subtree branch of placementHit — token: null, suf: 'md' — since none of these basenames share
  // a name-kin token with the fixture's own probe files below)
  for (let i = 0; i < 16; i++) w(`src/lib/util${i}.ts`, `export const u${i} = ${i};\n`);
  ['one', 'two', 'three', 'four', 'five'].forEach(n => w(`docs/guides/${n}.md`, `# ${n}\n`));
  git('add', '-A'); git('commit', '-qm', 'base');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('a fresh repo with no placement history: `grain status` prints nothing about placement notes', () => {
  resetState();
  const out = grain(['status']);
  assert.doesNotMatch(out, /placement notes followed/, 'silence until at least one suggestion has resolved — no "0 of 0" noise');
});

test('a single Write completes at the SAME (flagged) path: tallies as deviated', () => {
  resetState();
  const fp = join(repo, 'other/seven.md'); // never written yet — pre-write, path-only
  const pre = preHook(fp);
  assert.equal(pre.code, 0, pre.out);
  const preJson = JSON.parse(pre.out);
  assert.equal(preJson.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(preJson.hookSpecificOutput.additionalContext, /docs\/guides\//, 'sanity: the advisory names the suggested directory');
  const pending = readJsonFile(pendingPath());
  assert.deepEqual(Object.keys(pending), ['md#'], 'keyed by suffix+token (null token: the fallback/subtree branch), not by rel');
  assert.equal(pending['md#'].dir, 'docs/guides');
  assert.equal(pending['md#'].badRel, 'other/seven.md');

  // the SAME tool call's write proceeds at the SAME (misplaced) path — PreToolUse only advises, 'allow' never blocks
  w('other/seven.md', '# seven\n');
  const post = postHook(fp);
  assert.equal(post.code, 0, post.out);

  assert.deepEqual(readJsonFile(outcomesPath()), { followed: 0, deviated: 1 });
  assert.equal(readJsonFile(pendingPath())['md#'], undefined, 'the resolved pending entry must be cleared');

  // a second identical PostToolUse for the same path must not double-count — there is nothing left to resolve
  const post2 = postHook(fp);
  assert.equal(post2.code, 0, post2.out);
  assert.deepEqual(readJsonFile(outcomesPath()), { followed: 0, deviated: 1 });
});

test('a corrective write at a DIFFERENT path that lands in the suggested directory: tallies as followed', () => {
  resetState();
  const badFp = join(repo, 'other/eight.md');
  const pre = preHook(badFp);
  assert.equal(pre.code, 0, pre.out);
  assert.equal(readJsonFile(pendingPath())['md#'].badRel, 'other/eight.md', 'sanity: the bad write is pending');

  // the corrected path: its own PreToolUse must find NO hit at all, since the destination already holds the kin —
  // this is exactly why correlating by rel alone can never see "followed": the second call never gets its own
  // pending entry to begin with
  const fixedFp = join(repo, 'docs/guides/eight-fixed.md');
  const preFixed = preHook(fixedFp);
  assert.equal(preFixed.code, 0, preFixed.out);
  assert.equal(preFixed.out, '', 'sanity: no placement advisory for a file already inside the established directory');

  w('docs/guides/eight-fixed.md', '# eight\n');
  const post = postHook(fixedFp);
  assert.equal(post.code, 0, post.out);

  assert.deepEqual(readJsonFile(outcomesPath()), { followed: 1, deviated: 0 });
  assert.equal(readJsonFile(pendingPath())['md#'], undefined, 'the resolved pending entry must be cleared');

  const post2 = postHook(fixedFp);
  assert.equal(post2.code, 0, post2.out);
  assert.deepEqual(readJsonFile(outcomesPath()), { followed: 1, deviated: 0 }, 'no double-count on a repeat PostToolUse');
});

test('a write that lands in NEITHER the flagged path nor the suggested directory: stays pending, uncounted', () => {
  resetState();
  const badFp = join(repo, 'other/ten.md');
  const pre = preHook(badFp);
  assert.equal(pre.code, 0, pre.out);
  assert.ok(readJsonFile(pendingPath())['md#'], 'sanity: the suggestion is pending');

  // a third, unrelated location — not the flagged path, not the suggested directory
  w('elsewhere/ten-b.md', '# ten\n');
  const post = postHook(join(repo, 'elsewhere/ten-b.md'));
  assert.equal(post.code, 0, post.out);

  assert.equal(readJsonFile(outcomesPath()), null, 'a miss that matches neither side counts as nothing, not a guess');
  const pending = readJsonFile(pendingPath());
  assert.ok(pending['md#'], 'the entry stays pending — it may still be resolved by a later write');
  assert.equal(pending['md#'].badRel, 'other/ten.md');
});

test('a suggestion never followed by any matching write is pruned after the TTL and cannot later false-match', () => {
  resetState();
  const fp = join(repo, 'other/nine.md');
  const pre = preHook(fp);
  assert.equal(pre.code, 0, pre.out);
  assert.ok(readJsonFile(pendingPath())['md#'], 'sanity: the suggestion is pending');

  // age the record past any TTL — same technique as completeness-hook.test.mjs's TTL test
  const pending = readJsonFile(pendingPath());
  pending['md#'].t = 1;
  writeFileSync(pendingPath(), JSON.stringify(pending));

  // an unrelated, later write to the SAME path must not resurrect the stale suggestion
  w('other/nine.md', '# nine\n');
  const post = postHook(fp);
  assert.equal(post.code, 0, post.out);
  assert.equal(readJsonFile(pendingPath())['md#'], undefined, 'the stale entry is pruned');
  assert.equal(readJsonFile(outcomesPath()), null, 'a pruned, never-resolved suggestion tallies nothing at all');
});

test('`grain status` prints the cumulative count once outcomes exist', () => {
  writeFileSync(outcomesPath(), JSON.stringify({ followed: 3, deviated: 1 }));
  const out = grain(['status']);
  assert.match(out, /^placement notes followed: 3 of 4 \(75%\)$/m);
});
