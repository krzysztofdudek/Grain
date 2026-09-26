// Guard for the Jarl loop label reader in tests/stress/labels.mjs (research B8, issue 269). A loop issue names its
// repository in **Repo:** and prefixes each file in **Files:** with that repository's directory name; the log
// records when each issue was filed. The reader turns that into (repository, files, kind, filed-at) rows.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loopSummary, readLoopIssues } from './stress/labels.mjs';

let tmp, jarl;
const issue = (name, fields) => writeFileSync(join(jarl, 'issues', name), `# ${name.slice(0, 3)} · title of ${name}\n\n${Object.entries(fields).map(([k, v]) => `**${k}:** ${v}`).join('\n')}\n\n## What\n\n**Files:** not a header here\n`);

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'labels-loop-'));
  jarl = join(tmp, '.jarl');
  mkdirSync(join(jarl, 'issues'), { recursive: true });
  writeFileSync(join(jarl, 'log.md'), [
    '# log', '',
    '- 2026-09-16 10:53 · filed 001 · Tool: a defect',
    '- 2026-09-16 11:00 · 001 → in-progress · branch x',
    '- 2026-09-17 09:05 · filed 002 · Tool: a docs gap',
    '- 2026-09-18 09:05 · filed 001 · a second filing line never moves the first',
  ].join('\n'));
  issue('001-a-defect.md', { Status: 'done', Kind: 'bug', Files: 'tool/src/a.mjs, tool/src/b.mjs:12-30, tool/CHANGELOG.md', Repo: '../../tool' });
  issue('002-a-docs-gap.md', { Status: 'open', Kind: 'docs', Files: '', Repo: '../tool/' });
  issue('003-hub-work.md', { Status: 'open', Kind: 'process', Files: 'notes/x.md', Repo: '..', Since: '2026-09-19 08:00' });
  writeFileSync(join(jarl, 'issues', 'README.txt'), 'not an issue');
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

test('an issue becomes its repository, its files inside it, its kind and the time it was filed', () => {
  const [a, b, c] = readLoopIssues(jarl);
  assert.equal(a.id, 1);
  assert.equal(a.kind, 'bug');
  assert.equal(a.repo, 'tool');
  assert.deepEqual(a.files.map(f => f.path), ['src/a.mjs', 'src/b.mjs', 'CHANGELOG.md']); // repository prefix and line range dropped
  assert.equal(a.filedAt, '2026-09-16T10:53');
  assert.equal(b.repo, 'tool');
  assert.deepEqual(b.files, []);
  assert.equal(b.filedAt, '2026-09-17T09:05');
  // the loop's own hub is not a repository; a path without the prefix is kept as written; no log line → **Since:**
  assert.equal(c.repo, null);
  assert.deepEqual(c.files.map(f => f.path), ['notes/x.md']);
  assert.equal(c.filedAt, '2026-09-19T08:00');
});

test('the summary counts kinds, repositories and bug issues that name files', () => {
  const s = loopSummary(readLoopIssues(jarl));
  assert.equal(s.issues, 3);
  assert.deepEqual(s.byKind, { bug: 1, docs: 1, process: 1 });
  assert.deepEqual(s.bugsWithFiles, { tool: 1 });
  assert.equal(s.first, '2026-09-16T10:53');
});
