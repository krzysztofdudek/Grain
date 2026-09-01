// cross-check-hook-robustness.test.mjs — THE INVARIANT (grain's own design claim, restated at the top of every
// hook block in engine/grain.mjs: "a hook never breaks an edit/read/prompt/commit"): every one of the six hooks
// (session-context, check-hook Pre+Post, read-hook, how-hook, commit-hook, edit-hook) is wrapped in its own
// try/catch and must, for ANY stdin it is handed, exit 0 and print to stdout either nothing or exactly one
// parseable JSON document — never a stack trace, never a nonzero exit, regardless of how malformed the input is.
//
// Nothing existing tests this systematically: check-hook.test.mjs/edit-hook.test.mjs/how-hook.test.mjs/
// commit-hook.test.mjs/read-hook.test.mjs each cover ONE or TWO robustness cases (empty stdin, an unindexed repo)
// alongside their real behavioural assertions — never the full input matrix, and never read-hook/session-context's
// malformed-JSON or binary-garbage paths at all. This file is a data-driven sweep: for every (hook, input-class)
// pair below, one test, so a red `node --test` names the exact failing combination.
//
// Input classes, uniform across hooks: (1) a valid minimal input, (2) empty stdin, (3) malformed JSON, (4) valid
// JSON missing the fields the hook actually reads, (5) a path-shaped field (file_path/cwd) naming something that
// does not exist on disk, (6) a few KB of non-UTF8 binary garbage.
//
// check-hook is exercised in BOTH its Post (default) and Pre (--pre) forms, since they are genuinely different
// code paths inside the one `check-hook` command (grain.mjs: `if (opts.pre) { … } else { … }`) — listed as
// `check-hook` and `check-hook --pre` below, seven rows total over the six hooks.
//
// Expected: unknown — this ground is untested; any red here is a NEW finding, reported with the exact hook, input
// and observed stdout/exit code, plus a fixture-soundness check (does a KNOWN-valid input for this same hook, in
// the same repo, behave as check-hook.test.mjs et al. already prove it should — ruling out "my fixture is broken"
// before calling something a genuine invariant violation).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const git = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };

