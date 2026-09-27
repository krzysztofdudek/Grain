// A small repository whose proposal puts both kinds of top-level node at the top of `model/` (issue 455): a
// classifying type (`tests`) and the organizational `module` the renderer inserts above a type cut one level
// down (`src/main`). Shared by `propose-root-parent.test.mjs` (a stand-in CLI) and `seams.test.mjs` (the real
// Yggdrasil), so both judge the same shape.
import './git-env.mjs'; // no background git maintenance while the fixture is committed (issue 409)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function writeTopLevelRepo(repo, env = process.env) {
  const w = (rel, s) => { const p = join(repo, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };
  for (const n of ['alpha', 'beta', 'gamma', 'delta']) {
    w(`src/main/api/${n}-handler.ts`, `import { normalise } from '../util/${n}-helper';\nexport function handle${n}(x: string): string { return normalise(x); }\n`);
    w(`src/main/util/${n}-helper.ts`, 'export function normalise(v: string): string { return v.trim(); }\n');
    w(`tests/${n}.test.ts`, `import { handle${n} } from '../src/main/api/${n}-handler';\nexport function t${n}(): string { return handle${n}(' a '); }\n`);
  }
  w('README.md', '# fixture\n');
  const gitEnv = { ...env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
  execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main'], { env: gitEnv });
  execFileSync('git', ['-C', repo, 'add', '-A'], { env: gitEnv });
  execFileSync('git', ['-C', repo, 'commit', '-q', '-m', 'fixture'], { env: gitEnv });
  return repo;
}
// The types a proposal for this repository must list `root` on, when the CLI knows it.
export const TOP_LEVEL_TYPES = ['module', 'tests'];
