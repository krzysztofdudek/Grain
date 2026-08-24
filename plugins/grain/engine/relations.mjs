// grain's relation pass — the thin orchestration over the vendored Yggdrasil machinery (engine/vendor/relations/):
// per-language extractors turn each parsed tree into declared symbols + ordered candidate groups; a language-partitioned
// symbol table and the tri-state resolver (resolved / ambiguous / absent — silence instead of a false edge) bind them to
// files; the result is file→file edges (import | call | extends | implements | type-ref | construct) and their
// aggregation into a module graph. Yggdrasil resolves onto its declared node model; grain resolves onto the indexed
// files themselves: ownerOf(file) = the file when it is part of the indexed tree, undefined otherwise (the D7 non-event —
// an edge into an unindexed file is a coverage matter, never an edge).
import { extractorForLanguage } from './vendor/relations/extractors/registry.mjs';
import { extractCsharpRefs, assembleCsharpCandidates } from './vendor/relations/extractors/csharp.mjs';
import { SymbolTable } from './vendor/relations/symbol-table.mjs';
import { makeResolver, resolveCandidateGroup } from './vendor/relations/resolver.mjs';
import { makeResolvePathToFile } from './vendor/relations/resolve-path.mjs';

const SEP = '\u0001'; // a control byte, never inside a path; kept as an ESCAPE - literal control bytes in source are exactly what died in the prototype's vendoring
const LANG = { c_sharp: 'csharp' }; // grain grammar name → extractor language id (identity otherwise)
export const relLanguage = g => (g ? LANG[g] || g : null);
export const relSupported = g => !!extractorForLanguage(relLanguage(g));
export const REL_LANGS = ['typescript', 'tsx', 'javascript', 'python', 'go', 'java', 'csharp', 'ruby', 'rust', 'php', 'c', 'cpp', 'kotlin'];

// ---- per-file facts, computed while the tree is in hand (extractTree) and cached with the scopes ----
const serCs = c => ({ ...c, scope: { ...c.scope, aliases: [...c.scope.aliases], globalAliases: [...c.scope.globalAliases] } });
const deserCs = c => ({ ...c, scope: { ...c.scope, aliases: new Map(c.scope.aliases), globalAliases: new Map(c.scope.globalAliases) } });
// bare specifiers of the TS family (`@scope/pkg`, `pkg/sub`): the vendored extractor emits RELATIVE hints only (in
// Yggdrasil's world a bare name is external by definition); in a workspace monorepo the entire cross-package
// architecture flows through them, so grain collects them itself — they resolve ONLY via the workspace-package map,
// a genuinely external package stays silent
function bareImports(tree) {
  const out = [];
  for (const n of tree.rootNode.descendantsOfType(['import_statement', 'export_statement'])) {
    const src = n.childForFieldName('source'); if (!src) continue;
    const spec = src.text.replace(/^["'`]|["'`]$/g, '');
    if (!spec || spec.startsWith('.') || spec.startsWith('/')) continue;
    out.push({ candidates: [{ kind: 'path', specifier: spec, isPackage: true }], kind: 'import', line: n.startPosition.row + 1 }); }
  return out; }
export function relFactsFor(rel, content, tree, grammar) {
  const language = relLanguage(grammar); const ex = extractorForLanguage(language);
  if (!ex) return null;
  const pf = { path: rel, content, tree, language };
  try {
    if (language === 'csharp') return { l: language, d: ex.declarations(pf), c: serCs(extractCsharpRefs(pf)) };
    const u = ex.uses(pf);
    if (/^(typescript|tsx|javascript)$/.test(language)) u.push(...bareImports(tree));
    return { l: language, d: ex.declarations(pf), u };
  } catch { return null; }
}

// workspace packages: bare specifiers (`@scope/name`, `name/sub`) resolve to the package's own files — a pnpm/yarn
// monorepo's ENTIRE cross-package architecture flows through these, and the path resolver rightly refuses to guess them
export function wsResolverFor({ workspaces, fileSet }) {
  if (!workspaces || !workspaces.length) return () => undefined;
  const byName = new Map();
  for (const w of [...workspaces].sort((a, b) => a.dir.length - b.dir.length || (a.dir < b.dir ? -1 : 1))) if (!byName.has(w.name)) byName.set(w.name, w); // a vendored/worktree COPY of a package never shadows the real one
  const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
  return (specifier, language) => {
    if (!/^(typescript|tsx|javascript)$/.test(language) || specifier.startsWith('.') || specifier.startsWith('/')) return undefined;
    for (const [name, w] of byName) {
      if (specifier === name) return w.entry;
      if (specifier.startsWith(name + '/')) { const sub = specifier.slice(name.length + 1);
        for (const base of [w.dir + '/' + sub, w.dir + '/src/' + sub]) for (const ext of EXTS) if (fileSet.has(base + ext)) return base + ext;
        return w.entry; } }
    return undefined; }; }

// tsconfig/jsconfig files are JSONC in the wild: comments and trailing commas everywhere — strip them string-aware
export function parseJsonc(text) {
  let out = '', i = 0, inStr = false;
  while (i < text.length) { const c = text[i];
    if (inStr) { out += c; if (c === '\\') { out += text[i + 1] ?? ''; i += 2; continue; } if (c === '"') inStr = false; i++; continue; }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    out += c; i++; }
  return JSON.parse(out.replace(/,\s*([}\]])/g, '$1'));
}

