// grain engine · proposal writer · candidate localities and the words that describe a level
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { MIN_GROUP_MEMBERS, underDir, uniq } from './propose-base.mjs';

export function localities(exp, cache, files) {
  const out = { partitions: [], directories: [], groups: [] };
  const byName = new Map();
  for (const p of cache?.partitions || []) if (Array.isArray(p.files)) byName.set(p.name, new Set(p.files));
  for (const p of exp.partitions || []) {
    // Partition file sets come from the cache when it is there (grain's own answer); otherwise the partition
    // name is a directory prefix and the tracked files beneath it are the set, minus anything a deeper
    // partition claims. The residue partition `_repo` is not a locality at all — it is "everything else".
    let set = byName.get(p.name);
    if (!set) {
      if (p.name === '_repo') set = new Set();
      else {
        set = underDir(files, p.name);
        for (const q of exp.partitions) if (q.name !== p.name && q.name !== '_repo' && q.name.startsWith(p.name + '/')) for (const f of underDir(files, q.name)) set.delete(f);
      }
    }
    out.partitions.push({ level: 'partition', name: p.name, part: p, files: new Set([...set].filter(f => files.includes(f))) });
    for (const d of p.directories || []) {
      if (!d.dir) continue;
      out.directories.push({ level: 'directory', name: d.dir, part: p, card: d, files: underDir(files, d.dir) });
    }
    for (const g of p.groups || []) {
      const s = new Set((g.members || []).map(m => m.rel));
      if (s.size) out.groups.push({ level: 'group', name: `${p.name}::${g.id}`, part: p, group: g, files: new Set([...s].filter(f => files.includes(f))) });
    }
  }
  // a directory card can be published by several partitions; keep one per path
  const seen = new Set();
  out.directories = out.directories.filter(d => (seen.has(d.name) ? false : (seen.add(d.name), true)));
  return out;
}

