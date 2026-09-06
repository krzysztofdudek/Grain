// grain engine · card building and the card-level line renderers every answer is assembled from
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { dirname, extname } from 'node:path/posix';
import { EXT2GRAMMAR, CFG } from './config.mjs';
import { refineModOf } from './relations.mjs';
import { decoLabel, factLabel, part, pct } from './facts.mjs';
import { tokenize } from './parse.mjs';
import { partitionFor } from './partition.mjs';

// ===== WHERE (inverse query: intent → place + expectations + pattern to copy) =====
// "Where do command handlers go?" — lexical match of query tokens against the model's own vocabulary
// (role labels, medoid features, fact payloads, directory names). No embeddings: the model is a small,
// structured distillate in repo-native tokens; when lexical match fails, the compact map is printed and
// the asking agent — itself an LLM — closes the semantic gap better than any retrieval layer would.
// Card vocabulary is weighted by how strongly a token names the thing: a group's own name tokens, decorators and
// supertypes, and a directory's own name count fully; the surfaces of its conventions count 3/4; the last segments of
// the packages its files import count 1/2 (everything that imports `middleware` is not a middleware).
export const TOKW = { name: 1, dir: 1, fact: 0.75, imp: 0.5, doc: 0.5 };
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
