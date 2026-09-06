// grain engine · the objective and the fact vocabulary: KT posteriors, Jaccard, feature weights, cell labels and ordering
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { GRAMMARS, CFG } from './config.mjs';
import { bindingFor, bindings } from './parse.mjs';

// a pointer into the tree, as precise as the scope's own range allows: `file:line` for a single-line scope (or one
// with no endLine on record), `file:line–endLine` (en dash) for a multi-line one — never a redundant `:line–line`
export function ptr(rel, line, endLine) {
  return endLine == null || endLine <= line ? `${rel}:${line}` : `${rel}:${line}–${endLine}`;
}
export const skeyR = (rel, s) => rel + '#' + s.kind + '#' + s.name + (s.ord ? '#' + s.ord : ''); // scope identity key (ordinal only when non-zero)
// a node type belongs to a grammar: a C# `invocation_expression` surface says nothing about a TypeScript method (measured on a
// C#+TS repo: "methods here never contain an `invocation_expression` — 100% of 53" on the TypeScript client). Out of the
// grammar's vocabulary ⇒ the surface is undecidable for that scope, not false.
const inGrammar = (s, nt) => {
  if (!s.g) return true;
  const b = bindings[s.g];
  return !b || b.nodeTypes.has(nt);
};
// a deco string already carries its own wrapping sigil — `[Route]` (C#), `#[AsCommand]` (PHP) — versus a bare
// name (`Test`) that still needs its `@` prefix reconstructed wherever a deco is turned into a pid or a display
// label (§054b: `#[` joins `[` here as a self-delimiting sigil, the same way it joined `take()`'s sigil test above).
// §048 — a bare-stored name is ambiguous by itself: it means "strip the `@` off Java/TS/…" for every sigiled
// grammar, but for a grammar whose ENTIRE decoration vocabulary is sigil-less in the source (Solidity's
// `modifier_invocation`, §043's `b.decoBare`) it means the opposite — there was never an `@` to strip, and
// reconstructing one prints syntax the language does not have (`@onlyOwner`). Resolved with the caller's grammar,
// derived from the SAME structural set §043 already built (never a language name): a grammar is sigil-less only
// when every node type its `b.deco` derivation found is also in `b.decoBare` — today that is Solidity alone.
const sigilLessGrammar = g => {
  if (!g || !GRAMMARS.includes(g)) return false;
  const b = bindingFor(g);
  return b.deco.size > 0 && b.decoBare.size === b.deco.size;
};
export const decoSigiled = d => d[0] === '[' || d.startsWith('#[');
export const decoLabel = (d, g) => (decoSigiled(d) || sigilLessGrammar(g) ? d : '@' + d);
export function applyVocab(s, vb) {
  if (BODY_KINDS.has(s.kind) && !s.noBody) {
    for (const nt of vb.NT)
      if (inGrammar(s, nt)) s.preds['auto.has:' + nt] = s.seen.has(nt) ? 'true' : 'false';
    for (const c of vb.CALL) s.preds['auto.call:' + c] = s.calls.has(c) ? 'true' : 'false';
    for (const sh of vb.SHAPE)
      if (inGrammar(s, sh.split('(')[0])) s.preds['auto.stshape:' + sh] = s.shapes.has(sh) ? 'true' : 'false';
  }
  // applicability domains, learned from the partition itself: decorations / heritage / declared return types are decidable
  // only for node types seen carrying one (a TS interface is never decorated, so "types here are annotated with @Handler"
  // must be counted over classes, not over classes+interfaces; a method extends nothing at all)
  const inDom = (list, nt) => !list || !nt || list.includes(nt);
  if (s.kind !== 'file' && inDom(vb.DNT, s.nt))
    for (const d of vb.DECO) s.preds['auto.deco:' + decoLabel(d, s.g)] = s.decos.includes(d) ? 'true' : 'false';
  if (s.kind === 'type' && inDom(vb.ENT, s.nt))
    for (const e of vb.EXT) s.preds['auto.extends:' + e] = s.sup.includes(e) ? 'true' : 'false';
  if (s.kind === 'method' && inDom(vb.RNT, s.nt))
    for (const r of vb.RET || [])
      s.preds['auto.returns:' + r] = (s.rets || []).includes(r) ? 'true' : 'false';
  if (s.kind === 'method' && inDom(vb.PNT, s.nt))
    for (const r of vb.PT || []) s.preds['auto.ptype:' + r] = (s.ptypes || []).includes(r) ? 'true' : 'false';
  if (s.kind === 'file') {
    // §058: a data grammar (JSON/YAML/TOML/properties, `b.data` — no name+body scope at all) has no import
    // construct to begin with, so scoring one against another grammar's import vocabulary is vacuously always
    // `false` — noise, not a fact ("composer.json does not import PHPUnit\Framework\TestCase"). Same category
    // boundary as `inGrammar` above (undecidable ⇒ absent, never `false`), keyed on `b.data` instead of a node
    // type since an import TOKEN is an open-vocabulary value, not a grammar-owned surface to look up.
    const gb = s.g && bindings[s.g];
    if (!gb || !gb.data)
      for (const i of vb.IMP) s.preds['auto.imp:' + i] = s.imports.includes(i) ? 'true' : 'false';
    if (vb.LEX) {
      const dom = vb.LEX[s.g || ''] || [];
      for (const pid of Object.keys(s.preds))
        if (pid.startsWith('auto.lex:') && !dom.includes(pid)) delete s.preds[pid];
    }
  }
}
export const isBool = pid => /^auto\.(has|call|deco|extends|imp|stshape|returns|ptype):/.test(pid);
// structural-shape facts (node-type presence, statement shapes, first statement, return shape, arity, local-variable
// shape): the null-model family that speaks only as a local contrast, never repo-wide — shared by mine() (the contrast
// gate) and report() (the presentation split), so the two never drift apart on what counts as "just syntax". `ret`
// here is the return-SHAPE fact (the first return statement's own child node type — `identifier`, `call_expression`,
// `bare`) — NOT the declared return-TYPE fact `auto.returns:`, which is a domain/semantic marker (§022, on par with
// `auto.extends:`/`auto.deco:`/`auto.ptype:`, none of which are in this family) and MUST be free to certify `_all:`.
// `(?=:|$)` is load-bearing: without it, unanchored `ret` prefix-matches `auto.returns:...` too, silently barring
// every declared-return-type fact in every language from ever certifying repo-wide (§022 — bug since inception,
// found only after 021 gave C# `rets` for the first time and the missing `_all:` return-type fact stood out).
export const STRUCT_PID = /^auto\.(has|stshape|varshape|first1|ret|arity)(?=:|$)/;
export const BODY_KINDS = new Set(['method', 'catch', 'finally', 'case']); // kinds whose bodies carry behaviour surfaces
export const jac = (A0, B0) => {
  const A = A0 instanceof Set ? A0 : new Set(A0),
    B = B0 instanceof Set ? B0 : new Set(B0);
  let i = 0;
  const [s, l] = A.size < B.size ? [A, B] : [B, A];
  for (const x of s) if (l.has(x)) i++;
  const u = A.size + B.size - i;
  return u ? i / u : 0;
};
// weighted Jaccard over role feature bags: a decorator, a supertype or a declared return type is a MARKER of what a scope is
// (3×); a name token is a hint (1×). Measured on the fixture: unweighted bags split `CreateXHandler`/`CancelXHandler` into
// four verb-groups that the clone-aware runner-up could not reunite, and a deviant handler fell between them as ambiguous.
const featW = f => (f.startsWith('dec:') || f.startsWith('sup:') || f.startsWith('ret:') ? 3 : 1);
export const jacW = (A0, B0) => {
  const A = A0 instanceof Set ? A0 : new Set(A0),
    B = B0 instanceof Set ? B0 : new Set(B0);
  let i = 0,
    u = 0;
  for (const x of A) {
    const w = featW(x);
    u += w;
    if (B.has(x)) i += w;
  }
  for (const x of B) if (!A.has(x)) u += featW(x);
  return u ? i / u : 0;
};
// a role-scoped NORM whose pid's own feature already sits in the group's medoid bag: the marker that FORMED the
// group at featW's 3× weight, so every certified member holds it BY CONSTRUCTION. Unanimity here is not a followed
// convention, it is the group's own definition read back (§003 resolution — measured 82%/55%/33%/100% of role
// facts across four partitions in three repos are exactly this). Shared by factTiers (report/rulesMarkdown, which
// SUPPRESSES these from the listing) and checkFile (which does NOT suppress — see the `defining` field on
// `governed`, spoken as a clause instead).
export function isDefiningFact(medoids, f) {
  if (!/^r\d/.test(f.cid) || f.exp !== 'true') return false;
  const md = medoids && medoids[+f.cid.slice(1).split(':')[0]];
  if (!md) return false;
  const m = /^auto\.(deco|extends|returns):@?(.+)$/.exec(f.pid);
  if (!m) return false;
  const pre = { deco: 'dec', extends: 'sup', returns: 'ret' }[m[1]];
  return md.feats.includes(pre + ':' + m[2]) || md.feats.includes(pre + ':' + m[2].replace(/^\[|\]$/g, ''));
}
// hasOwnProperty: model JSON counts are plain objects — a value literally named "constructor" must read 0, not Object.prototype.constructor
export const kt = (c, K, x, n) =>
  (((Object.prototype.hasOwnProperty.call(c, x) ? c[x] : 0) || 0) + 0.5) / (n + K / 2);
