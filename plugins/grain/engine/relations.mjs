// grain's relation pass — the thin orchestration over the vendored Yggdrasil machinery (engine/vendor/relations/):
// per-language extractors turn each parsed tree into declared symbols + ordered candidate groups; a language-partitioned
// symbol table and the tri-state resolver (resolved / ambiguous / absent — silence instead of a false edge) bind them to
// files; the result is file→file edges (import | call | extends | implements | type-ref | construct) and their
// aggregation into a module graph. Yggdrasil resolves onto its declared node model; grain resolves onto the indexed
// files themselves: a reference binds to a file of the indexed tree, or to nothing (the D7 non-event — an edge into an
// unindexed file is a coverage matter, never an edge), and a symbol declared across several files of ONE directory binds
// to the first of them (dirOwner, below).
import { extractorForLanguage } from './vendor/relations/extractors/registry.mjs';
import { extractCsharpRefs, assembleCsharpCandidates } from './vendor/relations/extractors/csharp.mjs';
import { buildCsharpProjectScopes } from './vendor/relations/extractors/csharp-project.mjs';
import { includeUses } from './vendor/relations/extractors/c-cpp-shared.mjs';
import { SymbolTable } from './vendor/relations/symbol-table.mjs';
import { makeResolver } from './vendor/relations/resolver.mjs';
import { makeResolvePathToFile } from './vendor/relations/resolve-path.mjs';
import { parsePsr4 } from './vendor/relations/extractors/php-resolve.mjs';
import { sfcScriptView } from './vendor/relations/extractors/typescript.mjs';
import { HARD_EXCL, EXCL } from './config.mjs';
import { CODE_RE, SFC_RE, toPosix } from './base.mjs';
import { parseFile } from './parse.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { extname } from 'node:path/posix';

const SEP = '\u0001'; // a control byte, never inside a path; kept as an ESCAPE - literal control bytes in source are exactly what died in the prototype's vendoring
const LANG = { c_sharp: 'csharp' }; // grain grammar name → extractor language id (identity otherwise)
export const relLanguage = g => (g ? LANG[g] || g : null);
export const relSupported = g => !!extractorForLanguage(relLanguage(g));
// issue 041: `relSupported` alone answers "is ANY extractor registered", which is true for c/cpp — but c.mjs/cpp.mjs
// (both vendored from Yggdrasil) are the only REL_LANGS extractors whose entire `uses` IS the shared `includeUses`
// walker (c-cpp-shared.mjs): the `#include` lines of the live preprocessor branches, nothing else. Every other
// language's `uses` also resolves call/type-ref/extends/implements/construct references through the symbol table.
// Since issue 223 an include resolves next to the includer, then under the repository's include roots (a
// compile_commands.json's -I/-iquote roots, else the root and every `include/` directory, exactly one hit), so a
// shared include/ layout resolves; but a C/C++ file's dependencies are still only the headers it names, never the
// symbols it uses, so the disclosure stays. This is a STRUCTURAL fact about the extractor (referential identity
// against the one shared function), not a hardcoded "c"/"cpp" name check, so it generalizes to any future
// REL_LANGS extractor built the same thin way.
export const relPathOnly = g => { const ex = extractorForLanguage(relLanguage(g)); return !!ex && ex.uses === includeUses; };
export const REL_LANGS = [
  'typescript',
  'tsx',
  'javascript',
  'python',
  'go',
  'java',
  'csharp',
  'ruby',
  'rust',
  'php',
  'c',
  'cpp',
  'kotlin',
];

