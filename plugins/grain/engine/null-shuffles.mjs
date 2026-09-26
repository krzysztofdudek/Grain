// grain engine · the randomisations behind `grain selftest --null` that learn() applies (moved out of learn.mjs)
//
// Nothing here is reached by a query: learn() calls these only when `selftest --null` hands it a random source.
// the label null behind `grain selftest --null`: the (role, ambiguous) labels of the assigned scopes of each kind, and
// the directories all scopes of each kind sit in, are dealt out again at random among those same scopes — group and
// directory sizes, ambiguity counts and every predicate survive; only the link between a scope and its group or its
// directory is destroyed. The directory is dealt out on `nullRel`, which only mine()'s directory contexts read.
// `grain selftest --null` only: the outcome labels the value and deviation cells read are dealt out again with their
// marginals kept. In each value container, each member is given to as many declaring files as carried it, chosen at
// random (each member keeps its carrier count, files lose their joint sets; a declaring file left with no member drops
// out, so the declaring population D, and with it every share, can shrink); over the whole history, the fix flags are dealt
// out again among all modification events (every scope keeps its edit count, the repository its fix count).
export function shuffleMembers(contFiles, rnd) {
  for (const fm of contFiles.values()) {
    const files = [...fm.keys()],
      keys = [...new Set([...fm.values()].flatMap(set => [...set]))].sort();
    const counts = keys.map(k => files.filter(f => fm.get(f).has(k)).length);
    for (const f of files) fm.set(f, new Set());
    keys.forEach((k, j) => {
      const pool = files.slice();
      for (let x = 0; x < counts[j]; x++) {
        const r = x + Math.floor(rnd() * (pool.length - x));
        [pool[x], pool[r]] = [pool[r], pool[x]];
        fm.get(pool[x]).add(k);
      }
    });
    for (const f of files) if (!fm.get(f).size) fm.delete(f);
  }
}
export function shuffleFixes(lc, rnd) {
  const rows = [...lc.entries()];
  let F = 0,
    M = 0;
  for (const [, L] of rows) {
    F += L.fix || 0;
    M += L.mods || 0;
  }
  const out = new Map();
  for (const [key, L] of rows) {
    let k = 0;
    for (let x = 0; x < (L.mods || 0); x++) {
      if (rnd() * M < F) {
        k++;
        F--;
      }
      M--;
    }
    out.set(key, k);
  }
  return out;
}
export function shuffleLabels(ps, ri, rnd) {
  const kinds = new Map();
  ps.forEach((s, i) => (kinds.get(s.kind) || kinds.set(s.kind, []).get(s.kind)).push(i));
  for (const idx of kinds.values()) {
    const rels = idx.map(i => ps[i].rel);
    for (let j = rels.length - 1; j > 0; j--) {
      const r = Math.floor(rnd() * (j + 1));
      [rels[j], rels[r]] = [rels[r], rels[j]];
    }
    idx.forEach((i, j) => (ps[i].nullRel = rels[j]));
  }
  const byKind = new Map();
  for (const [i] of ri.assign) {
    const k = ps[i].kind;
    (byKind.get(k) || byKind.set(k, []).get(k)).push(i);
  }
  for (const idx of byKind.values()) {
    const labels = idx.map(i => [ri.assign.get(i), ri.amb.has(i)]);
    for (let j = labels.length - 1; j > 0; j--) {
      const r = Math.floor(rnd() * (j + 1));
      [labels[j], labels[r]] = [labels[r], labels[j]];
    }
    idx.forEach((i, j) => {
      ri.assign.set(i, labels[j][0]);
      if (labels[j][1]) ri.amb.add(i);
      else ri.amb.delete(i);
    });
  }
}
// the one-group null (issue 390): within each scope kind, the predicates of every scope role induction assigned, in
// any partition, are dealt out again among those same scopes, so each partition keeps its number of assigned scopes
// and the repository its outcomes, and the partition an assigned scope's predicates are read in is destroyed
export function shuffleAssignedAcrossPartitions(prepared, rnd) {
  const byKind = new Map();
  for (const { ps, ri } of prepared)
    for (const [i] of ri.assign) (byKind.get(ps[i].kind) || byKind.set(ps[i].kind, []).get(ps[i].kind)).push(ps[i]);
  for (const scopes of byKind.values()) {
    const preds = scopes.map(s => s.preds);
    for (let j = preds.length - 1; j > 0; j--) {
      const r = Math.floor(rnd() * (j + 1));
      [preds[j], preds[r]] = [preds[r], preds[j]];
    }
    scopes.forEach((s, j) => (s.preds = preds[j]));
  }
}
