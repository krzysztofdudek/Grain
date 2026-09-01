// PreToolUse hook on Edit|MultiEdit (§J6.4): before an agent edits a file, grain names co-change partners from this
// repo's own history — the SAME threshold `check-hook`'s own PostToolUse co-change line and `completeness` use
// (`cochangeData`, CFG.cochangeMinConf). Kin is deliberately never wired in here: see the ticket's own structural
// proof — a file under `Edit` is by definition already known/committed, so `missingLines`'s name-stem half (which
// iterates `newFileScopes[rel]`, populated only for files NOT already known) is provably always empty for this
// hook's use case; the value half would need to parse the file on the hot path of every single Edit for
// pre-existing HEAD-state information unrelated to the pending change.
//
// The most load-bearing part of this hook is NOT what it says but what it does NOT repeat: `check-hook`'s existing
// PostToolUse also renders the identical co-change partners after every Edit/Write/MultiEdit. Edit fires
// PreToolUse then PostToolUse in the SAME turn, so without a shared suppression key an agent would read the same
// paragraph twice for one edit. Both hooks gate their co-change line through the SAME `cochange:<rel>` key in
// hook-seen.json (§J6.1's seenGate), keyed on the underlying DATA signature rather than either hook's own wording
// (the two render different sentences) — whichever fires first silences the other for the TTL window, while
// `check-hook`'s OTHER findings keep speaking on their own independent `check:` cadence.
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
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const seenPath = () => join(repo, '.grain', 'cache', 'hook-seen.json');
const resetSeen = () => rmSync(seenPath(), { force: true });
const editHook = (file_path, cwd = repo) => { const r = spawnSync('node', [BIN, 'edit-hook'], { cwd, encoding: 'utf8', input: JSON.stringify({ cwd, tool_name: 'Edit', tool_input: { file_path } }) });
  return { out: (r.stdout || '').trim(), err: r.stderr, code: r.status }; };
const checkHook = (file_path, cwd = repo) => { const r = spawnSync('node', [BIN, 'check-hook'], { cwd, encoding: 'utf8', input: JSON.stringify({ cwd, tool_name: 'Edit', tool_input: { file_path } }) });
  return { out: (r.stdout || '').trim(), err: r.stderr, code: r.status }; };