// ---- per-file facts, computed while the tree is in hand (extractTree) and cached with the scopes ----
const serCs = c => ({
  ...c,
  scope: { ...c.scope, aliases: [...c.scope.aliases], globalAliases: [...c.scope.globalAliases] },
});
const deserCs = c => ({
  ...c,
  scope: { ...c.scope, aliases: new Map(c.scope.aliases), globalAliases: new Map(c.scope.globalAliases) },
});
// simple type names of the file's OWN package (§113). JLS §6.5.5.1 and §7.5: the types of the package a
// compilation unit belongs to are in scope by declaration — an import declaration exists to reach OTHER packages,
// so Java writes no import for a sibling class and there is nothing for an import-driven extractor to see. The
// vendored extractor emits candidates for `import_declaration` and `scoped_type_identifier` only, so an entire
// package's internal structure (entities, repositories, controllers of one domain package) was invisible: 31 real
// file→file reference pairs on spring-petclinic, including every edge the `Vet ↔ Specialty` trap was built around.
//
// `type_identifier` is precisely the tree-sitter-java node for a type REFERENCE — a declaration's own name is an
// `identifier`, so walking it cannot pick up the declaration site. Each one is emitted as a `symbol` candidate
// keyed `<package>.<Name>`, which the symbol table binds only if that exact type is declared in this package:
// a JDK type, a type reached by import and a type of another package all resolve to nothing and stay silent, and
// two declarations of one key would classify as ambiguous rather than guess. Names brought in by a single-type
// import are skipped outright — JLS §7.5.1 gives the import precedence over the package, and the import already
// carries its own candidate.
const JAVA_REF_KIND = { superclass: 'extends', super_interfaces: 'implements', extends_interfaces: 'implements', object_creation_expression: 'construct' };
function javaSamePackageRefs(tree, decls) {
  const pkgNode = tree.rootNode.descendantsOfType('package_declaration')[0];
  if (!pkgNode) return []; // the unnamed package: no shared namespace to resolve a simple name against
  let pkg = '';
  for (let i = 0; i < pkgNode.namedChildCount; i++) {
    const c = pkgNode.namedChild(i);
    if (c && (c.type === 'scoped_identifier' || c.type === 'identifier')) { pkg = c.text; break; }
  }
  if (pkg === '') return [];
  const imported = new Set(); // simple names a single-type import already binds
  for (const imp of tree.rootNode.descendantsOfType('import_declaration')) {
    const txt = imp.text;
    const m = txt.match(/import\s+(?:static\s+)?([\w.$]+)\s*;/);
    if (m && !/\*/.test(txt)) imported.add(m[1].split('.').pop());
  }
  // a type this file declares itself — a member type, the file's own top-level type, or a type PARAMETER —
  // SHADOWS the package member of the same simple name (JLS §6.5.5.1 and §6.4.1), so a reference to that name is
  // never a reference to the sibling file. Shadowing is scoped; this set is per FILE, which can only ever silence
  // a reference, never invent one — and a type parameter is conventionally a single letter no package type carries.
  const own = new Set();
  for (const d of decls || []) for (const part of d.symbolKey.split('+')) own.add(part.split('.').pop());
  for (const tp of tree.rootNode.descendantsOfType('type_parameter'))
    for (let i = 0; i < tp.namedChildCount; i++) {
      const c = tp.namedChild(i);
      if (c && c.type === 'type_identifier') { own.add(c.text); break; }
    }
  // a bare name declared in this file as a variable, parameter, field or catch/for binding SHADOWS the package
  // type of that name (JLS §6.5.6.1), so it is never the receiver of a static call on a sibling class
  const bound = new Set();
  for (const t of ['variable_declarator', 'formal_parameter', 'catch_formal_parameter', 'enhanced_for_statement'])
    for (const n of tree.rootNode.descendantsOfType(t)) {
      const nm = n.childForFieldName('name');
      if (nm) bound.add(nm.text);
    }
  const out = [];
  const seen = new Set();
  const emit = (name, node, kind) => {
    if (name === '' || imported.has(name) || own.has(name)) return;
    const line = node.startPosition.row + 1;
    const key = name + ' ' + line;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ candidates: [{ kind: 'symbol', symbolKey: pkg + '.' + name }], kind, line });
  };
  // a utility class of the same package is often named ONLY as the receiver of a static call or field read
  // (`EntityUtils.getById(...)`, `Consts.NAME`) — no import, no type position, nothing an import-driven or
  // type-position walk can see, and yet a dependency the code cannot compile without
  for (const t of ['method_invocation', 'field_access'])
    for (const n of tree.rootNode.descendantsOfType(t)) {
      const o = n.childForFieldName('object');
      if (!o || o.type !== 'identifier' || bound.has(o.text)) continue;
      emit(o.text, o, t === 'method_invocation' ? 'call' : 'type-ref');
    }
  for (const n of tree.rootNode.descendantsOfType('type_identifier')) {
    const parent = n.parent;
    if (parent?.type === 'scoped_type_identifier') continue; // a qualified name's tail — already a candidate
    if (parent?.type === 'type_parameter') continue; // `<T extends …>` DECLARES T; it does not reference a type
    const kind =
      JAVA_REF_KIND[parent?.type] ||
      (parent?.type === 'type_list' ? JAVA_REF_KIND[parent.parent?.type] : undefined) ||
      'type-ref';
    emit(n.text, n, kind);
  }
  return out;
}
export function relFactsFor(rel, content, tree, grammar) {
  const language = relLanguage(grammar);
  const ex = extractorForLanguage(language);
  if (!ex) return null;
  const pf = { path: rel, content, tree, language };
  try {
    if (language === 'csharp')
      return { l: language, d: ex.declarations(pf), c: serCs(extractCsharpRefs(pf)) };
    const u = ex.uses(pf);
    const d = ex.declarations(pf);
    if (language === 'java') u.push(...javaSamePackageRefs(tree, d));
    return { l: language, d, u };
  } catch {
    return null;
  }
}

