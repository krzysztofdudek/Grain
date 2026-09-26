#!/usr/bin/env node
// Architecture trajectory — the declared graph's own git history, read commit by commit (research B6).
// An instrument, not a product surface: nothing in the plugin imports it.
//
// A repository under Yggdrasil commits its architecture: `.yggdrasil/model/**/yg-node.yaml` (`node.yaml` in older
// graphs) at every commit is the graph as it was declared then. Reading those files at past commits costs one
// `git ls-tree` and one `git cat-file --batch` per commit, and no source is parsed again. From Yggdrasil 6.1.0 on,
// a green `yg check` means every node-level code dependency is declared, so from then on the declared series is
// also the code's dependency series; before it, a jump can be enforcement catching up rather than the code moving,
// and only a maintainer can say which.
//
//   node tests/stress/trajectory.mjs <repo-with-.yggdrasil> [--every <k>] [--top <k>] [--json]
//
// Every first-parent commit that touched the model is read (`--every k` keeps every k-th, plus the last). Per
// commit: nodes, declared relations between nodes that exist, relations per node, strongly connected components
// with more than one node, the longest chain through the condensation, fan-in Gini and the top-5 fan-in share,
// and the relations that are new since the previous commit read and point UP against that commit's layers (the
// layer of a node is the longest chain below it, so a new relation from a node to one at a higher layer lengthens a
// chain — research B6 proposed it as the measurable form of erosion; on an acyclic graph every such relation is
// still legal, so it is a reading, not a verdict). `--top k` (default 5) lists the commits with the largest change
// in relations and the most upward relations: the turning points a maintainer
// checks against the CHANGELOG.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseYaml } from '../../engine/yggdrasil-graph.mjs';

const git = (repo, args, input) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 30, input, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'ignore'] });
const NODE_FILE = /^\.yggdrasil\/model\/(.+)\/(yg-node|node)\.yaml$/;

// the declared graph at one commit: node ids (the directory under model/) and their relation targets
export function graphAt(repo, sha) {
  const entries = git(repo, ['ls-tree', '-r', sha, '--', '.yggdrasil/model']).split('\n').flatMap(l => {
    const m = /^\S+ blob (\S+)\t(.*)$/.exec(l);
    const n = m && NODE_FILE.exec(m[2]);
    return n ? [{ blob: m[1], id: n[1], modern: n[2] === 'yg-node' }] : [];
  });
  // one file per node directory; a directory holding both spellings reads the current one
  const byId = new Map();
  for (const e of entries) if (!byId.has(e.id) || e.modern) byId.set(e.id, e);
  const list = [...byId.values()];
  if (!list.length) return { nodes: [], rel: new Map() };
  const out = execFileSync('git', ['-C', repo, 'cat-file', '--batch'], { input: list.map(e => e.blob).join('\n') + '\n', maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'ignore'] });
  const texts = new Map();
  let p = 0;
  while (p < out.length) { // `<sha> blob <bytes>\n<content>\n`, sizes in bytes, so the buffer is walked in bytes
    const nl = out.indexOf(10, p);
    const [sha, , size] = out.subarray(p, nl).toString('utf8').split(' ');
    texts.set(sha, out.subarray(nl + 1, nl + 1 + +size).toString('utf8'));
    p = nl + 1 + +size + 1;
  }
  const ids = new Set(list.map(e => e.id));
  const rel = new Map();
  for (const e of list) {
    let doc = null;
    try { doc = parseYaml(texts.get(e.blob) || ''); } catch { doc = null; }
    const targets = Array.isArray(doc?.relations) ? doc.relations.map(r => (r && typeof r.target === 'string' ? r.target : null)).filter(t => t && t !== e.id && ids.has(t)) : [];
    rel.set(e.id, [...new Set(targets)]);
  }
  return { nodes: [...ids].sort(), rel };
}

// Tarjan's strongly connected components, iterative
export function sccs(nodes, rel) {
  let index = 0;
  const idx = new Map(), low = new Map(), on = new Set(), stack = [], comps = [];
  for (const root of nodes) {
    if (idx.has(root)) continue;
    const work = [[root, 0]];
    idx.set(root, index); low.set(root, index); index++; stack.push(root); on.add(root);
    while (work.length) {
      const top = work.at(-1);
      const [v, i] = top;
      const out = rel.get(v) || [];
      if (i < out.length) {
        top[1]++;
        const w = out[i];
        if (!idx.has(w)) { idx.set(w, index); low.set(w, index); index++; stack.push(w); on.add(w); work.push([w, 0]); }
        else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
        continue;
      }
      work.pop();
      if (work.length) { const u = work.at(-1)[0]; low.set(u, Math.min(low.get(u), low.get(v))); }
      if (low.get(v) === idx.get(v)) {
        const c = [];
        let w;
        do { w = stack.pop(); on.delete(w); c.push(w); } while (w !== v);
        comps.push(c);
      }
    }
  }
  return comps;
}

