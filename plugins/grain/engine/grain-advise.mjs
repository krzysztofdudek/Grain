// grain engine · query surface · `advise` — the hidden edges and the contexts that outgrew themselves
//
// `grain advise [--json] [--graph <dir>]` reads the repository's OWN `.yggdrasil/` architecture graph and
// emits `grain-advice/1` (the contract in `.system/research/mission-one-system.md` §3): node pairs whose
// code changes together without the graph declaring a relation, and nodes a finer cut beats on their own
// evidence. It never writes to the graph and never proposes one — `grain propose` does that.
//
// TWO THINGS THIS FILE IS DELIBERATELY SHAPED AROUND.
//
// 1. THE GRAPH IS READ IN ONE FUNCTION. `readNodeGraph` below is the only place that touches `.yggdrasil/`
//    files. Everything downstream sees plain objects — id, name, mapping, file set, relations, parent chain —
//    which is exactly the shape a `yg node --json` document carries. When that command exists the body of that
//    one function is replaced and nothing else here moves.
//
// 2. IT DOES NOT REPEAT THE FILE-LEVEL LEVER'S FAILURE. `.system/research/where-cochange-promotion.md`
//    measured co-change promoted above `where`'s lexical cards across three repositories: it fired on 7–27% of
//    queries and named ONE file each time — the repository's hottest. Two findings from that measurement are
//    built into the aggregation here rather than left as advice:
//
//      - CORROBORATION SELECTS FOR HUBS (§3). Six `test/res.*.js` files naming `lib/response.js` is not six
//        pieces of evidence, it is one fact counted six times, and counting it six times is what made the hub
//        win. So a node pair's strength is the STRONGEST SINGLE witness pair joining them — never a sum, never
//        a count of witnesses. How many witnesses there are is reported beside the pair as disclosure, and is
//        never part of the gate or the ordering.
//      - ONE-WAY CONFIDENCE IS A HUB TEST (§3). `sup/commitsA` alone says "A's commits usually touch B", which
//        every file in a repository can say about its hub. The mutual form — min of both directions — is the
//        natural anti-hub test, and it took the file-level lever to zero fires on two of three repositories.
//        It is the gate here, at the 1/3 floor `cochangePartners`/`completenessDirectional` already apply to a
//        single subject's own sparse history. No constant is introduced by this file and none is changed.
//
// WHAT THE EVIDENCE IS AND IS NOT. `model.scopeCochange` pairs SCOPES (a declaration, keyed `<path>#<kind>#
// <name>` at its current path), not files and not directories, so the pair that reaches a node here is a pair
// of named declarations that a maintainer can open and read. The confidences reported are that witness pair's
// own directional confidences — the share of one declaration's commits that also touched the other — carried up
// to the nodes that own them. They are NOT a node-level rate: nothing in the model counts how many commits
// touched a whole node, and inventing that denominator by summing scope commits would double-count every commit
// that touched two declarations in one node. The document says which pair the numbers came from so the claim
// can be checked by hand.
//
// THE SPLIT SIDE reuses the measured policy of ticket 110 (`propose-levels.mjs`, `propose-types.mjs`) without
// restating it: a finer directory is a candidate only where it beats the level above it ON THAT LEVEL'S OWN
// EVIDENCE — strictly more of the imports that touch it stay inside than the parent's do, or grain could read
// none of its files while it could read the parent's. The parent here is the node's own mapped file set instead
// of a proposed type, and `typeEvidence` is the same function that scores a proposal.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CFG } from './config.mjs';
import { MIN_PROMOTE_FILES, underDir } from './propose-base.mjs';
import { typeEvidence, purityOf } from './propose-levels.mjs';
import { expandMapping, readGraph } from './yggdrasil-graph.mjs';

export const ADVICE_SCHEMA = 'grain-advice/1';
// The single-subject co-change floor already in force in `cochangePartners` (cards.mjs) and
// `completenessDirectional` (completeness.mjs): one subject's history is sparse, and a third of its commits is
// a real signal. Applied here to BOTH directions at once, which is strictly the stronger test.
const MUTUAL_CONF_FLOOR = 1 / 3;

