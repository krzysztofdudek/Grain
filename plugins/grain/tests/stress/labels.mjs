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
//
//   loop       A Jarl issue loop (`.jarl/issues/*.md` and `.jarl/log.md`). Each issue carries **Kind:**, **Repo:**
//              and **Files:** (each file prefixed with its repository's directory name), and the log says when it
//              was filed. An issue of kind `bug` names the files a found defect was fixed in.
//
//   node tests/stress/labels.mjs verdicts <repo-with-.yggdrasil> [--git] [--json]
//   node tests/stress/labels.mjs loop <.jarl dir> [--repo <name>] [--kind <k>] [--json]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
async function main(argv) {
  const [cmd, target, ...rest] = argv;
  const flag = n => rest.includes(n);
  const opt = n => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : null; };
  if (!cmd || !target) {
    process.stderr.write('usage: labels.mjs verdicts <repo> [--git] [--json] | loop <.jarl> [--repo <name>] [--kind <k>] [--json]\n');
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
  process.stderr.write(`unknown command ${cmd}\n`);
  return 2;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
