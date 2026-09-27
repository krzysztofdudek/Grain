#!/usr/bin/env node
// Hidden coupling — node pairs that change together more than chance, read against the declared graph and grouped
// by the channel that could carry the coupling (research B4). An instrument that REPORTS; it gates nothing, and
// nothing in the plugin imports it.
//
// `grain advise` keeps the change-together side as data, not advice (docs/reference.md, *The advice contract*),
// and results.md 153 found a file's co-change partner no more predictive than a file of the same popularity. This
// measures whether the same holds one level up, for nodes of a declared graph, once the gate is the co-change cell
// the engine already uses for file partners (`partnerBits`, facts.mjs: a KT/BIC/index-cost contrast of the pair's
// co-change against the partner's base rate, commit size included) instead of advise's mutual-confidence floor.
//
//   node tests/stress/coupling.mjs <repo-with-.yggdrasil> [--null-runs <k>] [--top <k>] [--json]
//
// Commits: every non-merge commit of at most CFG.megaCap files (the engine's own bulk-commit cap) that touches a
// file a node owns at HEAD; a commit is the set of nodes it touched. A pair is CERTIFIED when either direction
// passes the cell, with the index cost of the whole pair family (`cochangeIdxCost`, both directions paid).
//
// A certified pair nothing in the graph joins (`declaredVia` null) is sorted three ways before it is ranked, because
// a maintainer's label of the top 20 on Yggdrasil (issue 398) found the list as printed architecture-worthy 8 times
// in 20, every test pair among the 12 that were not:
//   test pairs  a test node on either side (`isTestPath` of the node id, either side): a test changing with what it
//               tests is legitimate co-change, not coupling the graph lacks. Counted apart, never ranked.
//   grab-bag    a node whose own files share no directory and mix kinds with none a majority (a repository's
//               root configuration: changelog, readme, licence, agent docs, editor settings) pairs with whatever a
//               release touches. Its pairs are ranked after every other pair, not dropped.
//   the rest    ranked by bits.
//
// Channel, for every undeclared pair:
//   test-of               one node is a test node and its name contains the other's last segment
//   parallel-description  one node's files are documentation: two surfaces describing one behaviour, which no
//                         import can join and the declared graph therefore cannot see (not a benign channel — on
//                         Yggdrasil these were the strongest real findings)
//   vocabulary            the two nodes' identifiers overlap (IDF-weighted Jaccard) more than all but 1/λ of the
//                         repository's node pairs do — λ the engine's own posterior bound (CFG.lambda)
//   none                  none of the above
//
// Three checks come with the count, so the count can be argued with:
//   null        the same certification on curveball-shuffled commits (selftest-null.mjs: every commit keeps its
//               size and every node its commit count); every pair certified there is false
//   advise      the pairs advise's own rule would name at node level (mutual confidence ≥ 1/3), for comparison
//   time split  certified on the oldest share of commits `selftest --cochange` learns from (TRAIN_SHARE), scored
//               on the rest: of the later commits touching one node of a certified pair, how many touched the other,
//               against a popularity-matched control — the node whose earlier commit count is nearest the
//               partner's (results.md 153's control); the ranked list (undeclared, no test side) is scored as its
//               own arm
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CFG } from '../../engine/config.mjs';
import { cochangeIdxCost, partnerBits } from '../../engine/facts.mjs';
import { declaredVia, readNodeGraph } from '../../engine/grain-advise.mjs';
import { curveball, rng } from '../../engine/selftest-null.mjs';
import { isTestPath } from './labels.mjs';

const TRAIN_SHARE = 0.8; // selftest-cochange.mjs's own split, restated (not exported there)
const MUTUAL_CONF_FLOOR = 1 / 3; // grain-advise.mjs's floor, restated for the comparison arm only
const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });
const DOC = /\.(md|mdx|markdown|rst|txt|adoc)$/i;

