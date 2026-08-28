// grain export — the whole model as one machine-readable dump, for consumers that are not a querying agent:
// THE SCHEMA IS A PUBLISHED INTERFACE. A separate fine-tuning pipeline consumes this output (conventions with
// sites, machine checks, and the anchor lines its sample cutter masks for fill-in-the-middle examples). Field
// renames and semantic changes here are breaking changes for that consumer: make them deliberately, version them
// (schema: grain-export/1), and never as a side effect of an engine refactor.
// training-data pipelines (LoRA / fine-tuning on a repository's conventions), dashboards, audits.
//
// `where`/`check` answer one question with a cut; `export` answers none and cuts nothing it holds:
//   · every accepted convention with its context (partition / group / directory), evidence, trend and calibration
//   · every site that conforms and every site that deviates — path, kind, name, line range, observed value — each
//     deviation paired with its nearest conforming exemplar (same file, then nearest directory)
//   · anchors: the lines inside each site where the convention manifests (the decorator line, the import lines, the call
//     lines, the header) — enough to cut a fill-in-the-middle sample around the convention, not the whole scope
//   · a machine check per convention (enumerator + argument + expected value + context) that mirrors what `check` runs
//   · lifecycle per site and per convention from the replayed history (first seen, last touched, repairs/departures)
//   · groups (roles) with members, markers, directory distribution and file-name shape — the directory grammar
//   · markers with carriers, directories, co-change pairs with directional confidence
// The dump is a pure function of the index (HEAD tree + history); uncommitted edits never enter it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname, basename, extname } from 'node:path/posix';
import { CFG, ENGINE_VERSION, EXTR_V } from './config.mjs';
import { hydrateScope, addModuleScopes, applyVocab, skeyR, isBool, kt, verbalize, deviationPhrase, unitOf, scopeLabel, nameShape, valOf, shapeWords } from './core.mjs';

const UNSEEN = ' ';
const iso = ts => ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null;

// pid → (enumerator, argument, family): the machine-check vocabulary, one row per feature family the miner speaks
export function featureOf(pid) {
  const m = pid.match(/^auto\.([a-z0-9]+)(?::(.*))?$/); if (!m) return { enumerator: pid, argument: null, family: 'other' };
  const [, e, arg] = m;
  const family = { nameshape: 'identity', filenameshape: 'identity', deco: 'identity', extends: 'identity', returns: 'identity', arity: 'identity',
    has: 'behaviour', call: 'behaviour', stshape: 'behaviour', first1: 'behaviour', ret: 'behaviour', varshape: 'behaviour', imp: 'dependency',
    dir1: 'placement', dir2: 'placement', dir3: 'placement', moddirshape: 'placement', modfileshape: 'placement', modsize: 'placement', lex: 'lexical' }[e] || 'other';
  return { enumerator: e, argument: arg ?? null, family }; }

function contextOf(cid, part) {
  if (cid.startsWith('_all')) return { type: 'partition' };
  if (cid.startsWith('d[')) return { type: 'directory', dir: cid.slice(2, cid.indexOf(']')) };
  const r = +cid.slice(1).split(':')[0]; return { type: 'group', group: 'r' + r, label: part.medoids[r]?.label || 'group' }; }
const inContext = (ctx, s, role) => ctx.type === 'partition' ? true : ctx.type === 'directory' ? s.rel.startsWith(ctx.dir + '/') : role === +ctx.group.slice(1);