// ==================================================================================================
// 1. The graph, read once, as plain objects. THE ONLY PLACE `.yggdrasil/` IS TOUCHED (see the header).
// ==================================================================================================
//
// `files` is the repository's tracked-path universe; a node's `files` is what its own `mapping:` selects out of
// it, never its children's (a file belongs to the deepest node that maps it, which is the ownership Yggdrasil's
// child precedence already gives a type). An organizational node carries no mapping and so owns no file of its
// own — it still appears here, because a relation declared on it covers the subtree beneath it.
export function readNodeGraph(graphRoot, files) {
  if (!existsSync(join(graphRoot, '.yggdrasil'))) return null;
  const raw = readGraph(graphRoot);
  const ctx = { root: graphRoot, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set() };
  const nodes = raw.nodes.map(n => ({
    id: n.id,
    name: typeof n.name === 'string' && n.name ? n.name : n.id,
    type: typeof n.type === 'string' ? n.type : null,
    files: Array.isArray(n.mapping) && n.mapping.length ? expandMapping(n.mapping, files, ctx) : new Set(),
    relations: (Array.isArray(n.relations) ? n.relations : [])
      .filter(r => r && typeof r.target === 'string')
      .map(r => ({ target: r.target, type: r.type || null })),
  }));
  const byId = new Map(nodes.map(n => [n.id, n]));
  // the deepest node that maps a file owns it; ties (two nodes at one depth mapping one file) go to the longer
  // id and then alphabetically, so ownership is a function of the graph alone and never of read order
  const depth = id => id.split('/').length;
  const ownerOf = new Map();
  for (const n of [...nodes].sort((a, b) => depth(a.id) - depth(b.id) || a.id.length - b.id.length || (a.id < b.id ? -1 : 1)))
    for (const f of n.files) ownerOf.set(f, n.id);
  return { nodes, byId, ownerOf };
}
// A node's own id and every ancestor id that exists in the graph, deepest first.
const chainOf = (g, id) => {
  const out = [];
  const segs = id.split('/');
  for (let k = segs.length; k >= 1; k--) {
    const p = segs.slice(0, k).join('/');
    if (g.byId.has(p)) out.push(p);
  }
  return out;
};
// WHAT "DECLARED" MEANS, said in full so the number can be argued with.
//
//   relation          one of the two nodes names the other as a relation target.
//   ancestor-relation an ancestor of one names an ancestor of the other — the same edge stated coarser, which
//                     is how a graph that draws its dependencies between modules covers the files inside them.
//   containment       one node is an ancestor of the other. Not a relation, but not a hidden edge either: the
//                     graph already says these two belong together, and reporting it as an undeclared coupling
//                     would inflate the undeclared count with the one connection every graph states loudest.
//
// Anything else is `null` — genuinely nothing in the graph joins the two.
export function declaredVia(g, a, b) {
  const rel = id => g.byId.get(id)?.relations || [];
  if (rel(a).some(r => r.target === b) || rel(b).some(r => r.target === a)) return 'relation';
  const ca = chainOf(g, a),
    cb = chainOf(g, b);
  for (const x of ca)
    for (const y of cb)
      if (x !== y && (rel(x).some(r => r.target === y) || rel(y).some(r => r.target === x))) return 'ancestor-relation';
  if (ca.includes(b) || cb.includes(a)) return 'containment';
  return null;
}

