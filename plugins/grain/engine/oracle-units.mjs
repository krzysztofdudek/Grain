// grain oracle · ownership units: what a graph gives each file as its owner, whether or not a node names it (issue 509)
//
// The node measures in oracle.mjs score what each graph's NODES map. A graph written in the types shape
// (`grain propose --shape types`, or any graph with `coverage.type_level: true`) writes a node only where a place
// needs its own identity and covers every other file by the one type whose `when` matches it — so scoring its nodes
// alone scores a fraction of what it says, and counts every type-covered file as unowned. An ownership unit is the
// reading Yggdrasil itself applies:
//
//   a file belongs to the DEEPEST node whose mapping selects it (ties as in `ownership`, oracle-partition.mjs);
//   a file no node maps belongs to the ONE classifying type whose `when` selects it — only when that graph turns
//   type-level coverage on, and never when two types select it (Yggdrasil refuses that file as ambiguous) or when a
//   type with `enforce: strict` selects it (Yggdrasil leaves that file to the strict scan, which wants a node of that
//   type mapping it, and does not count it covered: a strict orphan is owned by nobody).
//
// Each graph is read under its OWN `coverage.type_level`: a node-shape graph without the switch gets no type units,
// because Yggdrasil does not cover those files either. A record written before this field existed carries no switch
// for either side and is read as node-only, and the score says so.
//
// A unit's relations are the ones declared about it: a node unit keeps its node's `relations` (a target that owns no
// file of its own — an organizational parent — stands for every unit of its subtree), a type unit keeps its type's
// `relations:` block (every listed target type stands for every unit of that type: the type's own unit and the units
// of the nodes typed with it). The result has the shape the node measures take (`{ nodes: [{ id, files, relations }] }`),
// so the same Jaccard, relation, partition and projection measures run over units unchanged.
import { ownership } from './oracle-partition.mjs';

export const nodeUnit = id => `node:${id}`;
export const typeUnit = id => `type:${id}`;

// the targets a type's `relations:` block lists, every relation kind but `default`
export function typeRelationTargets(relations) {
  const out = [];
  if (!relations || typeof relations !== 'object' || Array.isArray(relations)) return out;
  for (const [kind, list] of Object.entries(relations)) {
    if (kind === 'default' || !Array.isArray(list)) continue;
    for (const t of list) if (typeof t === 'string') out.push({ target: t, type: kind });
  }
  return out;
}

export function unitsOf(side) {
  const typeLevel = side.typeLevel === true;
  const owner = new Map([...ownership(side.nodes)].map(([f, id]) => [f, nodeUnit(id)]));
  const typeCovered = new Set();
  if (typeLevel) {
    const matches = new Map(), strictClaimed = new Set();
    for (const t of side.types || []) {
      if (!t.classifying) continue;
      for (const f of t.files) {
        if (owner.has(f)) continue;
        matches.set(f, (matches.get(f) || []).concat(t.id));
        if (t.strict === true) strictClaimed.add(f);
      }
    }
    for (const [f, ts] of matches) if (ts.length === 1 && !strictClaimed.has(f)) { owner.set(f, typeUnit(ts[0])); typeCovered.add(f); }
  }
  const filesOf = new Map();
  for (const [f, u] of owner) (filesOf.get(u) || filesOf.set(u, []).get(u)).push(f);

  // what a relation target stands for, in units
  const unitsOfType = new Map();
  for (const n of side.nodes) if (n.type && filesOf.has(nodeUnit(n.id))) (unitsOfType.get(n.type) || unitsOfType.set(n.type, []).get(n.type)).push(nodeUnit(n.id));
  for (const u of filesOf.keys()) if (u.startsWith('type:')) { const t = u.slice(5); (unitsOfType.get(t) || unitsOfType.set(t, []).get(t)).push(u); }
  const nodeTarget = id => {
    if (filesOf.has(nodeUnit(id))) return [nodeUnit(id)];
    const pre = id + '/';
    const below = side.nodes.filter(m => m.id.startsWith(pre) && filesOf.has(nodeUnit(m.id))).map(m => nodeUnit(m.id));
    return below.length ? below : [nodeUnit(id)]; // kept unresolved, so the relation measures count it as an end with no counterpart
  };

  const units = [];
  const relsOf = (from, targets) => [...new Set(targets.filter(t => t !== from))].map(target => ({ target }));
  for (const n of side.nodes) {
    const id = nodeUnit(n.id);
    if (!filesOf.has(id)) continue;
    units.push({ id, files: filesOf.get(id).sort((a, b) => a - b), relations: relsOf(id, (n.relations || []).flatMap(r => nodeTarget(r.target))) });
  }
  for (const t of side.types || []) {
    const id = typeUnit(t.id);
    if (!filesOf.has(id)) continue;
    units.push({ id, files: filesOf.get(id).sort((a, b) => a - b), relations: relsOf(id, (t.relations || []).flatMap(r => unitsOfType.get(r.target) || [typeUnit(r.target)])) });
  }
  return { nodes: units, typeLevel: side.typeLevel ?? null, owned: owner.size, typeCovered: typeCovered.size };
}
