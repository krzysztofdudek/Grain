// grain oracle — the correction an adopter made to a proposal, kept as a measurable oracle.
//
//   grain oracle record [--proposal <dir>] [--graph <dir>] [--name <n>] [--out <dir>] [--yes]
//   grain oracle score  <name-or-dir> [--json]
//
// WHY THIS EXISTS. A hand-written architecture graph is the only thing that can say how much of a repository's
// real architecture grain recovered, and hand-written graphs are expensive: the four this project measures
// against were each written from scratch by a session that was forbidden to look at grain's output. But every
// adopter who runs `grain propose` and then accepts a graph with `yg adopt` produces exactly the same artifact
// for free — a proposal, and beside it the graph a human decided to live with. The DIFFERENCE between the two
// is the correction, and a correction is an oracle by the same definition the first four use: a graph written
// by a maintainer of that repository, not by grain, against which grain's own output can be scored.
//
// WHAT IS RECORDED, AND WHAT IS NOT. An oracle here is a STRUCTURAL record, not a copy of a repository or of
// its graph: the elements the measures consume (node types and their `when:` predicates, nodes with their
// mappings, relations, ports and attached rules, rules with their statuses and the identifiers their checks
// police) and, for every one of them, the set of tracked paths that predicate selected at the recorded commit.
// It carries no file contents, no prose, no charters, no drill corpora, no history and no lock files. Two
// consequences, both deliberate: the record is small enough to commit and read, and an adopter whose code is
// private can contribute one without shipping the code. Because the file sets are expanded ONCE, against the
// real repository, at record time, scoring later needs neither the repository nor a clone of it — a
// `content:`-gated predicate is honoured exactly as it was on the day it was recorded, instead of silently
// expanding to the empty set and dropping out of a denominator (the failure `oracles-4-measurement.md` names).
//
// CONSENT IS THE COMMAND'S OUTPUT. `record` prints what it would store and where, and stops. Nothing is
// written until the same command is run again with `--yes`. The default destination is inside this repository
// only when the graph being recorded belongs to one of this repository's OWN fixtures; for anybody else's
// repository there is no default at all and `--out` names a directory the adopter chose.
//
// THE MEASURES ARE THE EXISTING ONES. Recall and precision are computed exactly as `tests/stress/propose.mjs`
// computes them against the four hand-written oracles — best Jaccard over expanded file sets, a hit at
// J >= 0.5, both directions reported, alternatives scored as their own clearly-labelled stratum — so a fifth
// oracle recorded this way is comparable to the first four rather than being a second scale.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION } from './config.mjs';
import { headSha, originUrl, trackedFiles as gitTrackedFiles } from './history.mjs';
import {
  aspectLiterals,
  expandMapping,
  expandWhen,
  jaccard,
  parseYaml,
  pathMatcher,
  readGraph,
} from './yggdrasil-graph.mjs';

export const ORACLE_SCHEMA = 'grain-oracle/1';
export const CORRECTION_SCHEMA = 'grain-correction/1';
const HIT = 0.5; // a hit is J >= 0.5 — the same bar the four-oracle instruments use, not a new one

const pluginRoot = () => resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORACLES_DIR = () => join(pluginRoot(), 'tests', 'stress', 'oracles');

// ==================================================================================================
// 1. Reading the two sides.
// ==================================================================================================

// `yg adopt` takes "a staging directory containing .yggdrasil/, or that directory itself"; so does this.
export function graphRootOf(p, what) {
  const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
  const root = basename(abs) === '.yggdrasil' ? dirname(abs) : abs;
  if (!existsSync(join(root, '.yggdrasil')))
    throw new Error(
      `${what}: no .yggdrasil/ under ${abs}.\n` +
        'An oracle is the difference between a proposed graph and an accepted one, so both sides have to be graphs.\n' +
        `Name the directory that HOLDS .yggdrasil/ (or .yggdrasil/ itself) — for a proposal that is \`grain propose\`'s own out-dir.`
    );
  return root;
}

export function trackedFiles(repo) {
  const files = gitTrackedFiles(repo);
  if (files && files.length) return files;
  throw new Error(
    `grain oracle record: ${repo} has no tracked files to read (it is not a git checkout, or its index is empty).\n` +
      'Every element of both graphs is recorded as the set of tracked paths its predicate selects, so the file list IS the record.\n' +
      'Run this against a git checkout of the repository the graph describes, or point `--repo` at one.'
  );
}

const aspectAttachments = list =>
  (list || []).map(a => (typeof a === 'string' ? { id: a, status: null } : a && a.id ? { id: a.id, status: a.status || null } : null)).filter(Boolean);

const RANK = { draft: 1, advisory: 2, enforced: 3 };
const strongest = statuses => {
  let best = null;
  for (const s of statuses) if (s && (!best || (RANK[s] || 0) > (RANK[best] || 0))) best = s;
  return best;
};