// tsconfig `paths` aliases (`@/*` → `src/*`): the OTHER channel a TS repo's internal architecture flows through as bare
// specifiers. Configs come pre-resolved to root-relative targets (core reads the files, follows `extends`); the NEAREST
// config above the importing file decides — an outer config never falls through, exactly as tsc resolves. A specifier no
// pattern matches stays what it was: external, silent.
export function aliasResolverFor({ tsAliases, fileSet }) {
  if (!tsAliases || !tsAliases.length) return () => undefined;
  const cfgs = [...tsAliases].sort((a, b) => b.dir.length - a.dir.length || (a.dir < b.dir ? -1 : 1)); // deepest first
  const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
  const hit = base => { for (const ext of EXTS) { const c = base + ext; if (fileSet.has(c)) return c; } return undefined; };
  return (specifier, language, fromFile) => {
    if (!/^(typescript|tsx|javascript)$/.test(language) || specifier.startsWith('.') || specifier.startsWith('/')) return undefined;
    for (const cfg of cfgs) {
      if (cfg.dir !== '.' && !((fromFile + '/').startsWith(cfg.dir + '/'))) continue;
      for (const [pat, targets] of cfg.patterns || []) {
        const star = pat.indexOf('*'); let cap = null;
        if (star < 0) { if (specifier !== pat) continue; }
        else { const pre = pat.slice(0, star), suf = pat.slice(star + 1);
          if (!(specifier.startsWith(pre) && specifier.endsWith(suf) && specifier.length >= pre.length + suf.length)) continue;
          cap = specifier.slice(pre.length, specifier.length - suf.length); }
        for (const t of targets) { const r = hit(cap === null ? t : t.replace('*', cap)); if (r) return r; } }
      if (cfg.base != null) { const r = hit((cfg.base === '.' ? '' : cfg.base + '/') + specifier); if (r) return r; }
      return undefined; }
    return undefined; }; }

// the shared edge resolver: the full pass and the single-file `check` path resolve through the SAME machinery
export function makeEdgeResolver({ root, fileSet, table, workspaces = [], pkgs = [], tsAliases = [], csGlobal = { usings: [], aliases: [] } }) {
  const ownerOf = f => (fileSet.has(f) ? f : undefined);
  // package-level splits (a Go package / Java wildcard import spanning several owners → silence) are decided at MODULE
  // granularity: with per-file owners every multi-file package would read as split and the whole language would go silent
  const modOwner = f => (fileSet.has(f) ? moduleOf(f, pkgs) : undefined);
  const isExcluded = f => !fileSet.has(f);
  const base = makeResolvePathToFile(root, modOwner, isExcluded);
  const ws = wsResolverFor({ workspaces, fileSet });
  const alias = aliasResolverFor({ tsAliases, fileSet });
  const resolvePathToFile = (specifier, fromFile, language, isPackage) => base(specifier, fromFile, language, isPackage) ?? alias(specifier, language, fromFile) ?? ws(specifier, language);
  const resolver = makeResolver({ ownerIndex: { ownerOf }, symbolTable: table, resolvePathToFile });
  return (rel, f) => { // one file's resolved out-edges (deduplicated, deterministic)
    if (!f) return [];
    const uses = f.c ? assembleCsharpCandidates(deserCs(f.c), { projectGlobalUsings: csGlobal.usings, projectGlobalUsingAliases: csGlobal.aliases }) : (f.u || []);
    const seen = new Map();
    for (const dep of uses) {
      const to = resolveCandidateGroup(dep.candidates, resolver, rel, f.l);
      if (!to || to === rel) continue;
      const k = to + SEP + dep.kind;
      const e = seen.get(k); if (e) { e.n++; if (dep.line < e.line) e.line = dep.line; } else seen.set(k, { line: dep.line, n: 1 }); }
    return [...seen].map(([k, v]) => { const [to, kind] = k.split(SEP); return { from: rel, to, kind, line: v.line, n: v.n }; })
      .sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : a.kind < b.kind ? -1 : 1)); }; }

export function tableFrom(files, relFacts) {
  const table = new SymbolTable(); const usings = new Set(); const aliases = new Map();
  for (const rel of files) { const f = relFacts[rel]; if (!f) continue;
    for (const d of f.d || []) table.declare(f.l, d.symbolKey, rel);
    if (f.c) { for (const p of f.c.scope.globalPrefixes || []) usings.add(p);
      for (const [n, fqn] of f.c.scope.globalAliases || []) aliases.set(n, fqn); } }
  return { table, csGlobal: { usings: [...usings], aliases: [...aliases.entries()] } }; }

