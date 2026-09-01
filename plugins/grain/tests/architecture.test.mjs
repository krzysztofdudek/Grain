// The architecture-enforcement path: `check` resolves an EDITED file's references against the accepted tree and says,
// at edit time, when an import creates the FIRST edge between two modules, when it closes a dependency cycle, and when
// it crosses a committed boundary decision (`grain seed add-boundary`). Existing crossings stay silent — practice
// already speaks there.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-arch-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  // three modules: apps/a and apps/b both use packages/core; b also uses a (so a→b would CLOSE a cycle); a↛b, a↛infra
  w('packages/core/util.ts', 'export const util = () => 1;\n');
  w('packages/infra/db.ts', "import { util } from '../core/util';\nexport const db = () => util();\n");
  w('apps/a/main.ts', "import { util } from '../../packages/core/util';\nexport const a = () => util();\n");
  w('apps/b/main.ts', "import { util } from '../../packages/core/util';\nimport { a } from '../../apps/a/main';\nexport const b = () => a() + util();\n");
  git('add', '-A'); git('commit', '-qm', 'base');
  const r = grain(['status']); assert.equal(r.code, 0, r.err);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('an unchanged file draws no architecture notes; an existing crossing stays silent', () => {
  const c = grain(['check', 'apps/b/main.ts']);
  assert.doesNotMatch(c.out, /\[grain\] architecture:/); // b→a and b→core both exist at HEAD
});

test('a new import that creates the FIRST edge between two modules is said at edit time, with the established path', () => {
  const orig = readFileSync(join(repo, 'apps/a/main.ts'), 'utf8');
  w('apps/a/main.ts', "import { db } from '../../packages/infra/db';\n" + orig.replace('util();', 'util() + db();'));
  try {
    const c = grain(['check', 'apps/a/main.ts']);
    assert.match(c.out, /\[grain\] architecture: your import of `packages\/infra\/db\.ts` \(line 1\) is the FIRST edge apps\/a → packages\/infra \(0 existing\)/);
    assert.match(c.out, /Not forbidden, but it opens a dependency no one has opened before\./);
  } finally { w('apps/a/main.ts', orig); }
});

test('a new import whose reverse edge exists is called a cycle closure', () => {
  const orig = readFileSync(join(repo, 'apps/a/main.ts'), 'utf8');
  w('apps/a/main.ts', "import { b } from '../../apps/b/main';\n" + orig.replace('util();', 'util() + b();'));
  try {
    const c = grain(['check', 'apps/a/main.ts']);
    assert.match(c.out, /CLOSES A CYCLE apps\/a ↔ apps\/b — apps\/b already depends on apps\/a \(1 edge\)/);
  } finally { w('apps/a/main.ts', orig); }
});

test('a committed boundary decision flags the crossing as a maintainer decision, and rm withdraws it', () => {
  const add = grain(['seed', 'add-boundary', 'apps/a', '--never-imports', 'packages/infra', '--note', 'apps go through core - ADR-3', '--author', 'kd']);
  assert.equal(add.code, 0, add.err); assert.match(add.out, /recorded boundary [0-9a-f]{8}/); assert.match(add.out, /No existing edges cross it\./);
  const id = add.out.match(/recorded boundary ([0-9a-f]{8})/)[1];
  assert.match(grain(['seed', 'list']).out, new RegExp(id + '  boundary: apps/a/ never imports packages/infra/'));
  const orig = readFileSync(join(repo, 'apps/a/main.ts'), 'utf8');
  w('apps/a/main.ts', "import { db } from '../../packages/infra/db';\n" + orig.replace('util();', 'util() + db();'));
  try {
    const c = grain(['check', 'apps/a/main.ts']);
    assert.match(c.out, /\[grain\] decision boundary \(kd [\d-]+\): apps\/a\/ never imports packages\/infra\/ — your import of `packages\/infra\/db\.ts` \(line 1\) crosses it\.\n  apps go through core - ADR-3/);
    assert.match(grain(['report']).out, /== boundaries — 1 architecture decision\(s\)/);
    assert.match(grain(['status']).out, /boundaries: 1 architecture decision/);
  } finally { w('apps/a/main.ts', orig); }
  assert.match(grain(['seed', 'rm', id]).out, /removed seed/);
  const orig2 = readFileSync(join(repo, 'apps/a/main.ts'), 'utf8');
  w('apps/a/main.ts', "import { db } from '../../packages/infra/db';\n" + orig2.replace('util();', 'util() + db();'));
  try { assert.doesNotMatch(grain(['check', 'apps/a/main.ts']).out, /decision boundary .*never imports/); }
  finally { w('apps/a/main.ts', orig2); }
});
