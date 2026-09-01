// Template mining, stage 1 (grain-authored): the scopes clustering leaves behind — plain functions with no markers,
// catch blocks — still repeat shapes. Coarse silhouette buckets + anti-unification surface them: the original ask,
// "catch zawsze loguje", falls out as a template whose invariant call survives literally in the skeleton.
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
  tmp = mkdtempSync(join(tmpdir(), 'grain-tpl-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  // eight single-token-named functions (never eligible for clustering) with one shape: try, work, catch logs
  const NAMES = ['load', 'save', 'sync', 'push', 'pull', 'scan', 'wipe', 'seed'];
  NAMES.forEach((n, i) => w(`src/jobs/${n}.ts`,
    `export function ${n}() {\n  try {\n    return work(${i});\n  } catch (e) {\n    logger.error(e);\n    return null;\n  }\n}\n`));
  w('src/other/util.ts', 'export const util = () => 1;\nexport const util2 = () => 2;\nexport const util3 = () => 3;\nexport const util4 = () => 4;\nexport const util5 = () => 5;\n');
  git('add', '-A'); git('commit', '-qm', 'base');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('the unclustered fleet surfaces as a template, and the catch template keeps the logging call literally', () => {
  const r = spawnSync('node', [BIN, 'report'], { cwd: repo, encoding: 'utf8' });
  assert.match(r.stdout, /template \(unclustered (method|catch)s ×8/);
  const catchLine = r.stdout.split('\n').find(l => /template \(unclustered catchs ×8/.test(l));
  assert.ok(catchLine, 'the catch fleet has a template:\n' + r.stdout);
  assert.match(catchLine, /logger/, 'the invariant logging call survives literally: ' + catchLine);
});

// §030: `report`'s template lines look like established practice (a skeleton "held since", a per-instance slot
// count) but check/review/hooks cannot fail a member for breaking one — templates are render-only structural
// superpositions, never a `part.facts` cell. The fix marks template lines as descriptive in both report and
// rules, byte-identically (§007's drift is the failure mode this guards against). The companion assertion — a
// genuine, enforced `part.facts` convention in the SAME output does NOT carry the marker — lives in
// grain.test.mjs's "report finds the planted conventions" test, over the richer build-fixture.mjs repo (this
// fixture's single, same-day commit certifies no `part.facts` convention at all — see mkWeightFn's freshDays gate
// — so it can only exercise the template half).
test('§030: both report and rules mark the template line descriptive, byte-identically', () => {
  const rep = spawnSync('node', [BIN, 'report'], { cwd: repo, encoding: 'utf8' }).stdout;
  const templateLines = rep.split('\n').filter(l => l.includes('template (unclustered'));
  assert.ok(templateLines.length >= 1, 'no template line found:\n' + rep);
  for (const l of templateLines) assert.match(l, /descriptive only — check has no cell for a template's shape, so a member breaking it is never flagged/, `template line must carry the descriptive marker: ${l}`);

  const rules = spawnSync('node', [BIN, 'rules'], { cwd: repo, encoding: 'utf8' }).stdout;
  const rulesTemplateLines = rules.split('\n').filter(l => l.startsWith('- ') && l.includes('unclustered'));
  assert.ok(rulesTemplateLines.length >= 1, 'no template line found in rules:\n' + rules);
  for (const l of rulesTemplateLines) assert.match(l, /descriptive only — check has no cell for a template's shape, so a member breaking it is never flagged/, `rules template line must carry the descriptive marker: ${l}`);
});

test('export carries the templates with exemplars', () => {
  const r = spawnSync('node', [BIN, 'export', '--compact', '--no-anchors'], { cwd: repo, encoding: 'utf8' });
  const d = JSON.parse((r.stdout || '').split('\n').find(l => l.startsWith('{')));
  const ts = (d.partitions || []).flatMap(P => P.templates || []);
  assert.ok(ts.length >= 1, JSON.stringify(d.partitions?.map(P => P.templates?.length)));
  assert.ok(ts.every(t => t.exemplars?.length >= 1 && t.skel));
});