export function nodeCommits(repo, g) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (!cur || !cur.paths.length || cur.paths.length > CFG.megaCap) return;
    const nodes = [...new Set(cur.paths.map(p => g.ownerOf.get(p)).filter(Boolean))].sort();
    if (nodes.length) out.push({ sha: cur.sha, files: nodes });
  };
  for (const line of git(repo, ['log', '--no-merges', '--reverse', '--name-only', '--format=format:@@%H']).split('\n')) {
    if (line.startsWith('@@')) { flush(); cur = { sha: line.slice(2), paths: [] }; continue; }
    if (line && cur) cur.paths.push(line);
  }
  flush();
  return out;
}

// the co-change cell over node footprints; returns every certified pair with its strongest direction
export function certify(fps) {
  const commits = new Map(), others = new Map(), sup = new Map();
  let touches = 0;
  for (const fp of fps) {
    const ns = fp.files;
    touches += ns.length;
    for (const a of ns) { commits.set(a, (commits.get(a) || 0) + 1); others.set(a, (others.get(a) || 0) + ns.length - 1); }
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) { const k = ns[i] + '\x00' + ns[j]; sup.set(k, (sup.get(k) || 0) + 1); }
  }
  const N = fps.length, idx = cochangeIdxCost(sup.size);
  const pairs = [];
  for (const [key, k] of sup) {
    const [a, b] = key.split('\x00');
    const ab = partnerBits(k, commits.get(a), commits.get(b), N, idx, others.get(a), touches);
    const ba = partnerBits(k, commits.get(b), commits.get(a), N, idx, others.get(b), touches);
    const mutual = Math.min(k / commits.get(a), k / commits.get(b));
    pairs.push({ a, b, sup: k, commitsA: commits.get(a), commitsB: commits.get(b), bits: ab == null && ba == null ? null : Math.max(ab ?? 0, ba ?? 0), dir: ab != null && ba != null ? 'both' : ab != null ? 'a→b' : ba != null ? 'b→a' : null, mutual });
  }
  return { N, commits, pairs };
}

// identifiers of each node's files at HEAD, weighted by inverse node frequency
export function vocabularies(repo, g) {
  const tokens = new Map();
  for (const n of g.nodes) {
    const own = [...n.files].filter(f => g.ownerOf.get(f) === n.id);
    if (!own.length) continue;
    const set = new Set();
    for (const f of own) {
      let text = '';
      try { text = readFileSync(join(repo, f), 'utf8'); } catch { continue; }
      if (text.includes('\0')) continue;
      for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_]{3,}/g)) set.add(m[0]);
    }
    tokens.set(n.id, set);
  }
  const df = new Map();
  for (const s of tokens.values()) for (const t of s) df.set(t, (df.get(t) || 0) + 1);
  const V = tokens.size, idf = t => Math.log(V / df.get(t));
  const weight = new Map([...tokens].map(([id, s]) => [id, [...s].reduce((a, t) => a + idf(t), 0)]));
  const score = (a, b) => {
    const A = tokens.get(a), B = tokens.get(b);
    if (!A || !B) return null;
    const [small, big] = A.size < B.size ? [A, B] : [B, A];
    let inter = 0;
    for (const t of small) if (big.has(t)) inter += idf(t);
    const union = weight.get(a) + weight.get(b) - inter;
    return union > 0 ? inter / union : 0;
  };
  return { ids: [...tokens.keys()].sort(), score };
}

const lastSeg = id => id.split('/').at(-1).replace(/\.[^.]+$/, '');
export function channelOf(g, a, b, vocab, vocabBar) {
  const tA = isTestPath(a), tB = isTestPath(b);
  if (tA !== tB) {
    const [test, prod] = tA ? [a, b] : [b, a];
    const seg = lastSeg(prod).toLowerCase();
    const names = [test, ...[...(g.byId.get(test)?.files || [])].map(f => f.split('/').at(-1))].join('/').toLowerCase();
    if (seg.length > 2 && names.includes(seg)) return 'test-of';
  }
  const docShare = id => { const fs = [...(g.byId.get(id)?.files || [])]; return fs.length ? fs.filter(f => DOC.test(f)).length / fs.length : 0; };
  if (docShare(a) > 0.5 || docShare(b) > 0.5) return 'parallel-description';
  const s = vocab.score(a, b);
  if (s != null && s > vocabBar) return 'vocabulary';
  return 'none';
}

