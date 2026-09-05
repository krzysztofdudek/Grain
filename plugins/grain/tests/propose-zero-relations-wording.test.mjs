// Issue 113 — the quiet report's architecture line, when the graph carries no relation at all.
//
// `0 relations` is three different situations wearing one number: nothing was read (no extractor for the
// language), nothing resolved (references that name files the miner could not bind), or everything resolved
// INSIDE one module and never crossed a boundary. On spring-petclinic it was the third, and the report said
// nothing that would let a maintainer tell which — so the honest reading, "this repository imports nothing",
// was indistinguishable from a miner that had simply gone blind.
//
// The line now names the three stages from the export's own `relStages` when the count is zero, and is left
// exactly as it was whenever there is a relation to report.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const gitEnv = {
  GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
};

let tmp;
function build(name, files) {
  const repo = join(tmp, name);
  mkdirSync(repo, { recursive: true });
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
  git('init', '-q', '-b', 'main');
  git('config', 'commit.gpgsign', 'false');
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(repo, dirname(rel)), { recursive: true });
    writeFileSync(join(repo, rel), content);
  }
  git('add', '-A');
  git('commit', '-qm', 'base');
  return repo;
}
const propose = repo => {
  const r = spawnSync('node', [BIN, 'propose', join(repo, '.out')], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
const archLine = out => out.split('\n').find(l => l.startsWith('architecture:'));

before(() => { tmp = mkdtempSync(join(tmpdir(), 'propose-zero-rel-')); });
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

// Eight standalone modules that reference nothing but the standard library: references ARE extracted (each file
// has imports), none of them binds to a file in the tree, and so nothing can cross a module boundary.
test('with no relation mined, the architecture line says so and names the three stages', () => {
  const files = {};
  for (let i = 0; i < 8; i++)
    files[`svc${i}/handler${i}.mjs`] =
      `import { readFileSync } from 'node:fs';\nexport const load${i} = p => readFileSync(p, 'utf8');\n`;
  const repo = build('lonely', files);
  const out = propose(repo);
  const exp = JSON.parse(
    (() => {
      const r = spawnSync('node', [BIN, 'export', '--compact', '--no-anchors'], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.split('\n').find(l => l.startsWith('{'));
    })()
  );
  assert.equal(exp.moduleGraph.edges.length, 0, 'fixture precondition: no module edge');
  const l = archLine(out);
  assert.ok(l, `no architecture line in:\n${out}`);
  assert.doesNotMatch(l, /\b0 relations\b/, l);
  assert.match(l, /no law about dependencies could be mined \(\d+ references seen, \d+ resolved, \d+ survived the module cut\)/, l);
  // the numbers are the export's own, not a second count of its own invention
  const m = l.match(/\((\d+) references seen, (\d+) resolved, (\d+) survived the module cut\)/);
  assert.deepEqual(
    m.slice(1).map(Number),
    [exp.relStages.seen, exp.relStages.resolved, exp.relStages.crossing],
    `report numbers must be the export's relStages: ${JSON.stringify(exp.relStages)}`
  );
  assert.ok(exp.relStages.seen > 0, 'references were extracted, so "seen" must not be zero');
});

test('with a relation mined, the architecture line is unchanged', () => {
  const repo = build('linked', {
    'core/util.mjs': 'export const add = (a, b) => a + b;\n',
    'core/more.mjs': 'export const sub = (a, b) => a - b;\n',
    'web/one.mjs': "import { add } from '../core/util.mjs';\nexport const one = () => add(1, 1);\n",
    'web/two.mjs': "import { sub } from '../core/more.mjs';\nexport const two = () => sub(2, 1);\n",
  });
  const l = archLine(propose(repo));
  assert.ok(l, 'no architecture line');
  assert.match(l, /· \d+ relations ·/, l);
  assert.doesNotMatch(l, /no law about dependencies/, l);
});
