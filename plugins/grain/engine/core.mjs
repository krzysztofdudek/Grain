// grain engine core — the emergent repo-convention engine, vendored from the MIT-licensed `roots2.mjs`
// prototype (github.com/krzysztofdudek/Yggdrasil, branch claude/document-review-13yoty, planning/roots/).
// The pristine original lives in that repository (planning/roots/prototype-roots2.mjs); this file is that engine with:
//   · the two hardcoded paths made configurable (vendored web-tree-sitter runtime, grammar dir — see config.mjs)
//   · the CLI globals (CMD/REPO/MODEL/OPTS/ARGS) replaced by explicit parameters
//   · the literal NUL / SOH bytes replaced by '\u0000' / '\u0001' escapes (behaviour identical)
//   · command functions returning lines instead of printing, so the CLI can stamp every answer
//   · history learning split into a resumable replay (history.mjs) so new commits cost only their new blobs
// Nothing about any language, framework or style is written down here: language bindings are DERIVED from
// each grammar's node-types.json, features are enumerated generically from raw ASTs and paths, and
// conventions are the statistically broken symmetries in that space (MDL acceptance, KT posteriors).
//
// The split of this file (ticket 117) is in progress: the seams already cut live in the sibling modules
// re-exported at the bottom, and every name this file exported before the split is still exported here.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { basename, dirname, extname, join as pjoin, normalize as pnormalize } from 'node:path/posix';
import { GRAMMAR_DIR, EXT2GRAMMAR, GRAMMARS, CFG, EXCL, HARD_EXCL } from './config.mjs';
import {
  relFactsFor,
  buildEdges,
  moduleGraph,
  refineModOf,
  sourceRootsOf,
  compactDecls,
  hydrateTable,
  tableFrom,
  makeEdgeResolver,
  parseJsonc,
  relSupported,
  relPathOnly,
  parsePsr4,
} from './relations.mjs';
import { S, UNSEEN, toPosix } from './base.mjs';
import { VALUE_INDEX_CAP, VALUE_NORM_PLACES, isLocationNode, scopeName, stem0 } from './extract.mjs';
import {
  STRUCT_PID,
  applyVocab,
  archCellLabel,
  archCellSort,
  clearsOwnRate,
  currentPathOf,
  decoLabel,
  factLabel,
  isBool,
  isDefiningFact,
  jacW,
  kt,
  part,
  pct,
  ptr,
  scopeLabel,
  skeyR,
} from './facts.mjs';
import { lexicalPreds, scopeLine, scopeLineEnd } from './lexical.mjs';
import {
  altMarkerFor,
  assignAll,
  authorConcClause,
  authorConcentration,
  countCandidates,
  deviantLine,
  factNotes,
  heldSummary,
  induceClusters,
  induceRoles,
  mine,
  roleLift,
  skipLineNote,
  topDeviants,
  voice,
} from './mine.mjs';
import {
  ambientLines,
  buildObligationTable,
  certifyObligationRules,
  classEventsOf,
  foldObligationFootprint,
} from './obligations.mjs';
import { bindingFor, parseFile, tokenize, walkFiles } from './parse.mjs';
import {
  addModuleScopes,
  buildVocab,
  extractTree,
  findPackageRoots,
  groupPartitions,
  hydrateScope,
  lexDomain,
  mdlCuts,
  normalizeCR,
  partitionFor,
  serializeScope,
} from './partition.mjs';
import { extractScopes } from './scopes.mjs';
import { mineTemplates, profileOf, sigCounts, twinsOf } from './superposition.mjs';
import {
  ANON_SCOPE_KINDS,
  deviationPhrase,
  readCargoCrateName,
  scopeBacktick,
  scopeNamed,
  shapeWords,
  unitOf,
  verbalize,
} from './verbalize.mjs';
import { calibrate, heritageKindOf, mkWeightFn, rejectedValues, trendsFor } from './weights.mjs';

// ===== LEARN: current tree + history → model =====
export async function learn({
  root,
  H,
  seeds = [],
  boundaries = [],
  waivers = [],
  log = () => {},
  tree = null,
  treeCache = null,
}) {
  const t0 = Date.now();
  // `tree` (from history.mjs headTree) = the files and contents of HEAD: the norm is the accepted past, so an uncommitted edit,
  // an untracked file or a half-written class never feeds it. Without git the worktree is all there is.
  const files = tree ? tree.files : [...walkFiles(root, root)].sort();
  const keyOf = rel => (tree && tree.sha ? tree.sha(rel) + '|' + rel : null);
  const cached = treeCache && tree && tree.sha ? rel => treeCache[keyOf(rel)] || null : null;
  const relFacts = {};
  const all = await extractTree(
    root,
    files,
    (i, n, reused) =>
      log(
        reused === undefined
          ? `  parsed ${i}/${n}`
          : `extracted ${files.length} files${tree ? ' (HEAD tree)' : ' (worktree — no git)'}: ${reused} from cache, ${i} parsed`
      ),
    tree ? tree.read : null,
    cached,
    relFacts
  );
  const fileScopes = new Map();
  for (const s of all) {
    const k = keyOf(s.rel);
    if (k && s.name !== '<anon>') (fileScopes.get(k) || fileScopes.set(k, []).get(k)).push(serializeScope(s));
  }
  const keyRel = new Map();
  for (const rel of files) {
    const k = keyOf(rel);
    if (k) keyRel.set(k, rel);
  }
  const treeCacheOut = Object.fromEntries(
    [...fileScopes]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, scs]) => [k, { s: scs, r: relFacts[keyRel.get(k)] ?? null }])
  ); // only current files — a rename or delete drops out
  addModuleScopes(all);
  // anonymous scopes (callbacks, lambdas) never carry a convention and dilute every cell they enter — measured: express
  // "methods" were mostly arrow callbacks; "methods here take 0 parameters — 85% of 163" on axum tests was closures
  for (let i = all.length - 1; i >= 0; i--) if (all[i].name === '<anon>') all.splice(i, 1);
  const rawScopes = all.map(serializeScope); // pre-vocabulary snapshot: lets spectrum skip re-parsing the tree
  const pkgs = findPackageRoots(root, tree ? tree.allPaths : null); // manifests: resolution + architecture, never the partition
  const cuts = mdlCuts(all);
  const merged = groupPartitions(all, cuts);
  const { wfn: baseW, ageFn: ageFnH, get: lcGet } = mkWeightFn(H);
  // Without history NOTHING is established (fail-closed, §9.4c degenerate case / §21.1): the prototype marked every instance
  // survived when it had no history, which inverted the gate. A history-less repository therefore yields groups and
  // placement but no spoken conventions — `status` says why.
  const ageFn = ageFnH || (() => 0);
  // the cost of deviating (§H3): is departing from an accepted convention CORRELATED with the scope later needing a
  // bugfix? One cell per accepted fact, K = 2 (`has_fix` : `no_fix`), the fact's deviants contrasted against the
  // fact's WHOLE observable population — conform ∪ deviants, a parent tally that contains the child's own counts,
  // exactly like mine()'s `_all:`, the archetype cell's `glob` and bridgeBits' base rate. Contrasting against the
  // conformers alone would be a different (and worse) estimator: kt(local)/kt(parent) is a real codelength saving
  // only when the parent is the code you would have used BEFORE splitting the subset out.
  // Observable = a HEAD scope with its OWN `H.lc` row (never mkWeightFn's file-level fallback: a sibling's repair
  // is not this scope's) that has lived at least `CFG.freshDays`. Both sides draw from that same window, so code
  // too young to have needed a fix cannot inflate either side.
  const fixOutcome = s => {
    if (!H) return null;
    const L = H.lc.get(skeyR(s.rel, s));
    return L && ageFn(s) >= CFG.freshDays ? (L.fix > 0 ? 'has_fix' : 'no_fix') : null;
  };
  const fixTally = vs => {
    const c = { has_fix: 0, no_fix: 0 };
    for (const v of vs) c[v]++;
    return c;
  };
  const devCostCand = []; // { ef, dv, all } per candidate fact — scored once the whole repo's candidate count is known
  const model = { engine: 'grain', repo: basename(root), pkgs, cuts, generatedAt: 0, partitions: [] };
  // heritageKind (§033): repo-wide, name → 'ext'/'impl', from every type-kind scope's own supKind (§extractScopes).
  // A name classified the SAME way everywhere it's the target of a heritage clause is trustworthy; one classified
  // BOTH ways (a class and an interface sharing a name in different files — rare, but not impossible) is not, and
  // is dropped rather than guessed. A name never classified at all (C#, Kotlin, Rust, Go, Python — see
  // extendsClauseRe/implementsClauseRe) is simply absent, and verbalize/deviationPhrase fall back to "extends".
  const heritageKind = {};
  {
    const ambiguous = new Set();
    for (const s of all) {
      if (s.kind !== 'type' || !s.supKind) continue;
      for (const [nm, k] of Object.entries(s.supKind)) {
        if (ambiguous.has(nm)) continue;
        if (!(nm in heritageKind)) heritageKind[nm] = k;
        else if (heritageKind[nm] !== k) {
          delete heritageKind[nm];
          ambiguous.add(nm);
        }
      }
    }
  }
  model.heritageKind = heritageKind;
  let agentShareNum = 0,
    agentShareDen = 0;
  // pass 1: vocabularies, roles and the repo-wide candidate count; pass 2: mining with one shared index cost
  const prepared = [];
  let Crepo = 0;
  for (const [pname, ps] of merged) prepared.push({ pname, ps, vocab: buildVocab(ps) });
  // lexical style is a property of the package, not of the source/tests/examples split (one editor config, one linter): the
  // lexical domain and the lexical facts are computed over every file of the package, then held by each of its partitions
  const pkgOf = pname => pname.replace(/#.*$/, '');
  const pkgFiles = new Map();
  for (const { pname, ps } of prepared) {
    const k = pkgOf(pname);
    (pkgFiles.get(k) || pkgFiles.set(k, []).get(k)).push(...ps.filter(s => s.kind === 'file'));
  }
  const pkgLex = new Map();
  for (const [k, fs2] of pkgFiles) pkgLex.set(k, lexDomain(fs2));
  for (const pr of prepared) {
    pr.vocab.LEX = pkgLex.get(pkgOf(pr.pname)) || {};
    for (const s of pr.ps) {
      applyVocab(s, pr.vocab);
      // birth-file status (§13.3 lifecycle): whether a scope's first commit also added its FILE (a new file) or landed
      // in one already tracked (an existing file, e.g. a shared registry) — file/module-kind scopes excluded, since a
      // file's own birth trivially always coincides with its file's birth (the predicate would be tautologically 'new')
      if (s.kind !== 'file' && s.kind !== 'module') {
        const L = lcGet(s);
        if (L && L.newFile !== undefined) s.preds['auto.filebirth'] = L.newFile ? 'new' : 'existing';
      }
    }
    pr.ri = induceRoles(pr.ps);
    Crepo += countCandidates(pr.ps, pr.ri);
  }
  const idxCost = Math.ceil(Math.log2(Math.max(Crepo, 2)));
  model.candidateCountLog2 = idxCost;
  // package-wide lexical facts: file scopes of the whole package, lexical surfaces only, no roles — a 7-file source tree
  // cannot pay the index cost alone for "single quotes — 7 of 7", the 141 files of the package can (measured on express)
  const pkgLexFacts = new Map();
  for (const [k, fs2] of pkgFiles) {
    if (fs2.length < CFG.minRaw) continue;
    const clones = fs2.map(s => ({
      ...s,
      preds: Object.fromEntries(Object.entries(s.preds).filter(([pid]) => pid.startsWith('auto.lex:'))),
    }));
    const { facts } = mine(clones, { assign: new Map(), amb: new Set() }, baseW, [], ageFn, null, {
      idxCostOverride: idxCost,
    });
    pkgLexFacts.set(k, { facts, ps: clones });
  }
  for (const { pname, ps, vocab, ri } of prepared) {
    const { facts, C } = mine(ps, ri, baseW, seeds, ageFn, process.env.GRAIN_DBG, {
      idxCostOverride: idxCost,
    });
    if (H)
      for (const s of ps) {
        const L = lcGet(s);
        if (!L || s.kind === 'file' || s.kind === 'module') continue;
        if ((H.NOW - L.first) / 86400 <= CFG.survDays) {
          agentShareDen += baseW(s);
          if (L.agentLast) agentShareNum += baseW(s);
        }
      }
    const lifts = roleLift(ps, ri, facts);
    const assignments = {};
    [...ri.assign]
      .sort((a, b) => a[0] - b[0])
      .forEach(([i, r]) => {
        const s = ps[i];
        assignments[skeyR(s.rel, s)] = ri.amb.has(i) ? -1 : r;
      });
    const ym2 = ts => new Date(ts * 1000).toISOString().slice(0, 7);
    // canonical exemplar (J5.3): how often each scope stands accused as a DEVIANT elsewhere in this same partition
    // — counted once over the RAW facts (their untruncated `deviants`), before `topDeviants` cuts them to 5 for
    // export and before this partition's own `exportFacts` exists to read it back from
    const deviantOnOther = new Map();
    for (const f2 of facts)
      for (const d of f2.deviants) deviantOnOther.set(d.gi, (deviantOnOther.get(d.gi) || 0) + 1);
    const exportFacts = facts
      .sort((a, b) => b.bpi - a.bpi || (a.cid < b.cid ? -1 : a.cid > b.cid ? 1 : a.pid < b.pid ? -1 : 1))
      .map(f => {
        const unamb = f.conform.filter(gi => !ri.amb.has(gi));
        const pool = unamb.length ? unamb : f.conform;
        // rank the exemplar pool by (1) never a deviant elsewhere, (2) never rewritten right after birth, (3) a
        // human's last touch, (4) firstborn, (5) freshest touch (tiebreak only) — DIRECT `H.lc` lookup, never
        // `mkWeightFn`'s file-level fallback (a sibling's history is not this scope's, the same trap J5.1 avoided).
        // A scope with no row of its own sorts worst on every key — the accepted, honest residual: with no history
        // of its own, "was it firstborn" has no answer here, so it never outranks a scope that does.
        let exs, why;
        if (H) {
          const ranked = pool
            .map(gi => {
              const s = ps[gi];
              const L = H.lc.get(skeyR(s.rel, s));
              return {
                gi,
                L,
                dev: deviantOnOther.get(gi) || 0,
                churnR: L ? (L.churn === false ? 0 : 1) : 1,
                agentR: L ? (L.agentLast ? 1 : 0) : 1,
                firstR: L ? L.first : Infinity,
                lastR: L ? -L.last : Infinity,
              };
            })
            .sort(
              (a, b) =>
                a.dev - b.dev ||
                a.churnR - b.churnR ||
                a.agentR - b.agentR ||
                a.firstR - b.firstR ||
                a.lastR - b.lastR
            );
          exs = ranked.slice(0, 3).map(r => r.gi);
          const top = ranked[0];
          // only when the winner clears every criterion CLEANLY — never merely because it happened to sort first
          if (top && top.L && top.dev === 0 && top.churnR === 0 && top.agentR === 0)
            why = `started this pattern (${ym2(top.L.first)}), was never rewritten right after it landed, human-authored`;
        } else exs = pool.slice(0, 3);
        // per-fact share of established conformers held by agent-authored code (H9): direct `H.lc` lookup, same
        // discipline as the exemplar ranking above — a scope with no row contributes to neither side
        let agentShare;
        if (H) {
          let num = 0,
            den = 0;
          for (const gi of f.conform) {
            const s = ps[gi];
            const L = H.lc.get(skeyR(s.rel, s));
            if (!L) continue;
            den++;
            if (L.agentLast && (H.NOW - L.first) / 86400 <= CFG.survDays) num++;
          }
          if (den >= CFG.minRaw && num / den >= 2 / 3) agentShare = +(num / den).toFixed(2);
        }
        const trend = H ? trendsFor(f, ps, H) : null;
        const calib = H ? calibrate(f, ps, H) : { available: false, reason: 'no history' };
        const rejected = H ? rejectedValues(f, ps, H) : undefined;
        const ef = {
          cid: f.cid,
          kind: f.kind,
          pid: f.pid,
          exp: f.exp,
          parentExp: f.parentExp,
          counts: f.counts,
          srawCounts: f.srawCounts,
          alphabet: f.alphabet,
          raw: f.raw,
          sraw: f.sraw,
          share: +f.srawShare.toFixed(3),
          bpi: +f.bpi.toFixed(2),
          tau: calib.available ? calib.tauC : f.tau,
          // §033: 'ext'/'impl'/undefined, read by verbalize/deviationPhrase off the fact object itself — never a
          // threaded render-time parameter, so every helper that only ever saw `f` (factNotes, deviantLine, the
          // rejected-values line) keeps working unchanged and still gets it right.
          heritageKind: heritageKindOf(f.pid, model),
          nSurfaces: f.nSurfaces,
          siblings: (f.siblings || []).map(sb => ({ ...sb, heritageKind: heritageKindOf(sb.pid, model) })),
          trend: trend && trend.shares.length ? trend : undefined,
          calib,
          rejected,
          suppressedValue: f.contested ? f.contested.v : trend ? trend.nucleating : null,
          denyEligible: !!(calib.available && calib.denyEligible),
          seeded: f.seeded && f.seeded.length ? f.seeded : undefined,
          contested: f.contested ? f.contested.id : undefined,
          exemplars: exs.map((gi, idx) => {
            const e = {
              rel: ps[gi].rel,
              line: ps[gi].line,
              endLine: ps[gi].endLine || ps[gi].line,
              name: ps[gi].name,
            };
            if (idx === 0 && why) e.why = why;
            return e;
          }),
          deviantsN: Math.max(0, Math.round(f.sraw * (1 - f.srawShare))), // same population as the printed share — raw-only young deviants still ride in `deviants` for check

          deviants: topDeviants(f, ps),
          held: H ? heldSummary(f, ps, H) : null,
          altMarker: altMarkerFor(f, ps),
          authorConc: H ? authorConcentration(f, ps, H) : null,
          agentShare,
          C,
        };
        // the deviation cell's own floors, over the RAW deviants (`f.deviants`, never the exported top-5 slice): the
        // deviant side must be an observable population, and so must the population it is contrasted with
        const dv = f.deviants.map(d => fixOutcome(ps[d.gi])).filter(Boolean);
        const all = f.conform
          .concat(f.deviants.map(d => d.gi))
          .map(gi => fixOutcome(ps[gi]))
          .filter(Boolean);
        if (dv.length >= CFG.minRaw && all.length >= CFG.minRaw) devCostCand.push({ ef, dv, all });
        return ef;
      });
    const pl = pkgLexFacts.get(pkgOf(pname));
    if (pl)
      for (const f of pl.facts) {
        if (exportFacts.some(g => g.cid === f.cid && g.pid === f.pid)) continue;
        const own = new Set(ps.filter(s => s.kind === 'file').map(s => s.rel)); // exemplars from this partition first — a lib file is shown lib files, not tests
        const exs = [...f.conform]
          .sort((a, b) => (own.has(pl.ps[b].rel) ? 1 : 0) - (own.has(pl.ps[a].rel) ? 1 : 0) || a - b)
          .slice(0, 3);
        exportFacts.push({
          cid: f.cid,
          kind: f.kind,
          pid: f.pid,
          exp: f.exp,
          parentExp: f.parentExp,
          counts: f.counts,
          srawCounts: f.srawCounts,
          alphabet: f.alphabet,
          raw: f.raw,
          sraw: f.sraw,
          share: +f.srawShare.toFixed(3),
          bpi: +f.bpi.toFixed(2),
          tau: f.tau,
          nSurfaces: f.nSurfaces,
          siblings: f.siblings,
          trend: undefined,
          calib: { available: false, reason: 'lexical' },
          suppressedValue: null,
          denyEligible: false,
          exemplars: exs.map(gi => ({
            rel: pl.ps[gi].rel,
            line: pl.ps[gi].line,
            endLine: pl.ps[gi].endLine || pl.ps[gi].line,
            name: pl.ps[gi].name,
          })),
          deviantsN: Math.max(0, Math.round(f.sraw * (1 - f.srawShare))),
          deviants: topDeviants(f, pl.ps),
          held: H ? heldSummary(f, pl.ps, H) : null,
          pkgWide: true,
          C,
        });
      }
    // markers: every decorator / supertype / declared return type with ≥ 3 carriers → where it lives and who carries it
    const markers = {};
    for (const s of ps) {
      if (s.kind === 'file' || s.kind === 'module') continue;
      for (const [pre, xs] of [
        ['deco', s.decos],
        ['sup', s.kind === 'type' ? s.sup : []],
        ['ret', s.rets || []],
      ])
        for (const x of xs) (markers[pre + ':' + x] ||= []).push(skeyR(s.rel, s));
    }
    const scopesInFile = new Map();
    for (const s of ps) {
      if (s.kind === 'file' || s.kind === 'module') continue;
      scopesInFile.set(s.rel, (scopesInFile.get(s.rel) || 0) + 1);
    }
    for (const k of Object.keys(markers)) {
      if (markers[k].length < 3) {
        delete markers[k];
        continue;
      }
      const dc = new Map();
      for (const key of markers[k]) {
        const d = dirname(key.split('#')[0]);
        dc.set(d, (dc.get(d) || 0) + 1);
      }
      // dominant directory first; within it the most FOCUSED file (fewest scopes) — a 16 KB god-file is a worse thing to copy
      markers[k] = markers[k]
        .sort(
          (a, b) =>
            dc.get(dirname(b.split('#')[0])) - dc.get(dirname(a.split('#')[0])) ||
            (scopesInFile.get(a.split('#')[0]) || 0) - (scopesInFile.get(b.split('#')[0]) || 0) ||
            (a < b ? -1 : a > b ? 1 : 0)
        )
        .slice(0, 60);
    }
    // superposition per role: the cluster IS the candidate generator; anti-unification folds it into one template
    // a template's history is the ARRIVAL PROCESS of its instances: when the first one landed, how many are young —
    // straight from the lifecycle rows, no re-extraction of old blobs
    const heldOf = ms2 => {
      if (!H) return null;
      const fs3 = ms2
        .map(lcGet)
        .filter(Boolean)
        .map(L => L.first);
      if (!fs3.length) return null;
      return { since: ym2(Math.min(...fs3)), fresh: fs3.filter(f => (H.NOW - f) / 86400 <= 180).length };
    };
    const profiles = {};
    {
      const byRoleSk = new Map();
      [...ri.assign]
        .sort((a, b) => a[0] - b[0])
        .forEach(([i, r]) => {
          if (ri.amb.has(i)) return;
          const s = ps[i];
          if (s.kind === 'file' || s.kind === 'module' || !s.sk) return;
          (byRoleSk.get(r) || byRoleSk.set(r, []).get(r)).push(s);
        });
      for (const [r, arr] of byRoleSk) {
        if (arr.length < 4) continue;
        const pf = profileOf(arr.map(s => s.sk));
        if (pf) {
          pf.held = heldOf(arr);
          profiles[r] = pf;
        }
      }
    }
    const covered = new Set();
    [...ri.assign].forEach(([i]) => {
      if (!ri.amb.has(i)) covered.add(i);
    });
    const templates = mineTemplates(ps, covered);
    for (const t of templates) {
      t.held = heldOf(t._members);
      delete t._members;
    }
    const byKey = new Map();
    for (const s of ps) byKey.set(skeyR(s.rel, s), s);
    const markerObs = {};
    const markerImplied = {};
    for (const [mk, keys] of Object.entries(markers)) {
      const cs = keys.map(k => byKey.get(k)).filter(Boolean);
      const n = cs.length;
      if (n < 3) continue;
      markerImplied[mk] = [...new Set(cs.map(s2 => s2.rel))]; // carrier files — implications computed once the edges exist
      const obs = [];
      const maj = (items, render) => {
        const c = new Map();
        for (const x of items) if (x !== undefined) c.set(x, (c.get(x) || 0) + 1);
        const top2 = [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
        if (top2 && top2[1] >= Math.ceil((n * 2) / 3)) obs.push(render(top2[0], top2[1]));
      };
      maj(
        cs.map(s => (s.rets || [])[0]),
        (v, k) => `returns \`${v}\` (${k}/${n})`
      );
      maj(
        cs.map(s => s.preds['auto.nameshape']),
        (v, k) => {
          const w = shapeWords(v);
          return `named ${w || 'like `' + v + '`'} (\`${cs[0].name}\`) (${k}/${n})`;
        }
      );
      const own = mk.slice(mk.indexOf(':') + 1);
      const dc = new Map();
      for (const s2 of cs) for (const d of s2.decos) if (d !== own) dc.set(d, (dc.get(d) || 0) + 1);
      for (const [d, k] of [...dc].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 2))
        if (k >= Math.ceil((n * 2) / 3)) obs.push(`also ${decoLabel(d, cs[0].g)} (${k}/${n})`);
      const cc = new Map();
      for (const s2 of cs) for (const c2 of s2.calls) cc.set(c2, (cc.get(c2) || 0) + 1);
      for (const [c2, k] of [...cc].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3))
        if (k >= Math.ceil((n * 2) / 3)) obs.push(`call \`${c2}\` (${k}/${n})`);
      if (obs.length) markerObs[mk] = obs.slice(0, 5);
    }
    const fileScopes = {};
    for (const s of ps) {
      if (s.kind === 'file' || s.kind === 'module') continue;
      (fileScopes[s.rel] ||= []).push([s.kind, s.name, s.line, s.endLine || s.line]);
    }
    const fileDocs = {};
    for (const s of ps) {
      if (!s.doc || !s.doc.length) continue;
      const d = (fileDocs[s.rel] ||= new Set());
      for (const t of s.doc) if (d.size < 80) d.add(t);
    }
    const fileSups = {};
    for (const s of ps) {
      if (s.kind === 'module' || !s.sup.length) continue;
      const d = (fileSups[s.rel] ||= new Set());
      for (const x of s.sup) if (d.size < 12) d.add(x);
    } // file-kind sups are macro-emitted definitions; markers still skip files
    for (const rel of Object.keys(fileSups)) fileSups[rel] = [...fileSups[rel]].sort();
    // fileSups' own sibling (§032): a file's declared parameter/return TYPE HINTS, not its heritage. `fileSups`
    // alone answers "which files `implements`/`extends` type X" but has nothing for a type used only as a type
    // hint (e.g. a psr/http-message interface that is never locally `implements`-ed, only accepted/returned) —
    // exactly `whatCmd`'s external-type undercount (measured on Slim: `ResponseInterface` has 0 heritage sites
    // but 40+ real usages, every one of them a parameter or return type hint).
    // Same per-file, threshold-free shape as `fileSups` — no ≥3-carrier gate the way `markers` has, so a single
    // real reference still counts. File-kind/module pseudo-scopes never carry `rets`/`ptypes` (only real
    // method/type scopes do — see extractScopes), so no extra kind filter is needed beyond `fileSups`'s own.
    const fileTypeRefs = {};
    for (const s of ps) {
      if (s.kind === 'module') continue;
      const refs = [...(s.rets || []), ...(s.ptypes || [])];
      if (!refs.length) continue;
      const d = (fileTypeRefs[s.rel] ||= new Set());
      for (const x of refs) if (d.size < 24) d.add(x);
    }
    for (const rel of Object.keys(fileTypeRefs)) fileTypeRefs[rel] = [...fileTypeRefs[rel]].sort();
    for (const rel of Object.keys(fileDocs)) fileDocs[rel] = [...fileDocs[rel]].sort();
    // fileScopes caps at 200 scopes/file so the model stays a bounded, diffable summary rather than a second
    // copy of tree.json (§099) — memory over completeness, kept. But a capped list alone cannot tell "this file
    // has exactly 200 scopes" from "this file was truncated at 200", which is exactly the ambiguity that made a
    // consumer ranking files by size (the `too-much` instrument) silently under-report core.mjs's own 326 as
    // 200. fileScopesTotal repairs that additively and sparsely: only a file whose list was actually truncated
    // gets an entry, so a `for (rel in fileScopesTotal)` on any partition IS the set of truncated files, and
    // `fileScopesTotal[rel] - fileScopes[rel].length` is "truncated by N" for it. Every other file's true count
    // is just `fileScopes[rel].length` — sparse costs the model nothing extra there and needs no separate
    // "is this file truncated" flag.
    const fileScopesTotal = {};
    for (const rel of Object.keys(fileScopes)) {
      const trueCount = fileScopes[rel].length;
      fileScopes[rel] = fileScopes[rel].sort((a, b) => a[2] - b[2]).slice(0, 200);
      if (trueCount > 200) fileScopesTotal[rel] = trueCount;
    }
    model.partitions.push({
      name: pname,
      scopes: ps.length,
      files: [...new Set(ps.filter(s => s.kind === 'file').map(s => s.rel))].sort(),
      fileScopes,
      fileScopesTotal,
      fileDocs,
      fileSups,
      fileTypeRefs,
      vocab,
      assignments,
      roleLift: lifts,
      markers,
      markerObs,
      markerImplied,
      medoids: ri.medoids.map(m => ({ feats: m.feats, label: m.label })),
      profiles,
      templates,
      facts: exportFacts,
    });
  }
  // one index cost for the whole repository, over the candidate pairs that actually exist — counted once across every
  // partition, never per partition (§9.4a), the same discipline mine()'s own `idxCost` and the archetype cell keep.
  {
    const KD = 2;
    const idxCostD = Math.ceil(Math.log2(Math.max(devCostCand.length, 2)));
    for (const { ef, dv, all } of devCostCand) {
      const neff = dv.length,
        N = all.length;
      if (neff < CFG.minEff) continue;
      const local = fixTally(dv),
        glob = fixTally(all);
      let data = 0;
      for (const v of ['has_fix', 'no_fix']) {
        const nv = local[v];
        if (nv) data += nv * Math.log2(kt(local, KD, v, neff) / kt(glob, KD, v, N));
      }
      const bits = data - 0.5 * (KD - 1) * Math.log2(Math.max(neff, 2)) - idxCostD;
      if (bits <= 0) continue;
      if (!(local.has_fix / neff > glob.has_fix / N)) continue; // an excess, never a deficit: deviants that need FEWER repairs are not a cost
      // mine()'s own loss bound, applied to `has_fix` specifically: telling a maintainer that leaving a deviation will
      // cost a repair is a claim about the next deviant, and it may be wrong at most 1 time in λ. It already implies a
      // majority, so no separate vacuity test is needed. It is also why this speaks only for near-unanimous deviant
      // populations (5 of 5, 11 of 12) — "9 of 12" is real evidence and still not worth a maintainer's trust.
      if (!((local.has_fix + 0.5) / (neff + KD / 2) >= 1 - 1 / CFG.lambda)) continue;
      ef.cost = { k: local.has_fix, n: neff, baseK: glob.has_fix, baseN: N, bits: +bits.toFixed(2) };
    }
  }
  // steers: every seed, resolved against the current tree — the exemplar's line, each seeded surface with its value and the
  // measured share of that value in the exemplar's partition today (decided vs practiced, side by side)
  model.steers = (seeds || []).map(sd => {
    let found = null,
      pname = null;
    for (const pr of prepared) {
      const s = pr.ps.find(x => x.rel === sd.path && x.name === sd.name);
      if (s) {
        found = s;
        pname = pr.pname;
        break;
      }
    }
    // practiced-by is measured in the exemplar's most specific context that has a population: its group, else its deepest
    // directory holding ≥ dirMin scopes of its kind, else the partition — the same locality `check` would judge it by
    const resolveSurface = pid => {
      if (!found || found.preds[pid] === undefined)
        return { pid, value: null, share: null, n: 0, context: null };
      // marker surfaces (decorator / supertype / return type) get a same-denominator comparison: the carriers of this marker
      // against the carriers of its alternatives among the seed's other surfaces — "adopted by 11 of 241 (route 230)" reads,
      // "1% of 1010 methods" reads as noise (measured: the judge called the old framing the feature's worst wording problem)
      const v = found.preds[pid];
      const pr = prepared.find(p => p.pname === pname);
      const gi = pr.ps.indexOf(found);
      const role = pr.ri.assign.get(gi);
      const segs = found.rel.split('/').slice(0, -1);
      const dirs = [];
      for (let k = segs.length; k >= 1; k--) dirs.push(segs.slice(0, k).join('/'));
      const ctxs = [];
      if (role !== undefined && !pr.ri.amb.has(gi))
        ctxs.push({
          label: `group «${pr.ri.medoids[role]?.label || 'group'}»`,
          has: (s, i) => pr.ri.assign.get(i) === role,
        });
      for (const d of dirs) ctxs.push({ label: d + '/', has: s => s.rel.startsWith(d + '/') });
      ctxs.push({ label: scopeLabel(pname), has: () => true });
      const mk = pid.match(/^auto\.(deco|extends|returns):@?(.+)$/);
      let rivals = null;
      if (mk) {
        const pre = { deco: 'decos', extends: 'sup', returns: 'rets' }[mk[1]];
        const nameOf = x => x.replace(/^\[|\]$/g, '');
        const carrierN = x =>
          pr.ps.filter(s2 => s2.kind === found.kind && (s2[pre] || []).includes(nameOf(x))).length;
        const others = sd.pids
          .filter(q => q !== pid)
          .map(q => q.match(/^auto\.(deco|extends|returns):@?(.+)$/))
          .filter(m2 => m2 && m2[1] === mk[1]);
        if (others.length)
          rivals = { own: carrierN(mk[2]), alts: others.map(m2 => ({ name: m2[2], n: carrierN(m2[2]) })) };
      }
      for (const c of ctxs) {
        let n = 0,
          k = 0;
        pr.ps.forEach((s, i) => {
          if (s.kind !== found.kind || s.preds[pid] === undefined || !c.has(s, i)) return;
          n++;
          if (s.preds[pid] === v) k++;
        });
        if (n >= CFG.dirMin || c === ctxs[ctxs.length - 1])
          return {
            pid,
            value: v,
            retires: (sd.retired || []).includes(pid),
            rivals,
            share: n ? +(k / n).toFixed(2) : null,
            n,
            context: c.label,
          };
      }
      return {
        pid,
        value: v,
        retires: (sd.retired || []).includes(pid),
        rivals,
        share: null,
        n: 0,
        context: null,
      };
    };
    // a stored `baseline` (captured by `grain seed add` at the moment the decision was recorded, on the FIRST seeded
    // surface only — see `baselineShare`) rides along on that one surface so `practicedBy`'s callers can show the delta
    // without a second pass over the model
    const surfaces = sd.pids.map(pid => {
      const sf = resolveSurface(pid);
      return pid === sd.pids[0] && sd.baseline ? { ...sf, baseline: sd.baseline } : sf;
    });
    const role = found
      ? (() => {
          const pr = prepared.find(p => p.pname === pname);
          const gi = pr.ps.indexOf(found);
          const r = pr.ri.assign.get(gi);
          return r !== undefined && !pr.ri.amb.has(gi) ? r : null;
        })()
      : null;
    return {
      id: sd.id,
      path: sd.path,
      name: sd.name,
      kind: found ? found.kind : null,
      line: found ? found.line : null,
      partition: pname,
      role,
      found: !!found,
      surfaces,
      weight: sd.weight,
      topic: sd.topic || '',
      note: sd.note || '',
      author: sd.author || '',
      createdAt: sd.createdAt || '',
    };
  });
  // cross-cell contested marking: any accepted fact asserting a value a seed's exemplar contradicts is superseded — its
  // deviations toward the seeded value stand down and its renderings say so (the old rule must not argue with the decision)
  for (const part2 of model.partitions)
    for (const f of part2.facts)
      for (const sd of seeds || []) {
        if (!sd.pids.includes(f.pid) || f.contested || (f.seeded || []).includes(sd.id)) continue;
        const st2 = model.steers ? null : null; // steers not built yet — read the exemplar's value from its partition scopes
        const pr2 = prepared.find(pr => pr.ps.some(x => x.rel === sd.path && x.name === sd.name));
        if (!pr2) continue;
        const ex2 = pr2.ps.find(x => x.rel === sd.path && x.name === sd.name);
        const v2 = ex2 ? ex2.preds[f.pid] : undefined;
        if (v2 !== undefined && v2 !== f.exp) {
          f.contested = sd.id;
          f.suppressedValue = v2;
        }
      }
  // the relation layer: file→file edges bound by the tri-state resolver, and their module-level aggregation — the measured
  // architecture (which modules exist, who depends on whom, where the cycles are)
  try {
    const fileSet2 = new Set(files);
    // workspace members: each is discovered from ITS OWN manifest, never a hardcoded name ("kod to kod") — an npm
    // package (name + resolvable entry file) and/or a Cargo crate (name + src/ dir) can both live at the same `d`,
    // so a directory contributes 0, 1 or 2 entries. §017: the Cargo half feeds the Rust branch of wsResolverFor's
    // cross-crate `use crate_name::...` resolution (relations.mjs) exactly the way the npm half already feeds its
    // bare-specifier branch — the same mechanism, not a new one.
    const workspaces = pkgs
      .filter(d => d !== '.')
      .flatMap(d => {
        const out = [];
        try {
          const pj = JSON.parse(readFileSync(join(root, d, 'package.json'), 'utf8'));
          if (pj.name) {
            const cand = [
              typeof pj.main === 'string' ? d + '/' + pj.main.replace(/^\.\//, '') : null,
              d + '/src/index.ts',
              d + '/src/index.tsx',
              d + '/src/index.js',
              d + '/index.ts',
              d + '/index.js',
              d + '/src/main.ts',
            ].filter(Boolean);
            const entry =
              cand.find(c => fileSet2.has(c)) ??
              cand.find(c => fileSet2.has(c.replace(/\.js$/, '.ts'))) ??
              null;
            if (entry) out.push({ name: pj.name, dir: d, entry });
          }
        } catch {
          /* no package.json at d — fine, it may still be a Cargo crate below */
        }
        try {
          const name = readCargoCrateName(readFileSync(join(root, d, 'Cargo.toml'), 'utf8'));
          if (name) out.push({ name, dir: d, srcDir: d + '/src' });
        } catch {
          /* no Cargo.toml at d */
        }
        return out;
      });
    // tsconfig/jsconfig path aliases (`@/*` → `src/*`): read every config in the tree (extends followed, JSONC
    // tolerated), targets pre-resolved to root-relative — the resolver, and `check` from the model, never re-read them
    const tsAliases = [];
    try {
      const cfgDirs = new Map(); // dir → config name; tsconfig.json wins over a sibling jsconfig.json
      const addCfg = (dd, name) => {
        if (name === 'tsconfig.json' || !cfgDirs.has(dd)) cfgDirs.set(dd, name);
      };
      if (tree && tree.allPaths) {
        for (const rel2 of tree.allPaths) {
          const bn2 = basename(rel2);
          if ((bn2 === 'tsconfig.json' || bn2 === 'jsconfig.json') && !HARD_EXCL.test(rel2))
            addCfg(dirname(rel2), bn2);
        }
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
            else if (e.name === 'tsconfig.json' || e.name === 'jsconfig.json')
              addCfg(toPosix(relative(root, d)) || '.', e.name);
          }
        })(root);
      const readCfg = (cfgRel, depth) => {
        if (depth > 3) return null;
        let j;
        try {
          j = parseJsonc(readFileSync(join(root, cfgRel), 'utf8'));
        } catch {
          return null;
        }
        const dir = dirname(cfgRel);
        const norm = q => pnormalize(pjoin(dir, q)).replace(/\/+$/, '') || '.';
        const parent =
          typeof j.extends === 'string' && j.extends.startsWith('.') // a package-name extends stays external
            ? readCfg(norm(/\.json$/.test(j.extends) ? j.extends : j.extends + '.json'), depth + 1)
            : null;
        const co = j.compilerOptions || {};
        const base = co.baseUrl !== undefined ? norm(co.baseUrl) : (parent?.base ?? null);
        const tbase = co.baseUrl !== undefined ? norm(co.baseUrl) : dir; // targets: relative to the DECLARING config's baseUrl, else its dir (tsc ≥4.4)
        const patterns = co.paths
          ? Object.entries(co.paths).map(([pat, ts2]) => [
              pat,
              (Array.isArray(ts2) ? ts2 : [ts2]).map(t => pnormalize(pjoin(tbase, t))),
            ])
          : (parent?.patterns ?? null); // child `paths` REPLACES the parent's wholesale, as tsc merges
        return { base, patterns };
      };
      for (const [dd, name] of [...cfgDirs].sort()) {
        if (tsAliases.length >= 200) break;
        const c = readCfg(dd === '.' ? name : dd + '/' + name, 0);
        if (c && ((c.patterns && c.patterns.length) || c.base != null))
          tsAliases.push({ dir: dd, base: c.base, patterns: c.patterns || [] });
      }
    } catch {
      /* aliases are an extra channel, never a reason to fail the pass */
    }
    // issue 059: PHP monorepos (Symfony's src/Symfony/Component/Xxx/, one composer.json per component) declare
    // PSR-4 autoload PER COMPONENT — there is no single repo-root composer.json a `use` into a sibling component
    // could walk up to. Read every composer.json in the tree ONCE here (same allPaths/EXCL scan as tsconfig above)
    // and merge every prefix's base dirs into one repo-wide map; `phpAutoloadResolverFor` (relations.mjs) then
    // resolves a cross-component `use` against that union when the per-file (nearest-ancestor composer.json)
    // resolution above already came up empty.
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
    const edges = buildEdges({ root, files, relFacts, workspaces, pkgs, srcRoots, tsAliases, phpAutoload, stats: relStats });
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
    model.workspaces = workspaces;
    model.tsAliases = tsAliases;
    model.phpAutoload = phpAutoload;
    model.csGlobal = tableFrom(files, relFacts).csGlobal;
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
    model.moduleGraph = { nodes: [], edges: [], cycles: [] };
    model.relDecls = null;
    model.archNorms = [];
  }
  // implications per group: what a new member COMES WITH — a same-stem companion file (whatever dotted suffix the repo
  // pairs these files with: `*.test.tsx`, `*.stories.tsx`, `*.module.ts`), and the file that registers/imports the
  // members (DI registration, a barrel) — raw path + edge evidence, no name semantics
  {
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
  {
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
  // waivers (.grain/seeds.jsonl records with a `waiver` field): one scope excused from one surface, resolved against
  // the current tree exactly like a steer's exemplar (`found` = the scope still exists). DELIBERATELY render-time only:
  // unlike a steer, a waiver never reaches mine() or the weights, and never changes a count — `check` still governs the
  // scope by the convention and still counts it non-conforming; all a waiver changes is the VOICE that reports it.
  model.waivers = (waivers || []).map(wv => {
    let found = null,
      pname = null;
    for (const pr of prepared) {
      const s = pr.ps.find(x => x.rel === wv.path && x.name === wv.name);
      if (s) {
        found = s;
        pname = pr.pname;
        break;
      }
    }
    return {
      id: wv.id,
      path: wv.path,
      name: wv.name,
      pid: wv.pid,
      kind: found ? found.kind : null,
      line: found ? found.line : null,
      partition: pname,
      found: !!found,
      note: wv.note || '',
      author: wv.author || '',
      createdAt: wv.createdAt || '',
    };
  });
  // boundary decisions (.grain/seeds.jsonl records with a `boundary` field): resolved against the current tree
  model.boundaries = (boundaries || []).map(b => ({
    ...b,
    fromLive: files.some(f =>
      b.boundary.from === '.' ? !f.includes('/') : (f + '/').startsWith(b.boundary.from + '/')
    ),
    toLive: files.some(f => (f + '/').startsWith(b.boundary.to + '/')),
  }));
  model.agentShare = agentShareDen ? +(agentShareNum / agentShareDen).toFixed(2) : null;
  model.cochange = H
    ? [...H.cochange]
        .sort((a, b) => b.sup - a.sup || (a.a < b.a ? -1 : a.a > b.a ? 1 : a.b < b.b ? -1 : 1))
        .slice(0, 5000)
    : []; // cap by descending support
  // §074: the exact population `model.cochange`'s own `commitsA`/`commitsB` were drawn from (state.fileCommits,
  // history.mjs) — carried onto the model so `cochangeData` can test a co-change partner's OWN global rate
  // (commitsX / nonMegaCommits) against the same λ bound `certifyObligationRules`' ambient gate uses, without
  // re-deriving it from `H.fps` (which `buildObligationTable` does for a DIFFERENT reason — current-path-keying —
  // that does not apply here: cochange's commitsA/commitsB are already historical-path-keyed, so this must stay
  // historical-path-keyed too, or the two counts would disagree about what a "file" is).
  model.nonMegaCommits = H ? H.nonMegaCommits : 0;
  // scope-level co-change (§J5.7b): mirrors model.cochange above, but `a`/`b` are scope keys whose path half is a
  // HISTORICAL path (§J4.1) — remapped through currentPathOf ONCE here, at learn-time, because checkFile never
  // sees H (only the model, exactly like model.cochange/model.moves/model.msgAffinity).
  model.scopeCochange = [];
  if (H && H.scopeCochange && H.scopeCochange.length) {
    const liveScope = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
    const currentOfScope = currentPathOf(H.fps || [], liveScope);
    const remapScopeKey = k => {
      const i = k.indexOf('#');
      return i < 0 ? k : currentOfScope(k.slice(0, i)) + k.slice(i);
    };
    model.scopeCochange = H.scopeCochange
      .map(p => ({ ...p, a: remapScopeKey(p.a), b: remapScopeKey(p.b) }))
      .sort((a, b) => b.sup - a.sup || (a.a < b.a ? -1 : a.a > b.a ? 1 : a.b < b.b ? -1 : 1))
      .slice(0, 5000);
  }
  // the language bridge: what files this repo touches when a commit message says <token> — pruned to living files,
  // strongest tokens first; `where` cites it (with the example commit) for query words the code itself never says
  model.msgAffinity = [];
  if (H && H.msgAff) {
    const fset3 = new Set(files);
    // There is no df pre-filter (§J2.4b). Demoting a token for being common was backwards: for a pair carrying real
    // signal the data term grows LINEARLY in df while the penalty grows as 0.5·log2(df) — more commits saying the word
    // is more evidence, not less. What actually disqualifies a filler word is `k/df ≈ baza`, which is orthogonal to df
    // and already enforced below by the direction test and the λ bound.
    // A pair is a bridge only when coding the file's touched/not outcomes over the `df` commits that SAY the token —
    // at the KT-smoothed token-conditional rate — is CHEAPER than coding them at the file's own unconditional base
    // rate `fileCommits[f] / commitsN`, which needs no fitting. Same MDL/KT shape mine()/architectureNorms() decide
    // by. The `n >= 2` this replaces had no denominator: a file touched in most commits passed it for ANY token that
    // sat beside it twice, so the bridge repeated the file's base rate back as if it were a translation.
    // `baza` MUST be drawn from the same population as `fileCommits`/`msgTokCommits` — commits of 1..megaCap files.
    // `commitsN` counts every commit including mass ones, and dividing by it deflates every base rate by exactly the
    // mass-commit share, handing any token a free apparent excess that df then multiplies into hundreds of bits.
    const K3 = 2,
      nmc3 = H.nonMegaCommits || 1,
      fc3 = H.fileCommits || {};
    let universe3 = 0;
    for (const fm of Object.values(H.msgAff)) universe3 += Object.keys(fm).length; // counted ONCE repo-wide over the unfiltered candidates, as architectureNorms counts pairs.size
    const idxCost3 = Math.ceil(Math.log2(Math.max(universe3, 2)));
    const bridgeBits = (t, f, k) => {
      const df = (H.msgTokCommits || {})[t] || 0;
      if (!df) return null;
      const baza = (fc3[f] || 0) / nmc3;
      if (!(baza > 0 && baza < 1)) return null; // a never-touched or always-touched file has no rate to beat
      if (!(k / df > baza)) return null; // a bridge is EXCESS touching, never a deficit
      if (!((k + 0.5) / (df + K3 / 2) >= 1 - 1 / CFG.lambda)) return null; // the one loss constant, on the touched outcome specifically
      const counts = { touched: k, not: df - k };
      let data = 0;
      if (k) data += k * Math.log2(kt(counts, K3, 'touched', df) / baza);
      if (df - k) data += (df - k) * Math.log2(kt(counts, K3, 'not', df) / (1 - baza));
      const bits = data - 0.5 * (K3 - 1) * Math.log2(Math.max(df, 2)) - idxCost3;
      return bits > 0 ? bits : null;
    };
    const rows = Object.entries(H.msgAff)
      .map(([t, fm]) => {
        const fs3 = Object.entries(fm)
          .map(([f, n]) => {
            if (!fset3.has(f)) return null;
            const b = bridgeBits(t, f, n);
            return b === null ? null : [f, n, b];
          })
          .filter(Boolean)
          .sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : 1))
          .slice(0, 6); // strongest evidence first: bits, not raw co-occurrence count
        const tot = fs3.reduce((a2, [, n]) => a2 + n, 0);
        return tot >= 2 ? { t, files: fs3, ex: (H.msgAffEx || {})[t] || null } : null;
      })
      .filter(Boolean);
    model.msgAffinity = rows
      .sort(
        (a, b) =>
          b.files.reduce((x, [, n]) => x + n, 0) - a.files.reduce((x, [, n]) => x + n, 0) ||
          (a.t < b.t ? -1 : 1)
      )
      .slice(0, 1500);
  }
  // concepts (§J4.3b): the top repo-wide tokens where BOTH the commit messages and the code itself say something —
  // `H.msgTokCommits` (commit-message document frequency, §J2.4) times each token's card-level document frequency
  // (how many of buildCards(model)'s cards carry it). A token absent from either side scores 0 by construction, so
  // this is never a global dictionary, only genuinely shared vocabulary. Precomputed here (mirroring `model.moves`
  // just below) because `sessionContext` can neither load history (no refresh, no parsing — must stay instant) nor
  // afford `buildCards(model)` inside a hook that today does nothing but read a JSON file; this is the one place in
  // the codebase allowed to pay that cost, since it runs only at index/re-learn time, never per query.
  model.concepts = [];
  if (H) {
    const cardDf = new Map();
    for (const card of buildCards(model))
      for (const t of card.toks.keys()) cardDf.set(t, (cardDf.get(t) || 0) + 1);
    const msgTokCommits = H.msgTokCommits || {};
    const keys = new Set([...Object.keys(msgTokCommits), ...cardDf.keys()]);
    const scored = [];
    for (const t of keys) {
      const score = (msgTokCommits[t] || 0) * (cardDf.get(t) || 0);
      if (score > 0) scored.push([t, score]);
    }
    model.concepts = scored
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 12)
      .map(([t]) => t);
  }
  // placement-from-history (§J2.5): `placementHit` never sees `H` — `ensureFresh`'s warm-cache fast path returns
  // without ever calling `loadHistory`, so a small, compressed rename-affinity map is precomputed here instead and
  // carried ON the model. Same `sufOf`/`nameTokens` helpers `placementHit`'s own name-kin branch uses, so a
  // name-kin match and a move-match agree on what a "token" or "suffix" means.
  model.moves = {};
  if (H && H.fps) {
    for (const fp of H.fps)
      for (const [oldPath, newPath] of fp.renames || []) {
        const suf = sufOf(newPath);
        if (!suf) continue;
        const oldDir = dirname(oldPath),
          newDir = dirname(newPath);
        if (oldDir === newDir) continue; // a same-directory rename (pure name change) is not a MOVE
        for (const t of nameTokens(newPath)) {
          const key = suf + '#' + t;
          const m = (model.moves[key] ||= {});
          const pairKey = oldDir + '→' + newDir;
          m[pairKey] = (m[pairKey] || 0) + 1;
        }
      }
  }
  // change archetypes (§J4.1): the recurring SHAPES of past commits. A footprint's CELLS are the coarse, still-live
  // coordinates of what it touched — the refined module of each file, the role group of each scope it changed, the
  // file suffix — and `induceClusters` finds the combinations that recur. A cell is CERTIFIED for an archetype only
  // when coding its present/absent split at the archetype's own rate is cheaper than coding it at the whole
  // history's base rate: the same CONTRAST branch mine() uses for a role cell against `_all:` (core.mjs's `else`
  // arm), because an archetype is a sub-population of all footprints in exactly the way a role is of its partition.
  // A cell every commit in the repository touches carries no shape, however unanimous it is inside one archetype.
  model.changeArchetypes = [];
  if (H && H.fps && H.fps.length) {
    const refinedM =
      model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || [], model.srcRoots || []));
    const liveM = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
    const currentOf = currentPathOf(H.fps, liveM);
    // a scope renamed IN PLACE (its file kept) keeps its historical `#kind#name` half and simply fails to resolve
    // against today's assignments — an accepted residual miss, not something this pass tries to undo
    const cellsOf = fp => {
      const out = new Set();
      for (const f of fp.files) {
        const cur = currentOf(f);
        out.add('m:' + refinedM(cur));
        const sf = sufOf(cur);
        if (sf) out.add('k:' + sf);
      }
      for (const key of fp.scopes || []) {
        const i = key.indexOf('#');
        if (i < 0) continue;
        const k2 = currentOf(key.slice(0, i)) + key.slice(i);
        for (const p of model.partitions) {
          const r = p.assignments[k2];
          if (!Number.isInteger(r) || r === -1) continue;
          out.add('g:' + p.name + '#' + r);
          break;
        }
      }
      return out;
    };
    const fpCells = new Map();
    for (const fp of H.fps) fpCells.set(fp, cellsOf(fp));
    const cellGlobal = new Map();
    for (const [, cs] of fpCells) for (const c of cs) cellGlobal.set(c, (cellGlobal.get(c) || 0) + 1);
    const dfTok = new Map();
    for (const fp of H.fps) for (const t of fp.toks) dfTok.set(t, (dfTok.get(t) || 0) + 1);
    // the index cost, counted ONCE repo-wide over the REAL candidate population — the same shape mine() (`C` at its
    // own cell loop), architectureNorms and bridgeBits all count it in, never per cluster
    let C = 0;
    for (const [, g] of cellGlobal) if (g >= CFG.minRaw) C++;
    const idxCost = Math.ceil(Math.log2(Math.max(C, 2)));
    const N = H.fps.length,
      K = 2;
    // `induceClusters` samples at NCAP distinct footprint signatures: past that, an archetype's members are the
    // footprints in its surviving buckets and `n` counts exactly those — a real, enumerable set of commits, which
    // is what "k of n" claims. It is not a scaled-up estimate of a larger population.
    const { clusters } = induceClusters(H.fps, { feats: fp => fpCells.get(fp) });
    const archetypes = [];
    for (const c of clusters) {
      if (c.members.length < CFG.minRaw) continue;
      const n = c.members.length;
      const cnt = new Map();
      for (const fp of c.members) for (const cell of fpCells.get(fp)) cnt.set(cell, (cnt.get(cell) || 0) + 1);
      const cells = [];
      for (const [cell, k] of cnt) {
        const local = { present: k, absent: n - k };
        const gp = cellGlobal.get(cell) || 0;
        const glob = { present: gp, absent: N - gp };
        let data = 0;
        for (const v of ['present', 'absent']) {
          const nv = local[v];
          if (nv) data += nv * Math.log2(kt(local, K, v, n) / kt(glob, K, v, N));
        }
        const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(n, 2)) - idxCost;
        // evidence, then the one loss constant, then vacuity: a cell the MAJORITY of the shape's own members do not
        // touch describes what the shape avoids, and J4.2 would render it as a missing place to go add a file to
        const certified = bits > 0 && (k + 0.5) / (n + K / 2) >= 1 - 1 / CFG.lambda && k * 2 > n;
        cells.push({ cell, k, share: +(k / n).toFixed(3), bits: +bits.toFixed(2), certified });
      }
      cells.sort(archCellSort);
      const cert = cells.filter(x => x.certified);
      if (!cert.length) continue; // a shape with nothing certified is not a shape
      const tc = new Map();
      for (const fp of c.members) for (const t of fp.toks) tc.set(t, (tc.get(t) || 0) + 1);
      const toks = [...tc]
        .map(([t, k2]) => [t, k2 * Math.log2(1 + N / (dfTok.get(t) || 1))])
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 8)
        .map(([t]) => t);
      // `fps` carries only a commit's ≤12 normalized message tokens, never its subject — the same limitation
      // `howCmd` works around with a git lookback it cannot do here, and falls back to exactly this joined string
      const exemplars = [...c.members]
        .sort((a, b) => b.ts - a.ts || (a.sha < b.sha ? -1 : a.sha > b.sha ? 1 : 0))
        .slice(0, 3)
        .map(fp => [fp.sha, fp.toks.length ? fp.toks.join(' ') : '(no commit message)', fp.ts]);
      archetypes.push({
        label: cert
          .slice(0, 3)
          .map(x => archCellLabel(model, x.cell))
          .join(' + '),
        n,
        cells,
        exemplars,
        toks,
      });
    }
    archetypes.sort((a, b) => b.n - a.n || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    model.changeArchetypes = archetypes.map((a, i) => ({ id: 'ca' + (i + 1), ...a }));
  }
  // birth obligations (ticket 073): see `buildObligationTable` (above `induceClusters`) for the full derivation —
  // reuses the SAME `_archModOf`/liveness-set idioms `changeArchetypes` (just above) and `cochangeData`/`howCmd`
  // (ticket 066) already use, so a re-learn never computes a second, differently-scoped notion of "live".
  model.obligations =
    H && H.fps && H.fps.length
      ? buildObligationTable(H.fps, {
          refinedM: model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || [], model.srcRoots || [])),
          live: new Set([...(model.pathsAll || []), ...(model.filesAll || [])]),
        })
      : [];
  // value concordance (§J3.1): where each value lives, and which values are siblings inside one container. The
  // df window is a POPULATION gate on the index (CFG.valueDfMin/valueDfMaxShare), never an acceptance test — a
  // value in one file alone has no concordance, and one in a fifth of the repository is furniture.
  // `contFiles`: container -> file -> the member keys THIS FILE actually carries in THIS container. `vConts`
  // (container -> every key ever seen anywhere under it) is a UNION and stays for the "≥2 candidate members at
  // all" shortlist below, but the ACTUAL sibling/population math must never read from it directly (see below) —
  // that was the pre-existing bug this ticket fixes (§G/J7.3): a value counted as "carried" by a file if it
  // appeared ANYWHERE in that file, not inside THIS container.
  const vPlaces = new Map(),
    vConts = new Map(),
    vNames = new Map(),
    contFiles = new Map();
  for (const s of all) {
    if (s.kind !== 'file') continue;
    for (const e of s.vals || []) {
      const key = e.k + ':' + e.v;
      (vPlaces.get(key) || vPlaces.set(key, []).get(key)).push([s.rel, e.line]);
      (vConts.get(e.c) || vConts.set(e.c, new Set()).get(e.c)).add(key);
      if (e.cn && !vNames.has(e.c)) vNames.set(e.c, e.cn);
      const fm = contFiles.get(e.c) || contFiles.set(e.c, new Map()).get(e.c);
      (fm.get(s.rel) || fm.set(s.rel, new Set()).get(s.rel)).add(key);
    }
  }
  // extraction already deduped per (v, k) per file, so a place count IS a document frequency. The upper bound is
  // rounded UP: on a 17-file repository a fifth is 3.4 files, and a value in 3 of them still says something.
  const dfMax = Math.ceil(CFG.valueDfMaxShare * files.length);
  let vKept = [...vPlaces].filter(([, ps]) => ps.length >= CFG.valueDfMin && ps.length <= dfMax);
  if (vKept.length > VALUE_INDEX_CAP) {
    // the weakest evidence goes first: fewest places, ties by key
    vKept.sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
    log(
      `[learn] value index cap ${VALUE_INDEX_CAP}: dropped ${vKept.length - VALUE_INDEX_CAP} least-frequent value(s)`
    );
    vKept = vKept.slice(0, VALUE_INDEX_CAP);
  }
  model.valueIndex = Object.fromEntries(
    vKept
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([k, ps]) => [k, ps.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]))])
  );
  // a container speaks only through the members that survived the gate: one survivor leaves no sibling
  // relationship to report, and J3.2's "how many of this set appear here" is computable only over members the
  // index can actually locate. CORE, not UNION: a candidate member also needs a 2/3 supermajority of the files
  // that DECLARE this container (§J7.3) — the same threshold `t` below and markers already use (`groupKin` uses a
  // different, deliberately non-MDL 0.6 floor, not this one — see its own comment) — or
  // one file's one-off key (an i18n locale's own extra string, a monorepo package's bespoke script) inflates the
  // "sibling set" with something most carriers never had, which is exactly what produced the pre-existing
  // duplication bug (a UNION-keyed set that never matches any file's real membership certifies nothing true).
  model.valueSiblings = {};
  for (const [c, keys] of [...vConts].sort((a, b) => a[0] - b[0])) {
    if (keys.size < 2) continue;
    const fm = contFiles.get(c),
      declaring = fm.size,
      need = Math.ceil((declaring * 2) / 3);
    const surv = [...keys]
      .filter(k => {
        if (!Object.hasOwn(model.valueIndex, k)) return false;
        let carriers = 0;
        for (const memberSet of fm.values()) if (memberSet.has(k)) carriers++;
        return carriers >= need;
      })
      .sort();
    if (surv.length >= 2) model.valueSiblings[c] = surv;
  }
  model.valueContainer = {};
  for (const c of Object.keys(model.valueSiblings)) model.valueContainer[c] = vNames.get(+c) ?? null; // container ids are hashStr numbers; Object.keys hands them back as strings
  // value co-travel norms (§J3.2): certify "this container's members appear together" as a repo fact — the same
  // KT/BIC/idxCost cell shape as architectureNorms, against a FIXED 50/50 null rather than bridgeBits' fitted
  // baseline, because there is no natural per-file base rate for "carries the whole set". The residual files that
  // qualify for the population but are not complete carriers are then what a change can be measured against.
  // One candidate per CONTAINER, never per (container, member) or (container, file): widening the universe would
  // raise idxCost for nothing.
  const contIds = Object.keys(model.valueSiblings);
  const idxCostV = Math.ceil(Math.log2(Math.max(contIds.length, 2))); // ONCE, repo-wide, over every container before any minRaw/minEff/bits filtering — exactly as architectureNorms counts pairs.size
  const KV = 2;
  model.valueNorms = {};
  for (const c of contIds) {
    const sibs = model.valueSiblings[c],
      m = sibs.length;
    // file -> how many of this container's members it carries — read from `contFiles` (per-container, per-file
    // membership), NOT `model.valueIndex[k]`'s global place list: that list says the value exists SOMEWHERE in the
    // file, not inside THIS container, and credited a file for "carrying" a member it never actually had here.
    const h = new Map();
    for (const [rel, memberSet] of contFiles.get(+c)) {
      let n = 0;
      for (const k of sibs) if (memberSet.has(k)) n++;
      if (n) h.set(rel, n);
    } // container ids are hashStr numbers; `c` here comes from Object.keys(model.valueSiblings), always a string
    const t = Math.min(Math.ceil((m * 2) / 3), m - 1); // clamped: at t = m every qualifier is complete by construction and the cell asks nothing
    let neff = 0;
    const full = [],
      near = [];
    for (const [f, n] of h) {
      if (n < t) continue;
      neff++;
      if (n === m) full.push(f);
      else if (n === m - 1) near.push(f);
    }
    if (neff < CFG.minRaw || neff < CFG.minEff) continue;
    const counts = { present: full.length, missing: neff - full.length };
    let data = 0;
    for (const v of ['present', 'missing']) {
      const nv = counts[v];
      if (nv) data += nv * Math.log2(kt(counts, KV, v, neff) * 2);
    }
    const bits = data - 0.5 * (KV - 1) * Math.log2(Math.max(neff, 2)) - idxCostV;
    if (bits <= 0) continue; // evidence = codelength gain, nothing else
    if (counts.present <= counts.missing) continue; // direction test: "this set does NOT travel together" is a true fact but not a norm anything can be a residual of
    const ne = counts.present;
    if (!((ne + 0.5) / (neff + KV / 2) >= 1 - 1 / CFG.lambda)) continue; // the one loss constant, same posterior-predictive bound
    model.valueNorms[c] = {
      m,
      ne,
      neff,
      bits,
      full: full.sort().slice(0, VALUE_NORM_PLACES),
      near: near.sort().slice(0, VALUE_NORM_PLACES),
    };
  }
  model.historyStats = H ? { commits: H.stats.commits, events: H.stats.events, blobs: H.stats.blobs } : null; // parsed/cached/mb are run diagnostics, not repo facts — they would break byte-identity across cache states
  model.files = files.length;
  return { model, ms: Date.now() - t0, scopes: all.length, rawScopes, treeCacheOut };
}
// ===== CHECK (verdict for one file against the model; hermetic — same input ⇒ same answer, no session state) =====
// ===== PLACEMENT ON CREATE: a NEW file whose name-kin already live in one place — path evidence only, no parse.
// The replay trials' measured failure class: both arms filed admin e2e specs beside navigation specs while
// `admin-panel/` sat one directory over, and line-level checks were structurally silent. This speaks at creation,
// from the accepted tree alone, and never commands — deliberate placement is explicitly left alone.
// «endpoint» in the query, never in the code: the commits that SAY the word show which files they touch — a learned,
// per-repo, citable translation (never a global dictionary), consulted only for tokens no card carries
function bridgeLines(model, qt, df) {
  const out = [];
  for (const t of qt) {
    if (df.get(t)) continue;
    const row = (model.msgAffinity || []).find(r2 => normTok(r2.t) === t || r2.t === t);
    if (!row) continue;
    const tot = row.files.reduce((a, [, n]) => a + n, 0);
    out.push(
      voice(
        'example',
        `«${row.t}» appears in no code card here, but commits saying it touched: ${row.files
          .slice(0, 3)
          .map(([f, n]) => `\`${f}\` (${n})`)
          .join(' · ')}${row.ex ? ` — e.g. "${row.ex[1]}" (${row.ex[0]})` : ''}`,
        { sha: row.ex ? row.ex[0] : null }
      )
    );
    if (out.length >= 2) break;
  }
  return out;
}
export const QSTOP = new Set([
  'a',
  'an',
  'the',
  'to',
  'for',
  'of',
  'in',
  'on',
  'with',
  'and',
  'or',
  'my',
  'our',
  'this',
  'that',
  'it',
  'is',
  'are',
  'be',
  'do',
  'doe',
  'can',
  'should',
  'would',
  'i',
  'we',
  'you',
  'how',
  'what',
  'where',
  'when',
  'so',
  'via',
  'from',
  'into',
  'onto',
  'up',
  'out',
  'new',
  'some',
  'any',
  'all',
]);
const PL_STOP = new Set([
  'index',
  'main',
  'mod',
  'util',
  'utils',
  'helper',
  'helpers',
  'common',
  'shared',
  'core',
  'base',
  'type',
  'types',
  'test',
  'tests',
  'spec',
  'specs',
  'lib',
  'libs',
  'app',
  'apps',
  'src',
  'file',
  'files',
  'data',
  'component',
  'components',
  'page',
  'pages',
  'view',
  'views',
  'service',
  'services',
  'controller',
  'controllers',
  'module',
  'modules',
  'model',
  'models',
  'config',
  'get',
  'set',
  'add',
  'the',
  'does',
  'not',
  'non',
  'see',
  'sees',
  'has',
  'have',
  'had',
  'was',
  'will',
  'then',
  'than',
  'its',
  'each',
  'every',
  'before',
  'after',
  'between',
  'without',
  'within',
  'still',
  'also',
  'only',
  'their',
  'them',
  'they',
]);
// hoisted out of placementHit so the placement feedback loop (grain.mjs check-hook) can compute the SAME
// suffix/token key for a later write and correlate it against a pending suggestion — one function, not two copies
export function sufOf(f) {
  const ps2 = basename(f).split('.');
  return ps2.length >= 3 ? ps2.slice(-2).join('.').toLowerCase() : (ps2[1] || '').toLowerCase();
}
export function nameTokens(rel) {
  return [...new Set(tokenize(basename(rel).split('.')[0]))].filter(
    t => t.length >= 3 && !PL_STOP.has(t) && !QSTOP.has(t)
  );
}
export function placementHit(model, rel) {
  const files = model.pathsAll || model.filesAll || [];
  if (files.length < 20 || files.includes(rel)) return null;
  const suf = sufOf(rel);
  if (!suf) return null;
  const dir = dirname(rel);
  const cands = files.filter(f => sufOf(f) === suf);
  if (cands.length < 3) return null;
  const toks = nameTokens(rel);
  const hits = [];
  for (const t of toks) {
    // name-kin: same-suffix files carrying this token in their BASENAME; directory segments only
    // as a fallback when basenames are silent — a directory named after the token otherwise inflates T past the
    // too-generic gate and mutes exactly the strongest signal (measured: `admin` vanished behind admin-panel/'s own files)
    let T = cands.filter(f => tokenize(basename(f).split('.')[0]).includes(t));
    if (T.length < 2)
      T = cands.filter(f =>
        dirname(f)
          .split('/')
          .some(sg => tokenize(sg).includes(t))
      );
    if (T.length < 2 || T.length > cands.length * 0.5) continue; // absent, or too generic to place anything
    if (T.some(f => dirname(f) === dir)) continue; // the chosen directory DOES keep such files — nothing to say
    const byDir = new Map();
    for (const f of T) byDir.set(dirname(f), (byDir.get(dirname(f)) || 0) + 1);
    const [topDir, n] = [...byDir].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    if (topDir === dir || n < 2 || n / T.length < 2 / 3) continue;
    hits.push({ t, n, of: T.length, topDir, share: n / T.length });
  }
  hits.sort((a, b) => b.n - a.n || b.share - a.share || (a.t < b.t ? -1 : 1));
  if (hits.length) {
    const best = hits[0];
    // competing name-kin are ARBITRATED in one note, strongest count first — measured (replay-3): sequential
    // contradictory notes made the worker follow the weaker statistic and sunk-cost past the stronger one
    const alts = hits.slice(1, 3).filter(h => h.topDir !== best.topDir);
    const rivalBit = alts.length
      ? ` Weaker name-kin point elsewhere: ${alts.map(h => `\`${h.t}\` → \`${h.topDir}/\` (${h.n} of ${h.of})`).join(' · ')} — the leading count is the one to argue with.`
      : '';
    // §J2.5: files that historically MOVED out of `best.topDir` (a directory change, not a rename in place) —
    // when a supermajority landed on one target, that target is the placement the note itself should have led with
    let moveBit = '';
    const moveRow = (model.moves || {})[suf + '#' + best.t];
    if (moveRow) {
      const outOfTop = Object.entries(moveRow).filter(([pair]) => pair.split('→')[0] === best.topDir);
      const total = outOfTop.reduce((a, [, c]) => a + c, 0);
      const [topPair, tn] = outOfTop.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] || [];
      if (topPair && tn >= 2 && tn / total >= 2 / 3)
        moveBit = ` ${tn} of ${total} such files born here were later moved to \`${topPair.split('→')[1]}/\`.`;
    }
    return {
      kind: 'placement',
      token: best.t,
      dir: best.topDir,
      suf,
      text: `[grain] ${voice('practiced', `placement: \`*.${suf}\` files named like \`${best.t}\` live in \`${best.topDir}/\` — ${best.n} of ${best.of}; \`${dir}/\` holds none.${rivalBit} Deliberate placement is fine — but if you guessed, ask \`grain where ${best.t} ${suf.split('.')[0]}\` first.${moveBit}`)}`,
    };
  }
  if (cands.length >= 5) {
    // fallback: the suffix itself is kept in one subtree and this file is outside it
    const cnt = new Map();
    for (const f of cands) {
      const segs = dirname(f).split('/');
      for (let k = 1; k <= segs.length; k++) {
        const p2 = segs.slice(0, k).join('/');
        cnt.set(p2, (cnt.get(p2) || 0) + 1);
      }
    }
    let node = null;
    for (const [p2, c] of cnt)
      if (c / cands.length >= 0.8 && p2 !== '.' && (!node || p2.length > node.p.length)) node = { p: p2, c };
    if (node && !(dir + '/').startsWith(node.p + '/'))
      return {
        kind: 'placement',
        token: null,
        dir: node.p,
        suf,
        text: `[grain] placement: ${node.c} of ${cands.length} \`*.${suf}\` files live under \`${node.p}/\`; this one is outside it (\`${dir}/\`). Deliberate is fine — if you guessed, look there first.`,
      };
    if (node && dir === node.p && !cands.some(f => dirname(f) === node.p)) {
      // everyone lives one level deeper — the root holds none
      const subs = new Map();
      for (const f of cands)
        if ((f + '/').startsWith(node.p + '/')) {
          const nxt = f.slice(node.p.length + 1).split('/')[0];
          if (f.slice(node.p.length + 1).includes('/')) subs.set(nxt, (subs.get(nxt) || 0) + 1);
        }
      const top3 = [...subs]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 3)
        .map(([d2, c2]) => `\`${d2}/\` (${c2})`);
      if (subs.size)
        return {
          kind: 'placement',
          token: null,
          dir: node.p,
          suf,
          text: `[grain] placement: every \`*.${suf}\` file under \`${node.p}/\` lives in a named subdirectory — ${top3.join(' · ')}${subs.size > 3 ? ` · +${subs.size - 3} more` : ''}; none sit at the root, where this file is. Deliberate is fine — if you guessed, pick the closest subdirectory.`,
        };
    }
  }
  return null;
}
export async function checkFile({ model, root, rel, content, asPath, exemplarOk = () => true }) {
  const effRel = asPath || rel;
  const src = normalizeCR(content ?? readFileSync(join(root, rel), 'utf8'));
  const part = partitionFor(model, effRel);
  const { p, tree: tr } = await parseFile(extname(rel), src);
  const b = bindingFor(p._g);
  const hasError = tr.rootNode.hasError; // a real parse failure (e.g. unicode identifiers a vendored grammar can't
  // handle) leaves ERROR nodes in the tree; extractScopes silently skips them so partial content still mines, but
  // callers need this signal to tell "genuinely nothing here" apart from "the parser gave up on part of this file"
  const scopes = extractScopes(effRel, tr, b, p._g).filter(s => s.name !== '<anon>');
  const relFact = relFactsFor(effRel, src, tr, p._g);
  // §042 — the instance counts behind each per-file lexical vote, for `lexTallyNote`. Taken here because `tr` is freed
  // on the next line and the governed loop below runs after that. A second walk of one already-parsed file, on the
  // check path only; extraction and mining call `lexicalPreds` without a tally and are byte-for-byte unaffected.
  // `lexQ` (§077) is the raw per-instance quote-literal scan (`{q, body, line, endLine}`), filtered down to genuine,
  // non-delimiter-forced violations by `quoteFlags` below — same out-parameter discipline as `lexT`, never spread
  // into a scope's `preds`.
  const lexT = Object.create(null);
  const lexQ = [];
  lexicalPreds(tr, b, lexT, lexQ);
  tr.delete();
  const archHits = computeArchHits({ model, root, effRel, relFact });
  const placeHit = placementHit(model, effRel);
  if (!part)
    return {
      scopes: [],
      governed: [],
      msgs: [],
      archHits,
      placeHit,
      newScopeHits: [],
      partition: null,
      reason: 'no partition covers this file',
      hasError,
    };
  for (const s of scopes) applyVocab(s, part.vocab);
  const medoids = part.medoids;
  const { assign, amb, scores } = assignAll(scopes, medoids);
  const msgs = [];
  const governed = [];
  const waiverHits = [];
  // the waivers reaching THIS file: one scope excused from one surface, by name. Matched on (effRel, scope name, pid),
  // which is why `decide waive` refuses an ambiguous (path, name) — see cmdSeed's `waive` branch.
  const fileWaivers = (model.waivers || []).filter(wv => wv.found && wv.path === effRel);
  // specificity governance: for each pid, the most specific applicable context governs the scope —
  // role or directory over partition-wide (`_all`); among applicable facts the smallest evidence class wins.
  const ctxRank = f => (/^r\d/.test(f.cid) ? 0 : f.cid.startsWith('d[') ? 1 : 2);
  scopes.forEach((s, i) => {
    let role = assign.get(i);
    let roleOk = role !== undefined && !amb.has(i);
    const sticky = part.assignments[skeyR(effRel, s)];
    if (sticky !== undefined && sticky !== -1) {
      role = sticky;
      roleOk = true;
    } // STICKY FIRST (§8.6)
    const gov = new Map();
    for (const f of part.facts) {
      if (f.kind !== s.kind) continue;
      if (/^r\d/.test(f.cid)) {
        if (!roleOk || 'r' + role + ':' + s.kind !== f.cid) continue;
      } else if (f.cid.startsWith('d[')) {
        const d = f.cid.slice(2, f.cid.indexOf(']'));
        if (!effRel.startsWith(d + '/')) continue;
      }
      const g = gov.get(f.pid);
      if (!g || f.sraw < g.sraw || (f.sraw === g.sraw && ctxRank(f) < ctxRank(g))) gov.set(f.pid, f);
    }
    for (const f of [...gov.values()].sort((a, b) =>
      a.cid < b.cid ? -1 : a.cid > b.cid ? 1 : a.pid < b.pid ? -1 : 1
    )) {
      const isRole = /^r\d/.test(f.cid);
      const label = isRole
        ? medoids[role]?.label || 'group'
        : f.cid.startsWith('d[')
          ? `local (${f.cid.slice(2, f.cid.indexOf(']'))}/)`
          : f.pkgWide
            ? scopeLabel(part.name.replace(/#.*$/, '')) + ' incl. tests/examples'
            : scopeLabel(part.name);
      const lead = s.preds[f.pid];
      // `defining`: this fact's pid is the very feature (3× weighted) that formed the role group it governs — a
      // marker tautology (§003 resolution). Not suppressed here (report/rulesMarkdown's factTiers does that for
      // their own listing) — spoken instead, via a clause where this entry renders (cmdCheck's `conforms to:`).
      if (lead !== undefined)
        governed.push({
          scope: s.name,
          kind: s.kind,
          line: s.line,
          endLine: s.endLine || s.line,
          pid: f.pid,
          label,
          conforms: lead === f.exp,
          fact: f,
          tally: lexTally(
            f.pid,
            f.exp,
            lexT[f.pid],
            f.pid === 'auto.lex:quote' ? quoteFlags(f.exp, lexQ) : []
          ), // §042 — null unless the per-file vote hid departing instances; §077 — flags the genuine ones among them
          defining: isDefiningFact(medoids, f),
        });
      // the lead surface speaks for the cluster; a deviation on any sibling surface (same conform set) is still a deviation
      for (const sf of [f, ...(f.siblings || [])]) {
        const v = s.preds[sf.pid];
        if (v === undefined || v === sf.exp) continue;
        if (sf === f && f.suppressedValue && v === f.suppressedValue) continue; // nucleation stand-down
        if (sf === f && f.altMarker) {
          const am = /^auto\.(deco|extends|returns):/.exec(f.altMarker.pid); // an alternative-marker deviant already conforms — never a false accusation (§altMarkerFor)
          const arr = am && (am[1] === 'extends' ? s.sup : am[1] === 'deco' ? s.decos : s.rets);
          if (arr && arr.includes(f.altMarker.name)) continue;
        }
        const gc = sf.srawCounts || sf.counts; // the accusation's odds run on the SAME population the message prints (n/N established)
        const neff = Object.values(gc).reduce((a2, b2) => a2 + b2, 0);
        const K = isBool(sf.pid) ? 2 : sf.alphabet.length + 1;
        const known = sf.alphabet.includes(v);
        const d = Math.log2(kt(gc, K, sf.exp, neff) / kt(gc, K, known ? v : UNSEEN, neff));
        if (d < (sf.tau || Math.log2(CFG.lambda))) continue;
        const isDir = f.cid.startsWith('d[');
        const contrast =
          (isRole || isDir) && f.parentExp != null && f.parentExp !== f.exp
            ? `\n  This is the local default ${isDir ? 'of this directory' : 'of this group'} — the wider package's norm differs here.`
            : '';
        const conformN = f.sraw - Math.round((1 - f.share) * f.sraw);
        const exs = f.exemplars.filter(e => exemplarOk(e.rel) && !(e.rel === effRel && e.name === s.name)); // render-time re-validation; never the deviant itself
        const vf = { ...sf, kind: f.kind };
        // an active waiver on THIS (scope, pid): the maintainer already answered this one. The deviation is not raised —
        // a decided voice takes its place, carrying the same n/N denominator the deviation would have printed. `governed`
        // above is untouched on purpose: the scope still counts as non-conforming, only the accusation is withdrawn.
        const wv = fileWaivers.find(w => w.name === s.name && w.pid === sf.pid);
        if (wv) {
          waiverHits.push({
            scope: s.name,
            kind: s.kind,
            line: s.line,
            endLine: s.endLine || s.line,
            id: wv.id,
            pid: sf.pid,
            exp: sf.exp,
            obs: v,
            text: `[grain] ${voice(
              'decided',
              `${scopeBacktick(s)} (line ${s.line}) deliberately departs from ${verbalize(
                vf,
                f.exemplars.map(e => e.name)
              )} — ${conformN}/${f.sraw} established do it the other way${wv.note ? ` — ${wv.note}` : ''}`,
              { typ: 'waiver', who: wv.author, when: wv.createdAt, id: wv.id }
            )}`,
          });
          break;
        }
        msgs.push({
          scope: s.name,
          kind: s.kind,
          key: skeyR(effRel, s),
          line: s.line,
          endLine: s.endLine || s.line,
          pid: sf.pid,
          factKey: f.cid + '|' + f.pid,
          delta: +d.toFixed(2),
          exp: sf.exp,
          obs: v,
          label,
          exNames: f.exemplars.map(e => e.name),
          text:
            `[grain] ` +
            voice(
              'practiced',
              `${label} convention: ${verbalize(
                vf,
                f.exemplars.map(e => e.name)
              )}${
                sf !== f
                  ? ` (a sibling surface of: ${verbalize(
                      f,
                      f.exemplars.map(e => e.name)
                    ).replace(/^\w+ here /, '')})`
                  : ''
              }${
                f.seeded
                  ? ` — steered by a maintainer decision${
                      (model.steers || [])
                        .filter(st => f.seeded.includes(st.id) && st.note)
                        .map(st => ': ' + st.note)
                        .join('') || ''
                    }`
                  : ''
              }\n` +
                `  ${conformN}/${f.sraw} established ${unitOf(f.kind)} conform. Your ${scopeNamed(s)} (line ${s.line}) ${deviationPhrase(vf, v)}${known ? '' : ' — a value this repo has not used before'}.${contrast}` +
                (() => {
                  const here = scopes
                    .filter(s2 => s2 !== s && s2.kind === s.kind && s2.preds[sf.pid] === sf.exp)
                    .slice(0, 2);
                  if (here.length)
                    return `\n  In this file, ${here.map(s2 => scopeBacktick(s2) + ` (line ${s2.line})`).join(' and ')} conform${here.length === 1 ? 's' : ''}.`;
                  const near = exs[0];
                  // §061: an exemplar carries no `.kind` of its own (f.exemplars' shape), but every exemplar of
                  // this fact IS of the fact's own kind by construction — same borrowed-name honesty as `here` above.
                  return near
                    ? `\n  Nearest conforming exemplar: ${ptr(near.rel, near.line, near.endLine)} ${scopeBacktick({ kind: f.kind, name: near.name })}${skipLineNote(part, f, near)}.`
                    : '';
                })() +
                (exs.length
                  ? `\n  See: ${exs.map(e => `${ptr(e.rel, e.line, e.endLine)} ${scopeBacktick({ kind: f.kind, name: e.name })}${skipLineNote(part, f, e)}`).join(' · ')}`
                  : '') +
                // any note the fact carries, not only `held` — the cost of deviating is the one a reader most needs here,
                // and it can be present on a fact whose `held.since` is not
                (() => {
                  const n = factNotes(f);
                  return n ? `\n  (${n.replace(/^ · /, '')})` : '';
                })()
            ),
        });
        break;
      }
    }
  });
  // structural shape (§J5.8): a scope in a role group whose profile says every certified member carries `sig` at
  // least `need` times, and this one carries it fewer. No predicate drives it — the loop above runs on
  // `part.facts` × `s.preds[f.pid]` and a shape fact has neither — so it is its own pass with its own inline text,
  // the same way steerHits/archHits/waiverHits build theirs rather than routing through `verbalize`.
  scopes.forEach((s, i) => {
    if (!s.sk) return;
    const sticky = part.assignments[skeyR(effRel, s)];
    const role =
      sticky !== undefined && sticky !== -1
        ? sticky
        : assign.has(i) && !amb.has(i)
          ? assign.get(i)
          : undefined;
    const pf = role !== undefined && part.profiles && part.profiles[role];
    if (!pf || !pf.req) return;
    const have = sigCounts(s.sk);
    // ONE deviation per scope (the ticket's cap). Which one is a DECISION, not a derivation: the signature the
    // template carries most often, ties broken by signature ascending — deterministic, and independent of the
    // order `req` happens to have been serialized in.
    let worst = null;
    for (const [sig, need] of Object.entries(pf.req)) {
      const got = have[sig] || 0;
      if (got < need && (!worst || need > worst.need || (need === worst.need && sig < worst.sig)))
        worst = { sig, need, got };
    }
    if (!worst) return;
    // the cost, in the SAME KT estimator every other deviation here uses (never an ad-hoc occurrence shortfall,
    // which is not on the `delta` scale the sort and the "(preference gap N bits)" render speak). The population is
    // degenerate all-true by construction — every one of pf.n members carries the signature — so this is the
    // surprise of the one exception, and it grows with the group the way every other deviation's confidence does.
    const d = -Math.log2(kt({ true: pf.n, false: 0 }, 2, 'false', pf.n));
    const label = medoids[role]?.label || 'group';
    const unit = unitOf(s.kind);
    const sig = worst.sig.startsWith('id:') ? worst.sig.slice(3) : worst.sig; // same `id:` stripping skRender and the slot render do
    msgs.push({
      scope: s.name,
      kind: s.kind,
      key: skeyR(effRel, s),
      line: s.line,
      endLine: s.endLine || s.line,
      pid: 'auto.shape:' + worst.sig,
      factKey: 'r' + role + ':' + s.kind + '|auto.shape:' + worst.sig,
      delta: +d.toFixed(2),
      exp: String(worst.need),
      obs: String(worst.got),
      label,
      exNames: [],
      summary: `${unit} all carry \`${sig}\`${worst.need > 1 ? ` (${worst.need}×)` : ''}`, // the pre-existing-summary phrase, built here rather than in `verbalize`: this is a multiset-occurrence comparison, not a pid=value pair
      text:
        `[grain] ` +
        voice(
          'practiced',
          `${label} shape: ${unit} here all carry \`${sig}\`${worst.need > 1 ? ` (${worst.need}×)` : ''}\n` +
            `  ${pf.n}/${pf.n} established ${unit} conform. Your ${scopeNamed(s)} (line ${s.line}) is missing \`${sig}\` — every one of the ${pf.n} certified members of this group carries it at least ${worst.need} time${worst.need > 1 ? 's' : ''}, yours has ${worst.got}.\n` +
            `  (N of N by construction: the group's template is the anti-unification of all ${pf.n} members, so everything it carries is in every one of them — there is no partial counter behind this denominator.)`
        ),
    });
  });
  msgs.sort((a, b) => b.delta - a.delta || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : a.line - b.line));
  // maintainer decisions that reach this file: a steer whose exemplar shares the scope's directory subtree or group. Not a
  // deviation (the numbers may still favour the old pattern — that is the point of a steer), a decision, printed as such.
  const steerHits = [];
  for (const st of model.steers || []) {
    if (!st.found || st.partition !== part.name) continue;
    const sdir = dirname(st.path);
    scopes.forEach((s, i) => {
      if (s.kind !== st.kind) return;
      const sticky = part.assignments[skeyR(effRel, s)];
      const role =
        sticky !== undefined && sticky !== -1
          ? sticky
          : assign.has(i) && !amb.has(i)
            ? assign.get(i)
            : undefined;
      // targeting: a PROMOTION reaches the exemplar's group (else its directory subtree) — a steer in tests/ must not nag every
      // test method; a RETIREMENT reaches the whole subtree, because only carriers of the retired value can depart at all
      const inScope = sf =>
        sf.retires
          ? effRel.startsWith(sdir + '/')
          : st.role !== null
            ? role === st.role
            : effRel.startsWith(sdir + '/');
      for (const sf of st.surfaces) {
        if (sf.value === null || !inScope(sf)) continue;
        const v = s.preds[sf.pid];
        if (v === undefined || v === sf.value) continue;
        const vf = { pid: sf.pid, exp: sf.value, kind: st.kind, heritageKind: heritageKindOf(sf.pid, model) };
        const promoted = st.surfaces.find(x => x.value !== null && !x.retires);
        const retiredName = (sf.pid.match(/^auto\.[a-z]+:(@?.+)$/) || [])[1];
        const head2 =
          sf.retires && promoted
            ? `${verbalize({ pid: promoted.pid, exp: promoted.value, kind: st.kind, heritageKind: heritageKindOf(promoted.pid, model) }, [st.name])}, not \`${retiredName || sf.pid}\` — ${practicedBy(promoted)}. Your ${scopeNamed(s)} (line ${s.line}) still carries \`${retiredName || sf.pid}\``
            : `${verbalize(vf, [st.name])} — ${practicedBy(sf)}. Your ${scopeNamed(s)} (line ${s.line}) ${deviationPhrase(vf, v)}`;
        steerHits.push({
          scope: s.name,
          kind: s.kind,
          line: s.line,
          endLine: s.endLine || s.line,
          id: st.id,
          pid: sf.pid,
          exp: sf.value,
          obs: v,
          text: `[grain] ${voice('decided', `${head2}.${st.note ? `\n  ${st.note}` : ''}\n  Copy: ${st.path}:${st.line} \`${st.name}\``, { typ: 'steer', who: st.author, when: st.createdAt })}`,
        });
      }
    });
  }
  // (§003-B, delivery revised §010) disclosure: a role-eligible scope the PERSISTED model has never certified — its
  // skeyR key is absent from part.assignments, so no role fact in `part.facts` governs it by construction; only the
  // partition-wide `_all` baseline does, and that baseline is nearly always trivially satisfied (the whole point of
  // this ticket). `scores` (assignAll, above) carries the live nearest/next-nearest medoid THIS run computed for it
  // — genuinely informational, never a certified role, never governance — the same honest-disclosure register as
  // relCoverageNote/intraModuleNote, not the `practiced` deviation voice: this is grain naming its own coverage
  // gap, not a claim about the codebase.
  //
  // §010(d): "nearest" is not always informative. On a marker-split population the nearest neighbour to a new
  // scope missing the marker is often the group's own undecorated COMPLEMENT — a real cluster certifying nothing,
  // whose label is frequently `induceRoles`' own 'group' fallback (no feature reached majority share), never mined
  // data. Leading with that taught a reader nothing and printed the fallback as though it were a name (field report:
  // flask). Fix: foreground the nearest group that certifies >=1 role fact for this kind, naming its defining
  // requirement — the raw nearest/next scores are still both reported, never hidden, just not foregrounded when the
  // nearer one has nothing to certify. §010(a): collapse per (kind, chosen neighbour) so one authoring decision
  // (several new scopes in one file, one group) produces one line, not one per scope, in the house `+N more` idiom.
  const newScopeHits = [];
  const roleMembers = idx => {
    let n = 0;
    for (const r of Object.values(part.assignments)) if (r === idx) n++;
    return n;
  };
  const roleFacts = (idx, kind) => part.facts.filter(f => f.cid === 'r' + idx + ':' + kind);
  // a mined label is only ever the literal string 'group' as induceRoles' OWN fallback, never real data (§010-d) —
  // so it is exactly the case that must never render as a name; everything else names the group verbatim
  const groupName = idx => {
    const n = roleMembers(idx);
    const l = medoids[idx]?.label;
    return `${l && l !== 'group' ? `«${l}»` : 'an unlabelled cluster'} (${n} member${n === 1 ? '' : 's'})`;
  };
  const groupTrait = (idx, kind) => {
    const def = roleFacts(idx, kind).find(f => isDefiningFact(medoids, f));
    const m = def && /^auto\.(deco|extends|returns):@?(.+)$/.exec(def.pid);
    return (
      m &&
      (m[1] === 'deco'
        ? `requires @${m[2]}`
        : m[1] === 'extends'
          ? `requires extends ${m[2]}`
          : `requires returns ${m[2]}`)
    );
  };
  const certN = (idx, kind) => roleFacts(idx, kind).length;
  // the LEADING group's full description — name plus what it actually certifies: its defining requirement when
  // there is one, else a bare convention count, else (only reached from the two "honest disclaimer" branches
  // below, never for a group chosen as lead) an explicit "certifies nothing"
  const groupDesc = (idx, kind) => {
    const cert = certN(idx, kind);
    return `${groupName(idx).slice(0, -1)}, ${groupTrait(idx, kind) || (cert ? `${cert} convention${cert === 1 ? '' : 's'}` : 'certifies nothing')})`;
  };
  const buckets = new Map(); // key: (kind, the neighbour(s) actually spoken) -> one collapsed hit
  scopes.forEach((s, i) => {
    if (s.kind === 'file' || s.kind === 'module' || s.ownCount < 2) return;
    if (part.assignments[skeyR(effRel, s)] !== undefined) return; // known to the persisted model already — sticky governs it properly
    const sc = scores.get(i);
    if (!sc) return;
    let key,
      lead = null,
      detail;
    if (sc.m1 < CFG.minMemb) {
      // (§047) below the floor is where exclusion is worst: the very feature a clean deviation omits is what
      // similarity assignment leans on, so a member that cleanly violates a convention can score BELOW its own
      // group's floor and never reach the population that would judge it. No accusation is made here (that
      // would resurrect the rejected leave-one-feature-out fix) — this is the same disclosure the bestCert/
      // secondCert branches below already make for an ambiguous scope, extended to the below-floor case using
      // the identical certN/groupDesc reads, no new threshold.
      //
      // Measured (5-repo fire-rate check, 047): a bare certN>0 gate fires on every weak, near-universal role fact
      // too (`returns:void`, `returns:t.Any`) — double digits on two of three corpora, one real group cited for a
      // dozen unrelated scopes each. The fix reuses `Math.log2(CFG.lambda)` — the SAME bar `d < tau ||
      // Math.log2(CFG.lambda)` already applies to every deviation accusation in this function — against the
      // cited fact's own `bpi` (already computed by mine(), never recomputed here): a fact mine() itself would
      // not consider strong enough to accuse a deviation over is not strong enough to name as "the nearest
      // certifying group" either. This is the identical comparator, not a new one. It costs the real OZ
      // `@onlyOwner` example nothing (bpi 5.63, comfortably clears it) while removing the generic-marker noise
      // (bpi 1.4–2.7 on every measured false lead).
      const strongCert = idx => roleFacts(idx, s.kind).some(f => f.bpi >= Math.log2(CFG.lambda));
      const bestCert = strongCert(sc.best),
        secondCert = sc.second >= 0 && strongCert(sc.second);
      if (bestCert) {
        lead = sc.best;
        key = `nogroup#${s.kind}#${lead}`;
        detail = `matched no group (best ${sc.m1.toFixed(2)}, floor ${CFG.minMemb}) — the nearest certifying group is ${groupDesc(sc.best, s.kind)} at ${sc.m1.toFixed(2)}`;
      } else if (secondCert) {
        lead = sc.second;
        key = `nogroup#${s.kind}#${lead}`;
        detail = `matched no group (best ${sc.m1.toFixed(2)}, floor ${CFG.minMemb}) — the nearest certifying group is ${groupDesc(sc.second, s.kind)} at ${sc.m2.toFixed(2)}`;
      } else {
        key = `nogroup#${s.kind}`;
        detail = `matched no group (best ${sc.m1.toFixed(2)}, floor ${CFG.minMemb})`;
      }
    } else {
      const bestCert = certN(sc.best, s.kind) > 0,
        secondCert = sc.second >= 0 && certN(sc.second, s.kind) > 0;
      if (bestCert) {
        lead = sc.best;
        key = `cert#${s.kind}#${lead}`;
        detail = `nearest ${groupDesc(sc.best, s.kind)} at ${sc.m1.toFixed(2)}${sc.second >= 0 ? `, next ${groupName(sc.second)} at ${sc.m2.toFixed(2)}` : ''}`;
      } else if (secondCert) {
        lead = sc.second;
        key = `cert#${s.kind}#${lead}`;
        detail = `nearest is ${groupName(sc.best)} at ${sc.m1.toFixed(2)}, which certifies nothing; the closest certifying group is ${groupDesc(sc.second, s.kind)} at ${sc.m2.toFixed(2)}`;
      } else {
        key = `nocert#${s.kind}#${sc.best}#${sc.second}`;
        detail = `nearest ${groupName(sc.best)} at ${sc.m1.toFixed(2)}${sc.second >= 0 ? `, next ${groupName(sc.second)} at ${sc.m2.toFixed(2)}` : ''} — no nearby group certifies a convention`;
      }
    }
    let b = buckets.get(key);
    if (!b) {
      b = { kind: s.kind, lead, detail, members: [] };
      buckets.set(key, b);
    }
    b.members.push({ name: s.name, line: s.line, endLine: s.endLine || s.line });
  });
  for (const b of buckets.values()) {
    // §061: `m.name` for a catch/finally member is its enclosing method/type's OWN name (blockScope's borrowed
    // "named after its owner"), never the clause's own — go through scopeBacktick so it reads as a location.
    const shown = b.members
      .slice(0, 3)
      .map(m => `${scopeBacktick({ kind: b.kind, name: m.name })} (line ${m.line})`)
      .join(', ');
    const who = b.members.length > 3 ? `${shown} and ${b.members.length - 3} more` : shown;
    // (§010-e) an exemplar to open, reusing the SAME resolver the "See:" line under a deviation already uses
    // (roleExemplar) rather than a second one — a group named but pointing nowhere is strictly less useful than
    // every neighbouring message; only offered when a lead group was actually chosen (never for "no group
    // certifies" or below-floor, where there is nothing conforming nearby to point at)
    const anchor = b.lead !== null ? roleExemplar(model, part.name, b.lead) : null;
    const first = b.members[0],
      last = b.members[b.members.length - 1];
    newScopeHits.push({
      scope: first.name,
      kind: b.kind,
      line: first.line,
      endLine: last.endLine,
      count: b.members.length,
      text:
        `[grain] ${who} ${b.members.length === 1 ? 'is' : 'are'} new to the index — ${b.detail}. Judged against the package baseline only.` +
        (anchor
          ? `\n  See: ${ptr(anchor.ex.rel, anchor.ex.line, anchor.ex.endLine)} ${scopeBacktick({ kind: anchor.f.kind, name: anchor.ex.name })}`
          : ''),
    });
  }
  return {
    scopes,
    governed,
    msgs,
    steerHits,
    waiverHits,
    archHits,
    placeHit,
    newScopeHits,
    partition: part.name,
    hasError,
  };
}
// established layering norms: a (source module, target module) pair is a cell exactly like a `_all`-scoped predicate
// cell in mine() (§9.4a in mathematics.md) — counts = { true: files in A that reach B, false: files in A that don't },
// neff = |files in A| — decided with the IDENTICAL KT/BIC/index-cost test as mine()'s isAll branch (core.mjs mine(),
// ~line 552-560): same kt(), same CFG.lambda, no new constant. Uses the SAME refined module assignment as
// moduleGraph (via the shared refineModOf), consistently with computeArchHits below — both now agree with what
// report/rules display (§G11 fixed a prior inconsistency here), and its own edge aggregation straight from
// model.edges/model.filesAll — never model.moduleGraph's nodes/edges.
export function architectureNorms(model) {
  const files = model.filesAll || [];
  const pkgs = model.pkgs || [];
  const EMPTY = new Set();
  const refined = refineModOf(files, pkgs, model.srcRoots || []);
  const modOf = new Map();
  for (const f of files) modOf.set(f, refined(f));
  // per-file reached-module set: a target module counts once per file, regardless of how many edges/how much .n land on it
  const reached = new Map();
  for (const e of model.edges || []) {
    const a = modOf.get(e.from),
      b = modOf.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    (reached.get(e.from) || reached.set(e.from, new Set()).get(e.from)).add(b);
  }
  const filesOf = new Map(); // module -> its files
  for (const f of files) {
    const m = modOf.get(f);
    (filesOf.get(m) || filesOf.set(m, []).get(m)).push(f);
  }
  // candidate universe: every (A,B) with ≥ 1 file in A reaching B — counted ONCE, repo-wide, exactly as mine()'s C
  const pairs = new Map(); // "A\x01B" -> { A, B, trueN, neff }
  for (const [A, fs2] of filesOf) {
    const targets = new Set();
    for (const f of fs2) for (const b of reached.get(f) || EMPTY) targets.add(b);
    for (const B of targets) {
      let trueN = 0;
      for (const f of fs2) if ((reached.get(f) || EMPTY).has(B)) trueN++;
      pairs.set(A + S + B, { A, B, trueN, neff: fs2.length });
    }
  }
  // second candidate population (§J5.7a): (role-group, target module) pairs, the same cell shape one level finer
  // than a module. neff MUST be distinct FILES carrying a member of the group, never raw scope count — a file
  // holding 20 methods of one role is one file's worth of independent evidence about its own edges, not twenty,
  // and neff feeds directly into the BIC penalty and the λ bound below. Read off the SAME per-file `reached` map
  // the module-module population above uses — never rebuilt.
  const groupPairs = new Map(); // "part#role\x01B" -> { A: groupKey, B, trueN, neff }
  for (const part of model.partitions || []) {
    const filesByRole = new Map(); // role -> Set of distinct files carrying a member of that role
    for (const [key, role] of Object.entries(part.assignments || {})) {
      if (!Number.isInteger(role) || role === -1) continue;
      const path = key.slice(0, key.indexOf('#'));
      (filesByRole.get(role) || filesByRole.set(role, new Set()).get(role)).add(path);
    }
    for (const [role, fset] of filesByRole) {
      const A = part.name + '#' + role;
      const targets = new Set();
      for (const f of fset) for (const b of reached.get(f) || EMPTY) targets.add(b);
      for (const B of targets) {
        let trueN = 0;
        for (const f of fset) if ((reached.get(f) || EMPTY).has(B)) trueN++;
        groupPairs.set(A + S + B, { A, B, trueN, neff: fset.size });
      }
    }
  }
  // ONE idxCost over BOTH populations, counted before either's per-pair minRaw/minEff/bits filtering below — the
  // same discipline mine()'s own idxCost, bridgeBits' universe3 and J4.1's cellGlobal all follow: a widened
  // candidate universe is never split into two separately-taxed sub-universes. Consequence, real and unavoidable:
  // this raises the bar for module-module pairs too, so this function's output is no longer byte-identical to a
  // module-only computation on the same input (architecture-norms.test.mjs / group-arch-norms.test.mjs cover this).
  const idxCost = Math.ceil(Math.log2(Math.max(pairs.size + groupPairs.size, 2)));
  const K = 2;
  const preAccept = [];
  const evaluate = (A, B, trueN, neff, fromKind) => {
    const raw = neff; // every file counts exactly once (weight 1), so raw === neff for this cell shape
    if (raw < CFG.minRaw || neff < CFG.minEff) return;
    const counts = { true: trueN, false: neff - trueN };
    let data = 0;
    for (const v of ['true', 'false']) {
      const nv = counts[v];
      if (nv) data += nv * Math.log2(kt(counts, K, v, neff) * 2);
    }
    const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(neff, 2)) - idxCost;
    if (bits <= 0) return; // evidence = codelength gain, nothing else
    const exp = counts.true > counts.false ? 'true' : 'false';
    const ne = counts[exp];
    if (!((ne + 0.5) / (neff + K / 2) >= 1 - 1 / CFG.lambda)) return; // the one loss constant, same posterior-predictive bound
    preAccept.push({ from: A, to: B, exp, ne, neff, share: ne / neff, bits, fromKind });
  };
  for (const { A, B, trueN, neff } of pairs.values()) evaluate(A, B, trueN, neff, 'module');
  for (const { A, B, trueN, neff } of groupPairs.values()) evaluate(A, B, trueN, neff, 'group');
  // absence-boundary discipline (mirrors mine()'s presentSomewhere/partitionTrueShare, §9.4 in mathematics.md): a
  // module or group "never reaching B" is a boundary only against something a real, live option elsewhere — either
  // (a) some OTHER module's or group's accepted practice IS to reach B, or (b) reaching B is at least a non-trivial
  // share (mine()'s own repo-wide floor, 10%) of the files outside A. mine() ANDs its two conditions, but that is
  // for a partition-relative cell with a real parent population to contrast against; a module/group pair has none —
  // it IS the top-level population, like an `_all`-scoped fact — so either half of the live-option evidence
  // suffices here.
  const trueTargets = new Set(preAccept.filter(n => n.exp === 'true').map(n => n.to));
  // globalReachByB is drawn ONLY from the module-module population: modules already partition the whole repo, so
  // a group's reaching files are already counted here through their containing module — adding the group's own
  // trueN again would double-count the same files.
  const globalReachByB = new Map();
  for (const { B, trueN } of pairs.values()) globalReachByB.set(B, (globalReachByB.get(B) || 0) + trueN);
  const totalFiles = files.length;
  // n.trueN is not stored on preAccept entries (it would be a schema-visible field fully derivable from exp/ne/neff)
  const outsideShare = n => {
    const denom = totalFiles - n.neff;
    if (denom <= 0) return 0;
    const trueN = n.exp === 'true' ? n.ne : n.neff - n.ne;
    return (globalReachByB.get(n.to) - trueN) / denom;
  };
  return preAccept.filter(n => n.exp === 'true' || trueTargets.has(n.to) || outsideShare(n) >= 0.1);
}
// architecture: the file's CURRENT out-edges resolved against the accepted tree — a reference that creates the FIRST
// edge between two modules is a boundary crossing worth saying at edit time; one whose reverse already exists closes a
// cycle. Existing crossings (the module pair already has edges at HEAD) stay silent — practice already speaks there.
// Needs no partition: the advice works on a repo too small to hold convention norms.
function computeArchHits({ model, root, effRel, relFact }) {
  const archHits = [];
  if (model.relDecls && relFact && model.moduleGraph) {
    try {
      const fileSet = new Set(model.filesAll || []);
      const resolve = makeEdgeResolver({
        root,
        fileSet,
        table: hydrateTable(model.relDecls),
        workspaces: model.workspaces || [],
        pkgs: model.pkgs || [],
        srcRoots: model.srcRoots || [],
        tsAliases: model.tsAliases || [],
        phpAutoload: model.phpAutoload || [],
        csGlobal: model.csGlobal || { usings: [], aliases: [] },
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
// one paragraph per (convention, observed value): the scopes that deviate, with lines, never nine identical paragraphs
export function groupDeviations(msgs, touched = null, fileKindTouched = null) {
  const groups = new Map();
  for (const m of msgs) {
    const k = m.factKey + '|' + m.pid + '|' + m.obs;
    let g = groups.get(k);
    if (!g) {
      g = { ...m, hits: [] };
      groups.set(k, g);
    }
    const isTouched =
      m.kind === 'file' && fileKindTouched
        ? fileKindTouched(m)
        : touched
          ? touched(m.line, m.endLine || m.line)
          : true;
    g.hits.push({ scope: m.scope, kind: m.kind, line: m.line, touched: isTouched });
  }
  const out = [];
  for (const g of groups.values()) {
    const t = g.hits.filter(h => h.touched),
      p = g.hits.filter(h => !h.touched);
    // §061: `h.scope` is the enclosing method/type's OWN name for a catch/finally hit (blockScope's borrowed
    // "named after its owner"), never the clause's own — prefixed "in " so it reads as a location, not a name.
    const who = hs =>
      hs
        .slice(0, 3)
        .map(h => `${ANON_SCOPE_KINDS.has(h.kind) ? 'in ' : ''}\`${h.scope}\` (line ${h.line})`)
        .join(', ') + (hs.length > 3 ? ` and ${hs.length - 3} more` : '');
    const head = g.text.split('\n');
    const first = head[0];
    const rest = head.slice(1).filter(l => !/^  \d+\/\d+ established/.test(l));
    const evidence = head.find(l => /^  \d+\/\d+ established/.test(l)) || '';
    const ev = evidence.replace(/ Your \w+ `[^`]*` \(line \d+\) /, ' ').replace(/\.$/, '');
    const kindWord = g.hits.length > 1 ? unitOf(g.kind) : g.kind;
    const dev = evidence.match(/\(line \d+\) (.*?)(?: — a value.*)?\.$/);
    const phrase = dev ? dev[1] : 'deviates'; // greedy to the FINAL period — `@app.get` carries a dot
    const novelty = /a value this repo has not used before/.test(evidence)
      ? ' — a value this repo has not used before'
      : '';
    out.push({
      ...g,
      touched: t.length,
      pre: p.length,
      text: `${first}\n  ${evidence.split('. Your')[0]}. ${t.length ? `Your ${t.length > 1 ? unitOf(g.kind) : g.kind} ${who(t)} ${phrase}${novelty}.` : ''}${p.length ? `${t.length ? ' Also' : 'Pre-existing:'} ${p.length} ${p.length > 1 ? unitOf(g.kind) : g.kind} not touched by your change (${who(p)}) ${phrase}.` : ''}\n${rest.join('\n')}`,
    });
  }
  return out.sort((a, b) => (b.touched > 0) - (a.touched > 0) || b.delta - a.delta);
}
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
// ===== WHERE (inverse query: intent → place + expectations + pattern to copy) =====
// "Where do command handlers go?" — lexical match of query tokens against the model's own vocabulary
// (role labels, medoid features, fact payloads, directory names). No embeddings: the model is a small,
// structured distillate in repo-native tokens; when lexical match fails, the compact map is printed and
// the asking agent — itself an LLM — closes the semantic gap better than any retrieval layer would.
// Card vocabulary is weighted by how strongly a token names the thing: a group's own name tokens, decorators and
// supertypes, and a directory's own name count fully; the surfaces of its conventions count 3/4; the last segments of
// the packages its files import count 1/2 (everything that imports `middleware` is not a middleware).
const TOKW = { name: 1, dir: 1, fact: 0.75, imp: 0.5, doc: 0.5 };
const addTok = (toks, t, w) => {
  const k = normTok(t);
  if ((toks.get(k) || 0) < w) toks.set(k, w);
};
export function buildCards(model) {
  const cards = [];
  for (const part of model.partitions) {
    const byRole = new Map();
    for (const [k, r] of Object.entries(part.assignments)) {
      if (r === -1) continue;
      let a = byRole.get(r);
      if (!a) {
        a = [];
        byRole.set(r, a);
      }
      a.push(k);
    }
    part.medoids.forEach((md, r) => {
      const members = byRole.get(r) || [];
      if (members.length < 3) return;
      const toks = new Map();
      for (const f of md.feats)
        for (const t of tokenize(f.slice(4))) addTok(toks, t, f.startsWith('imp:') ? TOKW.imp : TOKW.name);
      for (const t of tokenize(md.label)) addTok(toks, t, TOKW.name);
      const facts = part.facts.filter(f => f.cid.startsWith('r' + r + ':'));
      for (const f of facts)
        for (const t of tokenize(f.pid.replace(/^auto\.[a-z0-9]+:?@?/, ''))) addTok(toks, t, TOKW.fact);
      const dirs = new Map();
      for (const k of members) {
        const d = dirname(k.split('#')[0]);
        dirs.set(d, (dirs.get(d) || 0) + 1);
      }
      const topDirs = [...dirs].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
      for (const [d] of topDirs) for (const t of tokenize(d)) addTok(toks, t, TOKW.fact); // the directory a group lives in is context for it, not its name — a directory named `middleware` outranks a 4-member group that merely lives there
      // §012/G2 — a group's member NAMES are the same volume channel a file card's scope names are, and are
      // separated for the same reason (see `tw` in whereCmd). The member loop moved below the others only so
      // `baseToks` can be snapshotted before it; `addTok` keeps a max, so the order never changed `toks`.
      const gBaseToks = new Map(toks);
      const gMemberTok = new Map();
      for (const k of members)
        for (const t of new Set(tokenize(k.split('#')[2] || '').map(normTok)))
          gMemberTok.set(t, (gMemberTok.get(t) || 0) + 1);
      for (const k of members) for (const t of tokenize(k.split('#')[2] || '')) addTok(toks, t, TOKW.fact);
      cards.push({
        type: 'group',
        part: part.name,
        label: md.label,
        n: members.length,
        toks,
        baseToks: gBaseToks,
        memberTok: gMemberTok,
        memberW: TOKW.fact,
        facts,
        topDirs,
        members,
        roleIdx: r,
      });
    });
    // directory cards: every directory that holds enough scopes to be a place (the spec's dirContextMinScopes), whether or
    // not it carries an accepted local norm — placement is the first half of every `where` question
    const dirScopes = new Map();
    for (const k of Object.keys(part.assignments)) {
      const segs = k.split('#')[0].split('/').slice(0, -1);
      for (let i = 1; i <= segs.length; i++) {
        const d = segs.slice(0, i).join('/');
        dirScopes.set(d, (dirScopes.get(d) || 0) + 1);
      }
    }
    const byDir = new Map();
    for (const f of part.facts)
      if (f.cid.startsWith('d[')) {
        const d = f.cid.slice(2, f.cid.indexOf(']'));
        let a = byDir.get(d);
        if (!a) {
          a = [];
          byDir.set(d, a);
        }
        a.push(f);
      }
    for (const [d, n] of dirScopes) if (n >= 8 && !byDir.has(d)) byDir.set(d, []); // every directory that is a place (≥ 8 scopes), not only the ones that carry a local norm
    for (const [d, dfacts] of [...byDir].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const toks = new Map();
      // a directory that IS the partition's cut root owns the partition-wide facts too — they are exactly this
      // directory's norms, and without them the card of an MDL-cut package says "no convention" while seven exist
      const facts =
        d === part.name ? [...dfacts, ...part.facts.filter(f => f.cid.startsWith('_all'))] : dfacts;
      const dirName = new Set([normTok(d.split('/').pop().toLowerCase())]); // `testing utility` must reach packages/testing/ even though `test` is the most common token in the model
      for (const t of tokenize(d.split('/').pop())) addTok(toks, t, TOKW.dir);
      for (const t of tokenize(d)) addTok(toks, t, TOKW.fact);
      for (const f of facts)
        for (const t of tokenize(f.pid.replace(/^auto\.[a-z0-9]+:?@?/, ''))) addTok(toks, t, TOKW.fact);
      const files = (part.files || []).filter(f => f.startsWith(d + '/'));
      cards.push({
        type: 'directory',
        part: part.name,
        label: d + '/',
        n: facts.length ? Math.max(...facts.map(f => f.sraw)) : dirScopes.get(d) || 0,
        toks,
        dirName,
        facts,
        topDirs: [[d, 1]],
        members: null,
        files,
      });
    }
    // marker cards: "@click.command — 8 carriers, lives in src/flask/" — for an intent that names a decorator, a base type or a
    // return type, this is the answer (measured on flask: `where click command` landed on cli.py's inner closures instead)
    for (const [mk, keys] of Object.entries(part.markers || {})) {
      const [pre, name] = [mk.slice(0, mk.indexOf(':')), mk.slice(mk.indexOf(':') + 1)];
      const toks = new Map();
      for (const t of tokenize(name)) addTok(toks, t, TOKW.name);
      addTok(toks, name.toLowerCase().replace(/[^a-z0-9]/g, ''), TOKW.name);
      if (pre === 'deco') {
        addTok(toks, 'decorator', TOKW.fact);
        addTok(toks, 'annotation', TOKW.fact);
        addTok(toks, 'attribute', TOKW.fact);
      }
      if (pre === 'sup') {
        addTok(toks, 'extends', TOKW.fact);
        addTok(toks, 'implements', TOKW.fact);
        addTok(toks, 'subclass', TOKW.fact);
      }
      if (pre === 'ret') {
        addTok(toks, 'returns', TOKW.fact);
      }
      const dirs = new Map();
      for (const k of keys) {
        const d = dirname(k.split('#')[0]);
        dirs.set(d, (dirs.get(d) || 0) + 1);
      }
      const topDirs = [...dirs].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
      for (const [d] of topDirs) for (const t of tokenize(d)) addTok(toks, t, TOKW.fact);
      const carrierFiles = new Set(keys.map(k => k.split('#')[0]));
      const carrierNames = new Set(keys.map(k => k.split('#')[2]));
      for (const f of carrierFiles)
        for (const t of tokenize(
          f
            .split('/')
            .pop()
            .replace(/\.[^.]+$/, '')
        ))
          addTok(toks, t, TOKW.fact); // `cli command` reaches @click.command through cli.py
      const degenerate = carrierNames.size === 1 && keys.length > 1; // three fixtures all named `test` are not a pattern to copy (three commands in one cli.py are)
      const markerG = EXT2GRAMMAR[extname(keys[0].split('#')[0])]; // the carriers' own grammar — §048, decoLabel's sigil call
      const label =
        pre === 'deco'
          ? decoLabel(name, markerG)
          : pre === 'sup'
            ? `extends ${name}`
            : `returns ${name}`;
      const mpid =
        pre === 'deco'
          ? 'auto.deco:' + decoLabel(name, markerG)
          : pre === 'sup'
            ? 'auto.extends:' + name
            : 'auto.returns:' + name;
      const carries = f =>
        (f.pid === mpid && f.exp === 'true') ||
        (f.siblings || []).some(sb => sb.pid === mpid && sb.exp === 'true');
      cards.push({
        type: 'marker',
        part: part.name,
        label,
        mpid,
        n: keys.length,
        toks,
        degenerate,
        facts: part.facts.filter(carries),
        topDirs,
        members: keys,
        files: null,
      });
    }
    // file cards: the file's own name, its path segments and the names of the scopes it holds — `where res json` must find
    // lib/response.js (which defines `json`) even though no group or directory carries the word (measured on express: six
    // of eleven realistic intents missed lexically while the file that answered them existed verbatim)
    const byFile = new Map();
    if (part.fileScopes)
      for (const [rel, list] of Object.entries(part.fileScopes))
        byFile.set(
          rel,
          list
            .filter(([kind]) => kind !== 'catch' && kind !== 'finally')
            .map(([kind, name, line]) => ({ kind, name, line }))
        ); // a catch block is named after its owner — on a card it would shadow the method itself
    else
      for (const k of Object.keys(part.assignments)) {
        const [rel, kind, name] = k.split('#');
        (byFile.get(rel) || byFile.set(rel, []).get(rel)).push({ kind, name });
      }
    for (const rel of part.files || []) {
      const toks = new Map();
      const members = byFile.get(rel) || [];
      for (const t of tokenize(
        rel
          .split('/')
          .pop()
          .replace(/\.[^.]+$/, '')
      ))
        addTok(toks, t, TOKW.name);
      for (const t of tokenize(rel)) addTok(toks, t, TOKW.fact);
      for (const t of part.fileDocs?.[rel] || []) addTok(toks, t, TOKW.doc); // what the doc comments say this file is for
      for (const x of part.fileSups?.[rel] || []) for (const t of tokenize(x)) addTok(toks, t, TOKW.name); // the interfaces its types implement ARE what the file is
      // §012/G2 — the two channels kept apart, because `where` weighs them differently (see `tw` in whereCmd).
      // `baseToks` is what the file IS (name, path, docs, supertypes); `memberTok` counts how many of the file's
      // OWN scopes carry each token, so a name that covers the whole file can be told from one mentioned once in
      // a 169-scope test. `toks` below is left exactly as it was — every other consumer of a card reads it
      // unchanged, and `where`'s own IDF is still counted over it.
      const baseToks = new Map(toks);
      const memberTok = new Map();
      for (const m of members)
        for (const t of new Set(tokenize(m.name).map(normTok)))
          memberTok.set(t, (memberTok.get(t) || 0) + 1);
      for (const m of members) for (const t of tokenize(m.name)) addTok(toks, t, TOKW.name);
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.';
      const dirFacts = part.facts
        .filter(
          f => f.cid.startsWith('d[') && (dir + '/').startsWith(f.cid.slice(2, f.cid.indexOf(']')) + '/')
        )
        .sort((a, b) => b.cid.length - a.cid.length || b.sraw - a.sraw)
        .slice(0, 3)
        .concat(part.facts.filter(f => f.cid === '_all:file' && f.exp !== 'false').slice(0, 2)); // what every file here does (imports, quotes, directive) — a new file copies that first
      const carried = Object.entries(part.markers || {})
        .filter(([, ks]) => ks.some(k => k.startsWith(rel + '#')))
        .map(([mk, ks]) => [mk, ks.filter(k => k.startsWith(rel + '#')).length]);
      cards.push({
        type: 'file',
        part: part.name,
        label: rel,
        n: members.length,
        toks,
        baseToks,
        memberTok,
        names: new Set([
          ...members.map(m => m.name.toLowerCase()),
          ...(part.fileSups?.[rel] || []).map(x => x.toLowerCase()),
        ]),
        facts: dirFacts,
        carried,
        topDirs: [[dir, 1]],
        members: members.map(m => rel + '#' + m.kind + '#' + m.name + '#' + (m.line || '')),
        files: null,
      });
    }
  }
  return cards;
}
// a light stemmer applied to BOTH sides of every match (query and card), so only consistency matters, not linguistics:
// entities ≡ entity, classes ≡ class; extractor ≡ extract ≡ extraction, rejection ≡ reject, router ≡ route ≡ routing, handler ≡ handle
export const normTok = t => {
  t = t.toLowerCase();
  if (t.length <= 3) return t;
  t = t
    .replace(/ies$/, 'y')
    .replace(/(ses|xes|shes|ches)$/, m => m.slice(0, -2))
    .replace(/s$/, '');
  if (t.length >= 6)
    t = t
      .replace(/ation$/, 'ate')
      .replace(/(tion|sion)$/, 't')
      .replace(/ing$/, '')
      .replace(/(er|or)$/, '');
  if (t.length >= 5) t = t.replace(/e$/, '');
  return t;
};
export function cochangePartners(model, dirs, max = 3, file = null) {
  const out = [];
  const minConf = file ? 1 / 3 : CFG.cochangeMinConf; // one file's history is sparse; a third of its commits is a real signal
  // §020: a partner is a HISTORICAL fact — the pair really did co-change — but the path itself may be gone by HEAD
  // (renamed away, deleted). Same liveness source `howCmd`'s places[] uses for its own `exists` flag (core.mjs
  // ~2817): `model.pathsAll` (every tracked path, code or not) ∪ `model.filesAll` (defensive union, same idiom).
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
  for (const p of model.cochange || []) {
    const aIn = file ? p.a === file : dirs.some(d => p.a.startsWith(d + '/')),
      bIn = file ? p.b === file : dirs.some(d => p.b.startsWith(d + '/'));
    if (aIn && !bIn && p.sup / (p.commitsA || 1) >= minConf)
      out.push({ partner: p.b, sup: p.sup, commits: p.commitsA || p.sup, dead: !live.has(p.b) });
    else if (bIn && !aIn && p.sup / (p.commitsB || 1) >= minConf)
      out.push({ partner: p.a, sup: p.sup, commits: p.commitsB || p.sup, dead: !live.has(p.a) });
  }
  out.sort((x, y) => y.sup / y.commits - x.sup / x.commits || (x.partner < y.partner ? -1 : 1));
  const seen2 = new Set();
  const uniq = []; // one line per partner — duplicate rows (rename lineages) keep only their strongest
  for (const o of out) {
    if (seen2.has(o.partner)) continue;
    seen2.add(o.partner);
    uniq.push(o);
    if (uniq.length >= max) break;
  }
  return uniq;
}
// the practiced-by clause of a steer: same-denominator marker counts when the seed names what it retires, plain share otherwise
export const practicedBy = sf =>
  sf.rivals
    ? `adopted by ${sf.rivals.own} of ${sf.rivals.own + sf.rivals.alts.reduce((a, x) => a + x.n, 0)} (${sf.rivals.alts.map(x => `${x.name} ${x.n}`).join(' · ')}) in ${sf.context} today`
    : `practiced by ${Math.round((sf.share || 0) * 100)}% of ${sf.n} in ${sf.context} today`;
// a seed's baseline: how widely the seeded value was ALREADY practiced at the moment `grain seed add` recorded the
// decision — captured once at creation, read back forever after. The live cascade above (group → directory →
// partition) walks per-scope predicate data that exists only inside `learn()`'s working state and is gone once
// `learn()` returns, so a creation-time snapshot cannot replay it from the exported `model` alone. Instead this reads
// the broadest already-accepted fact for the same (kind, pid) in the exemplar's own partition — its partition-wide
// (`_all:`) cell, if `mine()` accepted one there — and reports what share of that cell already carried the value `v`,
// whichever value the fact itself calls the norm. Trade-off, accepted deliberately: a convention that is only
// group- or directory-local (e.g. "this group calls `validate`" while the wider package differs) has no partition-wide
// cell to read here, so `baseline` comes back `null` even though a real, narrower fact exists elsewhere in `facts`.
export function baselineShare(model, rel, kind, pid, v) {
  const part = partitionFor(model, rel);
  if (!part) return null;
  const f = part.facts.find(x => x.kind === kind && x.pid === pid && x.cid.startsWith('_all'));
  if (!f || !f.sraw) return null;
  return {
    share: +((f.srawCounts[v] || 0) / f.sraw).toFixed(2),
    n: Math.round(f.sraw),
    context: factLabel(part, f),
  };
}
// the delta a steer's practiced-by line grows when its seed carries a `baseline`: today's share/n are already on `sf`
// (computed by the same cascade above), so this is presentation only — no second pass over the model. Never claims a
// verdict ("dead", "stale"): just the two counts, in the maintainer's own vocabulary, for them to judge.
export function baselineClause(sf) {
  const b = sf.baseline;
  if (!b || sf.share === null) return '';
  const kNow = Math.round((sf.share || 0) * sf.n),
    kThen = Math.round((b.share || 0) * b.n);
  const thenCtx = b.context && b.context !== sf.context ? ` in ${b.context}` : '';
  if (kNow === kThen && sf.n === b.n)
    return ` (no movement since ${b.at}: ${kThen} of ${b.n}${thenCtx} then, ${kNow} of ${sf.n} now)`;
  const dir = kNow / sf.n >= kThen / (b.n || 1) ? 'up' : 'down';
  return ` (${dir} from ${kThen} of ${b.n}${thenCtx} when recorded ${b.at} to ${kNow} of ${sf.n} now)`;
}
// the `in:` locator's module: a `directory` card IS its own module (its own id, exactly what the card's existing
// `depends on:`/`used by:` lines already key off). Every other card type is spread across directories (`h.topDirs`,
// already computed when the card was built) — its module is the MAJORITY one, with a `(mixed, N% here)` note when
// that majority covers under 60% of the card's members (h.n is the same denominator topDirs' shares were counted
// against). No module resolves (empty/absent topDirs) ⇒ null, never a broken line.
function cardModule(h) {
  if (h.type === 'directory') return { module: h.label.replace(/\/$/, ''), suffix: '' };
  if (!h.topDirs || !h.topDirs[0] || !h.n) return null;
  const [mod, cnt] = h.topDirs[0];
  const share = cnt / h.n;
  return { module: mod, suffix: share < 0.6 ? ` (mixed, ${pct(share)}% here)` : '' };
}
// STRUCTURE, not a claim (never voice()'d): the same category as the card's own unvoiced `lives in:`/`depends
// on:`/`used by:` lines. `(layer n)` (J4.3) reads straight off the resolved moduleGraph node — omitted only if
// the module somehow resolves to no node at all (never crashes on it).
// §067c: the trailing `/` on the printed module is the SAME directory marker `lives in:`/`depends on:`/`used
// by:`/a directory card's own `label` already use — `cardModule`'s `module` itself stays bare (moduleGraph node
// ids and edge endpoints are unslashed, and this value feeds both the node lookup two lines below and the edge
// filter), so the slash is appended only at render time, never on the value used to resolve or match anything.
// Motivated by a real misread (question-catalog §4.1c): this `in:` line prints FIRST, one line above a file
// card's own unambiguous `→ file <path>` header — a bare directory string sitting there un-marked let an agent
// read the file hit that followed as if it named a place to put a new sibling file, not the file to edit.
export function inLineForCard(model, h) {
  if (!model.moduleGraph) return null;
  const cm = cardModule(h);
  if (!cm) return null;
  const node = model.moduleGraph.nodes.find(n => n.id === cm.module);
  const k = model.moduleGraph.edges.filter(e => e.to === cm.module).length;
  return `in: ${cm.module}/${cm.suffix}${node && node.layer !== undefined ? ` (layer ${node.layer})` : ''} · used by ${k} modules`;
}
// the same locator for a single checked file — the SAME refined module assignment moduleGraph's own nodes/edges
// use (computeArchHits' own memoization pattern: a closure can't survive model.json serialization, so it is
// recomputed once per in-memory model and cached on it, never persisted). §067c: trailing `/` for the same reason
// as inLineForCard above — `check <file>`'s own first line is this same locator, so it gets the same marker.
// §080 — and it must not read as a MEASUREMENT of a place that is not there. `refineModOf` is a pure path
// function: it names a module for any string, existing or not, and `moduleGraph` has no node to contradict it,
// so the first file of a brand-new top-level or second-level directory (`tools/Codegen/Gen.cs` — trial-0.4.0
// §4b's case, an author creating a directory that does not exist yet) used to print
// `in: tools/Codegen/ · used by 0 modules`: a module id no file lives under, and a fan-in of 0 that reads as
// an observation about a real module rather than the absence of one. Same disease class as §057's "this
// concept isn't in the repository" and §070's no-content-foothold banner — a confident shape outrunning what
// was observed. The hedge states the absence and hands back the nearest ancestor that DOES hold files, with
// that ancestor's own layer and fan-in, which are the only measured numbers available.
//
// Deliberately claims nothing further. Ticket 080 asked whether a new directory's COMPANIONS could be mined
// the way ticket 073 mines a new file's; `.system/research/where-new-directory.md` measured five candidate
// directory-birth classes over 1050 real directory births in 11 repos and every one of them failed 073's own
// published acceptance bar (coverage 0.008 against its 0.08 floor, repo-macro precision@1 0.33 against its
// 0.80 bar, firing on 2 of 11 repos — and naming repo furniture when it did), so there is no certified
// companion, sibling or archetype to add here — only the tree, which is a fact and not a prediction.
// A path whose refined module DOES hold files is untouched: its layer and fan-in are real.
export function inLineForFile(model, rel) {
  if (!model.moduleGraph || !model.filesAll) return null;
  const refined = model._archModOf || (model._archModOf = refineModOf(model.filesAll, model.pkgs || [], model.srcRoots || []));
  const mod = refined(rel);
  // "exists" is a fact about the indexed tree, never a threshold: the union `pathsAll ∪ filesAll` is the same
  // liveness set changeArchetypes/buildObligationTable already treat as "alive at HEAD", so a directory holding
  // only unparsed files (a README, a manifest) still counts as existing.
  const holds = d =>
    d === '.'
      ? (model.pathsAll || []).length + model.filesAll.length > 0
      : (model.pathsAll || []).some(f => (f + '/').startsWith(d + '/')) ||
        model.filesAll.some(f => (f + '/').startsWith(d + '/'));
  const meas = m => {
    const node = model.moduleGraph.nodes.find(n => n.id === m);
    const k = model.moduleGraph.edges.filter(e => e.to === m).length;
    return `${node && node.layer !== undefined ? ` (layer ${node.layer})` : ''} · used by ${k} modules`;
  };
  if (!holds(mod)) {
    let anc = mod;
    while (anc !== '.' && !holds(anc)) anc = anc.includes('/') ? anc.slice(0, anc.lastIndexOf('/')) : '.';
    return `in: ${mod}/ does not exist yet — nearest existing: ${anc === '.' ? 'the repo root' : anc + '/'}${meas(anc)}`;
  }
  return `in: ${mod}/${meas(mod)}`;
}
export function whereCmd({
  model,
  query,
  top = 3,
  mapRows = 60,
  exemplarOk = () => true,
  ungrammaredHit = null,
}) {
  const q = query;
  const qt = new Set(tokenize(q).map(normTok));
  const cards = buildCards(model);
  // exact-name hits come from the query's whole words (and the last segment of dotted ones: `res.json` → `json`), never from
  // camelCase fragments — `TestRoutes` must pin `TestRoutes`, not every scope named `test`
  // …and only identifiers, not plain words: `TestRoutes`, `routes_command`, `res.json` pin their scope; `handler` is a word that
  // happens to be a function name too, and the directory `handlers/` (30 files) is the better answer for it
  const qraw = new Set(
    q
      .split(/\s+/)
      .filter(w => tokenize(w).length >= 2 || /[._$]/.test(w))
      .flatMap(w => {
        const t = w.toLowerCase().replace(/[^\w.$]/g, '');
        return t ? [t, t.split('.').pop()] : [];
      })
      .filter(t => t.length > 2)
  );
  const qrawToks = new Map();
  for (const w of q.split(/\s+/)) {
    const t = w.toLowerCase().replace(/[^\w.$]/g, '');
    const toks = tokenize(w).map(normTok);
    if (t) {
      qrawToks.set(t, toks);
      qrawToks.set(t.split('.').pop(), toks);
    }
  } // pinned word → the query tokens it covers
  // inverse document frequency over the cards: a query word every card carries (`test`, `router`, `add`) weighs little, the one
  // word that names the thing (`mount`, `compress`) weighs most; a word no card carries is the agent's phrasing, not a miss
  const df = new Map();
  for (const c of cards) for (const t of c.toks.keys()) df.set(t, (df.get(t) || 0) + 1);
  // instruction fillers never count; a DOMAIN word no card carries stays in the denominator at full weight — the repo not
  // speaking of it must lower the score ("add rate limiting" scored 100% on the word `add` alone when unmatched words were
  // dropped; now it scores what it deserves and the weak-match banner fires)
  for (const t of [...qt]) if (QSTOP.has(t)) qt.delete(t);
  const maxIdf = Math.log2(1 + cards.length);
  const idf = new Map();
  for (const t of qt) idf.set(t, df.get(t) ? Math.log2(1 + cards.length / df.get(t)) : maxIdf);
  const idfSum = [...idf.values()].reduce((a, b) => a + b, 0);
  // §012/G2 — what one query word is WORTH to a card. Every card but a file card answers with its own token
  // weights unchanged. A file card's weight is the max of two channels, because they are different evidence:
  //   · what the file IS — its own basename, its path, its doc comments, the supertypes it implements — at full
  //     weight, exactly as before (`baseToks`);
  //   · what the file CONTAINS — the names of its scopes — in proportion to HOW MUCH of the file carries the
  //     word: one of 3 scopes called `json` says the file is about json, 2 of 169 says almost nothing.
  // Before this, both channels were flat 1 (addTok keeps a max), so a 169-scope test file whose vocabulary
  // happened to contain every query word scored 100% and outranked the small file the query actually named —
  // measured as `where`'s single largest ranking defect on the stratum where the query names its file
  // (express: `added res json test` returned test/app.router.js, then test/res.send.js, over test/res.json.js).
  // No constant: the divisor is the card's own scope count, the same `n` the card already reports.
  const tw = (c, t) =>
    c.memberTok
      ? Math.max(
          c.baseToks.get(t) || 0,
          (c.memberW ?? TOKW.name) * ((c.memberTok.get(t) || 0) / Math.max(1, c.n || 1))
        )
      : c.toks.get(t) || 0;
  let anyExact = false; // §085 — set inside the scoring loop below; see `unknownIdent` at the return
  for (const c of cards) {
    let s = 0;
    for (const [t, w] of idf) s += tw(c, t) * w;
    c.score = idfSum ? s / idfSum : 0;
    // §070 — snapshot the score BEFORE the exact-name/dirName pins below can lift it off zero. This is the
    // card's own bag-of-words overlap with the query and nothing else: a card can only clear zero here by
    // sharing an actual query token with its content (doc comments, member names, values — whatever `c.toks`
    // indexes), never by an identifier or directory NAME merely matching. Read-only bookkeeping: nothing past
    // this line changes what `c.score` becomes or how `hits` gets filtered/sorted/sliced.
    c.lex0 = c.score;
    c.exact = c.names ? [...qraw].some(t => c.names.has(t)) : false; // a query word that IS a function/class name in this file
    if (c.exact) anyExact = true; // §085 — read-only bookkeeping: does the PARSED model declare any of the query's identifier words, anywhere?
    // a pinned identifier that IS most of the query wins outright (`where sendStatus`); one that covers a minority of the
    // query's words only adds to the lexical score — `where command handler for TodoList archive` must rank the command
    // handlers carrying `command`+`handler`+`todo`+`list` above `Entities/TodoList.cs`, which carries only the name (measured)
    if (c.exact) {
      const pinned = [...qraw].filter(t => c.names.has(t));
      const cover = new Set(pinned.flatMap(t => qrawToks.get(t) || [])).size / Math.max(1, qt.size);
      c.score = cover >= 0.5 ? Math.max(c.score, 1) : Math.min(1, c.score + 0.25);
    }
    if (c.dirName) {
      const hit = [...qt].filter(t => c.dirName.has(t));
      if (hit.length) {
        const cover = hit.length / Math.max(1, qt.size);
        // §012/G2 — a directory whose NAME is most of the query still wins outright. One that matches a minority
        // of it is worth exactly the share of the query it covers, not a flat +0.25: that constant routinely lifted
        // a wide directory card above the file the query actually named (petclinic: `src/test/` over
        // ValidatorTests.java on one shared word). Measured: it lifts BOTH strata, and deletes a tuned number.
        c.score = cover >= 0.5 ? Math.max(c.score, 1) : Math.max(c.score, cover);
      }
    }
    c.score = Math.min(1, c.score);
    if (c.degenerate) c.score *= 0.5;
  }
  const rank = c =>
    (c.exact ? 4 : c.type === 'marker' ? 2 : c.type === 'file' ? 1 : 1.5) + (c.facts.length ? 0.25 : 0); // on a tie: pinned identifier > marker > group/directory > file (a file's local facts never lift it over a directory)
  let hits = cards
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score || rank(b) - rank(a) || b.n - a.n || (a.label < b.label ? -1 : 1))
    .slice(0, top);
  const lines = [];
  // §089 — the disclosure register: every hedge/caveat line pushed below that qualifies an otherwise-confident
  // answer is ALSO recorded here as { kind, text }, at the exact site that builds the text — never recomputed
  // from the rendered string later. `text` is the verbatim line as it appears in `lines` (or would, before any
  // stamp/dirty-tree suffix), so a JSON consumer and a text reader are told the identical thing. `kind` reuses
  // whatever internal name already distinguishes the case (matching whatCmd's own `note.kind` vocabulary where
  // the same concept applies — `ungrammared` is shared with whatCmd on purpose).
  const disclosures = [];
  // a steer renders wherever its topic meets the query or its exemplar lives in the card: decided, beside what is practiced
  const steers = (model.steers || []).filter(st => st.found);
  const steerLine = st =>
    st.surfaces
      .filter(sf => sf.value !== null && !sf.retires)
      .map(
        sf =>
          `  ${voice('decided', `${verbalize({ pid: sf.pid, exp: sf.value, kind: st.kind, heritageKind: heritageKindOf(sf.pid, model) }, [st.name])} — ${practicedBy(sf)}${baselineClause(sf)}${st.note ? ' · ' + st.note : ''} · copy ${st.path}:${st.line} \`${st.name}\``, { typ: 'steer', who: st.author, when: st.createdAt })}`
      );
  const topicHit = st => {
    const tt = new Set(tokenize(st.topic).map(normTok));
    return [...qt].some(t => tt.has(t));
  };
  const cardHit = (st, c) =>
    c.type === 'file'
      ? c.label === st.path
      : c.type === 'directory'
        ? st.path.startsWith(c.label)
        : c.members
          ? c.members.some(k => k.startsWith(st.path + '#') && k.split('#')[2] === st.name)
          : false;
  const orphanSteers = steers.filter(st => topicHit(st) && !hits.some(c => cardHit(st, c)));
  for (const st of orphanSteers) {
    const sl = steerLine(st);
    if (sl.length) {
      lines.push(voice('map', `«${q}» → maintainer decision ${st.id} (no card of its own carries it)`));
      lines.push(...sl);
    }
  }
  let noConfidentHit = false,
    suppressedScore = 0; // set when the top hit is demoted to "untrustworthy" below — distinct wording from a genuine zero-hit
  // §070 (research/where-lever) — on the leak-free stratum, 36% of the files `where` should have named share zero
  // content-lexical overlap with the query (`lex0` above). Most of those are NOT the `!hits.length` case below —
  // something ELSE in the repo still scores — so the reader sees a normal-looking ranked list built entirely on an
  // identifier or directory NAME pin, with zero corroborating content-word overlap anywhere in the top hits — the exact shortcut
  // §2.1 of the research doc measured directly ("cards lifted off zero by the exact-name pin without any token
  // match"). Checked before `weak match` below because a name pin can win outright (`score` reaches 1, well past
  // 0.34), so the flat-score banner never catches it — the structural fact that NO shown card's content shares a
  // query word is the one signal here, not a new cutoff (§018/§037's rule: an already-weak answer cannot be made
  // overconfident by saying so, so this fires regardless of how high the pinned score climbed).
  const noContentFoothold = hits.length > 0 && hits.every(h => h.lex0 === 0);
  if (noContentFoothold) {
    const sig = hits[0].exact ? 'an exact identifier/name match' : 'a directory-name match';
    const text = `no card matches these words — the ranking below is by ${sig}, not text overlap; verify before building on it.`;
    lines.push(text);
    disclosures.push({ kind: 'no-content-foothold', text });
  } else if (hits.length && hits[0].score < 0.34) {
    const text = `weak match: the best hit covers ${Math.round(hits[0].score * 100)}% of the query's weight — a hint, not an answer. If the hits look unrelated to what you are writing, open the nearest sibling of the file you expect to edit instead.`;
    lines.push(text);
    disclosures.push({ kind: 'weak-answer', text });
  } else if (hits.length && qt.size >= 3 && !hits[0].exact) {
    const contributing = [...idf.keys()].filter(t => tw(hits[0], t) > 0); // the SAME per-word weight the score was built from, so "which words carried this hit" can never disagree with the score itself
    // mass concentration: "exactly one contributing word" (ratio 1) generalized to how much of the top hit's matched
    // weight sits in its single heaviest word — a hit carried almost entirely by one term is just as coincidental as a
    // one-word hit, even when a second term nominally "contributed" (measured: a query's rare words each independently
    // landing on unrelated cards inflated `contributing.length` past 1 while the hit stayed just as coincidental)
    const weights = contributing.map(t => tw(hits[0], t) * idf.get(t));
    const totalW = weights.reduce((a, b) => a + b, 0);
    const concentration = totalW ? Math.max(...weights) / totalW : 1;
    if (contributing.length < qt.size && concentration >= 0.5) {
      // cross-hit agreement: do the runner-ups (already computed, `hits` is sliced to `top`) point at the same area of
      // the repo as the top hit, or somewhere unrelated? real answers tend to cluster; a coincidental lexical collision
      // usually doesn't, because its matched words came from parts of the repo that have nothing else in common
      const dirOf = c => (c.topDirs && c.topDirs[0] ? c.topDirs[0][0] : c.label);
      const baseName = d => (d || '').split('/').filter(Boolean).pop() || d;
      const sameArea = (a, b) =>
        !!a &&
        !!b &&
        (a === b ||
          baseName(a) === baseName(b) ||
          (a + '/').startsWith(b + '/') ||
          (b + '/').startsWith(a + '/'));
      const runnerUps = hits.slice(1, 3);
      const agreeing = runnerUps.filter(h => sameArea(dirOf(hits[0]), dirOf(h))).length;
      if (runnerUps.length && !agreeing) {
        suppressedScore = hits[0].score;
        hits = [];
        noConfidentHit = true;
      } // no corroboration anywhere in the top few — don't rank it, map the repo instead
      else {
        const text = `note: the top hit matches only «${contributing.join('», «')}» of your ${qt.size} words — verify before building on it.`;
        lines.push(text);
        disclosures.push({ kind: 'partial-word-coverage', text });
      }
    }
  }
  // §085 — the THIRD path into §057's honest negative, and the only one neither §057 nor §070 could reach.
  // §057 asks for the never-parsed file only when `hits` is EMPTY; §070 only when every shown hit has zero
  // content overlap (`lex0`). Between them sits the measured failure: a compound identifier (`indent_style`,
  // `AppleScript`, `ClangFormat`) that `tokenize` SPLITS into ordinary words, each of which really does occur in
  // the code — so hits are non-empty AND `lex0 > 0`, the score clears the 0.34 floor, and a one-word query never
  // reaches the `qt.size >= 3` note either. Every existing check stands down while the ranking is built entirely
  // out of fragments of a name the parsed model never declares. `ungrammaredHit` arrives here exactly when the
  // caller (grain.mjs's `cmdWhere`) found that same text verbatim in a file grain has no grammar for, so the
  // answer the reader wants sits in a file grain cannot read. Nothing new is tuned: the gate is `unknownIdent`
  // (see the return) plus the deterministic verbatim scan §057 already owns.
  //
  // Placed AFTER the whole ladder above and gated on `hits.length` on purpose. The ladder's last arm can SUPPRESS
  // an uncorroborated top hit (`hits = []`, `noConfidentHit`) — a stronger honest negative than any banner — and
  // an earlier placement pre-empted it, measurably: it kept 6 of opencode's rankings that the suppression arm had
  // been discarding. Running last means a suppressed answer stays suppressed and falls through to §057's own
  // message below, which names this same file anyway; only an answer that SURVIVES the ladder is disclosed here.
  if (ungrammaredHit && hits.length) {
    const text = `"${q}" is not a name grain parsed anywhere — the ranking below matches its separate words, not the whole. That exact text appears in ${ungrammaredHit.file}, and grain has no grammar for "${ungrammaredHit.ext}" (never reads that format at all, so this file was never parsed). The answer may be there, unreadable to grain: verify before building on it.`;
    lines.push(text);
    disclosures.push({ kind: 'ungrammared', text });
  }
  if (!hits.length) {
    // §057 — a zero-hit answer here reads as "this concept isn't in the repository", which is only true of the
    // code grain actually reads. `ungrammaredHit` (supplied by the caller — grain.mjs's `findUngrammaredHit`, a
    // bounded substring scan over `ungrammaredFiles`, never a repo-wide grep) says the query's exact text lives,
    // verbatim, in a tracked file whose extension has no grammar at all: a stronger, deterministic sibling of the
    // parsed-but-empty case below, so it takes priority over both other messages when present.
    const zeroHitText = ungrammaredHit
      ? `no lexical match for "${q}" in parsed code — but that exact text appears in ${ungrammaredHit.file}, and grain has no grammar for "${ungrammaredHit.ext}" (never reads that format at all, so this file was never parsed). This may be a real hit grain cannot see. Compact map of the source groups, markers and directories follows regardless.`
      : noConfidentHit
        ? `no confident match for "${q}" — the best lexical hit scored ${Math.round(suppressedScore * 100)}% but its words are covered by unrelated, disagreeing parts of the repo, so it is not trustworthy. Compact map of the source groups, markers and directories follows. Pick the closest entry yourself and open its files; do not re-ask with synonyms.`
        : `no lexical match for "${q}" — compact map of the source groups, markers and directories follows. Pick the closest entry yourself and open its files; do not re-ask with synonyms.`;
    lines.push(zeroHitText);
    // a genuine "nothing found" (neither branch below) is the honest answer itself, not a caveat qualifying a
    // confident one — same precedent as whatCmd's `note.kind === 'absent'`, which is likewise never disclosed
    if (ungrammaredHit) disclosures.push({ kind: 'ungrammared', text: zeroHitText });
    else if (noConfidentHit) disclosures.push({ kind: 'honest-negative', text: zeroHitText });
    lines.push(...bridgeLines(model, qt, df));
    const sorted = cards
      .filter(c => c.type !== 'file')
      .sort((a, b) => b.n - a.n || (a.label < b.label ? -1 : 1));
    for (const c of sorted.slice(0, mapRows))
      lines.push(`  [${c.type}] ${c.label} (${c.n}) → ${c.topDirs.map(([d]) => d + '/').join(' · ')}`);
    if (sorted.length > mapRows)
      lines.push(`  … and ${sorted.length - mapRows} more — re-run with --map-rows ${sorted.length} for all`);
    if (!cards.length)
      lines.push(
        '  (the model holds no groups or directory norms — no strong conventions were found in this repository)'
      );
    return { lines, hits: [], cards, disclosures };
  }
  const bridged = bridgeLines(model, qt, df); // query words the code never says, translated by the commit history
  // the "comes with" recipe's file-shape clause: an accepted auto.filebirth verdict for the SAME population
  // (already computed by learn(), never re-derived here) phrased to read first, before companion/registration
  const filebirthBit = f =>
    f.exp === 'new'
      ? `usually starts a new file (${pct(f.share)}% of ${f.sraw})`
      : `is usually added to an existing file (${pct(f.share)}% of ${f.sraw})`;
  for (const h of hits) {
    const inl = inLineForCard(model, h);
    if (inl) lines.push(inl);
    const stLines = steers.filter(st => cardHit(st, h)).flatMap(steerLine); // decided, printed right under the card's header
    if (h.type === 'file') {
      const qs = [...qt];
      const hitsOf = k => {
        const nm = k.split('#')[2] || '';
        const toks2 = tokenize(nm).map(normTok);
        return (qraw.has(nm.toLowerCase()) ? 10 : 0) + qs.filter(t => toks2.includes(t)).length;
      };
      const matching = h.members
        .map(k => [k, hitsOf(k)])
        .filter(([, n]) => n > 0)
        .sort(
          (a, b) =>
            b[1] - a[1] ||
            tokenize(a[0].split('#')[2] || '').length - tokenize(b[0].split('#')[2] || '').length ||
            (a[0] < b[0] ? -1 : 1)
        )
        .slice(0, 6)
        .map(([k]) => {
          const [, kind, name, line] = k.split('#');
          return `\`${name}\` (${kind}${line ? ', line ' + line : ''})`;
        });
      lines.push(
        voice(
          'map',
          `«${q}» → file ${h.label} — ${h.n} scopes (${scopeLabel(h.part)}, match ${Math.round(Math.min(1, h.score) * 100)}%)${matching.length ? ` · matching here: ${matching.join(' · ')}` : ''}`
        ),
        ...stLines
      );
      const TRIVIAL =
        /^(none|void|str|string|bool|boolean|int|number|float|any|t\.any|object|list|dict|error|unit|self|this|t|f)$/i;
      const carried = (h.carried || [])
        .filter(([mk]) => !mk.startsWith('ret:') || !TRIVIAL.test(mk.slice(4)))
        .sort((a, b) => b[1] - a[1]);
      const cardG = EXT2GRAMMAR[extname(h.label)]; // `h.label` is this card's own file rel path — §048
      if (carried.length)
        lines.push(
          `  carries: ${carried
            .slice(0, 5)
            .map(
              ([mk, n]) =>
                `${mk.startsWith('deco:') ? decoLabel(mk.slice(5), cardG) : mk.startsWith('sup:') ? 'extends ' + mk.slice(4) : 'returns ' + mk.slice(4)} ×${n}`
            )
            .join(' · ')}`
        );
      for (const f of h.facts.slice(0, 3))
        lines.push(
          `  - ${voice(
            'practiced',
            `${factLabel(part(model, h.part), f)}: ${verbalize(
              f,
              f.exemplars.map(e => e.name)
            )} — ${pct(f.share)}% of ${f.sraw}`
          )}`
        );
      const cc = cochangePartners(model, [], 3, h.label);
      if (cc.length)
        lines.push(
          `  historically co-changes with: ${cc.map(c => `${c.partner}${c.dead ? ' (deleted)' : ''} (${c.sup}/${c.commits} commits)`).join(' · ')}`
        );
      continue;
    }
    lines.push(
      voice(
        'map',
        `«${q}» → ${h.type} ${h.label} — ${h.type === 'group' ? `${h.n} members` : h.type === 'marker' ? `${h.n} carriers` : `${h.files?.length ?? '?'} files, ${h.facts.length ? h.n + ' established' : h.n + ' scopes'}`} (${scopeLabel(h.part)}, match ${Math.round(h.score * 100)}%)`
      )
    );
    lines.push(...stLines);
    if (h.type === 'directory' && model.moduleGraph) {
      const id = h.label.replace(/\/$/, '');
      const dep = model.moduleGraph.edges.filter(e => e.from === id).slice(0, 4),
        used = model.moduleGraph.edges.filter(e => e.to === id).slice(0, 4);
      if (dep.length) lines.push(`  depends on: ${dep.map(e => `${e.to}/ (${e.n})`).join(' · ')}`);
      if (used.length) lines.push(`  used by: ${used.map(e => `${e.from}/ (${e.n})`).join(' · ')}`);
      for (const bd of model.boundaries || [])
        if ((id + '/').startsWith(bd.boundary.from + '/'))
          lines.push(
            `  ${voice('decided', `never imports ${bd.boundary.to}/${bd.note ? ' — ' + bd.note : ''}`, { typ: 'boundary', who: bd.author, when: bd.createdAt })}`
          );
    }
    if (h.members)
      lines.push(
        `  lives in: ${h.topDirs.map(([d, n]) => `${d}/ (${Math.round((n / h.n) * 100)}%)`).join(' · ')}`
      );
    const P = part(model, h.part);
    const withLine = k => {
      const [rel2, kind, name] = k.split('#');
      const ln = scopeLine(P, k);
      const end = scopeLineEnd(P, k);
      // §061: `name` for a catch/finally member is its enclosing method/type's OWN name — scopeBacktick already
      // says so ("catch in `findOwner`"), so the trailing "(kind)" would just repeat it; kept only for a genuine
      // declaration, exactly as before this fact existed.
      const tag = ANON_SCOPE_KINDS.has(kind) ? scopeBacktick({ kind, name }) : `\`${name}\` (${kind})`;
      return `${ln ? ptr(rel2, ln, end) : rel2} ${tag}`;
    };
    if (h.type === 'marker') {
      const ex = h.members.slice(0, 3).map(withLine);
      lines.push(
        `  carriers to copy: ${ex.join(' · ')}${h.members.length > 3 ? ` · +${h.members.length - 3} more` : ''}`
      );
      const mkKey = h.mpid
        ? h.mpid
            .replace(/^auto\.deco:@?/, 'deco:')
            .replace(/^auto\.extends:/, 'sup:')
            .replace(/^auto\.returns:/, 'ret:')
        : '';
      const obs = (part(model, h.part).markerObs || {})[mkKey] || [];
      if (obs.length) lines.push(`  its carriers share (observed, not certified): ${obs.join(' · ')}`);
      const mi = (part(model, h.part).markerImplied || {})[mkKey];
      // a marker has no cid of its own — the populations where it IS the accepted convention (its own defining
      // facts, already selected into h.facts by `carries` above) are the only populations it can borrow a
      // filebirth verdict from; matching by their cid is the same "same population" test the group case makes
      // via its role cid, just read off facts the card already carries instead of constructed fresh
      const mFbCids = new Set(h.facts.filter(f => f.pid === h.mpid).map(f => f.cid));
      const mFb = mFbCids.size
        ? part(model, h.part).facts.find(f => f.pid === 'auto.filebirth' && mFbCids.has(f.cid))
        : undefined;
      {
        const bits = [];
        if (mFb) bits.push(filebirthBit(mFb));
        if (mi) {
          if (mi.companion)
            bits.push(
              `a same-stem \`${mi.companion.pattern}\` companion (${pct(mi.companion.share)}% of ${mi.companion.n} have one, e.g. \`${mi.companion.example}\`)`
            );
          if (mi.importedBy)
            bits.push(
              `registration in \`${mi.importedBy.file}\` (imports ${mi.importedBy.n} of ${mi.importedBy.of} carriers)`
            );
          if (mi.importedByPattern)
            bits.push(
              `registration by a \`${mi.importedByPattern.pattern}\` file (${mi.importedByPattern.n} of ${mi.importedByPattern.of} carriers)`
            );
        }
        if (bits.length) lines.push(`  a new carrier comes with: ${bits.join(' · ')}`);
      }
      const best = [...h.facts].sort((a, b) => b.sraw - a.sraw)[0];
      if (best) {
        const own =
          best.pid === h.mpid
            ? best
            : { ...((best.siblings || []).find(sb => sb.pid === h.mpid) || best), kind: best.kind };
        lines.push(
          `  - ${voice(
            'practiced',
            `${verbalize(
              own,
              best.exemplars.map(e => e.name)
            )} — ${pct(best.share)}% of ${best.sraw}${
              own !== best
                ? ` (with: ${verbalize(
                    best,
                    best.exemplars.map(e => e.name)
                  ).replace(/^\w+ here /, '')})`
                : ''
            }${factNotes(best)}`
          )}`
        );
      }
      continue;
    }
    if (!h.facts.length)
      lines.push(
        `  - no convention certified here beyond placement (the group is small, not free-form) — open a member below and copy its shape`
      );
    let bulletFacts = h.facts;
    if (h.type === 'group' && h.roleIdx !== undefined) {
      const pf = (part(model, h.part).profiles || {})[h.roleIdx];
      if (pf) {
        const bits = [
          `${pf.n} members share this skeleton (~${Math.round(pf.coverage * 100)}% of an average member): ${pf.skel}`,
        ];
        for (const pi of pf.perInstance)
          bits.push(
            `one slot is per-instance (${pi.distinct} distinct values in ${pi.total} — e.g. \`${pi.top}\`)`
          );
        for (const sl of pf.slots) bits.push(`slot usually \`${sl.top}\` (${sl.k}/${sl.total})`);
        if (pf.held)
          bits.push(`held since ${pf.held.since}${pf.held.fresh ? ` · ${pf.held.fresh} new in 180d` : ''}`);
        lines.push('  superposition: ' + bits.join(' · '));
      }
      const gi2 = (part(model, h.part).groupImplied || {})[h.roleIdx];
      // the group's own cid convention (`'r' + roleIdx + ':' + kind`) is exactly how h.facts was already
      // filtered when the card was built, so an accepted auto.filebirth fact for this same population is
      // already sitting in h.facts if it exists — no separate lookup or synthetic cid needed
      const fbFact = h.facts.find(f => f.pid === 'auto.filebirth');
      {
        const bits = [];
        if (fbFact) bits.push(filebirthBit(fbFact));
        if (gi2) {
          if (gi2.companion)
            bits.push(
              `a same-stem \`${gi2.companion.pattern}\` companion (${pct(gi2.companion.share)}% of ${gi2.companion.n} have one, e.g. \`${gi2.companion.example}\`)`
            );
          if (gi2.importedBy)
            bits.push(
              `registration in \`${gi2.importedBy.file}\` (imports ${gi2.importedBy.n} of ${gi2.importedBy.of} members)`
            );
          if (gi2.importedByPattern)
            bits.push(
              `registration by a \`${gi2.importedByPattern.pattern}\` file (${gi2.importedByPattern.n} of ${gi2.importedByPattern.of} members are imported by one)`
            );
        }
        if (bits.length) lines.push(`  a new member comes with: ${bits.join(' · ')}`);
      }
      if (model.twins) {
        const tw = model.twins.find(
          t =>
            (t.a.part === h.part && t.a.role === h.roleIdx) || (t.b.part === h.part && t.b.role === h.roleIdx)
        );
        if (tw) {
          const mine = tw.a.part === h.part && tw.a.role === h.roleIdx;
          const other = mine ? tw.b : tw.a;
          const otherSuf = tw.namedDifferently
            ? mine
              ? tw.namedDifferently[1]
              : tw.namedDifferently[0]
            : null;
          lines.push(
            `  twin: structurally the same as «${other.label}» (${other.part})${otherSuf ? `, named \`*${otherSuf[0].toUpperCase()}${otherSuf.slice(1)}\` there` : ''}`
          );
        }
      }
      // folded into the recipe line above — must not also print as one of the ordinary bullets below
      if (fbFact) bulletFacts = h.facts.filter(f => f !== fbFact);
    }
    let dlShown = false; // the first fact that HAS deviants names them — what not to copy
    bulletFacts.slice(0, 6).forEach(f => {
      lines.push(
        `  - ${voice(
          'practiced',
          `${verbalize(
            f,
            f.exemplars.map(e => e.name)
          )} — ${pct(f.share)}% of ${f.sraw}${factNotes(f)}${f.authorConc ? ` · ${authorConcClause(f.authorConc)}` : ''}`
        )}`
      );
      if (!dlShown) {
        const dl = deviantLine(f);
        if (dl) {
          lines.push(dl);
          dlShown = true;
        }
      }
    });
    // exemplars: types and methods before file scopes — a class to copy beats a filename to copy
    const kindRank = e => (/\.[a-z]+$/i.test(e.name) && e.line === 1 ? 1 : 0);
    const ex = [...new Map(h.facts.flatMap(f => f.exemplars.map(e => [e.rel + e.name, [e, f]]))).values()]
      .filter(([e]) => exemplarOk(e.rel))
      .sort((a, b) => kindRank(a[0]) - kindRank(b[0]))
      .slice(0, 3);
    if (ex.length)
      lines.push(
        `  pattern to copy: ${ex.map(([e, f]) => `${ptr(e.rel, e.line, e.endLine)} ${scopeBacktick({ kind: f.kind, name: e.name })}${skipLineNote(part(model, h.part), f, e)}${e.why ? ` — ${e.why}` : ''}`).join(' · ')}`
      );
    else if (h.members) {
      const ms = h.members.slice(0, 3).map(withLine);
      lines.push(`  members to look at: ${ms.join(' · ')}`);
    } else if (h.files?.length)
      lines.push(
        `  files to look at: ${h.files.slice(0, 3).join(' · ')}${h.files.length > 3 ? ` · +${h.files.length - 3} more` : ''}`
      );
    const cc = cochangePartners(
      model,
      h.topDirs.map(([d]) => d)
    );
    if (cc.length)
      lines.push(
        `  historically co-changes with: ${cc.map(c => `${c.partner}${c.dead ? ' (deleted)' : ''} (${c.sup}/${c.commits} commits)`).join(' · ')}`
      );
  }
  lines.push(...bridged);
  // §085 `unknownIdent` — the caller's cue to pay for §057's bounded never-parsed scan on a RANKED answer. Three
  // structural facts, no tunable among them:
  //   · the whole query is ONE word — this is an identifier lookup, not a sentence. It is also what makes the
  //     scan able to succeed at all: §057 matches the query's text VERBATIM, and a multi-word intent ("add rate
  //     limiting") essentially never appears verbatim in a config file, so scanning for it is pure cost.
  //     Measured on spec-kit before this clause: `unknownIdent` was true for 36.9% of commit-message queries and
  //     found something in 0% of them — the scan discipline §057 states ("every other query never opens a file
  //     at all") is kept by this line.
  //   · it is identifier-SHAPED (`qraw`: `tokenize` splits it in two, or it holds a `.`/`_`/`$`). A plain word is
  //     not, so `where users` never asks — and must not: answering a common word from code is correct, not a
  //     fabrication (40 of spec-kit's 51 "confident-wrong" rows are that, an artefact of instrument A's oracle).
  //   · no card's own `names` declares it (`anyExact`). A name the repo really has (`sendStatus`) is something
  //     grain is not blind to, so there is nothing to disclose and no file is opened.
  const oneWord = !/\s/.test(q.trim());
  return { lines, hits, cards, unknownIdent: oneWord && qraw.size > 0 && !anyExact, disclosures };
}
// `how <intent>` — change by example (§J2.2). `where` answers "what governs the place this belongs in"; `how`
// answers a different question — "when a change like this happened here before, which files did it touch?" — and
// answers it only from real commits (`H.fps`, recorded by J2.1). Every match is one historical instance cited by
// its sha, never a certified convention, and the header says so in the map voice.
export function howCmd({
  model,
  H,
  query,
  top = 5,
  msgOf = null,
  mapRows = 60,
  exemplarOk = () => true,
  shapes = true,
}) {
  const q = query;
  const qt = new Set(tokenize(q).map(normTok));
  for (const t of [...qt]) if (QSTOP.has(t)) qt.delete(t); // instruction fillers never count — same cut whereCmd makes
  const fps = (H && H.fps) || [];
  // path tokens per DISTINCT path, memoized: the same file recurs across many commits, and `nameTokens`
  // re-tokenizes its basename every time otherwise (measured: the memo is worth ~2x at CFG.fpsCap)
  const pathToks = new Map();
  const toksOfPath = p => {
    let v = pathToks.get(p);
    if (v === undefined) {
      v = nameTokens(p).map(normTok);
      pathToks.set(p, v);
    }
    return v;
  };
  const carries = (fp, t) => {
    if (fp.toks.includes(t)) return true; // message tokens and file-name tokens are one set, checked without building it
    for (const f of fp.files) if (toksOfPath(f).includes(t)) return true;
    return false;
  };
  // document frequency over exactly the universe the match runs on: one commit counts once per token, whether that
  // token came from its message or from one of its file names. `H.msgTokCommits` is deliberately NOT reused here —
  // it counts only commits that HAVE a message (fps holds message-less ones too) and knows nothing of path tokens,
  // so pairing it with a path-side df would weigh the two halves of one token set on two different denominators.
  // Counted for the QUERY's tokens only: df for every token the whole history ever said is work thrown away, and
  // it is what would have forced a persisted `fpsPathDf` field (and a MODEL_V bump) to stay inside the latency
  // budget. Scoped this way the pass costs one walk of `fps` per query word, with no per-commit allocation at all.
  const df = new Map();
  for (const t of qt) {
    let n = 0;
    for (const fp of fps) if (carries(fp, t)) n++;
    df.set(t, n);
  }
  const N = fps.length;
  const maxIdf = Math.log2(1 + N); // a query word no commit ever said stays in the denominator at full weight
  const idf = new Map();
  for (const t of qt) idf.set(t, df.get(t) ? Math.log2(1 + N / df.get(t)) : maxIdf);
  const idfSum = [...idf.values()].reduce((a, b) => a + b, 0);
  const scored = [];
  if (idfSum)
    for (const fp of fps) {
      let s = 0;
      for (const [t, w] of idf) if (carries(fp, t)) s += w;
      const score = s / idfSum;
      if (score >= 0.34) scored.push({ fp, score });
    } // the same "weak match" floor whereCmd warns at — here it is the cut, not a caveat
  // ranking: score first; ties broken by RECENCY (the newest instance is the one to copy — a repo's own habits
  // drift, and the oldest of three identical-scoring commits is the least likely to still be how it is done), then
  // by sha so two runs on one repository can never disagree
  scored.sort(
    (a, b) =>
      b.score - a.score || b.fp.ts - a.fp.ts || (a.fp.sha < b.fp.sha ? -1 : a.fp.sha > b.fp.sha ? 1 : 0)
  );
  const matches = scored.slice(0, Math.max(1, Math.floor(top) || 5));
  if (!matches.length) {
    // nothing invented: fall back to whereCmd's own compact map, whole and unmodified
    const { lines: mapLines } = whereCmd({ model, query: q, mapRows, exemplarOk });
    return {
      lines: [
        voice(
          'map',
          `«${q}» → no past change matches this intent — there is no example to follow, so the structural map of this repository follows instead`
        ),
        ...mapLines,
      ],
      matches: [],
      places: [],
      missing: [],
      shape: null,
    };
  }
  const K = matches.length;
  const msgFor = fp => {
    const m = msgOf ? msgOf(fp.sha) : null;
    return m || (fp.toks.length ? fp.toks.join(' ') : '(no commit message)');
  };
  const refined =
    model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || [], model.srcRoots || []));
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]); // every path alive at HEAD, code or not — `fp.files` spans both
  const currentOf = currentPathOf(fps, live);
  // counted on the CURRENT path, so a file renamed inside the match window is one place at k/K, not two half-places
  // — and deduplicated per commit, because the renaming commit itself lists both of its own sides in `files`.
  // `weights` mirrors `counts` exactly (same dedup, same loop) but accumulates each contributing match's OWN
  // `score` instead of 1 — the matcher already computed that score; this is the only place downstream of it that
  // discarded it (§005). `k`/`of` keep their exact original meaning (a raw commit count) since `howEval`'s §J2.3
  // gate and `how-hook`'s `p.k >= 2` filter (grain.mjs) both read `k` as that count — only the SORT ORDER changes,
  // ranking by the strength of the commits that contributed a place rather than by how many happened to. A place
  // touched once by a 0.9-score commit now outranks one touched once by a 0.35-score commit, where before both
  // tied on k=1 and fell back to alphabetical order — no new tuned constant, just the score the matcher already produced.
  const counts = new Map();
  const weights = new Map();
  for (const m of matches) {
    const once = new Set();
    for (const f of m.fp.files) {
      const cur = currentOf(f);
      if (once.has(cur)) continue;
      once.add(cur);
      counts.set(cur, (counts.get(cur) || 0) + 1);
      weights.set(cur, (weights.get(cur) || 0) + m.score);
    }
  }
  const topScopes = new Map(); // the scopes the TOP-ranked match itself changed, per file — one example's shape, not a tally
  for (const key of matches[0].fp.scopes || []) {
    const parts = key.split('#');
    if (parts.length < 3) continue;
    const cur = currentOf(parts[0]);
    const arr = topScopes.get(cur) || [];
    if (!arr.includes(parts[2])) arr.push(parts[2]);
    topScopes.set(cur, arr);
  }
  let places = [...counts.keys()]
    .map(rel => ({
      rel,
      k: counts.get(rel),
      of: K,
      module: refined(rel),
      exists: live.has(rel),
      scopes: (topScopes.get(rel) || []).slice(0, 6),
      weight: +weights.get(rel).toFixed(3),
    }))
    .sort((a, b) => b.weight - a.weight || b.k - a.k || (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  // §066: a place dead at HEAD is dead code to an agent following this list — never somewhere to edit. Same
  // liveness source `cochangeData` computes its own `live` set from (core.mjs ~9154, one house-wide answer to "is
  // this path still here", never a second/third liveness check invented per renderer). §020 had this render
  // `(deleted)` instead of dropping the entry; measured on a real corpus that still put 13 of 28 CleanArchitecture
  // places on files that no longer exist — marking a dead file still hands it to the reader as a "place such a
  // change touched". Omitting it is the other option the ticket's own acceptance text always allowed ("marks it OR
  // omits it — decide which and document why"); dropping is strictly the more useful answer for an agent about to
  // edit code, so `how` now omits rather than marks.
  places = places.filter(p => p.exists);
  // §066: the "1/N" long tail — a place touched by only 1 of K matched commits is one anecdote, not a place "such
  // a change touched". Reuses `how-hook`'s own existing bar for exactly this (`places.filter(p => p.k >= 2)`,
  // grain.mjs) rather than a new constant. Applied only when it leaves something: a single-match query (K=1) or a
  // set of equally-thin matches has no k>=2 evidence to prefer over, and dropping to zero places would be a false
  // "nothing to say" — the same refusal-to-invent-absence principle as `completenessDirectional` (§063).
  const strongPlaces = places.filter(p => p.k >= 2);
  if (strongPlaces.length) places = strongPlaces;
  // `sources: ['cochange']` is the ONLY correct configuration here and is not a limitation to relax later: `how`
  // names its files from the commit history and never parses one, so it can never supply the `newFileScopes` the
  // `'recipe'` source needs. Bolting `'recipe'` on would require adding a parse step first.
  const missing = missingLines(model, places.map(p => p.rel), { sources: ['cochange'] });
  // the certified SHAPE this intent looks like, if any (§J4.1). Two independent readings of the same query: the
  // archetype's own message vocabulary, scored on the idf already computed above, and how much of its certified
  // module/suffix footprint the places `what` finds for this query cover (a `g:` role cell has no query-side
  // analogue without parsing, so coverage is read over `m:`/`k:` alone). The stronger reading decides, on the same
  // 0.34 weak-match floor the commit matcher itself cuts at.
  let shape = null;
  if (shapes && (model.changeArchetypes || []).length && idfSum) {
    const qCells = new Set();
    // `whatCmd` now returns its own (a)∪(b) file set. §039: this used to be rebuilt here from the two published
    // halves, and `defined` among them is DISPLAY-CAPPED at 12 — so on any query with more than twelve declaration
    // hits the cover ratio below was computed against a truncated footprint and came out too low, which can push a
    // genuinely-matching archetype under the 0.34 floor and silence a certified shape entirely. Same defect class
    // as §036: a display cap deciding a verdict. It still costs a `buildCards(model)` that `how` otherwise never
    // pays — which is why `howEval` turns this whole pass off: it reads `places` only, and runs `howCmd` once per
    // candidate commit.
    const qFiles = new Set(whatCmd({ model, H: null, query: q, exemplarOk }).spreadFiles);
    for (const f of qFiles) {
      qCells.add('m:' + refined(f));
      const sf = sufOf(f);
      if (sf) qCells.add('k:' + sf);
    }
    let best = null;
    for (const a of model.changeArchetypes) {
      let s = 0;
      for (const [t, w2] of idf) if (a.toks.includes(t)) s += w2;
      const cert = a.cells.filter(c => c.certified);
      const mk = cert.filter(c => c.cell[0] === 'm' || c.cell[0] === 'k');
      const cover = mk.length ? mk.filter(c => qCells.has(c.cell)).length / mk.length : 0;
      const score = Math.max(s / idfSum, cover);
      if (score >= 0.34 && (!best || score > best.score || (score === best.score && a.n > best.a.n)))
        best = { a, score, cert };
    }
    if (best) shape = { id: best.a.id, label: best.a.label, n: best.a.n, cells: best.cert };
  }
  const lines = [
    voice(
      'map',
      `«${q}» → how such a change runs here: ${K} past change${K === 1 ? '' : 's'} match (evidence: ${shape ? 'a certified shape, then examples' : 'examples, not a certified shape'})`
    ),
  ];
  if (shape)
    lines.push(
      voice(
        'practiced',
        `certified shape "${shape.label}" (${shape.n} changes): ${shape.cells.map(c => `${archCellLabel(model, c.cell)} (${c.k} of ${shape.n})`).join(' · ')}`
      )
    );
  for (const m of matches)
    lines.push(
      voice('example', `"${msgFor(m.fp)}" — ${m.fp.files.length} file${m.fp.files.length === 1 ? '' : 's'}`, {
        sha: m.fp.sha.slice(0, 7),
        date: new Date(m.fp.ts * 1000).toISOString().slice(0, 7),
      })
    );
  // §066: `places` is already filtered to files live at HEAD (above) — every remaining entry's `exists` is true,
  // so there is no longer a `(deleted)` branch to render here. A places array can now legitimately be empty (every
  // file the matched commits touched has since been deleted) — the header is only worth printing when there is at
  // least one place to list under it.
  if (places.length) {
    lines.push('places such a change touched:');
    for (const p of places)
      lines.push(
        `  ${p.rel} (${p.k}/${p.of}) — ${p.module}${p.scopes.length ? ` · scopes: ${p.scopes.join(', ')}` : ''}`
      );
  }
  lines.push(...missing);
  return {
    lines,
    matches: matches.map(m => ({
      sha: m.fp.sha,
      ts: m.fp.ts,
      msg: msgFor(m.fp),
      files: m.fp.files,
      score: +m.score.toFixed(3),
    })),
    places,
    missing,
    shape,
  };
}
// `what <words>` (§J3.3) — a fourth lens, distinct from both: `where` answers "where should new code implementing
// this go", `how` answers "what did past changes touching this look like", `what` answers "what IS this in this
// repository already" — every kind of fact the model carries about one concept, in one card: declarations (a),
// indexed values (b), its spread across modules (c), sibling values (d), historical commit mentions (e) and
// file-level fan-in (f). Reuses `buildCards` + `whereCmd`'s own IDF unmodified: a query word every card carries
// weighs little, the one word that names the thing weighs most — the same math, a different harvest over the hits.
const VALUE_KIND_LABEL = { enum: 'enum member', str: 'string literal' };
// §018/§011/§014 — one shared defect, three field-test angles: `what` answering its strongest negative claim
// ("has no declarations or values anywhere") in cases where grain actually has the evidence to hedge. whatCmd's
// empty branch below picks between three outcomes: `gated` (§011), `blind` (§018 and §014's own shape reproduced
// without Go — see `blindFiles`'s own note on why it does NOT cover 014's real gin case), or the plain absence
// claim — which must stay exactly as terse as it always was when neither applies. Both evidence functions are
// pure (no I/O); `cmdWhat` (grain.mjs) supplies the one input (`rawScopes`) and the one precomputed hit
// (`blindHit`) that need it, so `whatCmd` itself never touches the filesystem.
//
// case A (§018 Rust macro bodies): a file PARSES but contributes zero real scopes at all — a macro-only body, a
// bare top-level const/var block, any future extraction gap. `blindFiles` names WHICH files these are (pure
// render off model.filesAll vs the union of every partition's fileScopes keys — only kinds other than file/module
// ever populate a fileScopes entry, see `learn()`'s own `fileScopes` build — no re-parsing, no per-language
// logic); whether the QUERIED name actually lives in one of them is decided by `cmdWhat`'s bounded raw-text
// re-scan (only those already-blind files are read, never the whole repository) — an unconditional repo-wide
// hedge was tried and measured wrong: it made a genuinely absent query and a query naming a real macro-emitted
// type read identically whenever the repo had ANY unrelated blind file (nearly always true), which defeats the
// one property this fix exists to deliver (cross-check: cross-check-honest-silence.test.mjs, (d2)). NOTE: this
// does NOT cover 014's Go const/var gap on gin — measured directly (see this ticket's log): gin's const/var-
// bearing files (errors.go, context.go, gin.go, …) also declare real functions, so they are not zero-scope files
// at all. That narrower, per-declaration gap needs actual extraction (014's own ticket), not an answer-shape fix.
// `peerAnomalous` (§037) narrows the set to the blind files that are actually ANOMALOUS: those whose own grammar
// does yield scopes elsewhere in THIS repository. A `.yml` that extracts nothing is behaving exactly as every
// other `.yml` here does — nothing is hidden inside it, that is simply what a data file looks like to grain; a
// `.kt` that extracts nothing among 566 that parse fine is an outlier, and the anomaly IS the evidence. The
// comparison is against the repo's own peers under the same grammar, never a hardcoded list of "data formats", so
// it stays threshold-free and language-free. Measured across nine real repos: this one condition removes every
// config-file false fire (`what cache` → a workflow YAML, `what middleware` → composer.json, `what variant` →
// Cargo.toml) without touching a single true one. Off by default — the empty-answer path (§018) keeps its
// original, deliberately looser scan, because an answer that already says "nothing found" cannot be made
// overconfident by a hedge; see `whatCmd`'s own note on why the two paths carry different evidentiary bars.
export function blindFiles(model, { peerAnomalous = false } = {}) {
  const seen = new Set();
  for (const p of model.partitions || []) for (const rel of Object.keys(p.fileScopes || {})) seen.add(rel);
  const blind = (model.filesAll || []).filter(f => !seen.has(f)).sort();
  if (!peerAnomalous) return blind;
  const yields = new Set();
  for (const f of model.filesAll || []) {
    const g = EXT2GRAMMAR[extname(f)];
    if (g && seen.has(f)) yields.add(g);
  }
  return blind.filter(f => yields.has(EXT2GRAMMAR[extname(f)]));
}
// `ungrammaredFiles` (§057) — a DISJOINT, stronger sibling of `blindFiles`. `blindFiles` names files grain
// ATTEMPTED to parse (they carry a grammar, hence appear in `model.filesAll` — see `walkFiles`/`headTree`, both
// of which only ever admit a path whose extension has an entry in `EXT2GRAMMAR`) but which yielded zero scopes.
// This function names the files grain never attempted at all: tracked paths (`model.pathsAll`, every path at
// HEAD/on disk, no grammar filter) whose extension has no registered grammar — a 455-file `.xml` tree, a `.md`
// changelog, a `.png`. `model.filesAll` is exactly `model.pathsAll` restricted to grammared extensions, so this
// is that restriction's complement, re-checked by extension defensively (a path could in principle be absent
// from `filesAll` for an unrelated reason — CODE_RE, MINE_EXCL — and this must never call THAT a missing
// grammar). Unlike `blindFiles`'s peer-anomalous gate (§037, needed because "parsed to zero scopes" is only
// SOMETIMES suspicious — a data file with a working grammar can legitimately hold nothing scope-worthy), "this
// extension has no grammar at all" is unconditionally true the moment it's true: no heuristic, no peer
// comparison, no threshold. Callers pair this with a plain substring scan over the exact query text (grain.mjs's
// `findUngrammaredHit`) to decide whether an honest-negative answer owes the reader a disclosure.
export function ungrammaredFiles(model) {
  const known = new Set(model.filesAll || []);
  return (model.pathsAll || []).filter(p => !known.has(p) && !EXT2GRAMMAR[extname(p)]).sort();
}
// case B (§011): was the query's EXACT literal seen at all, before the df population gate (CFG.valueDfMin/
// valueDfMaxShare, `learn()`'s `vPlaces`) removed it from model.valueIndex? That gate runs over each file-kind
// scope's own `.vals`, the exact shape `rawScopes` already carries — the current tree's cached scope snapshot
// (`loadScopes` in grain.mjs, already used by `export`/others; NO re-parsing). Exact string equality only,
// deliberately tighter than valueHits' token-coverage match above: this makes a factual claim ("this literal
// exists, here, this many times") and a coincidental shared token is not evidence for that claim the way it is
// for a fuzzy "what is this concept" lookup. `rawScopes` is optional and lazily supplied by the caller (cmdWhat)
// the same way `H` already is — omitted (or no match), this is a silent no-op, never a partial claim.
function gatedValueEvidence(model, rawScopes, q) {
  if (!rawScopes) return null;
  const byKind = new Map(); // e.k -> Set of files carrying value q under that kind
  const contsByKind = new Map(); // e.k -> Set of container ids (§056: e.c) carrying value q under that kind
  for (const s of rawScopes) {
    if (s.kind !== 'file') continue;
    for (const e of s.vals || []) {
      if (e.v !== q) continue;
      (byKind.get(e.k) || byKind.set(e.k, new Set()).get(e.k)).add(s.rel);
      if (e.c != null) (contsByKind.get(e.k) || contsByKind.set(e.k, new Set()).get(e.k)).add(e.c);
    }
  }
  if (!byKind.size) return null;
  // the kind with the strongest evidence speaks — a query rarely lands on more than one kind, and when it does the
  // best-attested one is the more useful thing to name
  const [k, fileSet] = [...byKind].sort((a, b) => b[1].size - a[1].size || (a[0] < b[0] ? -1 : 1))[0];
  const files = [...fileSet].sort(),
    df = files.length;
  const dfMax = Math.ceil(CFG.valueDfMaxShare * (model.files || df));
  // §056 — a data-grammar KEY gated out of `model.valueIndex` by the cross-file df floor still has a real
  // STRUCTURAL neighbor set: the OTHER keys declared in the exact same container (e.g. a YAML `services:`
  // mapping's other service ids) — a WITHIN-file/container fact that needs no cross-file repetition to be true,
  // unlike `model.valueSiblings` (which additionally requires each member to have separately cleared the df
  // floor — the wrong bar for "does this container have other named entries", which is why a same-file cluster
  // of once-only keys never reaches it). Computed directly off `rawScopes` (never off `model.valueIndex`), so it
  // is available exactly when the df-gate disclosure below fires, independent of any other key's own frequency.
  // Kept to `key`-kind evidence only: a `str`/`enum` sibling set is the cross-file value-concordance question
  // `model.valueSiblings` already answers correctly, and duplicating it here would just restate that fact under
  // a looser (single-file) bar.
  let siblings = null;
  if (k === 'key') {
    const conts = contsByKind.get(k);
    const sibSet = new Set();
    outer: for (const s of rawScopes) {
      if (s.kind !== 'file') continue;
      for (const e of s.vals || []) {
        if (e.k !== 'key' || e.v === q || e.c == null || !conts.has(e.c)) continue;
        sibSet.add(e.v);
        if (sibSet.size >= 12) break outer;
      }
    }
    if (sibSet.size) siblings = [...sibSet].sort();
  }
  return { valueKind: k, files, df, tooRare: df < CFG.valueDfMin, tooCommon: df > dfMax, siblings };
}
// case C (§032): the query is an external/vendor type — never declared in this repository, so (a)'s declaration
// search has no card of its own to anchor on and, left alone, silently substitutes fuzzy name-token overlap over
// UNRELATED local declarations instead (measured on Slim: `what MiddlewareInterface` named 6 incidental hits —
// `MiddlewareDispatcherInterface`, test method names — while missing all 21 real `implements`/type-hint sites).
// The fix consults the two STRUCTURAL, per-file, threshold-free facts `learn()` already records for exactly this
// question — `fileSups` (heritage: extends/implements) and `fileTypeRefs` (parameter/return type hints, §032's
// own addition, `fileSups`'s sibling) — matched by the query's EXACT name (case-insensitive), never by token
// overlap: the whole point is to name files that reference THIS type, not a sibling that merely shares a word
// with it. Called by `whatCmd` only when the query has no exact local declaration (`exactLocal` there) — a type
// that IS declared locally already has a correct, complete answer through (a).
function typeRefHits(model, q) {
  const ql = q.toLowerCase();
  const hits = new Map(); // rel -> Set('implements' | 'type hint')
  for (const p of model.partitions || []) {
    for (const [rel, sups] of Object.entries(p.fileSups || {}))
      if (sups.some(x => x.toLowerCase() === ql))
        (hits.get(rel) || hits.set(rel, new Set()).get(rel)).add('implements');
    for (const [rel, refs] of Object.entries(p.fileTypeRefs || {}))
      if (refs.some(x => x.toLowerCase() === ql))
        (hits.get(rel) || hits.set(rel, new Set()).get(rel)).add('type hint');
  }
  return hits;
}
// `tested by:` (§065) — the model already carries three signals for "which test file covers this symbol", and
// no command answered that until now (G catalog §6.4: 9 instances, 18 calls in the measured corpus — a reader
// had to already know the test's own name to look it up, which defeats the point of asking). Same-stem naming
// wins outright when it fires: cheapest to compute and the most literal claim there is ("this IS the test file
// for this source file/symbol, by the repo's own naming convention"). Co-change/import evidence — a real signal,
// but a weaker "these tend to change/link together" claim — is only ever consulted as a fallback.
const TEST_PATH_RE = /(^|[/_.-])(tests?|specs?)([/_.-]|$)/i;
// the PascalCase convention glues the suffix straight onto the stem with no separator at all (`FooTests.cs`,
// `FooTest.java`, `FooSpec.scala`) — requiring a capitalized `Test(s)`/`Spec(s)` right after a lowercase/digit
// stem character is what keeps this from also matching an ordinary word that merely ends in "test" (`latest.cs`
// is not a test file); a real identifier essentially never capitalizes mid-word the way a glued suffix does.
const TEST_SUFFIX_RE = /[a-z0-9](Tests?|Specs?)\.[^./]+$/;
function looksLikeTestPath(rel) {
  return TEST_PATH_RE.test(rel) || TEST_SUFFIX_RE.test(rel);
}
// same-stem candidate basenames for ONE defining file — the conventions actually surveyed for this ticket: a
// `Tests`/`Test`/`Spec` suffix glued onto the stem before the extension (`UpdateTodoList.cs` ->
// `UpdateTodoListTests.cs`), a `.test`/`.spec` infix, or a `_test`/`test_`/`-test`/`-spec` affix. Matched on the
// basename alone, case-insensitively (a naming convention holds regardless of a repo's own casing habits) and
// never on directory — a file that merely LIVES under a `test/` directory without a matching stem is co-change/
// edge evidence, not this.
function sameStemTestCandidates(rel) {
  const ext = extname(rel);
  const base = basename(rel, ext);
  if (!base) return new Set();
  return new Set(
    [
      `${base}Tests${ext}`,
      `${base}Test${ext}`,
      `${base}Spec${ext}`,
      `${base}.test${ext}`,
      `${base}.spec${ext}`,
      `${base}_test${ext}`,
      `test_${base}${ext}`,
      `${base}-test${ext}`,
      `${base}-spec${ext}`,
    ].map(s => s.toLowerCase())
  );
}
// the full evidence gather for one `what` answer, over a bounded set of the symbol's own defining files (the
// caller passes only the top-3 by declaration count — the same fan-in bound (f)'s `usedBy` already applies, for
// the same reason: a symbol declared identically in dozens of files does not need dozens of separate co-change
// lookups to answer "what tests this"). Same-stem (file-stem convention above, or the symbol's OWN name as an
// exact dot/underscore/hyphen-delimited segment of an already test-like path's basename — the `res.sendStatus` ->
// `test/res.sendStatus.js` shape, where the declaring file's own stem, `response`, shares nothing with the test
// file at all) is tried first and wins outright when it fires. Otherwise: model.cochange, at the single-file 1/3
// floor §063's cochangeData already established for this exact narrower-question shape (one file, not a multi-
// file change), restricted to partners whose OWN path reads as a test — never a general co-change claim; and
// model.edges, restricted to a test-like importer of the defining file. The two fallbacks are reported together —
// different mechanisms, the same weaker tier of evidence for the same claim.
export function testedByEvidence(model, definedFiles) {
  const relSet = [...new Set((definedFiles || []).map(d => d.rel))];
  if (!relSet.length) return null;
  const pathsAll = model.pathsAll || model.filesAll || [];
  const sameStem = new Set();
  for (const rel of relSet) {
    const cands = sameStemTestCandidates(rel);
    if (!cands.size) continue;
    for (const p of pathsAll) {
      if (p === rel) continue;
      if (cands.has(basename(p).toLowerCase())) sameStem.add(p);
    }
  }
  const names = new Set((definedFiles || []).map(d => d.name).filter(Boolean));
  if (names.size)
    for (const p of pathsAll) {
      if (relSet.includes(p) || !looksLikeTestPath(p)) continue;
      if (basename(p).split(/[._-]/).some(seg => names.has(seg))) sameStem.add(p);
    }
  if (sameStem.size) return { kind: 'same-stem', files: [...sameStem].sort() };

  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
  const weak = new Map();
  for (const rel of relSet)
    for (const h of cochangeData(model, [rel]))
      if (looksLikeTestPath(h.file) && !weak.has(h.file))
        weak.set(h.file, { file: h.file, sup: h.sup, commits: h.commits, dead: h.dead });
  for (const rel of relSet)
    for (const e of model.edges || [])
      if (e.to === rel && looksLikeTestPath(e.from) && !weak.has(e.from))
        weak.set(e.from, { file: e.from, dead: !live.has(e.from) });
  if (!weak.size) return null;
  return { kind: 'evidence', files: [...weak.values()].sort((a, b) => (a.file < b.file ? -1 : 1)) };
}
export function whatCmd({
  model,
  H,
  query,
  exemplarOk = () => true,
  rawScopes = null,
  blindHit = null,
  ungrammaredHit = null,
}) {
  const q = query;
  const qt = new Set(tokenize(q).map(normTok));
  for (const t of [...qt]) if (QSTOP.has(t)) qt.delete(t); // instruction fillers never count — same cut whereCmd/howCmd make

  // (a) declarations: score every card by whereCmd's own IDF, then — for each hit — list the card's own MEMBERS
  // (not its aggregate vocabulary) whose OWN name tokens overlap the query. A directory card has no members and
  // never contributes here; that is deliberate, "declared" names a scope, not a place.
  const cards = buildCards(model);
  const df = new Map();
  for (const c of cards) for (const t of c.toks.keys()) df.set(t, (df.get(t) || 0) + 1);
  const maxIdf = Math.log2(1 + cards.length);
  const idf = new Map();
  for (const t of qt) idf.set(t, df.get(t) ? Math.log2(1 + cards.length / df.get(t)) : maxIdf);
  const idfSum = [...idf.values()].reduce((a, b) => a + b, 0);
  for (const c of cards) {
    let s = 0;
    for (const [t, w] of idf) s += (c.toks.get(t) || 0) * w;
    c.score = idfSum ? s / idfSum : 0;
  }

  const defined = [];
  const seenDef = new Set();
  const pushDef = (rel, kind, name, line, endLine) => {
    if (!line || !exemplarOk(rel)) return;
    const key = rel + '#' + kind + '#' + name + '#' + line;
    if (seenDef.has(key)) return;
    seenDef.add(key);
    defined.push({ rel, kind, name, line, endLine: endLine && endLine > line ? endLine : line });
  };
  // ANY shared token used to be enough (`.some`) — a single incidental word ("level", "web") from a multi-token
  // query was enough to claim an unrelated symbol as a hit, with full confidence (§002). The query's OWN tokens
  // must now be FULLY covered by the candidate's tokens: a no-op for a single-token query (still exactly the old
  // `.some` behavior — `status` matching `PENDING_STATUS` is unaffected), a real tightening for a multi-token one
  // (`PriorityLevel` no longer covers `LogLevel`; a 5-word dotted config key no longer covers a class that only
  // shares one of its five words).
  const coversQt = toks => qt.size > 0 && [...qt].every(t => toks.has(t));
  const nameHits = name => coversQt(new Set(tokenize(name).map(normTok)));
  for (const c of cards) {
    if (c.score <= 0) continue;
    if (c.type === 'file') {
      const P = part(model, c.part);
      for (const [kind, name, line, endLine] of P.fileScopes?.[c.label] || []) {
        if (kind === 'catch' || kind === 'finally') continue;
        if (nameHits(name)) pushDef(c.label, kind, name, line, endLine);
      }
    } else if (c.type === 'group' || c.type === 'marker') {
      const P = part(model, c.part);
      for (const k of c.members || []) {
        const [rel, kind, name] = k.split('#');
        // §061: a catch/finally member's `name` is its enclosing method/type's OWN name (blockScope's borrowed
        // "named after its owner", §extractScopes) — the same reason the file-card branch above already excludes
        // them; a role/marker group mixes every non-file/module kind (§induceRoles), so this branch needs the
        // identical guard or a query for the enclosing declaration surfaces its unrelated catch/finally twin too.
        if (kind === 'catch' || kind === 'finally') continue;
        if (!nameHits(name)) continue;
        pushDef(rel, kind, name, scopeLine(P, k), scopeLineEnd(P, k));
      }
    }
  }
  const ql = q.toLowerCase();
  // §036: an exact-name match sorts first, ahead of the old rel/line order — a display cap must show the true
  // answer, not merely count it. Ties within "exact" or within "not exact" keep the previous rel/line order
  // (Array#sort is stable), so this is a superset of the old ordering, not a behavior change for any query with
  // zero or one exact match already inside the first 12.
  defined.sort((a, b) => {
    const ea = a.name.toLowerCase() === ql,
      eb = b.name.toLowerCase() === ql;
    if (ea !== eb) return ea ? -1 : 1;
    return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line;
  });
  // §032/§036: exactLocal — is the query the EXACT name of something declared here (case-insensitive), not merely
  // a token-overlap hit? "no" is the exact shape of an external/vendor type — `defined`'s fuzzy matches above, if
  // any, only share WORDS with the query; none of them IS the query. Only then does the structural reference
  // lookup below run — a type that IS declared locally already has a correct, complete answer through (a).
  //
  // Computed over the FULL sorted set, BEFORE the splice(12) display cap two lines down. §036: with heavy
  // token collision (a common word/suffix shared by a dozen unrelated declarations) the old code computed this
  // over the already-truncated list, so the real declaration could be pushed past position 12 by nothing more
  // than alphabetically-earlier paths — manufacturing a false "external/vendor" verdict about a type declared
  // right here. A display cap must never feed a semantic verdict.
  const exactLocal = defined.some(d => d.name.toLowerCase() === ql);
  // §039 — the same lesson as §036, one step further: everything DERIVED from the declaration hits is computed
  // from this full set too, not from the twelve rows that survive the cap. `spread:` and `used by: N files` read
  // as measurements OF THE REPOSITORY, and a developer judging whether a symbol is safe to change gets a
  // systematically optimistic number when the cap silently truncates the input to the count. The rendered list
  // stays capped — that is a real readability constraint — but the truncation is now stated (`+N more`) instead
  // of swallowed, and `spreadFiles` is returned so `howCmd`'s archetype cover can stop rebuilding it from the
  // capped half. A display cap must decide nothing but what is displayed.
  const definedAll = defined.slice();
  defined.splice(12);

  // (b) values: valueIndex keys (§J3.1) whose VALUE half tokenizes to something the query says
  const valueHits = [];
  for (const [key, places] of Object.entries(model.valueIndex || {})) {
    const i = key.indexOf(':');
    const k = key.slice(0, i),
      v = key.slice(i + 1);
    if (coversQt(new Set(tokenize(v).map(normTok)))) valueHits.push({ key, k, v, places });
  }
  valueHits.sort(
    (a, b) => b.places.length - a.places.length || (a.v < b.v ? -1 : a.v > b.v ? 1 : a.k < b.k ? -1 : 1)
  );

  // (c) spread: (a) ∪ (b)'s files, grouped by the same refined module assignment inLineForFile uses
  const spreadFiles = new Set(definedAll.map(d => d.rel)); // §039: the full set, never the capped one
  for (const h of valueHits) for (const [rel] of h.places) spreadFiles.add(rel);
  const spread = [];
  if (spreadFiles.size && model.filesAll) {
    const refined = model._archModOf || (model._archModOf = refineModOf(model.filesAll, model.pkgs || [], model.srcRoots || []));
    const byMod = new Map();
    for (const rel of spreadFiles) {
      const m = refined(rel);
      byMod.set(m, (byMod.get(m) || 0) + 1);
    }
    spread.push(
      ...[...byMod]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 5)
        .map(([module, n]) => ({ module, n }))
    );
  }

  // (d) siblings — DELETED (§052). It printed the OTHER members of any container a matched value sits in, which
  // by construction is exactly the set of values that did NOT match the query. Measured across 7 languages
  // (.system/issues/052-what-siblings-noise/log.md): per-value precision 0.364 [0.29–0.44] over 165 blind hand
  // verdicts, against a pre-registered 0.70 bar and a tie-break that counts every unsure value as a hit — so
  // 0.364 is an upper bound. It fired on 218 of 420 of the repositories' own vocabulary queries and rendered a
  // mean of 72.7 values per line, worst single line 759, all in the `practiced` (statistical-claim) voice. The
  // gate does carry real signal (an arbitrary-container decoy baseline measured 0.127, z = 4.99), but this is a
  // PUSH surface — volunteered inside the answer to a different question — and §044's ruling is that a push
  // surface needs precision the reader does not have to audit. Restricting to NAMED containers was measured too
  // and does not rescue it: still 27.5 values per line, and it zeroes 3 of the 7 languages outright.
  //
  // The evidence keeps its home, exactly as §044 kept `model.twins`: `model.valueSiblings`/`valueContainer`/
  // `valueNorms` are untouched and `export` publishes them verbatim, and the PULL surface — `check`/`review`'s
  // `kin:` line — still speaks about these containers. `kin:` is the right home: it fires only when the reader's
  // own change touched that container, and it reads `model.valueNorms`, the KT/λ-certified co-travel test that
  // this line never consulted. Across the corpus that certification accepts 3 of 2393 containers; `what` was
  // rendering all 2393.

  // (e) commits: model.msgAffinity (built at index time from H.msgAff, §J2.4) works from the model alone — locating
  // it never needs H. The rendered count/date DOES need H.fps (§J2.1), so — exactly like `how` — that half is
  // loaded lazily by the caller and degrades all-or-nothing: no H means no `changes:` line, never a partial one.
  const affRow = (model.msgAffinity || []).find(r => [...qt].some(t => normTok(r.t) === t || r.t === t));
  let changes = null;
  if (affRow && H && H.fps && H.fps.length) {
    const hits = H.fps.filter(fp => fp.toks.includes(affRow.t));
    if (hits.length)
      changes = {
        commits: hits.length,
        last: new Date(Math.max(...hits.map(fp => fp.ts)) * 1000).toISOString().slice(0, 7),
      };
  }

  // (f) fan-in: incoming file-level edges into the top 3 declaration files, ranked by how many declarations matched.
  // §064 — a bare count could not be acted on: a reader had to fall back to grep to find the actual files, making
  // this the one answer measured worse than grep in the question-catalog study. The names are already sitting in
  // model.edges (no new extraction), so this now carries the real fan-in FILE NAMES, deduped and sorted, with the
  // rendered list capped the same way `defined`'s own display cap works two screens up (§039: a cap decides only
  // what is SHOWN, never what is measured — `total` always carries the true count, uncapped).
  let usedBy = null;
  let top3 = new Set();
  if (definedAll.length) {
    const byFile = new Map();
    for (const d of definedAll) byFile.set(d.rel, (byFile.get(d.rel) || 0) + 1); // §039: ranked over every hit, not the twelve shown
    top3 = new Set(
      [...byFile]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 3)
        .map(([rel]) => rel)
    );
    const userFiles = [...new Set((model.edges || []).filter(e => top3.has(e.to)).map(e => e.from))].sort();
    if (userFiles.length) usedBy = { files: userFiles.slice(0, 12), total: userFiles.length };
  }

  // (f2) tested by (§065): same-stem naming, else co-change/import evidence — see testedByEvidence's own note.
  // Bounded to the same top-3 declaration files (f) already ranked, for the same reason (f) is.
  const testedBy = top3.size ? testedByEvidence(model, definedAll.filter(d => top3.has(d.rel))) : null;

  // (g) structural references (§032) — see `typeRefHits`'s own note. Only consulted for a name with no exact
  // local declaration; the count is real (an exact-name match against per-file structural facts, not token
  // overlap) but the NAME itself resolves to nothing declared here, so it is disclosed, never presented as an
  // ordinary `defined:`/`used by:` fact.
  let referenced = null;
  if (!exactLocal) {
    const refHits = typeRefHits(model, q);
    if (refHits.size) {
      const implN = [...refHits.values()].filter(s => s.has('implements')).length;
      const hintN = [...refHits.values()].filter(s => s.has('type hint')).length;
      referenced = { files: refHits.size, implements: implN, typeHint: hintN };
    }
  }

  const lines = [`«${q}» → what it is here:`];
  if (defined.length)
    lines.push(
      voice(
        'practiced',
        `defined: ${defined.map(d => `${ptr(d.rel, d.line, d.endLine)} \`${d.name}\` (${d.kind})`).join(' · ')}${definedAll.length > defined.length ? ` · +${definedAll.length - defined.length} more` : ''}`
      )
    );
  if (valueHits.length)
    lines.push(
      voice(
        'practiced',
        `values: ${valueHits.map(h => `\`${h.v}\` in ${h.places.length} place${h.places.length === 1 ? '' : 's'} (${VALUE_KIND_LABEL[h.k] || h.k})`).join(' · ')}`
      )
    );
  if (spread.length)
    lines.push(voice('practiced', `spread: ${spread.map(s => `${s.module} (${s.n})`).join(' · ')}`));
  if (changes)
    lines.push(
      voice(
        'practiced',
        `changes: ${changes.commits} commit${changes.commits === 1 ? '' : 's'} mention it, last ${changes.last} — \`grain how "${q}"\` for the shape`
      )
    );
  if (usedBy)
    lines.push(
      voice(
        'practiced',
        `used by: ${usedBy.files.join(', ')}${usedBy.total > usedBy.files.length ? ` · +${usedBy.total - usedBy.files.length} more` : ''}`
      )
    );
  if (testedBy)
    lines.push(
      voice(
        'practiced',
        testedBy.kind === 'same-stem'
          ? `tested by: ${testedBy.files.join(', ')}`
          : `tested by: ${testedBy.files.map(f => f.file + (f.dead ? ' (deleted)' : '')).join(', ')} (co-change/import evidence, not a same-stem match)`
      )
    );
  else if (definedAll.length)
    lines.push(
      voice(
        'map',
        `tested by: no test file identified for this symbol — same-stem naming, co-change history and import edges found no match; that does not prove no test exists`
      )
    );
  if (referenced) {
    const bits = [];
    if (referenced.implements)
      bits.push(
        `implements/extends it in ${referenced.implements} file${referenced.implements === 1 ? '' : 's'}`
      );
    if (referenced.typeHint)
      bits.push(
        `takes or returns it as a parameter/return type in ${referenced.typeHint} file${referenced.typeHint === 1 ? '' : 's'}`
      );
    lines.push(
      voice(
        'map',
        `«${q}» has no declaration anywhere in this repository (likely an external/vendor type) but is referenced structurally in ${referenced.files} file${referenced.files === 1 ? '' : 's'} — ${bits.join(' · ')}. Matched by its exact name against grain's own recorded supertype and parameter/return-type facts, not a resolved import — this count may still miss usages the extractor cannot see structurally (dynamic instantiation, reflection, string-based type references).`
      )
    );
  }
  let note = null;
  // §089 — the disclosure register, same convention as whereCmd's own: every hedge below is ALSO recorded here as
  // { kind, text }, `text` the verbatim rendered line, `kind` reusing `note`'s own existing kind vocabulary.
  // Deliberately separate from `note` itself (never adds a field to it) — `note`'s shape must not change, only
  // grow a sibling.
  const disclosures = [];
  // §037 — until now every honest-negative disclosure fired ONLY on an empty answer, and the field showed that is
  // the wrong half of the problem. An empty result already reads as "grain found nothing"; a page of unrelated
  // token-overlap hits reads as "grain found your thing", which is exactly when a caveat is most needed and was
  // least present. (Measured on okhttp: `what MAX_CONCURRENT_STREAMS` returned one unrelated TEST method and
  // suppressed the blind-file caveat built for precisely this case — `Settings.kt` parses to zero scopes on a real
  // tree-sitter-kotlin defect, so the true `const val` was invisible.)
  //
  // `weakName` states that case exactly: the answer is non-empty, yet NOTHING in it IS the query — no declaration
  // and no value carries the name, they only share words with it. That predicate is only trustworthy because §036
  // computes `exactLocal` over the full set, before the display cap.
  //
  // The ≥2-token condition is not a tuning knob; it is §002's own cut applied to the same evidence. For a SINGLE-
  // token query `coversQt` degrades to "any symbol containing this token", and by the identical logic that token's
  // verbatim appearance somewhere in a file is the birthday paradox, not evidence — a 30KB doc-comment-heavy file
  // contains almost any English word. Measured over 825 non-empty answers on nine real repos: without this
  // condition the caveat fires on 7.2% of them and the fires are essentially all single-word concept queries
  // («json», «auth», «impl», «filter», «found»); with it, 1.7%, and the fires are compound identifiers a reader
  // plainly copied out of a source file. That 1.7% is the number this disclosure has to be worth, and the empty-
  // answer path is deliberately NOT held to it — an answer that already says "nothing found" cannot be made
  // overconfident by a hedge, so it keeps §018's looser substring scan over every blind file. Different claims,
  // different evidentiary bars.
  const weakName =
    !!(defined.length || valueHits.length || referenced) &&
    !exactLocal &&
    !valueHits.some(h => h.v.toLowerCase() === ql) &&
    qt.size >= 2;
  if (weakName && blindHit) {
    // supplied by cmdWhat's bounded, word-boundary, peer-anomalous re-scan — never a repo-wide grep
    const text = voice(
      'map',
      `nothing above IS «${q}» — those hits only share words with it. The exact name does appear in ${blindHit}, a file that parsed with zero extracted scopes while files of its own kind parse normally here. Grain cannot see inside it, so a real declaration of «${q}» may be missing from this answer.`
    );
    lines.push(text);
    note = { kind: 'blind-weak', value: q, file: blindHit };
    disclosures.push({ kind: 'blind-weak', text });
  }
  if (!defined.length && !valueHits.length && !referenced) {
    // no INDEXED presence — but "indexed" and "exists" are not the same claim (§011/§018/§014): a gated
    // value (seen, excluded by the df floor) or a symbol whose exact text lives in a zero-scope file (§018/§014
    // shape) each get their own one-line disclosure instead of silently collapsing into the same bare "nothing" a
    // truly absent symbol gets.
    const gv = gatedValueEvidence(model, rawScopes, q);
    if (gv) {
      // the plain absence claim would be FALSE here — replaced, not appended
      const label = VALUE_KIND_LABEL[gv.valueKind] || gv.valueKind;
      // §056 — a same-container sibling list, when the gated evidence found one (see gatedValueEvidence's own
      // note): appended, never in place of, the df-floor explanation itself.
      const sibTxt = gv.siblings
        ? ` Declared alongside: ${gv.siblings.slice(0, 8).map(s => `\`${s}\``).join(', ')}${gv.siblings.length > 8 ? ` (+${gv.siblings.length - 8} more)` : ''}.`
        : '';
      const text =
        (gv.tooRare
          ? `«${q}» was seen as a ${label} in ${gv.df} file${gv.df > 1 ? 's' : ''} (${gv.files.slice(0, 3).join(', ')}) — below the ${CFG.valueDfMin}-file floor where concordance begins, so it is not indexed. Seen, not absent.`
          : gv.tooCommon
            ? `«${q}» was seen as a ${label} in ${gv.df} files — above the commonality ceiling (over ${Math.round(CFG.valueDfMaxShare * 100)}% of the repository), so it is treated as boilerplate rather than a distinguishing concordance. Seen, not absent.`
            : `«${q}» was seen as a ${label} in ${gv.df} file${gv.df > 1 ? 's' : ''} but was not retained in the value index. Seen, not absent.`) + sibTxt;
      const voiced = voice('map', text);
      lines.push(voiced);
      note = { kind: 'gated', value: q, valueKind: gv.valueKind, df: gv.df, files: gv.files, siblings: gv.siblings || [] };
      disclosures.push({ kind: 'gated', text: voiced });
    } else if (ungrammaredHit) {
      // §057 — a certified-absence sibling stronger than `blindHit` below: the exact text was found, on a
      // bounded re-scan (grain.mjs's `findUngrammaredHit`), inside a tracked file whose extension has no
      // grammar at all (`ungrammaredFiles`). Unlike `blindHit`'s "parsed to zero scopes" (a heuristic that needs
      // peer-anomaly framing to mean anything), "grain has no grammar for this format" is unconditionally true —
      // the plain absence claim below would be actively false here, not merely incomplete, so it is replaced.
      const text = voice(
        'map',
        `«${q}» has no declarations or values anywhere grain can parse — but that exact text appears in ${ungrammaredHit.file}: grain has no grammar for "${ungrammaredHit.ext}" and never reads that format at all. This may be a real declaration grain simply never looked at.`
      );
      lines.push(text);
      note = { kind: 'ungrammared', value: q, file: ungrammaredHit.file, ext: ungrammaredHit.ext };
      disclosures.push({ kind: 'ungrammared', text });
    } else if (blindHit) {
      // the exact text was found, on a bounded re-scan, inside a file that parsed to zero real scopes
      const text = voice(
        'map',
        `«${q}» is not indexed as a declaration or value — but that exact text appears in ${blindHit}, a file that parsed with zero extracted scopes. Grain cannot see inside it, so this may be a real declaration it missed.`
      );
      lines.push(text);
      note = { kind: 'blind', value: q, file: blindHit };
      disclosures.push({ kind: 'blind', text });
    } else {
      lines.push(voice('map', `«${q}» has no declarations or values anywhere in this repository's code`));
      note = { kind: 'absent' };
    }
    if (affRow)
      lines.push(
        voice(
          'example',
          `«${affRow.t}» appears in no code card here, but commits saying it touched: ${affRow.files
            .slice(0, 3)
            .map(([f, n]) => `\`${f}\` (${n})`)
            .join(' · ')}${affRow.ex ? ` — e.g. "${affRow.ex[1]}" (${affRow.ex[0]})` : ''}`,
          { sha: affRow.ex ? affRow.ex[0] : null }
        )
      );
  }

  // `definedTotal`/`spreadFiles`/`weakName` are internal (§039/§037): `cmdWhat` destructures the published fields
  // by name, so none of these reaches `what --json`. They exist for the two in-process callers — `howCmd`, which
  // needs the UNCAPPED (a)∪(b) file set, and `cmdWhat`, which needs to know whether a weak answer is worth paying
  // a bounded blind-file re-scan for before it touches the filesystem.
  return {
    lines,
    defined,
    definedTotal: definedAll.length,
    spreadFiles: [...spreadFiles],
    weakName,
    values: valueHits.map(h => ({ value: h.v, kind: h.k, places: h.places })),
    spread,
    changes: changes || {},
    usedBy: usedBy || {},
    referenced,
    testedBy: testedBy || null,
    note,
    disclosures,
  };
}
// `selftest --how` (§J2.3) — a leave-one-out gate on `how`'s own evidence quality: for each of the last `last`
// real commits with >=2 files (a single-file commit gives leave-one-out nothing to hold out against — fps entries
// with 1 file, like a plain scaffold commit, still count toward the matching universe, they are just never
// EVALUATED as a candidate), rebuild the intent `how` would have seen from that commit's own tokens, and ask
// `how` to predict the commit's files using every OTHER commit as evidence — the commit itself is removed from
// the footprint universe first, or it would trivially "predict" its own files perfectly. A path/content grep over
// the same tokens is the naive baseline `how` is meant to beat.
// Truth and BOTH arms run over `model.pathsAll` (every tracked path, not only the code-parseable ones `filesAll`
// holds) so `how`'s wider file universe can never claim a recall win over files a grep baseline could never see.
// A candidate with zero predicted places, on either arm, still contributes P=0/R=0 to every mean/median —
// excluding "no match" cases would make the gate gameable by only ever answering the easy intents.
// Returns { how: {meanP, medP, meanR, medR}, grep: {meanP, medP, meanR, medR}, n, noMatch }: `n` is the candidate
// count, `noMatch` counts candidates where `how` predicted zero places (still included in `n` and every mean/median).
export function howEval({ model, H, root, last = 100 }) {
  const fps = (H && H.fps) || [];
  const pathsAll = model.pathsAll || model.filesAll || [];
  const live = new Set(pathsAll);
  const eligible = fps.filter(fp => fp.files.length >= 2 && fp.files.length <= CFG.megaCap);
  const n = Math.max(0, Math.floor(last) || 0);
  const candidates = n > 0 ? eligible.slice(-n) : []; // `fps` is oldest-first (history.mjs replay(), §J2.1) — the LAST n are the most recent

  // grep-baseline tokens, computed ONCE for the whole call (they do not depend on which commit is held out): a
  // path's basename tokens via `nameTokens`+`normTok` — the exact composition `howCmd` itself uses for path
  // tokens (core.mjs's `toksOfPath`) — and, for text files up to the same 1.5 MB cap `parseBlobs` applies to a
  // blob, its content tokenized and normTok'd the same way. Token-set intersection rather than a raw substring
  // test, so "handler" and "handling" count as the same hit whether the token came from a path or a line of code
  // — and so a stemmed intent token (already normTok'd, from `fp.toks`) compares against normTok'd content on
  // equal footing.
  const pathToks = new Map();
  const tokensOfPath = p => {
    let v = pathToks.get(p);
    if (v === undefined) {
      v = new Set(nameTokens(p).map(normTok));
      pathToks.set(p, v);
    }
    return v;
  };
  const contentToks = new Map();
  const tokensOfContent = p => {
    if (contentToks.has(p)) return contentToks.get(p);
    let v = null;
    try {
      const buf = readFileSync(join(root, p));
      // a NUL byte anywhere in the first 8KB is the same cheap binary heuristic git itself uses (core.diff.binary) —
      // good enough to keep an image/archive/etc. from being tokenized as text without a per-extension list
      if (buf.length <= 1.5e6 && buf.subarray(0, 8000).indexOf(0) === -1)
        v = new Set(tokenize(buf.toString('utf8')).map(normTok));
    } catch {
      /* deleted, unreadable, or not a plain file at this path — path tokens alone still apply */
    }
    contentToks.set(p, v);
    return v;
  };

  const prf = (predicted, truth) => {
    if (!predicted.size) return { p: 0, r: 0 }; // no prediction ⇒ P=0/R=0, never excluded
    let hit = 0;
    for (const f of predicted) if (truth.has(f)) hit++;
    return { p: hit / predicted.size, r: truth.size ? hit / truth.size : 0 };
  };

  const howP = [],
    howR = [],
    howF1 = [],
    grepP = [],
    grepR = [],
    grepF1 = [];
  let noMatch = 0;
  const f1 = (p, r) => (p + r ? (2 * p * r) / (p + r) : 0); // 0 when both P and R are 0 — a total miss is F1=0, not NaN
  for (const C of candidates) {
    const intent = C.toks.join(' '); // `C.toks` is already tokenize+normTok'd (history.mjs) — `howCmd` re-tokenizes the same words, a safe no-op
    const fps2 = fps.filter(fp => fp.sha !== C.sha); // leave-one-out: C must not be allowed to match itself
    const { places } = howCmd({ model, H: { ...H, fps: fps2 }, query: intent, shapes: false }); // the shape pass costs a buildCards() per call and this loop reads `places` only
    const predictedHow = new Set(places.filter(p => p.k >= 1).map(p => p.rel));
    const truth = new Set(C.files.filter(f => live.has(f))); // a leave-one-out truth check can't credit a file no longer alive at HEAD

    const intentToks = new Set(C.toks);
    const predictedGrep = new Set();
    if (intentToks.size)
      for (const p of pathsAll) {
        let hit = false;
        for (const t of tokensOfPath(p))
          if (intentToks.has(t)) {
            hit = true;
            break;
          }
        if (!hit) {
          const ct = tokensOfContent(p);
          if (ct)
            for (const t of intentToks)
              if (ct.has(t)) {
                hit = true;
                break;
              }
        }
        if (hit) predictedGrep.add(p);
      }

    if (!predictedHow.size) noMatch++;
    const h = prf(predictedHow, truth),
      g = prf(predictedGrep, truth);
    howP.push(h.p);
    howR.push(h.r);
    howF1.push(f1(h.p, h.r));
    grepP.push(g.p);
    grepR.push(g.r);
    grepF1.push(f1(g.p, g.r));
  }

  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const median = a => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  // F1 (harmonic mean of P and R) alongside the frozen P/R criterion: a system that returns most of the repo
  // (grep) gets recall≈1 almost by construction, which makes "how's recall ≥ grep's recall" nearly unwinnable
  // for a precise tool regardless of how good it is — F1 penalizes over-returning and under-returning alike, so
  // it is not distorted by the two arms returning wildly different result-set sizes (§Bramka J2.3, gate re-run)
  return {
    how: {
      meanP: mean(howP),
      medP: median(howP),
      meanR: mean(howR),
      medR: median(howR),
      meanF1: mean(howF1),
      medF1: median(howF1),
    },
    grep: {
      meanP: mean(grepP),
      medP: median(grepP),
      meanR: mean(grepR),
      medR: median(grepR),
      meanF1: mean(grepF1),
      medF1: median(grepF1),
    },
    n: candidates.length,
    noMatch,
  };
}
// §069 (research/where-lever, `.system/research/where-ranking-design.md` §4.4) — leak subtraction for ANY
// history-reading lever a future `where` ranker might add. `howEval` just above protects itself cheaply: it
// drops the candidate commit from `fps` before handing history to `howCmd`, because `howCmd` matches directly
// against `H.fps` and nothing else. A future `where`-side lever (commit-message affinity, co-change propagation,
// a birth-place prior — the three measured on that research branch) needs the same protection, but over more of
// `H`: those three read `H.msgAff` / `H.msgTokCommits` / `H.fileCommits` / `H.nonMegaCommits` / `H.lc`'s birth
// records directly, not just `fps`. Left alone, such a lever sees the very commit that CREATED the candidate —
// that commit's message and file list ARE the ground truth `whereEval` is scoring against, so the lever
// "predicts" the answer from the question. Measured: a message-affinity lever scored `hit@3` 0.500 on
// openzeppelin with its own commit left in, 0.000 once subtracted — up to 2× inflation.
// Every field this function touches is a plain additive counter (one commit's contribution is exactly −1
// wherever it added +1), so subtracting one commit's contribution is exact, not an approximation — this is NOT
// true of `model.cochange` / `model.msgAffinity` (or `H.cochange` / `H.scopeCochange`, their un-pruned-by-model
// but still support/confidence-FILTERED cousins on `H` itself): those are gated by a support/confidence floor or
// an MDL cut applied before the aggregate is ever exposed, so subtracting one commit's contribution cannot
// restore a pair the floor already dropped, and reading them here would silently stay leaky. This function
// therefore strips `cochange`/`scopeCochange` from the returned object entirely — a lever that needs co-change
// must rebuild it from the (now leak-subtracted) `fps`, the same way `H.pairSup` was rebuilt into `H.cochange`
// in the first place, and a read of `.cochange` on the result throws instead of quietly returning leaky data.
// `whereEval` has no such lever wired in today (`whereCmd`'s score is purely lexical/structural — nothing here
// changes that), so this is currently unused by any product code path; it exists so the next lever cannot ship
// without the one property that makes this harness trustworthy for judging it.
export function leakSubtractedH(H, sha) {
  if (!H) return H;
  const self = (H.fps || []).find(fp => fp.sha === sha);
  const fps = (H.fps || []).filter(fp => fp.sha !== sha);
  if (!self) return { ...H, fps, cochange: undefined, scopeCochange: undefined };

  const msgAff = {};
  for (const [t, byFile] of Object.entries(H.msgAff || {})) msgAff[t] = { ...byFile };
  const msgTokCommits = { ...(H.msgTokCommits || {}) };
  const fileCommits = { ...(H.fileCommits || {}) };
  const dec = (obj, k) => {
    if (obj[k] == null) return;
    obj[k] -= 1;
    if (obj[k] <= 0) delete obj[k];
  };
  for (const t of self.toks) {
    if (msgAff[t]) {
      for (const f of self.files) dec(msgAff[t], f);
      if (!Object.keys(msgAff[t]).length) delete msgAff[t];
    }
    dec(msgTokCommits, t);
  }
  for (const f of self.files) dec(fileCommits, f);
  const nonMegaCommits = Math.max(0, (H.nonMegaCommits || 0) - 1);

  // birth records: `H.lc` (per-scope lifecycle) carries no sha (§13.3's lineage remap discards it), so a scope
  // born by THIS commit is identified the same way `whereEval`'s own truth derivation identifies it — the file
  // half of its key is one of `self.files` and its birth timestamp equals `self.ts`. Demoted to `newFile: false`
  // rather than deleted: every other lifecycle fact on the entry (mods/churn/author) still describes something
  // real, only "this commit is what created it" must go dark for evaluating this one candidate.
  let lc = H.lc;
  if (H.lc) {
    lc = new Map(H.lc);
    for (const [k, L] of lc)
      if (L.newFile && L.first === self.ts && self.files.includes(k.split('#')[0])) lc.set(k, { ...L, newFile: false });
  }

  return { ...H, fps, msgAff, msgTokCommits, fileCommits, nonMegaCommits, lc, cochange: undefined, scopeCochange: undefined };
}
// `selftest --where` (§J2.3's sibling gate) — the same automatically-derived ground truth `selftest --how` runs
// on (real commits), asked the other question. `how` grades a prediction of which files an intent TOUCHES;
// `where` answers "where do such things live, what is expected there, which exemplar to copy", and a commit that
// ADDED a file is this repository's own recorded answer to exactly that: the message says what was wanted, the
// file that resulted is where the answer landed. Each such commit is therefore one (query, relevant file) pair
// labelled by the repository itself — no hand-labelling, no external notion of good structure — and `where` is
// scored as a RANKER over its own cards rather than as a set predictor.
//   · query — the commit's own message tokens, the identical derivation `howEval` feeds `how` (`fp.toks`), so the
//     two harnesses can never drift on what an "intent" is. Nothing is stripped, cleaned or re-weighted here: a
//     harness that pre-processes the query measures a pre-processor that does not ship.
//   · truth — the files that commit ADDED, followed through later renames to the path they carry at HEAD. Birth
//     comes from `H.lc`, the per-scope lifecycle: its `newFile` flag records the add, and `lc` spans the WHOLE
//     history, so a file born in a bulk commit (never in `fps`, §J2.1's megaCap) is correctly left out instead of
//     being mistaken for born at the first small commit that happens to touch it. Truth is narrowed to
//     `model.filesAll` — a file grain never indexed has no card and no path either arm can rank, so grading it
//     would measure the indexer, not the ranking — and BOTH arms are narrowed to that same universe, so neither
//     can win or lose on index coverage (the mirror of `howEval`'s widening to `pathsAll` for the same reason).
//   · baseline — the naive ranker the card machinery has to be worth more than: every indexed path, ordered by
//     how many distinct query tokens its own path carries. Content is deliberately NOT read (unlike `howEval`'s
//     set-valued grep arm): ranking by content-token overlap ranks by file size, since a longer file contains
//     more distinct words — an artifact, not a baseline.
//   · two readings, both arms — `hit` credits an answer only when it names the born file itself; `place` also
//     credits an answer that merely CONTAINS it (a directory card it sits under, a role group or marker whose
//     members include it — whose "carriers to copy" are then literally the new file's peers), and for the
//     baseline, a ranked path from the same directory. `where` deliberately ranks a directory or group above a
//     bare file (`rank()` above), so grading it on file cards alone would grade a design decision as a defect.
//   · two strata — a commit message very often contains the words of the file it created ("add bson render"), and
//     a name matcher wins those on the name alone. `unnamed` re-runs the identical scoring over only those
//     candidates where NO born file's own name (`nameTokens`, the repo's own "what does this name say") shares a
//     token with the query: the half no name matcher can win, reported BESIDE the pooled numbers, never instead
//     of them. Together with the baseline arm that is two independent controls on the one confound this ground
//     truth cannot remove — the query and the answer were written by the same person in the same sitting.
//   · a third, additive stratum (§071) — every query above is built from `toks`, the commit message run through
//     `tokenize`+`normTok`, which SPLITS camelCase/snake_case (`sendStatus` → `send`+`status`) — so none of them
//     can ever contain a verbatim identifier, and `whereCmd`'s own exact-name pin (`qraw`/`c.exact`) can only ever
//     fire off a query's own whole, unsplit word. That is an instrument boundary, not a fact about `where`: typed
//     by a human, `where sendStatus` pins correctly. `symbol` re-runs the identical scoring over just the
//     candidates whose raw message carried such a word (`fp.symToks`, history.mjs), on a query that keeps it
//     whole ALONGSIDE the ordinary split form — never replacing `where`/`base`/`unnamed` above, which stay
//     computed exactly as before.
// Returns { where, base, unnamed: { n, where, base }, symbol: { n, where, base }, n, silent }, each arm
// { hit3, mrr, place3, placeWidth }: `n` is the candidate count, `silent` counts candidates where `where` ranked
// nothing at all (a genuine no-match or the concentration safeguard suppressing an untrustworthy top hit — both
// still count as a 0, or the gate would be gameable by staying quiet on everything hard). `place3` discounts a
// containment-only credit by 1/cardWidth (§068) so a directory or group wide enough to cover most of the
// repository cannot pass as a precise hit; `placeWidth` is the mean file-count of the cards actually credited,
// printed beside place3 so that artifact is visible directly instead of requiring a researcher to dig it out by
// hand.
export function whereEval({ model, H, last = 100 }) {
  const DEPTH = 10; // the ranked list is read this deep: `hit3`/`place3` are the product's OWN default `--top 3`; the rest of the depth is there so `mrr` can tell "just missed" from "nowhere at all"
  const fps = (H && H.fps) || [];
  const filesAll = model.filesAll || [];
  const live = new Set(filesAll);
  // a file's birth: the earliest commit any of its scopes was first seen in, and whether that commit ADDED the
  // file. `lc` keys carry the file's CURRENT path (replay() moves a renamed file's rows, §13.3), so this map is
  // keyed by the path the file has at HEAD.
  const birth = new Map();
  for (const [k, L] of (H && H.lc) || []) {
    const rel = k.split('#')[0];
    if (!live.has(rel)) continue;
    const cur = birth.get(rel);
    if (!cur || L.first < cur.ts) birth.set(rel, { ts: L.first, added: !!L.newFile });
    else if (L.first === cur.ts && L.newFile) cur.added = true;
  }
  // the same lineage in the other direction: `fps[*].renames` maps a historical path to what it became, so the
  // commit that added `flask/config.py` is still credited with the file living at `src/flask/config.py` today.
  // Bounded walk — a rename cycle (A→B in one commit, B→A in another) must not spin.
  const renamedTo = new Map();
  for (const fp of fps) for (const [o, nw] of fp.renames || []) renamedTo.set(o, nw);
  const finalPath = p => {
    let x = p;
    for (let i = 0; i < 64 && renamedTo.has(x); i++) {
      const y = renamedTo.get(x);
      if (y === x) break;
      x = y;
    }
    return x;
  };
  const claimed = new Set();
  const eligible = [];
  for (const fp of fps) {
    // `fps` is oldest-first (history.mjs replay(), §J2.1) — on a timestamp tie the earlier commit keeps the file
    const truth = [];
    for (const f of fp.files) {
      const cur = finalPath(f);
      if (claimed.has(cur)) continue;
      const b = birth.get(cur);
      if (b && b.added && b.ts === fp.ts) {
        truth.push(cur);
        claimed.add(cur);
      }
    }
    if (truth.length) eligible.push({ toks: fp.toks, symToks: fp.symToks || [], truth });
  }
  const n = Math.max(0, Math.floor(last) || 0);
  const candidates = n > 0 ? eligible.slice(-n) : []; // the LAST n are the most recent — the conventions in force now

  const pathToks = new Map();
  const tokensOfPath = p => {
    let v = pathToks.get(p);
    if (v === undefined) {
      v = new Set(tokenize(p).map(normTok));
      pathToks.set(p, v);
    }
    return v;
  };
  const dirOf = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.');
  // §068 — `place` was gameable by card width: a directory or group card wide enough to cover most of the
  // repository contains the truth file almost by construction, so crediting it the same 1 a precise hit earns
  // measures the harness's own leniency, not the ranker (found live: a candidate "card" was 64% of its repo).
  // `cardWidth` is the number of DISTINCT files the credited card actually spans — a directory's own `files`
  // list, or the distinct file paths behind a group/marker's member scopes — with no reference to total repo
  // size and no tunable cutoff: a card of its own single file (== a `hit`) is width 1 and keeps full credit: the
  // discount is purely the card's own composition, structurally derived, never a hardcoded number.
  const cardWidth = h => {
    if (h.type === 'directory') return (h.files && h.files.length) || 1;
    const files = new Set((h.members || []).map(k => String(k).split('#')[0]));
    return files.size || 1;
  };
  // the naive baseline's own notion of a "card" is a ranked file's immediate directory — precomputed once since
  // it depends only on `filesAll`, not on any one candidate — so the same 1/width discount can be applied to
  // BOTH arms and the two place@3 numbers stay comparable rather than one being graded on a coarser curve
  const dirFileCount = new Map();
  for (const p of filesAll) {
    const d = dirOf(p);
    dirFileCount.set(d, (dirFileCount.get(d) || 0) + 1);
  }
  // §071 — the per-candidate scoring math, unchanged in every particular from before this ticket, pulled out to
  // a function so it can be reused verbatim for a SECOND query built off the same candidate (the symbol stratum
  // below) without duplicating (and risking drift in) the arithmetic the pooled/unnamed strata are judged by.
  // Called once per candidate exactly as the inline loop used to call it — same query, same truth, same DEPTH —
  // so the pooled/named/unnamed numbers this returns are bit-for-bit what the old inline code produced.
  const scoreQuery = (C, query) => {
    const qt = new Set(
      tokenize(query)
        .map(normTok)
        .filter(t => !QSTOP.has(t))
    ); // derived from the query STRING by `whereCmd`'s own two steps, so the baseline arm and the stratum split can never see a different set of words than `where` itself does
    const truth = new Set(C.truth),
      truthDirs = new Set(C.truth.map(dirOf));
    const { hits } = whereCmd({ model, query, top: DEPTH, mapRows: 0 }); // mapRows 0: the compact map is render-only and this reads ranks
    let wHit = 0,
      wPlace = 0,
      wContainRank = 0,
      wContainWidth = 0;
    hits.forEach((h, i) => {
      const hit = h.type === 'file' && truth.has(h.label);
      const contain =
        h.type === 'directory'
          ? C.truth.some(t => t.startsWith(h.label))
          : (h.members || []).some(k => truth.has(String(k).split('#')[0]));
      if (hit && !wHit) wHit = i + 1;
      if ((hit || contain) && !wPlace) wPlace = i + 1;
      if (contain && !hit && !wContainRank) {
        wContainRank = i + 1;
        wContainWidth = cardWidth(h);
      }
    });
    // an actual hit inside top@3 is never discounted — the file that NAMES the answer is exactly what "place"
    // was always meant to reward at full value; only a place earned purely by CONTAINMENT (no card named the
    // file, one merely happened to be wide enough to include it) is worth 1/cardWidth, and only when no real
    // hit also landed inside the same top-3 window
    const wPlaceW = wHit && wHit <= 3 ? 1 : wContainRank && wContainRank <= 3 ? wContainWidth : 0;
    const wPlaceCredit = wHit && wHit <= 3 ? 1 : wContainRank && wContainRank <= 3 ? 1 / wContainWidth : 0;
    const ranked = [];
    for (const p of filesAll) {
      const pt = tokensOfPath(p);
      let m = 0;
      for (const t of qt) if (pt.has(t)) m++;
      if (m) ranked.push([p, m]);
    }
    // deliberately naive and fully deterministic: more matched words first, then the shorter path (the more
    // specific of two equal matches), then lexical — no relevance model of any kind, that is the arm being beaten
    ranked.sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1));
    let bHit = 0,
      bContainRank = 0,
      bContainWidth = 0;
    ranked.slice(0, DEPTH).forEach(([p], i) => {
      const hit = truth.has(p);
      const contain = truthDirs.has(dirOf(p));
      if (hit && !bHit) bHit = i + 1;
      if (contain && !hit && !bContainRank) {
        bContainRank = i + 1;
        bContainWidth = dirFileCount.get(dirOf(p)) || 1;
      }
    });
    const bPlaceW = bHit && bHit <= 3 ? 1 : bContainRank && bContainRank <= 3 ? bContainWidth : 0;
    const bPlaceCredit = bHit && bHit <= 3 ? 1 : bContainRank && bContainRank <= 3 ? 1 / bContainWidth : 0;
    return { qt, silent: !hits.length, wHit, wPlaceCredit, wPlaceW, bHit, bPlaceCredit, bPlaceW };
  };
  const rows = [];
  let silent = 0;
  for (const C of candidates) {
    const query = C.toks.join(' ');
    const r = scoreQuery(C, query);
    if (r.silent) silent++;
    const nameToks = new Set(C.truth.flatMap(f => nameTokens(f).map(normTok)));
    rows.push({
      named: [...r.qt].some(t => nameToks.has(t)),
      wHit: r.wHit,
      wPlaceCredit: r.wPlaceCredit,
      wPlaceW: r.wPlaceW,
      bHit: r.bHit,
      bPlaceCredit: r.bPlaceCredit,
      bPlaceW: r.bPlaceW,
    });
  }
  // §071 — the symbol stratum: purely additive, never read by (and never feeding back into) `rows` above, so it
  // cannot move the pooled/named/unnamed numbers by so much as a rounding error. Limited to candidates whose OWN
  // commit message actually contained a verbatim identifier-shaped word (`symToks`, history.mjs) — a candidate
  // with none would score identically to its own `rows` entry, diluting the stratum with cases that test nothing
  // new. The query fed to `whereCmd` is the existing split/stemmed form PLUS those verbatim words appended (never
  // instead of it — option (a) from the ticket): `qraw`/`c.exact` (core.mjs's exact-name pin) can only ever fire
  // off a query's own WHOLE, unsplit word, and `toks` alone can never contain one.
  const symRows = [];
  for (const C of candidates) {
    if (!C.symToks.length) continue;
    const query = [...C.toks, ...C.symToks].join(' ');
    const r = scoreQuery(C, query);
    symRows.push({ wHit: r.wHit, wPlaceCredit: r.wPlaceCredit, wPlaceW: r.wPlaceW, bHit: r.bHit, bPlaceCredit: r.bPlaceCredit, bPlaceW: r.bPlaceW });
  }

  const at = (rs, f, k) => (rs.length ? rs.filter(r => r[f] && r[f] <= k).length / rs.length : 0);
  const mrr = (rs, f) => (rs.length ? rs.reduce((a, r) => a + (r[f] ? 1 / r[f] : 0), 0) / rs.length : 0);
  // place@3 is now the MEAN of each row's (already rank- and width-resolved) credit rather than a share of
  // nonzero ranks — a strict generalization: every row that used to contribute 1 (a real hit within top@3)
  // still contributes exactly 1, so place3 can still never fall below hit3, it can only stop being inflated by
  // wide, uninformative cards
  const place3 = (rs, credit) => (rs.length ? rs.reduce((a, r) => a + r[credit], 0) / rs.length : 0);
  // the credited card's own width, reported beside place@3 so a future researcher sees a gameable-by-width
  // artifact (a card covering most of the repo) directly in the harness output instead of rediscovering it by
  // hand — averaged over the rows that actually earned place credit; 0 when none did
  const placeWidth = (rs, credit, width) => {
    const credited = rs.filter(r => r[credit] > 0);
    return credited.length ? credited.reduce((a, r) => a + r[width], 0) / credited.length : 0;
  };
  const arm = (rs, h, credit, width) => ({
    hit3: at(rs, h, 3),
    mrr: mrr(rs, h),
    place3: place3(rs, credit),
    placeWidth: placeWidth(rs, credit, width),
  });
  const unnamed = rows.filter(r => !r.named);
  return {
    where: arm(rows, 'wHit', 'wPlaceCredit', 'wPlaceW'),
    base: arm(rows, 'bHit', 'bPlaceCredit', 'bPlaceW'),
    unnamed: {
      n: unnamed.length,
      where: arm(unnamed, 'wHit', 'wPlaceCredit', 'wPlaceW'),
      base: arm(unnamed, 'bHit', 'bPlaceCredit', 'bPlaceW'),
    },
    // §071 — candidates whose commit message carried at least one verbatim identifier-shaped word, scored on a
    // query that keeps that word whole (alongside the ordinary split/stemmed tokens): the stratum `unnamed`
    // structurally cannot cover, since a query built only from `toks` can never pin `whereCmd`'s exact-name match.
    symbol: {
      n: symRows.length,
      where: arm(symRows, 'wHit', 'wPlaceCredit', 'wPlaceW'),
      base: arm(symRows, 'bHit', 'bPlaceCredit', 'bPlaceW'),
    },
    n: rows.length,
    silent,
  };
}
// `selftest --obligation` (ticket 073's instrument) — the same automatically-derived, leave-one-out ground truth
// `selftest --how`/`selftest --where` already run (a past commit IS a recorded answer; nobody labels anything),
// asked of the birth-obligation table. Stricter than those two siblings' own leave-one-out, though: `howEval`/
// `whereEval` drop only the ONE candidate commit and still let LATER commits inform the model that scores an
// EARLIER candidate. Here the table scoring a candidate is built ONLY from strictly-older footprints, walked
// forward chronologically and folded in one at a time via `foldObligationFootprint` (above) — the exact function
// `buildObligationTable` itself calls, so the gates a shipped `grain obligation` answer clears can never drift
// from the gates this harness measures. The candidate's own footprint is folded in only AFTER it is scored, so it
// can never certify the very rule being used to predict it — the prospective analogue of `leakSubtractedH`'s
// discipline (§069), guarded by its own test the same way ticket 069 guards `whereEval`.
//
// One EVENT is one (footprint, class) pair, not one commit — a commit adding files in two different classes is
// two events, matching the unit `grain obligation <path>` itself answers for one path at a time.
//
// "hottest recent files" (the non-obvious stratum, and null (a)) is read off the SAME running `fileCommits`
// accumulator the table itself uses for its base-rate contrast — the top 10 by cumulative touch count as of the
// candidate's own position in history, never a repo-wide or all-time count a candidate could not yet have earned.
export function obligationEval({ model, H, last = 100 }) {
  const fps = (H && H.fps) || [];
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
  const refinedM = model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || [], model.srcRoots || []));
  const currentOf = currentPathOf(fps, live);

  const allEvents = [];
  for (let i = 0; i < fps.length; i++)
    for (const ev of classEventsOf(fps[i], { currentOf, refinedM })) allEvents.push({ i, ...ev });
  const n = Math.max(0, Math.floor(last) || 0);
  const candidates = n > 0 ? allEvents.slice(-n) : []; // events are already chronological (fps is oldest-first, §J2.1) — the LAST n are the most recent
  const byIndex = new Map();
  for (const c of candidates) {
    if (!byIndex.has(c.i)) byIndex.set(c.i, []);
    byIndex.get(c.i).push(c);
  }

  // a small, deterministic LCG seeded per event — reproducible across runs (same H, same `last`) without needing
  // a shared, stateful Math.random; this is instrument-internal (the null (b) baseline), never product code.
  const seededPick = (arr, kCount, seed) => {
    if (arr.length <= kCount) return arr.slice();
    let s = (seed >>> 0) || 1;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    const pool = arr.slice();
    const out = [];
    for (let j = 0; j < kCount && pool.length; j++) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  };

  const classes = new Map();
  const fileCommits = new Map();
  const rows = [];
  for (let i = 0; i < fps.length; i++) {
    const fp = fps[i];
    const evs = byIndex.get(i);
    if (evs && evs.length) {
      let universe = 0;
      for (const rec of classes.values()) universe += rec.co.size;
      const idxCost = Math.ceil(Math.log2(Math.max(universe, 2)));
      const nonMegaCommits = i; // exactly the number of footprints folded in so far — the population `fileCommits` below was drawn from
      const truthAll = new Set(fp.files.map(currentOf));
      const hotPool = [...fileCommits.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      for (const ev of evs) {
        const truth = new Set(truthAll);
        truth.delete(ev.cur);
        const rec = classes.get(ev.key);
        const rules = rec ? certifyObligationRules(rec, { fileCommits, nonMegaCommits, idxCost, live }).rules : [];
        const fired = rules.length > 0;
        const top1 = fired ? rules[0].file : null;
        const top3 = rules.slice(0, 3).map(r => r.file);
        const hit1 = fired && truth.has(top1);
        const hit3n = top3.filter(f => truth.has(f)).length;
        const prec3 = top3.length ? hit3n / top3.length : 0;
        const hot10 = new Set(hotPool.filter(([f]) => f !== ev.cur).slice(0, 10).map(([f]) => f));
        const nonObvious = fired && !hot10.has(top1);
        const hot3 = hotPool.filter(([f]) => f !== ev.cur).slice(0, 3).map(([f]) => f);
        const nullHotHit = hot3.some(f => truth.has(f));
        const alive = [...fileCommits.keys()].filter(f => f !== ev.cur && live.has(f));
        const nullRand = seededPick(alive, 3, i * 2654435761 + rows.length + 1);
        const nullRandHit = nullRand.some(f => truth.has(f));
        rows.push({ fired, hit1, prec3, nonObvious, nonObviousHit: nonObvious && hit1, nullHotHit, nullRandHit });
      }
    }
    foldObligationFootprint(fp, { currentOf, refinedM, classes, fileCommits });
  }

  const share = (rs, pred) => (rs.length ? rs.filter(pred).length / rs.length : 0);
  const fired = rows.filter(r => r.fired);
  const nonObv = rows.filter(r => r.nonObvious);
  return {
    n: rows.length,
    coverage: share(rows, r => r.fired),
    precision1: share(fired, r => r.hit1),
    precision3: fired.length ? fired.reduce((a, r) => a + r.prec3, 0) / fired.length : 0,
    nonObviousN: nonObv.length,
    nonObviousPrecision: share(nonObv, r => r.nonObviousHit),
    nullHot: share(fired, r => r.nullHotHit),
    nullRandom: share(fired, r => r.nullRandHit),
  };
}
// three tiers, each under its own --top cap: domain conventions (a choice someone made) first, structural-shape
// contrasts (the language showing through a group/directory boundary, not a chosen convention) second, lexical
// style (quotes, semicolons, indentation) last — bpi alone conflates them, since a crisp small sample can
// out-score a large one on codelength gain per instance without being more worth a reader's attention (measured:
// a 10-member arity contrast outranked a 30-member decorator convention by bpi alone). Shared by report() and
// rulesMarkdown() so the two renderers can never drift on what counts as a "chosen" convention.
export function factTiers(p) {
  const shown = p.facts.filter(f => !isDefiningFact(p.medoids, f));
  const taut = p.facts.filter(f => isDefiningFact(p.medoids, f)).length;
  const isLex = f => f.pid.startsWith('auto.lex:');
  const domain = shown.filter(f => !STRUCT_PID.test(f.pid) && !isLex(f));
  const structural = shown.filter(f => STRUCT_PID.test(f.pid));
  const lexical = shown.filter(isLex);
  return { domain, structural, lexical, taut };
}
// (§013/§024 ruling) `+dirty` is spoken for: it means "this answer incorporates your uncommitted edits", true
// only of `check`/`review` (always) and `spectrum`/`explain` (for the one file asked about, since §013 made them
// read it live). A HEAD-reading command (where/how/what/map/status/report/rules/completeness — grain.mjs) never
// reads the worktree at all, so it may never claim `+dirty` — but a dirty tree still means today's answer may not
// match what's on disk, and that is worth saying. Same register as relCoverageNote/intraModuleNote just below: a
// plain declarative sentence, not a hedge, not voice()-wrapped, and never confusable with `+dirty` itself.
// Exported so grain.mjs's CLI layer (which alone knows whether the worktree is actually dirty) and rulesMarkdown's
// own generated-document text (below) share one wording instead of two that could drift apart.
export const DIRTY_TREE_NOTE =
  'the worktree has uncommitted changes — this answer is computed from the indexed commit, not the current files on disk';
// §042: a lexical style surface is a per-FILE majority vote (lexicalPreds) — `auto.lex:quote` reads `double` while at
// most 20% of the file's literals are single-quoted. So a conforming file can hold, or GAIN, many departing literals
// without the value ever moving: measured, telescope.nvim's buffer_previewer.lua absorbs 50 new single-quoted literals
// in silence and flips only at 51; express's test/acceptance/mvc.js absorbs 12 and flips at 15; the budget is 0.25 ×
// the majority count, so it grows with file size (957 / 2050 / 1067 literals repo-wide on telescope.nvim / express /
// flask). The vote is the right unit to MINE — a delimiter forced by the content (`'he said "hi"'`) is not a style
// choice, and 11 of 11 minority literals in telescope.nvim are exactly that — but `check` must not call the file
// conforming without saying what a file-granularity vote cannot see. Same register and same one-constant-two-renderers
// discipline as TEMPLATE_DESCRIPTIVE_NOTE below.
const LEX_UNIT = {
  'auto.lex:quote': ['string literal', 'string literals'],
  'auto.lex:semi': ['statement', 'statements'],
  'auto.lex:decl': ['declaration', 'declarations'],
  'auto.lex:indent': ['indented line', 'indented lines'],
};
// §077 (director-approved follow-up to §042, esc-1): of the minority-quote literals a per-file quote vote counts
// as departing (lexTally's `off`, below), a delimiter forced by the literal's OWN body (`'he said "hi"'` in a
// double-quote file — the other quote would need escaping) is not a style choice; §042 already measured this
// holds for 11/11 telescope.nvim, 19/31 flask and 2/24 express minority literals. This is the one content test
// that tells a genuine departure apart from a forced one — reused here rather than reimplemented, and gated on
// nothing but `exp` already being a real majority (`checkFile` only ever calls this for a certified fact, so
// there is no new tunable: the file-level convention's own acceptance decides whether this can ever run).
export function quoteFlags(exp, literals) {
  if (exp !== 'single' && exp !== 'double') return []; // no per-literal flag on an uncertified/`mixed` vote
  const majority = exp === 'single' ? "'" : '"';
  const minority = exp === 'single' ? '"' : "'";
  return (literals || []).filter(l => l.q === minority && !l.body.includes(majority));
}
// null when there is nothing to disclose; otherwise the counts AND the sentence, from one computation, so the JSON
// field and the printed clause can never disagree about the same file. `flags` (§077) is the subset of the hidden
// instances that are genuine violations, not delimiter-forced (quoteFlags above) — always [] for the three
// non-quote lexical surfaces, so their note is byte-for-byte unchanged from §042.
export function lexTally(pid, exp, tally, flags = []) {
  const unit = LEX_UNIT[pid];
  if (!unit || !tally || tally[exp] === undefined) return null; // `mixed`/`other` name no instance: nothing to count
  const total = Object.values(tally).reduce((a, c) => a + c, 0);
  const conforming = tally[exp];
  const off = total - conforming;
  if (total <= 0 || off <= 0) return null; // every instance conforms: the file-level verdict is true per instance too
  const flagged = flags.length;
  const flagClause = flagged
    ? `, ${flagged} flagged as a genuine violation${flagged > 1 ? 's' : ''} (not delimiter-forced): ${flags
        .slice(0, 6)
        .map(f => `line ${f.line}`)
        .join(', ')}${flagged > 6 ? ` · +${flagged - 6} more` : ''}`
    : ' and none of them is flagged';
  return {
    conforming,
    total,
    flagged,
    flagLines: flags.map(f => f.line),
    note: ` — scored per file, not per ${unit[0]}: ${off} of ${total} ${unit[1]} here depart from it${flagClause}`,
  };
}
// §030: a `report`/`rules` TEMPLATE line (mineTemplates/profileOf — unclustered residue, never a role group) is a
// render-only structural superposition: it has no cell in `part.facts`, so `check`/`review`/hooks cannot fail a
// member for breaking its shape — not even the partial bridge J5.8 gives CLUSTERED role-group profiles
// (`part.profiles[r].req`, checked only in the "missing a required signature" direction). A reader who sees "held
// since 2008" here reasonably assumes `check` guards it; it does not, in either direction, ever. Same register as
// DIRTY_TREE_NOTE/relCoverageNote/intraModuleNote just above: a plain declarative sentence, not a hedge. One
// constant, used by both report() and rulesMarkdown() so the two can never say different things about the same
// template line (§007 — the exact drift this repo already fixed once for a different disclosure).
export const TEMPLATE_DESCRIPTIVE_NOTE =
  "descriptive only — check has no cell for a template's shape, so a member breaking it is never flagged";
// how much of the indexed file set the relation/architecture layer can even see — a grammar with no relSupported()
// extractor contributes file/module edges of exactly zero, indistinguishable from a real, measured "this language
// imports nothing" without this disclosure; pure render from data the model already has, zero heuristics about
// WHICH languages (driven by relSupported's capability list, and relPathOnly's — relations.mjs, issue 041 — for
// an extractor that IS registered but can only ever see a literal #include-style path, never a real symbol
// reference) (§G21). `relSupported(g) && !relPathOnly(g)` is "genuinely covered"; either false lands a grammar in
// `uncovered` — a path-only extractor's near-total real-world resolution failure (leveldb: 0 of 134 files'
// dependencies computed, issue 041) must never read as "resolution covers this, the code just imports nothing".
// The {n, grammars} shape is exported (not just the prose below) so export.mjs (§027) can carry the identical
// fact `report`/`status` print — one function computes it, so the two surfaces can never drift apart the way
// rules/report once did (§007).
// issue 059: PHP is NOT `relPathOnly` — its extractor resolves call/type-ref/instanceof references through
// the symbol table like any full-featured language, not a literal-path grep — so `relSupported && !relPathOnly`
// alone reads it as genuinely covered. But EVERY one of those resolutions still bottoms out in a PSR-4 lookup
// (`resolvePhpFqn`, php-resolve.mjs): with no psr-4 autoload map anywhere in the tree (no composer.json, or one
// with no `autoload`/`autoload-dev` psr-4 section) that lookup can never succeed for ANY `use`, and grain's own
// merged map (`model.phpAutoload`, relations.mjs `phpAutoloadResolverFor`) stays empty — the same "near-total
// real-world resolution failure reading as covered" 041 caught for path-only extractors, just keyed on repo
// CONTENT (a PSR-4 map to consult) instead of extractor STRUCTURE. A PHP repo that pins its architecture down
// to composer.json (Symfony, Slim, virtually every modern framework) is unaffected — flagged only when that
// signal is entirely absent, the one case a real edge could never have existed.
// issue 086: 041/059 both catch a WHOLE grammar with no real edges anywhere. This is the narrower shape: a
// repo dominated by one grammar (okhttp: Kotlin+Java, playframework: Java+Scala+asset-pipeline JS, groovy-spock:
// Java+Groovy+Kotlin) where a SMALL secondary grammar's own files carry literally zero in/out edges even though
// that grammar is fully `relSupported` and not `relPathOnly` elsewhere in a single-grammar repo (a standalone
// Java or Kotlin fixture with the identical import shape resolves fine — verified live). Root cause traced to
// the vendored SymbolTable partitioning declarations by LANGUAGE on purpose (crosslang-symbol-table-partition
// test) so a same-named Java/Kotlin/Groovy/Scala type never collides across languages — but that also means a
// secondary population whose real-world references mostly cross INTO the dominant grammar (the common shape once
// one language is being migrated to another) can never resolve there; teaching every extractor pair to cross a
// language boundary safely is genuinely new work, out of scope here. The FLOOR instead: any grammar meeting the
// same small-population floor `CFG.minEff` already uses repo-wide for "too little evidence to claim anything"
// (§9.4's absence-boundary idiom), with a real file population here but not one edge touching any of its files,
// joins the same disclosed-uncovered set 041's relPathOnly and 059's phpNoAutoload already populate — a purely
// OUTCOME-keyed check (never a hardcoded grammar-pair name) that generalizes to any future grammar combination.
export function relCoverageData(model) {
  const uncovered = new Map(); // grammar name -> file count
  const phpNoAutoload = !(model.phpAutoload && model.phpAutoload.length);
  const filesByGrammar = new Map(); // grammar -> its own file list, reused below for the issue-086 zero-edge check
  for (const f of model.filesAll || []) {
    const g = EXT2GRAMMAR[extname(f)];
    if (!g) continue;
    (filesByGrammar.get(g) || filesByGrammar.set(g, []).get(g)).push(f);
    if (!relSupported(g) || relPathOnly(g) || (g === 'php' && phpNoAutoload))
      uncovered.set(g, (uncovered.get(g) || 0) + 1);
  }
  const edgedFiles = new Set();
  for (const e of model.edges || []) {
    edgedFiles.add(e.from);
    edgedFiles.add(e.to);
  }
  for (const [g, list] of filesByGrammar) {
    if (uncovered.has(g) || list.length < CFG.minEff) continue;
    if (!list.some(f => edgedFiles.has(f))) uncovered.set(g, list.length);
  }
  const n = [...uncovered.values()].reduce((a, b) => a + b, 0);
  return { n, grammars: [...uncovered.keys()].sort() };
}
function relCoverageNote(model) {
  const { n, grammars } = relCoverageData(model);
  if (!n) return null;
  return `resolution does not cover ${n} file${n > 1 ? 's' : ''} (${grammars.join(', ')}) — conventions layer only for those`;
}
// the sibling gap (§004): every import CAN be resolution-supported and genuinely resolved (model.edges nonempty)
// and the module graph can still show zero directed dependencies — module ids are directory buckets (moduleOf /
// refineModOf, relations.mjs) and a package too small to trip the dominant-module refinement keeps its entire
// real architecture INSIDE one node, so every resolved edge is `a === b` and folded away by moduleGraph's own
// edge-folding step. Without this, "N modules · 0 directed dependencies" reads as a measured "this code imports
// nothing" instead of a module-granularity artifact — confirmed live on flask's src/flask/ (118 real edges, 0
// surviving module-level). Pure render off model.edges/model.moduleGraph, no new heuristics.
function intraModuleNote(model) {
  const mg = model.moduleGraph;
  const n = (model.edges || []).length;
  if (!mg || mg.edges.length || !n) return null;
  return `${n} file-level edge${n > 1 ? 's' : ''} resolved, none crossing a module boundary — the architecture graph only counts cross-module dependencies`;
}
// §038: a "module" here is a directory bucket — moduleOf/refineModOf (relations.mjs), refined one path segment
// deeper once a root holds most of the repo — never a build-declared source set. A directory holding more than
// one source set (a Gradle/Kotlin-Multiplatform `src/` with `commonMain`/`jvmMain`/`jvmTest` trees, `src/main` +
// `src/test` under one module root, any multi-sourceSet Java layout) folds all of them into a single node, so an
// edge from that node's test code counts identically to one from its production code. A reported cycle can
// therefore be entirely a test-only dependency (one source set importing another's test helpers) with no
// production cycle behind it at all — confirmed live on Kotlin/okhttp's jvmTest → test-support edges. Fires on
// every cycle report, not only ones that look test-shaped: grain has no name-based test detection (config.mjs's
// DESIGN RULING, "kod to kod"), so there is no structural signal to select on without inventing one. Same register
// as DIRTY_TREE_NOTE/relCoverageNote/intraModuleNote above: a plain declarative sentence, not a hedge. Exported so
// report() and rulesMarkdown() say the identical thing about the identical cycle (§007 — the drift this repo
// already fixed once for a different disclosure).
export const CYCLE_GRANULARITY_NOTE =
  'modules here are directory buckets (refined one level under a dominant root), not build-declared source sets — a module that folds together more than one source set, such as production and test code under one src/ tree, can show a cycle that is entirely a test-only dependency, not a production one';
// an exemplar for a (partition, role) group, resolved off the same role-defining fact convention twins/archetypes
// already carry a `cid` prefix of `r<role>:` for — used only to anchor a health suggestion in a real, copy-pasteable
// `<path>#<name>` (§J5.5), never to render the fact itself
function roleExemplar(model, part, role) {
  const p = (model.partitions || []).find(x => x.name === part);
  const f = p && p.facts.find(x => x.cid.startsWith('r' + role + ':') && x.exemplars && x.exemplars[0]);
  return f ? { f, ex: f.exemplars[0] } : null;
}
// == health == (§J5.5): repo-wide signals that suggest a maintainer decision, composed from fields ALREADY on the
// model (J5.1 f.cost, J5.2 f.rejected, J5.3 f.agentShare, J3.4 model.twins, J4.1 model.changeArchetypes, J1.3
// model.waivers, E4 baselineClause) plus, when the caller supplies it, `check-outcomes.json` (J5.4) — report()/
// rulesMarkdown() are pure functions of `model` and cannot read files themselves, so `outcomes` travels in as a
// parameter from cmdReport/cmdRules, which do the reading. Every row here is later wrapped in `voice('practiced',
// …)` by the caller and is deliberately colon-free at the start (the `word: ` prefix trips voices.test.mjs's marker
// detector — the SAME trap §J4.1 hit once already). Each row ends in a plain-text `grain decide …` suggestion —
// descriptive only, never executed — anchored on a real scope wherever one is cheaply resolvable.
export function healthRows(model, outcomes) {
  const rows = [];
  for (const p of model.partitions || [])
    for (const f of p.facts) {
      // 1: costly to deviate from (J5.1)
      if (!f.cost || !f.cost.baseK) continue;
      const ex = f.exemplars[0];
      if (!ex) continue;
      const mult = (f.cost.k / f.cost.n / (f.cost.baseK / f.cost.baseN)).toFixed(1);
      rows.push(
        `${factLabel(p, f)} costs ${mult}× more fixes when deviated from (${f.cost.k} of ${f.cost.n} vs ${f.cost.baseK} of ${f.cost.baseN})` +
          ` → grain decide steer ${ex.rel}#${ex.name} --surfaces ${f.pid} --note "codify — deviating costs ${mult}× more fixes"`
      );
    }
  for (const p of model.partitions || [])
    for (const f of p.facts) {
      // 2: rejected alternatives (J5.2)
      if (!f.rejected) continue;
      const ex = f.exemplars[0];
      if (!ex) continue;
      for (const r of f.rejected)
        rows.push(
          `${factLabel(p, f)} — ${deviationPhrase(f, r.v)} tried ${r.tried}×, reverted ${r.reverted}× — a rejection, not an alternative` +
            ` → grain decide steer ${ex.rel}#${ex.name} --surfaces ${f.pid} --note "value already rejected ${r.tried}× — document it so it is not re-litigated"`
        );
    }
  for (const p of model.partitions || [])
    for (const f of p.facts) {
      // 3: echo chambers (J5.3)
      if (f.agentShare == null) continue;
      const ex = f.exemplars[0];
      if (!ex) continue;
      rows.push(
        `${factLabel(p, f)} is held mostly by agent-authored code (${pct(f.agentShare)}% of recent conformers)` +
          ` → grain decide steer ${ex.rel}#${ex.name} --surfaces ${f.pid} --note "ratify — currently held mostly by agent-authored code"`
      );
    }
  if (outcomes && outcomes.byFact) {
    // 4: ignored after warning (J5.4) — silent whenever the caller has no outcomes file
    const entries = Object.entries(outcomes.byFact)
      .filter(([, k]) => k >= 2)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 5);
    for (const [key, k] of entries) {
      const i = key.indexOf('::');
      if (i < 0) continue;
      const pname = key.slice(0, i),
        pid = key.slice(i + 2);
      const p = (model.partitions || []).find(x => x.name === pname);
      const f = p && p.facts.find(x => x.pid === pid);
      const dv = f && f.deviants && f.deviants[0],
        ex = f && f.exemplars[0];
      if (dv)
        rows.push(
          `${scopeLabel(pname)} keeps ignoring the \`${pid}\` warning at ${dv.rel}:${dv.line} (flagged and ignored ${k}×)` +
            ` → grain decide waive ${dv.rel}#${dv.name} --on ${pid} --note "flagged and ignored ${k}×"`
        );
      else if (ex)
        rows.push(
          `${scopeLabel(pname)} keeps ignoring the \`${pid}\` warning (flagged and ignored ${k}×)` +
            ` → grain decide steer ${ex.rel}#${ex.name} --surfaces ${pid} --note "reconsider — flagged and ignored ${k}×"`
        );
    }
  }
  // 5 (structural twins, J3.4) is DELIBERATELY ABSENT — the slot is kept numbered so this stays legible against
  // §J5.5's own list. `model.twins` still exists, `export` still publishes it, and `where`'s group card still
  // prints `twin: structurally the same as «B» …`. What was removed is only the health row, which turned that
  // observation into an unsolicited `grain decide steer … "duplicate of … unify or document why both exist"`.
  // MEASURED (§044, 3 languages, 75 rows hand-adjudicated against a criterion fixed before the pairs were seen,
  // ties scored in the tool's favour so the figure is an upper bound): precision 18/75 = 0.24 — 0.36 on
  // OpenZeppelin, 0.32 on flask, 0.04 on gin. The cause is not a loose threshold but a MISSING BASELINE:
  // `3*shared > A.shared + B.shared` is a within-pair test that never asks what two ARBITRARY role groups of that
  // construct already share. Measured over 861 same-root pool pairs in gin the median shared core is 10 — and
  // gin's ACCEPTED twins median 10 too, i.e. the gate admits pairs that are exactly typical. The cores it accepts
  // there are bare declaration syntax (`func X(t *testing.T) { … }` and nothing else).
  // Do NOT "fix" this with a minimum skeleton size: measured, gin's whole population is 6–23 nodes and flask's
  // 5–12, so any floor clearing gin's noise deletes flask's true rows with it. Subtracting the measured per-root
  // median (constant-free) was also tried: it lifts precision to 0.56 but zeroes Go and loses 4 of 18 true rows.
  // Rows were also not independent — 33 of OpenZeppelin's 83 were `Packing.sol` pairing with itself, one fact
  // rendered as 33 separate instructions — and `rules` wrote every one of them into the user's committed
  // CONVENTIONS.md. Full measurement: .temp/issues/044-twins-duplicate-noise/log.md.
  for (const a of model.changeArchetypes || []) {
    // 6: incomplete change shapes (J4.1) — usually, not always: certification's
    // own λ bound puts every CERTIFIED cell's share at >= 0.89, so 0.6 <= share < certification is exactly "usually,
    // not always" without inventing a new upper-bound constant (the 0.6 floor already has three precedents in this file)
    let anchor = null;
    for (const c of a.cells) {
      if (c.certified && c.cell.startsWith('g:')) {
        const v = c.cell.slice(2);
        const i = v.lastIndexOf('#');
        anchor = roleExemplar(model, v.slice(0, i), +v.slice(i + 1));
        if (anchor) break;
      }
    }
    if (!anchor) continue;
    for (const c of a.cells) {
      if (!(c.share >= 0.6) || c.certified) continue;
      rows.push(
        `change shape "${a.label}" usually but not always touches ${archCellLabel(model, c.cell)} (${c.k} of ${a.n}, ${pct(c.share)}%)` +
          ` → grain decide steer ${anchor.ex.rel}#${anchor.ex.name} --surfaces ${anchor.f.pid} --note "confirm ${archCellLabel(model, c.cell)} as a required part of '${a.label}' changes"`
      );
    }
  }
  {
    const groups = new Map(); // 7: conventions riddled with waivers (J1.3) — grouped by partition + '::' + pid, never pid
    // alone: a waiver carries no `cid`, and grouping by pid alone would merge unrelated conventions across partitions/cells
    for (const wv of model.waivers || []) {
      if (!wv.found) continue;
      const key = wv.partition + '::' + wv.pid;
      (groups.get(key) || groups.set(key, []).get(key)).push(wv);
    }
    for (const [, list] of groups) {
      if (list.length < 3) continue;
      const wv = list[0];
      rows.push(
        `\`${wv.pid}\` in ${scopeLabel(wv.partition)} carries ${list.length} waivers (e.g. ${wv.path}#${wv.name})` +
          ` → grain decide steer ${wv.path}#${wv.name} --surfaces ${wv.pid} --note "${list.length} waivers recorded here — consider promoting this scope's own value instead"`
      );
    }
  }
  for (const st of model.steers || []) {
    // 8: dead steers (E4) — baseline only ever rides on a steer's first pid, and
    // only ever for a PARTITION-WIDE convention (baselineShare reads just the `_all:` cell), so a steer over a purely
    // group/directory-local convention structurally never gets a baseline at all and can never fire this row — a known,
    // accepted coverage gap from §E4, not something to fix here
    if (!st.found) continue;
    for (const sf of st.surfaces) {
      if (sf.retires || !sf.baseline) continue;
      const clause = baselineClause(sf);
      if (!clause.includes('no movement')) continue;
      rows.push(
        `steer ${st.id} on ${st.path}#${st.name} has not moved the needle${clause} → grain decide rm ${st.id}`
      );
    }
  }
  return rows;
}
export function report(model, { top = 15, outcomes } = {}) {
  const lines = [];
  for (const p of model.partitions) {
    lines.push(
      `== ${scopeLabel(p.name)} — ${p.facts.length} conventions · ${p.medoids.length} groups · ${p.scopes} scopes · ${p.files.length} files ==`
    );
    const { domain, structural, lexical, taut } = factTiers(p);
    const printFact = f => {
      const t = f.trend;
      const tr = t
        ? ` trend[${t.shares.map(s => pct(s.share)).join('>')}%]${t.nucleating ? ` — a newer pattern is emerging here: ${t.nucleating}` : ''}`
        : '';
      lines.push(
        `  ${voice(
          'practiced',
          `${factLabel(p, f)}: ${verbalize(
            f,
            f.exemplars.map(e => e.name)
          )} — ${pct(f.share)}% of ${f.sraw} established${f.deviantsN ? `, ${f.deviantsN} deviant${f.deviantsN > 1 ? 's' : ''}` : ''}${tr}${f.held && f.held.since ? ` · held since ${f.held.since}` : ''}${f.authorConc ? ` · ${authorConcClause(f.authorConc)}` : ''}`
        )}`
      );
    };
    for (const f of domain.slice(0, top)) printFact(f);
    if (domain.length > top)
      lines.push(`  … and ${domain.length - top} more — run with --top ${domain.length} for all`);
    if (structural.length) {
      lines.push('  syntax-shape facts (structural, not a chosen convention):');
      for (const f of structural.slice(0, top)) printFact(f);
      if (structural.length > top)
        lines.push(`  … and ${structural.length - top} more — run with --top ${structural.length} for all`);
    }
    if (lexical.length) {
      lines.push('  style conventions (quotes, semicolons, indentation, declarations):');
      for (const f of lexical.slice(0, top)) printFact(f);
      if (lexical.length > top)
        lines.push(`  … and ${lexical.length - top} more — run with --top ${lexical.length} for all`);
    }
    if (taut)
      lines.push(
        `  (${taut} group-defining marker${taut > 1 ? 's' : ''} not listed — a group selected by its decorator/supertype restating it is not news; \`where\` still uses them)`
      );
    for (const t of (p.templates || []).slice(0, 6)) {
      const bits = [];
      for (const pi of t.perInstance)
        bits.push(`one slot per-instance (${pi.distinct}/${pi.total}, e.g. \`${pi.top}\`)`);
      for (const sl of t.slots) bits.push(`slot usually \`${sl.top}\` (${sl.k}/${sl.total})`);
      lines.push(
        `  template (unclustered ${t.kind}s ×${t.n}, ~${Math.round(t.coverage * 100)}% of an average one): ${t.skel}${bits.length ? ' · ' + bits.join(' · ') : ''}${t.held ? ` · held since ${t.held.since}${t.held.fresh ? ` · ${t.held.fresh} new in 180d` : ''}` : ''} · ${TEMPLATE_DESCRIPTIVE_NOTE} — e.g. ${ptr(t.exemplars[0].rel, t.exemplars[0].line, t.exemplars[0].endLine)}`
      );
    }
  }
  if (model.moduleGraph && model.moduleGraph.nodes.length > 1) {
    const mg = model.moduleGraph;
    lines.push(
      `== architecture — ${mg.nodes.length} modules · ${mg.edges.length} directed dependencies · ${mg.cycles.length} cycle(s) ==`
    );
    const covNote = relCoverageNote(model);
    if (covNote) lines.push(`  ${covNote}`);
    const intraNote = intraModuleNote(model);
    if (intraNote) lines.push(`  ${intraNote}`);
    const out = new Map();
    for (const e of mg.edges) (out.get(e.from) || out.set(e.from, []).get(e.from)).push(e);
    for (const [from, es] of [...out]
      .sort((a, b) => b[1].reduce((x, y) => x + y.n, 0) - a[1].reduce((x, y) => x + y.n, 0))
      .slice(0, 12))
      lines.push(
        `  ${from}/ → ${es
          .slice(0, 5)
          .map(e => `${e.to}/ (${e.n})`)
          .join(' · ')}${es.length > 5 ? ` · +${es.length - 5} more` : ''}`
      );
    for (const c of mg.cycles.slice(0, 4))
      lines.push(
        `  cycle (strongly connected): ${c.join(', ')} — every member reaches every other, not necessarily in this order`
      );
    if (mg.cycles.length) lines.push(`  ${CYCLE_GRANULARITY_NOTE}`);
    const departures = (model.archNorms || []).filter(n => n.exp === 'false' && n.fromKind !== 'group'); // "module pair(s)" below is a claim about modules specifically — group-kind rows have their own home in computeArchHits, not this count
    if (departures.length)
      lines.push(
        `  established layering: ${departures.length} module pair(s) where reaching the target is the counted exception, not the practice`
      );
  }
  {
    const moving = [];
    for (const p2 of model.partitions)
      for (const f of p2.facts) {
        if (!f.trend || !f.trend.shares || f.trend.shares.length < 2) continue;
        const a = f.trend.shares[0].share,
          b2 = f.trend.shares[f.trend.shares.length - 1].share;
        if (Math.abs(b2 - a) >= 0.1 || f.suppressedValue) moving.push({ p: p2, f, d: b2 - a });
      }
    if (moving.length) {
      lines.push(`== drift — ${moving.length} convention(s) in motion ==`);
      for (const m of moving.sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 10))
        lines.push(
          `  ${m.d > 0 ? '↑' : m.d < 0 ? '↓' : '~'} ${factLabel(m.p, m.f)}: ${verbalize(
            m.f,
            m.f.exemplars.map(e => e.name)
          )} — ${m.f.trend.shares.map(x2 => pct(x2.share)).join('>')}%${m.f.suppressedValue ? ` · a newer pattern is emerging: ${m.f.suppressedValue}` : ''}`
        );
    }
  }
  // the recurring shapes of past changes (§J4.1): what a change of this kind touches here, with the population it
  // was measured over. Deliberately colon-free — every `<marker>: ` prefix grain prints is a voice, and this is a
  // practiced claim, which has no marker of its own (§J0.1).
  if (model.changeArchetypes && model.changeArchetypes.length) {
    lines.push(
      `== changes — ${model.changeArchetypes.length} shape${model.changeArchetypes.length > 1 ? 's' : ''} ==`
    );
    for (const a of model.changeArchetypes) {
      const cs = a.cells.filter(c => c.certified);
      lines.push(
        `  ${voice(
          'practiced',
          `"${a.label}" — ${a.n} changes · ${cs
            .slice(0, 6)
            .map(c => `${archCellLabel(model, c.cell)} (${c.k} of ${a.n})`)
            .join(' · ')}${cs.length > 6 ? ` · +${cs.length - 6} more` : ''}`
        )}`
      );
    }
  }
  if (model.boundaries && model.boundaries.length) {
    lines.push(
      `== boundaries — ${model.boundaries.length} architecture decision(s) in .grain/seeds.jsonl ==`
    );
    for (const bd of model.boundaries)
      lines.push(
        `  ${voice('decided', `${bd.boundary.from}/ never imports ${bd.boundary.to}/${bd.note ? ' — ' + bd.note : ''}${!bd.fromLive || !bd.toLive ? ' (a side names no indexed files — inert)' : ''}`, { typ: 'boundary', who: bd.author, when: bd.createdAt, id: bd.id })}`
      );
  }
  if (model.steers && model.steers.length) {
    lines.push(`== steers — ${model.steers.length} maintainer decision(s) in .grain/seeds.jsonl ==`);
    for (const st of model.steers) {
      if (!st.found) {
        lines.push(
          `  ${st.id}: exemplar ${st.path}#${st.name} not found in HEAD — inert (edit or remove it)`
        );
        continue;
      }
      for (const sf of st.surfaces) {
        if (sf.retires) continue;
        lines.push(
          `  ${voice('decided', `${sf.value === null ? `${sf.pid} is not a surface of ${st.name}` : verbalize({ pid: sf.pid, exp: sf.value, kind: st.kind, heritageKind: heritageKindOf(sf.pid, model) }, [st.name]) + ' — ' + practicedBy(sf) + baselineClause(sf)} · weight ${st.weight}${st.note ? ' · ' + st.note : ''}`, { typ: 'steer', who: st.author, when: st.createdAt, id: st.id })}`
        );
        for (const rp of st.surfaces.filter(x => x.retires))
          lines.push(
            `    retires: ${verbalize({ pid: rp.pid, exp: 'true', kind: st.kind, heritageKind: heritageKindOf(rp.pid, model) }, [])}`
          );
      }
    }
  }
  if (model.waivers && model.waivers.length) {
    lines.push(`== waivers — ${model.waivers.length} waiver(s) in .grain/seeds.jsonl ==`);
    for (const wv of model.waivers) {
      if (!wv.found) {
        lines.push(`  ${wv.id}: scope ${wv.path}#${wv.name} not found in HEAD — inert (edit or remove it)`);
        continue;
      }
      lines.push(
        `  ${voice('decided', `${wv.path}#${wv.name} (line ${wv.line}) is excused from ${wv.pid}${wv.note ? ' — ' + wv.note : ''}`, { typ: 'waiver', who: wv.author, when: wv.createdAt, id: wv.id })}`
      );
    }
  }
  {
    const health = healthRows(model, outcomes);
    if (health.length) {
      lines.push(`== health — ${health.length} signal${health.length > 1 ? 's' : ''} ==`);
      for (const h of health) lines.push(`  ${voice('practiced', h)}`);
    }
  }
  lines.push(
    `agent-authored share of code younger than ${CFG.survDays} days: ${model.agentShare == null ? 'n/a' : Math.round(model.agentShare * 100) + '%'} · co-change pairs: ${model.cochange.length} (bulk commits touching >30 files excluded from pairing)`
  );
  return lines;
}
// `grain map`'s full-detail structural overview (§J4.3a layers/decisions, §J4.3b concepts/changes — named
// `mapSections`, not `mapLines`, since `howCmd` already binds a local `mapLines` of its own). `layers:`/`concepts:`
// are map-voice structural claims, per this file's own voice() definition above. `changes:` is practiced — the
// same voice report()'s own `== changes ==` section uses for the identical `model.changeArchetypes` data — capped
// to the top 4 by `n` (already the model's own sort order) since this overview is meant to be scannable, not a
// full dump (that's what `report`'s `== changes — N shapes ==` section is for). The ticket's own example text also
// wanted a trailing `e.g. <sha>` citation; that citation is deliberately dropped here rather than kept unmarked or
// wrapped in its own `voice('example', ...)` fragment — a per-archetype citation adds another number to parse in a
// line whose whole point is to be skimmed, and `report`'s detailed section already exists for exactly that
// evidence. `decisions:` is a bare count/structure line (like a header or a stamp), never a claim, so it carries
// no voice() marker at all.
// the module→layer grouping `map`'s text `layers:` line renders (byLayer, below) — extracted so a second caller
// (ticket 072: `report --json`'s `layers` field) computes the identical grouping instead of re-deriving its own,
// the same "one function computes it" discipline as relCoverageData/relCoverageNote above (§G21). Returns the
// FULL, untruncated module list per layer, ascending by layer number, modules sorted alphabetically within — the
// same sort mapSections' own `mods.sort()` already used; mapSections' 4-per-layer "+K more" cap is a display
// concern layered on top by its own caller, exactly like cmdMap's `changes` field already keeps the full
// `model.changeArchetypes` list while its OWN text line caps to 4 (§066/051).
export function moduleLayers(model) {
  const mg = model.moduleGraph;
  if (!mg || !mg.nodes.length) return [];
  const byLayer = new Map();
  for (const n of mg.nodes) {
    if (n.layer === undefined) continue;
    (byLayer.get(n.layer) || byLayer.set(n.layer, []).get(n.layer)).push(n.id);
  }
  return [...byLayer.keys()]
    .sort((a, b) => a - b)
    .map(l => ({ layer: l, modules: byLayer.get(l).sort() }));
}
export function mapSections(model) {
  const lines = [];
  const mg = model.moduleGraph;
  if (mg && mg.nodes.length) {
    const label = id => (id === '.' ? '.' : id + '/');
    const segs = moduleLayers(model).map(({ layer: l, modules: mods }) => {
      return `layer ${l}${l === 0 ? ' (leaves)' : ''}: ${mods.slice(0, 4).map(label).join(', ')}${mods.length > 4 ? `, +${mods.length - 4} more` : ''}`;
    });
    if (segs.length) lines.push(voice('map', `layers: ${segs.join(' · ')}`));
  }
  if (model.concepts && model.concepts.length)
    lines.push(voice('map', `concepts: ${model.concepts.join(', ')}`));
  if (model.changeArchetypes && model.changeArchetypes.length) {
    const cs = model.changeArchetypes;
    const segs2 = cs.slice(0, 4).map(a => `"${a.label}" — ${a.n} change${a.n === 1 ? '' : 's'}`);
    lines.push(
      voice('practiced', `changes: ${segs2.join(' · ')}${cs.length > 4 ? ` · +${cs.length - 4} more` : ''}`)
    );
  }
  const decisionsN =
    (model.steers || []).length + (model.boundaries || []).length + (model.waivers || []).length;
  lines.push(`decisions: ${decisionsN} maintainer decision(s) in force`);
  return lines;
}
// a standalone Markdown document over the SAME model data report() renders, for a reader (human or tool) with no
// terminal and no grain plugin installed — a snapshot stamped with the commit it was computed from, not a live
// query. Reuses report()'s own tier split and verbalization helpers (factTiers, factLabel, verbalize,
// authorConcClause, practicedBy, baselineClause) so the two renderers can never disagree about what a convention
// is; a table (not report's flat bullets) fits a static reference document better, with room for an exemplar
// path+line column a terse CLI line has no space for. Excludes report()'s `== drift ==` section on purpose: drift
// is a "how is this changing" trend view suited to a live query, not a "what to copy right now" reference.
export function rulesMarkdown(
  model,
  { top = 15, sha = 'no-git', date = new Date().toISOString().slice(0, 10), outcomes, dirty = false } = {}
) {
  const lines = [];
  lines.push(`# ${model.repo} — established conventions`, '');
  lines.push(
    `Generated by \`grain rules\` as of commit \`${sha}\` on ${date} — this file is a snapshot, not a live query; recompute with \`grain rules --out <this file>\` after the code moves. It reflects only what a maintainer would see running \`grain report\` on this exact commit.`,
    ''
  );
  const row = (p, f) => {
    const t = f.trend;
    const tr = t
      ? `trend ${t.shares.map(s => pct(s.share)).join('>')}%${t.nucleating ? ` — newer pattern emerging: ${t.nucleating}` : ''}`
      : '';
    const notes = [
      tr,
      f.held && f.held.since ? `held since ${f.held.since}` : '',
      f.authorConc ? authorConcClause(f.authorConc) : '',
    ]
      .filter(Boolean)
      .join('; ');
    const ex = f.exemplars[0];
    const evidence = `${pct(f.share)}% of ${f.sraw} established${f.deviantsN ? `, ${f.deviantsN} deviant${f.deviantsN > 1 ? 's' : ''}` : ''}`;
    return `| ${factLabel(p, f)} | ${voice(
      'practiced',
      verbalize(
        f,
        f.exemplars.map(e => e.name)
      )
    )} | ${evidence} | ${ex ? `\`${ptr(ex.rel, ex.line, ex.endLine)}\`${skipLineNote(p, f, ex)}` : ''} | ${notes} |`;
  };
  const table = (p, heading, facts) => {
    if (!facts.length) return;
    lines.push(
      `### ${heading}`,
      '',
      '| where | convention | evidence | exemplar | notes |',
      '| --- | --- | --- | --- | --- |'
    );
    for (const f of facts.slice(0, top)) lines.push(row(p, f));
    if (facts.length > top)
      lines.push(
        '',
        `_… and ${facts.length - top} more — run \`grain rules --top ${facts.length}\` for all_`
      );
    lines.push('');
  };
  for (const p of model.partitions) {
    const { domain, structural, lexical, taut } = factTiers(p);
    lines.push(
      `## ${scopeLabel(p.name)}`,
      '',
      `${p.facts.length} conventions · ${p.medoids.length} groups · ${p.scopes} scopes · ${p.files.length} files`,
      ''
    );
    table(p, 'Domain conventions', domain);
    table(p, 'Syntax-shape facts (structural, not a chosen convention)', structural);
    table(p, 'Style conventions', lexical);
    if (taut)
      lines.push(
        `_${taut} group-defining marker${taut > 1 ? 's' : ''} not listed — a group selected by its decorator/supertype restating it is not news._`,
        ''
      );
    if ((p.templates || []).length) {
      lines.push('### Templates (unclustered residue)', '');
      for (const t of p.templates.slice(0, 6)) {
        const bits = [];
        for (const pi of t.perInstance)
          bits.push(`one slot per-instance (${pi.distinct}/${pi.total}, e.g. \`${pi.top}\`)`);
        for (const sl of t.slots) bits.push(`slot usually \`${sl.top}\` (${sl.k}/${sl.total})`);
        lines.push(
          `- \`${t.skel}\` — unclustered ${t.kind}s ×${t.n}, ~${Math.round(t.coverage * 100)}% of an average one${bits.length ? ' · ' + bits.join(' · ') : ''}${t.held ? ` · held since ${t.held.since}${t.held.fresh ? ` · ${t.held.fresh} new in 180d` : ''}` : ''} · ${TEMPLATE_DESCRIPTIVE_NOTE} — e.g. \`${ptr(t.exemplars[0].rel, t.exemplars[0].line, t.exemplars[0].endLine)}\``
        );
      }
      lines.push('');
    }
  }
  if (model.moduleGraph && model.moduleGraph.nodes.length > 1) {
    const mg = model.moduleGraph;
    lines.push(
      '## Architecture',
      '',
      `${mg.nodes.length} modules · ${mg.edges.length} directed dependencies · ${mg.cycles.length} cycle(s)`,
      ''
    );
    // the same two coverage disclosures report()'s architecture section carries (§G21, §004) — rendered as their
    // own paragraph(s), not report()'s 2-space indent, to match this document's own Markdown idiom
    const covNote = relCoverageNote(model);
    if (covNote) lines.push(covNote, '');
    const intraNote = intraModuleNote(model);
    if (intraNote) lines.push(intraNote, '');
    const out = new Map();
    for (const e of mg.edges) (out.get(e.from) || out.set(e.from, []).get(e.from)).push(e);
    for (const [from, es] of [...out]
      .sort((a, b) => b[1].reduce((x, y) => x + y.n, 0) - a[1].reduce((x, y) => x + y.n, 0))
      .slice(0, 12))
      lines.push(
        `- \`${from}/\` → ${es
          .slice(0, 5)
          .map(e => `\`${e.to}/\` (${e.n})`)
          .join(' · ')}${es.length > 5 ? ` · +${es.length - 5} more` : ''}`
      );
    if (mg.cycles.length) {
      lines.push(
        '',
        '**Cycles (strongly connected — every member reaches every other, not necessarily in this order):**',
        ''
      );
      for (const c of mg.cycles.slice(0, 4)) lines.push(`- ${c.join(', ')}`);
      lines.push('', CYCLE_GRANULARITY_NOTE);
    }
    const departures = (model.archNorms || []).filter(n => n.exp === 'false' && n.fromKind !== 'group'); // "module pair(s)" below is a claim about modules specifically — group-kind rows have their own home in computeArchHits, not this count
    if (departures.length)
      lines.push(
        '',
        `_Established layering: ${departures.length} module pair(s) where reaching the target is the counted exception, not the practice._`
      );
    lines.push('');
  }
  if (model.boundaries && model.boundaries.length) {
    lines.push(
      '## Boundaries',
      '',
      `${model.boundaries.length} architecture decision(s) in \`.grain/seeds.jsonl\``,
      ''
    );
    for (const bd of model.boundaries)
      lines.push(
        `- ${voice('decided', `\`${bd.boundary.from}/\` never imports \`${bd.boundary.to}/\`${bd.note ? ' — ' + bd.note : ''}${!bd.fromLive || !bd.toLive ? ' (a side names no indexed files — inert)' : ''}`, { typ: 'boundary', who: bd.author, when: bd.createdAt, id: bd.id })}`
      );
    lines.push('');
  }
  if (model.steers && model.steers.length) {
    lines.push(
      '## Maintainer decisions (steers)',
      '',
      `${model.steers.length} maintainer decision(s) in \`.grain/seeds.jsonl\``,
      ''
    );
    for (const st of model.steers) {
      if (!st.found) {
        lines.push(
          `- **${st.id}**: exemplar ${st.path}#${st.name} not found in HEAD — inert (edit or remove it)`
        );
        continue;
      }
      for (const sf of st.surfaces) {
        if (sf.retires) continue;
        lines.push(
          `- ${voice('decided', `${sf.value === null ? `${sf.pid} is not a surface of ${st.name}` : verbalize({ pid: sf.pid, exp: sf.value, kind: st.kind, heritageKind: heritageKindOf(sf.pid, model) }, [st.name]) + ' — ' + practicedBy(sf) + baselineClause(sf)} · weight ${st.weight}${st.note ? ' · ' + st.note : ''}`, { typ: 'steer', who: st.author, when: st.createdAt, id: st.id })}`
        );
        for (const rp of st.surfaces.filter(x => x.retires))
          lines.push(
            `  - retires: ${verbalize({ pid: rp.pid, exp: 'true', kind: st.kind, heritageKind: heritageKindOf(rp.pid, model) }, [])}`
          );
      }
    }
    lines.push('');
  }
  {
    const health = healthRows(model, outcomes);
    if (health.length) {
      lines.push(
        '## Health',
        '',
        `${health.length} signal${health.length > 1 ? 's' : ''} worth a maintainer decision`,
        ''
      );
      for (const h of health) lines.push(`- ${voice('practiced', h)}`);
      lines.push('');
    }
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines.push('', `*as of ${sha}*`); // frozen snapshot-time fact, deliberately part of the document (unlike the CLI's own ephemeral stamp() line — see cmdRules, grain.mjs)
  // (§024c) same snapshot-time-fact reasoning as the sha/date above: whether the generating worktree was dirty is
  // itself worth persisting alongside them, not just echoed on the CLI. `rules` is a HEAD-reader — `dirty` here is
  // never `+dirty`, only this distinct disclosure (see DIRTY_TREE_NOTE above).
  if (dirty) lines.push('', `*${DIRTY_TREE_NOTE}*`);
  return lines;
}
export function statusLines(model) {
  const nf = model.partitions.reduce((a, p) => a + p.facts.length, 0);
  const ng = model.partitions.reduce((a, p) => a + p.medoids.length, 0);
  const covNote = relCoverageNote(model);
  return [
    `model: ${model.repo} · ${model.partitions.length} partition(s) · ${ng} groups · ${nf} conventions · ${model.files} files${!model.historyStats ? ' — no git history: nothing counts as established, so no convention is spoken (groups and placement still answer `where`)' : ''}`,
    `agent-authored share of code younger than ${CFG.survDays} days: ${model.agentShare == null ? 'n/a (no history)' : Math.round(model.agentShare * 100) + '%'}${model.agentShare >= 0.85 ? ' ⚠ ALARM — the norm is being written by agents faster than humans review it' : ''}`,
    `nucleating stand-downs: ${model.partitions.reduce((a, p) => a + p.facts.filter(f => f.suppressedValue).length, 0)}`,
    // (§034a) "non-merge": walk() (history.mjs) runs `git log --no-merges` — a merge introduces no blob of its own,
    // so it never enters this count. Left unqualified, this number reads as `git log --oneline | wc -l` and looks
    // like lost history on any repo with real merge traffic (confirmed: nest reports 12,435 here against 21,710 in
    // plain `git log`). CFG.megaCap/nonMegaCommits (§J2.4b) are a SEPARATE, narrower accounting for the language
    // bridge's own base-rate denominator — they do not touch this total, which is exactly `commits.length` off the
    // `--no-merges` walk.
    `co-change pairs: ${model.cochange.length} · history: ${model.historyStats ? model.historyStats.commits + ' non-merge commits, ' + model.historyStats.blobs + ' blobs' : 'none (degraded weights)'}`,
    `architecture: ${model.moduleGraph?.nodes.length ?? 0} modules · ${(model.edges || []).length} file edges${model.edgesTruncated ? ' (+' + model.edgesTruncated + ' truncated)' : ''} · ${model.moduleGraph?.edges.length ?? 0} module edges · ${model.moduleGraph?.cycles.length ?? 0} cycle(s)`,
    ...(covNote ? [covNote] : []),
    ...(model.steers && model.steers.length
      ? [
          `steers: ${model.steers.filter(s => s.found).length} active${model.steers.some(s => !s.found) ? `, ${model.steers.filter(s => !s.found).length} inert (exemplar gone)` : ''} — .grain/seeds.jsonl`,
        ]
      : []),
    ...(model.boundaries && model.boundaries.length
      ? [`boundaries: ${model.boundaries.length} architecture decision(s) — .grain/seeds.jsonl`]
      : []),
  ];
}
export function completeness(model, changed) {
  const exp = new Set();
  for (const c of model.cochange)
    for (const f of changed) {
      if (c.a === f && !changed.includes(c.b)) exp.add(`${c.b} (co-changed ${c.sup}x, conf ${c.conf})`);
      if (c.b === f && !changed.includes(c.a)) exp.add(`${c.a} (co-changed ${c.sup}x, conf ${c.conf})`);
    }
  return exp.size
    ? [`[grain] Edits like this historically also touch:`, ...[...exp].slice(0, 5).map(x => '  - ' + x)]
    : ['(complete)'];
}
// the same loop `completenessDirectional` has always used, factored out so `missingLines` and `check-hook` can
// read the same DATA `completeness <file>` prints.
// §063: gated/ranked by the MAX of the two directional confidences, never the changed side's own forward
// confidence alone — a heavily-committed hub's own commit count as denominator makes even a near-certain partner
// read as noise (support=8, commitsA=392 -> 0.02) while the partner's OWN base rate (support=8, commitsB=10 ->
// 0.80, "when the partner changes, the hub changes 80% of the time") shows the real signal. A single changed file
// (completeness <file>, check <file>, both hooks) also gets the SAME looser 1/3 floor `cochangePartners`'s own
// single-file mode already uses below ("one file's history is sparse; a third of its commits is a real signal")
// — this function was the one place that floor was deliberately withheld, which is exactly what made
// `completeness` disagree with `where` on the same file (44 of the 45 hottest files in the measured corpus got a
// false "no file historically changes with these" — see .system/research/question-catalog.md §3.2). A multi-file
// `changed` set (`review` over several touched files) keeps the stricter CFG.cochangeMinConf: more files already
// means more corroborating evidence, so the sparse-history case for the looser floor doesn't apply.
// §074: `ambient` on a hit below is structural, not a new tunable — a partner whose OWN global commit count
// (`c.commitsA`/`c.commitsB`, whichever side IS the partner — never the display `commits`, which §063 already
// picks as whichever direction's denominator cleared the confidence bar and so can legitimately be the CHANGED
// file's own count instead) already clears the same λ bound `certifyObligationRules`' ambient gate uses, against
// `model.nonMegaCommits` — the exact population those counts were drawn from (history.mjs). Measured in
// `.system/research/obligations-design.md` §2: pooled over 20 repos, raw co-change recall@3 (0.285) loses to the
// null "3 hottest recently-changed files" (0.336), and the entire deficit is the ambient half — on companions
// outside the 10 hottest files co-change alone scores 0.198 against the null's 0.000. Never merge the two: an
// ambient partner crowds out a specific one at the top of a ranked list an agent has room to read only 3-5 of.
export function cochangeData(model, changed) {
  const hits = new Map();
  // §023: same liveness source and idiom as `cochangePartners`'s own `live` (core.mjs ~2552, added for §020) and
  // `howCmd`'s places[] `exists` flag (~2817) — one house-wide answer to "is this path still here at HEAD", never
  // a second/third liveness check invented per renderer.
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
  const minConf = changed.length === 1 ? 1 / 3 : CFG.cochangeMinConf;
  const N = model.nonMegaCommits || 0;
  for (const c of model.cochange) {
    const confAB = c.sup / (c.commitsA || 1),
      confBA = c.sup / (c.commitsB || 1);
    if (Math.max(confAB, confBA) < minConf) continue;
    // report the denominator of whichever direction actually cleared the bar — the honest number, not always
    // the changed side's own count (§063: `test/res.attachment.js (8/10)`, not the hub's own `8/392`)
    const commits = confAB >= confBA ? c.commitsA || c.sup : c.commitsB || c.sup;
    for (const f of changed) {
      if (c.a === f && !changed.includes(c.b)) {
        const k = c.commitsB || 0; // the PARTNER's (c.b) own global count — independent of which direction won `commits` above
        hits.set(c.b, clearsOwnRate(k, N)
          ? { file: c.b, sup: c.sup, commits, dead: !live.has(c.b), ambient: true, k, n: N, share: +(k / N).toFixed(3) }
          : { file: c.b, sup: c.sup, commits, dead: !live.has(c.b), ambient: false });
      }
      if (c.b === f && !changed.includes(c.a)) {
        const k = c.commitsA || 0; // the PARTNER's (c.a) own global count
        hits.set(c.a, clearsOwnRate(k, N)
          ? { file: c.a, sup: c.sup, commits, dead: !live.has(c.a), ambient: true, k, n: N, share: +(k / N).toFixed(3) }
          : { file: c.a, sup: c.sup, commits, dead: !live.has(c.a), ambient: false });
      }
    }
  }
  // strongest partner first (confidence, then raw support), file only as the final tiebreak — under the looser
  // single-file floor there can be more than 5 candidates, and slice(0,5) below must keep the best ones, not
  // whichever sort alphabetically first. Ambient hits sort in the same pass (a caller that wants them separated,
  // like `completenessDirectional`, filters by `.ambient` afterward) — this order is never itself rendered as one
  // ranked list.
  return [...hits.values()].sort(
    (a, b) => b.sup / b.commits - a.sup / a.commits || b.sup - a.sup || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)
  );
}
// scope-level co-change for `check <file>` (§J5.7b): the same directional-confidence test cochangeData applies to
// file pairs, over model.scopeCochange's SCOPE-key pairs instead — every pair with a scope in the checked file,
// above CFG.cochangeMinConf. `partitionName` is the checked file's own partition (r.partition): a rendered pair may
// name a scope in a different file/partition, but the line is anchored to the file the caller is looking at.
export function scopeCochangeLines(model, rel, partitionName) {
  const rows = [];
  for (const p of model.scopeCochange || []) {
    const ia = p.a.indexOf('#'),
      ib = p.b.indexOf('#');
    if (ia < 0 || ib < 0) continue;
    const aIn = p.a.slice(0, ia) === rel,
      bIn = p.b.slice(0, ib) === rel;
    if (!aIn && !bIn) continue;
    const commits = aIn ? p.commitsA || 1 : p.commitsB || 1;
    const conf = p.sup / commits;
    if (conf < CFG.cochangeMinConf) continue;
    const aName = p.a.slice(ia + 1).split('#')[1],
      bName = p.b.slice(ib + 1).split('#')[1];
    rows.push({ aName, bName, sup: p.sup, commits, conf });
  }
  rows.sort(
    (x, y) => y.conf - x.conf || (x.aName < y.aName ? -1 : x.aName > y.aName ? 1 : x.bName < y.bName ? -1 : 1)
  );
  const label = partitionName ? scopeLabel(partitionName) : 'this file';
  return rows
    .slice(0, 5)
    .map(r =>
      voice(
        'practiced',
        `co-change (scopes): \`${r.aName}\` ↔ \`${r.bName}\` in ${label} (${r.sup}/${r.commits})`
      )
    );
}
// stable contract: the standalone `completeness <file>` command prints this text verbatim on a SPECIFIC hit — do
// not change it (§023: except the new `(deleted)` marker on a dead partner, which the ticket's own acceptance
// requires — the live-partner case below is byte-for-byte unchanged, so the frozen contract holds for every
// fixture that predates it). The NO-hit case changed under §063: never certify `(complete)` — that phrase claims
// an absence this model cannot actually see (44 of the 45 hottest files in the measured corpus got exactly that
// false claim). Name the threshold that was actually applied instead. §074 adds a SEPARATE ambient section
// (`ambientLines`, shared with `obligationLines`) — never merged into this list: `.system/research/
// obligations-design.md` §2 measured raw co-change losing to the null "3 hottest recent files" pooled (0.285 vs
// 0.336), entirely because the ambient half crowds out the non-obvious half worth reading (0.198 vs 0.000 there).
export function completenessDirectional(model, changed) {
  // ranked by the max of the two directional confidences — see cochangeData's own §063 comment
  const hits = cochangeData(model, changed);
  const specific = hits.filter(h => !h.ambient);
  const ambient = hits.filter(h => h.ambient);
  const minConf = changed.length === 1 ? 1 / 3 : CFG.cochangeMinConf;
  const out = specific.length
    ? [
        `[grain] Edits like this historically also touch:`,
        ...specific
          .slice(0, 5)
          .map(h => `  - ${h.file}${h.dead ? ' (deleted)' : ''} (co-changed in ${h.sup}/${h.commits} commits)`),
      ]
    : [`no partner above ${pct(minConf)}% co-change confidence`];
  return [...out, ...ambientLines(ambient, 5)];
}
// the recipe half of `missingLines`: a NEW file's own carried marker (decorator/supertype/return type) or group role
// borrows exactly the "a new carrier/member comes with" mechanism `whereCmd` already reads off markerImplied/
// groupImplied (core.mjs, buildCards' marker/group cases) — same companion/registration fields, no new heuristic
function recipeLines(kindWord, mi, rel, files, helpers) {
  const { stem0, sufChain, suffixOf } = helpers;
  const lines = [];
  if (mi.companion) {
    const stem = stem0(rel);
    const present = files.some(f => f !== rel && stem0(f) === stem && sufChain(f) === mi.companion.pattern);
    if (!present)
      lines.push(
        voice(
          'practiced',
          `recipe: a new ${kindWord} carrier here usually comes with a same-stem \`${mi.companion.pattern}\` companion (${pct(mi.companion.share)}% of ${mi.companion.n}) — none in the change`
        )
      );
  }
  if (mi.importedBy) {
    if (!files.includes(mi.importedBy.file))
      lines.push(
        voice(
          'practiced',
          `recipe: a new ${kindWord} carrier here is registered in \`${mi.importedBy.file}\` (imports ${mi.importedBy.n} of ${mi.importedBy.of} carriers) — not touched`
        )
      );
  } else if (mi.importedByPattern) {
    const present = files.some(f => suffixOf(f) === mi.importedByPattern.pattern);
    if (!present)
      lines.push(
        voice(
          'practiced',
          `recipe: a new ${kindWord} carrier here is registered by a \`${mi.importedByPattern.pattern}\` file (${mi.importedByPattern.n} of ${mi.importedByPattern.of} carriers) — not touched`
        )
      );
  }
  return lines;
}
// one renderer for "what does my change still miss": co-change partners (from cochangeData, same threshold as
// `completeness`) and, for a genuinely NEW file (one `partitionFor` covers but that carries no history in the
// model yet — `newFileScopes[rel]` is the caller's own already-extracted scopes for it, e.g. `checkFile`'s result
// in `cmdReview`, never re-parsed here), a missing companion/registration recipe for any established marker or
// group role that file's own facts carry. Silent when nothing qualifies — never a "(complete)" placeholder here,
// unlike the standalone single-file `completeness` query above. J3.2's `kin:` and J4.2's `change shape:` sources
// round this out below.
// the raw, string-free lookup behind the "values" half of `kin:` — the certified co-travel norm (model.valueNorms,
// built once in learn()) read back against one changed file's OWN current values. No math here, the same read-only
// split as architectureNorms/computeArchHits. `vals` is the caller's already-extracted file-scope `vals` array
// (missingLines cannot parse: it is synchronous and checkFile is not). Exported because `review --json` reports
// exactly this structure, independently of the rendered lines.
export function valueKinGaps(model, rel, vals, changedSet) {
  const out = [];
  if (!model.valueNorms) return out;
  for (const e of vals || []) {
    const key = e.k + ':' + e.v;
    const N = model.valueNorms[e.c];
    if (!N) continue;
    // a value already in the surviving sibling set is judged against the "near" carriers (exactly one member short),
    // never the whole missing population: a file short of several members at once cannot be blamed for THIS one
    const held = (model.valueSiblings[e.c] || []).includes(key);
    const have = new Set((model.valueIndex[key] || []).map(([r]) => r));
    const gaps = (held ? N.near : N.full).filter(f => !have.has(f) && !changedSet.has(f));
    if (gaps.length)
      out.push({
        value: e.v,
        container: (model.valueContainer || {})[e.c] ?? null,
        gaps,
        bits: N.bits,
        ne: N.ne,
        neff: N.neff,
      });
  }
  return out;
}
export function missingLines(model, files, { sources = [], newFileScopes = {}, changedScopes = {} } = {}) {
  const out = [];
  if (sources.includes('cochange'))
    for (const h of cochangeData(model, files).slice(0, 5))
      out.push(
        voice(
          'practiced',
          `co-change: ${h.file}${h.dead ? ' (deleted)' : ''} (co-changed in ${h.sup}/${h.commits} commits)`
        )
      );
  if (sources.includes('recipe')) {
    const sufChain = rel => {
      const parts = basename(rel).split('.');
      return parts.length >= 2 ? '*.' + parts.slice(1).join('.') : null;
    };
    const suffixOf = rel => {
      const parts = basename(rel).split('.');
      return parts.length >= 3 ? '*.' + parts.slice(-2).join('.') : null;
    };
    const helpers = { stem0, sufChain, suffixOf };
    for (const rel of files) {
      const scopes = newFileScopes[rel];
      if (!scopes || !scopes.length) continue;
      const p = partitionFor(model, rel);
      if (!p) continue;
      const { assign, amb } = assignAll(scopes, p.medoids);
      const seen = new Set();
      scopes.forEach((s, i) => {
        if (s.kind === 'file' || s.kind === 'module') return;
        const mkKeys = [];
        for (const d of s.decos || []) mkKeys.push('deco:' + d);
        if (s.kind === 'type') for (const e of s.sup || []) mkKeys.push('sup:' + e);
        for (const r of s.rets || []) mkKeys.push('ret:' + r);
        for (const mkKey of mkKeys) {
          const key = 'm:' + mkKey;
          if (seen.has(key)) continue;
          seen.add(key);
          const mi = (p.markerImplied || {})[mkKey];
          if (mi) out.push(...recipeLines('marker', mi, rel, files, helpers));
        }
        const role = assign.get(i);
        if (role !== undefined && !amb.has(i)) {
          const key = 'g:' + role;
          if (!seen.has(key)) {
            seen.add(key);
            const gi = (p.groupImplied || {})[role];
            if (gi) out.push(...recipeLines('group', gi, rel, files, helpers));
          }
        }
      });
    }
  }
  // J3.2's `kin:` source, both halves. `changedScopes` covers EVERY successfully parsed file of the change (the
  // values half must speak about an enum that already exists), where `newFileScopes` above covers only genuinely
  // new ones (the stem half, like `recipe:`, is about a new file's missing counterpart). J4.2's `change shape:`
  // source follows it below.
  if (sources.includes('kin')) {
    const changed = new Set(files);
    for (const rel of files) {
      const fsc = (changedScopes[rel] || []).find(s => s.kind === 'file');
      if (!fsc) continue;
      for (const g of valueKinGaps(model, rel, fsc.vals, changed)) {
        const label = g.container ? ` (added to \`${g.container}\`)` : ''; // a positional string container has no name to print
        out.push(
          voice(
            'practiced',
            `kin: \`${g.value}\`${label} — its siblings also appear in: ${g.gaps.join(', ')} — not in your change`
          )
        );
      }
    }
    const rolesInChange = new Map(); // partition name -> every role the WHOLE changed set occupies, committed members and new files alike
    const rolesFor = p => {
      let rs = rolesInChange.get(p.name);
      if (rs) return rs;
      rs = new Set();
      for (const [k, r] of Object.entries(p.assignments || {}))
        if (r !== -1 && changed.has(k.split('#')[0])) rs.add(r);
      for (const f of files) {
        const sc = newFileScopes[f];
        if (!sc || !sc.length) continue;
        const a2 = assignAll(sc, p.medoids);
        a2.assign.forEach((r, i) => {
          if (!a2.amb.has(i)) rs.add(r);
        });
      }
      rolesInChange.set(p.name, rs);
      return rs;
    };
    for (const rel of files) {
      const scopes = newFileScopes[rel];
      if (!scopes || !scopes.length) continue;
      const p = partitionFor(model, rel);
      if (!p || !p.groupKin) continue;
      const { assign, amb } = assignAll(scopes, p.medoids);
      const mine = new Set();
      assign.forEach((r, i) => {
        if (!amb.has(i)) mine.add(r);
      });
      const present = rolesFor(p);
      const said = new Set();
      for (const r of [...mine].sort((a, b) => a - b)) {
        const kin = p.groupKin[r];
        if (!kin || present.has(kin.role) || said.has(kin.role)) continue;
        said.add(kin.role);
        out.push(
          voice(
            'practiced',
            `kin: ${rel} has no «${kin.label}» counterpart (${kin.n} of ${kin.of} members of «${p.medoids[r]?.label || 'group'}» do)`
          )
        );
      }
    }
  }
  // J4.2's `change shape:` source: build the change's own cell-set the SAME way learn() built a commit footprint's
  // (§J4.1) — `m:`/`k:` per file plus `g:` per role the change's own scopes occupy (via `partitionFor`+`assignAll`,
  // same read `kin:`'s role half above uses) — then find the archetype it best matches by `jacW` under the exact
  // membership/ambiguity gate `assignAll` itself uses for a scope and a role medoid (`CFG.minMemb`/`CFG.ambGap`):
  // below the floor, or too close to a second archetype, two shapes would fight over one change, so neither claims
  // it. An archetype's IDENTITY for matching is its WHOLE cell bag (shared cells included), but only its CERTIFIED
  // cells are worth reporting as missing — a complete match to a shape is not a gap, so it says nothing at all.
  if (sources.includes('shape') && (model.changeArchetypes || []).length) {
    const refined =
      model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || [], model.srcRoots || []));
    const changeCells = new Set();
    for (const rel of files) {
      changeCells.add('m:' + refined(rel));
      const sf = sufOf(rel);
      if (sf) changeCells.add('k:' + sf);
      const scopes = changedScopes[rel];
      if (!scopes || !scopes.length) continue;
      const p = partitionFor(model, rel);
      if (!p) continue;
      const { assign, amb } = assignAll(scopes, p.medoids);
      assign.forEach((r, i) => {
        if (!amb.has(i)) changeCells.add('g:' + p.name + '#' + r);
      });
    }
    let best = null,
      m1 = -1,
      m2 = -1;
    for (const a of model.changeArchetypes) {
      const m = jacW(
        changeCells,
        a.cells.map(c => c.cell)
      );
      if (m > m1) {
        m2 = m1;
        m1 = m;
        best = a;
      } else if (m > m2) m2 = m;
    }
    if (best && m1 >= CFG.minMemb && m1 - m2 >= CFG.ambGap) {
      const certified = best.cells.filter(c => c.certified);
      const absent = certified.filter(c => !changeCells.has(c.cell));
      if (absent.length) {
        const touched = certified.length - absent.length;
        out.push(
          voice(
            'practiced',
            `change shape: this change touches ${touched} of ${certified.length} certified cells of "${best.label}" — absent: ${absent.map(c => `${archCellLabel(model, c.cell)} (${c.k} of ${best.n})`).join(', ')}`
          )
        );
      }
    }
  }
  return out.length ? [`missing from your change:`, ...out] : [];
}
// ===== MUTATION HARNESS (dev/test only: plants real deviations into conforming exemplars, verifies detection) =====
function mutate(src, f, ex) {
  const p = f.pid;
  if (p.startsWith('auto.deco:') && f.exp === 'true') {
    const d = p.slice(10).replace('@', '');
    const re = new RegExp('^\\s*@' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b.*$', 'gm');
    return re.test(src) ? src.replace(re, '') : null;
  }
  if (p.startsWith('auto.extends:') && f.exp === 'true') {
    const e = p.slice(13);
    const re = new RegExp('(extends|implements|\\()\\s*' + e.replace(/[$.]/g, '\\$&') + '\\b');
    const lineOff = src
      .split('\n')
      .slice(0, Math.max(0, (ex.line || 1) - 1))
      .join('\n').length; // mutate the exemplar's own heritage, not the file's first
    const tail = src.slice(lineOff);
    return re.test(tail)
      ? src.slice(0, lineOff) + tail.replace(re, '$1 SomethingElse')
      : re.test(src)
        ? src.replace(re, '$1 SomethingElse')
        : null;
  }
  if (p.startsWith('auto.imp:') && f.exp === 'false') {
    const spec = p.slice(9);
    if (spec.startsWith('~/')) return null;
    // one candidate per import syntax family — re-extraction keeps whichever this file's grammar accepts
    return {
      candidates: [
        `import __planted from '${spec}';\n` + src,
        `import ${spec}\n` + src,
        `from ${spec} import __planted\n` + src,
        `#include <${spec}>\n` + src,
      ],
      imp: spec,
    };
  }
  if (p === 'auto.nameshape' && ex) {
    const nn = tokenize(ex.name).join('_');
    if (!nn || nn === ex.name) return null;
    return src.split(ex.name).join(nn);
  }
  if (p.startsWith('auto.call:') && f.exp === 'false') {
    const call = p.slice(10);
    if (/[^\w.$]/.test(call)) return null;
    const lineOff = src
      .split('\n')
      .slice(0, Math.max(0, (ex.line || 1) - 1))
      .join('\n').length; // anchor at the exemplar's own line
    const at = src.indexOf(ex.name, lineOff);
    if (at < 0) return null;
    const cands = [];
    let brace = src.indexOf('{', at);
    for (let k = 0; k < 10 && brace >= 0; k++) {
      cands.push(src.slice(0, brace + 1) + `\n  ${call}();` + src.slice(brace + 1));
      brace = src.indexOf('{', brace + 1);
    }
    const lines = src.split('\n');
    for (let li = Math.max(0, (ex.line || 1) - 1); li < Math.min(lines.length, (ex.line || 1) + 5); li++) {
      if (!/:\s*(#.*)?$/.test(lines[li])) continue;
      const indent = (lines[li].match(/^\s*/)[0] || '') + '    ';
      cands.push([...lines.slice(0, li + 1), indent + call + '()', ...lines.slice(li + 1)].join('\n'));
    }
    return cands.length ? { candidates: cands, call } : null;
  }
  return null;
}
const PLANTABLE_PID = /^auto\.(deco|extends|imp|call):|^auto\.nameshape$/;
export async function mutateTest({ model, root }) {
  const res = { detected: 0, missed: 0, silentOK: 0, falseFire: 0, unsupported: 0, cases: [] };
  for (const part of model.partitions) {
    const withExemplars = part.facts.filter(f => f.exemplars.length);
    // §046: a certified fact whose pid carries no mutation strategy below (lexical/shape/birth facts, not
    // deco/extends/imp/call/nameshape) used to be dropped HERE, before the loop, so it never touched `unsupported`
    // either — a repo whose only certified conventions are of such a kind (telescope.nvim: auto.has/auto.filebirth/
    // auto.lex/auto.stshape) got a bare, unexplained 0/0/0/0 instead of an accounted "N unsupported". Count it now,
    // without touching the plantable candidate pool or its 16-per-partition cap below.
    for (const f of withExemplars) if (!PLANTABLE_PID.test(f.pid)) res.unsupported++;
    const cands = withExemplars.filter(f => PLANTABLE_PID.test(f.pid)).slice(0, 16);
    for (const f of cands) {
      const ex = f.exemplars[0];
      let src;
      try {
        src = readFileSync(join(root, ex.rel), 'utf8');
      } catch {
        continue;
      }
      const b0 = await checkFile({ model, root, rel: ex.rel, content: src });
      const before = b0.msgs;
      if (before.some(m => m.pid === f.pid && m.scope === ex.name)) {
        res.falseFire++;
        res.cases.push({ FALSEFIRE: f.cid + ' ' + f.pid + '=' + f.exp, file: ex.rel, scope: ex.name });
        continue;
      }
      // the fact must actually GOVERN the exemplar before the mutation (an ambiguous member is outside role governance
      // by the ambGap policy) — planting on an ungoverned scope measures that policy, not detection
      if (f.kind !== 'file' && !b0.governed.some(g0 => g0.pid === f.pid && g0.scope === ex.name)) {
        res.unsupported++;
        continue;
      }
      res.silentOK++;
      let mut = mutate(src, f, ex);
      if (mut === null) {
        res.unsupported++;
        continue;
      }
      if (mut.candidates) {
        // injected mutations: keep the candidate where the planted artifact really lands (ground truth = extraction)
        // the grammar is resolved from the file's OWN content once (§040: `.h` names two), never re-decided per
        // mutated candidate — a mutation must not be able to flip the grammar the comparison is made under
        const { p: pp, tree: t00 } = await parseFile(extname(ex.rel), src);
        t00.delete();
        const bb = bindingFor(pp._g);
        let picked = null;
        for (const cand of mut.candidates) {
          const tr2 = pp.parse(cand);
          const ss = extractScopes(ex.rel, tr2, bb);
          tr2.delete();
          const ok = mut.call
            ? ss.find(x => x.name === ex.name && x.calls.has(mut.call))
            : ss.find(x => x.kind === 'file' && x.imports.includes(mut.imp));
          if (ok) {
            picked = cand;
            break;
          }
        }
        if (!picked) {
          res.unsupported++;
          continue;
        }
        mut = picked;
      }
      // ground truth by re-extraction, as for injections: a mutation that breaks the parse (a multiline decorator's
      // opening line removed) or fails to flip the surface measures ITSELF, not detection — count it unsupported
      {
        const { p: pp2, tree: tr0 } = await parseFile(extname(ex.rel), src);
        const bb2 = bindingFor(pp2._g);
        const ss0 = extractScopes(ex.rel, tr0, bb2);
        tr0.delete();
        const orig = ss0.find(x => x.name === ex.name);
        const tr3 = pp2.parse(mut);
        const ss3 = extractScopes(ex.rel, tr3, bb2);
        tr3.delete();
        const still = ss3.find(
          x => x.name === ex.name || (f.pid === 'auto.nameshape' && x.name === tokenize(ex.name).join('_'))
        );
        const intact = still && (!orig || still.nt === orig.nt); // error recovery yielding a syntax wreck (nt degraded) measures the mutation, not detection
        const flipped = f.pid.startsWith('auto.deco:')
          ? intact && !still.decos.includes(f.pid.slice(10).replace('@', ''))
          : f.pid.startsWith('auto.extends:')
            ? intact && !still.sup.includes(f.pid.slice(13))
            : !!intact;
        if (!intact || !flipped) {
          res.unsupported++;
          continue;
        }
      }
      const after = (await checkFile({ model, root, rel: ex.rel, content: mut })).msgs;
      const hit = after.some(
        m =>
          m.pid === f.pid &&
          (m.scope === ex.name || (f.pid === 'auto.nameshape' && m.scope === tokenize(ex.name).join('_')))
      );
      res[hit ? 'detected' : 'missed']++;
      if (!hit) res.cases.push({ fact: f.cid + ' ' + f.pid + '=' + f.exp, file: ex.rel });
    }
  }
  return res;
}
// ===== SELFTEST --extract: declaration RECALL/PRECISION against a grammar-derived oracle (§3.B, loop-v2) =====
// The oracle answers "what does this grammar's OWN node-types.json say a declaration looks like", independent of
// bindingFor's `b.scope` (whose loosebody branch additionally keyword-matches a type's own NAME — class/function/
// object/…, §bindingFor above). A "declaration candidate" here is any NAMED node type that (a) carries a `name`
// field or a `declarator` field — the same two ingredients `b.scope`'s PRIMARY rule uses — AND (b) has, somewhere
// in its OWN node-types.json schema (a field's declared types, or an unnamed child's declared types), something
// shaped like a body or a block. No language, keyword or per-grammar list: (b) is read off the same `fields`/
// `children` schema bindingFor already parses, just without the loosebody branch's NAME-based keyword match —
// "kod to kod", ask the grammar, don't pattern-match a word list. Where this makes the oracle DISAGREE with
// bindingFor's own `b.scope` (wider on a `_declaration`-suffixed node whose schema shows a body-shaped child but
// whose keyword prefix the loosebody list does not carry; narrower on a grammar with no such node at all) is
// itself a finding, not a defect in either rule — see `extractCoverage`'s `boundary` flag below.
// One exclusion, reused from extraction rather than reinvented: `isLocationNode` (namespace/package/mod) — a
// location statement names WHERE code lives, not a unit of code, and extraction never turns one into a scope on
// purpose (§extractScopes, the same predicate, same comment). Applying it here too keeps both artifacts agreed on
// what "a declaration" fundamentally excludes; without it, every namespace block would count as a permanent,
// uninteresting "miss" that swamps the real ones (measured on leveldb: 10 of the first 10 misses were `namespace
// leveldb { … }`, none of them a genuine silence bug).
const oracleTypesCache = {};
export function declCandidateTypes(gname) {
  if (oracleTypesCache[gname]) return oracleTypesCache[gname];
  const nt = JSON.parse(readFileSync(join(GRAMMAR_DIR, `tree-sitter-${gname}.node-types.json`), 'utf8'));
  const bodyShaped = t => /body|block/i.test(t);
  const out = new Set();
  for (const n of nt) {
    if (n.named === false || isLocationNode(n.type)) continue;
    const f = n.fields || {};
    if (!f.name && !f.declarator) continue;
    if (f.body) {
      out.add(n.type);
      continue;
    } // a `body` FIELD is body-shaped by its own name, whatever type it holds
    const fieldTypes = Object.values(f).flatMap(spec => (spec.types || []).map(t => t.type));
    const childTypes = (n.children?.types || []).map(t => t.type);
    if (fieldTypes.some(bodyShaped) || childTypes.some(bodyShaped)) out.add(n.type);
  }
  oracleTypesCache[gname] = out;
  return out;
}
// per-file recall/precision of `extractScopes` against the oracle above, matched at the SAME LINE — never by
// name (a right-line-wrong-name declaration is a different failure class; §A's claim auditor covers it). `files`
// and `read` are supplied by the caller (grain.mjs decides whether the universe is the HEAD tree or a no-git
// worktree walk, exactly as `learn()`'s own `tree` parameter does), so this stays as git-agnostic as
// `extractScopes` itself. The mandatory `kind: 'file'` wrapper scope every file gets (line 1, always, regardless
// of grammar) is excluded on both sides — it is a container, never a declaration, and counting it would make any
// real declaration that happens to start on line 1 a free "hit" no matter what extractScopes actually saw.
// `boundary: true` on a grammar means its node-types.json has NO node type shaped like (a)+(b) above at all (the
// data grammars — JSON/YAML/TOML/properties — are exactly bindingFor's own `b.data` set, §bindingFor):
// recall/precision are not meaningful there, and every scope extractScopes records for it is, by the oracle's own
// admission, unfalsifiable — reported as a boundary, not a score.
export async function extractCoverage({ root, files, read }) {
  const readOne =
    read ||
    (rel => {
      try {
        return readFileSync(join(root, rel), 'utf8');
      } catch {
        return null;
      }
    });
  const grammars = {};
  let noParse = 0;
  const misses = [],
    extras = [];
  for (const rel of files) {
    const src = readOne(rel);
    if (src == null) {
      noParse++;
      continue;
    }
    let p, tree;
    try {
      ({ p, tree } = await parseFile(extname(rel), src));
    } catch {
      noParse++;
      continue;
    }
    const gname = p._g,
      b = bindingFor(gname);
    const G =
      grammars[gname] ||
      (grammars[gname] = {
        candidates: 0,
        scopes: 0,
        hits: 0,
        matchedScopes: 0,
        boundary: declCandidateTypes(gname).size === 0,
      });
    const scopes = extractScopes(rel, tree, b, gname).filter(s => s.kind !== 'file');
    G.scopes += scopes.length;
    const scopeLines = new Set(scopes.map(s => s.line));
    const types = [...declCandidateTypes(gname)];
    const candLines = new Set();
    if (types.length)
      for (const n of tree.rootNode.descendantsOfType(types)) {
        if (n.isMissing) continue; // a synthetic recovery node names no real declaration in the source
        const line = n.startPosition.row + 1;
        candLines.add(line);
        G.candidates++;
        if (scopeLines.has(line)) G.hits++;
        else if (misses.length < 10) misses.push(`${rel}:${line} ${scopeName(n)}`);
      }
    for (const s of scopes) {
      if (candLines.has(s.line)) G.matchedScopes++;
      else if (extras.length < 10) extras.push(`${rel}:${s.line} ${s.name}`);
    }
    tree.delete();
  }
  const div = (a, d) => (d > 0 ? a / d : null);
  for (const g of Object.values(grammars)) {
    g.recall = div(g.hits, g.candidates);
    g.precision = div(g.matchedScopes, g.scopes);
  }
  const total = { candidates: 0, scopes: 0, hits: 0, matchedScopes: 0 };
  for (const g of Object.values(grammars))
    for (const k of ['candidates', 'scopes', 'hits', 'matchedScopes']) total[k] += g[k];
  total.recall = div(total.hits, total.candidates);
  total.precision = div(total.matchedScopes, total.scopes);
  return { grammars, total, files: files.length, noParse, misses, extras };
}

// ===== the seams already split out of this file =====
// the cell-key sentinels and the two path/extension primitives every layer shares
export { toPosix, CODE_RE } from './base.mjs';
// generic language binding derived from each grammar's node-types.json, the parser pool, and the file/token primitives
export { bindingFor, getParser, parseFile, walkFiles, tokenize, nameShape, hashStr } from './parse.mjs';
// the node-type predicates and the declaration, member and modifier helpers extraction is built from
export { scopeName, TYPE_LIKE_RE, FUNC_LIKE_RE, isLocationNode } from './extract.mjs';
// extractScopes — the extraction pipeline itself: one walk of one file's AST into scopes and their predicates
export { extractScopes } from './scopes.mjs';
// skeletons, role profiles, templates and twins: the structural superposition a scope is read against
export {
  skelOf,
  skAu,
  skRender,
  profileOf,
  skSil,
  mineTemplates,
  twinsOf,
  exportShape,
  DOC_STOP,
  docTokens,
} from './superposition.mjs';
// the file-scope lexical layer (the surfaces an AST cannot carry) and the scope-to-line map
export { lexicalPreds, fileLevelPreds, scopeLine, scopeLineEnd } from './lexical.mjs';
// the objective and the fact vocabulary: KT posteriors, Jaccard, feature weights, cell labels and ordering
export {
  ptr,
  skeyR,
  decoSigiled,
  decoLabel,
  applyVocab,
  isBool,
  STRUCT_PID,
  BODY_KINDS,
  jac,
  jacW,
  isDefiningFact,
  kt,
  clearsOwnRate,
  currentPathOf,
  archCellLabel,
  part,
  scopeLabel,
  pct,
  factLabel,
} from './facts.mjs';
// birth obligations — what a new file under a module has historically come with
export { buildObligationTable, obligationFor, obligationLines } from './obligations.mjs';
// clustering, roles and the MDL/lambda miner, plus the deviant, marker, held and authorship summaries
export {
  induceClusters,
  induceRoles,
  assignAll,
  countCandidates,
  mine,
  topDeviants,
  altMarkerFor,
  heldSummary,
  authorConcentration,
  voice,
  authorConcClause,
  factNotes,
  deviantLine,
  skipLineNote,
  roleLift,
} from './mine.mjs';
// history weighting (survival x provenance x churn), value trends and calibration
export { mkWeightFn, valOf, trendsFor, rejectedValues, calibrate, heritageKindOf } from './weights.mjs';
// the verbalizer: units, shapes, and the English a convention or a deviation is said in
export {
  unitOf,
  scopeNamed,
  scopeBacktick,
  shapeShort,
  shapeWords,
  verbalize,
  lexWords,
  deviationPhrase,
  readCargoCrateName,
} from './verbalize.mjs';
// package roots, MDL cuts, the current-tree extraction, the vocabulary, and scope (de)serialization
export {
  findPackageRoots,
  mdlCuts,
  partOfFn,
  partitionFor,
  normalizeCR,
  extractTree,
  addModuleScopes,
  buildVocab,
  lexDomain,
  groupPartitions,
  serializeScope,
  hydrateScope,
} from './partition.mjs';
