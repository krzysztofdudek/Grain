// `grain propose` writes the family-without-law signal `yg advise` reads: `.family-candidates.json`.
//
// The adapter that builds the file (engine/propose-family.mjs) is exercised against real repositories
// by tests/seams.test.mjs. This file pins the COMMAND: where the file goes by default (INTO the proposal, beside
// the graph, so `yg adopt` installs both in one move and nobody copies a file by hand), how `--family-candidates
// <path>` sends it somewhere else for a repository that adopted earlier, that `--no-family-candidates` writes none,
// and that the text report and `--json` say the same thing about it. No Yggdrasil binary is needed: the tiny
// repository below carries one planted family (five structurally identical repository classes under their own
// directory) among unrelated files, and `YG_BIN` is pointed at nothing so the run never shells out to `yg`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const NAMES = ['User', 'Order', 'Product', 'Invoice', 'Payment'];

const repositoryFile = name => `export class ${name}Repository {
  private rows: string[] = [];

  add(value: string): void {
    this.rows.push("${name.toLowerCase()}:" + value);
  }

  findFirst(): string {
    return this.rows[0];
  }
}
`;

let tmp, repo;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'family-candidates-'));
  repo = join(tmp, 'repo');
  mkdirSync(join(repo, 'src', 'data'), { recursive: true });
  mkdirSync(join(repo, 'src', 'support'), { recursive: true });
  for (const n of NAMES) writeFileSync(join(repo, 'src', 'data', `${n}Repository.ts`), repositoryFile(n));
  // Decoys that share no structure with the family or with each other (the same five files Yggdrasil's own
  // `family-planted-mono` fixture surrounds its planted family with).
  const decoys = {
    'router.ts': 'export function route(method: string, path: string): number {\n  if (method === "GET") {\n    return 1;\n  } else if (method === "POST") {\n    return 2;\n  }\n  for (let i = 0; i < 3; i++) {\n    if (path.length > i) {\n      return i;\n    }\n  }\n  return 0;\n}\n',
    'mathx.ts': 'export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function sub(a: number, b: number): number {\n  return a - b;\n}\n\nexport function mul(a: number, b: number): number {\n  return a * b;\n}\n\nexport function div(a: number, b: number): number {\n  return a / b;\n}\n',
    'settings.ts': 'export const settings = {\n  host: "localhost",\n  port: 8080,\n  retries: 3,\n  debug: true,\n  name: "app",\n  region: "eu",\n  tags: ["a", "b", "c"],\n};\n',
    'client.ts': 'import { settings } from "./settings";\nimport { add } from "./mathx";\n\nexport class Client {\n  start(): void {\n    const port = add(settings.port, 1);\n    console.log("starting on", port);\n    fetch("http://localhost");\n  }\n}\n',
    'dispatcher.ts': 'export class Dispatcher {\n  dispatch(kind: string): number {\n    switch (kind) {\n      case "create":\n        return 1;\n      case "update":\n        return 2;\n      case "delete":\n        return 3;\n      default:\n        return 0;\n    }\n  }\n}\n',
  };
  for (const [file, text] of Object.entries(decoys)) writeFileSync(join(repo, 'src', 'support', file), text);
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  execFileSync('git', ['init', '-q'], { cwd: repo, env });
  execFileSync('git', ['add', '-A'], { cwd: repo, env });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo, env });
});

after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

// One `grain propose` run over the tiny repository, into its own out-dir, with no yg in reach.
function propose(name, extra = []) {
  const out = join(tmp, `out-${name}`);
  const json = join(tmp, `report-${name}.json`);
  const r = spawnSync('node', [BIN, 'propose', out, '--no-history', '--json', json, ...extra], {
    cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 120_000, env: { ...process.env, YG_BIN: join(tmp, 'no-such-yg', 'bin.js') },
  });
  return { r, out, report: existsSync(json) ? JSON.parse(readFileSync(json, 'utf8')) : null };
}

// Yggdrasil's own miner writes this same document from a different oracle (no narrow authored aspect), so the file
// says which one measured and what "without a law" meant; `v` stays 1 because both fields are optional additions.
const assertOracle = written => {
  assert.equal(written.producer, 'grain', 'the file must say which oracle wrote it');
  assert.equal(written.gate, 'no-certified-convention', 'the file must say what "without a law" meant for this producer');
};

const plantedFamily = written => {
  assert.equal(written.v, 1);
  assert.ok(!Number.isNaN(Date.parse(written.ts)), `ts "${written.ts}" must be a parseable instant, or yg advise drops the whole file`);
  assertOracle(written);
  assert.equal(written.families.length, 1, `expected the one planted family, got: ${written.families.map(f => f.id).join(', ') || 'none'}`);
  assert.deepEqual(written.families[0].members, NAMES.map(n => `src/data/${n}Repository.ts`).sort());
  assert.equal(written._fit, undefined, '`_fit` is bookkeeping, never part of the file `yg advise` reads');
};

