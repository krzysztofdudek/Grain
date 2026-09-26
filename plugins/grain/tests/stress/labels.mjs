#!/usr/bin/env node
// Label readers — the labels a house makes about its own code, read as validation input for Grain's analytics.
// An instrument, not a product surface: nothing in the plugin imports it, and nothing it prints is advice.
//
// Two sources, each a record the house writes for its own reasons, so neither is a label Grain derived itself
// (results.md 155 and 157: a delivery label "needs an issue tracker or the evidence layer, not history", and
// labels must be ones "the house makes itself").
//
//   verdicts   Yggdrasil's verdict history. `.yggdrasil/yg-events.llm.jsonl` (committed, LLM verdicts only) and
//              `.yggdrasil/.yg-events.jsonl*` (local, gitignored, rotated; deterministic verdicts too, and the
//              reviewer's `reason` on a refusal). A refusal of a (rule, unit) followed by an approval of the same
//              unit on a different content hash is a REFUSAL-TO-FIX pair: the rule's own verdict, before and
//              after a change that satisfied it.
//   loop       A Jarl issue loop (`.jarl/issues/*.md` and `.jarl/log.md`). Each issue carries **Kind:**, **Repo:**
//              and **Files:** (each file prefixed with its repository's directory name), and the log says when it
//              was filed. An issue of kind `bug` names the files a found defect was fixed in.
//
//   node tests/stress/labels.mjs verdicts <repo-with-.yggdrasil> [--git] [--json]
//   node tests/stress/labels.mjs loop <.jarl dir> [--repo <name>] [--kind <k>] [--json]
//   node tests/stress/labels.mjs risk <repo-with-.yggdrasil> --loop <.jarl dir> [--json]
//
// `risk` is the guardrail measurement of research B7: does any node feature say more about which nodes draw
// labels than size and churn already do? It reads both label sources above against the repository's own node
// graph, with features from git history before the loop opened, and reports AUC per feature, by node kind.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readNodeGraph } from '../../engine/grain-advise.mjs';
import { graphAt } from './trajectory.mjs';

const git = (repo, args, opts = {}) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'], ...opts });
const gitOr = (repo, args, dflt = null) => { try { return git(repo, args).trim(); } catch { return dflt; } };

// ---------------------------------------------------------------------------------------------------------------
// 1. Verdicts
// ---------------------------------------------------------------------------------------------------------------
const jsonl = p => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } }) : []);

// every verdict event the repository still holds, committed and local, once each; a local copy of a committed
// event lends it the `reason` the committed stream leaves out
export function readVerdictEvents(repo) {
  const dir = join(repo, '.yggdrasil');
  const committed = jsonl(join(dir, 'yg-events.llm.jsonl')).map(e => ({ ...e, committed: true }));
  const local = existsSync(dir) ? readdirSync(dir).filter(f => /^\.yg-events\.jsonl(\.\d+)?$/.test(f)).sort().flatMap(f => jsonl(join(dir, f))) : [];
  const key = e => [e.ts, e.aspectId, e.unitKey, e.disposition, e.hash || ''].join('\x00');
  const byKey = new Map();
  for (const e of committed) byKey.set(key(e), e);
  for (const e of local) {
    const k = key(e), have = byKey.get(k);
    if (have) { if (e.reason && !have.reason) have.reason = e.reason; continue; }
    byKey.set(k, { ...e, committed: false });
  }
  return [...byKey.values()].filter(e => e.aspectId && e.unitKey && e.ts).sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
}

