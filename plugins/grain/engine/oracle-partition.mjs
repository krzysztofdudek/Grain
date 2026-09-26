// grain oracle · the proposal and the accepted graph read as two partitions of the same tracked files (issue 263)
//
// The Jaccard measures in oracle.mjs ask whether a proposed node and an accepted node draw the SAME set. Two graphs
// can cut a repository along the same seams at different granularities, and a best-match Jaccard cannot tell that
// apart from two graphs that cut it differently: an accepted node a quarter the size of the proposed node holding it
// scores J = 0.25, a miss, exactly like a node drawn across the grain. Here each side is a partition of the files it
// owns (a file belongs to the DEEPEST node whose mapping selects it), and the two conditional entropies say which of
// the two differences it is:
//
//   H(P|A)  bits still needed to name a file's proposed node once its accepted node is known — how much finer the
//           proposal cuts than the accepted graph (0: every accepted node sits inside one proposed node)
//   H(A|P)  the same the other way — how much finer the accepted graph cuts than the proposal
//
// Near zero in one direction and large in the other is a difference of granularity, not of cut. VI = H(P|A) + H(A|P)
// is a metric on partitions; NMI (mutual information over the geometric mean of the two entropies) and ARI (pair
// agreement, corrected for chance) are given beside it because readers know them. The accepted tree is read at every
// depth (a node's ancestor at that depth stands for it), and the depth with the lowest VI is the level of the
// accepted tree the proposal cuts at.
//
// Relations are scored after projecting the accepted graph onto the proposed partition: each accepted node goes to
// the proposed node holding most of its files (its subtree's, for a node that maps nothing itself), and each accepted
// relation to the pair of proposed nodes its two ends went to; a proposed relation keeps its own two ends. No
// relation leaves the denominator because an end has no Jaccard partner; one whose two ends land in the same proposed
// node is counted as collapsed, one whose end maps no file at all as unmappable. Nothing here is a new threshold:
// every number is a count or an information quantity.

const segs = id => String(id).split('/').length;
const log2 = x => Math.log(x) / Math.LN2;

// file index -> owning node id: the deepest node whose file set holds it (ties: the smaller set, then the id)
export function ownership(nodes) {
  const owner = new Map(),
    rank = new Map();
  for (const n of nodes) {
    const r = [segs(n.id), -n.files.length, n.id];
    for (const f of n.files) {
      const cur = rank.get(f);
      if (!cur || r[0] > cur[0] || (r[0] === cur[0] && (r[1] > cur[1] || (r[1] === cur[1] && r[2] < cur[2])))) {
        owner.set(f, n.id);
        rank.set(f, r);
      }
    }
  }
  return owner;
}

// the information measures of two labelings over the same items
export function compare(labelsP, labelsA) {
  const N = labelsP.length;
  const joint = new Map(),
    mp = new Map(),
    ma = new Map();
  for (let i = 0; i < N; i++) {
    const p = labelsP[i],
      a = labelsA[i],
      k = p + '\u0000' + a;
    joint.set(k, (joint.get(k) || 0) + 1);
    mp.set(p, (mp.get(p) || 0) + 1);
    ma.set(a, (ma.get(a) || 0) + 1);
  }
  const H = m => [...m.values()].reduce((s, c) => s - (c / N) * log2(c / N), 0);
  let hPA = 0,
    hAP = 0;
  const bestP = new Map(),
    bestA = new Map();
  for (const [k, c] of joint) {
    const [p, a] = k.split('\u0000');
    hPA -= (c / N) * log2(c / ma.get(a));
    hAP -= (c / N) * log2(c / mp.get(p));
    bestP.set(p, Math.max(bestP.get(p) || 0, c));
    bestA.set(a, Math.max(bestA.get(a) || 0, c));
  }
  const hP = H(mp),
    hA = H(ma),
    mi = hP - hPA;
  const pairs = x => (x * (x - 1)) / 2;
  const sumJ = [...joint.values()].reduce((s, c) => s + pairs(c), 0),
    sumP = [...mp.values()].reduce((s, c) => s + pairs(c), 0),
    sumA = [...ma.values()].reduce((s, c) => s + pairs(c), 0);
  const expected = N > 1 ? (sumP * sumA) / pairs(N) : 0,
    maxIdx = (sumP + sumA) / 2;
  const sum = m => [...m.values()].reduce((s, c) => s + c, 0);
  const r3 = x => +x.toFixed(3);
  return {
    files: N,
    proposedClusters: mp.size,
    acceptedClusters: ma.size,
    hPgivenA: r3(Math.max(0, hPA)),
    hAgivenP: r3(Math.max(0, hAP)),
    vi: r3(Math.max(0, hPA) + Math.max(0, hAP)),
    nmi: hP > 0 && hA > 0 ? r3(mi / Math.sqrt(hP * hA)) : null,
    ari: maxIdx - expected ? r3((sumJ - expected) / (maxIdx - expected)) : null,
    // purity: the share of files in their proposed node's largest accepted class; inverse purity the other way
    purity: N ? r3(sum(bestP) / N) : null,
    inversePurity: N ? r3(sum(bestA) / N) : null,
  };
}

