// tsconfig/jsconfig `paths` aliases (grain-authored, not ported): `@/*` → `src/*` and friends are the OTHER channel a
// TS repo's internal architecture flows through as bare specifiers. The learn pass reads every config in the tree
// (JSONC tolerated, `extends` followed), pre-resolves targets to root-relative, and the model carries them so the
// single-file `check` path resolves an EDITED file's aliased imports too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { edgesOf, expectEdge, forbidEdge } from './relations/harness.mjs';

test('a root tsconfig alias with a wildcard resolves, through JSONC comments and a trailing comma', () => {
  const { edges, cleanup } = edgesOf({
    'tsconfig.json': `{
  // aliases for the app
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"], /* the usual */
    },
  },
}`,
    'src/lib/util.ts': 'export const util = () => 1;\n',
    'src/a.ts': "import { util } from '@/lib/util';\nexport const a = () => util();\n",
  });
  try { expectEdge(edges, 'src/a.ts', 'src/lib/util.ts', 'import'); } finally { cleanup(); }
});

test('paths declared in an extended base config are inherited by the extending config', () => {
  const { edges, cleanup } = edgesOf({
    'tsconfig.base.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "~lib/*": ["libs/*"] } } }',
    'tsconfig.json': '{ "extends": "./tsconfig.base", "compilerOptions": { "strict": true } }',
    'libs/math.ts': 'export const add = (a, b) => a + b;\n',
    'src/calc.ts': "import { add } from '~lib/math';\nexport const c = () => add(1, 2);\n",
  });
  try { expectEdge(edges, 'src/calc.ts', 'libs/math.ts', 'import'); } finally { cleanup(); }
});

test('the NEAREST config above the importing file decides — a sibling package does not borrow another package\'s alias', () => {
  const { edges, cleanup } = edgesOf({
    'packages/a/package.json': '{ "name": "a" }',
    'packages/a/tsconfig.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "~/*": ["src/*"] } } }',
    'packages/a/src/util.ts': 'export const u = () => 1;\n',
    'packages/a/src/main.ts': "import { u } from '~/util';\nexport const m = () => u();\n",
    'packages/b/package.json': '{ "name": "b" }',
    'packages/b/tsconfig.json': '{ "compilerOptions": {} }',
    'packages/b/src/other.ts': "import { u } from '~/util';\nexport const o = () => u();\n",
  });
  try {
    expectEdge(edges, 'packages/a/src/main.ts', 'packages/a/src/util.ts', 'import');
    forbidEdge(edges, 'packages/b/src/other.ts', 'packages/a/src/util.ts');
  } finally { cleanup(); }
});

test('baseUrl alone resolves bare specifiers against it; a genuine npm package stays silent', () => {
  const { edges, cleanup } = edgesOf({
    'jsconfig.json': '{ "compilerOptions": { "baseUrl": "src" } }',
    'src/lib/util.js': 'export const util = () => 1;\n',
    'src/app.js': "import { util } from 'lib/util';\nimport React from 'react';\nexport const a = () => util();\n",
  });
  try {
    expectEdge(edges, 'src/app.js', 'src/lib/util.js', 'import');
    assert.equal(edges.filter(e => e.from === 'src/app.js').length, 1, 'react must not resolve: ' + JSON.stringify(edges));
  } finally { cleanup(); }
});

test('the model carries the aliases: `check` flags a NEW aliased import as the first edge between two modules', () => {
  const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
  const tmp = mkdtempSync(join(tmpdir(), 'grain-alias-'));
  const repo = join(tmp, 'r'); mkdirSync(repo);
  const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
  const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
  try {
    git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
    w('tsconfig.json', '{ "compilerOptions": { "baseUrl": ".", "paths": { "@infra/*": ["packages/infra/*"] } } }');
    w('packages/infra/db.ts', 'export const db = () => 1;\n');
    w('apps/a/main.ts', 'export const a = () => 2;\n');
    git('add', '-A'); git('commit', '-qm', 'base');
    const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
    assert.equal(st.status, 0, st.stderr);
    w('apps/a/main.ts', "import { db } from '@infra/db';\nexport const a = () => 2 + db();\n");
    const c = spawnSync('node', [BIN, 'check', 'apps/a/main.ts'], { cwd: repo, encoding: 'utf8' });
    assert.match(c.stdout, /\[grain\] architecture: your import of `packages\/infra\/db\.ts` \(line 1\) is the FIRST edge apps\/a → packages\/infra \(0 existing\)/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