// name-stem "kin" fixture (mirrors kin-completeness.test.mjs fixture B): 11 handler/spec pairs + one deliberately
// unpaired member ('mike', added below as an UNTRACKED new file) — established, so `review`/`commit-hook` would
// print a `kin:` line for mike's missing spec. `mike.handler.ts` has zero git history and therefore, structurally,
// can never have a co-change partner — the same fact the ticket's own analysis rests on.
const NAMES = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo'];
const cap = s => s[0].toUpperCase() + s.slice(1);
const handlerSrc = n => `@Handler()\nexport class ${cap(n)}Handler {\n  constructor(private readonly repo: Repo) {}\n  async run(cmd: ${cap(n)}Command): Promise<void> {\n    await this.repo.save(cmd);\n    await this.repo.flush();\n  }\n}\n`;
const specSrc = n => `export class ${cap(n)}Spec {\n  describeBehaviour(subject: Subject): Report {\n    expect(subject).toBeDefined();\n    expect(subject).toMatch('${cap(n)}');\n    return report(subject);\n  }\n}\n`;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-edit-hook-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  // an established directional co-change pair. The base commit below touches ~34 files at once — over
  // CFG.megaCap (30) — so history.mjs excludes it entirely from co-change bookkeeping (both sup and the
  // commitsA/commitsB denominator); only the 8 later "pair change" commits count, giving 8/8, not 9/9.
  w('src/pair-a.ts', 'export const a = () => 0;\n');
  w('src/pair-b.ts', 'export const b = () => 0;\n');
  // a file with no partner at all
  w('src/solo.ts', 'export const s = () => 0;\n');
  // a "hub" with 4 candidate partners, so the cap-at-3 behaviour is actually exercised
  w('src/hub.ts', 'export const hub = () => 0;\n');
  for (const p of ['p1', 'p2', 'p3', 'p4']) w(`src/${p}.ts`, `export const ${p} = () => 0;\n`);
  // a module-graph fixture (mirrors check-hook.test.mjs): editing main.ts to import db.ts creates a FIRST edge
  // apps/a -> packages/infra, a real check-hook finding independent of co-change
  w('packages/core/util.ts', 'export const util = () => 1;\n');
  w('packages/infra/db.ts', "import { util } from '../core/util';\nexport const db = () => util();\n");
  w('apps/a/main.ts', "import { util } from '../../packages/core/util';\nexport const a = () => util();\n");
  w('apps/a/helper.ts', 'export const helperA = () => 0;\n'); // will become main.ts's own established co-change partner
  // name-stem kin fixture: 11 paired handlers/specs
  NAMES.forEach(n => { w(`src/handlers/${n}.handler.ts`, handlerSrc(n)); w(`src/specs/${n}.spec.ts`, specSrc(n)); });
  git('add', '-A'); git('commit', '-qm', 'base');
  for (let i = 1; i <= 8; i++) { w('src/pair-a.ts', `export const a = () => ${i};\n`); w('src/pair-b.ts', `export const b = () => ${i};\n`); git('add', '-A'); git('commit', '-qm', `pair change ${i}`); }
  for (let i = 1; i <= 4; i++) { w('src/solo.ts', `export const s = () => ${i};\n`); git('add', '-A'); git('commit', '-qm', `solo change ${i}`); }
  for (let i = 1; i <= 8; i++) { w('src/hub.ts', `export const hub = () => ${i};\n`); for (const p of ['p1', 'p2', 'p3', 'p4']) w(`src/${p}.ts`, `export const ${p} = () => ${i};\n`); git('add', '-A'); git('commit', '-qm', `hub change ${i}`); }
  for (let i = 1; i <= 8; i++) { w('apps/a/main.ts', `import { util } from '../../packages/core/util';\nexport const a = () => util() + ${i};\n`); w('apps/a/helper.ts', `export const helperA = () => ${i};\n`); git('add', '-A'); git('commit', '-qm', `main+helper change ${i}`); }
  // pushes HEAD's own timestamp forward past freshDays so the @Handler() name-stem convention is "established"
  w('NOTES.md', 'notes\n');
  git('add', 'NOTES.md');
  execFileSync('git', ['-C', repo, 'commit', '-qm', 'notes'], { encoding: 'utf8', env: { ...process.env, ...dateEnv('2026-03-01T12:00:00Z') } });
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('(1) an Edit on a file with an established co-change partner speaks BEFORE any edit happens, as PreToolUse additionalContext', () => {
  resetSeen();
  const r = editHook(join(repo, 'src/pair-a.ts')); // fixture content untouched — this is a pure pre-edit query
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.equal(j.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(j.hookSpecificOutput.permissionDecision, undefined, 'no permissionDecision — the user\'s own Edit prompt must stay untouched');
  assert.match(j.hookSpecificOutput.additionalContext, /src\/pair-b\.ts \(co-changed in 8\/8 commits\)/);
});

test('(1b) more than 3 partners: capped at 3, alphabetically, no 4th', () => {
  resetSeen();
  const r = editHook(join(repo, 'src/hub.ts'));
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  const ctx = j.hookSpecificOutput.additionalContext;
  assert.match(ctx, /src\/p1\.ts/); assert.match(ctx, /src\/p2\.ts/); assert.match(ctx, /src\/p3\.ts/);
  assert.doesNotMatch(ctx, /src\/p4\.ts/, 'the 4th partner must be dropped by the cap, not just squeezed in');
});

test('(2) an Edit on a file with no partner above the confidence floor stays silent', () => {
  resetSeen();
  const r = editHook(join(repo, 'src/solo.ts'));
  assert.equal(r.code, 0, r.err); assert.equal(r.out, '');
});

test('(3) the double-report fix: PreToolUse (this hook) then PostToolUse (check-hook) for the same file in the same turn — the second is silent on co-change', () => {
  resetSeen();
  const r1 = editHook(join(repo, 'src/pair-a.ts'));
  assert.match(r1.out, /also touch/, 'this hook must actually speak first');
  const r2 = checkHook(join(repo, 'src/pair-a.ts'));
  // pair-a.ts carries no other convention findings in this fixture, so a fully-suppressed co-change line means
  // check-hook has nothing left to say at all
  assert.equal(r2.out, '', 'check-hook\'s own copy of the SAME co-change line must be suppressed by the shared key');
});

test('(3b) sanity, reverse order: PostToolUse (check-hook) then PreToolUse (this hook) — the second is silent', () => {
  resetSeen();
  const r1 = checkHook(join(repo, 'src/pair-a.ts'));
  assert.match(r1.out, /edits like this also touch/);
  const r2 = editHook(join(repo, 'src/pair-a.ts'));
  assert.equal(r2.out, '', 'this hook only ever renders the co-change line, so full suppression means full silence');
});

test('(4) check-hook\'s OTHER findings still speak normally even when its own co-change line was suppressed by this hook already having spoken it', () => {
  resetSeen();
  const r1 = editHook(join(repo, 'apps/a/main.ts')); // speaks first, claims the shared cochange:apps/a/main.ts key
  assert.match(r1.out, /apps\/a\/helper\.ts \(co-changed in 8\/8 commits\)/);
  const orig = readFileSync(join(repo, 'apps/a/main.ts'), 'utf8');
  w('apps/a/main.ts', "import { db } from '../../packages/infra/db';\n" + orig.replace('util();', 'util() + db();').replace(/\+ \d+;/, ';'));
  try {
    const r2 = checkHook(join(repo, 'apps/a/main.ts'));
    assert.equal(r2.code, 0, r2.err);
    const j = JSON.parse(r2.out);
    assert.match(j.hookSpecificOutput.additionalContext, /FIRST edge apps\/a → packages\/infra/, 'the real module-graph finding must still speak');
    assert.doesNotMatch(j.hookSpecificOutput.additionalContext, /also touch/, 'the co-change line must stay suppressed — it already spoke via edit-hook');
  } finally { w('apps/a/main.ts', orig); }
});

test('(5) kin-shaped data is never wired into this hook, even when the fixture has a genuine kin gap', () => {
  resetSeen();
  // mike is a genuinely new, untracked handler with no spec anywhere — `review`/`commit-hook` would print a
  // `kin: ... has no «spec» counterpart` line for it. It has zero git history, so it can never have a co-change
  // partner either (cochangeData reads only committed pairs) — the same structural fact the ticket's own kin-drop
  // rationale rests on. Silence here is itself part of the proof: there is no code path in this hook that could
  // ever reach kin data for a file like this.
  w('src/handlers/mike.handler.ts', handlerSrc('mike'));
  try {
    const r = editHook(join(repo, 'src/handlers/mike.handler.ts'));
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, '', 'a brand-new file has no co-change history, so this hook — co-change only — has nothing to say');
    assert.doesNotMatch(r.out, /kin:|counterpart/);
  } finally { rmSync(join(repo, 'src/handlers/mike.handler.ts'), { force: true }); }
  // a SEPARATE, already-committed file that DOES speak (established co-change partner) — proves the silence above
  // is not just "the hook never speaks", by showing a case where it does speak, with no kin-shaped text in it
  resetSeen();
  const r2 = editHook(join(repo, 'src/pair-a.ts'));
  assert.match(r2.out, /also touch/);
  assert.doesNotMatch(r2.out, /kin:|counterpart/, 'this hook has no kin source wired in at all, even when it does speak');
});

