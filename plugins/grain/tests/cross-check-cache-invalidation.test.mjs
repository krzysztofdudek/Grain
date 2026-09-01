// CROSS-CHECK: does a version-gate bump actually force the rebuild it exists to force?
//
// engine/config.mjs defines three version constants the maintainer bumps by hand whenever engine changes make
// cached `.grain/cache/` data stale: EXTR_V (extraction — invalidates blobs + the tree cache), HIST_V (the
// persisted history-replay state, WITHOUT invalidating the blob cache), MODEL_V (the model schema). The maintainer
// bumped EXTR_V twice in one day trusting this mechanism, with no test ever having exercised a bump forcing a
// rebuild. This file is that test, for all three constants, symmetric: plant a detectable sentinel in the cached
// artifact each constant guards, prove the sentinel is genuinely consulted (negative control — no version touched),
// then lower the RECORDED version (the only thing tamperable from outside — bumping the live EXTR_V/HIST_V/MODEL_V
// constants themselves is out of scope for this file) and prove the sentinel is erased and the rebuilt output
// matches a never-tampered control.
//
// ON-DISK LOCATIONS (read via engine/grain.mjs + engine/history.mjs, confirmed by direct inspection below):
//   EXTR_V  → THREE independent recorded copies, each gating a different sub-cache:
//               (a) .grain/cache/meta.json field "extractor" — ensureFresh's `extractOk` folds this together with
//                   engine/grammars into ONE boolean that gates whether .grain/cache/tree.json (the
//                   blob-sha-keyed extraction cache) is loaded at all (grain.mjs `treeCache = extractOk ? ... : null`).
//               (b) .grain/cache/blobs/VERSION — a raw text file, checked ONLY in history.mjs's BlobCache
//                   constructor against the live EXTR_V import, completely independent of (a): mismatch wipes
//                   every .grain/cache/blobs/<2hex>.json shard unconditionally, on construction, before any walk mode
//                   is even decided.
//               (c) .grain/cache/history.json field "x" — loadHistory's incremental-resume gate
//                   (`state.x === EXTR_V && state.h === HIST_V && state.lastSha`); a mismatch here alone forces a
//                   full history re-walk (mode 'full') but, since it does not touch (b), the blob cache the walk
//                   reads from can still be warm — this is exactly HIST_V's OWN mechanism, exercised below.
//   HIST_V  → .grain/cache/history.json field "h", same loadHistory gate as (c) above.
//   MODEL_V → .grain/cache/meta.json field "model", checked SEPARATELY from `extractOk` (see 028 below) — folded
//             into `versionOk` (`extractOk && model === MODEL_V`), which gates only the "no work at all" fast path
//             and the STALE banner text, never the tree-cache load.
//
// TICKET 028 (RESOLVED, .temp/issues/028-modelv-bump-forces-reparse/): config.mjs's own comment for MODEL_V says a
// bump "forces a re-learn, not a re-parse". It used to not honor that boundary — `versionOk` in ensureFresh was ONE
// shared boolean built from engine+extractor+model+grammars together, so a MODEL_V-only staleness ALSO nulled out
// treeCache and forced a full re-extraction of every file, exactly like an EXTR_V staleness would. Fixed by
// splitting `extractOk` (engine+extractor+grammars — gates the tree cache) out of `versionOk` (adds the model
// check, gates only the fast path/banner): the tree cache is a pure snapshot of extraction output captured in
// core.mjs's `learn()` BEFORE any model-schema-versioned logic runs (mdlCuts/groupPartitions/mine/roles/history
// enrichment), so it can never be semantically stale with respect to MODEL_V. The blob cache (gated separately,
// only by (b)) was already correctly left untouched under a MODEL_V-only staleness; now both halves of the
// documented boundary hold.
//
// SENTINEL TECHNIQUE: rename one cached scope's recorded name to a string ("zqTAMPERED"/"zqTREETAMPERED") no real
// extractor output could ever produce, planted directly into the on-disk cache file (never through the engine's
// own write path — a real rebuild is the only thing allowed to touch these files afterward). Visibility is proven
// two ways depending on the artifact: a command's own JSON output when the sentinel round-trips there (model.json,
// history.json's commit count via `status --json`), or the cache file's raw bytes directly otherwise (tree.json,
// blob shards) — both are treated as equally valid per-invariant evidence.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// READ-ONLY import: used only to assert a healed cache file was restamped with the LIVE constant, never assigned
// to, never used to "bump" anything — the whole point of this file is testing a bump from the OUTSIDE.
import { EXTR_V, HIST_V, MODEL_V } from '../engine/config.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const refreshOk = (repo, args = ['refresh']) => { const r = grainIn(repo, args); assert.equal(r.code, 0, `grain ${args.join(' ')} failed: ${r.err}`); return r; };
const initRepo = name => { const tmp = mkdtempSync(join(tmpdir(), name)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };

const cacheDir = repo => join(repo, '.grain', 'cache');
const readJ = p => JSON.parse(readFileSync(p, 'utf8'));
const writeJ = (p, o) => writeFileSync(p, JSON.stringify(o));
const mtimeOf = p => statSync(p).mtimeMs;
const jsonShards = dir => readdirSync(dir).filter(f => f.endsWith('.json'));

// 20 handler files, 2 functions each: 40 method scopes + 20 file scopes clears groupPartitions' >= 30-scope floor
// for keeping a small package as its own partition (below that, `status` reports "no source partition" and mines
// nothing — verified empirically while building this fixture). Committed in two batches ~7 months apart so the
// first batch is comfortably past CFG.survDays (established) by the second.
const NAMES = ['Order', 'Payment', 'Shipment', 'Refund', 'Invoice', 'Cart', 'Customer', 'Product', 'Stock', 'Coupon',
  'Notification', 'Audit', 'Report', 'Ticket', 'Session', 'Voucher', 'Wallet', 'Ledger', 'Batch', 'Queue'];
const handlerSrc = n => `export function handle${n}(id) {\n  const result = { id, kind: '${n}' };\n  return result;\n}\n\nexport function validate${n}(id) {\n  const result = { id, valid: true };\n  return result;\n}\n`;
function buildFixture(repo) {
  for (const n of NAMES) wIn(repo, `src/handlers/${n}.js`, handlerSrc(n));
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repo, d1, 'add', '-A'); gitIn(repo, d1, 'commit', '-qm', 'initial handlers');
  wIn(repo, 'src/handlers/Extra.js', `export function handleExtra(id) { const result = { id, kind: 'Extra' }; return result; }\n`);
  const d2 = dateEnv('2026-08-20T12:00:00Z');
  gitIn(repo, d2, 'add', '-A'); gitIn(repo, d2, 'commit', '-qm', 'add extra handler'); }
