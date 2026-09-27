// grain engine · query surface · `measure` — what a stretch of work did to one part of the architecture.
//
// `grain measure --from <sha> --to <sha> [--scope <id|path,…>] [--graph <dir>] [--json]` emits `grain-measure/1`.
// It answers the question a mission report asks at its end: between the commit the work started from and the one
// it finished at, how did the territory it worked in change — its files, the imports that stay inside it, the ones
// that cross its edge, the dependencies between nodes the graph does not declare — and did the commits of the
// work cross the territory's edge more often than that territory's own commits usually do.
//
// EACH END IS THE MODEL THAT COMMIT HAD, BUILT THE WAY `refresh` BUILDS HEAD. The commit's tree is written out
// under the disposable store (so every file the resolvers read from disk — manifests, `tsconfig.json`, project
// files — is the one that commit had), its code files are read from git, and the same `learn` runs over them
// with no history (history belongs to the range, below). Files already extracted for HEAD are reused by blob, so
// a commit close to HEAD costs little. The two ends are cached by commit under `.grain/cache/measure/`.
//
// ONE SCOPE, BOTH ENDS. The scope's node ids are read from ONE graph — the repository's current `.yggdrasil/`, or
// `--graph` — and expanded against each end's own files, so a node the work added holds no files at `--from`,
// which is what happened, rather than being scored against a graph that did not exist yet. A scope entry that is a
// path selects the files under it at each end.
//
// THE RANGE IS READ FROM HISTORY. The commits reachable from `--to` and not from `--from` are looked up among the
// retained footprints; each one that touched the scope either stayed inside it or also touched files outside it.
// The control is the scope's own habit: the same share over as many of the scope's commits just before
// `--from`, so a reader sees whether the work crossed the edge more than the territory's changes usually do.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HARD_EXCL } from './config.mjs';
import { currentPathOf } from './facts.mjs';
import { resolveScope, splitList } from './cochange.mjs';

export const MEASURE_SCHEMA = 'grain-measure/1';
const SNAPSHOT_V = 1;

