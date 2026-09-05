// Guard for the scale-ladder runner: tests/stress/run-corpus.mjs (ticket 117 — the seventh of eight
// instruments under tests/stress/ that had no guardian test at all).
//
// This instrument does not compute anything mathematically interesting itself (that is what the corpus
// entries are FOR); its own job is orchestration — pick which repos to run, spawn `grain` once per command
// with a hard timeout, classify how a call failed, and merge/render the results. So unlike reconstruct's or
// too-much's guards, this one is not "one real repo, one real export": it is the ladder's own pure surface
// (corpus selection, command shaping, failure classification, result merging, formatting) plus the CLI's
// usage/error paths — never a real clone, never a real `grain` invocation, and never a network call, matching
// the instrument's own contract (instruments/measure-do-not-gate: measure, don't gate CI on a live corpus).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyFailure,
  parseFlags,
  fmtMs,
  fmtCommits,
  latestResultFile,
  ladderCommands,
  pickIntentWords,
  selectEntries,
  upsertRepoInto,
  LADDER_COMMAND_LABELS,
} from './stress/run-corpus.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const RUN_CORPUS = join(here, 'stress', 'run-corpus.mjs');
const REAL_CORPUS_PATH = join(here, 'stress', 'corpus.json');

// ---------- 1. corpus.json parsing/validation — the real, committed fixture, never a fabricated stand-in ----------

const BUCKETS = new Set(['1k', '10k', '10k-100k', '100k', 'boundary']);

test('the real corpus.json parses and every entry carries the fields the ladder depends on', () => {
  const corpus = JSON.parse(readFileSync(REAL_CORPUS_PATH, 'utf8'));
  assert.ok(Array.isArray(corpus.repos) && corpus.repos.length > 0, 'corpus.repos must be a non-empty array');
  const ids = new Set();
  for (const e of corpus.repos) {
    assert.equal(typeof e.id, 'string', `entry missing string id: ${JSON.stringify(e)}`);
    assert.ok(!ids.has(e.id), `duplicate corpus id: ${e.id}`);
    ids.add(e.id);
    assert.equal(typeof e.url, 'string', `${e.id}: missing url`);
    assert.match(e.sha, /^[0-9a-f]{40}$/, `${e.id}: sha must be a full 40-char hex, got ${e.sha}`);
    assert.equal(typeof e.lang, 'string', `${e.id}: missing lang`);
    assert.ok(Array.isArray(e.axes), `${e.id}: axes must be an array (may legitimately be empty)`);
    assert.ok(e.size && typeof e.size.commits === 'number' && typeof e.size.files === 'number', `${e.id}: size.commits/files must be numbers`);
    assert.ok(BUCKETS.has(e.bucket), `${e.id}: bucket "${e.bucket}" is not one of ${[...BUCKETS].join(', ')}`);
  }
});

// ---------- 2. ladder bucketing / selection — the real corpus, filtered the way --only filters it ----------

test('selectEntries with no --only returns the whole corpus, in corpus order', () => {
  const corpus = JSON.parse(readFileSync(REAL_CORPUS_PATH, 'utf8'));
  const all = selectEntries(corpus.repos, null);
  assert.deepEqual(all, corpus.repos);
});

test('selectEntries with --only narrows to exactly the named ids, in corpus order, not the --only order', () => {
  const corpus = JSON.parse(readFileSync(REAL_CORPUS_PATH, 'utf8'));
  const someIds = [corpus.repos[3].id, corpus.repos[0].id]; // deliberately out of corpus order
  const picked = selectEntries(corpus.repos, someIds);
  assert.deepEqual(picked.map(e => e.id), [corpus.repos[0].id, corpus.repos[3].id]);
});

test('selectEntries with an --only id absent from the corpus returns nothing for it, not an error', () => {
  const corpus = JSON.parse(readFileSync(REAL_CORPUS_PATH, 'utf8'));
  const picked = selectEntries(corpus.repos, ['definitely-not-a-real-corpus-id']);
  assert.deepEqual(picked, []);
});

test('every real corpus entry gets a non-empty intent word list, named or generic fallback', () => {
  const corpus = JSON.parse(readFileSync(REAL_CORPUS_PATH, 'utf8'));
  for (const e of corpus.repos) {
    const words = pickIntentWords(e.id);
    assert.ok(Array.isArray(words) && words.length > 0, `${e.id}: pickIntentWords must never return empty`);
  }
  assert.deepEqual(pickIntentWords('not-in-the-map-at-all'), ['handler'], 'an unlisted id must fall back to the generic word, not refuse');
});