// the "ambient" acceptance test, shared: a candidate's OWN global rate (`k` of `n`) already clears the λ=8 display
// bound (docs/mathematics.md, "naming an expected value") with no look at whatever specific relationship is under
// test — the exact judgment call "this repo touches these with almost everything" needs, independent of which
// pairing produced the candidate. `certifyObligationRules` (ticket 073, birth-obligation companions) and
// `cochangeData` (ticket 074, co-change partners) both call this SAME function so the two callers can never drift
// on what counts as background versus a genuine, specific pattern — no new constant, CFG.lambda is the one this
// repo's other display-bound checks already use.
const K2 = 2;
export const clearsOwnRate = (k, n) => n > 0 && (k + 0.5) / (n + K2 / 2) >= 1 - 1 / CFG.lambda;
// file-level lineage over `H.fps`: `H.lc`'s keys are rewritten FORWARD on a rename (history.mjs moves the row to the
// new path and DELETES the old key), so a historical path is simply absent from it and cannot be looked up there.
// The usable old→new mapping is `fps[*].renames`, which records both sides of every code-file rename. Returns the
// resolver `historical path → the path that file lives at today`; `live` is every path alive at HEAD.
export function currentPathOf(fps, live) {
  const renamedTo = new Map();
  for (const fp of fps) for (const [o, n] of fp.renames || []) renamedTo.set(o, n);
  return rel => {
    let cur = rel;
    for (let i = 0; i < 20 && !live.has(cur) && renamedTo.has(cur); i++) cur = renamedTo.get(cur);
    return cur;
  };
}
// one change-archetype cell, rendered for a reader (§J4.1): a module path and a file suffix name themselves, while a
// role group is only an index until its medoid's own label speaks for it. Partition names may contain `#`, so the
// role index is split off the END of the key.
export function archCellLabel(model, cell) {
  const v = cell.slice(2);
  if (cell.startsWith('m:')) return v + '/';
  if (cell.startsWith('k:')) return '*.' + v;
  const i = v.lastIndexOf('#');
  const p = (model.partitions || []).find(x => x.name === v.slice(0, i));
  return `«${((p && p.medoids[+v.slice(i + 1)]) || {}).label || 'group'}»`;
}
// strongest share first, then the evidence that earned it; ties broken by what a reader can name without a lookup
// (a module, then a suffix, then a role group), so the label a shape carries is stable and reads as a place
const CELL_RANK = { m: 0, k: 1, g: 2 };
export const archCellSort = (a, b) =>
  b.share - a.share ||
  b.bits - a.bits ||
  CELL_RANK[a.cell[0]] - CELL_RANK[b.cell[0]] ||
  (a.cell < b.cell ? -1 : a.cell > b.cell ? 1 : 0);
