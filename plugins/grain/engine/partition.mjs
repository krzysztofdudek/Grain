// grain engine · package roots, MDL cuts, the current-tree extraction, the vocabulary, and scope (de)serialization
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { basename, dirname, extname } from 'node:path/posix';
import { SUP, TOPK, EXCL, HARD_EXCL } from './config.mjs';
import { relFactsFor } from './relations.mjs';
import { S, toPosix } from './base.mjs';
import { stem0 } from './extract.mjs';
import { BODY_KINDS } from './facts.mjs';
import { tokenize, bindingFor, nameShape, parseFile } from './parse.mjs';
import { extractScopes } from './scopes.mjs';
import { twinsOf } from './superposition.mjs';

// ===== CURRENT-TREE EXTRACTION + PARTITIONING (shared by learn and spectrum) =====
const PKG_ROOT_RE =
  /^(package\.json|pyproject\.toml|go\.mod|pom\.xml|Cargo\.toml|setup\.cfg)$|\.(csproj|sln)$/;
export function findPackageRoots(root, allPaths = null) {
  const pkgs = [];
  if (allPaths) {
    for (const rel of allPaths) {
      if (HARD_EXCL.test(rel)) continue; // git mode: the tracked tree IS the universe
      if (PKG_ROOT_RE.test(basename(rel))) {
        const d2 = dirname(rel);
        const p = d2 === '.' ? '.' : d2;
        if (!pkgs.includes(p)) pkgs.push(p);
      }
    }
    return pkgs.sort();
  }
  (function fp(d) {
    let es;
    try {
      es = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of es) {
      const full = join(d, e.name);
      const rel = toPosix(relative(root, full));
      if (EXCL.test(rel + '/')) continue;
      if (e.isDirectory()) fp(full);
      else if (PKG_ROOT_RE.test(e.name)) {
        const p = toPosix(relative(root, d)) || '.';
        if (!pkgs.includes(p)) pkgs.push(p);
      }
    }
  })(root);
  return pkgs.sort();
}
// ===== MDL PARTITIONING (constitution: the directory tree is cut where cutting compresses) =====
// Per-file categorical features — grammar and the LEXICAL layer only: a partition means "an independent style
// population", so the features are exactly what style is. Directory signatures (file-name shape, kind mix) are
// deliberately NOT here — they belong to the dir cells inside a partition, and cutting on them shreds the tree
// into per-directory slivers (measured on the planted fixture). A post-order
// DP over the directory tree: a directory either codes its whole subtree as one region, or splits — paying, per new
// region, the bits to name its root. Manifests (package.json, go.mod) are NOT consulted here: they remain resolution
// artifacts (workspaces, module graph); the statistical partition is earned by compression alone.
export function mdlCuts(all) {
  const feat = new Map();
  for (const s of all) {
    if (s.kind !== 'file') continue;
    feat.set(s.rel, [
      s.g || '?',
      s.preds['auto.lex:quote'] || '?',
      s.preds['auto.lex:semi'] || '?',
      s.preds['auto.lex:indent'] || '?',
      s.preds['auto.lex:decl'] || '?',
    ]);
  }
  const F = 5;
  const kids = new Map();
  const own = new Map();
  for (const rel of feat.keys()) {
    const segs = rel.split('/');
    let d = '.';
    for (let i = 0; i < segs.length - 1; i++) {
      const nd = d === '.' ? segs[i] : d + '/' + segs[i];
      (kids.get(d) || kids.set(d, new Set()).get(d)).add(nd);
      d = nd;
    }
    (own.get(d) || own.set(d, []).get(d)).push(rel);
  }
  let nd = 1;
  for (const st of kids.values()) nd += st.size;
  const CUT = Math.log2(Math.max(2, nd));
  const code = counts => {
    let c = 0;
    for (const cnt of counts) {
      const vs = Object.keys(cnt);
      const n = vs.reduce((a, v) => a + cnt[v], 0);
      if (!n) continue;
      for (const v of vs) c += cnt[v] * Math.log2(n / cnt[v]);
      c += 0.5 * Math.max(0, vs.length - 1) * Math.log2(Math.max(n, 2));
    }
    return c;
  };
  const mk = () => Array.from({ length: F }, () => ({}));
  const addRels = (counts, rels) => {
    for (const r of rels || []) {
      const fv = feat.get(r);
      for (let i = 0; i < F; i++) counts[i][fv[i]] = (counts[i][fv[i]] || 0) + 1;
    }
  };
  const best = new Map();
  const regions = new Map();
  const subCounts = new Map();
  const dfs = d => {
    const cs = [...(kids.get(d) || [])].sort();
    const counts = mk();
    addRels(counts, own.get(d));
    const ownCost = code(counts);
    let splitCost = ownCost + ((own.get(d) || []).length ? CUT : 0);
    const cuts = (own.get(d) || []).length ? [d] : [];
    for (const c of cs) {
      dfs(c);
      splitCost += best.get(c) + CUT;
      cuts.push(...regions.get(c));
      const sc = subCounts.get(c);
      for (let i = 0; i < F; i++)
        for (const v of Object.keys(sc[i])) counts[i][v] = (counts[i][v] || 0) + sc[i][v];
    }
    subCounts.set(d, counts);
    const mergedCost = code(counts);
    if (cs.length && splitCost < mergedCost) {
      best.set(d, splitCost);
      regions.set(d, cuts);
    } else {
      best.set(d, mergedCost + CUT);
      regions.set(d, [d]);
    }
  };
  dfs('.');
  return regions
    .get('.')
    .filter(d => d !== '.')
    .sort();
}
export const partOfFn = pkgs => rel => {
  let b = null;
  for (const d of pkgs) {
    if (d === '.') continue;
    if ((rel + '/').startsWith(d + '/')) if (!b || d.length > b.length) b = d;
  }
  return b || '_root';
};
// the partition a file is judged against: its own package (or the merged repo bucket); test files only ever against a tests
// partition — a test suite too small to have norms of its own gets no partition (null), never the production norms
export const partitionFor = (model, rel) => {
  const key = partOfFn(model.cuts || model.pkgs)(rel);
  return (
    model.partitions.find(p => p.name === key) ||
    model.partitions.find(p => p.name === '_repo') ||
    model.partitions[0] ||
    null
  );
};
// normalize a lone CR (not part of a CRLF pair) to LF before parsing — some vendored grammars (tree-sitter-kotlin
// confirmed) don't treat a bare 0x0D as a line-comment terminator, silently swallowing the declaration that
// follows on the same "line" as far as the grammar's tokenizer is concerned. Preserves byte length and line
// count exactly (CR and LF are both one character each), so line/endLine/startIndex stay consistent with the
// file's real content; a no-op for LF-only and CRLF files. (§G17)
export function normalizeCR(src) {
  return src.replace(/\r(?!\n)/g, '\n');
}
export async function extractTree(root, files, onProgress, readSource = null, cached = null, relOut = null) {
  const all = [];
  let i = 0,
    reused = 0;
  for (const rel of files) {
    const hit = cached ? cached(rel) : null; // extraction cache keyed by (blob sha, path): an unchanged file is never re-parsed
    if (hit) {
      const hs = Array.isArray(hit) ? hit : hit.s;
      all.push(...hs.map(hydrateScope));
      if (relOut && !Array.isArray(hit)) relOut[rel] = hit.r ?? null;
      reused++;
      continue;
    }
    let src;
    try {
      src = readSource ? readSource(rel) : readFileSync(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    if (src != null) src = normalizeCR(src);
    if (src == null || src.length > 1.5e6) continue;
    try {
      const { p, tree: tr } = await parseFile(extname(rel), src);
      const b = bindingFor(p._g);
      all.push(...extractScopes(rel, tr, b, p._g));
      if (relOut) relOut[rel] = relFactsFor(rel, src, tr, p._g); // relation facts ride the same parse — the tree is in hand exactly once
      tr.delete();
    } catch {}
    if (onProgress && ++i % 200 === 0) onProgress(i, files.length);
  }
  if (onProgress) onProgress(i, files.length, reused);
  return all;
}
export function addModuleScopes(all) {
  const dirFiles = new Map();
  for (const s of all)
    if (s.kind === 'file') {
      const d = dirname(s.rel);
      (dirFiles.get(d) || dirFiles.set(d, []).get(d)).push(s);
    }
  for (const [d, fs2] of [...dirFiles].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
    if (fs2.length >= 3 && d !== '.') {
      const cnt = {};
      for (const f2 of fs2) {
        const sh = f2.preds['auto.filenameshape'];
        cnt[sh] = (cnt[sh] || 0) + 1;
      }
      all.push({
        kind: 'module',
        name: basename(d),
        rel: d,
        line: 1,
        sup: [],
        decos: [],
        calls: new Set(),
        seen: new Set(),
        shapes: new Set(),
        imports: [],
        feats: [],
        ownCount: 0,
        preds: {
          'auto.moddirshape': nameShape(basename(d)),
          'auto.modfileshape': Object.entries(cnt).sort(
            (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)
          )[0][0],
          'auto.modsize': fs2.length >= 20 ? '20+' : fs2.length >= 8 ? '8-19' : '3-7',
        },
      });
    }
}
export function buildVocab(ps, { deep = false } = {}) {
  const V = {
    nodeType: new Map(),
    call: new Map(),
    imp: new Map(),
    ext: new Map(),
    shape: new Map(),
    deco: new Map(),
    ret: new Map(),
    pt: new Map(),
  };
  for (const s of ps) {
    if (BODY_KINDS.has(s.kind)) {
      for (const nt of s.seen)
        if (/statement|expression|declaration|clause/.test(nt))
          V.nodeType.set(nt, (V.nodeType.get(nt) || 0) + 1);
      for (const c of s.calls) V.call.set(c, (V.call.get(c) || 0) + 1);
      for (const sh of s.shapes) V.shape.set(sh, (V.shape.get(sh) || 0) + 1);
    }
    if (s.kind !== 'file' && s.kind !== 'module') {
      for (const d of s.decos) V.deco.set(d, (V.deco.get(d) || 0) + 1);
      if (s.kind === 'type') for (const e of s.sup) V.ext.set(e, (V.ext.get(e) || 0) + 1);
      for (const r of s.rets || []) V.ret.set(r, (V.ret.get(r) || 0) + 1);
      for (const r of s.ptypes || []) V.pt.set(r, (V.pt.get(r) || 0) + 1);
    }
    if (s.kind === 'file') for (const i of s.imports) V.imp.set(i, (V.imp.get(i) || 0) + 1);
  }
  // support-then-count ordering with `token asc` as the total tie-break (I2a: a vocabulary flip changes every downstream count)
  const top = k => {
    const floor = deep ? Math.max(2, Math.floor((SUP[k] || 8) / 4)) : SUP[k] || 8;
    const cap = (TOPK[k] || 40) * (deep ? 4 : 1);
    return [...V[k]]
      .filter(([, c]) => c >= floor)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, cap)
      .map(([x]) => x);
  };
  const seenWith = pred =>
    [
      ...new Set(ps.filter(s => s.kind !== 'file' && s.kind !== 'module' && s.nt && pred(s)).map(s => s.nt)),
    ].sort();
  return {
    NT: top('nodeType'),
    CALL: top('call'),
    IMP: top('imp'),
    EXT: top('ext'),
    SHAPE: top('shape'),
    DECO: top('deco'),
    RET: top('ret'),
    PT: top('pt'),
    DNT: seenWith(s => s.decos.length),
    ENT: seenWith(s => s.sup.length),
    RNT: seenWith(s => (s.rets || []).length),
    PNT: seenWith(s => (s.ptypes || []).length),
    LEX: lexDomain(ps),
  };
}
// lexical domain: per grammar, the lexical surfaces whose value is a CHOICE here (≥ 2 values observed across the partition's files).
// Double quotes in Go or semicolons in Java are the language, not a convention; single quotes in a JS repo that also holds
// double-quoted files are. The leading directive is exempt: its absence is always a choice (`'use strict'` vs nothing).
export function lexDomain(ps) {
  const seen = new Map();
  for (const s of ps) {
    if (s.kind !== 'file') continue;
    for (const [pid, v] of Object.entries(s.preds))
      if (pid.startsWith('auto.lex:')) {
        const k = (s.g || '') + S + pid;
        (seen.get(k) || seen.set(k, new Set()).get(k)).add(v);
      }
  }
  const quoteChoice = g => {
    if (!g) return false;
    const b = bindingFor(g);
    return ![...b.nodeTypes].some(t =>
      /^(char|character|char_literal|character_literal|rune_literal)$/.test(t)
    );
  }; // `'` is a char literal in C/C++/C#/Rust/Kotlin/Scala/Zig (and a rune in Go): no choice to make
  const dom = {};
  for (const [k, vs] of seen) {
    const [g, pid] = k.split(S);
    if (vs.size >= 2 || pid === 'auto.lex:directive' || (pid === 'auto.lex:quote' && quoteChoice(g)))
      (dom[g] ||= []).push(pid);
  }
  for (const g of Object.keys(dom)) dom[g].sort();
  return dom;
}
export function groupPartitions(all, pkgs) {
  const partOf = partOfFn(pkgs);
  const byPart = new Map();
  for (const s of all) {
    const p = partOf(s.rel);
    (byPart.get(p) || byPart.set(p, []).get(p)).push(s);
  }
  const merged = new Map();
  const small = [];
  for (const [p, ss] of [...byPart].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
    ss.length < 100 ? small.push(...ss) : merged.set(p, ss);
  // the spec's 300-scope floor merges small packages into one repo bucket; grain keeps a smaller bucket (≥ 30 scopes) as a
  // partition rather than going silent — a 150-scope library (express's lib/) still has groups, markers, files and directories
  // to answer `where` with, and the MDL gates already keep a thin field from speaking conventions it cannot back
  const smallSrc = new Set();
  for (const [p, ss] of byPart) if (ss.length < 100) smallSrc.add(p);
  if (small.length >= 30) merged.set(smallSrc.size === 1 ? [...smallSrc][0] : '_repo', small); // one small package is itself, not "small packages merged"
  return merged;
}
// scope records round-trip through JSON (sets → sorted arrays) for the current-tree scope cache
export const serializeScope = s => ({
  kind: s.kind,
  name: s.name,
  own: s.own || null,
  rel: s.rel,
  line: s.line,
  endLine: s.endLine || s.line,
  ord: s.ord,
  g: s.g || null,
  nt: s.nt || null,
  noBody: !!s.noBody,
  doc: s.doc || [],
  sk: s.sk || null,
  sup: s.sup,
  supKind: s.supKind || {},
  decos: s.decos,
  rets: s.rets || [],
  ptypes: s.ptypes || [],
  calls: [...s.calls].sort(),
  seen: [...s.seen].sort(),
  shapes: [...s.shapes].sort(),
  preds: { ...s.preds },
  imports: s.imports,
  feats: s.feats,
  ownCount: s.ownCount,
  vals: s.vals || [],
});
export const hydrateScope = r => ({
  ...r,
  calls: new Set(r.calls),
  seen: new Set(r.seen),
  shapes: new Set(r.shapes),
  preds: { ...r.preds },
});
// implications per group: what a new member COMES WITH — a same-stem companion file (whatever dotted suffix the repo
// pairs these files with: `*.test.tsx`, `*.stories.tsx`, `*.module.ts`), and the file that registers/imports the
// members (DI registration, a barrel) — raw path + edge evidence, no name semantics
export function applyGroupImplications(model, files) {
  const sufChain = rel => {
    const parts = basename(rel).split('.');
    return parts.length >= 2 ? '*.' + parts.slice(1).join('.') : null;
  };
  const byStem = new Map();
  for (const f2 of model.pathsAll || files)
    (byStem.get(stem0(f2)) || byStem.set(stem0(f2), []).get(stem0(f2))).push(f2);
  const inEdges = new Map();
  for (const e of model.edges || []) (inEdges.get(e.to) || inEdges.set(e.to, []).get(e.to)).push(e.from);
  const impliedOf = fileList => {
    const mf = [...new Set(fileList)];
    if (mf.length < 4) return null;
    const fset = new Set(mf);
    const compCnt = new Map();
    const compEx = new Map();
    let withComp = 0;
    for (const f2 of mf) {
      const all2 = byStem.get(stem0(f2)) || [];
      if (all2.length > 6) continue; // `index`-like stems pair everything with everything — no evidence
      const sibs = all2.filter(s2 => s2 !== f2 && !fset.has(s2) && sufChain(s2) !== sufChain(f2));
      if (!sibs.length) continue;
      withComp++;
      for (const sfx of new Set(sibs.map(sufChain).filter(Boolean))) {
        compCnt.set(sfx, (compCnt.get(sfx) || 0) + 1);
        if (!compEx.has(sfx))
          compEx.set(
            sfx,
            sibs.find(s2 => sufChain(s2) === sfx)
          );
      }
    }
    const topComp = [...compCnt].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    const imp = new Map();
    for (const f2 of mf)
      for (const src2 of inEdges.get(f2) || [])
        if (!fset.has(src2)) imp.set(src2, (imp.get(src2) || 0) + 1);
    const topImp = [...imp].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    const out2 = {};
    if (topComp && topComp[1] / mf.length >= 0.6)
      out2.companion = {
        pattern: topComp[0],
        share: +(topComp[1] / mf.length).toFixed(2),
        n: mf.length,
        example: compEx.get(topComp[0]),
      };
    if (topImp && topImp[1] / mf.length >= 0.6 && topImp[1] >= 4)
      out2.importedBy = { file: topImp[0], n: topImp[1], of: mf.length };
    else {
      const suffixOf = f3 => {
        const parts = basename(f3).split('.');
        return parts.length >= 3 ? '*.' + parts.slice(-2).join('.') : null;
      };
      const cnt2 = new Map();
      for (const f3 of mf) {
        const sufs = new Set(
          (inEdges.get(f3) || [])
            .filter(s3 => !fset.has(s3))
            .map(suffixOf)
            .filter(Boolean)
        );
        for (const sf3 of sufs) cnt2.set(sf3, (cnt2.get(sf3) || 0) + 1);
      }
      const top2 = [...cnt2].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
      if (top2 && top2[1] / mf.length >= 0.6 && top2[1] >= 4)
        out2.importedByPattern = { pattern: top2[0], n: top2[1], of: mf.length };
    }
    return Object.keys(out2).length ? out2 : null;
  };
  for (const part2 of model.partitions) {
    for (const [mk, fl] of Object.entries(part2.markerImplied || {})) {
      const r2 = impliedOf(fl);
      if (r2) part2.markerImplied[mk] = r2;
      else delete part2.markerImplied[mk];
    }
    part2.groupImplied = {};
    const byRole2 = new Map();
    for (const [k, r2] of Object.entries(part2.assignments)) {
      if (r2 === -1) continue;
      (byRole2.get(r2) || byRole2.set(r2, new Set()).get(r2)).add(k.split('#')[0]);
    }
    for (const [r2, fset] of byRole2) {
      const r3 = impliedOf([...fset]);
      if (r3) part2.groupImplied[r2] = r3;
    }
    // (§J3.2, the "name stem" half) which OTHER role group of this partition group A's members are paired with by
    // `stem0` — accepted on a RAW SHARE, impliedOf.companion's own >= 0.6 over n >= 4 just above, and deliberately
    // NOT an MDL/lambda test: the two halves of a `kin:` line rest on different categories of evidence, and this one's
    // standing precedent is companion/importedBy, which already speaks through `recipe:` from the same block.
    part2.groupKin = {};
    const roleFiles = [...byRole2].map(([r2, fset]) => [r2, [...fset].sort()]);
    for (const [rA, fa] of roleFiles) {
      if (fa.length < 4) continue;
      const aStems = fa.map(stem0);
      let best = null;
      for (const [rB, fb] of roleFiles) {
        if (rB === rA) continue;
        const bStems = new Set(fb.map(stem0));
        let n2 = 0;
        for (const st2 of aStems) if (bStems.has(st2)) n2++;
        if (!best || n2 > best.n || (n2 === best.n && rB < best.role)) best = { role: rB, n: n2 };
      }
      if (!best || best.n / fa.length < 0.6) continue;
      part2.groupKin[rA] = {
        role: best.role,
        label: part2.medoids[best.role]?.label || 'group',
        n: best.n,
        of: fa.length,
        share: +(best.n / fa.length).toFixed(2),
      };
    }
  }
}
// structural twins (H4, §J3.4): one entry per (partition, role) with a certified profile, dominant name suffix
// computed alongside (the same majority-vote shape J3.2's groupKin already uses for role membership) so a twin
// pair can report `namedDifferently` without a second pass over `assignments`.
export function applyStructuralTwins(model, log) {
  const pool = [];
  const twinMeta = new Map();
  for (const part2 of model.partitions)
    for (const [r, pf] of Object.entries(part2.profiles || {})) {
      if (!pf || !pf._tpl) continue;
      const role = +r;
      const label = part2.medoids[role]?.label || 'group';
      const key = part2.name + '#' + r;
      const sufCnt = new Map();
      for (const [mk, rr] of Object.entries(part2.assignments || {})) {
        if (rr !== role) continue;
        const toks = tokenize(mk.split('#')[2]);
        if (!toks.length) continue;
        const suf = toks[toks.length - 1];
        sufCnt.set(suf, (sufCnt.get(suf) || 0) + 1);
      }
      const topSuf = [...sufCnt].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
      pool.push({ key, part: part2.name, role, label, tpl: pf._tpl, shared: pf.shared });
      twinMeta.set(key, { part: part2.name, role, label, suffix: topSuf ? topSuf[0] : null });
    }
  model.twins = twinsOf(pool, log).map(pr => {
    const A = twinMeta.get(pr.a),
      B = twinMeta.get(pr.b);
    const twin = {
      a: { part: A.part, role: A.role, label: A.label },
      b: { part: B.part, role: B.role, label: B.label },
      sim: pr.coverage,
    };
    if (A.suffix && B.suffix && A.suffix !== B.suffix) twin.namedDifferently = [A.suffix, B.suffix];
    return twin;
  });
}
