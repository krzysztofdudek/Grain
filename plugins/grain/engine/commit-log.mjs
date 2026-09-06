// grain engine · the model sections read off the commit log: the language bridge (a message token to the files
// it names), the concepts the log and the code both say, and the recurring shapes of past commits
// Lifted out of `learn` (ticket 117): the statements below are the ones that stood there, unchanged.
import { CFG } from './config.mjs';
import { refineModOf } from './relations.mjs';
import { buildCards } from './cards.mjs';
import { archCellLabel, archCellSort, currentPathOf, kt } from './facts.mjs';
import { induceClusters } from './mine.mjs';
import { sufOf } from './placement.mjs';

// the language bridge: what files this repo touches when a commit message says <token> — pruned to living files,
// strongest tokens first; `where` cites it (with the example commit) for query words the code itself never says
export function applyMsgAffinity(model, H, files) {
  model.msgAffinity = [];
  if (H && H.msgAff) {
    const fset3 = new Set(files);
    // There is no df pre-filter (§J2.4b). Demoting a token for being common was backwards: for a pair carrying real
    // signal the data term grows LINEARLY in df while the penalty grows as 0.5·log2(df) — more commits saying the word
    // is more evidence, not less. What actually disqualifies a filler word is `k/df ≈ baza`, which is orthogonal to df
    // and already enforced below by the direction test and the λ bound.
    // A pair is a bridge only when coding the file's touched/not outcomes over the `df` commits that SAY the token —
    // at the KT-smoothed token-conditional rate — is CHEAPER than coding them at the file's own unconditional base
    // rate `fileCommits[f] / commitsN`, which needs no fitting. Same MDL/KT shape mine()/architectureNorms() decide
    // by. The `n >= 2` this replaces had no denominator: a file touched in most commits passed it for ANY token that
    // sat beside it twice, so the bridge repeated the file's base rate back as if it were a translation.
    // `baza` MUST be drawn from the same population as `fileCommits`/`msgTokCommits` — commits of 1..megaCap files.
    // `commitsN` counts every commit including mass ones, and dividing by it deflates every base rate by exactly the
    // mass-commit share, handing any token a free apparent excess that df then multiplies into hundreds of bits.
    const K3 = 2,
      nmc3 = H.nonMegaCommits || 1,
      fc3 = H.fileCommits || {};
    let universe3 = 0;
    for (const fm of Object.values(H.msgAff)) universe3 += Object.keys(fm).length; // counted ONCE repo-wide over the unfiltered candidates, as architectureNorms counts pairs.size
    const idxCost3 = Math.ceil(Math.log2(Math.max(universe3, 2)));
    const bridgeBits = (t, f, k) => {
      const df = (H.msgTokCommits || {})[t] || 0;
      if (!df) return null;
      const baza = (fc3[f] || 0) / nmc3;
      if (!(baza > 0 && baza < 1)) return null; // a never-touched or always-touched file has no rate to beat
      if (!(k / df > baza)) return null; // a bridge is EXCESS touching, never a deficit
      if (!((k + 0.5) / (df + K3 / 2) >= 1 - 1 / CFG.lambda)) return null; // the one loss constant, on the touched outcome specifically
      const counts = { touched: k, not: df - k };
      let data = 0;
      if (k) data += k * Math.log2(kt(counts, K3, 'touched', df) / baza);
      if (df - k) data += (df - k) * Math.log2(kt(counts, K3, 'not', df) / (1 - baza));
      const bits = data - 0.5 * (K3 - 1) * Math.log2(Math.max(df, 2)) - idxCost3;
      return bits > 0 ? bits : null;
    };
    const rows = Object.entries(H.msgAff)
      .map(([t, fm]) => {
        const fs3 = Object.entries(fm)
          .map(([f, n]) => {
            if (!fset3.has(f)) return null;
            const b = bridgeBits(t, f, n);
            return b === null ? null : [f, n, b];
          })
          .filter(Boolean)
          .sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : 1))
          .slice(0, 6); // strongest evidence first: bits, not raw co-occurrence count
        const tot = fs3.reduce((a2, [, n]) => a2 + n, 0);
        return tot >= 2 ? { t, files: fs3, ex: (H.msgAffEx || {})[t] || null } : null;
      })
      .filter(Boolean);
    model.msgAffinity = rows
      .sort(
        (a, b) =>
          b.files.reduce((x, [, n]) => x + n, 0) - a.files.reduce((x, [, n]) => x + n, 0) ||
          (a.t < b.t ? -1 : 1)
      )
      .slice(0, 1500);
  }
}
// concepts (§J4.3b): the top repo-wide tokens where BOTH the commit messages and the code itself say something —
// `H.msgTokCommits` (commit-message document frequency, §J2.4) times each token's card-level document frequency
// (how many of buildCards(model)'s cards carry it). A token absent from either side scores 0 by construction, so
// this is never a global dictionary, only genuinely shared vocabulary. Precomputed here (mirroring `model.moves`
// just below) because `sessionContext` can neither load history (no refresh, no parsing — must stay instant) nor
// afford `buildCards(model)` inside a hook that today does nothing but read a JSON file; this is the one place in
// the codebase allowed to pay that cost, since it runs only at index/re-learn time, never per query.
export function applyConcepts(model, H) {
  model.concepts = [];
  if (H) {
    const cardDf = new Map();
    for (const card of buildCards(model))
      for (const t of card.toks.keys()) cardDf.set(t, (cardDf.get(t) || 0) + 1);
    const msgTokCommits = H.msgTokCommits || {};
    const keys = new Set([...Object.keys(msgTokCommits), ...cardDf.keys()]);
    const scored = [];
    for (const t of keys) {
      const score = (msgTokCommits[t] || 0) * (cardDf.get(t) || 0);
      if (score > 0) scored.push([t, score]);
    }
    model.concepts = scored
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 12)
      .map(([t]) => t);
  }
}
// change archetypes (§J4.1): the recurring SHAPES of past commits. A footprint's CELLS are the coarse, still-live
// coordinates of what it touched — the refined module of each file, the role group of each scope it changed, the
// file suffix — and `induceClusters` finds the combinations that recur. A cell is CERTIFIED for an archetype only
// when coding its present/absent split at the archetype's own rate is cheaper than coding it at the whole
// history's base rate: the same CONTRAST branch mine() uses for a role cell against `_all:` (core.mjs's `else`
// arm), because an archetype is a sub-population of all footprints in exactly the way a role is of its partition.
// A cell every commit in the repository touches carries no shape, however unanimous it is inside one archetype.
export function applyChangeArchetypes(model, H) {
  model.changeArchetypes = [];
  if (H && H.fps && H.fps.length) {
    const refinedM =
      model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || [], model.srcRoots || []));
    const liveM = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
    const currentOf = currentPathOf(H.fps, liveM);
    // a scope renamed IN PLACE (its file kept) keeps its historical `#kind#name` half and simply fails to resolve
    // against today's assignments — an accepted residual miss, not something this pass tries to undo
    const cellsOf = fp => {
      const out = new Set();
      for (const f of fp.files) {
        const cur = currentOf(f);
        out.add('m:' + refinedM(cur));
        const sf = sufOf(cur);
        if (sf) out.add('k:' + sf);
      }
      for (const key of fp.scopes || []) {
        const i = key.indexOf('#');
        if (i < 0) continue;
        const k2 = currentOf(key.slice(0, i)) + key.slice(i);
        for (const p of model.partitions) {
          const r = p.assignments[k2];
          if (!Number.isInteger(r) || r === -1) continue;
          out.add('g:' + p.name + '#' + r);
          break;
        }
      }
      return out;
    };
    const fpCells = new Map();
    for (const fp of H.fps) fpCells.set(fp, cellsOf(fp));
    const cellGlobal = new Map();
    for (const [, cs] of fpCells) for (const c of cs) cellGlobal.set(c, (cellGlobal.get(c) || 0) + 1);
    const dfTok = new Map();
    for (const fp of H.fps) for (const t of fp.toks) dfTok.set(t, (dfTok.get(t) || 0) + 1);
    // the index cost, counted ONCE repo-wide over the REAL candidate population — the same shape mine() (`C` at its
    // own cell loop), architectureNorms and bridgeBits all count it in, never per cluster
    let C = 0;
    for (const [, g] of cellGlobal) if (g >= CFG.minRaw) C++;
    const idxCost = Math.ceil(Math.log2(Math.max(C, 2)));
    const N = H.fps.length,
      K = 2;
    // `induceClusters` samples at NCAP distinct footprint signatures: past that, an archetype's members are the
    // footprints in its surviving buckets and `n` counts exactly those — a real, enumerable set of commits, which
    // is what "k of n" claims. It is not a scaled-up estimate of a larger population.
    const { clusters } = induceClusters(H.fps, { feats: fp => fpCells.get(fp) });
    const archetypes = [];
    for (const c of clusters) {
      if (c.members.length < CFG.minRaw) continue;
      const n = c.members.length;
      const cnt = new Map();
      for (const fp of c.members) for (const cell of fpCells.get(fp)) cnt.set(cell, (cnt.get(cell) || 0) + 1);
      const cells = [];
      for (const [cell, k] of cnt) {
        const local = { present: k, absent: n - k };
        const gp = cellGlobal.get(cell) || 0;
        const glob = { present: gp, absent: N - gp };
        let data = 0;
        for (const v of ['present', 'absent']) {
          const nv = local[v];
          if (nv) data += nv * Math.log2(kt(local, K, v, n) / kt(glob, K, v, N));
        }
        const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(n, 2)) - idxCost;
        // evidence, then the one loss constant, then vacuity: a cell the MAJORITY of the shape's own members do not
        // touch describes what the shape avoids, and J4.2 would render it as a missing place to go add a file to
        const certified = bits > 0 && (k + 0.5) / (n + K / 2) >= 1 - 1 / CFG.lambda && k * 2 > n;
        cells.push({ cell, k, share: +(k / n).toFixed(3), bits: +bits.toFixed(2), certified });
      }
      cells.sort(archCellSort);
      const cert = cells.filter(x => x.certified);
      if (!cert.length) continue; // a shape with nothing certified is not a shape
      const tc = new Map();
      for (const fp of c.members) for (const t of fp.toks) tc.set(t, (tc.get(t) || 0) + 1);
      const toks = [...tc]
        .map(([t, k2]) => [t, k2 * Math.log2(1 + N / (dfTok.get(t) || 1))])
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 8)
        .map(([t]) => t);
      // `fps` carries only a commit's ≤12 normalized message tokens, never its subject — the same limitation
      // `howCmd` works around with a git lookback it cannot do here, and falls back to exactly this joined string
      const exemplars = [...c.members]
        .sort((a, b) => b.ts - a.ts || (a.sha < b.sha ? -1 : a.sha > b.sha ? 1 : 0))
        .slice(0, 3)
        .map(fp => [fp.sha, fp.toks.length ? fp.toks.join(' ') : '(no commit message)', fp.ts]);
      archetypes.push({
        label: cert
          .slice(0, 3)
          .map(x => archCellLabel(model, x.cell))
          .join(' + '),
        n,
        cells,
        exemplars,
        toks,
      });
    }
    archetypes.sort((a, b) => b.n - a.n || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    model.changeArchetypes = archetypes.map((a, i) => ({ id: 'ca' + (i + 1), ...a }));
  }
}
