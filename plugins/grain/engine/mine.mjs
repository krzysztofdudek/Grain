// grain engine · clustering, roles and the MDL/lambda miner, plus the deviant, marker, held and authorship summaries
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { CFG, NCAP } from './config.mjs';
import { S, UNSEEN } from './base.mjs';
import { STRUCT_PID, isBool, jac, jacW, kt, part, pct, ptr, skeyR } from './facts.mjs';
import { deviationPhrase, scopeBacktick } from './verbalize.mjs';
import { valOf } from './weights.mjs';

// ===== CLUSTERING =====
// The generic half of role induction (§J4.1): bucket identical feature bags, cap the sample, agglomerate by weighted
// Jaccard under an MDL stop, and pick each surviving cluster's medoid. Everything SCOPE-specific stays with the
// caller — which items are eligible, how a cluster is labelled, and how the rest of the population is assigned to
// the medoids — because none of it survives a change of subject: a commit footprint has no `kind`/`ownCount` to
// filter on, carries no `tok:`/`dec:`/`sup:` features to be named from, and is not a scope `assignAll` can place.
// `induceRoles` clusters scopes; `learn`'s change-archetype pass clusters commit footprints; they share this and
// nothing else.
export function induceClusters(items, { feats, w = () => 1 }) {
  // pre-bucket identical feature bags before sampling: identical twins can never be split by the sample cap,
  // and effective clustering capacity rises from NCAP items to NCAP *distinct bags*
  const buckets = new Map();
  for (const g of items) {
    const sig = [...feats(g)].sort().join(S);
    (buckets.get(sig) || buckets.set(sig, []).get(sig)).push(g);
  }
  let reps = [...buckets.values()];
  if (reps.length > NCAP) {
    const st = reps.length / NCAP;
    const rs = [];
    for (let k = 0; k < NCAP; k++) rs.push(reps[Math.floor(k * st)]);
    reps = rs;
  }
  const N = reps.length;
  const W = reps.map(r => r.reduce((a, x) => a + w(x), 0));
  if (W.reduce((a, b) => a + b, 0) < 12) return { clusters: [] };
  const SA = reps.map(r => feats(r[0]));
  const D = new Float64Array(N * N);
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const d = 1 - jacW(SA[i], SA[j]);
      D[i * N + j] = D[j * N + i] = d;
    }
  const act = new Set(Array.from({ length: N }, (_, i) => i));
  const mem = Array.from({ length: N }, (_, i) => [i]);
  const size = new Float64Array(N);
  for (let i = 0; i < N; i++) size[i] = W[i];
  const cdl = m => {
    const nc = m.reduce((a, x) => a + W[x], 0);
    const cnt = new Map();
    for (const x of m) for (const f of SA[x]) cnt.set(f, (cnt.get(f) || 0) + W[x]);
    let dl = 0;
    for (const [, c] of cnt) {
      const p = c / nc;
      const h = p >= 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
      dl += nc * h + 0.5 * Math.log2(Math.max(nc, 2));
    }
    return dl;
  };
  const dls = mem.map(cdl);
  let sum = dls.reduce((a, b) => a + b, 0);
  let bestDL = sum + act.size * Math.log2(N),
    best = [...act].map(i => [...mem[i]]);
  while (act.size > 1) {
    let bi = -1,
      bj = -1,
      bd = Infinity;
    const A = [...act];
    for (let x = 0; x < A.length; x++)
      for (let y = x + 1; y < A.length; y++) {
        const d = D[A[x] * N + A[y]];
        if (d < bd) {
          bd = d;
          bi = A[x];
          bj = A[y];
        }
      }
    for (const k of act) {
      if (k === bi || k === bj) continue;
      D[bi * N + k] = D[k * N + bi] =
        (size[bi] * D[bi * N + k] + size[bj] * D[bj * N + k]) / (size[bi] + size[bj]);
    }
    mem[bi] = mem[bi].concat(mem[bj]);
    size[bi] += size[bj];
    act.delete(bj);
    sum -= dls[bi] + dls[bj];
    dls[bi] = cdl(mem[bi]);
    sum += dls[bi];
    const t = sum + act.size * Math.log2(N);
    if (t < bestDL) {
      bestDL = t;
      best = [...act].map(i => [...mem[i]]);
    }
  }
  const D0 = (i, j) => (i === j ? 0 : 1 - jacW(SA[i], SA[j]));
  return {
    clusters: best
      .filter(m => m.reduce((a, x) => a + W[x], 0) >= 3)
      .map(m => {
        let b = m[0],
          bs = Infinity;
        for (const i of m) {
          let s2 = 0;
          for (const j of m) s2 += W[j] * D0(i, j);
          if (s2 < bs) {
            bs = s2;
            b = i;
          }
        }
        return {
          members: m.flatMap(i => reps[i]),
          weight: m.reduce((a, x) => a + W[x], 0),
          medoid: reps[b][0],
        };
      }),
  };
}
// ===== ROLES =====
export function induceRoles(ps) {
  const el = [];
  ps.forEach((s, i) => {
    if (s.kind !== 'file' && s.kind !== 'module' && s.ownCount >= 2) el.push(i);
  });
  const { clusters } = induceClusters(el, { feats: i => ps[i].feats });
  const medoids = clusters.map(c => {
    // label (display only): the three name/decorator/supertype features most shared across the cluster, not the medoid's
    // first three — a medoid named `AddressGuard` would otherwise label the whole guard role "address+guard+CanActivate"
    const fc = new Map();
    for (const i of c.members)
      for (const f of ps[i].feats) if (/^(tok|dec|sup|own):/.test(f)) fc.set(f, (fc.get(f) || 0) + 1);
    // the label may only name what a MAJORITY carries — 3 of 9 members' @UseGuards must not baptize the group
    const label =
      [...fc]
        .filter(([, w2]) => w2 >= c.weight / 2)
        .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
        .slice(0, 3)
        .map(([f]) => f.slice(4))
        .join('+') || 'group';
    return { feats: ps[c.medoid].feats, label };
  });
  const { assign, amb } = assignAll(ps, medoids);
  return { assign, amb, medoids };
}
export function assignAll(ps, medoids) {
  const assign = new Map(),
    amb = new Set(),
    scores = new Map();
  ps.forEach((s, i) => {
    if (s.kind === 'file' || s.kind === 'module' || s.ownCount < 2 || !medoids.length) return;
    let b = -1,
      m1 = -1;
    medoids.forEach((md, k) => {
      const m = jacW(s.feats, md.feats);
      if (m > m1) {
        m1 = m;
        b = k;
      }
    });
    if (b < 0) return; // unreachable once `!medoids.length` above already bailed — defensive only
    // the gap runner-up must be a genuinely DIFFERENT role: a near-clone of the best medoid
    // (two clusters of the same latent role surviving the cut) must not manufacture ambiguity
    let m2 = -1,
      b2 = -1;
    medoids.forEach((md, k) => {
      if (k === b || jacW(medoids[b].feats, md.feats) >= 0.6) return;
      const m = jacW(s.feats, md.feats);
      if (m > m2) {
        m2 = m;
        b2 = k;
      }
    });
    // (§003 B) the live nearest/next-nearest medoid this run computed, kept regardless of whether the scope clears
    // CFG.minMemb — checkFile's new-scope disclosure is the only consumer; `assign`/`amb` below are unaffected and
    // unchanged from before this field existed
    scores.set(i, { best: b, m1, second: b2, m2 });
    if (m1 <= 0) return;
    if (m1 < CFG.minMemb || m1 - m2 < CFG.ambGap) amb.add(i);
    assign.set(i, b);
  });
  return { assign, amb, scores };
}
// ===== MINING (v5 math + seeds + survived-raw + role_lift) =====
// candidate count for the index cost: cells with ≥ minRaw raw instances — counted the same way mine() counts them
export function countCandidates(ps, ri) {
  return mine(ps, ri, () => 1, [], null, null, { countOnly: true }).C;
}
export function mine(ps, ri, wfn, seeds, ageFn, dbg, { countOnly = false, idxCostOverride = null } = {}) {
  const cells = new Map();
  const alph = new Map();
  const add = (cid, pid, v, w, rw, gi, surv) => {
    const k = cid + S + pid;
    let c = cells.get(k);
    if (!c) {
      c = {
        counts: Object.create(null),
        raw: Object.create(null),
        sraw: Object.create(null),
        members: Object.create(null),
      };
      cells.set(k, c);
    }
    c.counts[v] = (c.counts[v] || 0) + w;
    c.raw[v] = (c.raw[v] || 0) + rw;
    if (surv) c.sraw[v] = (c.sraw[v] || 0) + rw;
    if (gi >= 0) (c.members[v] ||= []).push(gi);
    let a = alph.get(pid);
    if (!a) {
      a = new Set();
      alph.set(pid, a);
    }
    a.add(v);
  };
  // directory contexts (pattern locality below the partition): ancestor dirs holding ≥ dirMin scopes of a kind,
  // but fewer than the whole partition — a proper spatial sub-community that can carry its own local default
  const dirsOf = rel => {
    const segs = rel.split('/').slice(0, -1);
    const out2 = [];
    for (let k = 1; k <= segs.length; k++) out2.push(segs.slice(0, k).join('/'));
    return out2;
  };
  const dirCount = new Map();
  for (const s of ps)
    for (const d of dirsOf(s.rel)) {
      const k = d + S + s.kind;
      dirCount.set(k, (dirCount.get(k) || 0) + 1);
    }
  const kindTotal = new Map();
  for (const s of ps) kindTotal.set(s.kind, (kindTotal.get(s.kind) || 0) + 1);
  const dirEligible = k => dirCount.get(k) >= CFG.dirMin && dirCount.get(k) < kindTotal.get(k.split(S)[1]);
  ps.forEach((s, i) => {
    const w = wfn(s);
    const surv = ageFn ? ageFn(s) >= CFG.freshDays : true;
    for (const [pid, v] of Object.entries(s.preds)) {
      add('_all:' + s.kind, pid, v, w, 1, i, surv);
      const r = ri.assign.get(i);
      if (r !== undefined)
        add(
          'r' + r + ':' + s.kind,
          pid,
          v,
          w * (ri.amb.has(i) ? 0.5 : 1),
          ri.amb.has(i) ? 0 : 1,
          ri.amb.has(i) ? -1 : i,
          surv
        );
      for (const d of dirsOf(s.rel))
        if (dirEligible(d + S + s.kind)) add('d[' + d + ']:' + s.kind, pid, v, w, 1, i, surv);
    }
  });
  // seeds: pid-scoped pseudo-counts, capped at 0.5 × n_eff_real of the cell
  const seedMarks = new Map(); // cid\x01pid → [{ id, v }]: which value a maintainer seeded in that cell
  for (const sd of seeds || []) {
    const gi = ps.findIndex(s => s.rel === sd.path && s.name === sd.name);
    if (gi < 0) continue;
    const s = ps[gi];
    const r = ri.assign.get(gi);
    // a seeded surface carries its correlated surfaces along: the statement shape of `validate(cmd)` has the same opposing
    // population as `calls validate`, and a seed on one that left the other untouched would resurface the retired rule as a
    // "sibling surface" deviation (measured on the fixture). Correlation = the members that hold the majority value on P
    // are the members that hold the majority value on Q (Jaccard ≥ 0.9), in the exemplar's partition-wide cell.
    const opposing = (cid, pid, v) => {
      const c = cells.get(cid + S + pid);
      if (!c) return null;
      const out2 = new Set();
      for (const [x, gis] of Object.entries(c.members)) if (x !== v) for (const g2 of gis) out2.add(g2);
      return out2;
    };
    const pids = new Set(sd.pids);
    for (const pid of sd.pids) {
      const v = s.preds[pid];
      if (v === undefined) continue;
      const oppP = opposing('_all:' + s.kind, pid, v);
      if (!oppP || oppP.size < CFG.minRaw) continue;
      for (const [q, vq] of Object.entries(s.preds)) {
        if (pids.has(q) || /^auto\.dir\d/.test(q)) continue;
        const oppQ = opposing('_all:' + s.kind, q, vq);
        if (oppQ && oppQ.size >= CFG.minRaw && jac(oppP, oppQ) >= 0.9) pids.add(q);
      }
    }
    for (const pid of pids) {
      const v = s.preds[pid];
      if (v === undefined) continue;
      // the exemplar's partition-wide cell, its group cell and its directory cells (a steer is usually local: "handlers under src/routes/")
      const cids = [
        '_all:' + s.kind,
        ...(r !== undefined ? ['r' + r + ':' + s.kind] : []),
        ...dirsOf(s.rel)
          .filter(d => dirEligible(d + S + s.kind))
          .map(d => 'd[' + d + ']:' + s.kind),
      ];
      // a RETIREMENT (the exemplar does not carry the surface: value 'false') must also reach every cell where the retired
      // rule fires as 'true' — the old majority lives in its own group's cell, which the exemplar is no member of
      if (v === 'false' && isBool(pid))
        for (const [k2, c2] of cells) {
          const [cid2, pid2] = k2.split(S);
          if (pid2 !== pid || cid2.split(':')[1] !== s.kind || cids.includes(cid2)) continue;
          let exp2 = null,
            ne2 = -1;
          for (const [x, n2] of Object.entries(c2.counts))
            if (n2 > ne2) {
              exp2 = x;
              ne2 = n2;
            }
          if (exp2 === 'true') cids.push(cid2);
        }
      for (const cid of cids) {
        const c = cells.get(cid + S + pid);
        if (!c) continue;
        const neffReal = Object.values(c.counts).reduce((a, b) => a + b, 0);
        add(cid, pid, v, Math.min(sd.weight, 0.5 * neffReal), 0, -1, false);
        (seedMarks.get(cid + S + pid) || seedMarks.set(cid + S + pid, []).get(cid + S + pid)).push({
          id: sd.id,
          v,
        });
      }
    }
  }
  let C = 0;
  for (const [, c] of cells) if (Object.values(c.raw).reduce((a, b) => a + b, 0) >= CFG.minRaw) C++;
  if (countOnly) return { facts: [], C, idxCost: 0 };
  // index cost = log2(C₂) over the candidate count of the WHOLE repository (§9.4a) — counted once across partitions, never per partition
  const idxCost = idxCostOverride ?? Math.ceil(Math.log2(Math.max(C, 2)));
  let out = [];
  for (const [key, cell] of cells) {
    const [cid, pid] = key.split(S);
    const kind = cid.split(':')[1];
    const isAll = cid.startsWith('_all');
    const raw = Object.values(cell.raw).reduce((a, b) => a + b, 0);
    const neff = Object.values(cell.counts).reduce((a, b) => a + b, 0);
    if (raw < CFG.minRaw || neff < CFG.minEff) continue;
    const bl = isBool(pid);
    const Vv = bl ? ['true', 'false'] : [...alph.get(pid)].sort();
    const K = bl ? 2 : Vv.length + 1;
    const allCell = isAll ? cell : cells.get('_all:' + kind + S + pid);
    const allN = allCell ? Object.values(allCell.counts).reduce((a, b) => a + b, 0) : neff;
    let data = 0;
    if (isAll) {
      const B = Math.max(bl ? 2 : Vv.length, 2);
      for (const v of Vv) {
        const nv = cell.counts[v] || 0;
        if (nv) data += nv * Math.log2(kt(cell.counts, K, v, neff) * B);
      }
    } else
      for (const v of Vv) {
        const nv = cell.counts[v] || 0;
        if (nv) data += nv * Math.log2(kt(cell.counts, K, v, neff) / kt(allCell.counts, K, v, allN));
      }
    const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(neff, 2)) - idxCost;
    if (dbg && pid.includes(dbg))
      console.error(
        `[dbg] ${cid} ${pid} raw=${raw} neff=${neff.toFixed(1)} data=${data.toFixed(1)} bits=${bits.toFixed(1)} counts=${JSON.stringify(cell.counts)} sraw=${JSON.stringify(cell.sraw)}`
      );
    if (bits <= 0) continue; // evidence = codelength gain, nothing else
    let exp = null,
      ne = -1;
    for (const v of Vv) {
      const c = cell.counts[v] || 0;
      if (c > ne) {
        exp = v;
        ne = c;
      }
    }
    // the DECISION: name `exp` only when the KT posterior predictive bounds the error at 1 in λ — the one loss constant
    const tau = Math.log2(CFG.lambda);
    if (!((ne + 0.5) / (neff + K / 2) >= 1 - 1 / CFG.lambda)) continue;
    const sraw = Object.values(cell.sraw).reduce((a, b) => a + b, 0);
    const srawShare = sraw >= CFG.minRaw ? (cell.sraw[exp] || 0) / sraw : -1;
    // the PRINTED population must clear the same bound: survival weights must not carry a claim its own display denies
    if (sraw < CFG.minRaw || !(((cell.sraw[exp] || 0) + 0.5) / (sraw + K / 2) >= 1 - 1 / CFG.lambda))
      continue;
    if (bl && isAll && exp === 'false' && !(cell.raw['true'] > 0)) continue; // vacuous (§9.4d): "never X" when nothing here ever X-ed is a non-choice; an all-true fact is a real convention
    if (/^auto\.dir\d/.test(pid) && !/^r\d/.test(cid)) continue; // placement is group-only (a dir context "predicting" its own path is tautology)
    if (!bl && ['other', 'none', 'mixed', '?'].includes(exp)) continue; // fallback buckets never expected
    let parentExp = null; // the enclosing context's default, for locality-contrast messaging
    if (!isAll && allCell) {
      let pe = null,
        pn = -1;
      for (const v of Object.keys(allCell.counts)) {
        if (allCell.counts[v] > pn) {
          pe = v;
          pn = allCell.counts[v];
        }
      }
      parentExp = pe;
    }
    const marks = seedMarks.get(key) || []; // a fact agreeing with a seed is `seeded`; one that a seed argues against is `contested` (its deviants toward the seeded value stand down)
    out.push({
      cid,
      pid,
      exp,
      kind,
      bpi: data / neff,
      raw,
      sraw,
      srawShare,
      tau,
      parentExp,
      seeded: marks.filter(m => m.v === exp).map(m => m.id),
      contested: marks.find(m => m.v !== exp) || null,
      counts: cell.counts,
      srawCounts: cell.sraw,
      alphabet: Vv,
      conform: cell.members[exp] || [],
      deviants: Vv.filter(v => v !== exp).flatMap(v => (cell.members[v] || []).map(gi => ({ gi, v }))),
    });
  }
  // structural facts (node-type presence, statement shapes, first statement, return shape, arity, local-variable shape) speak
  // only as a CONTRAST: in a group or directory whose default differs from the partition's. Repo-wide, "methods here always
  // contain a member_expression — 90% of 1758" and "methods here take 0 parameters" describe the language, not a choice
  // anyone made (measured: they were the remaining "conforms to"/"pre-existing" noise on express after every other gate)
  out = out.filter(
    f =>
      !STRUCT_PID.test(f.pid) || (!f.cid.startsWith('_all') && f.parentExp !== null && f.parentExp !== f.exp)
  );
  // absence facts are boundaries, not rarity: "files here do not import `re` — 60/65" is the base rate of a rare import, not a
  // rule anyone holds (measured across the corpus: most absence speech was this). Keep an absence fact only where the thing
  // is a real choice — accepted as PRESENT in another cell of the same kind, or used by ≥ 20% of the kind partition-wide.
  const presentSomewhere = new Set(
    out.filter(f => isBool(f.pid) && f.exp === 'true').map(f => f.kind + S + f.pid)
  );
  const partitionTrueShare = (kind, pid) => {
    const c = cells.get('_all:' + kind + S + pid);
    if (!c) return 0;
    const tot = Object.values(c.raw).reduce((a, b) => a + b, 0);
    return tot ? (c.raw['true'] || 0) / tot : 0;
  };
  // a local (group/directory) absence is a boundary only against something COMMON in the partition (≥ 30% of the kind use it);
  // a partition-wide absence only when some group/directory is accepted with it present and it is not vanishingly rare
  out = out.filter(
    f =>
      !(isBool(f.pid) && f.exp === 'false') ||
      (f.cid.startsWith('_all')
        ? presentSomewhere.has(f.kind + S + f.pid) && partitionTrueShare(f.kind, f.pid) >= 0.1
        : partitionTrueShare(f.kind, f.pid) >= 0.3)
  );
  // redundant-refinement filter: a dir fact agreeing with its parent's default while an accepted `_all`
  // fact already states it repo/package-wide is not local information — it would only re-say the general rule
  const allAccepted = new Set(
    out.filter(f => f.cid.startsWith('_all')).map(f => f.kind + S + f.pid + S + f.exp)
  );
  let pruned = out.filter(
    f => !(f.cid.startsWith('d[') && f.exp === f.parentExp && allAccepted.has(f.kind + S + f.pid + S + f.exp))
  );
  // nested same-default refinement: if a shallower dir already states (kind,pid,exp), a deeper dir restating it adds nothing
  const dirOfCid = cid => cid.slice(2, cid.indexOf(']'));
  const keptDirs = new Map(); // kind\x01pid\x01exp -> [dirs kept]
  pruned = pruned
    .sort(
      (a, b) =>
        (a.cid.startsWith('d[') ? dirOfCid(a.cid).length : 0) -
        (b.cid.startsWith('d[') ? dirOfCid(b.cid).length : 0)
    )
    .filter(f => {
      if (!f.cid.startsWith('d[')) return true;
      const k = f.kind + S + f.pid + S + f.exp,
        d = dirOfCid(f.cid);
      const kept = keptDirs.get(k) || [];
      if (kept.some(kd => d.startsWith(kd + '/'))) return false;
      kept.push(d);
      keptDirs.set(k, kept);
      return true;
    });
  const groups = [];
  const famOf = pid => pid.slice(0, pid.indexOf(':') + 1 || pid.length); // same-family only: an identical conform set across
  // DIFFERENT families (a pure region where every file obeys everything) is independent claims, not restatement
  for (const c of pruned.sort((a, b) => b.bpi - a.bpi || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0))) {
    let pl = false;
    for (const g of groups)
      if (
        g.cid === c.cid &&
        famOf(g.lead.pid) === famOf(c.pid) &&
        jac(new Set(g.lead.conform), new Set(c.conform)) >= 0.9
      ) {
        g.surfaces.push(c);
        pl = true;
        break;
      }
    if (!pl) groups.push({ cid: c.cid, lead: c, surfaces: [c] });
  }
  // sibling surfaces (same conform set, deduped out of speech) travel with the lead so `check` can still see a deviation on
  // any of them — "returns boolean" and "returns the literal true" share a conform set, but only the second catches `return false`
  return {
    facts: groups.map(g => ({
      ...g.lead,
      nSurfaces: g.surfaces.length,
      siblings: g.surfaces
        .slice(1)
        .map(c => ({
          pid: c.pid,
          exp: c.exp,
          counts: c.counts,
          srawCounts: c.srawCounts,
          alphabet: c.alphabet,
          tau: c.tau,
        })),
    })),
    C,
    idxCost,
  };
}
// the deviants worth naming: largest preference gap first, at most five — `where` says what NOT to copy, `check` what the
// neighbours got wrong, without loading every scope
export function topDeviants(f, ps, max = 5) {
  const gc = f.srawCounts || f.counts;
  const neff = Object.values(gc).reduce((a, b) => a + b, 0);
  const K = isBool(f.pid) ? 2 : f.alphabet.length + 1;
  return f.deviants
    .map(({ gi, v }) => {
      const known = f.alphabet.includes(v);
      const d = Math.log2(kt(gc, K, f.exp, neff) / kt(gc, K, known ? v : UNSEEN, neff));
      return {
        rel: ps[gi].rel,
        line: ps[gi].line,
        endLine: ps[gi].endLine || ps[gi].line,
        name: ps[gi].name,
        obs: v,
        gap: +d.toFixed(2),
      };
    })
    .sort((a, b) => b.gap - a.gap || (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line))
    .slice(0, max);
}
// a marker family's carrier count, repo-wide — the SAME `>= 3 carriers` gate `learn()` uses to decide a decorator /
// supertype / declared return type is a real marker worth indexing at all (search "markers: every decorator"),
// replicated here (not imported) because at this call site the fact is still the raw mine() output, mined before
// `learn()` builds its `markers` map for the partition.
const MARKER_ARR = { deco: 'decos', extends: 'sup', returns: 'rets' };
const markerCarriers = (ps, fam, name) => {
  let n = 0;
  for (const s of ps) {
    if (s.kind === 'file' || s.kind === 'module') continue;
    const arr =
      fam === 'extends' ? (s.kind === 'type' ? s.sup : []) : fam === 'deco' ? s.decos : s.rets || [];
    if (arr && arr.includes(name)) n++;
  }
  return n;
};
// two markers behave like ALTERNATIVES on this population when: an accepted "carries X" fact's deviants overwhelmingly
// carry one OTHER same-family marker instead (an equally deliberate way to say the same thing grain has no name-based
// way to equate — `[Produces(Type=...)]` vs `[ProducesResponseType]`, confirmed by a field report), that alternative
// clears the same repo-wide marker bar X itself had to clear, and it is rare among X's own conforming population (a
// real two-way split, not "deviants happen to also carry a common unrelated tag most conformers carry too").
export function altMarkerFor(f, ps) {
  const m = /^auto\.(deco|extends|returns):@?(.+)$/.exec(f.pid);
  if (!m || f.exp !== 'true' || !f.deviants || !f.deviants.length) return null;
  const fam = m[1],
    own = m[2],
    arrKey = MARKER_ARR[fam];
  const cand = new Map();
  for (const { gi } of f.deviants) {
    const arr = ps[gi] && ps[gi][arrKey];
    if (!arr) continue;
    for (const x of new Set(arr)) {
      if (x === own) continue;
      cand.set(x, (cand.get(x) || 0) + 1);
    }
  }
  if (!cand.size) return null;
  let alt = null,
    n = -1;
  for (const [x, c] of cand)
    if (c > n) {
      alt = x;
      n = c;
    }
  const ofDeviants = f.deviants.length;
  // (b) supermajority of the deviants: placementHit's own bar for "dominant pattern, not noise" (n / T.length >= 2/3)
  if (n / ofDeviants < 2 / 3) return null;
  // clears the SAME >= 3 carriers gate any other marker in this repo must clear (learn()'s marker-building block)
  if (markerCarriers(ps, fam, alt) < 3) return null;
  // (c) rare among the fact's own conforming population: mine()'s own absence-boundary floor (0.1), inverted — below
  // it, not above, since here we want the complement to be clean, not overlapping noise
  const confCarriers = f.conform.reduce(
    (a, gi) => a + (ps[gi] && ps[gi][arrKey] && ps[gi][arrKey].includes(alt) ? 1 : 0),
    0
  );
  if (f.conform.length && confCarriers / f.conform.length >= 0.1) return null;
  return { pid: 'auto.' + fam + ':' + alt, name: alt, n, ofDeviants };
}
// when the rule was born, when it was last reinforced, how often the history repaired toward it or departed from it
export function heldSummary(f, ps, H) {
  let since = Infinity,
    last = 0,
    lastDev = 0,
    repairs = 0,
    departures = 0;
  for (const gi of f.conform) {
    const L = H.lc.get(skeyR(ps[gi].rel, ps[gi]));
    if (!L) continue;
    since = Math.min(since, L.first);
    last = Math.max(last, L.last);
  }
  for (const { gi } of f.deviants) {
    const L = H.lc.get(skeyR(ps[gi].rel, ps[gi]));
    if (L) lastDev = Math.max(lastDev, L.last);
  }
  for (const gi of f.conform.concat(f.deviants.map(d => d.gi))) {
    const evs = H.vev.get(skeyR(ps[gi].rel, ps[gi]));
    if (!evs) continue;
    let prev;
    for (const e of evs) {
      const v = valOf(f.pid, e.val);
      if (v === undefined) continue;
      if (prev !== undefined && prev !== v) {
        if (v === f.exp) repairs++;
        else if (prev === f.exp) departures++;
      }
      prev = v;
    }
  }
  const ym = ts => (ts && ts !== Infinity ? new Date(ts * 1000).toISOString().slice(0, 7) : null);
  return { since: ym(since), lastReinforced: ym(last), lastDeviation: ym(lastDev), repairs, departures };
}
// bus-factor signal for an accepted fact: does it rest on many contributors (durable) or effectively one (a risk if
// they leave)? Each conforming scope is credited to whoever last WROTE the current value — the last event in its
// vev array whose decoded value equals f.exp, walked forward exactly like `calibrate` walks its events (never the
// scope's creator, unless creation is also the last matching event — the common case, and the whole point: an
// untouched-since-birth scope has no "later" author to prefer over the one it already has). A scope with no
// matching event (never recorded, or f.pid outside valOf's supported families) contributes no author at all —
// never fabricated. Silent (null) below CFG.minRaw credited instances, or when no author reaches the SAME 2/3
// supermajority bar `placementHit`/`altMarkerFor` already use for "dominant pattern, not incidental."
export function authorConcentration(f, ps, H) {
  const counts = new Map();
  let credited = 0;
  for (const gi of f.conform) {
    const evs = H.vev.get(skeyR(ps[gi].rel, ps[gi]));
    if (!evs) continue;
    let author;
    for (const e of evs) {
      const v = valOf(f.pid, e.val);
      if (v === undefined) continue;
      if (v === f.exp) author = e.author;
    }
    if (author === undefined) continue;
    credited++;
    counts.set(author, (counts.get(author) || 0) + 1);
  }
  if (credited < CFG.minRaw) return null;
  let topAuthorHash = null,
    topCount = 0;
  for (const [a, c] of counts)
    if (c > topCount) {
      topCount = c;
      topAuthorHash = a;
    }
  if (topCount / credited < 2 / 3) return null;
  return {
    distinctAuthors: counts.size,
    credited,
    topCount,
    topShare: +(topCount / credited).toFixed(2),
    topAuthorHash,
  };
}
// Four voices, one marker each. Every line grain prints as a CLAIM says which of four kinds of thing it is, marked
// identically in every command, so a reader never has to infer authority from wording: practiced — the statistical
// claim, the default, the ONLY voice allowed to carry no marker at all; decided — a maintainer's committed override
// (steer or boundary), which the numbers may still contradict, and that is the point; example — one real historical
// instance, cited by the commit it comes from, never a certified convention; map — a structural overview of where
// things live, not an assertion about how they are written. Headers, stamps and continuation lines are structure,
// not claims: they never pass through here.
export function voice(kind, text, meta = {}) {
  switch (kind) {
    case 'practiced':
      return text;
    case 'decided': {
      const who = [meta.who, meta.when].filter(Boolean).join(' ');
      const paren = meta.id ? [`id ${meta.id}`, who].filter(Boolean).join(', ') : who;
      return `decision ${meta.typ} (${paren}): ${text}`;
    }
    case 'example': {
      const cite = [meta.sha, meta.date].filter(Boolean).join(' ');
      return `example${cite ? ` (${cite})` : ''}: ${text}`;
    }
    case 'map':
      return `map: ${text}`;
    default:
      throw new Error(`voice: unknown kind "${kind}"`);
  }
}
// the report/where phrase for an author-concentration verdict — counts and shares only, never the hash itself
export function authorConcClause(ac) {
  return !ac
    ? null
    : ac.distinctAuthors === 1
      ? '1 author'
      : `mostly one author (${ac.topCount} of ${ac.credited})`;
}
// one clause of calibration for a spoken convention: how it moved, and since when it has held
export function factNotes(f) {
  const out = [];
  if (f.contested)
    out.push(`superseded by maintainer decision ${f.contested} — see the steer line / \`grain report\``);

  if (f.trend && f.trend.shares && f.trend.shares.length >= 2) {
    const a = pct(f.trend.shares[0].share),
      b = pct(f.trend.shares[f.trend.shares.length - 1].share);
    if (Math.abs(a - b) >= 10) out.push(`trend ${a}>${b}%`);
  }
  if (f.suppressedValue && !f.contested) out.push(`a newer pattern is emerging: ${f.suppressedValue}`); // when contested, the superseded note already says it
  if (f.held && f.held.since)
    out.push(
      `held since ${f.held.since}${f.held.lastReinforced && f.held.lastReinforced !== f.held.since ? `, last reinforced ${f.held.lastReinforced}` : ''}${f.held.repairs ? `, ${f.held.repairs} repair${f.held.repairs > 1 ? 's' : ''} toward it` : ''}${f.held.departures ? `, ${f.held.departures} departure${f.held.departures > 1 ? 's' : ''}` : ''}`
    );
  // what deviating from it has cost so far. `baseK === 0` cannot happen while the base population CONTAINS the
  // deviants (baseK >= k >= 1 whenever the cell speaks at all); the branch is here so that narrowing the base
  // population later cannot turn this line into a division by zero — the two counts read fine without a multiplier.
  if (f.cost)
    out.push(
      `deviants get fixes ${f.cost.baseK ? `${(f.cost.k / f.cost.n / (f.cost.baseK / f.cost.baseN)).toFixed(1)}× more often ` : ''}(${f.cost.k} of ${f.cost.n} vs ${f.cost.baseK} of ${f.cost.baseN})`
    );
  // a value tried on enough scopes and then reverted — the structural opposite of `suppressedValue`'s nucleation
  if (f.rejected)
    for (const r of f.rejected)
      out.push(
        `${deviationPhrase(f, r.v)} tried ${r.tried}×, reverted ${r.reverted}× — a rejection, not an alternative`
      );
  if (f.agentShare != null)
    out.push(`held mostly by agent-authored code (${pct(f.agentShare)}% of recent conformers)`);
  return out.length ? ' · ' + out.join(' · ') : '';
}
export const deviantLine = (f, max = 2) =>
  f.deviants && f.deviants.length
    ? `  ${voice(
        'practiced',
        `not to copy: ${f.deviants
          .slice(0, max)
          .map(d => `${ptr(d.rel, d.line, d.endLine)} ${scopeBacktick({ kind: f.kind, name: d.name })} (${deviationPhrase(f, d.obs)})`)
          .join(' · ')}${f.deviantsN > max ? ` · +${f.deviantsN - max} more` : ''}`
      )}`
    : null;
