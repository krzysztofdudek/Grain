// grain's relation pass — the thin orchestration over the vendored Yggdrasil machinery (engine/vendor/relations/):
// per-language extractors turn each parsed tree into declared symbols + ordered candidate groups; a language-partitioned
// symbol table and the tri-state resolver (resolved / ambiguous / absent — silence instead of a false edge) bind them to
// files; the result is file→file edges (import | call | extends | implements | type-ref | construct) and their
// aggregation into a module graph. Yggdrasil resolves onto its declared node model; grain resolves onto the indexed
// files themselves: ownerOf(file) = the file when it is part of the indexed tree, undefined otherwise (the D7 non-event —
// an edge into an unindexed file is a coverage matter, never an edge).
import { extractorForLanguage } from './vendor/relations/extractors/registry.mjs';
import { extractCsharpRefs, assembleCsharpCandidates } from './vendor/relations/extractors/csharp.mjs';
import { includeUses } from './vendor/relations/extractors/c-cpp-shared.mjs';
import { SymbolTable } from './vendor/relations/symbol-table.mjs';
import { makeResolver, resolveCandidateGroup } from './vendor/relations/resolver.mjs';
import { makeResolvePathToFile } from './vendor/relations/resolve-path.mjs';
import { parsePsr4, resolvePhpFqn } from './vendor/relations/extractors/php-resolve.mjs';