// where inside a site the convention manifests — line numbers a sample cutter can mask, never a guess beyond the scope
function focusLines(lines, s, pid, exp) {
  if (!lines) return null;
  const { enumerator, argument } = featureOf(pid);
  const from = s.line, to = Math.min(s.endLine || s.line, lines.length);
  const scan = (a, b, re, cap = 4) => { const out = []; for (let i = Math.max(1, a); i <= Math.min(b, lines.length) && out.length < cap; i++) if (re.test(lines[i - 1])) out.push(i); return out; };
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (enumerator === 'deco') { const nm = argument.replace(/^[@[]|\]$/g, ''); const f = scan(from - 10, Math.min(from + 15, Math.max(to, from)), new RegExp('[@[]\\s*' + esc(nm) + '\\b')); return f.length ? [f[0]] : [from]; } // the stack may sit above OR inside a multi-line declaration head
  if (enumerator === 'imp') { const tail = argument.split('/').pop(); const f = scan(1, lines.length, new RegExp('(import|require|use|include|from|using)\\b.*\\b' + esc(tail) + '\\b'), 6); return f.length ? f : []; }
  if (enumerator === 'call') { let f = scan(from, to, new RegExp(esc(argument) + '\\s*\\('), 6);
    if (!f.length) f = scan(from, to, new RegExp('(^|[^\\w.])' + esc(argument.split('.').pop()) + '\\s*\\('), 6); // `this.client\n  .send(` — the head splits across lines, its last segment does not
    return f.length ? f : [from]; }
  if (enumerator === 'returns') { // the return type sits wherever the (possibly multi-line) signature puts it — measured: 29% of
    // multiline-signature sites had the type off the declaration line, and every one of them anchored to the wrong line
    const f = scan(from, Math.min(from + 12, to), new RegExp('(^|[^\\w])' + esc(argument.replace(/^[?!]/, '')) + '($|[^\\w])'), 2); return f.length ? [f[0]] : [from]; }
  if (enumerator === 'extends' || enumerator === 'nameshape' || enumerator === 'arity') return [from];
  if (enumerator === 'first1') return [Math.min(from + 1, to)];
  if (enumerator === 'ret') { const f = scan(from, to, /\breturn\b/, 6); return f.length ? [f[f.length - 1]] : [to]; }
  if (enumerator === 'filenameshape') return [];
  return [from]; }

// the conforming site closest to a deviant: same file first, then the longest shared directory prefix, then the same group
function nearestExemplar(dev, conforming, roleOfKey) {
  let best = null, bs = -1;
  const dsegs = dirname(dev.rel).split('/');
  for (const c of conforming) { let sc = 0;
    if (c.rel === dev.rel) sc = 100; else { const cs = dirname(c.rel).split('/'); let k = 0; while (k < dsegs.length && k < cs.length && dsegs[k] === cs[k]) k++; sc = k * 2; }
    if (roleOfKey(c.key) !== undefined && roleOfKey(c.key) === roleOfKey(dev.key)) sc += 1;
    if (sc > bs || (sc === bs && (c.rel < best.rel || (c.rel === best.rel && c.line < best.line)))) { best = c; bs = sc; } }
  return best ? { rel: best.rel, line: best.line, endLine: best.endLine, name: best.name, kind: best.kind } : null; }

/**
 * exportModel({ model, root, scopesAll, H, meta, head, maxSites, anchors }) → plain object (JSON-serialisable)
 *   scopesAll: the indexed HEAD scopes (tree cache values or scopes.json) — the same records `spectrum` uses
 *   H: replayed history (optional) — adds lifecycle rows; without it `lifecycle` fields are null
 */
