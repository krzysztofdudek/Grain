// INVARIANT under audit (ticket .temp/issues/020-where-leaks-deleted-files/issue.md, OPEN): no grain surface may
// name a repo-relative PATH that is absent from HEAD without marking it as such — OR omit it outright. The house
// shape for that already exists in three independent places — `model.waivers`/`model.steers` render "not found in
// HEAD — inert", `model.boundaries` renders "a side names no indexed files — inert", and (since §066, superseding
// the `(deleted)` label ticket 020 originally put here) `how`'s places[] OMITS a dead path entirely rather than
// marking it — measured on a real corpus, marking still put 13 of 28 CleanArchitecture places on files gone from
// HEAD, which still reads as "somewhere to edit" to an agent skimming the list. Ticket 020 shows `where`'s
// "historically co-changes with:" co-change line naming a long-deleted file with NO marker at all — same
// underlying fact (`cochangePartners`, core.mjs ~2543) as `how`'s own liveness check (core.mjs's `live` set inside
// `howCmd`), just a different renderer that never reused it. The ticket's own "wider check" section asks for
// exactly this: an audit of every OTHER surface that can name a historical path — `missingLines`'s
// cochange/recipe/kin lines, `completeness`, `model.moves`' rename targets, `report`, `rules`, `map`, `what`'s
// places — either marked consistently, omitted, or reported as already correct.
//
// This file IS that audit, made permanent and property-style: one fixture with a doomed file that co-changes
// heavily with a live file before being deleted, then every read command run over it once, with a single generic
// check applied uniformly — any output line naming the dead file's REPO-RELATIVE PATH (`lib/zqdeadrouter.js`, not
// just its bare stem, so a `what zqdeadrouter` query's own echoed search term can never masquerade as a path
// mention) must also carry one of the house's own deadness markers (`(deleted)`, `found: false`, `inert`) or the
// path must not appear on that surface at all — omission is compliant per the ticket's own acceptance text
// ("marks it OR omits it — decide which and document why").
//
// A RED result here is INFORMATION, not a bug in this test: ticket 020 is OPEN, so `where`'s sweep entry is
// EXPECTED to fail today (a regression guard for whenever it's fixed), and any OTHER surface that goes red is a
// newly-discovered instance of the same class of leak, to be reported — never silently weakened into passing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG } from '../engine/config.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const initRepo = name => { const tmp = mkdtempSync(join(tmpdir(), name)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };
const modelPathOf = repo => join(repo, '.grain', 'cache', 'model.json');
const loadModel = repo => JSON.parse(readFileSync(modelPathOf(repo), 'utf8'));

// every file name in this fixture carries the `zq` token so a grep of the model/output for it is unambiguous.
// `zqalpha.js` is the live hub: it co-changes ONLY with the doomed `zqdeadrouter.js` (never with `zqbeta`/`zqpad`),
// so its file-card co-change line in `where` names exactly one partner — the dead one — with no live partner in
// the same line to confuse the assertion. `zqbeta.js` is renamed (cross-directory, so `model.moves` records it)
// and never touched again. `zqpad.js` exists purely to advance history past the deletion ("several commits before
// HEAD") without touching either half of the co-changing pair, so it cannot dilute either file's own commit count.
const zqAlpha = i => `export function zqAlphaHandler(x) {\n  return x + ${i};\n}\n`;
const zqDead = i => `export function zqDeadHandler(x) {\n  return x - ${i};\n}\n`;
const zqBeta = () => `export function zqBetaHandler(x) {\n  return x * 2;\n}\n`;

const DEAD_PATH = 'lib/zqdeadrouter.js';           // the exact repo-relative path every surface either names or omits
const LIVE_PATH = 'lib/zqalpha.js';
const HOW_QUERY = 'fix parsing of routes';         // shared by the 9 co-change commit messages below
const DEADNESS_MARKERS = [/\(deleted\)/, /found:\s*false/, /\binert\b/];
const isMarked = line => DEADNESS_MARKERS.some(re => re.test(line));
// the one check the whole sweep is built on: every line naming DEAD_PATH must also carry a house deadness marker.
// A command with zero matching lines passes trivially — that surface OMITS the path, which the ticket itself
// allows ("marks it OR omits it"); this function reports both counts so the caller (and our final report) can
// tell "correctly silent" apart from "correctly marked" apart from "leaks it".
function auditDeadMentions(out) {
  const lines = out.split('\n');
  const hits = lines.filter(l => l.includes(DEAD_PATH));
  const unmarked = hits.filter(l => !isMarked(l));
  return { hits, unmarked };
}

