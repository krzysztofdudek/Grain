// grain engine · proposal writer · the sub-gate lattice and the identifiers a rule is written in
// Split out of propose.mjs: the statements below are the ones that stood there, unchanged.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORE, LAMBDA_BOUND, MIN_SUPPORT, SUPERMAJORITY } from './propose-base.mjs';

const CELL_SEP = '\u0001'; // the same cell-key separator `core.mjs` uses; a pid can contain spaces, so ' ' would truncate it
export async function partitionLattice(repo) {
  const modelPath = join(repo, '.grain', 'cache', 'model.json');
  const treePath = join(repo, '.grain', 'cache', 'tree.json');
  if (!existsSync(modelPath) || !existsSync(treePath)) return { rows: [], reason: 'no grain cache (.grain/cache/{model,tree}.json) — run `grain export` on this repo first' };
  const core = await import(`file://${CORE}`);
  const { hydrateScope, applyVocab, buildVocab, skeyR, isBool, kt, STRUCT_PID } = core;
  const model = JSON.parse(readFileSync(modelPath, 'utf8'));
  const tree = JSON.parse(readFileSync(treePath, 'utf8'));
  const byFile = new Map();
  for (const [k, v] of Object.entries(tree)) {
    const rel = k.slice(k.indexOf('|') + 1);
    byFile.set(rel, (Array.isArray(v) ? v : v.s) || []);
  }
  // pass 1: every partition's cells, so the index cost is paid ONCE over the whole repository's candidates (§9.4a)
  // and a partition-wide cell can be contrasted with the same (kind, predicate) everywhere else
  const parts = [];
  const repoAll = new Map(); // "kind\x01pid" -> value tally over every partition
  const repoKindN = new Map(); // kind -> every partition's assigned scopes of it, issue 390
  const repoPool = new Map(); // "kind\x01pid" -> the tally of every partition's assigned scopes (role cells summed), issue 390
  let universe = 0;
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
      // `tparams`/`own` (issue 125's follow-up): carried through from the hydrated scope so a row's
      // eventual classifier can test its identifier against the ACTUAL declaring site's type parameters instead
      // of guessing from name shape — the same fact `export.mjs`'s `site()` already exposes on a certified
      // convention's own sites.
      (sites.get(k) || sites.set(k, []).get(k)).push({ rel: s.rel, kind: s.kind, name: s.name, line: s.line, v, tparams: s.tparams || [], own: s.own || null });
    };
    const kindN = new Map(); // kind -> this partition's assigned scopes (issue 390)
    for (const s of ps) {
      const r = roleOf(s);
      if (r !== undefined) kindN.set(s.kind, (kindN.get(s.kind) || 0) + 1);
      for (const [pid, v] of Object.entries(s.preds)) {
        add2('_all:' + s.kind, pid, v, s);
        if (r !== undefined) add2('r' + r + ':' + s.kind, pid, v, s);
      }
    }
    universe += cells.size;
    // a role row's reference: every scope of its kind that role induction assigned to a group, the sum of the kind's
    // role cells, or the partition where the kind has one group — the populations mine() codes a role cell against
    // (issue 385)
    const pool = new Map();
    for (const [key, c] of cells) {
      if (!/^r\d/.test(key)) continue;
      const [cid, pid] = key.split(CELL_SEP);
      const pk = cid.split(':').pop() + CELL_SEP + pid;
      const t = pool.get(pk) || pool.set(pk, { counts: Object.create(null), groups: 0 }).get(pk);
      t.groups++;
      for (const [v, n] of Object.entries(c)) t.counts[v] = (t.counts[v] || 0) + n;
    }
    for (const [key, c] of cells) {
      const [cid, pid] = key.split(CELL_SEP);
      if (!cid.startsWith('_all')) continue;
      const rk = cid.slice(5) + CELL_SEP + pid;
      const t = repoAll.get(rk) || repoAll.set(rk, Object.create(null)).get(rk);
      for (const [v, n] of Object.entries(c)) t[v] = (t[v] || 0) + n;
    }
    for (const [k, n] of kindN) repoKindN.set(k, (repoKindN.get(k) || 0) + n);
    for (const [pk, t] of pool) {
      const r = repoPool.get(pk) || repoPool.set(pk, Object.create(null)).get(pk);
      for (const [v, n] of Object.entries(t.counts)) r[v] = (r[v] || 0) + n;
    }
    parts.push({ part, cells, sites, pool, kindN });
  }
  // one index cost over the whole repository's lattice: every cell it built, which is about one bit more than the
  // certification's own count (learn()'s cells with the raw floor). Paying the certification's count instead was
  // measured and not shipped: the band grows from 36 to 62 rows on Grain and from 52 to 59 on Yggdrasil on that one
  // bit, and no review of the added rows backs a looser band (docs/mathematics.md, *The sub-gate band*)
  const idxCost = Math.ceil(Math.log2(Math.max(universe, 2)));
  const sum = c => Object.values(c).reduce((a, b) => a + b, 0);
  const rows = [];
  for (const { part, cells, sites, pool, kindN } of parts) {
    const factKey = new Set((part.facts || []).map(f => f.cid + CELL_SEP + f.pid + CELL_SEP + f.exp));
    for (const [key, c] of cells) {
      const [cid, pid] = key.split(CELL_SEP);
      if (!pid) continue;
      const kind = cid.split(':').pop();
      const n = sum(c);
      if (n < 3) continue;
      const Vv = Object.keys(c).sort();
      const bl = isBool(pid);
      const K = bl ? 2 : Vv.length + 1;
      const allC = cells.get('_all:' + kind + CELL_SEP + pid);
      let exp = null, ne = -1;
      for (const v of Vv) if (c[v] > ne) { exp = v; ne = c[v]; }
      if (!bl && ['other', 'none', 'mixed', '?'].includes(exp)) continue;
      const isAll = cid.startsWith('_all');
      // the reference population a cell's outcomes are contrasted with: the rest of the repository for a
      // partition-wide ABSENCE (the same two-population cell an architecture norm uses — "never X here" is news only
      // where X is used more elsewhere), the assigned scopes of its kind for a role cell; a partition-wide presence
      // keeps the flat code
      let ref = null, refN = 0;
      if (isAll && bl && exp === 'false') {
        const t = repoAll.get(kind + CELL_SEP + pid) || {};
        ref = { true: (t.true || 0) - (c.true || 0), false: (t.false || 0) - (c.false || 0) };
        refN = ref.true + ref.false;
        if (!refN) continue; // one partition only: nothing outside it to contrast an absence with
      } else if (!isAll) {
        const t = pool.get(kind + CELL_SEP + pid);
        if (t && t.groups > 1) ref = t.counts;
        else if (/^r\d/.test(cid)) {
          if (/^auto\.dir\d/.test(pid)) continue; // a placement predicate against other partitions restates the cut
          // one group of its kind here: the assigned scopes of its kind in every other partition, as in mine() (issue 390)
          const all = repoPool.get(kind + CELL_SEP + pid) || {};
          ref = Object.create(null);
          for (const [v, m] of Object.entries(all)) if (m - ((t && t.counts[v]) || 0) > 0) ref[v] = m - ((t && t.counts[v]) || 0);
          // assigned scopes elsewhere whose partition's vocabulary lacks this boolean predicate do not do it
          const rest = bl ? (repoKindN.get(kind) || 0) - (kindN.get(kind) || 0) - sum(ref) : 0;
          if (rest > 0) ref.false = (ref.false || 0) + rest;
          if (!sum(ref)) continue; // nothing of its kind assigned elsewhere — nothing to contrast against
        } else ref = allC;
        if (!ref) continue; // no reference for this cell — nothing to contrast against
        refN = sum(ref);
      }
      // a contrast only in its own direction: an absence uses the thing LESS than its reference does, any other row
      // carries its value MORE often than its reference does (as architecture norms test both ways)
      if (bl && exp === 'false' && ref && !((c.true || 0) * refN < (ref.true || 0) * n)) continue;
      if (!(bl && exp === 'false') && ref && !((c[exp] || 0) * refN > (ref[exp] || 0) * n)) continue;
      let data = 0;
      if (!ref) { const B = Math.max(bl ? 2 : Vv.length, 2); for (const v of Vv) if (c[v]) data += c[v] * Math.log2(kt(c, K, v, n) * B); }
      else for (const v of Vv) if (c[v]) data += c[v] * Math.log2(kt(c, K, v, n) / kt(ref, K, v, refN));
      const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(n, 2)) - idxCost;
      let parentExp = null;
      if (!isAll && allC) { let pn = -1; for (const [v, m] of Object.entries(allC)) if (m > pn) { parentExp = v; pn = m; } }
      // structural facts describe the language unless they CONTRAST with the partition — the same rule mine() applies
      const structural = STRUCT_PID.test(pid) && (isAll || parentExp === null || parentExp === exp);
      const share = ne / n;
      const isNorm = factKey.has(cid + CELL_SEP + pid + CELL_SEP + exp);
      // The row's own host site: the first site among this cell's OWN majority-value population,
      // carrying the exact fact `buildAspects` tests an identifier against — never a re-derived guess. A row
      // with no majority-side site left (should not happen; `ne` counted at least one) falls back to `[]`/`null`,
      // the same "nothing declared" shape a hand-built test row already gets when it omits these fields.
      const hostSite = (sites.get(key) || []).find(s => s.v === exp) || null;
      rows.push({
        partition: part.name, cid, pid, exp, share, n, ne, K, bits: +bits.toFixed(1), isNorm, structural,
        role: /^r(\d+):/.exec(cid)?.[1] ?? null, kind,
        tparams: hostSite?.tparams || [], own: hostSite?.own || null,
        deviants: (sites.get(key) || []).filter(s => s.v !== exp).map(s => `${s.rel}#${s.name}`),
      });
    }
  }
  return { rows, reason: null };
}
// log Γ at a positive integer or half-integer, exactly: Γ(1) = 1, Γ(½) = √π, Γ(x + 1) = x·Γ(x)
const lgammaHalf = x => {
  let s = Number.isInteger(x) ? 0 : Math.log(Math.PI) / 2;
  for (let y = Number.isInteger(x) ? 1 : 0.5; y < x; y++) s += Math.log(y);
  return s;
};
// the regularized incomplete beta I_x(a, b), by its continued fraction (modified Lentz), for the KT posterior
// Beta(k + ½, n − k + ½) — run to the precision of a double, not to a chosen tolerance
export function betaCdf(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - (lgammaHalf(a) + lgammaHalf(b) - lgammaHalf(a + b)));
  const cf = (x2, p, q) => {
    const tiny = Number.MIN_VALUE;
    const fix = v => (Math.abs(v) < tiny ? tiny : v);
    let c = 1,
      d = 1 / fix(1 - ((p + q) * x2) / (p + 1)),
      h = d;
    for (let m = 1; m <= 1000; m++) {
      const m2 = 2 * m;
      let aa = (m * (q - m) * x2) / ((p + m2 - 1) * (p + m2));
      d = 1 / fix(1 + aa * d);
      c = fix(1 + aa / c);
      h *= d * c;
      aa = (-(p + m) * (p + q + m) * x2) / ((p + m2) * (p + m2 + 1));
      d = 1 / fix(1 + aa * d);
      c = fix(1 + aa / c);
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) <= Number.EPSILON) break;
    }
    return h;
  };
  return x < (a + 1) / (a + b + 2) ? (front * cf(x, a, b)) / a : 1 - (front * cf(1 - x, b, a)) / b;
}
// The sub-gate band: the rows a maintainer reads as "a house rule that has not finished spreading". A row enters
// only where grain's own objective holds for it and its practice is a supermajority with λ-level confidence:
//   - its contrast bits are positive (a role cell against its partition, a partition-wide absence against the rest
//     of the repository, one index cost over the whole repository's lattice) — a raw share is not evidence;
//   - a structural predicate speaks only as a contrast, as it does in mine();
//   - the KT posterior Beta(k + ½, n − k + ½) puts at most 1/λ of its mass below the two-thirds supermajority;
//   - and it is still BELOW the certification bound: its posterior predictive does not reach 1 − 1/λ.
// Ranked by bits, so the per-partition reading cap keeps the strongest evidence rather than the highest share.
export const subGate = rows => rows
  .filter(r => !r.isNorm && !r.structural && r.n >= MIN_SUPPORT && r.bits > 0
    && (r.ne + 0.5) / (r.n + r.K / 2) < LAMBDA_BOUND
    && betaCdf(SUPERMAJORITY, r.ne + 0.5, r.n - r.ne + 0.5) <= 1 - LAMBDA_BOUND)
  .sort((a, b) => b.bits - a.bits || b.n - a.n || (a.pid < b.pid ? -1 : 1));
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
// import is actually present. Under-firing is the deliberate error direction; the drill measures it.
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