// ==================================================================================================
// 2. `kind: relation` — node pairs from scope co-change, mutual confidence, strongest witness only.
// ==================================================================================================
export function relationItems(model, g, live) {
  const pairs = new Map(); // "a\x00b" -> { a, b, best, witnesses, files:Set }
  for (const p of model.scopeCochange || []) {
    const ia = p.a.indexOf('#'),
      ib = p.b.indexOf('#');
    if (ia < 0 || ib < 0) continue;
    const fa = p.a.slice(0, ia),
      fb = p.b.slice(0, ib);
    if (!live.has(fa) || !live.has(fb)) continue; // liveness at HEAD, both ends
    if (p.sup < CFG.cochangeMinSup) continue; // the support floor, restated rather than assumed
    const na = g.ownerOf.get(fa),
      nb = g.ownerOf.get(fb);
    if (!na || !nb || na === nb) continue; // inside one node is not an edge between nodes
    const ofA = p.sup / (p.commitsA || 1),
      ofB = p.sup / (p.commitsB || 1);
    const conf = Math.min(ofA, ofB); // MUTUAL — see the header
    if (conf < MUTUAL_CONF_FLOOR) continue;
    const flip = nb < na;
    const [x, y] = flip ? [nb, na] : [na, nb];
    const key = x + '\x00' + y;
    let e = pairs.get(key);
    if (!e) {
      e = { a: x, b: y, best: null, witnesses: 0, files: new Set() };
      pairs.set(key, e);
    }
    e.witnesses++;
    e.files.add(flip ? fb + '\x00' + fa : fa + '\x00' + fb);
    const cand = {
      conf: +conf.toFixed(3),
      sup: p.sup,
      ofA: +(flip ? ofB : ofA).toFixed(3),
      ofB: +(flip ? ofA : ofB).toFixed(3),
      scopeA: flip ? p.b : p.a,
      scopeB: flip ? p.a : p.b,
      commitsA: (flip ? p.commitsB : p.commitsA) || 1,
      commitsB: (flip ? p.commitsA : p.commitsB) || 1,
    };
    // the strongest SINGLE witness, never a pooled one: more witnesses is not more evidence (header, §3)
    if (
      !e.best ||
      cand.conf > e.best.conf ||
      (cand.conf === e.best.conf && cand.sup > e.best.sup) ||
      (cand.conf === e.best.conf && cand.sup === e.best.sup && cand.scopeA + cand.scopeB < e.best.scopeA + e.best.scopeB)
    )
      e.best = cand;
  }
  const items = [];
  for (const e of pairs.values()) {
    const via = declaredVia(g, e.a, e.b);
    const w = e.best;
    items.push({
      kind: 'relation',
      nodes: [e.a, e.b],
      confidence: w.conf,
      evidence: {
        coChanged: w.sup,
        ofA: w.ofA,
        ofB: w.ofB,
        declared: via !== null,
        declaredVia: via,
        witnessA: w.scopeA,
        witnessB: w.scopeB,
        commitsA: w.commitsA,
        commitsB: w.commitsB,
        witnessPairs: e.witnesses,
        witnessFilePairs: e.files.size,
      },
      text: relationText(g, e, w, via),
    });
  }
  return items.sort(
    (p, q) =>
      q.confidence - p.confidence ||
      q.evidence.coChanged - p.evidence.coChanged ||
      (p.nodes[0] < q.nodes[0] ? -1 : p.nodes[0] > q.nodes[0] ? 1 : p.nodes[1] < q.nodes[1] ? -1 : 1)
  );
}
const scopeName = k => {
  const parts = k.split('#');
  return parts.length >= 3 ? parts[2] : k;
};
const scopeFile = k => {
  const i = k.indexOf('#');
  return i < 0 ? k : k.slice(0, i);
};
function relationText(g, e, w, via) {
  const A = g.byId.get(e.a)?.name || e.a,
    B = g.byId.get(e.b)?.name || e.b;
  const head = `${A} and ${B} change together: \`${scopeName(w.scopeA)}\` (${scopeFile(w.scopeA)}) and \`${scopeName(w.scopeB)}\` (${scopeFile(w.scopeB)}) were touched in the same commit ${w.sup} times — ${w.sup} of ${w.commitsA} for one, ${w.sup} of ${w.commitsB} for the other.`;
  const tail =
    via === null
      ? ' Nothing in the architecture connects them.'
      : via === 'containment'
        ? ' The architecture already puts one inside the other.'
        : via === 'relation'
          ? ' The architecture already connects them.'
          : ' The architecture connects them at a coarser level.';
  const more =
    e.witnesses > 1
      ? ` ${e.witnesses - 1} other pair${e.witnesses - 1 === 1 ? '' : 's'} of declarations move with them; the strongest one is quoted here, and the rest are not counted as extra evidence.`
      : '';
  return head + tail + more;
}