// a commit touching a file OTHER than the one carrying a planted sentinel — moves HEAD (so ensureFresh's `fresh`
// check fails on headSha alone) without touching the sentinel-carrying file's blob sha, so "the cache was reused"
// cannot secretly mean "the file was re-read and happened to reparse to the same thing".
function trivialNewCommit(repo, tag) {
  wIn(repo, `src/handlers/Zeta${tag}.js`, `export function handleZeta${tag}(id) { const result = { id, kind: 'Zeta${tag}' }; return result; }\n`);
  const d = dateEnv('2026-08-25T12:00:00Z');
  gitIn(repo, d, 'add', '-A'); gitIn(repo, d, 'commit', '-qm', `add zeta ${tag}`); }
const invoiceKeyIn = tree => Object.keys(tree).find(k => k.endsWith('|src/handlers/Invoice.js'));

const tmps = [];
after(() => { for (const d of tmps) rmSync(d, { recursive: true, force: true }); });

// ===== EXTR_V — extraction cache: recorded in meta.json (gates tree.json) AND blobs/VERSION (gates blob shards) =====
test('EXTR_V — extraction cache: sentinel proven live, then erased once the recorded version is stale', async t => {
  const { tmp, repo } = initRepo('grain-extrv-'); tmps.push(tmp);
  buildFixture(repo);
  refreshOk(repo);

  await t.test('tree cache (meta.json "extractor"): sentinel survives a version-matched rebuild, erased once stale', () => {
    const treePath = join(cacheDir(repo), 'tree.json'), metaPath = join(cacheDir(repo), 'meta.json');
    const tree = readJ(treePath); const key = invoiceKeyIn(tree);
    assert.ok(key, 'fixture sanity: Invoice.js must be a cached tree entry');
    tree[key].s[0].name = 'zqTAMPERED'; writeJ(treePath, tree);
    assert.equal(readJ(metaPath).extractor, EXTR_V, 'fixture sanity: extractor field must read the live version before we tamper it');

    trivialNewCommit(repo, 'A'); // forces a real rebuild (HEAD moved) without touching Invoice.js's blob sha
    refreshOk(repo);
    assert.ok(readFileSync(treePath, 'utf8').includes('zqTAMPERED'),
      'NEGATIVE CONTROL: a version-matched rebuild must reuse the (corrupted) cached scope for an unchanged file — proves the tree cache is genuinely consulted, not bypassed');
    assert.equal(readJ(treePath)[key].s[0].name, 'zqTAMPERED');

    const meta = readJ(metaPath); meta.extractor = 'STALE-' + EXTR_V; writeJ(metaPath, meta); // simulate an EXTR_V bump from the outside
    refreshOk(repo);
    assert.ok(!readFileSync(treePath, 'utf8').includes('zqTAMPERED'),
      'INVALIDATION: a stale recorded extractor version must force real re-extraction, discarding the sentinel');
    assert.equal(readJ(treePath)[key].s[0].name, 'handleInvoice', 're-extraction must recover the REAL scope name, not a mutated leftover');
    assert.equal(readJ(metaPath).extractor, EXTR_V, 'grain must restamp the live extractor version'); });

  await t.test('blob cache (blobs/VERSION): sentinel survives a full walk when matched, every shard wiped once stale', () => {
    const blobsDir = join(cacheDir(repo), 'blobs'), versionFile = join(blobsDir, 'VERSION');
    assert.equal(readFileSync(versionFile, 'utf8').trim(), EXTR_V, 'fixture sanity: blobs/VERSION must read the live extractor version');
    let shardFile, sha, original;
    for (const f of jsonShards(blobsDir)) { const shard = readJ(join(blobsDir, f));
      const s = Object.keys(shard).find(k => shard[k].length); if (s) { shardFile = f; sha = s; original = JSON.parse(JSON.stringify(shard[s])); break; } }
    assert.ok(shardFile, 'fixture sanity: at least one blob shard must have a non-empty scope record to tamper');
    const shardPath = join(blobsDir, shardFile);
    const shard = readJ(shardPath); shard[sha][0].n = 'zqTAMPERED'; writeJ(shardPath, shard);

    refreshOk(repo, ['refresh', '--full']); // --full forces a walk over ALL history, so every blob sha (incl. the tampered one) is up for reparse
    assert.ok(readFileSync(shardPath, 'utf8').includes('zqTAMPERED'),
      'NEGATIVE CONTROL: a full walk with blobs/VERSION unchanged must skip reparsing an already-cached sha — proves the blob cache is genuinely consulted (has(sha)), not reparsed unconditionally');

    writeFileSync(versionFile, 'STALE-' + EXTR_V + '\n'); // simulate an EXTR_V bump from the outside
    refreshOk(repo, ['refresh', '--full']);
    const survivors = jsonShards(blobsDir).filter(f => readFileSync(join(blobsDir, f), 'utf8').includes('zqTAMPERED'));
    assert.deepEqual(survivors, [], 'INVALIDATION: a stale blobs/VERSION must force every shard wiped and every historical blob reparsed, discarding the sentinel');
    assert.deepEqual(readJ(shardPath)[sha], original, 'the reparsed record must exactly match the original (never-tampered) extraction');
    assert.equal(readFileSync(versionFile, 'utf8').trim(), EXTR_V, 'grain must restamp blobs/VERSION with the live extractor version'); });
});