let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-xcheck-robust-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main'); git(repo, 'config', 'commit.gpgsign', 'false');
  w(repo, 'src/handlers/Handler0.ts', '@Handler()\nexport class Handler0Handler {\n  run() {\n    return 0;\n  }\n}\n');
  w(repo, 'src/handlers/Handler1.ts', '@Handler()\nexport class Handler1Handler {\n  run() {\n    return 1;\n  }\n}\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'base');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

const EXISTING_FILE = () => join(repo, 'src/handlers/Handler0.ts');
const MISSING_FILE = () => join(repo, 'src/handlers/Ghost.ts');
const MISSING_DIR = () => join(repo, 'no-such-subdir');

// ~4KB of non-UTF8-friendly, non-JSON, deterministic binary content: every byte value 0-255 appears, including
// NUL, several times over — decoded as utf8 by the hooks' own `readFileSync(0, 'utf8')` this becomes a garbled but
// non-throwing string full of U+FFFD replacement characters, which must then fail JSON.parse cleanly.
const binaryGarbage = () => { const buf = Buffer.alloc(4096); for (let i = 0; i < buf.length; i++) buf[i] = (i * 37 + 191) % 256; return buf; };

// one row per hook (or hook+flag) under test, each knowing its OWN payload shape for the three data-bearing input
// classes (valid / missing-fields / bad-path) — the three stdin-shaped classes (empty/malformed/binary) below are
// identical strings/bytes for every hook, since a hook must survive them before it even looks at its own fields.
const HOOKS = [
  { label: 'check-hook', cmd: 'check-hook', extra: [],
    valid: () => ({ cwd: repo, tool_name: 'Edit', tool_input: { file_path: EXISTING_FILE() } }),
    missingFields: () => ({ cwd: repo, tool_name: 'Edit', tool_input: {} }),
    badPath: () => ({ cwd: repo, tool_name: 'Edit', tool_input: { file_path: MISSING_FILE() } }) },
  { label: 'check-hook --pre', cmd: 'check-hook', extra: ['--pre'],
    // --pre is BY DESIGN a pre-write query for a path that does not exist yet — its "valid minimal input" IS a
    // not-yet-existing path; badPath instead reaches for a path under a directory that does not exist at all
    valid: () => ({ cwd: repo, tool_name: 'Write', tool_input: { file_path: join(repo, 'src/handlers/NewOne.ts') } }),
    missingFields: () => ({ cwd: repo, tool_name: 'Write', tool_input: {} }),
    badPath: () => ({ cwd: repo, tool_name: 'Write', tool_input: { file_path: join(MISSING_DIR(), 'deep', 'NewOne.ts') } }) },
  { label: 'edit-hook', cmd: 'edit-hook', extra: [],
    valid: () => ({ cwd: repo, tool_name: 'Edit', tool_input: { file_path: EXISTING_FILE() } }),
    missingFields: () => ({ cwd: repo, tool_name: 'Edit', tool_input: {} }),
    badPath: () => ({ cwd: repo, tool_name: 'Edit', tool_input: { file_path: MISSING_FILE() } }) },
  { label: 'read-hook', cmd: 'read-hook', extra: [],
    valid: () => ({ cwd: repo, tool_name: 'Read', tool_input: { file_path: EXISTING_FILE() } }),
    missingFields: () => ({ cwd: repo, tool_name: 'Read', tool_input: {} }),
    badPath: () => ({ cwd: repo, tool_name: 'Read', tool_input: { file_path: MISSING_FILE() } }) },
  { label: 'how-hook', cmd: 'how-hook', extra: [],
    valid: () => ({ cwd: repo, hook_event_name: 'UserPromptSubmit', prompt: 'add a handler', prompt_source: 'user_input' }),
    missingFields: () => ({ cwd: repo }),
    badPath: () => ({ cwd: MISSING_DIR(), hook_event_name: 'UserPromptSubmit', prompt: 'add a handler', prompt_source: 'user_input' }) },
  { label: 'commit-hook', cmd: 'commit-hook', extra: [],
    valid: () => ({ cwd: repo, tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' } }),
    missingFields: () => ({ cwd: repo, tool_name: 'Bash', tool_input: {} }),
    badPath: () => ({ cwd: MISSING_DIR(), tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' } }) },
  { label: 'session-context', cmd: 'session-context', extra: [],
    valid: () => ({ cwd: repo }),
    missingFields: () => ({}),
    badPath: () => ({ cwd: MISSING_DIR() }) },
];

const INPUT_CLASSES = [
  { name: 'valid minimal input', stdin: h => JSON.stringify(h.valid()) },
  { name: 'empty stdin', stdin: () => '' },
  { name: 'malformed JSON', stdin: () => '{ this is not : json !! [[[' },
  { name: 'valid JSON missing expected fields', stdin: h => JSON.stringify(h.missingFields()) },
  { name: 'a path that does not exist', stdin: h => JSON.stringify(h.badPath()) },
  { name: 'a few KB of binary garbage', stdin: () => binaryGarbage() },
];

// observed-but-not-asserted stderr, collected for the report (no existing test establishes a stderr contract for
// any hook, so nothing here is a pass/fail condition on it — see the file header and the final report)
const stderrLog = [];

for (const h of HOOKS) {
  for (const ic of INPUT_CLASSES) {
    test(`${h.label} — ${ic.name}: exit 0, stdout empty or one parseable JSON document`, () => {
      const input = ic.stdin(h);
      const r = spawnSync('node', [BIN, h.cmd, ...h.extra], { cwd: repo, encoding: 'utf8', input });
      assert.equal(r.status, 0, `expected exit 0; got ${r.status}.\nstderr:\n${r.stderr}\nstdout:\n${r.stdout}`);
      const out = (r.stdout || '').trim();
      if (out !== '') {
        let parsed;
        assert.doesNotThrow(() => { parsed = JSON.parse(out); }, `stdout must be empty or exactly one parseable JSON document — never a stack trace or partial output. Got:\n${out}`);
        assert.equal(typeof parsed, 'object', `parsed stdout must be a JSON object, not a bare scalar: ${out}`);
        assert.ok(parsed !== null, `parsed stdout must not be JSON null: ${out}`);
      }
      stderrLog.push({ hook: h.label, input: ic.name, stderrLen: (r.stderr || '').length, stderrSample: (r.stderr || '').slice(0, 200) });
    });
  }
}

// a closing sanity pass: print what stderr actually carried across the whole matrix, as OBSERVED behavior (not a
// pass/fail assertion — see file header) so the summary lands in the `node --test` output for the report
test('(observed, not asserted) stderr across the whole matrix', () => {
  const nonEmpty = stderrLog.filter(e => e.stderrLen > 0);
  console.log(`[cross-check-hook-robustness] ${nonEmpty.length}/${stderrLog.length} (hook, input-class) runs wrote to stderr`);
  for (const e of nonEmpty) console.log(`  ${e.hook} / ${e.input}: ${e.stderrLen}B — ${JSON.stringify(e.stderrSample)}`);
  assert.ok(true);
});

// §029: five of the six hooks gate their catch-block stderr behind `GRAIN_DEBUG`; `session-context` does not, by
// deliberate choice (see engine/grain.mjs, session-context's catch block, for the one-sentence reason: it runs
// once per session rather than once per edit/prompt, so the noise cost is low, while a broken repo path there
// silently drops grain's entire SessionStart context with no other signal). This pins that asymmetry so a future
// "fix" that quietly aligns all six back into consistency does not silently erase a deliberate signal.
//
// commit-hook and how-hook are the two OTHER rows whose own `badPath` fixture (above) already sets `cwd:
// MISSING_DIR()` — the same "no such directory" throw session-context's badPath hits — so they are the rows that
// actually exercise the GRAIN_DEBUG gate here, not merely rows that happen to stay quiet for an unrelated reason.
test('§029: without GRAIN_DEBUG, only session-context speaks on stderr for a bad repo path — the gated hooks stay silent', () => {
  const env = { ...process.env }; delete env.GRAIN_DEBUG;
  const cases = [['session-context', []], ['commit-hook', []], ['how-hook', []]];
  for (const [cmd, extra] of cases) {
    const h = HOOKS.find(x => x.cmd === cmd && x.extra.length === extra.length);
    const r = spawnSync('node', [BIN, cmd, ...extra], { cwd: repo, encoding: 'utf8', input: JSON.stringify(h.badPath()), env });
    assert.equal(r.status, 0, `${cmd}: expected exit 0; got ${r.status}`);
    const stderr = r.stderr || '';
    if (cmd === 'session-context') assert.match(stderr, /\[grain\] session-context failed:/, `session-context must surface a bad repo path unconditionally; got: ${JSON.stringify(stderr)}`);
    else assert.equal(stderr, '', `${cmd} must stay silent on a bad repo path without GRAIN_DEBUG (its catch block is gated); got: ${JSON.stringify(stderr)}`);
  }
});

test('§029: with GRAIN_DEBUG set, the gated hooks now speak too — proving the asymmetry is the gate, not a difference in what actually failed', () => {
  const env = { ...process.env, GRAIN_DEBUG: '1' };
  const cases = [['session-context', []], ['commit-hook', []], ['how-hook', []]];
  for (const [cmd, extra] of cases) {
    const h = HOOKS.find(x => x.cmd === cmd && x.extra.length === extra.length);
    const r = spawnSync('node', [BIN, cmd, ...extra], { cwd: repo, encoding: 'utf8', input: JSON.stringify(h.badPath()), env });
    assert.equal(r.status, 0, `${cmd}: expected exit 0; got ${r.status}`);
    assert.notEqual(r.stderr || '', '', `${cmd} under GRAIN_DEBUG should surface the same underlying failure session-context always shows; got empty stderr`);
  }
});