const SEP = '\u0001'; // a control byte, never inside a path; kept as an ESCAPE - literal control bytes in source are exactly what died in the prototype's vendoring
const LANG = { c_sharp: 'csharp' }; // grain grammar name → extractor language id (identity otherwise)
export const relLanguage = g => (g ? LANG[g] || g : null);
export const relSupported = g => !!extractorForLanguage(relLanguage(g));
// issue 041: `relSupported` alone answers "is ANY extractor registered", which is true for c/cpp — but c.mjs/cpp.mjs
// (both vendored from Yggdrasil) are the only REL_LANGS extractors whose entire `uses` IS the shared `includeUses`
// walker (c-cpp-shared.mjs): a `#include` grep, nothing else. Every other language's `uses` also resolves
// call/type-ref/extends/implements/construct references through the symbol table. An include-only extractor can
// only ever emit a `path` candidate for a literal `#include`, and `resolveIncludePath` (resolve-path.mjs) tries
// just ONE path — relative to the including file's OWN directory — never a project include-root, so a repo whose
// headers are addressed from a shared include/ root (leveldb's own layout, and the dominant real-world C/C++
// convention) resolves close to nothing while `relSupported` still reads "covered". This is a STRUCTURAL fact
// about the extractor (referential identity against the one shared function), not a hardcoded "c"/"cpp" name
// check, so it generalizes to any future REL_LANGS extractor built the same thin way.
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
// bare specifiers of the TS family (`@scope/pkg`, `pkg/sub`): the vendored extractor emits RELATIVE hints only (in
// Yggdrasil's world a bare name is external by definition); in a workspace monorepo the entire cross-package
// architecture flows through them, so grain collects them itself — they resolve ONLY via the workspace-package map,
// a genuinely external package stays silent
function bareImports(tree) {
  const out = [];
  for (const n of tree.rootNode.descendantsOfType(['import_statement', 'export_statement'])) {
    const src = n.childForFieldName('source');
    if (!src) continue;
    const spec = src.text.replace(/^["'`]|["'`]$/g, '');
    if (!spec || spec.startsWith('.') || spec.startsWith('/')) continue;
    out.push({
      candidates: [{ kind: 'path', specifier: spec, isPackage: true }],
      kind: 'import',
      line: n.startPosition.row + 1,
    });
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
    if (/^(typescript|tsx|javascript)$/.test(language)) u.push(...bareImports(tree));
    return { l: language, d: ex.declarations(pf), u };
  } catch {
    return null;
  }
}

// workspace packages: bare specifiers (`@scope/name`, `name/sub`) resolve to the package's own files — a pnpm/yarn
// monorepo's ENTIRE cross-package architecture flows through these, and the path resolver rightly refuses to guess them
//
// §017: the SAME channel also carries Cargo workspaces. The vendored rust-resolve.mjs's `resolveRustPath` can only
// ever resolve a `use` path back into the CALLING file's own crate (it derives `crate`/root-name meaning purely from
// `deps.crateRootFor(fromFile)`, which walks UP from fromFile — it has no notion of a sibling crate at all), so
// `use axum_core::extract::Request` written inside `axum` never resolves there. `model.workspaces` (core.mjs) now
// carries each Cargo crate's own declared name (`Cargo.toml`'s `[package] name`, dash/underscore-normalized) next
// to its `srcDir` — this resolver maps the specifier's root segment to that crate and re-runs the identical
// segment-shrinking module search the vendored resolver uses for `crate::…` (`<part>.rs` before `<part>/mod.rs`,
// longest prefix first), just rooted at a FOREIGN crate's `srcDir` instead of the calling file's own.
export function wsResolverFor({ workspaces, fileSet }) {
  if (!workspaces || !workspaces.length) return () => undefined;
  const byName = new Map();
  for (const w of [...workspaces].sort((a, b) => a.dir.length - b.dir.length || (a.dir < b.dir ? -1 : 1)))
    if (!byName.has(w.name)) byName.set(w.name, w); // a vendored/worktree COPY of a package never shadows the real one
  const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
  const rustFromSrcDir = (srcDir, tail) => {
    for (let k = tail.length; k >= 1; k--) {
      const part = tail.slice(0, k).join('/');
      for (const cand of [srcDir + '/' + part + '.rs', srcDir + '/' + part + '/mod.rs'])
        if (fileSet.has(cand)) return cand;
    }
    for (const cand of [srcDir + '.rs', srcDir + '/mod.rs', srcDir + '/lib.rs', srcDir + '/main.rs'])
      if (fileSet.has(cand)) return cand;
    return undefined;
  };
  return (specifier, language) => {
    if (language === 'rust') {
      const segs = specifier.split('::').filter(Boolean);
      if (!segs.length) return undefined;
      const w = byName.get(segs[0]);
      return w && w.srcDir ? rustFromSrcDir(w.srcDir, segs.slice(1)) : undefined;
    }
    if (
      !/^(typescript|tsx|javascript)$/.test(language) ||
      specifier.startsWith('.') ||
      specifier.startsWith('/')
    )
      return undefined;
    for (const [name, w] of byName) {
      if (specifier === name) return w.entry;
      if (specifier.startsWith(name + '/')) {
        const sub = specifier.slice(name.length + 1);
        for (const base of [w.dir + '/' + sub, w.dir + '/src/' + sub])
          for (const ext of EXTS) if (fileSet.has(base + ext)) return base + ext;
        return w.entry;
      }
    }
    return undefined;
  };
}

// tsconfig/jsconfig files are JSONC in the wild: comments and trailing commas everywhere — strip them string-aware
export function parseJsonc(text) {
  let out = '',
    i = 0,
    inStr = false;
  while (i < text.length) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') {
        out += text[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === '"') inStr = false;
      i++;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
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
  const hit = base => {
    for (const ext of EXTS) {
      const c = base + ext;
      if (fileSet.has(c)) return c;
    }
    return undefined;
  };
  return (specifier, language, fromFile) => {
    if (
      !/^(typescript|tsx|javascript)$/.test(language) ||
      specifier.startsWith('.') ||
      specifier.startsWith('/')
    )
      return undefined;
    for (const cfg of cfgs) {
      if (cfg.dir !== '.' && !(fromFile + '/').startsWith(cfg.dir + '/')) continue;
      for (const [pat, targets] of cfg.patterns || []) {
        const star = pat.indexOf('*');
        let cap = null;
        if (star < 0) {
          if (specifier !== pat) continue;
        } else {
          const pre = pat.slice(0, star),
            suf = pat.slice(star + 1);
          if (
            !(
              specifier.startsWith(pre) &&
              specifier.endsWith(suf) &&
              specifier.length >= pre.length + suf.length
            )
          )
            continue;
          cap = specifier.slice(pre.length, specifier.length - suf.length);
        }
        for (const t of targets) {
          const r = hit(cap === null ? t : t.replace('*', cap));
          if (r) return r;
        }
      }
      if (cfg.base != null) {
        const r = hit((cfg.base === '.' ? '' : cfg.base + '/') + specifier);
        if (r) return r;
      }
      return undefined;
    }
    return undefined;
  };
}

// re-exported so core.mjs's PSR-4 discovery (below, at index time) parses composer.json with the SAME logic
// resolvePhpFqn itself trusts — never a second, hand-rolled JSON reader that could drift from it.
export { parsePsr4 };

// issue 059: a PHP MONOREPO declares PSR-4 autoload per COMPONENT — Symfony's src/Symfony/Component/Xxx/
// each carries its OWN composer.json, mapping only ITS OWN namespace prefix to its own directory; there is
// no single repo-root composer.json covering the lot. The vendored per-file resolver (php-resolve.mjs's
// `makePhpResolveDeps`, invoked as `base` below) walks UP from the REFERENCING file looking for the nearest
// ANCESTOR composer.json — for a `use` reaching across to a SIBLING component that finds only the referencing
// component's own map, which never contains the target's namespace, so the candidate silently fails to
// resolve (44 real HttpKernel → EventDispatcher edges, gone). Mirrors `wsResolverFor`/`aliasResolverFor`:
// core.mjs reads EVERY composer.json in the tree once (not just ancestors of one file) and merges their
// psr-4 prefixes into one repo-wide map; this resolver re-runs the IDENTICAL longest-prefix/exists/ambiguity
// resolution (`resolvePhpFqn`) against that union instead of one nearest ancestor, and only when the
// per-file resolution above already came up empty — a component's own internal `use`s keep resolving via
// their own composer.json exactly as before.
export function phpAutoloadResolverFor({ phpAutoload = [], fileSet }) {
  if (!phpAutoload.length) return () => undefined;
  const merged = new Map();
  for (const { prefix, dirs } of phpAutoload) {
    const arr = merged.get(prefix) || (merged.set(prefix, []).get(prefix));
    for (const d of dirs) if (!arr.includes(d)) arr.push(d);
  }
  const deps = { psr4For: () => merged, exists: f => fileSet.has(f), isExcluded: f => !fileSet.has(f) };
  return (specifier, language, fromFile) =>
    language === 'php' ? resolvePhpFqn(specifier, fromFile, deps) : undefined;
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
// The union is used for TWO things: resolution (a type reference resolves against every source root of the
// repository, not only the ancestors of the referencing file) and the module cut (below).
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

// issue 113: Maven and Gradle put production and test code in SIBLING source roots, and the vendored
// `resolveJavaFqn` (java-resolve.mjs) tries `<ancestor>/<fqn>.java` over the ancestor directories of the
// REFERENCING file only — from `src/test/java/…` it walks `src/test/java`, `src/test`, `src`, `<root>` and never
// reaches `src/main/java`, so every test → main import silently fails to resolve (all 14 of them on
// spring-petclinic). Mirrors `phpAutoloadResolverFor`: the same resolution, re-run against the repository's own
// source roots instead of one file's ancestors, and only after the per-file resolution above came up empty — a
// reference inside one root keeps resolving exactly as it did.
export function javaRootResolverFor({ srcRoots = [], fileSet, modOwner }) {
  if (!srcRoots.length) return () => undefined;
  const roots = [...srcRoots].sort();
  return (specifier, language, fromFile, isPackage) => {
    if (language !== 'java') return undefined;
    const segs = specifier.split('.').filter(s => s.length > 0);
    if (!segs.length) return undefined;
    if (isPackage) {
      // a wildcard import names a package, not a type: it binds only when every file of that package under one
      // root shares a module owner (the vendored resolver's own rule — a split package stays silent)
      const dir = segs.join('/');
      for (const root of roots) {
        const pfx = (root === '' ? '' : root + '/') + dir + '/';
        const inPkg = [];
        for (const f of fileSet) if (f.startsWith(pfx) && f.endsWith('.java') && !f.slice(pfx.length).includes('/')) inPkg.push(f);
        if (!inPkg.length) continue;
        inPkg.sort();
        let sole;
        for (const f of inPkg) {
          const owner = modOwner?.(f);
          if (owner === undefined) continue;
          if (sole === undefined) sole = owner;
          else if (owner !== sole) return undefined;
        }
        return sole === undefined ? inPkg[0] : inPkg.find(f => modOwner?.(f) === sole);
      }
      return undefined;
    }
    // a nested type's FQN also resolves to the file of its ENCLOSING type — the vendored resolver's second candidate
    const cands = [segs.join('/') + '.java'];
    if (segs.length >= 2) cands.push(segs.slice(0, -1).join('/') + '.java');
    for (const root of roots)
      for (const c of cands) {
        const f = root === '' ? c : root + '/' + c;
        if (fileSet.has(f)) return f;
      }
    return undefined;
  };
}

// the shared edge resolver: the full pass and the single-file `check` path resolve through the SAME machinery
export function makeEdgeResolver({
  root,
  fileSet,
  table,
  workspaces = [],
  pkgs = [],
  srcRoots = [],
  tsAliases = [],
  phpAutoload = [],
  csGlobal = { usings: [], aliases: [] },
}) {
  const ownerOf = f => (fileSet.has(f) ? f : undefined);
  // package-level splits (a Go package / Java wildcard import spanning several owners → silence) are decided at MODULE
  // granularity: with per-file owners every multi-file package would read as split and the whole language would go silent
  const bases = cutBasesOf([...fileSet], srcRoots);
  const modOwner = f => (fileSet.has(f) ? moduleOf(f, pkgs, bases) : undefined);
  const isExcluded = f => !fileSet.has(f);
  const base = makeResolvePathToFile(root, modOwner, isExcluded);
  const ws = wsResolverFor({ workspaces, fileSet });
  const alias = aliasResolverFor({ tsAliases, fileSet });
  const phpMono = phpAutoloadResolverFor({ phpAutoload, fileSet });
  const javaRoots = javaRootResolverFor({ srcRoots, fileSet, modOwner });
  const resolvePathToFile = (specifier, fromFile, language, isPackage) =>
    base(specifier, fromFile, language, isPackage) ??
    alias(specifier, language, fromFile) ??
    ws(specifier, language) ??
    phpMono(specifier, language, fromFile) ??
    javaRoots(specifier, language, fromFile, isPackage);
  const resolver = makeResolver({ ownerIndex: { ownerOf }, symbolTable: table, resolvePathToFile });
  return (rel, f) => {
    // one file's resolved out-edges (deduplicated, deterministic)
    if (!f) return [];
    const uses = f.c
      ? assembleCsharpCandidates(deserCs(f.c), {
          projectGlobalUsings: csGlobal.usings,
          projectGlobalUsingAliases: csGlobal.aliases,
        })
      : f.u || [];
    const seen = new Map();
    for (const dep of uses) {
      const to = resolveCandidateGroup(dep.candidates, resolver, rel, f.l);
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
  const usings = new Set();
  const aliases = new Map();
  for (const rel of files) {
    const f = relFacts[rel];
    if (!f) continue;
    for (const d of f.d || []) table.declare(f.l, d.symbolKey, rel);
    if (f.c) {
      for (const p of f.c.scope.globalPrefixes || []) usings.add(p);
      for (const [n, fqn] of f.c.scope.globalAliases || []) aliases.set(n, fqn);
    }
  }
  return { table, csGlobal: { usings: [...usings], aliases: [...aliases.entries()] } };
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
export function buildEdges({ root, files, relFacts, workspaces = [], pkgs = [], srcRoots = [], tsAliases = [], phpAutoload = [] }) {
  const fileSet = new Set(files);
  const { table, csGlobal } = tableFrom(files, relFacts);
  const resolve = makeEdgeResolver({ root, fileSet, table, workspaces, pkgs, srcRoots, tsAliases, phpAutoload, csGlobal });
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
