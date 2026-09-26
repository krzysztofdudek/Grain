// grain engine · the few dependencies that hold each module cycle together (issue 266)
//
// A strongly connected component says which modules reach each other; it does not say what to change. The
// smallest change that makes the component acyclic is a minimum-weight feedback arc set: the module edges whose
// removal leaves no cycle, weighted by how many references each carries, so the answer is the fewest references
// someone would have to move. Equivalently, the linear order of the members that leaves the least weight pointing
// backwards; the backward edges are the cut.
//
// Solved exactly by dynamic programming over subsets (the cheapest order of each subset of members, O(2^k · k)
// over the component's k modules) while k stays within `CFG.fasExactMax`, a compute bound and not a statistical
// gate. Above it the order is found by the Eades–Lin–Smyth greedy (sinks last, sources first, otherwise the member
// with the most outgoing over incoming weight) and then improved by moving one member at a time to its best place
// until no move helps; that cut is a local minimum, marked `exact: false`, and never presented as the smallest.
//
// The smallest cut is not necessarily the right one: it is the cheapest in references, and a maintainer may
// rather break the cycle elsewhere. Every consumer says so.
import { CFG } from './config.mjs';

// backward weight of an order: an edge u → v with u placed after v
function costOf(order, W) {
  const pos = new Map(order.map((v, i) => [v, i]));
  let c = 0;
  for (const [u, row] of W) for (const [v, w] of row) if (pos.get(u) > pos.get(v)) c += w;
  return c;
}

function exactOrder(members, W) {
  const k = members.length,
    full = (1 << k) - 1;
  // out[v] = [bit of target, weight] over v's intra-component out-edges: placing v after a set S costs the weight
  // of v's edges into S (those point backwards)
  const idx = new Map(members.map((m, i) => [m, i]));
  const out = members.map(m => [...(W.get(m) || new Map())].map(([t, w]) => [1 << idx.get(t), w]));
  const dp = new Float64Array(full + 1).fill(Infinity),
    last = new Int8Array(full + 1).fill(-1);
  dp[0] = 0;
  for (let S = 0; S < full; S++) {
    if (dp[S] === Infinity) continue;
    for (let v = 0; v < k; v++) {
      const b = 1 << v;
      if (S & b) continue;
      let c = dp[S];
      for (const [tb, w] of out[v]) if (S & tb) c += w;
      if (c < dp[S | b]) {
        dp[S | b] = c;
        last[S | b] = v;
      }
    }
  }
  const order = [];
  for (let S = full; S; S &= ~(1 << last[S])) order.unshift(members[last[S]]);
  return order;
}

function heuristicOrder(members, W) {
  const inW = new Map(members.map(m => [m, new Map()]));
  for (const [u, row] of W) for (const [v, w] of row) inW.get(v).set(u, w);
  const left = new Set(members),
    head = [],
    tail = [];
  const sum = (m, side) => {
    let s = 0;
    for (const [x, w] of side.get(m) || []) if (left.has(x)) s += w;
    return s;
  };
  while (left.size) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const m of [...left].sort()) {
        if (!sum(m, W)) {
          tail.unshift(m);
          left.delete(m);
          moved = true;
        } else if (!sum(m, inW)) {
          head.push(m);
          left.delete(m);
          moved = true;
        }
      }
    }
    if (!left.size) break;
    let best = null,
      bd = -Infinity;
    for (const m of [...left].sort()) {
      const d = sum(m, W) - sum(m, inW);
      if (d > bd) {
        bd = d;
        best = m;
      }
    }
    head.push(best);
    left.delete(best);
  }
  let order = head.concat(tail),
    cost = costOf(order, W);
  // one member at a time to its best place, until no move lowers the backward weight (integer weights: it stops)
  for (let improved = true; improved; ) {
    improved = false;
    for (const m of members) {
      const rest = order.filter(x => x !== m);
      for (let i = 0; i <= rest.length; i++) {
        const cand = rest.slice(0, i).concat([m], rest.slice(i));
        const c = costOf(cand, W);
        if (c < cost) {
          order = cand;
          cost = c;
          improved = true;
        }
      }
    }
  }
  return order;
}

// one entry per cycle, in the cycles' own order: the members, the references inside the component, and the cut —
// each cut module edge with its weight and the file-level references that make it up (file, line, count)
export function cycleCuts(cycles, medges, edges, modOf) {
  return cycles.map(members => {
    const inside = new Set(members);
    const W = new Map();
    let total = 0;
    for (const e of medges)
      if (inside.has(e.from) && inside.has(e.to)) {
        (W.get(e.from) || W.set(e.from, new Map()).get(e.from)).set(e.to, e.n);
        total += e.n;
      }
    const exact = members.length <= CFG.fasExactMax;
    const order = exact ? exactOrder(members, W) : heuristicOrder(members, W);
    const pos = new Map(order.map((v, i) => [v, i]));
    const cut = [];
    for (const [u, row] of W)
      for (const [v, n] of row)
        if (pos.get(u) > pos.get(v)) {
          const refs = edges
            .filter(e => modOf(e.from) === u && modOf(e.to) === v)
            .map(e => ({ file: e.from, to: e.to, line: e.line, n: e.n }))
            .sort((a, b) => b.n - a.n || (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
          cut.push({ from: u, to: v, n, refs });
        }
    cut.sort((a, b) => b.n - a.n || (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : 1));
    return { members, order, references: total, cutReferences: cut.reduce((a, c) => a + c.n, 0), exact, cut };
  });
}

// one line of prose for a cycle's cut, shared by the report, the markdown report and the proposal
export function cutPhrase(c, { fmt = x => x, refsShown = 3, edgesShown = 4 } = {}) {
  const edgesTxt = c.cut
    .slice(0, edgesShown)
    .map(e => {
      const at = e.refs.slice(0, refsShown).map(r => fmt(`${r.file}:${r.line}`));
      const more = e.refs.length > refsShown ? ` +${e.refs.length - refsShown} more` : '';
      return `${fmt(e.from + '/')} → ${fmt(e.to + '/')} (${e.n}${at.length ? `: ${at.join(', ')}${more}` : ''})`;
    })
    .join(' · ')
    .concat(c.cut.length > edgesShown ? ` · +${c.cut.length - edgesShown} more module edges` : '');
  return (
    `held together by ${c.cutReferences} of its ${c.references} references in ${c.cut.length} module edge${c.cut.length === 1 ? '' : 's'} — ${edgesTxt} — ` +
    (c.exact
      ? 'the smallest cut that breaks it, not necessarily the right one'
      : 'a small cut found by local search, not proven the smallest, and not necessarily the right one')
  );
}
