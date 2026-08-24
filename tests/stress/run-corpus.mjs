#!/usr/bin/env node
// Stress/quality harness: runs grain end to end over a corpus of real repositories and records everything an
// engineer or a reviewing agent needs to judge it — timings, peak memory, model sizes, every answer verbatim, the
// mutation harness, an incremental refresh, a divergent checkout — as JSON + plain-text transcripts.
//
//   node tests/stress/run-corpus.mjs <corpusDir> <outDir> [repoName ...]
//
// <corpusDir> holds one git clone per subdirectory. Each repo gets <outDir>/<repo>.json and <outDir>/<repo>.txt.
// The harness never modifies the repositories beyond a throwaway commit on a throwaway branch that it deletes again.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(here, '..', '..', 'plugins', 'grain', 'bin', 'grain.mjs');
const [corpus, outDir, ...only] = process.argv.slice(2);
if (!corpus || !outDir) { console.error('usage: run-corpus.mjs <corpusDir> <outDir> [repo...]'); process.exit(2); }
mkdirSync(outDir, { recursive: true });

// realistic agent intents per repository (what an agent would ask before writing code there)
const INTENTS = {
  express: ['router middleware', 'request property', 'response helper send json', 'error handling', 'test for router', 'view engine'],
  nest: ['guard', 'interceptor', 'pipe validation', 'controller decorator', 'exception filter', 'microservice transport', 'testing utility', 'websocket gateway'],
  flask: ['blueprint', 'json provider', 'cli command', 'session interface', 'test for routing', 'template rendering'],
  gin: ['middleware', 'binding validator', 'render json', 'router group', 'test for context'],
  chi: ['middleware', 'router mount', 'test for middleware', 'url param'],
  'spring-petclinic': ['controller', 'repository', 'entity model', 'validator', 'integration test', 'view template'],
  CleanArchitecture: ['command handler', 'query handler', 'validator', 'domain event', 'entity', 'integration test', 'web endpoint'],
  axum: ['extractor', 'middleware layer', 'response type', 'example app', 'test for routing', 'error handling'],
  sinatra: ['helper', 'settings', 'rack middleware', 'test', 'template'],
  Slim: ['middleware', 'route handler', 'error handler', 'factory', 'test'],
  okhttp: ['interceptor', 'connection pool', 'tls configuration', 'test', 'cache'],
  typeorm: ['repository', 'column decorator', 'postgres driver', 'query builder', 'migration', 'entity subscriber'],
};

const t = () => Date.now();
function run(args, cwd, { timeoutMs = 20 * 60_000 } = {}) {
  const t0 = t();
  // /usr/bin/time -l (BSD) prints peak RSS on stderr; fall back to plain spawn where unavailable
  const useTime = existsSync('/usr/bin/time') && process.platform === 'darwin';
  const r = useTime ? spawnSync('/usr/bin/time', ['-l', 'node', BIN, ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 28, timeout: timeoutMs })
    : spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 28, timeout: timeoutMs });
  const ms = t() - t0;
  let rss = null; const m = (r.stderr || '').match(/(\d+)\s+maximum resident set size/); if (m) rss = Math.round(+m[1] / 1048576);
  const stderr = (r.stderr || '').split('\n').filter(l => !/^\s*\d+(\.\d+)?\s+(real|user|sys|maximum|average|page|voluntary|involuntary|signals|swaps|block|socket|messages|instructions|cycles|peak)/.test(l) && !/^\s*\d+\s+\w/.test(l)).join('\n').trim();
  return { args: args.join(' '), ms, rssMb: rss, code: r.status, signal: r.signal, out: (r.stdout || '').trimEnd(), err: stderr };
}
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'stress', GIT_AUTHOR_EMAIL: 's@x', GIT_COMMITTER_NAME: 'stress', GIT_COMMITTER_EMAIL: 's@x', GIT_AUTHOR_DATE: '2026-08-20T12:00:00Z', GIT_COMMITTER_DATE: '2026-08-20T12:00:00Z' } }).trim();