const WHERE_ALPHA_KEY = 'where "zqalpha" (file-card co-change line)';
const WHERE_PHRASE_KEY = 'where "fix parsing of routes" (no lexical hit — bridge/map fallback)';
const HOW_KEY = 'how "fix parsing of routes" (places[])';
const WHAT_STEM_KEY = 'what "zqdeadrouter" (bare stem query)';
const WHAT_SYMBOL_KEY = 'what "zqDeadHandler" (symbol once defined only in the dead file)';
const REPORT_KEY = 'report';
const RULES_KEY = 'rules';
const MAP_KEY = 'map';
const STATUS_KEY = 'status';
const CHECK_KEY = `check ${LIVE_PATH} (missingLines cochange + scopeCochangeLines)`;
const COMPLETENESS_KEY = `completeness ${LIVE_PATH} (completenessDirectional/cochangeData)`;

const CMDS = [
  { key: WHERE_ALPHA_KEY, args: ['where', 'zqalpha', '--top', '5'] },
  { key: WHERE_PHRASE_KEY, args: ['where', HOW_QUERY, '--top', '5'] },
  { key: HOW_KEY, args: ['how', HOW_QUERY] },
  { key: WHAT_STEM_KEY, args: ['what', 'zqdeadrouter'] },
  { key: WHAT_SYMBOL_KEY, args: ['what', 'zqDeadHandler'] },
  { key: REPORT_KEY, args: ['report'] },
  { key: RULES_KEY, args: ['rules'] },
  { key: MAP_KEY, args: ['map'] },
  { key: STATUS_KEY, args: ['status'] },
  { key: CHECK_KEY, args: ['check', LIVE_PATH] },
  { key: COMPLETENESS_KEY, args: ['completeness', LIVE_PATH] },
];