// ===== HIST_V — persisted replay state (history.json field "h"): must rebuild the replay but MAY keep blobs =====
test('HIST_V — persisted history replay is version-gated separately from the blob cache', async t => {
  const { tmp, repo } = initRepo('grain-histv-'); tmps.push(tmp);
  buildFixture(repo);
  refreshOk(repo);
  const histPath = join(cacheDir(repo), 'history.json'), blobsDir = join(cacheDir(repo), 'blobs');
  const hist0 = readJ(histPath);
  assert.equal(hist0.h, HIST_V, 'fixture sanity'); assert.equal(hist0.x, EXTR_V, 'fixture sanity');
  const realCommits = hist0.commits;
  assert.ok(realCommits >= 2, 'fixture sanity: two real commits must have been walked');

  await t.test('negative control: an unchanged HEAD serves the persisted replay state (and its tamper) straight off disk', () => {
    const hist = readJ(histPath); hist.commits = 424242; writeJ(histPath, hist); // sentinel: a value the real walk could never produce
    const shardsBefore = jsonShards(blobsDir).map(f => [f, readFileSync(join(blobsDir, f), 'utf8')]);
    const histMtimeBefore = mtimeOf(histPath);

    refreshOk(repo); // HEAD has not moved: `refresh` still re-derives the model, but loadHistory resumes from the (tampered) persisted state
    const status = JSON.parse(grainIn(repo, ['status', '--json']).out);
    assert.equal(status.history.commits, 424242,
      'NEGATIVE CONTROL: the tampered commit count must be served verbatim when HEAD has not moved — proves history.json is genuinely consulted, not recomputed from git every time');
    assert.equal(mtimeOf(histPath), histMtimeBefore, 'an "unchanged" replay (mode=unchanged) must not even rewrite history.json');
    for (const [f, content] of shardsBefore) assert.equal(readFileSync(join(blobsDir, f), 'utf8'), content, `blob shard ${f} must be untouched on an unchanged-HEAD refresh`); });

  await t.test('invalidation: a stale recorded history version forces a full re-walk, but the blob cache is kept', () => {
    const hist = readJ(histPath); assert.equal(hist.commits, 424242, 'carry the previous sentinel forward — this subtest is what must erase it');
    hist.h = 'STALE-' + HIST_V; writeJ(histPath, hist); // simulate a HIST_V bump from the outside
    const shardsBefore = jsonShards(blobsDir).map(f => [f, readFileSync(join(blobsDir, f), 'utf8'), mtimeOf(join(blobsDir, f))]);

    refreshOk(repo);
    const status = JSON.parse(grainIn(repo, ['status', '--json']).out);
    assert.equal(status.history.commits, realCommits,
      'INVALIDATION: a stale recorded history version must force a full re-walk that recomputes the real commit count, discarding the sentinel');
    const healed = readJ(histPath);
    assert.equal(healed.h, HIST_V, 'grain must restamp the live history-replay version'); assert.equal(healed.x, EXTR_V, 'extractor field must be untouched/correct too');
    for (const [f, content, mt] of shardsBefore) {
      assert.equal(readFileSync(join(blobsDir, f), 'utf8'), content,
        `SCOPE: blob shard ${f} must be BYTE-IDENTICAL after an HIST_V-only staleness — the documented semantics say this invalidates the replay WITHOUT invalidating the blob cache`);
      assert.equal(mtimeOf(join(blobsDir, f)), mt, `blob shard ${f} must not even be rewritten`); } });
});