// a test node on either side of a pair
export const testSide = (a, b) => isTestPath(a) || isTestPath(b);

// a grab-bag node: its own files share no directory, and no file kind (extension, or none) holds a majority of them
export function isGrabBag(g, id) {
  const own = [...(g.byId.get(id)?.files || [])].filter(f => !g.ownerOf || g.ownerOf.get(f) === id);
  if (own.length < 2) return false;
  if (own.every(f => f.includes('/') && f.split('/')[0] === own[0].split('/')[0])) return false;
  const kinds = new Map();
  for (const f of own) {
    const base = f.split('/').at(-1), dot = base.lastIndexOf('.');
    const k = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
    kinds.set(k, (kinds.get(k) || 0) + 1);
  }
  return Math.max(...kinds.values()) * 2 <= own.length;
}

// the undeclared pairs, split and ordered: test pairs apart, grab-bag pairs after the rest, each by bits
export function rankUndeclared(g, undeclared) {
  const byBits = (x, y) => y.bits - x.bits || y.sup - x.sup;
  const tests = undeclared.filter(p => testSide(p.a, p.b)).sort(byBits);
  const rest = undeclared.filter(p => !testSide(p.a, p.b));
  for (const p of rest) p.grabBag = isGrabBag(g, p.a) || isGrabBag(g, p.b);
  const ranked = [...rest.filter(p => !p.grabBag).sort(byBits), ...rest.filter(p => p.grabBag).sort(byBits)];
  return { ranked, tests };
}

