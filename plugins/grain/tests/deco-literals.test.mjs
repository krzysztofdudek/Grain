// Decorator-argument string literals (grain-authored): `@Controller("api/admin")`, `[Route("orders")]`, `@Scheduled("...")`
// carry the MEANING of the marker — routes, event names, DI tokens. They flow into the file's doc-token bag (weight 0.5 in
// `where` ranking), so a query phrased in route words finds the class that owns the route even when no identifier says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');

test('a route word that lives ONLY in a decorator string literal finds the class that owns the route', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'grain-lit-'));
  const repo = join(tmp, 'r'); mkdirSync(repo);
  const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
  const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
  try {
    git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
    // "billing" appears ONLY inside the @Controller literal of first.handler — never in a file name, identifier, or
    // directory. The rest of the fleet exists so the repo crosses the 30-scope partition threshold.
    const ROUTES = ['reports', 'orders', 'users', 'events', 'metrics', 'alerts', 'assets', 'labels', 'quotas', 'tokens', 'topics'];
    w('src/handlers/first.handler.ts', "function Controller(p) { return (c) => c; }\n@Controller('api/billing')\nexport class FirstHandler { run() { return 1; }\n  stop() { return 0; } }\n");
    ROUTES.forEach((rt, i) => w(`src/handlers/h${i}.handler.ts`, `function Controller(p) { return (c) => c; }\n@Controller('api/${rt}')\nexport class H${i}Handler { run() { return ${i}; }\n  stop() { return 0; } }\n`));
    w('src/other/util.ts', 'export const util = () => 1;\nexport const util2 = () => 2;\n');
    git('add', '-A'); git('commit', '-qm', 'base');
    const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
    assert.equal(st.status, 0, st.stderr);
    const r = spawnSync('node', [BIN, 'where', 'billing'], { cwd: repo, encoding: 'utf8' });
    assert.match(r.stdout, /src\/handlers\/first\.handler\.ts/);
    assert.doesNotMatch(r.stdout.split('\n').filter(l => l.includes('«')).join('\n'), /h3\.handler/); // an OTHER route's file does not match
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