// For each (rule, unit): every refused hash is paired with the next approval of that unit on a different hash.
// A refusal with no later approval stays open. Infra verdicts (the reviewer did not answer) are not verdicts.
export function refusalPairs(events) {
  const byPair = new Map();
  for (const e of events) {
    if (e.disposition !== 'refused' && e.disposition !== 'approved') continue;
    const k = e.aspectId + '\x00' + e.unitKey;
    (byPair.get(k) || byPair.set(k, []).get(k)).push(e);
  }
  const pairs = [], open = [];
  for (const evs of byPair.values()) {
    let pending = [];
    for (const e of evs) {
      if (e.disposition === 'refused') { if (!pending.some(p => p.hash && p.hash === e.hash)) pending.push(e); continue; }
      if (!pending.length) continue;
      if (e.hash && pending.every(p => p.hash === e.hash)) continue; // the same content approved: not a fix
      for (const r of pending)
        pairs.push({
          rule: r.aspectId, unit: r.unitKey, kind: r.kind,
          refusedHash: r.hash || null, approvedHash: e.hash || null,
          refusedAt: r.ts, approvedAt: e.ts, hours: (Date.parse(e.ts) - Date.parse(r.ts)) / 3.6e6,
          refusedSha: r.sha || null, approvedSha: e.sha || null, reason: r.reason || null,
        });
      pending = [];
    }
    open.push(...pending.map(r => ({ rule: r.aspectId, unit: r.unitKey, kind: r.kind, refusedAt: r.ts, refusedSha: r.sha || null, reason: r.reason || null })));
  }
  return { pairs, open };
}

// What git can say about a pair, without the refused content itself (which no store keeps): whether the unit's
// file and the rule's own directory differ between the commit the refusal was judged at and the commit the
// approval was. `same-commit` — both verdicts were judged on one HEAD, so the fix lived in the working tree and at
// least one of the two contents was never committed; `file` — the file changed in between (the refused content
// can be the file at the refusal's commit, if its working tree was clean then); `rule` — the rule changed (the
// refusal may have been answered by editing the rule, not the code); `no-sha` — a verdict older than the `sha`
// field. An upper bound on the refused contents git could give back, never a proof that it can.
export function classifyPair(repo, p) {
  if (!p.refusedSha || !p.approvedSha) return 'no-sha';
  const path = p.unit.replace(/^file:/, '');
  const blob = (sha, rel) => gitOr(repo, ['rev-parse', `${sha}:${rel}`]);
  if (p.refusedSha === p.approvedSha) {
    // did a later commit carry a new version of the file? If not, the file's committed content stayed the one at
    // that HEAD, so of two different contents judged on it at most one was ever committed
    const next = gitOr(repo, ['rev-list', '--reverse', `--since=${p.approvedAt}`, 'HEAD', '--', path], '').split('\n')[0];
    return next && blob(next, path) !== blob(p.refusedSha, path) ? 'same-commit, file committed later' : 'same-commit, file not committed later';
  }
  const fileMoved = blob(p.refusedSha, path) !== blob(p.approvedSha, path);
  const ruleMoved = blob(p.refusedSha, `.yggdrasil/aspects/${p.rule}`) !== blob(p.approvedSha, `.yggdrasil/aspects/${p.rule}`);
  return ruleMoved && fileMoved ? 'file+rule' : ruleMoved ? 'rule' : fileMoved ? 'file' : 'neither';
}

const quantile = (xs, q) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

