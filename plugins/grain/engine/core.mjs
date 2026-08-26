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
import { GRAMMAR_DIR, EXT2GRAMMAR, CFG, SUP, TOPK, EXCL, MINE_EXCL, NCAP, HARD_EXCL } from './config.mjs';
import { relFactsFor, buildEdges, moduleGraph, moduleOf, compactDecls, hydrateTable, tableFrom, makeEdgeResolver, parseJsonc } from './relations.mjs';

const S = '\u0001';      // cell-key separator (was a literal SOH byte in the prototype)
const UNSEEN = '\u0000'; // "value never observed" sentinel for the smoothed-count lookup (was a literal NUL byte)

export const toPosix = p => sep === '/' ? p : p.split(sep).join('/');
export const CODE_RE = new RegExp('(' + Object.keys(EXT2GRAMMAR).map(e => '\\' + e).join('|') + ')$');

// ===== GENERIC BINDING: derived from the grammar's node-types.json — no per-language code =====
const bindings = {};
export function bindingFor(gname) {
  if (bindings[gname]) return bindings[gname];
  const nt = JSON.parse(readFileSync(join(GRAMMAR_DIR, `tree-sitter-${gname}.node-types.json`), 'utf8'));
  const b = { scope: new Set(), loosebody: new Set(), imp: new Set(), deco: new Set(), nodeTypes: new Set(nt.map(n => n.type)),
    heritageRe: /heritage|extends|implements|superclass|super_interfaces|base_|superclasses|argument_list|interface_clause|delegation_specifier|inheritance_specifier|trait_bounds/ };
  for (const n of nt) {
    const f = n.fields || {};
    // scope = a node with a body and a name — either a `name` field, or a `declarator` field that carries the name
    // (C/C++ function_definition: name lives in declarator → function_declarator → identifier). Still purely field-driven.
    if (f.body && (f.name || f.declarator)) b.scope.add(n.type);
    // grammars that name a node but keep its body as an unnamed child (Kotlin's class_declaration/function_declaration, …):
    // a named declaration/definition node is a scope when, at extraction time, one of its children is a body/block node
    else if (f.name && !f.body && /_(declaration|definition|decl|defn)$/.test(n.type) && /^(class|function|method|object|interface|trait|struct|enum|module|impl|protocol|extension|companion|constructor|fun|func|def|proc|record|namespace|abstract_class|singleton)(_|$)/.test(n.type)) { b.scope.add(n.type); b.loosebody.add(n.type); }
    if (/import|include|use_declaration|require/.test(n.type) && !n.type.startsWith('_')) b.imp.add(n.type);
    if (/decorator|annotation|attribute_list/.test(n.type)) b.deco.add(n.type); }
  b.name = gname; bindings[gname] = b; return b; }
