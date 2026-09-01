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
import { Parser, Language } from './vendor/web-tree-sitter/web-tree-sitter.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { basename, dirname, extname, join as pjoin, normalize as pnormalize } from 'node:path/posix'; // repo-relative paths are POSIX everywhere (model keys, git output, regexes) — also on Windows
import { GRAMMAR_DIR, EXT2GRAMMAR, EXT_ALT, CFG, SUP, TOPK, EXCL, MINE_EXCL, NCAP, HARD_EXCL } from './config.mjs';
import { relFactsFor, buildEdges, moduleGraph, moduleOf, refineModOf, compactDecls, hydrateTable, tableFrom, makeEdgeResolver, parseJsonc, relSupported } from './relations.mjs';

const S = '\u0001';      // cell-key separator (was a literal SOH byte in the prototype)
const UNSEEN = '\u0000'; // "value never observed" sentinel for the smoothed-count lookup (was a literal NUL byte)

export const toPosix = p => sep === '/' ? p : p.split(sep).join('/');
export const CODE_RE = new RegExp('(' + Object.keys(EXT2GRAMMAR).map(e => '\\' + e).join('|') + ')$');

// ===== GENERIC BINDING: derived from the grammar's node-types.json — no per-language code =====
const bindings = {};
export function bindingFor(gname) {
  if (bindings[gname]) return bindings[gname];
  const nt = JSON.parse(readFileSync(join(GRAMMAR_DIR, `tree-sitter-${gname}.node-types.json`), 'utf8'));
  const b = { scope: new Set(), loosebody: new Set(), imp: new Set(), deco: new Set(), decoBare: new Set(), keyField: new Set(), nodeTypes: new Set(nt.map(n => n.type)),
    // the ANONYMOUS half of nodeTypes: node-types.json marks every entry `named: true|false`, and an unnamed entry's
    // `.type` is the literal keyword or punctuation string it stands for (`public`, `static`, `{`). Extraction is
    // otherwise entirely `namedChildren`-based, so this is the only way a keyword token is visible at all (§auto.mods)
    anonTypes: new Set(nt.filter(n => n.named === false).map(n => n.type)),
    heritageRe: /heritage|extends|implements|superclass|super_interfaces|base_|superclasses|argument_list|interface_clause|delegation_specifier|inheritance_specifier|trait_bounds/,
    // two narrower refinements of heritageRe, for CLASSIFYING (never for finding) a heritage identifier as
    // inheritance-of-a-superclass or conformance-to-an-interface (§033) — read off the SAME structural node-type-name
    // vocabulary heritageRe/TYPE_LIKE_RE already use, never the language's identity. Verified per-grammar against each
    // shipped node-types.json: PHP's `base_clause`/`class_interface_clause`, Java/Groovy's `superclass`/`super_interfaces`
    // (plus `extends_interfaces`, an interface extending interfaces — still the `extends` keyword), and TS/TSX's
    // `extends_clause`/`extends_type_clause`/`implements_clause` are genuinely two distinct node types apiece.
    // Deliberately excluded: C#'s `base_list` (one undifferentiated list for the base class AND every implemented
    // interface — no syntactic marker at all) and Kotlin/Rust/Scala/Solidity's single shared heritage clause. Where
    // neither regex matches, the relationship is left unclassified and verbalize/deviationPhrase fall back to their
    // pre-existing "extends" wording — never a guess (§033 test: Go/Rust/Python byte-identical).
    extendsClauseRe: /^(?:superclass|extends_interfaces|base_clause|base_class_clause|extends_clause|extends_type_clause)$/,
    implementsClauseRe: /^(?:super_interfaces|class_interface_clause|implements_clause)$/,
    // a generic/template ARGUMENT list nested inside a heritage node (C# `type_argument_list`, Java/Kotlin/TS/Rust/Scala/Groovy
    // `type_arguments`, C++ `template_argument_list`): `AbstractValidator<TQuery>`'s `TQuery` is not a base type, it's a slot
    // filled with one — identifiers under this node are excluded from `sup`, never matched on a language's own type/class name
    genArgRe: /type_argument|template_argument/,
    // a "named slot" node type — one whose OWN fields (per node-types.json) declare BOTH a `name` and a `type`:
    // Go's `parameter_declaration`/`variadic_parameter_declaration`, TS's `required_parameter`/`optional_parameter`,
    // Scala 3's `name_and_type` (named-tuple elements), C#'s `tuple_element`, and every ordinary function-parameter
    // node type besides. Used by return-type extraction (§auto.returns, below) to tell a BINDING NAME apart from a
    // TYPE reference wherever one of these sits inside a return-type expression — nothing here is Go- or Scala-
    // specific, it is the same field-driven derivation `b.scope`/`b.imp`/`b.deco` above already use (§G26 bugfix)
    paramLike: new Set(),
    // per-node-type declared-RESULT field name (§auto.returns, §021): a callable node (one with BOTH a `body`
    // and a `parameters` field) may declare its result under a field of its own choosing — Go `result`, TS/PHP/
    // Rust/Scala `return_type`, Java/Groovy/C# `type` — and, discovered the same way, C# `method_declaration`'s
    // own `returns`. Never a 4th hardcoded name: the field is found by asking node-types.json which of a
    // callable's OWN fields (besides its structural ones — body/name/parameters/type_parameters/receiver) admits
    // a "type"-shaped child, using the same word-bounded technique TYPE_LIKE_RE/FUNC_LIKE_RE already use elsewhere
    // (RESULT_FIELD_RE, defined below with those). Verified across every shipped grammar: exactly one such field
    // per callable node type, never zero-or-ambiguous (§014/§021 log).
    retField: new Map(),
    // §014 — node types shaped like a MULTI-NAME value binding with no body of its own (Go's const_spec/var_spec).
    // See the derivation rule below, in the main field loop.
    namedValueSpec: new Set(),
    // §016 — a callable that states, in its own signature, the NAMED TYPE it is bound to: a callable-shaped node
    // (its own `body` AND its own `parameters`) that ALSO declares its own `receiver` field. Derived, never named:
    // across every shipped grammar exactly one node type qualifies (Go's `method_declaration`) — Ruby's `call` also
    // declares a `receiver`, but has neither a body nor a parameter list of its own and so is correctly excluded.
    // Every OTHER language states the same binding by NESTING (a method inside its class/trait/impl), which is
    // already visible to extraction; this is the one shape where the binding would otherwise be invisible.
    rcvCallable: new Set() };
  const RESULT_EXCLUDE = new Set(['body', 'name', 'parameters', 'type_parameters', 'receiver', 'attributes']);
  for (const n of nt) {
    const f = n.fields || {};
    // scope = a node with a body and a name — either a `name` field, or a `declarator` field that carries the name
    // (C/C++ function_definition: name lives in declarator → function_declarator → identifier). Still purely field-driven.
    if (f.body && (f.name || f.declarator)) b.scope.add(n.type);
    // grammars that name a node but keep its body as an unnamed child (Kotlin's class_declaration/function_declaration, …):
    // a named declaration/definition node is a scope when, at extraction time, one of its children is a body/block node
    else if (f.name && !f.body && /_(declaration|definition|decl|defn)$/.test(n.type) && /^(class|function|method|object|interface|trait|struct|enum|module|impl|protocol|extension|companion|constructor|fun|func|def|proc|record|namespace|abstract_class|singleton)(_|$)/.test(n.type)) { b.scope.add(n.type); b.loosebody.add(n.type); }
    if (/import|include|use_declaration|require/.test(n.type) && !n.type.startsWith('_')) b.imp.add(n.type);
    if (/decorator|annotation|attribute_list/.test(n.type)) b.deco.add(n.type);
    if (f.key) b.keyField.add(n.type);
    if (f.name && f.type) b.paramLike.add(n.type);
    if (f.body && f.parameters) { // callable-shaped: has its own body AND its own parameter list
      const cand = Object.keys(f).filter(k => !RESULT_EXCLUDE.has(k) && (f[k].types || []).some(t => RESULT_FIELD_RE.test(t.type)));
      if (cand.length === 1) b.retField.set(n.type, cand[0]); }
    // a MULTI-NAME value spec with no body (Go's `const_spec`/`var_spec`): one `name` field whose OWN cardinality
    // is `multiple` (it can bind SEVERAL identifiers — `a, b := f()` — to one shared `value`), never a scope
    // (no body field at all). This is the load-bearing, non-Go-specific test (§014): measured against every
    // shipped grammar's own name+value-no-body node (JS/TS `variable_declarator`, Python `keyword_argument`,
    // Rust `const_item`, PHP `enum_case`, …) — every one of those binds exactly ONE name; only Go's const/var
    // spec declares `name.multiple: true`, so this fires there and nowhere else, without naming Go.
    if (f.name && f.name.multiple && f.value && !f.body) b.namedValueSpec.add(n.type);
    if (f.body && f.parameters && f.receiver) b.rcvCallable.add(n.type); }
  // §018 phase 2 — an UNPARSED TOKEN REGION and the CALL that consists of one, both read off node-types.json:
  //   · a token region is a NAMED node type with no fields of its own whose own declared children include ITSELF
  //     — a nested, structureless run of tokens the grammar deliberately declined to analyse (Rust `token_tree`);
  //   · a macro-shaped call is a node type that is not one of those and whose EVERY declared non-field child is.
  // Measured against all 23 shipped node-types.json: `macroCall` is non-empty for exactly one grammar and names
  // exactly one node type there, so the other 22 grammars get no new behaviour whatsoever. No grammar, language
  // or macro is named anywhere — the same field-driven derivation `b.scope`/`b.namedValueSpec` already use.
  const tokRegion = new Set(nt.filter(n => n.named !== false && n.fields && !Object.keys(n.fields).length
    && n.children && n.children.multiple && (n.children.types || []).some(t => t.type === n.type)).map(n => n.type));
  b.tokenRegion = tokRegion;
  b.macroCall = new Set(nt.filter(n => n.named !== false && !tokRegion.has(n.type) && n.children
    && (n.children.types || []).length && (n.children.types || []).every(t => tokRegion.has(t.type))).map(n => n.type));
  // the grammar's own KEYWORD vocabulary: the word-shaped half of anonTypes (`pub`, `struct`, `fn`), as opposed
  // to its punctuation (`{`, `;`, `=>`, `macro_rules!`). Every declaration in every shipped grammar is introduced
  // by one of these, so a token region whose text carries none of them cannot spell one — the pre-filter in
  // extractScopes below, which halves the re-parse cost without losing a single name anywhere on the corpus.
  const kw = [...b.anonTypes].filter(t => /^[A-Za-z_]\w*$/.test(t));
  b.kwRe = kw.length ? new RegExp('\\b(?:' + kw.join('|') + ')\\b') : null;
  // §043 — a SIGIL-LESS decoration, derived instead of named. The `/decorator|annotation|attribute_list/` match
  // above reads a node-type NAME; some grammars mark the same construct structurally instead, with a node type
  // whose name says nothing (Solidity's `modifier_invocation` — `onlyOwner`, `nonReentrant`: the language's
  // decorator equivalent, and the one that carries its access-control meaning). Read off node-types.json: a node
  // type is decoration-shaped when it is NAMED, declares no fields of its own, is listed among some SCOPE node's
  // own non-field children, is not already read as heritage (`b.heritageRe`), and its OWN declared children
  // include BOTH a name-shaped type and a call/argument-shaped one — "apply this named thing, with arguments,
  // to this declaration". That last conjunction is what carries the rule: it admits Solidity's
  // `modifier_invocation` (`[call_argument, identifier]`) while rejecting every neighbour that shares the same
  // position — a heritage list (names, no arguments: C#'s `base_list`, PHP's `base_clause`), a bare keyword
  // (Rust's `visibility_modifier`, Solidity's own `virtual`/`visibility`), a type constraint (C#'s
  // `type_parameter_constraints_clause`), and an argument list with nothing named (C#'s `constructor_initializer`,
  // C/C++'s `attribute_specifier`). Measured against all 23 shipped node-types.json: this adds exactly ONE node
  // type to exactly ONE grammar and nothing whatsoever to the other 22, so no other language's decorations move.
  // No modifier, language or grammar is named anywhere — the same derivation `b.macroCall` above already uses.
  const byType = new Map(nt.map(n => [n.type, n]));
  for (const s of b.scope) { const sn = byType.get(s); if (!sn || !sn.children) continue;
    for (const t of (sn.children.types || [])) { const c = byType.get(t.type);
      if (!c || c.named === false || b.deco.has(c.type) || b.heritageRe.test(c.type)) continue;
      if (c.fields && Object.keys(c.fields).length) continue;
      const kids = (c.children && c.children.types || []).map(x => x.type);
      if (kids.some(k => DECO_NAME_RE.test(k)) && kids.some(k => DECO_ARG_RE.test(k))) { b.deco.add(c.type); b.decoBare.add(c.type); } } }
  // a grammar that declares no name+body scope at all (JSON/YAML/TOML): its files carry no name+body units to
  // mine, only a file-level scope and the raw values it names (§J7.2) — derived, not a name list: 0 for the three
  // data grammars, >=1 for every one of the 19 shipped code grammars
  b.data = b.scope.size === 0;
  b.name = gname; bindings[gname] = b; return b; }
const parsers = {}; let _init = false;
async function parserForGrammar(g) {
  if (!_init) { await Parser.init(); _init = true; }
  if (!parsers[g]) { const lang = await Language.load(join(GRAMMAR_DIR, `tree-sitter-${g}.wasm`)); const p = new Parser(); p.setLanguage(lang); parsers[g] = p; p._g = g; }
  return parsers[g]; }
export async function getParser(ext) {
  const g = EXT2GRAMMAR[ext];
  if (!g) throw new Error(`no grammar for extension "${ext}"`);
  return parserForGrammar(g); }
// §040 — how many places a grammar gave up on: ERROR nodes plus MISSING ones, because a grammar records a failure
// as either (measured: C leaves 4 ERRORs on `class LEVELDB_EXPORT Comparator {`, C++ leaves 0 ERRORs and 1
// MISSING). Descends only into subtrees that carry a failure, so a clean file costs one check at the root.
const parseErrors = tree => { let n = 0; const st = [tree.rootNode];
  while (st.length) { const x = st.pop(); if (x.isError || x.isMissing) n++; if (x.hasError) for (const c of x.children) st.push(c); }
  return n; };
// §040 — parse `src`, choosing between the extension's declared grammar and the second grammar that extension may
// denote (`EXT_ALT`, config.mjs — one entry, `.h`). THE GRAMMAR DECIDES, the same instinct as §018 phase 2: ask
// both and keep the one that actually parsed the bytes, rather than writing down a rule about which projects use
// `.h` for what. Three properties, in order of how load-bearing they are:
//   · the DECLARED mapping wins ties. A genuine C header parses cleanly under both (C++ is very nearly a
//     syntactic superset), so a tie must never migrate a real C project onto C++ node types — every predicate
//     derived from node-types.json would change under it. Measured on redis and curl: 83 and 34 headers tie, and
//     all of them stay C.
//   · no new tuned constant. "Strictly fewer failures" is a comparison between two parses of the same bytes, not
//     a threshold, a ratio or a minimum.
//   · a clean parse under the declared grammar never loads the alternative at all, so the second parse is paid
//     only on files the declared grammar already failed — 9 of leveldb's 56 headers skip it, 208 of redis's 312.
// Everything that parses a file goes through here, HISTORY INCLUDED: a `.h` whose HEAD content reads as C++ must
// read as C++ in its old blobs too, or every scope in it looks newborn at every commit. This does not weaken
// §13.2 (language from the historical PATH, never sniffed from content): the path still decides, and picks the
// same two candidates for every version of the file — only which of the two spelled the bytes is read off them.
export async function parseFile(ext, src) {
  const p = await getParser(ext); const tree = p.parse(src);
  const alt = EXT_ALT[ext];
  if (!alt || !tree.rootNode.hasError) return { p, tree };
  const q = await parserForGrammar(alt); const t2 = q.parse(src);
  if (parseErrors(t2) < parseErrors(tree)) { tree.delete(); return { p: q, tree: t2 }; }
  t2.delete(); return { p, tree }; }
// §018 phase 2: a SECOND parser per grammar, used only to re-parse a macro invocation's token region while the
// file's own tree is still being walked. A dedicated instance, not `parsers[g]`, so that re-entrant parse can
// never interact with the outer walk in any way — one extra object per grammar, created on first macro body seen.
const macroParsers = {};
function macroParser(b) { const p = parsers[b.name]; if (!p) return null;
  return macroParsers[b.name] ||= (() => { const q = new Parser(); q.setLanguage(p.language); return q; })(); }
// no-git fallback walk ONLY — in git mode the universe is the HEAD tree and gitignore already held (see config EXCL note)
export function* walkFiles(dir, root) {
  let es; try { es = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) { const full = join(dir, e.name); const rel = toPosix(relative(root, full));
    if (EXCL.test(rel + (e.isDirectory() ? '/' : ''))) continue;
    if (e.isDirectory()) yield* walkFiles(full, root);
    else if (CODE_RE.test(e.name) && !MINE_EXCL.test(e.name) && EXT2GRAMMAR[extname(e.name)]) yield rel; } }
export const tokenize = n => (n || '').replace(/[^a-zA-Z0-9]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/\s+/).filter(t => t.length > 1);
// E1 name morphology: identifier → char-class string (`U` upper run, `a` lower/digit run, separators literal, else `?`), runs of one
// char folded, then CASING UNITS folded: `Ua` (PascalCase word), `_a`/`_U` (snake), `-a` (kebab), `.a` (dotted). A single word and
// many words are the SAME style — `Crlf` and `BaseDto` are both `(Ua)+`, `getUser` and `getUserName` both `a(Ua)+` — measured on
// the corpus, a word-count-sensitive shape flagged every one-word class name as a deviation from "names like `BaseDto`".
const SHAPE_UNITS = new Set(['Ua', '_a', '_U', '-a', '-U', '.a', '.U', '$a', '$U']);
export function nameShape(n) { if (!n) return '?';
  const r = n.replace(/[A-Z]+/g, 'U').replace(/[a-z0-9]+/g, 'a').replace(/[^Ua_\-$.]/g, '?').replace(/(.)\1+/g, '($1)+');
  const toks = r.match(/\([^)]+\)\+|./g) || []; const out = [];
  for (let i = 0; i < toks.length; i++) { const a = toks[i], b = toks[i + 1];
    if (a.length === 1 && b && b.length === 1 && SHAPE_UNITS.has(a + b)) { const unit = '(' + a + b + ')+'; out.push(unit); i++;
      while (toks[i + 1] === a && toks[i + 2] === b) i += 2; } // swallow the run
    else out.push(a); }
  return out.join(''); }
function resolveImport(spec, rel) { if (!spec.startsWith('.')) return spec;
  const ps = (dirname(rel) + '/' + spec).split('/'); const o = [];
  for (const p of ps) { if (p === '.' || p === '') continue; if (p === '..') o.pop(); else o.push(p); }
  return '~/' + o.join('/').replace(/\.[a-z]+$/, ''); }
export const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ===== EXTRACTION (binding-driven, language-free) =====
// follow `declarator` fields down to the leaf (C/C++: function_definition → function_declarator → identifier)
function declaratorChain(n) { const out = []; let d = n.childForFieldName('declarator'); let g = 0; while (d && g++ < 8) { out.push(d); d = d.childForFieldName('declarator'); } return out; }
const looseBody = n => n.namedChildren.find(c => /body|block/.test(c.type) && !/type|annotation|parameter/.test(c.type)) || null;
function scopeName(ch) { const n = ch.childForFieldName('name'); if (n) return n.text;
  const chain = declaratorChain(ch); const leaf = chain[chain.length - 1];
  if (leaf && /identifier/.test(leaf.type) && !leaf.text.includes('\n')) return leaf.text;
  return '<anon>'; }
// word-bounded (never raw-substring) node-TYPE-NAME matchers: a node type's `_`-separated segments must contain the
// whole word, so `struct` matches the segment `struct` in `struct_declaration` but not the letters s-t-r-u-c-t
// buried inside `constructor_declaration` — a raw substring test misclassified every constructor as `typeLike`
const wordBounded = words => new RegExp('(?:^|_)(?:' + words.join('|') + ')(?:_|$)');
const TYPE_LIKE_RE = wordBounded(['class', 'struct', 'record', 'enum', 'interface', 'trait', 'protocol', 'object_declaration', 'impl_item', 'type_declaration', 'companion', 'singleton', 'union', 'contract']);
const FUNC_LIKE_RE = wordBounded(['function', 'method', 'lambda', 'closure', 'arrow', 'constructor', 'destructor']);
// §bindingFor's sigil-less-decoration derivation (§043): the two halves a decoration's OWN declared children must
// show — something it NAMES, and an application of that name to ARGUMENTS. Same word-bounded node-TYPE-NAME
// technique as the two above; neither is ever matched against a language's own identifiers.
const DECO_NAME_RE = wordBounded(['identifier', 'name']);
const DECO_ARG_RE = wordBounded(['call', 'argument', 'arguments', 'invocation']);
// §bindingFor's `b.retField`: a callable's declared-result field is whichever of its OWN fields admits a child
// node whose type NAMES "type" as a whole word segment (`type`, `_simple_type`, `type_annotation`, `bottom_type`,
// `type_identifier`, …) — matches Go's `result` (declares `_simple_type`), every `return_type` field, Java/Groovy/
// C#'s `type`, and C#'s own `returns` (declares `type`), while correctly rejecting every OTHER leftover field on a
// callable node measured across the shipped grammars (`dimensions`, `operator`, `reference_modifier`,
// `static_modifier`, `interfaces`, `object`, `arguments`, a lone unparenthesized arrow `parameter`) — none of
// those fields' declared child types contain the word "type" (§014/§021 log).
const RESULT_FIELD_RE = wordBounded(['type']);
// the identifier node types a declared TYPE reference resolves to, in document order so the OUTER name wins
// (`Stack[T]` -> `Stack`, `Promise<void>` -> `Promise`). Hoisted to module scope: return-type extraction (§021)
// and receiver extraction (§016) must resolve a type reference the same way, or one of them will read a generic
// instantiation where the other reads the type.
const TYPE_REF_ID_TYPES = ['type_identifier', 'predefined_type', 'primitive_type', 'builtin_type', 'scoped_type_identifier', 'qualified_type', 'attribute', 'dotted_name', 'scoped_identifier', 'identifier'];
// the string-literal node types, shared by the lexical layer's quote-style scan and the value concordance (§J3.1) —
// one list, so "what counts as a string in this repository" cannot drift between the two. `bare_key`/`quoted_key`/
// `dotted_key` are TOML's data-grammar KEY types (JSON/YAML have no key-shaped node of their own — a JSON key IS a
// `string`, a YAML key IS a scalar — so only TOML needs its key types listed here; JSON/YAML keys are told apart
// from values by `isKeyNode` below, via `b.keyField`, not by node type). `key`/`value` are `.properties`' own two
// node types (§006) — unlike JSON/YAML/TOML, tree-sitter-properties declares neither a `key` FIELD on its
// `property` node nor a dedicated `*_key` type name, just a plain child literally typed `key`; without these two
// entries the scan never visits a `.properties` file's scalars at all (`b.data` alone gets you nothing to collect).
const STR_TYPES = ['string', 'string_literal', 'interpreted_string_literal', 'encapsed_string', 'raw_string',
  'string_scalar', 'double_quote_scalar', 'single_quote_scalar', 'block_scalar',
  'bare_key', 'quoted_key', 'dotted_key', 'key', 'value'];
// a node TYPE NAME containing the whole word "key" (TOML's bare_key/quoted_key/dotted_key, `.properties`' own
// `key`) — the type-name half of key detection; the field half (JSON `pair.key`, YAML
// `block_mapping_pair.key`/`flow_pair.key`) is `b.keyField` above. `.properties`' `property` node has NEITHER a
// `key` field nor a `bare_key`-style type name for its key child — it is told apart from its `value` sibling
// purely by KEY_LIKE_RE matching the child's own literal type name "key" (`keyNodeOf`'s namedChildren fallback).
const KEY_LIKE_RE = wordBounded(['key']);
// does node `p` carry an identifiable key CHILD? (JSON/YAML: the `key` field; TOML: a `*_key`-typed child of `pair`)
function keyNodeOf(p, b) { if (!p) return null;
  if (b.keyField.has(p.type)) return p.childForFieldName('key');
  return (p.namedChildren || []).find(c => KEY_LIKE_RE.test(c.type)) || null; }
// is node `n` ITSELF the key (not the value) of some ancestor pair? Climbs through "transparent" single-named-child
// wrapper nodes — needed for YAML's real parse chain, e.g. `string_scalar -> plain_scalar -> flow_node<key> ->
// block_mapping_pair` — a plain single-parent check misclassifies every YAML key. Depth cap 4 and the
// namedChildCount!==1 guard are both load-bearing, verified against real parses of all three grammars.
function isKeyNode(n, b) { let cur = n;
  for (let d = 0; d < 4 && cur.parent; d++) { const p = cur.parent; const kn = keyNodeOf(p, b);
    // `.id`, not `===`: web-tree-sitter hands back a FRESH JS wrapper object from every accessor call, even for the
    // same underlying node — two references to the identical node fail a `===` check (confirmed empirically: this
    // codebase's own node-identity comparisons elsewhere, e.g. `c2.id === bodyN.id` above, already work around it)
    if (kn) return kn.id === cur.id;
    if ((p.namedChildCount || 0) !== 1) return false; // p is not a transparent single-child wrapper — stop
    cur = p; }
  return false; }
// a key node's own text, quotes stripped the same way a data-grammar value's text is (§J7.2, core.mjs ~428) —
// one stripping rule for both halves of a pair, so a key and a value never disagree on what "the text" means.
const keyText = n => n.text.replace(/^["'`]|["'`]$/g, '');
// §J7.3: the key-path identity of a DATA container (`b.data` only) — `$.a.b` built by climbing from `node` through
// its ancestors, collecting the key text of every pair `node` (or an intermediate ancestor on the way up) sits on
// the VALUE side of. An array contributes no segment of its own: its elements share the array's own path, which is
// exactly what lets `steps: [...]`'s N object elements collapse into ONE container across files.
function keyPathOf(node, b) { const segs = []; let cur = node;
  while (cur.parent && segs.length < 8) { const p = cur.parent; const kn = keyNodeOf(p, b);
    if (kn && kn.id !== cur.id) segs.push(keyText(kn)); // kn.id !== cur.id: don't re-add the key as its own path segment
    cur = p; }
  return '$' + segs.reverse().map(s => '.' + s).join(''); }
// value concordance (§J3.1). ENUM_LIKE_RE is narrower than TYPE_LIKE_RE on purpose: only an enum DECLARATION
// (which additionally must have a body) enumerates values; `enum_body`/`enum_assignment` match the word too and are
// excluded by the body requirement alone. ENUM_MEMBER_RE catches the member shapes that carry no `name` field of
// their own — TypeScript's bare `property_identifier` leaves under `enum_body` are the load-bearing case, and the
// name-field rule never sees them. CONTAINER_RE names the syntactic groupings whose members are siblings.
const ENUM_LIKE_RE = wordBounded(['enum']);
const ENUM_MEMBER_RE = wordBounded(['identifier', 'enumerator', 'enum_entry']);
const CONTAINER_RE = wordBounded(['switch', 'object', 'dictionary', 'array', 'enum', 'case', 'match']);
const VAL_CAP = 200;      // values kept per file (enum members first, then string literals)
const VAL_SCAN_CAP = 2000; // nodes examined per scan pass, as lexicalPreds caps its own string scan
const VALUE_INDEX_CAP = 20000; // repo-wide value index entries retained; the least-frequent go first
const VALUE_NORM_PLACES = 12; // places listed on one `kin:` value line, the same display cap the render lists carry
// a path's name before its first dot (`dispute.handler.ts` -> `dispute`), the pairing key for every same-stem
// companion rule in the engine: impliedOf's companion/groupKin evidence and missingLines' recipe/kin renders
const stem0 = rel => basename(rel).split('.')[0];
// a namespace/package/module STATEMENT names a location, not a unit of code (walked through, never itself a
// scope, and never counted as a "real" nested scope for its parent's type/method classification) — 'mod' is
// word-bounded via the shared wordBounded() helper, never a plain substring, so Ruby's real type-like `module`
// declaration is untouched (§G15b)
const MOD_LOCATION_RE = wordBounded(['mod']);
const isLocationNode = t => /namespace|package/.test(t) || MOD_LOCATION_RE.test(t);
// a function/arrow/lambda-shaped VALUE, for the assignment-side anonymous-function detector below — word-bounded
// alone is not sufficient (PHP's plain call node `function_call_expression` still matches the segment `function`);
// the detector additionally requires the value to have a real BODY, which a call node never does (§G16)
const FUNC_VALUE_RE = wordBounded(['function', 'arrow', 'lambda', 'func_literal', 'closure']);
// primary-constructor detection (a type's OWN header carries its constructor's parameters, C# 12 `class Foo(IBar bar)`
// / Kotlin `class Foo(val bar: Bar)` style): confirmed by scanning every shipped grammar's node-types.json for any
// TYPE_LIKE_RE node exposing one of these, not guessed —
//  · C# class_declaration/struct_declaration/record_declaration: the ONLY type-like nodes, in any shipped grammar,
//    that admit a bare positional `parameter_list` child (neither declares a `parameters` field — only `body`/`name`
//    are fields) sitting beside `base_list`/`declaration_list`. Distinct from `type_parameter_list` (C# generics
//    `<T>`) — a wholly different node-type string; the scan found no other type-like node anywhere exposing
//    `parameter_list` as a child or field.
//  · Kotlin: `primary_constructor`, an explicit dedicated node type, a direct child of `class_declaration`, distinct
//    from Kotlin's own `type_parameters` node for `<T>`.
//  · Scala: `class_parameters`, an actual NAMED FIELD of `class_definition`/`trait_definition`/`enum_definition`/
//    `full_enum_case` (fires identically for `case class Foo(x: Int)` and plain `class Foo(x: Int)` — `case` is a
//    modifier, not a different node type), distinct from Scala's own `type_parameters` field for `[T]`.
//  · Java and Groovy `record_declaration` alone (never plain `class_declaration`/`interface_declaration`, which
//    declare no such field): a `parameters` field mapping to `formal_parameters` — `record Foo(int x) {}`'s header.
// No other shipped grammar/node type has any of these — confirmed by scanning every grammar's node-types.json for a
// type-like node exposing `parameter_list`/`class_parameters`/a `parameters` field, not assumed. (One unrelated
// pre-existing false-positive risk was checked and is clear: Ruby's `singleton_method` also has a `parameters` field,
// but its node type is `singleton_method`, never `record_declaration`, so the Java/Groovy check below can't fire on it.)
const PRIMARY_CTOR_CHILD_TYPES = new Set(['parameter_list', 'primary_constructor']);
const hasPrimaryCtor = ch => ch.namedChildren.some(c => PRIMARY_CTOR_CHILD_TYPES.has(c.type)) || !!ch.childForFieldName('class_parameters') ||
  (ch.type === 'record_declaration' && !!ch.childForFieldName('parameters'));
// classic (body) constructor: an existing member whose node type contains the WORD `constructor` (same word-boundary
// technique as FUNC_LIKE_RE, narrowed to just this word) — a destructor-only type has no classic constructor either
const CTOR_LIKE_RE = wordBounded(['constructor']);
// field-like MEMBER declarations, the one classification `auto.memberorder` needs that no existing regex covers
// (`ctor` is CTOR_LIKE_RE, `method` is FUNC_LIKE_RE). Verified against the shipped node-types.json of java
// (field_declaration), c_sharp (field_declaration/property_declaration/event_field_declaration), typescript
// (public_field_definition), kotlin (property_declaration), php (property_declaration/const_declaration) and go
// (field_declaration/const_declaration) — the same word-boundary technique, over NODE-TYPE names only.
const FIELD_LIKE_RE = wordBounded(['field', 'property', 'variable_declarator', 'const_declaration']);
// ===== DECLARATION MODIFIERS (§auto.mods) =====
// An honest description of what this is: a FIXED vocabulary of nine English words — the same category of list as
// TYPE_LIKE_RE/FUNC_LIKE_RE/CTOR_LIKE_RE, i.e. one written over node-type names, never over language or framework
// names — FILTERED by what each grammar actually declares as an anonymous token (`b.anonTypes`). It is NOT derived
// from the grammar in any stronger sense: a `modifiers` node's `children.types` in node-types.json enumerates only
// its NAMED children and never the anonymous keywords, so the grammar can subtract from this list but not supply it.
// Measured coverage of the nine: java 6, c_sharp 7, typescript 8, kotlin 6, scala 6, php 6, cpp 6, rust 2, python 1, go 0.
const MODIFIER_KEYWORD_RE = wordBounded(['public', 'private', 'protected', 'static', 'async', 'export', 'abstract', 'final', 'override']);
// where the keyword actually SITS differs per grammar and is never uniform: python/typescript hang `async`/`static`
// straight off the declaration, java wraps them in one `modifiers` node, c_sharp repeats a `modifier` node per word,
// php uses `visibility_modifier`/`static_modifier`, and kotlin nests `modifiers > visibility_modifier > private` —
// three levels down. So the scan descends through modifier HOLDER nodes (and nothing else, which is what keeps it
// out of the body) rather than reading one fixed depth.
const MODIFIER_HOLDER_RE = wordBounded(['modifier', 'modifiers']);
function modifiersOf(node, b) {
  const found = new Set();
  const scan = (n, depth) => { if (depth > 3) return;
    for (const c of n.children) {
      if (b.anonTypes.has(c.type)) { if (MODIFIER_KEYWORD_RE.test(c.type)) found.add(c.type); }
      else if (MODIFIER_HOLDER_RE.test(c.type)) scan(c, depth + 1); } };
  scan(node, 0);
  // ONE categorical string, never an array — mine() needs a single comparable value per pid. The empty case is the
  // literal 'none': mine()'s vacuity gate rejects ['other','none','mixed','?'] by name and would let a bare '' through,
  // making a ubiquitous vacuous fact on every grammar where this feature never fires (go matches none of the nine).
  return found.size ? [...found].sort().join(',') : 'none'; }
// ===== MEMBER LAYOUT (§auto.memberorder) =====
// COMPRESSION GRAMMAR (exact — the ticket's own `f+c m+` sketch left the separator convention open):
//   letter   := 'f' (FIELD_LIKE_RE) | 'c' (CTOR_LIKE_RE) | 'm' (FUNC_LIKE_RE), tested in THAT order because the
//               three are loosely worded enough to overlap and `field` is the most specific of them
//   sequence := the classified DIRECT named children of the type body, in source order; a child matching none of
//               the three is skipped entirely and leaves no trace
//   run      := a maximal sub-sequence of identical letters
//   token    := <letter> for a run of exactly 1 | <letter>'+' for a run of 2 or more ('+' is "two or more", NEVER a count)
//   pattern  := tokens joined by exactly ONE space          e.g.  f f c m m  ->  'f+ c m+'
//   fewer than two runs -> 'none'; more than MEMBERORDER_RUNS runs -> the first MEMBERORDER_RUNS tokens plus '…'
// A body holding only ONE category has no member ORDER to speak of — 'm+' would read as "types here order their
// members m+" while claiming nothing but "these types hold only methods", the same composition-not-choice vacuity
// STRUCT_PID exists to suppress. It collapses to 'none' and is dropped by mine()'s vacuity gate.
// The string parses back to its run structure uniquely (split on ' '; a trailing '+' means "run >= 2"). Exact run
// LENGTHS are discarded on purpose: they are what would blow the alphabet up, and mine()'s λ bound carries K = |V|+1
// directly in its denominator, so a large alphabet silences the fact outright.
const MEMBERORDER_RUNS = 6;
function memberOrder(bodyN) {
  const seq = [];
  for (const c of bodyN.namedChildren) {
    const l = FIELD_LIKE_RE.test(c.type) ? 'f' : CTOR_LIKE_RE.test(c.type) ? 'c' : FUNC_LIKE_RE.test(c.type) ? 'm' : null;
    if (l) seq.push(l); }
  const toks = []; for (let i = 0; i < seq.length;) { let j = i; while (j < seq.length && seq[j] === seq[i]) j++; toks.push(seq[i] + (j - i >= 2 ? '+' : '')); i = j; }
  if (toks.length < 2) return 'none';
  return toks.length > MEMBERORDER_RUNS ? toks.slice(0, MEMBERORDER_RUNS).join(' ') + ' …' : toks.join(' '); }
// the last token of a name, as a convention in its own right (`*Handler`, `*Service`, `*Repository`). Plain
// `tokenize`, NEVER `nameTokens`: nameTokens filters through PL_STOP, which holds exactly the suffix vocabulary this
// predicate is made of (model/service/controller/component/view/type/module/config) and would return the word BEFORE
// the suffix — the identical artefact J3.4 already found and fixed once in its own name comparison.
const nameSuffix = name => { const t = tokenize(name); return t.length >= 2 ? t[t.length - 1] : 'none'; };
// `_depth` is the macro-body recursion level (§018 phase 2, in the else-branch below), never passed by a caller.
export function extractScopes(rel, tree, b, grammar = null, _depth = 0) {
  const scopes = []; const imports = [];
  const isScope = n => b.scope.has(n.type);
  // iterative pre-order, left-to-right traversal (no call-stack frame per AST level — a recursive `walk` overflowed
  // the stack on a deeply left-nested `binary_expression`, one JS frame per operator): children are pushed in
  // REVERSE order so the first child pops first, preserving the exact visitation order `scopes` array order,
  // decoration attribution and the same-name ordinal disambiguation all depend on
  const pushKids = (node, stack) => { const kids = node.namedChildren; for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]); };
  // §016 — the type a callable declares itself bound to. The receiver is a list of `paramLike` NAMED SLOTS, so the
  // type is read off the slot's own `.type` field: taking the first identifier instead would record the receiver's
  // BINDING NAME (`c` in `func (c *Context) …`), the same name-vs-type confusion §G26 fixed for named returns.
  const ownerFor = ch => { if (!b.rcvCallable.has(ch.type)) return null;
    const rf = ch.childForFieldName('receiver');
    const slot = rf && rf.namedChildren.find(c2 => b.paramLike.has(c2.type));
    const tn = slot && slot.childForFieldName('type'); if (!tn) return null;
    const id = tn.descendantsOfType(TYPE_REF_ID_TYPES)[0] || tn;
    const t2 = id.text.replace(/^[*&]+/, '').replace(/<.*$/, '');
    return (t2 && t2.length <= 40) ? t2 : null; };
  const treeStack = []; pushKids(tree.rootNode, treeStack);
  while (treeStack.length) { const ch = treeStack.pop();
    if (ch.isError || ch.isMissing) continue; // a malformed node is skipped, never its ancestor (a class with one broken method keeps its other methods)
    if (b.imp.has(ch.type)) { // every string inside the import node (Go's grouped imports hold one per spec); else the first name-like child
      const strs = ch.descendantsOfType(['string', 'string_literal', 'interpreted_string_literal', 'raw_string_literal', 'system_lib_string']).map(n => n.text.replace(/^["'`<]|["'`>]$/g, '')).filter(Boolean);
      let tgts = strs.length ? [...new Set(strs)] : [];
      if (!tgts.length) { let tgt = ch.namedChildren.find(c => /dotted_name|scoped_identifier|qualified_name|namespace_name|identifier|package|use_list|use_clause/.test(c.type))?.text;
        if (tgt && /use_list|use_clause/.test(ch.namedChildren.find(c => c.text === tgt)?.type || '')) tgt = tgt.replace(/\s+/g, '').replace(/::\{.*$/, '');
        if (tgt) tgts = [tgt]; }
      for (const tgt of tgts) { const r = resolveImport(tgt, rel); if (!imports.includes(r)) imports.push(r); }
      // the children of an import node (import_specifier, named_imports …) are the SAME logical import — descending would
      // re-match /import/ and record every imported identifier as a module (measured: `files here import \`Command\``)
      if (!isScope(ch)) continue; }
    if (isScope(ch)) {
      if (isLocationNode(ch.type)) { pushKids(ch, treeStack); continue; } // a namespace/package/mod statement names a location, not a unit of code
      // a property accessor (C# `get`/`set`/`init`) is named by a keyword and belongs to its property — mined as methods, 40 accessors
      // certified "methods here are named a single lowercase word" and flagged every real method of the directory (measured on CleanArchitecture)
      if (/accessor/.test(ch.type)) { pushKids(ch, treeStack); continue; }
      // §040 — a DECLARATOR-NAMED scope (one the grammar names through a `declarator` field rather than a `name`
      // field) whose declarator chain declares NO `parameters` anywhere is not a callable: a callable's name and
      // its parameter list come from the same declarator, so a chain without one never spelled a function. Two
      // ways a grammar lands here, both told apart by the node's OWN `type` field:
      //   · that field holds a BODY-LESS type-declaring specifier — the shape a class declaration collapses into
      //     when an unparsed token sits between the keyword and the name (`class <token> Foo { … }`, an export or
      //     visibility macro). The grammar recovers `class <token>` as the "return type" and `Foo` as the
      //     "function name", so the REAL name is already in the declarator, where `scopeName` reads it, and the
      //     token is only ever the specifier's own name — which is never read. It is a type, not a method.
      //   · anything else — a range-for's loop variable, a definition whose name the grammar could not recover.
      //     Nothing here is a declaration this file can name, so record none of it and keep walking into it,
      //     exactly as a location node above does; whatever nests inside is still extracted on its own terms.
      // Confined to C/C++ by the grammars themselves: they are the only two shipped grammars that declare a
      // body-plus-declarator scope node at all, so no other language can move. No macro is named anywhere.
      let recoveredType = false;
      if (!ch.childForFieldName('name') && ch.childForFieldName('declarator')
        && !declaratorChain(ch).some(d => d.childForFieldName('parameters'))) {
        const tf = ch.childForFieldName('type');
        if (tf && TYPE_LIKE_RE.test(tf.type) && !tf.childForFieldName('body')) recoveredType = true;
        else { pushKids(ch, treeStack); continue; } }
      const name = scopeName(ch);
      const bodyN = ch.childForFieldName('body') || (b.loosebody.has(ch.type) ? looseBody(ch) : null);
      // a bodiless declaration (C# positional record, Kotlin data class, interface method signature, forward declaration) is
      // a scope for identity surfaces — name, decorations, supertypes, return type — but has no behaviour to mine
      const noBody = !bodyN;
      // kind by syntax category (class/struct/record/enum/interface/trait/object… ⇒ type) rather than by nesting alone: a
      // Python class with only fields and a TS interface are types, a JS function holding callbacks is still a method —
      // the container/leaf rule confused all three in every language of the corpus
      const typeLike = recoveredType || (TYPE_LIKE_RE.test(ch.type) && !/(?:^|_)expression(?:_|$)/.test(ch.type));
      const hasChildScope = bodyN ? bodyN.descendantsOfType([...b.scope]).some(d => !isLocationNode(d.type) && (d.childForFieldName('body') || (b.loosebody.has(d.type) && looseBody(d)))) : false;
      const kind = typeLike || (hasChildScope && !FUNC_LIKE_RE.test(ch.type)) ? 'type' : 'method';
      // constructor shape (types only): does the type declare its constructor's parameters in its OWN header
      // (`primary`, hasPrimaryCtor above) or as a nested classic member (`classic`, CTOR_LIKE_RE), both, or
      // neither — computed here (before the bodiless early-return below) so a bodiless primary-constructor
      // declaration (C# positional record `record Foo(int X);`) is not silently excluded from this fact
      const ctorShape = kind !== 'type' ? undefined : (() => {
        const hasPrimary = hasPrimaryCtor(ch);
        const hasClassic = bodyN ? bodyN.namedChildren.some(c => CTOR_LIKE_RE.test(c.type)) : false;
        return hasPrimary && hasClassic ? 'both' : hasPrimary ? 'primary' : hasClassic ? 'classic' : 'none'; })();
      // supKind (§033): a name's classification as 'ext' (genuine inheritance) or 'impl' (interface conformance),
      // wherever the grammar's own clause node type says so — the dedicated `superclasses` field (Python: no
      // interfaces, always inheritance-shaped) and heritageRe's generic `argument_list` match are never classified
      // by anything more specific than that, so their names stay 'ext' below, unchanged from before this fact existed.
      const sup = []; const supKind = {}; const sc = ch.childForFieldName('superclasses'); if (sc) for (const id of sc.descendantsOfType('identifier').concat(sc.descendantsOfType('attribute'))) { sup.push(id.text); supKind[id.text] = 'ext'; }
      for (const c2 of ch.namedChildren) if (b.heritageRe.test(c2.type) && !(bodyN && c2.id === bodyN.id)) for (const id of c2.descendantsOfType(['identifier', 'type_identifier', 'scoped_type_identifier', 'name', 'qualified_name', 'relative_name'])) {
        let anc = id.parent, inGenArg = false, hKind = null;
        while (anc && anc.id !== c2.id) { if (b.genArgRe.test(anc.type)) { inGenArg = true; break; } // `AbstractValidator<TQuery>`: TQuery sits under a type_argument_list — a slot, not a base type
          if (!hKind) { if (b.implementsClauseRe.test(anc.type)) hKind = 'impl'; else if (b.extendsClauseRe.test(anc.type)) hKind = 'ext'; }
          anc = anc.parent; }
        if (!inGenArg) { if (!hKind) hKind = b.implementsClauseRe.test(c2.type) ? 'impl' : b.extendsClauseRe.test(c2.type) ? 'ext' : null; // c2 itself IS the specific clause where there is no wrapper (PHP/Java/Groovy)
          const nm = id.type === 'qualified_name' || id.type === 'relative_name' ? id.text.split('\\').pop() : id.text; // PHP names its identifiers `name`/`qualified_name`; the FQCN's tail is the vocabulary an agent uses
          sup.push(nm); if (hKind && !(nm in supKind)) supKind[nm] = hKind; } }
      // decoration attribution: the stack of decoration siblings directly above this scope (any height, comments allowed in
      // between) plus decorations inside the scope's own pre-body subtree (Java/C# modifiers, parameter annotations). Never a
      // preceding member's stack (the walk stops at the first real sibling) and never anything inside the body.
      const decos = []; const decoLits = []; // string-literal ARGUMENTS of the decorations: routes, event names, DI tokens — the marker's meaning
      if (b.deco.size) { // linear: walk back over decoration/comment siblings (the stack), then scan the scope's own pre-body subtree
        const decoTypes = [...b.deco]; const limit = bodyN ? bodyN.startIndex : ch.endIndex;
        // the sigil travels with the name: `[Test]` (C#) and `@Test` (Java/Kotlin) are different tokens and render as written.
        // §043 — a decoration may also be written with NO sigil at all (Solidity's modifiers: `onlyOwner`), in which case
        // the whole text is a bare name, optionally applied to an argument list, and renders bare. Admitted ONLY for the
        // node types `b.decoBare` holds — the structurally-derived ones — because the node-type-NAME vocabulary that
        // fills the rest of `b.deco` matches only constructs every shipped grammar writes with a sigil, and reading
        // bare text for those swallows a modifier KEYWORD that happens to share the node type's name (measured: Kotlin's
        // `annotation` in `annotation class Foo` became a decoration called `annotation`). Anchored on the ENTIRE text
        // too, never a prefix, so a bare name followed by anything else is not a decoration either.
        const take = d => { const t = d.text.trimStart();
        const m = /^[@[]/.test(t) ? t.match(/^[@[]\s*([\w.]+)/) : b.decoBare.has(d.type) ? t.match(/^([A-Za-z_$][\w.$]*)\s*(?:\(|$)/) : null;
        if (m) { decos.push(t[0] === '[' ? '[' + m[1] + ']' : m[1]);
        if (decoLits.length < 12) for (const lm of t.matchAll(/["'`]([^"'`\n]{1,60})["'`]/g)) decoLits.push(lm[1]); } };
        let sib = ch.previousNamedSibling;
        while (sib && (b.deco.has(sib.type) || sib.type === 'comment')) { if (b.deco.has(sib.type)) take(sib); sib = sib.previousNamedSibling; }
        for (const d of ch.descendantsOfType(decoTypes)) if (d.startIndex < limit) take(d);
        decos.reverse(); }
      const params = ch.childForFieldName('parameters') || declaratorChain(ch).map(d => d.childForFieldName('parameters')).find(Boolean); const nP = params ? params.namedChildren.length : 0;
      const ptypes = [];
      if (params && kind === 'method') for (const prm of params.namedChildren.slice(0, 8)) { const tn = prm.childForFieldName('type'); if (!tn) continue;
        const id = tn.descendantsOfType(['type_identifier', 'predefined_type', 'primitive_type', 'scoped_type_identifier', 'qualified_type', 'attribute', 'dotted_name', 'identifier', 'name'])[0];
        const tx = (id ? id.text : tn.text).replace(/^[:\s]+/, '').replace(/\s+/g, '');
        if (tx && tx.length <= 40 && /^[\w.$:\\]+$/.test(tx) && !ptypes.includes(tx)) ptypes.push(tx.split('\\').pop()); }
      // declared result type — the field name is DERIVED per node type (§bindingFor's `b.retField`: Go `result`,
      // TS/PHP/Rust/Scala `return_type`, Java/Groovy/C# `type`, C# `method_declaration`'s own `returns`), never a
      // hardcoded alternative list. The named identifiers of that type: for typed languages without decorators
      // this is the strongest role signal there is (measured on gin: middlewares are the functions returning
      // `HandlerFunc`, and nothing else names them)
      const rets = []; const retFieldName = b.retField.get(ch.type); const retN = retFieldName ? ch.childForFieldName(retFieldName) : null;
      const RET_ID_TYPES = TYPE_REF_ID_TYPES;
      if (retN && !(bodyN && retN.id === bodyN.id)) {
        // a NAMED-RESULT node — Go `func f() (err error)`'s `parameter_list`, Scala 3's named-tuple return
        // `(name: String, age: Int)`'s `named_tuple_type`: every one of retN's OWN direct children is a `paramLike`
        // "named slot" (both a `name` field and a `type` field, §bindingFor). `err`/`name`/`age` are BINDING NAMES,
        // not types — reading each slot's `.type` field directly (same technique as `ptypes` above) is the only way
        // to name the type without also naming the variable/element bound to it (§G26 bugfix: the flat identifier
        // scan below previously found the NAME first, since it sits before the TYPE in source order, and recorded
        // the name as if it were the return type — `(err error)` came out as "returns err", not "returns error")
        const namedSlots = b.paramLike.size && retN.namedChildCount > 0 && retN.namedChildren.every(c => b.paramLike.has(c.type)) ? retN.namedChildren.slice(0, 8) : null;
        if (namedSlots) { for (const slot of namedSlots) { const tn = slot.childForFieldName('type'); if (!tn) continue;
          const id = tn.descendantsOfType(RET_ID_TYPES)[0]; const tx = (id ? id.text : tn.text).replace(/^[:\s]+/, '').replace(/\s+/g, '');
          if (tx && tx.length <= 40 && /^[\w.$:\[\]]+$/.test(tx) && !rets.includes(tx)) rets.push(tx); } }
        else { // the outer type name only: `Promise<void>` → Promise, `Page<Owner>` → Page, `: boolean` → boolean
          // NOT extended to a paramLike node nested (not as a direct child) inside an otherwise-ordinary return
          // type — e.g. a TS return type that is itself a function type, `(x: number) => void`, still surfaces
          // `x`. That is the same name-vs-type confusion, diagnosed alongside this fix, but deliberately left
          // unfixed here: excluding such a slot's `.name` field does not even reach it (TS's plain-identifier
          // `required_parameter` binds through a `pattern` field, not `name`, despite node-types.json listing
          // `name` as a valid field too — a per-grammar quirk, not a stable generic signal), and excluding the
          // whole slot (name AND type) regressed real, common code instead: a TS return type that is an object
          // literal, `{ id: string }`, is ALSO `paramLike` per property, and dropping its `.type` field silently
          // discarded a real, previously-reported type (measured: broke this repo's own change-archetypes/
          // missing-shape fixtures). Reported as a known, narrower, un-fixed gap rather than shipped fragile.
          const id = retN.descendantsOfType(RET_ID_TYPES)[0]; // pre-order: `t.Any` before `t`
          const tx = (id ? id.text : retN.text).replace(/^[:\s]+/, '').replace(/\s+/g, '');
          if (tx && tx.length <= 40 && /^[\w.$:\[\]]+$/.test(tx)) rets.push(tx); } }
      const stmts = bodyN ? bodyN.namedChildren : [];
      let docText = ''; { let sib = ch.previousNamedSibling, hops = 0; while (sib && hops++ < 6 && (b.deco.has(sib.type) || /comment/.test(sib.type))) { if (/comment/.test(sib.type)) { docText = sib.text; break; } sib = sib.previousNamedSibling; }
        if (!docText && stmts.length && stmts[0].type === 'expression_statement' && stmts[0].namedChildCount === 1 && /string/.test(stmts[0].namedChildren[0].type)) docText = stmts[0].namedChildren[0].text; }
      const doc = docTokens(docText);
      if (decoLits.length) for (const t of docTokens(decoLits.slice(0, 12).join(' '))) if (!doc.includes(t)) doc.push(t);
      const mods = modifiersOf(ch, b);
      if (noBody) { scopes.push({ kind, name, own: kind === 'method' ? ownerFor(ch) : null, rel, line: ch.startPosition.row + 1, endLine: ch.endPosition.row + 1, g: grammar, nt: ch.type, noBody: true, sup: [...new Set(sup)], supKind, decos: [...new Set(decos)], rets, calls: new Set(), seen: new Set(), shapes: new Set(), preds: Object.assign({ 'auto.mods': mods }, name !== '<anon>' ? { 'auto.nameshape': nameShape(name), 'auto.namesuffix': nameSuffix(name) } : {}, kind === 'type' ? { 'auto.ctorshape': ctorShape } : {}), sk: skelOf(ch, isScope) }); pushKids(ch, treeStack); continue; }
      const seen = new Set(); const calls = new Set(); const varNames = []; const stack = [...stmts]; let g = 0;
      while (stack.length && g++ < 4000) { const n = stack.pop(); seen.add(n.type);
        if (/call/.test(n.type) && n.childForFieldName('function')) { const fn = n.childForFieldName('function'); if (fn.text.length <= 40 && !fn.text.includes('\n')) calls.add(fn.text); }
        if (n.type === 'variable_declarator' || (n.type === 'assignment' && n.childForFieldName('left')?.type === 'identifier')) { const nm = (n.childForFieldName('name') || n.childForFieldName('left'))?.text; if (nm) varNames.push(nm); }
        if (!isScope(n)) for (const c of n.namedChildren) stack.push(c); }
      const shapes = new Set(); const ser = (n, d) => d <= 0 ? n.type : n.type + '(' + n.namedChildren.slice(0, 3).map(c => ser(c, d - 1)).join(',') + ')';
      if (kind === 'method') for (const st of stmts.slice(0, 20)) shapes.add(ser(st, 2));
      const retStmts = stmts.filter(s => /return/.test(s.type));
      const preds = { 'auto.mods': mods }; if (name !== '<anon>') { preds['auto.nameshape'] = nameShape(name); preds['auto.namesuffix'] = nameSuffix(name); } // a placeholder has no name shape (domain: named scopes)
      // placement is a property of every scope, not only of its file: the group cell (r<i>:type auto.dir2 = handlers) is what
      // makes "handlers live under src/handlers/" a checkable fact — measured: no dir fact ever fired in any corpus, because
      // dir preds sat on file scopes and file scopes have no groups
      dirname(rel).split('/').filter(sg => sg !== '.').slice(0, 3).forEach((sg, k) => preds['auto.dir' + (k + 1)] = sg);
      if (kind === 'type') { preds['auto.ctorshape'] = ctorShape; preds['auto.memberorder'] = memberOrder(bodyN); } // bodiless types are excluded above: a type with no body has no member layout to order
      if (kind === 'method') { preds['auto.arity'] = nP >= 3 ? '3+' : String(nP);
        if (stmts.length >= 1) preds['auto.first1'] = stmts[0].type;
        if (retStmts.length) preds['auto.ret'] = retStmts[retStmts.length - 1].namedChildren[0]?.type || 'bare';
        if (varNames.length >= 2) { const c = {}; for (const v of varNames.slice(0, 20)) { const sh = nameShape(v); c[sh] = (c[sh] || 0) + 1; } preds['auto.varshape'] = Object.entries(c).sort((a, x) => x[1] - a[1])[0][0]; } }
      scopes.push({ kind, name, own: kind === 'method' ? ownerFor(ch) : null, rel, line: ch.startPosition.row + 1, endLine: ch.endPosition.row + 1, g: grammar, nt: ch.type, sup: [...new Set(sup)], supKind, decos: [...new Set(decos)], rets, ptypes, calls, seen, shapes, preds, doc, sk: skelOf(ch, isScope) });
      // catch/finally micro-scopes: "catch blocks here call `logger.error`" is a convention no per-method surface carries
      // (a method's call bag cannot say WHERE the logging sits); the block is its own population, named after its owner
      if (bodyN) for (const blk of bodyN.descendantsOfType(['catch_clause', 'except_clause', 'rescue', 'finally_clause', 'ensure', 'defer_statement'])) {
        const bkind = /finally|ensure/.test(blk.type) ? 'finally' : 'catch';
        scopes.push(blockScope(blk, bkind, name === '<anon>' ? kind : name, rel, grammar, isScope)); }
      pushKids(bodyN || ch, treeStack);
    } else {
      // a function on the right of an assignment is named by its left side: `const foo = () => {}`, `obj.prop = function () {}`
      // (only when the function itself is nameless — a named function expression is already a scope of its own)
      {
        const inner = ch.childForFieldName('value') || ch.childForFieldName('right');
        const innerHasBody = inner && !!(inner.childForFieldName('body') || (b.loosebody.has(inner.type) && looseBody(inner)));
        if (inner && FUNC_VALUE_RE.test(inner.type) && innerHasBody && !(inner.childForFieldName('name')?.text)) {
          const leftN = ch.childForFieldName('name') || ch.childForFieldName('left');
          const nm = leftN ? leftN.text.split('.').pop().trim() : '';
          if (nm && nm.length <= 40 && /^[A-Za-z_$][\w$]*$/.test(nm)) {
            const sc2 = blockScope(inner.childForFieldName('body') || inner, 'method', nm, rel, grammar, isScope, ch.startPosition.row + 1, ch.endPosition.row + 1);
            sc2.nt = inner.type; sc2.preds['auto.nameshape'] = nameShape(nm); sc2.preds['auto.namesuffix'] = nameSuffix(nm);
            const prm = inner.childForFieldName('parameters'); sc2.preds['auto.arity'] = prm ? (prm.namedChildren.length >= 3 ? '3+' : String(prm.namedChildren.length)) : '0';
            scopes.push(sc2); } } }
      // a named callback block, from the raw AST shape alone: a call carrying a string literal AND a function argument
      // names the otherwise-anonymous callback — `it('strips the prefix', fn)`, `t.Run("name", func…)`, but equally
      // `app.get('/health', handler)` or `on('close', fn)`. No callee vocabulary; the shape is the signal.
      if (/call/.test(ch.type)) { const fn2 = ch.childForFieldName('function') || ch.namedChildren[0];
        if (fn2 && fn2.text.length <= 30) {
          const argsN = ch.childForFieldName('arguments') || ch;
          const strN = argsN.namedChildren.find(a => /^(string|string_literal|interpreted_string_literal|raw_string_literal)$/.test(a.type));
          const fnN = argsN.namedChildren.find(a => /function|arrow|lambda|func_literal|closure|do_block|^block$/.test(a.type));
          if (strN && fnN) { const nm = strN.text.replace(/^["'`]|["'`]$/g, '').replace(/\s+/g, ' ').slice(0, 60);
            if (nm) scopes.push(blockScope(fnN.childForFieldName('body') || fnN, 'case', nm, rel, grammar, isScope, ch.startPosition.row + 1, ch.endPosition.row + 1)); } } }
      // §018 — a macro invocation's body is an UNPARSED TOKEN REGION (`b.macroCall`/`b.tokenRegion`, derived in
      // bindingFor): the grammar tokenised it and declined to give it structure, so every declaration written
      // inside is invisible — axum's `define_rejection! { pub struct JsonDataError(Error); }` yields a ~200-line
      // file with ZERO scopes and 15 missing public types. Ask the GRAMMAR ITSELF what those tokens are: re-parse
      // the region's own text and keep what comes back only if the WHOLE region parses cleanly (`hasError` false)
      // — the grammar's own verdict "these tokens are declarations", not a guess about what a macro emits, and no
      // macro is ever named. A body of bare references (`println!("{}", x)`, `matches!(x, Foo::Bar)`, `vec![a, b]`)
      // is not a parseable run of items and yields nothing, and neither does a template whose names are holes
      // (`quote! { struct #name; }`) or a syntax the language does not have (`bitflags! { pub struct F: u32 {…} }`).
      // Measured over 26k macro invocations in five Rust repositories: 96-99% of bodies are rejected outright, and
      // of the 828 names recovered NOT ONE was a name that is not literally declared at the line reported — the
      // inverse error, inventing a declaration, is the one this must never make (§018 phase 2 measurement log).
      if (b.macroCall.has(ch.type) && _depth < 2) { // 2: the same shallow recursion bound the walk's other guards use
        const reg = ch.namedChildren[ch.namedChildren.length - 1];
        const kids = reg && b.tokenRegion.has(reg.type) ? reg.children : null;
        const open = kids && kids.length > 2 ? kids[0] : null, close = kids && kids.length > 2 ? kids[kids.length - 1] : null;
        // the region's own delimiters are ANONYMOUS tokens; the body is exactly what lies between them
        if (open && !open.isNamed && !close.isNamed) {
          const inner = reg.text.slice(open.endIndex - reg.startIndex, close.startIndex - reg.startIndex);
          // `b.kwRe`: the body must name at least one of the grammar's OWN keyword tokens, or it cannot spell a
          // declaration. Over-approximate on purpose (a keyword inside a string counts) — it only decides whether
          // the parse is worth attempting; the parse itself is the verdict. Halves the cost, loses no name.
          const mp = inner.trim() && b.kwRe && b.kwRe.test(inner) ? macroParser(b) : null;
          if (mp) { const it = mp.parse(inner);
            // the body's first line CONTINUES the line the opening delimiter sits on, so every inner row is
            // offset by that row exactly — verified line-for-line against axum's rejection.rs
            if (!it.rootNode.hasError) { const row = open.endPosition.row;
              for (const s of extractScopes(rel, it, b, grammar, _depth + 1)) { if (s.kind === 'file') continue;
                s.line += row; if (s.endLine != null) s.endLine += row; scopes.push(s); } }
            it.delete(); } } }
      pushKids(ch, treeStack); } }
  // loader calls as imports, for grammars whose module system is a function call (Ruby `require`, Lua `require`, PHP `require_once`,
  // Solidity-less) — module-level only: a `require` inside a function is a lazy load, not the file's dependency
  if (b.imp.size === 0 || /ruby|lua|php/.test(String(b.name))) {
    const LOADERS = /^(require|require_relative|require_once|include|include_once|load|dofile|import_module|using)$/;
    for (const c of tree.rootNode.descendantsOfType(['call', 'call_expression', 'function_call', 'method_call', 'function_call_expression', 'include_expression', 'require_expression', 'require_once_expression'])) {
      let p = c.parent, inScope = false; while (p) { if (isScope(p)) { inScope = true; break; } p = p.parent; } if (inScope) continue;
      const fn = c.childForFieldName('function') || c.childForFieldName('method') || c.namedChildren[0]; if (!fn || !LOADERS.test(fn.text)) continue;
      const str = c.descendantsOfType(['string', 'string_literal', 'string_content'])[0]; if (!str) continue;
      let tgt = str.text.replace(/^["'`]|["'`]$/g, ''); if (/relative|once$/.test(fn.text) && !tgt.startsWith('.')) tgt = './' + tgt; // require_relative / require_once are file-relative
      if (tgt && !imports.includes(resolveImport(tgt, rel))) imports.push(resolveImport(tgt, rel)); } }
  const fPreds = { 'auto.filenameshape': nameShape(basename(rel, extname(rel))), ...lexicalPreds(tree, b), ...exportShape(tree) };
  // §045 — a macro invocation's own identifiers are a MENTION signal (macroDoc), never a HERITAGE claim: ~90%
  // of what the old `macroDefs` heuristic called "the definitions a macro emits" was either the invoked macro's
  // own name or a bare reference declared nowhere (measured on 5 real Rust repos, 5656 names, 85.5% phantom).
  // `fileSups` feeds `what`'s implements/extends claim, which a mention can never support — only `fileDocs` may
  // carry these tokens now.
  let macroDoc = [];
  if (b.macroCall.size) { const ids = [];
    for (const m of tree.rootNode.descendantsOfType([...b.macroCall]).slice(0, 60)) for (const id of m.descendantsOfType(['identifier', 'type_identifier']).slice(0, 12)) { if (ids.length < 60) ids.push(id.text); }
    if (ids.length) macroDoc = docTokens([...new Set(ids)].join(' ')); }
  dirname(rel).split('/').filter(s => s !== '.').slice(0, 3).forEach((s, k) => fPreds['auto.dir' + (k + 1)] = s);
  // ===== VALUE CONCORDANCE (§J3.1): the values this file NAMES — enum members and short string literals — each
  // tagged with the container it sits in, so `learn()` can say where a value lives and which values are siblings.
  // Its OWN pass over the tree: the main walk above continues past import subtrees and descends only through scope
  // bodies, so none of this could ride along with it.
  const vals = []; const valSeen = new Set(); let valsCapped = false;
  // `cn` is the container's DISPLAY name (an enum's own identifier), carried so §J3.2 can say "(added to `UserStatus`)" —
  // the container key itself is a hash and cannot be reversed. null for positional string containers, which have no name.
  const addVal = (v, k, line, c, cn) => { // dedupe per (v, k) BEFORE the cap: a value said five times in one file is one entry
    if (vals.length >= VAL_CAP) { valsCapped = true; return; } // a scan this file TRIED to exceed the cap on is a
    // non-representative PREFIX of itself (measured: vendored `tree-sitter-*.node-types.json`, `package-lock.json`)
    // — every `vals` entry collected so far for this file is dropped wholesale, below at the file-scope push
    if (!v || v.length > 80 || v.includes('\n')) return;
    const key = k + S + v; if (valSeen.has(key)) return; valSeen.add(key); vals.push({ v, k, line, c, cn: cn ?? null }); };
  // (a) enum members: a child carrying a `name` field (C# enum_member_declaration, Java enum_constant, TS
  // enum_assignment) names itself; one that does not but IS identifier-shaped IS the name (TypeScript's bare
  // `enum UserStatus { ACTIVE, SUSPENDED }` members are `property_identifier` leaves with no field at all).
  // The container key is the enum's own NAME, not its position: the same enum declared in two files must be ONE
  // sibling set, which is the entire point of the sibling map.
  const enumTypes = [...b.nodeTypes].filter(t => ENUM_LIKE_RE.test(t));
  if (enumTypes.length) for (const en of tree.rootNode.descendantsOfType(enumTypes).slice(0, VAL_SCAN_CAP)) {
    const ebody = en.childForFieldName('body') || looseBody(en); if (!ebody) continue; // enum_body/enum_assignment match the word too — only a DECLARATION has a body
    const enName = en.childForFieldName('name');
    const c = hashStr(en.type + '|' + (enName ? enName.text : rel + '@' + en.startIndex));
    for (const m of ebody.namedChildren.slice(0, VAL_SCAN_CAP)) {
      const mn = m.childForFieldName('name');
      if (mn) addVal(mn.text, 'enum', m.startPosition.row + 1, c, enName ? enName.text : null);
      else if (ENUM_MEMBER_RE.test(m.type)) addVal(m.text, 'enum', m.startPosition.row + 1, c, enName ? enName.text : null); } }
  // (a2) §014 — multi-name value specs with no body of their own (Go's `const_spec`/`var_spec`, §bindingFor's
  // `b.namedValueSpec`): a name with no behavior, exactly like an enum member above — never a scope (no body to
  // hold nested declarations; cross-check-honest-silence.test.mjs's own precondition asserts this stays true), but
  // findable through the same VALUE surface. The container is the spec's own PARENT (the `const_declaration` /
  // `var_declaration` / `var_spec_list` wrapping it), so a grouped `const ( A; B )` block's members share one
  // sibling set the same way one enum's members already do; single-line `const x = 1` gets a container of one.
  if (b.namedValueSpec.size) for (const sp of tree.rootNode.descendantsOfType([...b.namedValueSpec]).slice(0, VAL_SCAN_CAP)) {
    const names = sp.childrenForFieldName('name').filter(nm => nm.isNamed); if (!names.length) continue;
    const kind = sp.type.replace(/_spec$/, ''); // the grammar's own word for what this is ('const_spec' -> 'const') — not an invented label
    const cont = sp.parent || sp;
    const c = hashStr(cont.type + '|' + rel + '@' + cont.startIndex);
    for (const nm of names) addVal(nm.text, kind, nm.startPosition.row + 1, c, null); }
  // (b) string literals outside imports (a module specifier is a path, not a value). The container key is
  // POSITIONAL, which only means anything within one file — hence the path in the hash, so two files that happen
  // to open the same construct at the same offset are not merged into one bogus sibling set.
  for (const sn of tree.rootNode.descendantsOfType(STR_TYPES).slice(0, VAL_SCAN_CAP)) {
    // data grammars (JSON/YAML/TOML) have no code-style quote PREFIX (`f"…"`, `r'…'`) to strip — the shared
    // leading-letter strip below would mistake a bare YAML plain scalar's own leading word for one (`ubuntu-latest`
    // -> `-latest`), so a data file's own values only ever lose a surrounding quote character, never a prefix
    const v = b.data ? sn.text.replace(/^["'`]|["'`]$/g, '') : sn.text.replace(/^[A-Za-z@$]+/, '').replace(/^["'`]|["'`]$/g, '');
    if (!v || v.length > 40 || v.includes('\n')) continue;
    let p = sn.parent, cont = null, inImport = false;
    while (p) { if (b.imp.has(p.type)) { inImport = true; break; } if (!cont && CONTAINER_RE.test(p.type)) cont = p; p = p.parent; }
    if (inImport) continue;
    // a data-grammar node that IS the key of its pair (not the value) is tagged `key` — a genuine cross-file fact
    // ("the key `test` appears in these N files") through the existing valueIndex, keyed globally by `k:v`
    const k = b.data && isKeyNode(sn, b) ? 'key' : 'str';
    // §J7.3: a DATA container's identity is its key-PATH (`$.scripts`), not its file+offset — so the SAME
    // conceptual container (every package.json's own `scripts` object) is ONE population across files. `grammar`
    // is folded into the hash purely for belt-and-suspenders: `cont.type` alone already disambiguates a JSON
    // `object` from a code `object` in practice, but this makes that guarantee explicit. A code container (or a
    // data value with no container at all) keeps the existing positional/file-fallback keying, byte-for-byte.
    const keyPath = cont && b.data ? keyPathOf(cont, b) : null;
    const contId = hashStr(keyPath != null ? cont.type + '|' + grammar + '#' + keyPath : cont ? cont.type + '|' + rel + '@' + cont.startIndex : 'file|' + rel);
    addVal(v, k, sn.startPosition.row + 1, contId, keyPath); } // no container: the file itself is one
  scopes.push({ kind: 'file', name: basename(rel), rel, line: 1, g: grammar, sup: [], decos: [], rets: [], calls: new Set(), seen: new Set(), shapes: new Set(), preds: fPreds, doc: macroDoc, vals: valsCapped ? [] : vals });
  const occ = new Map(); // ordinal disambiguates same-named scopes of a kind within one file (overloads, repeated nested classes)
  for (const s of scopes) { const k = s.kind + S + s.name; const n = occ.get(k) || 0; s.ord = n; occ.set(k, n + 1); }
  for (const s of scopes) { s.imports = imports;
    // parameter types are a FACT surface, not a clustering feature: every handler takes its own `XCommand`, and putting
    // `pt:` into the bags split same-role scopes apart (measured on the fixture: the deviant fell out of its group)
    s.feats = [...new Set([...tokenize(s.name).map(t => 'tok:' + t), ...s.sup.map(x => 'sup:' + x), ...s.decos.map(d => 'dec:' + d), ...(s.rets || []).map(x => 'ret:' + x), ...(s.own ? ['own:' + s.own] : []),
      ...[...new Set(imports.filter(i => !i.startsWith('~/')).map(i => i.split('/').pop()))].slice(0, 5).map(x => 'imp:' + x)])];
    s.ownCount = new Set([...tokenize(s.name), ...s.sup, ...s.decos, ...(s.rets || [])]).size; }
  return scopes; }
// a body-bearing sub-scope (catch/finally block, named callback): calls, node types and statement shapes, no identity surfaces
// ===== SUPERPOSITION, stage 0 (design record: .temp/docs/math-constitution.md). The skeleton of a scope is its AST
// with three normalizations: nested scopes become opaque leaves (a class profile does not drown in its methods'
// bodies), identifiers stay LITERAL (an invariant identifier — `logger.error` in every catch — remains in the shared
// template by itself; a per-instance one — each handler's own command — becomes a hole whose statistics say so), and
// string/number payloads collapse to str/num. Anti-unification (Plotkin's LGG) folds a cluster's skeletons into ONE
// template; the per-hole label distributions are the superposition statistics.
const SK_CAP = 300;
export function skelOf(node, isScope) {
  let used = 0;
  const go = (n, d) => {
    if (used >= SK_CAP || d > 14) { used++; return n.type; }
    used++;
    const kids = (n.namedChildren || []).filter(c => !/comment/.test(c.type));
    if (!kids.length) { const t = n.type;
      if (/identifier|(^|_)name$/.test(t)) return 'id:' + n.text.slice(0, 24);
      if (/string|char|template/.test(t)) return 'str';
      if (/number|integer|float/.test(t)) return 'num';
      return t; }
    return [n.type, ...kids.map(c => (d > 0 && isScope(c)) ? c.type : go(c, d + 1))]; };
  return go(node, 0); }
const skLeaf = x => typeof x === 'string';
const skSig = x => skLeaf(x) ? x : x[0];
const skCount = t => skLeaf(t) ? (t.startsWith('?') ? 0 : 1) : (t[0] === '?' || t[0] === '?*' ? 0 : 1 + t.slice(1).reduce((a, k) => a + skCount(k), 0));
// per-signature occurrence counts of a skeleton's LITERAL nodes — skCount's own branch structure, tallied by
// signature instead of summed. Holes contribute nothing, exactly as skCount scores them 0. Runs on the raw
// anti-unified template (holes present) in profileOf and on a plain candidate skeleton (holes impossible outside
// skAu) in checkFile — one function, so the two sides can never drift into counting different things.
function sigCounts(t, into = Object.create(null)) {
  if (skLeaf(t)) { if (!t.startsWith('?')) into[t] = (into[t] || 0) + 1; return into; }
  if (t[0] === '?' || t[0] === '?*') return into;
  into[t[0]] = (into[t[0]] || 0) + 1;
  for (const k of t.slice(1)) sigCounts(k, into);
  return into; }
function skAlign(ka, kb) { // deterministic LCS over root signatures; template holes match anything
  const m = ka.length, n2 = kb.length; const eq = (x, y) => skSig(x) === skSig(y) || skSig(x) === '?' || skSig(x) === '?*';
  const dp = Array.from({ length: m + 1 }, () => new Array(n2 + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n2 - 1; j >= 0; j--) dp[i][j] = eq(ka[i], kb[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0; const gap = () => { if (!out.length || !(Array.isArray(out[out.length - 1]) && out[out.length - 1][0] === '?*')) out.push(['?*']); };
  while (i < m && j < n2) { if (eq(ka[i], kb[j]) && dp[i][j] === dp[i + 1][j + 1] + 1) { out.push([ka[i], kb[j]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { gap(); i++; } else { gap(); j++; } }
  if (i < m || j < n2) gap();
  return out; }
export function skAu(a, b) { // least general generalization of two skeletons
  if (skLeaf(a) && skLeaf(b)) return a === b ? a : ['?'];
  if (Array.isArray(a) && (a[0] === '?' || a[0] === '?*')) return a;
  if (skLeaf(a) || skLeaf(b) || a[0] !== b[0]) return ['?'];
  const ka = a.slice(1), kb = b.slice(1);
  const kids = ka.length === kb.length ? ka.map((x, i) => skAu(x, kb[i]))
    : skAlign(ka, kb).map(pr => pr[0] === '?*' && pr.length === 1 ? pr : skAu(pr[0], pr[1]));
  return [a[0], ...kids]; }
function skNumber(t, holes = []) { // give every hole an id, in walk order
  if (skLeaf(t)) return t;
  if (t[0] === '?' || t[0] === '?*') { const h = [t[0], holes.length]; holes.push(h); return h; }
  return [t[0], ...t.slice(1).map(k => skNumber(k, holes))]; }
function skMatch(tpl, sk, stats) { // collect per-hole labels of ONE instance against the numbered template
  if (skLeaf(tpl) || skLeaf(sk)) return;
  if (tpl[0] === '?') { const c = stats[tpl[1]]; const l = skLeaf(sk) ? sk : sk[0]; c.set(l, (c.get(l) || 0) + 1); return; }
  const walkKids = (tk, ik) => { let ii = 0;
    for (const tkid of tk) {
      if (Array.isArray(tkid) && tkid[0] === '?*') { const c = stats[tkid[1]]; c.set('…', (c.get('…') || 0) + 1); continue; }
      while (ii < ik.length && skSig(ik[ii]) !== skSig(tkid) && !(Array.isArray(tkid) && tkid[0] === '?')) ii++;
      if (ii >= ik.length) break;
      if (Array.isArray(tkid) && tkid[0] === '?') { const c = stats[tkid[1]]; const l = skLeaf(ik[ii]) ? ik[ii] : ik[ii][0]; c.set(l, (c.get(l) || 0) + 1); ii++; continue; }
      skMatch(tkid, ik[ii], stats); ii++; } };
  if (tpl[0] === sk[0]) walkKids(tpl.slice(1), sk.slice(1)); }
export function skRender(t, max = 220) {
  const go = x => { if (skLeaf(x)) return x.startsWith('id:') ? x.slice(3) : x;
    if (x[0] === '?') return '⟨·⟩'; if (x[0] === '?*') return '…';
    const kids = x.slice(1).map(go); const out = []; // a run of identical children compresses to ×N — structure, not curation
    for (const k of kids) { const last = out[out.length - 1];
      if (last && last.s === k) last.n++; else out.push({ s: k, n: 1 }); }
    return x[0] + '(' + out.map(e => e.n > 1 ? e.s + '×' + e.n : e.s).join(' ') + ')'; };
  const r = go(t); if (r.length <= max) return r;
  const cut = r.lastIndexOf(' ', max - 2); return r.slice(0, cut > max / 2 ? cut : max - 1) + '…'; }
// fold a cluster's skeletons into template + per-hole statistics — the profile the group card and export speak
export function profileOf(skels) {
  if (skels.length < 4) return null;
  let tpl = skels[0]; for (let i = 1; i < skels.length; i++) tpl = skAu(tpl, skels[i]);
  const holes = []; const rawTpl = tpl; tpl = skNumber(tpl, holes);
  const shared = skCount(tpl); if (shared < 6) return null; // a template that is mostly holes says nothing
  const avg = skels.reduce((a, k) => a + skCount(k), 0) / skels.length;
  const stats = holes.map(() => new Map());
  for (const sk of skels) skMatch(tpl, sk, stats);
  const slots = stats.map((c, i) => { const total = [...c.values()].reduce((a, b) => a + b, 0); if (!total) return null;
    const top = [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
    return { id: i, kind: holes[i][0], total, distinct: c.size, top: top.map(([l, k2]) => [skLeaf(l) && l.startsWith('id:') ? l.slice(3) : l, k2]) }; }).filter(Boolean);
  const perInst = slots.filter(sl => sl.kind === '?' && sl.distinct >= Math.max(3, sl.total * 0.8));
  const skewed = slots.filter(sl => sl.kind === '?' && sl.distinct >= 2 && sl.top[0][1] / sl.total >= 0.6 && sl.distinct < sl.total * 0.8);
  // what EVERY member carries, as counts rather than as a tree (§J5.8). Every literal node of the template maps
  // injectively into every member — skAu joins children positionally at equal arity, else by skAlign's
  // order-preserving LCS pairing, and holes are the only non-injective case and are excluded here — so
  // count(sig in template) <= count(sig in every member), and a candidate below the count is provably missing
  // structure the whole group carries. Ordinary and ENUMERABLE on purpose, unlike `_tpl` below: `check` reads the
  // model back from .grain/cache/model.json, where a non-enumerable field cannot survive. Capped at 40 (SK_CAP
  // already bounds the skeleton, so this bounds the profile to a few hundred bytes), count desc then signature asc.
  const req = Object.fromEntries(Object.entries(sigCounts(rawTpl)).sort(([a, ca], [b, cb]) => cb - ca || (a < b ? -1 : 1)).slice(0, 40));
  const out = { n: skels.length, shared, coverage: +(Math.min(1, shared / Math.max(1, avg))).toFixed(2), skel: skRender(tpl),
    perInstance: perInst.slice(0, 3).map(sl => ({ top: sl.top[0][0], distinct: sl.distinct, total: sl.total })),
    slots: skewed.slice(0, 3).map(sl => ({ top: sl.top[0][0], k: sl.top[0][1], total: sl.total })), req };
  // pre-`skNumber` template, kept off the enumerable surface: `out` is a direct reference inside model.partitions[i].profiles,
  // published verbatim by export.mjs — JSON.stringify skips non-enumerable own properties, so twinsOf's structural
  // comparison (J3.4) gets the raw tree with zero risk of it leaking into the persisted cache or the export schema
  Object.defineProperty(out, '_tpl', { value: rawTpl, enumerable: false });
  return out; }

// stage 1 of the template search: the scopes the clustering leaves behind (plain functions without markers, catch
// blocks) still repeat shapes. Coarse buckets — same kind, same depth-2 silhouette with identifiers folded — feed the
// same anti-unification; a bucket whose template does not pay (few members, thin shared core, low coverage) says
// nothing. The silhouette is a partition of the hypothesis space, not a judgment: identifiers fold so that a
// per-instance name cannot split a bucket the way it splits a feature bag.
export function skSil(t, d = 2) {
  if (skLeaf(t)) return t.startsWith('id:') ? 'id' : t;
  if (t[0] === '?' || t[0] === '?*') return '?';
  if (d <= 0) return t[0];
  return t[0] + '(' + t.slice(1).map(k => skSil(k, d - 1)).join(' ') + ')'; }
export function mineTemplates(ps, covered) {
  const buckets = new Map();
  ps.forEach((s, i) => { if (s.kind === 'file' || s.kind === 'module' || !s.sk || covered.has(i)) return;
    const key = s.kind + '\u0001' + skSil(s.sk); (buckets.get(key) || buckets.set(key, []).get(key)).push(s); });
  const out = [];
  for (const [key, ms] of [...buckets].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))) {
    if (ms.length < 5) continue;
    const sorted = [...ms].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line));
    const pf = profileOf(sorted.map(s => s.sk));
    if (!pf || pf.shared < 8 || pf.coverage < 0.5) continue; // no cluster prior behind it — the template alone must carry the claim
    out.push({ kind: key.split('\u0001')[0], ...pf, exemplars: sorted.slice(0, 3).map(s => ({ rel: s.rel, line: s.line, endLine: s.endLine || s.line, name: s.name })), _members: sorted });
    if (out.length >= 12) break; }
  return out; }

// structural twins (H4): two role-group templates, possibly in different partitions, that are the same shape under a
// different name. Comparison is over the raw ANTI-UNIFIED template (`_tpl`, profileOf's non-enumerable side channel),
// not the rendered/truncated `skel` string — a truncated render can make two unrelated long templates share a prefix,
// or hide a large repeat-count difference behind one `×N` character. `skAu` tests its hole marker only on its first
// argument (§skAlign), so `skAu(A,B)` and `skAu(B,A)` can disagree; taking the min is the conservative reading, with no
// canonical ordering invented for the pair. The acceptance threshold is not a new constant: `3·shared > A.shared +
// B.shared` is `shared / avg(A.shared, B.shared) > 2/3`, the same majority-share proportion as `induceRoles`' medoid
// labels and J3.2's kin-completeness threshold — a shared core that outweighs everything that tells the two apart.
const TWIN_PROFILE_CAP = 200; // profiles entered into the twin scan; thickest templates first — 19 900 pairs at most
export function twinsOf(entries, log = () => {}) {
  if (entries.length > TWIN_PROFILE_CAP) log(`[learn] twin profile cap ${TWIN_PROFILE_CAP}: dropped ${entries.length - TWIN_PROFILE_CAP} thinnest profile(s)`);
  const pool = entries.sort((a, b) => b.shared - a.shared || (a.key < b.key ? -1 : 1)).slice(0, TWIN_PROFILE_CAP);
  const out = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
    const A = pool[i], B = pool[j];
    if (skSig(A.tpl) !== skSig(B.tpl)) continue; // different roots: no shared core is possible
    if (3 * Math.min(A.shared, B.shared) <= A.shared + B.shared) continue; // cheap reject: shared <= min(A.shared,B.shared) always
    const shared = Math.min(skCount(skAu(A.tpl, B.tpl)), skCount(skAu(B.tpl, A.tpl))); // skAu is asymmetric on holes — take the conservative side
    if (shared <= (A.shared - shared) + (B.shared - shared)) continue;
    out.push({ a: A.key, b: B.key, shared, coverage: +(shared / Math.max(A.shared, B.shared)).toFixed(2) }); }
  return out.sort((x, y) => y.shared - x.shared || (x.a < y.a ? -1 : 1)); }

function blockScope(node, kind, name, rel, grammar, isScope, line = null, endLine = null) {
  const seen = new Set(); const calls = new Set(); const stack = [node]; let g = 0;
  while (stack.length && g++ < 2000) { const n = stack.pop(); seen.add(n.type);
    if (/call/.test(n.type) && n.childForFieldName('function')) { const fn = n.childForFieldName('function'); if (fn.text.length <= 40 && !fn.text.includes('\n')) calls.add(fn.text); }
    if (!isScope(n)) for (const c of n.namedChildren) stack.push(c); }
  const shapes = new Set(); const ser = (n, d) => d <= 0 ? n.type : n.type + '(' + n.namedChildren.slice(0, 3).map(c => ser(c, d - 1)).join(',') + ')';
  const stmts = (node.namedChildren || []).filter(n2 => /statement|expression|declaration|call/.test(n2.type));
  for (const st of stmts.slice(0, 20)) shapes.add(ser(st, 2));
  const preds = {}; if (stmts.length) preds['auto.first1'] = stmts[0].type;
  dirname(rel).split('/').filter(sg => sg !== '.').slice(0, 3).forEach((sg, k) => preds['auto.dir' + (k + 1)] = sg);
  return { kind, name, rel, line: line ?? node.startPosition.row + 1, endLine: endLine ?? node.endPosition.row + 1, g: grammar, nt: node.type, sup: [], decos: [], rets: [], calls, seen, shapes, preds, doc: [], sk: skelOf(node, isScope) }; }
// how the module exports (JS/TS families; elsewhere the surface never appears): a fastify-style repo's strongest identity
export function exportShape(tree) {
  const c = Object.create(null);
  for (const n of tree.rootNode.namedChildren) {
    if (n.type === 'export_statement') c[/^export\s+default\b/.test(n.text) ? 'export-default' : 'export-named'] = (c[/^export\s+default\b/.test(n.text) ? 'export-default' : 'export-named'] || 0) + 1;
    else if (n.type === 'expression_statement' && /^module\.exports\b/.test(n.text)) c['module.exports'] = (c['module.exports'] || 0) + 1;
    else if (n.type === 'expression_statement' && /^exports\.\w/.test(n.text)) c['exports.x'] = (c['exports.x'] || 0) + 1; }
  const tot = Object.values(c).reduce((a, b) => a + b, 0); if (!tot) return {};
  const [k, n2] = Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return { 'auto.modexport': n2 >= tot * 0.8 ? k : 'mixed' }; }
// doc comment → searchable tokens: first sentence only, comment sigils stripped, prose stopwords dropped (what a thing is FOR,
// in the maintainers' words — the vocabulary an agent's intent is most likely phrased in)
export const DOC_STOP = new Set('the a an and or of to for in on at by with from as is are was were be been being this that these those it its into than then there their which who whom what when where how if not no nor do does did done can could will would should may might must also such via each per any all some more most other same new use used using return returns returned given like true false null none void only own just yet still very e g i e'.split(' '));
export function docTokens(text) { if (!text) return [];
  const clean = text.replace(/^[\s/*#\-"'`!]+/, '').replace(/\*\/\s*$/, '').replace(/^\s*(\*|\/\/+|#+|--)\s?/gm, '').replace(/["'`]{3}$/, '');
  const first = clean.split(/(?<=[.!?])\s|\n\s*\n/)[0].slice(0, 200);
  const out = []; for (const t of first.split(/[^A-Za-z0-9_]+/)) { if (!t) continue; for (const u of tokenize(t)) { const l = u.toLowerCase(); if (l.length < 3 || DOC_STOP.has(l) || out.includes(l)) continue; out.push(l); if (out.length >= 24) return out; } }
  return out; }
// ===== LEXICAL LAYER (file scope): the surfaces an AST cannot carry — measured on express/flask/CleanArchitecture as the
// whole gap between "the right file" and "the convention": 'use strict' 21/21, single quotes, var vs const, a UTF-8 BOM on
// 70/108 C# files that no Read ever shows. Each is a categorical value per file; whether it is a CHOICE is decided per
// grammar by the partition (lexDomain), never written down here.
export function lexicalPreds(tree, b) {
  const root = tree.rootNode; const text = root.text || ''; const out = {};
  out['auto.lex:bom'] = text.charCodeAt(0) === 0xFEFF ? 'bom' : 'none';
  // indentation unit: tabs, or the most common positive leading-space width among indented lines
  let tabs = 0, sp = 0; const widths = Object.create(null); const lines = text.split('\n'); const N = Math.min(lines.length, 4000);
  for (let i = 0; i < N; i++) { const l = lines[i]; if (!l || l[0] !== ' ' && l[0] !== '\t') continue; if (l[0] === '\t') { tabs++; continue; } const m = l.match(/^ +/)[0].length; if (l.trim()) { sp++; widths[m] = (widths[m] || 0) + 1; } }
  if (tabs + sp >= 5) { if (tabs > sp * 3) out['auto.lex:indent'] = 'tab'; else if (sp > tabs * 3) { const u = Object.entries(widths).map(([w, c]) => [+w, c]).filter(([w]) => [2, 3, 4, 8].includes(w)).sort((a, b) => a[0] - b[0]); let unit = 0; for (const [w, c] of u) if (c >= sp * 0.08) { unit = w; break; } out['auto.lex:indent'] = unit ? 'space' + unit : 'other'; } else out['auto.lex:indent'] = 'mixed'; } // the unit is the smallest width that recurs (most lines sit deeper than one level)
  // quote style of string literals (delimiter of each string node; prefixes like f"…" / r'…' skipped; backticks ignored)
  let sq = 0, dq = 0;
  for (const n of root.descendantsOfType(STR_TYPES).slice(0, 2000)) { const t = n.text.replace(/^[A-Za-z@$]+/, ''); if (t[0] === "'") sq++; else if (t[0] === '"') dq++; }
  if (sq + dq >= 2) out['auto.lex:quote'] = sq >= (sq + dq) * 0.8 ? 'single' : dq >= (sq + dq) * 0.8 ? 'double' : 'mixed';
  // statement terminator: simple statements ending in `;` vs not (compound statements — blocks, declarations with bodies — skipped)
  let semi = 0, nosemi = 0; const stack = [root]; let g = 0;
  while (stack.length && g++ < 6000) { const n = stack.pop();
    for (const c of n.namedChildren) { if (/^(expression_statement|return_statement|lexical_declaration|variable_declaration|import_statement|export_statement|throw_statement|break_statement|continue_statement|assignment_statement|local_variable_declaration)$/.test(c.type)) { if (/;\s*$/.test(c.text)) semi++; else nosemi++; }
      if (/statement|declaration|body|block|program|module|class|function|method|arrow|object|array|expression/.test(c.type) && c.namedChildCount) stack.push(c); } }
  if (semi + nosemi >= 5) out['auto.lex:semi'] = semi >= (semi + nosemi) * 0.8 ? 'semi' : nosemi >= (semi + nosemi) * 0.8 ? 'nosemi' : 'mixed';
  // leading directive: a first statement that is a short string expression (`'use strict'`, `'use client'`)
  const first = root.namedChildren.find(c => c.type !== 'comment' && c.type !== 'hash_bang_line');
  if (first && first.type === 'expression_statement' && first.namedChildCount === 1 && /string/.test(first.namedChildren[0].type)) { const t = first.namedChildren[0].text.replace(/^["'`]|["'`]$/g, ''); out['auto.lex:directive'] = /^use \w[\w-]*$/.test(t) ? t : 'none'; }
  else if (first) out['auto.lex:directive'] = 'none';
  // declaration keyword (grammars with var/let/const declarations): the majority keyword
  const decl = Object.create(null); for (const n of root.descendantsOfType(['variable_declaration', 'lexical_declaration']).slice(0, 2000)) { const kw = n.text.match(/^(var|let|const)\b/); if (kw) decl[kw[1]] = (decl[kw[1]] || 0) + 1; }
  const tot = Object.values(decl).reduce((a, b) => a + b, 0); if (tot >= 2) { const [k, c] = Object.entries(decl).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]; out['auto.lex:decl'] = c >= tot * 0.8 ? k : 'mixed'; }
  // import block layout: two independent axes over the file's own import statements, as ONE 4-valued categorical.
  // The specifiers come from the TREE, in document order, read verbatim — `s.imports` cannot answer this: resolveImport
  // rewrites every relative specifier to `~/…` and the array is deduplicated by `includes`, so both the original text
  // and the source order are already gone by then.
  if (b && b.imp.size) {
    const units = []; // { spec, row0, row1 } per import, top-level only (a function-local import is a lazy load, not layout)
    for (const n of root.namedChildren) { if (!b.imp.has(n.type)) continue;
      const strs = n.descendantsOfType(['string', 'string_literal', 'interpreted_string_literal', 'raw_string_literal', 'system_lib_string']);
      // a grouped block (Go `import ( … )`) holds one string per spec: each string is its own unit, at its own row,
      // so a blank line INSIDE the block still separates groups. One string, or none, means the statement is the unit.
      if (strs.length >= 2) { for (const s of strs) units.push({ spec: s.text.replace(/^["'`<]|["'`>]$/g, ''), row0: s.startPosition.row, row1: s.endPosition.row }); continue; }
      const tgt = strs.length ? strs[0].text.replace(/^["'`<]|["'`>]$/g, '')
        : (n.namedChildren.find(c => /dotted_name|scoped_identifier|qualified_name|namespace_name|identifier|package|use_list|use_clause/.test(c.type))?.text || '');
      if (tgt) units.push({ spec: tgt.replace(/\s+/g, ''), row0: n.startPosition.row, row1: n.endPosition.row }); }
    if (units.length >= 3) {
      let sorted = true, grouped = false;
      for (let i = 1; i < units.length; i++) { if (units[i].spec < units[i - 1].spec) sorted = false;
        if (units[i].row0 - units[i - 1].row1 >= 2) grouped = true; } // a gap of 2+ rows between one import's end and the next one's start IS a blank line
      out['auto.lex:imports'] = (sorted ? 'sorted' : 'unsorted') + '-' + (grouped ? 'grouped' : 'flat'); } }
  return out; }
// the SAME three ingredients extractScopes uses to build a file-kind scope's own preds, computable from raw source
// text alone — lets a caller ask "what value did this file-level predicate carry in some OTHER version of this
// file's content" without a full extractScopes/mine pass (used by fileFindings in grain.mjs for G10)
export async function fileLevelPreds(rel, src) {
  const { p, tree: tr } = await parseFile(extname(rel), src); const b = bindingFor(p._g);
  const preds = { 'auto.filenameshape': nameShape(basename(rel, extname(rel))), ...lexicalPreds(tr, b), ...exportShape(tr) };
  tr.delete(); return preds; }
// scope key → [line, endLine], from the partition's fileScopes (line order ⇒ the k-th same-named scope of a kind is ordinal k)
const scopeLineIdx = new WeakMap();
function scopeLineMap(part) { let m = scopeLineIdx.get(part);
  if (!m) { m = new Map(); for (const [rel, list] of Object.entries(part.fileScopes || {})) { const occ = new Map(); for (const [kind, name, line, endLine] of list) { const k = rel + '#' + kind + '#' + name; const o = occ.get(k) || 0; occ.set(k, o + 1); m.set(k + (o ? '#' + o : ''), [line, endLine ?? null]); } } scopeLineIdx.set(part, m); }
  return m; }
export function scopeLine(part, key) { return scopeLineMap(part).get(key)?.[0] ?? null; }
// the endLine for a scope key, or null when absent or equal to its own line (nothing worth a range for)
export function scopeLineEnd(part, key) { const v = scopeLineMap(part).get(key); if (!v) return null; const [line, endLine] = v; return (endLine == null || endLine <= line) ? null : endLine; }
// a pointer into the tree, as precise as the scope's own range allows: `file:line` for a single-line scope (or one
// with no endLine on record), `file:line–endLine` (en dash) for a multi-line one — never a redundant `:line–line`
export function ptr(rel, line, endLine) { return (endLine == null || endLine <= line) ? `${rel}:${line}` : `${rel}:${line}–${endLine}`; }
export const skeyR = (rel, s) => rel + '#' + s.kind + '#' + s.name + (s.ord ? '#' + s.ord : ''); // scope identity key (ordinal only when non-zero)
// a node type belongs to a grammar: a C# `invocation_expression` surface says nothing about a TypeScript method (measured on a
// C#+TS repo: "methods here never contain an `invocation_expression` — 100% of 53" on the TypeScript client). Out of the
// grammar's vocabulary ⇒ the surface is undecidable for that scope, not false.
const inGrammar = (s, nt) => { if (!s.g) return true; const b = bindings[s.g]; return !b || b.nodeTypes.has(nt); };
export function applyVocab(s, vb) {
  if (BODY_KINDS.has(s.kind) && !s.noBody) { for (const nt of vb.NT) if (inGrammar(s, nt)) s.preds['auto.has:' + nt] = s.seen.has(nt) ? 'true' : 'false';
    for (const c of vb.CALL) s.preds['auto.call:' + c] = s.calls.has(c) ? 'true' : 'false';
    for (const sh of vb.SHAPE) if (inGrammar(s, sh.split('(')[0])) s.preds['auto.stshape:' + sh] = s.shapes.has(sh) ? 'true' : 'false'; }
  // applicability domains, learned from the partition itself: decorations / heritage / declared return types are decidable
  // only for node types seen carrying one (a TS interface is never decorated, so "types here are annotated with @Handler"
  // must be counted over classes, not over classes+interfaces; a method extends nothing at all)
  const inDom = (list, nt) => !list || !nt || list.includes(nt);
  if (s.kind !== 'file' && inDom(vb.DNT, s.nt)) for (const d of vb.DECO) s.preds['auto.deco:' + (d.startsWith('[') ? d : '@' + d)] = s.decos.includes(d) ? 'true' : 'false';
  if (s.kind === 'type' && inDom(vb.ENT, s.nt)) for (const e of vb.EXT) s.preds['auto.extends:' + e] = s.sup.includes(e) ? 'true' : 'false';
  if (s.kind === 'method' && inDom(vb.RNT, s.nt)) for (const r of (vb.RET || [])) s.preds['auto.returns:' + r] = (s.rets || []).includes(r) ? 'true' : 'false';
  if (s.kind === 'method' && inDom(vb.PNT, s.nt)) for (const r of (vb.PT || [])) s.preds['auto.ptype:' + r] = (s.ptypes || []).includes(r) ? 'true' : 'false';
  if (s.kind === 'file') { for (const i of vb.IMP) s.preds['auto.imp:' + i] = s.imports.includes(i) ? 'true' : 'false';
    if (vb.LEX) { const dom = vb.LEX[s.g || ''] || []; for (const pid of Object.keys(s.preds)) if (pid.startsWith('auto.lex:') && !dom.includes(pid)) delete s.preds[pid]; } } }
export const isBool = pid => /^auto\.(has|call|deco|extends|imp|stshape|returns|ptype):/.test(pid);
// structural-shape facts (node-type presence, statement shapes, first statement, return shape, arity, local-variable
// shape): the null-model family that speaks only as a local contrast, never repo-wide — shared by mine() (the contrast
// gate) and report() (the presentation split), so the two never drift apart on what counts as "just syntax". `ret`
// here is the return-SHAPE fact (the first return statement's own child node type — `identifier`, `call_expression`,
// `bare`) — NOT the declared return-TYPE fact `auto.returns:`, which is a domain/semantic marker (§022, on par with
// `auto.extends:`/`auto.deco:`/`auto.ptype:`, none of which are in this family) and MUST be free to certify `_all:`.
// `(?=:|$)` is load-bearing: without it, unanchored `ret` prefix-matches `auto.returns:...` too, silently barring
// every declared-return-type fact in every language from ever certifying repo-wide (§022 — bug since inception,
// found only after 021 gave C# `rets` for the first time and the missing `_all:` return-type fact stood out).
export const STRUCT_PID = /^auto\.(has|stshape|varshape|first1|ret|arity)(?=:|$)/;
export const BODY_KINDS = new Set(['method', 'catch', 'finally', 'case']); // kinds whose bodies carry behaviour surfaces
export const jac = (A0, B0) => { const A = A0 instanceof Set ? A0 : new Set(A0), B = B0 instanceof Set ? B0 : new Set(B0);
  let i = 0; const [s, l] = A.size < B.size ? [A, B] : [B, A]; for (const x of s) if (l.has(x)) i++; const u = A.size + B.size - i; return u ? i / u : 0; };
// weighted Jaccard over role feature bags: a decorator, a supertype or a declared return type is a MARKER of what a scope is
// (3×); a name token is a hint (1×). Measured on the fixture: unweighted bags split `CreateXHandler`/`CancelXHandler` into
// four verb-groups that the clone-aware runner-up could not reunite, and a deviant handler fell between them as ambiguous.
const featW = f => (f.startsWith('dec:') || f.startsWith('sup:') || f.startsWith('ret:')) ? 3 : 1;
export const jacW = (A0, B0) => { const A = A0 instanceof Set ? A0 : new Set(A0), B = B0 instanceof Set ? B0 : new Set(B0);
  let i = 0, u = 0; for (const x of A) { const w = featW(x); u += w; if (B.has(x)) i += w; } for (const x of B) if (!A.has(x)) u += featW(x); return u ? i / u : 0; };
// a role-scoped NORM whose pid's own feature already sits in the group's medoid bag: the marker that FORMED the
// group at featW's 3× weight, so every certified member holds it BY CONSTRUCTION. Unanimity here is not a followed
// convention, it is the group's own definition read back (§003 resolution — measured 82%/55%/33%/100% of role
// facts across four partitions in three repos are exactly this). Shared by factTiers (report/rulesMarkdown, which
// SUPPRESSES these from the listing) and checkFile (which does NOT suppress — see the `defining` field on
// `governed`, spoken as a clause instead).
export function isDefiningFact(medoids, f) {
  if (!/^r\d/.test(f.cid) || f.exp !== 'true') return false;
  const md = medoids && medoids[+f.cid.slice(1).split(':')[0]]; if (!md) return false;
  const m = /^auto\.(deco|extends|returns):@?(.+)$/.exec(f.pid); if (!m) return false;
  const pre = { deco: 'dec', extends: 'sup', returns: 'ret' }[m[1]];
  return md.feats.includes(pre + ':' + m[2]) || md.feats.includes(pre + ':' + m[2].replace(/^\[|\]$/g, ''));
}
// hasOwnProperty: model JSON counts are plain objects — a value literally named "constructor" must read 0, not Object.prototype.constructor
export const kt = (c, K, x, n) => (((Object.prototype.hasOwnProperty.call(c, x) ? c[x] : 0) || 0) + 0.5) / (n + K / 2);

// file-level lineage over `H.fps`: `H.lc`'s keys are rewritten FORWARD on a rename (history.mjs moves the row to the
// new path and DELETES the old key), so a historical path is simply absent from it and cannot be looked up there.
// The usable old→new mapping is `fps[*].renames`, which records both sides of every code-file rename. Returns the
// resolver `historical path → the path that file lives at today`; `live` is every path alive at HEAD.
export function currentPathOf(fps, live) {
  const renamedTo = new Map(); for (const fp of fps) for (const [o, n] of fp.renames || []) renamedTo.set(o, n);
  return rel => { let cur = rel; for (let i = 0; i < 20 && !live.has(cur) && renamedTo.has(cur); i++) cur = renamedTo.get(cur); return cur; }; }

// one change-archetype cell, rendered for a reader (§J4.1): a module path and a file suffix name themselves, while a
// role group is only an index until its medoid's own label speaks for it. Partition names may contain `#`, so the
// role index is split off the END of the key.
export function archCellLabel(model, cell) { const v = cell.slice(2);
  if (cell.startsWith('m:')) return v + '/';
  if (cell.startsWith('k:')) return '*.' + v;
  const i = v.lastIndexOf('#'); const p = (model.partitions || []).find(x => x.name === v.slice(0, i));
  return `«${(p && p.medoids[+v.slice(i + 1)] || {}).label || 'group'}»`; }
// strongest share first, then the evidence that earned it; ties broken by what a reader can name without a lookup
// (a module, then a suffix, then a role group), so the label a shape carries is stable and reads as a place
const CELL_RANK = { m: 0, k: 1, g: 2 };
const archCellSort = (a, b) => b.share - a.share || b.bits - a.bits || CELL_RANK[a.cell[0]] - CELL_RANK[b.cell[0]] || (a.cell < b.cell ? -1 : a.cell > b.cell ? 1 : 0);

// ===== CLUSTERING =====
// The generic half of role induction (§J4.1): bucket identical feature bags, cap the sample, agglomerate by weighted
// Jaccard under an MDL stop, and pick each surviving cluster's medoid. Everything SCOPE-specific stays with the
// caller — which items are eligible, how a cluster is labelled, and how the rest of the population is assigned to
// the medoids — because none of it survives a change of subject: a commit footprint has no `kind`/`ownCount` to
// filter on, carries no `tok:`/`dec:`/`sup:` features to be named from, and is not a scope `assignAll` can place.
// `induceRoles` clusters scopes; `learn`'s change-archetype pass clusters commit footprints; they share this and
// nothing else.
export function induceClusters(items, { feats, w = () => 1 }) {
  // pre-bucket identical feature bags before sampling: identical twins can never be split by the sample cap,
  // and effective clustering capacity rises from NCAP items to NCAP *distinct bags*
  const buckets = new Map(); for (const g of items) { const sig = [...feats(g)].sort().join(S); (buckets.get(sig) || buckets.set(sig, []).get(sig)).push(g); }
  let reps = [...buckets.values()];
  if (reps.length > NCAP) { const st = reps.length / NCAP; const rs = []; for (let k = 0; k < NCAP; k++) rs.push(reps[Math.floor(k * st)]); reps = rs; }
  const N = reps.length; const W = reps.map(r => r.reduce((a, x) => a + w(x), 0));
  if (W.reduce((a, b) => a + b, 0) < 12) return { clusters: [] };
  const SA = reps.map(r => feats(r[0])); const D = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const d = 1 - jacW(SA[i], SA[j]); D[i * N + j] = D[j * N + i] = d; }
  const act = new Set(Array.from({ length: N }, (_, i) => i)); const mem = Array.from({ length: N }, (_, i) => [i]); const size = new Float64Array(N); for (let i = 0; i < N; i++) size[i] = W[i];
  const cdl = m => { const nc = m.reduce((a, x) => a + W[x], 0); const cnt = new Map(); for (const x of m) for (const f of SA[x]) cnt.set(f, (cnt.get(f) || 0) + W[x]);
    let dl = 0; for (const [, c] of cnt) { const p = c / nc; const h = p >= 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)); dl += nc * h + 0.5 * Math.log2(Math.max(nc, 2)); } return dl; };
  const dls = mem.map(cdl); let sum = dls.reduce((a, b) => a + b, 0);
  let bestDL = sum + act.size * Math.log2(N), best = [...act].map(i => [...mem[i]]);
  while (act.size > 1) { let bi = -1, bj = -1, bd = Infinity; const A = [...act];
    for (let x = 0; x < A.length; x++) for (let y = x + 1; y < A.length; y++) { const d = D[A[x] * N + A[y]]; if (d < bd) { bd = d; bi = A[x]; bj = A[y]; } }
    for (const k of act) { if (k === bi || k === bj) continue; D[bi * N + k] = D[k * N + bi] = (size[bi] * D[bi * N + k] + size[bj] * D[bj * N + k]) / (size[bi] + size[bj]); }
    mem[bi] = mem[bi].concat(mem[bj]); size[bi] += size[bj]; act.delete(bj);
    sum -= dls[bi] + dls[bj]; dls[bi] = cdl(mem[bi]); sum += dls[bi];
    const t = sum + act.size * Math.log2(N); if (t < bestDL) { bestDL = t; best = [...act].map(i => [...mem[i]]); } }
  const D0 = (i, j) => i === j ? 0 : 1 - jacW(SA[i], SA[j]);
  return { clusters: best.filter(m => m.reduce((a, x) => a + W[x], 0) >= 3).map(m => { let b = m[0], bs = Infinity;
    for (const i of m) { let s2 = 0; for (const j of m) s2 += W[j] * D0(i, j); if (s2 < bs) { bs = s2; b = i; } }
    return { members: m.flatMap(i => reps[i]), weight: m.reduce((a, x) => a + W[x], 0), medoid: reps[b][0] }; }) }; }

// ===== ROLES =====
export function induceRoles(ps) {
  const el = []; ps.forEach((s, i) => { if (s.kind !== 'file' && s.kind !== 'module' && s.ownCount >= 2) el.push(i); });
  const { clusters } = induceClusters(el, { feats: i => ps[i].feats });
  const medoids = clusters.map(c => {
    // label (display only): the three name/decorator/supertype features most shared across the cluster, not the medoid's
    // first three — a medoid named `AddressGuard` would otherwise label the whole guard role "address+guard+CanActivate"
    const fc = new Map(); for (const i of c.members) for (const f of ps[i].feats) if (/^(tok|dec|sup|own):/.test(f)) fc.set(f, (fc.get(f) || 0) + 1);
    // the label may only name what a MAJORITY carries — 3 of 9 members' @UseGuards must not baptize the group
    const label = [...fc].filter(([, w2]) => w2 >= c.weight / 2).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 3).map(([f]) => f.slice(4)).join('+') || 'group';
    return { feats: ps[c.medoid].feats, label }; });
  const { assign, amb } = assignAll(ps, medoids);
  return { assign, amb, medoids }; }
export function assignAll(ps, medoids) { const assign = new Map(), amb = new Set(), scores = new Map();
  ps.forEach((s, i) => { if (s.kind === 'file' || s.kind === 'module' || s.ownCount < 2 || !medoids.length) return;
    let b = -1, m1 = -1;
    medoids.forEach((md, k) => { const m = jacW(s.feats, md.feats); if (m > m1) { m1 = m; b = k; } });
    if (b < 0) return; // unreachable once `!medoids.length` above already bailed — defensive only
    // the gap runner-up must be a genuinely DIFFERENT role: a near-clone of the best medoid
    // (two clusters of the same latent role surviving the cut) must not manufacture ambiguity
    let m2 = -1, b2 = -1; medoids.forEach((md, k) => { if (k === b || jacW(medoids[b].feats, md.feats) >= 0.6) return; const m = jacW(s.feats, md.feats); if (m > m2) { m2 = m; b2 = k; } });
    // (§003 B) the live nearest/next-nearest medoid this run computed, kept regardless of whether the scope clears
    // CFG.minMemb — checkFile's new-scope disclosure is the only consumer; `assign`/`amb` below are unaffected and
    // unchanged from before this field existed
    scores.set(i, { best: b, m1, second: b2, m2 });
    if (m1 <= 0) return;
    if (m1 < CFG.minMemb || m1 - m2 < CFG.ambGap) amb.add(i);
    assign.set(i, b); });
  return { assign, amb, scores }; }

// ===== MINING (v5 math + seeds + survived-raw + role_lift) =====
// candidate count for the index cost: cells with ≥ minRaw raw instances — counted the same way mine() counts them
export function countCandidates(ps, ri) { return mine(ps, ri, () => 1, [], null, null, { countOnly: true }).C; }
export function mine(ps, ri, wfn, seeds, ageFn, dbg, { countOnly = false, idxCostOverride = null } = {}) {
  const cells = new Map(); const alph = new Map();
  const add = (cid, pid, v, w, rw, gi, surv) => { const k = cid + S + pid; let c = cells.get(k);
    if (!c) { c = { counts: Object.create(null), raw: Object.create(null), sraw: Object.create(null), members: Object.create(null) }; cells.set(k, c); }
    c.counts[v] = (c.counts[v] || 0) + w; c.raw[v] = (c.raw[v] || 0) + rw; if (surv) c.sraw[v] = (c.sraw[v] || 0) + rw;
    if (gi >= 0) (c.members[v] ||= []).push(gi);
    let a = alph.get(pid); if (!a) { a = new Set(); alph.set(pid, a); } a.add(v); };
  // directory contexts (pattern locality below the partition): ancestor dirs holding ≥ dirMin scopes of a kind,
  // but fewer than the whole partition — a proper spatial sub-community that can carry its own local default
  const dirsOf = rel => { const segs = rel.split('/').slice(0, -1); const out2 = []; for (let k = 1; k <= segs.length; k++) out2.push(segs.slice(0, k).join('/')); return out2; };
  const dirCount = new Map();
  for (const s of ps) for (const d of dirsOf(s.rel)) { const k = d + S + s.kind; dirCount.set(k, (dirCount.get(k) || 0) + 1); }
  const kindTotal = new Map(); for (const s of ps) kindTotal.set(s.kind, (kindTotal.get(s.kind) || 0) + 1);
  const dirEligible = k => dirCount.get(k) >= CFG.dirMin && dirCount.get(k) < kindTotal.get(k.split(S)[1]);
  ps.forEach((s, i) => { const w = wfn(s); const surv = ageFn ? ageFn(s) >= CFG.freshDays : true;
    for (const [pid, v] of Object.entries(s.preds)) {
      add('_all:' + s.kind, pid, v, w, 1, i, surv);
      const r = ri.assign.get(i); if (r !== undefined) add('r' + r + ':' + s.kind, pid, v, w * (ri.amb.has(i) ? 0.5 : 1), ri.amb.has(i) ? 0 : 1, ri.amb.has(i) ? -1 : i, surv);
      for (const d of dirsOf(s.rel)) if (dirEligible(d + S + s.kind)) add('d[' + d + ']:' + s.kind, pid, v, w, 1, i, surv); } });
  // seeds: pid-scoped pseudo-counts, capped at 0.5 × n_eff_real of the cell
  const seedMarks = new Map(); // cid\x01pid → [{ id, v }]: which value a maintainer seeded in that cell
  for (const sd of seeds || []) { const gi = ps.findIndex(s => s.rel === sd.path && s.name === sd.name);
    if (gi < 0) continue; const s = ps[gi]; const r = ri.assign.get(gi);
    // a seeded surface carries its correlated surfaces along: the statement shape of `validate(cmd)` has the same opposing
    // population as `calls validate`, and a seed on one that left the other untouched would resurface the retired rule as a
    // "sibling surface" deviation (measured on the fixture). Correlation = the members that hold the majority value on P
    // are the members that hold the majority value on Q (Jaccard ≥ 0.9), in the exemplar's partition-wide cell.
    const opposing = (cid, pid, v) => { const c = cells.get(cid + S + pid); if (!c) return null; const out2 = new Set(); for (const [x, gis] of Object.entries(c.members)) if (x !== v) for (const g2 of gis) out2.add(g2); return out2; };
    const pids = new Set(sd.pids);
    for (const pid of sd.pids) { const v = s.preds[pid]; if (v === undefined) continue; const oppP = opposing('_all:' + s.kind, pid, v); if (!oppP || oppP.size < CFG.minRaw) continue;
      for (const [q, vq] of Object.entries(s.preds)) { if (pids.has(q) || /^auto\.dir\d/.test(q)) continue; const oppQ = opposing('_all:' + s.kind, q, vq); if (oppQ && oppQ.size >= CFG.minRaw && jac(oppP, oppQ) >= 0.9) pids.add(q); } }
    for (const pid of pids) { const v = s.preds[pid]; if (v === undefined) continue;
      // the exemplar's partition-wide cell, its group cell and its directory cells (a steer is usually local: "handlers under src/routes/")
      const cids = ['_all:' + s.kind, ...(r !== undefined ? ['r' + r + ':' + s.kind] : []), ...dirsOf(s.rel).filter(d => dirEligible(d + S + s.kind)).map(d => 'd[' + d + ']:' + s.kind)];
      // a RETIREMENT (the exemplar does not carry the surface: value 'false') must also reach every cell where the retired
      // rule fires as 'true' — the old majority lives in its own group's cell, which the exemplar is no member of
      if (v === 'false' && isBool(pid)) for (const [k2, c2] of cells) { const [cid2, pid2] = k2.split(S);
        if (pid2 !== pid || cid2.split(':')[1] !== s.kind || cids.includes(cid2)) continue;
        let exp2 = null, ne2 = -1; for (const [x, n2] of Object.entries(c2.counts)) if (n2 > ne2) { exp2 = x; ne2 = n2; }
        if (exp2 === 'true') cids.push(cid2); }
      for (const cid of cids) {
        const c = cells.get(cid + S + pid); if (!c) continue;
        const neffReal = Object.values(c.counts).reduce((a, b) => a + b, 0);
        add(cid, pid, v, Math.min(sd.weight, 0.5 * neffReal), 0, -1, false);
        (seedMarks.get(cid + S + pid) || seedMarks.set(cid + S + pid, []).get(cid + S + pid)).push({ id: sd.id, v }); } } }
  let C = 0; for (const [, c] of cells) if (Object.values(c.raw).reduce((a, b) => a + b, 0) >= CFG.minRaw) C++;
  if (countOnly) return { facts: [], C, idxCost: 0 };
  // index cost = log2(C₂) over the candidate count of the WHOLE repository (§9.4a) — counted once across partitions, never per partition
  const idxCost = idxCostOverride ?? Math.ceil(Math.log2(Math.max(C, 2)));
  let out = [];
  for (const [key, cell] of cells) {
    const [cid, pid] = key.split(S); const kind = cid.split(':')[1]; const isAll = cid.startsWith('_all');
    const raw = Object.values(cell.raw).reduce((a, b) => a + b, 0); const neff = Object.values(cell.counts).reduce((a, b) => a + b, 0);
    if (raw < CFG.minRaw || neff < CFG.minEff) continue;
    const bl = isBool(pid); const Vv = bl ? ['true', 'false'] : [...alph.get(pid)].sort(); const K = bl ? 2 : Vv.length + 1;
    const allCell = isAll ? cell : cells.get('_all:' + kind + S + pid);
    const allN = allCell ? Object.values(allCell.counts).reduce((a, b) => a + b, 0) : neff;
    let data = 0;
    if (isAll) { const B = Math.max(bl ? 2 : Vv.length, 2); for (const v of Vv) { const nv = cell.counts[v] || 0; if (nv) data += nv * Math.log2(kt(cell.counts, K, v, neff) * B); } }
    else for (const v of Vv) { const nv = cell.counts[v] || 0; if (nv) data += nv * Math.log2(kt(cell.counts, K, v, neff) / kt(allCell.counts, K, v, allN)); }
    const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(neff, 2)) - idxCost;
    if (dbg && pid.includes(dbg)) console.error(`[dbg] ${cid} ${pid} raw=${raw} neff=${neff.toFixed(1)} data=${data.toFixed(1)} bits=${bits.toFixed(1)} counts=${JSON.stringify(cell.counts)} sraw=${JSON.stringify(cell.sraw)}`);
    if (bits <= 0) continue; // evidence = codelength gain, nothing else
    let exp = null, ne = -1; for (const v of Vv) { const c = cell.counts[v] || 0; if (c > ne) { exp = v; ne = c; } }
    // the DECISION: name `exp` only when the KT posterior predictive bounds the error at 1 in λ — the one loss constant
    const tau = Math.log2(CFG.lambda);
    if (!((ne + 0.5) / (neff + K / 2) >= 1 - 1 / CFG.lambda)) continue;
    const sraw = Object.values(cell.sraw).reduce((a, b) => a + b, 0);
    const srawShare = sraw >= CFG.minRaw ? (cell.sraw[exp] || 0) / sraw : -1;
    // the PRINTED population must clear the same bound: survival weights must not carry a claim its own display denies
    if (sraw < CFG.minRaw || !(((cell.sraw[exp] || 0) + 0.5) / (sraw + K / 2) >= 1 - 1 / CFG.lambda)) continue;
    if (bl && isAll && exp === 'false' && !(cell.raw['true'] > 0)) continue;   // vacuous (§9.4d): "never X" when nothing here ever X-ed is a non-choice; an all-true fact is a real convention
    if (/^auto\.dir\d/.test(pid) && !/^r\d/.test(cid)) continue;                // placement is group-only (a dir context "predicting" its own path is tautology)
    if (!bl && ['other', 'none', 'mixed', '?'].includes(exp)) continue;         // fallback buckets never expected
    let parentExp = null; // the enclosing context's default, for locality-contrast messaging
    if (!isAll && allCell) { let pe = null, pn = -1; for (const v of Object.keys(allCell.counts)) { if (allCell.counts[v] > pn) { pe = v; pn = allCell.counts[v]; } } parentExp = pe; }
    const marks = seedMarks.get(key) || []; // a fact agreeing with a seed is `seeded`; one that a seed argues against is `contested` (its deviants toward the seeded value stand down)
    out.push({ cid, pid, exp, kind, bpi: data / neff, raw, sraw, srawShare, tau, parentExp, seeded: marks.filter(m => m.v === exp).map(m => m.id), contested: marks.find(m => m.v !== exp) || null,
      counts: cell.counts, srawCounts: cell.sraw, alphabet: Vv, conform: cell.members[exp] || [],
      deviants: Vv.filter(v => v !== exp).flatMap(v => (cell.members[v] || []).map(gi => ({ gi, v }))) }); }
  // structural facts (node-type presence, statement shapes, first statement, return shape, arity, local-variable shape) speak
  // only as a CONTRAST: in a group or directory whose default differs from the partition's. Repo-wide, "methods here always
  // contain a member_expression — 90% of 1758" and "methods here take 0 parameters" describe the language, not a choice
  // anyone made (measured: they were the remaining "conforms to"/"pre-existing" noise on express after every other gate)
  out = out.filter(f => !STRUCT_PID.test(f.pid) || (!f.cid.startsWith('_all') && f.parentExp !== null && f.parentExp !== f.exp));
  // absence facts are boundaries, not rarity: "files here do not import `re` — 60/65" is the base rate of a rare import, not a
  // rule anyone holds (measured across the corpus: most absence speech was this). Keep an absence fact only where the thing
  // is a real choice — accepted as PRESENT in another cell of the same kind, or used by ≥ 20% of the kind partition-wide.
  const presentSomewhere = new Set(out.filter(f => isBool(f.pid) && f.exp === 'true').map(f => f.kind + S + f.pid));
  const partitionTrueShare = (kind, pid) => { const c = cells.get('_all:' + kind + S + pid); if (!c) return 0; const tot = Object.values(c.raw).reduce((a, b) => a + b, 0); return tot ? (c.raw['true'] || 0) / tot : 0; };
  // a local (group/directory) absence is a boundary only against something COMMON in the partition (≥ 30% of the kind use it);
  // a partition-wide absence only when some group/directory is accepted with it present and it is not vanishingly rare
  out = out.filter(f => !(isBool(f.pid) && f.exp === 'false') || (f.cid.startsWith('_all') ? presentSomewhere.has(f.kind + S + f.pid) && partitionTrueShare(f.kind, f.pid) >= 0.1 : partitionTrueShare(f.kind, f.pid) >= 0.3));
  // redundant-refinement filter: a dir fact agreeing with its parent's default while an accepted `_all`
  // fact already states it repo/package-wide is not local information — it would only re-say the general rule
  const allAccepted = new Set(out.filter(f => f.cid.startsWith('_all')).map(f => f.kind + S + f.pid + S + f.exp));
  let pruned = out.filter(f => !(f.cid.startsWith('d[') && f.exp === f.parentExp && allAccepted.has(f.kind + S + f.pid + S + f.exp)));
  // nested same-default refinement: if a shallower dir already states (kind,pid,exp), a deeper dir restating it adds nothing
  const dirOfCid = cid => cid.slice(2, cid.indexOf(']'));
  const keptDirs = new Map(); // kind\x01pid\x01exp -> [dirs kept]
  pruned = pruned.sort((a, b) => (a.cid.startsWith('d[') ? dirOfCid(a.cid).length : 0) - (b.cid.startsWith('d[') ? dirOfCid(b.cid).length : 0)).filter(f => {
    if (!f.cid.startsWith('d[')) return true;
    const k = f.kind + S + f.pid + S + f.exp, d = dirOfCid(f.cid);
    const kept = keptDirs.get(k) || [];
    if (kept.some(kd => d.startsWith(kd + '/'))) return false;
    kept.push(d); keptDirs.set(k, kept); return true; });
  const groups = [];
  const famOf = pid => pid.slice(0, pid.indexOf(':') + 1 || pid.length); // same-family only: an identical conform set across
  // DIFFERENT families (a pure region where every file obeys everything) is independent claims, not restatement
  for (const c of pruned.sort((a, b) => b.bpi - a.bpi || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0))) { let pl = false;
    for (const g of groups) if (g.cid === c.cid && famOf(g.lead.pid) === famOf(c.pid) && jac(new Set(g.lead.conform), new Set(c.conform)) >= 0.9) { g.surfaces.push(c); pl = true; break; }
    if (!pl) groups.push({ cid: c.cid, lead: c, surfaces: [c] }); }
  // sibling surfaces (same conform set, deduped out of speech) travel with the lead so `check` can still see a deviation on
  // any of them — "returns boolean" and "returns the literal true" share a conform set, but only the second catches `return false`
  return { facts: groups.map(g => ({ ...g.lead, nSurfaces: g.surfaces.length, siblings: g.surfaces.slice(1).map(c => ({ pid: c.pid, exp: c.exp, counts: c.counts, srawCounts: c.srawCounts, alphabet: c.alphabet, tau: c.tau })) })), C, idxCost }; }
// the deviants worth naming: largest preference gap first, at most five — `where` says what NOT to copy, `check` what the
// neighbours got wrong, without loading every scope
export function topDeviants(f, ps, max = 5) {
  const gc = f.srawCounts || f.counts;
  const neff = Object.values(gc).reduce((a, b) => a + b, 0); const K = isBool(f.pid) ? 2 : f.alphabet.length + 1;
  return f.deviants.map(({ gi, v }) => { const known = f.alphabet.includes(v); const d = Math.log2(kt(gc, K, f.exp, neff) / kt(gc, K, known ? v : UNSEEN, neff)); return { rel: ps[gi].rel, line: ps[gi].line, endLine: ps[gi].endLine || ps[gi].line, name: ps[gi].name, obs: v, gap: +d.toFixed(2) }; })
    .sort((a, b) => b.gap - a.gap || (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line)).slice(0, max); }
// a marker family's carrier count, repo-wide — the SAME `>= 3 carriers` gate `learn()` uses to decide a decorator /
// supertype / declared return type is a real marker worth indexing at all (search "markers: every decorator"),
// replicated here (not imported) because at this call site the fact is still the raw mine() output, mined before
// `learn()` builds its `markers` map for the partition.
const MARKER_ARR = { deco: 'decos', extends: 'sup', returns: 'rets' };
const markerCarriers = (ps, fam, name) => { let n = 0;
  for (const s of ps) { if (s.kind === 'file' || s.kind === 'module') continue;
    const arr = fam === 'extends' ? (s.kind === 'type' ? s.sup : []) : (fam === 'deco' ? s.decos : (s.rets || []));
    if (arr && arr.includes(name)) n++; }
  return n; };
// two markers behave like ALTERNATIVES on this population when: an accepted "carries X" fact's deviants overwhelmingly
// carry one OTHER same-family marker instead (an equally deliberate way to say the same thing grain has no name-based
// way to equate — `[Produces(Type=...)]` vs `[ProducesResponseType]`, confirmed by a field report), that alternative
// clears the same repo-wide marker bar X itself had to clear, and it is rare among X's own conforming population (a
// real two-way split, not "deviants happen to also carry a common unrelated tag most conformers carry too").
export function altMarkerFor(f, ps) {
  const m = /^auto\.(deco|extends|returns):@?(.+)$/.exec(f.pid);
  if (!m || f.exp !== 'true' || !f.deviants || !f.deviants.length) return null;
  const fam = m[1], own = m[2], arrKey = MARKER_ARR[fam];
  const cand = new Map();
  for (const { gi } of f.deviants) { const arr = ps[gi] && ps[gi][arrKey]; if (!arr) continue;
    for (const x of new Set(arr)) { if (x === own) continue; cand.set(x, (cand.get(x) || 0) + 1); } }
  if (!cand.size) return null;
  let alt = null, n = -1; for (const [x, c] of cand) if (c > n) { alt = x; n = c; }
  const ofDeviants = f.deviants.length;
  // (b) supermajority of the deviants: placementHit's own bar for "dominant pattern, not noise" (n / T.length >= 2/3)
  if (n / ofDeviants < 2 / 3) return null;
  // clears the SAME >= 3 carriers gate any other marker in this repo must clear (learn()'s marker-building block)
  if (markerCarriers(ps, fam, alt) < 3) return null;
  // (c) rare among the fact's own conforming population: mine()'s own absence-boundary floor (0.1), inverted — below
  // it, not above, since here we want the complement to be clean, not overlapping noise
  const confCarriers = f.conform.reduce((a, gi) => a + (ps[gi] && ps[gi][arrKey] && ps[gi][arrKey].includes(alt) ? 1 : 0), 0);
  if (f.conform.length && confCarriers / f.conform.length >= 0.1) return null;
  return { pid: 'auto.' + fam + ':' + alt, name: alt, n, ofDeviants };
}
// when the rule was born, when it was last reinforced, how often the history repaired toward it or departed from it
export function heldSummary(f, ps, H) {
  let since = Infinity, last = 0, lastDev = 0, repairs = 0, departures = 0;
  for (const gi of f.conform) { const L = H.lc.get(skeyR(ps[gi].rel, ps[gi])); if (!L) continue; since = Math.min(since, L.first); last = Math.max(last, L.last); }
  for (const { gi } of f.deviants) { const L = H.lc.get(skeyR(ps[gi].rel, ps[gi])); if (L) lastDev = Math.max(lastDev, L.last); }
  for (const gi of f.conform.concat(f.deviants.map(d => d.gi))) { const evs = H.vev.get(skeyR(ps[gi].rel, ps[gi])); if (!evs) continue; let prev;
    for (const e of evs) { const v = valOf(f.pid, e.val); if (v === undefined) continue; if (prev !== undefined && prev !== v) { if (v === f.exp) repairs++; else if (prev === f.exp) departures++; } prev = v; } }
  const ym = ts => ts && ts !== Infinity ? new Date(ts * 1000).toISOString().slice(0, 7) : null;
  return { since: ym(since), lastReinforced: ym(last), lastDeviation: ym(lastDev), repairs, departures }; }
// bus-factor signal for an accepted fact: does it rest on many contributors (durable) or effectively one (a risk if
// they leave)? Each conforming scope is credited to whoever last WROTE the current value — the last event in its
// vev array whose decoded value equals f.exp, walked forward exactly like `calibrate` walks its events (never the
// scope's creator, unless creation is also the last matching event — the common case, and the whole point: an
// untouched-since-birth scope has no "later" author to prefer over the one it already has). A scope with no
// matching event (never recorded, or f.pid outside valOf's supported families) contributes no author at all —
// never fabricated. Silent (null) below CFG.minRaw credited instances, or when no author reaches the SAME 2/3
// supermajority bar `placementHit`/`altMarkerFor` already use for "dominant pattern, not incidental."
export function authorConcentration(f, ps, H) {
  const counts = new Map(); let credited = 0;
  for (const gi of f.conform) { const evs = H.vev.get(skeyR(ps[gi].rel, ps[gi])); if (!evs) continue;
    let author; for (const e of evs) { const v = valOf(f.pid, e.val); if (v === undefined) continue; if (v === f.exp) author = e.author; }
    if (author === undefined) continue;
    credited++; counts.set(author, (counts.get(author) || 0) + 1); }
  if (credited < CFG.minRaw) return null;
  let topAuthorHash = null, topCount = 0;
  for (const [a, c] of counts) if (c > topCount) { topCount = c; topAuthorHash = a; }
  if (topCount / credited < 2 / 3) return null;
  return { distinctAuthors: counts.size, credited, topCount, topShare: +(topCount / credited).toFixed(2), topAuthorHash }; }
// Four voices, one marker each. Every line grain prints as a CLAIM says which of four kinds of thing it is, marked
// identically in every command, so a reader never has to infer authority from wording: practiced — the statistical
// claim, the default, the ONLY voice allowed to carry no marker at all; decided — a maintainer's committed override
// (steer or boundary), which the numbers may still contradict, and that is the point; example — one real historical
// instance, cited by the commit it comes from, never a certified convention; map — a structural overview of where
// things live, not an assertion about how they are written. Headers, stamps and continuation lines are structure,
// not claims: they never pass through here.
export function voice(kind, text, meta = {}) {
  switch (kind) {
    case 'practiced': return text;
    case 'decided': { const who = [meta.who, meta.when].filter(Boolean).join(' ');
      const paren = meta.id ? [`id ${meta.id}`, who].filter(Boolean).join(', ') : who;
      return `decision ${meta.typ} (${paren}): ${text}`; }
    case 'example': { const cite = [meta.sha, meta.date].filter(Boolean).join(' '); return `example${cite ? ` (${cite})` : ''}: ${text}`; }
    case 'map': return `map: ${text}`;
    default: throw new Error(`voice: unknown kind "${kind}"`); } }
// the report/where phrase for an author-concentration verdict — counts and shares only, never the hash itself
export function authorConcClause(ac) { return !ac ? null : ac.distinctAuthors === 1 ? '1 author' : `mostly one author (${ac.topCount} of ${ac.credited})`; }
// one clause of calibration for a spoken convention: how it moved, and since when it has held
export function factNotes(f) { const out = [];
  if (f.contested) out.push(`superseded by maintainer decision ${f.contested} — see the steer line / \`grain report\``);

  if (f.trend && f.trend.shares && f.trend.shares.length >= 2) { const a = pct(f.trend.shares[0].share), b = pct(f.trend.shares[f.trend.shares.length - 1].share); if (Math.abs(a - b) >= 10) out.push(`trend ${a}>${b}%`); }
  if (f.suppressedValue && !f.contested) out.push(`a newer pattern is emerging: ${f.suppressedValue}`); // when contested, the superseded note already says it
  if (f.held && f.held.since) out.push(`held since ${f.held.since}${f.held.lastReinforced && f.held.lastReinforced !== f.held.since ? `, last reinforced ${f.held.lastReinforced}` : ''}${f.held.repairs ? `, ${f.held.repairs} repair${f.held.repairs > 1 ? 's' : ''} toward it` : ''}${f.held.departures ? `, ${f.held.departures} departure${f.held.departures > 1 ? 's' : ''}` : ''}`);
  // what deviating from it has cost so far. `baseK === 0` cannot happen while the base population CONTAINS the
  // deviants (baseK >= k >= 1 whenever the cell speaks at all); the branch is here so that narrowing the base
  // population later cannot turn this line into a division by zero — the two counts read fine without a multiplier.
  if (f.cost) out.push(`deviants get fixes ${f.cost.baseK ? `${(f.cost.k / f.cost.n / (f.cost.baseK / f.cost.baseN)).toFixed(1)}× more often ` : ''}(${f.cost.k} of ${f.cost.n} vs ${f.cost.baseK} of ${f.cost.baseN})`);
  // a value tried on enough scopes and then reverted — the structural opposite of `suppressedValue`'s nucleation
  if (f.rejected) for (const r of f.rejected) out.push(`${deviationPhrase(f, r.v)} tried ${r.tried}×, reverted ${r.reverted}× — a rejection, not an alternative`);
  if (f.agentShare != null) out.push(`held mostly by agent-authored code (${pct(f.agentShare)}% of recent conformers)`);
  return out.length ? ' · ' + out.join(' · ') : ''; }
export const deviantLine = (f, max = 2) => (f.deviants && f.deviants.length) ? `  ${voice('practiced', `not to copy: ${f.deviants.slice(0, max).map(d => `${ptr(d.rel, d.line, d.endLine)} \`${d.name}\` (${deviationPhrase(f, d.obs)})`).join(' · ')}${f.deviantsN > max ? ` · +${f.deviantsN - max} more` : ''}`)}` : null;
// an exemplar shown as "copy this" can itself be a deviant of some OTHER, unrelated fact in the same partition — the
// reader should know before opening it. Indexed once per partition (WeakMap, mirrors scopeLineIdx above): scope key
// (rel#kind#name, kind taken from the OWNING fact — every deviant of a fact shares that fact's kind) → the
// strongest (by gap) other-fact deviation on it. Ties keep whichever was inserted first (facts are iterated in
// their existing, already-deterministic array order) — a documented, deterministic pick, not the one true answer.
const otherDeviantIdx = new WeakMap();
function otherDeviantsOf(part) { let m = otherDeviantIdx.get(part);
  if (!m) { m = new Map();
    for (const f of part.facts || []) for (const d of (f.deviants || [])) {
      const key = d.rel + '#' + f.kind + '#' + d.name;
      const cur = m.get(key);
      if (!cur || d.gap > cur.gap) m.set(key, { factKey: f.cid + '|' + f.pid, line: d.line, gap: d.gap, phrase: deviationPhrase(f, d.obs) }); }
    otherDeviantIdx.set(part, m); }
  return m; }
// the "(skip line N — its own deviation: ...)" dopisek for an exemplar being shown as conforming to `fact` — never
// fired when the exemplar's only known other-fact deviation IS `fact` itself (that would accuse the very
// convention it is being held up as a model of)
export function skipLineNote(part, fact, ex) {
  const other = otherDeviantsOf(part).get(ex.rel + '#' + fact.kind + '#' + ex.name);
  if (!other || other.factKey === fact.cid + '|' + fact.pid) return '';
  return ` (skip line ${other.line} — its own deviation: ${other.phrase})`; }
export function roleLift(ps, ri, facts) { // per role: bits/instance of behavior compression; ≤0 ⇒ decorative
  const lift = {}; for (const f of facts) { if (!/^r\d/.test(f.cid)) continue;
    const r = +f.cid.slice(1).split(':')[0]; lift[r] = (lift[r] || 0) + f.bpi * 0.1 + 0.1; } // proxy: any accepted role fact ⇒ lift>0
  return lift; }

// ===== WEIGHTS FROM HISTORY (survival × provenance × churn, floor) =====
export function mkWeightFn(H) { if (!H) return { wfn: () => 1, ageFn: null, get: () => null };
  const filelvl = new Map();
  for (const [, L] of H.lc) { const p = L.path; let F = filelvl.get(p);
    if (!F) { F = { ...L }; filelvl.set(p, F); } else { F.first = Math.min(F.first, L.first); if (L.last > F.last) { F.last = L.last; F.agentLast = L.agentLast; } } }
  const get = s => H.lc.get(skeyR(s.rel, s)) || filelvl.get(s.rel) || null;
  return { ageFn: s => { const L = get(s); return L ? (H.NOW - L.first) / 86400 : 0; },
    wfn: s => { const L = get(s); if (!L) return 0.3;
      const stable = Math.max(0, (H.NOW - L.last) / 86400), age = Math.max(0, (H.NOW - L.first) / 86400);
      // no continuous survival ramp: "old" is not extra evidence, and the absolute 120-day scale priced a young repo's
      // real conventions at ~20% of their size (measured on a private repo: 19 certified where spectrum saw the field full).
      // What still discounts: brand-new code (< freshDays ⇒ ×0.5), code rewritten right after birth (churn ⇒ ×0.25),
      // and agent-authored code promotes over promoteDays as before. "n of N established" remains age-gated separately.
      const ws = age < CFG.freshDays ? 0.5 : 1;
      const wp = L.agentLast ? CFG.agentBase + (1 - CFG.agentBase) * Math.min(1, stable / CFG.promoteDays) : 1.0;
      let w = Math.max(CFG.floor, ws * wp * (L.churn ? 0.25 : 1));
      return w; }, get }; }
// dimension value from a historical val snapshot, for trend/calibration-supported pids
export function valOf(pid, v) { if (pid === 'auto.nameshape') return v.ns; if (pid === 'auto.first1') return v.f1 || undefined;
  if (pid === 'auto.ret') return v.ret || undefined;
  if (pid.startsWith('auto.deco:@')) return v.deco.includes(pid.slice(11)) ? 'true' : 'false';
  if (pid.startsWith('auto.extends:')) return v.sup.includes(pid.slice(13)) ? 'true' : 'false';
  return undefined; }
// trends + attractor(report-only) + nucleation over the WHOLE history
export function trendsFor(fact, ps, H) {
  const keys = fact.conform.concat(fact.deviants.map(d => d.gi)).map(gi => ({ gi, key: skeyR(ps[gi].rel, ps[gi]) }));
  const t0 = H.firstTs; const win = CFG.trendWinDays * 86400;
  const nWin = Math.min(24, Math.ceil((H.NOW - t0) / win)); const shares = []; const authorsByVal = Object.create(null);
  for (let w = nWin - 1; w >= 0; w--) { const end = H.NOW - w * win; let n = 0, conf = 0; const other = {};
    for (const { key } of keys) { const evs = H.vev.get(key); const L = H.lc.get(key); if (!evs || !L || L.first > end) continue;
      let val = null; for (const e of evs) { if (e.ts <= end) val = e.val; else break; }
      if (!val) continue; const v = valOf(fact.pid, val); if (v === undefined) continue;
      n++; if (v === fact.exp) conf++; else { other[v] = (other[v] || 0) + 1; } }
    if (n >= 4) shares.push({ end, share: +(conf / n).toFixed(2), n }); }
  for (const { key } of keys) { const evs = H.vev.get(key) || [];
    for (const e of evs) { const v = valOf(fact.pid, e.val); if (v !== undefined && v !== fact.exp && !e.agent) (authorsByVal[v] ||= new Set()).add(e.author); } }
  let attractor = null, nucleating = null;
  if (shares.length >= 3) { const last = shares[shares.length - 1];
    const xs = shares.map((_, i) => i), ys = shares.map(s => 1 - s.share);
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / Math.max(1e-9, xs.reduce((a, x) => a + (x - mx) ** 2, 0));
    const minority = Object.entries(authorsByVal).sort((a, b) => b[1].size - a[1].size || (a[0] < b[0] ? -1 : 1))[0];
    if (slope > 0.02 && minority && minority[1].size >= 2 && (1 - last.share) > 0.05) nucleating = minority[0];
    attractor = last.share >= 0.5 ? fact.exp : (minority ? minority[0] : fact.exp); }
  return { shares: shares.slice(-8), attractor, nucleating }; }
// the structural opposite of `trendsFor`'s `nucleating`: a value TRIED on enough scopes and then REVERTED, never
// one quietly becoming the new norm. Per scope, decode `H.vev` chronologically via the SAME `valOf` trendsFor and
// calibrate already use — so this inherits their exact limitation, silent for every pid family outside the 5
// valOf decodes (nameshape/first1/ret/deco:@/extends:), documented by export.mjs's `valueTracked`. For each
// distinct v != fact.exp ever taken by a scope: if the scope's LAST decoded value is v, it survived (nucleation,
// never counted here); otherwise it tried and was reverted. Speaks when tried >= CFG.minRaw and reverted/tried >=
// 2/3 — the same supermajority proportion used throughout this codebase (altMarkerFor, placementHit, markerObs,
// authorConcentration, J3.4's twin threshold).
export function rejectedValues(fact, ps, H) {
  const keys = fact.conform.concat(fact.deviants.map(d => d.gi)).map(gi => skeyR(ps[gi].rel, ps[gi]));
  const tried = new Map(), reverted = new Map();
  for (const key of keys) { const evs = H.vev.get(key); if (!evs) continue;
    const decoded = []; for (const e of evs) { const v = valOf(fact.pid, e.val); if (v !== undefined) decoded.push(v); }
    if (!decoded.length) continue;
    const last = decoded[decoded.length - 1];
    for (const v of new Set(decoded.filter(x => x !== fact.exp))) {
      tried.set(v, (tried.get(v) || 0) + 1);
      if (last !== v) reverted.set(v, (reverted.get(v) || 0) + 1); } }
  const out = [];
  for (const [v, t] of tried) { const r = reverted.get(v) || 0; if (t >= CFG.minRaw && r / t >= 2 / 3) out.push({ v, tried: t, reverted: r }); }
  out.sort((a, b) => b.tried - a.tried || (a.v < b.v ? -1 : a.v > b.v ? 1 : 0));
  return out.length ? out : undefined; }
// calibration: temporal split, τ_c by point precision, DENY by Wilson LB (report-only in grain — nothing ever blocks)
export function calibrate(fact, ps, H) {
  const split = H.NOW - CFG.calibHorizonDays * 86400; const settle = H.NOW - CFG.calibSettleDays * 86400;
  if (H.firstTs > split) return { available: false, reason: 'history<2x horizon' };
  const evts = [];
  for (const gi of fact.conform.concat(fact.deviants.map(d => d.gi))) { const s = ps[gi];
    const key = skeyR(s.rel, s); const evs = H.vev.get(key); if (!evs) continue;
    for (let i = 1; i < evs.length; i++) { const e = evs[i]; if (e.ts <= split || e.ts > settle) continue;
      const v = valOf(fact.pid, e.val); if (v === undefined || v === fact.exp) continue;
      let repaired = false; for (let j = i + 1; j < evs.length; j++) if (valOf(fact.pid, evs[j].val) === fact.exp) { repaired = true; break; }
      evts.push({ repaired }); } }
  if (evts.length < CFG.calibMinEv) return { available: false, reason: `events ${evts.length}<${CFG.calibMinEv}`, events: evts.length };
  const p = evts.filter(e => e.repaired).length / evts.length;
  const z = 1.96, n = evts.length, lb = (p + z * z / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n);
  return { available: true, events: n, precision: +p.toFixed(2), wilsonLB: +lb.toFixed(2),
    tauC: p >= CFG.targetPrec ? Math.log2(CFG.lambda) : Math.log2(CFG.lambda) + 1.5, denyEligible: lb >= 0.9 && n >= CFG.denyMinEv }; }

// §033: the target of an `auto.extends:` pid, classified 'ext'/'impl' via model.heritageKind (built once in
// learn(), from extractScopes' own supKind — see bindingFor's extendsClauseRe/implementsClauseRe), or undefined
// where unclassified. One helper, reused at every fact-like object built ad hoc for a steer/waiver at render
// time, so it carries the same distinction a mined fact gets at its own construction site (learn()'s `ef`).
export function heritageKindOf(pid, model) { return pid.startsWith('auto.extends:') ? (model.heritageKind || {})[pid.slice(13)] : undefined; }
// ===== VERBALIZER =====
export const unitOf = kind => ({ method: 'methods', type: 'types', file: 'files', module: 'directories', catch: 'catch blocks', finally: 'finally blocks', case: 'named callbacks' }[kind] || kind);
// a statement shape cut at a node boundary, never mid-token: `expression_statement(call_expression(member_expression,…))`
export const shapeShort = (sh, max = 64) => { if (sh.length <= max) return sh; let cut = sh.lastIndexOf(',', max); if (cut < max / 2) cut = sh.lastIndexOf('(', max); if (cut < 0) cut = max;
  const head = sh.slice(0, cut); const open = (head.match(/\(/g) || []).length - (head.match(/\)/g) || []).length; return head + ',…' + ')'.repeat(Math.max(0, open)); };
// the casing style a name shape denotes, in words — a reader should not have to reverse-engineer `(Ua)+`
export function shapeWords(shape) {
  const m = { '(Ua)+': 'PascalCase', 'a(Ua)+': 'camelCase', 'a(_a)+': 'snake_case', 'U(_U)+': 'UPPER_SNAKE_CASE', 'a': 'a single lowercase word', 'U': 'a single uppercase word',
    'a(-a)+': 'kebab-case', 'a(.a)+': 'dotted lowercase (like `a.b`)', 'a(.a)+(Ua)+': 'dotted with a PascalCase tail', '(_a)+': 'underscore-prefixed lowercase', '(_)+a(_)+': 'dunder-style (`__x__`)', 'aU': 'lowercase with an uppercase tail (like `iOS`)',
    'a(Ua)+(_a)+': 'camelCase with a snake tail', '(Ua)+(_a)+': 'PascalCase with a snake tail', '(Ua)+_(Ua)+': 'PascalCase pairs joined by `_` (like `TestX_Y`)', 'a(.a)+(-a)+': 'dotted kebab', 'a(-a)+(.a)+': 'kebab-case with a dotted tail (like `a-b.c`)', 'a(Ua)+(.a)+': 'camelCase with a dotted tail (like `aB.c`)', '(Ua)+(.a)+': 'PascalCase with a dotted tail (like `Ab.c`)', 'a(_a)+(.a)+': 'snake_case with a dotted tail (like `a_b.c`)' };
  if (m[shape]) return m[shape];
  const parts = []; if (/\(Ua\)\+/.test(shape)) parts.push('PascalCase words'); if (/\(_a\)\+/.test(shape)) parts.push('snake parts'); if (/\(-a\)\+/.test(shape)) parts.push('kebab parts'); if (/\(\.a\)\+/.test(shape)) parts.push('dots');
  return parts.length ? 'shaped like `' + shape + '` (' + parts.join(', ') + ')' : null; }
export function verbalize(f, exNames) {
  const unit = unitOf(f.kind);
  const neg = f.exp === 'false'; const p = f.pid;
  // an accepted marker with a real statistical alternative (§altMarkerFor) is a two-way split, not a single rule —
  // "X (162) or Y (5)" instead of accusing Y's carriers of departing from a convention they equally satisfy
  const alt = f.altMarker; const ownPhrase = name => alt ? `\`${name}\` (${f.sraw - f.deviantsN}) or \`${alt.name}\` (${alt.n})` : `\`${name}\``;
  if (p.startsWith('auto.has:')) return `${unit} here ${neg ? 'never contain' : 'always contain'} a \`${p.slice(9)}\``;
  if (p.startsWith('auto.call:')) return `${unit} here ${neg ? 'never call' : 'call'} \`${p.slice(10)}\``;
  if (p.startsWith('auto.deco:')) return `${unit} here ${neg ? 'are not annotated with' : 'are annotated with'} ${ownPhrase(p.slice(10))}`;
  if (p.startsWith('auto.imp:')) return `${unit} here ${neg ? 'do not import' : 'import'} \`${p.slice(9)}\``;
  // §033: the pid stays `auto.extends:` (a breaking rename for a cosmetic gain — see the issue), but the SENTENCE
  // says "implement" when the target is known, repo-wide, to be an interface conformed to rather than a class
  // inherited from — `f.heritageKind`, attached once per fact wherever one is built (§heritageKindOf), from
  // extractScopes' own supKind. Unclassified — every language without a syntactic extends/implements distinction,
  // or a name classified both ways — keeps "extend", exactly as before this fact existed.
  if (p.startsWith('auto.extends:')) { const verb = f.heritageKind === 'impl' ? 'implement' : 'extend';
    return `${unit} here ${neg ? `do not ${verb}` : verb} ${ownPhrase(p.slice(13))}`; }
  if (p.startsWith('auto.returns:')) return `${unit} here ${neg ? 'do not declare a return type of' : 'declare a return type of'} ${ownPhrase(p.slice(13))}`;
  if (p.startsWith('auto.ptype:')) return `${unit} here ${neg ? 'take no parameter of type' : 'take a parameter of type'} \`${p.slice(11)}\``;
  if (p.startsWith('auto.stshape:')) return `${unit} here ${neg ? 'never use' : 'use'} the structure \`${shapeShort(p.slice(13))}\``;
  if (p === 'auto.nameshape' || p === 'auto.filenameshape') { const w = shapeWords(f.exp); return `${unit} here are named ${w ? w + ' ' : 'like '}(${[...new Set(exNames)].slice(0, 3).map(n => '`' + n + '`').join(', ')})`; }
  if (p === 'auto.first1') return `${unit} here start with a \`${f.exp}\``;
  if (p === 'auto.ret') return `${unit} here return a \`${f.exp}\``;
  if (p === 'auto.arity') return `${unit} here take ${f.exp} parameter(s)`;
  if (p === 'auto.varshape') return `${unit} here name local variables like \`${f.exp}\``;
  if (p === 'auto.ctorshape') return `${unit} here declare their constructor ${{ primary: 'inline in the type header (a primary constructor)', classic: 'as a classic body constructor', both: 'both inline in the header and as a classic body constructor', none: 'nowhere — no explicit constructor' }[f.exp] || `as \`${f.exp}\``}`;
  if (p === 'auto.filebirth') return `${unit} here ${f.exp === 'new' ? 'usually start a new file' : 'are usually added to an existing file'}`;
  if (p.startsWith('auto.dir')) return `${unit} here live under \`${f.exp}/\``;
  if (p === 'auto.modexport') return `${unit} here export via \`${f.exp}\``;
  if (p === 'auto.namesuffix') return `${unit} here are named ending in \`${f.exp}\``;
  if (p === 'auto.mods') return f.exp === 'none' ? `${unit} here carry no modifiers` : `${unit} here carry the modifiers \`${f.exp}\``;
  if (p === 'auto.memberorder') return `${unit} here order their members \`${f.exp}\``;
  if (p.startsWith('auto.lex:')) return `${unit} here ${lexWords(p.slice(9), f.exp)}`;
  if (p.startsWith('auto.mod')) return `${unit}: ${p.slice(8)} = \`${f.exp}\``;
  return `${p} = ${f.exp}`; }
// the deviation phrase is the negation of the verbalizer row — "does not", or "is `<observed>`" for categoricals (§11.2)
// lexical surfaces in words: (surface, value) → predicate
export function lexWords(surface, v) {
  if (surface === 'quote') return v === 'single' ? 'quote strings with single quotes' : v === 'double' ? 'quote strings with double quotes' : `quote strings ${v}`;
  if (surface === 'semi') return v === 'semi' ? 'end statements with semicolons' : v === 'nosemi' ? 'end statements without semicolons' : `end statements ${v}`;
  if (surface === 'indent') return v === 'tab' ? 'indent with tabs' : /^space\d$/.test(v) ? `indent with ${v.slice(5)} spaces` : `indent ${v}`;
  if (surface === 'bom') return v === 'bom' ? 'start with a UTF-8 byte-order mark' : 'start without a byte-order mark';
  if (surface === 'directive') return v === 'none' ? 'start without a directive' : `start with the directive \`${v}\``;
  if (surface === 'decl') return `declare variables with \`${v}\``;
  if (surface === 'imports') { const [ord, grp] = v.split('-');
    return `${ord === 'sorted' ? 'sort imports' : 'do not sort imports'}, ${grp === 'grouped' ? 'in blank-line-separated groups' : 'in one block'}`; }
  return `have ${surface} = \`${v}\``; }
export function deviationPhrase(f, obs) {
  const p = f.pid; const neg = f.exp === 'false';
  if (p.startsWith('auto.lex:')) { const w = lexWords(p.slice(9), obs); return w.replace(/^(quote|end|indent|start|declare|have|sort|do)\b/, m => ({ quote: 'quotes', end: 'ends', indent: 'indents', start: 'starts', declare: 'declares', have: 'has', sort: 'sorts', do: 'does' })[m]); }
  if (p.startsWith('auto.has:')) return neg ? `contains a \`${p.slice(9)}\`` : `does not contain a \`${p.slice(9)}\``;
  if (p.startsWith('auto.call:')) return neg ? `calls \`${p.slice(10)}\`` : `does not call \`${p.slice(10)}\``;
  if (p.startsWith('auto.deco:')) return neg ? `is annotated with \`${p.slice(10)}\`` : `is not annotated with \`${p.slice(10)}\``;
  if (p.startsWith('auto.imp:')) return neg ? `imports \`${p.slice(9)}\`` : `does not import \`${p.slice(9)}\``;
  // §033 — see verbalize's own note just above it; `f.heritageKind` is attached wherever the fact/steer object is built
  if (p.startsWith('auto.extends:')) { const isImpl = f.heritageKind === 'impl';
    return neg ? `${isImpl ? 'implements' : 'extends'} \`${p.slice(13)}\`` : `does not ${isImpl ? 'implement' : 'extend'} \`${p.slice(13)}\``; }
  if (p.startsWith('auto.returns:')) return neg ? `declares a return type of \`${p.slice(13)}\`` : `does not declare a return type of \`${p.slice(13)}\``;
  if (p.startsWith('auto.ptype:')) return neg ? `takes a parameter of type \`${p.slice(11)}\`` : `takes no parameter of type \`${p.slice(11)}\``;
  if (p.startsWith('auto.stshape:')) return neg ? `uses that structure` : `does not use that structure`;
  if (p === 'auto.nameshape' || p === 'auto.filenameshape') { const w = shapeWords(obs); return w ? `is ${w}` : `is shaped \`${obs}\``; }
  if (p === 'auto.namesuffix') return `is named ending in \`${obs}\``;
  if (p === 'auto.mods') return obs === 'none' ? 'carries no modifiers' : `carries the modifiers \`${obs}\``;
  if (p === 'auto.memberorder') return `orders its members \`${obs}\``;
  if (p.startsWith('auto.dir')) return `lives under \`${obs}/\``;
  return `is \`${obs}\``; }

// Cargo.toml's OWN declared crate name (the `[package] name = "..."` line, dash/underscore-normalized exactly as
// Rust `use` paths reference it — §017): a small, independent re-implementation of the identical parse the vendored
// rust-resolve.mjs already does for the CALLING file's own crate. Duplicated, not imported: the vendored module's
// `readCrateName` isn't exported (and is "do not edit" — regenerated from Yggdrasil), and workspace discovery here
// runs at model-BUILD time (this file walks every workspace member), while the vendored one runs at resolve time
// (walking up from one file to ITS OWN nearest Cargo.toml) — two different callers, same small grammar.
export function readCargoCrateName(text) {
  let inPackage = false;
  for (const raw of text.split('\n')) { const line = raw.trim();
    if (line.startsWith('[')) { inPackage = line === '[package]'; continue; }
    if (!inPackage) continue;
    const m = line.match(/^name\s*=\s*["']([^"']+)["']/); if (m) return m[1].replace(/-/g, '_'); }
  return undefined; }
// ===== CURRENT-TREE EXTRACTION + PARTITIONING (shared by learn and spectrum) =====
const PKG_ROOT_RE = /^(package\.json|pyproject\.toml|go\.mod|pom\.xml|Cargo\.toml|setup\.cfg)$|\.(csproj|sln)$/;
export function findPackageRoots(root, allPaths = null) {
  const pkgs = [];
  if (allPaths) { for (const rel of allPaths) { if (HARD_EXCL.test(rel)) continue; // git mode: the tracked tree IS the universe
      if (PKG_ROOT_RE.test(basename(rel))) { const d2 = dirname(rel); const p = d2 === '.' ? '.' : d2; if (!pkgs.includes(p)) pkgs.push(p); } } return pkgs.sort(); }
  (function fp(d) { let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { const full = join(d, e.name); const rel = toPosix(relative(root, full)); if (EXCL.test(rel + '/')) continue;
      if (e.isDirectory()) fp(full); else if (PKG_ROOT_RE.test(e.name)) { const p = toPosix(relative(root, d)) || '.'; if (!pkgs.includes(p)) pkgs.push(p); } } })(root);
  return pkgs.sort(); }
// ===== MDL PARTITIONING (constitution: the directory tree is cut where cutting compresses) =====
// Per-file categorical features — grammar and the LEXICAL layer only: a partition means "an independent style
// population", so the features are exactly what style is. Directory signatures (file-name shape, kind mix) are
// deliberately NOT here — they belong to the dir cells inside a partition, and cutting on them shreds the tree
// into per-directory slivers (measured on the planted fixture). A post-order
// DP over the directory tree: a directory either codes its whole subtree as one region, or splits — paying, per new
// region, the bits to name its root. Manifests (package.json, go.mod) are NOT consulted here: they remain resolution
// artifacts (workspaces, module graph); the statistical partition is earned by compression alone.
export function mdlCuts(all) {
  const feat = new Map();
  for (const s of all) { if (s.kind !== 'file') continue;
    feat.set(s.rel, [s.g || '?', s.preds['auto.lex:quote'] || '?', s.preds['auto.lex:semi'] || '?', s.preds['auto.lex:indent'] || '?', s.preds['auto.lex:decl'] || '?']); }
  const F = 5;
  const kids = new Map(); const own = new Map();
  for (const rel of feat.keys()) { const segs = rel.split('/'); let d = '.';
    for (let i = 0; i < segs.length - 1; i++) { const nd = d === '.' ? segs[i] : d + '/' + segs[i]; (kids.get(d) || kids.set(d, new Set()).get(d)).add(nd); d = nd; }
    (own.get(d) || own.set(d, []).get(d)).push(rel); }
  let nd = 1; for (const st of kids.values()) nd += st.size;
  const CUT = Math.log2(Math.max(2, nd));
  const code = counts => { let c = 0; for (const cnt of counts) { const vs = Object.keys(cnt); const n = vs.reduce((a, v) => a + cnt[v], 0); if (!n) continue;
      for (const v of vs) c += cnt[v] * Math.log2(n / cnt[v]); c += 0.5 * Math.max(0, vs.length - 1) * Math.log2(Math.max(n, 2)); } return c; };
  const mk = () => Array.from({ length: F }, () => ({}));
  const addRels = (counts, rels) => { for (const r of rels || []) { const fv = feat.get(r); for (let i = 0; i < F; i++) counts[i][fv[i]] = (counts[i][fv[i]] || 0) + 1; } };
  const best = new Map(); const regions = new Map(); const subCounts = new Map();
  const dfs = d => { const cs = [...(kids.get(d) || [])].sort();
    const counts = mk(); addRels(counts, own.get(d));
    const ownCost = code(counts);
    let splitCost = ownCost + ((own.get(d) || []).length ? CUT : 0); const cuts = (own.get(d) || []).length ? [d] : [];
    for (const c of cs) { dfs(c);
      splitCost += best.get(c) + CUT; cuts.push(...regions.get(c));
      const sc = subCounts.get(c); for (let i = 0; i < F; i++) for (const v of Object.keys(sc[i])) counts[i][v] = (counts[i][v] || 0) + sc[i][v]; }
    subCounts.set(d, counts);
    const mergedCost = code(counts);
    if (cs.length && splitCost < mergedCost) { best.set(d, splitCost); regions.set(d, cuts); }
    else { best.set(d, mergedCost + CUT); regions.set(d, [d]); } };
  dfs('.');
  return regions.get('.').filter(d => d !== '.').sort(); }
export const partOfFn = pkgs => rel => { let b = null; for (const d of pkgs) { if (d === '.') continue; if ((rel + '/').startsWith(d + '/')) if (!b || d.length > b.length) b = d; } return b || '_root'; };
// the partition a file is judged against: its own package (or the merged repo bucket); test files only ever against a tests
// partition — a test suite too small to have norms of its own gets no partition (null), never the production norms
export const partitionFor = (model, rel) => { const key = partOfFn(model.cuts || model.pkgs)(rel);
  return model.partitions.find(p => p.name === key) || model.partitions.find(p => p.name === '_repo') || model.partitions[0] || null; };
// normalize a lone CR (not part of a CRLF pair) to LF before parsing — some vendored grammars (tree-sitter-kotlin
// confirmed) don't treat a bare 0x0D as a line-comment terminator, silently swallowing the declaration that
// follows on the same "line" as far as the grammar's tokenizer is concerned. Preserves byte length and line
// count exactly (CR and LF are both one character each), so line/endLine/startIndex stay consistent with the
// file's real content; a no-op for LF-only and CRLF files. (§G17)
export function normalizeCR(src) { return src.replace(/\r(?!\n)/g, '\n'); }
export async function extractTree(root, files, onProgress, readSource = null, cached = null, relOut = null) {
  const all = []; let i = 0, reused = 0;
  for (const rel of files) {
    const hit = cached ? cached(rel) : null; // extraction cache keyed by (blob sha, path): an unchanged file is never re-parsed
    if (hit) { const hs = Array.isArray(hit) ? hit : hit.s; all.push(...hs.map(hydrateScope)); if (relOut && !Array.isArray(hit)) relOut[rel] = hit.r ?? null; reused++; continue; }
    let src; try { src = readSource ? readSource(rel) : readFileSync(join(root, rel), 'utf8'); } catch { continue; }
    if (src != null) src = normalizeCR(src);
    if (src == null || src.length > 1.5e6) continue;
    try { const { p, tree: tr } = await parseFile(extname(rel), src); const b = bindingFor(p._g); all.push(...extractScopes(rel, tr, b, p._g));
      if (relOut) relOut[rel] = relFactsFor(rel, src, tr, p._g); // relation facts ride the same parse — the tree is in hand exactly once
      tr.delete(); } catch {}
    if (onProgress && ++i % 200 === 0) onProgress(i, files.length); }
  if (onProgress) onProgress(i, files.length, reused);
  return all; }
export function addModuleScopes(all) {
  const dirFiles = new Map();
  for (const s of all) if (s.kind === 'file') { const d = dirname(s.rel); (dirFiles.get(d) || dirFiles.set(d, []).get(d)).push(s); }
  for (const [d, fs2] of [...dirFiles].sort((a, b) => a[0] < b[0] ? -1 : 1)) if (fs2.length >= 3 && d !== '.') { const cnt = {};
    for (const f2 of fs2) { const sh = f2.preds['auto.filenameshape']; cnt[sh] = (cnt[sh] || 0) + 1; }
    all.push({ kind: 'module', name: basename(d), rel: d, line: 1, sup: [], decos: [], calls: new Set(), seen: new Set(), shapes: new Set(), imports: [], feats: [], ownCount: 0,
      preds: { 'auto.moddirshape': nameShape(basename(d)), 'auto.modfileshape': Object.entries(cnt).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0], 'auto.modsize': fs2.length >= 20 ? '20+' : fs2.length >= 8 ? '8-19' : '3-7' } }); } }
export function buildVocab(ps, { deep = false } = {}) {
  const V = { nodeType: new Map(), call: new Map(), imp: new Map(), ext: new Map(), shape: new Map(), deco: new Map(), ret: new Map(), pt: new Map() };
  for (const s of ps) { if (BODY_KINDS.has(s.kind)) { for (const nt of s.seen) if (/statement|expression|declaration|clause/.test(nt)) V.nodeType.set(nt, (V.nodeType.get(nt) || 0) + 1);
      for (const c of s.calls) V.call.set(c, (V.call.get(c) || 0) + 1); for (const sh of s.shapes) V.shape.set(sh, (V.shape.get(sh) || 0) + 1); }
    if (s.kind !== 'file' && s.kind !== 'module') { for (const d of s.decos) V.deco.set(d, (V.deco.get(d) || 0) + 1); if (s.kind === 'type') for (const e of s.sup) V.ext.set(e, (V.ext.get(e) || 0) + 1); for (const r of (s.rets || [])) V.ret.set(r, (V.ret.get(r) || 0) + 1); for (const r of (s.ptypes || [])) V.pt.set(r, (V.pt.get(r) || 0) + 1); }
    if (s.kind === 'file') for (const i of s.imports) V.imp.set(i, (V.imp.get(i) || 0) + 1); }
  // support-then-count ordering with `token asc` as the total tie-break (I2a: a vocabulary flip changes every downstream count)
  const top = k => { const floor = deep ? Math.max(2, Math.floor((SUP[k] || 8) / 4)) : (SUP[k] || 8); const cap = (TOPK[k] || 40) * (deep ? 4 : 1);
    return [...V[k]].filter(([, c]) => c >= floor).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, cap).map(([x]) => x); };
  const seenWith = pred => [...new Set(ps.filter(s => s.kind !== 'file' && s.kind !== 'module' && s.nt && pred(s)).map(s => s.nt))].sort();
  return { NT: top('nodeType'), CALL: top('call'), IMP: top('imp'), EXT: top('ext'), SHAPE: top('shape'), DECO: top('deco'), RET: top('ret'), PT: top('pt'),
    DNT: seenWith(s => s.decos.length), ENT: seenWith(s => s.sup.length), RNT: seenWith(s => (s.rets || []).length), PNT: seenWith(s => (s.ptypes || []).length), LEX: lexDomain(ps) }; }
// lexical domain: per grammar, the lexical surfaces whose value is a CHOICE here (≥ 2 values observed across the partition's files).
// Double quotes in Go or semicolons in Java are the language, not a convention; single quotes in a JS repo that also holds
// double-quoted files are. The leading directive is exempt: its absence is always a choice (`'use strict'` vs nothing).
export function lexDomain(ps) { const seen = new Map();
  for (const s of ps) { if (s.kind !== 'file') continue; for (const [pid, v] of Object.entries(s.preds)) if (pid.startsWith('auto.lex:')) { const k = (s.g || '') + S + pid; (seen.get(k) || seen.set(k, new Set()).get(k)).add(v); } }
  const quoteChoice = g => { if (!g) return false; const b = bindingFor(g); return ![...b.nodeTypes].some(t => /^(char|character|char_literal|character_literal|rune_literal)$/.test(t)); }; // `'` is a char literal in C/C++/C#/Rust/Kotlin/Scala/Zig (and a rune in Go): no choice to make
  const dom = {}; for (const [k, vs] of seen) { const [g, pid] = k.split(S); if (vs.size >= 2 || pid === 'auto.lex:directive' || (pid === 'auto.lex:quote' && quoteChoice(g))) (dom[g] ||= []).push(pid); }
  for (const g of Object.keys(dom)) dom[g].sort(); return dom; }
export function groupPartitions(all, pkgs) {
  const partOf = partOfFn(pkgs); const byPart = new Map();
  for (const s of all) { const p = partOf(s.rel); (byPart.get(p) || byPart.set(p, []).get(p)).push(s); }
  const merged = new Map(); const small = [];
  for (const [p, ss] of [...byPart].sort((a, b) => a[0] < b[0] ? -1 : 1)) (ss.length < 100 ? small.push(...ss) : merged.set(p, ss));
  // the spec's 300-scope floor merges small packages into one repo bucket; grain keeps a smaller bucket (≥ 30 scopes) as a
  // partition rather than going silent — a 150-scope library (express's lib/) still has groups, markers, files and directories
  // to answer `where` with, and the MDL gates already keep a thin field from speaking conventions it cannot back
  const smallSrc = new Set(); for (const [p, ss] of byPart) if (ss.length < 100) smallSrc.add(p);
  if (small.length >= 30) merged.set(smallSrc.size === 1 ? [...smallSrc][0] : '_repo', small); // one small package is itself, not "small packages merged"
  return merged; }

// ===== LEARN: current tree + history → model =====
export async function learn({ root, H, seeds = [], boundaries = [], waivers = [], log = () => {}, tree = null, treeCache = null }) {
  const t0 = Date.now();
  // `tree` (from history.mjs headTree) = the files and contents of HEAD: the norm is the accepted past, so an uncommitted edit,
  // an untracked file or a half-written class never feeds it. Without git the worktree is all there is.
  const files = tree ? tree.files : [...walkFiles(root, root)].sort();
  const keyOf = rel => tree && tree.sha ? tree.sha(rel) + '|' + rel : null;
  const cached = treeCache && tree && tree.sha ? rel => treeCache[keyOf(rel)] || null : null;
  const relFacts = {};
  const all = await extractTree(root, files, (i, n, reused) => log(reused === undefined ? `  parsed ${i}/${n}` : `extracted ${files.length} files${tree ? ' (HEAD tree)' : ' (worktree — no git)'}: ${reused} from cache, ${i} parsed`), tree ? tree.read : null, cached, relFacts);
  const fileScopes = new Map(); for (const s of all) { const k = keyOf(s.rel); if (k && s.name !== '<anon>') (fileScopes.get(k) || fileScopes.set(k, []).get(k)).push(serializeScope(s)); }
  const keyRel = new Map(); for (const rel of files) { const k = keyOf(rel); if (k) keyRel.set(k, rel); }
  const treeCacheOut = Object.fromEntries([...fileScopes].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([k, scs]) => [k, { s: scs, r: relFacts[keyRel.get(k)] ?? null }])); // only current files — a rename or delete drops out
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
  const fixOutcome = s => { if (!H) return null; const L = H.lc.get(skeyR(s.rel, s));
    return L && ageFn(s) >= CFG.freshDays ? (L.fix > 0 ? 'has_fix' : 'no_fix') : null; };
  const fixTally = vs => { const c = { has_fix: 0, no_fix: 0 }; for (const v of vs) c[v]++; return c; };
  const devCostCand = []; // { ef, dv, all } per candidate fact — scored once the whole repo's candidate count is known
  const model = { engine: 'grain', repo: basename(root), pkgs, cuts, generatedAt: 0, partitions: [] };
  // heritageKind (§033): repo-wide, name → 'ext'/'impl', from every type-kind scope's own supKind (§extractScopes).
  // A name classified the SAME way everywhere it's the target of a heritage clause is trustworthy; one classified
  // BOTH ways (a class and an interface sharing a name in different files — rare, but not impossible) is not, and
  // is dropped rather than guessed. A name never classified at all (C#, Kotlin, Rust, Go, Python — see
  // extendsClauseRe/implementsClauseRe) is simply absent, and verbalize/deviationPhrase fall back to "extends".
  const heritageKind = {}; { const ambiguous = new Set();
    for (const s of all) { if (s.kind !== 'type' || !s.supKind) continue;
      for (const [nm, k] of Object.entries(s.supKind)) { if (ambiguous.has(nm)) continue;
        if (!(nm in heritageKind)) heritageKind[nm] = k;
        else if (heritageKind[nm] !== k) { delete heritageKind[nm]; ambiguous.add(nm); } } } }
  model.heritageKind = heritageKind;
  let agentShareNum = 0, agentShareDen = 0;
  // pass 1: vocabularies, roles and the repo-wide candidate count; pass 2: mining with one shared index cost
  const prepared = [];
  let Crepo = 0;
  for (const [pname, ps] of merged) prepared.push({ pname, ps, vocab: buildVocab(ps) });
  // lexical style is a property of the package, not of the source/tests/examples split (one editor config, one linter): the
  // lexical domain and the lexical facts are computed over every file of the package, then held by each of its partitions
  const pkgOf = pname => pname.replace(/#.*$/, ''); const pkgFiles = new Map();
  for (const { pname, ps } of prepared) { const k = pkgOf(pname); (pkgFiles.get(k) || pkgFiles.set(k, []).get(k)).push(...ps.filter(s => s.kind === 'file')); }
  const pkgLex = new Map(); for (const [k, fs2] of pkgFiles) pkgLex.set(k, lexDomain(fs2));
  for (const pr of prepared) { pr.vocab.LEX = pkgLex.get(pkgOf(pr.pname)) || {};
    for (const s of pr.ps) { applyVocab(s, pr.vocab);
      // birth-file status (§13.3 lifecycle): whether a scope's first commit also added its FILE (a new file) or landed
      // in one already tracked (an existing file, e.g. a shared registry) — file/module-kind scopes excluded, since a
      // file's own birth trivially always coincides with its file's birth (the predicate would be tautologically 'new')
      if (s.kind !== 'file' && s.kind !== 'module') { const L = lcGet(s); if (L && L.newFile !== undefined) s.preds['auto.filebirth'] = L.newFile ? 'new' : 'existing'; } }
    pr.ri = induceRoles(pr.ps); Crepo += countCandidates(pr.ps, pr.ri); }
  const idxCost = Math.ceil(Math.log2(Math.max(Crepo, 2)));
  model.candidateCountLog2 = idxCost;
  // package-wide lexical facts: file scopes of the whole package, lexical surfaces only, no roles — a 7-file source tree
  // cannot pay the index cost alone for "single quotes — 7 of 7", the 141 files of the package can (measured on express)
  const pkgLexFacts = new Map();
  for (const [k, fs2] of pkgFiles) { if (fs2.length < CFG.minRaw) continue;
    const clones = fs2.map(s => ({ ...s, preds: Object.fromEntries(Object.entries(s.preds).filter(([pid]) => pid.startsWith('auto.lex:'))) }));
    const { facts } = mine(clones, { assign: new Map(), amb: new Set() }, baseW, [], ageFn, null, { idxCostOverride: idxCost });
    pkgLexFacts.set(k, { facts, ps: clones }); }
  for (const { pname, ps, vocab, ri } of prepared) {
    const { facts, C } = mine(ps, ri, baseW, seeds, ageFn, process.env.GRAIN_DBG, { idxCostOverride: idxCost });
    if (H) for (const s of ps) { const L = lcGet(s); if (!L || s.kind === 'file' || s.kind === 'module') continue;
      if ((H.NOW - L.first) / 86400 <= CFG.survDays) { agentShareDen += baseW(s); if (L.agentLast) agentShareNum += baseW(s); } }
    const lifts = roleLift(ps, ri, facts);
    const assignments = {}; [...ri.assign].sort((a, b) => a[0] - b[0]).forEach(([i, r]) => { const s = ps[i]; assignments[skeyR(s.rel, s)] = ri.amb.has(i) ? -1 : r; });
    const ym2 = ts => new Date(ts * 1000).toISOString().slice(0, 7);
    // canonical exemplar (J5.3): how often each scope stands accused as a DEVIANT elsewhere in this same partition
    // — counted once over the RAW facts (their untruncated `deviants`), before `topDeviants` cuts them to 5 for
    // export and before this partition's own `exportFacts` exists to read it back from
    const deviantOnOther = new Map();
    for (const f2 of facts) for (const d of f2.deviants) deviantOnOther.set(d.gi, (deviantOnOther.get(d.gi) || 0) + 1);
    const exportFacts = facts.sort((a, b) => b.bpi - a.bpi || (a.cid < b.cid ? -1 : a.cid > b.cid ? 1 : a.pid < b.pid ? -1 : 1)).map(f => {
      const unamb = f.conform.filter(gi => !ri.amb.has(gi)); const pool = unamb.length ? unamb : f.conform;
      // rank the exemplar pool by (1) never a deviant elsewhere, (2) never rewritten right after birth, (3) a
      // human's last touch, (4) firstborn, (5) freshest touch (tiebreak only) — DIRECT `H.lc` lookup, never
      // `mkWeightFn`'s file-level fallback (a sibling's history is not this scope's, the same trap J5.1 avoided).
      // A scope with no row of its own sorts worst on every key — the accepted, honest residual: with no history
      // of its own, "was it firstborn" has no answer here, so it never outranks a scope that does.
      let exs, why;
      if (H) {
        const ranked = pool.map(gi => { const s = ps[gi]; const L = H.lc.get(skeyR(s.rel, s));
          return { gi, L, dev: deviantOnOther.get(gi) || 0,
            churnR: L ? (L.churn === false ? 0 : 1) : 1, agentR: L ? (L.agentLast ? 1 : 0) : 1,
            firstR: L ? L.first : Infinity, lastR: L ? -L.last : Infinity }; })
          .sort((a, b) => a.dev - b.dev || a.churnR - b.churnR || a.agentR - b.agentR || a.firstR - b.firstR || a.lastR - b.lastR);
        exs = ranked.slice(0, 3).map(r => r.gi);
        const top = ranked[0];
        // only when the winner clears every criterion CLEANLY — never merely because it happened to sort first
        if (top && top.L && top.dev === 0 && top.churnR === 0 && top.agentR === 0)
          why = `started this pattern (${ym2(top.L.first)}), was never rewritten right after it landed, human-authored`;
      } else exs = pool.slice(0, 3);
      // per-fact share of established conformers held by agent-authored code (H9): direct `H.lc` lookup, same
      // discipline as the exemplar ranking above — a scope with no row contributes to neither side
      let agentShare; if (H) { let num = 0, den = 0;
        for (const gi of f.conform) { const s = ps[gi]; const L = H.lc.get(skeyR(s.rel, s)); if (!L) continue; den++;
          if (L.agentLast && (H.NOW - L.first) / 86400 <= CFG.survDays) num++; }
        if (den >= CFG.minRaw && num / den >= 2 / 3) agentShare = +(num / den).toFixed(2); }
      const trend = H ? trendsFor(f, ps, H) : null;
      const calib = H ? calibrate(f, ps, H) : { available: false, reason: 'no history' };
      const rejected = H ? rejectedValues(f, ps, H) : undefined;
      const ef = { cid: f.cid, kind: f.kind, pid: f.pid, exp: f.exp, parentExp: f.parentExp, counts: f.counts, srawCounts: f.srawCounts, alphabet: f.alphabet,
        raw: f.raw, sraw: f.sraw, share: +f.srawShare.toFixed(3), bpi: +f.bpi.toFixed(2), tau: calib.available ? calib.tauC : f.tau,
        // §033: 'ext'/'impl'/undefined, read by verbalize/deviationPhrase off the fact object itself — never a
        // threaded render-time parameter, so every helper that only ever saw `f` (factNotes, deviantLine, the
        // rejected-values line) keeps working unchanged and still gets it right.
        heritageKind: heritageKindOf(f.pid, model),
        nSurfaces: f.nSurfaces, siblings: (f.siblings || []).map(sb => ({ ...sb, heritageKind: heritageKindOf(sb.pid, model) })),
        trend: trend && trend.shares.length ? trend : undefined, calib, rejected,
        suppressedValue: f.contested ? f.contested.v : (trend ? trend.nucleating : null), denyEligible: !!(calib.available && calib.denyEligible),
        seeded: f.seeded && f.seeded.length ? f.seeded : undefined, contested: f.contested ? f.contested.id : undefined,
        exemplars: exs.map((gi, idx) => { const e = { rel: ps[gi].rel, line: ps[gi].line, endLine: ps[gi].endLine || ps[gi].line, name: ps[gi].name };
          if (idx === 0 && why) e.why = why; return e; }), deviantsN: Math.max(0, Math.round(f.sraw * (1 - f.srawShare))), // same population as the printed share — raw-only young deviants still ride in `deviants` for check

        deviants: topDeviants(f, ps), held: H ? heldSummary(f, ps, H) : null, altMarker: altMarkerFor(f, ps),
        authorConc: H ? authorConcentration(f, ps, H) : null, agentShare,
        C };
      // the deviation cell's own floors, over the RAW deviants (`f.deviants`, never the exported top-5 slice): the
      // deviant side must be an observable population, and so must the population it is contrasted with
      const dv = f.deviants.map(d => fixOutcome(ps[d.gi])).filter(Boolean);
      const all = f.conform.concat(f.deviants.map(d => d.gi)).map(gi => fixOutcome(ps[gi])).filter(Boolean);
      if (dv.length >= CFG.minRaw && all.length >= CFG.minRaw) devCostCand.push({ ef, dv, all });
      return ef; });
    const pl = pkgLexFacts.get(pkgOf(pname));
    if (pl) for (const f of pl.facts) { if (exportFacts.some(g => g.cid === f.cid && g.pid === f.pid)) continue;
      const own = new Set(ps.filter(s => s.kind === 'file').map(s => s.rel)); // exemplars from this partition first — a lib file is shown lib files, not tests
      const exs = [...f.conform].sort((a, b) => (own.has(pl.ps[b].rel) ? 1 : 0) - (own.has(pl.ps[a].rel) ? 1 : 0) || a - b).slice(0, 3);
      exportFacts.push({ cid: f.cid, kind: f.kind, pid: f.pid, exp: f.exp, parentExp: f.parentExp, counts: f.counts, srawCounts: f.srawCounts, alphabet: f.alphabet, raw: f.raw, sraw: f.sraw, share: +f.srawShare.toFixed(3), bpi: +f.bpi.toFixed(2), tau: f.tau,
        nSurfaces: f.nSurfaces, siblings: f.siblings, trend: undefined, calib: { available: false, reason: 'lexical' }, suppressedValue: null, denyEligible: false,
        exemplars: exs.map(gi => ({ rel: pl.ps[gi].rel, line: pl.ps[gi].line, endLine: pl.ps[gi].endLine || pl.ps[gi].line, name: pl.ps[gi].name })), deviantsN: Math.max(0, Math.round(f.sraw * (1 - f.srawShare))), deviants: topDeviants(f, pl.ps), held: H ? heldSummary(f, pl.ps, H) : null, pkgWide: true, C }); }
    // markers: every decorator / supertype / declared return type with ≥ 3 carriers → where it lives and who carries it
    const markers = {}; for (const s of ps) { if (s.kind === 'file' || s.kind === 'module') continue;
      for (const [pre, xs] of [['deco', s.decos], ['sup', s.kind === 'type' ? s.sup : []], ['ret', s.rets || []]]) for (const x of xs) (markers[pre + ':' + x] ||= []).push(skeyR(s.rel, s)); }
    const scopesInFile = new Map(); for (const s of ps) { if (s.kind === 'file' || s.kind === 'module') continue; scopesInFile.set(s.rel, (scopesInFile.get(s.rel) || 0) + 1); }
    for (const k of Object.keys(markers)) { if (markers[k].length < 3) { delete markers[k]; continue; }
      const dc = new Map(); for (const key of markers[k]) { const d = dirname(key.split('#')[0]); dc.set(d, (dc.get(d) || 0) + 1); }
      // dominant directory first; within it the most FOCUSED file (fewest scopes) — a 16 KB god-file is a worse thing to copy
      markers[k] = markers[k].sort((a, b) => dc.get(dirname(b.split('#')[0])) - dc.get(dirname(a.split('#')[0])) || (scopesInFile.get(a.split('#')[0]) || 0) - (scopesInFile.get(b.split('#')[0]) || 0) || (a < b ? -1 : a > b ? 1 : 0)).slice(0, 60); }
    // superposition per role: the cluster IS the candidate generator; anti-unification folds it into one template
    // a template's history is the ARRIVAL PROCESS of its instances: when the first one landed, how many are young —
    // straight from the lifecycle rows, no re-extraction of old blobs
    const heldOf = ms2 => { if (!H) return null; const fs3 = ms2.map(lcGet).filter(Boolean).map(L => L.first); if (!fs3.length) return null;
      return { since: ym2(Math.min(...fs3)), fresh: fs3.filter(f => (H.NOW - f) / 86400 <= 180).length } };
    const profiles = {};
    { const byRoleSk = new Map();
      [...ri.assign].sort((a, b) => a[0] - b[0]).forEach(([i, r]) => { if (ri.amb.has(i)) return; const s = ps[i];
        if (s.kind === 'file' || s.kind === 'module' || !s.sk) return; (byRoleSk.get(r) || byRoleSk.set(r, []).get(r)).push(s); });
      for (const [r, arr] of byRoleSk) { if (arr.length < 4) continue; const pf = profileOf(arr.map(s => s.sk));
        if (pf) { pf.held = heldOf(arr); profiles[r] = pf; } } }
    const covered = new Set(); [...ri.assign].forEach(([i]) => { if (!ri.amb.has(i)) covered.add(i); });
    const templates = mineTemplates(ps, covered);
    for (const t of templates) { t.held = heldOf(t._members); delete t._members; }
    const byKey = new Map(); for (const s of ps) byKey.set(skeyR(s.rel, s), s);
    const markerObs = {}; const markerImplied = {};
    for (const [mk, keys] of Object.entries(markers)) { const cs = keys.map(k => byKey.get(k)).filter(Boolean); const n = cs.length; if (n < 3) continue;
      markerImplied[mk] = [...new Set(cs.map(s2 => s2.rel))]; // carrier files — implications computed once the edges exist
      const obs = []; const maj = (items, render) => { const c = new Map(); for (const x of items) if (x !== undefined) c.set(x, (c.get(x) || 0) + 1);
        const top2 = [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]; if (top2 && top2[1] >= Math.ceil(n * 2 / 3)) obs.push(render(top2[0], top2[1])); };
      maj(cs.map(s => (s.rets || [])[0]), (v, k) => `returns \`${v}\` (${k}/${n})`);
      maj(cs.map(s => s.preds['auto.nameshape']), (v, k) => { const w = shapeWords(v); return `named ${w || 'like \`' + v + '\`'} (\`${cs[0].name}\`) (${k}/${n})`; });
      const own = mk.slice(mk.indexOf(':') + 1); const dc = new Map();
      for (const s2 of cs) for (const d of s2.decos) if (d !== own) dc.set(d, (dc.get(d) || 0) + 1);
      for (const [d, k] of [...dc].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 2)) if (k >= Math.ceil(n * 2 / 3)) obs.push(`also ${d.startsWith('[') ? d : '@' + d} (${k}/${n})`);
      const cc = new Map(); for (const s2 of cs) for (const c2 of s2.calls) cc.set(c2, (cc.get(c2) || 0) + 1);
      for (const [c2, k] of [...cc].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3)) if (k >= Math.ceil(n * 2 / 3)) obs.push(`call \`${c2}\` (${k}/${n})`);
      if (obs.length) markerObs[mk] = obs.slice(0, 5); }
    const fileScopes = {}; for (const s of ps) { if (s.kind === 'file' || s.kind === 'module') continue; (fileScopes[s.rel] ||= []).push([s.kind, s.name, s.line, s.endLine || s.line]); }
    const fileDocs = {}; for (const s of ps) { if (!s.doc || !s.doc.length) continue; const d = (fileDocs[s.rel] ||= new Set()); for (const t of s.doc) if (d.size < 80) d.add(t); }
    const fileSups = {}; for (const s of ps) { if (s.kind === 'module' || !s.sup.length) continue; const d = (fileSups[s.rel] ||= new Set()); for (const x of s.sup) if (d.size < 12) d.add(x); } // file-kind sups are macro-emitted definitions; markers still skip files
    for (const rel of Object.keys(fileSups)) fileSups[rel] = [...fileSups[rel]].sort();
    // fileSups' own sibling (§032): a file's declared parameter/return TYPE HINTS, not its heritage. `fileSups`
    // alone answers "which files `implements`/`extends` type X" but has nothing for a type used only as a type
    // hint (e.g. a psr/http-message interface that is never locally `implements`-ed, only accepted/returned) —
    // exactly `whatCmd`'s external-type undercount (measured on Slim: `ResponseInterface` has 0 heritage sites
    // but 40+ real usages, every one of them a parameter or return type hint).
    // Same per-file, threshold-free shape as `fileSups` — no ≥3-carrier gate the way `markers` has, so a single
    // real reference still counts. File-kind/module pseudo-scopes never carry `rets`/`ptypes` (only real
    // method/type scopes do — see extractScopes), so no extra kind filter is needed beyond `fileSups`'s own.
    const fileTypeRefs = {}; for (const s of ps) { if (s.kind === 'module') continue; const refs = [...(s.rets || []), ...(s.ptypes || [])]; if (!refs.length) continue; const d = (fileTypeRefs[s.rel] ||= new Set()); for (const x of refs) if (d.size < 24) d.add(x); }
    for (const rel of Object.keys(fileTypeRefs)) fileTypeRefs[rel] = [...fileTypeRefs[rel]].sort();
    for (const rel of Object.keys(fileDocs)) fileDocs[rel] = [...fileDocs[rel]].sort();
    for (const rel of Object.keys(fileScopes)) fileScopes[rel] = fileScopes[rel].sort((a, b) => a[2] - b[2]).slice(0, 200);
    model.partitions.push({ name: pname, scopes: ps.length, files: [...new Set(ps.filter(s => s.kind === 'file').map(s => s.rel))].sort(), fileScopes, fileDocs, fileSups, fileTypeRefs, vocab, assignments, roleLift: lifts, markers, markerObs, markerImplied,
      medoids: ri.medoids.map(m => ({ feats: m.feats, label: m.label })), profiles, templates, facts: exportFacts }); }
  // one index cost for the whole repository, over the candidate pairs that actually exist — counted once across every
  // partition, never per partition (§9.4a), the same discipline mine()'s own `idxCost` and the archetype cell keep.
  { const KD = 2; const idxCostD = Math.ceil(Math.log2(Math.max(devCostCand.length, 2)));
    for (const { ef, dv, all } of devCostCand) { const neff = dv.length, N = all.length;
      if (neff < CFG.minEff) continue;
      const local = fixTally(dv), glob = fixTally(all);
      let data = 0;
      for (const v of ['has_fix', 'no_fix']) { const nv = local[v]; if (nv) data += nv * Math.log2(kt(local, KD, v, neff) / kt(glob, KD, v, N)); }
      const bits = data - 0.5 * (KD - 1) * Math.log2(Math.max(neff, 2)) - idxCostD;
      if (bits <= 0) continue;
      if (!(local.has_fix / neff > glob.has_fix / N)) continue; // an excess, never a deficit: deviants that need FEWER repairs are not a cost
      // mine()'s own loss bound, applied to `has_fix` specifically: telling a maintainer that leaving a deviation will
      // cost a repair is a claim about the next deviant, and it may be wrong at most 1 time in λ. It already implies a
      // majority, so no separate vacuity test is needed. It is also why this speaks only for near-unanimous deviant
      // populations (5 of 5, 11 of 12) — "9 of 12" is real evidence and still not worth a maintainer's trust.
      if (!((local.has_fix + 0.5) / (neff + KD / 2) >= 1 - 1 / CFG.lambda)) continue;
      ef.cost = { k: local.has_fix, n: neff, baseK: glob.has_fix, baseN: N, bits: +bits.toFixed(2) }; } }
  // steers: every seed, resolved against the current tree — the exemplar's line, each seeded surface with its value and the
  // measured share of that value in the exemplar's partition today (decided vs practiced, side by side)
  model.steers = (seeds || []).map(sd => { let found = null, pname = null;
    for (const pr of prepared) { const s = pr.ps.find(x => x.rel === sd.path && x.name === sd.name); if (s) { found = s; pname = pr.pname; break; } }
    // practiced-by is measured in the exemplar's most specific context that has a population: its group, else its deepest
    // directory holding ≥ dirMin scopes of its kind, else the partition — the same locality `check` would judge it by
    const resolveSurface = pid => { if (!found || found.preds[pid] === undefined) return { pid, value: null, share: null, n: 0, context: null };
      // marker surfaces (decorator / supertype / return type) get a same-denominator comparison: the carriers of this marker
      // against the carriers of its alternatives among the seed's other surfaces — "adopted by 11 of 241 (route 230)" reads,
      // "1% of 1010 methods" reads as noise (measured: the judge called the old framing the feature's worst wording problem)
      const v = found.preds[pid]; const pr = prepared.find(p => p.pname === pname); const gi = pr.ps.indexOf(found); const role = pr.ri.assign.get(gi);
      const segs = found.rel.split('/').slice(0, -1); const dirs = []; for (let k = segs.length; k >= 1; k--) dirs.push(segs.slice(0, k).join('/'));
      const ctxs = [];
      if (role !== undefined && !pr.ri.amb.has(gi)) ctxs.push({ label: `group «${pr.ri.medoids[role]?.label || 'group'}»`, has: (s, i) => pr.ri.assign.get(i) === role });
      for (const d of dirs) ctxs.push({ label: d + '/', has: s => s.rel.startsWith(d + '/') });
      ctxs.push({ label: scopeLabel(pname), has: () => true });
      const mk = pid.match(/^auto\.(deco|extends|returns):@?(.+)$/); let rivals = null;
      if (mk) { const pre = { deco: 'decos', extends: 'sup', returns: 'rets' }[mk[1]]; const nameOf = x => x.replace(/^\[|\]$/g, '');
        const carrierN = x => pr.ps.filter(s2 => s2.kind === found.kind && (s2[pre] || []).includes(nameOf(x))).length;
        const others = sd.pids.filter(q => q !== pid).map(q => q.match(/^auto\.(deco|extends|returns):@?(.+)$/)).filter(m2 => m2 && m2[1] === mk[1]);
        if (others.length) rivals = { own: carrierN(mk[2]), alts: others.map(m2 => ({ name: m2[2], n: carrierN(m2[2]) })) }; }
      for (const c of ctxs) { let n = 0, k = 0; pr.ps.forEach((s, i) => { if (s.kind !== found.kind || s.preds[pid] === undefined || !c.has(s, i)) return; n++; if (s.preds[pid] === v) k++; });
        if (n >= CFG.dirMin || c === ctxs[ctxs.length - 1]) return { pid, value: v, retires: (sd.retired || []).includes(pid), rivals, share: n ? +(k / n).toFixed(2) : null, n, context: c.label }; }
      return { pid, value: v, retires: (sd.retired || []).includes(pid), rivals, share: null, n: 0, context: null }; };
    // a stored `baseline` (captured by `grain seed add` at the moment the decision was recorded, on the FIRST seeded
    // surface only — see `baselineShare`) rides along on that one surface so `practicedBy`'s callers can show the delta
    // without a second pass over the model
    const surfaces = sd.pids.map(pid => { const sf = resolveSurface(pid); return pid === sd.pids[0] && sd.baseline ? { ...sf, baseline: sd.baseline } : sf; });
    const role = found ? (() => { const pr = prepared.find(p => p.pname === pname); const gi = pr.ps.indexOf(found); const r = pr.ri.assign.get(gi); return r !== undefined && !pr.ri.amb.has(gi) ? r : null; })() : null;
    return { id: sd.id, path: sd.path, name: sd.name, kind: found ? found.kind : null, line: found ? found.line : null, partition: pname, role, found: !!found, surfaces, weight: sd.weight, topic: sd.topic || '', note: sd.note || '', author: sd.author || '', createdAt: sd.createdAt || '' }; });
  // cross-cell contested marking: any accepted fact asserting a value a seed's exemplar contradicts is superseded — its
  // deviations toward the seeded value stand down and its renderings say so (the old rule must not argue with the decision)
  for (const part2 of model.partitions) for (const f of part2.facts) for (const sd of seeds || []) {
    if (!sd.pids.includes(f.pid) || f.contested || (f.seeded || []).includes(sd.id)) continue;
    const st2 = model.steers ? null : null; // steers not built yet — read the exemplar's value from its partition scopes
    const pr2 = prepared.find(pr => pr.ps.some(x => x.rel === sd.path && x.name === sd.name)); if (!pr2) continue;
    const ex2 = pr2.ps.find(x => x.rel === sd.path && x.name === sd.name); const v2 = ex2 ? ex2.preds[f.pid] : undefined;
    if (v2 !== undefined && v2 !== f.exp) { f.contested = sd.id; f.suppressedValue = v2; } }
  // the relation layer: file→file edges bound by the tri-state resolver, and their module-level aggregation — the measured
  // architecture (which modules exist, who depends on whom, where the cycles are)
  try { const fileSet2 = new Set(files);
    // workspace members: each is discovered from ITS OWN manifest, never a hardcoded name ("kod to kod") — an npm
    // package (name + resolvable entry file) and/or a Cargo crate (name + src/ dir) can both live at the same `d`,
    // so a directory contributes 0, 1 or 2 entries. §017: the Cargo half feeds the Rust branch of wsResolverFor's
    // cross-crate `use crate_name::...` resolution (relations.mjs) exactly the way the npm half already feeds its
    // bare-specifier branch — the same mechanism, not a new one.
    const workspaces = pkgs.filter(d => d !== '.').flatMap(d => { const out = [];
      try { const pj = JSON.parse(readFileSync(join(root, d, 'package.json'), 'utf8'));
        if (pj.name) { const cand = [typeof pj.main === 'string' ? (d + '/' + pj.main.replace(/^\.\//, '')) : null, d + '/src/index.ts', d + '/src/index.tsx', d + '/src/index.js', d + '/index.ts', d + '/index.js', d + '/src/main.ts'].filter(Boolean);
          const entry = cand.find(c => fileSet2.has(c)) ?? cand.find(c => fileSet2.has(c.replace(/\.js$/, '.ts'))) ?? null;
          if (entry) out.push({ name: pj.name, dir: d, entry }); } }
      catch { /* no package.json at d — fine, it may still be a Cargo crate below */ }
      try { const name = readCargoCrateName(readFileSync(join(root, d, 'Cargo.toml'), 'utf8')); if (name) out.push({ name, dir: d, srcDir: d + '/src' }); }
      catch { /* no Cargo.toml at d */ }
      return out; });
    // tsconfig/jsconfig path aliases (`@/*` → `src/*`): read every config in the tree (extends followed, JSONC
    // tolerated), targets pre-resolved to root-relative — the resolver, and `check` from the model, never re-read them
    const tsAliases = [];
    try { const cfgDirs = new Map(); // dir → config name; tsconfig.json wins over a sibling jsconfig.json
      const addCfg = (dd, name) => { if (name === 'tsconfig.json' || !cfgDirs.has(dd)) cfgDirs.set(dd, name); };
      if (tree && tree.allPaths) { for (const rel2 of tree.allPaths) { const bn2 = basename(rel2);
          if ((bn2 === 'tsconfig.json' || bn2 === 'jsconfig.json') && !HARD_EXCL.test(rel2)) addCfg(dirname(rel2), bn2); } }
      else (function fc(d) { let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of es) { const full = join(d, e.name); if (EXCL.test(toPosix(relative(root, full)) + '/')) continue;
          if (e.isDirectory()) fc(full);
          else if (e.name === 'tsconfig.json' || e.name === 'jsconfig.json') addCfg(toPosix(relative(root, d)) || '.', e.name); } })(root);
      const readCfg = (cfgRel, depth) => { if (depth > 3) return null;
        let j; try { j = parseJsonc(readFileSync(join(root, cfgRel), 'utf8')); } catch { return null; }
        const dir = dirname(cfgRel); const norm = q => (pnormalize(pjoin(dir, q)).replace(/\/+$/, '') || '.');
        const parent = typeof j.extends === 'string' && j.extends.startsWith('.') // a package-name extends stays external
          ? readCfg(norm(/\.json$/.test(j.extends) ? j.extends : j.extends + '.json'), depth + 1) : null;
        const co = j.compilerOptions || {};
        const base = co.baseUrl !== undefined ? norm(co.baseUrl) : (parent?.base ?? null);
        const tbase = co.baseUrl !== undefined ? norm(co.baseUrl) : dir; // targets: relative to the DECLARING config's baseUrl, else its dir (tsc ≥4.4)
        const patterns = co.paths ? Object.entries(co.paths).map(([pat, ts2]) => [pat, (Array.isArray(ts2) ? ts2 : [ts2]).map(t => pnormalize(pjoin(tbase, t)))])
          : (parent?.patterns ?? null); // child `paths` REPLACES the parent's wholesale, as tsc merges
        return { base, patterns }; };
      for (const [dd, name] of [...cfgDirs].sort()) { if (tsAliases.length >= 200) break;
        const c = readCfg(dd === '.' ? name : dd + '/' + name, 0);
        if (c && ((c.patterns && c.patterns.length) || c.base != null)) tsAliases.push({ dir: dd, base: c.base, patterns: c.patterns || [] }); } }
    catch { /* aliases are an extra channel, never a reason to fail the pass */ }
    const edges = buildEdges({ root, files, relFacts, workspaces, pkgs, tsAliases });
    model.edges = edges.slice(0, 30000); model.edgesTruncated = Math.max(0, edges.length - 30000);
    model.moduleGraph = moduleGraph(edges, files, pkgs);
    // what the single-file `check` path needs to resolve an EDITED file's references against the accepted tree
    model.relDecls = compactDecls(files, relFacts);
    model.workspaces = workspaces;
    model.tsAliases = tsAliases;
    model.csGlobal = tableFrom(files, relFacts).csGlobal;
    model.filesAll = files;
    // every tracked path, not only the code-parseable ones: placement advice and companion-file facts are pure
    // path/stem mechanics, so a doc, migration or config is as valid a candidate as a source file (tracked ⇒ code
    // ruling, config.mjs) — code-only `files` stays the extraction/edge universe, unchanged
    model.pathsAll = tree && tree.allPaths ? tree.allPaths.filter(p => !HARD_EXCL.test(p)) : files;
    model.archNorms = architectureNorms(model); }
  catch (e) { log('relation pass failed: ' + (e?.message || e)); model.edges = []; model.edgesTruncated = 0; model.moduleGraph = { nodes: [], edges: [], cycles: [] }; model.relDecls = null; model.archNorms = []; }
  // implications per group: what a new member COMES WITH — a same-stem companion file (whatever dotted suffix the repo
  // pairs these files with: `*.test.tsx`, `*.stories.tsx`, `*.module.ts`), and the file that registers/imports the
  // members (DI registration, a barrel) — raw path + edge evidence, no name semantics
  { const sufChain = rel => { const parts = basename(rel).split('.'); return parts.length >= 2 ? '*.' + parts.slice(1).join('.') : null; };
    const byStem = new Map(); for (const f2 of (model.pathsAll || files)) (byStem.get(stem0(f2)) || byStem.set(stem0(f2), []).get(stem0(f2))).push(f2);
    const inEdges = new Map(); for (const e of model.edges || []) (inEdges.get(e.to) || inEdges.set(e.to, []).get(e.to)).push(e.from);
    const impliedOf = fileList => { const mf = [...new Set(fileList)]; if (mf.length < 4) return null; const fset = new Set(mf);
      const compCnt = new Map(); const compEx = new Map(); let withComp = 0;
      for (const f2 of mf) { const all2 = byStem.get(stem0(f2)) || []; if (all2.length > 6) continue; // `index`-like stems pair everything with everything — no evidence
        const sibs = all2.filter(s2 => s2 !== f2 && !fset.has(s2) && sufChain(s2) !== sufChain(f2));
        if (!sibs.length) continue; withComp++;
        for (const sfx of new Set(sibs.map(sufChain).filter(Boolean))) { compCnt.set(sfx, (compCnt.get(sfx) || 0) + 1); if (!compEx.has(sfx)) compEx.set(sfx, sibs.find(s2 => sufChain(s2) === sfx)); } }
      const topComp = [...compCnt].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
      const imp = new Map(); for (const f2 of mf) for (const src2 of inEdges.get(f2) || []) if (!fset.has(src2)) imp.set(src2, (imp.get(src2) || 0) + 1);
      const topImp = [...imp].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
      const out2 = {};
      if (topComp && topComp[1] / mf.length >= 0.6) out2.companion = { pattern: topComp[0], share: +(topComp[1] / mf.length).toFixed(2), n: mf.length, example: compEx.get(topComp[0]) };
      if (topImp && topImp[1] / mf.length >= 0.6 && topImp[1] >= 4) out2.importedBy = { file: topImp[0], n: topImp[1], of: mf.length };
      else { const suffixOf = f3 => { const parts = basename(f3).split('.'); return parts.length >= 3 ? '*.' + parts.slice(-2).join('.') : null; };
        const cnt2 = new Map();
        for (const f3 of mf) { const sufs = new Set((inEdges.get(f3) || []).filter(s3 => !fset.has(s3)).map(suffixOf).filter(Boolean)); for (const sf3 of sufs) cnt2.set(sf3, (cnt2.get(sf3) || 0) + 1); }
        const top2 = [...cnt2].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
        if (top2 && top2[1] / mf.length >= 0.6 && top2[1] >= 4) out2.importedByPattern = { pattern: top2[0], n: top2[1], of: mf.length }; }
      return Object.keys(out2).length ? out2 : null; };
    for (const part2 of model.partitions) {
      for (const [mk, fl] of Object.entries(part2.markerImplied || {})) { const r2 = impliedOf(fl); if (r2) part2.markerImplied[mk] = r2; else delete part2.markerImplied[mk]; }
      part2.groupImplied = {};
      const byRole2 = new Map(); for (const [k, r2] of Object.entries(part2.assignments)) { if (r2 === -1) continue; (byRole2.get(r2) || byRole2.set(r2, new Set()).get(r2)).add(k.split('#')[0]); }
      for (const [r2, fset] of byRole2) { const r3 = impliedOf([...fset]); if (r3) part2.groupImplied[r2] = r3; }
      // (§J3.2, the "name stem" half) which OTHER role group of this partition group A's members are paired with by
      // `stem0` — accepted on a RAW SHARE, impliedOf.companion's own >= 0.6 over n >= 4 just above, and deliberately
      // NOT an MDL/lambda test: the two halves of a `kin:` line rest on different categories of evidence, and this one's
      // standing precedent is companion/importedBy, which already speaks through `recipe:` from the same block.
      part2.groupKin = {};
      const roleFiles = [...byRole2].map(([r2, fset]) => [r2, [...fset].sort()]);
      for (const [rA, fa] of roleFiles) { if (fa.length < 4) continue;
        const aStems = fa.map(stem0);
        let best = null;
        for (const [rB, fb] of roleFiles) { if (rB === rA) continue;
          const bStems = new Set(fb.map(stem0));
          let n2 = 0; for (const st2 of aStems) if (bStems.has(st2)) n2++;
          if (!best || n2 > best.n || (n2 === best.n && rB < best.role)) best = { role: rB, n: n2 }; }
        if (!best || best.n / fa.length < 0.6) continue;
        part2.groupKin[rA] = { role: best.role, label: part2.medoids[best.role]?.label || 'group', n: best.n, of: fa.length, share: +(best.n / fa.length).toFixed(2) }; } } }
  // structural twins (H4, §J3.4): one entry per (partition, role) with a certified profile, dominant name suffix
  // computed alongside (the same majority-vote shape J3.2's groupKin already uses for role membership) so a twin
  // pair can report `namedDifferently` without a second pass over `assignments`.
  { const pool = []; const twinMeta = new Map();
    for (const part2 of model.partitions) for (const [r, pf] of Object.entries(part2.profiles || {})) {
      if (!pf || !pf._tpl) continue;
      const role = +r; const label = part2.medoids[role]?.label || 'group'; const key = part2.name + '#' + r;
      const sufCnt = new Map();
      for (const [mk, rr] of Object.entries(part2.assignments || {})) { if (rr !== role) continue;
        const toks = tokenize(mk.split('#')[2]); if (!toks.length) continue;
        const suf = toks[toks.length - 1]; sufCnt.set(suf, (sufCnt.get(suf) || 0) + 1); }
      const topSuf = [...sufCnt].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
      pool.push({ key, part: part2.name, role, label, tpl: pf._tpl, shared: pf.shared });
      twinMeta.set(key, { part: part2.name, role, label, suffix: topSuf ? topSuf[0] : null }); }
    model.twins = twinsOf(pool, log).map(pr => { const A = twinMeta.get(pr.a), B = twinMeta.get(pr.b);
      const twin = { a: { part: A.part, role: A.role, label: A.label }, b: { part: B.part, role: B.role, label: B.label }, sim: pr.coverage };
      if (A.suffix && B.suffix && A.suffix !== B.suffix) twin.namedDifferently = [A.suffix, B.suffix];
      return twin; }); }
  // waivers (.grain/seeds.jsonl records with a `waiver` field): one scope excused from one surface, resolved against
  // the current tree exactly like a steer's exemplar (`found` = the scope still exists). DELIBERATELY render-time only:
  // unlike a steer, a waiver never reaches mine() or the weights, and never changes a count — `check` still governs the
  // scope by the convention and still counts it non-conforming; all a waiver changes is the VOICE that reports it.
  model.waivers = (waivers || []).map(wv => { let found = null, pname = null;
    for (const pr of prepared) { const s = pr.ps.find(x => x.rel === wv.path && x.name === wv.name); if (s) { found = s; pname = pr.pname; break; } }
    return { id: wv.id, path: wv.path, name: wv.name, pid: wv.pid, kind: found ? found.kind : null, line: found ? found.line : null, partition: pname, found: !!found,
      note: wv.note || '', author: wv.author || '', createdAt: wv.createdAt || '' }; });
  // boundary decisions (.grain/seeds.jsonl records with a `boundary` field): resolved against the current tree
  model.boundaries = (boundaries || []).map(b => ({ ...b,
    fromLive: files.some(f => b.boundary.from === '.' ? !f.includes('/') : (f + '/').startsWith(b.boundary.from + '/')),
    toLive: files.some(f => (f + '/').startsWith(b.boundary.to + '/')) }));
  model.agentShare = agentShareDen ? +(agentShareNum / agentShareDen).toFixed(2) : null;
  model.cochange = H ? [...H.cochange].sort((a, b) => b.sup - a.sup || (a.a < b.a ? -1 : a.a > b.a ? 1 : a.b < b.b ? -1 : 1)).slice(0, 5000) : []; // cap by descending support
  // scope-level co-change (§J5.7b): mirrors model.cochange above, but `a`/`b` are scope keys whose path half is a
  // HISTORICAL path (§J4.1) — remapped through currentPathOf ONCE here, at learn-time, because checkFile never
  // sees H (only the model, exactly like model.cochange/model.moves/model.msgAffinity).
  model.scopeCochange = [];
  if (H && H.scopeCochange && H.scopeCochange.length) {
    const liveScope = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
    const currentOfScope = currentPathOf(H.fps || [], liveScope);
    const remapScopeKey = k => { const i = k.indexOf('#'); return i < 0 ? k : currentOfScope(k.slice(0, i)) + k.slice(i); };
    model.scopeCochange = H.scopeCochange.map(p => ({ ...p, a: remapScopeKey(p.a), b: remapScopeKey(p.b) }))
      .sort((a, b) => b.sup - a.sup || (a.a < b.a ? -1 : a.a > b.a ? 1 : a.b < b.b ? -1 : 1)).slice(0, 5000); }
  // the language bridge: what files this repo touches when a commit message says <token> — pruned to living files,
  // strongest tokens first; `where` cites it (with the example commit) for query words the code itself never says
  model.msgAffinity = [];
  if (H && H.msgAff) { const fset3 = new Set(files);
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
    const K3 = 2, nmc3 = H.nonMegaCommits || 1, fc3 = H.fileCommits || {};
    let universe3 = 0; for (const fm of Object.values(H.msgAff)) universe3 += Object.keys(fm).length; // counted ONCE repo-wide over the unfiltered candidates, as architectureNorms counts pairs.size
    const idxCost3 = Math.ceil(Math.log2(Math.max(universe3, 2)));
    const bridgeBits = (t, f, k) => {
      const df = (H.msgTokCommits || {})[t] || 0; if (!df) return null;
      const baza = (fc3[f] || 0) / nmc3; if (!(baza > 0 && baza < 1)) return null; // a never-touched or always-touched file has no rate to beat
      if (!(k / df > baza)) return null; // a bridge is EXCESS touching, never a deficit
      if (!((k + 0.5) / (df + K3 / 2) >= 1 - 1 / CFG.lambda)) return null; // the one loss constant, on the touched outcome specifically
      const counts = { touched: k, not: df - k };
      let data = 0;
      if (k) data += k * Math.log2(kt(counts, K3, 'touched', df) / baza);
      if (df - k) data += (df - k) * Math.log2(kt(counts, K3, 'not', df) / (1 - baza));
      const bits = data - 0.5 * (K3 - 1) * Math.log2(Math.max(df, 2)) - idxCost3;
      return bits > 0 ? bits : null; };
    const rows = Object.entries(H.msgAff).map(([t, fm]) => { const fs3 = Object.entries(fm)
        .map(([f, n]) => { if (!fset3.has(f)) return null; const b = bridgeBits(t, f, n); return b === null ? null : [f, n, b]; }).filter(Boolean)
        .sort((a, b) => b[2] - a[2] || (a[0] < b[0] ? -1 : 1)).slice(0, 6); // strongest evidence first: bits, not raw co-occurrence count
      const tot = fs3.reduce((a2, [, n]) => a2 + n, 0);
      return tot >= 2 ? { t, files: fs3, ex: (H.msgAffEx || {})[t] || null } : null; }).filter(Boolean);
    model.msgAffinity = rows.sort((a, b) => b.files.reduce((x, [, n]) => x + n, 0) - a.files.reduce((x, [, n]) => x + n, 0) || (a.t < b.t ? -1 : 1)).slice(0, 1500); }
  // concepts (§J4.3b): the top repo-wide tokens where BOTH the commit messages and the code itself say something —
  // `H.msgTokCommits` (commit-message document frequency, §J2.4) times each token's card-level document frequency
  // (how many of buildCards(model)'s cards carry it). A token absent from either side scores 0 by construction, so
  // this is never a global dictionary, only genuinely shared vocabulary. Precomputed here (mirroring `model.moves`
  // just below) because `sessionContext` can neither load history (no refresh, no parsing — must stay instant) nor
  // afford `buildCards(model)` inside a hook that today does nothing but read a JSON file; this is the one place in
  // the codebase allowed to pay that cost, since it runs only at index/re-learn time, never per query.
  model.concepts = [];
  if (H) { const cardDf = new Map();
    for (const card of buildCards(model)) for (const t of card.toks.keys()) cardDf.set(t, (cardDf.get(t) || 0) + 1);
    const msgTokCommits = H.msgTokCommits || {};
    const keys = new Set([...Object.keys(msgTokCommits), ...cardDf.keys()]);
    const scored = [];
    for (const t of keys) { const score = (msgTokCommits[t] || 0) * (cardDf.get(t) || 0); if (score > 0) scored.push([t, score]); }
    model.concepts = scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 12).map(([t]) => t); }
  // placement-from-history (§J2.5): `placementHit` never sees `H` — `ensureFresh`'s warm-cache fast path returns
  // without ever calling `loadHistory`, so a small, compressed rename-affinity map is precomputed here instead and
  // carried ON the model. Same `sufOf`/`nameTokens` helpers `placementHit`'s own name-kin branch uses, so a
  // name-kin match and a move-match agree on what a "token" or "suffix" means.
  model.moves = {};
  if (H && H.fps) {
    for (const fp of H.fps) for (const [oldPath, newPath] of (fp.renames || [])) {
      const suf = sufOf(newPath); if (!suf) continue;
      const oldDir = dirname(oldPath), newDir = dirname(newPath); if (oldDir === newDir) continue; // a same-directory rename (pure name change) is not a MOVE
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
    const refinedM = model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || []));
    const liveM = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
    const currentOf = currentPathOf(H.fps, liveM);
    // a scope renamed IN PLACE (its file kept) keeps its historical `#kind#name` half and simply fails to resolve
    // against today's assignments — an accepted residual miss, not something this pass tries to undo
    const cellsOf = fp => { const out = new Set();
      for (const f of fp.files) { const cur = currentOf(f); out.add('m:' + refinedM(cur)); const sf = sufOf(cur); if (sf) out.add('k:' + sf); }
      for (const key of fp.scopes || []) { const i = key.indexOf('#'); if (i < 0) continue;
        const k2 = currentOf(key.slice(0, i)) + key.slice(i);
        for (const p of model.partitions) { const r = p.assignments[k2]; if (!Number.isInteger(r) || r === -1) continue; out.add('g:' + p.name + '#' + r); break; } }
      return out; };
    const fpCells = new Map(); for (const fp of H.fps) fpCells.set(fp, cellsOf(fp));
    const cellGlobal = new Map(); for (const [, cs] of fpCells) for (const c of cs) cellGlobal.set(c, (cellGlobal.get(c) || 0) + 1);
    const dfTok = new Map(); for (const fp of H.fps) for (const t of fp.toks) dfTok.set(t, (dfTok.get(t) || 0) + 1);
    // the index cost, counted ONCE repo-wide over the REAL candidate population — the same shape mine() (`C` at its
    // own cell loop), architectureNorms and bridgeBits all count it in, never per cluster
    let C = 0; for (const [, g] of cellGlobal) if (g >= CFG.minRaw) C++;
    const idxCost = Math.ceil(Math.log2(Math.max(C, 2)));
    const N = H.fps.length, K = 2;
    // `induceClusters` samples at NCAP distinct footprint signatures: past that, an archetype's members are the
    // footprints in its surviving buckets and `n` counts exactly those — a real, enumerable set of commits, which
    // is what "k of n" claims. It is not a scaled-up estimate of a larger population.
    const { clusters } = induceClusters(H.fps, { feats: fp => fpCells.get(fp) });
    const archetypes = [];
    for (const c of clusters) {
      if (c.members.length < CFG.minRaw) continue;
      const n = c.members.length;
      const cnt = new Map(); for (const fp of c.members) for (const cell of fpCells.get(fp)) cnt.set(cell, (cnt.get(cell) || 0) + 1);
      const cells = [];
      for (const [cell, k] of cnt) {
        const local = { present: k, absent: n - k };
        const gp = cellGlobal.get(cell) || 0;
        const glob = { present: gp, absent: N - gp };
        let data = 0;
        for (const v of ['present', 'absent']) { const nv = local[v]; if (nv) data += nv * Math.log2(kt(local, K, v, n) / kt(glob, K, v, N)); }
        const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(n, 2)) - idxCost;
        // evidence, then the one loss constant, then vacuity: a cell the MAJORITY of the shape's own members do not
        // touch describes what the shape avoids, and J4.2 would render it as a missing place to go add a file to
        const certified = bits > 0 && (k + 0.5) / (n + K / 2) >= 1 - 1 / CFG.lambda && k * 2 > n;
        cells.push({ cell, k, share: +(k / n).toFixed(3), bits: +bits.toFixed(2), certified }); }
      cells.sort(archCellSort);
      const cert = cells.filter(x => x.certified);
      if (!cert.length) continue;                                     // a shape with nothing certified is not a shape
      const tc = new Map(); for (const fp of c.members) for (const t of fp.toks) tc.set(t, (tc.get(t) || 0) + 1);
      const toks = [...tc].map(([t, k2]) => [t, k2 * Math.log2(1 + N / (dfTok.get(t) || 1))])
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 8).map(([t]) => t);
      // `fps` carries only a commit's ≤12 normalized message tokens, never its subject — the same limitation
      // `howCmd` works around with a git lookback it cannot do here, and falls back to exactly this joined string
      const exemplars = [...c.members].sort((a, b) => b.ts - a.ts || (a.sha < b.sha ? -1 : a.sha > b.sha ? 1 : 0)).slice(0, 3)
        .map(fp => [fp.sha, fp.toks.length ? fp.toks.join(' ') : '(no commit message)', fp.ts]);
      archetypes.push({ label: cert.slice(0, 3).map(x => archCellLabel(model, x.cell)).join(' + '), n, cells, exemplars, toks }); }
    archetypes.sort((a, b) => b.n - a.n || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    model.changeArchetypes = archetypes.map((a, i) => ({ id: 'ca' + (i + 1), ...a })); }
  // value concordance (§J3.1): where each value lives, and which values are siblings inside one container. The
  // df window is a POPULATION gate on the index (CFG.valueDfMin/valueDfMaxShare), never an acceptance test — a
  // value in one file alone has no concordance, and one in a fifth of the repository is furniture.
  // `contFiles`: container -> file -> the member keys THIS FILE actually carries in THIS container. `vConts`
  // (container -> every key ever seen anywhere under it) is a UNION and stays for the "≥2 candidate members at
  // all" shortlist below, but the ACTUAL sibling/population math must never read from it directly (see below) —
  // that was the pre-existing bug this ticket fixes (§G/J7.3): a value counted as "carried" by a file if it
  // appeared ANYWHERE in that file, not inside THIS container.
  const vPlaces = new Map(), vConts = new Map(), vNames = new Map(), contFiles = new Map();
  for (const s of all) { if (s.kind !== 'file') continue;
    for (const e of (s.vals || [])) { const key = e.k + ':' + e.v;
      (vPlaces.get(key) || vPlaces.set(key, []).get(key)).push([s.rel, e.line]);
      (vConts.get(e.c) || vConts.set(e.c, new Set()).get(e.c)).add(key);
      if (e.cn && !vNames.has(e.c)) vNames.set(e.c, e.cn);
      const fm = contFiles.get(e.c) || contFiles.set(e.c, new Map()).get(e.c);
      (fm.get(s.rel) || fm.set(s.rel, new Set()).get(s.rel)).add(key); } }
  // extraction already deduped per (v, k) per file, so a place count IS a document frequency. The upper bound is
  // rounded UP: on a 17-file repository a fifth is 3.4 files, and a value in 3 of them still says something.
  const dfMax = Math.ceil(CFG.valueDfMaxShare * files.length);
  let vKept = [...vPlaces].filter(([, ps]) => ps.length >= CFG.valueDfMin && ps.length <= dfMax);
  if (vKept.length > VALUE_INDEX_CAP) { // the weakest evidence goes first: fewest places, ties by key
    vKept.sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
    log(`[learn] value index cap ${VALUE_INDEX_CAP}: dropped ${vKept.length - VALUE_INDEX_CAP} least-frequent value(s)`);
    vKept = vKept.slice(0, VALUE_INDEX_CAP); }
  model.valueIndex = Object.fromEntries(vKept.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
    .map(([k, ps]) => [k, ps.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1])]));
  // a container speaks only through the members that survived the gate: one survivor leaves no sibling
  // relationship to report, and J3.2's "how many of this set appear here" is computable only over members the
  // index can actually locate. CORE, not UNION: a candidate member also needs a 2/3 supermajority of the files
  // that DECLARE this container (§J7.3) — the same threshold `t` below and markers already use (`groupKin` uses a
  // different, deliberately non-MDL 0.6 floor, not this one — see its own comment) — or
  // one file's one-off key (an i18n locale's own extra string, a monorepo package's bespoke script) inflates the
  // "sibling set" with something most carriers never had, which is exactly what produced the pre-existing
  // duplication bug (a UNION-keyed set that never matches any file's real membership certifies nothing true).
  model.valueSiblings = {};
  for (const [c, keys] of [...vConts].sort((a, b) => a[0] - b[0])) { if (keys.size < 2) continue;
    const fm = contFiles.get(c), declaring = fm.size, need = Math.ceil(declaring * 2 / 3);
    const surv = [...keys].filter(k => {
      if (!Object.hasOwn(model.valueIndex, k)) return false;
      let carriers = 0; for (const memberSet of fm.values()) if (memberSet.has(k)) carriers++;
      return carriers >= need; }).sort();
    if (surv.length >= 2) model.valueSiblings[c] = surv; }
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
    const sibs = model.valueSiblings[c], m = sibs.length;
    // file -> how many of this container's members it carries — read from `contFiles` (per-container, per-file
    // membership), NOT `model.valueIndex[k]`'s global place list: that list says the value exists SOMEWHERE in the
    // file, not inside THIS container, and credited a file for "carrying" a member it never actually had here.
    const h = new Map();
    for (const [rel, memberSet] of contFiles.get(+c)) { let n = 0; for (const k of sibs) if (memberSet.has(k)) n++; if (n) h.set(rel, n); } // container ids are hashStr numbers; `c` here comes from Object.keys(model.valueSiblings), always a string
    const t = Math.min(Math.ceil(m * 2 / 3), m - 1); // clamped: at t = m every qualifier is complete by construction and the cell asks nothing
    let neff = 0; const full = [], near = [];
    for (const [f, n] of h) { if (n < t) continue; neff++;
      if (n === m) full.push(f); else if (n === m - 1) near.push(f); }
    if (neff < CFG.minRaw || neff < CFG.minEff) continue;
    const counts = { present: full.length, missing: neff - full.length };
    let data = 0; for (const v of ['present', 'missing']) { const nv = counts[v]; if (nv) data += nv * Math.log2(kt(counts, KV, v, neff) * 2); }
    const bits = data - 0.5 * (KV - 1) * Math.log2(Math.max(neff, 2)) - idxCostV;
    if (bits <= 0) continue; // evidence = codelength gain, nothing else
    if (counts.present <= counts.missing) continue; // direction test: "this set does NOT travel together" is a true fact but not a norm anything can be a residual of
    const ne = counts.present;
    if (!((ne + 0.5) / (neff + KV / 2) >= 1 - 1 / CFG.lambda)) continue; // the one loss constant, same posterior-predictive bound
    model.valueNorms[c] = { m, ne, neff, bits, full: full.sort().slice(0, VALUE_NORM_PLACES), near: near.sort().slice(0, VALUE_NORM_PLACES) }; }
  model.historyStats = H ? { commits: H.stats.commits, events: H.stats.events, blobs: H.stats.blobs } : null; // parsed/cached/mb are run diagnostics, not repo facts — they would break byte-identity across cache states
  model.files = files.length;
  return { model, ms: Date.now() - t0, scopes: all.length, rawScopes, treeCacheOut }; }
// scope records round-trip through JSON (sets → sorted arrays) for the current-tree scope cache
export const serializeScope = s => ({ kind: s.kind, name: s.name, own: s.own || null, rel: s.rel, line: s.line, endLine: s.endLine || s.line, ord: s.ord, g: s.g || null, nt: s.nt || null, noBody: !!s.noBody, doc: s.doc || [], sk: s.sk || null, sup: s.sup, supKind: s.supKind || {}, decos: s.decos, rets: s.rets || [], ptypes: s.ptypes || [], calls: [...s.calls].sort(), seen: [...s.seen].sort(), shapes: [...s.shapes].sort(), preds: { ...s.preds }, imports: s.imports, feats: s.feats, ownCount: s.ownCount, vals: s.vals || [] });
export const hydrateScope = r => ({ ...r, calls: new Set(r.calls), seen: new Set(r.seen), shapes: new Set(r.shapes), preds: { ...r.preds } });

// ===== CHECK (verdict for one file against the model; hermetic — same input ⇒ same answer, no session state) =====
// ===== PLACEMENT ON CREATE: a NEW file whose name-kin already live in one place — path evidence only, no parse.
// The replay trials' measured failure class: both arms filed admin e2e specs beside navigation specs while
// `admin-panel/` sat one directory over, and line-level checks were structurally silent. This speaks at creation,
// from the accepted tree alone, and never commands — deliberate placement is explicitly left alone.
// «endpoint» in the query, never in the code: the commits that SAY the word show which files they touch — a learned,
// per-repo, citable translation (never a global dictionary), consulted only for tokens no card carries
function bridgeLines(model, qt, df) {
  const out = [];
  for (const t of qt) { if (df.get(t)) continue;
    const row = (model.msgAffinity || []).find(r2 => normTok(r2.t) === t || r2.t === t); if (!row) continue;
    const tot = row.files.reduce((a, [, n]) => a + n, 0);
    out.push(voice('example', `«${row.t}» appears in no code card here, but commits saying it touched: ${row.files.slice(0, 3).map(([f, n]) => `\`${f}\` (${n})`).join(' · ')}${row.ex ? ` — e.g. "${row.ex[1]}" (${row.ex[0]})` : ''}`, { sha: row.ex ? row.ex[0] : null }));
    if (out.length >= 2) break; }
  return out; }
export const QSTOP = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'with', 'and', 'or', 'my', 'our', 'this', 'that', 'it', 'is', 'are', 'be', 'do', 'doe', 'can', 'should', 'would', 'i', 'we', 'you', 'how', 'what', 'where', 'when', 'so', 'via', 'from', 'into', 'onto', 'up', 'out', 'new', 'some', 'any', 'all']);
const PL_STOP = new Set(['index', 'main', 'mod', 'util', 'utils', 'helper', 'helpers', 'common', 'shared', 'core', 'base',
  'type', 'types', 'test', 'tests', 'spec', 'specs', 'lib', 'libs', 'app', 'apps', 'src', 'file', 'files', 'data',
  'component', 'components', 'page', 'pages', 'view', 'views', 'service', 'services', 'controller', 'controllers',
  'module', 'modules', 'model', 'models', 'config', 'get', 'set', 'add', 'the',
  'does', 'not', 'non', 'see', 'sees', 'has', 'have', 'had', 'was', 'will', 'then', 'than', 'its', 'each', 'every',
  'before', 'after', 'between', 'without', 'within', 'still', 'also', 'only', 'their', 'them', 'they']);
// hoisted out of placementHit so the placement feedback loop (grain.mjs check-hook) can compute the SAME
// suffix/token key for a later write and correlate it against a pending suggestion — one function, not two copies
export function sufOf(f) { const ps2 = basename(f).split('.'); return ps2.length >= 3 ? ps2.slice(-2).join('.').toLowerCase() : (ps2[1] || '').toLowerCase(); }
export function nameTokens(rel) { return [...new Set(tokenize(basename(rel).split('.')[0]))].filter(t => t.length >= 3 && !PL_STOP.has(t) && !QSTOP.has(t)); }
export function placementHit(model, rel) {
  const files = model.pathsAll || model.filesAll || []; if (files.length < 20 || files.includes(rel)) return null;
  const suf = sufOf(rel); if (!suf) return null;
  const dir = dirname(rel);
  const cands = files.filter(f => sufOf(f) === suf);
  if (cands.length < 3) return null;
  const toks = nameTokens(rel);
  const hits = [];
  for (const t of toks) { // name-kin: same-suffix files carrying this token in their BASENAME; directory segments only
    // as a fallback when basenames are silent — a directory named after the token otherwise inflates T past the
    // too-generic gate and mutes exactly the strongest signal (measured: `admin` vanished behind admin-panel/'s own files)
    let T = cands.filter(f => tokenize(basename(f).split('.')[0]).includes(t));
    if (T.length < 2) T = cands.filter(f => dirname(f).split('/').some(sg => tokenize(sg).includes(t)));
    if (T.length < 2 || T.length > cands.length * 0.5) continue; // absent, or too generic to place anything
    if (T.some(f => dirname(f) === dir)) continue;               // the chosen directory DOES keep such files — nothing to say
    const byDir = new Map(); for (const f of T) byDir.set(dirname(f), (byDir.get(dirname(f)) || 0) + 1);
    const [topDir, n] = [...byDir].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    if (topDir === dir || n < 2 || n / T.length < 2 / 3) continue;
    hits.push({ t, n, of: T.length, topDir, share: n / T.length }); }
  hits.sort((a, b) => b.n - a.n || b.share - a.share || (a.t < b.t ? -1 : 1));
  if (hits.length) { const best = hits[0];
    // competing name-kin are ARBITRATED in one note, strongest count first — measured (replay-3): sequential
    // contradictory notes made the worker follow the weaker statistic and sunk-cost past the stronger one
    const alts = hits.slice(1, 3).filter(h => h.topDir !== best.topDir);
    const rivalBit = alts.length ? ` Weaker name-kin point elsewhere: ${alts.map(h => `\`${h.t}\` → \`${h.topDir}/\` (${h.n} of ${h.of})`).join(' · ')} — the leading count is the one to argue with.` : '';
    // §J2.5: files that historically MOVED out of `best.topDir` (a directory change, not a rename in place) —
    // when a supermajority landed on one target, that target is the placement the note itself should have led with
    let moveBit = '';
    const moveRow = (model.moves || {})[suf + '#' + best.t];
    if (moveRow) {
      const outOfTop = Object.entries(moveRow).filter(([pair]) => pair.split('→')[0] === best.topDir);
      const total = outOfTop.reduce((a, [, c]) => a + c, 0);
      const [topPair, tn] = outOfTop.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] || [];
      if (topPair && tn >= 2 && tn / total >= 2 / 3) moveBit = ` ${tn} of ${total} such files born here were later moved to \`${topPair.split('→')[1]}/\`.`;
    }
    return { kind: 'placement', token: best.t, dir: best.topDir, suf,
      text: `[grain] ${voice('practiced', `placement: \`*.${suf}\` files named like \`${best.t}\` live in \`${best.topDir}/\` — ${best.n} of ${best.of}; \`${dir}/\` holds none.${rivalBit} Deliberate placement is fine — but if you guessed, ask \`grain where ${best.t} ${suf.split('.')[0]}\` first.${moveBit}`)}` }; }
  if (cands.length >= 5) { // fallback: the suffix itself is kept in one subtree and this file is outside it
    const cnt = new Map();
    for (const f of cands) { const segs = dirname(f).split('/'); for (let k = 1; k <= segs.length; k++) { const p2 = segs.slice(0, k).join('/'); cnt.set(p2, (cnt.get(p2) || 0) + 1); } }
    let node = null; for (const [p2, c] of cnt) if (c / cands.length >= 0.8 && p2 !== '.' && (!node || p2.length > node.p.length)) node = { p: p2, c };
    if (node && !(dir + '/').startsWith(node.p + '/'))
      return { kind: 'placement', token: null, dir: node.p, suf,
        text: `[grain] placement: ${node.c} of ${cands.length} \`*.${suf}\` files live under \`${node.p}/\`; this one is outside it (\`${dir}/\`). Deliberate is fine — if you guessed, look there first.` };
    if (node && dir === node.p && !cands.some(f => dirname(f) === node.p)) { // everyone lives one level deeper — the root holds none
      const subs = new Map(); for (const f of cands) if ((f + '/').startsWith(node.p + '/')) { const nxt = f.slice(node.p.length + 1).split('/')[0]; if (f.slice(node.p.length + 1).includes('/')) subs.set(nxt, (subs.get(nxt) || 0) + 1); }
      const top3 = [...subs].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(([d2, c2]) => `\`${d2}/\` (${c2})`);
      if (subs.size) return { kind: 'placement', token: null, dir: node.p, suf,
        text: `[grain] placement: every \`*.${suf}\` file under \`${node.p}/\` lives in a named subdirectory — ${top3.join(' · ')}${subs.size > 3 ? ` · +${subs.size - 3} more` : ''}; none sit at the root, where this file is. Deliberate is fine — if you guessed, pick the closest subdirectory.` }; } }
  return null; }

export async function checkFile({ model, root, rel, content, asPath, exemplarOk = () => true }) {
  const effRel = asPath || rel;
  const src = normalizeCR(content ?? readFileSync(join(root, rel), 'utf8'));
  const part = partitionFor(model, effRel);
  const { p, tree: tr } = await parseFile(extname(rel), src); const b = bindingFor(p._g);
  const hasError = tr.rootNode.hasError; // a real parse failure (e.g. unicode identifiers a vendored grammar can't
  // handle) leaves ERROR nodes in the tree; extractScopes silently skips them so partial content still mines, but
  // callers need this signal to tell "genuinely nothing here" apart from "the parser gave up on part of this file"
  const scopes = extractScopes(effRel, tr, b, p._g).filter(s => s.name !== '<anon>');
  const relFact = relFactsFor(effRel, src, tr, p._g); tr.delete();
  const archHits = computeArchHits({ model, root, effRel, relFact });
  const placeHit = placementHit(model, effRel);
  if (!part) return { scopes: [], governed: [], msgs: [], archHits, placeHit, newScopeHits: [], partition: null, reason: 'no partition covers this file', hasError };
  for (const s of scopes) applyVocab(s, part.vocab);
  const medoids = part.medoids;
  const { assign, amb, scores } = assignAll(scopes, medoids);
  const msgs = []; const governed = []; const waiverHits = [];
  // the waivers reaching THIS file: one scope excused from one surface, by name. Matched on (effRel, scope name, pid),
  // which is why `decide waive` refuses an ambiguous (path, name) — see cmdSeed's `waive` branch.
  const fileWaivers = (model.waivers || []).filter(wv => wv.found && wv.path === effRel);
  // specificity governance: for each pid, the most specific applicable context governs the scope —
  // role or directory over partition-wide (`_all`); among applicable facts the smallest evidence class wins.
  const ctxRank = f => /^r\d/.test(f.cid) ? 0 : f.cid.startsWith('d[') ? 1 : 2;
  scopes.forEach((s, i) => {
    let role = assign.get(i); let roleOk = role !== undefined && !amb.has(i);
    const sticky = part.assignments[skeyR(effRel, s)];
    if (sticky !== undefined && sticky !== -1) { role = sticky; roleOk = true; }   // STICKY FIRST (§8.6)
    const gov = new Map();
    for (const f of part.facts) {
      if (f.kind !== s.kind) continue;
      if (/^r\d/.test(f.cid)) { if (!roleOk || 'r' + role + ':' + s.kind !== f.cid) continue; }
      else if (f.cid.startsWith('d[')) { const d = f.cid.slice(2, f.cid.indexOf(']')); if (!effRel.startsWith(d + '/')) continue; }
      const g = gov.get(f.pid);
      if (!g || f.sraw < g.sraw || (f.sraw === g.sraw && ctxRank(f) < ctxRank(g))) gov.set(f.pid, f);
    }
    for (const f of [...gov.values()].sort((a, b) => a.cid < b.cid ? -1 : a.cid > b.cid ? 1 : a.pid < b.pid ? -1 : 1)) {
      const isRole = /^r\d/.test(f.cid);
      const label = isRole ? (medoids[role]?.label || 'group')
        : f.cid.startsWith('d[') ? `local (${f.cid.slice(2, f.cid.indexOf(']'))}/)`
        : f.pkgWide ? scopeLabel(part.name.replace(/#.*$/, '')) + ' incl. tests/examples' : scopeLabel(part.name);
      const lead = s.preds[f.pid];
      // `defining`: this fact's pid is the very feature (3× weighted) that formed the role group it governs — a
      // marker tautology (§003 resolution). Not suppressed here (report/rulesMarkdown's factTiers does that for
      // their own listing) — spoken instead, via a clause where this entry renders (cmdCheck's `conforms to:`).
      if (lead !== undefined) governed.push({ scope: s.name, kind: s.kind, line: s.line, endLine: s.endLine || s.line, pid: f.pid, label, conforms: lead === f.exp, fact: f, defining: isDefiningFact(medoids, f) });
      // the lead surface speaks for the cluster; a deviation on any sibling surface (same conform set) is still a deviation
      for (const sf of [f, ...(f.siblings || [])]) {
        const v = s.preds[sf.pid];
        if (v === undefined || v === sf.exp) continue;
        if (sf === f && f.suppressedValue && v === f.suppressedValue) continue;              // nucleation stand-down
        if (sf === f && f.altMarker) { const am = /^auto\.(deco|extends|returns):/.exec(f.altMarker.pid); // an alternative-marker deviant already conforms — never a false accusation (§altMarkerFor)
          const arr = am && (am[1] === 'extends' ? s.sup : am[1] === 'deco' ? s.decos : s.rets);
          if (arr && arr.includes(f.altMarker.name)) continue; }
        const gc = sf.srawCounts || sf.counts; // the accusation's odds run on the SAME population the message prints (n/N established)
        const neff = Object.values(gc).reduce((a2, b2) => a2 + b2, 0);
        const K = isBool(sf.pid) ? 2 : sf.alphabet.length + 1;
        const known = sf.alphabet.includes(v);
        const d = Math.log2(kt(gc, K, sf.exp, neff) / kt(gc, K, known ? v : UNSEEN, neff));
        if (d < (sf.tau || Math.log2(CFG.lambda))) continue;
        const isDir = f.cid.startsWith('d[');
        const contrast = (isRole || isDir) && f.parentExp != null && f.parentExp !== f.exp
          ? `\n  This is the local default ${isDir ? 'of this directory' : 'of this group'} — the wider package's norm differs here.` : '';
        const conformN = f.sraw - Math.round((1 - f.share) * f.sraw);
        const exs = f.exemplars.filter(e => exemplarOk(e.rel) && !(e.rel === effRel && e.name === s.name)); // render-time re-validation; never the deviant itself
        const vf = { ...sf, kind: f.kind };
        // an active waiver on THIS (scope, pid): the maintainer already answered this one. The deviation is not raised —
        // a decided voice takes its place, carrying the same n/N denominator the deviation would have printed. `governed`
        // above is untouched on purpose: the scope still counts as non-conforming, only the accusation is withdrawn.
        const wv = fileWaivers.find(w => w.name === s.name && w.pid === sf.pid);
        if (wv) { waiverHits.push({ scope: s.name, kind: s.kind, line: s.line, endLine: s.endLine || s.line, id: wv.id, pid: sf.pid, exp: sf.exp, obs: v,
            text: `[grain] ${voice('decided', `\`${s.name}\` (line ${s.line}) deliberately departs from ${verbalize(vf, f.exemplars.map(e => e.name))} — ${conformN}/${f.sraw} established do it the other way${wv.note ? ` — ${wv.note}` : ''}`, { typ: 'waiver', who: wv.author, when: wv.createdAt, id: wv.id })}` });
          break; }
        msgs.push({ scope: s.name, kind: s.kind, key: skeyR(effRel, s), line: s.line, endLine: s.endLine || s.line, pid: sf.pid, factKey: f.cid + '|' + f.pid, delta: +d.toFixed(2), exp: sf.exp, obs: v, label, exNames: f.exemplars.map(e => e.name),
          text: `[grain] ` + voice('practiced', `${label} convention: ${verbalize(vf, f.exemplars.map(e => e.name))}${sf !== f ? ` (a sibling surface of: ${verbalize(f, f.exemplars.map(e => e.name)).replace(/^\w+ here /, '')})` : ''}${f.seeded ? ` — steered by a maintainer decision${(model.steers || []).filter(st => f.seeded.includes(st.id) && st.note).map(st => ': ' + st.note).join('') || ''}` : ''}\n` +
            `  ${conformN}/${f.sraw} established ${unitOf(f.kind)} conform. Your ${s.kind} \`${s.name}\` (line ${s.line}) ${deviationPhrase(vf, v)}${known ? '' : ' — a value this repo has not used before'}.${contrast}` +
            (() => { const here = scopes.filter(s2 => s2 !== s && s2.kind === s.kind && s2.preds[sf.pid] === sf.exp).slice(0, 2);
              if (here.length) return `\n  In this file, ${here.map(s2 => `\`${s2.name}\` (line ${s2.line})`).join(' and ')} conform${here.length === 1 ? 's' : ''}.`;
              const near = exs[0]; return near ? `\n  Nearest conforming exemplar: ${ptr(near.rel, near.line, near.endLine)} \`${near.name}\`${skipLineNote(part, f, near)}.` : ''; })() +
            (exs.length ? `\n  See: ${exs.map(e => `${ptr(e.rel, e.line, e.endLine)} \`${e.name}\`${skipLineNote(part, f, e)}`).join(' · ')}` : '')
            // any note the fact carries, not only `held` — the cost of deviating is the one a reader most needs here,
            // and it can be present on a fact whose `held.since` is not
            + (() => { const n = factNotes(f); return n ? `\n  (${n.replace(/^ · /, '')})` : ''; })()) });
        break; } } });
  // structural shape (§J5.8): a scope in a role group whose profile says every certified member carries `sig` at
  // least `need` times, and this one carries it fewer. No predicate drives it — the loop above runs on
  // `part.facts` × `s.preds[f.pid]` and a shape fact has neither — so it is its own pass with its own inline text,
  // the same way steerHits/archHits/waiverHits build theirs rather than routing through `verbalize`.
  scopes.forEach((s, i) => {
    if (!s.sk) return;
    const sticky = part.assignments[skeyR(effRel, s)]; const role = sticky !== undefined && sticky !== -1 ? sticky : (assign.has(i) && !amb.has(i) ? assign.get(i) : undefined);
    const pf = role !== undefined && part.profiles && part.profiles[role];
    if (!pf || !pf.req) return;
    const have = sigCounts(s.sk);
    // ONE deviation per scope (the ticket's cap). Which one is a DECISION, not a derivation: the signature the
    // template carries most often, ties broken by signature ascending — deterministic, and independent of the
    // order `req` happens to have been serialized in.
    let worst = null;
    for (const [sig, need] of Object.entries(pf.req)) { const got = have[sig] || 0;
      if (got < need && (!worst || need > worst.need || (need === worst.need && sig < worst.sig))) worst = { sig, need, got }; }
    if (!worst) return;
    // the cost, in the SAME KT estimator every other deviation here uses (never an ad-hoc occurrence shortfall,
    // which is not on the `delta` scale the sort and the "(preference gap N bits)" render speak). The population is
    // degenerate all-true by construction — every one of pf.n members carries the signature — so this is the
    // surprise of the one exception, and it grows with the group the way every other deviation's confidence does.
    const d = -Math.log2(kt({ true: pf.n, false: 0 }, 2, 'false', pf.n));
    const label = medoids[role]?.label || 'group'; const unit = unitOf(s.kind);
    const sig = worst.sig.startsWith('id:') ? worst.sig.slice(3) : worst.sig; // same `id:` stripping skRender and the slot render do
    msgs.push({ scope: s.name, kind: s.kind, key: skeyR(effRel, s), line: s.line, endLine: s.endLine || s.line,
      pid: 'auto.shape:' + worst.sig, factKey: 'r' + role + ':' + s.kind + '|auto.shape:' + worst.sig, delta: +d.toFixed(2),
      exp: String(worst.need), obs: String(worst.got), label, exNames: [],
      summary: `${unit} all carry \`${sig}\`${worst.need > 1 ? ` (${worst.need}×)` : ''}`, // the pre-existing-summary phrase, built here rather than in `verbalize`: this is a multiset-occurrence comparison, not a pid=value pair
      text: `[grain] ` + voice('practiced', `${label} shape: ${unit} here all carry \`${sig}\`${worst.need > 1 ? ` (${worst.need}×)` : ''}\n` +
        `  ${pf.n}/${pf.n} established ${unit} conform. Your ${s.kind} \`${s.name}\` (line ${s.line}) is missing \`${sig}\` — every one of the ${pf.n} certified members of this group carries it at least ${worst.need} time${worst.need > 1 ? 's' : ''}, yours has ${worst.got}.\n` +
        `  (N of N by construction: the group's template is the anti-unification of all ${pf.n} members, so everything it carries is in every one of them — there is no partial counter behind this denominator.)`) }); });
  msgs.sort((a, b) => b.delta - a.delta || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : a.line - b.line));
  // maintainer decisions that reach this file: a steer whose exemplar shares the scope's directory subtree or group. Not a
  // deviation (the numbers may still favour the old pattern — that is the point of a steer), a decision, printed as such.
  const steerHits = [];
  for (const st of (model.steers || [])) { if (!st.found || st.partition !== part.name) continue; const sdir = dirname(st.path);
    scopes.forEach((s, i) => { if (s.kind !== st.kind) return;
      const sticky = part.assignments[skeyR(effRel, s)]; const role = sticky !== undefined && sticky !== -1 ? sticky : (assign.has(i) && !amb.has(i) ? assign.get(i) : undefined);
      // targeting: a PROMOTION reaches the exemplar's group (else its directory subtree) — a steer in tests/ must not nag every
      // test method; a RETIREMENT reaches the whole subtree, because only carriers of the retired value can depart at all
      const inScope = sf => sf.retires ? effRel.startsWith(sdir + '/') : (st.role !== null ? role === st.role : effRel.startsWith(sdir + '/'));
      for (const sf of st.surfaces) { if (sf.value === null || !inScope(sf)) continue; const v = s.preds[sf.pid]; if (v === undefined || v === sf.value) continue;
        const vf = { pid: sf.pid, exp: sf.value, kind: st.kind, heritageKind: heritageKindOf(sf.pid, model) };
        const promoted = st.surfaces.find(x => x.value !== null && !x.retires);
        const retiredName = (sf.pid.match(/^auto\.[a-z]+:(@?.+)$/) || [])[1];
        const head2 = sf.retires && promoted
          ? `${verbalize({ pid: promoted.pid, exp: promoted.value, kind: st.kind, heritageKind: heritageKindOf(promoted.pid, model) }, [st.name])}, not \`${retiredName || sf.pid}\` — ${practicedBy(promoted)}. Your ${s.kind} \`${s.name}\` (line ${s.line}) still carries \`${retiredName || sf.pid}\``
          : `${verbalize(vf, [st.name])} — ${practicedBy(sf)}. Your ${s.kind} \`${s.name}\` (line ${s.line}) ${deviationPhrase(vf, v)}`;
        steerHits.push({ scope: s.name, kind: s.kind, line: s.line, endLine: s.endLine || s.line, id: st.id, pid: sf.pid, exp: sf.value, obs: v,
          text: `[grain] ${voice('decided', `${head2}.${st.note ? `\n  ${st.note}` : ''}\n  Copy: ${st.path}:${st.line} \`${st.name}\``, { typ: 'steer', who: st.author, when: st.createdAt })}` }); } }); }
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
  const roleMembers = idx => { let n = 0; for (const r of Object.values(part.assignments)) if (r === idx) n++; return n; };
  const roleFacts = (idx, kind) => part.facts.filter(f => f.cid === 'r' + idx + ':' + kind);
  // a mined label is only ever the literal string 'group' as induceRoles' OWN fallback, never real data (§010-d) —
  // so it is exactly the case that must never render as a name; everything else names the group verbatim
  const groupName = idx => { const n = roleMembers(idx); const l = medoids[idx]?.label;
    return `${l && l !== 'group' ? `«${l}»` : 'an unlabelled cluster'} (${n} member${n === 1 ? '' : 's'})`; };
  const groupTrait = (idx, kind) => { const def = roleFacts(idx, kind).find(f => isDefiningFact(medoids, f));
    const m = def && /^auto\.(deco|extends|returns):@?(.+)$/.exec(def.pid);
    return m && (m[1] === 'deco' ? `requires @${m[2]}` : m[1] === 'extends' ? `requires extends ${m[2]}` : `requires returns ${m[2]}`); };
  const certN = (idx, kind) => roleFacts(idx, kind).length;
  // the LEADING group's full description — name plus what it actually certifies: its defining requirement when
  // there is one, else a bare convention count, else (only reached from the two "honest disclaimer" branches
  // below, never for a group chosen as lead) an explicit "certifies nothing"
  const groupDesc = (idx, kind) => { const cert = certN(idx, kind);
    return `${groupName(idx).slice(0, -1)}, ${groupTrait(idx, kind) || (cert ? `${cert} convention${cert === 1 ? '' : 's'}` : 'certifies nothing')})`; };
  const buckets = new Map(); // key: (kind, the neighbour(s) actually spoken) -> one collapsed hit
  scopes.forEach((s, i) => {
    if (s.kind === 'file' || s.kind === 'module' || s.ownCount < 2) return;
    if (part.assignments[skeyR(effRel, s)] !== undefined) return;    // known to the persisted model already — sticky governs it properly
    const sc = scores.get(i); if (!sc) return;
    let key, lead = null, detail;
    if (sc.m1 < CFG.minMemb) { key = `nogroup#${s.kind}`;
      detail = `matched no group (best ${sc.m1.toFixed(2)}, floor ${CFG.minMemb})`;
    } else {
      const bestCert = certN(sc.best, s.kind) > 0, secondCert = sc.second >= 0 && certN(sc.second, s.kind) > 0;
      if (bestCert) { lead = sc.best; key = `cert#${s.kind}#${lead}`;
        detail = `nearest ${groupDesc(sc.best, s.kind)} at ${sc.m1.toFixed(2)}${sc.second >= 0 ? `, next ${groupName(sc.second)} at ${sc.m2.toFixed(2)}` : ''}`;
      } else if (secondCert) { lead = sc.second; key = `cert#${s.kind}#${lead}`;
        detail = `nearest is ${groupName(sc.best)} at ${sc.m1.toFixed(2)}, which certifies nothing; the closest certifying group is ${groupDesc(sc.second, s.kind)} at ${sc.m2.toFixed(2)}`;
      } else { key = `nocert#${s.kind}#${sc.best}#${sc.second}`;
        detail = `nearest ${groupName(sc.best)} at ${sc.m1.toFixed(2)}${sc.second >= 0 ? `, next ${groupName(sc.second)} at ${sc.m2.toFixed(2)}` : ''} — no nearby group certifies a convention`;
      }
    }
    let b = buckets.get(key); if (!b) { b = { kind: s.kind, lead, detail, members: [] }; buckets.set(key, b); }
    b.members.push({ name: s.name, line: s.line, endLine: s.endLine || s.line });
  });
  for (const b of buckets.values()) {
    const shown = b.members.slice(0, 3).map(m => `\`${m.name}\` (line ${m.line})`).join(', ');
    const who = b.members.length > 3 ? `${shown} and ${b.members.length - 3} more` : shown;
    // (§010-e) an exemplar to open, reusing the SAME resolver the "See:" line under a deviation already uses
    // (roleExemplar) rather than a second one — a group named but pointing nowhere is strictly less useful than
    // every neighbouring message; only offered when a lead group was actually chosen (never for "no group
    // certifies" or below-floor, where there is nothing conforming nearby to point at)
    const anchor = b.lead !== null ? roleExemplar(model, part.name, b.lead) : null;
    const first = b.members[0], last = b.members[b.members.length - 1];
    newScopeHits.push({ scope: first.name, kind: b.kind, line: first.line, endLine: last.endLine, count: b.members.length,
      text: `[grain] ${who} ${b.members.length === 1 ? 'is' : 'are'} new to the index — ${b.detail}. Judged against the package baseline only.` +
        (anchor ? `\n  See: ${ptr(anchor.ex.rel, anchor.ex.line, anchor.ex.endLine)} \`${anchor.ex.name}\`` : '') }); }
  return { scopes, governed, msgs, steerHits, waiverHits, archHits, placeHit, newScopeHits, partition: part.name, hasError }; }
// established layering norms: a (source module, target module) pair is a cell exactly like a `_all`-scoped predicate
// cell in mine() (§9.4a in mathematics.md) — counts = { true: files in A that reach B, false: files in A that don't },
// neff = |files in A| — decided with the IDENTICAL KT/BIC/index-cost test as mine()'s isAll branch (core.mjs mine(),
// ~line 552-560): same kt(), same CFG.lambda, no new constant. Uses the SAME refined module assignment as
// moduleGraph (via the shared refineModOf), consistently with computeArchHits below — both now agree with what
// report/rules display (§G11 fixed a prior inconsistency here), and its own edge aggregation straight from
// model.edges/model.filesAll — never model.moduleGraph's nodes/edges.
export function architectureNorms(model) {
  const files = model.filesAll || []; const pkgs = model.pkgs || [];
  const EMPTY = new Set();
  const refined = refineModOf(files, pkgs);
  const modOf = new Map(); for (const f of files) modOf.set(f, refined(f));
  // per-file reached-module set: a target module counts once per file, regardless of how many edges/how much .n land on it
  const reached = new Map();
  for (const e of model.edges || []) { const a = modOf.get(e.from), b = modOf.get(e.to); if (a === undefined || b === undefined || a === b) continue;
    (reached.get(e.from) || reached.set(e.from, new Set()).get(e.from)).add(b); }
  const filesOf = new Map(); // module -> its files
  for (const f of files) { const m = modOf.get(f); (filesOf.get(m) || filesOf.set(m, []).get(m)).push(f); }
  // candidate universe: every (A,B) with ≥ 1 file in A reaching B — counted ONCE, repo-wide, exactly as mine()'s C
  const pairs = new Map(); // "A\x01B" -> { A, B, trueN, neff }
  for (const [A, fs2] of filesOf) {
    const targets = new Set(); for (const f of fs2) for (const b of (reached.get(f) || EMPTY)) targets.add(b);
    for (const B of targets) { let trueN = 0; for (const f of fs2) if ((reached.get(f) || EMPTY).has(B)) trueN++;
      pairs.set(A + S + B, { A, B, trueN, neff: fs2.length }); } }
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
      (filesByRole.get(role) || filesByRole.set(role, new Set()).get(role)).add(path); }
    for (const [role, fset] of filesByRole) {
      const A = part.name + '#' + role;
      const targets = new Set(); for (const f of fset) for (const b of (reached.get(f) || EMPTY)) targets.add(b);
      for (const B of targets) { let trueN = 0; for (const f of fset) if ((reached.get(f) || EMPTY).has(B)) trueN++;
        groupPairs.set(A + S + B, { A, B, trueN, neff: fset.size }); } } }
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
    let data = 0; for (const v of ['true', 'false']) { const nv = counts[v]; if (nv) data += nv * Math.log2(kt(counts, K, v, neff) * 2); }
    const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(neff, 2)) - idxCost;
    if (bits <= 0) return; // evidence = codelength gain, nothing else
    const exp = counts.true > counts.false ? 'true' : 'false'; const ne = counts[exp];
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
  const globalReachByB = new Map(); for (const { B, trueN } of pairs.values()) globalReachByB.set(B, (globalReachByB.get(B) || 0) + trueN);
  const totalFiles = files.length;
  // n.trueN is not stored on preAccept entries (it would be a schema-visible field fully derivable from exp/ne/neff)
  const outsideShare = n => { const denom = totalFiles - n.neff; if (denom <= 0) return 0;
    const trueN = n.exp === 'true' ? n.ne : n.neff - n.ne;
    return (globalReachByB.get(n.to) - trueN) / denom; };
  return preAccept.filter(n => n.exp === 'true' || trueTargets.has(n.to) || outsideShare(n) >= 0.1);
}
// architecture: the file's CURRENT out-edges resolved against the accepted tree — a reference that creates the FIRST
// edge between two modules is a boundary crossing worth saying at edit time; one whose reverse already exists closes a
// cycle. Existing crossings (the module pair already has edges at HEAD) stay silent — practice already speaks there.
// Needs no partition: the advice works on a repo too small to hold convention norms.
function computeArchHits({ model, root, effRel, relFact }) {
  const archHits = [];
  if (model.relDecls && relFact && model.moduleGraph) { try {
    const fileSet = new Set(model.filesAll || []);
    const resolve = makeEdgeResolver({ root, fileSet, table: hydrateTable(model.relDecls), workspaces: model.workspaces || [], pkgs: model.pkgs || [], tsAliases: model.tsAliases || [], csGlobal: model.csGlobal || { usings: [], aliases: [] } });
    const mg = model.moduleGraph;
    const refined = model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || []));
    for (const e of resolve(effRel, relFact)) {
      const a = refined(effRel), b2 = refined(e.to);
      for (const bd of model.boundaries || []) { const inFrom = bd.boundary.from === '.' ? !effRel.includes('/') : (effRel + '/').startsWith(bd.boundary.from + '/');
        if (inFrom && (e.to + '/').startsWith(bd.boundary.to + '/'))
          archHits.push({ line: e.line, to: e.to, kind: 'boundary-decision', id: bd.id,
            text: `[grain] ${voice('decided', `${bd.boundary.from}/ never imports ${bd.boundary.to}/ — your import of \`${e.to}\` (line ${e.line}) crosses it.${bd.note ? `\n  ${bd.note}` : ''}`, { typ: 'boundary', who: bd.author, when: bd.createdAt })}` }); }
      if (a === b2) continue;
      const fwd = mg.edges.find(x => x.from === a && x.to === b2);
      if (fwd) { // an established crossing — usually silence, unless THIS import is the measured exception to A's own norm
        const norm = (model.archNorms || []).find(n => n.fromKind === 'module' && n.from === a && n.to === b2 && n.exp === 'false');
        if (norm) archHits.push({ line: e.line, to: e.to, kind: 'layering-norm',
          text: `[grain] ${voice('practiced', `architecture: your import of \`${e.to}\` (line ${e.line}) reaches ${b2} — ${a}/ established practice is not to (${norm.neff - norm.ne} of ${norm.neff} files do, yours now included). Not forbidden, but it departs from what the rest of ${a}/ does.`)}` });
        // group→module norms (§J5.7a): a finer population than the module — this file may belong to a role group
        // whose OWN established practice is not to reach b2, even where the module hit above stayed silent (or
        // fired for an unrelated reason). Membership is read straight off `part.assignments`, memoized on the
        // model like `_archModOf` (a closure can't survive model.json serialization, so it is recomputed once per
        // in-memory model and cached on it, never persisted).
        const fileGroups = model._archFileGroups || (model._archFileGroups = new Map());
        let groups = fileGroups.get(effRel);
        if (groups === undefined) { groups = [];
          for (const pt of model.partitions || []) for (const [key, role] of Object.entries(pt.assignments || {})) {
            if (!Number.isInteger(role) || role === -1) continue;
            if (key.slice(0, key.indexOf('#')) === effRel) groups.push(pt.name + '#' + role); }
          fileGroups.set(effRel, groups); }
        if (groups.length) {
          const gnorm = (model.archNorms || []).find(n => n.fromKind === 'group' && n.exp === 'false' && n.to === b2 && groups.includes(n.from));
          if (gnorm) { const gi = gnorm.from.lastIndexOf('#'); const gpart = (model.partitions || []).find(x => x.name === gnorm.from.slice(0, gi));
            const grole = +gnorm.from.slice(gi + 1); const glabel = (gpart && gpart.medoids[grole] && gpart.medoids[grole].label) || 'group';
            archHits.push({ line: e.line, to: e.to, kind: 'layering-norm-group',
              text: `[grain] ${voice('practiced', `architecture: your import of \`${e.to}\` (line ${e.line}) reaches ${b2} — «${glabel}» established practice is not to (${gnorm.neff - gnorm.ne} of ${gnorm.neff} files do, yours now included). Not forbidden, but it departs from what the rest of «${glabel}» does.`)}` }); }
        }
        continue; }
      const rev = mg.edges.find(x => x.from === b2 && x.to === a);
      const via = mg.edges.filter(x => x.from === a).map(x => x.to).filter(m => m !== b2 && mg.edges.some(x2 => x2.from === m && x2.to === b2)).sort()[0];
      archHits.push({ line: e.line, to: e.to, kind: rev ? 'cycle' : 'first-crossing',
        text: `[grain] ${voice('practiced', rev
          ? `architecture: your import of \`${e.to}\` (line ${e.line}) CLOSES A CYCLE ${a} ↔ ${b2} — ${b2} already depends on ${a} (${rev.n} edge${rev.n > 1 ? 's' : ''}).`
          : `architecture: your import of \`${e.to}\` (line ${e.line}) is the FIRST edge ${a} → ${b2} (0 existing)${via ? ` — today ${a} reaches ${b2} via ${via} (an established path)` : ''}. Not forbidden, but it opens a dependency no one has opened before.`)}` }); }
  } catch { /* architecture advice must never break check */ } }
  return archHits; }
// one paragraph per (convention, observed value): the scopes that deviate, with lines, never nine identical paragraphs
export function groupDeviations(msgs, touched = null, fileKindTouched = null) {
  const groups = new Map();
  for (const m of msgs) { const k = m.factKey + '|' + m.pid + '|' + m.obs; let g = groups.get(k); if (!g) { g = { ...m, hits: [] }; groups.set(k, g); }
    const isTouched = (m.kind === 'file' && fileKindTouched) ? fileKindTouched(m) : (touched ? touched(m.line, m.endLine || m.line) : true);
    g.hits.push({ scope: m.scope, kind: m.kind, line: m.line, touched: isTouched }); }
  const out = [];
  for (const g of groups.values()) { const t = g.hits.filter(h => h.touched), p = g.hits.filter(h => !h.touched);
    const who = hs => hs.slice(0, 3).map(h => `\`${h.scope}\` (line ${h.line})`).join(', ') + (hs.length > 3 ? ` and ${hs.length - 3} more` : '');
    const head = g.text.split('\n'); const first = head[0]; const rest = head.slice(1).filter(l => !/^  \d+\/\d+ established/.test(l));
    const evidence = head.find(l => /^  \d+\/\d+ established/.test(l)) || '';
    const ev = evidence.replace(/ Your \w+ `[^`]*` \(line \d+\) /, ' ').replace(/\.$/, '');
    const kindWord = g.hits.length > 1 ? unitOf(g.kind) : g.kind;
    const dev = evidence.match(/\(line \d+\) (.*?)(?: — a value.*)?\.$/); const phrase = dev ? dev[1] : 'deviates'; // greedy to the FINAL period — `@app.get` carries a dot
    const novelty = /a value this repo has not used before/.test(evidence) ? ' — a value this repo has not used before' : '';
    out.push({ ...g, touched: t.length, pre: p.length, text: `${first}\n  ${evidence.split('. Your')[0]}. ${t.length ? `Your ${t.length > 1 ? unitOf(g.kind) : g.kind} ${who(t)} ${phrase}${novelty}.` : ''}${p.length ? `${t.length ? ' Also' : 'Pre-existing:'} ${p.length} ${p.length > 1 ? unitOf(g.kind) : g.kind} not touched by your change (${who(p)}) ${phrase}.` : ''}\n${rest.join('\n')}` }); }
  return out.sort((a, b) => (b.touched > 0) - (a.touched > 0) || b.delta - a.delta); }

// ===== SPECTRUM (solicited exploration: the full lattice for one file, no acceptance cut) =====
export async function spectrum({ model, root, rel, minBits = 0, top = 0, scopesAll = null }) {
  const part = partitionFor(model, rel);
  if (!part) return { lines: [`(no partition covers ${rel}: nothing is mined here)`], rows: [] };
  const files = (part.files || []).slice();
  const fileSet = new Set(files);
  let ps = (scopesAll ? scopesAll.filter(s => fileSet.has(s.rel) && s.kind !== 'module').map(hydrateScope) : (await extractTree(root, files))).filter(s => s.name !== '<anon>');
  // (§013) the QUERIED file's own scopes come from the worktree, never replayed from the HEAD-indexed cache: a
  // file mid-edit must not have spectrum silently answer from its pre-edit shape while `check` (which already
  // reads this exact file's live content) sees the edit right next to it. §G20 already did this for a brand-new
  // untracked file (which never had a cache entry to begin with, so `scopesAll` never even mentioned it); this
  // generalizes that to every `rel`, tracked or not — drop any cached entry it has and re-parse its current disk
  // content the same way — one extra single-file parse, the same cost `checkFile` already pays for this file on
  // every `check` call, which is what makes a genuinely live answer affordable here.
  ps = ps.filter(s => s.rel !== rel);
  try { const src = normalizeCR(readFileSync(join(root, rel), 'utf8'));
    const { p, tree: tr } = await parseFile(extname(rel), src); const b = bindingFor(p._g);
    ps.push(...extractScopes(rel, tr, b, p._g).filter(s => s.name !== '<anon>'));
    tr.delete(); } catch { /* unsupported extension, or the file vanished mid-call — the existing "no scopes extracted" message below is honest here */ }
  addModuleScopes(ps);
  const vocab = buildVocab(ps, { deep: true });
  for (const s of ps) applyVocab(s, vocab);
  const { assign, amb } = assignAll(ps, part.medoids);
  const fileScopes = ps.filter(s => s.rel === rel);
  if (!fileScopes.length) return { lines: [`(no scopes extracted for ${rel})`], rows: [] };
  const roleOf = (s, i) => { const st = part.assignments[skeyR(s.rel, s)]; if (st !== undefined && st !== -1) return st; return assign.has(i) && !amb.has(i) ? assign.get(i) : undefined; };
  const myRoles = new Set(); fileScopes.forEach(s => { const r = roleOf(s, ps.indexOf(s)); if (r !== undefined) myRoles.add('r' + r + ':' + s.kind); });
  const segs = rel.split('/').slice(0, -1); const myDirs = []; for (let k = 1; k <= segs.length; k++) myDirs.push(segs.slice(0, k).join('/'));
  const cells = new Map();
  const add2 = (cid, pid, v) => { const k = cid + S + pid; let c = cells.get(k); if (!c) { c = Object.create(null); cells.set(k, c); } c[v] = (c[v] || 0) + 1; };
  ps.forEach((s, i) => { for (const [pid, v] of Object.entries(s.preds)) {
    add2('_all:' + s.kind, pid, v);
    const r = roleOf(s, i); if (r !== undefined && myRoles.has('r' + r + ':' + s.kind)) add2('r' + r + ':' + s.kind, pid, v);
    for (const d of myDirs) if (s.rel.startsWith(d + '/')) add2('d[' + d + ']:' + s.kind, pid, v); } });
  const idxCost = Math.ceil(Math.log2(Math.max(cells.size, 2)));
  const rows = [];
  for (const [key, c] of cells) { const [cid, pid] = key.split(S); const kind = cid.split(':').pop();
    if (/^auto\.dir\d/.test(pid) && !/^r\d/.test(cid)) continue;
    const n = Object.values(c).reduce((a, b) => a + b, 0); if (n < 3) continue;
    const Vv = Object.keys(c).sort(); const bl = isBool(pid); const K = bl ? 2 : Vv.length + 1;
    const allC = cells.get('_all:' + kind + S + pid); const allN = allC ? Object.values(allC).reduce((a, b) => a + b, 0) : n;
    let data = 0; const isAll = cid.startsWith('_all');
    if (isAll) { const B = Math.max(bl ? 2 : Vv.length, 2); for (const v of Vv) if (c[v]) data += c[v] * Math.log2(kt(c, K, v, n) * B); }
    else for (const v of Vv) if (c[v]) data += c[v] * Math.log2(kt(c, K, v, n) / kt(allC, K, v, allN));
    const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(n, 2)) - idxCost;
    let exp = null, ne = -1; for (const v of Vv) if (c[v] > ne) { exp = v; ne = c[v]; }
    if (!bl && ['other', 'none', 'mixed', '?'].includes(exp)) continue;
    // the same boundary rule as mining: "never X" rows are shown only where X is a real choice here (≥ 20% of the kind
    // partition-wide use it) — otherwise the lattice is a list of every callee the file happens not to call
    if (bl && exp === 'false') { const tot = allC ? Object.values(allC).reduce((a, b) => a + b, 0) : 0; if (!tot || (allC['true'] || 0) / tot < 0.2) continue; }
    const share = ne / n;
    const isNorm = part.facts.some(f => f.cid === cid && f.pid === pid && f.exp === exp);
    // a role-conditioned cid's population is only the file's scopes IN THAT ROLE (roleOf, the same helper the cells above
    // are built with) — filtering by kind alone let a sibling role's scope in the same file contaminate this row's own
    // per-file deviation check (§001)
    const roleMatch = /^r(\d+):/.exec(cid);
    const mine3 = fileScopes.filter(s => s.kind === kind && s.preds[pid] !== undefined && (!roleMatch || roleOf(s, ps.indexOf(s)) === +roleMatch[1])).map(s => s.preds[pid]);
    const dev = mine3.some(v => v !== exp);
    rows.push({ cid, pid, exp, share, n, bits, isNorm, dev, has: mine3.length > 0,
      grp: /^r\d/.test(cid) ? 0 : cid.startsWith('d[') ? 1 : 2, depth: cid.startsWith('d[') ? cid.split('/').length : 0 }); }
  rows.sort((a, b) => a.grp - b.grp || b.depth - a.depth || b.bits - a.bits || (a.pid < b.pid ? -1 : 1));
  const shown = rows.filter(r => r.bits >= minBits && r.has);
  const out = top ? shown.slice(0, top) : shown;
  const lines = [`spectrum ${rel} — ${scopeLabel(part.name)} · ${fileScopes.length} scopes · ${cells.size} cells computed · ${rows.length} rows (n≥3) · ${shown.length} at bits≥${minBits} · ${part.facts.length} accepted NORMs in model`];
  for (const r of out) lines.push(`  [${r.isNorm ? 'NORM' : 'obs '}] ${r.cid} ${r.pid} = ${r.exp}  share ${r.share.toFixed(2)} n ${r.n} bits ${r.bits.toFixed(1)}${r.dev ? '  ← THIS FILE DEVIATES' : ''}`);
  return { lines, rows: out, partition: part.name }; }

// ===== WHERE (inverse query: intent → place + expectations + pattern to copy) =====
// "Where do command handlers go?" — lexical match of query tokens against the model's own vocabulary
// (role labels, medoid features, fact payloads, directory names). No embeddings: the model is a small,
// structured distillate in repo-native tokens; when lexical match fails, the compact map is printed and
// the asking agent — itself an LLM — closes the semantic gap better than any retrieval layer would.
// Card vocabulary is weighted by how strongly a token names the thing: a group's own name tokens, decorators and
// supertypes, and a directory's own name count fully; the surfaces of its conventions count 3/4; the last segments of
// the packages its files import count 1/2 (everything that imports `middleware` is not a middleware).
const TOKW = { name: 1, dir: 1, fact: 0.75, imp: 0.5, doc: 0.5 };
const addTok = (toks, t, w) => { const k = normTok(t); if ((toks.get(k) || 0) < w) toks.set(k, w); };
export function buildCards(model) {
  const cards = [];
  for (const part of model.partitions) {
    const byRole = new Map();
    for (const [k, r] of Object.entries(part.assignments)) { if (r === -1) continue; let a = byRole.get(r); if (!a) { a = []; byRole.set(r, a); } a.push(k); }
    part.medoids.forEach((md, r) => { const members = byRole.get(r) || []; if (members.length < 3) return;
      const toks = new Map();
      for (const f of md.feats) for (const t of tokenize(f.slice(4))) addTok(toks, t, f.startsWith('imp:') ? TOKW.imp : TOKW.name);
      for (const t of tokenize(md.label)) addTok(toks, t, TOKW.name);
      for (const k of members) for (const t of tokenize(k.split('#')[2] || '')) addTok(toks, t, TOKW.fact);
      const facts = part.facts.filter(f => f.cid.startsWith('r' + r + ':'));
      for (const f of facts) for (const t of tokenize(f.pid.replace(/^auto\.[a-z0-9]+:?@?/, ''))) addTok(toks, t, TOKW.fact);
      const dirs = new Map(); for (const k of members) { const d = dirname(k.split('#')[0]); dirs.set(d, (dirs.get(d) || 0) + 1); }
      const topDirs = [...dirs].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
      for (const [d] of topDirs) for (const t of tokenize(d)) addTok(toks, t, TOKW.fact); // the directory a group lives in is context for it, not its name — a directory named `middleware` outranks a 4-member group that merely lives there
      cards.push({ type: 'group', part: part.name, label: md.label, n: members.length, toks, facts, topDirs, members, roleIdx: r }); });
    // directory cards: every directory that holds enough scopes to be a place (the spec's dirContextMinScopes), whether or
    // not it carries an accepted local norm — placement is the first half of every `where` question
    const dirScopes = new Map();
    for (const k of Object.keys(part.assignments)) { const segs = k.split('#')[0].split('/').slice(0, -1); for (let i = 1; i <= segs.length; i++) { const d = segs.slice(0, i).join('/'); dirScopes.set(d, (dirScopes.get(d) || 0) + 1); } }
    const byDir = new Map();
    for (const f of part.facts) if (f.cid.startsWith('d[')) { const d = f.cid.slice(2, f.cid.indexOf(']')); let a = byDir.get(d); if (!a) { a = []; byDir.set(d, a); } a.push(f); }
    for (const [d, n] of dirScopes) if (n >= 8 && !byDir.has(d)) byDir.set(d, []); // every directory that is a place (≥ 8 scopes), not only the ones that carry a local norm
    for (const [d, dfacts] of [...byDir].sort((a, b) => a[0] < b[0] ? -1 : 1)) { const toks = new Map();
      // a directory that IS the partition's cut root owns the partition-wide facts too — they are exactly this
      // directory's norms, and without them the card of an MDL-cut package says "no convention" while seven exist
      const facts = d === part.name ? [...dfacts, ...part.facts.filter(f => f.cid.startsWith('_all'))] : dfacts;
      const dirName = new Set([normTok(d.split('/').pop().toLowerCase())]); // `testing utility` must reach packages/testing/ even though `test` is the most common token in the model
      for (const t of tokenize(d.split('/').pop())) addTok(toks, t, TOKW.dir);
      for (const t of tokenize(d)) addTok(toks, t, TOKW.fact);
      for (const f of facts) for (const t of tokenize(f.pid.replace(/^auto\.[a-z0-9]+:?@?/, ''))) addTok(toks, t, TOKW.fact);
      const files = (part.files || []).filter(f => f.startsWith(d + '/'));
      cards.push({ type: 'directory', part: part.name, label: d + '/', n: facts.length ? Math.max(...facts.map(f => f.sraw)) : (dirScopes.get(d) || 0), toks, dirName, facts, topDirs: [[d, 1]], members: null, files }); }
    // marker cards: "@click.command — 8 carriers, lives in src/flask/" — for an intent that names a decorator, a base type or a
    // return type, this is the answer (measured on flask: `where click command` landed on cli.py's inner closures instead)
    for (const [mk, keys] of Object.entries(part.markers || {})) { const [pre, name] = [mk.slice(0, mk.indexOf(':')), mk.slice(mk.indexOf(':') + 1)];
      const toks = new Map(); for (const t of tokenize(name)) addTok(toks, t, TOKW.name); addTok(toks, name.toLowerCase().replace(/[^a-z0-9]/g, ''), TOKW.name);
      if (pre === 'deco') { addTok(toks, 'decorator', TOKW.fact); addTok(toks, 'annotation', TOKW.fact); addTok(toks, 'attribute', TOKW.fact); }
      if (pre === 'sup') { addTok(toks, 'extends', TOKW.fact); addTok(toks, 'implements', TOKW.fact); addTok(toks, 'subclass', TOKW.fact); }
      if (pre === 'ret') { addTok(toks, 'returns', TOKW.fact); }
      const dirs = new Map(); for (const k of keys) { const d = dirname(k.split('#')[0]); dirs.set(d, (dirs.get(d) || 0) + 1); }
      const topDirs = [...dirs].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
      for (const [d] of topDirs) for (const t of tokenize(d)) addTok(toks, t, TOKW.fact);
      const carrierFiles = new Set(keys.map(k => k.split('#')[0])); const carrierNames = new Set(keys.map(k => k.split('#')[2]));
      for (const f of carrierFiles) for (const t of tokenize(f.split('/').pop().replace(/\.[^.]+$/, ''))) addTok(toks, t, TOKW.fact); // `cli command` reaches @click.command through cli.py
      const degenerate = carrierNames.size === 1 && keys.length > 1; // three fixtures all named `test` are not a pattern to copy (three commands in one cli.py are)
      const label = pre === 'deco' ? (name.startsWith('[') ? name : '@' + name) : pre === 'sup' ? `extends ${name}` : `returns ${name}`;
      const mpid = pre === 'deco' ? 'auto.deco:' + (name.startsWith('[') ? name : '@' + name) : pre === 'sup' ? 'auto.extends:' + name : 'auto.returns:' + name;
      const carries = f => (f.pid === mpid && f.exp === 'true') || (f.siblings || []).some(sb => sb.pid === mpid && sb.exp === 'true');
      cards.push({ type: 'marker', part: part.name, label, mpid, n: keys.length, toks, degenerate, facts: part.facts.filter(carries), topDirs, members: keys, files: null }); }
    // file cards: the file's own name, its path segments and the names of the scopes it holds — `where res json` must find
    // lib/response.js (which defines `json`) even though no group or directory carries the word (measured on express: six
    // of eleven realistic intents missed lexically while the file that answered them existed verbatim)
    const byFile = new Map();
    if (part.fileScopes) for (const [rel, list] of Object.entries(part.fileScopes)) byFile.set(rel, list.filter(([kind]) => kind !== 'catch' && kind !== 'finally').map(([kind, name, line]) => ({ kind, name, line }))); // a catch block is named after its owner — on a card it would shadow the method itself
    else for (const k of Object.keys(part.assignments)) { const [rel, kind, name] = k.split('#'); (byFile.get(rel) || byFile.set(rel, []).get(rel)).push({ kind, name }); }
    for (const rel of part.files || []) { const toks = new Map(); const members = byFile.get(rel) || [];
      for (const t of tokenize(rel.split('/').pop().replace(/\.[^.]+$/, ''))) addTok(toks, t, TOKW.name);
      for (const t of tokenize(rel)) addTok(toks, t, TOKW.fact);
      for (const t of (part.fileDocs?.[rel] || [])) addTok(toks, t, TOKW.doc); // what the doc comments say this file is for
      for (const x of (part.fileSups?.[rel] || [])) for (const t of tokenize(x)) addTok(toks, t, TOKW.name); // the interfaces its types implement ARE what the file is
      for (const m of members) for (const t of tokenize(m.name)) addTok(toks, t, TOKW.name);
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.';
      const dirFacts = part.facts.filter(f => f.cid.startsWith('d[') && (dir + '/').startsWith(f.cid.slice(2, f.cid.indexOf(']')) + '/')).sort((a, b) => b.cid.length - a.cid.length || b.sraw - a.sraw).slice(0, 3)
        .concat(part.facts.filter(f => f.cid === '_all:file' && f.exp !== 'false').slice(0, 2)); // what every file here does (imports, quotes, directive) — a new file copies that first
      const carried = Object.entries(part.markers || {}).filter(([, ks]) => ks.some(k => k.startsWith(rel + '#'))).map(([mk, ks]) => [mk, ks.filter(k => k.startsWith(rel + '#')).length]);
      cards.push({ type: 'file', part: part.name, label: rel, n: members.length, toks, names: new Set([...members.map(m => m.name.toLowerCase()), ...(part.fileSups?.[rel] || []).map(x => x.toLowerCase())]), facts: dirFacts, carried, topDirs: [[dir, 1]], members: members.map(m => rel + '#' + m.kind + '#' + m.name + '#' + (m.line || '')), files: null }); } }
  return cards; }
// a light stemmer applied to BOTH sides of every match (query and card), so only consistency matters, not linguistics:
// entities ≡ entity, classes ≡ class; extractor ≡ extract ≡ extraction, rejection ≡ reject, router ≡ route ≡ routing, handler ≡ handle
export const normTok = t => { t = t.toLowerCase(); if (t.length <= 3) return t;
  t = t.replace(/ies$/, 'y').replace(/(ses|xes|shes|ches)$/, m => m.slice(0, -2)).replace(/s$/, '');
  if (t.length >= 6) t = t.replace(/ation$/, 'ate').replace(/(tion|sion)$/, 't').replace(/ing$/, '').replace(/(er|or)$/, '');
  if (t.length >= 5) t = t.replace(/e$/, '');
  return t; };
// partners that historically change WITH files under `dirs`: the partner side is gated on its own direction (sup/commits of the edited side)
export const part = (model, name) => model.partitions.find(p => p.name === name) || { medoids: [], name };
export function cochangePartners(model, dirs, max = 3, file = null) {
  const out = []; const minConf = file ? 1 / 3 : CFG.cochangeMinConf; // one file's history is sparse; a third of its commits is a real signal
  // §020: a partner is a HISTORICAL fact — the pair really did co-change — but the path itself may be gone by HEAD
  // (renamed away, deleted). Same liveness source `howCmd`'s places[] uses for its own `exists` flag (core.mjs
  // ~2817): `model.pathsAll` (every tracked path, code or not) ∪ `model.filesAll` (defensive union, same idiom).
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
  for (const p of model.cochange || []) {
    const aIn = file ? p.a === file : dirs.some(d => p.a.startsWith(d + '/')), bIn = file ? p.b === file : dirs.some(d => p.b.startsWith(d + '/'));
    if (aIn && !bIn && p.sup / (p.commitsA || 1) >= minConf) out.push({ partner: p.b, sup: p.sup, commits: p.commitsA || p.sup, dead: !live.has(p.b) });
    else if (bIn && !aIn && p.sup / (p.commitsB || 1) >= minConf) out.push({ partner: p.a, sup: p.sup, commits: p.commitsB || p.sup, dead: !live.has(p.a) }); }
  out.sort((x, y) => (y.sup / y.commits) - (x.sup / x.commits) || (x.partner < y.partner ? -1 : 1));
  const seen2 = new Set(); const uniq = []; // one line per partner — duplicate rows (rename lineages) keep only their strongest
  for (const o of out) { if (seen2.has(o.partner)) continue; seen2.add(o.partner); uniq.push(o); if (uniq.length >= max) break; }
  return uniq; }
// the practiced-by clause of a steer: same-denominator marker counts when the seed names what it retires, plain share otherwise
export const practicedBy = sf => sf.rivals ? `adopted by ${sf.rivals.own} of ${sf.rivals.own + sf.rivals.alts.reduce((a, x) => a + x.n, 0)} (${sf.rivals.alts.map(x => `${x.name} ${x.n}`).join(' · ')}) in ${sf.context} today` : `practiced by ${Math.round((sf.share || 0) * 100)}% of ${sf.n} in ${sf.context} today`;
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
  const part = partitionFor(model, rel); if (!part) return null;
  const f = part.facts.find(x => x.kind === kind && x.pid === pid && x.cid.startsWith('_all'));
  if (!f || !f.sraw) return null;
  return { share: +((f.srawCounts[v] || 0) / f.sraw).toFixed(2), n: Math.round(f.sraw), context: factLabel(part, f) }; }
// the delta a steer's practiced-by line grows when its seed carries a `baseline`: today's share/n are already on `sf`
// (computed by the same cascade above), so this is presentation only — no second pass over the model. Never claims a
// verdict ("dead", "stale"): just the two counts, in the maintainer's own vocabulary, for them to judge.
export function baselineClause(sf) {
  const b = sf.baseline; if (!b || sf.share === null) return '';
  const kNow = Math.round((sf.share || 0) * sf.n), kThen = Math.round((b.share || 0) * b.n);
  const thenCtx = b.context && b.context !== sf.context ? ` in ${b.context}` : '';
  if (kNow === kThen && sf.n === b.n) return ` (no movement since ${b.at}: ${kThen} of ${b.n}${thenCtx} then, ${kNow} of ${sf.n} now)`;
  const dir = kNow / sf.n >= kThen / (b.n || 1) ? 'up' : 'down';
  return ` (${dir} from ${kThen} of ${b.n}${thenCtx} when recorded ${b.at} to ${kNow} of ${sf.n} now)`; }
export const scopeLabel = partName => partName === '_root' ? 'repo-wide' : partName === '_repo' ? 'repo-wide (small packages merged)' : `package ${partName}`;
// the `in:` locator's module: a `directory` card IS its own module (its own id, exactly what the card's existing
// `depends on:`/`used by:` lines already key off). Every other card type is spread across directories (`h.topDirs`,
// already computed when the card was built) — its module is the MAJORITY one, with a `(mixed, N% here)` note when
// that majority covers under 60% of the card's members (h.n is the same denominator topDirs' shares were counted
// against). No module resolves (empty/absent topDirs) ⇒ null, never a broken line.
function cardModule(h) {
  if (h.type === 'directory') return { module: h.label.replace(/\/$/, ''), suffix: '' };
  if (!h.topDirs || !h.topDirs[0] || !h.n) return null;
  const [mod, cnt] = h.topDirs[0]; const share = cnt / h.n;
  return { module: mod, suffix: share < 0.6 ? ` (mixed, ${pct(share)}% here)` : '' }; }
// STRUCTURE, not a claim (never voice()'d): the same category as the card's own unvoiced `lives in:`/`depends
// on:`/`used by:` lines. `(layer n)` (J4.3) reads straight off the resolved moduleGraph node — omitted only if
// the module somehow resolves to no node at all (never crashes on it).
export function inLineForCard(model, h) {
  if (!model.moduleGraph) return null;
  const cm = cardModule(h); if (!cm) return null;
  const node = model.moduleGraph.nodes.find(n => n.id === cm.module);
  const k = model.moduleGraph.edges.filter(e => e.to === cm.module).length;
  return `in: ${cm.module}${cm.suffix}${node && node.layer !== undefined ? ` (layer ${node.layer})` : ''} · used by ${k} modules`; }
// the same locator for a single checked file — the SAME refined module assignment moduleGraph's own nodes/edges
// use (computeArchHits' own memoization pattern: a closure can't survive model.json serialization, so it is
// recomputed once per in-memory model and cached on it, never persisted)
export function inLineForFile(model, rel) {
  if (!model.moduleGraph || !model.filesAll) return null;
  const refined = model._archModOf || (model._archModOf = refineModOf(model.filesAll, model.pkgs || []));
  const mod = refined(rel);
  const node = model.moduleGraph.nodes.find(n => n.id === mod);
  const k = model.moduleGraph.edges.filter(e => e.to === mod).length;
  return `in: ${mod}${node && node.layer !== undefined ? ` (layer ${node.layer})` : ''} · used by ${k} modules`; }
export function whereCmd({ model, query, top = 3, mapRows = 60, exemplarOk = () => true }) {
  const q = query;
  const qt = new Set(tokenize(q).map(normTok));
  const cards = buildCards(model);
  // exact-name hits come from the query's whole words (and the last segment of dotted ones: `res.json` → `json`), never from
  // camelCase fragments — `TestRoutes` must pin `TestRoutes`, not every scope named `test`
  // …and only identifiers, not plain words: `TestRoutes`, `routes_command`, `res.json` pin their scope; `handler` is a word that
  // happens to be a function name too, and the directory `handlers/` (30 files) is the better answer for it
  const qraw = new Set(q.split(/\s+/).filter(w => tokenize(w).length >= 2 || /[._$]/.test(w)).flatMap(w => { const t = w.toLowerCase().replace(/[^\w.$]/g, ''); return t ? [t, t.split('.').pop()] : []; }).filter(t => t.length > 2));
  const qrawToks = new Map(); for (const w of q.split(/\s+/)) { const t = w.toLowerCase().replace(/[^\w.$]/g, ''); const toks = tokenize(w).map(normTok); if (t) { qrawToks.set(t, toks); qrawToks.set(t.split('.').pop(), toks); } } // pinned word → the query tokens it covers
  // inverse document frequency over the cards: a query word every card carries (`test`, `router`, `add`) weighs little, the one
  // word that names the thing (`mount`, `compress`) weighs most; a word no card carries is the agent's phrasing, not a miss
  const df = new Map(); for (const c of cards) for (const t of c.toks.keys()) df.set(t, (df.get(t) || 0) + 1);
  // instruction fillers never count; a DOMAIN word no card carries stays in the denominator at full weight — the repo not
  // speaking of it must lower the score ("add rate limiting" scored 100% on the word `add` alone when unmatched words were
  // dropped; now it scores what it deserves and the weak-match banner fires)
  for (const t of [...qt]) if (QSTOP.has(t)) qt.delete(t);
  const maxIdf = Math.log2(1 + cards.length);
  const idf = new Map(); for (const t of qt) idf.set(t, df.get(t) ? Math.log2(1 + cards.length / df.get(t)) : maxIdf);
  const idfSum = [...idf.values()].reduce((a, b) => a + b, 0);
  for (const c of cards) { let s = 0; for (const [t, w] of idf) s += (c.toks.get(t) || 0) * w; c.score = idfSum ? s / idfSum : 0;
    c.exact = c.names ? [...qraw].some(t => c.names.has(t)) : false; // a query word that IS a function/class name in this file
    // a pinned identifier that IS most of the query wins outright (`where sendStatus`); one that covers a minority of the
    // query's words only adds to the lexical score — `where command handler for TodoList archive` must rank the command
    // handlers carrying `command`+`handler`+`todo`+`list` above `Entities/TodoList.cs`, which carries only the name (measured)
    if (c.exact) { const pinned = [...qraw].filter(t => c.names.has(t)); const cover = new Set(pinned.flatMap(t => qrawToks.get(t) || [])).size / Math.max(1, qt.size);
      c.score = cover >= 0.5 ? Math.max(c.score, 1) : Math.min(1, c.score + 0.25); }
    if (c.dirName) { const hit = [...qt].filter(t => c.dirName.has(t)); if (hit.length) { const cover = hit.length / Math.max(1, qt.size); c.score = cover >= 0.5 ? Math.max(c.score, 1) : Math.min(1, c.score + 0.25); } }
    c.score = Math.min(1, c.score);
    if (c.degenerate) c.score *= 0.5; }
  const rank = c => (c.exact ? 4 : c.type === 'marker' ? 2 : c.type === 'file' ? 1 : 1.5) + (c.facts.length ? 0.25 : 0); // on a tie: pinned identifier > marker > group/directory > file (a file's local facts never lift it over a directory)
  let hits = cards.filter(c => c.score > 0).sort((a, b) => b.score - a.score || rank(b) - rank(a) || b.n - a.n || (a.label < b.label ? -1 : 1)).slice(0, top);
  const lines = [];
  // a steer renders wherever its topic meets the query or its exemplar lives in the card: decided, beside what is practiced
  const steers = (model.steers || []).filter(st => st.found);
  const steerLine = st => st.surfaces.filter(sf => sf.value !== null && !sf.retires).map(sf => `  ${voice('decided', `${verbalize({ pid: sf.pid, exp: sf.value, kind: st.kind, heritageKind: heritageKindOf(sf.pid, model) }, [st.name])} — ${practicedBy(sf)}${baselineClause(sf)}${st.note ? ' · ' + st.note : ''} · copy ${st.path}:${st.line} \`${st.name}\``, { typ: 'steer', who: st.author, when: st.createdAt })}`);
  const topicHit = st => { const tt = new Set(tokenize(st.topic).map(normTok)); return [...qt].some(t => tt.has(t)); };
  const cardHit = (st, c) => c.type === 'file' ? c.label === st.path : c.type === 'directory' ? st.path.startsWith(c.label) : c.members ? c.members.some(k => k.startsWith(st.path + '#') && k.split('#')[2] === st.name) : false;
  const orphanSteers = steers.filter(st => topicHit(st) && !hits.some(c => cardHit(st, c)));
  for (const st of orphanSteers) { const sl = steerLine(st); if (sl.length) { lines.push(voice('map', `«${q}» → maintainer decision ${st.id} (no card of its own carries it)`)); lines.push(...sl); } }
  let noConfidentHit = false, suppressedScore = 0; // set when the top hit is demoted to "untrustworthy" below — distinct wording from a genuine zero-hit
  if (hits.length && hits[0].score < 0.34) lines.push(`weak match: the best hit covers ${Math.round(hits[0].score * 100)}% of the query's weight — a hint, not an answer. If the hits look unrelated to what you are writing, open the nearest sibling of the file you expect to edit instead.`);
  else if (hits.length && qt.size >= 3 && !hits[0].exact) { const contributing = [...idf.keys()].filter(t => (hits[0].toks.get(t) || 0) > 0);
    // mass concentration: "exactly one contributing word" (ratio 1) generalized to how much of the top hit's matched
    // weight sits in its single heaviest word — a hit carried almost entirely by one term is just as coincidental as a
    // one-word hit, even when a second term nominally "contributed" (measured: a query's rare words each independently
    // landing on unrelated cards inflated `contributing.length` past 1 while the hit stayed just as coincidental)
    const weights = contributing.map(t => (hits[0].toks.get(t) || 0) * idf.get(t));
    const totalW = weights.reduce((a, b) => a + b, 0);
    const concentration = totalW ? Math.max(...weights) / totalW : 1;
    if (contributing.length < qt.size && concentration >= 0.5) {
      // cross-hit agreement: do the runner-ups (already computed, `hits` is sliced to `top`) point at the same area of
      // the repo as the top hit, or somewhere unrelated? real answers tend to cluster; a coincidental lexical collision
      // usually doesn't, because its matched words came from parts of the repo that have nothing else in common
      const dirOf = c => (c.topDirs && c.topDirs[0]) ? c.topDirs[0][0] : c.label;
      const baseName = d => (d || '').split('/').filter(Boolean).pop() || d;
      const sameArea = (a, b) => !!a && !!b && (a === b || baseName(a) === baseName(b) || (a + '/').startsWith(b + '/') || (b + '/').startsWith(a + '/'));
      const runnerUps = hits.slice(1, 3);
      const agreeing = runnerUps.filter(h => sameArea(dirOf(hits[0]), dirOf(h))).length;
      if (runnerUps.length && !agreeing) { suppressedScore = hits[0].score; hits = []; noConfidentHit = true; } // no corroboration anywhere in the top few — don't rank it, map the repo instead
      else lines.push(`note: the top hit matches only «${contributing.join('», «')}» of your ${qt.size} words — verify before building on it.`);
    } }
  if (!hits.length) {
    lines.push(noConfidentHit
      ? `no confident match for "${q}" — the best lexical hit scored ${Math.round(suppressedScore * 100)}% but its words are covered by unrelated, disagreeing parts of the repo, so it is not trustworthy. Compact map of the source groups, markers and directories follows. Pick the closest entry yourself and open its files; do not re-ask with synonyms.`
      : `no lexical match for "${q}" — compact map of the source groups, markers and directories follows. Pick the closest entry yourself and open its files; do not re-ask with synonyms.`);
    lines.push(...bridgeLines(model, qt, df));
    const sorted = cards.filter(c => c.type !== 'file').sort((a, b) => b.n - a.n || (a.label < b.label ? -1 : 1));
    for (const c of sorted.slice(0, mapRows)) lines.push(`  [${c.type}] ${c.label} (${c.n}) → ${c.topDirs.map(([d]) => d + '/').join(' · ')}`);
    if (sorted.length > mapRows) lines.push(`  … and ${sorted.length - mapRows} more — re-run with --map-rows ${sorted.length} for all`);
    if (!cards.length) lines.push('  (the model holds no groups or directory norms — no strong conventions were found in this repository)');
    return { lines, hits: [], cards }; }
  const bridged = bridgeLines(model, qt, df); // query words the code never says, translated by the commit history
  // the "comes with" recipe's file-shape clause: an accepted auto.filebirth verdict for the SAME population
  // (already computed by learn(), never re-derived here) phrased to read first, before companion/registration
  const filebirthBit = f => f.exp === 'new' ? `usually starts a new file (${pct(f.share)}% of ${f.sraw})` : `is usually added to an existing file (${pct(f.share)}% of ${f.sraw})`;
  for (const h of hits) {
    const inl = inLineForCard(model, h); if (inl) lines.push(inl);
    const stLines = steers.filter(st => cardHit(st, h)).flatMap(steerLine); // decided, printed right under the card's header
    if (h.type === 'file') { const qs = [...qt];
      const hitsOf = k => { const nm = k.split('#')[2] || ''; const toks2 = tokenize(nm).map(normTok); return (qraw.has(nm.toLowerCase()) ? 10 : 0) + qs.filter(t => toks2.includes(t)).length; };
      const matching = h.members.map(k => [k, hitsOf(k)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || tokenize(a[0].split('#')[2] || '').length - tokenize(b[0].split('#')[2] || '').length || (a[0] < b[0] ? -1 : 1)).slice(0, 6).map(([k]) => { const [, kind, name, line] = k.split('#'); return `\`${name}\` (${kind}${line ? ', line ' + line : ''})`; });
      lines.push(voice('map', `«${q}» → file ${h.label} — ${h.n} scopes (${scopeLabel(h.part)}, match ${Math.round(Math.min(1, h.score) * 100)}%)${matching.length ? ` · matching here: ${matching.join(' · ')}` : ''}`), ...stLines);
      const TRIVIAL = /^(none|void|str|string|bool|boolean|int|number|float|any|t\.any|object|list|dict|error|unit|self|this|t|f)$/i;
      const carried = (h.carried || []).filter(([mk]) => !mk.startsWith('ret:') || !TRIVIAL.test(mk.slice(4))).sort((a, b) => b[1] - a[1]);
      if (carried.length) lines.push(`  carries: ${carried.slice(0, 5).map(([mk, n]) => `${mk.startsWith('deco:') ? (mk.slice(5).startsWith('[') ? mk.slice(5) : '@' + mk.slice(5)) : mk.startsWith('sup:') ? 'extends ' + mk.slice(4) : 'returns ' + mk.slice(4)} ×${n}`).join(' · ')}`);
      for (const f of h.facts.slice(0, 3)) lines.push(`  - ${voice('practiced', `${factLabel(part(model, h.part), f)}: ${verbalize(f, f.exemplars.map(e => e.name))} — ${pct(f.share)}% of ${f.sraw}`)}`);
      const cc = cochangePartners(model, [], 3, h.label);
      if (cc.length) lines.push(`  historically co-changes with: ${cc.map(c => `${c.partner}${c.dead ? ' (deleted)' : ''} (${c.sup}/${c.commits} commits)`).join(' · ')}`);
      continue; }
    lines.push(voice('map', `«${q}» → ${h.type} ${h.label} — ${h.type === 'group' ? `${h.n} members` : h.type === 'marker' ? `${h.n} carriers` : `${h.files?.length ?? '?'} files, ${h.facts.length ? h.n + ' established' : h.n + ' scopes'}`} (${scopeLabel(h.part)}, match ${Math.round(h.score * 100)}%)`));
    lines.push(...stLines);
    if (h.type === 'directory' && model.moduleGraph) { const id = h.label.replace(/\/$/, '');
      const dep = model.moduleGraph.edges.filter(e => e.from === id).slice(0, 4), used = model.moduleGraph.edges.filter(e => e.to === id).slice(0, 4);
      if (dep.length) lines.push(`  depends on: ${dep.map(e => `${e.to}/ (${e.n})`).join(' · ')}`);
      if (used.length) lines.push(`  used by: ${used.map(e => `${e.from}/ (${e.n})`).join(' · ')}`);
      for (const bd of model.boundaries || []) if ((id + '/').startsWith(bd.boundary.from + '/')) lines.push(`  ${voice('decided', `never imports ${bd.boundary.to}/${bd.note ? ' — ' + bd.note : ''}`, { typ: 'boundary', who: bd.author, when: bd.createdAt })}`); }
    if (h.members) lines.push(`  lives in: ${h.topDirs.map(([d, n]) => `${d}/ (${Math.round(n / h.n * 100)}%)`).join(' · ')}`);
    const P = part(model, h.part); const withLine = k => { const [rel2, kind, name] = k.split('#'); const ln = scopeLine(P, k); const end = scopeLineEnd(P, k); return `${ln ? ptr(rel2, ln, end) : rel2} \`${name}\` (${kind})`; };
    if (h.type === 'marker') { const ex = h.members.slice(0, 3).map(withLine); lines.push(`  carriers to copy: ${ex.join(' · ')}${h.members.length > 3 ? ` · +${h.members.length - 3} more` : ''}`);
      const mkKey = h.mpid ? h.mpid.replace(/^auto\.deco:@?/, 'deco:').replace(/^auto\.extends:/, 'sup:').replace(/^auto\.returns:/, 'ret:') : '';
      const obs = (part(model, h.part).markerObs || {})[mkKey] || [];
      if (obs.length) lines.push(`  its carriers share (observed, not certified): ${obs.join(' · ')}`);
      const mi = (part(model, h.part).markerImplied || {})[mkKey];
      // a marker has no cid of its own — the populations where it IS the accepted convention (its own defining
      // facts, already selected into h.facts by `carries` above) are the only populations it can borrow a
      // filebirth verdict from; matching by their cid is the same "same population" test the group case makes
      // via its role cid, just read off facts the card already carries instead of constructed fresh
      const mFbCids = new Set(h.facts.filter(f => f.pid === h.mpid).map(f => f.cid));
      const mFb = mFbCids.size ? part(model, h.part).facts.find(f => f.pid === 'auto.filebirth' && mFbCids.has(f.cid)) : undefined;
      { const bits = [];
        if (mFb) bits.push(filebirthBit(mFb));
        if (mi) { if (mi.companion) bits.push(`a same-stem \`${mi.companion.pattern}\` companion (${pct(mi.companion.share)}% of ${mi.companion.n} have one, e.g. \`${mi.companion.example}\`)`);
          if (mi.importedBy) bits.push(`registration in \`${mi.importedBy.file}\` (imports ${mi.importedBy.n} of ${mi.importedBy.of} carriers)`);
          if (mi.importedByPattern) bits.push(`registration by a \`${mi.importedByPattern.pattern}\` file (${mi.importedByPattern.n} of ${mi.importedByPattern.of} carriers)`); }
        if (bits.length) lines.push(`  a new carrier comes with: ${bits.join(' · ')}`); }
      const best = [...h.facts].sort((a, b) => b.sraw - a.sraw)[0];
      if (best) { const own = best.pid === h.mpid ? best : { ...((best.siblings || []).find(sb => sb.pid === h.mpid) || best), kind: best.kind };
        lines.push(`  - ${voice('practiced', `${verbalize(own, best.exemplars.map(e => e.name))} — ${pct(best.share)}% of ${best.sraw}${own !== best ? ` (with: ${verbalize(best, best.exemplars.map(e => e.name)).replace(/^\w+ here /, '')})` : ''}${factNotes(best)}`)}`); }
      continue; }
    if (!h.facts.length) lines.push(`  - no convention certified here beyond placement (the group is small, not free-form) — open a member below and copy its shape`);
    let bulletFacts = h.facts;
    if (h.type === 'group' && h.roleIdx !== undefined) { const pf = (part(model, h.part).profiles || {})[h.roleIdx];
      if (pf) { const bits = [`${pf.n} members share this skeleton (~${Math.round(pf.coverage * 100)}% of an average member): ${pf.skel}`];
        for (const pi of pf.perInstance) bits.push(`one slot is per-instance (${pi.distinct} distinct values in ${pi.total} — e.g. \`${pi.top}\`)`);
        for (const sl of pf.slots) bits.push(`slot usually \`${sl.top}\` (${sl.k}/${sl.total})`);
        if (pf.held) bits.push(`held since ${pf.held.since}${pf.held.fresh ? ` · ${pf.held.fresh} new in 180d` : ''}`);
        lines.push('  superposition: ' + bits.join(' · ')); }
      const gi2 = (part(model, h.part).groupImplied || {})[h.roleIdx];
      // the group's own cid convention (`'r' + roleIdx + ':' + kind`) is exactly how h.facts was already
      // filtered when the card was built, so an accepted auto.filebirth fact for this same population is
      // already sitting in h.facts if it exists — no separate lookup or synthetic cid needed
      const fbFact = h.facts.find(f => f.pid === 'auto.filebirth');
      { const bits = [];
        if (fbFact) bits.push(filebirthBit(fbFact));
        if (gi2) { if (gi2.companion) bits.push(`a same-stem \`${gi2.companion.pattern}\` companion (${pct(gi2.companion.share)}% of ${gi2.companion.n} have one, e.g. \`${gi2.companion.example}\`)`);
          if (gi2.importedBy) bits.push(`registration in \`${gi2.importedBy.file}\` (imports ${gi2.importedBy.n} of ${gi2.importedBy.of} members)`);
          if (gi2.importedByPattern) bits.push(`registration by a \`${gi2.importedByPattern.pattern}\` file (${gi2.importedByPattern.n} of ${gi2.importedByPattern.of} members are imported by one)`); }
        if (bits.length) lines.push(`  a new member comes with: ${bits.join(' · ')}`); }
      if (model.twins) { const tw = model.twins.find(t => (t.a.part === h.part && t.a.role === h.roleIdx) || (t.b.part === h.part && t.b.role === h.roleIdx));
        if (tw) { const mine = tw.a.part === h.part && tw.a.role === h.roleIdx; const other = mine ? tw.b : tw.a;
          const otherSuf = tw.namedDifferently ? (mine ? tw.namedDifferently[1] : tw.namedDifferently[0]) : null;
          lines.push(`  twin: structurally the same as «${other.label}» (${other.part})${otherSuf ? `, named \`*${otherSuf[0].toUpperCase()}${otherSuf.slice(1)}\` there` : ''}`); } }
      // folded into the recipe line above — must not also print as one of the ordinary bullets below
      if (fbFact) bulletFacts = h.facts.filter(f => f !== fbFact); }
    let dlShown = false; // the first fact that HAS deviants names them — what not to copy
    bulletFacts.slice(0, 6).forEach(f => { lines.push(`  - ${voice('practiced', `${verbalize(f, f.exemplars.map(e => e.name))} — ${pct(f.share)}% of ${f.sraw}${factNotes(f)}${f.authorConc ? ` · ${authorConcClause(f.authorConc)}` : ''}`)}`); if (!dlShown) { const dl = deviantLine(f); if (dl) { lines.push(dl); dlShown = true; } } });
    // exemplars: types and methods before file scopes — a class to copy beats a filename to copy
    const kindRank = e => /\.[a-z]+$/i.test(e.name) && e.line === 1 ? 1 : 0;
    const ex = [...new Map(h.facts.flatMap(f => f.exemplars.map(e => [e.rel + e.name, [e, f]]))).values()].filter(([e]) => exemplarOk(e.rel)).sort((a, b) => kindRank(a[0]) - kindRank(b[0])).slice(0, 3);
    if (ex.length) lines.push(`  pattern to copy: ${ex.map(([e, f]) => `${ptr(e.rel, e.line, e.endLine)} \`${e.name}\`${skipLineNote(part(model, h.part), f, e)}${e.why ? ` — ${e.why}` : ''}`).join(' · ')}`);
    else if (h.members) { const ms = h.members.slice(0, 3).map(withLine); lines.push(`  members to look at: ${ms.join(' · ')}`); }
    else if (h.files?.length) lines.push(`  files to look at: ${h.files.slice(0, 3).join(' · ')}${h.files.length > 3 ? ` · +${h.files.length - 3} more` : ''}`);
    const cc = cochangePartners(model, h.topDirs.map(([d]) => d));
    if (cc.length) lines.push(`  historically co-changes with: ${cc.map(c => `${c.partner}${c.dead ? ' (deleted)' : ''} (${c.sup}/${c.commits} commits)`).join(' · ')}`); }
  lines.push(...bridged);
  return { lines, hits, cards }; }

// `how <intent>` — change by example (§J2.2). `where` answers "what governs the place this belongs in"; `how`
// answers a different question — "when a change like this happened here before, which files did it touch?" — and
// answers it only from real commits (`H.fps`, recorded by J2.1). Every match is one historical instance cited by
// its sha, never a certified convention, and the header says so in the map voice.
export function howCmd({ model, H, query, top = 5, msgOf = null, mapRows = 60, exemplarOk = () => true, shapes = true }) {
  const q = query;
  const qt = new Set(tokenize(q).map(normTok));
  for (const t of [...qt]) if (QSTOP.has(t)) qt.delete(t); // instruction fillers never count — same cut whereCmd makes
  const fps = (H && H.fps) || [];
  // path tokens per DISTINCT path, memoized: the same file recurs across many commits, and `nameTokens`
  // re-tokenizes its basename every time otherwise (measured: the memo is worth ~2x at CFG.fpsCap)
  const pathToks = new Map();
  const toksOfPath = p => { let v = pathToks.get(p); if (v === undefined) { v = nameTokens(p).map(normTok); pathToks.set(p, v); } return v; };
  const carries = (fp, t) => { if (fp.toks.includes(t)) return true; // message tokens and file-name tokens are one set, checked without building it
    for (const f of fp.files) if (toksOfPath(f).includes(t)) return true;
    return false; };
  // document frequency over exactly the universe the match runs on: one commit counts once per token, whether that
  // token came from its message or from one of its file names. `H.msgTokCommits` is deliberately NOT reused here —
  // it counts only commits that HAVE a message (fps holds message-less ones too) and knows nothing of path tokens,
  // so pairing it with a path-side df would weigh the two halves of one token set on two different denominators.
  // Counted for the QUERY's tokens only: df for every token the whole history ever said is work thrown away, and
  // it is what would have forced a persisted `fpsPathDf` field (and a MODEL_V bump) to stay inside the latency
  // budget. Scoped this way the pass costs one walk of `fps` per query word, with no per-commit allocation at all.
  const df = new Map();
  for (const t of qt) { let n = 0; for (const fp of fps) if (carries(fp, t)) n++; df.set(t, n); }
  const N = fps.length;
  const maxIdf = Math.log2(1 + N); // a query word no commit ever said stays in the denominator at full weight
  const idf = new Map(); for (const t of qt) idf.set(t, df.get(t) ? Math.log2(1 + N / df.get(t)) : maxIdf);
  const idfSum = [...idf.values()].reduce((a, b) => a + b, 0);
  const scored = [];
  if (idfSum) for (const fp of fps) {
    let s = 0; for (const [t, w] of idf) if (carries(fp, t)) s += w;
    const score = s / idfSum;
    if (score >= 0.34) scored.push({ fp, score }); } // the same "weak match" floor whereCmd warns at — here it is the cut, not a caveat
  // ranking: score first; ties broken by RECENCY (the newest instance is the one to copy — a repo's own habits
  // drift, and the oldest of three identical-scoring commits is the least likely to still be how it is done), then
  // by sha so two runs on one repository can never disagree
  scored.sort((a, b) => b.score - a.score || b.fp.ts - a.fp.ts || (a.fp.sha < b.fp.sha ? -1 : a.fp.sha > b.fp.sha ? 1 : 0));
  const matches = scored.slice(0, Math.max(1, Math.floor(top) || 5));
  if (!matches.length) { // nothing invented: fall back to whereCmd's own compact map, whole and unmodified
    const { lines: mapLines } = whereCmd({ model, query: q, mapRows, exemplarOk });
    return { lines: [voice('map', `«${q}» → no past change matches this intent — there is no example to follow, so the structural map of this repository follows instead`), ...mapLines], matches: [], places: [], missing: [], shape: null }; }
  const K = matches.length;
  const msgFor = fp => { const m = msgOf ? msgOf(fp.sha) : null; return m || (fp.toks.length ? fp.toks.join(' ') : '(no commit message)'); };
  const refined = model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || []));
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
  const counts = new Map(); const weights = new Map();
  for (const m of matches) { const once = new Set();
    for (const f of m.fp.files) { const cur = currentOf(f); if (once.has(cur)) continue; once.add(cur);
      counts.set(cur, (counts.get(cur) || 0) + 1); weights.set(cur, (weights.get(cur) || 0) + m.score); } }
  const topScopes = new Map(); // the scopes the TOP-ranked match itself changed, per file — one example's shape, not a tally
  for (const key of matches[0].fp.scopes || []) { const parts = key.split('#'); if (parts.length < 3) continue;
    const cur = currentOf(parts[0]); const arr = topScopes.get(cur) || [];
    if (!arr.includes(parts[2])) arr.push(parts[2]); topScopes.set(cur, arr); }
  const places = [...counts.keys()].map(rel => ({ rel, k: counts.get(rel), of: K, module: refined(rel), exists: live.has(rel), scopes: (topScopes.get(rel) || []).slice(0, 6), weight: +weights.get(rel).toFixed(3) }))
    .sort((a, b) => b.weight - a.weight || b.k - a.k || (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  // `sources: ['cochange']` is the ONLY correct configuration here and is not a limitation to relax later: `how`
  // names its files from the commit history and never parses one, so it can never supply the `newFileScopes` the
  // `'recipe'` source needs. Bolting `'recipe'` on would require adding a parse step first.
  const missing = missingLines(model, places.filter(p => p.exists).map(p => p.rel), { sources: ['cochange'] });
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
    for (const f of qFiles) { qCells.add('m:' + refined(f)); const sf = sufOf(f); if (sf) qCells.add('k:' + sf); }
    let best = null;
    for (const a of model.changeArchetypes) {
      let s = 0; for (const [t, w2] of idf) if (a.toks.includes(t)) s += w2;
      const cert = a.cells.filter(c => c.certified);
      const mk = cert.filter(c => c.cell[0] === 'm' || c.cell[0] === 'k');
      const cover = mk.length ? mk.filter(c => qCells.has(c.cell)).length / mk.length : 0;
      const score = Math.max(s / idfSum, cover);
      if (score >= 0.34 && (!best || score > best.score || (score === best.score && a.n > best.a.n))) best = { a, score, cert }; }
    if (best) shape = { id: best.a.id, label: best.a.label, n: best.a.n, cells: best.cert }; }
  const lines = [voice('map', `«${q}» → how such a change runs here: ${K} past change${K === 1 ? '' : 's'} match (evidence: ${shape ? 'a certified shape, then examples' : 'examples, not a certified shape'})`)];
  if (shape) lines.push(voice('practiced', `certified shape "${shape.label}" (${shape.n} changes): ${shape.cells.map(c => `${archCellLabel(model, c.cell)} (${c.k} of ${shape.n})`).join(' · ')}`));
  for (const m of matches) lines.push(voice('example', `"${msgFor(m.fp)}" — ${m.fp.files.length} file${m.fp.files.length === 1 ? '' : 's'}`,
    { sha: m.fp.sha.slice(0, 7), date: new Date(m.fp.ts * 1000).toISOString().slice(0, 7) }));
  lines.push('places such a change touched:');
  for (const p of places) lines.push(`  ${p.rel} (${p.k}/${p.of}) — ${p.exists ? p.module : '(deleted)'}${p.scopes.length ? ` · scopes: ${p.scopes.join(', ')}` : ''}`);
  lines.push(...missing);
  return { lines, matches: matches.map(m => ({ sha: m.fp.sha, ts: m.fp.ts, msg: msgFor(m.fp), files: m.fp.files, score: +m.score.toFixed(3) })), places, missing, shape }; }

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
  const yields = new Set(); for (const f of model.filesAll || []) { const g = EXT2GRAMMAR[extname(f)]; if (g && seen.has(f)) yields.add(g); }
  return blind.filter(f => yields.has(EXT2GRAMMAR[extname(f)])); }
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
  for (const s of rawScopes) { if (s.kind !== 'file') continue;
    for (const e of (s.vals || [])) { if (e.v !== q) continue;
      (byKind.get(e.k) || byKind.set(e.k, new Set()).get(e.k)).add(s.rel); } }
  if (!byKind.size) return null;
  // the kind with the strongest evidence speaks — a query rarely lands on more than one kind, and when it does the
  // best-attested one is the more useful thing to name
  const [k, fileSet] = [...byKind].sort((a, b) => b[1].size - a[1].size || (a[0] < b[0] ? -1 : 1))[0];
  const files = [...fileSet].sort(), df = files.length;
  const dfMax = Math.ceil(CFG.valueDfMaxShare * (model.files || df));
  return { valueKind: k, files, df, tooRare: df < CFG.valueDfMin, tooCommon: df > dfMax }; }
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
  const ql = q.toLowerCase(); const hits = new Map(); // rel -> Set('implements' | 'type hint')
  for (const p of model.partitions || []) {
    for (const [rel, sups] of Object.entries(p.fileSups || {})) if (sups.some(x => x.toLowerCase() === ql)) (hits.get(rel) || hits.set(rel, new Set()).get(rel)).add('implements');
    for (const [rel, refs] of Object.entries(p.fileTypeRefs || {})) if (refs.some(x => x.toLowerCase() === ql)) (hits.get(rel) || hits.set(rel, new Set()).get(rel)).add('type hint'); }
  return hits; }
export function whatCmd({ model, H, query, exemplarOk = () => true, rawScopes = null, blindHit = null }) {
  const q = query;
  const qt = new Set(tokenize(q).map(normTok));
  for (const t of [...qt]) if (QSTOP.has(t)) qt.delete(t); // instruction fillers never count — same cut whereCmd/howCmd make

  // (a) declarations: score every card by whereCmd's own IDF, then — for each hit — list the card's own MEMBERS
  // (not its aggregate vocabulary) whose OWN name tokens overlap the query. A directory card has no members and
  // never contributes here; that is deliberate, "declared" names a scope, not a place.
  const cards = buildCards(model);
  const df = new Map(); for (const c of cards) for (const t of c.toks.keys()) df.set(t, (df.get(t) || 0) + 1);
  const maxIdf = Math.log2(1 + cards.length);
  const idf = new Map(); for (const t of qt) idf.set(t, df.get(t) ? Math.log2(1 + cards.length / df.get(t)) : maxIdf);
  const idfSum = [...idf.values()].reduce((a, b) => a + b, 0);
  for (const c of cards) { let s = 0; for (const [t, w] of idf) s += (c.toks.get(t) || 0) * w; c.score = idfSum ? s / idfSum : 0; }

  const defined = []; const seenDef = new Set();
  const pushDef = (rel, kind, name, line, endLine) => { if (!line || !exemplarOk(rel)) return;
    const key = rel + '#' + kind + '#' + name + '#' + line; if (seenDef.has(key)) return; seenDef.add(key);
    defined.push({ rel, kind, name, line, endLine: (endLine && endLine > line) ? endLine : line }); };
  // ANY shared token used to be enough (`.some`) — a single incidental word ("level", "web") from a multi-token
  // query was enough to claim an unrelated symbol as a hit, with full confidence (§002). The query's OWN tokens
  // must now be FULLY covered by the candidate's tokens: a no-op for a single-token query (still exactly the old
  // `.some` behavior — `status` matching `PENDING_STATUS` is unaffected), a real tightening for a multi-token one
  // (`PriorityLevel` no longer covers `LogLevel`; a 5-word dotted config key no longer covers a class that only
  // shares one of its five words).
  const coversQt = toks => qt.size > 0 && [...qt].every(t => toks.has(t));
  const nameHits = name => coversQt(new Set(tokenize(name).map(normTok)));
  for (const c of cards) { if (c.score <= 0) continue;
    if (c.type === 'file') { const P = part(model, c.part);
      for (const [kind, name, line, endLine] of (P.fileScopes?.[c.label] || [])) { if (kind === 'catch' || kind === 'finally') continue;
        if (nameHits(name)) pushDef(c.label, kind, name, line, endLine); } }
    else if (c.type === 'group' || c.type === 'marker') { const P = part(model, c.part);
      for (const k of c.members || []) { const [rel, kind, name] = k.split('#'); if (!nameHits(name)) continue;
        pushDef(rel, kind, name, scopeLine(P, k), scopeLineEnd(P, k)); } } }
  const ql = q.toLowerCase();
  // §036: an exact-name match sorts first, ahead of the old rel/line order — a display cap must show the true
  // answer, not merely count it. Ties within "exact" or within "not exact" keep the previous rel/line order
  // (Array#sort is stable), so this is a superset of the old ordering, not a behavior change for any query with
  // zero or one exact match already inside the first 12.
  defined.sort((a, b) => { const ea = a.name.toLowerCase() === ql, eb = b.name.toLowerCase() === ql;
    if (ea !== eb) return ea ? -1 : 1;
    return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line; });
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
  for (const [key, places] of Object.entries(model.valueIndex || {})) { const i = key.indexOf(':'); const k = key.slice(0, i), v = key.slice(i + 1);
    if (coversQt(new Set(tokenize(v).map(normTok)))) valueHits.push({ key, k, v, places }); }
  valueHits.sort((a, b) => b.places.length - a.places.length || (a.v < b.v ? -1 : a.v > b.v ? 1 : a.k < b.k ? -1 : 1));

  // (c) spread: (a) ∪ (b)'s files, grouped by the same refined module assignment inLineForFile uses
  const spreadFiles = new Set(definedAll.map(d => d.rel)); // §039: the full set, never the capped one
  for (const h of valueHits) for (const [rel] of h.places) spreadFiles.add(rel);
  const spread = [];
  if (spreadFiles.size && model.filesAll) { const refined = model._archModOf || (model._archModOf = refineModOf(model.filesAll, model.pkgs || []));
    const byMod = new Map(); for (const rel of spreadFiles) { const m = refined(rel); byMod.set(m, (byMod.get(m) || 0) + 1); }
    spread.push(...[...byMod].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5).map(([module, n]) => ({ module, n }))); }

  // (d) siblings: the OTHER members of any container a matched value belongs to — members already matched by (b)
  // themselves are not "other" news, so a container every one of whose survivors (b) already found contributes nothing
  const matchedKeys = new Set(valueHits.map(h => h.key));
  const siblings = []; const seenCont = new Set();
  for (const h of valueHits) {
    const contEntry = Object.entries(model.valueSiblings || {}).find(([, sibs]) => sibs.includes(h.key));
    if (!contEntry) continue; const [c, sibs] = contEntry; if (seenCont.has(c)) continue; seenCont.add(c);
    const others = sibs.filter(k2 => !matchedKeys.has(k2)); if (!others.length) continue;
    const label = model.valueContainer?.[c];
    siblings.push(`${label ? label + ': ' : ''}${others.map(k2 => `\`${k2.slice(k2.indexOf(':') + 1)}\``).join(', ')}`); }

  // (e) commits: model.msgAffinity (built at index time from H.msgAff, §J2.4) works from the model alone — locating
  // it never needs H. The rendered count/date DOES need H.fps (§J2.1), so — exactly like `how` — that half is
  // loaded lazily by the caller and degrades all-or-nothing: no H means no `changes:` line, never a partial one.
  const affRow = (model.msgAffinity || []).find(r => [...qt].some(t => normTok(r.t) === t || r.t === t));
  let changes = null;
  if (affRow && H && H.fps && H.fps.length) {
    const hits = H.fps.filter(fp => fp.toks.includes(affRow.t));
    if (hits.length) changes = { commits: hits.length, last: new Date(Math.max(...hits.map(fp => fp.ts)) * 1000).toISOString().slice(0, 7) }; }

  // (f) fan-in: incoming file-level edges into the top 3 declaration files, ranked by how many declarations matched
  let usedBy = null;
  if (definedAll.length) { const byFile = new Map(); for (const d of definedAll) byFile.set(d.rel, (byFile.get(d.rel) || 0) + 1); // §039: ranked over every hit, not the twelve shown
    const top3 = new Set([...byFile].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(([rel]) => rel));
    const k = (model.edges || []).filter(e => top3.has(e.to)).length;
    if (k > 0) usedBy = { files: k }; }

  // (g) structural references (§032) — see `typeRefHits`'s own note. Only consulted for a name with no exact
  // local declaration; the count is real (an exact-name match against per-file structural facts, not token
  // overlap) but the NAME itself resolves to nothing declared here, so it is disclosed, never presented as an
  // ordinary `defined:`/`used by:` fact.
  let referenced = null;
  if (!exactLocal) { const refHits = typeRefHits(model, q);
    if (refHits.size) {
      const implN = [...refHits.values()].filter(s => s.has('implements')).length;
      const hintN = [...refHits.values()].filter(s => s.has('type hint')).length;
      referenced = { files: refHits.size, implements: implN, typeHint: hintN }; } }

  const lines = [`«${q}» → what it is here:`];
  if (defined.length) lines.push(voice('practiced', `defined: ${defined.map(d => `${ptr(d.rel, d.line, d.endLine)} \`${d.name}\` (${d.kind})`).join(' · ')}${definedAll.length > defined.length ? ` · +${definedAll.length - defined.length} more` : ''}`));
  if (valueHits.length) lines.push(voice('practiced', `values: ${valueHits.map(h => `\`${h.v}\` in ${h.places.length} place${h.places.length === 1 ? '' : 's'} (${VALUE_KIND_LABEL[h.k] || h.k})`).join(' · ')}`));
  if (spread.length) lines.push(voice('practiced', `spread: ${spread.map(s => `${s.module} (${s.n})`).join(' · ')}`));
  if (siblings.length) lines.push(voice('practiced', `siblings: ${siblings.join(' · ')}`));
  if (changes) lines.push(voice('practiced', `changes: ${changes.commits} commit${changes.commits === 1 ? '' : 's'} mention it, last ${changes.last} — \`grain how "${q}"\` for the shape`));
  if (usedBy) lines.push(voice('practiced', `used by: ${usedBy.files} files`));
  if (referenced) { const bits = [];
    if (referenced.implements) bits.push(`implements/extends it in ${referenced.implements} file${referenced.implements === 1 ? '' : 's'}`);
    if (referenced.typeHint) bits.push(`takes or returns it as a parameter/return type in ${referenced.typeHint} file${referenced.typeHint === 1 ? '' : 's'}`);
    lines.push(voice('map', `«${q}» has no declaration anywhere in this repository (likely an external/vendor type) but is referenced structurally in ${referenced.files} file${referenced.files === 1 ? '' : 's'} — ${bits.join(' · ')}. Matched by its exact name against grain's own recorded supertype and parameter/return-type facts, not a resolved import — this count may still miss usages the extractor cannot see structurally (dynamic instantiation, reflection, string-based type references).`)); }
  let note = null;
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
  const weakName = !!(defined.length || valueHits.length || referenced) && !exactLocal
    && !valueHits.some(h => h.v.toLowerCase() === ql) && qt.size >= 2;
  if (weakName && blindHit) { // supplied by cmdWhat's bounded, word-boundary, peer-anomalous re-scan — never a repo-wide grep
    lines.push(voice('map', `nothing above IS «${q}» — those hits only share words with it. The exact name does appear in ${blindHit}, a file that parsed with zero extracted scopes while files of its own kind parse normally here. Grain cannot see inside it, so a real declaration of «${q}» may be missing from this answer.`));
    note = { kind: 'blind-weak', value: q, file: blindHit }; }
  if (!defined.length && !valueHits.length && !referenced) { // no INDEXED presence — but "indexed" and "exists" are not the same claim (§011/§018/§014): a gated
    // value (seen, excluded by the df floor) or a symbol whose exact text lives in a zero-scope file (§018/§014
    // shape) each get their own one-line disclosure instead of silently collapsing into the same bare "nothing" a
    // truly absent symbol gets.
    const gv = gatedValueEvidence(model, rawScopes, q);
    if (gv) { // the plain absence claim would be FALSE here — replaced, not appended
      const label = VALUE_KIND_LABEL[gv.valueKind] || gv.valueKind;
      const text = gv.tooRare
        ? `«${q}» was seen as a ${label} in ${gv.df} file${gv.df > 1 ? 's' : ''} (${gv.files.slice(0, 3).join(', ')}) — below the ${CFG.valueDfMin}-file floor where concordance begins, so it is not indexed. Seen, not absent.`
        : gv.tooCommon
        ? `«${q}» was seen as a ${label} in ${gv.df} files — above the commonality ceiling (over ${Math.round(CFG.valueDfMaxShare * 100)}% of the repository), so it is treated as boilerplate rather than a distinguishing concordance. Seen, not absent.`
        : `«${q}» was seen as a ${label} in ${gv.df} file${gv.df > 1 ? 's' : ''} but was not retained in the value index. Seen, not absent.`;
      lines.push(voice('map', text));
      note = { kind: 'gated', value: q, valueKind: gv.valueKind, df: gv.df, files: gv.files };
    } else if (blindHit) { // the exact text was found, on a bounded re-scan, inside a file that parsed to zero real scopes
      lines.push(voice('map', `«${q}» is not indexed as a declaration or value — but that exact text appears in ${blindHit}, a file that parsed with zero extracted scopes. Grain cannot see inside it, so this may be a real declaration it missed.`));
      note = { kind: 'blind', value: q, file: blindHit };
    } else {
      lines.push(voice('map', `«${q}» has no declarations or values anywhere in this repository's code`));
      note = { kind: 'absent' }; }
    if (affRow) lines.push(voice('example', `«${affRow.t}» appears in no code card here, but commits saying it touched: ${affRow.files.slice(0, 3).map(([f, n]) => `\`${f}\` (${n})`).join(' · ')}${affRow.ex ? ` — e.g. "${affRow.ex[1]}" (${affRow.ex[0]})` : ''}`, { sha: affRow.ex ? affRow.ex[0] : null })); }

  // `definedTotal`/`spreadFiles`/`weakName` are internal (§039/§037): `cmdWhat` destructures the published fields
  // by name, so none of these reaches `what --json`. They exist for the two in-process callers — `howCmd`, which
  // needs the UNCAPPED (a)∪(b) file set, and `cmdWhat`, which needs to know whether a weak answer is worth paying
  // a bounded blind-file re-scan for before it touches the filesystem.
  return { lines, defined, definedTotal: definedAll.length, spreadFiles: [...spreadFiles], weakName,
    values: valueHits.map(h => ({ value: h.v, kind: h.k, places: h.places })), spread, siblings, changes: changes || {}, usedBy: usedBy || {}, referenced, note }; }

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
  const tokensOfPath = p => { let v = pathToks.get(p); if (v === undefined) { v = new Set(nameTokens(p).map(normTok)); pathToks.set(p, v); } return v; };
  const contentToks = new Map();
  const tokensOfContent = p => { if (contentToks.has(p)) return contentToks.get(p);
    let v = null;
    try { const buf = readFileSync(join(root, p));
      // a NUL byte anywhere in the first 8KB is the same cheap binary heuristic git itself uses (core.diff.binary) —
      // good enough to keep an image/archive/etc. from being tokenized as text without a per-extension list
      if (buf.length <= 1.5e6 && buf.subarray(0, 8000).indexOf(0) === -1) v = new Set(tokenize(buf.toString('utf8')).map(normTok)); }
    catch { /* deleted, unreadable, or not a plain file at this path — path tokens alone still apply */ }
    contentToks.set(p, v); return v; };

  const prf = (predicted, truth) => { if (!predicted.size) return { p: 0, r: 0 }; // no prediction ⇒ P=0/R=0, never excluded
    let hit = 0; for (const f of predicted) if (truth.has(f)) hit++;
    return { p: hit / predicted.size, r: truth.size ? hit / truth.size : 0 }; };

  const howP = [], howR = [], howF1 = [], grepP = [], grepR = [], grepF1 = []; let noMatch = 0;
  const f1 = (p, r) => (p + r) ? 2 * p * r / (p + r) : 0; // 0 when both P and R are 0 — a total miss is F1=0, not NaN
  for (const C of candidates) {
    const intent = C.toks.join(' '); // `C.toks` is already tokenize+normTok'd (history.mjs) — `howCmd` re-tokenizes the same words, a safe no-op
    const fps2 = fps.filter(fp => fp.sha !== C.sha); // leave-one-out: C must not be allowed to match itself
    const { places } = howCmd({ model, H: { ...H, fps: fps2 }, query: intent, shapes: false }); // the shape pass costs a buildCards() per call and this loop reads `places` only
    const predictedHow = new Set(places.filter(p => p.k >= 1).map(p => p.rel));
    const truth = new Set(C.files.filter(f => live.has(f))); // a leave-one-out truth check can't credit a file no longer alive at HEAD

    const intentToks = new Set(C.toks);
    const predictedGrep = new Set();
    if (intentToks.size) for (const p of pathsAll) {
      let hit = false;
      for (const t of tokensOfPath(p)) if (intentToks.has(t)) { hit = true; break; }
      if (!hit) { const ct = tokensOfContent(p); if (ct) for (const t of intentToks) if (ct.has(t)) { hit = true; break; } }
      if (hit) predictedGrep.add(p); }

    if (!predictedHow.size) noMatch++;
    const h = prf(predictedHow, truth), g = prf(predictedGrep, truth);
    howP.push(h.p); howR.push(h.r); howF1.push(f1(h.p, h.r));
    grepP.push(g.p); grepR.push(g.r); grepF1.push(f1(g.p, g.r)); }

  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  // F1 (harmonic mean of P and R) alongside the frozen P/R criterion: a system that returns most of the repo
  // (grep) gets recall≈1 almost by construction, which makes "how's recall ≥ grep's recall" nearly unwinnable
  // for a precise tool regardless of how good it is — F1 penalizes over-returning and under-returning alike, so
  // it is not distorted by the two arms returning wildly different result-set sizes (§Bramka J2.3, gate re-run)
  return { how: { meanP: mean(howP), medP: median(howP), meanR: mean(howR), medR: median(howR), meanF1: mean(howF1), medF1: median(howF1) },
    grep: { meanP: mean(grepP), medP: median(grepP), meanR: mean(grepR), medR: median(grepR), meanF1: mean(grepF1), medF1: median(grepF1) },
    n: candidates.length, noMatch }; }

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
// Returns { where, base, unnamed: { n, where, base }, n, silent }, each arm { hit3, mrr, place3 }: `n` is the
// candidate count, `silent` counts candidates where `where` ranked nothing at all (a genuine no-match or the
// concentration safeguard suppressing an untrustworthy top hit — both still count as a 0, or the gate would be
// gameable by staying quiet on everything hard).
export function whereEval({ model, H, last = 100 }) {
  const DEPTH = 10; // the ranked list is read this deep: `hit3`/`place3` are the product's OWN default `--top 3`; the rest of the depth is there so `mrr` can tell "just missed" from "nowhere at all"
  const fps = (H && H.fps) || [];
  const filesAll = model.filesAll || [];
  const live = new Set(filesAll);
  // a file's birth: the earliest commit any of its scopes was first seen in, and whether that commit ADDED the
  // file. `lc` keys carry the file's CURRENT path (replay() moves a renamed file's rows, §13.3), so this map is
  // keyed by the path the file has at HEAD.
  const birth = new Map();
  for (const [k, L] of (H && H.lc) || []) { const rel = k.split('#')[0]; if (!live.has(rel)) continue;
    const cur = birth.get(rel);
    if (!cur || L.first < cur.ts) birth.set(rel, { ts: L.first, added: !!L.newFile });
    else if (L.first === cur.ts && L.newFile) cur.added = true; }
  // the same lineage in the other direction: `fps[*].renames` maps a historical path to what it became, so the
  // commit that added `flask/config.py` is still credited with the file living at `src/flask/config.py` today.
  // Bounded walk — a rename cycle (A→B in one commit, B→A in another) must not spin.
  const renamedTo = new Map(); for (const fp of fps) for (const [o, nw] of fp.renames || []) renamedTo.set(o, nw);
  const finalPath = p => { let x = p; for (let i = 0; i < 64 && renamedTo.has(x); i++) { const y = renamedTo.get(x); if (y === x) break; x = y; } return x; };
  const claimed = new Set(); const eligible = [];
  for (const fp of fps) { // `fps` is oldest-first (history.mjs replay(), §J2.1) — on a timestamp tie the earlier commit keeps the file
    const truth = [];
    for (const f of fp.files) { const cur = finalPath(f); if (claimed.has(cur)) continue;
      const b = birth.get(cur); if (b && b.added && b.ts === fp.ts) { truth.push(cur); claimed.add(cur); } }
    if (truth.length) eligible.push({ toks: fp.toks, truth }); }
  const n = Math.max(0, Math.floor(last) || 0);
  const candidates = n > 0 ? eligible.slice(-n) : []; // the LAST n are the most recent — the conventions in force now

  const pathToks = new Map();
  const tokensOfPath = p => { let v = pathToks.get(p); if (v === undefined) { v = new Set(tokenize(p).map(normTok)); pathToks.set(p, v); } return v; };
  const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.';
  const rows = []; let silent = 0;
  for (const C of candidates) {
    const query = C.toks.join(' ');
    const qt = new Set(tokenize(query).map(normTok).filter(t => !QSTOP.has(t))); // derived from the query STRING by `whereCmd`'s own two steps, so the baseline arm and the stratum split can never see a different set of words than `where` itself does
    const truth = new Set(C.truth), truthDirs = new Set(C.truth.map(dirOf));
    const { hits } = whereCmd({ model, query, top: DEPTH, mapRows: 0 }); // mapRows 0: the compact map is render-only and this reads ranks
    if (!hits.length) silent++;
    let wHit = 0, wPlace = 0;
    hits.forEach((h, i) => {
      const hit = h.type === 'file' && truth.has(h.label);
      const place = hit || (h.type === 'directory' ? C.truth.some(t => t.startsWith(h.label)) : (h.members || []).some(k => truth.has(String(k).split('#')[0])));
      if (hit && !wHit) wHit = i + 1;
      if (place && !wPlace) wPlace = i + 1; });
    const ranked = [];
    for (const p of filesAll) { const pt = tokensOfPath(p); let m = 0; for (const t of qt) if (pt.has(t)) m++; if (m) ranked.push([p, m]); }
    // deliberately naive and fully deterministic: more matched words first, then the shorter path (the more
    // specific of two equal matches), then lexical — no relevance model of any kind, that is the arm being beaten
    ranked.sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1));
    let bHit = 0, bPlace = 0;
    ranked.slice(0, DEPTH).forEach(([p], i) => { if (truth.has(p) && !bHit) bHit = i + 1; if (truthDirs.has(dirOf(p)) && !bPlace) bPlace = i + 1; });
    const nameToks = new Set(C.truth.flatMap(f => nameTokens(f).map(normTok)));
    rows.push({ named: [...qt].some(t => nameToks.has(t)), wHit, wPlace, bHit, bPlace }); }

  const at = (rs, f, k) => rs.length ? rs.filter(r => r[f] && r[f] <= k).length / rs.length : 0;
  const mrr = (rs, f) => rs.length ? rs.reduce((a, r) => a + (r[f] ? 1 / r[f] : 0), 0) / rs.length : 0;
  const arm = (rs, h, p) => ({ hit3: at(rs, h, 3), mrr: mrr(rs, h), place3: at(rs, p, 3) });
  const unnamed = rows.filter(r => !r.named);
  return { where: arm(rows, 'wHit', 'wPlace'), base: arm(rows, 'bHit', 'bPlace'),
    unnamed: { n: unnamed.length, where: arm(unnamed, 'wHit', 'wPlace'), base: arm(unnamed, 'bHit', 'bPlace') },
    n: rows.length, silent }; }

// ===== REPORT / STATUS / COMPLETENESS =====
// never round a share < 1 up to a misleading 100% — the floor sits at 99 so "100%" is reserved for an actual,
// exact 1.0 share (zero exceptions), matching what the rest of the product's own language teaches that phrase to
// mean; share === 1 still prints 100 (§G14)
export function pct(share) { const r = Math.round(share * 100); return share < 1 && r >= 100 ? 99 : r; }
export const factLabel = (p, f) =>/^r\d/.test(f.cid) ? `group «${p.medoids[+f.cid.slice(1).split(':')[0]]?.label || 'group'}»` : f.cid.startsWith('d[') ? `local (${f.cid.slice(2, f.cid.indexOf(']'))}/)` : f.pkgWide ? scopeLabel(p.name.replace(/#.*$/, '')) + ' incl. tests/examples' : scopeLabel(p.name);
// three tiers, each under its own --top cap: domain conventions (a choice someone made) first, structural-shape
// contrasts (the language showing through a group/directory boundary, not a chosen convention) second, lexical
// style (quotes, semicolons, indentation) last — bpi alone conflates them, since a crisp small sample can
// out-score a large one on codelength gain per instance without being more worth a reader's attention (measured:
// a 10-member arity contrast outranked a 30-member decorator convention by bpi alone). Shared by report() and
// rulesMarkdown() so the two renderers can never drift on what counts as a "chosen" convention.
export function factTiers(p) {
  const shown = p.facts.filter(f => !isDefiningFact(p.medoids, f)); const taut = p.facts.filter(f => isDefiningFact(p.medoids, f)).length;
  const isLex = f => f.pid.startsWith('auto.lex:');
  const domain = shown.filter(f => !STRUCT_PID.test(f.pid) && !isLex(f));
  const structural = shown.filter(f => STRUCT_PID.test(f.pid));
  const lexical = shown.filter(isLex);
  return { domain, structural, lexical, taut }; }
// (§013/§024 ruling) `+dirty` is spoken for: it means "this answer incorporates your uncommitted edits", true
// only of `check`/`review` (always) and `spectrum`/`explain` (for the one file asked about, since §013 made them
// read it live). A HEAD-reading command (where/how/what/map/status/report/rules/completeness — grain.mjs) never
// reads the worktree at all, so it may never claim `+dirty` — but a dirty tree still means today's answer may not
// match what's on disk, and that is worth saying. Same register as relCoverageNote/intraModuleNote just below: a
// plain declarative sentence, not a hedge, not voice()-wrapped, and never confusable with `+dirty` itself.
// Exported so grain.mjs's CLI layer (which alone knows whether the worktree is actually dirty) and rulesMarkdown's
// own generated-document text (below) share one wording instead of two that could drift apart.
export const DIRTY_TREE_NOTE = 'the worktree has uncommitted changes — this answer is computed from the indexed commit, not the current files on disk';
// §030: a `report`/`rules` TEMPLATE line (mineTemplates/profileOf — unclustered residue, never a role group) is a
// render-only structural superposition: it has no cell in `part.facts`, so `check`/`review`/hooks cannot fail a
// member for breaking its shape — not even the partial bridge J5.8 gives CLUSTERED role-group profiles
// (`part.profiles[r].req`, checked only in the "missing a required signature" direction). A reader who sees "held
// since 2008" here reasonably assumes `check` guards it; it does not, in either direction, ever. Same register as
// DIRTY_TREE_NOTE/relCoverageNote/intraModuleNote just above: a plain declarative sentence, not a hedge. One
// constant, used by both report() and rulesMarkdown() so the two can never say different things about the same
// template line (§007 — the exact drift this repo already fixed once for a different disclosure).
export const TEMPLATE_DESCRIPTIVE_NOTE = 'descriptive only — check has no cell for a template\'s shape, so a member breaking it is never flagged';
// how much of the indexed file set the relation/architecture layer can even see — a grammar with no relSupported()
// extractor contributes file/module edges of exactly zero, indistinguishable from a real, measured "this language
// imports nothing" without this disclosure; pure render from data the model already has, zero heuristics about
// WHICH languages (driven entirely by relSupported's own capability list) (§G21). The {n, grammars} shape is
// exported (not just the prose below) so export.mjs (§027) can carry the identical fact `report`/`status` print —
// one function computes it, so the two surfaces can never drift apart the way rules/report once did (§007).
export function relCoverageData(model) {
  const uncovered = new Map(); // grammar name -> file count
  for (const f of model.filesAll || []) { const g = EXT2GRAMMAR[extname(f)]; if (g && !relSupported(g)) uncovered.set(g, (uncovered.get(g) || 0) + 1); }
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
  const mg = model.moduleGraph; const n = (model.edges || []).length;
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
export const CYCLE_GRANULARITY_NOTE = 'modules here are directory buckets (refined one level under a dominant root), not build-declared source sets — a module that folds together more than one source set, such as production and test code under one src/ tree, can show a cycle that is entirely a test-only dependency, not a production one';
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
  for (const p of model.partitions || []) for (const f of p.facts) { // 1: costly to deviate from (J5.1)
    if (!f.cost || !f.cost.baseK) continue;
    const ex = f.exemplars[0]; if (!ex) continue;
    const mult = (f.cost.k / f.cost.n / (f.cost.baseK / f.cost.baseN)).toFixed(1);
    rows.push(`${factLabel(p, f)} costs ${mult}× more fixes when deviated from (${f.cost.k} of ${f.cost.n} vs ${f.cost.baseK} of ${f.cost.baseN})`
      + ` → grain decide steer ${ex.rel}#${ex.name} --surfaces ${f.pid} --note "codify — deviating costs ${mult}× more fixes"`); }
  for (const p of model.partitions || []) for (const f of p.facts) { // 2: rejected alternatives (J5.2)
    if (!f.rejected) continue;
    const ex = f.exemplars[0]; if (!ex) continue;
    for (const r of f.rejected) rows.push(`${factLabel(p, f)} — ${deviationPhrase(f, r.v)} tried ${r.tried}×, reverted ${r.reverted}× — a rejection, not an alternative`
      + ` → grain decide steer ${ex.rel}#${ex.name} --surfaces ${f.pid} --note "value already rejected ${r.tried}× — document it so it is not re-litigated"`); }
  for (const p of model.partitions || []) for (const f of p.facts) { // 3: echo chambers (J5.3)
    if (f.agentShare == null) continue;
    const ex = f.exemplars[0]; if (!ex) continue;
    rows.push(`${factLabel(p, f)} is held mostly by agent-authored code (${pct(f.agentShare)}% of recent conformers)`
      + ` → grain decide steer ${ex.rel}#${ex.name} --surfaces ${f.pid} --note "ratify — currently held mostly by agent-authored code"`); }
  if (outcomes && outcomes.byFact) { // 4: ignored after warning (J5.4) — silent whenever the caller has no outcomes file
    const entries = Object.entries(outcomes.byFact).filter(([, k]) => k >= 2).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5);
    for (const [key, k] of entries) { const i = key.indexOf('::'); if (i < 0) continue;
      const pname = key.slice(0, i), pid = key.slice(i + 2);
      const p = (model.partitions || []).find(x => x.name === pname); const f = p && p.facts.find(x => x.pid === pid);
      const dv = f && f.deviants && f.deviants[0], ex = f && f.exemplars[0];
      if (dv) rows.push(`${scopeLabel(pname)} keeps ignoring the \`${pid}\` warning at ${dv.rel}:${dv.line} (flagged and ignored ${k}×)`
        + ` → grain decide waive ${dv.rel}#${dv.name} --on ${pid} --note "flagged and ignored ${k}×"`);
      else if (ex) rows.push(`${scopeLabel(pname)} keeps ignoring the \`${pid}\` warning (flagged and ignored ${k}×)`
        + ` → grain decide steer ${ex.rel}#${ex.name} --surfaces ${pid} --note "reconsider — flagged and ignored ${k}×"`); } }
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
  for (const a of model.changeArchetypes || []) { // 6: incomplete change shapes (J4.1) — usually, not always: certification's
    // own λ bound puts every CERTIFIED cell's share at >= 0.89, so 0.6 <= share < certification is exactly "usually,
    // not always" without inventing a new upper-bound constant (the 0.6 floor already has three precedents in this file)
    let anchor = null;
    for (const c of a.cells) { if (c.certified && c.cell.startsWith('g:')) { const v = c.cell.slice(2); const i = v.lastIndexOf('#');
      anchor = roleExemplar(model, v.slice(0, i), +v.slice(i + 1)); if (anchor) break; } }
    if (!anchor) continue;
    for (const c of a.cells) { if (!(c.share >= 0.6) || c.certified) continue;
      rows.push(`change shape "${a.label}" usually but not always touches ${archCellLabel(model, c.cell)} (${c.k} of ${a.n}, ${pct(c.share)}%)`
        + ` → grain decide steer ${anchor.ex.rel}#${anchor.ex.name} --surfaces ${anchor.f.pid} --note "confirm ${archCellLabel(model, c.cell)} as a required part of '${a.label}' changes"`); } }
  { const groups = new Map(); // 7: conventions riddled with waivers (J1.3) — grouped by partition + '::' + pid, never pid
    // alone: a waiver carries no `cid`, and grouping by pid alone would merge unrelated conventions across partitions/cells
    for (const wv of model.waivers || []) { if (!wv.found) continue; const key = wv.partition + '::' + wv.pid;
      (groups.get(key) || groups.set(key, []).get(key)).push(wv); }
    for (const [, list] of groups) { if (list.length < 3) continue; const wv = list[0];
      rows.push(`\`${wv.pid}\` in ${scopeLabel(wv.partition)} carries ${list.length} waivers (e.g. ${wv.path}#${wv.name})`
        + ` → grain decide steer ${wv.path}#${wv.name} --surfaces ${wv.pid} --note "${list.length} waivers recorded here — consider promoting this scope's own value instead"`); } }
  for (const st of model.steers || []) { // 8: dead steers (E4) — baseline only ever rides on a steer's first pid, and
    // only ever for a PARTITION-WIDE convention (baselineShare reads just the `_all:` cell), so a steer over a purely
    // group/directory-local convention structurally never gets a baseline at all and can never fire this row — a known,
    // accepted coverage gap from §E4, not something to fix here
    if (!st.found) continue;
    for (const sf of st.surfaces) { if (sf.retires || !sf.baseline) continue;
      const clause = baselineClause(sf); if (!clause.includes('no movement')) continue;
      rows.push(`steer ${st.id} on ${st.path}#${st.name} has not moved the needle${clause} → grain decide rm ${st.id}`); } }
  return rows; }
export function report(model, { top = 15, outcomes } = {}) {
  const lines = [];
  for (const p of model.partitions) { lines.push(`== ${scopeLabel(p.name)} — ${p.facts.length} conventions · ${p.medoids.length} groups · ${p.scopes} scopes · ${p.files.length} files ==`);
    const { domain, structural, lexical, taut } = factTiers(p);
    const printFact = f => { const t = f.trend; const tr = t ? ` trend[${t.shares.map(s => pct(s.share)).join('>')}%]${t.nucleating ? ` — a newer pattern is emerging here: ${t.nucleating}` : ''}` : '';
      lines.push(`  ${voice('practiced', `${factLabel(p, f)}: ${verbalize(f, f.exemplars.map(e => e.name))} — ${pct(f.share)}% of ${f.sraw} established${f.deviantsN ? `, ${f.deviantsN} deviant${f.deviantsN > 1 ? 's' : ''}` : ''}${tr}${f.held && f.held.since ? ` · held since ${f.held.since}` : ''}${f.authorConc ? ` · ${authorConcClause(f.authorConc)}` : ''}`)}`); };
    for (const f of domain.slice(0, top)) printFact(f);
    if (domain.length > top) lines.push(`  … and ${domain.length - top} more — run with --top ${domain.length} for all`);
    if (structural.length) { lines.push('  syntax-shape facts (structural, not a chosen convention):');
      for (const f of structural.slice(0, top)) printFact(f);
      if (structural.length > top) lines.push(`  … and ${structural.length - top} more — run with --top ${structural.length} for all`); }
    if (lexical.length) { lines.push('  style conventions (quotes, semicolons, indentation, declarations):');
      for (const f of lexical.slice(0, top)) printFact(f);
      if (lexical.length > top) lines.push(`  … and ${lexical.length - top} more — run with --top ${lexical.length} for all`); }
    if (taut) lines.push(`  (${taut} group-defining marker${taut > 1 ? 's' : ''} not listed — a group selected by its decorator/supertype restating it is not news; \`where\` still uses them)`);
    for (const t of (p.templates || []).slice(0, 6)) { const bits = [];
      for (const pi of t.perInstance) bits.push(`one slot per-instance (${pi.distinct}/${pi.total}, e.g. \`${pi.top}\`)`);
      for (const sl of t.slots) bits.push(`slot usually \`${sl.top}\` (${sl.k}/${sl.total})`);
      lines.push(`  template (unclustered ${t.kind}s ×${t.n}, ~${Math.round(t.coverage * 100)}% of an average one): ${t.skel}${bits.length ? ' · ' + bits.join(' · ') : ''}${t.held ? ` · held since ${t.held.since}${t.held.fresh ? ` · ${t.held.fresh} new in 180d` : ''}` : ''} · ${TEMPLATE_DESCRIPTIVE_NOTE} — e.g. ${ptr(t.exemplars[0].rel, t.exemplars[0].line, t.exemplars[0].endLine)}`); } }
  if (model.moduleGraph && model.moduleGraph.nodes.length > 1) {
    const mg = model.moduleGraph;
    lines.push(`== architecture — ${mg.nodes.length} modules · ${mg.edges.length} directed dependencies · ${mg.cycles.length} cycle(s) ==`);
    const covNote = relCoverageNote(model); if (covNote) lines.push(`  ${covNote}`);
    const intraNote = intraModuleNote(model); if (intraNote) lines.push(`  ${intraNote}`);
    const out = new Map(); for (const e of mg.edges) (out.get(e.from) || out.set(e.from, []).get(e.from)).push(e);
    for (const [from, es] of [...out].sort((a, b) => b[1].reduce((x, y) => x + y.n, 0) - a[1].reduce((x, y) => x + y.n, 0)).slice(0, 12))
      lines.push(`  ${from}/ → ${es.slice(0, 5).map(e => `${e.to}/ (${e.n})`).join(' · ')}${es.length > 5 ? ` · +${es.length - 5} more` : ''}`);
    for (const c of mg.cycles.slice(0, 4)) lines.push(`  cycle (strongly connected): ${c.join(', ')} — every member reaches every other, not necessarily in this order`);
    if (mg.cycles.length) lines.push(`  ${CYCLE_GRANULARITY_NOTE}`);
    const departures = (model.archNorms || []).filter(n => n.exp === 'false' && n.fromKind !== 'group'); // "module pair(s)" below is a claim about modules specifically — group-kind rows have their own home in computeArchHits, not this count
    if (departures.length) lines.push(`  established layering: ${departures.length} module pair(s) where reaching the target is the counted exception, not the practice`); }
  { const moving = [];
    for (const p2 of model.partitions) for (const f of p2.facts) { if (!f.trend || !f.trend.shares || f.trend.shares.length < 2) continue;
      const a = f.trend.shares[0].share, b2 = f.trend.shares[f.trend.shares.length - 1].share;
      if (Math.abs(b2 - a) >= 0.1 || f.suppressedValue) moving.push({ p: p2, f, d: b2 - a }); }
    if (moving.length) { lines.push(`== drift — ${moving.length} convention(s) in motion ==`);
      for (const m of moving.sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 10))
        lines.push(`  ${m.d > 0 ? '↑' : m.d < 0 ? '↓' : '~'} ${factLabel(m.p, m.f)}: ${verbalize(m.f, m.f.exemplars.map(e => e.name))} — ${m.f.trend.shares.map(x2 => pct(x2.share)).join('>')}%${m.f.suppressedValue ? ` · a newer pattern is emerging: ${m.f.suppressedValue}` : ''}`); } }
  // the recurring shapes of past changes (§J4.1): what a change of this kind touches here, with the population it
  // was measured over. Deliberately colon-free — every `<marker>: ` prefix grain prints is a voice, and this is a
  // practiced claim, which has no marker of its own (§J0.1).
  if (model.changeArchetypes && model.changeArchetypes.length) {
    lines.push(`== changes — ${model.changeArchetypes.length} shape${model.changeArchetypes.length > 1 ? 's' : ''} ==`);
    for (const a of model.changeArchetypes) { const cs = a.cells.filter(c => c.certified);
      lines.push(`  ${voice('practiced', `"${a.label}" — ${a.n} changes · ${cs.slice(0, 6).map(c => `${archCellLabel(model, c.cell)} (${c.k} of ${a.n})`).join(' · ')}${cs.length > 6 ? ` · +${cs.length - 6} more` : ''}`)}`); } }
  if (model.boundaries && model.boundaries.length) { lines.push(`== boundaries — ${model.boundaries.length} architecture decision(s) in .grain/seeds.jsonl ==`);
    for (const bd of model.boundaries) lines.push(`  ${voice('decided', `${bd.boundary.from}/ never imports ${bd.boundary.to}/${bd.note ? ' — ' + bd.note : ''}${!bd.fromLive || !bd.toLive ? ' (a side names no indexed files — inert)' : ''}`, { typ: 'boundary', who: bd.author, when: bd.createdAt, id: bd.id })}`); }
  if (model.steers && model.steers.length) { lines.push(`== steers — ${model.steers.length} maintainer decision(s) in .grain/seeds.jsonl ==`);
    for (const st of model.steers) { if (!st.found) { lines.push(`  ${st.id}: exemplar ${st.path}#${st.name} not found in HEAD — inert (edit or remove it)`); continue; }
      for (const sf of st.surfaces) { if (sf.retires) continue; lines.push(`  ${voice('decided', `${sf.value === null ? `${sf.pid} is not a surface of ${st.name}` : verbalize({ pid: sf.pid, exp: sf.value, kind: st.kind, heritageKind: heritageKindOf(sf.pid, model) }, [st.name]) + ' — ' + practicedBy(sf) + baselineClause(sf)} · weight ${st.weight}${st.note ? ' · ' + st.note : ''}`, { typ: 'steer', who: st.author, when: st.createdAt, id: st.id })}`);
        for (const rp of st.surfaces.filter(x => x.retires)) lines.push(`    retires: ${verbalize({ pid: rp.pid, exp: 'true', kind: st.kind, heritageKind: heritageKindOf(rp.pid, model) }, [])}`); } } }
  if (model.waivers && model.waivers.length) { lines.push(`== waivers — ${model.waivers.length} waiver(s) in .grain/seeds.jsonl ==`);
    for (const wv of model.waivers) { if (!wv.found) { lines.push(`  ${wv.id}: scope ${wv.path}#${wv.name} not found in HEAD — inert (edit or remove it)`); continue; }
      lines.push(`  ${voice('decided', `${wv.path}#${wv.name} (line ${wv.line}) is excused from ${wv.pid}${wv.note ? ' — ' + wv.note : ''}`, { typ: 'waiver', who: wv.author, when: wv.createdAt, id: wv.id })}`); } }
  { const health = healthRows(model, outcomes);
    if (health.length) { lines.push(`== health — ${health.length} signal${health.length > 1 ? 's' : ''} ==`);
      for (const h of health) lines.push(`  ${voice('practiced', h)}`); } }
  lines.push(`agent-authored share of code younger than ${CFG.survDays} days: ${model.agentShare == null ? 'n/a' : Math.round(model.agentShare * 100) + '%'} · co-change pairs: ${model.cochange.length} (bulk commits touching >30 files excluded from pairing)`);
  return lines; }
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
export function mapSections(model) {
  const lines = []; const mg = model.moduleGraph;
  if (mg && mg.nodes.length) {
    const byLayer = new Map();
    for (const n of mg.nodes) { if (n.layer === undefined) continue; (byLayer.get(n.layer) || byLayer.set(n.layer, []).get(n.layer)).push(n.id); }
    const label = id => (id === '.' ? '.' : id + '/');
    const segs = [...byLayer.keys()].sort((a, b) => a - b).map(l => { const mods = byLayer.get(l).sort();
      return `layer ${l}${l === 0 ? ' (leaves)' : ''}: ${mods.slice(0, 4).map(label).join(', ')}${mods.length > 4 ? `, +${mods.length - 4} more` : ''}`; });
    if (segs.length) lines.push(voice('map', `layers: ${segs.join(' · ')}`)); }
  if (model.concepts && model.concepts.length) lines.push(voice('map', `concepts: ${model.concepts.join(', ')}`));
  if (model.changeArchetypes && model.changeArchetypes.length) { const cs = model.changeArchetypes;
    const segs2 = cs.slice(0, 4).map(a => `"${a.label}" — ${a.n} change${a.n === 1 ? '' : 's'}`);
    lines.push(voice('practiced', `changes: ${segs2.join(' · ')}${cs.length > 4 ? ` · +${cs.length - 4} more` : ''}`)); }
  const decisionsN = (model.steers || []).length + (model.boundaries || []).length + (model.waivers || []).length;
  lines.push(`decisions: ${decisionsN} maintainer decision(s) in force`);
  return lines; }
// a standalone Markdown document over the SAME model data report() renders, for a reader (human or tool) with no
// terminal and no grain plugin installed — a snapshot stamped with the commit it was computed from, not a live
// query. Reuses report()'s own tier split and verbalization helpers (factTiers, factLabel, verbalize,
// authorConcClause, practicedBy, baselineClause) so the two renderers can never disagree about what a convention
// is; a table (not report's flat bullets) fits a static reference document better, with room for an exemplar
// path+line column a terse CLI line has no space for. Excludes report()'s `== drift ==` section on purpose: drift
// is a "how is this changing" trend view suited to a live query, not a "what to copy right now" reference.
export function rulesMarkdown(model, { top = 15, sha = 'no-git', date = new Date().toISOString().slice(0, 10), outcomes, dirty = false } = {}) {
  const lines = [];
  lines.push(`# ${model.repo} — established conventions`, '');
  lines.push(`Generated by \`grain rules\` as of commit \`${sha}\` on ${date} — this file is a snapshot, not a live query; recompute with \`grain rules --out <this file>\` after the code moves. It reflects only what a maintainer would see running \`grain report\` on this exact commit.`, '');
  const row = (p, f) => { const t = f.trend; const tr = t ? `trend ${t.shares.map(s => pct(s.share)).join('>')}%${t.nucleating ? ` — newer pattern emerging: ${t.nucleating}` : ''}` : '';
    const notes = [tr, f.held && f.held.since ? `held since ${f.held.since}` : '', f.authorConc ? authorConcClause(f.authorConc) : ''].filter(Boolean).join('; ');
    const ex = f.exemplars[0];
    const evidence = `${pct(f.share)}% of ${f.sraw} established${f.deviantsN ? `, ${f.deviantsN} deviant${f.deviantsN > 1 ? 's' : ''}` : ''}`;
    return `| ${factLabel(p, f)} | ${voice('practiced', verbalize(f, f.exemplars.map(e => e.name)))} | ${evidence} | ${ex ? `\`${ptr(ex.rel, ex.line, ex.endLine)}\`${skipLineNote(p, f, ex)}` : ''} | ${notes} |`; };
  const table = (p, heading, facts) => { if (!facts.length) return;
    lines.push(`### ${heading}`, '', '| where | convention | evidence | exemplar | notes |', '| --- | --- | --- | --- | --- |');
    for (const f of facts.slice(0, top)) lines.push(row(p, f));
    if (facts.length > top) lines.push('', `_… and ${facts.length - top} more — run \`grain rules --top ${facts.length}\` for all_`);
    lines.push(''); };
  for (const p of model.partitions) {
    const { domain, structural, lexical, taut } = factTiers(p);
    lines.push(`## ${scopeLabel(p.name)}`, '', `${p.facts.length} conventions · ${p.medoids.length} groups · ${p.scopes} scopes · ${p.files.length} files`, '');
    table(p, 'Domain conventions', domain);
    table(p, 'Syntax-shape facts (structural, not a chosen convention)', structural);
    table(p, 'Style conventions', lexical);
    if (taut) lines.push(`_${taut} group-defining marker${taut > 1 ? 's' : ''} not listed — a group selected by its decorator/supertype restating it is not news._`, '');
    if ((p.templates || []).length) { lines.push('### Templates (unclustered residue)', '');
      for (const t of p.templates.slice(0, 6)) { const bits = [];
        for (const pi of t.perInstance) bits.push(`one slot per-instance (${pi.distinct}/${pi.total}, e.g. \`${pi.top}\`)`);
        for (const sl of t.slots) bits.push(`slot usually \`${sl.top}\` (${sl.k}/${sl.total})`);
        lines.push(`- \`${t.skel}\` — unclustered ${t.kind}s ×${t.n}, ~${Math.round(t.coverage * 100)}% of an average one${bits.length ? ' · ' + bits.join(' · ') : ''}${t.held ? ` · held since ${t.held.since}${t.held.fresh ? ` · ${t.held.fresh} new in 180d` : ''}` : ''} · ${TEMPLATE_DESCRIPTIVE_NOTE} — e.g. \`${ptr(t.exemplars[0].rel, t.exemplars[0].line, t.exemplars[0].endLine)}\``); }
      lines.push(''); } }
  if (model.moduleGraph && model.moduleGraph.nodes.length > 1) {
    const mg = model.moduleGraph;
    lines.push('## Architecture', '', `${mg.nodes.length} modules · ${mg.edges.length} directed dependencies · ${mg.cycles.length} cycle(s)`, '');
    // the same two coverage disclosures report()'s architecture section carries (§G21, §004) — rendered as their
    // own paragraph(s), not report()'s 2-space indent, to match this document's own Markdown idiom
    const covNote = relCoverageNote(model); if (covNote) lines.push(covNote, '');
    const intraNote = intraModuleNote(model); if (intraNote) lines.push(intraNote, '');
    const out = new Map(); for (const e of mg.edges) (out.get(e.from) || out.set(e.from, []).get(e.from)).push(e);
    for (const [from, es] of [...out].sort((a, b) => b[1].reduce((x, y) => x + y.n, 0) - a[1].reduce((x, y) => x + y.n, 0)).slice(0, 12))
      lines.push(`- \`${from}/\` → ${es.slice(0, 5).map(e => `\`${e.to}/\` (${e.n})`).join(' · ')}${es.length > 5 ? ` · +${es.length - 5} more` : ''}`);
    if (mg.cycles.length) { lines.push('', '**Cycles (strongly connected — every member reaches every other, not necessarily in this order):**', ''); for (const c of mg.cycles.slice(0, 4)) lines.push(`- ${c.join(', ')}`); lines.push('', CYCLE_GRANULARITY_NOTE); }
    const departures = (model.archNorms || []).filter(n => n.exp === 'false' && n.fromKind !== 'group'); // "module pair(s)" below is a claim about modules specifically — group-kind rows have their own home in computeArchHits, not this count
    if (departures.length) lines.push('', `_Established layering: ${departures.length} module pair(s) where reaching the target is the counted exception, not the practice._`);
    lines.push(''); }
  if (model.boundaries && model.boundaries.length) { lines.push('## Boundaries', '', `${model.boundaries.length} architecture decision(s) in \`.grain/seeds.jsonl\``, '');
    for (const bd of model.boundaries) lines.push(`- ${voice('decided', `\`${bd.boundary.from}/\` never imports \`${bd.boundary.to}/\`${bd.note ? ' — ' + bd.note : ''}${!bd.fromLive || !bd.toLive ? ' (a side names no indexed files — inert)' : ''}`, { typ: 'boundary', who: bd.author, when: bd.createdAt, id: bd.id })}`);
    lines.push(''); }
  if (model.steers && model.steers.length) { lines.push('## Maintainer decisions (steers)', '', `${model.steers.length} maintainer decision(s) in \`.grain/seeds.jsonl\``, '');
    for (const st of model.steers) { if (!st.found) { lines.push(`- **${st.id}**: exemplar ${st.path}#${st.name} not found in HEAD — inert (edit or remove it)`); continue; }
      for (const sf of st.surfaces) { if (sf.retires) continue; lines.push(`- ${voice('decided', `${sf.value === null ? `${sf.pid} is not a surface of ${st.name}` : verbalize({ pid: sf.pid, exp: sf.value, kind: st.kind, heritageKind: heritageKindOf(sf.pid, model) }, [st.name]) + ' — ' + practicedBy(sf) + baselineClause(sf)} · weight ${st.weight}${st.note ? ' · ' + st.note : ''}`, { typ: 'steer', who: st.author, when: st.createdAt, id: st.id })}`);
        for (const rp of st.surfaces.filter(x => x.retires)) lines.push(`  - retires: ${verbalize({ pid: rp.pid, exp: 'true', kind: st.kind, heritageKind: heritageKindOf(rp.pid, model) }, [])}`); } }
    lines.push(''); }
  { const health = healthRows(model, outcomes);
    if (health.length) { lines.push('## Health', '', `${health.length} signal${health.length > 1 ? 's' : ''} worth a maintainer decision`, '');
      for (const h of health) lines.push(`- ${voice('practiced', h)}`);
      lines.push(''); } }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines.push('', `*as of ${sha}*`); // frozen snapshot-time fact, deliberately part of the document (unlike the CLI's own ephemeral stamp() line — see cmdRules, grain.mjs)
  // (§024c) same snapshot-time-fact reasoning as the sha/date above: whether the generating worktree was dirty is
  // itself worth persisting alongside them, not just echoed on the CLI. `rules` is a HEAD-reader — `dirty` here is
  // never `+dirty`, only this distinct disclosure (see DIRTY_TREE_NOTE above).
  if (dirty) lines.push('', `*${DIRTY_TREE_NOTE}*`);
  return lines; }
export function statusLines(model) {
  const nf = model.partitions.reduce((a, p) => a + p.facts.length, 0);
  const ng = model.partitions.reduce((a, p) => a + p.medoids.length, 0);
  const covNote = relCoverageNote(model);
  return [`model: ${model.repo} · ${model.partitions.length} partition(s) · ${ng} groups · ${nf} conventions · ${model.files} files${!model.historyStats ? ' — no git history: nothing counts as established, so no convention is spoken (groups and placement still answer `where`)' : ''}`,
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
    ...(model.steers && model.steers.length ? [`steers: ${model.steers.filter(s => s.found).length} active${model.steers.some(s => !s.found) ? `, ${model.steers.filter(s => !s.found).length} inert (exemplar gone)` : ''} — .grain/seeds.jsonl`] : []),
    ...(model.boundaries && model.boundaries.length ? [`boundaries: ${model.boundaries.length} architecture decision(s) — .grain/seeds.jsonl`] : [])]; }
export function completeness(model, changed) {
  const exp = new Set();
  for (const c of model.cochange) for (const f of changed) { if (c.a === f && !changed.includes(c.b)) exp.add(`${c.b} (co-changed ${c.sup}x, conf ${c.conf})`);
    if (c.b === f && !changed.includes(c.a)) exp.add(`${c.a} (co-changed ${c.sup}x, conf ${c.conf})`); }
  return exp.size ? [`[grain] Edits like this historically also touch:`, ...[...exp].slice(0, 5).map(x => '  - ' + x)] : ['(complete)']; }
// the same loop and CFG.cochangeMinConf threshold `completenessDirectional` has always used, factored out so
// `missingLines` and `check-hook` can read the same DATA `completeness <file>` prints — never `cochangePartners`
// above, whose single-file mode leans on a deliberately looser threshold (1/3) that would silently change what
// `review`/`check-hook` consider a real partner
export function cochangeData(model, changed) {
  const hits = new Map();
  // §023: same liveness source and idiom as `cochangePartners`'s own `live` (core.mjs ~2552, added for §020) and
  // `howCmd`'s places[] `exists` flag (~2817) — one house-wide answer to "is this path still here at HEAD", never
  // a second/third liveness check invented per renderer.
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
  for (const c of model.cochange) for (const f of changed) {
    if (c.a === f && !changed.includes(c.b) && c.sup / (c.commitsA || 1) >= CFG.cochangeMinConf) hits.set(c.b, { file: c.b, sup: c.sup, commits: c.commitsA || c.sup, dead: !live.has(c.b) });
    if (c.b === f && !changed.includes(c.a) && c.sup / (c.commitsB || 1) >= CFG.cochangeMinConf) hits.set(c.a, { file: c.a, sup: c.sup, commits: c.commitsB || c.sup, dead: !live.has(c.a) }); }
  return [...hits.values()].sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0); }
// scope-level co-change for `check <file>` (§J5.7b): the same directional-confidence test cochangeData applies to
// file pairs, over model.scopeCochange's SCOPE-key pairs instead — every pair with a scope in the checked file,
// above CFG.cochangeMinConf. `partitionName` is the checked file's own partition (r.partition): a rendered pair may
// name a scope in a different file/partition, but the line is anchored to the file the caller is looking at.
export function scopeCochangeLines(model, rel, partitionName) {
  const rows = [];
  for (const p of model.scopeCochange || []) {
    const ia = p.a.indexOf('#'), ib = p.b.indexOf('#'); if (ia < 0 || ib < 0) continue;
    const aIn = p.a.slice(0, ia) === rel, bIn = p.b.slice(0, ib) === rel;
    if (!aIn && !bIn) continue;
    const commits = aIn ? (p.commitsA || 1) : (p.commitsB || 1); const conf = p.sup / commits;
    if (conf < CFG.cochangeMinConf) continue;
    const aName = p.a.slice(ia + 1).split('#')[1], bName = p.b.slice(ib + 1).split('#')[1];
    rows.push({ aName, bName, sup: p.sup, commits, conf }); }
  rows.sort((x, y) => y.conf - x.conf || (x.aName < y.aName ? -1 : x.aName > y.aName ? 1 : x.bName < y.bName ? -1 : 1));
  const label = partitionName ? scopeLabel(partitionName) : 'this file';
  return rows.slice(0, 5).map(r => voice('practiced', `co-change (scopes): \`${r.aName}\` ↔ \`${r.bName}\` in ${label} (${r.sup}/${r.commits})`)); }
// stable contract: the standalone `completeness <file>` command prints this text verbatim — do not change it
// (§023: except the new `(deleted)` marker on a dead partner, which the ticket's own acceptance requires — the
// live-partner case below is byte-for-byte unchanged, so the frozen contract holds for every fixture that predates it)
export function completenessDirectional(model, changed) { // partner named only from the edited side's own confidence
  const hits = cochangeData(model, changed);
  return hits.length ? [`[grain] Edits like this historically also touch:`, ...hits.slice(0, 5).map(h => `  - ${h.file}${h.dead ? ' (deleted)' : ''} (co-changed in ${h.sup}/${h.commits} commits)`)] : ['(complete — no file historically changes with these)']; }
// the recipe half of `missingLines`: a NEW file's own carried marker (decorator/supertype/return type) or group role
// borrows exactly the "a new carrier/member comes with" mechanism `whereCmd` already reads off markerImplied/
// groupImplied (core.mjs, buildCards' marker/group cases) — same companion/registration fields, no new heuristic
function recipeLines(kindWord, mi, rel, files, helpers) {
  const { stem0, sufChain, suffixOf } = helpers; const lines = [];
  if (mi.companion) { const stem = stem0(rel);
    const present = files.some(f => f !== rel && stem0(f) === stem && sufChain(f) === mi.companion.pattern);
    if (!present) lines.push(voice('practiced', `recipe: a new ${kindWord} carrier here usually comes with a same-stem \`${mi.companion.pattern}\` companion (${pct(mi.companion.share)}% of ${mi.companion.n}) — none in the change`)); }
  if (mi.importedBy) { if (!files.includes(mi.importedBy.file))
    lines.push(voice('practiced', `recipe: a new ${kindWord} carrier here is registered in \`${mi.importedBy.file}\` (imports ${mi.importedBy.n} of ${mi.importedBy.of} carriers) — not touched`)); }
  else if (mi.importedByPattern) { const present = files.some(f => suffixOf(f) === mi.importedByPattern.pattern);
    if (!present) lines.push(voice('practiced', `recipe: a new ${kindWord} carrier here is registered by a \`${mi.importedByPattern.pattern}\` file (${mi.importedByPattern.n} of ${mi.importedByPattern.of} carriers) — not touched`)); }
  return lines; }
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
  for (const e of (vals || [])) {
    const key = e.k + ':' + e.v;
    const N = model.valueNorms[e.c]; if (!N) continue;
    // a value already in the surviving sibling set is judged against the "near" carriers (exactly one member short),
    // never the whole missing population: a file short of several members at once cannot be blamed for THIS one
    const held = (model.valueSiblings[e.c] || []).includes(key);
    const have = new Set((model.valueIndex[key] || []).map(([r]) => r));
    const gaps = (held ? N.near : N.full).filter(f => !have.has(f) && !changedSet.has(f));
    if (gaps.length) out.push({ value: e.v, container: (model.valueContainer || {})[e.c] ?? null, gaps, bits: N.bits, ne: N.ne, neff: N.neff }); }
  return out; }
export function missingLines(model, files, { sources = [], newFileScopes = {}, changedScopes = {} } = {}) {
  const out = [];
  if (sources.includes('cochange')) for (const h of cochangeData(model, files).slice(0, 5))
    out.push(voice('practiced', `co-change: ${h.file}${h.dead ? ' (deleted)' : ''} (co-changed in ${h.sup}/${h.commits} commits)`));
  if (sources.includes('recipe')) {
    const sufChain = rel => { const parts = basename(rel).split('.'); return parts.length >= 2 ? '*.' + parts.slice(1).join('.') : null; };
    const suffixOf = rel => { const parts = basename(rel).split('.'); return parts.length >= 3 ? '*.' + parts.slice(-2).join('.') : null; };
    const helpers = { stem0, sufChain, suffixOf };
    for (const rel of files) { const scopes = newFileScopes[rel]; if (!scopes || !scopes.length) continue;
      const p = partitionFor(model, rel); if (!p) continue;
      const { assign, amb } = assignAll(scopes, p.medoids);
      const seen = new Set();
      scopes.forEach((s, i) => { if (s.kind === 'file' || s.kind === 'module') return;
        const mkKeys = [];
        for (const d of s.decos || []) mkKeys.push('deco:' + d);
        if (s.kind === 'type') for (const e of s.sup || []) mkKeys.push('sup:' + e);
        for (const r of s.rets || []) mkKeys.push('ret:' + r);
        for (const mkKey of mkKeys) { const key = 'm:' + mkKey; if (seen.has(key)) continue; seen.add(key);
          const mi = (p.markerImplied || {})[mkKey]; if (mi) out.push(...recipeLines('marker', mi, rel, files, helpers)); }
        const role = assign.get(i);
        if (role !== undefined && !amb.has(i)) { const key = 'g:' + role; if (!seen.has(key)) { seen.add(key);
          const gi = (p.groupImplied || {})[role]; if (gi) out.push(...recipeLines('group', gi, rel, files, helpers)); } } }); }
  }
  // J3.2's `kin:` source, both halves. `changedScopes` covers EVERY successfully parsed file of the change (the
  // values half must speak about an enum that already exists), where `newFileScopes` above covers only genuinely
  // new ones (the stem half, like `recipe:`, is about a new file's missing counterpart). J4.2's `change shape:`
  // source follows it below.
  if (sources.includes('kin')) {
    const changed = new Set(files);
    for (const rel of files) { const fsc = (changedScopes[rel] || []).find(s => s.kind === 'file'); if (!fsc) continue;
      for (const g of valueKinGaps(model, rel, fsc.vals, changed)) {
        const label = g.container ? ` (added to \`${g.container}\`)` : ''; // a positional string container has no name to print
        out.push(voice('practiced', `kin: \`${g.value}\`${label} — its siblings also appear in: ${g.gaps.join(', ')} — not in your change`)); } }
    const rolesInChange = new Map(); // partition name -> every role the WHOLE changed set occupies, committed members and new files alike
    const rolesFor = p => { let rs = rolesInChange.get(p.name); if (rs) return rs; rs = new Set();
      for (const [k, r] of Object.entries(p.assignments || {})) if (r !== -1 && changed.has(k.split('#')[0])) rs.add(r);
      for (const f of files) { const sc = newFileScopes[f]; if (!sc || !sc.length) continue;
        const a2 = assignAll(sc, p.medoids); a2.assign.forEach((r, i) => { if (!a2.amb.has(i)) rs.add(r); }); }
      rolesInChange.set(p.name, rs); return rs; };
    for (const rel of files) { const scopes = newFileScopes[rel]; if (!scopes || !scopes.length) continue;
      const p = partitionFor(model, rel); if (!p || !p.groupKin) continue;
      const { assign, amb } = assignAll(scopes, p.medoids);
      const mine = new Set(); assign.forEach((r, i) => { if (!amb.has(i)) mine.add(r); });
      const present = rolesFor(p); const said = new Set();
      for (const r of [...mine].sort((a, b) => a - b)) { const kin = p.groupKin[r]; if (!kin || present.has(kin.role) || said.has(kin.role)) continue; said.add(kin.role);
        out.push(voice('practiced', `kin: ${rel} has no «${kin.label}» counterpart (${kin.n} of ${kin.of} members of «${p.medoids[r]?.label || 'group'}» do)`)); } } }
  // J4.2's `change shape:` source: build the change's own cell-set the SAME way learn() built a commit footprint's
  // (§J4.1) — `m:`/`k:` per file plus `g:` per role the change's own scopes occupy (via `partitionFor`+`assignAll`,
  // same read `kin:`'s role half above uses) — then find the archetype it best matches by `jacW` under the exact
  // membership/ambiguity gate `assignAll` itself uses for a scope and a role medoid (`CFG.minMemb`/`CFG.ambGap`):
  // below the floor, or too close to a second archetype, two shapes would fight over one change, so neither claims
  // it. An archetype's IDENTITY for matching is its WHOLE cell bag (shared cells included), but only its CERTIFIED
  // cells are worth reporting as missing — a complete match to a shape is not a gap, so it says nothing at all.
  if (sources.includes('shape') && (model.changeArchetypes || []).length) {
    const refined = model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || []));
    const changeCells = new Set();
    for (const rel of files) {
      changeCells.add('m:' + refined(rel));
      const sf = sufOf(rel); if (sf) changeCells.add('k:' + sf);
      const scopes = changedScopes[rel]; if (!scopes || !scopes.length) continue;
      const p = partitionFor(model, rel); if (!p) continue;
      const { assign, amb } = assignAll(scopes, p.medoids);
      assign.forEach((r, i) => { if (!amb.has(i)) changeCells.add('g:' + p.name + '#' + r); }); }
    let best = null, m1 = -1, m2 = -1;
    for (const a of model.changeArchetypes) { const m = jacW(changeCells, a.cells.map(c => c.cell));
      if (m > m1) { m2 = m1; m1 = m; best = a; } else if (m > m2) m2 = m; }
    if (best && m1 >= CFG.minMemb && m1 - m2 >= CFG.ambGap) {
      const certified = best.cells.filter(c => c.certified);
      const absent = certified.filter(c => !changeCells.has(c.cell));
      if (absent.length) { const touched = certified.length - absent.length;
        out.push(voice('practiced', `change shape: this change touches ${touched} of ${certified.length} certified cells of "${best.label}" — absent: ${absent.map(c => `${archCellLabel(model, c.cell)} (${c.k} of ${best.n})`).join(', ')}`)); } }
  }
  return out.length ? [`missing from your change:`, ...out] : []; }

// ===== MUTATION HARNESS (dev/test only: plants real deviations into conforming exemplars, verifies detection) =====
function mutate(src, f, ex) { const p = f.pid;
  if (p.startsWith('auto.deco:') && f.exp === 'true') { const d = p.slice(10).replace('@', '');
    const re = new RegExp('^\\s*@' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b.*$', 'gm');
    return re.test(src) ? src.replace(re, '') : null; }
  if (p.startsWith('auto.extends:') && f.exp === 'true') { const e = p.slice(13);
    const re = new RegExp('(extends|implements|\\()\\s*' + e.replace(/[$.]/g, '\\$&') + '\\b');
    const lineOff = src.split('\n').slice(0, Math.max(0, (ex.line || 1) - 1)).join('\n').length; // mutate the exemplar's own heritage, not the file's first
    const tail = src.slice(lineOff);
    return re.test(tail) ? src.slice(0, lineOff) + tail.replace(re, '$1 SomethingElse') : (re.test(src) ? src.replace(re, '$1 SomethingElse') : null); }
  if (p.startsWith('auto.imp:') && f.exp === 'false') { const spec = p.slice(9); if (spec.startsWith('~/')) return null;
    // one candidate per import syntax family — re-extraction keeps whichever this file's grammar accepts
    return { candidates: [`import __planted from '${spec}';\n` + src, `import ${spec}\n` + src, `from ${spec} import __planted\n` + src, `#include <${spec}>\n` + src], imp: spec }; }
  if (p === 'auto.nameshape' && ex) { const nn = tokenize(ex.name).join('_'); if (!nn || nn === ex.name) return null; return src.split(ex.name).join(nn); }
  if (p.startsWith('auto.call:') && f.exp === 'false') { const call = p.slice(10); if (/[^\w.$]/.test(call)) return null;
    const lineOff = src.split('\n').slice(0, Math.max(0, (ex.line || 1) - 1)).join('\n').length; // anchor at the exemplar's own line
    const at = src.indexOf(ex.name, lineOff); if (at < 0) return null;
    const cands = []; let brace = src.indexOf('{', at);
    for (let k = 0; k < 10 && brace >= 0; k++) { cands.push(src.slice(0, brace + 1) + `\n  ${call}();` + src.slice(brace + 1)); brace = src.indexOf('{', brace + 1); }
    const lines = src.split('\n');
    for (let li = Math.max(0, (ex.line || 1) - 1); li < Math.min(lines.length, (ex.line || 1) + 5); li++) {
      if (!/:\s*(#.*)?$/.test(lines[li])) continue;
      const indent = (lines[li].match(/^\s*/)[0] || '') + '    ';
      cands.push([...lines.slice(0, li + 1), indent + call + '()', ...lines.slice(li + 1)].join('\n')); }
    return cands.length ? { candidates: cands, call } : null; }
  return null; }
export async function mutateTest({ model, root }) { const res = { detected: 0, missed: 0, silentOK: 0, falseFire: 0, unsupported: 0, cases: [] };
  for (const part of model.partitions) {
    const cands = part.facts.filter(f => /^auto\.(deco|extends|imp|call):|^auto\.nameshape$/.test(f.pid) && f.exemplars.length).slice(0, 16);
    for (const f of cands) { const ex = f.exemplars[0]; let src; try { src = readFileSync(join(root, ex.rel), 'utf8'); } catch { continue; }
      const b0 = await checkFile({ model, root, rel: ex.rel, content: src });
      const before = b0.msgs;
      if (before.some(m => m.pid === f.pid && m.scope === ex.name)) { res.falseFire++; res.cases.push({ FALSEFIRE: f.cid + ' ' + f.pid + '=' + f.exp, file: ex.rel, scope: ex.name }); continue; }
      // the fact must actually GOVERN the exemplar before the mutation (an ambiguous member is outside role governance
      // by the ambGap policy) — planting on an ungoverned scope measures that policy, not detection
      if (f.kind !== 'file' && !b0.governed.some(g0 => g0.pid === f.pid && g0.scope === ex.name)) { res.unsupported++; continue; }
      res.silentOK++;
      let mut = mutate(src, f, ex); if (mut === null) { res.unsupported++; continue; }
      if (mut.candidates) { // injected mutations: keep the candidate where the planted artifact really lands (ground truth = extraction)
        // the grammar is resolved from the file's OWN content once (§040: `.h` names two), never re-decided per
        // mutated candidate — a mutation must not be able to flip the grammar the comparison is made under
        const { p: pp, tree: t00 } = await parseFile(extname(ex.rel), src); t00.delete();
        const bb = bindingFor(pp._g); let picked = null;
        for (const cand of mut.candidates) { const tr2 = pp.parse(cand); const ss = extractScopes(ex.rel, tr2, bb); tr2.delete();
          const ok = mut.call ? ss.find(x => x.name === ex.name && x.calls.has(mut.call)) : ss.find(x => x.kind === 'file' && x.imports.includes(mut.imp));
          if (ok) { picked = cand; break; } }
        if (!picked) { res.unsupported++; continue; } mut = picked; }
      // ground truth by re-extraction, as for injections: a mutation that breaks the parse (a multiline decorator's
      // opening line removed) or fails to flip the surface measures ITSELF, not detection — count it unsupported
      { const { p: pp2, tree: tr0 } = await parseFile(extname(ex.rel), src); const bb2 = bindingFor(pp2._g);
        const ss0 = extractScopes(ex.rel, tr0, bb2); tr0.delete();
        const orig = ss0.find(x => x.name === ex.name);
        const tr3 = pp2.parse(mut); const ss3 = extractScopes(ex.rel, tr3, bb2); tr3.delete();
        const still = ss3.find(x => x.name === ex.name || (f.pid === 'auto.nameshape' && x.name === tokenize(ex.name).join('_')));
        const intact = still && (!orig || still.nt === orig.nt); // error recovery yielding a syntax wreck (nt degraded) measures the mutation, not detection
        const flipped = f.pid.startsWith('auto.deco:') ? intact && !still.decos.includes(f.pid.slice(10).replace('@', ''))
          : f.pid.startsWith('auto.extends:') ? intact && !still.sup.includes(f.pid.slice(13)) : !!intact;
        if (!intact || !flipped) { res.unsupported++; continue; } }
      const after = (await checkFile({ model, root, rel: ex.rel, content: mut })).msgs;
      const hit = after.some(m => m.pid === f.pid && (m.scope === ex.name || (f.pid === 'auto.nameshape' && m.scope === tokenize(ex.name).join('_'))));
      res[hit ? 'detected' : 'missed']++;
      if (!hit) res.cases.push({ fact: f.cid + ' ' + f.pid + '=' + f.exp, file: ex.rel }); } }
  return res; }
