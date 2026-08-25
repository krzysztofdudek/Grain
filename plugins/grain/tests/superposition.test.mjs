// Superposition, stage 0 (grain-authored; design record in the repo's .temp/docs/math-constitution.md): a role cluster's
// members anti-unify into ONE template; per-hole statistics say which elements are invariant (they stay in the skeleton,
// literally — the shared call), which vary per instance (each handler's own command), and which are merely skewed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-sup-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  // twelve handlers of identical shape: per-instance command type, an INVARIANT validate() first call, a shared save
  const CMDS = ['Order', 'Invoice', 'User', 'Report', 'Alert', 'Asset', 'Label', 'Quota', 'Token', 'Topic', 'Metric', 'Event'];
  CMDS.forEach((c, i) => w(`src/handlers/${c.toLowerCase()}.handler.ts`,
    `import { validate, audit, drop } from '../base';\nexport function handleCommand(cmd) {\n  validate(cmd);\n  audit(cmd, ${i});\n  return new ${c}Result(cmd);\n}\nexport function revertCommand(cmd) {\n  validate(cmd);\n  return drop(cmd);\n}\n`));
  w('src/base.ts', 'export const validate = (c) => c;\nexport const audit = (c, i) => i;\nexport const drop = (c) => null;\n');
  w('src/other/util.ts', 'export const util = () => 1;\nexport const util2 = () => 2;\n');
  git('add', '-A'); git('commit', '-qm', 'base');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('the cluster anti-unifies: invariant calls stay literal in the skeleton, the per-instance name becomes a counted slot', () => {
  const r = spawnSync('node', [BIN, 'export', '--compact', '--no-anchors'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const d = JSON.parse((r.stdout || '').split('\n').find(l => l.startsWith('{')));
  const withP = (d.partitions || []).flatMap(P => P.groups || []).filter(g => g.profile);
  assert.ok(withP.length >= 1, 'at least one group must carry a profile: ' + JSON.stringify((d.partitions || []).map(P => P.groups?.length)));
  const pf = withP.map(g => g.profile).sort((a, b) => b.n - a.n)[0];
  assert.ok(pf.n >= 10, 'the handler fleet folds into one template: ' + JSON.stringify(pf));
  assert.match(pf.skel, /validate/, 'the INVARIANT call survives literally in the skeleton: ' + pf.skel);
  assert.ok(pf.perInstance.length >= 1, 'the per-instance slot is detected: ' + JSON.stringify(pf));
  assert.ok(pf.perInstance[0].distinct >= 10, 'each instance carries its own value: ' + JSON.stringify(pf.perInstance));
});

test('the where group card speaks the superposition', () => {
  const r = spawnSync('node', [BIN, 'where', 'handle', 'command'], { cwd: repo, encoding: 'utf8' });
  assert.match(r.stdout, /superposition: \d+ members share this skeleton/);
  assert.match(r.stdout, /per-instance/);
});
