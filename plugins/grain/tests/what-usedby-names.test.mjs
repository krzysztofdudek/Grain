// §064 — `used by: N files` was the ONE answer measured strictly worse than a plain `grep` in the question-catalog
// study (asked 19 times): a bare count cannot be acted on, so a reader falls back to grep anyway to find the
// actual files. The names were already sitting in `model.edges` (file-level fan-in, no new extraction) — this
// file pins the fix at both `what --json`'s `usedBy` field and `what`'s text rendering, for a small fan-in (well
// under the display cap) and a large one (over it, to prove truncation is stated, not swallowed — the same
// `+N more` idiom §039 already established for `defined`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };

let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-what-usedby-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false');

  // small case: `Widget`, declared once, imported by exactly 3 files — well under the display cap
  w(repo, 'src/core/widget.ts', 'export class Widget { run(): number { return 0; } }\n');
  for (const n of ['a', 'b', 'c']) {
    w(repo, `src/users/${n}.ts`, `import { Widget } from '../core/widget';\nexport function use${n}(): number { return new Widget().run(); }\n`);
  }

  // large case: `Gadget`, declared once, imported by 20 files — over any sane display cap, to prove truncation
  w(repo, 'src/core/gadget.ts', 'export class Gadget { run(): number { return 0; } }\n');
  for (let i = 1; i <= 20; i++) {
    const n = String(i).padStart(2, '0');
    w(repo, `src/gusers/g${n}.ts`, `import { Gadget } from '../core/gadget';\nexport function useG${n}(): number { return new Gadget().run(); }\n`);
  }

  // fillers: enough extra scopes to clear groupPartitions' 30-scope floor with margin (same convention
  // what-command.test.mjs and what-weak-answer-disclosure.test.mjs use for this exact reason)
  for (let i = 1; i <= 15; i++) w(repo, `src/filler/f${i}.ts`, `export function f${i}(): number { return ${i}; }\n`);

  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'usedby-names fixture');
  const st = grainIn(repo, ['status']); assert.equal(st.code, 0, st.err);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(1) small fan-in: --json usedBy.files lists the actual importer names, not just a count', () => {
  const j = JSON.parse(grainIn(repo, ['what', 'widget', '--json']).out);
  assert.deepEqual(
    j.usedBy.files,
    ['src/users/a.ts', 'src/users/b.ts', 'src/users/c.ts'],
    `expected the three importer file names: ${JSON.stringify(j.usedBy)}`
  );
  assert.equal(j.usedBy.total, 3, JSON.stringify(j.usedBy));
});

test('(2) small fan-in: text output names the same files, no truncation marker', () => {
  const r = grainIn(repo, ['what', 'widget']);
  assert.equal(r.code, 0, r.err);
  const line = r.out.split('\n').find(l => l.startsWith('used by:'));
  assert.ok(line, r.out);
  assert.equal(line, 'used by: src/users/a.ts, src/users/b.ts, src/users/c.ts', line);
  assert.doesNotMatch(line, /more/, 'three files must not be reported as truncated');
});

test('(3) large fan-in (20 files): --json truncates the shown list but keeps the true total', () => {
  const j = JSON.parse(grainIn(repo, ['what', 'gadget', '--json']).out);
  assert.ok(Array.isArray(j.usedBy.files), JSON.stringify(j.usedBy));
  assert.equal(j.usedBy.total, 20, `all 20 importers must be counted: ${JSON.stringify(j.usedBy)}`);
  assert.ok(j.usedBy.files.length < 20, `the shown list must be truncated: ${JSON.stringify(j.usedBy)}`);
  assert.ok(j.usedBy.files.length > 0, JSON.stringify(j.usedBy));
  for (const f of j.usedBy.files) assert.match(f, /^src\/gusers\/g\d\d\.ts$/, JSON.stringify(j.usedBy));
  // the shown names are the true top of the (sorted) full set, not an arbitrary subset
  assert.deepEqual(j.usedBy.files, j.usedBy.files.slice().sort(), 'shown names must be sorted');
});

test('(4) large fan-in: text output states the truncation instead of swallowing it', () => {
  const r = grainIn(repo, ['what', 'gadget']);
  assert.equal(r.code, 0, r.err);
  const line = r.out.split('\n').find(l => l.startsWith('used by:'));
  assert.ok(line, r.out);
  assert.match(line, /used by: src\/gusers\/g01\.ts/, line);
  assert.match(line, /\+\d+ more$/, `truncation must be stated, not swallowed: ${line}`);
  const shownNames = (line.match(/src\/gusers\/g\d\d\.ts/g) || []);
  const more = Number((line.match(/\+(\d+) more$/) || [])[1]);
  assert.equal(shownNames.length + more, 20, `shown (${shownNames.length}) + more (${more}) must equal the true total of 20`);
});