export function verdictSummary(repo, { withGit = false } = {}) {
  const events = readVerdictEvents(repo);
  const { pairs, open } = refusalPairs(events);
  const count = (xs, f) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const verdicts = count(events, e => `${e.kind}:${e.disposition}`);
  const rules = {};
  for (const e of events) {
    if (e.disposition !== 'refused' && e.disposition !== 'approved') continue;
    const r = rules[e.aspectId] || (rules[e.aspectId] = { kind: e.kind, approved: 0, refused: 0, pairs: 0, open: 0, withReason: 0 });
    r[e.disposition]++;
  }
  for (const p of pairs) { rules[p.rule].pairs++; if (p.reason) rules[p.rule].withReason++; }
  for (const o of open) rules[o.rule].open++;
  // Reviewer stability: a (rule, unit, hash) judged more than once, and how many of those got two dispositions.
  const judged = new Map();
  for (const e of events) if (e.hash && (e.disposition === 'refused' || e.disposition === 'approved')) {
    const k = [e.aspectId, e.unitKey, e.hash].join('\x00');
    (judged.get(k) || judged.set(k, new Set()).get(k)).add(e.disposition);
  }
  const rejudged = [...judged.values()];
  const out = {
    first: events[0]?.ts || null, last: events.at(-1)?.ts || null, events: events.length, verdicts,
    pairs: pairs.length, open: open.length,
    pairsByKind: count(pairs, p => p.kind),
    hoursToFix: { median: quantile(pairs.map(p => p.hours), 0.5), p90: quantile(pairs.map(p => p.hours), 0.9) },
    pairsWithReason: pairs.filter(p => p.reason).length,
    rejudgedHashes: rejudged.length, rejudgedFlipped: rejudged.filter(s => s.size > 1).length,
    rules: Object.fromEntries(Object.entries(rules).filter(([, r]) => r.refused).sort((a, b) => b[1].refused - a[1].refused)),
  };
  if (withGit) out.recoverable = count(pairs.filter(p => p.kind === 'llm'), p => classifyPair(repo, p));
  return { summary: out, pairs, open };
}

