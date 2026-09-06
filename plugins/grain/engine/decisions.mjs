// grain engine · the maintainer's decisions — steers, waivers and boundaries — resolved against the current tree
// Lifted out of `learn` (ticket 117): the statements below are the ones that stood there, unchanged.
import { CFG } from './config.mjs';
import { scopeLabel } from './facts.mjs';

// steers: every seed, resolved against the current tree — the exemplar's line, each seeded surface with its value and the
// measured share of that value in the exemplar's partition today (decided vs practiced, side by side)
export function applySteers(model, prepared, seeds) {
  model.steers = (seeds || []).map(sd => {
    let found = null,
      pname = null;
    for (const pr of prepared) {
      const s = pr.ps.find(x => x.rel === sd.path && x.name === sd.name);
      if (s) {
        found = s;
        pname = pr.pname;
        break;
      }
    }
    // practiced-by is measured in the exemplar's most specific context that has a population: its group, else its deepest
    // directory holding ≥ dirMin scopes of its kind, else the partition — the same locality `check` would judge it by
    const resolveSurface = pid => {
      if (!found || found.preds[pid] === undefined)
        return { pid, value: null, share: null, n: 0, context: null };
      // marker surfaces (decorator / supertype / return type) get a same-denominator comparison: the carriers of this marker
      // against the carriers of its alternatives among the seed's other surfaces — "adopted by 11 of 241 (route 230)" reads,
      // "1% of 1010 methods" reads as noise (measured: the judge called the old framing the feature's worst wording problem)
      const v = found.preds[pid];
      const pr = prepared.find(p => p.pname === pname);
      const gi = pr.ps.indexOf(found);
      const role = pr.ri.assign.get(gi);
      const segs = found.rel.split('/').slice(0, -1);
      const dirs = [];
      for (let k = segs.length; k >= 1; k--) dirs.push(segs.slice(0, k).join('/'));
      const ctxs = [];
      if (role !== undefined && !pr.ri.amb.has(gi))
        ctxs.push({
          label: `group «${pr.ri.medoids[role]?.label || 'group'}»`,
          has: (s, i) => pr.ri.assign.get(i) === role,
        });
      for (const d of dirs) ctxs.push({ label: d + '/', has: s => s.rel.startsWith(d + '/') });
      ctxs.push({ label: scopeLabel(pname), has: () => true });
      const mk = pid.match(/^auto\.(deco|extends|returns):@?(.+)$/);
      let rivals = null;
      if (mk) {
        const pre = { deco: 'decos', extends: 'sup', returns: 'rets' }[mk[1]];
        const nameOf = x => x.replace(/^\[|\]$/g, '');
        const carrierN = x =>
          pr.ps.filter(s2 => s2.kind === found.kind && (s2[pre] || []).includes(nameOf(x))).length;
        const others = sd.pids
          .filter(q => q !== pid)
          .map(q => q.match(/^auto\.(deco|extends|returns):@?(.+)$/))
          .filter(m2 => m2 && m2[1] === mk[1]);
        if (others.length)
          rivals = { own: carrierN(mk[2]), alts: others.map(m2 => ({ name: m2[2], n: carrierN(m2[2]) })) };
      }
      for (const c of ctxs) {
        let n = 0,
          k = 0;
        pr.ps.forEach((s, i) => {
          if (s.kind !== found.kind || s.preds[pid] === undefined || !c.has(s, i)) return;
          n++;
          if (s.preds[pid] === v) k++;
        });
        if (n >= CFG.dirMin || c === ctxs[ctxs.length - 1])
          return {
            pid,
            value: v,
            retires: (sd.retired || []).includes(pid),
            rivals,
            share: n ? +(k / n).toFixed(2) : null,
            n,
            context: c.label,
          };
      }
      return {
        pid,
        value: v,
        retires: (sd.retired || []).includes(pid),
        rivals,
        share: null,
        n: 0,
        context: null,
      };
    };
    // a stored `baseline` (captured by `grain seed add` at the moment the decision was recorded, on the FIRST seeded
    // surface only — see `baselineShare`) rides along on that one surface so `practicedBy`'s callers can show the delta
    // without a second pass over the model
    const surfaces = sd.pids.map(pid => {
      const sf = resolveSurface(pid);
      return pid === sd.pids[0] && sd.baseline ? { ...sf, baseline: sd.baseline } : sf;
    });
    const role = found
      ? (() => {
          const pr = prepared.find(p => p.pname === pname);
          const gi = pr.ps.indexOf(found);
          const r = pr.ri.assign.get(gi);
          return r !== undefined && !pr.ri.amb.has(gi) ? r : null;
        })()
      : null;
    return {
      id: sd.id,
      path: sd.path,
      name: sd.name,
      kind: found ? found.kind : null,
      line: found ? found.line : null,
      partition: pname,
      role,
      found: !!found,
      surfaces,
      weight: sd.weight,
      topic: sd.topic || '',
      note: sd.note || '',
      author: sd.author || '',
      createdAt: sd.createdAt || '',
    };
  });
}
// waivers (.grain/seeds.jsonl records with a `waiver` field): one scope excused from one surface, resolved against
// the current tree exactly like a steer's exemplar (`found` = the scope still exists). DELIBERATELY render-time only:
// unlike a steer, a waiver never reaches mine() or the weights, and never changes a count — `check` still governs the
// scope by the convention and still counts it non-conforming; all a waiver changes is the VOICE that reports it.
export function applyWaivers(model, prepared, waivers) {
  model.waivers = (waivers || []).map(wv => {
    let found = null,
      pname = null;
    for (const pr of prepared) {
      const s = pr.ps.find(x => x.rel === wv.path && x.name === wv.name);
      if (s) {
        found = s;
        pname = pr.pname;
        break;
      }
    }
    return {
      id: wv.id,
      path: wv.path,
      name: wv.name,
      pid: wv.pid,
      kind: found ? found.kind : null,
      line: found ? found.line : null,
      partition: pname,
      found: !!found,
      note: wv.note || '',
      author: wv.author || '',
      createdAt: wv.createdAt || '',
    };
  });
}
// boundary decisions (.grain/seeds.jsonl records with a `boundary` field): resolved against the current tree
export function applyBoundaries(model, boundaries, files) {
  model.boundaries = (boundaries || []).map(b => ({
    ...b,
    fromLive: files.some(f =>
      b.boundary.from === '.' ? !f.includes('/') : (f + '/').startsWith(b.boundary.from + '/')
    ),
    toLive: files.some(f => (f + '/').startsWith(b.boundary.to + '/')),
  }));
}
