// Regression test for G1: `extractScopes`'s recursive `walk` closure descended `namedChildren` with
// one JS stack frame per AST level and no depth bound. A left-nested `binary_expression` chain (e.g.
// `1 + 1 + 1 + …`, ~1000+ operators) has AST depth equal to its operator count, so a single file with
// one very long chained expression overflowed the call stack (`RangeError: Maximum call stack size
// exceeded`), crashing bare `check`/`check --json` (exit 1, empty stdout — broken JSON contract too)
// and, worse, killing `review`'s ENTIRE per-file batch: `cmdReview`'s loop had no try/catch around
// `checkFile`, so one unparseable file anywhere in the changed set lost every other file's findings.
//
// Fixed by rewriting `walk` to an explicit stack (children pushed in reverse order, so pop-order still
// matches the original pre-order left-to-right recursion — this matters because `scopes` array order
// feeds the same-name ordinal disambiguation and group formation elsewhere), and by wrapping the
// per-file `checkFile` call in `cmdReview` in try/catch so a file that still fails to parse gets a
// "parse failed — skipped" line instead of taking down the batch.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const DEEP_SRC = 'const x = ' + Array(3000).fill('1').join(' + ') + ';\n';

async function scopesFor(ext, src) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  return extractScopes('deep' + ext, tree, b, p._g);
}

test('(a) extractScopes on a 3000-term left-nested binary expression returns scopes instead of throwing RangeError', async () => {
  const scopes = await scopesFor('.js', DEEP_SRC);
  assert.ok(Array.isArray(scopes) && scopes.length >= 1, `expected a normal scopes array, got ${JSON.stringify(scopes)}`);
});

test('traversal order is preserved: two same-named overloaded methods keep source order and their ordinals (0, 1) after the iterative rewrite', async () => {
  const src = 'class Foo {\n  bar(a) { return 1; }\n  bar(a, b) { return 2; }\n}\n';
  const scopes = await scopesFor('.js', src);
  const bars = scopes.filter(s => s.kind === 'method' && s.name === 'bar');
  assert.equal(bars.length, 2, `expected both overloads extracted: ${JSON.stringify(scopes.map(s => [s.kind, s.name]))}`);
  assert.ok(bars[0].line < bars[1].line, 'first bar() must appear first in the scopes array, matching source order');
  assert.deepEqual(bars.map(s => s.ord), [0, 1], 'same-name ordinal disambiguation must number them in source order, 0 then 1 — G18\'s ordinal logic and group formation depend on this');
});

let tmp, repo;
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const git = (env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const handler = (i, body) => `@Handler()\nexport class Handler${i}Handler {\n  run() {\n    return ${body};\n  }\n}\n`;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-deepstack-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git({}, 'init', '-q', '-b', 'main'); git({}, 'config', 'commit.gpgsign', 'false');
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  for (let i = 0; i < 30; i++) w(`src/handlers/Handler${i}.ts`, handler(i, i));
  git(d1, 'add', 'src/handlers'); git(d1, 'commit', '-qm', 'add handlers');
  const d2 = dateEnv('2026-03-01T12:00:00Z');
  w('NOTES.md', 'notes\n'); git(d2, 'add', 'NOTES.md'); git(d2, 'commit', '-qm', 'notes'); // pushes HEAD past freshDays so the @Handler() convention is established
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
  assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('(b) CLI `check` on the deep-expression file: exit 0, normal output ending "as of <sha>", not a crash', () => {
  w('src/deep.js', DEEP_SRC);
  const { out, err, code } = grain(['check', 'src/deep.js']);
  assert.equal(code, 0, `expected exit 0, got ${code}. stdout: ${out}\nstderr: ${err}`);
  assert.doesNotMatch(err, /Maximum call stack size exceeded/, `must not crash with a stack overflow: ${err}`);
  assert.match(out, /as of [0-9a-f]+\+dirty$/m, `expected a normal trailing stamp line, got: ${out}`);
});

test('(c) CLI `check --json` on the deep-expression file: stdout is valid, parseable JSON', () => {
  w('src/deep.js', DEEP_SRC);
  const { out, err, code } = grain(['check', 'src/deep.js', '--json']);
  assert.equal(code, 0, `expected exit 0, got ${code}. stdout: ${out}\nstderr: ${err}`);
  let parsed; assert.doesNotThrow(() => { parsed = JSON.parse(out); }, `expected parseable JSON, got: ${out}`);
  assert.equal(parsed.file, 'src/deep.js');
});

test('(d) `review` with the deep-expression file untracked alongside a normal file carrying a real deviation still reports that deviation', () => {
  w('src/deep.js', DEEP_SRC); // untracked, anywhere in the worktree — previously killed the WHOLE batch
  w('src/handlers/Handler0.ts', 'export class Handler0Handler {\n  run() {\n    return 0;\n  }\n}\n'); // decorator dropped — a real, findable deviation
  const { out, err, code } = grain(['review']);
  assert.equal(code, 0, `expected exit 0 for the whole batch, got ${code}. stdout: ${out}\nstderr: ${err}`);
  assert.match(out, /Handler0\.ts/, `expected Handler0.ts's deviation to survive the batch: ${out}`);
  assert.match(out, /@Handler/, out);
  const j = JSON.parse(grain(['review', '--json']).out);
  assert.ok(j.findings.some(f => f.file === 'src/handlers/Handler0.ts'), `expected Handler0.ts in --json findings: ${JSON.stringify(j.findings.map(f => f.file))}`);
  git({}, 'clean', '-qfd'); git({}, 'checkout', '-q', 'HEAD', '--', '.');
});
