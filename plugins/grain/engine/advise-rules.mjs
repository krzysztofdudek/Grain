// grain engine · query surface · `advise`'s `kind: rule` items — the law a graph that already exists could take on.
//
// Two origins, one item kind, both drafts for the maintainer (or an architect) to accept into the graph; Grain
// never writes the graph itself.
//
// 1. BOUNDARY PROMOTION. A maintainer's `grain decide boundary <from> --never-imports <to>` is a decision Grain can
//    only flag at edit time. The architecture graph can make it law: when every node that owns a file under
//    `<from>` has a type whose `relations:` table denies every relation to the type of every node owning a file
//    under `<to>`, and no such node declares a relation to another anyway, `yg check` refuses the import and no
//    agent can argue it back in by declaring a relation. Until the graph says that, `advise` offers it as a
//    `kind: rule` item: which types would have to deny which, which declared relations contradict the decision,
//    and how many imports cross it today. Once the graph says it, the decision is PROMOTED — derived from the graph
//    every time it is read, never stored, so it cannot drift from the law — and Grain stops flagging the boundary
//    at edit time, because `yg check` now does it with authority Grain does not have.
//
// 2. CONVENTIONS NOTHING ENFORCES. A convention Grain certified, every site of which lies inside one node of the
//    existing graph, and which no aspect of the graph already states, is drafted as the aspect `grain propose`
//    would write for it (the same renderer, `buildAspects`), attached to the deepest node that holds all its sites.
//    Only certified conventions — never the sub-gate lattice — so a draft here is a rule Grain would certify; only
//    those a mechanical check can hold, not those that state an absence, and not formatting (indentation, quotes);
//    one convention certified in several nodes is one item naming all of them; at most `RULE_CAP` items are listed
//    per run, the most widely followed first, the rest counted.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aspectLiterals, readGraph } from './yggdrasil-graph.mjs';

export const RULE_CAP = 20;

// ==================================================================================================
// 1. What the architecture forbids.
// ==================================================================================================
//
// A type's `relations:` table forbids every relation to `toType` only when its default is `deny` and no relation
// type it lists names `toType` or `*`. An absent table, or an absent default, allows — the same reading Yggdrasil
// gives it (`relations-flows-ports.md`).
export function typeForbids(arch, fromType, toType) {
  const rel = fromType ? arch?.node_types?.[fromType]?.relations : null;
  if (!rel || typeof rel !== 'object' || rel.default !== 'deny') return false;
  for (const [k, v] of Object.entries(rel)) {
    if (k === 'default') continue;
    if (Array.isArray(v) && (v.includes(toType) || v.includes('*'))) return false;
  }
  return true;
}
const underPath = (f, dir) => (dir === '.' ? !f.includes('/') : f === dir || f.startsWith(dir + '/'));

