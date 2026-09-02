// §069 (research/where-lever, `.system/research/where-ranking-design.md` §4.4) — `leakSubtractedH` (core.mjs,
// right above `whereEval`) is the primitive a future `where`-side history lever MUST use before it reads `H.fps`
// to judge where a candidate file belongs: without it, the lever sees the very commit that created the candidate,
// and "predicts" the answer from the question. Measured on openzeppelin: a message-affinity lever scored `hit@3`
// 0.500 leaky vs 0.000 once its own commit was subtracted.
//
// No such lever ships in `whereCmd`/`whereEval` today (its own scorer is purely lexical/structural — audited
// directly, `model.cochange`/`model.msgAffinity`/`auto.filebirth` feed display text only, never `c.score`), so
// there is nothing in the product to regress here. This file instead builds the smallest possible history-reading
// lever — the exact "commit-message affinity" shape §4.4 measured — directly against a real `H` from `loadHistory`,
// and proves `leakSubtractedH` does what it says: fed the raw `H`, the lever is a perfect (leaked) predictor of a
// candidate's own birth directory; fed the leak-subtracted view, it correctly reports zero information once the
// one commit connecting the token to that directory is gone.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { loadHistory } from '../engine/history.mjs';
import { leakSubtractedH } from '../engine/core.mjs';

let tmp;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
const gitIn = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
function commitAll(dir, msg) { gitIn(dir, 'add', '-A'); gitIn(dir, 'commit', '-q', '-m', msg); }
function freshStore(dir) { const store = { dir: join(dir, 'cache'), historyPath: join(dir, 'cache', 'history.json') };
  mkdirSync(store.dir, { recursive: true }); return store; }

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-where-leak-')); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

// commit-message affinity, minimal and constant-free, in the exact shape §3/§4.4 of the research doc describes:
// for a query token, what share of the commits SAYING that token also touched a file in directory `dir`. Built
// by walking `H.fps` fresh (never a pre-aggregated field) — the only honest way to build one, per the doc's own
// method — so `leakSubtractedH`'s job is simply to keep the candidate's own footprint out of that walk.
function messageAffinityLever(H, queryToks, dir) {
  let commitsSayingToken = 0,
    ofThoseTouchingDir = 0;
  for (const fp of H.fps) {
    if (!fp.toks.some(t => queryToks.has(t))) continue;
    commitsSayingToken++;
    if (fp.files.some(f => dirname(f) === dir)) ofThoseTouchingDir++;
  }
  return commitsSayingToken ? ofThoseTouchingDir / commitsSayingToken : 0;
}

test('leaked: without subtraction, a candidate\'s own birth commit makes a message-affinity lever a perfect (circular) predictor of its own directory', async () => {
  const dir = join(tmp, 'leaky-repo');
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  w(dir, 'src/core/seed.js', 'export function seed() { return 1; }\n');
  commitAll(dir, 'scaffold');
  // the ONLY commit, ever, whose message says "sprocket" — and the ONLY commit that ever touches src/widgets/ —
  // is this one: the sole evidentiary link between the word and the directory is the candidate's own birth.
  w(dir, 'src/widgets/sprocket.js', 'export function sprocket() { return 1; }\n');
  commitAll(dir, 'add sprocket widget');

  const { H } = await loadHistory({ gitdir: dir, store: freshStore(join(tmp, 'leaky-store')), log: () => {} });
  const birth = H.fps.find(fp => fp.files.includes('src/widgets/sprocket.js'));
  assert.ok(birth, 'fixture sanity: the sprocket commit must have a footprint');
  const queryToks = new Set(birth.toks);
  assert.ok(queryToks.has('sprocket'), `fixture sanity: the birth commit's own message tokens must include "sprocket", got ${[...queryToks]}`);

  const leaky = messageAffinityLever(H, queryToks, 'src/widgets');
  assert.equal(leaky, 1, 'RED (pre-fix shape): scored with the candidate\'s own commit left in the history, the lever reports a perfect, circular match — it predicted the file from the commit that created it');

  const clean = messageAffinityLever(leakSubtractedH(H, birth.sha), queryToks, 'src/widgets');
  assert.equal(clean, 0, 'GREEN: once the candidate\'s own birth commit is excluded, no other commit ever connects "sprocket" to src/widgets/, so the lever correctly reports zero information');
});

