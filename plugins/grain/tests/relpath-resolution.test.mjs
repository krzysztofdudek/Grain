// relPath() (grain.mjs) resolves a CLI/MCP file argument against the repository root. Three distinct bugs used to
// share this one function and all surfaced as a false "is outside the repository": (a) a relative path whose
// basename exists in BOTH the current working directory and --repo — cwd won unconditionally, even though
// `--repo <path>` means "act on that repo" (the documented "no leading cd" usage pattern); (b) a relative path
// that exists in NEITHER cwd nor root fell through to a cwd-based guess almost certainly outside root, so a plain
// typo was reported as "outside the repository" instead of the distinct, already-handled "no such file"; (c) an
// absolute path that reaches the same real file as root only through an OS symlink — root comes pre-canonicalized
// from `git rev-parse --show-toplevel`, but the incoming argument was used raw.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
let tmp, A, B, Blink;
const grain = (args, cwd) => { const r = spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-relpath-'));
  A = join(tmp, 'A'); B = join(tmp, 'B');
  execFileSync('node', [BUILDER, A], { stdio: 'pipe' });
  execFileSync('node', [BUILDER, B], { stdio: 'pipe' });
  // A's stand-in for the same relative path is deliberately unrelated to the fixture's conventions, so a fix that
  // silently keeps reading cwd's file instead of --repo's is caught by content, not just by the absence of a throw
  writeFileSync(join(A, 'src', 'handlers', 'order.handler.ts'), 'export class OrderHandler { handle() { return 1; } }\n');
  Blink = join(tmp, 'B-link'); symlinkSync(B, Blink);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('(a) same relative path exists in both cwd and --repo: --repo\'s file is analyzed, not cwd\'s', () => {
  const { out, err, code } = grain(['check', 'src/handlers/order.handler.ts', '--repo', B], A);
  assert.equal(code, 0, err);
  assert.doesNotMatch(err, /is outside the repository/);
  // B's real order.handler.ts conforms to the fixture's planted @Handler/Command conventions; A's tampered stand-in has neither
  assert.match(out, /conforms to:.*@Handler/);
});

test('(b) a relative path absent from both cwd and --repo reports "no such file", not "outside the repository"', () => {
  const { err, code } = grain(['check', 'src/handlers/does-not-exist.handler.ts', '--repo', B], A);
  assert.equal(code, 1);
  assert.doesNotMatch(err, /is outside the repository/);
  assert.match(err, /no such file: src\/handlers\/does-not-exist\.handler\.ts/);
});

test('(c) an absolute path reaching a repo file only through a symlink is not "outside"', () => {
  const abs = join(Blink, 'src', 'handlers', 'order.handler.ts');
  const { out, err, code } = grain(['check', abs, '--repo', B]);
  assert.equal(code, 0, err);
  assert.doesNotMatch(err, /is outside the repository/);
  assert.match(out, /conforms to:.*@Handler/);
});

test('(d) regression: a genuine path escape is still rejected as outside the repository', () => {
  const { err, code } = grain(['check', '../../../etc/passwd', '--repo', B], A);
  assert.equal(code, 1);
  assert.match(err, /is outside the repository/);
});