export function exportModel({ model, root, scopesAll, H = null, meta = null, head = null, maxSites = 300, anchors = true }) {
  const fileLines = new Map(); // rel → lines | null (read once, worktree at HEAD for a clean checkout)
  const linesOf = rel => { if (!anchors) return null; if (!fileLines.has(rel)) { try { fileLines.set(rel, readFileSync(join(root, rel), 'utf8').split(/\r?\n/)); } catch { fileLines.set(rel, null); } } return fileLines.get(rel); };
  const out = { schema: 'grain-export/1', engine: ENGINE_VERSION, extractor: EXTR_V, repo: model.repo, asOf: head || meta?.headSha || null,
    schemaNotes: {
      evidence: '`established` = survived-raw evidence (scopes that lived >= freshDays of history; what every printed `n of N` uses) · `counts` = survival/provenance-WEIGHTED accumulators (non-integers; what the MDL gate saw) · `sites.conforming/deviating` = a plain enumeration of HEAD, no weighting. The three legitimately differ; cut samples from the sites, weight them by the evidence.',
      focus: 'the line(s) inside a site where the convention manifests. For `negated`/absence conventions there is no positive occurrence: focus is the declaration line by construction.',
      applicableNodeTypes: 'null = the enumerator is not domain-restricted (any scope of the kind is decidable); an array = only these node types can carry the surface.',
      calibration: 'available only when the history holds >= calibMinEv value-transition events inside the horizon — rare on ordinary repos; trend/lifecycle do not depend on it.',
      archNorms: 'established layering per (source module, target module) pair, decided by the identical KT/lambda test every other convention uses (§mathematics, "Placement"): `exp` is the established majority ("true" = the module reaches the target, "false" = it does not), `ne`/`neff` its evidence and population, `share` = ne/neff. A pair absent here cleared no acceptance floor — no claim, not "false".' },
    indexedAt: meta?.builtAt || null, history: model.historyStats ? { ...model.historyStats, mode: meta?.historyMode || null, agentShare: model.agentShare } : null,
    summary: { files: model.files, partitions: model.partitions.length, groups: 0, conventions: 0, scopes: 0, deviations: 0, calibrationAvailable: 0, trendAvailable: 0 },
    steers: (model.steers || []).map(st => ({ ...st })), boundaries: model.boundaries || [], edges: model.edges || [], edgesTruncated: model.edgesTruncated || 0, moduleGraph: model.moduleGraph || { nodes: [], edges: [], cycles: [] }, archNorms: model.archNorms || [], partitions: [], conventions: [], cochange: [] };
  const lcOf = key => H ? H.lc.get(key) || null : null;
  for (const part of model.partitions) {
    const fileSet = new Set(part.files || []);
    const ps = scopesAll.filter(s => fileSet.has(s.rel) && s.kind !== 'module' && s.name !== '<anon>').map(hydrateScope);
    addModuleScopes(ps);
    for (const s of ps) applyVocab(s, part.vocab);
    const keyOf = s => s.kind === 'module' ? s.rel + '#module#' + s.name : skeyR(s.rel, s);
    const roleOf = s => { const r = part.assignments[keyOf(s)]; return r === undefined || r === -1 ? undefined : r; };
    const roleOfKey = k => { const r = part.assignments[k]; return r === undefined || r === -1 ? undefined : r; };
    const site = s => ({ key: keyOf(s), rel: s.rel, kind: s.kind, name: s.name, line: s.line, endLine: s.endLine || s.line, grammar: s.g || null, nodeType: s.nt || null });
    const lifecycleOf = key => { const L = lcOf(key); return L ? { firstSeen: iso(L.first), lastTouched: iso(L.last), modifications: L.mods, fixes: L.fix, churn: !!L.churn, lastByAgent: !!L.agentLast } : null; };
    const P = { name: part.name, label: scopeLabel(part.name), kind: 'source', files: (part.files || []).length, scopes: part.scopes,
      groups: [], directories: [], markers: [], conventions: [], templates: (part.templates || []) };
    // ---- groups: the directory grammar — who belongs, where they live, how their files are named, which markers define them
    const byRole = new Map(); for (const [k, r] of Object.entries(part.assignments)) { if (r === -1) continue; (byRole.get(r) || byRole.set(r, []).get(r)).push(k); }
    // scope key → line: fileScopes is in line order, so the k-th same-named scope of a kind in a file is ordinal k (overloads, repeated nested classes)
    const lineOf = new Map(); for (const [rel, list] of Object.entries(part.fileScopes || {})) { const occ = new Map(); for (const [kind, name, line] of list) { const k = rel + '#' + kind + '#' + name; const o = occ.get(k) || 0; occ.set(k, o + 1); lineOf.set(k + (o ? '#' + o : ''), line); } }
    const lineOfKey = k => lineOf.get(k) ?? null;
    part.medoids.forEach((md, r) => { const members = (byRole.get(r) || []).sort(); if (!members.length) return;
      const dirs = new Map(); const shapes = new Map();
      for (const k of members) { const rel = k.split('#')[0]; const d = dirname(rel); dirs.set(d, (dirs.get(d) || 0) + 1); const sh = nameShape(basename(rel, extname(rel))); shapes.set(sh, (shapes.get(sh) || 0) + 1); }
      const topShape = [...shapes].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
      P.groups.push({ id: 'r' + r, label: md.label, size: members.length, lift: +(part.roleLift?.[r] || 0).toFixed(2), implied: (part.groupImplied || {})[r] || null, profile: (part.profiles || {})[r] || null,
        markers: md.feats.filter(f => /^(dec|sup|ret):/.test(f)), nameTokens: md.feats.filter(f => f.startsWith('tok:')).map(f => f.slice(4)), imports: md.feats.filter(f => f.startsWith('imp:')).map(f => f.slice(4)),
        directories: [...dirs].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([dir, n]) => ({ dir, n })),
        fileNameShape: topShape ? { shape: topShape[0], words: shapeWords(topShape[0]), share: +(topShape[1] / members.length).toFixed(2) } : null,
        conventions: part.facts.filter(f => f.cid.startsWith('r' + r + ':')).map(f => part.name + '::' + f.cid + '::' + f.pid),
        members: members.slice(0, 200).map(k => { const [rel, kind, name] = k.split('#'); return { rel, kind, name, line: lineOfKey(k) }; }) }); });
    // ---- directories that are places (≥ 8 scopes), with their local conventions
    const dirScopes = new Map(); for (const k of Object.keys(part.assignments)) { const segs = k.split('#')[0].split('/').slice(0, -1); for (let i = 1; i <= segs.length; i++) { const d = segs.slice(0, i).join('/'); dirScopes.set(d, (dirScopes.get(d) || 0) + 1); } }
    const localDirs = new Set(part.facts.filter(f => f.cid.startsWith('d[')).map(f => f.cid.slice(2, f.cid.indexOf(']'))));
    for (const [d, n] of [...dirScopes].sort((a, b) => a[0] < b[0] ? -1 : 1)) if (n >= 8 || localDirs.has(d))
      P.directories.push({ dir: d, scopes: n, files: (part.files || []).filter(f => f.startsWith(d + '/')).length, conventions: part.facts.filter(f => f.cid === 'd[' + d + ']:' + f.kind).map(f => part.name + '::' + f.cid + '::' + f.pid) });
    // ---- markers with their carriers
    for (const [mk, keys] of Object.entries(part.markers || {}).sort((a, b) => a[0] < b[0] ? -1 : 1)) { const pre = mk.slice(0, mk.indexOf(':')), name = mk.slice(mk.indexOf(':') + 1);
      P.markers.push({ marker: pre === 'deco' ? (name.startsWith('[') ? name : '@' + name) : pre === 'sup' ? 'extends ' + name : 'returns ' + name, type: pre === 'deco' ? 'decorator' : pre === 'sup' ? 'supertype' : 'returnType', name,
        carriers: keys.map(k => { const [rel, kind, nm] = k.split('#'); return { rel, kind, name: nm, line: lineOfKey(k) }; }) }); }
    // ---- conventions with every site
    for (const f of part.facts) {
      const id = part.name + '::' + f.cid + '::' + f.pid; const ctx = contextOf(f.cid, part);
      const conforming = [], deviating = [];
      const neff = Object.values(f.counts).reduce((a, b) => a + b, 0); const K = isBool(f.pid) ? 2 : f.alphabet.length + 1;
      for (const s of ps) { if (s.kind !== f.kind || !inContext(ctx, s, roleOf(s))) continue;
        const v = s.preds[f.pid]; if (v === undefined) continue;
        const st = site(s);
        if (v === f.exp) conforming.push(st);
        else { const gc = f.srawCounts || f.counts; const gn = Object.values(gc).reduce((a2, b2) => a2 + b2, 0); const known = f.alphabet.includes(v); const gap = Math.log2(kt(gc, K, f.exp, gn) / kt(gc, K, known ? v : UNSEEN, gn));
          deviating.push({ ...st, observed: v, phrase: deviationPhrase(f, v), novel: !known, gapBits: +gap.toFixed(2), fires: gap >= (f.tau || Math.log2(CFG.lambda)), risingAlternative: !!(f.suppressedValue && v === f.suppressedValue) }); } }
      const bySite = (a, b) => a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line;
      conforming.sort(bySite); deviating.sort(bySite);
      const decorate = st => { const lines = linesOf(st.rel); const focus = focusLines(lines, st, f.pid, f.exp); const lc = lifecycleOf(st.key);
        const r = { rel: st.rel, kind: st.kind, name: st.name, line: st.line, endLine: st.endLine, grammar: st.grammar, nodeType: st.nodeType, focus, lifecycle: lc }; return r; };
      const lifecycle = (() => { if (!H) return null;
        const L = ks => ks.map(s => lcOf(s.key)).filter(Boolean);
        const lc = L(conforming), ld = L(deviating);
        let repairs = 0, departures = 0, lastRepair = 0, lastDeparture = 0;
        for (const s of conforming.concat(deviating)) { const evs = H.vev.get(s.key); if (!evs) continue; let prev;
          for (const e of evs) { const v = valOf(f.pid, e.val); if (v === undefined) continue; if (prev !== undefined && prev !== v) { if (v === f.exp) { repairs++; lastRepair = Math.max(lastRepair, e.ts); } else if (prev === f.exp) { departures++; lastDeparture = Math.max(lastDeparture, e.ts); } } prev = v; } }
        return { firstConforming: iso(lc.length ? Math.min(...lc.map(x => x.first)) : 0), lastConformingTouch: iso(lc.length ? Math.max(...lc.map(x => x.last)) : 0),
          firstDeviating: iso(ld.length ? Math.min(...ld.map(x => x.first)) : 0), lastDeviatingTouch: iso(ld.length ? Math.max(...ld.map(x => x.last)) : 0),
          repairs, departures, lastRepair: iso(lastRepair), lastDeparture: iso(lastDeparture), valueTracked: ['auto.nameshape', 'auto.first1', 'auto.ret'].includes(f.pid) || /^auto\.(deco:@|extends:)/.test(f.pid) }; })();
      const feat = featureOf(f.pid); const negated = f.exp === 'false';
      const conv = { id, partition: part.name, context: ctx, unit: unitOf(f.kind), kind: f.kind, feature: feat, expected: f.exp, negated, packageWide: !!f.pkgWide, seeded: f.seeded || [], contested: f.contested || null,
        statement: verbalize(f, f.exemplars.map(e => e.name)), parentDefault: f.parentExp ?? null, localContrast: ctx.type !== 'partition' && f.parentExp != null && f.parentExp !== f.exp,
        alphabet: f.alphabet, counts: f.counts, established: f.sraw, share: f.share, bitsPerInstance: f.bpi, gapThresholdBits: f.tau, surfaces: f.nSurfaces,
        siblings: (f.siblings || []).map(sb => ({ pid: sb.pid, feature: featureOf(sb.pid), expected: sb.exp, statement: verbalize({ ...sb, kind: f.kind }, []) })),
        trend: f.trend ? { shares: f.trend.shares.map(x => ({ until: iso(x.end), share: x.share, n: x.n })), attractor: f.trend.attractor, nucleating: f.trend.nucleating } : null,
        calibration: f.calib || null, lifecycle,
        sites: { conforming: conforming.length, deviating: deviating.length, firing: deviating.filter(d => d.fires).length, truncated: conforming.length > maxSites ? conforming.length - maxSites : 0 },
        exemplars: f.exemplars,
        conformingSites: conforming.slice(0, maxSites).map(decorate),
        deviatingSites: deviating.map(d => ({ ...decorate(d), observed: d.observed, phrase: d.phrase, novel: d.novel, gapBits: d.gapBits, fires: d.fires, risingAlternative: d.risingAlternative, nearest: nearestExemplar(d, conforming, roleOfKey) })),
        check: { scope: f.kind, context: ctx, enumerator: feat.enumerator, argument: feat.argument, expected: f.exp, negated,
          applicableNodeTypes: feat.enumerator === 'deco' ? part.vocab.DNT || null : feat.enumerator === 'extends' ? part.vocab.ENT || null : feat.enumerator === 'returns' ? part.vocab.RNT || null : null,
          reference: 'grain check --json <file> evaluates this rule on a worktree file' } };
      out.conventions.push(conv); P.conventions.push(id);
      if (conv.calibration && conv.calibration.available) out.summary.calibrationAvailable++;
      if (conv.trend) out.summary.trendAvailable++;
      out.summary.deviations += deviating.length; }
    out.summary.groups += P.groups.length; out.summary.scopes += part.scopes;
    out.partitions.push(P); }
  out.summary.conventions = out.conventions.length;
  out.cochange = (model.cochange || []).slice(0, 2000).map(p => ({ a: p.a, b: p.b, support: p.sup, commitsA: p.commitsA ?? null, commitsB: p.commitsB ?? null,
    confidenceAB: p.commitsA ? +(p.sup / p.commitsA).toFixed(2) : p.conf ?? null, confidenceBA: p.commitsB ? +(p.sup / p.commitsB).toFixed(2) : null }));
  return out; }
