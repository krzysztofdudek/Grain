#!/usr/bin/env node
// Label readers — the labels a house makes about its own code, read as validation input for Grain's analytics.
// An instrument, not a product surface: nothing in the plugin imports it, and nothing it prints is advice.
//
// A label Grain derived itself cannot validate Grain (results.md 155 and 157: a delivery label "needs an issue
// tracker or the evidence layer, not history", and labels must be ones "the house makes itself").
//
//   loop       A Jarl issue loop (`.jarl/issues/*.md` and `.jarl/log.md`). Each issue carries **Kind:**, **Repo:**
//              and **Files:** (each file prefixed with its repository's directory name), and the log says when it
//              was filed. An issue of kind `bug` names the files a found defect was fixed in.
//
//   node tests/stress/labels.mjs loop <.jarl dir> [--repo <name>] [--kind <k>] [--json]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
    process.stderr.write('usage: labels.mjs loop <.jarl> [--repo <name>] [--kind <k>] [--json]\n');
    return 2;
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
