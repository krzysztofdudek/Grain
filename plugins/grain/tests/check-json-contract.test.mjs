// G7 + G8: `check --json` must emit JSON on every path, not just the fully-governed one, and a genuine parse
// failure must be distinguishable from a trivially empty file.
//
// G7 — cmdCheck (grain.mjs) had three early `return [text…]` sites (no-grammar, no-partition, no-scopes) that sat
// before the `opts.json` check and ignored it: any harness doing `JSON.parse(stdout)` on one of those cases got a
// SyntaxError instead of data.
//
// G8 — the third of those sites (`no scopes extracted`) was dead code: extractScopes() (core.mjs) always pushes one
// kind:'file' pseudo-scope, so `r.scopes.length` is never 0 once a partition covers the file, and the branch's guard
// (`!r.scopes.length`) could never fire. A file whose content genuinely fails to parse (e.g. unicode identifiers a
// vendored grammar chokes on — `tree.rootNode.hasError === true`) rendered byte-for-byte identical to an empty file.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
let tmp, repo;
const grain = (args, opts = {}) => { const r = spawnSync('node', [BIN, ...args], { cwd: opts.cwd || repo, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-checkjson-')); repo = join(tmp, 'fixture'); execFileSync('node', [BUILDER, repo], { stdio: 'pipe' }); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('check --json on a file with no grammar is parseable JSON carrying noGrammar (red before the fix: plain text, JSON.parse throws)', () => {
  writeFileSync(join(repo, 'weird.zzz'), 'whatever\n');
  const { out, code, err } = grain(['check', 'weird.zzz', '--json']);
  assert.equal(code, 0, err);
  const j = JSON.parse(out);
  assert.equal(j.file, 'weird.zzz'); assert.equal(j.noGrammar, '.zzz'); assert.equal(j.dirty, true); assert.ok(j.asOf);
  assert.equal(j.schema, 'grain-check/1', `noGrammar shape must carry the published schema marker: ${JSON.stringify(j)}`);
});

test('check --json on a file outside any partition is parseable JSON carrying noPartition (red before the fix: plain text)', () => {
  const tmp2 = mkdtempSync(join(tmpdir(), 'grain-nopart-'));
  const repo2 = join(tmp2, 'r'); mkdirSync(repo2, { recursive: true });
  const dateEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' };
  execFileSync('git', ['-C', repo2, 'init', '-q', '-b', 'main']);
  execFileSync('git', ['-C', repo2, 'config', 'commit.gpgsign', 'false']);
  writeFileSync(join(repo2, 'README.md'), 'hello\n'); // no source file ever committed: the model ends up with zero partitions
  execFileSync('git', ['-C', repo2, 'add', '-A'], { env: { ...process.env, ...dateEnv } });
  execFileSync('git', ['-C', repo2, 'commit', '-q', '-m', 'init'], { env: { ...process.env, ...dateEnv } });
  writeFileSync(join(repo2, 'new.ts'), 'export class Foo {}\n'); // untracked, but has a grammar: partitionFor still returns null
  try {
    const { out, code, err } = grain(['check', 'new.ts', '--json'], { cwd: repo2 });
    assert.equal(code, 0, err);
    const j = JSON.parse(out);
    assert.equal(j.file, 'new.ts'); assert.equal(j.noPartition, true); assert.ok(j.reason);
    assert.equal(j.schema, 'grain-check/1', `noPartition shape must carry the published schema marker: ${JSON.stringify(j)}`);
  } finally { rmSync(tmp2, { recursive: true, force: true }); }
});

test('groovy: a genuine parse failure reads differently from an empty file (red before the fix: identical modulo filename)', () => {
  // hasError:true, 0 non-file scopes extracted — confirmed with a direct parser probe before writing this fixture
  const broken = '@#$%^&*(( class Ünïcödé学 {';
  writeFileSync(join(repo, 'broken.groovy'), broken);
  writeFileSync(join(repo, 'empty.groovy'), '');
  const b = grain(['check', 'broken.groovy']).out;
  const e = grain(['check', 'empty.groovy']).out;
  assert.notEqual(b.replace(/broken\.groovy/g, 'X'), e.replace(/empty\.groovy/g, 'X'), `broken and empty must not render identically once filenames are normalized:\n${b}\n---\n${e}`);
  assert.match(b, /parse failed/);
  assert.doesNotMatch(e, /parse failed/);
});

test('groovy: --json carries parseFailed for the broken file, not for the empty one', () => {
  const bj = JSON.parse(grain(['check', 'broken.groovy', '--json']).out);
  const ej = JSON.parse(grain(['check', 'empty.groovy', '--json']).out);
  assert.equal(bj.parseFailed, true); assert.equal(bj.hasError, true);
  assert.notEqual(ej.parseFailed, true);
  assert.equal(bj.schema, 'grain-check/1', `parseFailed shape must carry the published schema marker: ${JSON.stringify(bj)}`);
  assert.equal(ej.schema, 'grain-check/1', `the full verdict shape (empty.groovy, no parse failure) must also carry it: ${JSON.stringify(ej)}`);
});

test('check (text mode) on a normal, fully-parseable file shows no parse-degraded note', () => {
  const out = grain(['check', 'src/handlers/order.handler.ts']).out;
  assert.doesNotMatch(out, /parse degraded/);
});

test('bats-core-style heredoc-with-a-lone-backslash: current hasError/scope-count behavior, reported not fixed', () => {
  // Reproduces the class of bug from the bounty finding (a here-doc body containing a trailing lone backslash) as
  // closely as a synthetic fixture allows. This fixture does NOT reproduce the upstream "2 of 3 functions silently
  // dropped" undercount — all three functions still extract, and hasError comes back false — so it is left here as
  // a locked-in observation of current behavior, not a red test: a real scope-resolution gap in tree-sitter-bash's
  // heredoc handling (if any) needs the actual upstream fixture to pin down, which is out of scope for G7/G8.
  const src = 'foo() {\n  echo "foo"\n}\n\nbar() {\n  cat <<EOM\nline one\nline two \\\nEOM\n}\n\nbaz() {\n  echo "baz"\n}\n';
  writeFileSync(join(repo, 'batscore.bash'), src);
  const j = JSON.parse(grain(['check', 'batscore.bash', '--json']).out);
  assert.equal(j.hasError, false);
  assert.equal(j.scopes, 3);
  assert.equal(j.schema, 'grain-check/1', `the full verdict shape must carry the published schema marker: ${JSON.stringify(j)}`);
});