export function coupling(repo, { nullRuns = 3 } = {}) {
  const files = git(repo, ['ls-files']).split('\n').filter(Boolean);
  const g = readNodeGraph(repo, files);
  if (!g) throw new Error(`${repo} has no .yggdrasil graph`);
  const fps = nodeCommits(repo, g);
  const { N, pairs } = certify(fps);
  const certified = pairs.filter(p => p.bits != null);
  const vocab = vocabularies(repo, g);
  // the vocabulary bar: all node pairs' scores, the 1 - 1/λ quantile
  const all = [];
  for (let i = 0; i < vocab.ids.length; i++) for (let j = i + 1; j < vocab.ids.length; j++) all.push(vocab.score(vocab.ids[i], vocab.ids[j]));
  all.sort((x, y) => x - y);
  const vocabBar = all.length ? all[Math.min(all.length - 1, Math.floor((1 - 1 / CFG.lambda) * all.length))] : Infinity;
  for (const p of certified) {
    p.declaredVia = declaredVia(g, p.a, p.b);
    p.channel = p.declaredVia === null ? channelOf(g, p.a, p.b, vocab, vocabBar) : null;
    p.vocab = vocab.score(p.a, p.b);
  }
  const count = (xs, f) => xs.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const kindOf = p => (isTestPath(p.a) && isTestPath(p.b) ? 'test-test' : isTestPath(p.a) || isTestPath(p.b) ? 'code-test' : 'code-code');
  const undeclaredAll = certified.filter(p => p.declaredVia === null);
  const { ranked: undeclared, tests: testPairs } = rankUndeclared(g, undeclaredAll);
  const adviseArm = pairs.filter(p => p.sup >= CFG.cochangeMinSup && p.mutual >= MUTUAL_CONF_FLOOR);

  // the null: certified pairs on curveball-shuffled node commits
  const nullCounts = [];
  for (let s = 1; s <= nullRuns; s++) nullCounts.push(certify(curveball(fps, rng(s))).pairs.filter(p => p.bits != null).length);

  // the time split
  const cut = Math.floor(TRAIN_SHARE * fps.length);
  const train = fps.slice(0, cut), test = fps.slice(cut);
  const tr = certify(train);
  const trainCommits = tr.commits;
  const byCount = [...trainCommits].sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1));
  const control = (b, excl) => {
    const nb = trainCommits.get(b);
    let best = null;
    for (const [id, c] of byCount) if (!excl.has(id) && (!best || Math.abs(c - nb) < Math.abs(best[1] - nb))) best = [id, c];
    return best && best[0];
  };
  const testSets = test.map(fp => new Set(fp.files));
  const score = arm => {
    // pooled over every later commit, and per pair direction (a direction is one trial set, so a busy node cannot
    // carry the comparison alone): how many directions beat their control, lost to it, or tied
    let trials = 0, hits = 0, ctrl = 0, won = 0, lost = 0, tied = 0;
    for (const p of arm) for (const [x, y] of [[p.a, p.b], [p.b, p.a]]) {
      const c = control(y, new Set([x, y]));
      let h = 0, k = 0, t = 0;
      for (const s of testSets) if (s.has(x)) { t++; if (s.has(y)) h++; if (c && s.has(c)) k++; }
      trials += t; hits += h; ctrl += k;
      if (t) { if (h > k) won++; else if (h < k) lost++; else tied++; }
    }
    return { pairs: arm.length, trials, hit: trials ? +(hits / trials).toFixed(3) : null, control: trials ? +(ctrl / trials).toFixed(3) : null, directions: { won, lost, tied } };
  };
  const trCert = tr.pairs.filter(p => p.bits != null);
  const trUndeclared = trCert.filter(p => declaredVia(g, p.a, p.b) === null);
  const timeSplit = {
    train: train.length, test: test.length,
    certified: score(trCert), certifiedUndeclared: score(trUndeclared),
    ranked: score(trUndeclared.filter(p => !testSide(p.a, p.b))),
    adviseRule: score(tr.pairs.filter(p => p.sup >= CFG.cochangeMinSup && p.mutual >= MUTUAL_CONF_FLOOR)),
  };
  return {
    commits: N, nodes: g.nodes.length, pairsSeen: pairs.length, certified: certified.length,
    declaredVia: count(certified, p => String(p.declaredVia)), undeclaredByKind: count(undeclaredAll, kindOf),
    undeclaredByChannel: count(undeclared, p => p.channel), vocabBar: +vocabBar.toFixed(4),
    testPairs: { count: testPairs.length, byChannel: count(testPairs, p => p.channel) },
    grabBag: { nodes: g.nodes.map(n => n.id).filter(id => isGrabBag(g, id)).sort(), pairs: undeclared.filter(p => p.grabBag).length },
    adviseRule: { pairs: adviseArm.length, undeclared: adviseArm.filter(p => declaredVia(g, p.a, p.b) === null).length },
    nullCertified: nullCounts, timeSplit,
    undeclared, tests: testPairs,
  };
}

async function main(argv) {
  const [repo, ...rest] = argv;
  const opt = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? +rest[i + 1] : d; };
  if (!repo) { process.stderr.write('usage: coupling.mjs <repo-with-.yggdrasil> [--null-runs <k>] [--top <k>] [--json]\n'); return 2; }
  const r = coupling(repo, { nullRuns: opt('--null-runs', 3) });
  if (rest.includes('--json')) { process.stdout.write(JSON.stringify(r, null, 1) + '\n'); return 0; }
  const { undeclared, tests, ...summary } = r;
  process.stdout.write(JSON.stringify(summary, null, 1) + '\n');
  for (const p of undeclared.slice(0, opt('--top', 20)))
    process.stdout.write(`${p.bits.toFixed(1).padStart(7)} bits  ${String(p.sup).padStart(4)} of ${p.commitsA}/${p.commitsB}  ${p.channel.padEnd(20)} vocab ${p.vocab == null ? '—' : p.vocab.toFixed(3)}  ${p.a} ↔ ${p.b}${p.grabBag ? '  (grab-bag)' : ''}\n`);
  process.stdout.write(`\n${tests.length} more undeclared pairs have a test node on one side or both; --json lists them\n`);
  return 0;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