test('(6) repeating the same edit within the TTL stays silent the second time; an aged record reminds again', () => {
  resetSeen();
  const r1 = editHook(join(repo, 'src/pair-a.ts'));
  assert.match(r1.out, /also touch/);
  const r2 = editHook(join(repo, 'src/pair-a.ts'));
  assert.equal(r2.out, '', 'an unchanged co-change finding must not repeat within the TTL');
  const seen = JSON.parse(readFileSync(seenPath(), 'utf8'));
  seen['cochange:src/pair-a.ts'].t = 1; writeFileSync(seenPath(), JSON.stringify(seen)); // age past any TTL
  const r3 = editHook(join(repo, 'src/pair-a.ts'));
  assert.match(r3.out, /also touch/, 'an aged record reminds again');
});

test('(7) no payload, and a repo with no index, are silence, never an error', () => {
  const r1 = spawnSync('node', [BIN, 'edit-hook'], { cwd: repo, encoding: 'utf8', input: '' });
  assert.equal(r1.status, 0); assert.equal((r1.stdout || '').trim(), '');
  const bare = join(tmp, 'bare'); mkdirSync(bare, { recursive: true }); writeFileSync(join(bare, 'x.ts'), 'export const x = 1;\n');
  const r2 = editHook(join(bare, 'x.ts'), bare);
  assert.equal(r2.code, 0); assert.equal(r2.out, '');
});