// the symbol table, compact enough to live in the model (check-time resolution of an edited file): up to 3 defining
// files per key — 0/1/≥2 classification and the nested-split distinct-file rule survive the cap
export function compactDecls(files, relFacts) {
  const out = {};
  for (const rel of files) { const f = relFacts[rel]; if (!f) continue;
    for (const d of f.d || []) { const byLang = (out[f.l] ||= {}); const arr = (byLang[d.symbolKey] ||= []); if (arr.length < 3 && !arr.includes(rel)) arr.push(rel); } }
  return out; }
export function hydrateTable(relDecls) {
  const table = new SymbolTable();
  for (const [lang, keys] of Object.entries(relDecls || {})) for (const [key, files] of Object.entries(keys)) for (const f of files) table.declare(lang, key, f);
  return table; }

// ---- resolution over the whole indexed tree → deduplicated file→file edges ----
export function buildEdges({ root, files, relFacts, workspaces = [], pkgs = [], tsAliases = [] }) {
  const fileSet = new Set(files);
  const { table, csGlobal } = tableFrom(files, relFacts);
  const resolve = makeEdgeResolver({ root, fileSet, table, workspaces, pkgs, tsAliases, csGlobal });
  const edges = [];
  for (const rel of files) edges.push(...resolve(rel, relFacts[rel]));
  return edges.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : a.kind < b.kind ? -1 : 1));
}

// ---- the module graph: directories at layout depth ≤ 2 as nodes, edge counts, cycles ----
export const moduleOf = (rel, pkgs = []) => { for (const d of pkgs) if (d !== '.' && (rel + '/').startsWith(d + '/')) return d; // a package root IS the module
  const segs = rel.split('/'); return segs.length <= 1 ? '.' : segs.slice(0, Math.min(2, segs.length - 1)).join('/'); };
export function moduleGraph(edges, files, pkgs = []) {
  // a module holding most of the repository is not a module, it is the repository: refine dominant modules one path
  // segment deeper (a single-package repo's architecture lives INSIDE the package — source/cli/src/{ast,relations,io,…})
  let modOf = rel => moduleOf(rel, pkgs);
  for (let round = 0; round < 2; round++) {
    const per = new Map(); for (const rel of files) { const m = modOf(rel); per.set(m, (per.get(m) || 0) + 1); }
    const dominant = new Set([...per].filter(([m, n]) => n >= Math.max(40, files.length * 0.5)).map(([m]) => m));
    if (!dominant.size) break;
    const prev = modOf;
    modOf = rel => { const m = prev(rel); if (!dominant.has(m)) return m;
      const sub = m === '.' ? rel : rel.slice(m.length + 1); const segs = sub.split('/');
      return segs.length <= 1 ? m : (m === '.' ? '' : m + '/') + segs[0] + (/^(src|lib|app|source|packages|apps)$/.test(segs[0]) && segs.length > 2 ? '/' + segs[1] : ''); }; }
  const filesPer = new Map();
  for (const rel of files) { const m = modOf(rel); filesPer.set(m, (filesPer.get(m) || 0) + 1); }
  const em = new Map(); // from\0to → { n, kinds }
  for (const e of edges) { const a = modOf(e.from), b = modOf(e.to); if (a === b) continue;
    const k = a + SEP + b; let r = em.get(k); if (!r) { r = { n: 0, kinds: {} }; em.set(k, r); }
    r.n += e.n; r.kinds[e.kind] = (r.kinds[e.kind] || 0) + e.n; }
  const medges = [...em].map(([k, v]) => { const [from, to] = k.split(SEP); return { from, to, ...v }; })
    .sort((a, b) => b.n - a.n || (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : 1));
  const nodes = [...filesPer].map(([id, n]) => ({ id, files: n })).sort((a, b) => (a.id < b.id ? -1 : 1));
  // cycles: strongly connected components of size ≥ 2 (Tarjan), deterministic order
  const adj = new Map(); for (const e of medges) (adj.get(e.from) || adj.set(e.from, []).get(e.from)).push(e.to);
  let idx = 0; const st = []; const low = new Map(), num = new Map(), on = new Set(); const cycles = [];
  const strong = v => { num.set(v, idx); low.set(v, idx); idx++; st.push(v); on.add(v);
    for (const w of adj.get(v) || []) { if (!num.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), num.get(w))); }
    if (low.get(v) === num.get(v)) { const comp = []; let w; do { w = st.pop(); on.delete(w); comp.push(w); } while (w !== v);
      if (comp.length >= 2) cycles.push(comp.sort()); } };
  for (const n of nodes.map(x => x.id)) if (!num.has(n)) strong(n);
  cycles.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { nodes, edges: medges, cycles };
}