// ---------- 3. the eleven ladder command shapes ----------

test('ladderCommands emits exactly the eleven labels --table renders, in the same order', () => {
  const cmds = ladderCommands({ intentWords: ['thing'], checkFile: 'src/a.js' });
  assert.deepEqual(cmds.map(c => c.label), LADDER_COMMAND_LABELS);
});

test('check/explain/obligation are skipped (null args) with no representative file, everything else still runs', () => {
  const cmds = ladderCommands({ intentWords: ['thing'], checkFile: null });
  const byLabel = Object.fromEntries(cmds.map(c => [c.label, c.args]));
  assert.equal(byLabel.check, null);
  assert.equal(byLabel.explain, null);
  assert.equal(byLabel.obligation, null);
  for (const label of ['report', 'map', 'where', 'what', 'how', 'selftest --how', 'selftest --where', 'selftest --extract'])
    assert.ok(Array.isArray(byLabel[label]), `${label} must still run without a representative file`);
});

test('where/what/how splice the given intent words verbatim into their args', () => {
  const cmds = ladderCommands({ intentWords: ['command', 'handler'], checkFile: null });
  const byLabel = Object.fromEntries(cmds.map(c => [c.label, c.args]));
  assert.deepEqual(byLabel.where, ['where', 'command', 'handler']);
  assert.deepEqual(byLabel.what, ['what', 'command', 'handler']);
  assert.deepEqual(byLabel.how, ['how', 'command', 'handler']);
});

// ---------- 4. failure classification — the whole point of the ladder over a bare spawn ----------

test('classifyFailure tells apart clean success, harness timeout, an external signal, and a plain nonzero exit', () => {
  assert.equal(classifyFailure({ code: 0, signal: null }), null, 'clean exit must not classify as any failure');
  assert.equal(classifyFailure({ code: null, signal: 'SIGTERM' }), 'timeout', 'our own timeout kill (SIGTERM, no exit code) is "timeout"');
  assert.equal(classifyFailure({ code: null, signal: 'SIGKILL' }), 'signal:SIGKILL', 'any other signal is reported by name, not folded into timeout');
  assert.equal(classifyFailure({ code: null, signal: 'SIGSEGV' }), 'signal:SIGSEGV');
  assert.equal(classifyFailure({ code: null, signal: null, err: '', out: '' }), 'timeout', 'a null code with no signal at all is still "timeout"');
  assert.equal(classifyFailure({ code: 1, signal: null, err: '', out: '' }), 'nonzero-exit');
  assert.equal(classifyFailure({ code: 1, signal: null, err: 'unknown command: frobnicate', out: '' }), 'unknown-command');
  assert.equal(classifyFailure({ code: 1, signal: null, err: '', out: 'unknown command: frobnicate' }), 'unknown-command');
});

// ---------- 5. result aggregation — merge-by-id, the accumulation a resumed/partial ladder run depends on ----------

test('upsertRepoInto appends a new id and replaces an existing id in place, leaving other rows untouched', () => {
  const repos = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }];
  upsertRepoInto(repos, { id: 'c', v: 1 });
  assert.deepEqual(repos.map(r => r.id), ['a', 'b', 'c'], 'a new id is appended, not inserted elsewhere');
  upsertRepoInto(repos, { id: 'b', v: 2 });
  assert.deepEqual(repos, [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 1 }], 'an existing id is replaced in place; the other two rows are untouched');
});

// ---------- 6. --table's formatting helpers ----------

test('fmtMs renders ms, then seconds, then minutes as the magnitude crosses each threshold', () => {
  assert.equal(fmtMs(null), '—');
  assert.equal(fmtMs(999), '999 ms');
  assert.equal(fmtMs(1000), '1.0 s');
  assert.equal(fmtMs(59_999), '60.0 s');
  assert.equal(fmtMs(60_000), '1.0 min');
  assert.equal(fmtMs(90_000), '1.5 min');
});

test('fmtCommits renders null as an em dash and otherwise groups thousands with a thin-ish space', () => {
  assert.equal(fmtCommits(null), '—');
  assert.equal(fmtCommits(0), '0');
  assert.equal(fmtCommits(447), '447');
  assert.equal(fmtCommits(12345), '12 345');
  assert.equal(fmtCommits(1234567), '1 234 567');
});