// One side of the record: types, nodes, rules — each with the file set it selected, as indices into `files`.
export function distill(graphRoot, files, ctx, side, index) {
  const g = readGraph(graphRoot);
  const idx = set => [...set].map(f => index.get(f)).filter(n => n !== undefined).sort((a, b) => a - b);

  const types = [];
  for (const [id, t] of Object.entries(g.arch?.node_types || {})) {
    if (!t) continue;
    const classifying = !!t.when;
    const set = classifying ? expandWhen(t.when, files, ctx) : new Set();
    types.push({
      id,
      classifying,
      aspects: aspectAttachments(t.aspects),
      files: idx(set),
    });
  }

  const nodes = [];
  for (const n of g.nodes) {
    const set = expandMapping(n.mapping, files, ctx);
    const ports = [];
    for (const [name, p] of Object.entries(n.ports && typeof n.ports === 'object' && !Array.isArray(n.ports) ? n.ports : {}))
      ports.push({ name, version: p?.version ?? null, test: p?.test ?? null, aspects: aspectAttachments(p?.aspects) });
    nodes.push({
      id: n.id,
      name: typeof n.name === 'string' ? n.name : null,
      type: typeof n.type === 'string' ? n.type : null,
      mapping: (Array.isArray(n.mapping) ? n.mapping : []).filter(x => typeof x === 'string'),
      relations: (Array.isArray(n.relations) ? n.relations : [])
        .filter(r => r && r.target)
        .map(r => ({ target: String(r.target), type: r.type || null, consumes: Array.isArray(r.consumes) ? r.consumes : [] })),
      ports,
      aspects: aspectAttachments(n.aspects),
      files: idx(set),
    });
  }

  // every status this rule is attached with anywhere, plus the identifiers its check polices (never its body)
  const attached = new Map();
  for (const holder of [...types, ...nodes])
    for (const a of holder.aspects) {
      if (!attached.has(a.id)) attached.set(a.id, new Set());
      if (a.status) attached.get(a.id).add(a.status);
    }
  const aspects = g.aspects.map(a => {
    let literals = [];
    if (a.hasCheck) {
      try { literals = [...aspectLiterals(readFileSync(join(a.dir, 'check.mjs'), 'utf8'))].sort(); } catch { literals = []; }
    }
    const own = typeof a.status === 'string' ? a.status : null;
    return {
      id: a.id,
      reviewer: a.reviewer?.type || (a.hasCheck ? 'deterministic' : null),
      status: own || strongest(attached.get(a.id) || []) || null,
      declaredStatus: own,
      mechanical: !!a.hasCheck,
      literals,
    };
  });

  return { side, root: graphRoot, types, nodes, aspects };
}