const repos = readdirSync(corpus, { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(join(corpus, d.name, '.git'))).map(d => d.name).filter(n => !only.length || only.includes(n)).sort();
for (const name of repos) {
  const repo = join(corpus, name); const res = { repo: name, head: git(repo, 'rev-parse', 'HEAD'), commits: +git(repo, 'rev-list', '--count', 'HEAD'), steps: [] };
  const log = s => { console.error(`[${name}] ${s}`); };
  const step = (label, args, extra = {}) => { const r = run(args, repo, extra); res.steps.push({ label, ...r }); log(`${label}: ${r.ms} ms${r.rssMb ? `, ${r.rssMb} MB` : ''}${r.code ? `, exit ${r.code}` : ''}${r.signal ? `, signal ${r.signal}` : ''}`); return r; };
  rmSync(join(repo, '.grain'), { recursive: true, force: true });
  const cold = step('cold status', ['status']);
  const modelPath = join(repo, '.grain', 'cache', 'model.json');
  let model = null; try { model = JSON.parse(readFileSync(modelPath, 'utf8')); } catch {}
  if (model) res.model = { bytes: readFileSync(modelPath).length, files: model.files, partitions: model.partitions.map(p => ({ name: p.name, scopes: p.scopes, files: p.files.length, groups: p.medoids.length, facts: p.facts.length, labels: p.medoids.map(m => m.label).slice(0, 40) })), cochange: model.cochange.length, historyStats: model.historyStats };
  try { res.cacheBytes = execFileSync('du', ['-sk', join(repo, '.grain', 'cache')], { encoding: 'utf8' }).split('\t')[0] * 1024; } catch {}
  step('warm status', ['status']);
  step('report', ['report', '--top', '40']);
  for (const q of INTENTS[name] || ['handler', 'test', 'helper']) step(`where ${q}`, ['where', ...q.split(' ')]);
  // check: a spread of real files — first, middle and last of the largest partition's file list, plus two from the middle of the tree
  const files = model ? [...new Set(model.partitions.flatMap(p => p.files))].sort() : [];
  const pick = files.length ? [0, Math.floor(files.length / 4), Math.floor(files.length / 2), Math.floor(files.length * 3 / 4), files.length - 1].map(i => files[i]) : [];
  for (const f of [...new Set(pick)]) step(`check ${f}`, ['check', f]);
  if (pick[2]) step(`spectrum ${pick[2]}`, ['spectrum', pick[2], '--top', '15']);
  step('mutate-test', ['mutate-test'], { timeoutMs: 30 * 60_000 });
  // incremental: throwaway commit on a throwaway branch, query, then a divergent checkout (an ancestor), then back
  const branch = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD');
  try {
    git(repo, 'checkout', '-q', '-b', 'grain-stress');
    const probe = join(repo, 'grain_probe_' + (files[0] ? files[0].split('.').pop() : 'txt')); writeFileSync(probe, '// grain stress probe\n');
    git(repo, 'add', '--', probe); git(repo, 'commit', '-qm', 'grain stress probe');
    step('incremental after 1 commit: where probe', ['where', 'probe']);
    const back = Math.min(200, res.commits - 1);
    git(repo, 'checkout', '-q', `HEAD~${back}`);
    step(`divergent checkout HEAD~${back}: status`, ['status']);
    git(repo, 'checkout', '-q', '-f', 'grain-stress');
    step('back to tip: status', ['status']);
  } catch (e) { res.steps.push({ label: 'incremental/divergent', error: String(e.message || e) }); }
  finally { try { git(repo, 'checkout', '-q', '-f', branch); git(repo, 'branch', '-q', '-D', 'grain-stress'); } catch {} ; try { rmSync(join(repo, readdirSync(repo).find(f => f.startsWith('grain_probe_')) || 'nope'), { force: true }); } catch {} }
  writeFileSync(join(outDir, name + '.json'), JSON.stringify(res, null, 1));
  writeFileSync(join(outDir, name + '.txt'), [`# ${name} @ ${res.head} (${res.commits} commits)`, ...res.steps.map(s => `\n=== ${s.label} === (${s.ms} ms${s.rssMb ? `, ${s.rssMb} MB` : ''}${s.code ? `, exit ${s.code}` : ''})\n${s.err ? '[stderr]\n' + s.err + '\n' : ''}${s.out || ''}`)].join('\n'));
  log(`done: ${res.model ? res.model.partitions.map(p => `${p.name}:${p.facts} facts/${p.groups} groups`).join(', ') : 'NO MODEL'}`);
}
console.log(JSON.stringify({ repos, outDir }));
