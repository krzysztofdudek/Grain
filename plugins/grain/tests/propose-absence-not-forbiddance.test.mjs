// AN IMPORT THAT IS ABSENT IS NOT AN IMPORT THAT IS FORBIDDEN (ticket 115).
//
// The sub-gate lattice reports the MAJORITY value of a cell. For a boolean class — `imp`, `call`, `deco`,
// `extends`, `returns` — a cell whose majority value is `false` says only "most things here do not use X". The
// renderer turned that into an obligation: `No file under \`src/main/java/**\` may import
// \`jakarta.persistence.Entity\``, mined from the fact that 24 of 30 files do not — and the six that do are the
// entities, so the rule is wrong on its face against the very code it was mined from. On spring-petclinic 12 of
// 44 standing advisory refusals were of exactly this shape.
//
// The rule is about ORIGIN, not about a number: a sub-gate row sits BELOW grain's certification bound by
// definition, so a `false` majority there is an absence and nothing more. A `false` direction that grain
// CERTIFIED is a different fact — "this partition never uses X" — and stays eligible, with its provenance
// saying which direction it came from.
//
// The fixture: 28 uniform TypeScript modules, 20 importing `node:os` and 8 importing `node:fs`. The first mines
// a `true`-direction row at share 0.714 and the second a `false`-direction row at the same share, from one
// partition, so the two directions are compared with everything else held equal.
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

const NAMES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'one', 'two', 'three',
  'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

function buildFixture(root, env) {
  mkdirSync(root, { recursive: true });
  const w = (rel, content) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
  const OS = "import { tmpdir } from 'node:os';\nvoid tmpdir;\n";
  const FS = "import { readFileSync } from 'node:fs';\nvoid readFileSync;\n";
  for (const [i, n] of NAMES.entries()) w(`src/${n}Task.ts`, mod(n, i < 20 ? OS : FS));
  w('README.md', '# fixture\n');
  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', root, 'add', '-A'], { env });
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture'], { env });
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'propose-absence-'));
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
const aspectRow = pred => sidecar().evidence.filter(e => e.kind === 'aspect').find(pred);
const provenance = id => JSON.parse(readFileSync(join(out, '.yggdrasil', 'aspects', id, 'provenance.json'), 'utf8'));

test('the fixture mines both directions of the same import class from one partition', () => {
  assert.ok(aspectRow(a => a.identifier === 'node:os' && String(a.expected) === 'true'), 'no `true`-direction import row');
  assert.ok(aspectRow(a => a.identifier === 'node:fs' && String(a.expected) === 'false'), 'no `false`-direction import row');
});

test('a `false`-direction sub-gate row is kept as an observation, never as a prohibition', () => {
  const row = aspectRow(a => a.identifier === 'node:fs' && String(a.expected) === 'false');
  const p = provenance(row.id);
  assert.equal(p.status, 'draft', 'an absence may never reach advisory or enforced');
  assert.equal(p.draftReason, 'absence-not-forbiddance');
  assert.equal(p.direction, 'absence');
  assert.ok(!existsSync(join(out, '.yggdrasil', 'aspects', row.id, 'check.mjs')),
    'an absence ships no check.mjs — a drill it cleared would promote it');
  assert.ok(existsSync(join(out, '.yggdrasil', 'aspects', row.id, 'content.md')));
  const yaml = readFileSync(join(out, '.yggdrasil', 'aspects', row.id, 'yg-aspect.yaml'), 'utf8');
  assert.ok(!/No file .* may/.test(yaml), `an absence is worded as an obligation: ${yaml}`);
  assert.match(yaml, /an absence, not a rule/);
  assert.match(yaml, /20 of 28 files/);
  assert.match(yaml, /status: draft/);
});

test('the same class in the `true` direction is untouched and still eligible', () => {
  const row = aspectRow(a => a.identifier === 'node:os' && String(a.expected) === 'true');
  const p = provenance(row.id);
  assert.equal(p.draftReason === 'absence-not-forbiddance', false);
  assert.equal(p.direction, null);
  assert.ok(existsSync(join(out, '.yggdrasil', 'aspects', row.id, 'check.mjs')),
    'a `true`-direction import row still renders a deterministic check');
  const yaml = readFileSync(join(out, '.yggdrasil', 'aspects', row.id, 'yg-aspect.yaml'), 'utf8');
  assert.match(yaml, /Every file under/);
});

test('the count of absences is reported, not hidden among the prose rows', () => {
  const j = sidecar();
  assert.ok(j.counts.aspectsAbsenceNotForbiddance >= 1, JSON.stringify(j.counts));
  assert.equal(j.counts.aspectsByDraftReason['absence-not-forbiddance'], j.counts.aspectsAbsenceNotForbiddance);
});