test('by default the file is written INTO the proposal, beside the graph, and the report says where and what', () => {
  const { r, out, report } = propose('default');
  assert.equal(r.status, 0, r.stderr);
  const file = join(out, '.yggdrasil', '.family-candidates.json');
  assert.ok(existsSync(file), `${file} was not written — yg adopt installs .yggdrasil/ from the proposal, so a file beside the proposal never reaches the repository`);
  plantedFamily(JSON.parse(readFileSync(file, 'utf8')));
  assert.match(r.stdout, /family candidates: 1 group\(s\) of structurally uniform files with no rule of their own — .*\.yggdrasil\/\.family-candidates\.json/);
  assert.ok(r.stdout.indexOf('family candidates:') < r.stdout.indexOf('\nnext:'), 'the line sits before the `next:` handshake, which the dry-run summary follows');
  assert.deepEqual(report.familyCandidates, { path: report.familyCandidates.path, families: 1, droppedByFit: { members: 0, families: 0 } });
  assert.match(report.familyCandidates.path, /\.yggdrasil\/\.family-candidates\.json$/);
});

test('--family-candidates <path> writes there instead, and the proposal carries no copy', () => {
  const target = join(tmp, 'adopted', '.yggdrasil', '.family-candidates.json');
  const { r, out, report } = propose('path', ['--family-candidates', target]);
  assert.equal(r.status, 0, r.stderr);
  plantedFamily(JSON.parse(readFileSync(target, 'utf8')));
  assert.ok(!existsSync(join(out, '.yggdrasil', '.family-candidates.json')), 'one destination, not two');
  assert.equal(report.familyCandidates.path, target);
});

test('--family-candidates <directory> writes .family-candidates.json inside it', () => {
  const dir = join(tmp, 'a-directory');
  mkdirSync(dir, { recursive: true });
  const { r } = propose('dir', ['--family-candidates', dir]);
  assert.equal(r.status, 0, r.stderr);
  plantedFamily(JSON.parse(readFileSync(join(dir, '.family-candidates.json'), 'utf8')));
});

test('--no-family-candidates writes no file, prints no line, and the JSON says null', () => {
  const { r, out, report } = propose('none', ['--no-family-candidates']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(out, '.yggdrasil', '.family-candidates.json')));
  assert.ok(!/family candidates:/.test(r.stdout));
  assert.equal(report.familyCandidates, null);
});

test('a repository with no family still gets the file, empty, so yg advise knows the question was asked', () => {
  const bare = join(tmp, 'bare');
  mkdirSync(join(bare, 'src'), { recursive: true });
  writeFileSync(join(bare, 'src', 'a.ts'), 'export const a = 1;\n');
  writeFileSync(join(bare, 'src', 'b.ts'), 'export function b(x: number): number {\n  return x * 2;\n}\n');
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', YG_BIN: join(tmp, 'no-such-yg', 'bin.js') };
  execFileSync('git', ['init', '-q'], { cwd: bare, env });
  execFileSync('git', ['add', '-A'], { cwd: bare, env });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: bare, env });
  const out = join(tmp, 'out-bare');
  const r = spawnSync('node', [BIN, 'propose', out, '--no-history'], { cwd: bare, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 120_000, env });
  assert.equal(r.status, 0, r.stderr);
  const written = JSON.parse(readFileSync(join(out, '.yggdrasil', '.family-candidates.json'), 'utf8'));
  assert.deepEqual(written.families, []);
  assertOracle(written);
  assert.match(r.stdout, /family candidates: none — no group of structurally uniform files is left without a rule/);
});

test('the flag is a usage error when it names no path, and when it is given together with its negation', () => {
  const env = { ...process.env, YG_BIN: join(tmp, 'no-such-yg', 'bin.js') };
  const bare = spawnSync('node', [BIN, 'propose', join(tmp, 'out-usage-1'), '--no-history', '--family-candidates'], { cwd: repo, encoding: 'utf8', timeout: 60_000, env });
  assert.notEqual(bare.status, 0);
  assert.match(bare.stderr, /--family-candidates <path>/);
  const both = spawnSync('node', [BIN, 'propose', join(tmp, 'out-usage-2'), '--no-history', '--family-candidates', join(tmp, 'x.json'), '--no-family-candidates'], { cwd: repo, encoding: 'utf8', timeout: 60_000, env });
  assert.notEqual(both.status, 0);
  assert.match(both.stderr, /not both/);
});
