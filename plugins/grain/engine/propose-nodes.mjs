// grain engine · proposal writer · relations and the coarse node cut
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.

export function buildRelations(exp, typeOfFile, active) {
  const pairs = new Map(); // "from|to" -> n
  for (const e of exp.edges || []) {
    const a = typeOfFile.get(e.from), b = typeOfFile.get(e.to);
    if (!a || !b || a === b) continue;
    const k = a + '|' + b;
    pairs.set(k, (pairs.get(k) || 0) + (e.n || 1));
  }
  const uses = new Map(); // type -> Map(target -> n)
  for (const [k, n] of pairs) {
    const [a, b] = k.split('|');
    (uses.get(a) || uses.set(a, new Map()).get(a)).set(b, n);
  }
  // established negatives, split into the two things they can become
  const denies = [], backlog = [];
  const dirOfType = new Map(active.filter(a => a.dir).map(a => [a.dir, a.id]));
  for (const an of exp.archNorms || []) {
    if (an.exp !== 'false' || an.fromKind !== 'module') continue;
    const fromT = dirOfType.get(an.from), toT = dirOfType.get(an.to);
    const rec = { from: an.from, to: an.to, fromType: fromT || null, toType: toT || null, share: an.share, ne: an.ne, neff: an.neff, bits: an.bits };
    const observed = fromT && uses.get(fromT) && uses.get(fromT).size;
    if (fromT && !observed) { denies.push(rec); rec.becomes = 'default: deny'; }
    else { rec.becomes = 'backlog only'; rec.whyNot = observed ? `type \`${fromT}\` has ${uses.get(fromT).size} observed outgoing dependencies — a deny here would contradict imports the code contains` : `\`${an.from}\` is not a proposed type, so there is nothing to deny on`; backlog.push(rec); }
  }
  return { uses, denies, backlog, pairs };
}