// re-exported so arch.mjs's composer.json census (the report's PHP autoload disclosure) parses composer.json with the
// SAME logic the vendored resolver trusts — never a second, hand-rolled JSON reader that could drift from it.
export { parsePsr4 };

// ---- Vue and Svelte single-file components: relation facts only ----
// No grammar parses a `.vue`/`.svelte` file whole, so grain mines no conventions from one; but its `<script>` blocks are
// TS/JS modules whose imports are the component's real dependencies, and other modules import the component by path.
// The vendored `sfcScriptView` blanks everything outside the script blocks (line numbers survive) and names the
// script's language; the view is parsed with that grammar and its facts taken like any module's. Components join the
// relation universe (edges, module graph, `check`'s file set), never the mined partition.
export { SFC_RE };
export async function sfcRelFacts(rel, content) {
  const view = sfcScriptView(rel, content);
  if (!view) return null;
  const { p, tree } = await parseFile(extname(view.parsePath), view.content);
  try {
    return relFactsFor(rel, view.content, tree, p._g);
  } finally {
    tree.delete();
  }
}
/** Every component of the tree and its facts: `tree` (git mode) names them and serves their HEAD content; without git
 *  the worktree is walked under the same exclusions as every other file. */
export async function sfcRelations(root, tree) {
  const paths = [];
  if (tree && tree.allPaths) {
    for (const p of tree.allPaths) if (SFC_RE.test(p) && !HARD_EXCL.test(p)) paths.push(p);
  } else
    (function walk(d) {
      let es;
      try {
        es = readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of es) {
        const full = join(d, e.name);
        const rel = toPosix(relative(root, full));
        if (EXCL.test(rel + (e.isDirectory() ? '/' : ''))) continue;
        if (e.isDirectory()) walk(full);
        else if (SFC_RE.test(e.name)) paths.push(rel);
      }
    })(root);
  const files = [];
  const facts = {};
  for (const rel of paths.sort()) {
    let src = tree && tree.read ? tree.read(rel) : null; // git mode: the HEAD blob, never the worktree
    if (src == null)
      try {
        src = readFileSync(join(root, rel), 'utf8');
      } catch {
        continue;
      }
    try {
      const f = await sfcRelFacts(rel, src);
      if (!f) continue;
      files.push(rel);
      facts[rel] = f;
    } catch {}
  }
  return { files, facts };
}

