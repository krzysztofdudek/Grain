// grain engine · history weighting (survival x provenance x churn), value trends and calibration
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { CFG } from './config.mjs';
import { skeyR } from './facts.mjs';

// ===== WEIGHTS FROM HISTORY (survival × provenance × churn, floor) =====
export function mkWeightFn(H) {
  if (!H) return { wfn: () => 1, ageFn: null, get: () => null };
  const filelvl = new Map();
  for (const [, L] of H.lc) {
    const p = L.path;
    let F = filelvl.get(p);
    if (!F) {
      F = { ...L };
      filelvl.set(p, F);
    } else {
      F.first = Math.min(F.first, L.first);
      if (L.last > F.last) {
        F.last = L.last;
        F.agentLast = L.agentLast;
      }
    }
  }
  const get = s => H.lc.get(skeyR(s.rel, s)) || filelvl.get(s.rel) || null;
  return {
    ageFn: s => {
      const L = get(s);
      return L ? (H.NOW - L.first) / 86400 : 0;
    },
    wfn: s => {
      const L = get(s);
      if (!L) return 0.3;
      const stable = Math.max(0, (H.NOW - L.last) / 86400),
        age = Math.max(0, (H.NOW - L.first) / 86400);
      // no continuous survival ramp: "old" is not extra evidence, and the absolute 120-day scale priced a young repo's
      // real conventions at ~20% of their size (measured on a private repo: 19 certified where spectrum saw the field full).
      // What still discounts: brand-new code (< freshDays ⇒ ×0.5), code rewritten right after birth (churn ⇒ ×0.25),
      // and agent-authored code promotes over promoteDays as before. "n of N established" remains age-gated separately.
      const ws = age < CFG.freshDays ? 0.5 : 1;
      const wp = L.agentLast
        ? CFG.agentBase + (1 - CFG.agentBase) * Math.min(1, stable / CFG.promoteDays)
        : 1.0;
      let w = Math.max(CFG.floor, ws * wp * (L.churn ? 0.25 : 1));
      return w;
    },
    get,
  };
}
// dimension value from a historical val snapshot, for trend/calibration-supported pids
export function valOf(pid, v) {
  if (pid === 'auto.nameshape') return v.ns;
  if (pid === 'auto.first1') return v.f1 || undefined;
  if (pid === 'auto.ret') return v.ret || undefined;
  if (pid.startsWith('auto.deco:@')) return v.deco.includes(pid.slice(11)) ? 'true' : 'false';
  if (pid.startsWith('auto.extends:')) return v.sup.includes(pid.slice(13)) ? 'true' : 'false';
  return undefined;
}
// trends + attractor(report-only) + nucleation over the WHOLE history
export function trendsFor(fact, ps, H) {
  const keys = fact.conform
    .concat(fact.deviants.map(d => d.gi))
    .map(gi => ({ gi, key: skeyR(ps[gi].rel, ps[gi]) }));
  const t0 = H.firstTs;
  const win = CFG.trendWinDays * 86400;
  const nWin = Math.min(24, Math.ceil((H.NOW - t0) / win));
  const shares = [];
  const authorsByVal = Object.create(null);
  for (let w = nWin - 1; w >= 0; w--) {
    const end = H.NOW - w * win;
    let n = 0,
      conf = 0;
    const other = {};
    for (const { key } of keys) {
      const evs = H.vev.get(key);
      const L = H.lc.get(key);
      if (!evs || !L || L.first > end) continue;
      let val = null;
      for (const e of evs) {
        if (e.ts <= end) val = e.val;
        else break;
      }
      if (!val) continue;
      const v = valOf(fact.pid, val);
      if (v === undefined) continue;
      n++;
      if (v === fact.exp) conf++;
      else {
        other[v] = (other[v] || 0) + 1;
      }
    }
    if (n >= 4) shares.push({ end, share: +(conf / n).toFixed(2), n });
  }
  for (const { key } of keys) {
    const evs = H.vev.get(key) || [];
    for (const e of evs) {
      const v = valOf(fact.pid, e.val);
      if (v !== undefined && v !== fact.exp && !e.agent) (authorsByVal[v] ||= new Set()).add(e.author);
    }
  }
  let attractor = null,
    nucleating = null;
  if (shares.length >= 3) {
    const last = shares[shares.length - 1];
    const xs = shares.map((_, i) => i),
      ys = shares.map(s => 1 - s.share);
    const mx = xs.reduce((a, b) => a + b) / xs.length,
      my = ys.reduce((a, b) => a + b) / ys.length;
    const slope =
      xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) /
      Math.max(
        1e-9,
        xs.reduce((a, x) => a + (x - mx) ** 2, 0)
      );
    const minority = Object.entries(authorsByVal).sort(
      (a, b) => b[1].size - a[1].size || (a[0] < b[0] ? -1 : 1)
    )[0];
    if (slope > 0.02 && minority && minority[1].size >= 2 && 1 - last.share > 0.05) nucleating = minority[0];
    attractor = last.share >= 0.5 ? fact.exp : minority ? minority[0] : fact.exp;
  }
  return { shares: shares.slice(-8), attractor, nucleating };
}
// the structural opposite of `trendsFor`'s `nucleating`: a value TRIED on enough scopes and then REVERTED, never
// one quietly becoming the new norm. Per scope, decode `H.vev` chronologically via the SAME `valOf` trendsFor and
// calibrate already use — so this inherits their exact limitation, silent for every pid family outside the 5
// valOf decodes (nameshape/first1/ret/deco:@/extends:), documented by export.mjs's `valueTracked`. For each
// distinct v != fact.exp ever taken by a scope: if the scope's LAST decoded value is v, it survived (nucleation,
// never counted here); otherwise it tried and was reverted. Speaks when tried >= CFG.minRaw and reverted/tried >=
// 2/3 — the same supermajority proportion used throughout this codebase (altMarkerFor, placementHit, markerObs,
// authorConcentration, J3.4's twin threshold).
export function rejectedValues(fact, ps, H) {
  const keys = fact.conform.concat(fact.deviants.map(d => d.gi)).map(gi => skeyR(ps[gi].rel, ps[gi]));
  const tried = new Map(),
    reverted = new Map();
  for (const key of keys) {
    const evs = H.vev.get(key);
    if (!evs) continue;
    const decoded = [];
    for (const e of evs) {
      const v = valOf(fact.pid, e.val);
      if (v !== undefined) decoded.push(v);
    }
    if (!decoded.length) continue;
    const last = decoded[decoded.length - 1];
    for (const v of new Set(decoded.filter(x => x !== fact.exp))) {
      tried.set(v, (tried.get(v) || 0) + 1);
      if (last !== v) reverted.set(v, (reverted.get(v) || 0) + 1);
    }
  }
  const out = [];
  for (const [v, t] of tried) {
    const r = reverted.get(v) || 0;
    if (t >= CFG.minRaw && r / t >= 2 / 3) out.push({ v, tried: t, reverted: r });
  }
  out.sort((a, b) => b.tried - a.tried || (a.v < b.v ? -1 : a.v > b.v ? 1 : 0));
  return out.length ? out : undefined;
}
// calibration: temporal split, τ_c by point precision, DENY by Wilson LB (report-only in grain — nothing ever blocks)
export function calibrate(fact, ps, H) {
  const split = H.NOW - CFG.calibHorizonDays * 86400;
  const settle = H.NOW - CFG.calibSettleDays * 86400;
  if (H.firstTs > split) return { available: false, reason: 'history<2x horizon' };
  const evts = [];
  for (const gi of fact.conform.concat(fact.deviants.map(d => d.gi))) {
    const s = ps[gi];
    const key = skeyR(s.rel, s);
    const evs = H.vev.get(key);
    if (!evs) continue;
    for (let i = 1; i < evs.length; i++) {
      const e = evs[i];
      if (e.ts <= split || e.ts > settle) continue;
      const v = valOf(fact.pid, e.val);
      if (v === undefined || v === fact.exp) continue;
      let repaired = false;
      for (let j = i + 1; j < evs.length; j++)
        if (valOf(fact.pid, evs[j].val) === fact.exp) {
          repaired = true;
          break;
        }
      evts.push({ repaired });
    }
  }
  if (evts.length < CFG.calibMinEv)
    return { available: false, reason: `events ${evts.length}<${CFG.calibMinEv}`, events: evts.length };
  const p = evts.filter(e => e.repaired).length / evts.length;
  const z = 1.96,
    n = evts.length,
    lb =
      (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  return {
    available: true,
    events: n,
    precision: +p.toFixed(2),
    wilsonLB: +lb.toFixed(2),
    tauC: p >= CFG.targetPrec ? Math.log2(CFG.lambda) : Math.log2(CFG.lambda) + 1.5,
    denyEligible: lb >= 0.9 && n >= CFG.denyMinEv,
  };
}
// §033: the target of an `auto.extends:` pid, classified 'ext'/'impl' via model.heritageKind (built once in
// learn(), from extractScopes' own supKind — see bindingFor's extendsClauseRe/implementsClauseRe), or undefined
// where unclassified. One helper, reused at every fact-like object built ad hoc for a steer/waiver at render
// time, so it carries the same distinction a mined fact gets at its own construction site (learn()'s `ef`).
export function heritageKindOf(pid, model) {
  return pid.startsWith('auto.extends:') ? (model.heritageKind || {})[pid.slice(13)] : undefined;
}