test('leakSubtractedH does not touch other commits\' footprints — a real (non-circular) signal survives subtraction', async () => {
  const dir = join(tmp, 'real-signal-repo');
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  w(dir, 'src/core/seed.js', 'export function seed() { return 1; }\n');
  commitAll(dir, 'scaffold');
  // an EARLIER, independent commit already ties "gadget" to src/gadgets/ before the candidate is ever born
  w(dir, 'src/gadgets/widget.js', 'export function widget() { return 1; }\n');
  commitAll(dir, 'gadget housing prep');
  // the candidate: born in a LATER commit that also says "gadget" and also touches src/gadgets/ — this commit's
  // own contribution must be excluded, but the earlier one must not be
  w(dir, 'src/gadgets/sprocket.js', 'export function sprocket() { return 1; }\n');
  commitAll(dir, 'add gadget sprocket');

  const { H } = await loadHistory({ gitdir: dir, store: freshStore(join(tmp, 'real-store')), log: () => {} });
  const birth = H.fps.find(fp => fp.files.includes('src/gadgets/sprocket.js'));
  const queryToks = new Set(birth.toks.filter(t => t === 'gadget'));
  assert.ok(queryToks.has('gadget'), 'fixture sanity');

  const clean = messageAffinityLever(leakSubtractedH(H, birth.sha), queryToks, 'src/gadgets');
  assert.equal(clean, 1, 'the independent, earlier "gadget housing prep" commit is real evidence and must survive subtraction of the candidate\'s OWN commit — leakSubtractedH must not over-subtract');

  assert.equal(H.fps.length, 3, 'sanity: subtraction must not mutate the original H — the source fps array is unchanged');
});

test('leakSubtractedH tolerates a null/undefined H (degraded history) the same way its callers already do', () => {
  assert.equal(leakSubtractedH(null, 'deadbeef'), null);
  assert.equal(leakSubtractedH(undefined, 'deadbeef'), undefined);
});

// the raw additive counters a lever could read INSTEAD of walking `fps` (`H.msgAff`, `H.msgTokCommits`,
// `H.fileCommits`, `H.nonMegaCommits`) must be exactly decremented too, or the fps-only fix above is itself a
// footgun: a future author who reasonably assumes `leakSubtractedH` cleans the whole of `H` and reads one of
// these fields directly would still get the pre-subtraction, leaky value.
test('leakSubtractedH exactly decrements the raw msgAff/msgTokCommits/fileCommits/nonMegaCommits counters, and leaves the original H untouched', async () => {
  const dir = join(tmp, 'counters-repo');
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  w(dir, 'src/core/seed.js', 'export function seed() { return 1; }\n');
  commitAll(dir, 'scaffold');
  w(dir, 'src/widgets/sprocket.js', 'export function sprocket() { return 1; }\n');
  commitAll(dir, 'add sprocket widget');

  const { H } = await loadHistory({ gitdir: dir, store: freshStore(join(tmp, 'counters-store')), log: () => {} });
  const birth = H.fps.find(fp => fp.files.includes('src/widgets/sprocket.js'));
  const before = {
    msgAffFile: H.msgAff.sprocket['src/widgets/sprocket.js'],
    tokCommits: H.msgTokCommits.sprocket,
    fileCommits: H.fileCommits['src/widgets/sprocket.js'],
    nonMega: H.nonMegaCommits,
  };
  assert.deepEqual(before, { msgAffFile: 1, tokCommits: 1, fileCommits: 1, nonMega: 2 }, 'fixture sanity');

  const H2 = leakSubtractedH(H, birth.sha);
  assert.equal(H2.msgAff.sprocket, undefined, '"sprocket" was said by exactly one commit — subtracting it must remove the token entirely, not leave a zero');
  assert.equal(H2.msgTokCommits.sprocket, undefined, 'same for the token-commit count');
  assert.equal(H2.fileCommits['src/widgets/sprocket.js'], undefined, 'the file was touched by exactly one (non-mega) commit — subtracting it must remove the entry, not leave a zero');
  assert.equal(H2.nonMegaCommits, 1, 'the commit-population denominator drops by exactly one');

  // the ORIGINAL H, and the fp object callers may still hold a reference to, must be unchanged — leakSubtractedH
  // is read-only on its input
  assert.deepEqual(
    { msgAffFile: H.msgAff.sprocket['src/widgets/sprocket.js'], tokCommits: H.msgTokCommits.sprocket, fileCommits: H.fileCommits['src/widgets/sprocket.js'], nonMega: H.nonMegaCommits },
    before,
    'the original H must not be mutated by leakSubtractedH'
  );
});