// ---- source roots: where a JVM-family package hierarchy starts on disk (§113) ----
//
// Two independent language/build facts, never a threshold:
//
//  (1) THE PACKAGE DECLARATION. JLS §7.2.1 ("Storing packages in a file system") and the Kotlin spec's package
//      layout both define a source root as the directory under which a type's package name IS its directory
//      path: a file declaring `package a.b.c` sits in some `<root>/a/b/c/`. So `<root>` = the file's directory
//      with its own package path removed as a SUFFIX. This needs no build file and no configuration, and it is
//      self-validating — where the directory does not mirror the package (legal in Kotlin, Groovy and Scala)
//      the suffix simply does not match and nothing is claimed.
//  (2) THE STANDARD DIRECTORY LAYOUT. Maven's Standard Directory Layout and Gradle's Java-plugin source sets
//      both place source roots at `<module>/src/<sourceSet>/<language>` — `src/main/java`, `src/test/kotlin`,
//      `src/integrationTest/groovy`. Derived here from the DIRECTORY SHAPE alone (a `src/*/<lang>` directory
//      that actually holds files of that language), not from the presence of `pom.xml`/`build.gradle`: the shape
//      is what both build tools mean by it, it survives a Gradle subproject with no build file of its own, and
//      it is the only one of the two available for a language grain parses but has no declaration extractor for.
//
// The union drives the module cut (below). Resolution across source roots (test → main, one Gradle module to
// another) is the vendored resolver's own since issue 223: a Java import its ancestor roots miss is looked up in the
// shared JVM symbol table, where a duplicate FQN in two roots stays ambiguous and silent.
const SRC_SET_LANG = { java: /\.java$/, kotlin: /\.(kt|kts)$/, groovy: /\.groovy$/, scala: /\.(scala|sc)$/ };
export function sourceRootsOf(files, relFacts = {}) {
  const roots = new Set();
  for (const rel of files) {
    // (2) layout: <prefix>src/<sourceSet>/<lang>/… with the file's own extension matching <lang>
    const m = rel.match(/(^|.*\/)src\/[^/]+\/(java|kotlin|groovy|scala)\//);
    if (m && SRC_SET_LANG[m[2]].test(rel)) roots.add(m[0].slice(0, -1));
    // (1) package declaration: the extractor's symbolKey is `<package>.<Type>` (`+` separates nested types)
    const f = relFacts[rel];
    if (!f || (f.l !== 'java' && f.l !== 'kotlin') || !f.d || !f.d.length) continue;
    const top = f.d[0].symbolKey.split('+')[0];
    const dot = top.lastIndexOf('.');
    const dir = rel.slice(0, Math.max(0, rel.lastIndexOf('/')));
    if (dot < 0) {
      roots.add(dir); // the unnamed package: the file's own directory IS the root
      continue;
    }
    const pkgPath = top.slice(0, dot).split('.').join('/');
    if (dir === pkgPath) roots.add('');
    else if (dir.endsWith('/' + pkgPath)) roots.add(dir.slice(0, dir.length - pkgPath.length - 1));
  }
  return [...roots].sort();
}

// The module cut below a source root. A package hierarchy opens with a reverse-domain prefix (`org/springframework/
// samples/`) that the language spec requires and that carries no architecture: every file in the repository shares
// it, so cutting there yields ONE module for the whole source root — which is exactly how spring-petclinic's ten
// resolved edges all fell inside `src/main/java` and vanished from the module graph. The base is therefore the
// source root advanced through its non-branching prefix: while the current directory holds no files of its own and
// exactly one subdirectory, that subdirectory cannot be a boundary. Pure function of the file list.
export function cutBasesOf(files, srcRoots = []) {
  if (!srcRoots.length) return [];
  const out = [];
  for (const root of srcRoots) {
    const pfx = root === '' ? '' : root + '/';
    let cur = root;
    for (;;) {
      const curPfx = cur === '' ? '' : cur + '/';
      const kids = new Set();
      let hasOwnFile = false;
      for (const rel of files) {
        if (!rel.startsWith(pfx) || !rel.startsWith(curPfx)) continue;
        const sub = rel.slice(curPfx.length);
        const slash = sub.indexOf('/');
        if (slash < 0) hasOwnFile = true;
        else kids.add(sub.slice(0, slash));
      }
      if (hasOwnFile || kids.size !== 1) break;
      cur = curPfx + [...kids][0];
    }
    if (cur !== '') out.push(cur);
  }
  return [...new Set(out)].sort((a, b) => b.length - a.length || (a < b ? -1 : 1)); // deepest first: a nested root wins
}

// Everything a language's toolchain reads beyond the source files — tsconfig/jsconfig `paths`, `baseUrl` and `extends`,
// workspace package.json names and `exports`, Cargo manifests and path dependencies, go.mod/go.work, composer.json
// PSR-4/PSR-0 maps of every package, pyproject/setup roots, compile_commands.json and `include/` roots — is read by the
// vendored resolvers themselves, from disk, at the repository root (resolve-path.mjs, repo-layout.mjs). Grain adds no
// second channel beside them: each of them stays silent exactly where the toolchain would be ambiguous (two tsconfig
// targets, two workspace packages of one name, two composer packages mapping one class), and a fallback consulted after
// a silence would turn that silence into a guess.
//
// `isExcluded` answers the vendored resolvers' "is this path outside the repository's code?": a source file grain did
// not index (a gitignored or hard-excluded file, a declaration file the no-git walk skips) is, and so is grain's own
// state; a directory, a manifest or a header root is not — they are read to decide, never resolved to.
const excludedFor = fileSet => p => HARD_EXCL.test(p) || (CODE_RE.test(p) && !fileSet.has(p));

// The owner a symbol ambiguity is decided at (Yggdrasil 6.1.0's owner-level rule): a declaration spread over several
// files of ONE directory — a C# partial class, `Result` beside `Result<T>`, Kotlin `expect`/`actual` or top-level
// overloads in one package directory, a star import of a package whose files share a directory — names one dependency,
// bound to the first of those files; the same name declared in two directories stays ambiguous and silent. A
// directory, not the depth-2 module: it is the smallest component grain knows, so a collapse can never pick a file in
// a sibling directory the reference did not mean.
const dirOwner = fileSet => f => (fileSet.has(f) ? f.slice(0, Math.max(0, f.lastIndexOf('/'))) || '.' : undefined);

// C# global usings are scoped per PROJECT (the nearest ancestor `.csproj`, plus its `<Using>` items and SDK implicit
// usings, csharp-project.mjs). `csFacts` is every C# file's own global-using facts; the scope of any file — including
// an edited file `check` resolves alone — is recomputed from them, so one project's imports never reach another's.
export function csScopesFor(root, csFacts = []) {
  let scopes = null;
  return (rel, own) => {
    if (own) {
      const facts = csFacts.filter(f => f.path !== rel).concat([{ path: rel, ...own }]);
      const s = buildCsharpProjectScopes(root, facts).get(rel);
      return { projectGlobalUsings: s?.usings ?? [], projectGlobalUsingAliases: s?.aliases ?? [] };
    }
    scopes ||= buildCsharpProjectScopes(root, csFacts);
    const s = scopes.get(rel);
    return { projectGlobalUsings: s?.usings ?? [], projectGlobalUsingAliases: s?.aliases ?? [] };
  };
}
const csOwn = c => ({ globalPrefixes: c.scope.globalPrefixes || [], globalAliases: c.scope.globalAliases || [] });

// the shared edge resolver: the full pass and the single-file `check` path resolve through the SAME machinery
export function makeEdgeResolver({
  root,
  fileSet,
  table,
  pkgs = [],
  srcRoots = [],
  csFacts = [],
  singleFile = false, // `check`: the one file resolved is live (maybe edited), so its own C# global usings are read from it
  stats = null, // §113: an optional tally of how far the pass got — {seen} reference groups the extractors emitted
}) {
  // package-level splits (a Go package / Java wildcard import spanning several owners → silence) are decided at MODULE
  // granularity: with per-file owners every multi-file package would read as split and the whole language would go silent
  const bases = cutBasesOf([...fileSet], srcRoots);
  const modOwner = f => (fileSet.has(f) ? moduleOf(f, pkgs, bases) : undefined);
  const resolvePathToFile = makeResolvePathToFile(root, modOwner, excludedFor(fileSet));
  const resolver = makeResolver({ ownerIndex: { ownerOf: dirOwner(fileSet) }, symbolTable: table, resolvePathToFile });
  const csScope = csScopesFor(root, csFacts);
  // the ordered first-unique-match-wins walk (the vendored resolveCandidateGroup), answering the resolved FILE: nearest
  // binding first; a present-but-ambiguous nearer candidate silences the group; absent continues to the next
  const bindGroup = (candidates, rel, lang) => {
    for (const cand of candidates) {
      const o = resolver.classify(cand, rel, lang);
      if (o.kind === 'resolved') return o.resolvedFile;
      if (o.kind === 'ambiguous') return undefined;
    }
    return undefined;
  };
  return (rel, f) => {
    // one file's resolved out-edges (deduplicated, deterministic)
    if (!f) return [];
    const uses = f.c ? assembleCsharpCandidates(deserCs(f.c), csScope(rel, singleFile ? csOwn(f.c) : null)) : f.u || [];
    if (stats) stats.seen = (stats.seen || 0) + uses.length;
    const seen = new Map();
    for (const dep of uses) {
      const to = bindGroup(dep.candidates, rel, f.l);
      if (!to || to === rel) continue;
      const k = to + SEP + dep.kind;
      const e = seen.get(k);
      if (e) {
        e.n++;
        if (dep.line < e.line) e.line = dep.line;
      } else seen.set(k, { line: dep.line, n: 1 });
    }
    return [...seen]
      .map(([k, v]) => {
        const [to, kind] = k.split(SEP);
        return { from: rel, to, kind, line: v.line, n: v.n };
      })
      .sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : a.kind < b.kind ? -1 : 1));
  };
}

