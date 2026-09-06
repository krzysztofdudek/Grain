// grain engine · proposal writer · which lattice rows are renderable, which direction they hold in, and why
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.

// The classes that render, and — for everything else — the reason it does not, stated in the aspect itself
// rather than approximated into a check that would be wrong.
export const RENDERABLE = new Set(['imp', 'call', 'deco', 'extends', 'returns', 'nameshape', 'filenameshape', 'lex']);
// WHICH DIRECTION AN `errs: under` CHECK MAY RENDER AT ALL — measured, not assumed.
//
// A drill sweep of the first version over the pattern repo: 86 rendered checks, 423 cases, 314 pass, 56 MISS,
// 53 FALSE-ALARM. Every FALSE-ALARM had one shape. A convention like "methods in this ROLE GROUP declare a
// return type of `Promise`" is true of four methods in a file that holds twenty; a check whose subject is the
// FILE then refuses the file for the other sixteen, which the rule never spoke about. Under-firing is the
// permitted error direction for `errs: under`; over-firing is a broken contract.
//
// So a POSITIVE rule ("everything here does X") renders only where the subject of the rule IS the file — an
// import, a file name, a lexical layer, or a name shape the whole partition shares. A NEGATIVE rule ("nothing
// here does X") renders in every class, because it fires only on evidence it can see and never on absence.
export const BOOLEAN_CLASS = new Set(['imp', 'call', 'deco', 'extends', 'returns']);
// WHICH CLASSES SPELL "DOES NOT USE X" WITH `expected: false` (ticket 115) — and so cannot state a prohibition
// from a majority. For every one of these the enumerator names a THING (an import specifier, a callee, a
// marker, a supertype, a declared return type, a syntactic construct, a parameter type) and `false` says only
// that the thing is not there. Nothing about a MAJORITY of absences is a rule: "files in `src/main/java` do not
// import `jakarta.persistence.Entity`" was mined from 24 of 30 files, and the six that do are the entities — so
// the sentence is refuted by the very code it was mined from. Measured on spring-petclinic: 12 of 44 standing
// advisory refusals were of exactly this shape. `nameshape`/`filenameshape`/`lex`/`mods` and the rest are NOT
// here: their `expected` is a VALUE the code carries, so there is no absence to mistake for a prohibition.
export const ABSENCE_CLASS = new Set([...BOOLEAN_CLASS, 'has', 'ptype']);
// One predicate for it, because the same row must read the same way wherever the proposal shows it: as an
// aspect, and in the refactor backlog's own listing of the lattice.
export const isAbsenceRow = r => ABSENCE_CLASS.has(/^auto\.([a-z0-9]+):?/.exec(String(r.pid))?.[1] || '') && String(r.exp) === 'false';
// grain's own `unitOf` domain (engine/core.mjs): a convention's `kind` names the SUBJECT its evidence is about.
// `file` and `module` ARE the unit Yggdrasil's `scope: { per: 'file' }` reviews; every other kind — a method, a
// type/class, a catch or finally block — is a SYMBOL living inside a file, smaller than the unit a rendered
// check is actually judged at. Rendering such a convention as a check is still sound by construction (the
// `errs: under` templates above only fire on evidence they can prove, never on an absence), but the CORPUS label
// this renderer cuts from the export's own sites approximates a symbol-level fact as a file-level one — ticket
// 101 §8.1 traced every remaining FALSE-ALARM in its whole corpus to exactly this gap. `scopeApproximation`
// names it in `provenance.json` (ruling `drill-fa-labelling-is-acceptance-not-defect`) so a real drill's FA
// count is read as a labelling artifact of the corpus, not a defect in the check.
export const SYMBOL_LEVEL_KIND = new Set(['method', 'type', 'catch', 'finally', 'case']);
export function renderableDirection(enumerator, expected, kind, ctxType) {
  if (!RENDERABLE.has(enumerator)) return false;
  // A GROUP-SCOPED RULE IS UNRENDERABLE IN BOTH DIRECTIONS. The counsel memo said group-scoped conventions
  // WITHOUT a marker cannot be rendered; drilling says the marker does not save them either. A `content:`
  // predicate selects FILES, and a role group is a set of SCOPES — so "methods in the `reviewer+point` group
  // never return `string`" becomes, at file granularity, "no method in any file mentioning `point` returns
  // `string`", which refuses methods the rule never spoke about. Measured: the last 5 FALSE-ALARMs in the
  // sweep, all on one such rule, with the marker predicate doing its job correctly.
  if (ctxType === 'group' && enumerator !== 'filenameshape' && enumerator !== 'lex') return false;
  if (BOOLEAN_CLASS.has(enumerator)) {
    if (String(expected) === 'false') return true;
    return enumerator === 'imp' && kind === 'file';
  }
  if (enumerator === 'nameshape') return ctxType === 'partition' && (kind === 'type' || kind === 'method');
  return true; // filenameshape and lex: the file itself is the subject either way
}
export const WHY_PROSE = {
  // ticket 120 §class 3: the row was measured within one role-group cluster narrower than the host type's own
  // directory glob, and neither an explicit path list (the export's own member list for that group is truncated)
  // nor a shared `content:` predicate (the group offers no marker, name shape or import to draft one from) can
  // state the cluster's own scope exactly. Rendering a check against the wider glob would enforce a rule beyond
  // the population it was ever measured on; rendering one against the WRONG narrower guess would be worse. So no
  // check is rendered at all, and this row cannot be promoted (`draftReason: cluster-narrower-than-scope`).
  _clusterNarrower: 'the convention was measured within one role-group cluster narrower than the scope a check would enforce, and no exact scope for that cluster (an explicit file list, or a shared `content:` predicate) could be derived from what grain exported about it.',
  _absence: 'the row reports an ABSENCE, not a prohibition. Its class spells "does not use X" with `expected: false`, and its origin is the sub-gate lattice — a band grain has by definition declined to certify — so all the row says is that most things here happen not to use the identifier today. The minority that do are usually the point (the files importing an entity annotation ARE the entities), so read this as a fact about the repository and decide for yourself whether it should become a rule.',
  stshape: 'the convention asserts a STATEMENT SHAPE — a subtree, not a name. There is no identifier to match and no way to phrase it as a tree query that holds across languages.',
  has: 'the convention asserts the PRESENCE OR ABSENCE of a syntactic construct. Rendering it would mean asserting the grammar\'s own vocabulary as a rule.',
  modexport: 'the convention asserts a MODULE-LEVEL export style, which every language spells differently.',
  arity: 'the convention asserts a PARAMETER COUNT — a shape, and one whose meaning differs per language.',
  ptype: 'the convention asserts a PARAMETER TYPE, which needs per-language parameter-list field names this template set does not claim to know.',
  ret: 'the convention asserts a RETURN-STATEMENT SHAPE, not a declared type.',
  first1: 'the convention asserts what the FIRST STATEMENT is — a shape.',
  varshape: 'the convention asserts a LOCAL-VARIABLE shape.',
  moddirshape: 'the convention asserts a directory-name shape at module level; it is placement, and placement is what the node cut already encodes.',
  modfileshape: 'the convention asserts a file-name shape at module level; the node cut already encodes it.',
  modsize: 'the convention asserts a module SIZE — a measurement of the repository, not a rule about a file.',
  nameshape: 'the convention asserts a NAME SHAPE over a kind of declaration whose grammar node types this template set cannot name exactly, so a rendered check would refuse declarations the rule never spoke about.',
  filenameshape: 'the convention asserts a FILE-NAME SHAPE that does not compile to an anchored pattern (it contains a character class grain records as "anything else").',
  lex: 'the convention asserts a LEXICAL surface this template set does not read exactly.',
  imp: 'the convention names no import specifier to look for.',
  call: 'the convention names no callee to look for.',
  _scopeMismatch: 'the convention\'s subject is a DECLARATION inside a file, and a deterministic check\'s unit is the FILE. A rule that speaks about some declarations would refuse the file for all the others — measured at 53 false alarms in 423 drill cases before this was closed, and 5 more from the group-scoped case after — and an `errs: under` check may not over-fire. Written as prose so a reviewer that can see which declaration the rule is about judges it instead.',
  _positiveGroup: 'the convention is POSITIVE ("everything here does X") and its subject is a declaration inside the file, not the file itself. A deterministic check whose unit is the file would refuse the file for every OTHER declaration in it — measured at 53 false alarms in 423 drill cases before this was closed — and an `errs: under` check may not over-fire. Written as prose so a reviewer that can see which declaration the rule is about judges it instead.',
};