// The proposal's own alternatives — candidate cuts the maintainer chooses FROM. They are a separate stratum in
// every score (a ceiling on type recall), never folded into the active number.
export function readAlternatives(proposalRoot, files, ctx, index) {
  const out = [];
  const file = join(proposalRoot, 'alternatives.md');
  if (!existsSync(file)) return out;
  const txt = readFileSync(file, 'utf8');
  for (const m of txt.matchAll(/^### `([^`]+)`\n\n```yaml\n([\s\S]*?)\n```/gm)) {
    try {
      const w = parseYaml(m[2]);
      const set = expandWhen(w.when, files, ctx);
      if (set.size) out.push({ id: m[1], files: [...set].map(f => index.get(f)).filter(n => n !== undefined).sort((a, b) => a - b) });
    } catch { /* a draft predicate that does not parse is itself a finding, counted as an alternative that scores nothing */ }
  }
  return out;
}

// ==================================================================================================
// 2. The measures — best Jaccard in both directions, exactly as the four-oracle instruments compute them.
// ==================================================================================================

const setsOf = (rows, files) => rows.map(r => ({ id: r.id, set: new Set(r.files.map(i => files[i])) }));

export function direction(from, to, label) {
  const rows = from.map(x => {
    let best = { j: 0, id: null };
    for (const y of to) {
      const j = jaccard(x.set, y.set);
      if (j > best.j) best = { j: +j.toFixed(4), id: y.id };
    }
    return { id: x.id, files: x.set.size, best: best.j, match: best.id };
  });
  const n = rows.length;
  return {
    label,
    n,
    hit: rows.filter(r => r.best >= HIT).length,
    hit8: rows.filter(r => r.best >= 0.8).length,
    rate: n ? +(rows.filter(r => r.best >= HIT).length / n).toFixed(3) : null,
    meanJ: +(rows.reduce((a, r) => a + r.best, 0) / Math.max(1, n)).toFixed(3),
    rows,
  };
}

// A relation is measured in the accepted graph's own terms: a proposed node stands for an accepted one when it
// is that node's best match at J >= 0.5. A relation whose end has no counterpart at all is not scored either
// way — it is reported on its own line, the way `compareRelationsAtNodeLevel` reports an unmapped end.
export function relationLedger(proposal, accepted, files) {
  const P = setsOf(proposal.nodes, files), A = setsOf(accepted.nodes, files);
  const p2a = new Map(), a2p = new Map();
  for (const x of P) {
    let best = { j: 0, id: null };
    for (const y of A) { const j = jaccard(x.set, y.set); if (j > best.j) best = { j, id: y.id }; }
    if (best.j >= HIT) p2a.set(x.id, best.id);
  }
  for (const y of A) {
    let best = { j: 0, id: null };
    for (const x of P) { const j = jaccard(y.set, x.set); if (j > best.j) best = { j, id: x.id }; }
    if (best.j >= HIT) a2p.set(y.id, best.id);
  }
  const acceptedPairs = new Set();
  let acceptedDeclared = 0, acceptedUnmapped = 0;
  for (const n of accepted.nodes)
    for (const r of n.relations) {
      acceptedDeclared++;
      if (!a2p.has(n.id) || !a2p.has(r.target)) { acceptedUnmapped++; continue; }
      acceptedPairs.add(n.id + ' ' + r.target);
    }
  const proposedPairs = new Set();
  let proposedDeclared = 0, proposedUnmapped = 0;
  for (const n of proposal.nodes)
    for (const r of n.relations) {
      proposedDeclared++;
      const from = p2a.get(n.id), to = p2a.get(r.target);
      if (!from || !to || from === to) { proposedUnmapped++; continue; }
      proposedPairs.add(from + ' ' + to);
    }
  const matched = [...acceptedPairs].filter(k => proposedPairs.has(k));
  const added = [...acceptedPairs].filter(k => !proposedPairs.has(k));      // the adopter's graph declares it, the proposal did not
  const removed = [...proposedPairs].filter(k => !acceptedPairs.has(k));    // the proposal declared it, the adopter's graph does not
  const split = k => { const [from, to] = k.split(' '); return { from, to }; };
  return {
    matchedNodes: p2a.size,
    acceptedDeclared, proposedDeclared,
    acceptedPairs: acceptedPairs.size,
    proposedPairs: proposedPairs.size,
    matched: matched.length,
    recall: acceptedPairs.size ? +(matched.length / acceptedPairs.size).toFixed(3) : null,
    precision: proposedPairs.size ? +(matched.length / proposedPairs.size).toFixed(3) : null,
    acceptedRelationsWithAnUnmappedEnd: acceptedUnmapped,
    proposedRelationsWithAnUnmappedEnd: proposedUnmapped,
    added: added.map(split),
    removed: removed.map(split),
    nodeMatches: [...p2a].map(([from, to]) => ({ proposed: from, accepted: to })),
  };
}

const key = s => String(s).split(/[^A-Za-z0-9]+/).filter(Boolean).join('').toLowerCase();

// Rules, two ways. By ID: a draft the adopter kept, dropped, edited or moved up the status ladder — the direct
// reading, and the only one available when the accepted graph grew out of the proposal itself. By NAME: how
// many of the accepted graph's mechanical rules some draft names the same identifier as — the measure the
// four-oracle instruments use, and the only one that says anything when the accepted rules were hand-written.
export function ruleLedger(proposal, accepted) {
  const P = new Map(proposal.aspects.map(a => [a.id, a]));
  const A = new Map(accepted.aspects.map(a => [a.id, a]));
  const kept = [], dropped = [], added = [], promoted = [], demoted = [], edited = [];
  for (const [id, p] of P) {
    const a = A.get(id);
    if (!a) { dropped.push(id); continue; }
    const pr = RANK[p.status] || 0, ar = RANK[a.status] || 0;
    if (ar > pr) promoted.push({ id, from: p.status, to: a.status });
    else if (pr > ar) demoted.push({ id, from: p.status, to: a.status });
    else if (p.literals.join(' ') !== a.literals.join(' ')) edited.push({ id });
    else kept.push(id);
  }
  for (const id of A.keys()) if (!P.has(id)) added.push(id);

  const draftIdents = new Map(proposal.aspects.filter(a => a.identifier).map(a => [a.id, key(a.identifier)]));
  const named = [];
  let withLiterals = 0;
  for (const a of accepted.aspects) {
    if (!a.mechanical || !a.literals.length) continue;
    withLiterals++;
    const keys = new Set(a.literals.map(key));
    const drafts = [...draftIdents].filter(([, k]) => keys.has(k)).map(([id]) => id);
    if (drafts.length) named.push({ acceptedRule: a.id, drafts: drafts.slice(0, 4), n: drafts.length });
  }
  return {
    kept, dropped, added, promoted, demoted, edited,
    acceptedMechanical: accepted.aspects.filter(a => a.mechanical).length,
    acceptedWithLiterals: withLiterals,
    proposedDrafts: proposal.aspects.length,
    named,
    namedCount: named.length,
  };
}

// ==================================================================================================
// 3. The correction — what the adopter did to the proposal, in the adopter's own vocabulary.
// ==================================================================================================
//
//   kept      the same files under the same path
//   renamed   the same files under a different path
//   remapped  the same path, a mapping the adopter edited (J >= 0.5, not 1)
//   merged    two or more proposed nodes the adopter folded into one
//   split     one proposed node the adopter cut into two or more
//   recut     files that survived into nodes drawn differently enough to be neither of the above
//   dropped   a proposed node whose files no accepted node claims at all
//   added     an accepted node no proposed node overlaps
//
// A node that maps no file of its own — an organizational parent — is not classified at all: it owns whatever
// its children own, so every comparison over file sets would call it dropped no matter what the adopter did
// with it. Both sides' counts are reported instead.
export function nodeCorrection(proposal, accepted, files) {
  const P = setsOf(proposal.nodes, files).filter(x => x.set.size), A = setsOf(accepted.nodes, files).filter(y => y.set.size);
  const organizational = { proposed: proposal.nodes.length - P.length, accepted: accepted.nodes.length - A.length };
  const inter = (a, b) => { let n = 0; const [s, big] = a.size <= b.size ? [a, b] : [b, a]; for (const x of s) if (big.has(x)) n++; return n; };
  // Both graphs are hierarchical, so a parent's mapping covers what its children map and a node is "mostly
  // inside" several others by construction. A merge or a split is therefore claimed only where the other side
  // does NOT already have that element under its own name: a contributor that is some OTHER accepted node's own
  // best match was not merged into this one, and an heir that some OTHER proposed node already matches was not
  // split out of this one — both graphs simply drew the same set at two levels.
  const bestOf = (x, others) => {
    let best = { j: 0, id: null };
    for (const y of others) { const j = jaccard(x.set, y.set); if (j > best.j) best = { j: +j.toFixed(4), id: y.id }; }
    return best;
  };
  const bestA = new Map(P.map(x => [x.id, bestOf(x, A)]));   // proposed -> its best accepted
  const bestP = new Map(A.map(y => [y.id, bestOf(y, P)]));   // accepted -> its best proposed
  const contributors = new Map(); // accepted id -> proposed ids mostly inside it, and belonging to nothing else
  const heirs = new Map();        // proposed id -> accepted ids mostly inside it, and matched by nothing else
  for (const y of A)
    contributors.set(y.id, P.filter(x => x.set.size && inter(x.set, y.set) / x.set.size >= HIT
      && !(bestA.get(x.id).j >= HIT && bestA.get(x.id).id !== y.id)).map(x => x.id));
  for (const x of P)
    heirs.set(x.id, A.filter(y => y.set.size && inter(x.set, y.set) / y.set.size >= HIT
      && !(bestP.get(y.id).j >= HIT && bestP.get(y.id).id !== x.id)).map(y => y.id));

  const mergedInto = new Map(); // proposed id -> accepted id
  const merged = [];
  for (const [aid, list] of contributors) if (list.length >= 2) { merged.push({ accepted: aid, from: list }); for (const p of list) mergedInto.set(p, aid); }
  const split = [];
  const splitFrom = new Set();
  for (const [pid, list] of heirs) if (list.length >= 2 && !mergedInto.has(pid)) { split.push({ proposed: pid, into: list }); splitFrom.add(pid); }

  const kept = [], renamed = [], remapped = [], recut = [], dropped = [];
  const claimed = new Set(merged.flatMap(m => [m.accepted]).concat(split.flatMap(s => s.into)));
  for (const x of P) {
    if (mergedInto.has(x.id) || splitFrom.has(x.id)) continue;
    const best = bestA.get(x.id);
    if (best.j >= HIT) {
      claimed.add(best.id);
      if (best.j === 1 && best.id === x.id) kept.push({ proposed: x.id, accepted: best.id });
      else if (best.id === x.id) remapped.push({ proposed: x.id, accepted: best.id, j: best.j });
      else renamed.push({ proposed: x.id, accepted: best.id, j: best.j });
    } else if (best.j > 0) recut.push({ proposed: x.id, nearest: best.id, j: best.j });
    else dropped.push(x.id);
  }
  const added = A.filter(y => !claimed.has(y.id) && !(contributors.get(y.id) || []).length).map(y => y.id);
  return { kept, renamed, remapped, merged, split, recut, dropped, added, organizational };
}

export function buildCorrection(proposal, accepted, files) {
  const nodes = nodeCorrection(proposal, accepted, files);
  const rel = relationLedger(proposal, accepted, files);
  const rules = ruleLedger(proposal, accepted);
  const portsOf = side => side.nodes.reduce((a, n) => a + n.ports.length, 0);
  return {
    schema: CORRECTION_SCHEMA,
    schemaNotes: {
      nodes: 'a node that maps no file of its own (an organizational parent) is counted under `organizational` and classified no further. kept (same files, same path) · renamed (same files, new path) · remapped (same path, an edited mapping) · merged (two or more proposed nodes folded into one) · split (one proposed node cut into several) · recut (files kept, boundaries redrawn past a Jaccard of 0.5) · dropped (no accepted node claims these files) · added (an accepted node no proposed node overlaps). A node matches at Jaccard >= 0.5 over expanded file sets, the same bar every other measure here uses.',
      relations: 'read in the accepted graph\'s own node names: `added` is a relation the adopter declares and the proposal did not, `removed` one the proposal declared and the adopter did not. A relation with an end that has no counterpart is counted on its own line, never scored.',
      rules: 'by id — what the adopter did to each draft (kept, dropped, edited, promoted or demoted along draft -> advisory -> enforced) — plus `added`, the rules in the accepted graph that no draft proposed.',
      ports: 'ports are recorded from the accepted graph and counted; the proposal writer emits none today, so a non-zero count here is entirely the adopter\'s own contract layer.',
    },
    nodes: {
      ...nodes,
      counts: {
        kept: nodes.kept.length, renamed: nodes.renamed.length, remapped: nodes.remapped.length,
        merged: nodes.merged.length, split: nodes.split.length, recut: nodes.recut.length,
        dropped: nodes.dropped.length, added: nodes.added.length,
        organizational: nodes.organizational,
      },
    },
    relations: { added: rel.added, removed: rel.removed, kept: rel.matched, counts: { added: rel.added.length, removed: rel.removed.length, kept: rel.matched } },
    rules: {
      kept: rules.kept, dropped: rules.dropped, added: rules.added, promoted: rules.promoted, demoted: rules.demoted, edited: rules.edited,
      counts: { kept: rules.kept.length, dropped: rules.dropped.length, added: rules.added.length, promoted: rules.promoted.length, demoted: rules.demoted.length, edited: rules.edited.length },
    },
    ports: { accepted: portsOf(accepted), proposed: portsOf(proposal) },
  };
}

// ==================================================================================================
// 4. Scoring a recorded oracle.
// ==================================================================================================

export function scoreRecord(record) {
  const files = record.files;
  const P = record.proposal, A = record.accepted;
  const pTypes = setsOf(P.types.filter(t => t.classifying && t.files.length), files);
  const aTypes = setsOf(A.types.filter(t => t.classifying && t.files.length), files);
  const alts = setsOf(P.alternatives || [], files);
  const pNodes = setsOf(P.nodes.filter(n => n.files.length), files);
  const aNodes = setsOf(A.nodes.filter(n => n.files.length), files);
  const rel = relationLedger(P, A, files);
  const rules = ruleLedger(P, A);
  return {
    schema: 'grain-oracle-score/1',
    oracle: record.name,
    target: record.target,
    types: {
      recall: direction(aTypes, pTypes, 'accepted type -> proposed type (recall)'),
      recallWithAlternatives: direction(aTypes, [...pTypes, ...alts], 'accepted type -> proposed type or alternative (recall, ceiling)'),
      precision: direction(pTypes, aTypes, 'proposed type -> accepted type (precision)'),
    },
    nodes: {
      recall: direction(aNodes, pNodes, 'accepted node -> proposed node (recall)'),
      precision: direction(pNodes, aNodes, 'proposed node -> accepted node (precision)'),
    },
    relations: rel,
    rules,
    alternatives: alts.length,
  };
}

// ==================================================================================================
// 5. Reading and writing a record on disk.
// ==================================================================================================

export function writeRecord(dir, record, correction) {
  mkdirSync(dir, { recursive: true });
  const w = (name, obj) => writeFileSync(join(dir, name), JSON.stringify(obj, null, 1) + '\n');
  const { proposal, accepted, files, ...manifest } = record;
  w('oracle.json', { ...manifest, files: files.length });
  w('files.json', { schema: 'grain-oracle-files/1', n: files.length, files });
  w('proposal.json', proposal);
  w('accepted.json', accepted);
  w('correction.json', correction);
  writeFileSync(join(dir, 'README.md'), readmeFor(record, correction));
  return ['oracle.json', 'files.json', 'proposal.json', 'accepted.json', 'correction.json', 'README.md'];
}

export function loadRecord(dir) {
  const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  let manifest;
  try { manifest = read('oracle.json'); } catch {
    throw new Error(
      `grain oracle score: ${dir} holds no oracle.json.\n` +
        'A recorded oracle is a directory of five documents; without its manifest there is nothing to score.\n' +
        'Name a directory `grain oracle record --yes` wrote, or run that command first.'
    );
  }
  if (manifest.schema !== ORACLE_SCHEMA)
    throw new Error(
      `grain oracle score: ${dir} carries schema ${manifest.schema || '(none)'}, not ${ORACLE_SCHEMA}.\n` +
        'The score is defined over this record\'s own shape; reading a different one would report numbers about the wrong fields.\n' +
        'Re-record the oracle with this build of grain.'
    );
  return { ...manifest, files: read('files.json').files, proposal: read('proposal.json'), accepted: read('accepted.json'), correction: read('correction.json'), dir };
}

function readmeFor(record, correction) {
  const c = correction.nodes.counts, r = correction.rules.counts;
  return [
    `# Oracle: ${record.name}`,
    '',
    'The difference between the architecture graph `grain propose` wrote for this repository and the graph its',
    'maintainer actually accepted. It is an oracle by the same definition as the four hand-written ones beside it:',
    'a graph a maintainer of that repository decided to live with, which grain did not write.',
    '',
    '| | |',
    '|---|---|',
    `| **Target** | \`${record.target.repo}\` |`,
    `| **Revision** | \`${record.target.asOf}\` |`,
    `| **Tracked files** | ${record.target.files} |`,
    `| **Recorded** | ${record.recordedAt} by grain ${record.engine} |`,
    `| **Proposal** | ${record.proposal ? '' : ''}${record.counts.proposedTypes} node types · ${record.counts.proposedNodes} nodes · ${record.counts.proposedRules} rule drafts |`,
    `| **Accepted** | ${record.counts.acceptedTypes} node types · ${record.counts.acceptedNodes} nodes · ${record.counts.acceptedRules} rules · ${record.counts.acceptedPorts} port${record.counts.acceptedPorts === 1 ? '' : 's'} |`,
    '',
    '## The correction',
    '',
    `Nodes: ${c.kept} kept · ${c.renamed} renamed · ${c.remapped} remapped · ${c.merged} merged · ${c.split} split · ${c.recut} recut · ${c.dropped} dropped · ${c.added} added.`,
    `Relations: ${correction.relations.counts.kept} kept · ${correction.relations.counts.added} added by the adopter · ${correction.relations.counts.removed} removed.`,
    `Rules: ${r.kept} kept · ${r.promoted} promoted · ${r.demoted} demoted · ${r.edited} edited · ${r.dropped} dropped · ${r.added} the adopter wrote themselves.`,
    ...(record.counts.proposedRules && !r.kept && !r.promoted && !r.demoted && !r.edited
      ? ['', 'No draft appears in the accepted graph under its own name at all: that graph was not grown from this',
         'proposal, so the rule line above is a comparison of two independent sets, never a review of the drafts.']
      : []),
    '',
    '## What is in here, and what is not',
    '',
    'Recorded: node types and their predicates, nodes with their mappings, relations, ports and attached rules,',
    'rules with their statuses and the identifiers their checks police, and — for every one of those — the set of',
    'tracked paths it selected at the revision above. Not recorded: file contents, prose, charters, drill corpora,',
    'commit history, lock files. The file sets were expanded once, against the real repository, so scoring needs',
    'no clone: `grain oracle score ' + record.name + '`.',
    '',
  ].join('\n');
}

// ==================================================================================================
// 6. The command.
// ==================================================================================================

const corpusIds = () => {
  try {
    return new Set((JSON.parse(readFileSync(join(pluginRoot(), 'tests', 'stress', 'corpus.json'), 'utf8')).repos || []).map(r => r.id));
  } catch { return new Set(); }
};

// The in-repo oracles directory is a default only for THIS repository's own fixtures: the checkout grain itself
// lives in, a repository named in its own measurement corpus, or a name it already carries an oracle for.
// Anybody else's architecture goes where the adopter says, and nowhere by default.
export function destinationFor({ name, targetRepo, out }) {
  if (out) return { dir: join(isAbsolute(out) ? out : resolve(process.cwd(), out), name), chosen: 'named by --out' };
  const oracles = ORACLES_DIR();
  const own =
    existsSync(oracles) &&
    (resolve(targetRepo).startsWith(resolve(pluginRoot(), '..', '..')) ||
      corpusIds().has(basename(resolve(targetRepo))) ||
      corpusIds().has(name) ||
      existsSync(join(oracles, name)));
  if (own) return { dir: join(oracles, name), chosen: "this repository's own fixtures" };
  return { dir: null, chosen: null };
}

const short = sha => (sha && sha.length === 40 ? sha.slice(0, 7) : String(sha));
const pct = (a, b) => (b ? `${a}/${b} = ${(a / b).toFixed(3)}` : `${a}/${b}`);

export async function cmdOracle({ root, args, opts }) {
  const sub = args[0];
  if (sub !== 'record' && sub !== 'score')
    throw new Error(
      `usage: grain oracle record [--proposal <dir>] [--graph <dir>] [--name <n>] [--out <dir>] [--yes] | grain oracle score <name-or-dir> [--json]${sub ? `\n(got: ${sub})` : ''}`
    );
  return sub === 'record' ? recordCmd({ root, args, opts }) : scoreCmd({ args, opts });
}

async function recordCmd({ root, args, opts }) {
  if (args.length > 1) throw new Error('usage: grain oracle record [--proposal <dir>] [--graph <dir>] [--name <n>] [--out <dir>] [--yes] — takes no positional argument');
  for (const flag of ['proposal', 'graph', 'name', 'out'])
    if (opts[flag] === true) throw new Error(`usage: grain oracle record --${flag} <value> — the flag needs a value`);
  const repo = root;
  const proposalRoot = graphRootOf(opts.proposal ? String(opts.proposal) : join(repo, '.yggdrasil-proposal'), 'grain oracle record --proposal');
  const acceptedRoot = graphRootOf(opts.graph ? String(opts.graph) : repo, 'grain oracle record --graph');
  const name = String(opts.name || basename(resolve(repo))).replace(/[^A-Za-z0-9._-]+/g, '-').toLowerCase();

  const accepted0 = readGraph(acceptedRoot);
  const all = trackedFiles(repo);
  const excluded = (accepted0.config?.coverage?.excluded || []).map(p => pathMatcher(p));
  const files = all.filter(rel => !excluded.some(m => m(rel)));
  const index = new Map(files.map((f, i) => [f, i]));
  const ctx = { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set() };

  const proposal = distill(proposalRoot, files, ctx, 'proposal', index);
  proposal.alternatives = readAlternatives(proposalRoot, files, ctx, index);
  // the identifier each draft rule is ABOUT — recorded by the proposal writer itself, never guessed from prose
  try {
    const sidecar = JSON.parse(readFileSync(join(proposalRoot, 'proposal.json'), 'utf8'));
    const byId = new Map((sidecar.evidence || []).filter(r => r.kind === 'aspect' && r.identifier).map(r => [r.id, r.identifier]));
    for (const a of proposal.aspects) if (byId.has(a.id)) a.identifier = byId.get(a.id);
    proposal.proposalSchema = sidecar.schema || null;
    proposal.proposalEngine = sidecar.engine || null;
    proposal.asOf = sidecar.asOf || null;
  } catch { proposal.proposalSchema = null; }
  const accepted = distill(acceptedRoot, files, ctx, 'accepted', index);

  const asOf = headSha(repo) || 'unknown';   // a checkout with no commit yet still records; the sha is what a later reader pins to
  const origin = originUrl(repo);

  const record = {
    schema: ORACLE_SCHEMA,
    name,
    recordedAt: new Date().toISOString(),
    engine: ENGINE_VERSION,
    target: { repo: origin || repo, checkout: repo, asOf, files: files.length, filesExcluded: all.length - files.length },
    sources: { proposal: proposalRoot, accepted: acceptedRoot },
    counts: {
      proposedTypes: proposal.types.filter(t => t.classifying).length,
      proposedNodes: proposal.nodes.length,
      proposedRelations: proposal.nodes.reduce((a, n) => a + n.relations.length, 0),
      proposedRules: proposal.aspects.length,
      proposedAlternatives: proposal.alternatives.length,
      acceptedTypes: accepted.types.filter(t => t.classifying).length,
      acceptedNodes: accepted.nodes.length,
      acceptedRelations: accepted.nodes.reduce((a, n) => a + n.relations.length, 0),
      acceptedRules: accepted.aspects.length,
      acceptedPorts: accepted.nodes.reduce((a, n) => a + n.ports.length, 0),
    },
    unknownWhenKeys: [...ctx.unknownWhenKeys],
    files,
    proposal,
    accepted,
  };
  const correction = buildCorrection(proposal, accepted, files);
  const dest = destinationFor({ name, targetRepo: repo, out: opts.out ? String(opts.out) : null });

  const c = record.counts;
  const plan = [
    `grain oracle record — ${name}`,
    '',
    `  the repository       ${repo}${origin ? ` (${origin})` : ''} at ${short(asOf)} · ${files.length} tracked files`,
    `  the proposal         ${proposalRoot} — ${c.proposedTypes} node types · ${c.proposedNodes} nodes · ${c.proposedRelations} relations · ${c.proposedRules} rule drafts · ${c.proposedAlternatives} alternative cuts`,
    `  the accepted graph   ${acceptedRoot} — ${c.acceptedTypes} node types · ${c.acceptedNodes} nodes · ${c.acceptedRelations} relations · ${c.acceptedPorts} ports · ${c.acceptedRules} rules with their statuses`,
    '',
    '  it will store        the node types, nodes, mappings, relations, ports and rule statuses of BOTH graphs;',
    `                       the ${files.length} tracked paths of this repository, and which of them each type, node and rule selects;`,
    '                       the identifiers each mechanical rule polices, read out of its check; and the correction between the two graphs',
    '  it will NOT store    file contents, descriptions, charters, prose rule bodies, drill corpora, commit history, author names, lock files',
  ];
  if (!dest.dir) {
    plan.push(
      '',
      `  destination          none — ${repo} is not one of this repository's own fixtures, so there is no default inside it.`,
      '',
      'This record describes your architecture: the path of every tracked file, what you called each part of it, and what your rules police.',
      'next: re-run with `--out <dir>` naming a directory you choose (it is written to `<dir>/' + name + '/`), then again with `--yes` once the list above is what you want to keep.'
    );
    return plan;
  }
  plan.push('', `  destination          ${dest.dir}/  (${dest.chosen})`);
  if (!opts.yes) {
    plan.push(
      '',
      'Nothing has been written. Read the two lines above: an oracle is published only if you publish it.',
      `next: \`grain oracle record ${opts.proposal ? `--proposal ${opts.proposal} ` : ''}${opts.graph ? `--graph ${opts.graph} ` : ''}${opts.out ? `--out ${opts.out} ` : ''}--name ${name} --yes\` to write it, then \`grain oracle score ${name}\` to see what it says.`
    );
    return plan;
  }
  const written = writeRecord(dest.dir, record, correction);
  const cc = correction.nodes.counts;
  return [
    ...plan,
    '',
    `written: ${written.map(f => join(dest.dir, f)).join('\n         ')}`,
    `correction: nodes ${cc.kept} kept · ${cc.renamed} renamed · ${cc.remapped} remapped · ${cc.merged} merged · ${cc.split} split · ${cc.recut} recut · ${cc.dropped} dropped · ${cc.added} added` +
      ` · relations +${correction.relations.counts.added}/-${correction.relations.counts.removed}` +
      ` · rules ${correction.rules.counts.kept} kept, ${correction.rules.counts.promoted} promoted, ${correction.rules.counts.dropped} dropped, ${correction.rules.counts.added} written by the adopter`,
    `next: \`grain oracle score ${name}\` — precision and recall of the proposal against the graph you accepted.`,
  ];
}

export function resolveOracleDir(nameOrDir) {
  const direct = isAbsolute(nameOrDir) ? nameOrDir : resolve(process.cwd(), nameOrDir);
  if (existsSync(join(direct, 'oracle.json'))) return direct;
  const inRepo = join(ORACLES_DIR(), nameOrDir);
  if (existsSync(join(inRepo, 'oracle.json'))) return inRepo;
  let known = [];
  try { known = readdirSync(ORACLES_DIR()).filter(d => existsSync(join(ORACLES_DIR(), d, 'oracle.json'))); } catch { known = []; }
  throw new Error(
    `grain oracle score: no recorded oracle at ${direct}${direct === inRepo ? '' : ` or ${inRepo}`}.\n` +
      'Scoring reads a directory `grain oracle record --yes` wrote — a name resolves only against this repository\'s own oracles.\n' +
      `next: name the directory itself, or record one first.${known.length ? ` Recorded here: ${known.join(', ')}.` : ''}`
  );
}

function scoreCmd({ args, opts }) {
  if (args.length !== 2) throw new Error('usage: grain oracle score <name-or-dir> [--json] — exactly one oracle');
  const dir = resolveOracleDir(String(args[1]));
  const record = loadRecord(dir);
  const score = scoreRecord(record);
  if (opts.json) return [JSON.stringify({ ...score, correction: record.correction }, null, 1)];
  const t = score.types, n = score.nodes, r = score.relations, ru = score.rules;
  const cc = record.correction.nodes.counts;
  return [
    `oracle ${record.name} — what grain proposed, against the graph its adopter accepted`,
    `  target       ${record.target.repo} at ${short(record.target.asOf)} · ${record.target.files} tracked files · recorded ${record.recordedAt.slice(0, 10)} by grain ${record.engine}`,
    `  node types   recall ${pct(t.recall.hit, t.recall.n)} (with the alternatives it offered: ${pct(t.recallWithAlternatives.hit, t.recallWithAlternatives.n)}) · precision ${pct(t.precision.hit, t.precision.n)} · mean J ${t.recall.meanJ}`,
    `  nodes        recall ${pct(n.recall.hit, n.recall.n)} · precision ${pct(n.precision.hit, n.precision.n)} · mean J ${n.recall.meanJ}`,
    `               (over the ${n.recall.n} accepted node(s) that map a file of their own, and the ${n.precision.n} proposed ones that do)`,
    `  relations    recall ${pct(r.matched, r.acceptedPairs)} · precision ${pct(r.matched, r.proposedPairs)}`,
    `               (only between the ${r.matchedNodes} node(s) both graphs agree on: ${r.acceptedRelationsWithAnUnmappedEnd} of the ${r.acceptedDeclared} accepted relations, and ${r.proposedRelationsWithAnUnmappedEnd} of the ${r.proposedDeclared} proposed ones, have an end outside that set and are scored neither way)`,
    `  rules        ${ru.namedCount}/${ru.acceptedWithLiterals} of the accepted mechanical rules are named by some draft · of ${ru.proposedDrafts} drafts, ${ru.kept.length} kept, ${ru.promoted.length} promoted, ${ru.dropped.length} dropped · ${ru.added.length} rules the adopter wrote themselves`,
    ...(ru.proposedDrafts && !ru.kept.length && !ru.promoted.length && !ru.demoted.length && !ru.edited.length
      ? ['               no draft rule appears in the accepted graph under its own name at all: this graph was not grown from this proposal, so read the rule row as a comparison of two independent sets, never as a review of the drafts']
      : []),
    `  correction   nodes ${cc.kept} kept · ${cc.renamed} renamed · ${cc.remapped} remapped · ${cc.merged} merged · ${cc.split} split · ${cc.recut} recut · ${cc.dropped} dropped · ${cc.added} added`,
    `  a hit is Jaccard >= 0.5 over the tracked paths each element selects — the same measure the hand-written oracles are scored with.`,
    `  read the whole record: ${dir}`,
  ];
}