// layer of every node: the longest chain below it on the condensation (a sink is layer 0; a cycle shares a layer)
export function layers(nodes, rel) {
  const comps = sccs(nodes, rel);
  const compOf = new Map();
  comps.forEach((c, i) => c.forEach(n => compOf.set(n, i)));
  // Tarjan emits components in reverse topological order: every component's successors come before it
  const layer = comps.map(() => 0);
  comps.forEach((c, i) => {
    for (const n of c) for (const t of rel.get(n) || []) { const j = compOf.get(t); if (j !== i) layer[i] = Math.max(layer[i], layer[j] + 1); }
  });
  return { comps, layerOf: new Map(nodes.map(n => [n, layer[compOf.get(n)]])), depth: comps.length ? Math.max(...layer) : 0 };
}

export function gini(xs) {
  const s = [...xs].sort((a, b) => a - b), n = s.length, sum = s.reduce((a, b) => a + b, 0);
  if (!n || !sum) return 0;
  return s.reduce((a, v, i) => a + (2 * (i + 1) - n - 1) * v, 0) / (n * sum);
}

export function metrics(g, prev) {
  const { comps, layerOf, depth } = layers(g.nodes, g.rel);
  const edges = [...g.rel.values()].reduce((a, t) => a + t.length, 0);
  const fanIn = new Map(g.nodes.map(n => [n, 0]));
  for (const ts of g.rel.values()) for (const t of ts) fanIn.set(t, fanIn.get(t) + 1);
  const fi = [...fanIn.values()].sort((a, b) => b - a);
  const upward = [];
  let added = 0;
  if (prev) {
    for (const [from, ts] of g.rel)
      for (const to of ts) {
        if ((prev.g.rel.get(from) || []).includes(to)) continue;
        added++;
        if (prev.layerOf.has(from) && prev.layerOf.has(to) && prev.layerOf.get(from) < prev.layerOf.get(to))
          upward.push({ from, to, fromLayer: prev.layerOf.get(from), toLayer: prev.layerOf.get(to) });
      }
  }
  return {
    nodes: g.nodes.length, edges, perNode: g.nodes.length ? +(edges / g.nodes.length).toFixed(2) : 0,
    cycles: comps.filter(c => c.length > 1).length, inCycles: comps.filter(c => c.length > 1).reduce((a, c) => a + c.length, 0),
    depth, fanInGini: +gini(fi).toFixed(3), top5FanIn: edges ? +(fi.slice(0, 5).reduce((a, b) => a + b, 0) / edges).toFixed(3) : 0,
    added, upward, layerOf,
  };
}

export function trajectory(repo, { every = 1 } = {}) {
  const shas = git(repo, ['log', '--first-parent', '--reverse', '--format=format:%H %cI', 'HEAD', '--', '.yggdrasil/model']).split('\n').filter(Boolean).map(l => l.split(' '));
  const keep = shas.filter((_, i) => i % every === 0 || i === shas.length - 1);
  const rows = [];
  let prev = null;
  for (const [sha, date] of keep) {
    const g = graphAt(repo, sha);
    const m = metrics(g, prev);
    rows.push({ sha, date, ...m, layerOf: undefined, upward: m.upward, dEdges: prev ? m.edges - prev.edges : 0 });
    prev = { g, layerOf: m.layerOf, edges: m.edges };
  }
  return rows;
}

async function main(argv) {
  const [repo, ...rest] = argv;
  const opt = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? +rest[i + 1] : d; };
  if (!repo) { process.stderr.write('usage: trajectory.mjs <repo-with-.yggdrasil> [--every <k>] [--top <k>] [--json]\n'); return 2; }
  const rows = trajectory(repo, { every: opt('--every', 1) });
  if (rest.includes('--json')) { process.stdout.write(JSON.stringify(rows, null, 1) + '\n'); return 0; }
  const line = r => `${r.date.slice(0, 10)} ${r.sha.slice(0, 9)}  nodes ${r.nodes} · relations ${r.edges} (${r.dEdges >= 0 ? '+' : ''}${r.dEdges}) · per node ${r.perNode} · depth ${r.depth} · cycles ${r.cycles} (${r.inCycles} nodes) · fan-in Gini ${r.fanInGini} · top-5 share ${r.top5FanIn} · new ${r.added}, upward ${r.upward.length}`;
  const n = rows.length, step = Math.max(1, Math.floor(n / 10));
  process.stdout.write(`${n} commits read\n\nevenly spaced:\n`);
  for (let i = 0; i < n; i += step) process.stdout.write(line(rows[i]) + '\n');
  if ((n - 1) % step) process.stdout.write(line(rows[n - 1]) + '\n');
  const top = opt('--top', 5);
  process.stdout.write('\nlargest change in relations:\n');
  for (const r of [...rows].sort((a, b) => Math.abs(b.dEdges) - Math.abs(a.dEdges)).slice(0, top)) process.stdout.write(line(r) + '\n');
  process.stdout.write('\nmost upward relations:\n');
  for (const r of [...rows].sort((a, b) => b.upward.length - a.upward.length).slice(0, top))
    process.stdout.write(line(r) + '\n' + r.upward.slice(0, 3).map(u => `    ${u.from} (layer ${u.fromLayer}) → ${u.to} (layer ${u.toLayer})`).join('\n') + '\n');
  return 0;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