// One boundary against one graph: the nodes on each side, whether the law already holds it, what contradicts it.
export function boundaryStatus(bd, { g, raw, files, edges, declaredVia }) {
  const { from, to } = bd.boundary;
  const fromFiles = files.filter(f => underPath(f, from)),
    toFiles = files.filter(f => underPath(f, to));
  const owners = fs => {
    const s = new Set();
    let unowned = 0;
    for (const f of fs) {
      const o = g.ownerOf.get(f);
      if (o) s.add(o);
      else unowned++;
    }
    return { nodes: [...s].sort(), unowned };
  };
  const F = owners(fromFiles),
    T = owners(toFiles);
  const typeOf = id => g.byId.get(id)?.type || null;
  const arch = raw?.arch || {};
  const fromTypes = [...new Set(F.nodes.map(typeOf))].sort();
  const toTypes = [...new Set(T.nodes.map(typeOf))].sort();
  const allowing = [];
  for (const ft of fromTypes)
    for (const tt of toTypes) if (!ft || !tt || !typeForbids(arch, ft, tt)) allowing.push({ fromType: ft, toType: tt });
  const conflicts = [];
  // a node and its own ancestor or descendant need no relation between them: Yggdrasil exempts the hierarchy from the
  // undeclared-dependency check, so no type table can make a boundary between them law
  const nested = [];
  for (const a of F.nodes)
    for (const b of T.nodes) {
      if (a === b) continue;
      const via = declaredVia(g, a, b);
      if (via === 'relation' || via === 'ancestor-relation') conflicts.push({ from: a, to: b, via });
      else if (via === 'containment') nested.push({ from: a, to: b });
    }
  const fromSet = new Set(fromFiles),
    toSet = new Set(toFiles);
  const crossing = edges.filter(e => fromSet.has(e.from) && toSet.has(e.to));
  const promoted =
    F.nodes.length > 0 && T.nodes.length > 0 && F.unowned === 0 && T.unowned === 0 && !allowing.length && !conflicts.length && !nested.length && !F.nodes.some(n => T.nodes.includes(n));
  return {
    fromNodes: F.nodes,
    toNodes: T.nodes,
    fromUnowned: F.unowned,
    toUnowned: T.unowned,
    fromTypes,
    toTypes,
    allowing,
    conflicts,
    nested,
    violations: crossing.reduce((a, e) => a + (e.n || 1), 0),
    sites: crossing.slice(0, 10).map(e => ({ from: e.from, to: e.to, line: e.line ?? null })),
    promoted,
  };
}
// The ids of the boundary decisions the graph at `root` already makes law — what the edit-time flag skips.
// Memoised on the model; any failure to read the graph means nothing is promoted, so the flag keeps speaking.
export function promotedBoundaryIds(root, model, declaredVia, readNodeGraph) {
  if (model._promotedBoundaries instanceof Set) return model._promotedBoundaries;
  const out = new Set();
  model._promotedBoundaries = out;
  if (!(model.boundaries || []).length || !existsSync(join(root, '.yggdrasil'))) return out;
  try {
    const files = [...new Set([...(model.pathsAll || []), ...(model.filesAll || [])])].sort();
    const g = readNodeGraph(root, files);
    const raw = readGraph(root);
    for (const bd of model.boundaries) if (boundaryStatus(bd, { g, raw, files, edges: [], declaredVia }).promoted) out.add(bd.id);
  } catch {
    /* an unreadable graph promotes nothing */
  }
  return out;
}
export function boundaryRuleItems({ boundaries, g, raw, files, edges, declaredVia }) {
  const items = [];
  let promoted = 0,
    unattached = 0;
  for (const bd of boundaries || []) {
    const st = boundaryStatus(bd, { g, raw, files, edges, declaredVia });
    if (st.promoted) {
      promoted++;
      continue;
    }
    if (!st.fromNodes.length) {
      unattached++;
      continue;
    }
    const { from, to } = bd.boundary;
    const shared = st.fromNodes.filter(n => st.toNodes.includes(n));
    const sameType = st.allowing.filter(a => a.fromType && a.fromType === a.toType).map(a => a.fromType);
    const draft = {
      form: 'architecture-relations',
      deny: st.allowing.filter(a => a.fromType && a.toType && a.fromType !== a.toType).map(a => ({ type: a.fromType, mustNotReach: a.toType })),
      sharedNodes: shared,
      sameType,
      removeRelations: st.conflicts,
      nestedNodes: st.nested,
      untypedNodes: [...st.fromNodes, ...st.toNodes].filter(n => !g.byId.get(n)?.type),
    };
    const parts = [];
    if (draft.deny.length)
      parts.push(`in the architecture, ${draft.deny.map(d => `type \`${d.type}\` must not reach \`${d.mustNotReach}\``).join('; ')} (a \`relations:\` table with \`default: deny\` that does not list it)`);
    if (shared.length) parts.push(`node(s) ${shared.join(', ')} hold files on both sides, so only a finer cut of ${shared.length === 1 ? 'it' : 'them'} can separate the two`);
    if (sameType.length) parts.push(`both sides are type ${sameType.map(t => `\`${t}\``).join(', ')}, so a type table cannot forbid one without forbidding the type to reach itself — the sides need types of their own`);
    if (st.nested.length) parts.push(`${st.nested.map(c => `${c.from} and ${c.to}`).join(', ')} are one node inside the other, and a dependency along the hierarchy needs no relation, so no type table refuses it — the sides need nodes that do not contain each other`);
    if (st.conflicts.length) parts.push(`the graph declares ${st.conflicts.map(c => `${c.from} → ${c.to}`).join(', ')}, which the decision forbids`);
    if (st.toNodes.length === 0) parts.push(`no node owns a file under \`${to}/\` yet`);
    if (st.fromUnowned || st.toUnowned) parts.push(`${st.fromUnowned + st.toUnowned} file(s) on the two sides belong to no node, so no type can govern them`);
    if (draft.untypedNodes.length) parts.push(`node(s) ${draft.untypedNodes.join(', ')} have no type`);
    const crossing = st.violations
      ? ` ${st.violations} import${st.violations === 1 ? '' : 's'} cross it today (${st.sites.slice(0, 2).map(s => `${s.from} → ${s.to}`).join(', ')}${st.sites.length > 2 ? ', …' : ''}).`
      : ' Nothing crosses it today.';
    items.push({
      kind: 'rule',
      nodes: st.fromNodes,
      evidence: {
        origin: 'boundary',
        decision: bd.id,
        from,
        neverImports: to,
        decidedBy: bd.author || null,
        decidedAt: bd.createdAt || null,
        note: bd.note || null,
        fromNodes: st.fromNodes,
        toNodes: st.toNodes,
        fromTypes: st.fromTypes,
        toTypes: st.toTypes,
        violations: st.violations,
        violationSites: st.sites,
        declaredConflicts: st.conflicts,
        nestedNodes: st.nested,
        unownedFiles: st.fromUnowned + st.toUnowned,
        draft,
      },
      text: `\`${from}/\` never imports \`${to}/\` (maintainer decision ${bd.id}), and the architecture does not make it law yet: ${parts.join('; ') || 'nothing yet ties the two sides together'}.${crossing}`,
    });
  }
  return { items, survey: { decisions: (boundaries || []).length, promoted, emitted: items.length, unattached } };
}

