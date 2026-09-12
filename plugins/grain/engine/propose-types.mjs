// grain engine · proposal writer · node_types — choosing the level a type is cut at
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { expandWhen, jaccard, intersectSize } from './yggdrasil-graph.mjs';
import {
  GROUP_MIN,
  MIN_PROMOTE_FILES,
  MIN_WHEN_FIDELITY,
  commonDir,
  slug,
  underDir,
} from './propose-base.mjs';
import { contentRegexFor, evidenceContext, purityOf, typeEvidence } from './propose-levels.mjs';

export function buildTypes(exp, loc, files, ctx) {
  // The 2-files-up admission floor for a directory-derived type used to be MIN_TYPE_FILES, a named, overridable
  // constant (`--min-type-files`) — ruling `granularity-bounded-by-evidence-not-taste` asked for exactly that: it
  // to be MEASURED as a floor to remove, not defended. Ticket 101 §5 ran 2 against 1 on three repositories and
  // found it not load-bearing: types and nodes count differ by a few (every extra element is a one- or two-file
  // directory nothing else claims), but aspects, pairs, refusals, drill outcomes and FALSE-ALARMs are
  // byte-identical between the two runs — the floor gated no operability at all. Ruling
  // `root-fix-accepted-min-type-files-goes` retires the knob; ticket 102 removes it. The number a directory
  // needs to be classified is a bare `2` below, unowned by any named constant, because there is nothing left to
  // measure by varying it.
  const active = [];       // { id, dir, when, files, evidence, source }
  const alternatives = []; // { id, of, when, selected, evidence, why }

  // THE CUT IS NESTED, NOT AN ANTICHAIN, AND NO PARENT IS CARVED HOLLOW.
  //
  // The first version of this renderer took the deepest candidate and cut the parent's `when` down with `not:`
  // exclusions. Measured against the pattern repo's hand graph it LOST recall (15/36 against a 19/36 baseline):
  // the hand graph's `engine` type is the WHOLE of `source/cli/src/core`, and hollowing that type out to make
  // room for three of its sub-directories destroyed the one type grain reproduces best. So both levels ship,
  // both classify, and their overlap is stated rather than resolved. Yggdrasil permits it (only two `enforce:
  // strict` types may not overlap, and this renderer sets `strict` on nothing) and it is the honest shape: grain
  // measured two cuts of the same tree and has no basis for deleting either.
  const cands = new Map(); // dir -> candidate (first source to name a directory keeps it)
  // The first source keeps the candidate, exactly as before — but every LATER source that names the same
  // directory is recorded on it (ticket 110). Three levels agreeing on one cut is evidence about that cut, and
  // it used to be discarded because the second source found the key already taken.
  const put = c => {
    const k = c.dir ?? `\0${c.id}`;
    const have = cands.get(k);
    if (have) { if (!have.levels.includes(c.src)) have.levels.push(c.src); return; }
    cands.set(k, { ...c, levels: [c.src] });
  };
  for (const p of loc.partitions) {
    if (p.name === '_repo' || !p.files.size) continue;
    // A PARTITION NAME IS GRAIN'S LABEL, NOT NECESSARILY A PATH. `_repo` is the residue bucket (excluded above
    // by name, since it is "everything else" rather than a locality) and `_root` is the repository-root bucket:
    // its files are real, but no directory called `_root` exists. Rendered as a directory the way every other
    // partition is, it produces a `when` of `_root/**` that selects nothing, a node whose `mapping` names a path
    // that is not there, and aspects scoped to `_root/**` that can never produce a pair. Measured (ticket 101):
    // 4 of 17 corpus repositories carried such a partition, 168 drafted aspects were scoped to `_root/**`
    // (17 of them deterministic) and every one produced ZERO pairs — which is the whole reason `leveldb` and
    // `kotlin-datetime` scored 0% before this. The test is DERIVED, not a list of names: if no tracked file
    // lives under the name, the name is not a directory.
    if (!underDir(files, p.name).size) {
      // Its files are real. When they all sit at the repository root, that is exactly the shape the root-glob
      // type already models (`when: { path: '*' }`); anything else has no path expression and is disclosed as
      // an alternative rather than guessed at.
      if ([...p.files].every(f => !f.includes('/'))) {
        put({ dir: null, id: slug(p.name), rootGlob: true, files: p.files, src: 'partition', why: `${p.part.files} of them group together by the conventions they share (${p.part.scopes} declarations, ${p.part.groups.length} role cluster${p.part.groups.length === 1 ? '' : 's'}, ${p.part.kind}) — and no directory of that name exists: every one of them sits at the repository root, so the type is drafted as the root glob rather than as a path prefix` });
      }
      continue;
    }
    put({ dir: p.name, files: p.files, src: 'partition', why: `${p.part.files} of them group together by the conventions they share (${p.part.scopes} declarations, ${p.part.groups.length} role cluster${p.part.groups.length === 1 ? '' : 's'}, ${p.part.kind})` });
  }
  const partRoots = new Set([...cands.keys()]);
  // grain's OTHER cut of the same tree: the refined module graph. It is coarser than the partition set in some
  // places and finer in others, and both were in the candidate set the reconstruction measured against.
  for (const m of exp.moduleGraph?.nodes || []) {
    const s = underDir(files, m.id);
    if (s.size < GROUP_MIN) continue;
    put({ dir: m.id, files: s, src: 'module', why: `${m.files} of them ${m.files === 1 ? 'is code grain parsed and grouped' : 'are code grain parsed and grouped'} as one unit of the dependency graph, at layer ${m.layer} above its leaves` });
  }
  // directory cards ONE LEVEL below a partition root. Grain publishes a card only for a directory that carries
  // scopes, so a published card is evidence of its own; one level is where a hand architecture actually splits
  // (`portal/api`, `portal/server` in the pattern repo), and deeper cards are drill corpora and fixture trees.
  for (const d of loc.directories) {
    // the level is recorded on whatever candidate already holds this directory, even where the card itself is
    // not promoted (ticket 110) — a published card is evidence about the cut whether or not it makes the cut
    if (cands.has(d.name)) { put({ dir: d.name, src: 'directory' }); continue; }
    if (d.files.size < MIN_PROMOTE_FILES) continue;
    const owner = [...partRoots].filter(r => d.name.startsWith(r + '/')).sort((a, b) => b.length - a.length)[0];
    const depth = owner ? d.name.slice(owner.length + 1).split('/').length : null;
    if (depth !== 1) continue;
    put({ dir: d.name, files: d.files, src: 'directory', why: `${d.card.files} of them ${d.card.files === 1 ? 'is code grain parsed' : 'are code grain parsed'} (${d.card.scopes} declarations) in a directory one level below \`${owner}\`` });
  }
  // ticket 116's domain cut, as a LEVEL on the candidate it lands on: a role group all of whose members live
  // under one directory names that directory, and where the directory is already a candidate that agreement is
  // recorded here. Where it is not, the group is offered as an alternative further down, unchanged.
  for (const g of loc.groups) {
    if (g.files.size < GROUP_MIN) continue;
    const shared = commonDir([...g.files].sort());
    if (shared && cands.has(shared)) put({ dir: shared, src: 'domain' });
  }
  for (const c of [...cands.values()].sort((a, b) => (String(a.dir) < String(b.dir) ? -1 : 1))) {
    if (c.files.size < GROUP_MIN) continue;
    active.push({ id: c.id || slug(c.dir), dir: c.dir, files: c.files, source: c.src, levels: c.levels, why: c.why, ...(c.rootGlob ? { rootGlob: true } : {}) });
  }

  // ------------------------------------------------------------------------------------------------
  // THE FINER LEVEL, ADMITTED BY THE MEASURED POLICY (ticket 110 — see this section's header for the table).
  //
  // Every directory of tracked files that no level above has claimed is a candidate here. It becomes a type of
  // its own only where it beats the level above it on that level's own evidence, which is a comparison between
  // two numbers this run measured and not a threshold:
  //
  //   - grain could read NONE of its files while it could read its parent's — the directory whose only evidence
  //     is the path, which is where the resources, templates, fixtures and shipped docs of a repository live
  //     and which no other level can see, because a directory card is published only where scopes were mined;
  //   - or strictly more of its imports stay inside it than stay inside its parent — a tighter boundary than
  //     the cut it is being carved out of, said in the same two counts the evidence line carries.
  //
  // Candidates are decided shallowest-first and an accepted one becomes the parent of its own children, so the
  // shallowest directory that clears the comparison wins and the cut does not run away down the tree.
  const evCtx = evidenceContext(exp, loc, files);
  const setOf = a => (a.rootGlob ? a.files : underDir(files, a.dir));
  for (const a of active) a.evidence = typeEvidence(setOf(a), evCtx);
  const claimed = new Set(active.map(a => a.dir).filter(Boolean));
  const finerDirs = new Map();
  for (const f of files) {
    const segs = f.split('/');
    for (let k = 1; k < segs.length; k++) {
      const d = segs.slice(0, k).join('/');
      if (claimed.has(d) || finerDirs.has(d)) continue;
      const s = underDir(files, d);
      if (s.size >= MIN_PROMOTE_FILES) finerDirs.set(d, s);
    }
  }
  const domainDirs = new Set();
  for (const g of loc.groups) { if (g.files.size < GROUP_MIN) continue; const s = commonDir([...g.files].sort()); if (s) domainDirs.add(s); }
  // What the cut above already classifies. A candidate with no active type ABOVE it is not refining anything,
  // so it may only join when it brings files nothing else claims — `src/main/scss` on spring-petclinic, whose
  // four files would otherwise fall into the top-level remainder. Without this a repository grain mined nothing
  // in (no partitions, so every directory reads as unparsed) grew a wrapper type over directories that were
  // already fully classified: a node that owns no file of its own once its children take theirs, which is a
  // node no rule can ever attach to and nothing meaningful can be said about in a description.
  const claimedFiles = new Set();
  for (const a of active) for (const f of setOf(a)) claimedFiles.add(f);
  const promoted = [];
  for (const [dir, set] of [...finerDirs].sort((a, b) => a[0].split('/').length - b[0].split('/').length || (a[0] < b[0] ? -1 : 1))) {
    const parent = [...active, ...promoted].filter(a => a.dir && dir.startsWith(a.dir + '/')).sort((a, b) => b.dir.length - a.dir.length)[0] || null;
    if (!parent && [...set].every(f => claimedFiles.has(f))) continue;
    const m = typeEvidence(set, evCtx);
    const p = parent ? parent.evidence : null;
    const unread = m.mined === 0 && (!p || p.mined > 0);
    // A boundary is only ever TIGHTER THAN something. With no level above it there is nothing to beat, so the
    // comparison does not fire — without this the top of every tree (`source/`, `plugins/`) was promoted for
    // having imports at all, which is a type covering half the repository and saying nothing.
    const mine = purityOf(m), theirs = p ? purityOf(p) : null;
    const tighter = mine != null && theirs != null && mine > theirs;
    if (!unread && !tighter) continue;
    // The level is what the directory IS, not which half of the policy admitted it: a role group naming it
    // makes it the domain level, code grain parsed in it makes it the directory level (a published card, or a
    // directory that carries declarations grain read but published no card for), and nothing read at all makes
    // it the layout level, where the path is the only evidence there is.
    const level = domainDirs.has(dir) ? 'domain' : m.mined > 0 ? 'directory' : 'layout';
    const why = unread
      ? `\`${dir}\` holds ${set.size} tracked files and grain parsed none of them — the path is the only evidence there is, and ${parent ? `the level above it (\`${parent.dir}\`) does carry code grain read, so this is a different kind of place` : 'no level above it claims them at all'}`
      : `${m.importsInside} of the ${m.importsInside + m.importsCrossing} resolved imports that touch \`${dir}\` stay inside it, a tighter boundary than \`${parent.dir}\`'s ${p.importsInside} of ${p.importsInside + p.importsCrossing}`;
    const id = slug(dir);
    // Two different directories can slug to one id (`a/b` and `a-b`), and a duplicate id is a silently
    // overwritten key in `yg-architecture.yaml`. A finer cut is an offer, so a colliding one is dropped rather
    // than allowed to overwrite a type that was already earned.
    if (active.some(a => a.id === id) || promoted.some(a => a.id === id)) continue;
    promoted.push({ id, dir, files: set, source: level, levels: [level], why, evidence: m });
  }
  for (const a of promoted) active.push(a);

  // the uncovered remainder, by top-level directory. No grain evidence — and the evidence line says so.
  const covered = new Set();
  for (const a of active) for (const f of a.files) covered.add(f);
  const rest = new Map();
  for (const f of files) {
    if (covered.has(f)) continue;
    const top = f.includes('/') ? f.slice(0, f.indexOf('/')) : '.';
    (rest.get(top) || rest.set(top, new Set()).get(top)).add(f);
  }
  for (const [top, set] of [...rest].sort((a, b) => b[1].size - a[1].size)) {
    if (set.size < GROUP_MIN || top === '.' || cands.has(top) || active.some(a => a.dir === top)) continue;
    active.push({ id: slug(top), dir: top, files: underDir(files, top), source: 'layout', levels: ['layout'], why: `\`${top}\` holds ${set.size} tracked files nothing else in this proposal claims — grouped from the layout alone, with no evidence behind the grouping beyond the path` });
  }
  const rootFiles = rest.get('.');
  if (rootFiles && rootFiles.size >= GROUP_MIN && !active.some(a => a.rootGlob)) active.push({ id: 'repo-root-file', dir: null, files: rootFiles, source: 'layout', levels: ['layout'], rootGlob: true, why: `${rootFiles.size} tracked files sit at the repository root and nothing else in this proposal claims them — grouped from the layout alone, with no evidence behind the grouping beyond the path` });
  // the remainder types are measured with the same instrument as everything above them
  for (const a of active) if (!a.evidence) a.evidence = typeEvidence(setOf(a), evCtx);

  for (const a of active) {
    a.when = a.rootGlob ? { path: '*' } : { path: `${a.dir}/**` };
    a.selected = expandWhen(a.when, files, ctx);
    a.fidelity = jaccard(a.files, a.selected);
    a.contains = active.filter(b => b.dir && a.dir && b.dir !== a.dir && b.dir.startsWith(a.dir + '/')).map(b => b.id);
  }

  // WHICH TYPE HOSTS A PARTITION WHOSE NAME IS A LABEL RATHER THAN A PATH (ticket 119).
  //
  // `mdlCuts` returns `['.']` for a repository it finds no reason to split, and every file's partition is then
  // named `_root` — the whole repository in one bucket, with no directory of that name anywhere on disk;
  // `_repo` is the same kind of name for the merged small-package residue. Downstream, `buildAspects` resolves
  // an aspect's host TYPE by matching the partition name against a type's directory, so a row mined in such a
  // partition used to find no host and be DROPPED, in silence, with nothing in the proposal saying a rule had
  // been discarded. Measured across the corpus at four of seventeen repositories, two of them totally:
  // `leveldb` (134 files, one `_root` partition) and `kotlin-datetime` (251) proposed ZERO aspects for this
  // reason alone.
  //
  // The test is DERIVED, exactly as the candidate loop's is above: if no tracked file lives under the name, the
  // name is not a directory, and the partition is resolved instead to the emitted type that actually HOLDS its
  // files — by counting the overlap, deepest and then lowest-id on a tie. That is a real answer where one
  // exists (`repo-root-file` when the partition's files all sit at the root, the covering source type when they
  // do not) and no answer where none does — a type that holds none of the partition's files never hosts it, and
  // the row is then still dropped, but for a reason the aspect renderer can state.
  for (const p of loc.partitions) {
    if (!p.files.size || underDir(files, p.name).size) continue;
    const ranked = active
      .map(a => ({ a, held: [...p.files].filter(f => a.files.has(f)).length }))
      .filter(x => x.held > 0)
      .sort((x, y) => y.held - x.held || (y.a.dir || '').length - (x.a.dir || '').length || (x.a.id < y.a.id ? -1 : 1));
    if (!ranked.length) continue;
    const { a, held } = ranked[0];
    (a.labelPartitions ||= []).push({ name: p.name, held, total: p.files.size });
  }

  // THE ALTERNATIVES: the level 093 §2 class (a) named as the cheapest recall available anywhere — sets grain
  // already holds inside a role group or an unpromoted directory card, which the hand graph turned into a node
  // type and which nothing surfaced as a type candidate.
  //
  // Each candidate is offered in BOTH forms a hand-written architecture actually uses, because they fail
  // differently and only the maintainer knows which failure is acceptable:
  //
  //   - `-content`: a `path` + `content` predicate drafted from the group's own marker or name shape. It
  //     GENERALISES — a new file that matches joins the type by itself — and it may over- or under-select. This
  //     is the shape 093 §2 class (c) says the hand graph reaches for (`command` vs `command-support` is
  //     literally a `content:` regex over an exported symbol name).
  //   - `-list`: the membership frozen as an `any_of` of explicit paths. It is EXACT today and DEAD tomorrow —
  //     it classifies no file grain did not already see. Yggdrasil's own architecture uses this shape where a
  //     type is a fixed set rather than a rule.
  const seenAlt = new Set();
  // Each alternative carries the LEVEL it is a cut at and the same intrinsic numbers an active type carries
  // (ticket 110), measured over the set its own predicate selects — so `alternatives.md` can group them by
  // level and a maintainer comparing a candidate against the active type above it is comparing like with like.
  // A directory card is the `directory` level whatever form it is offered in; a role group is `domain` when
  // ticket 116 could turn its membership into a path glob, and `role group` when it can only be a `content:`
  // predicate or a guest list.
  const altLevel = a => (a.kind === 'directory card' ? 'directory' : a.form === 'path' ? 'domain' : 'role group');
  const addAlt = (a, set) => {
    if (seenAlt.has(a.id)) return;
    seenAlt.add(a.id);
    alternatives.push({ ...a, level: altLevel(a), evidence: typeEvidence(set, evCtx) });
  };
  const finer = [
    // `groupId`/`partKind` ride along ONLY so a downstream family-without-law adapter (ticket 100) can name a
    // stable id and a language stratum for a role-group alternative without re-deriving either from `label` —
    // they change nothing about which alternatives are offered or how.
    ...loc.groups.map(g => ({ set: g.files, label: g.group.label || g.group.id, group: g.group, groupId: g.group.id, partKind: g.part.kind, part: g.part.name, kind: 'role group' })),
    ...loc.directories.filter(d => !active.some(a => a.dir === d.name)).map(d => ({ set: d.files, label: d.name, group: null, groupId: null, partKind: d.part.kind, part: d.part.name, kind: 'directory card' })),
  ];
  for (const f of finer) {
    if (f.set.size < GROUP_MIN) continue;
    const host = active.filter(a => a.dir && [...f.set].every(x => x.startsWith(a.dir + '/') || x === a.dir)).sort((a, b) => b.dir.length - a.dir.length)[0];
    if (!host) continue;
    if (jaccard(f.set, host.files) >= 0.9) continue; // the candidate IS the host — nothing finer on offer
    const base = `${host.id}-${slug(f.label)}`.slice(0, 100);
    const cr = f.group ? contentRegexFor(f.group) : null;
    if (cr) {
      const when = { all_of: [{ path: `${host.dir}/**` }, { content: cr.regex }] };
      let selected = null;
      try { selected = expandWhen(when, files, ctx); } catch { /* a predicate that will not compile is itself a finding */ }
      if (selected) {
        const j = jaccard(f.set, selected);
        addAlt({ id: `${base}-content`, of: host.id, form: 'content', when, groupFiles: f.set.size, selected: selected.size, fidelity: +j.toFixed(3), viable: j >= MIN_WHEN_FIDELITY,
          kind: f.kind, groupId: f.groupId, partKind: f.partKind, members: [...f.set].sort(),
          why: `${f.kind} \`${f.label}\` in partition \`${f.part}\`: ${f.set.size} files; generalising predicate from ${cr.why}; selects ${selected.size} tracked files, ${intersectSize(f.set, selected)} of them the candidate's own (J=${j.toFixed(2)})` }, selected);
      }
    }
    // THE MEMBERSHIP, AS A PREDICATE WHERE THE PATHS ALLOW ONE AND AS A LIST WHERE THEY DO NOT (ticket 116).
    //
    // A domain cut is almost always a directory: on spring-petclinic the `owner`, `vet` and `model` groups each
    // live entirely under one package. Frozen as an `any_of` of explicit paths that cut is EXACT today and dead
    // tomorrow — it classifies no file grain has not already seen, so an ecosystem cannot cut a second node and
    // a second owner out of it, and every file added to the domain lands outside its own type. Where the members
    // share a directory below the host, the same membership is a `path:` glob over that directory: a file added
    // there joins the type by itself. Where they do NOT share one there is no path expression to offer and the
    // list is the honest answer, so the list stays — for exactly those candidates, and it says so.
    const paths = [...f.set].sort();
    const shared = commonDir(paths);
    const finerThanHost = shared && shared !== host.dir && shared.startsWith(host.dir + '/');
    let asPath = null;
    if (finerThanHost) {
      const when = { path: `${shared}/**` };
      let selected = null;
      try { selected = expandWhen(when, files, ctx); } catch { /* a predicate that will not compile is itself a finding */ }
      if (selected) {
        const j = jaccard(f.set, selected);
        asPath = { id: `${base}-path`, of: host.id, form: 'path', when, groupFiles: f.set.size, selected: selected.size, fidelity: +j.toFixed(3), viable: j >= MIN_WHEN_FIDELITY,
          kind: f.kind, groupId: f.groupId, partKind: f.partKind, members: paths,
          why: `${f.kind} \`${f.label}\` in partition \`${f.part}\`: all ${f.set.size} files share the directory \`${shared}\`, so the membership is offered as the path predicate \`${shared}/**\` rather than as a list — it GENERALISES, and a file added under that directory is classified here without grain being run again; it selects ${selected.size} tracked files, ${intersectSize(f.set, selected)} of them the candidate's own (J=${j.toFixed(2)})` };
      }
    }
    if (asPath) addAlt(asPath, expandWhen(asPath.when, files, ctx));
    else addAlt({ id: `${base}-list`, of: host.id, form: 'list', when: { any_of: paths.map(p => ({ path: p })) }, groupFiles: f.set.size, selected: f.set.size, fidelity: 1, viable: true,
      kind: f.kind, groupId: f.groupId, partKind: f.partKind, members: paths,
      why: `${f.kind} \`${f.label}\` in partition \`${f.part}\`: the ${f.set.size} files grain grouped share no directory below \`${host.dir}\`${shared ? ` (the deepest they all share is \`${shared}\`, which is not finer than the host)` : ''}, so there is no path predicate to offer and the membership is frozen as an \`any_of\` of explicit paths — exact today, and it will classify no file grain has not already seen` }, f.set);
  }
  alternatives.sort((a, b) => b.fidelity - a.fidelity || b.groupFiles - a.groupFiles || (a.id < b.id ? -1 : 1));
  return { active, alternatives };
}

// ==================================================================================================
// 5. Relations, and the one thing an established negative may NOT become.
//
// Allow-lists are aggregated from resolved file->file imports, mapped through each file's owning node to its
// type. Only `uses` is populated: grain's edge kinds on a typed repository are imports, and an import is a use,
// never necessarily a call — writing `calls:` from an import would assert something the evidence does not say.
//
// `default: deny` (093 §4). Grain's `archNorms exp:"false"` rows are established NEGATIVES — "this module does
// not reach that one, and the absence itself compresses". The architecture's `deny` is a statement about what is
// PERMITTED. On the pattern repo one of the two published negatives (`relations -> core`, share 0.941) sits on a
// pair the hand architecture explicitly ALLOWS: both statements are true about different things. So a negative
// is turned into `default: deny` only when it is not contradicted by anything observed — the source type has no
// resolved outgoing edge at all — and otherwise it becomes a backlog line, never a deny.
// ==================================================================================================
