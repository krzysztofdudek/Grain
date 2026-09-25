// Agent provenance reads `Co-authored-by:` trailers, not only the author line (issue 257). A commit authored by a
// human with an agent co-author (the usual shape of agent-assisted work: the agent typed, the human committed) is
// agent-written, so its code carries the agent provenance weight and counts in the agent-authored share. Before
// this, the history walk read `%an <%ae>` alone and a repository written almost entirely this way reported an
// agent share near zero.
//
// Unit level: `isAgentCommit` over author and trailer strings, and `LOG_FORMAT` against a real git log.
// End to end: three fixture histories built with real commits —
//   agentRepo  — every commit by a human, each with an agent co-author trailer (two spellings of the key) ⇒ 100%;
//   pairRepo   — the same code, the co-author a human ⇒ 0%;
//   plainRepo  — the same code, no trailer at all ⇒ 0%.
// Old caches: a store written before trailers were read (history `h11`, model `m28`) holds `agent: false` for
// every co-authored commit; the version bump alone must make the next run re-walk history and re-learn.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAgentCommit, LOG_FORMAT, readHistoryState, writeHistoryState } from '../engine/history.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');

test('isAgentCommit: the author alone still decides when it names an agent', () => {
  assert.equal(isAgentCommit('Claude <noreply@anthropic.com>', ''), true);
  assert.equal(isAgentCommit('dependabot[bot] <support@github.com>', undefined), true);
  assert.equal(isAgentCommit('Alice <alice@example.com>', ''), false);
  assert.equal(isAgentCommit('Alice <alice@example.com>', undefined), false);
});

test('isAgentCommit: an agent co-author makes a human-authored commit agent-written', () => {
  assert.equal(isAgentCommit('Alice <alice@example.com>', 'Claude Opus 5.5 (1M context) <noreply@anthropic.com>'), true);
  assert.equal(isAgentCommit('Alice <alice@example.com>', 'Bob <bob@example.com>\x1fCopilot <copilot@github.com>'), true);
  assert.equal(isAgentCommit('Alice <alice@example.com>', 'Bob <bob@example.com>'), false);
  assert.equal(isAgentCommit('Alice <alice@example.com>', 'Bob <bob@example.com>\x1fCarol <carol@example.com>'), false);
});

let tmp, agentRepo, pairRepo, plainRepo;
const env = (iso, name, email) => ({ GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, GIT_AUTHOR_DATE: `${iso}T12:00:00Z`, GIT_COMMITTER_DATE: `${iso}T12:00:00Z` });
const gitIn = (repo, e, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...e } });
const w = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const cls = name => `export class ${name} {\n  run() {\n    return "ok";\n  }\n}\n`;
const grain = (repo, args) => spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' });

// 12 classes, one per commit, all by Alice; `trailer(i)` is the commit body after the subject (or '' for none)
function build(name, trailer) {
  const repo = join(tmp, name);
  mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main');
  gitIn(repo, {}, 'config', 'commit.gpgsign', 'false');
  for (let i = 0; i < 12; i++) {
    const iso = '2026-01-' + String(10 + i).padStart(2, '0');
    w(repo, `src/things/T${i}.ts`, cls(`T${i}`));
    gitIn(repo, env(iso, 'Alice', 'alice@example.com'), 'add', '-A');
    const t = trailer(i);
    gitIn(repo, env(iso, 'Alice', 'alice@example.com'), 'commit', '-q', '-m', `add T${i}`, ...(t ? ['-m', t] : []));
  }
  const st = grain(repo, ['status']);
  assert.equal(st.status, 0, st.stdout + st.stderr);
  return repo;
}
const shareLine = repo => {
  const r = grain(repo, ['report']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const l = r.stdout.split('\n').find(x => x.includes('agent-authored share of code younger than'));
  assert.ok(l, `no agent-share line in:\n${r.stdout}`);
  return l;
};

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-coauthor-'));
  // two spellings of the key: git matches trailer keys case-insensitively, and so must the walk
  agentRepo = build('agent', i => (i % 2 ? 'Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>' : 'Co-authored-by: Claude <noreply@anthropic.com>'));
  pairRepo = build('pair', () => 'Co-Authored-By: Bob <bob@example.com>');
  plainRepo = build('plain', () => '');
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('LOG_FORMAT carries every Co-authored-by value on the header line, whatever the key spelling', () => {
  const out = gitIn(agentRepo, {}, 'log', '--no-merges', `--format=${LOG_FORMAT}`);
  const headers = out.split('\n').filter(l => l.startsWith('\x01'));
  assert.equal(headers.length, 12);
  for (const h of headers) {
    const p = h.slice(1).split('\x00');
    assert.equal(p[2], 'Alice <alice@example.com>');
    assert.match(p[4], /^Claude/);
    assert.equal(isAgentCommit(p[2], p[4]), true);
  }
  const plain = gitIn(plainRepo, {}, 'log', '--no-merges', `--format=${LOG_FORMAT}`).split('\n').filter(l => l.startsWith('\x01'));
  for (const h of plain) assert.equal(h.slice(1).split('\x00')[4], '');
});

test('a history co-authored by an agent reports its code as agent-authored', () => {
  assert.match(shareLine(agentRepo), /: 100%/);
});

test('a human co-author does not make code agent-authored', () => {
  assert.match(shareLine(pairRepo), /: 0%/);
});

test('a history with no trailer at all stays human', () => {
  assert.match(shareLine(plainRepo), /: 0%/);
});

// Simulate a store from before this change: every agent flag false, as an author-only walk wrote it.
async function plantHumanFlags(repo, { h, model }) {
  const hp = join(repo, '.grain', 'cache', 'history.json');
  const st = await readHistoryState(hp);
  for (const L of Object.values(st.lc)) L.agentLast = false;
  for (const evs of Object.values(st.vev)) for (const e of evs) e.agent = false;
  for (const fp of st.fps) fp.agent = false;
  if (h) st.h = h;
  await writeHistoryState(hp, st);
  const mp = join(repo, '.grain', 'cache', 'meta.json');
  const meta = JSON.parse(readFileSync(mp, 'utf8'));
  if (model) meta.model = model;
  writeFileSync(mp, JSON.stringify(meta));
}

test('negative control: planted author-only flags are what a re-learn reads when the versions match', async () => {
  const repo = build('control', () => 'Co-Authored-By: Claude <noreply@anthropic.com>');
  await plantHumanFlags(repo, {});
  rmSync(join(repo, '.grain', 'cache', 'model.json')); // force a re-learn over the planted, same-version history
  assert.match(shareLine(repo), /: 0%/);
});

test('a store from before trailers were read (h11/m28) is re-walked and re-learned on the next run', async () => {
  const repo = build('old', () => 'Co-Authored-By: Claude <noreply@anthropic.com>');
  await plantHumanFlags(repo, { h: 'h11', model: 'm28' });
  assert.match(shareLine(repo), /: 100%/);
});