export function tableFrom(files, relFacts) {
  const table = new SymbolTable();
  const csFacts = []; // every C# file's own global usings/aliases — the input of the per-project scopes
  for (const rel of files) {
    const f = relFacts[rel];
    if (!f) continue;
    for (const d of f.d || []) table.declare(f.l, d.symbolKey, rel);
    if (f.c) csFacts.push({ path: rel, ...csOwn(f.c) });
  }
  return { table, csFacts };
}

// the symbol table, compact enough to live in the model (check-time resolution of an edited file): up to 3 defining
// files per key — 0/1/≥2 classification and the nested-split distinct-file rule survive the cap
export function compactDecls(files, relFacts) {
  const out = Object.create(null);
  for (const rel of files) {
    const f = relFacts[rel];
    if (!f) continue;
    for (const d of f.d || []) {
      const byLang = (out[f.l] ||= Object.create(null));
      const arr = (byLang[d.symbolKey] ||= []);
      if (arr.length < 3 && !arr.includes(rel)) arr.push(rel);
    }
  }
  return out;
}
export function hydrateTable(relDecls) {
  const table = new SymbolTable();
  for (const [lang, keys] of Object.entries(relDecls || {}))
    for (const [key, files] of Object.entries(keys)) for (const f of files) table.declare(lang, key, f);
  return table;
}

