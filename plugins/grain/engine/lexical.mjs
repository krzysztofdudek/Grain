// grain engine · the file-scope lexical layer (the surfaces an AST cannot carry) and the scope-to-line map
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { basename, extname } from 'node:path/posix';
import { STR_TYPES } from './extract.mjs';
import { part } from './facts.mjs';
import { bindingFor, nameShape, parseFile } from './parse.mjs';
import { exportShape } from './superposition.mjs';

// ===== LEXICAL LAYER (file scope): the surfaces an AST cannot carry — measured on express/flask/CleanArchitecture as the
// whole gap between "the right file" and "the convention": 'use strict' 21/21, single quotes, var vs const, a UTF-8 BOM on
// 70/108 C# files that no Read ever shows. Each is a categorical value per file; whether it is a CHOICE is decided per
// grammar by the partition (lexDomain), never written down here.
// `tally` (§042) is an optional OUT-parameter, written but never read here and never mixed into the returned preds:
// per ratio-shaped surface, a map from the predicate's own VALUE to how many INSTANCES in this file carry it
// (`{single: 3, double: 200}`). The returned categorical is a per-file majority vote, so it cannot say how many
// literals actually conform; `check` needs that count to disclose what the vote hid. Keeping it out of `out` is
// load-bearing: `out` is spread straight into a file scope's `preds` (extractScopes), so any extra key here would
// become a mined predicate and widen the candidate universe.
// §077 (director-approved follow-up to §042): `literals`, when supplied, is a second optional out-parameter —
// one entry per scanned quote-style string node (`{q, body, line, endLine}`), raw and unfiltered. Like `tally`,
// it is never mixed into `out`/spread into a scope's `preds`: it exists only so `checkFile` can compute, AFTER
// the per-file vote, which minority-quote literals are genuine departures versus delimiter-forced (`quoteFlags`
// below) — the exact content test §042 already measured, now reused rather than reimplemented.
export function lexicalPreds(tree, b, tally = null, literals = null) {
  const root = tree.rootNode;
  const text = root.text || '';
  const out = {};
  out['auto.lex:bom'] = text.charCodeAt(0) === 0xfeff ? 'bom' : 'none';
  // indentation unit: tabs, or the most common positive leading-space width among indented lines
  let tabs = 0,
    sp = 0;
  const widths = Object.create(null);
  const lines = text.split('\n');
  const N = Math.min(lines.length, 4000);
  for (let i = 0; i < N; i++) {
    const l = lines[i];
    if (!l || (l[0] !== ' ' && l[0] !== '\t')) continue;
    if (l[0] === '\t') {
      tabs++;
      continue;
    }
    const m = l.match(/^ +/)[0].length;
    if (l.trim()) {
      sp++;
      widths[m] = (widths[m] || 0) + 1;
    }
  }
  if (tabs + sp >= 5) {
    if (tabs > sp * 3) out['auto.lex:indent'] = 'tab';
    else if (sp > tabs * 3) {
      const u = Object.entries(widths)
        .map(([w, c]) => [+w, c])
        .filter(([w]) => [2, 3, 4, 8].includes(w))
        .sort((a, b) => a[0] - b[0]);
      let unit = 0;
      for (const [w, c] of u)
        if (c >= sp * 0.08) {
          unit = w;
          break;
        }
      out['auto.lex:indent'] = unit ? 'space' + unit : 'other';
    } else out['auto.lex:indent'] = 'mixed';
  } // the unit is the smallest width that recurs (most lines sit deeper than one level)
  if (tally) {
    const t = { tab: tabs };
    for (const w of [2, 3, 4, 8]) t['space' + w] = widths[w] || 0;
    tally['auto.lex:indent'] = t;
  }
  // quote style of string literals (delimiter of each string node; prefixes like f"…" / r'…' skipped; backticks ignored)
  let sq = 0,
    dq = 0;
  for (const n of root.descendantsOfType(STR_TYPES).slice(0, 2000)) {
    const t = n.text.replace(/^[A-Za-z@$]+/, '');
    const q = t[0];
    if (q === "'") sq++;
    else if (q === '"') dq++;
    else continue;
    if (literals)
      literals.push({ q, body: t.slice(1, -1), line: n.startPosition.row + 1, endLine: n.endPosition.row + 1 });
  }
  if (sq + dq >= 2)
    out['auto.lex:quote'] = sq >= (sq + dq) * 0.8 ? 'single' : dq >= (sq + dq) * 0.8 ? 'double' : 'mixed';
  if (tally) tally['auto.lex:quote'] = { single: sq, double: dq };
  // statement terminator: simple statements ending in `;` vs not (compound statements — blocks, declarations with bodies — skipped)
  let semi = 0,
    nosemi = 0;
  const stack = [root];
  let g = 0;
  while (stack.length && g++ < 6000) {
    const n = stack.pop();
    for (const c of n.namedChildren) {
      if (
        /^(expression_statement|return_statement|lexical_declaration|variable_declaration|import_statement|export_statement|throw_statement|break_statement|continue_statement|assignment_statement|local_variable_declaration)$/.test(
          c.type
        )
      ) {
        if (/;\s*$/.test(c.text)) semi++;
        else nosemi++;
      }
      if (
        /statement|declaration|body|block|program|module|class|function|method|arrow|object|array|expression/.test(
          c.type
        ) &&
        c.namedChildCount
      )
        stack.push(c);
    }
  }
  if (semi + nosemi >= 5)
    out['auto.lex:semi'] =
      semi >= (semi + nosemi) * 0.8 ? 'semi' : nosemi >= (semi + nosemi) * 0.8 ? 'nosemi' : 'mixed';
  if (tally) tally['auto.lex:semi'] = { semi, nosemi };
  // leading directive: a first statement that is a short string expression (`'use strict'`, `'use client'`)
  const first = root.namedChildren.find(c => c.type !== 'comment' && c.type !== 'hash_bang_line');
  if (
    first &&
    first.type === 'expression_statement' &&
    first.namedChildCount === 1 &&
    /string/.test(first.namedChildren[0].type)
  ) {
    const t = first.namedChildren[0].text.replace(/^["'`]|["'`]$/g, '');
    out['auto.lex:directive'] = /^use \w[\w-]*$/.test(t) ? t : 'none';
  } else if (first) out['auto.lex:directive'] = 'none';
  // declaration keyword (grammars with var/let/const declarations): the majority keyword
  const decl = Object.create(null);
  for (const n of root.descendantsOfType(['variable_declaration', 'lexical_declaration']).slice(0, 2000)) {
    const kw = n.text.match(/^(var|let|const)\b/);
    if (kw) decl[kw[1]] = (decl[kw[1]] || 0) + 1;
  }
  const tot = Object.values(decl).reduce((a, b) => a + b, 0);
  if (tally) tally['auto.lex:decl'] = { ...decl };
  if (tot >= 2) {
    const [k, c] = Object.entries(decl).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    out['auto.lex:decl'] = c >= tot * 0.8 ? k : 'mixed';
  }
  // import block layout: two independent axes over the file's own import statements, as ONE 4-valued categorical.
  // The specifiers come from the TREE, in document order, read verbatim — `s.imports` cannot answer this: resolveImport
  // rewrites every relative specifier to `~/…` and the array is deduplicated by `includes`, so both the original text
  // and the source order are already gone by then.
  if (b && b.imp.size) {
    const units = []; // { spec, row0, row1 } per import, top-level only (a function-local import is a lazy load, not layout)
    for (const n of root.namedChildren) {
      if (!b.imp.has(n.type)) continue;
      const strs = n.descendantsOfType([
        'string',
        'string_literal',
        'interpreted_string_literal',
        'raw_string_literal',
        'system_lib_string',
      ]);
      // a grouped block (Go `import ( … )`) holds one string per spec: each string is its own unit, at its own row,
      // so a blank line INSIDE the block still separates groups. One string, or none, means the statement is the unit.
      if (strs.length >= 2) {
        for (const s of strs)
          units.push({
            spec: s.text.replace(/^["'`<]|["'`>]$/g, ''),
            row0: s.startPosition.row,
            row1: s.endPosition.row,
          });
        continue;
      }
      const tgt = strs.length
        ? strs[0].text.replace(/^["'`<]|["'`>]$/g, '')
        : n.namedChildren.find(c =>
            /dotted_name|scoped_identifier|qualified_name|namespace_name|identifier|package|use_list|use_clause/.test(
              c.type
            )
          )?.text || '';
      if (tgt)
        units.push({ spec: tgt.replace(/\s+/g, ''), row0: n.startPosition.row, row1: n.endPosition.row });
    }
    if (units.length >= 3) {
      let sorted = true,
        grouped = false;
      for (let i = 1; i < units.length; i++) {
        if (units[i].spec < units[i - 1].spec) sorted = false;
        if (units[i].row0 - units[i - 1].row1 >= 2) grouped = true;
      } // a gap of 2+ rows between one import's end and the next one's start IS a blank line
      out['auto.lex:imports'] = (sorted ? 'sorted' : 'unsorted') + '-' + (grouped ? 'grouped' : 'flat');
    }
  }
  return out;
}
// the SAME three ingredients extractScopes uses to build a file-kind scope's own preds, computable from raw source
// text alone — lets a caller ask "what value did this file-level predicate carry in some OTHER version of this
// file's content" without a full extractScopes/mine pass (used by fileFindings in grain.mjs for G10)
export async function fileLevelPreds(rel, src) {
  const { p, tree: tr } = await parseFile(extname(rel), src);
  const b = bindingFor(p._g);
  const preds = {
    'auto.filenameshape': nameShape(basename(rel, extname(rel))),
    ...lexicalPreds(tr, b),
    ...exportShape(tr),
  };
  tr.delete();
  return preds;
}
// scope key → [line, endLine], from the partition's fileScopes (line order ⇒ the k-th same-named scope of a kind is ordinal k)
const scopeLineIdx = new WeakMap();
function scopeLineMap(part) {
  let m = scopeLineIdx.get(part);
  if (!m) {
    m = new Map();
    for (const [rel, list] of Object.entries(part.fileScopes || {})) {
      const occ = new Map();
      for (const [kind, name, line, endLine] of list) {
        const k = rel + '#' + kind + '#' + name;
        const o = occ.get(k) || 0;
        occ.set(k, o + 1);
        m.set(k + (o ? '#' + o : ''), [line, endLine ?? null]);
      }
    }
    scopeLineIdx.set(part, m);
  }
  return m;
}
export function scopeLine(part, key) {
  return scopeLineMap(part).get(key)?.[0] ?? null;
}
// the endLine for a scope key, or null when absent or equal to its own line (nothing worth a range for)
export function scopeLineEnd(part, key) {
  const v = scopeLineMap(part).get(key);
  if (!v) return null;
  const [line, endLine] = v;
  return endLine == null || endLine <= line ? null : endLine;
}
