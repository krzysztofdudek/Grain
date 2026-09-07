// grain engine · proposal writer · the sub-gate lattice and the identifiers a rule is written in
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORE, LAMBDA_BOUND, MIN_SUPPORT, SUPERMAJORITY } from './propose-base.mjs';

const CELL_SEP = '\u0001'; // the same cell-key separator `core.mjs` uses; a pid can contain spaces, so ' ' would truncate it
export async function partitionLattice(repo) {
  const modelPath = join(repo, '.grain', 'cache', 'model.json');
  const treePath = join(repo, '.grain', 'cache', 'tree.json');
  if (!existsSync(modelPath) || !existsSync(treePath)) return { rows: [], reason: 'no grain cache (.grain/cache/{model,tree}.json) — run `grain export` on this repo first' };
  const core = await import(`file://${CORE}`);
  const { hydrateScope, applyVocab, buildVocab, skeyR, isBool, kt } = core;
  const model = JSON.parse(readFileSync(modelPath, 'utf8'));
  const tree = JSON.parse(readFileSync(treePath, 'utf8'));
  const byFile = new Map();
  for (const [k, v] of Object.entries(tree)) {
    const rel = k.slice(k.indexOf('|') + 1);
    byFile.set(rel, (Array.isArray(v) ? v : v.s) || []);
  }
  const rows = [];
  for (const part of model.partitions || []) {
    const ps = [];
    for (const rel of part.files || []) for (const raw of byFile.get(rel) || []) { if (raw.name !== '<anon>') ps.push(hydrateScope(raw)); }
    if (ps.length < 3) continue;
    const vocab = buildVocab(ps, { deep: true });
    for (const s of ps) applyVocab(s, vocab);
    const roleOf = s => { const r = part.assignments?.[skeyR(s.rel, s)]; return r !== undefined && r !== -1 ? r : undefined; };
    const cells = new Map(), sites = new Map();
    const add2 = (cid, pid, v, s) => {
      const k = cid + CELL_SEP + pid;
      const c = cells.get(k) || cells.set(k, Object.create(null)).get(k);
      c[v] = (c[v] || 0) + 1;
      // `tparams`/`own` (ticket 123, issue 125's follow-up): carried through from the hydrated scope so a row's
      // eventual classifier can test its identifier against the ACTUAL declaring site's type parameters instead
      // of guessing from name shape — the same fact `export.mjs`'s `site()` already exposes on a certified
      // convention's own sites.
      (sites.get(k) || sites.set(k, []).get(k)).push({ rel: s.rel, kind: s.kind, name: s.name, line: s.line, v, tparams: s.tparams || [], own: s.own || null });
    };
    for (const s of ps) {
      const r = roleOf(s);
      for (const [pid, v] of Object.entries(s.preds)) {
        add2('_all:' + s.kind, pid, v, s);
        if (r !== undefined) add2('r' + r + ':' + s.kind, pid, v, s);
      }
    }
    const idxCost = Math.ceil(Math.log2(Math.max(cells.size, 2)));
    const factKey = new Set((part.facts || []).map(f => f.cid + CELL_SEP + f.pid + CELL_SEP + f.exp));
    for (const [key, c] of cells) {
      const [cid, pid] = key.split(CELL_SEP);
      if (!pid) continue;
      const kind = cid.split(':').pop();
      const n = Object.values(c).reduce((a, b) => a + b, 0);
      if (n < 3) continue;
      const Vv = Object.keys(c).sort();
      const bl = isBool(pid);
      const K = bl ? 2 : Vv.length + 1;
      const allC = cells.get('_all:' + kind + CELL_SEP + pid);
      const allN = allC ? Object.values(allC).reduce((a, b) => a + b, 0) : n;
      let data = 0;
      if (cid.startsWith('_all')) { const B = Math.max(bl ? 2 : Vv.length, 2); for (const v of Vv) if (c[v]) data += c[v] * Math.log2(kt(c, K, v, n) * B); }
      else if (!allC) continue; // no partition-wide reference for this cell — nothing to contrast against
      else for (const v of Vv) if (c[v]) data += c[v] * Math.log2(kt(c, K, v, n) / kt(allC, K, v, allN));
      const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(n, 2)) - idxCost;
      let exp = null, ne = -1;
      for (const v of Vv) if (c[v] > ne) { exp = v; ne = c[v]; }
      if (!bl && ['other', 'none', 'mixed', '?'].includes(exp)) continue;
      if (bl && exp === 'false') { const tot = allN; if (!tot || (allC?.['true'] || 0) / tot < 0.2) continue; }
      const share = ne / n;
      const isNorm = factKey.has(cid + CELL_SEP + pid + CELL_SEP + exp);
      // The row's own host site (ticket 123): the first site among this cell's OWN majority-value population,
      // carrying the exact fact `buildAspects` tests an identifier against — never a re-derived guess. A row
      // with no majority-side site left (should not happen; `ne` counted at least one) falls back to `[]`/`null`,
      // the same "nothing declared" shape a hand-built test row already gets when it omits these fields.
      const hostSite = (sites.get(key) || []).find(s => s.v === exp) || null;
      rows.push({
        partition: part.name, cid, pid, exp, share, n, ne, bits: +bits.toFixed(1), isNorm,
        role: /^r(\d+):/.exec(cid)?.[1] ?? null, kind,
        tparams: hostSite?.tparams || [], own: hostSite?.own || null,
        deviants: (sites.get(key) || []).filter(s => s.v !== exp).map(s => `${s.rel}#${s.name}`),
      });
    }
  }
  return { rows, reason: null };
}
// The sub-gate band: practised by a supermajority but below the certification bound, with real support. These
// are the rows a maintainer reads as "a house rule that has not finished spreading".
export const subGate = rows => rows
  .filter(r => !r.isNorm && r.n >= MIN_SUPPORT && r.share >= SUPERMAJORITY && r.share < LAMBDA_BOUND)
  .sort((a, b) => b.share - a.share || b.n - a.n || (a.pid < b.pid ? -1 : 1));