const parsers = {}; let _init = false;
export async function getParser(ext) {
  if (!_init) { await Parser.init(); _init = true; }
  const g = EXT2GRAMMAR[ext];
  if (!g) throw new Error(`no grammar for extension "${ext}"`);
  if (!parsers[g]) { const lang = await Language.load(join(GRAMMAR_DIR, `tree-sitter-${g}.wasm`)); const p = new Parser(); p.setLanguage(lang); parsers[g] = p; p._g = g; }
  return parsers[g]; }
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
export function extractScopes(rel, tree, b, grammar = null) {
  const scopes = []; const imports = [];
  const isScope = n => b.scope.has(n.type);
  const walk = node => { for (const ch of node.namedChildren) {
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
      if (/namespace|package/.test(ch.type)) { walk(ch); continue; } // a namespace/package statement names a location, not a unit of code
      // a property accessor (C# `get`/`set`/`init`) is named by a keyword and belongs to its property — mined as methods, 40 accessors
      // certified "methods here are named a single lowercase word" and flagged every real method of the directory (measured on CleanArchitecture)
      if (/accessor/.test(ch.type)) { walk(ch); continue; }
      const name = scopeName(ch);
      const bodyN = ch.childForFieldName('body') || (b.loosebody.has(ch.type) ? looseBody(ch) : null);
      // a bodiless declaration (C# positional record, Kotlin data class, interface method signature, forward declaration) is
      // a scope for identity surfaces — name, decorations, supertypes, return type — but has no behaviour to mine
      const noBody = !bodyN;
      // kind by syntax category (class/struct/record/enum/interface/trait/object… ⇒ type) rather than by nesting alone: a
      // Python class with only fields and a TS interface are types, a JS function holding callbacks is still a method —
      // the container/leaf rule confused all three in every language of the corpus
      const typeLike = /class|struct|record|enum|interface|trait|protocol|object_declaration|impl_item|type_declaration|companion|singleton|union|contract/.test(ch.type);
      const hasChildScope = bodyN ? bodyN.descendantsOfType([...b.scope]).some(d => !/namespace|package/.test(d.type) && (d.childForFieldName('body') || (b.loosebody.has(d.type) && looseBody(d)))) : false;
      const kind = typeLike || (hasChildScope && !/function|method|lambda|closure|arrow/.test(ch.type)) ? 'type' : 'method';
      const sup = []; const sc = ch.childForFieldName('superclasses'); if (sc) for (const id of sc.descendantsOfType('identifier').concat(sc.descendantsOfType('attribute'))) sup.push(id.text);
      for (const c2 of ch.namedChildren) if (b.heritageRe.test(c2.type) && !(bodyN && c2.id === bodyN.id)) for (const id of c2.descendantsOfType(['identifier', 'type_identifier', 'scoped_type_identifier', 'name', 'qualified_name', 'relative_name'])) sup.push(id.type === 'qualified_name' || id.type === 'relative_name' ? id.text.split('\\').pop() : id.text); // PHP names its identifiers `name`/`qualified_name`; the FQCN's tail is the vocabulary an agent uses
      // decoration attribution: the stack of decoration siblings directly above this scope (any height, comments allowed in
      // between) plus decorations inside the scope's own pre-body subtree (Java/C# modifiers, parameter annotations). Never a
      // preceding member's stack (the walk stops at the first real sibling) and never anything inside the body.
      const decos = []; const decoLits = []; // string-literal ARGUMENTS of the decorations: routes, event names, DI tokens — the marker's meaning
      if (b.deco.size) { // linear: walk back over decoration/comment siblings (the stack), then scan the scope's own pre-body subtree
        const decoTypes = [...b.deco]; const limit = bodyN ? bodyN.startIndex : ch.endIndex;
        // the sigil travels with the name: `[Test]` (C#) and `@Test` (Java/Kotlin) are different tokens and render as written
        const take = d => { const t = d.text.trimStart(); if (/^[@[]/.test(t)) { const m = t.match(/^[@[]\s*([\w.]+)/); if (m) { decos.push(t[0] === '[' ? '[' + m[1] + ']' : m[1]);
        if (decoLits.length < 12) for (const lm of t.matchAll(/["'`]([^"'`\n]{1,60})["'`]/g)) decoLits.push(lm[1]); } } };
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
      // declared result type (field names only: Go `result`, TS/PHP/Rust/Kotlin/Scala `return_type`, Java/C# `type`) — the named
      // identifiers of that type. For typed languages without decorators this is the strongest role signal there is
      // (measured on gin: middlewares are the functions returning `HandlerFunc`, and nothing else names them)
      const rets = []; const retN = ch.childForFieldName('result') || ch.childForFieldName('return_type') || (kind === 'method' ? ch.childForFieldName('type') : null);
      if (retN && !(bodyN && retN.id === bodyN.id)) { // the outer type name only: `Promise<void>` → Promise, `Page<Owner>` → Page, `: boolean` → boolean
        const id = retN.descendantsOfType(['type_identifier', 'predefined_type', 'primitive_type', 'builtin_type', 'scoped_type_identifier', 'qualified_type', 'attribute', 'dotted_name', 'scoped_identifier', 'identifier'])[0]; // pre-order: `t.Any` before `t`
        const tx = (id ? id.text : retN.text).replace(/^[:\s]+/, '').replace(/\s+/g, '');
        if (tx && tx.length <= 40 && /^[\w.$:\[\]]+$/.test(tx)) rets.push(tx); }
      const stmts = bodyN ? bodyN.namedChildren : [];
      let docText = ''; { let sib = ch.previousNamedSibling, hops = 0; while (sib && hops++ < 6 && (b.deco.has(sib.type) || /comment/.test(sib.type))) { if (/comment/.test(sib.type)) { docText = sib.text; break; } sib = sib.previousNamedSibling; }
        if (!docText && stmts.length && stmts[0].type === 'expression_statement' && stmts[0].namedChildCount === 1 && /string/.test(stmts[0].namedChildren[0].type)) docText = stmts[0].namedChildren[0].text; }
      const doc = docTokens(docText);
      if (decoLits.length) for (const t of docTokens(decoLits.slice(0, 12).join(' '))) if (!doc.includes(t)) doc.push(t);
      if (noBody) { scopes.push({ kind, name, rel, line: ch.startPosition.row + 1, endLine: ch.endPosition.row + 1, g: grammar, nt: ch.type, noBody: true, sup: [...new Set(sup)], decos: [...new Set(decos)], rets, calls: new Set(), seen: new Set(), shapes: new Set(), preds: Object.assign({}, name !== '<anon>' ? { 'auto.nameshape': nameShape(name) } : {}), sk: skelOf(ch, isScope) }); walk(ch); continue; }
      const seen = new Set(); const calls = new Set(); const varNames = []; const stack = [...stmts]; let g = 0;
      while (stack.length && g++ < 4000) { const n = stack.pop(); seen.add(n.type);
        if (/call/.test(n.type) && n.childForFieldName('function')) { const fn = n.childForFieldName('function'); if (fn.text.length <= 40 && !fn.text.includes('\n')) calls.add(fn.text); }
        if (n.type === 'variable_declarator' || (n.type === 'assignment' && n.childForFieldName('left')?.type === 'identifier')) { const nm = (n.childForFieldName('name') || n.childForFieldName('left'))?.text; if (nm) varNames.push(nm); }
        if (!isScope(n)) for (const c of n.namedChildren) stack.push(c); }
      const shapes = new Set(); const ser = (n, d) => d <= 0 ? n.type : n.type + '(' + n.namedChildren.slice(0, 3).map(c => ser(c, d - 1)).join(',') + ')';
      if (kind === 'method') for (const st of stmts.slice(0, 20)) shapes.add(ser(st, 2));
      const retStmts = stmts.filter(s => /return/.test(s.type));
      const preds = {}; if (name !== '<anon>') preds['auto.nameshape'] = nameShape(name); // a placeholder has no name shape (domain: named scopes)
      // placement is a property of every scope, not only of its file: the group cell (r<i>:type auto.dir2 = handlers) is what
      // makes "handlers live under src/handlers/" a checkable fact — measured: no dir fact ever fired in any corpus, because
      // dir preds sat on file scopes and file scopes have no groups
      dirname(rel).split('/').filter(sg => sg !== '.').slice(0, 3).forEach((sg, k) => preds['auto.dir' + (k + 1)] = sg);
      if (kind === 'method') { preds['auto.arity'] = nP >= 3 ? '3+' : String(nP);
        if (stmts.length >= 1) preds['auto.first1'] = stmts[0].type;
        if (retStmts.length) preds['auto.ret'] = retStmts[retStmts.length - 1].namedChildren[0]?.type || 'bare';
        if (varNames.length >= 2) { const c = {}; for (const v of varNames.slice(0, 20)) { const sh = nameShape(v); c[sh] = (c[sh] || 0) + 1; } preds['auto.varshape'] = Object.entries(c).sort((a, x) => x[1] - a[1])[0][0]; } }
      scopes.push({ kind, name, rel, line: ch.startPosition.row + 1, endLine: ch.endPosition.row + 1, g: grammar, nt: ch.type, sup: [...new Set(sup)], decos: [...new Set(decos)], rets, ptypes, calls, seen, shapes, preds, doc, sk: skelOf(ch, isScope) });
      // catch/finally micro-scopes: "catch blocks here call `logger.error`" is a convention no per-method surface carries
      // (a method's call bag cannot say WHERE the logging sits); the block is its own population, named after its owner
      if (bodyN) for (const blk of bodyN.descendantsOfType(['catch_clause', 'except_clause', 'rescue', 'finally_clause', 'ensure', 'defer_statement'])) {
        const bkind = /finally|ensure/.test(blk.type) ? 'finally' : 'catch';
        scopes.push(blockScope(blk, bkind, name === '<anon>' ? kind : name, rel, grammar, isScope)); }
      walk(bodyN || ch);
    } else {
      // a function on the right of an assignment is named by its left side: `const foo = () => {}`, `obj.prop = function () {}`
      // (only when the function itself is nameless — a named function expression is already a scope of its own)
      {
        const inner = ch.childForFieldName('value') || ch.childForFieldName('right');
        if (inner && /function|arrow|lambda|func_literal|closure/.test(inner.type) && !(inner.childForFieldName('name')?.text)) {
          const leftN = ch.childForFieldName('name') || ch.childForFieldName('left');
          const nm = leftN ? leftN.text.split('.').pop().trim() : '';
          if (nm && nm.length <= 40 && /^[A-Za-z_$][\w$]*$/.test(nm)) {
            const sc2 = blockScope(inner.childForFieldName('body') || inner, 'method', nm, rel, grammar, isScope, ch.startPosition.row + 1, ch.endPosition.row + 1);
            sc2.nt = inner.type; sc2.preds['auto.nameshape'] = nameShape(nm);
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
      walk(ch); } } };
  walk(tree.rootNode);
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
  const fPreds = { 'auto.filenameshape': nameShape(basename(rel, extname(rel))), ...lexicalPreds(tree), ...exportShape(tree) };
  let macroDoc = []; let macroDefs = [];
  if (b.nodeTypes.has('macro_invocation')) { const ids = [];
    for (const m of tree.rootNode.descendantsOfType('macro_invocation').slice(0, 60)) for (const id of m.descendantsOfType(['identifier', 'type_identifier']).slice(0, 12)) { if (ids.length < 60) ids.push(id.text); }
    if (ids.length) { macroDoc = docTokens([...new Set(ids)].join(' '));
      macroDefs = [...new Set(ids.filter(x => tokenize(x).length >= 2))].slice(0, 12); } } // multi-token names are the DEFINITIONS a macro emits (FailedToBufferBody) — they pin the defining file
  dirname(rel).split('/').filter(s => s !== '.').slice(0, 3).forEach((s, k) => fPreds['auto.dir' + (k + 1)] = s);
  scopes.push({ kind: 'file', name: basename(rel), rel, line: 1, g: grammar, sup: macroDefs, decos: [], rets: [], calls: new Set(), seen: new Set(), shapes: new Set(), preds: fPreds, doc: macroDoc });
  const occ = new Map(); // ordinal disambiguates same-named scopes of a kind within one file (overloads, repeated nested classes)
  for (const s of scopes) { const k = s.kind + S + s.name; const n = occ.get(k) || 0; s.ord = n; occ.set(k, n + 1); }
  for (const s of scopes) { s.imports = imports;
    // parameter types are a FACT surface, not a clustering feature: every handler takes its own `XCommand`, and putting
    // `pt:` into the bags split same-role scopes apart (measured on the fixture: the deviant fell out of its group)
    s.feats = [...new Set([...tokenize(s.name).map(t => 'tok:' + t), ...s.sup.map(x => 'sup:' + x), ...s.decos.map(d => 'dec:' + d), ...(s.rets || []).map(x => 'ret:' + x),
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
  const holes = []; tpl = skNumber(tpl, holes);
  const shared = skCount(tpl); if (shared < 6) return null; // a template that is mostly holes says nothing
  const avg = skels.reduce((a, k) => a + skCount(k), 0) / skels.length;
  const stats = holes.map(() => new Map());
  for (const sk of skels) skMatch(tpl, sk, stats);
  const slots = stats.map((c, i) => { const total = [...c.values()].reduce((a, b) => a + b, 0); if (!total) return null;
    const top = [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
    return { id: i, kind: holes[i][0], total, distinct: c.size, top: top.map(([l, k2]) => [skLeaf(l) && l.startsWith('id:') ? l.slice(3) : l, k2]) }; }).filter(Boolean);
  const perInst = slots.filter(sl => sl.kind === '?' && sl.distinct >= Math.max(3, sl.total * 0.8));
  const skewed = slots.filter(sl => sl.kind === '?' && sl.distinct >= 2 && sl.top[0][1] / sl.total >= 0.6 && sl.distinct < sl.total * 0.8);
  return { n: skels.length, shared, coverage: +(Math.min(1, shared / Math.max(1, avg))).toFixed(2), skel: skRender(tpl),
    perInstance: perInst.slice(0, 3).map(sl => ({ top: sl.top[0][0], distinct: sl.distinct, total: sl.total })),
    slots: skewed.slice(0, 3).map(sl => ({ top: sl.top[0][0], k: sl.top[0][1], total: sl.total })) }; }

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
    out.push({ kind: key.split('\u0001')[0], ...pf, exemplars: sorted.slice(0, 3).map(s => ({ rel: s.rel, line: s.line, name: s.name })), _members: sorted });
    if (out.length >= 12) break; }
  return out; }

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
export function lexicalPreds(tree) {
  const root = tree.rootNode; const text = root.text || ''; const out = {};
  out['auto.lex:bom'] = text.charCodeAt(0) === 0xFEFF ? 'bom' : 'none';
  // indentation unit: tabs, or the most common positive leading-space width among indented lines
  let tabs = 0, sp = 0; const widths = Object.create(null); const lines = text.split('\n'); const N = Math.min(lines.length, 4000);
  for (let i = 0; i < N; i++) { const l = lines[i]; if (!l || l[0] !== ' ' && l[0] !== '\t') continue; if (l[0] === '\t') { tabs++; continue; } const m = l.match(/^ +/)[0].length; if (l.trim()) { sp++; widths[m] = (widths[m] || 0) + 1; } }
  if (tabs + sp >= 5) { if (tabs > sp * 3) out['auto.lex:indent'] = 'tab'; else if (sp > tabs * 3) { const u = Object.entries(widths).map(([w, c]) => [+w, c]).filter(([w]) => [2, 3, 4, 8].includes(w)).sort((a, b) => a[0] - b[0]); let unit = 0; for (const [w, c] of u) if (c >= sp * 0.08) { unit = w; break; } out['auto.lex:indent'] = unit ? 'space' + unit : 'other'; } else out['auto.lex:indent'] = 'mixed'; } // the unit is the smallest width that recurs (most lines sit deeper than one level)
  // quote style of string literals (delimiter of each string node; prefixes like f"…" / r'…' skipped; backticks ignored)
  let sq = 0, dq = 0; const STR = ['string', 'string_literal', 'interpreted_string_literal', 'encapsed_string', 'raw_string'];
  for (const n of root.descendantsOfType(STR).slice(0, 2000)) { const t = n.text.replace(/^[A-Za-z@$]+/, ''); if (t[0] === "'") sq++; else if (t[0] === '"') dq++; }
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
  return out; }
// scope key → line, from the partition's fileScopes (line order ⇒ the k-th same-named scope of a kind is ordinal k)
const scopeLineIdx = new WeakMap();
export function scopeLine(part, key) { let m = scopeLineIdx.get(part);
  if (!m) { m = new Map(); for (const [rel, list] of Object.entries(part.fileScopes || {})) { const occ = new Map(); for (const [kind, name, line] of list) { const k = rel + '#' + kind + '#' + name; const o = occ.get(k) || 0; occ.set(k, o + 1); m.set(k + (o ? '#' + o : ''), line); } } scopeLineIdx.set(part, m); }
  return m.get(key) ?? null; }
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
export const BODY_KINDS = new Set(['method', 'catch', 'finally', 'case']); // kinds whose bodies carry behaviour surfaces
export const jac = (A0, B0) => { const A = A0 instanceof Set ? A0 : new Set(A0), B = B0 instanceof Set ? B0 : new Set(B0);
  let i = 0; const [s, l] = A.size < B.size ? [A, B] : [B, A]; for (const x of s) if (l.has(x)) i++; const u = A.size + B.size - i; return u ? i / u : 0; };
// weighted Jaccard over role feature bags: a decorator, a supertype or a declared return type is a MARKER of what a scope is
// (3×); a name token is a hint (1×). Measured on the fixture: unweighted bags split `CreateXHandler`/`CancelXHandler` into
// four verb-groups that the clone-aware runner-up could not reunite, and a deviant handler fell between them as ambiguous.
const featW = f => (f.startsWith('dec:') || f.startsWith('sup:') || f.startsWith('ret:')) ? 3 : 1;
export const jacW = (A0, B0) => { const A = A0 instanceof Set ? A0 : new Set(A0), B = B0 instanceof Set ? B0 : new Set(B0);
  let i = 0, u = 0; for (const x of A) { const w = featW(x); u += w; if (B.has(x)) i += w; } for (const x of B) if (!A.has(x)) u += featW(x); return u ? i / u : 0; };
// hasOwnProperty: model JSON counts are plain objects — a value literally named "constructor" must read 0, not Object.prototype.constructor
export const kt = (c, K, x, n) => (((Object.prototype.hasOwnProperty.call(c, x) ? c[x] : 0) || 0) + 0.5) / (n + K / 2);

// ===== ROLES =====
export function induceRoles(ps) {
  const el = []; ps.forEach((s, i) => { if (s.kind !== 'file' && s.kind !== 'module' && s.ownCount >= 2) el.push(i); });
  // pre-bucket identical feature bags before sampling: identical twins can never be split by the sample cap,
  // and effective clustering capacity rises from NCAP scopes to NCAP *distinct bags*
  const buckets = new Map(); for (const g of el) { const sig = [...ps[g].feats].sort().join(S); (buckets.get(sig) || buckets.set(sig, []).get(sig)).push(g); }
  let reps = [...buckets.values()];
  if (reps.length > NCAP) { const st = reps.length / NCAP; const rs = []; for (let k = 0; k < NCAP; k++) rs.push(reps[Math.floor(k * st)]); reps = rs; }
  const N = reps.length; const W = reps.map(r => r.length);
  if (W.reduce((a, b) => a + b, 0) < 12) return { assign: new Map(), amb: new Set(), medoids: [] };
  const SA = reps.map(r => ps[r[0]]); const D = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const d = 1 - jacW(SA[i].feats, SA[j].feats); D[i * N + j] = D[j * N + i] = d; }
  const act = new Set(Array.from({ length: N }, (_, i) => i)); const mem = Array.from({ length: N }, (_, i) => [i]); const size = new Float64Array(N); for (let i = 0; i < N; i++) size[i] = W[i];
  const cdl = m => { const nc = m.reduce((a, x) => a + W[x], 0); const cnt = new Map(); for (const x of m) for (const f of SA[x].feats) cnt.set(f, (cnt.get(f) || 0) + W[x]);
    let dl = 0; for (const [, c] of cnt) { const p = c / nc; const h = p >= 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)); dl += nc * h + 0.5 * Math.log2(Math.max(nc, 2)); } return dl; };
  const dls = mem.map(cdl); let sum = dls.reduce((a, b) => a + b, 0);
  let bestDL = sum + act.size * Math.log2(N), best = [...act].map(i => [...mem[i]]);
  while (act.size > 1) { let bi = -1, bj = -1, bd = Infinity; const A = [...act];
    for (let x = 0; x < A.length; x++) for (let y = x + 1; y < A.length; y++) { const d = D[A[x] * N + A[y]]; if (d < bd) { bd = d; bi = A[x]; bj = A[y]; } }
    for (const k of act) { if (k === bi || k === bj) continue; D[bi * N + k] = D[k * N + bi] = (size[bi] * D[bi * N + k] + size[bj] * D[bj * N + k]) / (size[bi] + size[bj]); }
    mem[bi] = mem[bi].concat(mem[bj]); size[bi] += size[bj]; act.delete(bj);
    sum -= dls[bi] + dls[bj]; dls[bi] = cdl(mem[bi]); sum += dls[bi];
    const t = sum + act.size * Math.log2(N); if (t < bestDL) { bestDL = t; best = [...act].map(i => [...mem[i]]); } }
  const D0 = (i, j) => i === j ? 0 : 1 - jacW(SA[i].feats, SA[j].feats);
  const medoids = best.filter(m => m.reduce((a, x) => a + W[x], 0) >= 3).map(m => { let b = m[0], bs = Infinity;
    for (const i of m) { let s2 = 0; for (const j of m) s2 += W[j] * D0(i, j); if (s2 < bs) { bs = s2; b = i; } }
    // label (display only): the three name/decorator/supertype features most shared across the cluster, not the medoid's
    // first three — a medoid named `AddressGuard` would otherwise label the whole guard role "address+guard+CanActivate"
    const fc = new Map(); for (const i of m) for (const f of SA[i].feats) if (/^(tok|dec|sup):/.test(f)) fc.set(f, (fc.get(f) || 0) + W[i]);
    const wTot = m.reduce((a, x) => a + W[x], 0); // the label may only name what a MAJORITY carries — 3 of 9 members' @UseGuards must not baptize the group
    const label = [...fc].filter(([, w2]) => w2 >= wTot / 2).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 3).map(([f]) => f.slice(4)).join('+') || 'group';
    return { feats: SA[b].feats, label }; });
  const { assign, amb } = assignAll(ps, medoids);
  return { assign, amb, medoids }; }
export function assignAll(ps, medoids) { const assign = new Map(), amb = new Set();
  ps.forEach((s, i) => { if (s.kind === 'file' || s.kind === 'module' || s.ownCount < 2 || !medoids.length) return;
    let b = -1, m1 = -1;
    medoids.forEach((md, k) => { const m = jacW(s.feats, md.feats); if (m > m1) { m1 = m; b = k; } });
    if (b < 0 || m1 <= 0) return;
    // the gap runner-up must be a genuinely DIFFERENT role: a near-clone of the best medoid
    // (two clusters of the same latent role surviving the cut) must not manufacture ambiguity
    let m2 = -1; medoids.forEach((md, k) => { if (k === b || jacW(medoids[b].feats, md.feats) >= 0.6) return; const m = jacW(s.feats, md.feats); if (m > m2) m2 = m; });
    if (m1 < CFG.minMemb || m1 - m2 < CFG.ambGap) amb.add(i);
    assign.set(i, b); });
  return { assign, amb }; }

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
      const r = ri.assign.get(i); if (r !== undefined) add('r' + r + ':' + s.kind, pid, v, w * (ri.amb.has(i) ? 0.5 : 1), 1, i, surv);
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
  const STRUCT = /^auto\.(has|stshape|varshape|first1|ret|arity)/;
  out = out.filter(f => !STRUCT.test(f.pid) || (!f.cid.startsWith('_all') && f.parentExp !== null && f.parentExp !== f.exp));
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
  return f.deviants.map(({ gi, v }) => { const known = f.alphabet.includes(v); const d = Math.log2(kt(gc, K, f.exp, neff) / kt(gc, K, known ? v : UNSEEN, neff)); return { rel: ps[gi].rel, line: ps[gi].line, name: ps[gi].name, obs: v, gap: +d.toFixed(2) }; })
    .sort((a, b) => b.gap - a.gap || (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line)).slice(0, max); }
// when the rule was born, when it was last reinforced, how often the history repaired toward it or departed from it
export function heldSummary(f, ps, H) {
  let since = Infinity, last = 0, lastDev = 0, repairs = 0, departures = 0;
  for (const gi of f.conform) { const L = H.lc.get(skeyR(ps[gi].rel, ps[gi])); if (!L) continue; since = Math.min(since, L.first); last = Math.max(last, L.last); }
  for (const { gi } of f.deviants) { const L = H.lc.get(skeyR(ps[gi].rel, ps[gi])); if (L) lastDev = Math.max(lastDev, L.last); }
  for (const gi of f.conform.concat(f.deviants.map(d => d.gi))) { const evs = H.vev.get(skeyR(ps[gi].rel, ps[gi])); if (!evs) continue; let prev;
    for (const e of evs) { const v = valOf(f.pid, e.val); if (v === undefined) continue; if (prev !== undefined && prev !== v) { if (v === f.exp) repairs++; else if (prev === f.exp) departures++; } prev = v; } }
  const ym = ts => ts && ts !== Infinity ? new Date(ts * 1000).toISOString().slice(0, 7) : null;
  return { since: ym(since), lastReinforced: ym(last), lastDeviation: ym(lastDev), repairs, departures }; }
// one clause of calibration for a spoken convention: how it moved, and since when it has held
export function factNotes(f) { const out = [];
  if (f.contested) out.push(`superseded by maintainer decision ${f.contested} — see the steer line / \`grain report\``);

  if (f.trend && f.trend.shares && f.trend.shares.length >= 2) { const a = Math.round(f.trend.shares[0].share * 100), b = Math.round(f.trend.shares[f.trend.shares.length - 1].share * 100); if (Math.abs(a - b) >= 10) out.push(`trend ${a}>${b}%`); }
  if (f.suppressedValue && !f.contested) out.push(`a newer pattern is emerging: ${f.suppressedValue}`); // when contested, the superseded note already says it
  if (f.held && f.held.since) out.push(`held since ${f.held.since}${f.held.lastReinforced && f.held.lastReinforced !== f.held.since ? `, last reinforced ${f.held.lastReinforced}` : ''}${f.held.repairs ? `, ${f.held.repairs} repair${f.held.repairs > 1 ? 's' : ''} toward it` : ''}${f.held.departures ? `, ${f.held.departures} departure${f.held.departures > 1 ? 's' : ''}` : ''}`);
  return out.length ? ' · ' + out.join(' · ') : ''; }
export const deviantLine = (f, max = 2) => (f.deviants && f.deviants.length) ? `  not to copy: ${f.deviants.slice(0, max).map(d => `${d.rel}:${d.line} \`${d.name}\` (${deviationPhrase(f, d.obs)})`).join(' · ')}${f.deviantsN > max ? ` · +${f.deviantsN - max} more` : ''}` : null;
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
  if (p.startsWith('auto.has:')) return `${unit} here ${neg ? 'never contain' : 'always contain'} a \`${p.slice(9)}\``;
  if (p.startsWith('auto.call:')) return `${unit} here ${neg ? 'never call' : 'call'} \`${p.slice(10)}\``;
  if (p.startsWith('auto.deco:')) return `${unit} here ${neg ? 'are not annotated with' : 'are annotated with'} \`${p.slice(10)}\``;
  if (p.startsWith('auto.imp:')) return `${unit} here ${neg ? 'do not import' : 'import'} \`${p.slice(9)}\``;
  if (p.startsWith('auto.extends:')) return `${unit} here ${neg ? 'do not extend' : 'extend'} \`${p.slice(13)}\``;
  if (p.startsWith('auto.returns:')) return `${unit} here ${neg ? 'do not declare a return type of' : 'declare a return type of'} \`${p.slice(13)}\``;
  if (p.startsWith('auto.ptype:')) return `${unit} here ${neg ? 'take no parameter of type' : 'take a parameter of type'} \`${p.slice(11)}\``;
  if (p.startsWith('auto.stshape:')) return `${unit} here ${neg ? 'never use' : 'use'} the structure \`${shapeShort(p.slice(13))}\``;
  if (p === 'auto.nameshape' || p === 'auto.filenameshape') { const w = shapeWords(f.exp); return `${unit} here are named ${w ? w + ' ' : 'like '}(${[...new Set(exNames)].slice(0, 3).map(n => '`' + n + '`').join(', ')})`; }
  if (p === 'auto.first1') return `${unit} here start with a \`${f.exp}\``;
  if (p === 'auto.ret') return `${unit} here return a \`${f.exp}\``;
  if (p === 'auto.arity') return `${unit} here take ${f.exp} parameter(s)`;
  if (p === 'auto.varshape') return `${unit} here name local variables like \`${f.exp}\``;
  if (p.startsWith('auto.dir')) return `${unit} here live under \`${f.exp}/\``;
  if (p === 'auto.modexport') return `${unit} here export via \`${f.exp}\``;
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
  return `have ${surface} = \`${v}\``; }
export function deviationPhrase(f, obs) {
  const p = f.pid; const neg = f.exp === 'false';
  if (p.startsWith('auto.lex:')) { const w = lexWords(p.slice(9), obs); return w.replace(/^(quote|end|indent|start|declare|have)\b/, m => ({ quote: 'quotes', end: 'ends', indent: 'indents', start: 'starts', declare: 'declares', have: 'has' })[m]); }
  if (p.startsWith('auto.has:')) return neg ? `contains a \`${p.slice(9)}\`` : `does not contain a \`${p.slice(9)}\``;
  if (p.startsWith('auto.call:')) return neg ? `calls \`${p.slice(10)}\`` : `does not call \`${p.slice(10)}\``;
  if (p.startsWith('auto.deco:')) return neg ? `is annotated with \`${p.slice(10)}\`` : `is not annotated with \`${p.slice(10)}\``;
  if (p.startsWith('auto.imp:')) return neg ? `imports \`${p.slice(9)}\`` : `does not import \`${p.slice(9)}\``;
  if (p.startsWith('auto.extends:')) return neg ? `extends \`${p.slice(13)}\`` : `does not extend \`${p.slice(13)}\``;
  if (p.startsWith('auto.returns:')) return neg ? `declares a return type of \`${p.slice(13)}\`` : `does not declare a return type of \`${p.slice(13)}\``;
  if (p.startsWith('auto.ptype:')) return neg ? `takes a parameter of type \`${p.slice(11)}\`` : `takes no parameter of type \`${p.slice(11)}\``;
  if (p.startsWith('auto.stshape:')) return neg ? `uses that structure` : `does not use that structure`;
  if (p === 'auto.nameshape' || p === 'auto.filenameshape') { const w = shapeWords(obs); return w ? `is ${w}` : `is shaped \`${obs}\``; }
  if (p.startsWith('auto.dir')) return `lives under \`${obs}/\``;
  return `is \`${obs}\``; }

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
export async function extractTree(root, files, onProgress, readSource = null, cached = null, relOut = null) {
  const all = []; let i = 0, reused = 0;
  for (const rel of files) {
    const hit = cached ? cached(rel) : null; // extraction cache keyed by (blob sha, path): an unchanged file is never re-parsed
    if (hit) { const hs = Array.isArray(hit) ? hit : hit.s; all.push(...hs.map(hydrateScope)); if (relOut && !Array.isArray(hit)) relOut[rel] = hit.r ?? null; reused++; continue; }
    let src; try { src = readSource ? readSource(rel) : readFileSync(join(root, rel), 'utf8'); } catch { continue; }
    if (src == null || src.length > 1.5e6) continue;
    try { const p = await getParser(extname(rel)); const b = bindingFor(p._g); const tr = p.parse(src); all.push(...extractScopes(rel, tr, b, p._g));
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
export async function learn({ root, H, seeds = [], boundaries = [], log = () => {}, tree = null, treeCache = null }) {
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
  const model = { engine: 'grain', repo: basename(root), pkgs, cuts, generatedAt: 0, partitions: [] };
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
  for (const pr of prepared) { pr.vocab.LEX = pkgLex.get(pkgOf(pr.pname)) || {}; for (const s of pr.ps) applyVocab(s, pr.vocab); pr.ri = induceRoles(pr.ps); Crepo += countCandidates(pr.ps, pr.ri); }
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
      if ((H.NOW - L.first) / 86400 <= 120) { agentShareDen += baseW(s); if (L.agentLast) agentShareNum += baseW(s); } }
    const lifts = roleLift(ps, ri, facts);
    const assignments = {}; [...ri.assign].sort((a, b) => a[0] - b[0]).forEach(([i, r]) => { const s = ps[i]; assignments[skeyR(s.rel, s)] = ri.amb.has(i) ? -1 : r; });
    const exportFacts = facts.sort((a, b) => b.bpi - a.bpi || (a.cid < b.cid ? -1 : a.cid > b.cid ? 1 : a.pid < b.pid ? -1 : 1)).map(f => {
      const unamb = f.conform.filter(gi => !ri.amb.has(gi)); const exs = (unamb.length ? unamb : f.conform).slice(0, 3);
      const trend = H ? trendsFor(f, ps, H) : null;
      const calib = H ? calibrate(f, ps, H) : { available: false, reason: 'no history' };
      return { cid: f.cid, kind: f.kind, pid: f.pid, exp: f.exp, parentExp: f.parentExp, counts: f.counts, srawCounts: f.srawCounts, alphabet: f.alphabet,
        raw: f.raw, sraw: f.sraw, share: +f.srawShare.toFixed(3), bpi: +f.bpi.toFixed(2), tau: calib.available ? calib.tauC : f.tau,
        nSurfaces: f.nSurfaces, siblings: f.siblings,
        trend: trend && trend.shares.length ? trend : undefined, calib,
        suppressedValue: f.contested ? f.contested.v : (trend ? trend.nucleating : null), denyEligible: !!(calib.available && calib.denyEligible),
        seeded: f.seeded && f.seeded.length ? f.seeded : undefined, contested: f.contested ? f.contested.id : undefined,
        exemplars: exs.map(gi => ({ rel: ps[gi].rel, line: ps[gi].line, name: ps[gi].name })), deviantsN: Math.max(0, Math.round(f.sraw * (1 - f.srawShare))), // same population as the printed share — raw-only young deviants still ride in `deviants` for check

        deviants: topDeviants(f, ps), held: H ? heldSummary(f, ps, H) : null,
        C }; });
    const pl = pkgLexFacts.get(pkgOf(pname));
    if (pl) for (const f of pl.facts) { if (exportFacts.some(g => g.cid === f.cid && g.pid === f.pid)) continue;
      const own = new Set(ps.filter(s => s.kind === 'file').map(s => s.rel)); // exemplars from this partition first — a lib file is shown lib files, not tests
      const exs = [...f.conform].sort((a, b) => (own.has(pl.ps[b].rel) ? 1 : 0) - (own.has(pl.ps[a].rel) ? 1 : 0) || a - b).slice(0, 3);
      exportFacts.push({ cid: f.cid, kind: f.kind, pid: f.pid, exp: f.exp, parentExp: f.parentExp, counts: f.counts, srawCounts: f.srawCounts, alphabet: f.alphabet, raw: f.raw, sraw: f.sraw, share: +f.srawShare.toFixed(3), bpi: +f.bpi.toFixed(2), tau: f.tau,
        nSurfaces: f.nSurfaces, siblings: f.siblings, trend: undefined, calib: { available: false, reason: 'lexical' }, suppressedValue: null, denyEligible: false,
        exemplars: exs.map(gi => ({ rel: pl.ps[gi].rel, line: pl.ps[gi].line, name: pl.ps[gi].name })), deviantsN: Math.max(0, Math.round(f.sraw * (1 - f.srawShare))), deviants: topDeviants(f, pl.ps), held: H ? heldSummary(f, pl.ps, H) : null, pkgWide: true, C }); }
    // markers: every decorator / supertype / declared return type with ≥ 3 carriers → where it lives and who carries it
    const markers = {}; for (const s of ps) { if (s.kind === 'file' || s.kind === 'module') continue;
      for (const [pre, xs] of [['deco', s.decos], ['sup', s.kind === 'type' ? s.sup : []], ['ret', s.rets || []]]) for (const x of xs) (markers[pre + ':' + x] ||= []).push(skeyR(s.rel, s)); }
    const scopesInFile = new Map(); for (const s of ps) { if (s.kind === 'file' || s.kind === 'module') continue; scopesInFile.set(s.rel, (scopesInFile.get(s.rel) || 0) + 1); }
    for (const k of Object.keys(markers)) { if (markers[k].length < 3) { delete markers[k]; continue; }
      const dc = new Map(); for (const key of markers[k]) { const d = dirname(key.split('#')[0]); dc.set(d, (dc.get(d) || 0) + 1); }
      // dominant directory first; within it the most FOCUSED file (fewest scopes) — a 16 KB god-file is a worse thing to copy
      markers[k] = markers[k].sort((a, b) => dc.get(dirname(b.split('#')[0])) - dc.get(dirname(a.split('#')[0])) || (scopesInFile.get(a.split('#')[0]) || 0) - (scopesInFile.get(b.split('#')[0]) || 0) || (a < b ? -1 : a > b ? 1 : 0)).slice(0, 60); }
    // superposition per role: the cluster IS the candidate generator; anti-unification folds it into one template
    const ym2 = ts => new Date(ts * 1000).toISOString().slice(0, 7);
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
    const fileScopes = {}; for (const s of ps) { if (s.kind === 'file' || s.kind === 'module') continue; (fileScopes[s.rel] ||= []).push([s.kind, s.name, s.line]); }
    const fileDocs = {}; for (const s of ps) { if (!s.doc || !s.doc.length) continue; const d = (fileDocs[s.rel] ||= new Set()); for (const t of s.doc) if (d.size < 80) d.add(t); }
    const fileSups = {}; for (const s of ps) { if (s.kind === 'module' || !s.sup.length) continue; const d = (fileSups[s.rel] ||= new Set()); for (const x of s.sup) if (d.size < 12) d.add(x); } // file-kind sups are macro-emitted definitions; markers still skip files
    for (const rel of Object.keys(fileSups)) fileSups[rel] = [...fileSups[rel]].sort();
    for (const rel of Object.keys(fileDocs)) fileDocs[rel] = [...fileDocs[rel]].sort();
    for (const rel of Object.keys(fileScopes)) fileScopes[rel] = fileScopes[rel].sort((a, b) => a[2] - b[2]).slice(0, 200);
    model.partitions.push({ name: pname, scopes: ps.length, files: [...new Set(ps.filter(s => s.kind === 'file').map(s => s.rel))].sort(), fileScopes, fileDocs, fileSups, vocab, assignments, roleLift: lifts, markers, markerObs, markerImplied,
      medoids: ri.medoids.map(m => ({ feats: m.feats, label: m.label })), profiles, templates, facts: exportFacts }); }
  // steers: every seed, resolved against the current tree — the exemplar's line, each seeded surface with its value and the
  // measured share of that value in the exemplar's partition today (decided vs practiced, side by side)
  model.steers = (seeds || []).map(sd => { let found = null, pname = null;
    for (const pr of prepared) { const s = pr.ps.find(x => x.rel === sd.path && x.name === sd.name); if (s) { found = s; pname = pr.pname; break; } }
    // practiced-by is measured in the exemplar's most specific context that has a population: its group, else its deepest
    // directory holding ≥ dirMin scopes of its kind, else the partition — the same locality `check` would judge it by
    const surfaces = sd.pids.map(pid => { if (!found || found.preds[pid] === undefined) return { pid, value: null, share: null, n: 0, context: null };
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
      return { pid, value: v, retires: (sd.retired || []).includes(pid), rivals, share: null, n: 0, context: null }; });
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
    const workspaces = pkgs.filter(d => d !== '.').map(d => { try { const pj = JSON.parse(readFileSync(join(root, d, 'package.json'), 'utf8'));
        if (!pj.name) return null;
        const cand = [typeof pj.main === 'string' ? (d + '/' + pj.main.replace(/^\.\//, '')) : null, d + '/src/index.ts', d + '/src/index.tsx', d + '/src/index.js', d + '/index.ts', d + '/index.js', d + '/src/main.ts'].filter(Boolean);
        return { name: pj.name, dir: d, entry: cand.find(c => fileSet2.has(c)) ?? cand.find(c => fileSet2.has(c.replace(/\.js$/, '.ts'))) ?? null }; }
      catch { return null; } }).filter(w => w && w.entry);
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
    model.filesAll = files; }
  catch (e) { log('relation pass failed: ' + (e?.message || e)); model.edges = []; model.edgesTruncated = 0; model.moduleGraph = { nodes: [], edges: [], cycles: [] }; model.relDecls = null; }
  // implications per group: what a new member COMES WITH — a same-stem companion file (whatever dotted suffix the repo
  // pairs these files with: `*.test.tsx`, `*.stories.tsx`, `*.module.ts`), and the file that registers/imports the
  // members (DI registration, a barrel) — raw path + edge evidence, no name semantics
  { const stem0 = rel => basename(rel).split('.')[0];
    const sufChain = rel => { const parts = basename(rel).split('.'); return parts.length >= 2 ? '*.' + parts.slice(1).join('.') : null; };
    const byStem = new Map(); for (const f2 of files) (byStem.get(stem0(f2)) || byStem.set(stem0(f2), []).get(stem0(f2))).push(f2);
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
      for (const [r2, fset] of byRole2) { const r3 = impliedOf([...fset]); if (r3) part2.groupImplied[r2] = r3; } } }
  // boundary decisions (.grain/seeds.jsonl records with a `boundary` field): resolved against the current tree
  model.boundaries = (boundaries || []).map(b => ({ ...b,
    fromLive: files.some(f => b.boundary.from === '.' ? !f.includes('/') : (f + '/').startsWith(b.boundary.from + '/')),
    toLive: files.some(f => (f + '/').startsWith(b.boundary.to + '/')) }));
  model.agentShare = agentShareDen ? +(agentShareNum / agentShareDen).toFixed(2) : null;
  model.cochange = H ? [...H.cochange].sort((a, b) => b.sup - a.sup || (a.a < b.a ? -1 : a.a > b.a ? 1 : a.b < b.b ? -1 : 1)).slice(0, 5000) : []; // cap by descending support
  // the language bridge: what files this repo touches when a commit message says <token> — pruned to living files,
  // strongest tokens first; `where` cites it (with the example commit) for query words the code itself never says
  model.msgAffinity = [];
  if (H && H.msgAff) { const fset3 = new Set(files);
    const filler = t => ((H.msgTokCommits || {})[t] || 0) > Math.max(8, (H.commitsN || 0) * 0.15); // a token most commits say (feat/fix/chore) translates nothing — df-demoted, no word list
    const rows = Object.entries(H.msgAff).filter(([t]) => !filler(t)).map(([t, fm]) => { const fs3 = Object.entries(fm).filter(([f, n]) => n >= 2 && fset3.has(f))
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 6);
      const tot = fs3.reduce((a2, [, n]) => a2 + n, 0);
      return tot >= 2 ? { t, files: fs3, ex: (H.msgAffEx || {})[t] || null } : null; }).filter(Boolean);
    model.msgAffinity = rows.sort((a, b) => b.files.reduce((x, [, n]) => x + n, 0) - a.files.reduce((x, [, n]) => x + n, 0) || (a.t < b.t ? -1 : 1)).slice(0, 1500); }
  model.historyStats = H ? { commits: H.stats.commits, events: H.stats.events, blobs: H.stats.blobs } : null; // parsed/cached/mb are run diagnostics, not repo facts — they would break byte-identity across cache states
  model.files = files.length;
  return { model, ms: Date.now() - t0, scopes: all.length, rawScopes, treeCacheOut }; }
// scope records round-trip through JSON (sets → sorted arrays) for the current-tree scope cache
export const serializeScope = s => ({ kind: s.kind, name: s.name, rel: s.rel, line: s.line, endLine: s.endLine || s.line, ord: s.ord, g: s.g || null, nt: s.nt || null, noBody: !!s.noBody, doc: s.doc || [], sk: s.sk || null, sup: s.sup, decos: s.decos, rets: s.rets || [], ptypes: s.ptypes || [], calls: [...s.calls].sort(), seen: [...s.seen].sort(), shapes: [...s.shapes].sort(), preds: { ...s.preds }, imports: s.imports, feats: s.feats, ownCount: s.ownCount });
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
    out.push(`history bridge: «${row.t}» appears in no code card here, but commits saying it touched: ${row.files.slice(0, 3).map(([f, n]) => `\`${f}\` (${n})`).join(' · ')}${row.ex ? ` — e.g. "${row.ex[1]}" (${row.ex[0]})` : ''}`);
    if (out.length >= 2) break; }
  return out; }
export const QSTOP = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'with', 'and', 'or', 'my', 'our', 'this', 'that', 'it', 'is', 'are', 'be', 'do', 'doe', 'can', 'should', 'would', 'i', 'we', 'you', 'how', 'what', 'where', 'when', 'so', 'via', 'from', 'into', 'onto', 'up', 'out', 'new', 'some', 'any', 'all']);
const PL_STOP = new Set(['index', 'main', 'mod', 'util', 'utils', 'helper', 'helpers', 'common', 'shared', 'core', 'base',
  'type', 'types', 'test', 'tests', 'spec', 'specs', 'lib', 'libs', 'app', 'apps', 'src', 'file', 'files', 'data',
  'component', 'components', 'page', 'pages', 'view', 'views', 'service', 'services', 'controller', 'controllers',
  'module', 'modules', 'model', 'models', 'config', 'get', 'set', 'add', 'the',
  'does', 'not', 'non', 'see', 'sees', 'has', 'have', 'had', 'was', 'will', 'then', 'than', 'its', 'each', 'every',
  'before', 'after', 'between', 'without', 'within', 'still', 'also', 'only', 'their', 'them', 'they']);
export function placementHit(model, rel) {
  const files = model.filesAll || []; if (files.length < 20 || files.includes(rel)) return null;
  const sufOf = f => { const ps2 = basename(f).split('.'); return ps2.length >= 3 ? ps2.slice(-2).join('.').toLowerCase() : (ps2[1] || '').toLowerCase(); };
  const suf = sufOf(rel); if (!suf) return null;
  const dir = dirname(rel);
  const cands = files.filter(f => sufOf(f) === suf);
  if (cands.length < 3) return null;
  const toks = [...new Set(tokenize(basename(rel).split('.')[0]))].filter(t => t.length >= 3 && !PL_STOP.has(t) && !QSTOP.has(t));
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
    return { kind: 'placement', token: best.t, dir: best.topDir,
      text: `[grain] placement: \`*.${suf}\` files named like \`${best.t}\` live in \`${best.topDir}/\` — ${best.n} of ${best.of}; \`${dir}/\` holds none.${rivalBit} Deliberate placement is fine — but if you guessed, ask \`grain where ${best.t} ${suf.split('.')[0]}\` first.` }; }
  if (cands.length >= 5) { // fallback: the suffix itself is kept in one subtree and this file is outside it
    const cnt = new Map();
    for (const f of cands) { const segs = dirname(f).split('/'); for (let k = 1; k <= segs.length; k++) { const p2 = segs.slice(0, k).join('/'); cnt.set(p2, (cnt.get(p2) || 0) + 1); } }
    let node = null; for (const [p2, c] of cnt) if (c / cands.length >= 0.8 && p2 !== '.' && (!node || p2.length > node.p.length)) node = { p: p2, c };
    if (node && !(dir + '/').startsWith(node.p + '/'))
      return { kind: 'placement', token: null, dir: node.p,
        text: `[grain] placement: ${node.c} of ${cands.length} \`*.${suf}\` files live under \`${node.p}/\`; this one is outside it (\`${dir}/\`). Deliberate is fine — if you guessed, look there first.` };
    if (node && dir === node.p && !cands.some(f => dirname(f) === node.p)) { // everyone lives one level deeper — the root holds none
      const subs = new Map(); for (const f of cands) if ((f + '/').startsWith(node.p + '/')) { const nxt = f.slice(node.p.length + 1).split('/')[0]; if (f.slice(node.p.length + 1).includes('/')) subs.set(nxt, (subs.get(nxt) || 0) + 1); }
      const top3 = [...subs].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(([d2, c2]) => `\`${d2}/\` (${c2})`);
      if (subs.size) return { kind: 'placement', token: null, dir: node.p,
        text: `[grain] placement: every \`*.${suf}\` file under \`${node.p}/\` lives in a named subdirectory — ${top3.join(' · ')}${subs.size > 3 ? ` · +${subs.size - 3} more` : ''}; none sit at the root, where this file is. Deliberate is fine — if you guessed, pick the closest subdirectory.` }; } }
  return null; }

export async function checkFile({ model, root, rel, content, asPath, exemplarOk = () => true }) {
  const effRel = asPath || rel;
  const src = content ?? readFileSync(join(root, rel), 'utf8');
  const part = partitionFor(model, effRel);
  const p = await getParser(extname(rel)); const b = bindingFor(p._g); const tr = p.parse(src);
  const scopes = extractScopes(effRel, tr, b, p._g).filter(s => s.name !== '<anon>');
  const relFact = relFactsFor(effRel, src, tr, p._g); tr.delete();
  const archHits = computeArchHits({ model, root, effRel, relFact });
  const placeHit = placementHit(model, effRel);
  if (!part) return { scopes: [], governed: [], msgs: [], archHits, placeHit, partition: null, reason: 'no partition covers this file' };
  for (const s of scopes) applyVocab(s, part.vocab);
  const medoids = part.medoids;
  const { assign, amb } = assignAll(scopes, medoids);
  const msgs = []; const governed = [];
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
      if (lead !== undefined) governed.push({ scope: s.name, kind: s.kind, line: s.line, pid: f.pid, label, conforms: lead === f.exp, fact: f });
      // the lead surface speaks for the cluster; a deviation on any sibling surface (same conform set) is still a deviation
      for (const sf of [f, ...(f.siblings || [])]) {
        const v = s.preds[sf.pid];
        if (v === undefined || v === sf.exp) continue;
        if (sf === f && f.suppressedValue && v === f.suppressedValue) continue;              // nucleation stand-down
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
        msgs.push({ scope: s.name, kind: s.kind, key: skeyR(effRel, s), line: s.line, endLine: s.endLine || s.line, pid: sf.pid, factKey: f.cid + '|' + f.pid, delta: +d.toFixed(2), exp: sf.exp, obs: v, label, exNames: f.exemplars.map(e => e.name),
          text: `[grain] ${label} convention: ${verbalize(vf, f.exemplars.map(e => e.name))}${sf !== f ? ` (a sibling surface of: ${verbalize(f, f.exemplars.map(e => e.name)).replace(/^\w+ here /, '')})` : ''}${f.seeded ? ` — steered by a maintainer decision${(model.steers || []).filter(st => f.seeded.includes(st.id) && st.note).map(st => ': ' + st.note).join('') || ''}` : ''}\n` +
            `  ${conformN}/${f.sraw} established ${unitOf(f.kind)} conform. Your ${s.kind} \`${s.name}\` (line ${s.line}) ${deviationPhrase(vf, v)}${known ? '' : ' — a value this repo has not used before'}.${contrast}` +
            (() => { const here = scopes.filter(s2 => s2 !== s && s2.kind === s.kind && s2.preds[sf.pid] === sf.exp).slice(0, 2); return here.length ? `\n  In this file, ${here.map(s2 => `\`${s2.name}\` (line ${s2.line})`).join(' and ')} conform${here.length === 1 ? 's' : ''}.` : ''; })() +
            (exs.length ? `\n  See: ${exs.map(e => `${e.rel}:${e.line} \`${e.name}\``).join(' · ')}` : '') + (f.held && f.held.since ? `\n  (${factNotes(f).replace(/^ · /, '')})` : '') });
        break; } } });
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
        const vf = { pid: sf.pid, exp: sf.value, kind: st.kind };
        const promoted = st.surfaces.find(x => x.value !== null && !x.retires);
        const retiredName = (sf.pid.match(/^auto\.[a-z]+:(@?.+)$/) || [])[1];
        const head2 = sf.retires && promoted
          ? `${verbalize({ pid: promoted.pid, exp: promoted.value, kind: st.kind }, [st.name])}, not \`${retiredName || sf.pid}\` — ${practicedBy(promoted)}. Your ${s.kind} \`${s.name}\` (line ${s.line}) still carries \`${retiredName || sf.pid}\``
          : `${verbalize(vf, [st.name])} — ${practicedBy(sf)}. Your ${s.kind} \`${s.name}\` (line ${s.line}) ${deviationPhrase(vf, v)}`;
        steerHits.push({ scope: s.name, kind: s.kind, line: s.line, endLine: s.endLine || s.line, id: st.id, pid: sf.pid, exp: sf.value, obs: v,
          text: `[grain] maintainer decision (${[st.author, st.createdAt].filter(Boolean).join(' ')}): ${head2}.${st.note ? `\n  ${st.note}` : ''}\n  Copy: ${st.path}:${st.line} \`${st.name}\`` }); } }); }
  return { scopes, governed, msgs, steerHits, archHits, placeHit, partition: part.name }; }
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
    for (const e of resolve(effRel, relFact)) {
      const a = moduleOf(effRel, model.pkgs), b2 = moduleOf(e.to, model.pkgs);
      for (const bd of model.boundaries || []) { const inFrom = bd.boundary.from === '.' ? !effRel.includes('/') : (effRel + '/').startsWith(bd.boundary.from + '/');
        if (inFrom && (e.to + '/').startsWith(bd.boundary.to + '/'))
          archHits.push({ line: e.line, to: e.to, kind: 'boundary-decision', id: bd.id,
            text: `[grain] maintainer decision (${[bd.author, bd.createdAt].filter(Boolean).join(' ')}): ${bd.boundary.from}/ never imports ${bd.boundary.to}/ — your import of \`${e.to}\` (line ${e.line}) crosses it.${bd.note ? `\n  ${bd.note}` : ''}` }); }
      if (a === b2) continue;
      const fwd = mg.edges.find(x => x.from === a && x.to === b2); if (fwd) continue;
      const rev = mg.edges.find(x => x.from === b2 && x.to === a);
      const via = mg.edges.filter(x => x.from === a).map(x => x.to).filter(m => m !== b2 && mg.edges.some(x2 => x2.from === m && x2.to === b2)).sort()[0];
      archHits.push({ line: e.line, to: e.to, kind: rev ? 'cycle' : 'first-crossing',
        text: rev
          ? `[grain] architecture: your import of \`${e.to}\` (line ${e.line}) CLOSES A CYCLE ${a} ↔ ${b2} — ${b2} already depends on ${a} (${rev.n} edge${rev.n > 1 ? 's' : ''}).`
          : `[grain] architecture: your import of \`${e.to}\` (line ${e.line}) is the FIRST edge ${a} → ${b2} (0 existing)${via ? ` — today ${a} reaches ${b2} via ${via} (an established path)` : ''}. Not forbidden, but it opens a dependency no one has opened before.` }); }
  } catch { /* architecture advice must never break check */ } }
  return archHits; }
// one paragraph per (convention, observed value): the scopes that deviate, with lines, never nine identical paragraphs
export function groupDeviations(msgs, touched = null) {
  const groups = new Map();
  for (const m of msgs) { const k = m.factKey + '|' + m.pid + '|' + m.obs; let g = groups.get(k); if (!g) { g = { ...m, hits: [] }; groups.set(k, g); } g.hits.push({ scope: m.scope, kind: m.kind, line: m.line, touched: touched ? touched(m.line, m.endLine || m.line) : true }); }
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
  const ps = (scopesAll ? scopesAll.filter(s => fileSet.has(s.rel) && s.kind !== 'module').map(hydrateScope) : (await extractTree(root, files))).filter(s => s.name !== '<anon>');
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
    const mine3 = fileScopes.filter(s => s.kind === kind && s.preds[pid] !== undefined).map(s => s.preds[pid]);
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
const part = (model, name) => model.partitions.find(p => p.name === name) || { medoids: [], name };
export function cochangePartners(model, dirs, max = 3, file = null) {
  const out = []; const minConf = file ? 1 / 3 : CFG.cochangeMinConf; // one file's history is sparse; a third of its commits is a real signal
  for (const p of model.cochange || []) {
    const aIn = file ? p.a === file : dirs.some(d => p.a.startsWith(d + '/')), bIn = file ? p.b === file : dirs.some(d => p.b.startsWith(d + '/'));
    if (aIn && !bIn && p.sup / (p.commitsA || 1) >= minConf) out.push({ partner: p.b, sup: p.sup, commits: p.commitsA || p.sup });
    else if (bIn && !aIn && p.sup / (p.commitsB || 1) >= minConf) out.push({ partner: p.a, sup: p.sup, commits: p.commitsB || p.sup }); }
  out.sort((x, y) => (y.sup / y.commits) - (x.sup / x.commits) || (x.partner < y.partner ? -1 : 1));
  const seen2 = new Set(); const uniq = []; // one line per partner — duplicate rows (rename lineages) keep only their strongest
  for (const o of out) { if (seen2.has(o.partner)) continue; seen2.add(o.partner); uniq.push(o); if (uniq.length >= max) break; }
  return uniq; }
// the practiced-by clause of a steer: same-denominator marker counts when the seed names what it retires, plain share otherwise
export const practicedBy = sf => sf.rivals ? `adopted by ${sf.rivals.own} of ${sf.rivals.own + sf.rivals.alts.reduce((a, x) => a + x.n, 0)} (${sf.rivals.alts.map(x => `${x.name} ${x.n}`).join(' · ')}) in ${sf.context} today` : `practiced by ${Math.round((sf.share || 0) * 100)}% of ${sf.n} in ${sf.context} today`;
export const scopeLabel = partName => partName === '_root' ? 'repo-wide' : partName === '_repo' ? 'repo-wide (small packages merged)' : `package ${partName}`;
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
  const hits = cards.filter(c => c.score > 0).sort((a, b) => b.score - a.score || rank(b) - rank(a) || b.n - a.n || (a.label < b.label ? -1 : 1)).slice(0, top);
  const lines = [];
  // a steer renders wherever its topic meets the query or its exemplar lives in the card: decided, beside what is practiced
  const steers = (model.steers || []).filter(st => st.found);
  const steerLine = st => st.surfaces.filter(sf => sf.value !== null && !sf.retires).map(sf => `  steer (maintainer decision, ${[st.author, st.createdAt].filter(Boolean).join(' ')}): ${verbalize({ pid: sf.pid, exp: sf.value, kind: st.kind }, [st.name])} — ${practicedBy(sf)}${st.note ? ' · ' + st.note : ''} · copy ${st.path}:${st.line} \`${st.name}\``);
  const topicHit = st => { const tt = new Set(tokenize(st.topic).map(normTok)); return [...qt].some(t => tt.has(t)); };
  const cardHit = (st, c) => c.type === 'file' ? c.label === st.path : c.type === 'directory' ? st.path.startsWith(c.label) : c.members ? c.members.some(k => k.startsWith(st.path + '#') && k.split('#')[2] === st.name) : false;
  const orphanSteers = steers.filter(st => topicHit(st) && !hits.some(c => cardHit(st, c)));
  for (const st of orphanSteers) { const sl = steerLine(st); if (sl.length) { lines.push(`«${q}» → maintainer decision ${st.id} (no card of its own carries it)`); lines.push(...sl); } }
  if (hits.length && hits[0].score < 0.34) lines.push(`weak match: the best hit covers ${Math.round(hits[0].score * 100)}% of the query's weight — a hint, not an answer. If the hits look unrelated to what you are writing, open the nearest sibling of the file you expect to edit instead.`);
  else if (hits.length && qt.size >= 3) { const contributing = [...idf.keys()].filter(t => (hits[0].toks.get(t) || 0) > 0);
    if (contributing.length <= 1 && !hits[0].exact) lines.push(`note: the top hit matches only «${contributing[0] || '?'}» of your ${qt.size} words — verify before building on it.`); }
  if (!hits.length) {
    lines.push(`no lexical match for "${q}" — compact map of the source groups, markers and directories follows. Pick the closest entry yourself and open its files; do not re-ask with synonyms.`);
    lines.push(...bridgeLines(model, qt, df));
    const sorted = cards.filter(c => c.type !== 'file').sort((a, b) => b.n - a.n || (a.label < b.label ? -1 : 1));
    for (const c of sorted.slice(0, mapRows)) lines.push(`  [${c.type}] ${c.label} (${c.n}) → ${c.topDirs.map(([d]) => d + '/').join(' · ')}`);
    if (sorted.length > mapRows) lines.push(`  … and ${sorted.length - mapRows} more — re-run with --map-rows ${sorted.length} for all`);
    if (!cards.length) lines.push('  (the model holds no groups or directory norms — no strong conventions were found in this repository)');
    return { lines, hits: [], cards }; }
  const bridged = bridgeLines(model, qt, df); // query words the code never says, translated by the commit history
  for (const h of hits) {
    const stLines = steers.filter(st => cardHit(st, h)).flatMap(steerLine); // decided, printed right under the card's header
    if (h.type === 'file') { const qs = [...qt];
      const hitsOf = k => { const nm = k.split('#')[2] || ''; const toks2 = tokenize(nm).map(normTok); return (qraw.has(nm.toLowerCase()) ? 10 : 0) + qs.filter(t => toks2.includes(t)).length; };
      const matching = h.members.map(k => [k, hitsOf(k)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || tokenize(a[0].split('#')[2] || '').length - tokenize(b[0].split('#')[2] || '').length || (a[0] < b[0] ? -1 : 1)).slice(0, 6).map(([k]) => { const [, kind, name, line] = k.split('#'); return `\`${name}\` (${kind}${line ? ', line ' + line : ''})`; });
      lines.push(`«${q}» → file ${h.label} — ${h.n} scopes (${scopeLabel(h.part)}, match ${Math.round(Math.min(1, h.score) * 100)}%)${matching.length ? ` · matching here: ${matching.join(' · ')}` : ''}`, ...stLines);
      const TRIVIAL = /^(none|void|str|string|bool|boolean|int|number|float|any|t\.any|object|list|dict|error|unit|self|this|t|f)$/i;
      const carried = (h.carried || []).filter(([mk]) => !mk.startsWith('ret:') || !TRIVIAL.test(mk.slice(4))).sort((a, b) => b[1] - a[1]);
      if (carried.length) lines.push(`  carries: ${carried.slice(0, 5).map(([mk, n]) => `${mk.startsWith('deco:') ? (mk.slice(5).startsWith('[') ? mk.slice(5) : '@' + mk.slice(5)) : mk.startsWith('sup:') ? 'extends ' + mk.slice(4) : 'returns ' + mk.slice(4)} ×${n}`).join(' · ')}`);
      for (const f of h.facts.slice(0, 3)) lines.push(`  - ${factLabel(part(model, h.part), f)}: ${verbalize(f, f.exemplars.map(e => e.name))} — ${Math.round(f.share * 100)}% of ${f.sraw}`);
      const cc = cochangePartners(model, [], 3, h.label);
      if (cc.length) lines.push(`  historically co-changes with: ${cc.map(c => `${c.partner} (${c.sup}/${c.commits} commits)`).join(' · ')}`);
      continue; }
    lines.push(`«${q}» → ${h.type} ${h.label} — ${h.type === 'group' ? `${h.n} members` : h.type === 'marker' ? `${h.n} carriers` : `${h.files?.length ?? '?'} files, ${h.facts.length ? h.n + ' established' : h.n + ' scopes'}`} (${scopeLabel(h.part)}, match ${Math.round(h.score * 100)}%)`);
    lines.push(...stLines);
    if (h.type === 'directory' && model.moduleGraph) { const id = h.label.replace(/\/$/, '');
      const dep = model.moduleGraph.edges.filter(e => e.from === id).slice(0, 4), used = model.moduleGraph.edges.filter(e => e.to === id).slice(0, 4);
      if (dep.length) lines.push(`  depends on: ${dep.map(e => `${e.to}/ (${e.n})`).join(' · ')}`);
      if (used.length) lines.push(`  used by: ${used.map(e => `${e.from}/ (${e.n})`).join(' · ')}`);
      for (const bd of model.boundaries || []) if ((id + '/').startsWith(bd.boundary.from + '/')) lines.push(`  boundary (maintainer decision, ${[bd.author, bd.createdAt].filter(Boolean).join(' ')}): never imports ${bd.boundary.to}/${bd.note ? ' — ' + bd.note : ''}`); }
    if (h.members) lines.push(`  lives in: ${h.topDirs.map(([d, n]) => `${d}/ (${Math.round(n / h.n * 100)}%)`).join(' · ')}`);
    const P = part(model, h.part); const withLine = k => { const [rel2, kind, name] = k.split('#'); const ln = scopeLine(P, k); return `${rel2}${ln ? ':' + ln : ''} \`${name}\` (${kind})`; };
    if (h.type === 'marker') { const ex = h.members.slice(0, 3).map(withLine); lines.push(`  carriers to copy: ${ex.join(' · ')}${h.members.length > 3 ? ` · +${h.members.length - 3} more` : ''}`);
      const mkKey = h.mpid ? h.mpid.replace(/^auto\.deco:@?/, 'deco:').replace(/^auto\.extends:/, 'sup:').replace(/^auto\.returns:/, 'ret:') : '';
      const obs = (part(model, h.part).markerObs || {})[mkKey] || [];
      if (obs.length) lines.push(`  its carriers share (observed, not certified): ${obs.join(' · ')}`);
      const mi = (part(model, h.part).markerImplied || {})[mkKey];
      if (mi && (mi.companion || mi.importedBy || mi.importedByPattern)) { const bits = [];
        if (mi.companion) bits.push(`a same-stem \`${mi.companion.pattern}\` companion (${Math.round(mi.companion.share * 100)}% of ${mi.companion.n} have one, e.g. \`${mi.companion.example}\`)`);
        if (mi.importedBy) bits.push(`registration in \`${mi.importedBy.file}\` (imports ${mi.importedBy.n} of ${mi.importedBy.of} carriers)`);
        if (mi.importedByPattern) bits.push(`registration by a \`${mi.importedByPattern.pattern}\` file (${mi.importedByPattern.n} of ${mi.importedByPattern.of} carriers)`);
        lines.push(`  a new carrier comes with: ${bits.join(' · ')}`); }
      const best = [...h.facts].sort((a, b) => b.sraw - a.sraw)[0];
      if (best) { const own = best.pid === h.mpid ? best : { ...((best.siblings || []).find(sb => sb.pid === h.mpid) || best), kind: best.kind };
        lines.push(`  - ${verbalize(own, best.exemplars.map(e => e.name))} — ${Math.round(best.share * 100)}% of ${best.sraw}${own !== best ? ` (with: ${verbalize(best, best.exemplars.map(e => e.name)).replace(/^\w+ here /, '')})` : ''}${factNotes(best)}`); }
      continue; }
    if (!h.facts.length) lines.push(`  - no convention certified here beyond placement (the group is small, not free-form) — open a member below and copy its shape`);
    if (h.type === 'group' && h.roleIdx !== undefined) { const pf = (part(model, h.part).profiles || {})[h.roleIdx];
      if (pf) { const bits = [`${pf.n} members share this skeleton (~${Math.round(pf.coverage * 100)}% of an average member): ${pf.skel}`];
        for (const pi of pf.perInstance) bits.push(`one slot is per-instance (${pi.distinct} distinct values in ${pi.total} — e.g. \`${pi.top}\`)`);
        for (const sl of pf.slots) bits.push(`slot usually \`${sl.top}\` (${sl.k}/${sl.total})`);
        if (pf.held) bits.push(`held since ${pf.held.since}${pf.held.fresh ? ` · ${pf.held.fresh} new in 180d` : ''}`);
        lines.push('  superposition: ' + bits.join(' · ')); }
      const gi2 = (part(model, h.part).groupImplied || {})[h.roleIdx];
      if (gi2) { const bits = [];
        if (gi2.companion) bits.push(`a same-stem \`${gi2.companion.pattern}\` companion (${Math.round(gi2.companion.share * 100)}% of ${gi2.companion.n} have one, e.g. \`${gi2.companion.example}\`)`);
        if (gi2.importedBy) bits.push(`registration in \`${gi2.importedBy.file}\` (imports ${gi2.importedBy.n} of ${gi2.importedBy.of} members)`);
        if (gi2.importedByPattern) bits.push(`registration by a \`${gi2.importedByPattern.pattern}\` file (${gi2.importedByPattern.n} of ${gi2.importedByPattern.of} members are imported by one)`);
        if (bits.length) lines.push(`  a new member comes with: ${bits.join(' · ')}`); } }
    let dlShown = false; // the first fact that HAS deviants names them — what not to copy
    h.facts.slice(0, 6).forEach(f => { lines.push(`  - ${verbalize(f, f.exemplars.map(e => e.name))} — ${Math.round(f.share * 100)}% of ${f.sraw}${factNotes(f)}`); if (!dlShown) { const dl = deviantLine(f); if (dl) { lines.push(dl); dlShown = true; } } });
    // exemplars: types and methods before file scopes — a class to copy beats a filename to copy
    const kindRank = e => /\.[a-z]+$/i.test(e.name) && e.line === 1 ? 1 : 0;
    const ex = [...new Map(h.facts.flatMap(f => f.exemplars).map(e => [e.rel + e.name, e])).values()].filter(e => exemplarOk(e.rel)).sort((a, b) => kindRank(a) - kindRank(b)).slice(0, 3);
    if (ex.length) lines.push(`  pattern to copy: ${ex.map(e => `${e.rel}:${e.line} \`${e.name}\``).join(' · ')}`);
    else if (h.members) { const ms = h.members.slice(0, 3).map(withLine); lines.push(`  members to look at: ${ms.join(' · ')}`); }
    else if (h.files?.length) lines.push(`  files to look at: ${h.files.slice(0, 3).join(' · ')}${h.files.length > 3 ? ` · +${h.files.length - 3} more` : ''}`);
    const cc = cochangePartners(model, h.topDirs.map(([d]) => d));
    if (cc.length) lines.push(`  historically co-changes with: ${cc.map(c => `${c.partner} (${c.sup}/${c.commits} commits)`).join(' · ')}`); }
  lines.push(...bridged);
  return { lines, hits, cards }; }

// ===== REPORT / STATUS / COMPLETENESS =====
export const factLabel = (p, f) => /^r\d/.test(f.cid) ? `group «${p.medoids[+f.cid.slice(1).split(':')[0]]?.label || 'group'}»` : f.cid.startsWith('d[') ? `local (${f.cid.slice(2, f.cid.indexOf(']'))}/)` : f.pkgWide ? scopeLabel(p.name.replace(/#.*$/, '')) + ' incl. tests/examples' : scopeLabel(p.name);
export function report(model, { top = 15 } = {}) {
  const lines = [];
  for (const p of model.partitions) { lines.push(`== ${scopeLabel(p.name)} — ${p.facts.length} conventions · ${p.medoids.length} groups · ${p.scopes} scopes · ${p.files.length} files ==`);
    const defining = f => { if (!/^r\d/.test(f.cid)) return false; const md = p.medoids[+f.cid.slice(1).split(':')[0]]; if (!md) return false;
      const m = f.pid.match(/^auto\.(deco|extends|returns):@?(.+)$/); if (!m || f.exp !== 'true') return false; const pre = { deco: 'dec', extends: 'sup', returns: 'ret' }[m[1]];
      return md.feats.includes(pre + ':' + m[2]) || md.feats.includes(pre + ':' + m[2].replace(/^\[|\]$/g, '')); };
    const shown = p.facts.filter(f => !defining(f)); const taut = p.facts.filter(defining).length;
    for (const f of shown.slice(0, top)) {
      const t = f.trend; const tr = t ? ` trend[${t.shares.map(s => Math.round(s.share * 100)).join('>')}%]${t.nucleating ? ` — a newer pattern is emerging here: ${t.nucleating}` : ''}` : '';
      lines.push(`  ${factLabel(p, f)}: ${verbalize(f, f.exemplars.map(e => e.name))} — ${Math.round(f.share * 100)}% of ${f.sraw} established${f.deviantsN ? `, ${f.deviantsN} deviant${f.deviantsN > 1 ? 's' : ''}` : ''}${tr}${f.held && f.held.since ? ` · held since ${f.held.since}` : ''}`); }
    if (shown.length > top) lines.push(`  … and ${shown.length - top} more — run with --top ${shown.length} for all`);
    if (taut) lines.push(`  (${taut} group-defining marker${taut > 1 ? 's' : ''} not listed — a group selected by its decorator/supertype restating it is not news; \`where\` still uses them)`);
    for (const t of (p.templates || []).slice(0, 6)) { const bits = [];
      for (const pi of t.perInstance) bits.push(`one slot per-instance (${pi.distinct}/${pi.total}, e.g. \`${pi.top}\`)`);
      for (const sl of t.slots) bits.push(`slot usually \`${sl.top}\` (${sl.k}/${sl.total})`);
      lines.push(`  template (unclustered ${t.kind}s ×${t.n}, ~${Math.round(t.coverage * 100)}% of an average one): ${t.skel}${bits.length ? ' · ' + bits.join(' · ') : ''}${t.held ? ` · held since ${t.held.since}${t.held.fresh ? ` · ${t.held.fresh} new in 180d` : ''}` : ''} — e.g. ${t.exemplars[0].rel}:${t.exemplars[0].line}`); } }
  if (model.moduleGraph && model.moduleGraph.nodes.length > 1) {
    const mg = model.moduleGraph;
    lines.push(`== architecture — ${mg.nodes.length} modules · ${mg.edges.length} directed dependencies · ${mg.cycles.length} cycle(s) ==`);
    const out = new Map(); for (const e of mg.edges) (out.get(e.from) || out.set(e.from, []).get(e.from)).push(e);
    for (const [from, es] of [...out].sort((a, b) => b[1].reduce((x, y) => x + y.n, 0) - a[1].reduce((x, y) => x + y.n, 0)).slice(0, 12))
      lines.push(`  ${from}/ → ${es.slice(0, 5).map(e => `${e.to}/ (${e.n})`).join(' · ')}${es.length > 5 ? ` · +${es.length - 5} more` : ''}`);
    for (const c of mg.cycles.slice(0, 4)) lines.push(`  cycle: ${c.join(' ↔ ')}`); }
  { const moving = [];
    for (const p2 of model.partitions) for (const f of p2.facts) { if (!f.trend || !f.trend.shares || f.trend.shares.length < 2) continue;
      const a = f.trend.shares[0].share, b2 = f.trend.shares[f.trend.shares.length - 1].share;
      if (Math.abs(b2 - a) >= 0.1 || f.suppressedValue) moving.push({ p: p2, f, d: b2 - a }); }
    if (moving.length) { lines.push(`== drift — ${moving.length} convention(s) in motion ==`);
      for (const m of moving.sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 10))
        lines.push(`  ${m.d > 0 ? '↑' : m.d < 0 ? '↓' : '~'} ${factLabel(m.p, m.f)}: ${verbalize(m.f, m.f.exemplars.map(e => e.name))} — ${m.f.trend.shares.map(x2 => Math.round(x2.share * 100)).join('>')}%${m.f.suppressedValue ? ` · a newer pattern is emerging: ${m.f.suppressedValue}` : ''}`); } }
  if (model.boundaries && model.boundaries.length) { lines.push(`== boundaries — ${model.boundaries.length} architecture decision(s) in .grain/seeds.jsonl ==`);
    for (const bd of model.boundaries) lines.push(`  ${bd.id}: ${bd.boundary.from}/ never imports ${bd.boundary.to}/${bd.note ? ' — ' + bd.note : ''}${!bd.fromLive || !bd.toLive ? ' (a side names no indexed files — inert)' : ''}${bd.author ? ' · ' + bd.author : ''} ${bd.createdAt || ''}`); }
  if (model.steers && model.steers.length) { lines.push(`== steers — ${model.steers.length} maintainer decision(s) in .grain/seeds.jsonl ==`);
    for (const st of model.steers) { if (!st.found) { lines.push(`  ${st.id}: exemplar ${st.path}#${st.name} not found in HEAD — inert (edit or remove it)`); continue; }
      for (const sf of st.surfaces) { if (sf.retires) continue; lines.push(`  ${st.id}: ${sf.value === null ? `${sf.pid} is not a surface of ${st.name}` : verbalize({ pid: sf.pid, exp: sf.value, kind: st.kind }, [st.name]) + ' — ' + practicedBy(sf)} · weight ${st.weight}${st.note ? ' · ' + st.note : ''}${st.author ? ' · ' + st.author : ''} ${st.createdAt || ''}`);
        for (const rp of st.surfaces.filter(x => x.retires)) lines.push(`    retires: ${verbalize({ pid: rp.pid, exp: 'true', kind: st.kind }, [])}`); } } }
  lines.push(`agent-authored share of code younger than ${CFG.survDays} days: ${model.agentShare == null ? 'n/a' : Math.round(model.agentShare * 100) + '%'} · co-change pairs: ${model.cochange.length} (bulk commits touching >30 files excluded from pairing)`);
  return lines; }
export function statusLines(model) {
  const nf = model.partitions.reduce((a, p) => a + p.facts.length, 0);
  const ng = model.partitions.reduce((a, p) => a + p.medoids.length, 0);
  return [`model: ${model.repo} · ${model.partitions.length} partition(s) · ${ng} groups · ${nf} conventions · ${model.files} files${!model.historyStats ? ' — no git history: nothing counts as established, so no convention is spoken (groups and placement still answer `where`)' : ''}`,
    `agent-authored share of code younger than ${CFG.survDays} days: ${model.agentShare == null ? 'n/a (no history)' : Math.round(model.agentShare * 100) + '%'}${model.agentShare >= 0.85 ? ' ⚠ ALARM — the norm is being written by agents faster than humans review it' : ''}`,
    `nucleating stand-downs: ${model.partitions.reduce((a, p) => a + p.facts.filter(f => f.suppressedValue).length, 0)}`,
    `co-change pairs: ${model.cochange.length} · history: ${model.historyStats ? model.historyStats.commits + ' commits, ' + model.historyStats.blobs + ' blobs' : 'none (degraded weights)'}`,
    `architecture: ${model.moduleGraph?.nodes.length ?? 0} modules · ${(model.edges || []).length} file edges${model.edgesTruncated ? ' (+' + model.edgesTruncated + ' truncated)' : ''} · ${model.moduleGraph?.edges.length ?? 0} module edges · ${model.moduleGraph?.cycles.length ?? 0} cycle(s)`,
    ...(model.steers && model.steers.length ? [`steers: ${model.steers.filter(s => s.found).length} active${model.steers.some(s => !s.found) ? `, ${model.steers.filter(s => !s.found).length} inert (exemplar gone)` : ''} — .grain/seeds.jsonl`] : []),
    ...(model.boundaries && model.boundaries.length ? [`boundaries: ${model.boundaries.length} architecture decision(s) — .grain/seeds.jsonl`] : [])]; }
export function completeness(model, changed) {
  const exp = new Set();
  for (const c of model.cochange) for (const f of changed) { if (c.a === f && !changed.includes(c.b)) exp.add(`${c.b} (co-changed ${c.sup}x, conf ${c.conf})`);
    if (c.b === f && !changed.includes(c.a)) exp.add(`${c.a} (co-changed ${c.sup}x, conf ${c.conf})`); }
  return exp.size ? [`[grain] Edits like this historically also touch:`, ...[...exp].slice(0, 5).map(x => '  - ' + x)] : ['(complete)']; }
export function completenessDirectional(model, changed) { // partner named only from the edited side's own confidence
  const hits = new Map();
  for (const c of model.cochange) for (const f of changed) {
    if (c.a === f && !changed.includes(c.b) && c.sup / (c.commitsA || 1) >= CFG.cochangeMinConf) hits.set(c.b, `${c.b} (co-changed in ${c.sup}/${c.commitsA || c.sup} commits)`);
    if (c.b === f && !changed.includes(c.a) && c.sup / (c.commitsB || 1) >= CFG.cochangeMinConf) hits.set(c.a, `${c.a} (co-changed in ${c.sup}/${c.commitsB || c.sup} commits)`); }
  return hits.size ? [`[grain] Edits like this historically also touch:`, ...[...hits.values()].sort().slice(0, 5).map(x => '  - ' + x)] : ['(complete — no file historically changes with these)']; }

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
        const pp = await getParser(extname(ex.rel)); const bb = bindingFor(pp._g); let picked = null;
        for (const cand of mut.candidates) { const tr2 = pp.parse(cand); const ss = extractScopes(ex.rel, tr2, bb); tr2.delete();
          const ok = mut.call ? ss.find(x => x.name === ex.name && x.calls.has(mut.call)) : ss.find(x => x.kind === 'file' && x.imports.includes(mut.imp));
          if (ok) { picked = cand; break; } }
        if (!picked) { res.unsupported++; continue; } mut = picked; }
      // ground truth by re-extraction, as for injections: a mutation that breaks the parse (a multiline decorator's
      // opening line removed) or fails to flip the surface measures ITSELF, not detection — count it unsupported
      { const pp2 = await getParser(extname(ex.rel)); const bb2 = bindingFor(pp2._g);
        const tr0 = pp2.parse(src); const ss0 = extractScopes(ex.rel, tr0, bb2); tr0.delete();
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