// ---- resolution over the whole indexed tree → deduplicated file→file edges ----
export function buildEdges({ root, files, relFacts, pkgs = [], srcRoots = [], stats = null }) {
  const fileSet = new Set(files);
  const { table, csFacts } = tableFrom(files, relFacts);
  const resolve = makeEdgeResolver({ root, fileSet, table, pkgs, srcRoots, csFacts, stats });
  const edges = [];
  for (const rel of files) edges.push(...resolve(rel, relFacts[rel]));
  return edges.sort((a, b) =>
    a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : a.kind < b.kind ? -1 : 1
  );
}

// ---- the module graph: directories at layout depth ≤ 2 as nodes, edge counts, cycles ----
export const moduleOf = (rel, pkgs = [], bases = []) => {
  // a source-root cut base (cutBasesOf, §113) reroots the depth-2 rule so the cut lands on PACKAGES: the segments
  // are counted from the base, not from the repository root, and a file sitting directly in the base is the base's
  // own module. Checked before `pkgs` because a Maven/Gradle module's `pom.xml` would otherwise swallow every
  // package under it into one module — the coarser answer for exactly the repositories this exists to cut finer.
  for (const b of bases)
    if ((rel + '/').startsWith(b + '/')) {
      const segs = rel.slice(b.length + 1).split('/');
      return segs.length <= 1 ? b : b + '/' + segs.slice(0, Math.min(2, segs.length - 1)).join('/');
    }
  for (const d of pkgs) if (d !== '.' && (rel + '/').startsWith(d + '/')) return d; // a package root IS the module
  const segs = rel.split('/');
  return segs.length <= 1 ? '.' : segs.slice(0, Math.min(2, segs.length - 1)).join('/');
};
// module assignment refined for a dominant module (a module holding most of the repo is not a module, it is the
// repository — refine one path segment deeper, e.g. a single-package repo's real architecture lives INSIDE the
// package, source/cli/src/{ast,relations,io,…}). Pure function of (files, pkgs) — the SAME assignment moduleGraph
// uses for its nodes/edges must be used everywhere a module ID is computed for a file, or module IDs silently stop
// matching between callers (§G11). Cheap to recompute (two O(files) passes); a closure can't survive model.json
// serialization, so callers at check time (after a fresh deserialize) recompute it rather than reusing a stored one.
export function refineModOf(files, pkgs = [], srcRoots = []) {
  const bases = cutBasesOf(files, srcRoots);
  let modOf = rel => moduleOf(rel, pkgs, bases);
  for (let round = 0; round < 2; round++) {
    const per = new Map();
    for (const rel of files) {
      const m = modOf(rel);
      per.set(m, (per.get(m) || 0) + 1);
    }
    const dominant = new Set(
      [...per].filter(([m, n]) => n >= Math.max(40, files.length * 0.5)).map(([m]) => m)
    );
    if (!dominant.size) break;
    const prev = modOf;
    modOf = rel => {
      const m = prev(rel);
      if (!dominant.has(m)) return m;
      const sub = m === '.' ? rel : rel.slice(m.length + 1);
      const segs = sub.split('/');
      return segs.length <= 1
        ? m
        : (m === '.' ? '' : m + '/') +
            segs[0] +
            (/^(src|lib|app|source|packages|apps)$/.test(segs[0]) && segs.length > 2 ? '/' + segs[1] : '');
    };
  }
  return modOf;
}
export function moduleGraph(edges, files, pkgs = [], srcRoots = []) {
  const modOf = refineModOf(files, pkgs, srcRoots);
  const filesPer = new Map();
  for (const rel of files) {
    const m = modOf(rel);
    filesPer.set(m, (filesPer.get(m) || 0) + 1);
  }
  const em = new Map(); // from\0to → { n, kinds }
  for (const e of edges) {
    const a = modOf(e.from),
      b = modOf(e.to);
    if (a === b) continue;
    const k = a + SEP + b;
    let r = em.get(k);
    if (!r) {
      r = { n: 0, kinds: {} };
      em.set(k, r);
    }
    r.n += e.n;
    r.kinds[e.kind] = (r.kinds[e.kind] || 0) + e.n;
  }
  const medges = [...em]
    .map(([k, v]) => {
      const [from, to] = k.split(SEP);
      return { from, to, ...v };
    })
    .sort((a, b) => b.n - a.n || (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : 1));
  const nodes = [...filesPer].map(([id, n]) => ({ id, files: n })).sort((a, b) => (a.id < b.id ? -1 : 1));
  // cycles: strongly connected components of size ≥ 2 (Tarjan), deterministic order. Every node — singleton or
  // not — is captured into compOf (comp[0], the same deterministic sort-picked representative cycles already
  // used) so J4.3's layer pass below can condense the graph before measuring depth.
  const adj = new Map();
  for (const e of medges) (adj.get(e.from) || adj.set(e.from, []).get(e.from)).push(e.to);
  let idx = 0;
  const st = [];
  const low = new Map(),
    num = new Map(),
    on = new Set();
  const cycles = [];
  const compOf = new Map();
  const strong = v => {
    num.set(v, idx);
    low.set(v, idx);
    idx++;
    st.push(v);
    on.add(v);
    for (const w of adj.get(v) || []) {
      if (!num.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v), num.get(w)));
    }
    if (low.get(v) === num.get(v)) {
      const comp = [];
      let w;
      do {
        w = st.pop();
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      comp.sort();
      for (const m of comp) compOf.set(m, comp[0]);
      if (comp.length >= 2) cycles.push(comp);
    }
  };
  for (const n of nodes.map(x => x.id)) if (!num.has(n)) strong(n);
  cycles.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  // layer = longest path to a leaf on the SCC-condensed DAG (a module with no outgoing condensed edge = 0); every
  // member of a collapsed cycle inherits its component's layer, and the intra-component edges a cycle collapses
  // to self-edges are dropped first (`cf === ct`) so they cannot corrupt that measurement. Computed iteratively
  // (explicit stack, no native recursion) — `strong` above is recursive and stays that way (out of scope here),
  // but a wide/deep graph must not be able to overflow the call stack on THIS new pass (§G1).
  const condAdj = new Map();
  const condSeen = new Set();
  for (const e of medges) {
    const cf = compOf.get(e.from),
      ct = compOf.get(e.to);
    if (cf === ct) continue;
    const k = cf + SEP + ct;
    if (condSeen.has(k)) continue;
    condSeen.add(k);
    (condAdj.get(cf) || condAdj.set(cf, []).get(cf)).push(ct);
  }
  const layerOf = new Map();
  for (const start of new Set(compOf.values())) {
    if (layerOf.has(start)) continue;
    const stack = [{ id: start, i: 0 }];
    const onStack = new Set([start]);
    while (stack.length) {
      const fr = stack[stack.length - 1];
      const nb = condAdj.get(fr.id) || [];
      if (fr.i < nb.length) {
        const next = nb[fr.i++];
        if (!layerOf.has(next) && !onStack.has(next)) {
          stack.push({ id: next, i: 0 });
          onStack.add(next);
        }
        continue;
      }
      let maxL = -1;
      for (const n2 of nb) {
        const l = layerOf.get(n2);
        if (l !== undefined && l > maxL) maxL = l;
      }
      layerOf.set(fr.id, maxL + 1);
      onStack.delete(fr.id);
      stack.pop();
    }
  }
  for (const node of nodes) node.layer = layerOf.get(compOf.get(node.id));
  return { nodes, edges: medges, cycles };
}