test('latestResultFile picks the lexically-last dated result file and ignores non-matching names', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-corpus-results-'));
  try {
    assert.equal(latestResultFile(dir), null, 'an empty results dir must report no result file, not throw');
    writeFileSync(join(dir, '2026-01-01-aaa1111.json'), '{}');
    writeFileSync(join(dir, '2026-03-15-bbb2222.json'), '{}');
    writeFileSync(join(dir, 'README.md'), 'not a result file');
    writeFileSync(join(dir, 'not-a-date-shaped-name.json'), '{}');
    assert.equal(latestResultFile(dir), join(dir, '2026-03-15-bbb2222.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- 7. parseFlags — the CLI's whole argument surface ----------

test('parseFlags reads --key value pairs, bare boolean flags, and leaves a leading positional in order', () => {
  const flags = parseFlags(['--ladder', '--corpus-dir', '/tmp/x', '--timeout', '60000', 'pos1', '--checkout']);
  assert.equal(flags.ladder, true);
  assert.equal(flags['corpus-dir'], '/tmp/x');
  assert.equal(flags.timeout, '60000');
  assert.equal(flags.checkout, true, 'a trailing flag with nothing after it must be boolean, not swallow the next call');
  assert.deepEqual(flags._, ['pos1']);
});

test('parseFlags greedily takes the very next token as a flag\'s value even when that token is a positional, not a flag', () => {
  // this is the real, current behavior — not a bug this test papers over: `--checkout pos2` reads identically
  // to `--checkout somepath`, so a positional immediately after a bare flag is consumed as that flag's value
  // and never reaches `_`. Ladder callers only ever place positionals before any flags, so this never bites in
  // practice, but the guard exists so a future parseFlags rewrite cannot silently change this without a red test.
  const flags = parseFlags(['--checkout', 'pos2']);
  assert.equal(flags.checkout, 'pos2');
  assert.deepEqual(flags._, []);
});

test('parseFlags treats a flag immediately followed by another flag as boolean, not swallowing its neighbor as a value', () => {
  const flags = parseFlags(['--table', '--quiet']);
  assert.equal(flags.table, true);
  assert.equal(flags.quiet, true);
});

// ---------- 8. usage/error paths through the real CLI — no corpus dir, no clone, no network ----------

test('CLI with no mode flag prints usage naming both modes and exits 2', () => {
  const r = spawnSync('node', [RUN_CORPUS], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--ladder --corpus-dir/);
  assert.match(r.stderr, /--table/);
});

test('CLI --ladder with no --corpus-dir refuses before touching any repo, and exits 2', () => {
  const r = spawnSync('node', [RUN_CORPUS, '--ladder'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--corpus-dir/);
});

test('CLI --ladder with a --corpus-dir but no --timeout refuses (no baked-in default), and exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-corpus-corpusdir-'));
  try {
    const r = spawnSync('node', [RUN_CORPUS, '--ladder', '--corpus-dir', dir], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--timeout/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI --table against an empty results dir refuses cleanly naming the directory it looked in, and exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-corpus-empty-results-'));
  try {
    const r = spawnSync('node', [RUN_CORPUS, '--table', '--results-dir', dir], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /no results file found/);
    assert.match(r.stderr, new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- 9. --table end to end over a real (hand-written, on-disk) result file — no clone, no grain spawn ----------

test('CLI --table renders a real result file into the two markdown tables docs/validation.md is regenerated from', () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-corpus-table-'));
  try {
    const record = {
      date: '2026-01-01',
      engineSha: 'abc1234',
      engineVersion: 'grain v0.1.0',
      timeoutMs: 60000,
      corpusPath: 'plugins/grain/tests/stress/corpus.json',
      repos: [
        {
          id: 'leveldb',
          bucket: '1k',
          sizePinned: { commits: 447, files: 154 },
          shaMismatch: false,
          coldBuild: { ms: 5000, rssMb: 120, completed: true, reason: null },
          steps: [
            { label: 'report', ms: 100, completed: true },
            { label: 'map', ms: null, completed: false, reason: 'timeout' },
          ],
        },
        { id: 'gin', bucket: '10k', sizePinned: { commits: 12345, files: 900 }, skipped: true, reason: 'not present locally' },
      ],
    };
    writeFileSync(join(dir, '2026-01-01-abc1234.json'), JSON.stringify(record));
    const r = spawnSync('node', [RUN_CORPUS, '--table', '--results-dir', dir], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /leveldb/);
    assert.match(r.stdout, /447/);
    assert.match(r.stdout, /12 345/);
    assert.match(r.stdout, /\*\*DNF\*\* \(timeout\)/, 'the timed-out map step must render as a bolded DNF with its reason');
    assert.match(r.stdout, /skipped: not present locally/);
    assert.match(r.stdout, /n\/a \(cold build failed\)/, "gin's whole command row must read n/a since its cold build never completed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
