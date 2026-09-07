// grain engine · skeletons, role profiles, templates and twins: the structural superposition a scope is read against
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { dirname } from 'node:path/posix';
import { tokenize } from './parse.mjs';

// a body-bearing sub-scope (catch/finally block, named callback): calls, node types and statement shapes, no identity surfaces
// ===== SUPERPOSITION, stage 0 (design record: .temp/docs/math-constitution.md). The skeleton of a scope is its AST
// with three normalizations: nested scopes become opaque leaves (a class profile does not drown in its methods'
// bodies), identifiers stay LITERAL (an invariant identifier — `logger.error` in every catch — remains in the shared
// template by itself; a per-instance one — each handler's own command — becomes a hole whose statistics say so), and
// string/number payloads collapse to str/num. Anti-unification (Plotkin's LGG) folds a cluster's skeletons into ONE
// template; the per-hole label distributions are the superposition statistics.
const SK_CAP = 300;
export function skelOf(node, isScope) {
  let used = 0;
  const go = (n, d) => {
    if (used >= SK_CAP || d > 14) {
      used++;
      return n.type;
    }
    used++;
    const kids = (n.namedChildren || []).filter(c => !/comment/.test(c.type));
    if (!kids.length) {
      const t = n.type;
      if (/identifier|(^|_)name$/.test(t)) return 'id:' + n.text.slice(0, 24);
      if (/string|char|template/.test(t)) return 'str';
      if (/number|integer|float/.test(t)) return 'num';
      return t;
    }
    return [n.type, ...kids.map(c => (d > 0 && isScope(c) ? c.type : go(c, d + 1)))];
  };
  return go(node, 0);
}
const skLeaf = x => typeof x === 'string';
const skSig = x => (skLeaf(x) ? x : x[0]);
const skCount = t =>
  skLeaf(t)
    ? t.startsWith('?')
      ? 0
      : 1
    : t[0] === '?' || t[0] === '?*'
      ? 0
      : 1 + t.slice(1).reduce((a, k) => a + skCount(k), 0);