let tmp, repo, outputs;
before(() => {
  ({ tmp, repo } = initRepo('grain-crosscheck-liveness-'));
  const day = n => `2026-01-${String(n).padStart(2, '0')}T12:00:00Z`;
  const commit = (n, msg) => { const env = dateEnv(day(n)); gitIn(repo, env, 'add', '-A'); gitIn(repo, env, 'commit', '-qm', msg); };

  // C1: scaffold all three original files together, plus FILLER — `groupPartitions` (core.mjs ~1390) merges every
  // package under 100 scopes into one bucket and only turns that bucket into an actual `model.partitions` entry
  // once it holds >= 30 scopes (file-kind pseudo-scopes counted); measured directly on this fixture's own natural
  // `grain status` run WITHOUT the filler below: 3 files -> 7 scopes -> 0 partitions -> `buildCards` empty ->
  // `where` can never hit a file card at all. 15 filler files (1 function scope + 1 file scope each = 30) push the
  // repo-wide scope count safely past that floor; they are added once here and never touched again, so they can
  // never enter the zqalpha/zqdeadrouter co-change pair or dilute either side's own commit count.
  wIn(repo, 'lib/zqalpha.js', zqAlpha(0));
  wIn(repo, 'lib/zqdeadrouter.js', zqDead(0));
  wIn(repo, 'lib/zqbeta.js', zqBeta());
  for (let i = 0; i < 15; i++) wIn(repo, `lib/zqfiller${i}.js`, `export function zqFiller${i}Handler(x) {\n  return x + ${i};\n}\n`);
  commit(1, 'scaffold zqalpha zqdeadrouter zqbeta and filler files');

  // C2..C10: 9 commits editing zqalpha.js and zqdeadrouter.js TOGETHER, every one carrying HOW_QUERY's own words —
  // pairSup(zqalpha,zqdeadrouter) reaches 1(C1)+9=10, comfortably above CFG.cochangeMinSup(8); fileCommits for
  // BOTH sides stays at exactly 10 at this point, so every directional confidence ratio computed off either side
  // is 10/10 = 1.0 — clears CFG.cochangeMinConf(0.75) AND the looser 1/3 single-file threshold with room to spare.
  for (let i = 1; i <= 9; i++) {
    wIn(repo, 'lib/zqalpha.js', zqAlpha(i));
    wIn(repo, 'lib/zqdeadrouter.js', zqDead(i));
    commit(1 + i, `fix parsing of routes ${i} in zqdeadrouter`);
  }

  // C11: a cross-directory rename of the UNRELATED zqbeta.js — gives model.moves a real entry without touching
  // either half of the zqalpha/zqdeadrouter co-change pair. `git mv` (this git version) does not create the
  // destination directory itself — it must already exist.
  mkdirSync(join(repo, 'lib', 'moved'), { recursive: true });
  gitIn(repo, dateEnv(day(11)), 'mv', 'lib/zqbeta.js', 'lib/moved/zqbetamoved.js');
  commit(11, 'move zqbeta into moved directory');

  // C12: zqdeadrouter.js is deleted. fileCommits[zqdeadrouter] becomes 11 (the delete commit itself touches it),
  // which is why every directional ratio is computed/asserted from zqalpha's OWN side below (10/10), not the
  // dead file's (10/11) — the sweep only ever changes zqalpha.js, never the dead path.
  gitIn(repo, dateEnv(day(12)), 'rm', '-q', 'lib/zqdeadrouter.js');
  commit(12, 'remove dead router zqdeadrouter no longer needed');

  // C13..C15: "several commits before HEAD" after the deletion (ticket 020's own fixture shape: "deleted 15
  // versions ago"), touching only the unrelated zqpad.js so neither zqalpha's nor zqdeadrouter's commit counts
  // computed above are disturbed.
  wIn(repo, 'lib/zqpad.js', 'export const zqPad = 1;\n'); commit(13, 'add zqpad helper');
  wIn(repo, 'lib/zqpad.js', 'export const zqPad = 2;\n'); commit(14, 'tweak zqpad helper');
  wIn(repo, 'lib/zqpad.js', 'export const zqPad = 3;\n'); commit(15, 'polish zqpad helper');

  const st = grainIn(repo, ['status']);
  assert.equal(st.code, 0, `fixture setup: grain status must build the model — stderr:\n${st.err}\nstdout:\n${st.out}`);

  outputs = {};
  for (const c of CMDS) outputs[c.key] = grainIn(repo, c.args);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

// ===== PRECONDITIONS — prove the fixture actually produces the situation the sweep needs, before trusting any
// red/green result from it. Each of these fails ONLY on a fixture defect, never on a grain behavior question. =====

test('PRECONDITION: fixture ground truth — the doomed file is absent from HEAD, the live files are present', () => {
  const tracked = gitIn(repo, {}, 'ls-files').split('\n').filter(Boolean);
  assert.ok(!tracked.includes(DEAD_PATH), `fixture bug: ${DEAD_PATH} must not be tracked at HEAD: ${tracked.join(', ')}`);
  for (const f of [LIVE_PATH, 'lib/moved/zqbetamoved.js', 'lib/zqpad.js']) assert.ok(tracked.includes(f), `fixture bug: expected ${f} at HEAD: ${tracked.join(', ')}`);
});

test('PRECONDITION: model.cochange certifies the (zqalpha,zqdeadrouter) pair above every threshold this audit relies on', () => {
  const model = loadModel(repo);
  const pair = model.cochange.find(p => (p.a === LIVE_PATH && p.b === DEAD_PATH) || (p.a === DEAD_PATH && p.b === LIVE_PATH));
  assert.ok(pair, `expected a cochange pair between ${LIVE_PATH} and ${DEAD_PATH} in model.cochange: ${JSON.stringify(model.cochange)}`);
  assert.ok(pair.sup >= CFG.cochangeMinSup, `sup ${pair.sup} must clear CFG.cochangeMinSup ${CFG.cochangeMinSup}: ${JSON.stringify(pair)}`);
  const commitsAlpha = pair.a === LIVE_PATH ? pair.commitsA : pair.commitsB;
  const confFromAlpha = pair.sup / commitsAlpha;
  assert.ok(confFromAlpha >= CFG.cochangeMinConf, `direction-from-${LIVE_PATH} confidence ${confFromAlpha} must clear CFG.cochangeMinConf ${CFG.cochangeMinConf} — this is what gates check/completeness's cochange line: ${JSON.stringify(pair)}`);
  assert.ok(confFromAlpha >= 1 / 3, `must also clear the looser 1/3 threshold whereCmd's single-file cochangePartners uses: ${JSON.stringify(pair)}`);
});

test('PRECONDITION: model.moves carries an entry for the lib/ -> lib/moved/ rename (data-shape check — see final report for why its one consumer is not exercised live)', () => {
  const model = loadModel(repo);
  const moves = model.moves || {};
  const hit = Object.entries(moves).some(([k, pairs]) => k.startsWith('js#') && Object.keys(pairs).some(p => p === 'lib→lib/moved'));
  assert.ok(hit, `expected a model.moves entry recording the lib -> lib/moved rename: ${JSON.stringify(moves)}`);
});

test('PRECONDITION / REGRESSION GUARD (§066, superseding ticket 020\'s original fix): `how` OMITS the dead place entirely and still reports the live one, exists:true', () => {
  const j = JSON.parse(grainIn(repo, ['how', HOW_QUERY, '--json']).out);
  const byRel = Object.fromEntries(j.places.map(p => [p.rel, p]));
  const live = byRel[LIVE_PATH];
  assert.ok(!byRel[DEAD_PATH], `the dead file must not appear in --json places at all (omitted, not marked): ${JSON.stringify(j.places)}`);
  assert.ok(live, `expected a --json place entry for the live file: ${JSON.stringify(j.places)}`);
  assert.equal(live.exists, true, `the live file's place must read exists:true: ${JSON.stringify(live)}`);

  const lines = outputs[HOW_KEY].out.split('\n');
  const deadLine = lines.find(l => l.trim().startsWith(DEAD_PATH + ' '));
  const liveLine = lines.find(l => l.trim().startsWith(LIVE_PATH + ' '));
  assert.ok(!deadLine, `expected no text places line for the dead file (omitted): ${outputs[HOW_KEY].out}`);
  assert.ok(liveLine, `expected a text places line for the live file: ${outputs[HOW_KEY].out}`);
  assert.doesNotMatch(liveLine, /\(deleted\)/, `the live file must not be marked deleted: ${liveLine}`);
});

test('PRECONDITION: at least one OTHER surface mentions the dead path — the sweep is non-vacuous (ticket 020\'s own reproduction)', () => {
  const out = outputs[WHERE_ALPHA_KEY].out;
  assert.ok(out.includes(DEAD_PATH), `expected \`grain where zqalpha\`'s co-change line to name ${DEAD_PATH} (ticket 020) — without this the whole sweep would prove nothing: ${out}`);
  console.log(`[ticket 020 repro] ${WHERE_ALPHA_KEY} → ${out.split('\n').find(l => l.includes(DEAD_PATH))}`);
});

// ===== THE SWEEP — every read surface, one test each, same generic check. A surface that never mentions
// DEAD_PATH passes trivially (compliant by omission); one that mentions it must mark it; one that mentions it
// without marking it is a genuine finding (ticket 020's own `where` case, or a new one). =====
for (const c of CMDS) {
  test(`SWEEP: ${c.key} — every mention of the deleted file is marked, or the file is not named at all`, () => {
    const r = outputs[c.key];
    assert.equal(r.code, 0, `\`grain ${c.args.join(' ')}\` must exit 0 — stderr:\n${r.err}\nstdout:\n${r.out}`);
    const { hits, unmarked } = auditDeadMentions(r.out);
    console.log(`[audit] ${c.key}: ${hits.length} mention(s) of ${DEAD_PATH}, ${unmarked.length} unmarked`);
    assert.equal(unmarked.length, 0,
      `${c.key} names ${DEAD_PATH} with no deadness marker ((deleted)/found: false/inert) on ${unmarked.length} line(s):\n${unmarked.join('\n')}\n\nfull output:\n${r.out}`);
  });
}