// The identifier a lattice pid or a convention feature is ABOUT — what an aspect draft names, and the thing a
// comparison against a hand-written mechanical rule can match on.
export const identifierOf = pid => {
  const m = /^auto\.([a-z0-9]+):(.*)$/.exec(String(pid));
  return m ? m[2] : null;
};

// ---- the check renderer: one template per RENDERABLE enumerator class ----
//
// The director's steer (counsel memo §2 B1, §4): where a convention's `check` descriptor has a renderable
// enumerator class, render a DETERMINISTIC `check.mjs` against Yggdrasil's `check(ctx)` contract — never prose.
// Prose is reserved for what has no shape, and each prose aspect says which class it fell out of and why.
//
// `errs: under` IS EARNED, NOT DECLARED. Every template below obeys one discipline: report a violation only
// where the tree PROVES the negation. A rule "methods here return `Promise`" fires on a method that declares a
// DIFFERENT return type, and stays silent on a method that declares none — a missing annotation is a language
// or a style question, not evidence against the rule. A rule "files here never import X" fires only where the
// import is actually present. Under-firing is the deliberate error direction; ticket 097 measures it.
//
// Grain and Yggdrasil parse with the same tree-sitter grammars, so a rendered check reads the same tree grain
// counted. Where a language's grammar names a field differently the check sees no evidence and stays silent —
// again, under.
// grain's name-shape alphabet (`nameShape`, engine/core.mjs): `U` a run of uppercase, `a` a run of
// lowercase/digits, `_ - $ .` themselves, `?` anything else, and `(XY)+` a repeated pair. A shape compiles to
// an anchored regex mechanically; a shape carrying `?` does not compile at all (that is an answer, not a gap).
export function shapeToRegex(shape) {
  if (!shape || /\?/.test(shape)) return null;
  const toks = shape.match(/\([^)]+\)\+|./g) || [];
  const atom = ch => (ch === 'U' ? '[A-Z]+' : ch === 'a' ? '[a-z0-9]+' : /[_\-$.]/.test(ch) ? ch.replace(/[.$\-]/g, '\\$&') : null);
  let out = '';
  for (const t of toks) {
    const g = /^\((.+)\)\+$/.exec(t);
    if (g) {
      let inner = '';
      for (const ch of g[1]) { const a = atom(ch); if (!a) return null; inner += a; }
      out += `(?:${inner})+`;
    } else { const a = atom(t); if (!a) return null; out += a; }
  }
  return `^${out}$`;
}
// The node types each language's grammar uses for the construct a template needs. Deliberately a REGEX over
// node-type names rather than a per-language table: the shipped grammars agree on the words, and a grammar that
// does not match simply yields no evidence (under).
export const NT = {
  import: '/(^|_)(import|use_declaration|using_directive|include|require)/',
  call: '/^(call_expression|call|method_invocation|invocation_expression|function_call_expression|macro_invocation)$/',
  deco: '/(decorator|attribute|annotation)/',
  heritage: '/(heritage|extends|superclass|base_list|implements|impl_item|superclasses)/',
  decl: '/(function|method|class|interface|struct|enum|type_alias)_(declaration|definition|item|specifier)|method_signature|function_signature/',
  typeDecl: '/^(class_declaration|class_definition|class_specifier|interface_declaration|type_alias_declaration|enum_declaration|enum_specifier|enum_item|struct_item|struct_specifier|trait_item|record_declaration|object_declaration|type_declaration|type_item)$/',
  funcDecl: '/^(function_declaration|function_definition|function_item|function_signature|method_definition|method_declaration|method_signature)$/',
};
// The header's second paragraph states the aspect's STATUS, and every check is written before its status is
// known — a drill has not run yet. `promoteEnforceableAspects` rewrites this paragraph in place when a drill
// earns `enforced` or `advisory`, so the sentence a maintainer reads at the top of the file is never the
// opposite of what Yggdrasil is doing with it. The third sentence (the `errs: under` contract) is the same
// in all three and is kept out of the swapped text.
export const DRAFT_NOTE = `// DRAFT: this aspect is \`status: draft\`, so the runner never executes this check. Read it, decide whether the
// rule is real, then promote it.`;
export const statusNote = status => (status === 'enforced'
  ? `// ENFORCED: a real \`yg drill\` on this repository's own code caught a violation with this check and raised no
// false alarm, and its convention cleared grain's certification bound, so \`yg check\` runs it and a refusal blocks.`
  : status === 'advisory'
    ? `// ADVISORY: a real \`yg drill\` on this repository's own code caught a violation with this check and raised no
// false alarm, but its convention sits BELOW grain's certification bound, so \`yg check\` runs it and a refusal
// warns without blocking. Whether it should become law is the maintainer's refactor decision.`
    : DRAFT_NOTE);
export const PROVENANCE = p => `// PROVENANCE — grain measured this, it did not decide it.
//   ${p.replace(/\n/g, '\n//   ')}
//
${DRAFT_NOTE}
// \`errs: under\` is the contract this template keeps: it reports only where the
// syntax tree proves the negation, and stays silent where the language gives it nothing to read.`;