// ==================================================================================================
// 4. `node_types` — choosing the level, and showing the alternatives instead of hiding them.
//
// THE CUT. Active types form a NESTED family of path prefixes: any two are either disjoint or one contains the
// other, and Yggdrasil's child precedence then hands every file to the deepest type that claims it. (It is NOT
// an antichain — this header said it was and the code never was: the paragraph below on hollowing out a parent
// is the whole reason both levels ship. Ticket 110 corrected the sentence, not the behaviour.)
// It is built from four sources, in this order of evidence strength:
//
//   1. grain's partitions (its own certified cut of the directory tree — the level 093 §2 found agreeing with
//      hand types wherever the hand type is a directory);
//   2. nodes of the refined module graph;
//   3. directory cards strictly BELOW a partition root (grain publishes a card only for a directory that
//      carries scopes, so a published card is evidence of its own; this is the level that holds `portal-server`
//      and `portal-engine-api` in 093 §2's class-a table);
//   4. any FINER directory that beats the level above it on that level's own evidence (ticket 110, below), and
//      then the top-level directory of any tracked file all of the above leave uncovered (no grain evidence at
//      all, and the evidence line says so in those words).
//
// THE ALTERNATIVES. 093 §2 class c is the finding this section exists to answer: hand types are often ONE LEVEL
// FINER than grain's cut, split by a `content:` predicate. So a role group whose file set is not already a
// directory becomes a CANDIDATE SUB-TYPE with a drafted `content:` regex — and it is never silently substituted
// for the coarse type. It is written to `alternatives.md` with its evidence, its drafted predicate, and the
// exact count of tracked files that predicate selects, so the maintainer chooses the level rather than
// discovering one was chosen for them.
//
// THE LEVEL IS PUBLISHED, AND THE CUT IS DERIVED FROM MEASURED NUMBERS (ticket 110)
// ---------------------------------------------------------------------------------
// Ticket 108 measured four hand-written oracles and found no single level wins: the module level recovers most
// of express, the directory level most of spring-petclinic, the role group most of Yggdrasil and of grain
// itself. So this renderer names the level every candidate came from, publishes the ones it did not activate
// with the same intrinsic numbers the active ones carry, and derives WHICH candidates go active from those
// numbers rather than from a preference.
//
// `TYPE_LEVELS` below is the whole vocabulary. Each is a cut of the same tree that grain already computes:
//
//   partition   grain's own MDL cut of the directory tree — the level 093 §2 found agreeing with hand types
//               wherever the hand type is a directory.
//   module      a node of the refined module graph — the unit the dependency graph is aggregated at.
//   directory   a directory that carries declarations grain parsed. Usually a published directory card — grain
//               publishes one only where it mined scopes — and otherwise a directory of parsed code that no
//               card named, admitted by the policy below.
//   domain      ticket 116's cut: a role group whose members all live under one directory below their host, so
//               the membership is a `path:` glob rather than a guest list and a file added there joins by
//               itself.
//   role group  a structurally-uniform cluster INSIDE a partition. It is not a place in the layout, so it can
//               only ever be offered with a `content:` predicate — never activated (see below).
//   layout      a grouping the path is the only evidence for: the remainder nothing else claimed, or a
//               directory grain parsed nothing in at all. The same evidence class the uncovered remainder has
//               always used at the top level, available at any depth.
//
// WHY ONLY A PATH-SHAPED LEVEL MAY BE ACTIVE. Every active type is a path prefix, so any two of them are either
// nested or disjoint, and Yggdrasil's child precedence then hands every file to exactly one owner. Two types
// over the SAME directory separated by a `content:` predicate have no such order, and a file matching both
// would have two owners. So `role group` is an alternatives-only level by construction, not by preference.
//
// THE SELECTION POLICY, MEASURED (ticket 110). Fourteen intrinsic-only policies were scored against all four
// oracles at Jaccard >= 0.5, in both directions. Recall is MONOTONE in the candidate set — a finer type can
// only add a match — so "maximise recall" alone selects "every directory", which is 418 types on Yggdrasil and
// not a proposal anyone reads. The policy that wins on all four repositories without losing on any is a
// comparison between two measured numbers and carries no cutoff:
//
//     a finer directory becomes a type of its own only where it BEATS THE LEVEL ABOVE IT ON THAT LEVEL'S OWN
//     EVIDENCE — strictly more of its imports stay inside than the parent's do, or grain could read none of
//     its files while it could read the parent's.
//
//   policy                 grain          petclinic      express        Yggdrasil     (recall · precision · types)
//   default (before)       15/33 · 18/31  2/28 · 3/12    6/13 · 7/22    21/36 · 23/82
//   unmined OR purer       16/33 · 21/35  6/28 · 7/16    7/13 · 8/29    23/36 · 25/106
//   every directory        18/33 · 29/64  8/28 · 11/38   7/13 · 8/34    23/36 · 27/418   (the ceiling, refused)
//
// The second disjunct is the one that carries most of it: a directory of files grain parsed NONE of — Java
// resources, Thymeleaf templates, test fixtures, shipped docs — is invisible to every other level, because a
// directory card is published only where scopes were mined. That is where 9 of spring-petclinic's 28 hand
// types live. The policy is FITTED ON THESE FOUR ORACLES and must be re-measured when a fifth arrives; the
// sweep that produced the table is `.system/research/type-levels.md`.
// ==================================================================================================
// How many of a list fall at each key, in `TYPE_LEVELS` order — the shape `counts.typesByLevel` and
// `counts.alternativesByLevel` take, so a reader gets the levels in one order everywhere.
export const countBy = (xs, key) => {
  const out = {};
  for (const l of TYPE_LEVELS) { const n = xs.filter(x => key(x) === l).length; if (n) out[l] = n; }
  for (const x of xs) { const k = key(x); if (!(k in out) && !TYPE_LEVELS.includes(k)) out[k] = xs.filter(y => key(y) === k).length; }
  return out;
};
// The levels, in the order a reader meets them: coarse cut first, then the finer ones, then the level with no
// evidence but the path. `role group` never appears on an active type (see the header).
export const TYPE_LEVELS = ['partition', 'module', 'directory', 'domain', 'role group', 'layout'];
// INTRINSIC EVIDENCE FOR ONE CANDIDATE FILE SET — no oracle, no weights, no thresholds, raw counts only.
//
// Four numbers plus the rule count, each of which a maintainer can check by hand:
//   - `importsInside` / `importsCrossing`: resolved imports with both endpoints in the set, against those with
//     exactly one. This is the import boundary of the candidate, said as a match and a miss.
//   - `cochangeInside` / `cochangeCrossing`: the same split over the export's co-change pairs.
//   - `nameShape` / `nameShapeFiles`: the modal file-name shape over the set and how many files carry it.
//   - `minedFiles`: how many of the set grain actually parsed. Zero is the interesting value — it means the
//     only thing known about this directory is the path.
//   - `rules`: mined conventions every one of whose sites lies inside the set, i.e. rules that could host here.
export function typeEvidence(set, { edges, cochange, mined, ruleSites }) {
  let importsInside = 0, importsCrossing = 0;
  for (const e of edges) { const a = set.has(e.from), b = set.has(e.to); if (a && b) importsInside += (e.n || 1); else if (a || b) importsCrossing += (e.n || 1); }
  let cochangeInside = 0, cochangeCrossing = 0;
  for (const p of cochange) { const a = set.has(p.a), b = set.has(p.b); if (a && b) cochangeInside++; else if (a || b) cochangeCrossing++; }
  const shapes = new Map();
  for (const f of set) { const s = fileNameShape(f); shapes.set(s, (shapes.get(s) || 0) + 1); }
  const modal = [...shapes].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] || ['', 0];
  return {
    files: set.size,
    importsInside, importsCrossing,
    cochangeInside, cochangeCrossing,
    nameShape: modal[0], nameShapeFiles: modal[1],
    mined: [...set].filter(f => mined.has(f)).length,
    rules: ruleSites.filter(rs => [...rs].every(f => set.has(f))).length,
  };
}
// The three populations every candidate's evidence is measured against, read once per run: the resolved
// imports between TRACKED files (an edge into a file git does not track cannot cross a boundary that exists),
// the co-change pairs, the files grain actually parsed, and the site set of every mined convention.
export function evidenceContext(exp, loc, files) {
  const tracked = new Set(files);
  const mined = new Set();
  for (const p of loc.partitions || []) for (const f of p.files) mined.add(f);
  const ruleSites = [];
  for (const c of exp.conventions || []) {
    const s = new Set([...(c.conformingSites || []), ...(c.deviatingSites || [])].map(x => x.rel).filter(Boolean));
    if (s.size) ruleSites.push(s);
  }
  return {
    edges: (exp.edges || []).filter(e => tracked.has(e.from) && tracked.has(e.to)),
    cochange: (exp.cochange || []).filter(p => tracked.has(p.a) && tracked.has(p.b)),
    mined, ruleSites,
  };
}
// A file name in grain's own shape alphabet, extension included (`OwnerController.java` -> `Ua.a`,
// `messages_de.properties` -> `a_a.a`): a run of uppercase is `U`, a run of lowercase or digits is `a`, and
// `_ - $ .` stand for themselves. The same alphabet `nameShape` (core.mjs) uses on declaration names, applied
// to the basename, so a reader of a card and a reader of this line are reading one vocabulary.
const fileNameShape = f => f.slice(f.lastIndexOf('/') + 1).replace(/[A-Z]+/g, 'U').replace(/[a-z0-9]+/g, 'a').replace(/[^Ua_\-$.]/g, '?');
// The import boundary as one number, or null where the candidate touches no resolved import at all (a directory
// of Java resources has no imports either way, and reporting 0.00 there would read as "nothing stays inside").
export const purityOf = m => (m.importsInside + m.importsCrossing ? m.importsInside / (m.importsInside + m.importsCrossing) : null);
// `a`, `a and b`, `a, b and c` — an English list, because a sentence a maintainer reads is not a join.
const andList = xs => (xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
// THE LEVEL AND THE NUMBERS BEHIND IT, IN ONE CLAUSE (ticket 110, worded under ticket 109's rules).
//
// Facts, in the order a maintainer needs them to decide whether this is the right cut: which level it came from
// and which other levels agree, how big it is, how much of its dependency traffic it keeps inside, how much of
// it grain could read at all, what its files are named like, how many mined rules could attach here — and last,
// what finer cut is on offer instead. No coefficient, no hedge, and every number one this run counted.
export function levelSentence(a, alternatives = []) {
  const m = a.evidence;
  if (!m) return null;
  const levels = (a.levels && a.levels.length ? a.levels : [a.source]).filter(Boolean);
  const others = levels.slice(1);
  const head = others.length
    ? `cut at the ${levels[0]} level, and the ${andList(others)} level${others.length === 1 ? '' : 's'} name${others.length === 1 ? 's' : ''} the same directory`
    : `cut at the ${levels[0] || 'layout'} level`;
  const parts = [`${m.files} file${m.files === 1 ? '' : 's'}`];
  const touching = m.importsInside + m.importsCrossing;
  parts.push(touching
    ? `${m.importsInside} of ${touching} import${touching === 1 ? '' : 's'} that touch it stay inside`
    : 'no resolved import touches it in either direction');
  if (m.mined === 0) parts.push('grain parsed none of these files');
  else if (m.mined < m.files) parts.push(`grain parsed ${m.mined} of them`);
  const cc = m.cochangeInside + m.cochangeCrossing;
  if (cc) parts.push(`${m.cochangeInside} of ${cc} co-change pair${cc === 1 ? ' stays' : 's stay'} inside`);
  if (m.nameShapeFiles > 1) parts.push(`${m.nameShapeFiles} of them are named \`${m.nameShape}\``);
  parts.push(`${m.rules} mined rule${m.rules === 1 ? '' : 's'} could attach here`);
  const finer = alternatives.filter(x => x.of === a.id);
  const byLevel = TYPE_LEVELS.filter(l => finer.some(x => x.level === l));
  const tail = finer.length
    ? `; ${finer.length} finer ${andList(byLevel)} cut${finer.length === 1 ? '' : 's'} offered in \`alternatives.md\` instead`
    : '';
  return `${head}: ${parts.join(', ')}${tail}`;
}
// Draft a `content:` regex for a role group from the group's own evidence, in descending order of how directly
// the group names itself. Returns null when the group offers nothing to anchor on — which is an answer, not a
// failure: a group with no marker, no shared name shape and no shared import is not a type.
export function contentRegexFor(group) {
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const members = group.members || [];
  const names = uniq(members.map(m => m.name).filter(n => n && n !== '<anon>'));
  // (1) a marker — a decorator or supertype the members carry; the most direct thing a group says about itself.
  for (const mk of group.markers || []) {
    const nm = mk.name || mk.marker;
    if (!nm || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(nm)) continue;
    if (mk.type === 'decorator') return { regex: `@${esc(nm)}\\b`, why: `marker \`@${nm}\` (${(mk.carriers || []).length} carriers)`, sel: `carrying \`@${nm}\`` };
    if (mk.type === 'supertype') return { regex: `\\b(extends|implements)\\s+${esc(nm)}\\b`, why: `marker \`extends ${nm}\` (${(mk.carriers || []).length} carriers)`, sel: `extending \`${nm}\`` };
  }
  // (2) the members' own name shape — the longest common prefix and suffix over the member names. This is what
  //     a hand-written type does: `command` vs `command-support` in the pattern repo is literally "does this
  //     file export register<X>Command", and that regex is exactly a common prefix plus a common suffix.
  if (names.length >= MIN_GROUP_MEMBERS) {
    const pre = commonAffix(names, 'prefix'), suf = commonAffix(names, 'suffix');
    if (pre.length >= 3 && suf.length >= 3 && pre.length + suf.length < Math.min(...names.map(n => n.length)))
      return { regex: `\\b${esc(pre)}[A-Za-z0-9_]*${esc(suf)}\\b`, why: `member names share the prefix \`${pre}\` and the suffix \`${suf}\` (${names.length} names)`, sel: `declaring a name that starts with \`${pre}\` and ends in \`${suf}\`` };
    if (pre.length >= 5) return { regex: `\\b${esc(pre)}[A-Za-z0-9_]*\\b`, why: `member names share the prefix \`${pre}\` (${names.length} names)`, sel: `declaring a name that starts with \`${pre}\`` };
    if (suf.length >= 5) return { regex: `\\b[A-Za-z0-9_]*${esc(suf)}\\b`, why: `member names share the suffix \`${suf}\` (${names.length} names)`, sel: `declaring a name that ends in \`${suf}\`` };
  }
  // (3) a shared import — weaker (an import is a dependency, not an identity) but real, and anchored.
  const imps = (group.imports || []).filter(i => i && i.length >= 4);
  if (imps.length === 1) return { regex: esc(imps[0]), why: `every member's file imports \`${imps[0]}\``, sel: `importing \`${imps[0]}\`` };
  // (4) a defining name token, when the group named itself one word.
  //
  // CASE. A `nameTokens` entry is a CASE-FOLDED subword out of grain's own vocabulary (`core.mjs`'s `tokenize`
  // lowercases; the export publishes them as `tok:` features), NOT a literal that appears in the source. Every
  // other branch above anchors on something spelled exactly as the code spells it — a decorator name, a
  // supertype, a member identifier, an import specifier — so only this one has to be rendered case-tolerantly.
  // Measured (ticket 101) on Yggdrasil's own planted-family fixtures: rendered case-sensitively, the token
  // `first` selected 0 of the 5 `*Repository.ts` members of `family-planted-mono` (their subword is `findFirst`,
  // capital F) and 0 of 6 on `family-planted-polyglot`, while selecting all 5 snake_case Python members
  // (`find_first`) — i.e. the predicate silently worked in one casing convention and was vacuous in the other.
  const toks = (group.nameTokens || []).filter(t => t && t.length >= 5);
  if (toks.length) return { regex: `\\b[A-Za-z0-9_]*${caseTolerant(toks[0])}[A-Za-z0-9_]*\\b`, why: `group's defining name token \`${toks[0]}\``, sel: `mentioning \`${toks[0]}\`` };
  return null;
}
// Render a case-folded token so it matches the source whatever casing convention the language uses, without
// changing the flags of the regex it is embedded in (Yggdrasil's `content:` predicate takes a pattern, not
// flags). A letter becomes `[Aa]`; every other character is escaped literally.
export function caseTolerant(token) {
  return [...String(token)].map(ch => {
    const lo = ch.toLowerCase(), up = ch.toUpperCase();
    if (lo !== up) return `[${up}${lo}]`;
    return ch.replace(/[.*+?^${}()|[\]\\]/, '\\$&');
  }).join('');
}
function commonAffix(names, which) {
  const norm = which === 'prefix' ? (s => s) : (s => [...s].reverse().join(''));
  const xs = names.map(norm);
  let out = xs[0] || '';
  for (const x of xs.slice(1)) { let i = 0; while (i < out.length && i < x.length && out[i] === x[i]) i++; out = out.slice(0, i); }
  return which === 'prefix' ? out : [...out].reverse().join('');
}