// an exemplar shown as "copy this" can itself be a deviant of some OTHER, unrelated fact in the same partition — the
// reader should know before opening it. Indexed once per partition (WeakMap, mirrors scopeLineIdx above): scope key
// (rel#kind#name, kind taken from the OWNING fact — every deviant of a fact shares that fact's kind) → the
// strongest (by gap) other-fact deviation on it. Ties keep whichever was inserted first (facts are iterated in
// their existing, already-deterministic array order) — a documented, deterministic pick, not the one true answer.
const otherDeviantIdx = new WeakMap();
function otherDeviantsOf(part) {
  let m = otherDeviantIdx.get(part);
  if (!m) {
    m = new Map();
    for (const f of part.facts || [])
      for (const d of f.deviants || []) {
        const key = d.rel + '#' + f.kind + '#' + d.name;
        const cur = m.get(key);
        if (!cur || d.gap > cur.gap)
          m.set(key, {
            factKey: f.cid + '|' + f.pid,
            line: d.line,
            gap: d.gap,
            phrase: deviationPhrase(f, d.obs),
          });
      }
    otherDeviantIdx.set(part, m);
  }
  return m;
}
// the "(skip line N — its own deviation: ...)" dopisek for an exemplar being shown as conforming to `fact` — never
// fired when the exemplar's only known other-fact deviation IS `fact` itself (that would accuse the very
// convention it is being held up as a model of)
export function skipLineNote(part, fact, ex) {
  const other = otherDeviantsOf(part).get(ex.rel + '#' + fact.kind + '#' + ex.name);
  if (!other || other.factKey === fact.cid + '|' + fact.pid) return '';
  return ` (skip line ${other.line} — its own deviation: ${other.phrase})`;
}
export function roleLift(ps, ri, facts) {
  // per role: bits/instance of behavior compression; ≤0 ⇒ decorative
  const lift = {};
  for (const f of facts) {
    if (!/^r\d/.test(f.cid)) continue;
    const r = +f.cid.slice(1).split(':')[0];
    lift[r] = (lift[r] || 0) + f.bpi * 0.1 + 0.1;
  } // proxy: any accepted role fact ⇒ lift>0
  return lift;
}
