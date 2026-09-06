// grain engine · the full local-to-global convention lattice for one file, with no acceptance cut
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extname } from 'node:path/posix';
import { EXT2GRAMMAR, GRAMMARS } from './config.mjs';
import { S } from './base.mjs';
import { applyVocab, isBool, kt, part, scopeLabel, skeyR } from './facts.mjs';
import { assignAll } from './mine.mjs';
import { bindingFor, parseFile } from './parse.mjs';
import {
  addModuleScopes,
  buildVocab,
  extractTree,
  hydrateScope,
  normalizeCR,
  partitionFor,
} from './partition.mjs';
import { extractScopes } from './scopes.mjs';

// ===== SPECTRUM (solicited exploration: the full lattice for one file, no acceptance cut) =====
export async function spectrum({ model, root, rel, minBits = 0, top = 0, scopesAll = null }) {
  const part = partitionFor(model, rel);
  if (!part) return { lines: [`(no partition covers ${rel}: nothing is mined here)`], rows: [] };
  const files = (part.files || []).slice();
  const fileSet = new Set(files);
  let ps = (
    scopesAll
      ? scopesAll.filter(s => fileSet.has(s.rel) && s.kind !== 'module').map(hydrateScope)
      : await extractTree(root, files)
  ).filter(s => s.name !== '<anon>');
  // (§013) the QUERIED file's own scopes come from the worktree, never replayed from the HEAD-indexed cache: a
  // file mid-edit must not have spectrum silently answer from its pre-edit shape while `check` (which already
  // reads this exact file's live content) sees the edit right next to it. §G20 already did this for a brand-new
  // untracked file (which never had a cache entry to begin with, so `scopesAll` never even mentioned it); this
  // generalizes that to every `rel`, tracked or not — drop any cached entry it has and re-parse its current disk
  // content the same way — one extra single-file parse, the same cost `checkFile` already pays for this file on
  // every `check` call, which is what makes a genuinely live answer affordable here.
  ps = ps.filter(s => s.rel !== rel);
  try {
    const src = normalizeCR(readFileSync(join(root, rel), 'utf8'));
    const { p, tree: tr } = await parseFile(extname(rel), src);
    const b = bindingFor(p._g);
    ps.push(...extractScopes(rel, tr, b, p._g).filter(s => s.name !== '<anon>'));
    tr.delete();
  } catch {
    /* unsupported extension, or the file vanished mid-call — the existing "no scopes extracted" message below is honest here */
  }
  addModuleScopes(ps);
  const vocab = buildVocab(ps, { deep: true });
  for (const s of ps) applyVocab(s, vocab);
  const { assign, amb } = assignAll(ps, part.medoids);
  const fileScopes = ps.filter(s => s.rel === rel);
  if (!fileScopes.length) {
    // §057 — "(no scopes extracted)" reads as "this file's content has nothing worth extracting", which is true
    // for a genuinely empty/pure-data file under a grammar grain HAS, and false — misleading by omission — for a
    // format grain never reads at all (an extension absent from EXT2GRAMMAR, the same test `check` already makes
    // for its own "no grammar for …" line). Distinguish them here rather than let every unsupported format read
    // as content-free.
    const ext = extname(rel);
    if (!EXT2GRAMMAR[ext])
      return {
        lines: [
          `(no grammar for "${ext || 'a file without extension'}" — grain never reads this format, so ${rel} was not parsed at all; grain parses ${GRAMMARS.join(', ')})`,
        ],
        rows: [],
      };
    return { lines: [`(no scopes extracted for ${rel})`], rows: [] };
  }
  const roleOf = (s, i) => {
    const st = part.assignments[skeyR(s.rel, s)];
    if (st !== undefined && st !== -1) return st;
    return assign.has(i) && !amb.has(i) ? assign.get(i) : undefined;
  };
  const myRoles = new Set();
  fileScopes.forEach(s => {
    const r = roleOf(s, ps.indexOf(s));
    if (r !== undefined) myRoles.add('r' + r + ':' + s.kind);
  });
  const segs = rel.split('/').slice(0, -1);
  const myDirs = [];
  for (let k = 1; k <= segs.length; k++) myDirs.push(segs.slice(0, k).join('/'));
  const cells = new Map();
  const add2 = (cid, pid, v) => {
    const k = cid + S + pid;
    let c = cells.get(k);
    if (!c) {
      c = Object.create(null);
      cells.set(k, c);
    }
    c[v] = (c[v] || 0) + 1;
  };
  ps.forEach((s, i) => {
    for (const [pid, v] of Object.entries(s.preds)) {
      add2('_all:' + s.kind, pid, v);
      const r = roleOf(s, i);
      if (r !== undefined && myRoles.has('r' + r + ':' + s.kind)) add2('r' + r + ':' + s.kind, pid, v);
      for (const d of myDirs) if (s.rel.startsWith(d + '/')) add2('d[' + d + ']:' + s.kind, pid, v);
    }
  });
  const idxCost = Math.ceil(Math.log2(Math.max(cells.size, 2)));
  const rows = [];
  for (const [key, c] of cells) {
    const [cid, pid] = key.split(S);
    const kind = cid.split(':').pop();
    if (/^auto\.dir\d/.test(pid) && !/^r\d/.test(cid)) continue;
    const n = Object.values(c).reduce((a, b) => a + b, 0);
    if (n < 3) continue;
    const Vv = Object.keys(c).sort();
    const bl = isBool(pid);
    const K = bl ? 2 : Vv.length + 1;
    const allC = cells.get('_all:' + kind + S + pid);
    const allN = allC ? Object.values(allC).reduce((a, b) => a + b, 0) : n;
    let data = 0;
    const isAll = cid.startsWith('_all');
    if (isAll) {
      const B = Math.max(bl ? 2 : Vv.length, 2);
      for (const v of Vv) if (c[v]) data += c[v] * Math.log2(kt(c, K, v, n) * B);
    } else for (const v of Vv) if (c[v]) data += c[v] * Math.log2(kt(c, K, v, n) / kt(allC, K, v, allN));
    const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(n, 2)) - idxCost;
    let exp = null,
      ne = -1;
    for (const v of Vv)
      if (c[v] > ne) {
        exp = v;
        ne = c[v];
      }
    if (!bl && ['other', 'none', 'mixed', '?'].includes(exp)) continue;
    // the same boundary rule as mining: "never X" rows are shown only where X is a real choice here (≥ 20% of the kind
    // partition-wide use it) — otherwise the lattice is a list of every callee the file happens not to call
    if (bl && exp === 'false') {
      const tot = allC ? Object.values(allC).reduce((a, b) => a + b, 0) : 0;
      if (!tot || (allC['true'] || 0) / tot < 0.2) continue;
    }
    const share = ne / n;
    const isNorm = part.facts.some(f => f.cid === cid && f.pid === pid && f.exp === exp);
    // a role-conditioned cid's population is only the file's scopes IN THAT ROLE (roleOf, the same helper the cells above
    // are built with) — filtering by kind alone let a sibling role's scope in the same file contaminate this row's own
    // per-file deviation check (§001)
    const roleMatch = /^r(\d+):/.exec(cid);
    const mine3 = fileScopes
      .filter(
        s =>
          s.kind === kind &&
          s.preds[pid] !== undefined &&
          (!roleMatch || roleOf(s, ps.indexOf(s)) === +roleMatch[1])
      )
      .map(s => s.preds[pid]);
    const dev = mine3.some(v => v !== exp);
    rows.push({
      cid,
      pid,
      exp,
      share,
      n,
      bits,
      isNorm,
      dev,
      has: mine3.length > 0,
      grp: /^r\d/.test(cid) ? 0 : cid.startsWith('d[') ? 1 : 2,
      depth: cid.startsWith('d[') ? cid.split('/').length : 0,
    });
  }
  rows.sort((a, b) => a.grp - b.grp || b.depth - a.depth || b.bits - a.bits || (a.pid < b.pid ? -1 : 1));
  const shown = rows.filter(r => r.bits >= minBits && r.has);
  const out = top ? shown.slice(0, top) : shown;
  const lines = [
    `spectrum ${rel} — ${scopeLabel(part.name)} · ${fileScopes.length} scopes · ${cells.size} cells computed · ${rows.length} rows (n≥3) · ${shown.length} at bits≥${minBits} · ${part.facts.length} accepted NORMs in model`,
  ];
  for (const r of out)
    lines.push(
      `  [${r.isNorm ? 'NORM' : 'obs '}] ${r.cid} ${r.pid} = ${r.exp}  share ${r.share.toFixed(2)} n ${r.n} bits ${r.bits.toFixed(1)}${r.dev ? '  ← THIS FILE DEVIATES' : ''}`
    );
  return { lines, rows: out, partition: part.name };
}