// ==================================================================================================
// 6. Nodes — the COARSE cut, deliberately.
//
// 093 §3: the pattern repo's hand graph has 250 nodes that map exactly ONE file. Imitating that would be
// imitating a granularity choice, not recovering evidence — a one-file node is a decision about how finely to
// review, and grain has nothing to say about it. So one node per active type, mapping that type's directory,
// nested in `model/` so a child node's directory sits under its parent's. Every finer candidate grain does hold
// (role groups, deeper directory cards) is listed in `alternatives.md` as a node the maintainer may split out.
// ==================================================================================================
// A node's path in the graph IS its directory under `model/`, so a repository directory whose name starts with
// a dot cannot be one verbatim — Yggdrasil's model walker does not descend into it. The mapping still names the
// real path; only the node's own address is rewritten.
export const nodePathFor = dir => (dir ? dir.split('/').map(s => (s.startsWith('.') ? 'dot-' + s.slice(1) : s)).join('/') : 'repo-root');
// The path glob a type classifies by — its own `when`, said once. A dir-less (root-glob) type globs `*`, and
// building `${a.dir}/**` for one produces the literal string `null/**`: a predicate that selects nothing, in a
// sentence that names a directory called `null`. One expression, so a reader of a scope glob and a reader of
// `yg-architecture.yaml` are looking at the same thing.
export const typeGlob = a => (a.rootGlob ? '*' : `${a.dir}/**`);
// A subtree that carries its own `.yggdrasil/` is a SEPARATE PROJECT, and every Yggdrasil check skips it. Grain
// has no such notion — those files are tracked, so they are mined — and the first version of this renderer duly
// gave each of them a node. Measured on the pattern repo that produced 11 `mapping-path-missing` errors reading
// "resolves only to excluded files". The TYPES stay (a `when` predicate over a subtree costs nothing and is
// still true); only the nodes are withheld, since a node whose whole mapping is invisible to the checker is a
// node that can never carry a verdict.
export const nestedProjectRoots = files => {
  const roots = new Set();
  for (const f of files) {
    const i = f.indexOf('/.yggdrasil/');
    if (i > 0) roots.add(f.slice(0, i));
  }
  return [...roots];
};
export function buildNodes(active, exp, nestedRoots = []) {
  const live = f => !nestedRoots.some(r => f.startsWith(r + '/'));
  const nodes = active.map(a => ({
    id: nodePathFor(a.dir),
    type: a.id,
    dir: a.dir,
    files: new Set([...a.files].filter(live)),
    why: a.why,
  })).filter(n => n.files.size > 0);
  // Yggdrasil loads a node only where a `yg-node.yaml` sits, and reads the hierarchy from the directory chain
  // under `model/`. A gap in that chain (a `model/source/` with no node between `model/` and
  // `model/source/cli/src/core/`) silently loses the whole subtree — measured: 82 nodes written, 12 loaded.
  // So every missing intermediate segment gets an ORGANIZATIONAL node (`type: module`, no mapping), which is
  // what a hand-written graph does at the same places and what the schema's "parent-only" type is for.
  const have = new Set(nodes.map(n => n.id));
  for (const n of [...nodes]) {
    const segs = n.id.split('/');
    for (let k = 1; k < segs.length; k++) {
      const id = segs.slice(0, k).join('/');
      if (have.has(id)) continue;
      have.add(id);
      nodes.push({ id, type: 'module', dir: null, files: new Set(), organizational: true, why: `organizational node: \`model/${id}/\` is a step in the hierarchy between nodes that do carry a mapping, and Yggdrasil reads the hierarchy from that directory chain` });
    }
  }
  nodes.sort((a, b) => (a.id < b.id ? -1 : 1));
  const nodeOfFile = new Map();
  for (const n of [...nodes].sort((a, b) => (a.dir || '').split('/').length - (b.dir || '').split('/').length)) for (const f of n.files) nodeOfFile.set(f, n.id);
  const rel = new Map();
  for (const e of exp.edges || []) {
    const a = nodeOfFile.get(e.from), b = nodeOfFile.get(e.to);
    if (!a || !b || a === b) continue;
    const m = rel.get(a) || rel.set(a, new Map()).get(a);
    m.set(b, (m.get(b) || 0) + (e.n || 1));
  }
  for (const n of nodes) n.relations = [...(rel.get(n.id) || new Map())].sort((x, y) => y[1] - x[1]).map(([t, n2]) => ({ target: t, n: n2 }));

  // mapping form, and (for the explicit form) the files this node owns after every descendant has taken its own
  for (const n of nodes) {
    n.useDir = !!n.dir && !nestedRoots.some(r => r === n.dir || r.startsWith(n.dir + '/'));
    const kids = nodes.filter(m => m !== n && m.id.startsWith(n.id + '/'));
    n.ownFiles = new Set([...n.files].filter(f => !kids.some(k => k.files.has(f))));
  }

  // A CYCLE IN THE CODE IS NOT EXPRESSIBLE IN THE GRAPH, AND THE PROPOSAL SAYS SO RATHER THAN HIDING IT.
  //
  // Yggdrasil refuses a graph whose node relations form a loop (`structural-cycle`, blocking). Grain measures
  // real loops in the pattern repo's imports — the same two `yg advise` nominates independently. An earlier
  // version of this renderer broke each loop at its weakest edge to make the proposal green. MEASURED, that
  // trade was bad: dropping 8 edges turned one `structural-cycle` error, which names the real defect and the
  // real fix, into 4 `relation-undeclared-dependency` errors whose suggested fix is to put the edges back. So
  // every resolved edge is declared, the loops are found and reported here and at the top of the refactor
  // backlog, and the proposal is honestly RED on a repository whose imports form a cycle. That is not a
  // renderer defect; it is the finding.
  const dropped = [];
  const outgoing = () => new Map(nodes.map(n => [n.id, n.relations.filter(r => !r._masked).map(r => r.target)]));
  for (let guard = 0; guard < 500; guard++) {
    const adj = outgoing();
    const colour = new Map(), stack = [];
    let loop = null;
    const dfs = id => {
      if (loop) return;
      colour.set(id, 1); stack.push(id);
      for (const t of adj.get(id) || []) {
        if (loop) return;
        if (colour.get(t) === 1) { loop = stack.slice(stack.indexOf(t)).concat(t); return; }
        if (!colour.has(t)) dfs(t);
      }
      colour.set(id, 2); stack.pop();
    };
    for (const n of nodes) if (!colour.has(n.id) && !loop) dfs(n.id);
    if (!loop) break;
    let weakest = null;
    for (let i = 0; i < loop.length - 1; i++) {
      const from = nodes.find(n => n.id === loop[i]);
      const edge = from.relations.find(r => r.target === loop[i + 1]);
      if (edge && (!weakest || edge.n < weakest.edge.n)) weakest = { from, edge };
    }
    if (!weakest) break;
    // recorded, NOT removed — but the edge is masked for this scan so the next loop can be found
    weakest.from.relations = weakest.from.relations.map(r => (r === weakest.edge ? { ...r, _masked: true } : r));
    dropped.push({ from: weakest.from.id, to: weakest.edge.target, n: weakest.edge.n, cycle: loop });
  }
  for (const n of nodes) n.relations = n.relations.map(r => { const { _masked, ...rest } = r; void _masked; return rest; });
  return { nodes, cycles: dropped, nodeOfFile };
}

// ==================================================================================================
// 7. Aspect drafts — from the certified set AND from the sub-gate lattice.
//
// (i) A CERTIFIED convention is a claim grain is willing to make: its statement becomes the rule and its
//     superposition template (the group's anti-unified skeleton) becomes "what passing looks like".
//
// (ii) The SUB-GATE lattice is the other half, and `sub-gate-rows-are-the-product` is why it exists: the real
//     house rules of the pattern repo sit BELOW the λ gate as low-share candidates (`catch -> abortOnUnexpected
//     Error`, practised in 22% of places). For an agent mid-edit, refusing to certify those is correct. For a
//     maintainer drafting aspects, the sub-gate row IS the draft plus its own refactor backlog.
//
//     THE SURFACE THAT ALREADY EXPOSES THEM is `grain explain <file>` (alias `spectrum`) — its `[obs ]` rows,
//     as against `[NORM]` rows, are exactly the below-gate cells (`spectrum()` in `engine/core.mjs`). But
//     `explain` conditions its cells on ONE file's roles and directory chain and then keeps only rows that file
//     has, so it is a per-file debug dump, not a maintainer surface. THE AGGREGATION NEEDED (ticket 095) is:
//     the same cells, built once per PARTITION over all its scopes, with `_all:<kind>` and `r<role>:<kind>`
//     cell ids, ranked by adoption share, and each row carrying the sites that do NOT conform. That is what
//     `partitionLattice` below computes, from the engine's own vocabulary and codelength, read-only.
// ==================================================================================================