// ==================================================================================================
// 3. `kind: split` — a node a finer cut beats on the node's own evidence (the ticket-110 policy).
// ==================================================================================================
//
// The evidence context is built from the model rather than from a `grain export`: the two numbers the policy
// compares are the resolved imports between tracked files (`model.edges`) and which files grain could parse at
// all (`model.partitions[].files`), both carried on the model already. `typeEvidence`'s rule-site count is the
// one number an export holds and the model does not, so it is passed empty and never reported — a number this
// command cannot honestly compute is not a number it prints.
export function adviceEvidenceContext(model, files) {
  const tracked = new Set(files);
  const mined = new Set();
  for (const p of model.partitions || []) for (const f of p.files || []) mined.add(f);
  return {
    edges: (model.edges || []).filter(e => tracked.has(e.from) && tracked.has(e.to)),
    cochange: (model.cochange || []).filter(p => tracked.has(p.a) && tracked.has(p.b)),
    mined,
    ruleSites: [],
  };
}
const shownEvidence = m => ({
  files: m.files,
  importsInside: m.importsInside,
  importsCrossing: m.importsCrossing,
  mined: m.mined,
  purity: purityOf(m) === null ? null : +purityOf(m).toFixed(3),
  cochangeInside: m.cochangeInside,
  cochangeCrossing: m.cochangeCrossing,
});
export function splitItems(model, g, files) {
  const evCtx = adviceEvidenceContext(model, files);
  const items = [];
  for (const n of [...g.nodes].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (n.files.size <= MIN_PROMOTE_FILES) continue; // nothing finer can be carved and leave a rest
    const own = [...n.files];
    const parent = typeEvidence(n.files, evCtx);
    // every directory that holds part of the node, shallowest first — an accepted one becomes the parent of its
    // own children, so the shallowest cut that clears the comparison wins and the split does not run away
    const dirs = new Set();
    for (const f of own) {
      const segs = f.split('/');
      for (let k = 1; k < segs.length; k++) dirs.add(segs.slice(0, k).join('/'));
    }
    const kept = [];
    for (const d of [...dirs].sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1))) {
      if (kept.some(c => (d + '/').startsWith(c.dir + '/'))) continue;
      const set = underDir(own, d);
      if (set.size < MIN_PROMOTE_FILES || set.size >= n.files.size) continue;
      const m = typeEvidence(set, evCtx);
      const unread = m.mined === 0 && parent.mined > 0;
      const mine = purityOf(m),
        theirs = purityOf(parent);
      const tighter = mine != null && theirs != null && mine > theirs;
      if (!unread && !tighter) continue;
      kept.push({ dir: d, ev: m, reason: unread ? 'unread' : 'tighter' });
    }
    if (!kept.length) continue;
    items.push({
      kind: 'split',
      nodes: [n.id],
      candidates: kept.map(c => c.dir),
      evidence: {
        node: shownEvidence(parent),
        candidates: kept.map(c => ({ path: c.dir, reason: c.reason, ...shownEvidence(c.ev) })),
      },
      text: splitText(g, n, parent, kept),
    });
  }
  return items;
}
function splitText(g, n, parent, kept) {
  const name = g.byId.get(n.id)?.name || n.id;
  const one = c =>
    c.reason === 'unread'
      ? `\`${c.dir}\` holds ${c.ev.files} of them and grain could read none — a different kind of place from the rest of the node, which it could read`
      : `\`${c.dir}\` holds ${c.ev.files} of them and keeps ${c.ev.importsInside} of the ${c.ev.importsInside + c.ev.importsCrossing} imports that touch it inside, a tighter boundary than the node's own ${parent.importsInside} of ${parent.importsInside + parent.importsCrossing}`;
  return `${name} owns ${parent.files} files, and a finer cut beats it on its own evidence: ${kept.map(one).join('; ')}. It may have outgrown one context.`;
}

// ==================================================================================================
// 4. The document, and the survey a measurement reads.
// ==================================================================================================
//
// `survey` is not part of the `grain-advice/1` contract — a consumer reads `schema`, `repo`, `at` and `items`
// and nothing else. It is here because every number a memo would need about this instrument is a count over the
// same run, and computing it anywhere else would mean a second implementation that could disagree with this one.
export function adviceDocument({ model, head, graphRoot, graphLabel }) {
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
  const files = [...live].sort();
  const g = readNodeGraph(graphRoot, files);
  if (!g) return null;
  const rel = relationItems(model, g, live);
  const split = splitItems(model, g, files);
  const mapped = g.nodes.filter(n => n.files.size).map(n => n.id).sort();
  // THE CONTROL: the declared rate over EVERY pair of mapped nodes, enumerated rather than sampled. A random
  // sample of node pairs is what the ticket asks for; the whole population is the limit of that sample and is
  // cheap at these sizes, so it is what is reported — no seed, no sampling error, nothing to re-run.
  let controlDeclared = 0,
    controlPairs = 0;
  for (let i = 0; i < mapped.length; i++)
    for (let j = i + 1; j < mapped.length; j++) {
      controlPairs++;
      if (declaredVia(g, mapped[i], mapped[j])) controlDeclared++;
    }
  const touch = new Map();
  for (const it of rel) for (const id of it.nodes) touch.set(id, (touch.get(id) || 0) + 1);
  const hottest = [...touch.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] || null;
  const declaredBy = { relation: 0, 'ancestor-relation': 0, containment: 0 };
  for (const it of rel) if (it.evidence.declaredVia) declaredBy[it.evidence.declaredVia]++;
  const declared = rel.filter(it => it.evidence.declared).length;
  return {
    schema: ADVICE_SCHEMA,
    repo: '.',
    at: head || null,
    graph: graphLabel,
    items: [...rel, ...split],
    survey: {
      nodes: g.nodes.length,
      nodesWithFiles: mapped.length,
      files: files.length,
      filesWithAnOwningNode: g.ownerOf.size,
      scopePairs: (model.scopeCochange || []).length,
      pairs: rel.length,
      declared,
      undeclared: rel.length - declared,
      declaredBy,
      hottestNode: hottest
        ? { node: hottest[0], pairs: hottest[1], share: rel.length ? +(hottest[1] / rel.length).toFixed(3) : null }
        : null,
      control: {
        nodePairs: controlPairs,
        declared: controlDeclared,
        rate: controlPairs ? +(controlDeclared / controlPairs).toFixed(4) : null,
      },
      splits: split.length,
    },
  };
}

