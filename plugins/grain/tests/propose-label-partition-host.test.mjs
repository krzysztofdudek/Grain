// A PARTITION NAME IS A LABEL, NOT ALWAYS A PATH — and a rule mined in one may not vanish for that reason
// (ticket 119).
//
// `mdlCuts` returns `['.']` for a repository it finds no reason to split, and `partOfFn` then names EVERY file's
// partition `_root`: the whole repository in one bucket, with no directory of that name anywhere on disk. The
// proposal renderer resolved an aspect's host TYPE by matching the partition name against a type's directory,
// so on such a repository every mined row found no host and was dropped in silence — measured across the corpus
// at four of seventeen repositories, two of them (`leveldb`, 134 files; `kotlin-datetime`, 251) proposing ZERO
// aspects for this reason alone.
//
// The fixture below is that shape, small and real: 28 TypeScript modules — eight at the repository root, twenty
// under `src/` — uniform enough that grain's own cut declines to split them, so its one partition is `_root`.
// Two import rows sit in the sub-gate band by construction (20 of 28 import `node:os`; 8 of 28 import
// `node:fs`), which is what a partition with a host has to be able to produce.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PROPOSE = join(here, 'stress', 'propose.mjs');

let tmp, repo, out;

const cap = n => n[0].toUpperCase() + n.slice(1);
const mod = (n, extra) =>
  `import { join } from 'node:path';\n${extra}\n` +
  `export function run${cap(n)}(base: string): string {\n  return join(base, '${n}');\n}\n\n` +
  `export function load${cap(n)}(base: string): string {\n  return join(base, '${n}', 'x');\n}\n\n` +
  `export function name${cap(n)}(base: string): string {\n  return join('${n}', base);\n}\n\n` +
  `export function path${cap(n)}(base: string): string {\n  return join(base, base, '${n}');\n}\n`;

const ROOT = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
const SRC = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

function buildFixture(root, env) {
  mkdirSync(root, { recursive: true });
  const w = (rel, content) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
  const all = [...ROOT.map(n => [n, `${n}Task.ts`]), ...SRC.map(n => [n, `src/${n}Task.ts`])];
  const OS = "import { tmpdir } from 'node:os';\nvoid tmpdir;\n";
  const FS = "import { readFileSync } from 'node:fs';\nvoid readFileSync;\n";
  for (const [i, [n, rel]] of all.entries()) w(rel, mod(n, i < 20 ? OS : FS));
  w('README.md', '# fixture\n');
  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', root, 'add', '-A'], { env });
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture'], { env });
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'propose-label-part-'));
  repo = join(tmp, 'repo');
  out = join(tmp, 'proposal');
  const env = {
    ...process.env, HOME: tmp,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
    GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
  };
  buildFixture(repo, env);
  const r = spawnSync('node', [PROPOSE, repo, out, '--no-history', '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

const sidecar = () => JSON.parse(readFileSync(join(out, 'proposal.json'), 'utf8'));

test('the fixture really is the shape this ticket is about: one partition, named for no directory on disk', () => {
  const model = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));
  const names = model.partitions.map(p => p.name);
  assert.deepEqual(names, ['_root'], `expected a single \`_root\` partition, got ${names.join(', ')}`);
  assert.ok(!existsSync(join(repo, '_root')), 'no directory of that name may exist — that is the whole point');
  assert.ok(sidecar().counts.subGate >= 2, 'the fixture must offer the miner something to attach');
});

test('a row mined in a partition that is not a directory still finds a host type', () => {
  const j = sidecar();
  const aspects = j.evidence.filter(e => e.kind === 'aspect');
  assert.ok(aspects.length > 0, 'every row mined in `_root` was dropped for want of a host type');
  for (const a of aspects) assert.ok(a.host, `aspect ${a.id} has no host type`);
  const hosts = new Set(aspects.map(a => a.host));
  const typeIds = new Set(j.evidence.filter(e => e.kind === 'type').map(e => e.id));
  for (const h of hosts) assert.ok(typeIds.has(h), `host ${h} is not a type this proposal emits`);
});

test('the host is an emitted type that actually holds the partition\'s files, and the aspect says so', () => {
  const j = sidecar();
  const aspects = j.evidence.filter(e => e.kind === 'aspect');
  // `src/` holds 20 of the partition's 28 files and the repository root holds 8, so the type that holds most of
  // it is `src` — chosen by counting files, never by name.
  assert.ok(aspects.every(a => a.host === 'src'), `expected every host to be \`src\`, got ${[...new Set(aspects.map(a => a.host))].join(', ')}`);
  for (const a of aspects) {
    assert.match(a.evidence, /`_root` is a label, not a directory/, `aspect ${a.id} does not disclose how its host was resolved`);
    assert.match(a.evidence, /20 of its 28 files/);
  }
  // and the scope predicate is the host type's own glob, not a path built out of the label
  const yaml = readFileSync(join(out, '.yggdrasil', 'aspects', aspects[0].id, 'yg-aspect.yaml'), 'utf8');
  assert.match(yaml, /path: "?src\/\*\*"?/);
  assert.ok(!yaml.includes('_root/'), 'a scope glob may never be built from a partition label');
});
