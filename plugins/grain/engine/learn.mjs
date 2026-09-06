// grain engine · learn — the current tree plus history folded into the model every query is answered from
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { basename, dirname } from 'node:path/posix';
import { CFG } from './config.mjs';
import { refineModOf } from './relations.mjs';
import { applyRelationLayer } from './arch.mjs';
import { applyChangeArchetypes, applyConcepts, applyMsgAffinity } from './commit-log.mjs';
import { applyBoundaries, applySteers, applyWaivers } from './decisions.mjs';
import { VALUE_INDEX_CAP, VALUE_NORM_PLACES } from './extract.mjs';
import { applyVocab, currentPathOf, decoLabel, kt, skeyR } from './facts.mjs';
import {
  altMarkerFor,
  authorConcentration,
  countCandidates,
  heldSummary,
  induceRoles,
  mine,
  roleLift,
  topDeviants,
} from './mine.mjs';
import { buildObligationTable } from './obligations.mjs';
import { walkFiles } from './parse.mjs';
import {
  applyGroupImplications,
  applyStructuralTwins,
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
import { mineTemplates, profileOf } from './superposition.mjs';
import { shapeWords } from './verbalize.mjs';
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
  applySteers(model, prepared, seeds);
  // cross-cell contested marking: any accepted fact asserting a value a seed's exemplar contradicts is superseded — its
  // deviations toward the seeded value stand down and its renderings say so (the old rule must not argue with the decision)
  for (const part2 of model.partitions)
    for (const f of part2.facts)
      for (const sd of seeds || []) {
        if (!sd.pids.includes(f.pid) || f.contested || (f.seeded || []).includes(sd.id)) continue;
        const pr2 = prepared.find(pr => pr.ps.some(x => x.rel === sd.path && x.name === sd.name));
        if (!pr2) continue;
        const ex2 = pr2.ps.find(x => x.rel === sd.path && x.name === sd.name);
        const v2 = ex2 ? ex2.preds[f.pid] : undefined;
        if (v2 !== undefined && v2 !== f.exp) {
          f.contested = sd.id;
          f.suppressedValue = v2;
        }
      }
  applyRelationLayer(model, { root, files, pkgs, tree, relFacts, log });
  applyGroupImplications(model, files);
  applyStructuralTwins(model, log);
  applyWaivers(model, prepared, waivers);
  applyBoundaries(model, boundaries, files);
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
  applyMsgAffinity(model, H, files);
  applyConcepts(model, H);
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
  applyChangeArchetypes(model, H);
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