// ==================================================================================================
// 1. One end: the files, the resolved imports and the parsed files a commit's own model holds.
// ==================================================================================================
export async function snapshotAt({ root, sha, store, stamps, learn, headTree, readJson, log }) {
  const dir = join(store.dir, 'measure');
  const path = join(dir, `${sha}.json`);
  const cached = existsSync(path) ? readJson(path) : null;
  if (cached && cached.v === SNAPSHOT_V && JSON.stringify(cached.stamps) === JSON.stringify(stamps)) return cached;
  mkdirSync(dir, { recursive: true });
  const work = join(dir, `tree-${sha}-${process.pid}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  try {
    // the commit's tree on disk, for the files resolution reads directly; `git archive` writes tracked files only
    const tarFile = join(dir, `tree-${sha}-${process.pid}.tar`);
    try {
      execFileSync('git', ['-C', root, 'archive', '--format=tar', `--output=${tarFile}`, sha], { stdio: ['ignore', 'ignore', 'pipe'] });
      execFileSync('tar', ['-xf', tarFile, '-C', work], { stdio: ['ignore', 'ignore', 'pipe'] });
    } finally {
      rmSync(tarFile, { force: true });
    }
    const treeCache = readJson(store.treePath);
    const tree = headTree(root, { rev: sha, skip: (rel, blob) => !!(treeCache && treeCache[blob + '|' + rel]) });
    log(`measure: building the model ${sha.slice(0, 7)} had (${tree.files.length} code files)`);
    const { model } = await learn({ root: work, H: null, log, tree, treeCache });
    const snap = {
      v: SNAPSHOT_V,
      stamps,
      sha,
      files: tree.allPaths.filter(p => !HARD_EXCL.test(p)),
      edges: (model.edges || []).map(e => ({ from: e.from, to: e.to, n: e.n || 1 })),
      mined: [...new Set((model.partitions || []).flatMap(p => p.files || []))].sort(),
    };
    writeFileSync(path, JSON.stringify(snap));
    return snap;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ==================================================================================================
// 2. What one end says about the scope.
// ==================================================================================================
export function scopeMetrics(snap, scopeFiles, g, declaredVia) {
  const files = new Set(snap.files);
  const S = new Set([...scopeFiles].filter(f => files.has(f)));
  let inside = 0,
    out = 0,
    inn = 0,
    total = 0;
  const nodePairs = new Map();
  for (const e of snap.edges) {
    total += e.n;
    const a = S.has(e.from),
      b = S.has(e.to);
    if (a && b) inside += e.n;
    else if (a) out += e.n;
    else if (b) inn += e.n;
    if (!g || !(a || b)) continue;
    const na = g.ownerOf.get(e.from),
      nb = g.ownerOf.get(e.to);
    if (!na || !nb || na === nb) continue;
    const k = na + '\x00' + nb;
    nodePairs.set(k, (nodePairs.get(k) || 0) + e.n);
  }
  const mined = snap.mined.filter(f => S.has(f)).length;
  const touching = inside + out + inn;
  const res = {
    files: S.size,
    mined,
    importsInside: inside,
    importsOut: out,
    importsIn: inn,
    purity: touching ? +(inside / touching).toFixed(4) : null,
    repo: { files: snap.files.length, imports: total },
  };
  if (g) {
    const undeclared = [];
    for (const [k, n] of nodePairs) {
      const [a, b] = k.split('\x00');
      if (!declaredVia(g, a, b)) undeclared.push({ from: a, to: b, imports: n });
    }
    undeclared.sort((p, q) => q.imports - p.imports || (p.from < q.from ? -1 : p.from > q.from ? 1 : p.to < q.to ? -1 : 1));
    res.nodeDependencies = nodePairs.size;
    res.undeclaredNodeDependencies = undeclared.length;
    res.undeclared = undeclared.slice(0, 20);
  }
  return res;
}

// ==================================================================================================
// 3. The range: the commits of the work, against the scope's own habit just before it.
// ==================================================================================================
export function rangeMetrics({ fps, inRange, scopeTest }) {
  const cls = fp => {
    let s = 0,
      o = 0;
    for (const f of fp.files || []) (scopeTest(f) ? s++ : o++);
    return s ? (o ? 'crossing' : 'inside') : null;
  };
  let counted = 0,
    inside = 0,
    crossing = 0,
    firstIdx = -1;
  fps.forEach((fp, i) => {
    if (!inRange.has(fp.sha)) return;
    if (firstIdx < 0) firstIdx = i;
    counted++;
    const c = cls(fp);
    if (c === 'inside') inside++;
    else if (c === 'crossing') crossing++;
  });
  const want = inside + crossing;
  let bIn = 0,
    bX = 0;
  for (let i = (firstIdx < 0 ? fps.length : firstIdx) - 1; i >= 0 && bIn + bX < want; i--) {
    if (inRange.has(fps[i].sha)) continue;
    const c = cls(fps[i]);
    if (c === 'inside') bIn++;
    else if (c === 'crossing') bX++;
  }
  const share = (x, n) => (n ? +(x / n).toFixed(4) : null);
  return {
    commitsCounted: counted,
    scopeCommits: want,
    inside,
    crossing,
    crossingShare: share(crossing, want),
    baseline: { scopeCommits: bIn + bX, inside: bIn, crossing: bX, crossingShare: share(bX, bIn + bX) },
  };
}

// ==================================================================================================
// 4. The command.
// ==================================================================================================
const NUMERIC = ['files', 'mined', 'importsInside', 'importsOut', 'importsIn', 'nodeDependencies', 'undeclaredNodeDependencies'];
export async function cmdMeasure({ model, head, root, args, opts, stamp, store, isGit }, deps) {
  const usage = 'usage: grain measure --from <sha> --to <sha> [--scope <id|path,…>] [--graph <dir>] [--json]';
  if (args.length) throw new Error(`${usage} — takes no positional arguments`);
  if (!isGit) throw new Error('grain measure reads two commits — this directory is not a git repository');
  if (!opts.from || opts.from === true || !opts.to || opts.to === true) throw new Error(usage);
  const { readNodeGraph, declaredVia, graphRootOf, loadHistory, learn, headTree, readJson, log, stamps } = deps;
  const rev = r => {
    try {
      return execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `${r}^{commit}`], { encoding: 'utf8' }).trim();
    } catch {
      throw new Error(`no commit \`${r}\` in this repository`);
    }
  };
  const from = rev(String(opts.from)),
    to = rev(String(opts.to));
  const snaps = {};
  for (const [k, sha] of [['from', from], ['to', to]])
    snaps[k] = await snapshotAt({ root, sha, store, stamps, learn, headTree, readJson, log });
  const graphRoot = graphRootOf(root, opts);
  const entries = splitList(opts.scope);
  const sides = {};
  let scopeDesc = null;
  for (const k of ['from', 'to']) {
    const files = snaps[k].files;
    const g = readNodeGraph(graphRoot, files);
    let scopeFiles;
    if (entries.length) {
      const r = resolveScope(entries, { files, g });
      scopeDesc ||= { entries };
      scopeFiles = r.files;
      sides[k] = { unknown: r.unknown };
    } else scopeFiles = new Set(files);
    sides[k] = { ...sides[k], scopeFiles, metrics: scopeMetrics(snaps[k], scopeFiles, g, declaredVia) };
  }
  // an entry that selects nothing at EITHER end is a misspelling, not a territory that came or went
  const nowhere = entries.filter(e => sides.from.unknown?.includes(e) && sides.to.unknown?.includes(e));
  if (nowhere.length) throw new Error(`--scope: nothing matches ${nowhere.map(e => `\`${e}\``).join(', ')} at either commit`);
  const delta = {};
  for (const key of NUMERIC)
    if (typeof sides.to.metrics[key] === 'number' && typeof sides.from.metrics[key] === 'number') delta[key] = sides.to.metrics[key] - sides.from.metrics[key];
  delta.purity = sides.to.metrics.purity !== null && sides.from.metrics.purity !== null ? +(sides.to.metrics.purity - sides.from.metrics.purity).toFixed(4) : null;
  // the range
  let range = null;
  const notes = [];
  let H = null;
  if (!opts['no-history'])
    try {
      H = (await loadHistory({ gitdir: root, store, log })).H;
    } catch (e) {
      log('history unavailable for measure: ' + e.message);
    }
  const revList = execFileSync('git', ['-C', root, 'rev-list', `${from}..${to}`], { encoding: 'utf8', maxBuffer: 1 << 30 }).split('\n').filter(Boolean);
  if (H && Array.isArray(H.fps)) {
    const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
    const cur = currentPathOf(H.fps, live);
    const either = new Set([...sides.from.scopeFiles, ...sides.to.scopeFiles]);
    const toScope = sides.to.scopeFiles;
    const scopeTest = f => either.has(f) || toScope.has(cur(f));
    range = { commitsInRange: revList.length, ...rangeMetrics({ fps: H.fps, inRange: new Set(revList), scopeTest }) };
    if (range.commitsCounted < revList.length)
      notes.push(`${revList.length - range.commitsCounted} of the ${revList.length} commits in the range are not counted: merges, commits touching more than the bulk cap of files, or commits older than the retained history`);
  } else notes.push('no history: the range was not read (--no-history, a shallow clone or a partial one)');
  if (!head || (to !== head && from !== head)) notes.push(`neither end is HEAD (${(head || '').slice(0, 7)}); the scope's nodes are read from the graph as it is now`);
  const doc = {
    schema: MEASURE_SCHEMA,
    repo: '.',
    at: head || null,
    scope: scopeDesc || { entries: [] },
    graph: graphRoot === root ? '.yggdrasil' : graphRoot,
    from: { sha: from, ...sides.from.metrics },
    to: { sha: to, ...sides.to.metrics },
    delta,
    range,
    notes,
  };
  if (opts.json) return [JSON.stringify(doc, null, 1)];
  return [...measureText(doc), stamp()];
}
export function measureText(doc) {
  const f = doc.from,
    t = doc.to;
  const scope = doc.scope.entries.length ? doc.scope.entries.map(e => `\`${e}\``).join(', ') : 'the whole repository';
  const sgn = n => (n > 0 ? `+${n}` : `${n}`);
  const out = [`${scope}, from ${f.sha.slice(0, 7)} to ${t.sha.slice(0, 7)}:`];
  out.push(`  files: ${f.files} → ${t.files} (${sgn(doc.delta.files)}); the repository ${f.repo.files} → ${t.repo.files}`);
  const pur = m => (m.purity === null ? 'no import touches it' : `${Math.round(m.purity * 100)}% of the imports touching it stay inside`);
  out.push(`  imports inside ${f.importsInside} → ${t.importsInside}, out of it ${f.importsOut} → ${t.importsOut}, into it ${f.importsIn} → ${t.importsIn}: ${pur(f)} before, ${pur(t)} after`);
  if (typeof t.undeclaredNodeDependencies === 'number')
    out.push(`  dependencies between nodes the graph does not declare: ${f.undeclaredNodeDependencies} → ${t.undeclaredNodeDependencies} (of ${f.nodeDependencies} → ${t.nodeDependencies} node pairs with imports)`);
  const r = doc.range;
  if (r) {
    out.push(`  ${r.commitsInRange} commits in the range, ${r.scopeCommits} of them touched the scope: ${r.crossing} also touched files outside it (${r.crossingShare === null ? 'n/a' : Math.round(r.crossingShare * 100) + '%'})`);
    out.push(`  For scale: the scope's ${r.baseline.scopeCommits} commits just before the range crossed its edge ${r.baseline.crossingShare === null ? 'n/a' : Math.round(r.baseline.crossingShare * 100) + '%'} of the time.`);
  }
  for (const n of doc.notes) out.push(`  (${n})`);
  return out;
}