// ==================================================================================================
// 2. Certified conventions that no aspect of the graph states.
// ==================================================================================================
//
// `buildAspects` needs a host type per partition; here every partition hosts itself (a pseudo-type whose directory
// is the partition), so each certified convention renders exactly as `propose` would render it, scope and check
// included. A partition that is a label rather than a directory (`_root`, `_repo`) has no path glob to scope a rule
// by and is skipped, counted.
const siteFiles = a => [...new Set([...(a.drills?.satisfies || []), ...(a.drills?.violates || [])].map(s => (typeof s === 'string' ? s.split('#')[0] : s?.rel)).filter(Boolean))];
function deepestCommonOwner(g, files) {
  let common = null;
  for (const f of files) {
    const o = g.ownerOf.get(f);
    if (!o) return null;
    const chain = [];
    const segs = o.split('/');
    for (let k = segs.length; k >= 1; k--) {
      const p = segs.slice(0, k).join('/');
      if (g.byId.has(p)) chain.push(p);
    }
    common = common === null ? chain : common.filter(x => chain.includes(x));
    if (!common.length) return null;
  }
  return common && common.length ? common[0] : null;
}
export function conventionRuleItems({ exp, model, g, raw, buildAspects, aspectYamlDoc, cap = RULE_CAP }) {
  const byName = new Map((model.partitions || []).map(p => [p.name, p]));
  const pseudo = [];
  let labels = 0;
  for (const p of exp.partitions || []) {
    if (!p.name || p.name.startsWith('_')) {
      labels++;
      continue;
    }
    pseudo.push({ id: `partition:${p.name}`, dir: p.name, files: new Set(byName.get(p.name)?.files || []), labelPartitions: [] });
  }
  const { aspects } = buildAspects(exp, pseudo, [], { quiet: true });
  const certified = aspects.filter(a => a.origin === 'certified-convention');
  // what the graph already states: an aspect of the same id (a proposal that was adopted keeps its ids), or an
  // aspect whose check names the same identifier
  const existingIds = new Set((raw?.aspects || []).map(a => a.id));
  const literals = new Set();
  for (const a of raw?.aspects || [])
    if (a.hasCheck)
      try {
        for (const l of aspectLiterals(readFileSync(join(a.dir, 'check.mjs'), 'utf8'))) literals.add(l);
      } catch {
        /* an unreadable check states nothing */
      }
  let stated = 0,
    spanning = 0,
    prose = 0,
    absence = 0,
    formatting = 0;
  const cands = [];
  for (const a of certified) {
    // only a rule a check can hold: a prose rule never leaves draft in a proposal either, and a rule that says
    // something is never there is an absence mining cannot tell from a prohibition (the proposal preamble)
    if (!a.check) {
      prose++;
      continue;
    }
    if (a.direction === 'absence') {
      absence++;
      continue;
    }
    // indentation and quoting belong to the repository's formatter, not to its architecture: a graph rule about them
    // duplicates tooling the repository already runs, or should
    if (a.enumerator === 'lex') {
      formatting++;
      continue;
    }
    if (existingIds.has(a.id) || (a.argument && literals.has(String(a.argument)))) {
      stated++;
      continue;
    }
    const host = deepestCommonOwner(g, siteFiles(a));
    if (!host) {
      spanning++;
      continue;
    }
    cands.push({ a, host });
  }
  // ONE RULE, ONE ITEM. The same convention (the same enumerator, argument and expected value over the same kind of
  // scope) certified in several partitions is one rule a maintainer decides once, not one per node: a list of the
  // same "types are PascalCase" eight times reads as eight findings and is one. The item names every node it holds
  // in, strongest first; `draft` is the strongest one's and `alsoIn` carries the others'.
  const groups = new Map();
  for (const c of cands) {
    const k = [c.a.enumerator, c.a.argument ?? '', String(c.a.expected ?? ''), c.a.kind ?? ''].join('\x00');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const byStrength = (p, q) => q.a.n - p.a.n || p.a.deviating - q.a.deviating || (p.a.id < q.a.id ? -1 : 1);
  const ranked = [...groups.values()].map(g => g.sort(byStrength));
  const total = g => g.reduce((x, c) => x + c.a.n, 0);
  ranked.sort((g, h) => total(h) - total(g) || byStrength(g[0], h[0]));
  const g0name = id => g.byId.get(id)?.name || id;
  const draftOf = ({ a, host }) => ({ form: 'aspect', attachTo: host, aspect: a.id, conforming: a.n, deviating: a.deviating, yaml: aspectYamlDoc(a, 'draft'), check: a.check });
  const items = ranked.slice(0, cap).map(g => {
    const { a, host } = g[0];
    const nodes = [...new Set(g.map(c => c.host))];
    const n = g.reduce((x, c) => x + c.a.n, 0),
      dev = g.reduce((x, c) => x + c.a.deviating, 0);
    const where = nodes.length === 1 ? `every one of them inside ${g0name(host)}` : `in ${nodes.length} nodes (${nodes.join(', ')})`;
    return {
      kind: 'rule',
      nodes,
      confidence: +(n / Math.max(1, n + dev)).toFixed(3),
      evidence: {
        origin: 'convention',
        aspect: a.id,
        name: a.name,
        conforming: n,
        deviating: dev,
        share: a.share,
        partition: a.partition,
        enumerator: a.enumerator,
        argument: a.argument ?? null,
        expected: a.expected ?? null,
        exemplars: a.exemplars,
        draft: draftOf(g[0]),
        alsoIn: g.slice(1).map(draftOf),
      },
      text:
        nodes.length === 1
          ? `${a.name} It already ${a.holds}, ${where}, and nothing in the graph states it.`
          : `${a.name} The same rule, each time over that node's own files, holds ${where}: ${n} of ${n + dev} sites follow it, and nothing in the graph states it in any of them.`,
    };
  });
  return {
    items,
    survey: { certified: certified.length, prose, absence, formatting, alreadyStated: stated, spanningNodes: spanning, labelPartitions: labels, drafts: cands.length, rules: ranked.length, emitted: items.length },
  };
}
