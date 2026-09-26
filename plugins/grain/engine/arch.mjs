// grain engine · the measured architecture: dependency norms, architecture hits, and the relation layer of a learn pass
// Split out of core.mjs: the statements below are the ones that stood there, unchanged.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { basename, dirname } from 'node:path/posix';
import { EXCL, HARD_EXCL, CFG } from './config.mjs';
import {
  buildEdges,
  compactDecls,
  moduleGraph,
  parsePsr4,
  sourceRootsOf,
  tableFrom,
  refineModOf,
  hydrateTable,
  makeEdgeResolver,
} from './relations.mjs';
import { toPosix } from './base.mjs';
import { kt } from './facts.mjs';
import { voice } from './mine.mjs';

// established layering norms: a (source, target module) pair is a two-population contrast cell, the same cell the
// language bridge, the birth obligations and a role cell against `_all:` already decide by (mathematics.md,
// "Architecture norms"). Only CAPABLE files enter it — a file with at least one resolved out-edge; a file that
// imports nothing at all says nothing about which modules it avoids. For a source A (a module, or a role group one
// level finer, §J5.7a) and a target module B: k_A of the n_A capable files of A reach B, and k_O of the n_O capable
// files outside A and outside B do. The data term codes A's reach/no-reach outcomes at A's own KT rate instead of
// at the outside KT rate; the model term is the BIC half log; the index cost is paid once over every (A, B) where B
// is reached by at least minRaw capable files and the outside population holds at least minRaw — INCLUDING the
// pairs A never crosses (k_A = 0), which is what lets a boundary nobody has crossed be a candidate. It speaks when
// the gain is positive, the λ posterior
// names the value, and the contrast points the way the value says: an absence only where A reaches B LESS than
// the rest of the repository, a presence only where it reaches B MORE. That direction is what used to be patched
// with a 10% "reach elsewhere" floor; the outside rate now carries it, and a flat 50/50 coin no longer decides
// whether "A never reaches B" is news.
export function architectureNorms(model) {
  const files = model.filesAll || [];
  const pkgs = model.pkgs || [];
  const refined = refineModOf(files, pkgs, model.srcRoots || []);
  const modOf = new Map();
  for (const f of files) modOf.set(f, refined(f));
  // per-file reached-module set (a target module counts once per file), and the capable files
  const reached = new Map();
  const capable = new Set();
  for (const e of model.edges || []) {
    const a = modOf.get(e.from),
      b = modOf.get(e.to);
    if (a === undefined || b === undefined || e.from === e.to) continue;
    capable.add(e.from);
    if (a === b) continue;
    (reached.get(e.from) || reached.set(e.from, new Set()).get(e.from)).add(b);
  }
  const capIn = new Map(); // module -> capable files in it
  const reachCount = new Map(); // module B -> capable files anywhere that reach B
  for (const f of capable) {
    const m = modOf.get(f);
    capIn.set(m, (capIn.get(m) || 0) + 1);
    for (const b of reached.get(f) || []) reachCount.set(b, (reachCount.get(b) || 0) + 1);
  }
  const capTotal = capable.size;
  const targets = [...reachCount.keys()].filter(b => reachCount.get(b) >= CFG.minRaw).sort();
  // the sources: every module, and every role group (§J5.7a) — a group's population is the DISTINCT capable files
  // carrying a member of it, never its scope count (a file holding 20 methods of one role is one file's evidence)
  const sources = [];
  const byModule = new Map();
  for (const f of capable) {
    const m = modOf.get(f);
    (byModule.get(m) || byModule.set(m, []).get(m)).push(f);
  }
  for (const [A, fs2] of byModule) sources.push({ A, fs: fs2, fromKind: 'module' });
  for (const part of model.partitions || []) {
    const filesByRole = new Map();
    for (const [key, role] of Object.entries(part.assignments || {})) {
      if (!Number.isInteger(role) || role === -1) continue;
      const path = key.slice(0, key.indexOf('#'));
      if (!capable.has(path)) continue;
      (filesByRole.get(role) || filesByRole.set(role, new Set()).get(role)).add(path);
    }
    for (const [role, fset] of filesByRole) sources.push({ A: part.name + '#' + role, fs: [...fset], fromKind: 'group' });
  }
  // the cells, and ONE index cost over both populations counted before any per-cell floor — a widened candidate
  // universe is never split into separately-taxed sub-universes (the same discipline as mine()'s own index cost)
  const cells = [];
  for (const { A, fs: fs2, fromKind } of sources)
    for (const B of targets) {
      if (fromKind === 'module' && A === B) continue;
      let nA = 0,
        kA = 0;
      for (const f of fs2) {
        if (modOf.get(f) === B) continue; // a file inside B cannot cross into B
        nA++;
        if ((reached.get(f) || EMPTY_SET).has(B)) kA++;
      }
      const kO = reachCount.get(B) - kA;
      const nO = capTotal - (capIn.get(B) || 0) - nA;
      if (nO < CFG.minRaw) continue; // too few capable files outside A and B to be a rate at all
      cells.push({ A, B, kA, nA, kO, nO, fromKind });
    }
  const idxCost = Math.ceil(Math.log2(Math.max(cells.length, 2)));
  const K = 2;
  const out = [];
  for (const { A, B, kA, nA, kO, nO, fromKind } of cells) {
    if (nA < CFG.minRaw || nA < CFG.minEff) continue; // every file counts once (weight 1), so raw === neff here
    const local = { true: kA, false: nA - kA },
      glob = { true: kO, false: nO - kO };
    let data = 0;
    for (const v of ['true', 'false']) {
      const nv = local[v];
      if (nv) data += nv * Math.log2(kt(local, K, v, nA) / kt(glob, K, v, nO));
    }
    const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(nA, 2)) - idxCost;
    if (bits <= 0) continue; // evidence = codelength gain, nothing else
    const exp = local.true > local.false ? 'true' : 'false';
    const ne = local[exp];
    if (!((ne + 0.5) / (nA + K / 2) >= 1 - 1 / CFG.lambda)) continue; // the one loss constant, same posterior-predictive bound
    // the direction the contrast points must be the direction the value names
    if (exp === 'false' ? !(kA * nO < kO * nA) : !(kA * nO > kO * nA)) continue;
    out.push({ from: A, to: B, exp, ne, neff: nA, share: ne / nA, bits, fromKind, kOut: kO, nOut: nO });
  }
  return out;
}
const EMPTY_SET = new Set();
// architecture: the file's CURRENT out-edges resolved against the accepted tree — a reference that creates the FIRST
// edge between two modules is a boundary crossing worth saying at edit time; one whose reverse already exists closes a
// cycle. Existing crossings (the module pair already has edges at HEAD) stay silent — practice already speaks there.
// Needs no partition: the advice works on a repo too small to hold convention norms.
export function computeArchHits({ model, root, effRel, relFact }) {
  const archHits = [];
  if (model.relDecls && relFact && model.moduleGraph) {
    try {
      const fileSet = new Set(model.filesAll || []);
      const resolve = makeEdgeResolver({
        root,
        fileSet,
        table: hydrateTable(model.relDecls),
        pkgs: model.pkgs || [],
        srcRoots: model.srcRoots || [],
        csFacts: model.csFacts || [],
        singleFile: true,
      });
      const mg = model.moduleGraph;
      const refined =
        model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || [], model.srcRoots || []));
      for (const e of resolve(effRel, relFact)) {
        const a = refined(effRel),
          b2 = refined(e.to);
        for (const bd of model.boundaries || []) {
          const inFrom =
            bd.boundary.from === '.'
              ? !effRel.includes('/')
              : (effRel + '/').startsWith(bd.boundary.from + '/');
          if (inFrom && (e.to + '/').startsWith(bd.boundary.to + '/'))
            archHits.push({
              line: e.line,
              to: e.to,
              kind: 'boundary-decision',
              id: bd.id,
              text: `[grain] ${voice('decided', `${bd.boundary.from}/ never imports ${bd.boundary.to}/ — your import of \`${e.to}\` (line ${e.line}) crosses it.${bd.note ? `\n  ${bd.note}` : ''}`, { typ: 'boundary', who: bd.author, when: bd.createdAt })}`,
            });
        }
        if (a === b2) continue;
        const fwd = mg.edges.find(x => x.from === a && x.to === b2);
        if (fwd) {
          // an established crossing — usually silence, unless THIS import is the measured exception to A's own norm
          const norm = (model.archNorms || []).find(
            n => n.fromKind === 'module' && n.from === a && n.to === b2 && n.exp === 'false'
          );
          if (norm)
            archHits.push({
              line: e.line,
              to: e.to,
              kind: 'layering-norm',
              text: `[grain] ${voice('practiced', `architecture: your import of \`${e.to}\` (line ${e.line}) reaches ${b2} — ${a}/ established practice is not to (${norm.neff - norm.ne} of ${norm.neff} files do, yours now included). Not forbidden, but it departs from what the rest of ${a}/ does.`)}`,
            });
          // group→module norms (§J5.7a): a finer population than the module — this file may belong to a role group
          // whose OWN established practice is not to reach b2, even where the module hit above stayed silent (or
          // fired for an unrelated reason). Membership is read straight off `part.assignments`, memoized on the
          // model like `_archModOf` (a closure can't survive model.json serialization, so it is recomputed once per
          // in-memory model and cached on it, never persisted).
          const fileGroups = model._archFileGroups || (model._archFileGroups = new Map());
          let groups = fileGroups.get(effRel);
          if (groups === undefined) {
            groups = [];
            for (const pt of model.partitions || [])
              for (const [key, role] of Object.entries(pt.assignments || {})) {
                if (!Number.isInteger(role) || role === -1) continue;
                if (key.slice(0, key.indexOf('#')) === effRel) groups.push(pt.name + '#' + role);
              }
            fileGroups.set(effRel, groups);
          }
          if (groups.length) {
            const gnorm = (model.archNorms || []).find(
              n => n.fromKind === 'group' && n.exp === 'false' && n.to === b2 && groups.includes(n.from)
            );
            if (gnorm) {
              const gi = gnorm.from.lastIndexOf('#');
              const gpart = (model.partitions || []).find(x => x.name === gnorm.from.slice(0, gi));
              const grole = +gnorm.from.slice(gi + 1);
              const glabel = (gpart && gpart.medoids[grole] && gpart.medoids[grole].label) || 'group';
              archHits.push({
                line: e.line,
                to: e.to,
                kind: 'layering-norm-group',
                text: `[grain] ${voice('practiced', `architecture: your import of \`${e.to}\` (line ${e.line}) reaches ${b2} — «${glabel}» established practice is not to (${gnorm.neff - gnorm.ne} of ${gnorm.neff} files do, yours now included). Not forbidden, but it departs from what the rest of «${glabel}» does.`)}`,
              });
            }
          }
          continue;
        }
        const rev = mg.edges.find(x => x.from === b2 && x.to === a);
        const via = mg.edges
          .filter(x => x.from === a)
          .map(x => x.to)
          .filter(m => m !== b2 && mg.edges.some(x2 => x2.from === m && x2.to === b2))
          .sort()[0];
        archHits.push({
          line: e.line,
          to: e.to,
          kind: rev ? 'cycle' : 'first-crossing',
          text: `[grain] ${voice(
            'practiced',
            rev
              ? `architecture: your import of \`${e.to}\` (line ${e.line}) CLOSES A CYCLE ${a} ↔ ${b2} — ${b2} already depends on ${a} (${rev.n} edge${rev.n > 1 ? 's' : ''}).`
              : `architecture: your import of \`${e.to}\` (line ${e.line}) is the FIRST edge ${a} → ${b2} (0 existing)${via ? ` — today ${a} reaches ${b2} via ${via} (an established path)` : ''}. Not forbidden, but it opens a dependency no one has opened before.`
          )}`,
        });
      }
    } catch {
      /* architecture advice must never break check */
    }
  }
  return archHits;
}
// the relation layer: file→file edges bound by the tri-state resolver, and their module-level aggregation — the measured
// architecture (which modules exist, who depends on whom, where the cycles are)
export function applyRelationLayer(model, { root, files, pkgs, tree, relFacts, log }) {
  try {
    // the PSR-4 census: every composer.json in the tree, read once, its prefixes merged. Resolution does not use it —
    // the vendored PHP resolver reads each package's own composer.json and, when that resolves nothing, every other
    // one (a monorepo's cross-package class, issue 059), staying silent when two packages map one class. The census
    // feeds the report's disclosure that a PHP repository declares no autoload map at all.
    const phpAutoload = [];
    try {
      const merged = new Map();
      const addComposer = composerRel => {
        let text;
        try {
          text = readFileSync(join(root, composerRel), 'utf8');
        } catch {
          return;
        }
        const dir = dirname(composerRel);
        for (const [prefix, dirs] of parsePsr4(text, dir === '.' ? '' : dir)) {
          const arr = merged.get(prefix) || (merged.set(prefix, []).get(prefix));
          for (const d of dirs) if (!arr.includes(d)) arr.push(d);
        }
      };
      if (tree && tree.allPaths) {
        for (const rel2 of tree.allPaths)
          if (basename(rel2) === 'composer.json' && !HARD_EXCL.test(rel2)) addComposer(rel2);
      } else
        (function fc(d) {
          let es;
          try {
            es = readdirSync(d, { withFileTypes: true });
          } catch {
            return;
          }
          for (const e of es) {
            const full = join(d, e.name);
            if (EXCL.test(toPosix(relative(root, full)) + '/')) continue;
            if (e.isDirectory()) fc(full);
            else if (e.name === 'composer.json') addComposer(toPosix(relative(root, full)));
          }
        })(root);
      for (const [prefix, dirs] of merged) phpAutoload.push({ prefix, dirs });
    } catch {
      /* an extra channel, never a reason to fail the pass */
    }
    // JVM-family source roots (§113): where a package hierarchy starts on disk, from the `package` declaration
    // the extractor already read and from the Maven/Gradle standard layout. Stored on the model because the
    // single-file `check` path has no relFacts for the whole tree and must resolve the SAME way this pass did.
    const srcRoots = sourceRootsOf(files, relFacts);
    const relStats = {};
    const edges = buildEdges({ root, files, relFacts, pkgs, srcRoots, stats: relStats });
    model.edges = edges.slice(0, 30000);
    model.edgesTruncated = Math.max(0, edges.length - 30000);
    model.srcRoots = srcRoots;
    model.moduleGraph = moduleGraph(edges, files, pkgs, srcRoots);
    // §113: the three stages a dependency passes through before it can become a law, so a graph with no relations
    // can say WHERE they were lost instead of printing a bare zero. `seen` counts every reference the extractors
    // emitted (internal and external alike — which of them is internal is not knowable before resolution),
    // `resolved` the file→file edges bound to a file in the indexed tree, `crossing` those joining two modules.
    {
      const mOf = refineModOf(files, pkgs, srcRoots);
      let crossing = 0;
      for (const e of edges) if (mOf(e.from) !== mOf(e.to)) crossing++;
      model.relStages = { seen: relStats.seen || 0, resolved: edges.length, crossing };
    }
    // what the single-file `check` path needs to resolve an EDITED file's references against the accepted tree
    model.relDecls = compactDecls(files, relFacts);
    model.phpAutoload = phpAutoload;
    // what the single-file `check` path needs to scope an edited C# file's global usings to its project: the C# files
    // that declare any (csScopesFor, relations.mjs, recomputes the project scopes from them and the .csproj files)
    model.csFacts = tableFrom(files, relFacts).csFacts.filter(f => f.globalPrefixes.length || [...f.globalAliases].length);
    model.filesAll = files;
    // every tracked path, not only the code-parseable ones: placement advice and companion-file facts are pure
    // path/stem mechanics, so a doc, migration or config is as valid a candidate as a source file (tracked ⇒ code
    // ruling, config.mjs) — code-only `files` stays the extraction/edge universe, unchanged
    model.pathsAll = tree && tree.allPaths ? tree.allPaths.filter(p => !HARD_EXCL.test(p)) : files;
    model.archNorms = architectureNorms(model);
  } catch (e) {
    log('relation pass failed: ' + (e?.message || e));
    model.edges = [];
    model.edgesTruncated = 0;
    model.moduleGraph = { nodes: [], edges: [], cycles: [], cycleCuts: [] };
    model.relDecls = null;
    model.archNorms = [];
  }
}
