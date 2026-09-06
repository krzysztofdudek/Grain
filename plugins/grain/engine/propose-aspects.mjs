// grain engine · proposal writer · the obligation form and the aspect drafts
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isLanguageMarkerFile, EXT2GRAMMAR, GRAMMAR_DIR } from './config.mjs';
import { shapeWords, lexWords } from './core.mjs';
import { LAMBDA_BOUND, MIN_CONVENTION_SITES, SUBGATE_PER_PARTITION, pct, slug } from './propose-base.mjs';
import { renderCheck } from './propose-checks.mjs';
import {
  ABSENCE_CLASS,
  BOOLEAN_CLASS,
  WHY_PROSE,
  isAbsenceRow,
  renderableDirection,
} from './propose-classify.mjs';
import { contentMd, subGateMd } from './propose-drills.mjs';
import { identifierOf } from './propose-lattice.mjs';
import { contentRegexFor } from './propose-levels.mjs';
import { typeGlob } from './propose-nodes.mjs';

// The subject of an obligation is ONE thing, not a population: "Every method …", never "methods here …".
// `unitOf` (core.mjs) is the plural half of the same table; nothing here renames a kind.
const UNIT_ONE = { method: 'method', type: 'type', file: 'file', module: 'directory', catch: 'catch block', finally: 'finally block', case: 'named callback' };
export const unitOne = kind => UNIT_ONE[kind] || kind || 'file';
const A_OR_AN = w => (/^[aeiou]/i.test(String(w).replace(/^`/, '')) ? 'an' : 'a');
// `are X` is the only verb form `verbalize` emits that is not already an infinitive; `do not X` folds to
// `not X` so a sentence reads "must not X" and never "must do not X".
const infinitive = pred => pred.replace(/^are /, 'be ').replace(/^do not /, 'not ');
// A rule whose expected value is `false` is a PROHIBITION, and a prohibition reads as one — "No file under
// `src/**` may import `x`" — not as a doubled negative. This lifts the negation out of the mined phrase.
// Where the phrase carries no negation this renderer recognises, it returns null and the affirmative template
// is used unchanged rather than guessed at.
const affirmativeOf = pred => {
  if (pred.startsWith('are not ')) return 'be ' + pred.slice(8);
  if (pred.startsWith('take no ')) return 'take a ' + pred.slice(8);
  if (pred.startsWith('never ')) return pred.slice(6);
  if (pred.startsWith('do not ')) return pred.slice(7);
  return null;
};
// WHO must do WHAT, WHERE — one sentence, with the scope inside it. The scope is the aspect's own `scope:`
// glob, written into the sentence rather than left in a yaml field three lines below: an agent that reads
// "methods here" has no way at all to know where "here" is, and that is the single most common thing 101's
// judge said about the rows it refused.
export function obligationSentence({ unit, phrase, prohibited, where, which }) {
  const place = where ? `under \`${where}\`` : 'anywhere in this repository';
  const clause = which ? (unit === 'file' ? ` ${which}` : `, in a file ${which},`) : '';
  const subject = `${unit} ${place}${clause}`;
  return prohibited ? `No ${subject} may ${phrase}.` : `Every ${subject} must ${phrase}.`;
}
// The certified branch hands over a mined predicate that already carries its own sign in its own words.
export const obligationOfStatement = statement => {
  const i = statement.indexOf(' here ');
  if (i < 0) return null; // a `mod*` fallback phrase with no subject — worded exactly as mined, below
  const pred = statement.slice(i + ' here '.length);
  const pos = affirmativeOf(pred);
  return pos ? { phrase: pos, prohibited: true } : { phrase: infinitive(pred), prohibited: false };
};
// The mined predicate of a LATTICE ROW, in words. A wording table and nothing else: the row, its id, its
// counts and the `check.mjs` rendered beside it are untouched by every line of it.
//
// THE CATEGORICAL FAMILIES CARRY THEIR VALUE IN THE ROW, NOT IN THE PID (ticket 109). `auto.nameshape` has no
// argument at all, and `auto.lex:quote` names the SURFACE (`quote`), never the value (`single`). The value
// grain measured — and the value the rendered check compiles, since every template in `renderCheck` reads
// `expected` and none reads `argument` for these classes — is the row's own `exp`. Reading the pid alone
// produced "methods in `Slim/Interfaces` follow the name shape ``" (a rule with an empty identifier) and
// "files in `themes` have auto.lex:quote" (an internal pid printed at a maintainer). Measured on the 109
// corpus: 25 of the first 250 rendered aspects, six of them already promoted to `advisory` by a real drill of
// a check that was correct — the check knew the value the sentence did not say.
export const describeRow = (pid, exp) => {
  const [, fam, arg] = /^auto\.([a-z0-9]+):?(.*)$/.exec(String(pid)) || [];
  const v = String(exp ?? '');
  const shaped = s => shapeWords(s) || `in the shape \`${s}\``;
  switch (fam) {
    case 'imp': return `import \`${arg}\``;
    case 'call': return `call \`${arg}\``;
    // the argument may already carry the sigil grain read it with — `@@Override` was rendered at a maintainer
    case 'deco': return `carry \`${String(arg).startsWith('@') ? arg : '@' + arg}\``;
    case 'extends': return `extend \`${arg}\``;
    case 'has': return `contain ${A_OR_AN(arg)} \`${arg}\``;
    case 'returns': return `declare a return type of \`${arg}\``;
    case 'stshape': return `use the structure \`${arg}\``;
    case 'ptype': return `take a parameter of type \`${arg}\``;
    case 'nameshape': return `be named ${shaped(v)}`;
    case 'filenameshape': return `have a file name ${shaped(v)}`;
    case 'lex': return lexWords(arg, v);
    case 'mods': return v === 'none' ? 'carry no modifiers' : `carry the modifiers \`${v}\``;
    case 'memberorder': return `declare their members in the order \`${v}\``;
    case 'namesuffix': return `be named ending in \`${v}\``;
    case 'modexport': return `be exported through \`${v}\``;
    case 'arity': return `take exactly ${v} parameter${v === '1' ? '' : 's'}`;
    case 'first1': return `open with ${A_OR_AN(v)} \`${v}\``;
    case 'ret': return `return ${A_OR_AN(v)} \`${v}\``;
    case 'varshape': return `name local variables ${shaped(v)}`;
    case 'ctorshape': return `declare their constructor as \`${v}\``;
    default: return /^dir\d*$/.test(String(fam)) ? `live under \`${v}/\`` : `satisfy \`${pid}\` = \`${v}\``;
  }
};
// The scope predicate, as a reader reads it rather than as a matcher matches it. `where` is the path glob the
// sentence binds to; `which` is the relative clause a `content:` predicate becomes ("that mentions `counter`");
// `plain` is the same thing as one noun phrase, for the evidence line.
const scopeInWords = (glob, which) => `files under \`${glob}\`${which ? ` ${which}` : ''}`;
// How many sites hold the rule and how many break it — the two numbers that decide whether a reader believes
// the sentence, put where a reader meets them first. Same counts as before, read in the other direction:
// "9 deviating" is the same fact as "9 break it today", and only the second one says what to do about it.
const holdsPhrase = (holds, breaks, unitPlural) => {
  const total = holds + breaks;
  return breaks === 0
    ? `holds for all ${total} ${unitPlural} in scope — the repository has no exception to it today`
    : `holds for ${holds} of ${total} ${unitPlural} in scope; ${breaks} break it today`;
};
const NOT_A_RULE = new Set(['filebirth']);
// EXEMPTING THE NAMES A LANGUAGE FIXES FROM A FILE-NAME RULE (ticket 116). `auto.filenameshape` is the one
// enumerator whose subject is the file NAME, and a handful of names in most languages are not the project's to
// choose: `package-info.java`, `__init__.py`, `index.ts`, `mod.rs`. Measured on spring-petclinic, five of the
// forty-four standing advisory refusals were `package-info.java` — a rule refuted by the language on the day it
// was proposed. Such a file leaves the population, leaves the drill corpus, and is skipped by the rendered
// check (`renderCheck`, `case 'filenameshape'`); what left is stated, never silently dropped.
//
// ONLY `filenameshape`. Every other enumerator is about what a file CONTAINS, and a marker file's contents are
// as governable as any other file's — `__init__.py` re-exporting a module is ordinary Python.
const exemptMarkers = (enumerator, sites) => {
  if (enumerator !== 'filenameshape') return { kept: sites, names: [] };
  const kept = [], names = new Set();
  for (const s of sites) {
    const rel = typeof s === 'string' ? s.split('#')[0] : s?.rel;
    if (rel && isLanguageMarkerFile(rel)) names.add(rel.split('/').pop());
    else kept.push(s);
  }
  return { kept, names: [...names].sort() };
};
const markerNote = (...groups) => {
  const names = [...new Set(groups.flatMap(g => g.names))].sort();
  const n = groups.reduce((a, g) => a + g.exempted, 0);
  return n ? ` · ${n} language marker file${n === 1 ? '' : 's'} exempted (${names.map(x => `\`${x}\``).join(', ')}) — the language fixes ${names.length === 1 ? 'that name' : 'those names'}, so no naming convention of this repository can apply to ${n === 1 ? 'it' : 'them'}` : '';
};
// ==================================================================================================
// IDENTIFIER HYGIENE (ticket 120, `.system/research/sense-iteration.md` §10). Four ways a mined row reads as
// nonsense however it is worded — caught here, at render time, before it ever becomes an aspect draft.
//
// (1) A PARSER NODE TYPE AS THE IDENTIFIER — `call_expression`, `identifier`, `member_expression` appearing as
// the thing "called"/"imported"/"extended", or (the `has`/`stshape`/`first1`/`ret` families) as the thing the
// row was ALWAYS going to name, because those families measure the grammar's own vocabulary by construction
// (core.mjs `auto.has:<node type>`, `auto.first1 = stmts[0].type`, `auto.stshape:<node type>(...)`). Detected
// from the grammar's OWN `node-types.json` — never a hand list — so the set is exactly what the shipped grammar
// says a node type is, per language.
const NODE_TYPE_SETS = new Map(); // grammar name -> Set<node type name>, memoized process-wide (grammars are static)
const nodeTypeNamesFor = grammarName => {
  if (NODE_TYPE_SETS.has(grammarName)) return NODE_TYPE_SETS.get(grammarName);
  const set = new Set();
  try {
    const raw = JSON.parse(readFileSync(join(GRAMMAR_DIR, `tree-sitter-${grammarName}.node-types.json`), 'utf8'));
    for (const entry of raw) {
      if (entry?.named && entry.type) set.add(entry.type);
      for (const sub of entry?.subtypes || []) if (sub?.named && sub.type) set.add(sub.type);
    }
  } catch { /* grammar not shipped or unreadable — empty set, so it never false-positives */ }
  NODE_TYPE_SETS.set(grammarName, set);
  return set;
};
// The grammar(s) a set of tracked files is written in, from the SAME extension map `grain export` itself uses
// to pick a parser (`config.mjs` EXT2GRAMMAR) — not re-derived, not a second copy of the per-language datum.
const grammarsForFiles = fileIterable => {
  const gs = new Set();
  for (const rel of fileIterable) {
    const m = /\.[A-Za-z0-9]+$/.exec(rel);
    const g = m && EXT2GRAMMAR[m[0].toLowerCase()];
    if (g) gs.add(g);
  }
  return gs;
};
const IDENTIFIER_TOKEN_RE = /[A-Za-z_][A-Za-z0-9_]*/g;
// A bare identifier (`call_expression`) and a compound structural shape (`statement(assembly_statement(...))`,
// `stshape`'s own wording) are both caught the same way: every word inside it must be one of the grammar's own
// node type names, or this is silent. A real identifier a person wrote (`someHelperFunction`, `(Ua)+` name
// shapes, `3+` arities) tokenizes to words no grammar's node-types.json contains, so it never matches.
const isParserNodeTypeIdentifier = (identifier, grammars) => {
  if (!identifier || !grammars || !grammars.size) return false;
  const toks = String(identifier).match(IDENTIFIER_TOKEN_RE) || [];
  if (!toks.length) return false;
  for (const g of grammars) {
    const set = nodeTypeNamesFor(g);
    if (toks.every(t => set.has(t))) return true;
  }
  return false;
};
// The families whose value IS the identifier a class-1 check is about — either the pid's own `:argument` (the
// colon-suffixed families) or, for the four bare-pid STRUCT_PID families that have no argument slot at all
// (core.mjs `STRUCT_PID`), the row's established/expected value itself.
const NODE_TYPE_IDENTIFIER_FAMILIES = new Set(['imp', 'call', 'deco', 'extends', 'has', 'returns', 'ptype', 'stshape', 'first1', 'ret', 'varshape']);
const identifierUnderTest = (fam, argument, expected) => {
  if (!NODE_TYPE_IDENTIFIER_FAMILIES.has(fam)) return null;
  if (argument) return argument;
  return expected != null && expected !== '' ? String(expected) : null;
};
// (2) A GENERIC TYPE PARAMETER READ AS A DOMAIN TYPE — `S`, `V`, `T`, `TResult` in a `ptype`/`returns`/`extends`
// row. core.mjs's own callable-surface walk EXCLUDES `type_parameters` from what it records (`RESULT_EXCLUDE`),
// and neither `fileSups` nor `fileTypeRefs` is exported at all (`export.mjs` schemaNotes) — so there is no
// extracted fact this renderer can consult to know a name was DECLARED as a type parameter in scope. Logged as
// an extractor gap for after ticket 117 (§ below); the honest signal available here instead is conventional
// FORM (a bare single uppercase letter, or the `T<Word>` shape most languages spell a parameter with) narrowed
// by the one fact the export corpus DOES carry: whether that exact name is ever declared as a real type
// (`kind: 'type'`) anywhere in the repository's own scopes. A convention whose subject is never once a real
// declaration and whose name is shaped like a type parameter is read as one; a repository that genuinely has a
// class named `T` or `S` keeps its rule, because `declaredTypeNames` below will hold the name.
const CONVENTIONAL_TYPE_PARAM_RE = /^[A-Z]$|^T[A-Z][A-Za-z0-9]*$/;
const TYPE_PARAM_FAMILIES = new Set(['ptype', 'returns', 'extends']);
const looksLikeGenericTypeParam = (fam, identifier, declaredTypeNames) =>
  TYPE_PARAM_FAMILIES.has(fam) && !!identifier && CONVENTIONAL_TYPE_PARAM_RE.test(identifier) && !declaredTypeNames.has(identifier);
export function buildAspects(exp, active, sub, opts = {}) {
  const out = [];
  const skipped = { unrenderableGroupScoped: 0, notARule: 0, prose: 0, absence: 0, byClass: {}, notARuleByReason: {}, clusterNarrowerThanScope: 0 };
  const bumpNotARule = reason => { skipped.notARule++; skipped.notARuleByReason[reason] = (skipped.notARuleByReason[reason] || 0) + 1; };
  // The grammar(s) a host type's own files are written in, cached per host — computed once per type regardless
  // of how many rows attach to it (§class 1 above needs it on every certified convention and every sub-gate row).
  const grammarsByHostId = new Map();
  const grammarsForHost = host => {
    if (!host) return new Set();
    if (!grammarsByHostId.has(host.id)) grammarsByHostId.set(host.id, grammarsForFiles(host.files || []));
    return grammarsByHostId.get(host.id);
  };
  // §class 2's "declared anywhere in the repository's own declarations" census — every name this EXPORT records
  // as a real type declaration (`kind: 'type'`), drawn from the two places the export schema actually carries
  // scope names: every certified convention's own sites/exemplars, and every role group's member list. Neither
  // is a full repo-wide symbol table (the export caps both), but both are real extracted facts, never invented.
  const declaredTypeNames = new Set();
  {
    const addSite = s => { if (s && s.kind === 'type' && s.name) declaredTypeNames.add(s.name); };
    for (const c of exp.conventions || []) {
      for (const s of c.conformingSites || []) addSite(s);
      for (const s of c.deviatingSites || []) addSite(s);
      for (const s of c.exemplars || []) addSite(s);
    }
    for (const p of exp.partitions || []) for (const g of p.groups || []) for (const m of g.members || []) addSite(m);
  }
  const asOf = (exp.asOf || '').slice(0, 8);
  const reviewBy = ((y) => `${y + 1}-01-15`)(new Date(exp.indexedAt || Date.now()).getUTCFullYear());
  // A PARTITION NAME IS GRAIN'S LABEL, NOT NECESSARILY A PATH (ticket 119). The first two clauses are the
  // path ones and are unchanged, so a partition that names a directory resolves exactly as it always did. The
  // third is the one `_root` and `_repo` need: `buildTypes` above resolved every label partition to the emitted
  // type that actually holds its files, and the answer rides on the type as `labelPartitions`. Reached only
  // when the path clauses find nothing, so no host this renderer used to produce can change.
  const typeForPartition = name => active.find(a => a.dir === name)
    || active.find(a => a.dir && name.startsWith(a.dir + '/'))
    || active.find(a => (a.labelPartitions || []).some(x => x.name === name))
    || null;
  // What to DISCLOSE when the host was resolved that way rather than by name: the rule was measured over the
  // partition and is judged over the host type's glob, and a reader has to be told the two are not the same set.
  const labelHosting = (host, name) => (host?.labelPartitions || []).find(x => x.name === name) || null;
  const labelHostingNote = (host, name) => {
    const l = labelHosting(host, name);
    return l ? ` · partition \`${name}\` is a label, not a directory — no tracked file lives under that name — so this rule is attached to the type that holds most of it: \`${host.id}\` holds ${l.held} of its ${l.total} files, and the scope below is that type's, not the partition's` : '';
  };
  const partOf = name => (exp.partitions || []).find(p => p.name === name);

  // The scope predicate an aspect is judged over. A partition- or directory-scoped convention scopes by PATH; a
  // group-scoped one needs a `content:` predicate drafted from the group's own marker or name shape (§4 of the
  // renderer above), and a group that offers none is UNRENDERABLE — the count is disclosed, never approximated.
  const scopeFor = (c, host) => {
    if (!host) return null;
    if (c.context?.type === 'group') {
      const g = (partOf(c.partition)?.groups || []).find(x => x.id === c.context.group);
      const cr = g ? contentRegexFor(g) : null;
      if (!cr) return null;
      return { pred: { per: 'file', files: { all_of: [{ path: typeGlob(host) }, { content: cr.regex }] } }, why: `scoped by the group's own evidence (${cr.why})`, glob: typeGlob(host), which: cr.sel };
    }
    if (c.context?.type === 'directory' && c.context.dir) return { pred: { per: 'file', files: { path: `${c.context.dir}/**` } }, why: `scoped to directory \`${c.context.dir}\``, glob: `${c.context.dir}/**` };
    return { pred: { per: 'file', files: { path: typeGlob(host) } }, why: `scoped to partition \`${c.partition}\``, glob: typeGlob(host) };
  };

  // §class 3 (ticket 120): a sub-gate row measured within one ROLE-GROUP cluster is judged, by grain's own
  // measurement, only over that cluster's members — but the scope every sub-gate row was rendered against
  // (below, before this ticket) was unconditionally the WHOLE host type's directory glob. When the cluster
  // covers fewer files than that glob selects, the sentence and the check disagree about what was measured.
  // Fixed here, not by picking a threshold: either the cluster's own scope can be stated EXACTLY — an explicit
  // path list, when the export's own (200-capped) member list is not itself truncated, or the same shared
  // `content:` predicate a group-scoped CERTIFIED convention already uses (`scopeFor` above, `contentRegexFor`)
  // — or it cannot, and `ok: false` tells the caller to ship no check at all rather than an approximate one.
  // The STATEMENT keeps naming the host's own glob either way (same convention `scopeFor`'s group branch
  // already follows for certified rows): `which` carries the qualifier a reader needs, the glob stays the
  // sentence a human recognizes, and the evidence line already discloses the cluster (ticket 109).
  const clusterScopeFor = (r, host) => {
    const wholeGlob = typeGlob(host);
    const whole = { pred: { per: 'file', files: { path: wholeGlob } }, glob: wholeGlob, which: null, ok: true };
    if (r.role === null) return whole;
    const g = (partOf(r.partition)?.groups || []).find(x => x.id === 'r' + r.role);
    if (!g) return whole;
    const memberRels = [...new Set((g.members || []).map(m => m.rel))].sort();
    if (!memberRels.length || memberRels.length >= host.files.size) return whole; // the cluster IS the host's population
    // The export caps a group's own `members` array at 200 even though `size` names the true count (export.mjs);
    // an explicit list built from a TRUNCATED members array would silently under-scope the rule, which is worse
    // than not narrowing it at all — so an explicit list is only offered when the export's list is complete.
    const complete = (g.members || []).length >= Math.min(g.size, 200);
    if (complete) {
      const filesPred = memberRels.length === 1 ? { path: memberRels[0] } : { any_of: memberRels.map(p => ({ path: p })) };
      return { pred: { per: 'file', files: filesPred }, glob: wholeGlob, which: `that belongs to role group \`${g.label || g.id}\``, ok: true };
    }
    const cr = contentRegexFor(g);
    if (cr) return { pred: { per: 'file', files: { all_of: [{ path: wholeGlob }, { content: cr.regex }] } }, glob: wholeGlob, which: cr.sel, ok: true };
    return { ...whole, ok: false }; // no exact scope on offer — the caller renders no check and stays draft
  };

  // (i) the certified set
  for (const c of exp.conventions || []) {
    if (NOT_A_RULE.has(c.feature.enumerator)) { skipped.notARule++; continue; }
    // §class 1/2 (ticket 120): an identifier that is the grammar's own vocabulary, or one shaped exactly like a
    // generic type parameter and never a real declaration in this repository, is not a rule whatever else is
    // true of it — checked before the floor and before any rendering, on the same identifier `describeRow` and
    // `renderCheck` would otherwise word into a sentence and a check nobody could obey or nobody should.
    const host0 = typeForPartition(c.partition);
    const idUnderTest0 = identifierUnderTest(c.feature.enumerator, c.feature.argument, c.expected);
    if (isParserNodeTypeIdentifier(idUnderTest0, grammarsForHost(host0))) { bumpNotARule('parser-node-type-as-identifier'); continue; }
    if (looksLikeGenericTypeParam(c.feature.enumerator, idUnderTest0, declaredTypeNames)) { bumpNotARule('generic-type-parameter-as-domain-type'); continue; }
    // The names the language fixes leave the population BEFORE the floor is applied, so a convention that only
    // clears `MIN_CONVENTION_SITES` on the strength of files it may not govern does not clear it at all.
    const conf = exemptMarkers(c.feature.enumerator, c.conformingSites || []);
    const devi = exemptMarkers(c.feature.enumerator, c.deviatingSites || []);
    const exemptedConf = (c.conformingSites || []).length - conf.kept.length;
    const n = Math.max(0, (c.established || 0) - exemptedConf);
    if (n < MIN_CONVENTION_SITES) continue;
    const host = host0;
    const scope = scopeFor(c, host);
    if (!scope) { skipped.unrenderableGroupScoped++; continue; }
    const dev = devi.kept.length;
    const markers = markerNote({ names: conf.names, exempted: exemptedConf }, { names: devi.names, exempted: (c.deviatingSites || []).length - dev });
    const adoption = n / Math.max(1, n + dev);
    const ctxLabel = c.context?.type === 'group' ? `role group \`${c.context.label || c.context.group}\`` : c.context?.type === 'directory' ? `directory \`${c.context.dir}\`` : `partition \`${c.partition}\``;
    const provenance = `share ${(c.share ?? 0).toFixed(3)} · n ${n} conforming, ${dev} deviating (adoption ${pct(adoption)}) · ${((c.bitsPerInstance ?? 0)).toFixed(1)} bits/instance · ${ctxLabel} of \`${c.partition}\` · asOf ${asOf}`;
    // THE EVIDENCE LINE LEADS WITH THE NUMBER THAT DECIDES WHETHER TO BELIEVE THE SENTENCE (ticket 109), then
    // where the rule applies, then what to copy, and only then how grain came to propose it. The counts are
    // the same counts `provenance` carries — read in the direction a reader needs them ("9 deviating" and "9
    // break it today" are one fact, and only the second says what to do next). `provenance` itself is
    // unchanged and still goes verbatim into `provenance.json` and into every check's own header.
    const exemplarPhrase = (c.exemplars || []).length
      ? `copy ${(c.exemplars || []).slice(0, 2).map(e => `${e.rel}:${e.line}`).join(' or ')}`
      : 'no exemplar recorded to copy';
    const evidenceLine = `${holdsPhrase(n, dev, `${unitOne(c.kind)}s`)} · applies to ${scopeInWords(scope.glob, scope.which)} · ${exemplarPhrase} · grain certified this from ${ctxLabel} of \`${c.partition}\`: share ${(c.share ?? 0).toFixed(3)} (adoption ${pct(adoption)}), ${((c.bitsPerInstance ?? 0)).toFixed(1)} bits/instance, measured at ${asOf}${labelHostingNote(host, c.partition)}${markers}`;
    const id = `grain/${slug(c.partition)}/${slug(c.context?.type === 'group' ? (c.context.label || c.context.group) : c.context?.type || 'partition')}-${slug(c.feature.enumerator)}${c.feature.argument ? '-' + slug(c.feature.argument).slice(0, 40) : ''}`;
    if (out.some(o => o.id === id)) continue;
    const check = renderableDirection(c.feature.enumerator, c.expected, c.kind, c.context?.type)
      ? renderCheck({ enumerator: c.feature.enumerator, argument: c.feature.argument, expected: c.expected, kind: c.kind, provenance: `${c.statement}\n${provenance}` })
      : null;
    const proseReason = check ? null : (BOOLEAN_CLASS.has(c.feature.enumerator) || c.feature.enumerator === 'nameshape' ? WHY_PROSE._scopeMismatch : (WHY_PROSE[c.feature.enumerator] || `no template renders the \`${c.feature.enumerator}\` class`));
    if (!check) { skipped.prose++; skipped.byClass[c.feature.enumerator] = (skipped.byClass[c.feature.enumerator] || 0) + 1; }
    const profile = c.context?.type === 'group' ? (partOf(c.partition)?.groups || []).find(g => g.id === c.context.group)?.profile : null;
    // The rule, as an obligation with its scope inside it (§7-bis). Where the mined phrase has no subject to
    // rewrite (`mod*` fallbacks), the statement is worded exactly as mined and bound to its scope — never
    // guessed into a shape it does not have.
    const ob = obligationOfStatement(c.statement);
    const name = ob
      ? obligationSentence({ unit: unitOne(c.kind), ...ob, where: scope.glob, which: scope.which })
      : `Under \`${scope.glob}\`: ${c.statement}.`;
    out.push({
      id, origin: 'certified-convention', host: host?.id || null, evidenceLine, provenance, reviewBy,
      // The whole statement, not a truncated prefix (ticket 106: `slice(0, 70)` used to cut mid-word — `yg
      // schemas read aspect` sets no length limit on `name`, so there is no honest reason to cut it at all).
      name, holds: holdsPhrase(n, dev, `${unitOne(c.kind)}s`),
      // The description carries the RULE, how far it already holds, and what its status does — and stops
      // there. The counts, the scope, the exemplar and the certification live on the `#e` line two lines above
      // it in the same file; repeating the whole of it here (as this renderer used to repeat `provenance`)
      // makes a reader read the same sentence twice and trust it no more the second time.
      description: `${name} It already ${holdsPhrase(n, dev, `${unitOne(c.kind)}s`)}.`,
      scope: scope.pred, check,
      whyProse: proseReason,
      content: check ? null : contentMd(c, profile, evidenceLine, proseReason, name),
      drills: { satisfies: conf.kept.slice(), violates: devi.kept.slice() },
      enumerator: c.feature.enumerator, argument: c.feature.argument, expected: c.expected, kind: c.kind,
      // structured fields for provenance.json (ticket 100) — parallel to the prose already in `provenance`,
      // never re-derived from it by regex the way a POST-HOC reader of a written proposal has to (097's
      // law-loop.mjs `provenanceFor`, which reads back a file this renderer did not annotate at write time)
      partition: c.partition, share: c.share ?? null, n, deviating: dev,
      exemplars: (c.exemplars || []).slice(0, 3).map(e => ({ rel: e.rel, line: e.line, name: e.name })),
      // A CERTIFIED `false` direction STAYS ELIGIBLE (ticket 115). It cleared grain's own certification bound,
      // so it is a real "this partition never uses X" and not a majority of absences — but a reader deciding
      // whether to turn it on still needs to know it is a statement about something NOT being there, so the
      // direction is recorded in its provenance rather than left to be inferred from `expected`.
      ...(ABSENCE_CLASS.has(c.feature.enumerator) && String(c.expected) === 'false' ? { direction: 'absence' } : {}),
    });
  }

  // (ii) the sub-gate lattice — the house rules that have not finished spreading
  //
  // `SUBGATE_PER_PARTITION` is a READING cap, not a measurement one (§7 of the renderer design): it bounds how
  // many candidates a maintainer is asked to look at, and nothing about what grain measured. A MEASUREMENT run
  // must be able to lift it or it is measuring the cap — so `opts.subGatePerPartition` overrides it, the default
  // is unchanged, and 097 states in its report that it ran with the cap lifted (ruling
  // `instrument-floors-allowed-if-stated-and-measured`).
  const capPer = Number.isFinite(opts.subGatePerPartition) ? opts.subGatePerPartition : SUBGATE_PER_PARTITION;
  const perPart = new Map();
  for (const r of sub) {
    const seen = perPart.get(r.partition) || perPart.set(r.partition, []).get(r.partition);
    if (seen.length >= capPer) continue;
    const fam = /^auto\.([a-z0-9]+):?/.exec(r.pid)?.[1];
    if (!fam || NOT_A_RULE.has(fam)) continue;
    const host = typeForPartition(r.partition);
    if (!host) continue;
    // §class 1/2 (ticket 120) — same identifiers, same tests, as the certified branch above.
    const idUnderTest = identifierUnderTest(fam, identifierOf(r.pid), r.exp);
    if (isParserNodeTypeIdentifier(idUnderTest, grammarsForHost(host))) { bumpNotARule('parser-node-type-as-identifier'); continue; }
    if (looksLikeGenericTypeParam(fam, idUnderTest, declaredTypeNames)) { bumpNotARule('generic-type-parameter-as-domain-type'); continue; }
    const id = `grain/${slug(r.partition)}/candidate-${slug(r.pid)}`.slice(0, 120);
    if (out.some(o => o.id === id)) continue;
    seen.push(id);
    // THE ROLE GROUP LEAVES THE SENTENCE AND STAYS IN THE EVIDENCE (ticket 109). The old statement said
    // "methods in `Slim/Routing` (role group r5) …" while the scope predicate written three lines below it is
    // `Slim/Routing/**` — the WHOLE directory. A sentence that names a narrower subject than the check
    // enforces is a sentence a future session is right to argue with. The cluster is where grain MEASURED the
    // row and it says so in the evidence; the rule speaks about the scope it is actually judged over.
    // §class 3 (ticket 120): the scope actually ENFORCED is now narrowed to the cluster's own files wherever
    // that can be said exactly (`cScope.ok`) — `glob` stays the host's own glob for the sentence, matching the
    // certified group-scoped convention's own wording convention above.
    const cScope = clusterScopeFor(r, host);
    const glob = cScope.glob;
    const devi = exemptMarkers(fam, r.deviants);
    const deviants = devi.kept;
    const markers = markerNote({ names: devi.names, exempted: r.deviants.length - deviants.length });
    // AN ABSENCE IS NOT A FORBIDDANCE (ticket 115). ORIGIN decides, not a number: a sub-gate row sits below
    // grain's own certification bound by construction, so a `false` majority in a class that spells "does not
    // use X" says only that most things here happen not to use it today — and the minority that does is
    // routinely the point of the code. Such a row is kept, in full, with its counts, as an OBSERVATION: worded
    // as one, shipped as prose so no drill can promote it, and held at `draft` with its own reason. The same
    // class in the `true` direction, and a `false` direction grain CERTIFIED (a real "this partition never uses
    // X"), are untouched.
    const absence = isAbsenceRow(r);
    const statement = absence
      ? `${r.ne} of ${r.ne + deviants.length} ${unitOne(r.kind)}s under \`${glob}\` do not ${describeRow(r.pid, r.exp)} — an absence, not a rule.`
      : obligationSentence({ unit: unitOne(r.kind), phrase: describeRow(r.pid, r.exp), prohibited: r.exp === 'false', where: glob, which: cScope.which });
    const provenance = `share ${r.share.toFixed(3)} · practised in ${r.ne} of ${r.ne + deviants.length} ${r.kind}s · ${deviants.length} sites do not · ${r.bits.toFixed(1)} bits · BELOW grain's certification bound (${LAMBDA_BOUND}) and above the repository's own two-thirds supermajority · asOf ${asOf}`;
    const evidenceLine = `${holdsPhrase(r.ne, deviants.length, `${unitOne(r.kind)}s`)} — a rule with a backlog, not a clean record · applies to ${scopeInWords(glob, cScope.which)} · below grain's own certification bound (${LAMBDA_BOUND}), above the repository's own two-thirds supermajority, so grain proposes it and does not assert it · share ${r.share.toFixed(3)} · ${r.bits.toFixed(1)} bits · measured ${r.role !== null ? `within one role cluster (r${r.role}) of` : 'over'} \`${r.partition}\` at ${asOf}${labelHostingNote(host, r.partition)}${markers}`;
    // §class 3: `cScope.ok === false` means no exact scope for the cluster could be stated — no check is ever
    // rendered for such a row, whatever the family would otherwise support, so nothing can later promote it.
    const check = !absence && cScope.ok && renderableDirection(fam, r.exp, r.kind, r.role !== null ? 'group' : 'partition')
      ? renderCheck({ enumerator: fam, argument: identifierOf(r.pid), expected: r.exp, kind: r.kind, provenance: `${statement}\n${provenance}` })
      : null;
    const proseReason2 = check
      ? null
      : !cScope.ok
        ? WHY_PROSE._clusterNarrower
        : absence
          ? WHY_PROSE._absence
          : (BOOLEAN_CLASS.has(fam) || fam === 'nameshape' ? WHY_PROSE._scopeMismatch : (WHY_PROSE[fam] || `no template renders the \`${fam}\` class`));
    if (!check) {
      if (!cScope.ok) skipped.clusterNarrowerThanScope++;
      else if (absence) skipped.absence++;
      else { skipped.prose++; skipped.byClass[fam] = (skipped.byClass[fam] || 0) + 1; }
    }
    out.push({
      id, origin: 'sub-gate-lattice', host: host.id, evidenceLine, provenance, reviewBy,
      // See the certified-convention branch above (ticket 106) — same fix, same reason.
      name: statement, holds: holdsPhrase(r.ne, deviants.length, `${unitOne(r.kind)}s`),
      description: `${statement} It already ${holdsPhrase(r.ne, deviants.length, `${unitOne(r.kind)}s`)}.`,
      scope: cScope.pred, check,
      whyProse: proseReason2,
      content: check ? null : subGateMd({ ...r, deviants }, statement, evidenceLine, proseReason2, absence),
      drills: { satisfies: [], violates: deviants.map(d => ({ rel: d.split('#')[0], name: d.split('#')[1] })) },
      enumerator: fam, argument: identifierOf(r.pid), expected: r.exp, kind: r.kind,
      // sub-gate rows have no CONFORMING exemplar of their own — only `deviants` (sites that do NOT follow the
      // candidate) — so `exemplars` (a "copy this" list, never a "avoid this" one) stays empty here, unlike a
      // certified convention above; the charter renderer reads absence as "not yet a copy-worthy pattern".
      partition: r.partition, share: r.share ?? null, n: r.ne ?? null, deviating: deviants.length,
      exemplars: [],
      // Pre-set, and `promoteEnforceableAspects` keeps whatever reason an aspect already carries: verification
      // is where a status is EARNED, and this row is not eligible to earn one at all.
      ...(absence ? { direction: 'absence', draftReason: 'absence-not-forbiddance' } : {}),
      ...(!absence && !cScope.ok ? { draftReason: 'cluster-narrower-than-scope' } : {}),
    });
  }

  // attach every draft to the type it came from, so nothing is orphaned in the graph
  for (const a of active) a.aspectIds = out.filter(o => o.host === a.id).map(o => o.id);
  // (opts is read above for the sub-gate reading cap)
  return { aspects: out, skipped };
}
