// grain engine · value-kind evidence, type-reference hits, tested-by evidence and the blind/ungrammared file lists
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { basename, extname } from 'node:path/posix';
import { EXT2GRAMMAR, CFG } from './config.mjs';
import { cochangeData } from './completeness.mjs';

// `what <words>` (§J3.3) — a fourth lens, distinct from both: `where` answers "where should new code implementing
// this go", `how` answers "what did past changes touching this look like", `what` answers "what IS this in this
// repository already" — every kind of fact the model carries about one concept, in one card: declarations (a),
// indexed values (b), its spread across modules (c), sibling values (d), historical commit mentions (e) and
// file-level fan-in (f). Reuses `buildCards` + `whereCmd`'s own IDF unmodified: a query word every card carries
// weighs little, the one word that names the thing weighs most — the same math, a different harvest over the hits.
export const VALUE_KIND_LABEL = { enum: 'enum member', str: 'string literal' };
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
export function gatedValueEvidence(model, rawScopes, q) {
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
export function typeRefHits(model, q) {
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