// per-signature occurrence counts of a skeleton's LITERAL nodes — skCount's own branch structure, tallied by
// signature instead of summed. Holes contribute nothing, exactly as skCount scores them 0. Runs on the raw
// anti-unified template (holes present) in profileOf and on a plain candidate skeleton (holes impossible outside
// skAu) in checkFile — one function, so the two sides can never drift into counting different things.
export function sigCounts(t, into = Object.create(null)) {
  if (skLeaf(t)) {
    if (!t.startsWith('?')) into[t] = (into[t] || 0) + 1;
    return into;
  }
  if (t[0] === '?' || t[0] === '?*') return into;
  into[t[0]] = (into[t[0]] || 0) + 1;
  for (const k of t.slice(1)) sigCounts(k, into);
  return into;
}
function skAlign(ka, kb) {
  // deterministic LCS over root signatures; template holes match anything
  const m = ka.length,
    n2 = kb.length;
  const eq = (x, y) => skSig(x) === skSig(y) || skSig(x) === '?' || skSig(x) === '?*';
  const dp = Array.from({ length: m + 1 }, () => new Array(n2 + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n2 - 1; j >= 0; j--)
      dp[i][j] = eq(ka[i], kb[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0,
    j = 0;
  const gap = () => {
    if (!out.length || !(Array.isArray(out[out.length - 1]) && out[out.length - 1][0] === '?*'))
      out.push(['?*']);
  };
  while (i < m && j < n2) {
    if (eq(ka[i], kb[j]) && dp[i][j] === dp[i + 1][j + 1] + 1) {
      out.push([ka[i], kb[j]]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      gap();
      i++;
    } else {
      gap();
      j++;
    }
  }
  if (i < m || j < n2) gap();
  return out;
}
export function skAu(a, b) {
  // least general generalization of two skeletons
  if (skLeaf(a) && skLeaf(b)) return a === b ? a : ['?'];
  if (Array.isArray(a) && (a[0] === '?' || a[0] === '?*')) return a;
  if (skLeaf(a) || skLeaf(b) || a[0] !== b[0]) return ['?'];
  const ka = a.slice(1),
    kb = b.slice(1);
  const kids =
    ka.length === kb.length
      ? ka.map((x, i) => skAu(x, kb[i]))
      : skAlign(ka, kb).map(pr => (pr[0] === '?*' && pr.length === 1 ? pr : skAu(pr[0], pr[1])));
  return [a[0], ...kids];
}
function skNumber(t, holes = []) {
  // give every hole an id, in walk order
  if (skLeaf(t)) return t;
  if (t[0] === '?' || t[0] === '?*') {
    const h = [t[0], holes.length];
    holes.push(h);
    return h;
  }
  return [t[0], ...t.slice(1).map(k => skNumber(k, holes))];
}
function skMatch(tpl, sk, stats) {
  // collect per-hole labels of ONE instance against the numbered template
  if (skLeaf(tpl) || skLeaf(sk)) return;
  if (tpl[0] === '?') {
    const c = stats[tpl[1]];
    const l = skLeaf(sk) ? sk : sk[0];
    c.set(l, (c.get(l) || 0) + 1);
    return;
  }
  const walkKids = (tk, ik) => {
    let ii = 0;
    for (const tkid of tk) {
      if (Array.isArray(tkid) && tkid[0] === '?*') {
        const c = stats[tkid[1]];
        c.set('…', (c.get('…') || 0) + 1);
        continue;
      }
      while (ii < ik.length && skSig(ik[ii]) !== skSig(tkid) && !(Array.isArray(tkid) && tkid[0] === '?'))
        ii++;
      if (ii >= ik.length) break;
      if (Array.isArray(tkid) && tkid[0] === '?') {
        const c = stats[tkid[1]];
        const l = skLeaf(ik[ii]) ? ik[ii] : ik[ii][0];
        c.set(l, (c.get(l) || 0) + 1);
        ii++;
        continue;
      }
      skMatch(tkid, ik[ii], stats);
      ii++;
    }
  };
  if (tpl[0] === sk[0]) walkKids(tpl.slice(1), sk.slice(1));
}
export function skRender(t, max = 220) {
  const go = x => {
    if (skLeaf(x)) return x.startsWith('id:') ? x.slice(3) : x;
    if (x[0] === '?') return '⟨·⟩';
    if (x[0] === '?*') return '…';
    const kids = x.slice(1).map(go);
    const out = []; // a run of identical children compresses to ×N — structure, not curation
    for (const k of kids) {
      const last = out[out.length - 1];
      if (last && last.s === k) last.n++;
      else out.push({ s: k, n: 1 });
    }
    return x[0] + '(' + out.map(e => (e.n > 1 ? e.s + '×' + e.n : e.s)).join(' ') + ')';
  };
  const r = go(t);
  if (r.length <= max) return r;
  const cut = r.lastIndexOf(' ', max - 2);
  return r.slice(0, cut > max / 2 ? cut : max - 1) + '…';
}
// fold a cluster's skeletons into template + per-hole statistics — the profile the group card and export speak
export function profileOf(skels) {
  if (skels.length < 4) return null;
  let tpl = skels[0];
  for (let i = 1; i < skels.length; i++) tpl = skAu(tpl, skels[i]);
  const holes = [];
  const rawTpl = tpl;
  tpl = skNumber(tpl, holes);
  const shared = skCount(tpl);
  if (shared < 6) return null; // a template that is mostly holes says nothing
  const avg = skels.reduce((a, k) => a + skCount(k), 0) / skels.length;
  const stats = holes.map(() => new Map());
  for (const sk of skels) skMatch(tpl, sk, stats);
  const slots = stats
    .map((c, i) => {
      const total = [...c.values()].reduce((a, b) => a + b, 0);
      if (!total) return null;
      const top = [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
      return {
        id: i,
        kind: holes[i][0],
        total,
        distinct: c.size,
        top: top.map(([l, k2]) => [skLeaf(l) && l.startsWith('id:') ? l.slice(3) : l, k2]),
      };
    })
    .filter(Boolean);
  const perInst = slots.filter(sl => sl.kind === '?' && sl.distinct >= Math.max(3, sl.total * 0.8));
  const skewed = slots.filter(
    sl =>
      sl.kind === '?' && sl.distinct >= 2 && sl.top[0][1] / sl.total >= 0.6 && sl.distinct < sl.total * 0.8
  );
  // what EVERY member carries, as counts rather than as a tree (§J5.8). Every literal node of the template maps
  // injectively into every member — skAu joins children positionally at equal arity, else by skAlign's
  // order-preserving LCS pairing, and holes are the only non-injective case and are excluded here — so
  // count(sig in template) <= count(sig in every member), and a candidate below the count is provably missing
  // structure the whole group carries. Ordinary and ENUMERABLE on purpose, unlike `_tpl` below: `check` reads the
  // model back from .grain/cache/model.json, where a non-enumerable field cannot survive. Capped at 40 (SK_CAP
  // already bounds the skeleton, so this bounds the profile to a few hundred bytes), count desc then signature asc.
  const req = Object.fromEntries(
    Object.entries(sigCounts(rawTpl))
      .sort(([a, ca], [b, cb]) => cb - ca || (a < b ? -1 : 1))
      .slice(0, 40)
  );
  const out = {
    n: skels.length,
    shared,
    coverage: +Math.min(1, shared / Math.max(1, avg)).toFixed(2),
    skel: skRender(tpl),
    perInstance: perInst
      .slice(0, 3)
      .map(sl => ({ top: sl.top[0][0], distinct: sl.distinct, total: sl.total })),
    slots: skewed.slice(0, 3).map(sl => ({ top: sl.top[0][0], k: sl.top[0][1], total: sl.total })),
    req,
  };
  // pre-`skNumber` template, kept off the enumerable surface: `out` is a direct reference inside model.partitions[i].profiles,
  // published verbatim by export.mjs — JSON.stringify skips non-enumerable own properties, so twinsOf's structural
  // comparison (J3.4) gets the raw tree with zero risk of it leaking into the persisted cache or the export schema
  Object.defineProperty(out, '_tpl', { value: rawTpl, enumerable: false });
  return out;
}
// stage 1 of the template search: the scopes the clustering leaves behind (plain functions without markers, catch
// blocks) still repeat shapes. Coarse buckets — same kind, same depth-2 silhouette with identifiers folded — feed the
// same anti-unification; a bucket whose template does not pay (few members, thin shared core, low coverage) says
// nothing. The silhouette is a partition of the hypothesis space, not a judgment: identifiers fold so that a
// per-instance name cannot split a bucket the way it splits a feature bag.
export function skSil(t, d = 2) {
  if (skLeaf(t)) return t.startsWith('id:') ? 'id' : t;
  if (t[0] === '?' || t[0] === '?*') return '?';
  if (d <= 0) return t[0];
  return (
    t[0] +
    '(' +
    t
      .slice(1)
      .map(k => skSil(k, d - 1))
      .join(' ') +
    ')'
  );
}
export function mineTemplates(ps, covered) {
  const buckets = new Map();
  ps.forEach((s, i) => {
    if (s.kind === 'file' || s.kind === 'module' || !s.sk || covered.has(i)) return;
    const key = s.kind + '\u0001' + skSil(s.sk);
    (buckets.get(key) || buckets.set(key, []).get(key)).push(s);
  });
  const out = [];
  for (const [key, ms] of [...buckets].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))) {
    if (ms.length < 5) continue;
    const sorted = [...ms].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line));
    const pf = profileOf(sorted.map(s => s.sk));
    if (!pf || pf.shared < 8 || pf.coverage < 0.5) continue; // no cluster prior behind it — the template alone must carry the claim
    out.push({
      kind: key.split('\u0001')[0],
      ...pf,
      exemplars: sorted
        .slice(0, 3)
        .map(s => ({ rel: s.rel, line: s.line, endLine: s.endLine || s.line, name: s.name })),
      _members: sorted,
    });
    if (out.length >= 12) break;
  }
  return out;
}
// structural twins (H4): two role-group templates, possibly in different partitions, that are the same shape under a
// different name. Comparison is over the raw ANTI-UNIFIED template (`_tpl`, profileOf's non-enumerable side channel),
// not the rendered/truncated `skel` string — a truncated render can make two unrelated long templates share a prefix,
// or hide a large repeat-count difference behind one `×N` character. `skAu` tests its hole marker only on its first
// argument (§skAlign), so `skAu(A,B)` and `skAu(B,A)` can disagree; taking the min is the conservative reading, with no
// canonical ordering invented for the pair. The acceptance threshold is not a new constant: `3·shared > A.shared +
// B.shared` is `shared / avg(A.shared, B.shared) > 2/3`, the same majority-share proportion as `induceRoles`' medoid
// labels and J3.2's kin-completeness threshold — a shared core that outweighs everything that tells the two apart.
const TWIN_PROFILE_CAP = 200; // profiles entered into the twin scan; thickest templates first — 19 900 pairs at most
export function twinsOf(entries, log = () => {}) {
  if (entries.length > TWIN_PROFILE_CAP)
    log(
      `[learn] twin profile cap ${TWIN_PROFILE_CAP}: dropped ${entries.length - TWIN_PROFILE_CAP} thinnest profile(s)`
    );
  const pool = entries
    .sort((a, b) => b.shared - a.shared || (a.key < b.key ? -1 : 1))
    .slice(0, TWIN_PROFILE_CAP);
  const out = [];
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++) {
      const A = pool[i],
        B = pool[j];
      if (skSig(A.tpl) !== skSig(B.tpl)) continue; // different roots: no shared core is possible
      if (3 * Math.min(A.shared, B.shared) <= A.shared + B.shared) continue; // cheap reject: shared <= min(A.shared,B.shared) always
      const shared = Math.min(skCount(skAu(A.tpl, B.tpl)), skCount(skAu(B.tpl, A.tpl))); // skAu is asymmetric on holes — take the conservative side
      if (shared <= A.shared - shared + (B.shared - shared)) continue;
      out.push({ a: A.key, b: B.key, shared, coverage: +(shared / Math.max(A.shared, B.shared)).toFixed(2) });
    }
  return out.sort((x, y) => y.shared - x.shared || (x.a < y.a ? -1 : 1));
}
export function blockScope(node, kind, name, rel, grammar, isScope, line = null, endLine = null) {
  const seen = new Set();
  const calls = new Set();
  const stack = [node];
  let g = 0;
  while (stack.length && g++ < 2000) {
    const n = stack.pop();
    seen.add(n.type);
    if (/call/.test(n.type) && n.childForFieldName('function')) {
      const fn = n.childForFieldName('function');
      if (fn.text.length <= 40 && !fn.text.includes('\n')) calls.add(fn.text);
    }
    if (!isScope(n)) for (const c of n.namedChildren) stack.push(c);
  }
  const shapes = new Set();
  const ser = (n, d) =>
    d <= 0
      ? n.type
      : n.type +
        '(' +
        n.namedChildren
          .slice(0, 3)
          .map(c => ser(c, d - 1))
          .join(',') +
        ')';
  const stmts = (node.namedChildren || []).filter(n2 =>
    /statement|expression|declaration|call/.test(n2.type)
  );
  for (const st of stmts.slice(0, 20)) shapes.add(ser(st, 2));
  const preds = {};
  if (stmts.length) preds['auto.first1'] = stmts[0].type;
  dirname(rel)
    .split('/')
    .filter(sg => sg !== '.')
    .slice(0, 3)
    .forEach((sg, k) => (preds['auto.dir' + (k + 1)] = sg));
  return {
    kind,
    name,
    rel,
    line: line ?? node.startPosition.row + 1,
    endLine: endLine ?? node.endPosition.row + 1,
    g: grammar,
    nt: node.type,
    sup: [],
    decos: [],
    rets: [],
    calls,
    seen,
    shapes,
    preds,
    doc: [],
    sk: skelOf(node, isScope),
  };
}
// how the module exports (JS/TS families; elsewhere the surface never appears): a fastify-style repo's strongest identity
export function exportShape(tree) {
  const c = Object.create(null);
  for (const n of tree.rootNode.namedChildren) {
    if (n.type === 'export_statement')
      c[/^export\s+default\b/.test(n.text) ? 'export-default' : 'export-named'] =
        (c[/^export\s+default\b/.test(n.text) ? 'export-default' : 'export-named'] || 0) + 1;
    else if (n.type === 'expression_statement' && /^module\.exports\b/.test(n.text))
      c['module.exports'] = (c['module.exports'] || 0) + 1;
    else if (n.type === 'expression_statement' && /^exports\.\w/.test(n.text))
      c['exports.x'] = (c['exports.x'] || 0) + 1;
  }
  const tot = Object.values(c).reduce((a, b) => a + b, 0);
  if (!tot) return {};
  const [k, n2] = Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return { 'auto.modexport': n2 >= tot * 0.8 ? k : 'mixed' };
}
// doc comment → searchable tokens: first sentence only, comment sigils stripped, prose stopwords dropped (what a thing is FOR,
// in the maintainers' words — the vocabulary an agent's intent is most likely phrased in)
export const DOC_STOP = new Set(
  'the a an and or of to for in on at by with from as is are was were be been being this that these those it its into than then there their which who whom what when where how if not no nor do does did done can could will would should may might must also such via each per any all some more most other same new use used using return returns returned given like true false null none void only own just yet still very e g i e'.split(
    ' '
  )
);
export function docTokens(text) {
  if (!text) return [];
  const clean = text
    .replace(/^[\s/*#\-"'`!]+/, '')
    .replace(/\*\/\s*$/, '')
    .replace(/^\s*(\*|\/\/+|#+|--)\s?/gm, '')
    .replace(/["'`]{3}$/, '');
  const first = clean.split(/(?<=[.!?])\s|\n\s*\n/)[0].slice(0, 200);
  const out = [];
  for (const t of first.split(/[^A-Za-z0-9_]+/)) {
    if (!t) continue;
    for (const u of tokenize(t)) {
      const l = u.toLowerCase();
      if (l.length < 3 || DOC_STOP.has(l) || out.includes(l)) continue;
      out.push(l);
      if (out.length >= 24) return out;
    }
  }
  return out;
}