// the two partitions over the files both sides own, the accepted side read at each depth of its tree
export function partitionScore(proposal, accepted) {
  const oP = ownership(proposal.nodes),
    oA = ownership(accepted.nodes);
  const common = [...oA.keys()].filter(f => oP.has(f)).sort((a, b) => a - b);
  const P = common.map(f => oP.get(f));
  const leaf = compare(
    P,
    common.map(f => oA.get(f))
  );
  const maxDepth = Math.max(0, ...common.map(f => segs(oA.get(f))));
  const byDepth = [];
  for (let d = 1; d <= maxDepth; d++)
    byDepth.push({
      depth: d,
      ...compare(
        P,
        common.map(f => oA.get(f).split('/').slice(0, d).join('/'))
      ),
    });
  let best = null;
  for (const r of byDepth) if (!best || r.vi < best.vi) best = r;
  return {
    filesOwned: { proposal: oP.size, accepted: oA.size, both: common.length },
    leaves: leaf,
    byDepth,
    lowestVI: best ? { depth: best.depth, vi: best.vi, nmi: best.nmi, ari: best.ari } : null,
  };
}

// the accepted relations carried onto the proposed partition by file majority, scored against the proposal's own
export function projectedRelations(proposal, accepted) {
  const oP = ownership(proposal.nodes);
  // a node's files, or its subtree's when it maps none itself (an organizational parent owns what its children own)
  const subtreeFiles = side => {
    const own = new Map(side.nodes.map(n => [n.id, n.files]));
    const out = new Map();
    for (const n of side.nodes) {
      if (n.files.length) {
        out.set(n.id, n.files);
        continue;
      }
      const pre = n.id + '/';
      out.set(n.id, side.nodes.filter(m => m.id.startsWith(pre)).flatMap(m => own.get(m.id)));
    }
    return out;
  };
  const project = side => {
    const map = new Map();
    for (const [id, fs] of subtreeFiles(side)) {
      const votes = new Map();
      for (const f of fs) {
        const p = oP.get(f);
        if (p !== undefined) votes.set(p, (votes.get(p) || 0) + 1);
      }
      let best = null,
        bn = 0;
      for (const [p, c] of [...votes].sort((x, y) => (x[0] < y[0] ? -1 : 1)))
        if (c > bn) {
          best = p;
          bn = c;
        }
      if (best !== null) map.set(id, best);
    }
    return map;
  };
  const pairsOf = (side, proj) => {
    const pairs = new Set();
    let declared = 0,
      unmappable = 0,
      collapsed = 0;
    for (const n of side.nodes)
      for (const r of n.relations) {
        declared++;
        const a = proj.get(n.id),
          b = proj.get(r.target);
        if (a === undefined || b === undefined) unmappable++;
        else if (a === b) collapsed++;
        else pairs.add(a + ' ' + b);
      }
    return { pairs, declared, unmappable, collapsed };
  };
  // a proposed relation is already in the proposal's own node names: each proposed node stands for itself
  const A = pairsOf(accepted, project(accepted)),
    Pp = pairsOf(proposal, new Map(proposal.nodes.map(n => [n.id, n.id])));
  const overlap = [...A.pairs].filter(k => Pp.pairs.has(k)).length;
  return {
    acceptedDeclared: A.declared,
    acceptedUnmappable: A.unmappable,
    acceptedCollapsed: A.collapsed,
    acceptedPairs: A.pairs.size,
    proposedDeclared: Pp.declared,
    proposedPairs: Pp.pairs.size,
    overlap,
    recall: A.pairs.size ? +(overlap / A.pairs.size).toFixed(3) : null,
    precision: Pp.pairs.size ? +(overlap / Pp.pairs.size).toFixed(3) : null,
  };
}