// `H.cochange`/`H.scopeCochange` are gated by a support/confidence floor (or, on `model`, an MDL cut) applied
// BEFORE the aggregate is ever exposed — subtracting one commit's contribution cannot restore a pair the floor
// already dropped, so these two fields cannot be honestly leak-subtracted at all. Reading them from a
// leak-subtracted H must fail loudly rather than silently hand back the full-history (leaky) value.
test('leakSubtractedH strips cochange/scopeCochange rather than leaving them at their full-history (unsubtractable) value', async () => {
  const dir = join(tmp, 'cochange-strip-repo');
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  w(dir, 'src/a.js', 'export function a() { return 1; }\n');
  commitAll(dir, 'add a');
  const { H } = await loadHistory({ gitdir: dir, store: freshStore(join(tmp, 'cochange-strip-store')), log: () => {} });
  const H2 = leakSubtractedH(H, H.fps[0].sha);
  assert.equal(H2.cochange, undefined);
  assert.equal(H2.scopeCochange, undefined);
});

// birth-place prior (§3's lever C): the share of every recorded file birth that landed in directory `dir`, read
// from `H.lc`'s per-scope `newFile` flag — grouped by file, since one file can carry several scope keys.
function birthPlaceLever(H, dir) {
  const bornFiles = new Set();
  for (const [k, L] of H.lc) if (L.newFile) bornFiles.add(k.split('#')[0]);
  const inDir = [...bornFiles].filter(f => dirname(f) === dir).length;
  return bornFiles.size ? inDir / bornFiles.size : 0;
}

test('leaked vs clean: a birth-place lever built from H.lc is inflated by the candidate\'s own birth record until it is subtracted', async () => {
  const dir = join(tmp, 'birthplace-repo');
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  w(dir, 'src/core/seed.js', 'export function seed() { return 1; }\n'); // one birth, in src/core/
  commitAll(dir, 'scaffold');
  w(dir, 'src/widgets/sprocket.js', 'export function sprocket() { return 1; }\n'); // the candidate's own birth
  commitAll(dir, 'add sprocket widget');

  const { H } = await loadHistory({ gitdir: dir, store: freshStore(join(tmp, 'birthplace-store')), log: () => {} });
  const birth = H.fps.find(fp => fp.files.includes('src/widgets/sprocket.js'));

  const leaky = birthPlaceLever(H, 'src/widgets');
  assert.equal(leaky, 0.5, "RED (pre-fix shape): of the 2 births ever recorded (seed.js, sprocket.js), the candidate's OWN birth counts as 1 of the 2 supporting its own directory");

  const H2 = leakSubtractedH(H, birth.sha);
  const clean = birthPlaceLever(H2, 'src/widgets');
  assert.equal(clean, 0, 'GREEN: with the candidate\'s own birth record excluded, no OTHER file was ever born in src/widgets/, so the lever correctly reports zero information');

  // original H must still show the candidate's own scope as newFile — read-only input, same discipline as fps
  let stillNewFile = false;
  for (const [k, L] of H.lc) if (k.startsWith('src/widgets/sprocket.js#') && L.newFile) stillNewFile = true;
  assert.ok(stillNewFile, 'the original H.lc must not be mutated by leakSubtractedH');
});