// ===== MODEL_V — model.json (meta.json field "model"): the tree cache is independently gated, and survives =====
test('MODEL_V — model.json is version-gated, but (per its own comment, since 028) the tree-extraction cache survives', async t => {
  const { tmp, repo } = initRepo('grain-modelv-'); tmps.push(tmp);
  buildFixture(repo);
  refreshOk(repo);
  const controlReport = grainIn(repo, ['report', '--json']).out; // pristine, never-tampered baseline — same headSha throughout this test
  const metaPath = join(cacheDir(repo), 'meta.json'), modelPath = join(cacheDir(repo), 'model.json'), treePath = join(cacheDir(repo), 'tree.json'), blobsDir = join(cacheDir(repo), 'blobs');
  const meta0 = readJ(metaPath);
  assert.equal(meta0.model, MODEL_V, 'fixture sanity'); assert.equal(meta0.extractor, EXTR_V, 'fixture sanity');

  await t.test('negative control: a fresh query serves model.json verbatim, tamper included', () => {
    const model = readJ(modelPath); const fact = model.partitions[0].facts[0];
    assert.ok(fact && fact.exemplars[0], 'fixture sanity: the first fact must carry at least one exemplar to tamper');
    fact.exemplars[0].name = 'zqTAMPERED'; writeJ(modelPath, model);
    const tree = readJ(treePath); const key = invoiceKeyIn(tree);
    tree[key].s[0].name = 'zqTREETAMPERED'; writeJ(treePath, tree); // a SEPARATE sentinel: proves nothing at all was rebuilt, not just that model.json specifically was served as-is

    // a plain query, deliberately NOT `refresh` (which always forces a relearn regardless of freshness)
    const out = grainIn(repo, ['report', '--json']).out;
    assert.ok(out.includes('zqTAMPERED'), 'NEGATIVE CONTROL: a model-version-matched query must serve the tampered model.json verbatim — proves it is trusted, not re-derived, when "fresh"');
    assert.ok(readFileSync(treePath, 'utf8').includes('zqTREETAMPERED'), 'the tree cache must be untouched too — a matched-version plain query rebuilds nothing at all'); });

  // TICKET 028 (.temp/issues/028-modelv-bump-forces-reparse/), RESOLVED via resolution (a): ensureFresh now gates
  // the tree cache with `extractOk` (engine+extractor+grammars only), separately from `versionOk` (which adds the
  // model check and gates only the fast path/banner) — a MODEL_V-only staleness forces a real relearn but reuses a
  // version-current tree cache, matching config.mjs's MODEL_V comment as written.
  await t.test('invalidation: a stale recorded model version forces a relearn, while the tree cache (and blobs) survive', () => {
    const meta = readJ(metaPath); meta.model = 'STALE-' + MODEL_V; writeJ(metaPath, meta); // simulate a MODEL_V bump from the outside — extractor left untouched
    const shardsBefore = jsonShards(blobsDir).map(f => [f, readFileSync(join(blobsDir, f), 'utf8'), mtimeOf(join(blobsDir, f))]);

    const out = grainIn(repo, ['report', '--json']).out; // still a plain query — auto-refresh must trigger on its own because the cache is stale
    assert.ok(!out.includes('zqTAMPERED'), 'INVALIDATION: a stale recorded model version must force a real relearn, discarding the model.json sentinel');
    assert.ok(readFileSync(treePath, 'utf8').includes('zqTREETAMPERED'),
      '028 FIX: config.mjs\'s own MODEL_V comment promises this "forces a re-learn, not a re-parse" — ensureFresh now gates the tree cache with `extractOk` (engine+extractor+grammars), independent of `versionOk`\'s model check, so a model-only staleness relearns without touching a version-current tree cache. This is the direct, reproducible proof.');
    const healedMeta = readJ(metaPath);
    assert.equal(healedMeta.model, MODEL_V, 'grain must restamp the live model version');
    assert.equal(healedMeta.extractor, EXTR_V, 'extractor field must remain correct even though only "model" was tampered');
    const stripAsOf = s => s.replace(/"asOf":"[^"]*"/, '');
    assert.equal(stripAsOf(out), stripAsOf(controlReport), 'the healed output must exactly match a never-tampered control build of the same fixture at the same headSha');
    for (const [f, content, mt] of shardsBefore) {
      assert.equal(readFileSync(join(blobsDir, f), 'utf8'), content,
        `SCOPE: blob shard ${f} must stay byte-identical — a MODEL_V-only staleness must not force blob reparsing (the one half of its documented boundary the code DOES honor)`);
      assert.equal(mtimeOf(join(blobsDir, f)), mt, `blob shard ${f} must not even be rewritten`); } });
});
