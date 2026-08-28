// Regression test: placement advice and companion-file facts were computed ONLY from `model.filesAll` — the
// code-parseable subset of the tracked tree (CODE_RE + a shipped grammar). The underlying git history and directory
// structure already cover EVERY tracked path (headTree's `allPaths`, history.mjs), so a misplaced doc, config or
// migration — and a group's missing same-stem non-code companion — was invisible to exactly the two mechanisms that
// already exist to catch this class of thing for code files: `placementHit` (core.mjs) and the companion-fact block
// in `learn()`. Fixed by adding `model.pathsAll` (every HARD_EXCL-filtered tracked path, from `tree.allPaths`) and
// reading it in both places instead of the code-only `files`/`model.filesAll` — pure path/stem mechanics, no new
// grammar or name list; the candidate UNIVERSE widens, the mechanics are unchanged.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return (r.stdout || '').replace(/\n$/, ''); };
const preHook = fp => { const r = spawnSync('node', [BIN, 'check-hook', '--pre'], { cwd: repo, encoding: 'utf8', input: JSON.stringify({ cwd: repo, tool_name: 'Write', tool_input: { file_path: fp } }) });
  return { out: (r.stdout || '').trim(), code: r.status }; };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-pathsall-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  // padding: 16 plain code files, so the code-only candidate universe alone already clears placementHit's `< 20`
  // floor — the RED failures below must come from the widening, never from this unrelated floor
  for (let i = 0; i < 16; i++) w(`src/lib/util${i}.ts`, `export const u${i} = ${i};\n`);
  // a real, decorator-carried group of 5 classes (markers require >= 3 carriers) — 4 of the 5 have a same-stem,
  // NON-code `.meta.json` companion (80% >= the 60% companion-share floor); the 5th has none
  ['A', 'B', 'C', 'D', 'E'].forEach((L, i) => w(`src/carriers/Carrier${L}.ts`, `@Marker()\nexport class Carrier${L}Marker {\n  run() {\n    return ${i};\n  }\n}\n`));
  ['A', 'B', 'C', 'D'].forEach(L => w(`src/carriers/Carrier${L}.meta.json`, `{"id":"${L}"}\n`));
  // 5 NON-code docs, all under docs/guides/ — a real placement pattern (suffix "md" kept in one subtree) that only a
  // widened candidate universe can see, since `.md` has no grammar and was never in the code-only `files`/`filesAll`
  ['one', 'two', 'three', 'four', 'five'].forEach(n => w(`docs/guides/${n}.md`, `# ${n}\n`));
  git('add', '-A'); git('commit', '-qm', 'base');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('a misplaced NON-code file (PreToolUse, path alone, before the file exists) gets a placement note', () => {
  const fp = join(repo, 'other/six.md'); // never written — pre-write, path-only
  const r = preHook(fp);
  assert.equal(r.code, 0, r.out);
  const j = JSON.parse(r.out);
  assert.equal(j.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(j.hookSpecificOutput.additionalContext,
    /^\[grain\] placement: 5 of 5 `\*\.md` files live under `docs\/guides\/`; this one is outside it \(`other\/`\)\. Deliberate is fine — if you guessed, look there first\.$/m);
});

test('the same NON-code suffix placed INSIDE the established directory draws nothing (negative space)', () => {
  const fp = join(repo, 'docs/guides/six.md'); // never written — pre-write, path-only
  const r = preHook(fp);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '', 'no placement note when the file already sits where its kin live');
});

test('a same-stem NON-code companion is discovered for a decorator-carried group ("a new carrier comes with")', () => {
  const out = grain(['where', 'Marker', 'decorator', '--top', '5']);
  assert.match(out, /→ marker @Marker/, `sanity: the marker card must be found: ${out}`);
  assert.match(out,
    /a new carrier comes with: a same-stem `\*\.meta\.json` companion \(80% of 5 have one, e\.g\. `src\/carriers\/Carrier[A-D]\.meta\.json`\)/,
    `expected the companion fact: ${out}`);
});

test('`check` on a file with no grammar still surfaces a placement signal instead of bare silence-after-apology', () => {
  w('misc/seven.md', '# seven\n'); // exists on disk (untracked is fine — `check` only requires it to exist)
  const out = grain(['check', 'misc/seven.md']);
  assert.match(out, /no grammar for "\.md"/, 'sanity: still reports the grammar gap');
  assert.match(out,
    /\[grain\] placement: 5 of 5 `\*\.md` files live under `docs\/guides\/`; this one is outside it \(`misc\/`\)\./,
    `expected the placement line alongside the no-grammar line: ${out}`);
});