// ==================================================================================================
// 5. The command.
// ==================================================================================================
export async function cmdAdvise({ model, head, root, args, opts, stamp }) {
  if (args.length) throw new Error('usage: grain advise [--json] [--graph <dir>] — takes no arguments');
  // `--graph` reads a hand-written graph held BESIDE the repository — the shape every scoring oracle has.
  // Resolved against the caller's cwd so a relative path means what it looks like it means.
  const graphRoot = opts.graph && opts.graph !== true ? resolve(process.cwd(), String(opts.graph)) : root;
  const doc = adviceDocument({ model, head, graphRoot, graphLabel: graphRoot === root ? '.yggdrasil' : graphRoot });
  if (!doc) {
    const note = `no architecture graph to advise on — ${graphRoot === root ? 'this repository has no `.yggdrasil/`' : `no \`.yggdrasil/\` under ${graphRoot}`}. \`grain propose\` writes one from the code.`;
    return opts.json
      ? [JSON.stringify({ schema: ADVICE_SCHEMA, repo: '.', at: head || null, items: [], note }, null, 1)]
      : [note, stamp()];
  }
  if (opts.json) return [JSON.stringify(doc, null, 1)];
  const s = doc.survey;
  const split = doc.items.filter(i => i.kind === 'split');
  const lines = [];
  lines.push(`${s.nodesWithFiles} of ${s.nodes} places in the architecture own files here.`);
  // THE VERDICT OF THE MEASUREMENT, APPLIED (`.system/research/node-cochange-measurement.md`). The change-together
  // side is NOT advice and is not listed here: across four hand-written graphs it named two pairs in total, both
  // of them connections the architecture already made, and the looser gates that name more name whichever place
  // changes most. It stays a machine surface — `--json` carries every pair with its evidence — and what the text
  // surface says about it is the count and this disclosure, which is all the numbers support.
  lines.push(...weakSignalNote(s));
  // The split side IS advice: the policy behind it was fitted and measured on these same four graphs (ticket 110)
  // and on each of them it named a place holding a pile the evidence separates, never a place that was already one
  // thing. So it is listed.
  if (split.length) {
    lines.push(`${split.length} place${split.length === 1 ? '' : 's'} a finer cut beats on its own evidence:`);
    for (const it of split.slice(0, 20)) lines.push(`  - ${it.text}`);
    if (split.length > 20) lines.push(`  … and ${split.length - 20} more.`);
  } else lines.push('No place here is beaten by a finer cut of its own files.');
  lines.push(stamp());
  return lines;
}
// THE DISCLOSURE, printed on every run, whatever the numbers are. Measured on four hand-written graphs
// (`.system/research/node-cochange-measurement.md`): what the change-together evidence surfaces is either nothing
// or connections the architecture already draws, and every looser reading of it concentrates on whichever place
// the repository changes most — the same finding `where`'s file-level co-change lever was rejected on. The
// concentration and the two rates are recomputed on every run and printed with it, so a repository where this
// does not hold says so in its own numbers rather than being covered by this one.
export function weakSignalNote(s) {
  if (!s.pairs)
    return ['Nothing here changes together strongly enough in both directions to report — this evidence is usually silent, and silence is its honest answer.'];
  const out = [
    `${s.pairs} pair${s.pairs === 1 ? '' : 's'} change together in both directions, ${s.undeclared} of which the architecture does not connect. They are not advice — read them with \`--json\`.`,
  ];
  if (s.hottestNode)
    out.push(
      `  Why not advice: ${Math.round(s.hottestNode.share * 100)}% of them touch one place (${s.hottestNode.node}), so what is named may be where this repository changes most rather than a connection you are missing.`
    );
  if (s.control && s.control.rate !== null)
    out.push(
      `  For scale: ${Math.round((s.declared / s.pairs) * 100)}% of them are already connected in the architecture, against ${Math.round(s.control.rate * 100)}% of all pairs of places.`
    );
  return out;
}