// partners that historically change WITH files under `dirs`: the partner side is gated on its own direction (sup/commits of the edited side)
export const part = (model, name) => model.partitions.find(p => p.name === name) || { medoids: [], name };
export const scopeLabel = partName =>
  partName === '_root'
    ? 'repo-wide'
    : partName === '_repo'
      ? 'repo-wide (small packages merged)'
      : `package ${partName}`;
// ===== REPORT / STATUS / COMPLETENESS =====
// never round a share < 1 up to a misleading 100% — the floor sits at 99 so "100%" is reserved for an actual,
// exact 1.0 share (zero exceptions), matching what the rest of the product's own language teaches that phrase to
// mean; share === 1 still prints 100 (§G14)
export function pct(share) {
  const r = Math.round(share * 100);
  return share < 1 && r >= 100 ? 99 : r;
}
export const factLabel = (p, f) =>
  /^r\d/.test(f.cid)
    ? `group «${p.medoids[+f.cid.slice(1).split(':')[0]]?.label || 'group'}»`
    : f.cid.startsWith('d[')
      ? `local (${f.cid.slice(2, f.cid.indexOf(']'))}/)`
      : f.pkgWide
        ? scopeLabel(p.name.replace(/#.*$/, '')) + ' incl. tests/examples'
        : scopeLabel(p.name);