// ---------------------------------------------------------------------------------------------------------------
// 2. A Jarl loop
// ---------------------------------------------------------------------------------------------------------------
const field = (text, name) => { const m = new RegExp(`^\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'm').exec(text); return m ? m[1].trim() : ''; };

// One row per issue: id, title, kind, status, the repository's directory name (the last segment of **Repo:**),
// the files it names inside that repository, and when it was filed (the log's `filed <id>` line, else **Since:**).
export function readLoopIssues(jarlDir) {
  const filed = new Map();
  const logPath = join(jarlDir, 'log.md');
  if (existsSync(logPath))
    for (const l of readFileSync(logPath, 'utf8').split('\n')) {
      const m = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) · filed (\d+)\b/.exec(l);
      if (m && !filed.has(+m[3])) filed.set(+m[3], `${m[1]}T${m[2]}`);
    }
  const dir = join(jarlDir, 'issues');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => /^\d+.*\.md$/.test(f)).sort().map(f => {
    const text = readFileSync(join(dir, f), 'utf8');
    const id = +/^(\d+)/.exec(f)[1];
    const repoField = field(text, 'Repo');
    const repoBase = repoField ? basename(repoField.replace(/\/+$/, '')) : '';
    const repo = repoBase && repoBase !== '..' && repoBase !== '.' ? repoBase : null; // a loop's own hub is not a repository here
    const files = field(text, 'Files').split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const slash = s.indexOf('/');
      // a file carries its repository's directory name when **Repo:** is set (the Jarl format); `x.ts:12-30` keeps its path
      const [r, p] = repo && slash > 0 && s.slice(0, slash) === repo ? [repo, s.slice(slash + 1)] : [repo, s];
      return { repo: r, path: p.replace(/:\d+(-\d+)?$/, '') };
    });
    const since = field(text, 'Since');
    return {
      id, title: (/^# (?:\d+ · )?(.*)$/m.exec(text) || [])[1] || '', kind: field(text, 'Kind') || null,
      status: field(text, 'Status') || null, repo, files,
      filedAt: filed.get(id) || (since ? since.replace(' ', 'T') : null),
    };
  });
}

export function loopSummary(issues) {
  const count = (xs, f) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  return {
    issues: issues.length, byKind: count(issues, i => i.kind), byRepo: count(issues, i => i.repo),
    withFiles: issues.filter(i => i.files.length).length,
    bugsWithFiles: count(issues.filter(i => i.kind === 'bug' && i.files.length), i => i.repo),
    first: issues.map(i => i.filedAt).filter(Boolean).sort()[0] || null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 3. The B7 guardrail: node features against both label sources
// ---------------------------------------------------------------------------------------------------------------
// Mann-Whitney AUC with ties counted half: the chance a labelled node outranks an unlabelled one.
export function auc(scores, labels) {
  const idx = scores.map((s, i) => i).sort((a, b) => scores[a] - scores[b]);
  let rankSum = 0, i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (labels[idx[k]]) rankSum += r;
    i = j + 1;
  }
  const P = labels.filter(Boolean).length, N = labels.length - P;
  return P && N ? (rankSum - (P * (P + 1)) / 2) / (P * N) : null;
}
// ordinary least squares residual of y on the columns of X (with an intercept), by the normal equations
export function residual(y, X) {
  const n = y.length, cols = [Array(n).fill(1), ...X], k = cols.length;
  const A = cols.map(a => cols.map(b => a.reduce((s, v, i) => s + v * b[i], 0)));
  const bvec = cols.map(a => a.reduce((s, v, i) => s + v * y[i], 0));
  for (let c = 0; c < k; c++) { // Gauss-Jordan with partial pivoting
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [bvec[c], bvec[p]] = [bvec[p], bvec[c]];
    if (Math.abs(A[c][c]) < 1e-12) continue;
    for (let r = 0; r < k; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let q = c; q < k; q++) A[r][q] -= f * A[c][q]; bvec[r] -= f * bvec[c]; }
  }
  const beta = bvec.map((v, c) => (Math.abs(A[c][c]) < 1e-12 ? 0 : v / A[c][c]));
  return y.map((v, i) => v - cols.reduce((s, col, c) => s + beta[c] * col[i], 0));
}
export const isTestPath = id => /(^|\/)(tests?|__tests__|spec|e2e|fixtures?)(\/|$)|\.(test|spec)\./.test(id);

export function riskMeasure(repo, jarlDir) {
  const repoName = basename(resolve(repo));
  const issues = readLoopIssues(jarlDir).filter(i => i.repo === repoName);
  const cutoff = issues.map(i => i.filedAt).filter(Boolean).sort()[0];
  if (!cutoff) throw new Error(`no issue of ${repoName} in ${jarlDir}`);
  const cutSha = gitOr(repo, ['rev-list', '-1', `--before=${cutoff}`, 'HEAD']);
  const files = git(repo, ['ls-files']).split('\n').filter(Boolean);
  const g = readNodeGraph(repo, files);
  if (!g) throw new Error(`${repo} has no .yggdrasil graph`);
  const leaf = g.nodes.filter(n => [...n.files].some(f => g.ownerOf.get(f) === n.id));
  const idx = new Map(leaf.map((n, i) => [n.id, i]));
  const at = f => idx.get(g.ownerOf.get(f));
  // features, all from history before the loop opened: lines at the cut, commits touching the node, declared fan-in;
  // the nodes are HEAD's (the labels name today's files), a node the graph did not have at the cut reads fan-in 0
  const loc = leaf.map(() => 0), commits = leaf.map(() => 0), fanIn = leaf.map(() => 0);
  for (const line of gitOr(repo, ['grep', '-I', '-c', '', cutSha], '').split('\n')) { // lines per text file at the cut
    const m = /^[0-9a-f]+:(.*):(\d+)$/.exec(line);
    if (m && at(m[1]) !== undefined) loc[at(m[1])] += +m[2];
  }
  let touched = new Set();
  for (const line of git(repo, ['log', '--no-merges', '--name-only', '--format=format:@@', cutSha]).split('\n')) {
    if (line === '@@') { for (const i of touched) commits[i]++; touched = new Set(); continue; }
    if (line && at(line) !== undefined) touched.add(at(line));
  }
  for (const i of touched) commits[i]++;
  // fan-in as the graph declared it at the cut, not at HEAD: a relation added while the loop ran is not a feature
  for (const ts of graphAt(repo, cutSha).rel.values()) for (const t of ts) if (idx.has(t)) fanIn[idx.get(t)]++;
  const label = leaf.map(() => false);
  for (const i of issues) if (i.kind === 'bug') for (const f of i.files) if (at(f.path) !== undefined) label[at(f.path)] = true;
  const refused = leaf.map(() => false);
  for (const e of readVerdictEvents(repo)) if (e.disposition === 'refused' && e.unitKey.startsWith('file:') && Date.parse(e.ts) >= Date.parse(cutoff)) {
    const i = at(e.unitKey.slice(5)); if (i !== undefined) refused[i] = true;
  }
  const lg = xs => xs.map(v => Math.log(1 + v));
  const rows = {};
  for (const [stratum, keep] of [['all', () => true], ['production', i => !isTestPath(leaf[i].id)], ['test', i => isTestPath(leaf[i].id)]]) {
    const ii = leaf.map((_, i) => i).filter(keep);
    const pick = xs => ii.map(i => xs[i]);
    const [L, C, F] = [pick(lg(loc)), pick(lg(commits)), pick(fanIn)];
    const size = L.map((v, j) => v + C[j]);
    rows[stratum] = {};
    for (const [name, lab] of [['bug issue', pick(label)], ['refused after cut', pick(refused)]]) {
      rows[stratum][name] = {
        nodes: ii.length, positives: lab.filter(Boolean).length,
        'log LOC': auc(L, lab), 'log commits': auc(C, lab), 'log LOC + log commits': auc(size, lab),
        'fan-in': auc(F, lab), 'fan-in residual on size': auc(residual(F, [L, C]), lab),
        'fan-in = 0 share': +(F.filter(v => v === 0).length / Math.max(1, F.length)).toFixed(3),
      };
    }
  }
  return { repo: repoName, cutoff, cutSha, leafNodes: leaf.length, issues: issues.length, bugIssues: issues.filter(i => i.kind === 'bug').length, rows };
}

// ---------------------------------------------------------------------------------------------------------------
const fmt = v => (v == null ? '—' : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : String(v));
async function main(argv) {
  const [cmd, target, ...rest] = argv;
  const flag = n => rest.includes(n);
  const opt = n => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : null; };
  if (!cmd || !target) {
    process.stderr.write('usage: labels.mjs verdicts <repo> [--git] [--json] | loop <.jarl> [--repo <name>] [--kind <k>] [--json] | risk <repo> --loop <.jarl> [--json]\n');
    return 2;
  }
  if (cmd === 'verdicts') {
    const r = verdictSummary(target, { withGit: flag('--git') });
    process.stdout.write(flag('--json') ? JSON.stringify(r, null, 1) + '\n' : JSON.stringify(r.summary, null, 1) + '\n');
    return 0;
  }
  if (cmd === 'loop') {
    let issues = readLoopIssues(target);
    if (opt('--repo')) issues = issues.filter(i => i.repo === opt('--repo'));
    if (opt('--kind')) issues = issues.filter(i => i.kind === opt('--kind'));
    process.stdout.write(flag('--json') ? JSON.stringify(issues, null, 1) + '\n' : JSON.stringify(loopSummary(issues), null, 1) + '\n');
    return 0;
  }
  if (cmd === 'risk') {
    const r = riskMeasure(target, opt('--loop'));
    if (flag('--json')) { process.stdout.write(JSON.stringify(r, null, 1) + '\n'); return 0; }
    process.stdout.write(`${r.repo}: ${r.leafNodes} nodes owning files · cut ${r.cutoff} (${r.cutSha.slice(0, 7)}) · ${r.issues} issues, ${r.bugIssues} bugs\n`);
    for (const [stratum, byLabel] of Object.entries(r.rows))
      for (const [label, row] of Object.entries(byLabel))
        process.stdout.write(`${stratum.padEnd(10)} ${label.padEnd(18)} ${Object.entries(row).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ')}\n`);
    return 0;
  }
  process.stderr.write(`unknown command ${cmd}\n`);
  return 2;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
