// grain engine · the measured architecture: dependency norms, architecture hits, and the relation layer of a learn pass
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { CFG } from './config.mjs';
import { refineModOf, hydrateTable, makeEdgeResolver } from './relations.mjs';
import { S } from './base.mjs';
import { kt, part } from './facts.mjs';
import { voice } from './mine.mjs';

// established layering norms: a (source module, target module) pair is a cell exactly like a `_all`-scoped predicate
// cell in mine() (§9.4a in mathematics.md) — counts = { true: files in A that reach B, false: files in A that don't },
// neff = |files in A| — decided with the IDENTICAL KT/BIC/index-cost test as mine()'s isAll branch (core.mjs mine(),
// ~line 552-560): same kt(), same CFG.lambda, no new constant. Uses the SAME refined module assignment as
// moduleGraph (via the shared refineModOf), consistently with computeArchHits below — both now agree with what
// report/rules display (§G11 fixed a prior inconsistency here), and its own edge aggregation straight from
// model.edges/model.filesAll — never model.moduleGraph's nodes/edges.
export function architectureNorms(model) {
  const files = model.filesAll || [];
  const pkgs = model.pkgs || [];
  const EMPTY = new Set();
  const refined = refineModOf(files, pkgs, model.srcRoots || []);
  const modOf = new Map();
  for (const f of files) modOf.set(f, refined(f));
  // per-file reached-module set: a target module counts once per file, regardless of how many edges/how much .n land on it
  const reached = new Map();
  for (const e of model.edges || []) {
    const a = modOf.get(e.from),
      b = modOf.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    (reached.get(e.from) || reached.set(e.from, new Set()).get(e.from)).add(b);
  }
  const filesOf = new Map(); // module -> its files
  for (const f of files) {
    const m = modOf.get(f);
    (filesOf.get(m) || filesOf.set(m, []).get(m)).push(f);
  }
  // candidate universe: every (A,B) with ≥ 1 file in A reaching B — counted ONCE, repo-wide, exactly as mine()'s C
  const pairs = new Map(); // "A\x01B" -> { A, B, trueN, neff }
  for (const [A, fs2] of filesOf) {
    const targets = new Set();
    for (const f of fs2) for (const b of reached.get(f) || EMPTY) targets.add(b);
    for (const B of targets) {
      let trueN = 0;
      for (const f of fs2) if ((reached.get(f) || EMPTY).has(B)) trueN++;
      pairs.set(A + S + B, { A, B, trueN, neff: fs2.length });
    }
  }
  // second candidate population (§J5.7a): (role-group, target module) pairs, the same cell shape one level finer
  // than a module. neff MUST be distinct FILES carrying a member of the group, never raw scope count — a file
  // holding 20 methods of one role is one file's worth of independent evidence about its own edges, not twenty,
  // and neff feeds directly into the BIC penalty and the λ bound below. Read off the SAME per-file `reached` map
  // the module-module population above uses — never rebuilt.
  const groupPairs = new Map(); // "part#role\x01B" -> { A: groupKey, B, trueN, neff }
  for (const part of model.partitions || []) {
    const filesByRole = new Map(); // role -> Set of distinct files carrying a member of that role
    for (const [key, role] of Object.entries(part.assignments || {})) {
      if (!Number.isInteger(role) || role === -1) continue;
      const path = key.slice(0, key.indexOf('#'));
      (filesByRole.get(role) || filesByRole.set(role, new Set()).get(role)).add(path);
    }
    for (const [role, fset] of filesByRole) {
      const A = part.name + '#' + role;
      const targets = new Set();
      for (const f of fset) for (const b of reached.get(f) || EMPTY) targets.add(b);
      for (const B of targets) {
        let trueN = 0;
        for (const f of fset) if ((reached.get(f) || EMPTY).has(B)) trueN++;
        groupPairs.set(A + S + B, { A, B, trueN, neff: fset.size });
      }
    }
  }
  // ONE idxCost over BOTH populations, counted before either's per-pair minRaw/minEff/bits filtering below — the
  // same discipline mine()'s own idxCost, bridgeBits' universe3 and J4.1's cellGlobal all follow: a widened
  // candidate universe is never split into two separately-taxed sub-universes. Consequence, real and unavoidable:
  // this raises the bar for module-module pairs too, so this function's output is no longer byte-identical to a
  // module-only computation on the same input (architecture-norms.test.mjs / group-arch-norms.test.mjs cover this).
  const idxCost = Math.ceil(Math.log2(Math.max(pairs.size + groupPairs.size, 2)));
  const K = 2;
  const preAccept = [];
  const evaluate = (A, B, trueN, neff, fromKind) => {
    const raw = neff; // every file counts exactly once (weight 1), so raw === neff for this cell shape
    if (raw < CFG.minRaw || neff < CFG.minEff) return;
    const counts = { true: trueN, false: neff - trueN };
    let data = 0;
    for (const v of ['true', 'false']) {
      const nv = counts[v];
      if (nv) data += nv * Math.log2(kt(counts, K, v, neff) * 2);
    }
    const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(neff, 2)) - idxCost;
    if (bits <= 0) return; // evidence = codelength gain, nothing else
    const exp = counts.true > counts.false ? 'true' : 'false';
    const ne = counts[exp];
    if (!((ne + 0.5) / (neff + K / 2) >= 1 - 1 / CFG.lambda)) return; // the one loss constant, same posterior-predictive bound
    preAccept.push({ from: A, to: B, exp, ne, neff, share: ne / neff, bits, fromKind });
  };
  for (const { A, B, trueN, neff } of pairs.values()) evaluate(A, B, trueN, neff, 'module');
  for (const { A, B, trueN, neff } of groupPairs.values()) evaluate(A, B, trueN, neff, 'group');
  // absence-boundary discipline (mirrors mine()'s presentSomewhere/partitionTrueShare, §9.4 in mathematics.md): a
  // module or group "never reaching B" is a boundary only against something a real, live option elsewhere — either
  // (a) some OTHER module's or group's accepted practice IS to reach B, or (b) reaching B is at least a non-trivial
  // share (mine()'s own repo-wide floor, 10%) of the files outside A. mine() ANDs its two conditions, but that is
  // for a partition-relative cell with a real parent population to contrast against; a module/group pair has none —
  // it IS the top-level population, like an `_all`-scoped fact — so either half of the live-option evidence
  // suffices here.
  const trueTargets = new Set(preAccept.filter(n => n.exp === 'true').map(n => n.to));
  // globalReachByB is drawn ONLY from the module-module population: modules already partition the whole repo, so
  // a group's reaching files are already counted here through their containing module — adding the group's own
  // trueN again would double-count the same files.
  const globalReachByB = new Map();
  for (const { B, trueN } of pairs.values()) globalReachByB.set(B, (globalReachByB.get(B) || 0) + trueN);
  const totalFiles = files.length;
  // n.trueN is not stored on preAccept entries (it would be a schema-visible field fully derivable from exp/ne/neff)
  const outsideShare = n => {
    const denom = totalFiles - n.neff;
    if (denom <= 0) return 0;
    const trueN = n.exp === 'true' ? n.ne : n.neff - n.ne;
    return (globalReachByB.get(n.to) - trueN) / denom;
  };
  return preAccept.filter(n => n.exp === 'true' || trueTargets.has(n.to) || outsideShare(n) >= 0.1);
}
// architecture: the file's CURRENT out-edges resolved against the accepted tree — a reference that creates the FIRST
// edge between two modules is a boundary crossing worth saying at edit time; one whose reverse already exists closes a
// cycle. Existing crossings (the module pair already has edges at HEAD) stay silent — practice already speaks there.
// Needs no partition: the advice works on a repo too small to hold convention norms.
export function computeArchHits({ model, root, effRel, relFact }) {
  const archHits = [];
  if (model.relDecls && relFact && model.moduleGraph) {
    try {
      const fileSet = new Set(model.filesAll || []);
      const resolve = makeEdgeResolver({
        root,
        fileSet,
        table: hydrateTable(model.relDecls),
        workspaces: model.workspaces || [],
        pkgs: model.pkgs || [],
        srcRoots: model.srcRoots || [],
        tsAliases: model.tsAliases || [],
        phpAutoload: model.phpAutoload || [],
        csGlobal: model.csGlobal || { usings: [], aliases: [] },
      });
      const mg = model.moduleGraph;
      const refined =
        model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || [], model.srcRoots || []));
      for (const e of resolve(effRel, relFact)) {
        const a = refined(effRel),
          b2 = refined(e.to);
        for (const bd of model.boundaries || []) {
          const inFrom =
            bd.boundary.from === '.'
              ? !effRel.includes('/')
              : (effRel + '/').startsWith(bd.boundary.from + '/');
          if (inFrom && (e.to + '/').startsWith(bd.boundary.to + '/'))
            archHits.push({
              line: e.line,
              to: e.to,
              kind: 'boundary-decision',
              id: bd.id,
              text: `[grain] ${voice('decided', `${bd.boundary.from}/ never imports ${bd.boundary.to}/ — your import of \`${e.to}\` (line ${e.line}) crosses it.${bd.note ? `\n  ${bd.note}` : ''}`, { typ: 'boundary', who: bd.author, when: bd.createdAt })}`,
            });
        }
        if (a === b2) continue;
        const fwd = mg.edges.find(x => x.from === a && x.to === b2);
        if (fwd) {
          // an established crossing — usually silence, unless THIS import is the measured exception to A's own norm
          const norm = (model.archNorms || []).find(
            n => n.fromKind === 'module' && n.from === a && n.to === b2 && n.exp === 'false'
          );
          if (norm)
            archHits.push({
              line: e.line,
              to: e.to,
              kind: 'layering-norm',
              text: `[grain] ${voice('practiced', `architecture: your import of \`${e.to}\` (line ${e.line}) reaches ${b2} — ${a}/ established practice is not to (${norm.neff - norm.ne} of ${norm.neff} files do, yours now included). Not forbidden, but it departs from what the rest of ${a}/ does.`)}`,
            });
          // group→module norms (§J5.7a): a finer population than the module — this file may belong to a role group
          // whose OWN established practice is not to reach b2, even where the module hit above stayed silent (or
          // fired for an unrelated reason). Membership is read straight off `part.assignments`, memoized on the
          // model like `_archModOf` (a closure can't survive model.json serialization, so it is recomputed once per
          // in-memory model and cached on it, never persisted).
          const fileGroups = model._archFileGroups || (model._archFileGroups = new Map());
          let groups = fileGroups.get(effRel);
          if (groups === undefined) {
            groups = [];
            for (const pt of model.partitions || [])
              for (const [key, role] of Object.entries(pt.assignments || {})) {
                if (!Number.isInteger(role) || role === -1) continue;
                if (key.slice(0, key.indexOf('#')) === effRel) groups.push(pt.name + '#' + role);
              }
            fileGroups.set(effRel, groups);
          }
          if (groups.length) {
            const gnorm = (model.archNorms || []).find(
              n => n.fromKind === 'group' && n.exp === 'false' && n.to === b2 && groups.includes(n.from)
            );
            if (gnorm) {
              const gi = gnorm.from.lastIndexOf('#');
              const gpart = (model.partitions || []).find(x => x.name === gnorm.from.slice(0, gi));
              const grole = +gnorm.from.slice(gi + 1);
              const glabel = (gpart && gpart.medoids[grole] && gpart.medoids[grole].label) || 'group';
              archHits.push({
                line: e.line,
                to: e.to,
                kind: 'layering-norm-group',
                text: `[grain] ${voice('practiced', `architecture: your import of \`${e.to}\` (line ${e.line}) reaches ${b2} — «${glabel}» established practice is not to (${gnorm.neff - gnorm.ne} of ${gnorm.neff} files do, yours now included). Not forbidden, but it departs from what the rest of «${glabel}» does.`)}`,
              });
            }
          }
          continue;
        }
        const rev = mg.edges.find(x => x.from === b2 && x.to === a);
        const via = mg.edges
          .filter(x => x.from === a)
          .map(x => x.to)
          .filter(m => m !== b2 && mg.edges.some(x2 => x2.from === m && x2.to === b2))
          .sort()[0];
        archHits.push({
          line: e.line,
          to: e.to,
          kind: rev ? 'cycle' : 'first-crossing',
          text: `[grain] ${voice(
            'practiced',
            rev
              ? `architecture: your import of \`${e.to}\` (line ${e.line}) CLOSES A CYCLE ${a} ↔ ${b2} — ${b2} already depends on ${a} (${rev.n} edge${rev.n > 1 ? 's' : ''}).`
              : `architecture: your import of \`${e.to}\` (line ${e.line}) is the FIRST edge ${a} → ${b2} (0 existing)${via ? ` — today ${a} reaches ${b2} via ${via} (an established path)` : ''}. Not forbidden, but it opens a dependency no one has opened before.`
          )}`,
        });
      }
    } catch {
      /* architecture advice must never break check */
    }
  }
  return archHits;
}
