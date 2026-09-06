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
import { basename, dirname, join as pjoin, normalize as pnormalize } from 'node:path/posix';
import { CFG, EXCL, HARD_EXCL } from './config.mjs';
import {
  buildEdges,
  moduleGraph,
  refineModOf,
  sourceRootsOf,
  compactDecls,
  tableFrom,
  parseJsonc,
  parsePsr4,
} from './relations.mjs';
import { architectureNorms } from './arch.mjs';
import { toPosix } from './base.mjs';
import { buildCards } from './cards.mjs';
import { VALUE_INDEX_CAP, VALUE_NORM_PLACES, stem0 } from './extract.mjs';
import {
  applyVocab,
  archCellLabel,
  archCellSort,
  currentPathOf,
  decoLabel,
  kt,
  scopeLabel,
  skeyR,
} from './facts.mjs';
import {
  altMarkerFor,
  authorConcentration,
  countCandidates,
  heldSummary,
  induceClusters,
  induceRoles,
  mine,
  roleLift,
  topDeviants,
} from './mine.mjs';
import { buildObligationTable } from './obligations.mjs';
import { tokenize, walkFiles } from './parse.mjs';
import {
  addModuleScopes,
  buildVocab,
  extractTree,
  findPackageRoots,
  groupPartitions,
  lexDomain,
  mdlCuts,
  serializeScope,
} from './partition.mjs';
import { nameTokens, sufOf } from './placement.mjs';
import { mineTemplates, profileOf, twinsOf } from './superposition.mjs';
import { readCargoCrateName, shapeWords } from './verbalize.mjs';
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
// placement on create: a new file whose name-kin already live in one place, from path evidence alone
export { QSTOP, sufOf, nameTokens, placementHit } from './placement.mjs';
// checkFile — the verdict for one file against the model — and the grouping of its deviations
export { checkFile, groupDeviations } from './check.mjs';
// the measured architecture: dependency norms, architecture hits, and the relation layer of a learn pass
export { architectureNorms } from './arch.mjs';
// the full local-to-global convention lattice for one file, with no acceptance cut
export { spectrum } from './spectrum.mjs';
// card building and the card-level line renderers every answer is assembled from
export {
  buildCards,
  normTok,
  cochangePartners,
  practicedBy,
  baselineShare,
  baselineClause,
  inLineForCard,
  inLineForFile,
} from './cards.mjs';
// whereCmd — intent to place, expectations and a pattern to copy
export { whereCmd } from './where.mjs';
// howCmd — intent to the past commits that look like it
export { howCmd } from './how.mjs';
// value-kind evidence, type-reference hits, tested-by evidence and the blind/ungrammared file lists
export { blindFiles, ungrammaredFiles, testedByEvidence } from './evidence.mjs';
// whatCmd — words to the concept card
export { whatCmd } from './what.mjs';
// the leave-one-out self-evaluations behind selftest --how, --where and --obligation
export { howEval, leakSubtractedH, whereEval, obligationEval } from './evals.mjs';
// the fact tiers, the standing notes and the health rows a report is built from
export {
  factTiers,
  DIRTY_TREE_NOTE,
  quoteFlags,
  lexTally,
  TEMPLATE_DESCRIPTIVE_NOTE,
  relCoverageData,
  CYCLE_GRANULARITY_NOTE,
  healthRows,
} from './report-facts.mjs';
// report, rules, status and the structural map
export { report, moduleLayers, mapSections, rulesMarkdown, statusLines } from './report.mjs';
// completeness, scope and file co-change, recipes, value-kin gaps and the missing lines
export {
  completeness,
  cochangeData,
  scopeCochangeLines,
  completenessDirectional,
  valueKinGaps,
  missingLines,
} from './completeness.mjs';
// the mutation harness and the extraction-recall selftest (dev and test only)
export { mutateTest, declCandidateTypes, extractCoverage } from './harness.mjs';