// ==================================================================================================
// 7.5 Sizing — `sizing.json` (ticket 098 / ecosystem-design-2026-09-05.md §2.4).
//
// Horde's only cutting rule (skills/horde/reference/model.md, "The node"): "a node is cut correctly when its
// charter, its contracts and its code fit one Sonnet context with room to work". `node.mjs map` needs a NUMBER
// to print that ratio against; this is where it comes from. Per proposed node — and per HAND node, when the
// source repository already carries its own `.yggdrasil/` (as this one does on Yggdrasil itself) — four counts:
//
//   - `files`    the node's own file count (deepest-node precedence, same as `buildNodes`'s `ownFiles`)
//   - `bytes`    total file size on disk (`fs.statSync`)
//   - `codelengthLines` total source lines (`fs.readFileSync`, newline count) — named deliberately NOT
//                "codelength" alone: the export's OWN codelength quantity (`bitsPerInstance` on a convention,
//                `engine/core.mjs`'s description-length statistic over scope populations) is a measure of how
//                SURPRISING a value is against its population, not a measure of SIZE, and nothing in the export
//                aggregates it per module or per partition despite the ecosystem-design memo's §2.4 phrasing
//                ("Grain's export already has bytes, scopes and codelength per module and per partition") — that
//                claim does not hold for `bytes` or a size-flavoured "codelength" either; both are computed here,
//                from the files themselves, not read out of any existing export field.
//   - `scopes`   the file's total scope count, summed from `.grain/cache/tree.json` (the same per-file scope
//                array `partitionLattice` above reads) when that cache exists; `null` — not zero — when it does
//                not, so an absent cache is never misread as a repo with no scopes.
//
// WHAT IS DERIVED AND WHAT IS A FACT OF THE MODEL. `files`/`bytes`/`codelengthLines`/`scopes` are ALL derived —
// counted from the files themselves or from grain's own scope cache, nothing tuned, nothing tunable. The ONE
// number here that is not derived at all is `contextBudgetTokens: 200000` — Anthropic's published context
// window for the models this family runs on (claude-api skill), a fact about the tool the ecosystem happens to
// run on, not a Grain measurement and not a Grain constant. `sizing.json` carries it so a consumer (`node.mjs
// map`) can compute a ratio without hardcoding the number itself; this renderer computes no ratio and makes no
// claim about what ratio predicts owner success — that is the bet ecosystem-design-2026-09-05.md §6 names, and
// sizing.json is deliberately just the two numbers a ratio needs, not the ratio's verdict.
// ==================================================================================================
