// The proposal renderer — turn grain's model into a PROPOSED `.yggdrasil/` graph.
//
// The north star (decisions.md `north-star-brownfield-miner`) is a maintainer adopting Yggdrasil on a brownfield
// repository. `tests/stress/reconstruct.mjs` (ticket 093) measured how much of a hand-written graph grain's
// export ALREADY holds; this module is the other half — it writes the graph grain can propose, so the maintainer
// starts from a draft with evidence attached instead of from an empty directory.
//
// It was an instrument (`tests/stress/propose.mjs`, ticket 094) until ticket 104 made `grain propose` a product
// command: the whole render pipeline moved here VERBATIM, and the instrument is now a thin wrapper that imports
// this module, adds the `--score` comparison against a hand-written graph, and keeps its own CLI flags. The
// dispatcher's `propose` command (`cmdPropose`, engine/grain.mjs) drives `propose()` below and renders the
// report; nothing about what lands on disk depends on which of the two called it.
//
// THREE RULES THIS MODULE OBEYS.
//
//   1. NEVER write into the repository's own `.yggdrasil/`. Everything lands under `<out-dir>/.yggdrasil/`, a
//      directory the maintainer reads, edits and moves in by hand. The repository is untouched but for one
//      thing, named here rather than glossed over: the export this module spawns for itself is written to
//      `.grain/cache/`, the disposable half of grain's own store, which `.grain/.gitignore` already ignores —
//      so a run leaves the working tree clean, and nothing it wrote can be committed by accident.
//   2. EVERY proposed element carries an evidence line — counts, paths, shares — naming what in the repository
//      made grain propose it. A proposal without evidence is a guess with a YAML syntax, and the whole point of
//      the north star is that the graph comes from the code rather than from imagination. The evidence is both a
//      `# evidence:` comment in the YAML and a row in `<out-dir>/proposal.json`.
//   3. NOTHING IS ASSERTED AS TRUE UNTIL IT HAS EARNED IT. Every aspect ships `status: draft` by default (the
//      reviewer is skipped, no verdict, no baseline); no type ever carries `enforce: strict`. A prose aspect
//      (`content.md`, an LLM judgment call) NEVER leaves draft here — ticket 101 measured its sense rate under
//      a keyless gate at 0% (ruling `prose-aspects-draft-by-default`) — and its `content.md` says so. A
//      deterministic aspect (`check.mjs`) is promoted to `status: enforced` ONLY when a Yggdrasil CLI resolves
//      and a REAL `yg drill` on the just-written proposal, in a throwaway staging copy, confirms it: zero
//      FALSE-ALARMs and at least one caught `violates-*` case. A check that false-alarms stays draft with
//      `draftReason: file-scope-approximation-fa` (ruling `drill-fa-labelling-is-acceptance-not-defect` — the
//      convention's own subject is a symbol inside the file, Yggdrasil's unit is the file, and the label is
//      what is wrong, not the check); a check that catches nothing stays draft with `draftReason: no-catch`
//      (ruling `no-catch-rules-stay-draft`). With no Yggdrasil CLI every deterministic aspect stays draft too,
//      unverified. The honest limits — above all that a rule about an ABSENCE can never come from mining — are
//      printed at the top of every file a human opens either way.
//
// `grain export` is driven as a SUBPROCESS (`bin/grain.mjs export --out …`) rather than called in-process: it is
// the same code path either way, and the subprocess keeps the export's own memory profile (a full parse of every
// tracked file) out of the process that then renders. `core.mjs` is imported dynamically, only when the sub-gate
// lattice is actually computed. Verifying against Yggdrasil (`yg drill`) runs the built CLI as a subprocess over
// a throwaway copy of this renderer's own output, exactly as `tests/propose.test.mjs` already does.
//
// The split of this file (ticket 124) is in progress: the seams already cut live in the sibling
// modules re-exported at the bottom, and every name this file exported before the split is still
// exported here.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { readGraph, expandMapping, jaccard, intersectSize } from './yggdrasil-graph.mjs';
import {
  ENGINE_VERSION,
  EXTR_V,
  MARKER_STEMS_BY_EXT,
  isLanguageMarkerFile,
  EXT2GRAMMAR,
  GRAMMAR_DIR,
} from './config.mjs';
import { shapeWords, lexWords } from './core.mjs';
import {
  BIN,
  CORE,
  FAMILY_MIN_MEMBERS,
  LAMBDA_BOUND,
  MIN_CONVENTION_SITES,
  MIN_SUPPORT,
  PREAMBLE,
  SCHEMA_VERSION,
  SUBGATE_PER_PARTITION,
  SUPERMAJORITY,
  gitFiles,
  pct,
  preambleComment,
  progressiveReference,
  resolveYg,
  say,
  slug,
  uniq,
  write,
  yamlEmit,
} from './propose-base.mjs';
import { TYPE_LEVELS, contentRegexFor, countBy, levelSentence, localities } from './propose-levels.mjs';
import { buildNodes, buildRelations, nestedProjectRoots, typeGlob } from './propose-nodes.mjs';
import { buildTypes } from './propose-types.mjs';

const CELL_SEP = '\u0001'; // the same cell-key separator `core.mjs` uses; a pid can contain spaces, so ' ' would truncate it
export async function partitionLattice(repo) {
  const modelPath = join(repo, '.grain', 'cache', 'model.json');
  const treePath = join(repo, '.grain', 'cache', 'tree.json');
  if (!existsSync(modelPath) || !existsSync(treePath)) return { rows: [], reason: 'no grain cache (.grain/cache/{model,tree}.json) — run `grain export` on this repo first' };
  const core = await import(`file://${CORE}`);
  const { hydrateScope, applyVocab, buildVocab, skeyR, isBool, kt } = core;
  const model = JSON.parse(readFileSync(modelPath, 'utf8'));
  const tree = JSON.parse(readFileSync(treePath, 'utf8'));
  const byFile = new Map();
  for (const [k, v] of Object.entries(tree)) {
    const rel = k.slice(k.indexOf('|') + 1);
    byFile.set(rel, (Array.isArray(v) ? v : v.s) || []);
  }
  const rows = [];
  for (const part of model.partitions || []) {
    const ps = [];
    for (const rel of part.files || []) for (const raw of byFile.get(rel) || []) { if (raw.name !== '<anon>') ps.push(hydrateScope(raw)); }
    if (ps.length < 3) continue;
    const vocab = buildVocab(ps, { deep: true });
    for (const s of ps) applyVocab(s, vocab);
    const roleOf = s => { const r = part.assignments?.[skeyR(s.rel, s)]; return r !== undefined && r !== -1 ? r : undefined; };
    const cells = new Map(), sites = new Map();
    const add2 = (cid, pid, v, s) => {
      const k = cid + CELL_SEP + pid;
      const c = cells.get(k) || cells.set(k, Object.create(null)).get(k);
      c[v] = (c[v] || 0) + 1;
      (sites.get(k) || sites.set(k, []).get(k)).push({ rel: s.rel, kind: s.kind, name: s.name, line: s.line, v });
    };
    for (const s of ps) {
      const r = roleOf(s);
      for (const [pid, v] of Object.entries(s.preds)) {
        add2('_all:' + s.kind, pid, v, s);
        if (r !== undefined) add2('r' + r + ':' + s.kind, pid, v, s);
      }
    }
    const idxCost = Math.ceil(Math.log2(Math.max(cells.size, 2)));
    const factKey = new Set((part.facts || []).map(f => f.cid + CELL_SEP + f.pid + CELL_SEP + f.exp));
    for (const [key, c] of cells) {
      const [cid, pid] = key.split(CELL_SEP);
      if (!pid) continue;
      const kind = cid.split(':').pop();
      const n = Object.values(c).reduce((a, b) => a + b, 0);
      if (n < 3) continue;
      const Vv = Object.keys(c).sort();
      const bl = isBool(pid);
      const K = bl ? 2 : Vv.length + 1;
      const allC = cells.get('_all:' + kind + CELL_SEP + pid);
      const allN = allC ? Object.values(allC).reduce((a, b) => a + b, 0) : n;
      let data = 0;
      if (cid.startsWith('_all')) { const B = Math.max(bl ? 2 : Vv.length, 2); for (const v of Vv) if (c[v]) data += c[v] * Math.log2(kt(c, K, v, n) * B); }
      else if (!allC) continue; // no partition-wide reference for this cell — nothing to contrast against
      else for (const v of Vv) if (c[v]) data += c[v] * Math.log2(kt(c, K, v, n) / kt(allC, K, v, allN));
      const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(n, 2)) - idxCost;
      let exp = null, ne = -1;
      for (const v of Vv) if (c[v] > ne) { exp = v; ne = c[v]; }
      if (!bl && ['other', 'none', 'mixed', '?'].includes(exp)) continue;
      if (bl && exp === 'false') { const tot = allN; if (!tot || (allC?.['true'] || 0) / tot < 0.2) continue; }
      const share = ne / n;
      const isNorm = factKey.has(cid + CELL_SEP + pid + CELL_SEP + exp);
      rows.push({
        partition: part.name, cid, pid, exp, share, n, ne, bits: +bits.toFixed(1), isNorm,
        role: /^r(\d+):/.exec(cid)?.[1] ?? null, kind,
        deviants: (sites.get(key) || []).filter(s => s.v !== exp).map(s => `${s.rel}#${s.name}`),
      });
    }
  }
  return { rows, reason: null };
}
// The sub-gate band: practised by a supermajority but below the certification bound, with real support. These
// are the rows a maintainer reads as "a house rule that has not finished spreading".
export const subGate = rows => rows
  .filter(r => !r.isNorm && r.n >= MIN_SUPPORT && r.share >= SUPERMAJORITY && r.share < LAMBDA_BOUND)
  .sort((a, b) => b.share - a.share || b.n - a.n || (a.pid < b.pid ? -1 : 1));
// The identifier a lattice pid or a convention feature is ABOUT — what an aspect draft names, and the thing a
// comparison against a hand-written mechanical rule can match on.
export const identifierOf = pid => {
  const m = /^auto\.([a-z0-9]+):(.*)$/.exec(String(pid));
  return m ? m[2] : null;
};

// ---- the check renderer: one template per RENDERABLE enumerator class ----
//
// The director's steer (counsel memo §2 B1, §4): where a convention's `check` descriptor has a renderable
// enumerator class, render a DETERMINISTIC `check.mjs` against Yggdrasil's `check(ctx)` contract — never prose.
// Prose is reserved for what has no shape, and each prose aspect says which class it fell out of and why.
//
// `errs: under` IS EARNED, NOT DECLARED. Every template below obeys one discipline: report a violation only
// where the tree PROVES the negation. A rule "methods here return `Promise`" fires on a method that declares a
// DIFFERENT return type, and stays silent on a method that declares none — a missing annotation is a language
// or a style question, not evidence against the rule. A rule "files here never import X" fires only where the
// import is actually present. Under-firing is the deliberate error direction; ticket 097 measures it.
//
// Grain and Yggdrasil parse with the same tree-sitter grammars, so a rendered check reads the same tree grain
// counted. Where a language's grammar names a field differently the check sees no evidence and stays silent —
// again, under.
// grain's name-shape alphabet (`nameShape`, engine/core.mjs): `U` a run of uppercase, `a` a run of
// lowercase/digits, `_ - $ .` themselves, `?` anything else, and `(XY)+` a repeated pair. A shape compiles to
// an anchored regex mechanically; a shape carrying `?` does not compile at all (that is an answer, not a gap).
export function shapeToRegex(shape) {
  if (!shape || /\?/.test(shape)) return null;
  const toks = shape.match(/\([^)]+\)\+|./g) || [];
  const atom = ch => (ch === 'U' ? '[A-Z]+' : ch === 'a' ? '[a-z0-9]+' : /[_\-$.]/.test(ch) ? ch.replace(/[.$\-]/g, '\\$&') : null);
  let out = '';
  for (const t of toks) {
    const g = /^\((.+)\)\+$/.exec(t);
    if (g) {
      let inner = '';
      for (const ch of g[1]) { const a = atom(ch); if (!a) return null; inner += a; }
      out += `(?:${inner})+`;
    } else { const a = atom(t); if (!a) return null; out += a; }
  }
  return `^${out}$`;
}
// The node types each language's grammar uses for the construct a template needs. Deliberately a REGEX over
// node-type names rather than a per-language table: the shipped grammars agree on the words, and a grammar that
// does not match simply yields no evidence (under).
const NT = {
  import: '/(^|_)(import|use_declaration|using_directive|include|require)/',
  call: '/^(call_expression|call|method_invocation|invocation_expression|function_call_expression|macro_invocation)$/',
  deco: '/(decorator|attribute|annotation)/',
  heritage: '/(heritage|extends|superclass|base_list|implements|impl_item|superclasses)/',
  decl: '/(function|method|class|interface|struct|enum|type_alias)_(declaration|definition|item|specifier)|method_signature|function_signature/',
  typeDecl: '/^(class_declaration|class_definition|class_specifier|interface_declaration|type_alias_declaration|enum_declaration|enum_specifier|enum_item|struct_item|struct_specifier|trait_item|record_declaration|object_declaration|type_declaration|type_item)$/',
  funcDecl: '/^(function_declaration|function_definition|function_item|function_signature|method_definition|method_declaration|method_signature)$/',
};
// The header's second paragraph states the aspect's STATUS, and every check is written before its status is
// known — a drill has not run yet. `promoteEnforceableAspects` rewrites this paragraph in place when a drill
// earns `enforced` or `advisory`, so the sentence a maintainer reads at the top of the file is never the
// opposite of what Yggdrasil is doing with it. The third sentence (the `errs: under` contract) is the same
// in all three and is kept out of the swapped text.
export const DRAFT_NOTE = `// DRAFT: this aspect is \`status: draft\`, so the runner never executes this check. Read it, decide whether the
// rule is real, then promote it.`;
export const statusNote = status => (status === 'enforced'
  ? `// ENFORCED: a real \`yg drill\` on this repository's own code caught a violation with this check and raised no
// false alarm, and its convention cleared grain's certification bound, so \`yg check\` runs it and a refusal blocks.`
  : status === 'advisory'
    ? `// ADVISORY: a real \`yg drill\` on this repository's own code caught a violation with this check and raised no
// false alarm, but its convention sits BELOW grain's certification bound, so \`yg check\` runs it and a refusal
// warns without blocking. Whether it should become law is the maintainer's refactor decision.`
    : DRAFT_NOTE);
const PROVENANCE = p => `// PROVENANCE — grain measured this, it did not decide it.
//   ${p.replace(/\n/g, '\n//   ')}
//
${DRAFT_NOTE}
// \`errs: under\` is the contract this template keeps: it reports only where the
// syntax tree proves the negation, and stays silent where the language gives it nothing to read.`;
// Every template shares one skeleton so the contract (sync, Violation[], guard on file.ast) is identical.
const wrap = (prov, body, helpers = '') => `import { walk, report } from '@chrisdudek/yg/ast';

${PROVENANCE(prov)}
${helpers}
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
${body}
  }
  return violations;
}
`;
export function renderCheck(spec) {
  const { enumerator, argument, expected, provenance } = spec;
  const A = JSON.stringify(String(argument ?? ''));
  const wants = String(expected) === 'true';
  switch (enumerator) {
    // MATCHING THE SPECIFIER. The first version of this template looked for the specifier only INSIDE QUOTES
    // (`'x'`, `"x"`, `` `x` ``). That is how JavaScript, TypeScript and Go spell an import and how almost
    // nothing else does: Java writes `import jakarta.persistence.Entity;`, Python `import os`, Rust
    // `use serde::Serialize;`, C# `using System;`, all unquoted — so on every one of those languages the check
    // matched nothing, refused nothing, and MISSED every `violates-` case in its own drill corpus. Measured
    // (ticket 101, spring-petclinic): 17 of 38 rendered checks were `imp` checks, every one of them scored
    // 0 refusals on the repository and 4-5/5 MISS on its own corpus. The specifier is now matched as a bounded
    // token anywhere in the import statement's text, which covers the quoted spelling as well (a quote is not
    // an identifier character) without matching a longer name that merely contains it (`os` does not match
    // `import osmosis`, and `java.util.List` does not match `import java.util.ArrayList`).
    case 'imp':
      return wrap(provenance, `    if (!file.ast) continue;
    const SPEC = ${A};
    const SPEC_RE = new RegExp('(^|[^A-Za-z0-9_$.])' + SPEC.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '($|[^A-Za-z0-9_$])');
    let sawAnyImport = false, sawSpec = null;
    walk(file.ast.rootNode, n => {
      if (!${NT.import}.test(n.type)) return;
      sawAnyImport = true;
      if (SPEC_RE.test(n.text)) sawSpec = n;
    });
    if (${wants}) {
      // under: only a file that DOES import things, and not this one, is evidence against the rule.
      if (sawAnyImport && !sawSpec) violations.push({ file: file.path, line: 1, column: 0, message: 'expected an import of ' + SPEC + ' here (proposed rule, not yet reviewed)' });
    } else if (sawSpec) {
      violations.push(report(file, sawSpec, 'this rule proposes that ' + SPEC + ' is not imported here (proposed rule, not yet reviewed)'));
    }`);
    case 'call':
      return wrap(provenance, `    if (!file.ast) continue;
    const NAME = ${A};
    let sawAnyCall = false; const hits = [];
    walk(file.ast.rootNode, n => {
      if (!${NT.call}.test(n.type)) return;
      sawAnyCall = true;
      const callee = (n.namedChild(0) ? n.namedChild(0).text : '').replace(/\\s+/g, '');
      if (callee === NAME) hits.push(n);
    });
    if (${wants}) {
      if (sawAnyCall && !hits.length) violations.push({ file: file.path, line: 1, column: 0, message: 'expected a call to ' + NAME + ' here (proposed rule, not yet reviewed)' });
    } else for (const n of hits) violations.push(report(file, n, 'this rule proposes that ' + NAME + ' is not called here (proposed rule, not yet reviewed)'));`);
    case 'deco':
      return wrap(provenance, `    if (!file.ast) continue;
    const NAME = ${A};
    let sawAny = false; const hits = [];
    walk(file.ast.rootNode, n => {
      if (!${NT.deco}.test(n.type)) return;
      sawAny = true;
      if (new RegExp('(^|[^A-Za-z0-9_])' + NAME.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '\\\\b').test(n.text)) hits.push(n);
    });
    if (${wants}) {
      if (sawAny && !hits.length) violations.push({ file: file.path, line: 1, column: 0, message: 'expected the marker ' + NAME + ' here (proposed rule, not yet reviewed)' });
    } else for (const n of hits) violations.push(report(file, n, 'this rule proposes that ' + NAME + ' is not used here (proposed rule, not yet reviewed)'));`);
    case 'extends':
      return wrap(provenance, `    if (!file.ast) continue;
    const NAME = ${A};
    let sawAny = false; const hits = [];
    walk(file.ast.rootNode, n => {
      if (!${NT.heritage}.test(n.type)) return;
      sawAny = true;
      if (new RegExp('\\\\b' + NAME.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '\\\\b').test(n.text)) hits.push(n);
    });
    if (${wants}) {
      if (sawAny && !hits.length) violations.push({ file: file.path, line: 1, column: 0, message: 'expected a declaration extending ' + NAME + ' here (proposed rule, not yet reviewed)' });
    } else for (const n of hits) violations.push(report(file, n, 'this rule proposes that nothing here extends ' + NAME + ' (proposed rule, not yet reviewed)'));`);
    case 'returns':
      return wrap(provenance, `    if (!file.ast) continue;
    const NAME = ${A};
    const re = new RegExp('\\\\b' + NAME.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '\\\\b');
    walk(file.ast.rootNode, n => {
      const rt = n.childForFieldName ? n.childForFieldName('return_type') : null;
      if (!rt) return; // under: a declaration with no declared return type is no evidence either way
      const hit = re.test(rt.text);
      if (hit !== ${wants}) violations.push(report(file, rt, ${wants ? "'expected a declared return type of ' + NAME + ' here'" : "'this rule proposes that nothing here declares a return type of ' + NAME"} + ' (proposed rule, not yet reviewed)'));
    });`);
    case 'nameshape': {
      const re = shapeToRegex(String(expected));
      // A name-shape rule is about ONE kind of declaration. Rendering it over every declaration node breaks the
      // `errs: under` contract by construction, and did: drilled on the pattern repo the first version produced
      // 4 FALSE-ALARMs out of 5 cases on a single rule, refusing files for methods a rule about TYPES never
      // spoke about. So the template exists only for the kinds whose grammar node types can be named exactly,
      // and every other kind falls through to prose.
      const forKind = { type: NT.typeDecl, method: NT.funcDecl }[spec.kind];
      if (!re || !forKind) return null;
      return wrap(provenance, `    if (!file.ast) continue;
    walk(file.ast.rootNode, n => {
      if (!${forKind}.test(n.type)) return;
      const nm = n.childForFieldName ? n.childForFieldName('name') : null;
      if (!nm || !nm.text) return;
      if (!SHAPE.test(nm.text)) violations.push(report(file, nm, 'name ' + nm.text + ' does not follow the shape this rule proposes (' + ${JSON.stringify(String(expected))} + ') (proposed rule, not yet reviewed)'));
    });`, `const SHAPE = ${new RegExp(re).toString()};\n`);
    }
    case 'filenameshape': {
      const re = shapeToRegex(String(expected));
      if (!re) return null;
      // THE SHAPE IS THE STEM'S, NOT THE BASENAME'S. grain measures `auto.filenameshape` as
      // `nameShape(basename(rel, extname(rel)))` (`core.mjs`) — the name with its LAST extension removed — and
      // the compiled shape is anchored (`^...$`), so testing it against the basename can never match a file
      // that has an extension at all. Measured (ticket 101, spring-petclinic): both rendered `filenameshape`
      // checks refused 100% of the files in their own scope, and the one whose corpus had `satisfies-` cases
      // FALSE-ALARMED on 5 of 5 — on the very files grain had certified as conforming. The stem is computed
      // here exactly as node's `basename(b, extname(b))` computes it, dotfiles included.
      return `${PROVENANCE(provenance)}
const SHAPE = ${new RegExp(re).toString()};

// grain measured this shape on the file name with its last extension removed; match what it measured.
const stemOf = b => { const i = b.lastIndexOf('.'); return i > 0 ? b.slice(0, i) : b; };
// A NAME THE LANGUAGE ITSELF FIXES IS NOT A NAME A CONVENTION CAN GOVERN. package-info.java has no other
// spelling, so refusing it for not being PascalCase is a rule at odds with Java. Same table the proposal used
// to leave these files out of the rule's population, carried here so the check agrees with the count beside it.
const MARKER_STEMS_BY_EXT = ${JSON.stringify(MARKER_STEMS_BY_EXT)};
const isMarker = b => { const i = b.lastIndexOf('.'); return i > 0 && (MARKER_STEMS_BY_EXT[b.slice(i).toLowerCase()] || []).includes(b.slice(0, i)); };

export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    const base = file.path.split('/').pop();
    if (isMarker(base)) continue;
    if (!SHAPE.test(stemOf(base))) violations.push({ file: file.path, line: 1, column: 0, message: 'file name ' + base + ' does not follow the shape this rule proposes (' + ${JSON.stringify(String(expected))} + ') (proposed rule, not yet reviewed)' });
  }
  return violations;
}
`;
    }
    case 'lex': {
      // the lexical layer: an exact, content-only reading of the same two surfaces grain measures
      if (argument === 'indent') {
        const m = /^space(\d+)$/.exec(String(expected));
        const unit = m ? `' '.repeat(${m[1]})` : "'\\t'";
        return `${PROVENANCE(provenance)}
const UNIT = ${unit};

export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    const lines = file.content.split('\\n');
    for (let i = 0; i < lines.length; i++) {
      const lead = /^[ \\t]*/.exec(lines[i])[0];
      if (!lead || !lines[i].slice(lead.length)) continue;         // blank or unindented — no evidence
      if (${m ? 'lead.includes("\\t")' : '/^ +/.test(lead)'}) {     // under: only a PROVABLY different unit fires
        violations.push({ file: file.path, line: i + 1, column: 0, message: 'this rule proposes ${String(expected)} indentation here (proposed rule, not yet reviewed)' });
        break;
      }
    }
  }
  return violations;
}
`;
      }
      if (argument === 'quote') {
        const wantSingle = String(expected) === 'single';
        return `${PROVENANCE(provenance)}
// under: counts complete, same-line string literals only, and fires only where the OTHER quote clearly dominates.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    const single = (file.content.match(/'[^'\\n]*'/g) || []).length;
    const double = (file.content.match(/"[^"\\n]*"/g) || []).length;
    if (single + double < 3) continue;
    const wrong = ${wantSingle ? 'double > single' : 'single > double'};
    if (wrong) violations.push({ file: file.path, line: 1, column: 0, message: 'this rule proposes ${String(expected)} quotes here (proposed rule, not yet reviewed)' });
  }
  return violations;
}
`;
      }
      return null;
    }
    default:
      return null;
  }
}
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
const BOOLEAN_CLASS = new Set(['imp', 'call', 'deco', 'extends', 'returns']);
// WHICH CLASSES SPELL "DOES NOT USE X" WITH `expected: false` (ticket 115) — and so cannot state a prohibition
// from a majority. For every one of these the enumerator names a THING (an import specifier, a callee, a
// marker, a supertype, a declared return type, a syntactic construct, a parameter type) and `false` says only
// that the thing is not there. Nothing about a MAJORITY of absences is a rule: "files in `src/main/java` do not
// import `jakarta.persistence.Entity`" was mined from 24 of 30 files, and the six that do are the entities — so
// the sentence is refuted by the very code it was mined from. Measured on spring-petclinic: 12 of 44 standing
// advisory refusals were of exactly this shape. `nameshape`/`filenameshape`/`lex`/`mods` and the rest are NOT
// here: their `expected` is a VALUE the code carries, so there is no absence to mistake for a prohibition.
const ABSENCE_CLASS = new Set([...BOOLEAN_CLASS, 'has', 'ptype']);
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
const SYMBOL_LEVEL_KIND = new Set(['method', 'type', 'catch', 'finally', 'case']);
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
function scopeCountsFromTreeCache(repo) {
  const treePath = join(repo, '.grain', 'cache', 'tree.json');
  if (!existsSync(treePath)) return null;
  let tree;
  try { tree = JSON.parse(readFileSync(treePath, 'utf8')); } catch { return null; }
  const byFile = new Map();
  for (const [k, v] of Object.entries(tree)) {
    const rel = k.slice(k.indexOf('|') + 1);
    const n = (Array.isArray(v) ? v : v.s || []).length;
    byFile.set(rel, (byFile.get(rel) || 0) + n);
  }
  return byFile;
}
export function computeSizing(repo, nodes, handGraph, handFiles) {
  const scopesByFile = scopeCountsFromTreeCache(repo);
  const bytesOf = rel => { try { return statSync(join(repo, rel)).size; } catch { return 0; } };
  const linesOf = rel => { try { return readFileSync(join(repo, rel), 'utf8').split('\n').length; } catch { return 0; } };
  const sizeOf = fileSet => {
    let bytes = 0, codelengthLines = 0, scopes = 0, files = 0;
    for (const rel of fileSet) {
      files++;
      bytes += bytesOf(rel);
      codelengthLines += linesOf(rel);
      if (scopesByFile?.has(rel)) scopes += scopesByFile.get(rel);
    }
    return { files, bytes, codelengthLines, scopes: scopesByFile ? scopes : null };
  };
  const proposedNodes = nodes.filter(n => !n.organizational).map(n => ({ id: n.id, dir: n.dir, ...sizeOf(n.ownFiles) }));
  let handNodes = null;
  if (handGraph) {
    handNodes = handGraph.nodes.filter(n => Array.isArray(n.mapping) && n.mapping.length).map(n => {
      const set = expandMapping(n.mapping, handFiles, { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map() });
      return { id: n.id, ...sizeOf(set) };
    });
  }
  return {
    instrument: 'sizing/1',
    contextBudgetTokens: 200000,
    contextBudgetSource: 'external constant (Anthropic\'s published context window for Sonnet/Opus) — not measured, not tuned, not a Grain number',
    scopesAvailable: !!scopesByFile,
    proposedNodes, handNodes,
  };
}

// ==================================================================================================
// 8. The renderer.
// ==================================================================================================

// ---- the four file sets `propose` writes, each in its own function ----
//
// `propose` below reads its inputs, builds the model, and then writes four things: the architecture, the
// nodes, the aspects with their drill corpora, and the charters. Those four are what the section comments
// have always called them; they are functions here so the pipeline reads as the five steps it is rather than
// as one page of interleaved writes. Every body is unchanged, and `ev` — the one shared piece of state, the
// evidence recorder — is passed in rather than closed over, so each function's whole effect is in its
// signature: the directory it writes into, what it needs, and the counts it hands back.
// The inputs: the tracked files, the export (reused when the caller already has one, spawned otherwise), the
// model cache when there is one, and the predicate-expansion context every `when` is measured against.
function loadInputs(repo, opts) {
  const { files, degraded } = gitFiles(repo);
  let exp;
  if (opts.exportPath) exp = JSON.parse(readFileSync(opts.exportPath, 'utf8'));
  else {
    say(opts, 'running grain export ...');
    // UNDER `cache/`, WHICH IS THE DISPOSABLE HALF. `.grain/.gitignore` ignores `cache/` and nothing else —
    // "everything else in .grain/ is meant to be committed" — so an export written to `.grain/` directly left a
    // multi-megabyte generated file sitting in the committable half of a repository this module promises to
    // treat as read-only, never cleaned up and showing as an untracked change in any repo that already commits
    // its `.grain/`. It is rebuildable state, so it belongs where the rest of the rebuildable state is.
    const out = join(repo, '.grain', 'cache', 'propose-export.json');
    const args = ['export', '--repo', repo, '--out', out, '--compact', '--no-anchors'];
    if (opts.noHistory) args.push('--no-history');
    execFileSync('node', [BIN, ...args], { encoding: 'utf8', maxBuffer: 1 << 29, timeout: 120 * 60_000, stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'inherit'] });
    exp = JSON.parse(readFileSync(out, 'utf8'));
  }
  const cachePath = join(repo, '.grain', 'cache', 'model.json');
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : null;
  const ctx = { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set(), parsed: new Set(cache?.filesAll || []) };
  return { files, exp, cache, ctx, degraded };
}
// `yg-config.yaml` and `yg-architecture.yaml`: what a repository requires (nothing) and the node types.
function writeArchitecture(ygg, { active, alternatives, nodes, rels, files, ev, progressive }) {
  // yg-config.yaml — require nothing. A proposal that turns every unmapped file into a blocking error on day one
  // is a proposal nobody runs twice; `getting-started` §4 says require-nothing is the brownfield default.
  //
  // `progressive` (ticket 118) is the same principle applied to the RULES rather than to coverage: an enforced
  // rule earned its status from a drill that never asked whether the repository already holds it, so on day one
  // it blocks on code nobody in this change wrote. With the block set, `yg check` blocks only on what the
  // current change reaches; the pre-existing sites are still listed and still counted, as warnings, and
  // `yg check --full` blocks on all of them again. It is left out entirely where the repository gave nothing to
  // derive — a block that names no reference is refused by Yggdrasil rather than silently ignored.
  write(join(ygg, 'yg-config.yaml'), preambleComment() + yamlEmit({
    version: SCHEMA_VERSION,
    coverage: { required: [], excluded: [] },
    auto_approve: false,
    quality: { max_direct_relations: Math.max(10, ...nodes.map(n => n.relations.length)) },
    ...(progressive?.reference ? {
      '#e': `progressive: measure a change against \`${progressive.reference}\` — ${progressive.why}. An enforced rule this change did not reach is reported as a warning instead of blocking; \`yg check --full\` blocks on all of it again. Remove this block to answer for the whole repository on every run.`,
      progressive: { reference: progressive.reference },
    } : {}),
  }));

  // yg-architecture.yaml
  const nodeTypes = {
    project: { '#e': ev('type', 'project', 'organizational root; no `when`, classifies nothing', { level: 'organizational' }), description: 'Top-level grouping — root of the hierarchy. One per repository.', parents: [] },
    // `module` is the organizational grouping the renderer inserts wherever a directory has to exist as a node
    // but owns no files of its own. Such a node is routinely a CHILD of a classifying type's node (a `module`
    // named `src/main` under the node for the `src` type), so every active type is an allowed parent — derived
    // from the cut this run actually made, not chosen. Measured (ticket 101): without this, a staged `yg check`
    // on spring-petclinic reported `parent-type-forbidden` — "Node 'src/main' (type 'module') has parent 'src'
    // of type 'src', which is not an allowed parent type" — a blocking error in the proposal's own graph.
    module: { '#e': ev('type', 'module', 'organizational grouping; no `when`, classifies nothing', { level: 'organizational' }), description: 'Domain grouping — organizes children under shared domain responsibility.', parents: ['project', 'module', ...active.map(a => a.id)] },
  };
  for (const a of active) {
    const targets = uniq([...(rels.uses.get(a.id) || new Map()).keys()]).sort();
    const deny = rels.denies.find(d => d.fromType === a.id);
    // WHAT THE PREDICATE ACTUALLY SELECTS, said as a match and a miss rather than as a coefficient (ticket
    // 109). The same three numbers as before — selected, overlap, total — plus the Jaccard the earlier line
    // led with, kept at the tail and named, because `J=0.62` is not a fact a maintainer can act on and
    // "selects 31 files, 12 of which the evidence never named" is.
    const hit = intersectSize(a.files, a.selected);
    const line = `\`${a.rootGlob ? '*' : `${a.dir}/**`}\` selects ${a.selected.size} of ${files.length} tracked files; ${hit === a.files.size && hit === a.selected.size ? `exactly the ${hit} the evidence names` : `${hit} of them are among the ${a.files.size} the evidence names, ${a.selected.size - hit} are not`} (Jaccard ${a.fidelity.toFixed(2)}) · ${a.why}`
      // the LEVEL this cut came from and the intrinsic numbers behind it (ticket 110), appended to the line
      // 109 already wrote rather than replacing it: the two answer different questions about the same type.
      + (levelSentence(a, alternatives) ? ` · ${levelSentence(a, alternatives)}` : '');
    const relBlock = {};
    if (targets.length) relBlock.uses = targets;
    if (deny) relBlock.default = 'deny';
    // A TYPE IS A CLASSIFIER, AND ITS `relations:` ARE THE ONE OBLIGATION IT CARRIES. Yggdrasil constrains a
    // relation type the moment a list is given for it ("the validator then rejects any target not in that
    // list" — `yg knowledge read ports-and-relations`), and refuses a node that depends on a node it has not
    // declared a relation to (`relation-undeclared-dependency`, always an error). So where this renderer
    // writes a `uses:` list, the description says what the list MEANS for an agent about to add an import,
    // instead of naming the miner's cut it came from.
    const mayUse = targets.length
      ? ` Code of this type may depend on ${targets.map(t => `\`${t}\``).join(', ')}${deny ? ' and on nothing else' : ''} — \`yg check\` refuses a dependency on any other node until the architecture declares it.`
      : deny ? ' This type declares no outgoing dependency, and none is allowed — `yg check` refuses the first one until the architecture declares it.' : '';
    nodeTypes[a.id] = {
      '#e': ev('type', a.id, line, { level: a.source, levels: a.levels || [a.source], dir: a.dir, evidenceFiles: a.files.size, selects: a.selected.size, fidelity: +a.fidelity.toFixed(3), intrinsic: a.evidence || null }),
      description: `${a.dir ? `Put a file under \`${a.dir}/\`` : 'Put a file at the repository root itself'} only if it belongs to this type: a file placed there is classified here with no further step, and every rule attached to this type applies to it from that moment.${mayUse || (a.aspectIds?.length ? '' : ' No rule and no relation are attached to this type yet, so today it constrains nothing — it is where they will attach.')}`,
      when: a.when,
      // a nested type's node sits under its ancestors' nodes, and Yggdrasil rejects a parent whose type is not
      // listed here (`parent-type-forbidden`) — so every ancestor type is an allowed parent, by construction
      parents: ['project', 'module', ...active.filter(b => b.dir && a.dir && b.dir !== a.dir && a.dir.startsWith(b.dir + '/')).map(b => b.id)],
      ...(Object.keys(relBlock).length ? { relations: relBlock } : {}),
      // Bare ids, deliberately — no explicit `status:` override at this attach site (channel 3). This block is
      // written before an aspect's OWN final status is known (verification runs later, once check.mjs and its
      // drill corpus are on disk), and an explicit override here would need to track it exactly: any override
      // LOWER than the aspect's own eventual default is `aspect-status-downgrade`, a validator error (`yg
      // schemas read architecture` — "bump up OK, downgrade is validator error"). Found on sight rendering
      // Yggdrasil's own proposal once `promoteEnforceableAspects` started promoting some aspects to `enforced`:
      // the old `{ id, status: 'draft' }` form downgraded every one of them right back down, twelve nodes'
      // worth. Omitting `status:` here lets the cascade rule (effective status = max() across channels 1–6)
      // read the aspect's own default with nothing to disagree with, whatever that default turns out to be.
      ...(a.aspectIds?.length ? { aspects: [...a.aspectIds] } : {}),
    };
    if (targets.length) ev('relations', a.id, `${targets.length} allowed \`uses\` targets, aggregated from ${[...(rels.uses.get(a.id) || new Map()).values()].reduce((x, y) => x + y, 0)} resolved imports out of files of this type`);
    if (deny) ev('deny', a.id, `established negative: \`${deny.from}\` does not reach \`${deny.to}\` (share ${deny.share.toFixed(3)}, ${deny.ne}/${deny.neff} scopes, ${deny.bits.toFixed(1)} bits) AND this type has no resolved outgoing import at all, so the deny contradicts nothing observed`);
  }
  write(join(ygg, 'yg-architecture.yaml'), preambleComment() + yamlEmit({ node_types: nodeTypes }));
}
// `model/<node>/yg-node.yaml`: one per node, mapping and relations.
function writeNodeFiles(ygg, nodes, ev) {
  for (const n of nodes) {
    const relEntries = n.relations.map(r => ({ target: r.target, type: 'uses' }));
    const line = n.organizational ? n.why : `${n.why}; maps ${n.files.size} tracked files; ${n.relations.length} outgoing dependencies from ${n.relations.reduce((a, r) => a + r.n, 0)} resolved imports`;
    ev('node', n.id, line, { files: n.files.size, relations: n.relations.length, organizational: !!n.organizational });
    write(join(ygg, 'model', n.id, 'yg-node.yaml'), preambleComment() + yamlEmit({
      '#e': line,
      name: n.id,
      type: n.type,
      description: n.organizational ? `Parent node for \`${n.id}\` — children own the mappings.` : `Proposed node for \`${n.dir}\`.`,
      // A directory mapping wherever the whole directory is live: Yggdrasil's child precedence then hands each
      // file to the deepest node that claims it, and no file is owned twice. Where a nested project (its own
      // `.yggdrasil/`) removes part of the directory the mapping has to be an explicit list — and an explicit
      // list gets NO child precedence, so every descendant node's files are subtracted here by hand. Measured:
      // without that subtraction the pattern repo produced 591 `file-duplicate-mapping` errors from two nodes.
      ...(n.organizational ? {} : { mapping: n.useDir ? [`${n.dir}/`] : [...n.ownFiles].sort() }),
      relations: relEntries,
    }));
  }
}
// aspects/<id>/ — yg-aspect.yaml, the rule source (check.mjs or content.md), and a drill corpus.
//
// `status` is written TWICE. Every aspect ships `draft` here, first — `yg drill` is not gated by status
// (`yg knowledge read aspect-status`: "draft dormancy applies to `yg check`/`--approve` only"), so `draft` is
// the one value guaranteed valid before this renderer knows a check's own verdict. `promoteEnforceableAspects`
// below rewrites `yg-aspect.yaml` a second time for whatever a REAL drill just confirmed — see the header.
function writeAspectFiles(ygg, repo, aspects, opts, ev) {
  let drillCases = 0, drillDropped = 0;
  for (const a of aspects) {
    ev('aspect', a.id, a.evidenceLine, { reviewer: a.check ? 'deterministic' : 'llm', origin: a.origin, enumerator: a.enumerator, identifier: a.argument ?? null, expected: a.expected ?? null, host: a.host });
    write(join(ygg, 'aspects', a.id, 'yg-aspect.yaml'), preambleComment() + yamlEmit(aspectYamlDoc(a, 'draft')));
    if (a.check) write(join(ygg, 'aspects', a.id, 'check.mjs'), a.check);
    else write(join(ygg, 'aspects', a.id, 'content.md'), a.content);

    const { kept, dropped } = cutDrills(repo, a, opts.holdout);
    // On-disk case counts, not `a.drills`' full deviating/conforming lists (`cutDrills` caps each side at 5) —
    // `promoteEnforceableAspects` below judges the check by what a real drill can actually see.
    a.drillViolatesWritten = kept.violates.length;
    a.drillSatisfiesWritten = kept.satisfies.length;
    const lines = [];
    for (const side of ['satisfies', 'violates']) {
      for (const c of kept[side]) {
        const label = `${side}-${slug(c.rel.replace(/\.[^./]+$/, ''))}`.slice(0, 90);
        write(join(ygg, 'aspects', a.id, 'drills', label, c.rel), c.content);
        lines.push(`- \`${label}/${c.rel}\` — from \`${c.rel}\`${c.name ? ` (\`${c.name}\`)` : ''}${c.born ? `, first seen ${c.born}` : ''}`);
        drillCases++;
      }
      drillDropped += dropped[side];
    }
    if (lines.length) write(join(ygg, 'aspects', a.id, 'drills', 'CORPUS.md'), [
      `# Drill corpus for \`${a.id}\``, '',
      opts.holdout
        ? `**Hold-out: BY TIME, cut at ${opts.holdout}.** Only sites whose first appearance post-dates that date are here; ${dropped.satisfies + dropped.violates} older sites were dropped. The hold-out is by the export's per-site \`lifecycle.firstSeen\` DATE, not by a cut sha — ticket 097 does the sha version and scores it with \`yg drill\`/\`yg simulate\`.`
        : '**Hold-out: NONE.** These cases are cut from the very sites the rule was mined on, so passing this drill proves only that the rendered check reproduces grain\'s own count — it is NOT evidence the rule generalises. Re-cut with `--holdout <YYYY-MM-DD>`; ticket 097 does the held-out version by cut sha.',
      '', `Provenance: ${a.provenance}`, '', ...lines, '',
      'Layout is Yggdrasil\'s: each source file under a `satisfies-*` / `violates-*` directory is one case;',
      'a `violates-*` case MUST be refused and a `satisfies-*` case MUST pass. Score with:', '',
      '```', `yg drill --aspect ${a.id} --dir .yggdrasil/aspects/${a.id}/drills --corpus grain-proposal`, '```', '',
    ].join('\n'));
  }
  return { drillCases, drillDropped };
}
// charter.md — one per proposed node, beside its yg-node.yaml (ticket 100, §7c above). Written here, AFTER
// sizing.json, so every charter can quote its own node's sizing row instead of recomputing it.
function writeCharters(ygg, { nodes, aspects, sizing, exp, nodeOfFile, repo, ev }) {
  const sizingByNode = new Map((sizing.proposedNodes || []).map(s => [s.id, s]));
  const cochangeByNode = nodeCochangePairs(exp, nodeOfFile);
  let chartersWritten = 0, charterLines = 0;
  for (const n of nodes) {
    const md = renderNodeCharter(n, { nodes, aspects, sizingByNode, cochangeByNode, asOf: exp.asOf, repo });
    write(join(ygg, 'model', n.id, 'charter.md'), md);
    // The audit row counts what the charter NAMES, through the same cascade the charter renders (ticket 114).
    // It used to compare an aspect's `host` — a TYPE id — against the node's `id`, a PATH: the category error
    // ticket 112 fixed inside the charter, left behind in the row that reports on it, so every charter row on
    // every repository read "0 hosted aspect drafts" including the ones whose charter names eight.
    const eff = effectiveAspectsForNode(n, nodes, aspects);
    ev('charter', n.id, `charter.md rendered for \`${n.id}\` — ${n.organizational ? 'organizational node' : `${n.files.size} files`}, ${eff.own.length + eff.inherited.length} rules in force here (${eff.own.length} attached at this node's own type, ${eff.inherited.length} inherited from an ancestor), ${(cochangeByNode.get(n.id) || []).length} co-change partners`);
    chartersWritten++; charterLines += md.split('\n').length;
  }
  return { chartersWritten, charterLines };
}
export async function propose(repo, outDir, opts = {}) {
  const { files, exp, cache, ctx, degraded } = loadInputs(repo, opts);
  if (degraded) say(opts, `WARNING: ${degraded}`);

  say(opts, `${repo}: ${files.length} tracked files · ${(exp.partitions || []).length} partitions · ${(exp.conventions || []).length} conventions`);
  const loc = localities(exp, cache, files);
  const { active, alternatives } = buildTypes(exp, loc, files, ctx);
  // deepest wins, matching Yggdrasil's own child precedence (a child node claiming a file inside a directory
  // its parent globs owns that file)
  const byDepth = [...active].sort((a, b) => (a.dir || '').split('/').length - (b.dir || '').split('/').length);
  const typeOfFile = new Map();
  for (const a of byDepth) for (const f of a.files) typeOfFile.set(f, a.id);
  const rels = buildRelations(exp, typeOfFile, active);
  const nestedRoots = nestedProjectRoots(files);
  const { nodes, cycles: nodeCycles, nodeOfFile } = buildNodes(active, exp, nestedRoots);
  say(opts, `types: ${active.length} active · ${alternatives.length} finer alternatives · nodes: ${nodes.length} · ${nodeCycles.length} dependency cycles in the proposed node graph (declared, not hidden — the proposal is red until they are broken)`);

  const lat = await partitionLattice(repo);
  const sub = subGate(lat.rows);
  say(opts, `lattice: ${lat.rows.length} rows${lat.reason ? ` (${lat.reason})` : ''} · ${sub.length} in the sub-gate band`);

  const { aspects, skipped } = buildAspects(exp, active, sub, opts);
  say(opts, `aspect drafts: ${aspects.length} (${aspects.filter(a => a.check).length} rendered as check.mjs, ${aspects.filter(a => !a.check).length} prose) · skipped: ${skipped.unrenderableGroupScoped} unrenderable group-scoped, ${skipped.notARule} not a rule`);

  // ---------------- write ----------------
  const ygg = join(outDir, '.yggdrasil');
  rmSync(ygg, { recursive: true, force: true });
  mkdirSync(ygg, { recursive: true });
  const evidence = [];
  const ev = (kind, id, line, extra = {}) => { evidence.push({ kind, id, evidence: line, ...extra }); return line; };

  // The branch a change is measured against, derived from this repository (ticket 118) — read once here so the
  // config, the report and `--json` all name the same reference and cannot disagree about it.
  const progressive = progressiveReference(repo);
  writeArchitecture(ygg, { active, alternatives, nodes, rels, files, ev, progressive });

  // EVERY CANDIDATE THIS RUN DID NOT ACTIVATE, IN THE AUDIT TRAIL (ticket 110). The active types have carried an
  // `evidence` row since 094; the alternatives were on disk in `alternatives.md` and nowhere in the machine
  // record, so nothing downstream could compare a cut that was made against a cut that was offered. Each row
  // carries the level, the form of the predicate, the type it would be carved out of, and the SAME intrinsic
  // numbers the active types carry.
  for (const alt of alternatives) {
    ev('alternative', alt.id, `${alt.why}${levelSentence({ ...alt, levels: [alt.level] }, []) ? ` · ${levelSentence({ ...alt, levels: [alt.level] }, [])}` : ''}`,
      { level: alt.level, form: alt.form, of: alt.of, selects: alt.selected, fidelity: alt.fidelity, viable: alt.viable, intrinsic: alt.evidence || null });
  }

  writeNodeFiles(ygg, nodes, ev);

  const { drillCases, drillDropped } = writeAspectFiles(ygg, repo, aspects, opts, ev);
  say(opts, `drills: ${drillCases} cases${opts.holdout ? ` (hold-out ${opts.holdout}; ${drillDropped} sites dropped as pre-cut)` : ' (NO hold-out — labelled as such in every CORPUS.md)'}`);

  // Aspect status, earned or not — rulings `prose-aspects-draft-by-default`, `drill-fa-labelling-is-acceptance-
  // not-defect`, `no-catch-rules-stay-draft` (ticket 101/102). Rewrites `yg-aspect.yaml` for whatever a real
  // drill just confirmed, writes every `provenance.json` (deferred until now so it can carry the verdict), and
  // annotates the matching `evidence[]` rows in place. See the header comment for the full rule.
  const verify = promoteEnforceableAspects(aspects, { ygg, outDir, evidence, asOf: exp.asOf, repo, ygBin: opts.ygBin });
  say(opts, verify.haveYg
    ? `verification: ${verify.verified} deterministic aspect(s) drilled against a real Yggdrasil (${verify.ygBin}) — ${aspects.filter(a => a.finalStatus === 'enforced').length} promoted to \`status: enforced\`, ${aspects.filter(a => a.finalStatus === 'advisory').length} to \`status: advisory\` (sub-gate origin, below grain's own certification bound)${verify.timedOut ? `; ${verify.timedOut} drill(s) gave up after ${verify.drillTimeoutMs / 1000}s and left their aspect unverified` : ''}`
    : 'verification: skipped — no Yggdrasil CLI found (set YG_BIN to a built bin.js, or put `yg` on PATH); every deterministic aspect ships `status: draft`, unverified');

  // sizing.json — files/bytes/scopes/codelength per proposed node, and per HAND node when the source repo
  // already carries its own `.yggdrasil/` (see §7.5 above for what is derived vs. an external constant)
  const hasHandGraph = existsSync(join(repo, '.yggdrasil'));
  const handGraphForSizing = hasHandGraph ? readGraph(repo) : null;
  const sizing = computeSizing(repo, nodes, handGraphForSizing, files);
  write(join(outDir, 'sizing.json'), JSON.stringify({ instrument: sizing.instrument, repo, asOf: exp.asOf, ...sizing }, null, 1) + '\n');

  const { chartersWritten, charterLines } = writeCharters(ygg, { nodes, aspects, sizing, exp, nodeOfFile, repo, ev });
  say(opts, `charters: ${chartersWritten} written, avg ${(charterLines / Math.max(1, chartersWritten)).toFixed(1)} lines`);

  // the documents a human actually reads
  const aspectsByDraftReason = {};
  for (const a of aspects) if (a.draftReason) aspectsByDraftReason[a.draftReason] = (aspectsByDraftReason[a.draftReason] || 0) + 1;
  // §class 4 (ticket 120): "a type with nothing attached obliges nothing" — a proposed node type that hosts no
  // aspect (`a.aspectIds`, set by `buildAspects` just above) AND is on neither side of any measured dependency
  // edge (`rels.pairs`, the same edges `writeArchitecture` turns into the graph's own relations) is real coverage
  // — the maintainer still needs the node to see the directory at all — but obliges the code inside it to
  // nothing. Still emitted; only DISCLOSED, in `PROPOSAL.md` and in the report's on-disk line below.
  const typesInRelations = new Set();
  for (const k of rels.pairs.keys()) { const [a, b] = k.split('|'); typesInRelations.add(a); typesInRelations.add(b); }
  const typesWithNoLaw = active.filter(a => (a.aspectIds || []).length === 0 && !typesInRelations.has(a.id));
  const counts = {
    types: active.length, alternatives: alternatives.length, nodes: nodes.length,
    // the cut, by the level each active type was cut at, and the candidates by the level each was offered at
    // (ticket 110) — `typesByLevel` sums to `types` and `alternativesByLevel` to `alternatives`
    typesByLevel: countBy(active, a => a.source), alternativesByLevel: countBy(alternatives, a => a.level),
    aspects: aspects.length, aspectsRenderedAsCheck: aspects.filter(a => a.check).length, aspectsProse: aspects.filter(a => !a.check).length,
    // status split (ticket 102, three-way since ticket 107) — `aspectsActive` (kept named for schema stability;
    // it counts `status: enforced`) is what a plain `yg check` on this proposal BLOCKS on. `aspectsAdvisory`
    // (ticket 107) is the same drilled bar cleared by a sub-gate-lattice origin instead — `yg check` runs the
    // reviewer and records a baseline, but a refusal warns rather than blocks. `aspectsDraft` is everything
    // that never left `draft`, split by WHY (`aspectsByDraftReason`, see `promoteEnforceableAspects`).
    aspectsActive: aspects.filter(a => a.finalStatus === 'enforced').length,
    aspectsAdvisory: aspects.filter(a => a.finalStatus === 'advisory').length,
    aspectsDraft: aspects.filter(a => a.finalStatus === 'draft').length,
    aspectsByDraftReason,
    aspectsVerified: verify.verified, aspectsVerifiedAgainst: verify.haveYg ? verify.ygBin : null,
    aspectsSkippedUnrenderableGroupScoped: skipped.unrenderableGroupScoped, aspectsSkippedNotARule: skipped.notARule,
    // ticket 120, additive: WHY a row was skipped as not-a-rule (`parser-node-type-as-identifier` |
    // `generic-type-parameter-as-domain-type`), same shape as `proseByClass` beside it.
    aspectsSkippedNotARuleByReason: skipped.notARuleByReason, proseByClass: skipped.byClass,
    aspectsAbsenceNotForbiddance: skipped.absence,
    // ticket 120 §class 3, additive: sub-gate rows measured within a role-group cluster narrower than the scope
    // a check would enforce, for which no exact scope (an explicit file list or a shared `content:` predicate)
    // could be derived — these stay `draft`, `draftReason: cluster-narrower-than-scope`, forever unpromotable.
    aspectsClusterNarrowerThanScope: skipped.clusterNarrowerThanScope,
    drillCases, drillHoldout: opts.holdout || null, drillDropped, nodeCycles: nodeCycles.length,
    latticeRows: lat.rows.length, subGate: sub.length, denies: rels.denies.length, denyBacklog: rels.backlog.length,
    sizingHandNodes: sizing.handNodes ? sizing.handNodes.length : null,
    charters: chartersWritten, charterAvgLines: chartersWritten ? +(charterLines / chartersWritten).toFixed(1) : null,
    // ticket 120 §class 4, additive: a proposed node type with no aspect attached AND on neither side of any
    // measured dependency edge — real coverage, but obliges nothing. See `typesWithNoLaw` below for the list.
    typesWithNoLaw: typesWithNoLaw.length,
  };
  write(join(outDir, 'PROPOSAL.md'), renderProposalMd({ repo, exp, files, active, alternatives, nodes, aspects, rels, sub, lat, counts, typesWithNoLaw }));
  write(join(outDir, 'REFACTOR-BACKLOG.md'), renderBacklogMd({ exp, sub, rels, nodeCycles }));
  write(join(outDir, 'alternatives.md'), renderAlternativesMd({ alternatives }));
  // proposal.json — the published, versioned interface (ticket 100, "the proposal contract" in docs/reference.md).
  // `schema`/`engine`/`extractor`/`schemaNotes` are ADDED here, alongside the `instrument`/`repo`/`asOf`/`files`/
  // `counts`/`evidence` fields 094/097/098 already read — nothing existing is renamed or removed, so a reader of
  // last wave's proposal.json keeps working unmodified (docs/reference.md, "additive fields only, never a
  // silent shape change").
  write(join(outDir, 'proposal.json'), JSON.stringify({
    schema: 'grain-proposal/1',
    engine: ENGINE_VERSION,
    extractor: EXTR_V,
    instrument: 'propose/1', repo, asOf: exp.asOf, files: files.length, counts,
    schemaNotes: {
      evidence:
        'one row per emitted element (`kind`: `type` | `alternative` | `relations` | `deny` | `node` | `charter` | `aspect`), `id` names the element, `evidence` is the exact prose a human reads on the file itself (a `# evidence:` YAML comment, or the corresponding line in the rendered .md); everything else on the row is `kind`-specific structured detail (e.g. an `aspect` row carries `enumerator`/`identifier`/`expected`/`host`, plus — ticket 102, three-way since 107 — `status` (`enforced` | `advisory` | `draft`, the same values Yggdrasil\'s own `yg-aspect.yaml` takes) and `draftReason` (`prose-unenforceable-keyless` | `absence-not-forbiddance` | `file-scope-approximation-fa` | `no-catch` | `null`) matching the aspect\'s own `provenance.json`). This is the full audit trail: every element this renderer wrote has exactly one row here. Ticket 110, additive: a `type` row carries `level` (the cut it came from) and `levels` (every level that independently named the same directory), and an `alternative` row — one per candidate the run did NOT activate, previously present only in `alternatives.md` — carries `level`, `form` (`content` | `path` | `list`), `of` (the active type it would be carved out of), `selects`, `fidelity` and `viable`. Both kinds carry `intrinsic`: the oracle-free evidence for that cut — `files`, `importsInside`/`importsCrossing` (resolved imports touching the set, split by whether both endpoints are in it), `cochangeInside`/`cochangeCrossing`, `nameShape`/`nameShapeFiles` (the modal file-name shape and how many files carry it), `mined` (how many of the files grain parsed at all) and `rules` (mined conventions every one of whose sites lies inside the set).',
      counts:
        'summary tallies over the SAME run this proposal.json describes — `typesByLevel`/`alternativesByLevel` (ticket 110) split `types` and `alternatives` by the level each was cut or offered at (`partition` | `module` | `directory` | `domain` | `role group` | `layout`); `aspects` = every drafted aspect (certified-convention + sub-gate-lattice combined), `aspectsRenderedAsCheck`/`aspectsProse` partition it by reviewer kind, `aspectsActive`/`aspectsAdvisory`/`aspectsDraft`/`aspectsByDraftReason` partition it by earned status (ticket 102, three-way since 107 — see `provenance.json`\'s own `status`/`draftReason`): `aspectsActive` counts `status: enforced` (a certified-convention origin that cleared a real drill — nothing stands between the maintainer and turning it on), `aspectsAdvisory` counts `status: advisory` (a sub-gate-lattice origin that cleared the SAME drill but sits below grain\'s own certification bound — a refactor decision, not law; these are the report\'s `candidates`), `aspectsDraft` is everything that never cleared the drill at all. `aspectsVerified`/`aspectsVerifiedAgainst` say how many deterministic aspects a real `yg drill` actually judged this run and against which Yggdrasil binary (`null` when `YG_BIN` was not resolvable — every aspect then ships draft, unverified), `charters`/`charterAvgLines` cover the charter.md written per node (§ below).',
      provenance:
        'NOT inlined here — each `.yggdrasil/aspects/<id>/provenance.json` (same field set as ticket 097\'s law-loop.mjs: aspectId, conventionId, origin, enumeratorClass, identifier, expected, partition, share, n, deviating, asOf, cutSha, cutDate, repo, reviewer, note — PLUS, ticket 102, `status`/`draftReason`/`scopeApproximation`, and, ticket 118, `existingViolations` (the count of sites that break the rule at `asOf` — the same number as `deviating`, named for what it costs on the day the graph is switched on), additive fields law-loop.mjs\'s own replay provenance does not carry) is the per-aspect record; this file\'s `evidence` rows are the prose summary, provenance.json is the structured one a machine reads.',
      sizing:
        'NOT inlined here — `sizing.json` alongside this file carries files/bytes/codelength-lines/scopes per proposed (and, where the source repo already carries its own `.yggdrasil/`, per HAND) node; every node\'s `charter.md` quotes its own row under "## Sizing".',
      charter:
        'one `charter.md` per non-organizational AND organizational node, written beside its `yg-node.yaml` under `.yggdrasil/model/<node>/` — Horde\'s `node.mjs show` reads it verbatim. Sections: what lives here, depends on / used by (module edges with counts), certified conventions (share/n/deviating + status + drill numbers + exemplars), rules inherited from above (ticket 114 — every rule that reaches this node\'s files through Yggdrasil\'s own cascade from an ancestor node or an ancestor node\'s architecture type, each marked with where it is declared), sub-gate candidates, co-change partners, sizing, and the `asOf` sha.',
      familyCandidates:
        'NOT part of this file — `propose.mjs --family-candidates <out.json>` writes a SEPARATE `.family-candidates.json` in the exact shape Yggdrasil\'s `yg advise` (`parseFamilyCandidates`, `advise-nominations.ts`) already accepts; see `buildFamilyCandidates` and docs/reference.md, "The proposal contract".',
    },
    evidence,
  }, null, 1) + '\n');

  return { outDir, active, alternatives, nodes, aspects, rels, sub, lat, evidence, files, exp, counts, nodeCycles, sizing, loc, verify, degraded, progressive };
}

// ---- aspect drafting ----
//
// Two sources, one shape. A CERTIFIED convention is a claim grain is willing to make; a SUB-GATE row is a claim
// it refuses to make and a maintainer still wants to see. Both are rendered the same way: a deterministic check
// where the enumerator class renders, prose where it does not, and in both cases the provenance (share, n, sites,
// asOf) in the description, `status: draft`, and a drill corpus cut from the sites themselves.
//
// `filebirth` is excluded from drafting entirely. "Types here are new" is a statement about the repository's
// history, not about how a file should be written; making it an aspect would be a category error.
// ==================================================================================================
// 7-bis. THE OBLIGATION FORM — the one thing this renderer does to a mined sentence (ticket 109).
//
// `verbalize` (engine/core.mjs) writes a mined fact in the INDICATIVE, because grain's own query surface
// REPORTS what the code does: "methods here are annotated with `[Then]`". An aspect is not a report. It is the
// sentence a future agent session is held to, read cold, months later, with no access to the run that mined it
// and no way to ask what "here" meant. Ticket 101's independent judge read 14 of 20 such rows as "not a rule,
// an observation"; ticket 109 measures whether the WORDING is what costs that, by changing the wording and
// nothing else.
//
// Three things this section deliberately does NOT do:
//   - It re-measures nothing. `share`, `n`, `deviating`, the `check.mjs` body, the id, the scope predicate and
//     the status are the same bytes before and after — 109 diffs every rendered tree round to round to prove
//     it, and a difference outside a prose field fails the round.
//   - It does not touch `verbalize`. Those sentences are grain's OWN report surface (`grain where`, `grain
//     what`, `grain explain`, and the README's examples), read by an agent mid-edit who asked what the code
//     does. One vocabulary, two moods: the miner reports, the aspect obliges.
//   - It adds no hedge. "must" and "may not" are the whole point. A rule that says "should probably" is a rule
//     the next session argues with, which is the failure this section exists to remove.
// ==================================================================================================
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
// ==================================================================================================
// 7a. `provenance.json` — one per rendered aspect (ticket 100 / law-loop-yggdrasil.md §1.2).
//
// SAME FIELD SET 097's `law-loop.mjs` `provenanceFor` writes for a candidate it renders from a CUT export, so a
// consumer (a human, or a future measurement) reads one shape whether the aspect came from a live `propose` run
// or from a held-out replay. The two differ only in HOW the fields are obtained: 097 regex-parses them back out
// of a written `provenance` prose string because it loads a proposal a PAST run already wrote to disk; here the
// renderer has the structured numbers on hand at write time (`a.partition`, `a.share`, `a.n`, `a.deviating` —
// added to the aspect object above for exactly this) and writes them directly, never through a regex.
//
// `status`, `draftReason` and `scopeApproximation` (ticket 102) are ADDED here, not shared with law-loop.mjs's
// own `provenanceFor` — they describe something only a LIVE run with a real `.yggdrasil/` tree on disk can know
// (a real `yg drill` result), which a held-out replay never produces. Additive, per the proposal contract's own
// rule (docs/reference.md): a field gained here is not a shape change to an existing one.
export function provenanceFor(a, { asOf, repo }) {
  return {
    aspectId: a.id,
    conventionId: a.id,
    origin: a.origin,
    enumeratorClass: a.enumerator ?? null,
    identifier: a.argument ?? null,
    expected: a.expected ?? null,
    // 'absence' when this row's class spells "does not use X" and its expected value is `false` — the one
    // direction whose sentence a reader must not read as a prohibition (ticket 115); null otherwise.
    direction: a.direction ?? null,
    partition: a.partition ?? null,
    share: a.share ?? null,
    n: a.n ?? null,
    deviating: a.deviating ?? null,
    // The same number as `deviating`, named for the question a maintainer switching this graph on is actually
    // asking (ticket 118): how much of the code that is already here does this rule refuse on day one? For an
    // `enforced` rule that is what the first `yg check` blocks on unless progressive mode is set; the field is
    // written for every aspect so a consumer never has to know which statuses carry it.
    existingViolations: a.deviating ?? null,
    asOf: asOf || null,
    cutSha: asOf || null, // a live `propose` run has no hold-out cut of its own — the cut IS `asOf` (HEAD)
    cutDate: null,
    repo,
    reviewer: a.check ? 'deterministic' : 'llm',
    note: a.check
      ? 'Generated by grain from measured practice at `asOf`; rendered as a deterministic check.mjs.'
      : 'Generated by grain from measured practice at `asOf`; no template renders this class as a deterministic check, so it ships as prose (content.md) for an LLM reviewer.',
    // 'enforced' | 'advisory' | 'draft' (ticket 107) — the SAME three values Yggdrasil's own `yg-aspect.yaml`
    // `status:` field takes (`yg schemas read aspect`), written here verbatim, not a separate Grain-internal
    // word translated at write time. Absent only if this ran before classification ran at all.
    status: a.finalStatus ?? 'draft',
    // one of 'prose-unenforceable-keyless' | 'absence-not-forbiddance' | 'file-scope-approximation-fa' |
    // 'no-catch', or null when `status` is 'enforced'/'advisory' (nothing to explain) or the aspect was never
    // verified this run (no `YG_BIN`, no drill corpus). 'absence-not-forbiddance' is set BEFORE verification —
    // it is the one reason that says the row was never eligible to earn a status at all (ticket 115).
    draftReason: a.draftReason ?? null,
    // 'file-from-symbol' when the CONVENTION's own subject (`a.kind`) is a symbol inside a file — a method, a
    // type, a catch/finally block — but Yggdrasil reviews this check per FILE; null for a file/module-level
    // convention, where the unit the check runs at and the unit the convention is ABOUT are the same thing.
    scopeApproximation: a.scopeApproximation ?? null,
  };
}
// WHAT THE STATUS DOES, IN ONE SENTENCE, BESIDE THE RULE (ticket 109). `status: advisory` is a word whose
// consequence lives in a knowledge topic (`yg knowledge read aspect-status`) that a session reading one aspect
// file has not opened. The three sentences below are that topic's own table, said in the place the decision is
// made — so an agent asked to obey a rule knows what happens if it does not, and a maintainer deciding whether
// to keep the rule knows what turning it on costs. Nothing else in the file changes by status.
const STATUS_MEANING = {
  enforced: 'This rule is in force: `yg check` reports a file that breaks it as an error and fails.',
  advisory: 'This rule is advisory: `yg check` reports a file that breaks it as a warning and does not fail.',
  draft: 'This rule is not in force yet: `yg check` skips it entirely until someone promotes it out of `draft`.',
};
// The `yg-aspect.yaml` document, shared by the provisional (`draft`, before verification) and final write.
function aspectYamlDoc(a, status) {
  return {
    '#e': a.evidenceLine,
    name: a.name, description: `${a.description} ${STATUS_MEANING[status] || ''}`.trim(), status,
    ...(a.check ? { errs: 'under' } : {}),
    review_by: a.reviewBy,
    scope: a.scope,
  };
}
// ==================================================================================================
// 7a-continued. Aspect status, earned rather than declared (ticket 102, sharpened by ticket 107's ruling
// `enforced-requires-certified-origin`). Sits right after `provenanceFor` (§7a) rather than claiming its own
// top-level number — §7b/§7c below (the family-candidates adapter, `charter.md`) are ticket 100's, unrenumbered.
//
// `status: draft` is where every aspect starts (§ above). `a.finalStatus` below is written directly in
// Yggdrasil's own vocabulary (`enforced` | `advisory` | `draft` — `yg schemas read aspect`), not a separate
// Grain-internal word translated at write time: `provenanceFor` and every evidence row read it verbatim. This
// function is the only place anything leaves `draft`:
//
//   - PROSE (`content.md`) never leaves. Ticket 101 measured its sense rate under a keyless gate at 0% (1305 of
//     1671 proposed aspects on a 17-repo corpus) — a judgment call needs a configured reviewer this renderer
//     cannot assume, so it ships as a candidate for a human decision, always (`prose-unenforceable-keyless`).
//   - A DETERMINISTIC check (`check.mjs`) is judged by a REAL `yg drill` run against the proposal this renderer
//     JUST wrote, in a throwaway staging copy — never against a claim this script computes on its own. `yg
//     drill` needs nothing but a `.yggdrasil/` tree at its cwd (status does not gate it — `yg knowledge read
//     aspect-status`), so the stage is exactly that tree, nothing more.
//     - `FALSE-ALARM > 0` → stays draft, `file-scope-approximation-fa`. Ticket 101 §8.1 traced every remaining
//       FALSE-ALARM in its whole corpus to one shape: the convention's subject is a symbol inside a file (a
//       method, a type), the check's unit is the file, and a drill corpus cut from a SAMPLE of sites mislabels
//       the file. Ruling `drill-fa-labelling-is-acceptance-not-defect`: this is a corpus-labelling artifact, not
//       a defect to chase here, and the fix is to demote, not to relabel — 0 is not a matter of taste, it is the
//       only value at which a keyless CI never blocks on an honest change.
//     - Else, `catches (violates-case refusals) <= 0` → stays draft, `no-catch`. Ruling `no-catch-rules-stay-
//       draft`: a rule nothing can ever be shown to violate does not enforce architecture — it is noise for a
//       future agent session, whatever else is true about it.
//     - Else (0 FALSE-ALARM, >= 1 catch): the drill has proved `check.mjs` CORRECT — but `no-catch-rules-stay-
//       draft` and this drill only ever measure whether the check is right, never whether the rule is ADOPTED.
//       `origin: certified-convention` (the row cleared grain's own MDL/λ certification bound) → `enforced`:
//       nothing stands between the maintainer and turning it on. `origin: sub-gate-lattice` (the row sits
//       BELOW that bound — grain itself refused to certify it; ruling `sub-gate-rows-are-the-product`, a
//       lattice row is a refactor plan, not law) → `advisory` instead: Yggdrasil runs the same reviewer and
//       records the same baseline, but a refusal warns rather than blocks (`yg schemas read aspect`). Ruling
//       `enforced-requires-certified-origin`: on Grain's own young, uncertified repo EVERY sub-gate row that
//       passed this exact drill (22 of 22) would otherwise have gone straight to `enforced`, including rules
//       practised in as little as 67% of sites with a third of sites deviating — turning `yg check` red on a
//       third of the existing code for a rule grain itself would not certify.
//   - No `YG_BIN`, or a check with no drill corpus at all (nothing to run) → stays draft, unverified, no reason.
//     Exactly what this renderer shipped before ticket 102 — the absence of a verdict is not one of the three
//     named reasons above, because none of them fired; nothing here says the check is bad, only that no drill
//     was run to say either way.
// HOW LONG ONE `yg drill` MAY TAKE BEFORE IT IS ABANDONED, AND WHERE THE NUMBER COMES FROM.
//
// `spawnSync` with no `timeout` waits forever. A drill that does not return — a wedged CLI, a filesystem that
// stops answering, a pathological regex in a rendered check — therefore hung `grain propose` itself, silently,
// with no output and nothing to interrupt but the process. A product command may not have that failure mode.
//
// The bound is DERIVED, not chosen. A drill's whole input is bounded by construction: `cutDrills` writes at
// most 5 `satisfies-` and 5 `violates-` cases and skips any source file over 200 KiB, so the work does not grow
// with the size of the repository being proposed on — only the machine and the grammar load vary. Measured on
// the largest proposal this project renders (Yggdrasil's own, 33 deterministic aspects carrying a drill
// corpus): slowest single drill 2148 ms, median 1420 ms. The ceiling is that slowest observed drill x100, so it
// is reached only by a machine two orders of magnitude slower than the one measured on, or by a drill that is
// not progressing at all. A drill that hits it is reported as unverified — the same outcome as any other drill
// that returned no verdict — and the count is disclosed in the report rather than folded in silently.
export const SLOWEST_OBSERVED_DRILL_MS = 2148;
export const DRILL_TIMEOUT_MS = SLOWEST_OBSERVED_DRILL_MS * 100;
//
// `drillTimeoutMs` exists so a test can prove the bound is actually enforced without waiting out the real one;
// nothing in the product passes it, and the default IS `DRILL_TIMEOUT_MS`.
export function promoteEnforceableAspects(aspects, { ygg, outDir, evidence, asOf, repo, ygBin: explicitYgBin, drillTimeoutMs = DRILL_TIMEOUT_MS }) {
  const yg = resolveYg(explicitYgBin);
  const ygBin = yg.label;
  const haveYg = yg.have;
  const stage = join(outDir, '.grain-verify-stage');
  if (haveYg) {
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage, { recursive: true });
    // `yg drill` reads only the aspect's own `check.mjs` and its `drills/{satisfies-*,violates-*}` corpus, both
    // already self-contained copies inside `.yggdrasil/aspects/<id>/` — no repository source tree is needed at
    // all (verified against the real CLI while designing this). A throwaway copy of the tree this renderer just
    // wrote, nothing else, and it is deleted again below whether or not verification ran to completion.
    cpSync(ygg, join(stage, '.yggdrasil'), { recursive: true });
  }

  let verified = 0, timedOut = 0;
  try {
    for (const a of aspects) {
      a.scopeApproximation = (a.check && a.kind && SYMBOL_LEVEL_KIND.has(a.kind)) ? 'file-from-symbol' : null;
      if (!a.check) { a.finalStatus = 'draft'; a.draftReason = a.draftReason || 'prose-unenforceable-keyless'; continue; }
      const violates = a.drillViolatesWritten || 0, satisfies = a.drillSatisfiesWritten || 0;
      if (!haveYg || (!violates && !satisfies)) { a.finalStatus = 'draft'; a.draftReason = null; continue; }
      const r = spawnSync(yg.cmd, [...yg.pre, 'drill', '--aspect', a.id], { cwd: stage, encoding: 'utf8', maxBuffer: 1 << 26, timeout: drillTimeoutMs, killSignal: 'SIGKILL' });
      if (r.error?.code === 'ETIMEDOUT') timedOut++;
      const m = /(\d+) pass\s*·\s*(\d+) MISS\s*·\s*(\d+) FALSE-ALARM/.exec(`${r.stdout || ''}${r.stderr || ''}`);
      if (!m) { a.finalStatus = 'draft'; a.draftReason = null; continue; } // could not verify this run (a spawn failure, or the timeout above) — unverified, not blamed
      verified++;
      const miss = Number(m[2]), falseAlarm = Number(m[3]);
      const catches = violates - miss;
      // The drill's own three numbers, kept on the aspect for whoever renders a report from this run. Nothing
      // on disk reads them (`provenanceFor` names its fields one by one), so a proposal tree is byte-identical
      // with and without this line — ticket 104 needs them to say what an enforced rule actually caught.
      a.drill = { pass: Number(m[1]), miss, falseAlarm, catches, violates, satisfies };
      if (falseAlarm > 0) { a.finalStatus = 'draft'; a.draftReason = 'file-scope-approximation-fa'; }
      else if (catches <= 0) { a.finalStatus = 'draft'; a.draftReason = 'no-catch'; }
      // The drill passed — 0 FALSE-ALARM, >= 1 caught. Whether that earns `enforced` or only `advisory` turns
      // on ORIGIN, not on anything the drill measured (ruling `enforced-requires-certified-origin`): a
      // certified convention cleared grain's own certification bound and is law; a sub-gate-lattice row sat
      // BELOW it — grain itself declined to certify it — and stays a maintainer's refactor decision.
      else { a.finalStatus = a.origin === 'certified-convention' ? 'enforced' : 'advisory'; a.draftReason = null; }
    }
  } finally {
    // Always — a thrown drill invocation must not leave a throwaway copy of the whole proposal sitting in the
    // maintainer's out-dir.
    if (haveYg) rmSync(stage, { recursive: true, force: true });
  }

  for (const a of aspects) {
    // `enforced` and `advisory` both leave `draft` and both need `yg-aspect.yaml` rewritten with the earned
    // status; `draft` aspects keep the file this renderer already wrote above (§7).
    if (a.finalStatus === 'enforced' || a.finalStatus === 'advisory') {
      write(join(ygg, 'aspects', a.id, 'yg-aspect.yaml'), preambleComment() + yamlEmit(aspectYamlDoc(a, a.finalStatus)));
      const checkPath = join(ygg, 'aspects', a.id, 'check.mjs');
      if (existsSync(checkPath)) {
        const text = readFileSync(checkPath, 'utf8');
        if (text.includes(DRAFT_NOTE)) write(checkPath, text.replace(DRAFT_NOTE, statusNote(a.finalStatus)));
      }
    }
    write(join(ygg, 'aspects', a.id, 'provenance.json'), JSON.stringify(provenanceFor(a, { asOf, repo }), null, 2) + '\n');
    const row = evidence.find(e => e.kind === 'aspect' && e.id === a.id);
    if (row) { row.status = a.finalStatus; row.draftReason = a.draftReason || null; }
  }
  return { haveYg, ygBin, verified, timedOut, drillTimeoutMs };
}
// ==================================================================================================
// 7b. The `.family-candidates.json` adapter (ticket 100) — the seam to `yg advise`'s family-without-law class.
//
// Yggdrasil's OWN offline miner (`scripts/family-without-law.mjs`) clusters files by AST structural feature
// vectors and cuts a fitted predicate for a cluster that shares no rule of its own. Grain never re-implements
// that clustering: it already HOLDS the equivalent evidence in a different shape — a ROLE GROUP is exactly a
// structurally-uniform cluster within a partition (093/094's own vocabulary), and `buildTypes` above already
// drafts a generalising `content:` predicate for one (the `-content` alternative) whenever the group's evidence
// supports it (`viable`, § MIN_WHEN_FIDELITY). "A family without a law" in Grain's own terms is precisely a
// role-group alternative that (a) is `viable`, (b) clears the SAME size floor Yggdrasil's miner uses
// (`FAMILY_MIN_MEMBERS`), and (c) has NOT already become a certified convention of its own — i.e. `exp.conventions`
// holds no group-scoped row for that exact group. (a)+(b) is Grain's tightness/size evidence; (c) is what makes
// it a family WITHOUT a law rather than one that already has one.
export function buildFamilyCandidates(alternatives, exp, opts = {}, extra = {}) {
  const minMembers = Number.isFinite(opts.minMembers) ? opts.minMembers : FAMILY_MIN_MEMBERS;
  // `ts` MUST be a parseable calendar instant — Yggdrasil's `parseFamilyCandidates` runs `Date.parse` on it and
  // rejects the whole file (silently, as stale) otherwise. `exp.asOf` is a git SHA, not a date (grain's OWN
  // schemaNotes documents it as such); `exp.indexedAt` is the ISO instant this export was built, which is what
  // "local analysis since <ts>" means in `yg advise`'s rendered nomination. Bug found + fixed on sight
  // (ruling `fix-bugs-on-sight`): an earlier draft of this adapter used `exp.asOf` here and every family it
  // wrote was silently dropped by the freshness gate.
  const asOf = exp.indexedAt || new Date().toISOString();
  const certifiedGroups = new Set(
    (exp.conventions || [])
      .filter(c => c.context?.type === 'group')
      .map(c => `${c.partition}::${c.context.group}`)
  );
  const langOf = members => {
    const counts = new Map();
    for (const rel of members) {
      const m = /\.([A-Za-z0-9]+)$/.exec(rel);
      const ext = m ? m[1].toLowerCase() : 'unknown';
      counts.set(ext, (counts.get(ext) || 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
  };
  const families = [];
  for (const a of alternatives) {
    if (a.kind !== 'role group' || a.form !== 'content' || !a.viable) continue;
    if (!a.members || a.members.length < minMembers) continue;
    // `certifiedGroups` keys by (partition NAME, group id); `a.of` is the host TYPE id (a slug), not the raw
    // partition name, so match on the group-id half only — a group id is a small per-partition ordinal (`r0`,
    // `r1`, ...), and colliding across two DIFFERENT partitions' groups only ever suppresses a family that
    // would otherwise be offered, never fabricates one that has a law.
    const alreadyLawed = a.groupId != null && [...certifiedGroups].some(k => k.endsWith('::' + a.groupId));
    if (alreadyLawed) continue;
    const contentPred = a.when?.all_of?.find(x => x.content)?.content ?? null;
    const scopePath = a.when?.all_of?.find(x => x.path)?.path ?? null;
    families.push({
      id: `family-grain-${slug(a.groupId || a.id)}`.slice(0, 80),
      language: langOf(a.members),
      members: [...a.members].sort(),
      fittedPredicate: { kind: 'regex', value: contentPred || '' },
      scopeFilesDraft: scopePath ? [scopePath] : [],
      evidence: { clusterSize: a.members.length, tightness: a.fidelity ?? 0 },
      _groupId: a.groupId ?? null,
    });
  }
  // (ii) role groups whose membership IS its whole host type — `buildTypes` above never drafts a `-content`
  // ALTERNATIVE for one of these ("the candidate IS the host — nothing finer on offer", §4), because the
  // finer-cut alternative would classify exactly what the type already does. That is not the same thing as
  // "grain found no such family" — grain found the SAME structural cluster, it just cut it as an active TYPE
  // instead of a sub-type. Measured on Yggdrasil's own `family-planted-mono` fixture (5 structurally-identical
  // `*Repository.ts` files under their own directory): without this branch the adapter emitted ZERO families —
  // the fixture's whole point — because the group coincides exactly with its directory's active type. Every
  // group already covered by (i) above is skipped here (`seenGroupIds`) so a group never emits twice.
  const seenGroupIds = new Set(families.map(f => f._groupId).filter(Boolean));
  const { active = [], groups = [] } = extra;
  for (const g of groups) {
    const gid = g.group?.id;
    if (gid == null || seenGroupIds.has(gid)) continue;
    if (g.files.size < minMembers) continue;
    if ([...certifiedGroups].some(k => k.endsWith('::' + gid))) continue;
    const host = active.find(a => a.dir && jaccard(g.files, a.files) >= 0.9);
    if (!host) continue; // not coincident with any active type — (i) above should have offered it as an alternative instead
    const cr = contentRegexFor(g.group);
    if (!cr) continue;
    seenGroupIds.add(gid);
    families.push({
      id: `family-grain-${slug(gid)}`.slice(0, 80),
      language: langOf([...g.files]),
      members: [...g.files].sort(),
      fittedPredicate: { kind: 'regex', value: cr.regex },
      scopeFilesDraft: [`${host.dir}/**`],
      evidence: { clusterSize: g.files.size, tightness: 1 }, // exact match to the host type — the strongest fit this adapter reports
    });
  }
  for (const f of families) delete f._groupId;
  // PREDICATE FIT (ticket 101). A family handed to `yg advise` is a PAIR — a member list and the fitted
  // predicate that is supposed to describe it — and `yg advise` renders the predicate as the draft scope a
  // maintainer would adopt. A member the predicate does not actually select is therefore a claim the file
  // itself refutes, and the adapter has the file on disk, so it can check rather than assert. Measured before
  // this gate existed: on `family-planted-polyglot` the TS family carried 6 members (the 5 planted repositories
  // plus the `ConfigLoader.ts` decoy the fixture's README says must never join a cluster) and its predicate
  // selected NONE of them. Members that do not select are dropped; a family left under the size floor is
  // dropped whole, because a family below the floor is exactly what `FAMILY_MIN_MEMBERS` says is an anecdote.
  // Nothing is widened here — this gate can only ever remove.
  const fitted = [];
  const dropped = { members: 0, families: 0 };
  for (const f of families) {
    if (!extra.repo || !f.fittedPredicate?.value) { fitted.push(f); continue; }
    let re;
    try { re = new RegExp(f.fittedPredicate.value); } catch { fitted.push(f); continue; }
    const keep = f.members.filter(rel => {
      let text;
      try { text = readFileSync(join(extra.repo, rel), 'utf8'); } catch { return true; } // unreadable ⇒ no evidence against it
      return re.test(text);
    });
    dropped.members += f.members.length - keep.length;
    if (keep.length < minMembers) { dropped.families++; continue; }
    fitted.push({ ...f, members: keep, evidence: { ...f.evidence, clusterSize: keep.length } });
  }
  fitted.sort((x, y) => (x.id < y.id ? -1 : 1));
  return { v: 1, ts: asOf, families: fitted, _fit: dropped };
}

// ==================================================================================================
// 7c. `charter.md` — one per proposed node, beside `yg-node.yaml` (ticket 100, addendum on
// `two-granularities-rules-fine-nodes-ownership-sized`). Horde's `node.mjs show` reads this file VERBATIM from
// `.yggdrasil/model/<node>/charter.md` — no schema of its own, so this is written the way a `where` card reads
// a directory to a human: what lives here, depends on / used by, certified conventions with their evidence,
// exemplars to copy, co-change partners, sizing, and the sha it is all measured as of. Every line carries a
// number or a path; a section with nothing to report says so rather than being omitted, so an owner reading it
// cold knows the difference between "nothing found" and "not measured".
// ==================================================================================================
// Node-level co-change: `exp.cochange` pairs FILES; a node's own partners are the pairs whose two files land in
// two DIFFERENT nodes, aggregated by summing `support` over every such pair — the same aggregation `whereCmd`'s
// directory-level `cochangePartners` does at file granularity, done here at node granularity instead because a
// charter is read by the node's OWNER, who thinks in nodes, not files.
export function nodeCochangePairs(exp, nodeOfFile, top = 5) {
  const agg = new Map();
  const add = (x, y, support) => { const m = agg.get(x) || agg.set(x, new Map()).get(x); m.set(y, (m.get(y) || 0) + support); };
  for (const p of exp.cochange || []) {
    const a = nodeOfFile.get(p.a), b = nodeOfFile.get(p.b);
    if (!a || !b || a === b) continue;
    add(a, b, p.support || 0);
    add(b, a, p.support || 0);
  }
  const out = new Map();
  for (const [id, m] of agg) out.set(id, [...m].sort((x, y) => y[1] - x[1]).slice(0, top).map(([partner, support]) => ({ partner, support })));
  return out;
}
// ==================================================================================================
// 7c-bis. THE CASCADE, AS YGGDRASIL RUNS IT (ticket 114).
//
// A grain proposal attaches every mined rule to a TYPE (`a.host` is a type id, written into
// `yg-architecture.yaml` under `node_types.<type>.aspects`). The node that actually OWNS the files is often a
// nested one whose own type hosts nothing: on spring-petclinic the 30 Java files belong to
// `src/main/java/org`, while all 8 mined rules sit on the `src-main-java` type one level up. Yggdrasil
// resolves that correctly — `yg context --file` lists all 8 — because its cascade
// (`core/graph/aspects.ts`, `iterateAttachments`) walks six channels, in this order:
//
//   1. the node's own `aspects:`            4. an ANCESTOR node's architecture type's `aspects:`
//   2. an ANCESTOR node's own `aspects:`    5. flow aspects
//   3. the node's own architecture type's `aspects:`   6. port-consumption aspects
//
// The charter was per-node and flat, so the owner assigned to the node holding the code read "none certified
// yet at this node" about code governed by eight rules — and the charter is the ONLY file the layer above the
// graph reads (Horde's `node.mjs show` prints it verbatim; nothing there opens `yg-architecture.yaml`).
//
// This walk is the same walk, restricted to the channels a grain proposal can populate. Channels 5 and 6 are
// structurally empty here — this renderer writes no `yg-flow.yaml` and no `ports:` — so they are not walked
// rather than walked and found empty. Channels 1 and 2 ARE walked, off `n.aspectIds`, even though the node
// writer attaches nothing there today: the moment it does, the charter follows without a second edit.
// Ancestors are the node-path chain, ROOT-FIRST, exactly as `collectAncestors` returns it.
//
// Effective STATUS is not recomputed here. Yggdrasil takes max() across the channels that attach an aspect;
// this renderer writes a bare id at every attach site (no `status:` override — see `writeArchitecture`), so
// the only status in play is the aspect's own, which is what each row prints.
const ancestorNodesOf = (n, nodes) => nodes
  .filter(p => p !== n && p.id !== n.id && n.id.startsWith(p.id + '/'))
  .sort((a, b) => a.id.split('/').length - b.id.split('/').length);
export function effectiveAspectsForNode(n, nodes, aspects) {
  const ancestors = ancestorNodesOf(n, nodes);
  const byId = new Map(aspects.map(a => [a.id, a]));
  const seen = new Set();
  const own = [], inherited = [];
  const take = (a, into, via) => { if (!a || seen.has(a.id)) return; seen.add(a.id); into.push(via ? { a, via } : a); };
  for (const id of n.aspectIds || []) take(byId.get(id), own);                                  // channel 1
  for (const a of aspects) if (a.host && a.host === n.type) take(a, own);                       // channel 3
  for (const p of ancestors) for (const id of p.aspectIds || []) take(byId.get(id), inherited, `inherited from ancestor node \`${p.id}\``); // channel 2
  for (const p of ancestors) for (const a of aspects) if (a.host && a.host === p.type) take(a, inherited, `inherited from type \`${p.type}\`, on ancestor node \`${p.id}\``); // channel 4
  return { own, inherited };
}
// One rule, one line, in the words the report and the aspect file already use. `status` is the word Yggdrasil's
// own `yg-aspect.yaml` carries (`yg schemas read aspect`), and the drill numbers are the ones the proposal's
// report prints for the same rule — so a reader meeting a rule in the charter and again in the report meets one
// account of it, not two.
const charterStatusOf = a => a.finalStatus || 'draft';
// A drill with nothing planted (`violates: 0`) says nothing about the check, so the row says nothing about the
// drill — "caught 0 of 0" reads as a failure and is not one.
const charterDrillOf = a => (a.drill?.violates ? ` · drill: caught ${a.drill.catches} of ${a.drill.violates} · ${a.drill.falseAlarm} false alarm(s)` : '');
const charterShareOf = a => (typeof a.share === 'number' ? a.share.toFixed(3) : String(a.share));
export function renderNodeCharter(n, { nodes, aspects, sizingByNode, cochangeByNode, asOf, repo }) {
  const L = [`# Charter — \`${n.id}\``, '', ...PREAMBLE.map(l => (l ? `> ${l}` : '>')), ''];
  // THE CHARTER OPENS WITH WHAT THE NODE OBLIGES, NOT WITH HOW IT WAS CUT (ticket 109). `n.why` is the
  // miner's reason for the grouping; it is still here, one line down, under "grouped because". What a session
  // opening this file needs first is which files it is responsible for and what it may reach.
  L.push(n.organizational
    ? `Organizational node — it owns no file of its own. Every file under \`model/${n.id}/\` belongs to one of its children; attach a rule to the child that owns the file, never here.`
    // A ROOT-GLOB NODE HAS NO DIRECTORY (ticket 109 round 2). `n.dir` is `null` for the type cut from a
    // partition whose files all sit at the repository root, and interpolating it printed "Everything under
    // `null/`" at a maintainer.
    : `${n.dir ? `Everything under \`${n.dir}/\`` : 'Every file that sits at the repository root itself'} is this node's: ${n.files.size} tracked file${n.files.size === 1 ? '' : 's'}${n.ownFiles.size === n.files.size ? ', all of them owned here' : `, ${n.ownFiles.size} owned here and ${n.files.size - n.ownFiles.size} by a nested node below it`}. A rule attached to this node applies to every file it owns.`, '');

  if (!n.organizational) {
    L.push('## What lives here', '', `- ${n.files.size} tracked files mapped to ${n.dir ? `\`${n.dir}/\`` : 'the repository root'}${n.ownFiles.size === n.files.size ? '' : ` (${n.ownFiles.size} owned directly; the other ${n.files.size - n.ownFiles.size} belong to a nested node)`}`);
    const extCounts = new Map();
    for (const f of n.ownFiles) { const m = /\.([A-Za-z0-9]+)$/.exec(f); const ext = m ? m[1] : '(no extension)'; extCounts.set(ext, (extCounts.get(ext) || 0) + 1); }
    const topExts = [...extCounts].sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (topExts.length) L.push(`- file types: ${topExts.map(([e, c]) => `\`.${e}\` ×${c}`).join(' · ')}`);
    if (n.contains?.length) L.push(`- groups: ${n.contains.map(id => `\`${id}\``).join(' · ')}`);
    L.push(`- grouped because: ${n.why}`);
    L.push('');
  }

  L.push('## What this node may depend on', '');
  const dep = n.relations || [];
  const used = nodes
    .filter(x => x !== n)
    .flatMap(x => (x.relations || []).filter(r => r.target === n.id).map(r => ({ from: x.id, n: r.n })))
    .sort((a, b) => b.n - a.n);
  L.push(dep.length
    ? `- may depend on: ${dep.map(r => `\`${r.target}\` (${r.n} resolved import${r.n === 1 ? '' : 's'})`).join(' · ')}. A dependency on any other node is refused by \`yg check\` until it is declared here.`
    : '- may depend on: nothing is declared yet. `yg check` refuses a dependency on another node until it is declared here, so declare the relation before the first import.');
  L.push(used.length
    ? `- depended on by: ${used.map(r => `\`${r.from}\` (${r.n} resolved import${r.n === 1 ? '' : 's'})`).join(' · ')}. Changing what this node exposes breaks them.`
    : '- depended on by: no other node imports this one.', '');

  // An aspect's `host` is the TYPE that carries it in `yg-architecture.yaml`; a node's own `id` is a PATH
  // (`src/main/java`) and `n.type` is that type id (`src-main-java`). Matching the host against the id is
  // a category error that empties every charter the moment a directory name is not already its own slug —
  // and the charter is the one file the layer above the graph reads. `effectiveAspectsForNode` above walks
  // the rest of the cascade, so a node whose OWN type hosts nothing still reads the rules that reach its
  // files from an ancestor (ticket 114).
  const { own: hosted, inherited } = effectiveAspectsForNode(n, nodes, aspects);
  const certified = hosted.filter(a => a.origin === 'certified-convention');
  const subgate = hosted.filter(a => a.origin === 'sub-gate-lattice');
  L.push('## Certified conventions', '');
  if (certified.length) {
    for (const a of certified) {
      L.push(`- ${a.name} — share ${charterShareOf(a)} · n ${a.n} conforming, ${a.deviating} deviating · status \`${charterStatusOf(a)}\`${charterDrillOf(a)} (\`${a.id}\`)`);
      if (a.exemplars?.length) L.push(`  exemplars to copy: ${a.exemplars.map(e => `${e.rel}:${e.line}`).join(', ')}`);
    }
  } else {
    // NEVER A DEAD END WHERE RULES DO REACH THE FILES. "none certified yet at this node" was literally true
    // and practically false on the one node that owns the code: the rules are attached one level up, and the
    // reader is told where to look rather than told there is nothing.
    L.push(inherited.length
      ? `- (none attached at this node itself — but ${inherited.length} rule${inherited.length === 1 ? '' : 's'} reach${inherited.length === 1 ? 'es' : ''} these files from above; they are in **Rules inherited from above** below and they are in force here)`
      : '- (none certified yet at this node)');
  }
  L.push('');
  // The same rules `yg context --file` lists for a file this node owns, arriving through the cascade rather
  // than attached here. Each row says where it comes from, so a reader knows which file to edit to change it.
  L.push('## Rules inherited from above', '');
  if (inherited.length) {
    for (const { a, via } of inherited) {
      L.push(`- ${a.name} — ${via} · status \`${charterStatusOf(a)}\` · share ${charterShareOf(a)} · n ${a.n} conforming, ${a.deviating} deviating${charterDrillOf(a)} (\`${a.id}\`)`);
      if (a.exemplars?.length) L.push(`  exemplars to copy: ${a.exemplars.map(e => `${e.rel}:${e.line}`).join(', ')}`);
    }
    L.push('', 'These are not attached here and cannot be changed here: each one is declared on the type or node named beside it, and applies to every file below it. `yg check` judges this node\'s files against them exactly as it judges the node that declares them.');
  } else {
    L.push('- (no rule reaches this node from an ancestor node or type)');
  }
  L.push('');
  L.push('## Sub-gate candidates — evidence, not yet law', '');
  if (subgate.length) {
    for (const a of subgate) {
      L.push(`- ${a.name} — share ${charterShareOf(a)} · practised in ${a.n} · ${a.deviating} sites do not · status \`${charterStatusOf(a)}\`${charterDrillOf(a)} (\`${a.id}\`)`);
    }
  } else {
    L.push('- (none below the certification bound worth naming)');
  }
  L.push('');

  L.push('## Co-change partners', '');
  const cc = cochangeByNode.get(n.id) || [];
  L.push(cc.length ? cc.map(c => `- \`${c.partner}\` — ${c.support} shared commit${c.support === 1 ? '' : 's'}`).join('\n') : '- (no other node co-changes with this one above the support floor)', '');

  L.push('## Sizing', '');
  const sz = sizingByNode.get(n.id);
  L.push(sz
    ? `- ${sz.files} files · ${sz.bytes} bytes · ${sz.codelengthLines} lines · ${sz.scopes == null ? 'scopes unavailable (no `.grain/cache/tree.json`)' : `${sz.scopes} scopes`} (see \`sizing.json\`)`
    : '- (no sizing recorded — organizational node, or `sizing.json` was not written)', '');

  L.push('## As of', '', `\`${asOf}\`${repo ? ` — ${repo}` : ''}`, '');
  return L.join('\n');
}
// ---- drills, cut from the export's own sites ----
//
// A drill case is one source FILE under a `satisfies-*` / `violates-*` directory (Yggdrasil's corpus layout).
// The counsel memo's hold-out is BY TIME and non-negotiable for the measurement ticket (097); here it is
// available and LABELLED. `--holdout <YYYY-MM-DD>` keeps only sites whose first appearance post-dates the cut,
// using the per-site `lifecycle.firstSeen` the export already carries. Without it every corpus says, in its own
// CORPUS.md, that the rule and the drill are the same data — which is the honest label, not a footnote.
export function cutDrills(repo, aspect, holdout, cap = 5) {
  const kept = { satisfies: [], violates: [] }, dropped = { satisfies: 0, violates: 0 };
  const repoRoot = resolve(repo);
  // A DRILL CASE IS A FILE; A CONVENTION'S SITE IS OFTEN A SCOPE INSIDE ONE. A file holding one conforming
  // method and one deviating method is NOT a `satisfies-` case — the check runs over the whole file and is
  // right to refuse it. Cutting it as `satisfies-` blames the check for the corpus's own mislabelling, and did:
  // 13 of the 13 remaining FALSE-ALARMs on the pattern repo were this, not a defect in any rendered rule.
  // So a file that carries ANY deviating site is a `violates-` case, whatever else it also carries.
  const deviatingFiles = new Set((aspect.drills.violates || []).map(s => s?.rel).filter(Boolean));
  for (const side of ['satisfies', 'violates']) {
    const seen = new Set();
    for (const s of aspect.drills[side] || []) {
      if (!s?.rel || seen.has(s.rel)) continue;
      if (side === 'satisfies' && deviatingFiles.has(s.rel)) continue;
      if (holdout) {
        const born = s.lifecycle?.firstSeen;
        if (!born || born <= holdout) { dropped[side]++; continue; }
      }
      let content;
      // A DRILL CASE IS COPIED OUT OF THE REPOSITORY AND INTO A TREE THE MAINTAINER IS INVITED TO MOVE IN AND
      // COMMIT, so the only thing that may become one is a REGULAR FILE INSIDE the repository. Two refusals,
      // both about the same rule:
      //   - CONTAINMENT. A site path that resolves outside the repository is not this repository's evidence,
      //     whatever produced it. This is the one place a repository-derived string becomes several path
      //     components of a write, so it is the one place the check has to be.
      //   - NO LINKS. `readFileSync` follows a symlink, and git tracks a symlink as an ordinary entry — so a
      //     hostile repository shipping `src/handler.ts -> ../../../.ssh/id_rsa` could hand the proposal the
      //     content of a file it does not contain, in a directory the adopter is being asked to commit.
      //     `lstatSync` does not follow, so a link is simply not a case.
      // Both are silent for the same reason every other unreadable site is: there is no case to cut, so there
      // is nothing to report about one.
      const abs = resolve(repo, s.rel);
      if (abs !== repoRoot && !abs.startsWith(repoRoot + sep)) continue;
      try { const st = lstatSync(abs); if (!st.isFile() || st.size > 200 * 1024) continue; content = readFileSync(abs, 'utf8'); } catch { continue; }
      seen.add(s.rel);
      kept[side].push({ rel: s.rel, content, name: s.name || null, born: s.lifecycle?.firstSeen || null });
      if (kept[side].length >= cap) break;
    }
  }
  return { kept, dropped };
}
function contentMd(c, profile, evidenceLine, whyProse, name) {
  const L = [];
  L.push(...PREAMBLE.map(l => (l ? `> ${l}` : '>')));
  // The heading and "## The rule" are the aspect's OWN `name` — the obligation the reviewer is asked to judge
  // against — not the indicative sentence grain mined it from (ticket 109). A `content.md` whose first line
  // disagrees with the `name:` in the yaml beside it gives the reviewer two rules and no way to pick.
  L.push('', `# ${name}`, '', '## The rule', '', name, '', '## Evidence', '', evidenceLine, '',
    '## Why this is prose and not a check', '',
    `Grain renders a deterministic \`check.mjs\` wherever the convention's class has a shape a syntax tree can`,
    `be asked about. This one does not: ${whyProse || 'no template renders this class'}`,
    'A prose rule costs a reviewer call every time it is answered, and it cannot be replayed or drilled for free.',
    'If you can restate it as a rule about a NAME, delete this aspect and write the check instead.', '');
  if (c.exemplars?.length) {
    L.push('## What passing looks like', '');
    L.push(`Follow \`${c.exemplars[0].rel}\` line ${c.exemplars[0].line}${c.exemplars[0].name ? ` (\`${c.exemplars[0].name}\`)` : ''}.`, '');
  }
  if (profile?.skel) {
    L.push('The shared shape every conforming site anti-unifies to (grain\'s superposition template — the parts', `all ${profile.n} members hold in common, ${pct(profile.coverage ?? 0)} coverage):`, '', '```', profile.skel, '```', '');
  }
  if (c.deviatingSites?.length) {
    L.push('## Sites that do not follow it yet', '');
    for (const d of c.deviatingSites.slice(0, 20)) L.push(`- \`${d.rel}\`${d.name && d.name !== d.rel.split('/').pop() ? ` (\`${d.name}\`)` : ''} — ${d.phrase || 'deviates'}`);
    if (c.deviatingSites.length > 20) L.push(`- … and ${c.deviatingSites.length - 20} more`);
    L.push('');
  }
  L.push('## Before promoting this out of `draft`', '', 'Decide whether this is a RULE or merely a HABIT. Grain measured that the code does this; it cannot know', 'whether it should. If it is a habit, delete this aspect. If it is a rule, say WHY it is a rule here —', 'that sentence is the part no miner can write.', '');
  return L.join('\n');
}
function subGateMd(r, statement, evidenceLine, whyProse, absence = false) {
  const L = [];
  L.push(...PREAMBLE.map(l => (l ? `> ${l}` : '>')));
  // AN ABSENCE ROW IS NOT HEADED "The rule" (ticket 115). Its own sentence says it is not one, and a heading
  // that contradicts the sentence under it is the whole failure this section exists to stop.
  L.push('', `# ${statement}`, '', absence ? '## The observation' : '## The rule', '', statement, '', '## Evidence', '', evidenceLine, '',
    absence ? '## Why this is an OBSERVATION and not a rule' : '## Why this is a DRAFT and not a certified convention', '',
    ...(absence
      ? [`This row reports that ${pct(r.share)} of the population does NOT use the identifier above. A count of`,
        'what is missing is not a prohibition: the minority that DOES use it is very often exactly the code the',
        'identifier is for. So grain refuses to word it as "no file here may ...", renders no check for it, and',
        'holds it out of every status a check could earn — it can be read, and made into a rule by you if it is',
        'one, without ever being enforced by accident.']
      : [`This row is below grain's own gate. It is practised by ${pct(r.share)} of the population, which clears the`,
        "repository's two-thirds supermajority but not the certification bound — so grain refuses to state it as a",
        'fact. That refusal is right for an agent mid-edit and wrong for you: a rule that most of the code follows',
        'and some of it does not is either a rule with a backlog, or a habit to drop. Only you can say which.']), '',
    '## Why this is prose and not a check', '',
    `${whyProse || 'no template renders this class'}`, '');
  if (r.deviants.length) {
    L.push(absence ? '## The sites that DO use it' : '## The sites that do not follow it', '');
    for (const d of r.deviants.slice(0, 30)) L.push(`- \`${d}\``);
    if (r.deviants.length > 30) L.push(`- … and ${r.deviants.length - 30} more`);
    L.push('');
  }
  return L.join('\n');
}
// ---- the human-readable documents ----
function mdTable(head, rows) {
  if (!rows.length) return '_(none)_\n';
  const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)));
  const line = cells => '| ' + cells.map((c, i) => String(c ?? '').padEnd(w[i])).join(' | ') + ' |';
  return [line(head), '|' + w.map(x => '-'.repeat(x + 2)).join('|') + '|', ...rows.map(line)].join('\n') + '\n';
}
function renderProposalMd({ repo, exp, files, active, alternatives, nodes, aspects, rels, sub, lat, counts, typesWithNoLaw = [] }) {
  const L = [];
  const notARuleByReason = counts.aspectsSkippedNotARuleByReason || {};
  L.push('# Proposed `.yggdrasil/` graph', '', ...PREAMBLE, '', '---', '',
    `Repository: \`${repo}\` at \`${(exp.asOf || '').slice(0, 8)}\` · ${files.length} tracked files · grain: ${(exp.partitions || []).length} partitions, ${(exp.moduleGraph?.nodes || []).length} modules, ${(exp.conventions || []).length} certified conventions, ${(exp.edges || []).length} resolved imports.`, '',
    `Proposed: **${active.length} node types**, **${nodes.length} nodes**, **${aspects.length} aspect drafts** (${counts.aspectsRenderedAsCheck} rendered as a deterministic \`check.mjs\`, ${counts.aspectsProse} as prose), **${counts.drillCases} drill cases**, **${alternatives.length} finer type alternatives** you choose between (see \`alternatives.md\`), and a refactor backlog (\`REFACTOR-BACKLOG.md\`).`, '',
    '## What this proposal does NOT contain, counted', '',
    mdTable(['left out', 'count', 'why'], [
      ['group-scoped conventions with no marker', counts.aspectsSkippedUnrenderableGroupScoped, 'the rule holds inside a role group, and the group offers no marker, name shape or shared import to turn into a `content:` predicate. There is no honest way to say WHERE the rule applies, so it is disclosed rather than approximated.'],
      ['history facts that are not rules', notARuleByReason.filebirth || (counts.aspectsSkippedNotARule - Object.values(notARuleByReason).reduce((a, b) => a + b, 0)) || 0, '`filebirth` says "the code here is new". That is a fact about the repository, not about how a file should be written.'],
      ['a parser node type as the identifier', notARuleByReason['parser-node-type-as-identifier'] || 0, 'the value mined is one of the grammar\'s own node type names (`call_expression`, `identifier`, …) — true, checkable, and not anything a developer wrote, so no agent could obey it.'],
      ['a generic type parameter as a domain type', notARuleByReason['generic-type-parameter-as-domain-type'] || 0, 'the value looks like a type parameter (`S`, `V`, `TResult`) and is never declared as a real type anywhere in the repository this export saw — obeyable, but not a rule about the domain.'],
      ['rules about an ABSENCE', 'unknowable', 'a miner of practice leaves no trace of what a repository never does. These must be written by hand.'],
    ]), '',
    `Of the ${aspects.length} drafted, ${counts.aspectsProse} could not be rendered as a check because the convention asserts a SHAPE rather than a name` + (Object.keys(counts.proseByClass || {}).length ? ` — by class: ${Object.entries(counts.proseByClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => `\`${k}\` ${v}`).join(', ')}` : '') + '. Each such aspect says so in its own `content.md`.', '',
    counts.nodeCycles
      ? `**This proposal is RED on \`yg check\`, for one reason:** ${counts.nodeCycles} dependency cycle(s) in the proposed node graph. Yggdrasil cannot express a loop, and the proposal declares every dependency the code contains rather than quietly dropping one. See \`REFACTOR-BACKLOG.md\` §4 — that is the first thing to fix, and it is a finding about the repository, not about the proposal.`
      : 'The proposed node graph is acyclic.', '',
    counts.drillHoldout
      ? `Drills are cut with a TIME HOLD-OUT at ${counts.drillHoldout} (${counts.drillDropped} pre-cut sites dropped), by the export's per-site first-appearance date rather than by a cut sha.`
      : '**Drills carry NO hold-out.** Every case is cut from the sites the rule was mined on, so a passing drill shows only that the rendered check reproduces grain\'s own count. Re-cut with `--holdout <YYYY-MM-DD>`.', '');
  L.push('## Node types', '', mdTable(['type', 'level', 'levels agreeing', 'evidence files', '`when` selects', 'fidelity', 'imports inside', 'grain read', 'rules', 'uses'],
    active.map(a => {
      const m = a.evidence || {};
      const touching = (m.importsInside || 0) + (m.importsCrossing || 0);
      return [`\`${a.id}\``, a.source, (a.levels || [a.source]).join(', '), a.files.size, a.selected.size, a.fidelity.toFixed(2),
        touching ? `${m.importsInside}/${touching}` : 'none either way', `${m.mined ?? 0}/${m.files ?? 0}`, m.rules ?? 0, (rels.uses.get(a.id) || new Map()).size];
    })));
  L.push('', 'Fidelity is the renderer checking its own work: the Jaccard overlap between the file set the evidence',
    'names and the file set the drafted `when` predicate actually selects when expanded against `git ls-files`.',
    'A type below 1.00 selects files the evidence does not name (usually files grain has no grammar for, which',
    'live in the same directory and are correctly classified anyway).', '',
    'THE LEVEL IS PUBLISHED, NOT CHOSEN FOR YOU (ticket 110). `level` is the cut this type came from; `levels',
    'agreeing` names every level that independently landed on the same directory. A finer directory becomes a',
    'type of its own only where it beats the level above it on that level\'s own evidence — strictly more of its',
    'imports stay inside, or grain could read none of its files while it could read the parent\'s. Every',
    'candidate that did not clear that comparison is in `alternatives.md` with the same numbers, grouped by its',
    'own level, so a maintainer can choose a different level per subtree.', '',
    mdTable(['level', 'active types', 'candidates offered'],
      TYPE_LEVELS.filter(l => counts.typesByLevel?.[l] || counts.alternativesByLevel?.[l])
        .map(l => [l, counts.typesByLevel?.[l] || 0, counts.alternativesByLevel?.[l] || 0])), '');
  L.push('## Aspect drafts', '', mdTable(['origin', 'count', 'rendered as `check.mjs`', 'prose'], [
    ['certified convention', aspects.filter(a => a.origin === 'certified-convention').length, aspects.filter(a => a.origin === 'certified-convention' && a.check).length, aspects.filter(a => a.origin === 'certified-convention' && !a.check).length],
    ['sub-gate lattice', aspects.filter(a => a.origin === 'sub-gate-lattice').length, aspects.filter(a => a.origin === 'sub-gate-lattice' && a.check).length, aspects.filter(a => a.origin === 'sub-gate-lattice' && !a.check).length],
  ]), '',
    'Every rendered check carries `errs: under`: it reports a violation only where the syntax tree PROVES the',
    'negation, and stays silent where the language gives it nothing to read. A rule about a declared return type',
    'fires on a declaration that declares a different one and never on a declaration that declares none. That is',
    'a contract the template keeps, not a label — and `yg drill` on the corpus beside each check is how you hold',
    'it to that contract.', '');
  L.push(`The sub-gate half comes from a per-partition lattice of ${lat.rows.length} cells${lat.reason ? ` — ${lat.reason}` : ''}, of which ${sub.length} sit in the band between the repository's own two-thirds supermajority and grain's certification bound. \`grain explain <file>\` shows the same cells for one file at a time as its \`[obs ]\` rows; this is that surface aggregated per partition, which is what a maintainer needs and what no shipped command prints today.`, '');
  L.push('## Established negatives', '',
    'Grain publishes a pair as an established negative when the ABSENCE of the dependency compresses. That is a',
    'statement about what is PRACTICED. An architecture `deny` is a statement about what is PERMITTED. Where the',
    'code contains an import a `deny` would forbid, the two statements are both true about different things —',
    'class (c), undecidable without a human — and the negative stays a backlog line rather than becoming a rule',
    'that contradicts the code.', '',
    mdTable(['from', 'to', 'share', 'became', 'why'],
      [...rels.denies, ...rels.backlog].map(d => [`\`${d.from}\``, `\`${d.to}\``, d.share.toFixed(3), d.becomes, d.whyNot || 'nothing observed contradicts it'])), '');
  // §class 4 (ticket 120): a proposed type that hosts no aspect and is on neither side of any measured
  // dependency edge obliges nothing — still emitted, since the maintainer needs the node to see the directory
  // at all (coverage), but it is not law, and a reader of the graph alone cannot tell that from a type that
  // simply has not been reviewed yet. Named here so they can.
  L.push('## Types with no law', '',
    typesWithNoLaw.length
      ? 'These node types carry no aspect draft and appear on neither side of any measured dependency edge. They are still emitted — the directory needs a node to be reviewable at all — but nothing here obliges the code inside it to anything.'
      : 'Every proposed type either hosts an aspect draft or takes part in a measured dependency edge — none is law-free.', '',
    typesWithNoLaw.length ? mdTable(['type', 'files'], typesWithNoLaw.map(a => [`\`${a.id}\``, a.files.size])) : '', '');
  return L.join('\n') + '\n';
}
function renderAlternativesMd({ alternatives }) {
  const L = ['# Finer type candidates — your choice, not grain\'s', '', ...PREAMBLE, '', '---', '',
    'Every candidate below is a cut of the same tree the active types cut, at a level this proposal did NOT',
    'activate. They are grouped by that level, because ticket 108 measured four hand-written architectures and',
    'no single level won: the module level recovers most of one repository, the directory level most of another,',
    'the role group most of a third. Which level is right for a subtree is the maintainer\'s call, and this file',
    'is the material for it.', '',
    'Each row carries the SAME intrinsic numbers the active types carry in `yg-architecture.yaml` — files, how',
    'much of the import traffic touching the candidate stays inside it, how much of it grain could read at all,',
    'and how many mined rules have every site inside it — so a candidate can be compared against the active type',
    'above it (`of`) without running anything. The `selects` column is the drafted predicate EXPANDED against',
    'the repository, a measured count and not a promise.', '',
    'Nothing here is active. To adopt one: paste its `when` into `yg-architecture.yaml` as a new type, and add',
    'a `not:` for it to the parent type listed in `of`.', ''];
  const head = ['candidate', 'of', 'form', 'group files', 'selects', 'J', 'viable', 'imports inside', 'grain read', 'rules', 'evidence'];
  const row = a => {
    const m = a.evidence || {};
    const touching = (m.importsInside || 0) + (m.importsCrossing || 0);
    return [`\`${a.id}\``, `\`${a.of}\``, a.form, a.groupFiles, a.selected, a.fidelity.toFixed(2), a.viable ? 'yes' : 'no',
      touching ? `${m.importsInside}/${touching}` : 'none either way', `${m.mined ?? 0}/${m.files ?? 0}`, m.rules ?? 0, a.why];
  };
  const LEVEL_NOTE = {
    domain: 'A role group whose members all live under one directory below their host (ticket 116). Its `when` is a path glob, so a file added to that directory joins the type by itself — this is the only alternatives level that generalises on the layout alone.',
    'role group': 'A structurally-uniform cluster inside a partition that is NOT a place in the layout. It can only be a `content:` predicate (which generalises, and may over- or under-select) or a frozen list of paths (exact today, and it will classify no file grain has not already seen). Two types over one directory separated by `content:` have no ordering between them, which is why this level is never activated.',
    directory: 'A directory that carries declarations grain parsed — usually a published directory card — that this run did not promote to a type of its own.',
  };
  for (const level of TYPE_LEVELS) {
    const rows = alternatives.filter(a => a.level === level);
    if (!rows.length) continue;
    L.push(`## Level: ${level} (${rows.length})`, '', ...(LEVEL_NOTE[level] ? [LEVEL_NOTE[level], ''] : []), mdTable(head, rows.map(row)), '');
  }
  const rest = alternatives.filter(a => !TYPE_LEVELS.includes(a.level));
  if (rest.length) L.push(`## Level: other (${rest.length})`, '', mdTable(head, rest.map(row)), '');
  L.push('## The drafted predicates', '');
  for (const a of alternatives) L.push(`### \`${a.id}\``, '', '```yaml', yamlEmit({ when: a.when }).trimEnd(), '```', '', `Level: ${a.level}. ${a.why}`, '');
  return L.join('\n') + '\n';
}
function renderBacklogMd({ exp, sub, rels, nodeCycles }) {
  const L = ['# Refactor backlog', '', ...PREAMBLE, '', '---', '',
    'This is not part of the graph. It is the list of places where the repository disagrees with itself, ranked',
    'by how much of it already agrees. Every row is a decision: spread the rule, or drop it.', ''];

  const convs = (exp.conventions || []).filter(c => (c.deviatingSites || []).length).map(c => {
    const n = c.established || 0, d = (c.deviatingSites || []).length;
    return { c, n, d, adoption: n / Math.max(1, n + d) };
  }).sort((a, b) => b.d - a.d);
  L.push(`## 1. Certified conventions with sites that do not follow them (${convs.length})`, '',
    mdTable(['adoption', 'conforming', 'deviating', 'partition', 'rule'],
      convs.map(x => [pct(x.adoption), x.n, x.d, `\`${x.c.partition}\``, x.c.statement])), '');
  for (const x of convs.slice(0, 12)) {
    L.push(`### ${x.c.statement}`, '', `${pct(x.adoption)} adoption — ${x.d} sites to change:`, '');
    for (const d of x.c.deviatingSites.slice(0, 25)) L.push(`- \`${d.rel}\`${d.name ? ` — \`${d.name}\`` : ''} (${d.phrase || 'deviates'})`);
    if (x.c.deviatingSites.length > 25) L.push(`- … and ${x.c.deviatingSites.length - 25} more`);
    L.push('');
  }

  L.push(`## 2. Candidate house rules below grain's gate (${sub.length})`, '',
    'Practised by a supermajority but not yet by enough of the code for grain to state it as a fact. This is the',
    'sub-gate lattice — the surface `grain explain` shows one file at a time, aggregated per partition.', '',
    // A `false`-direction row of an absence class is listed as what it is (ticket 115). Printed in this table's
    // own idiom it read `files never import X` with `8 sites to fix` beside it — an instruction to delete the
    // eight imports, on evidence that says only that most files here do not have one.
    mdTable(['adoption', 'n', 'partition', 'scope', 'candidate rule', 'sites to fix'],
      sub.slice(0, 80).map(r => [pct(r.share), r.n, `\`${r.partition}\``, r.role !== null ? `role r${r.role}` : 'partition',
        isAbsenceRow(r)
          ? `${r.ne} of ${r.n} ${r.kind}s do not ${describeRow(r.pid, r.exp)} — an absence, not a rule`
          : `${r.kind}s ${describeRow(r.pid, r.exp)}`,
        isAbsenceRow(r) ? '—' : r.deviants.length])), '');

  const twins = (exp.twins || []).filter(t => t.namedDifferently);
  L.push(`## 3. Structural twins — one shape under two names (${twins.length} of ${(exp.twins || []).length} twin pairs are named differently)`, '',
    mdTable(['similarity', 'a', 'b', 'named differently'],
      twins.slice(0, 40).map(t => [t.sim.toFixed(2), `\`${t.a.part}\` ${t.a.label}`, `\`${t.b.part}\` ${t.b.label}`, (t.namedDifferently || []).join(' vs ')])), '');

  const cyc = exp.moduleGraph?.cycles || [];
  L.push(`## 4. Dependency cycles — ${cyc.length} in grain's module graph, ${nodeCycles.length} in the proposed node graph`, '',
    '**THIS IS WHY THE PROPOSAL IS RED.** Yggdrasil refuses a graph whose node relations form a loop',
    '(`structural-cycle`, a blocking error), and the proposal declares every dependency the code contains. Until',
    'a loop below is broken in the CODE — extract a shared interface, invert a dependency, or merge the nodes —',
    'no honest graph over this repository can be green. Cutting the edge out of the proposal instead was tried',
    'and measured: it turned one error that names the real defect into four that ask for the edge back.', '');
  for (const c of cyc) L.push(`- grain's own module cycle: ${c.map(x => `\`${x}\``).join(' → ')} → …`);
  L.push('', mdTable(['weakest edge in the loop', 'resolved imports', 'the loop'],
    nodeCycles.map(d => [`\`${d.from}\` → \`${d.to}\``, d.n, d.cycle.map(x => `\`${x}\``).join(' → ')])), '');

  L.push('## 5. Established negatives that are NOT proposed as `deny`', '',
    'Grain measured that these pairs do not happen. An architecture `deny` says a pair is NOT PERMITTED — a',
    'different statement. Where the code contains an import that a deny would forbid, the negative stays here as',
    'a question for you rather than becoming a rule that contradicts the code. In the three-class vocabulary of',
    'the reconstruction report this is class (c): undecidable without a human.', '',
    mdTable(['from', 'to', 'share', 'why it is not a deny'], rels.backlog.map(d => [`\`${d.from}\``, `\`${d.to}\``, d.share.toFixed(3), d.whyNot])), '');
  return L.join('\n') + '\n';
}
// ==================================================================================================
// 11. The report — what `grain propose` prints, and what `--json` writes.
//
// ONE builder for both surfaces (ticket 104). The text lines and the JSON document are produced from the same
// pass over the same objects, so a fact cannot appear in one and not the other; `tests/cross-check-propose.
// test.mjs` pins that.
//
// THE DEFAULT REPORT IS QUIET (ruling `propose-default-is-quiet`). On Yggdrasil's own proposal 124 aspects are
// drafted and 10 of them earned enforcement — a report in which 92% of the rows are things nobody should act on
// discourages the adopter and undermines the 8% that is true. So the default carries exactly three things, and
// every line of it carries a number or a path:
//
//   1. THE ARCHITECTURE — node types, nodes, relations, dependency cycles. This is the part that loads.
//   2. WHAT EARNED ENFORCEMENT — aspects a REAL `yg drill` promoted to `status: enforced`, each with what it
//      checks and the drill's own numbers (caught / false alarms / corpus size) beside the practice it was
//      mined from (share, n). Ticket 107, ruling `enforced-requires-certified-origin`: earning this section
//      needs the drill AND a `certified-convention` origin — a rule grain's own certification bound cleared.
//      A `sub-gate-lattice` origin that clears the identical drill is real, but not yet law; it lands in (3).
//   3. THE CANDIDATES — first the ADVISORY aspects (ticket 107): a sub-gate-lattice row a real drill proved
//      correct (0 false alarms, >= 1 caught) but that grain itself declined to certify — `sub-gate-rows-are-
//      the-product` calls this a refactor plan, not a rule to switch on unread. Then, folded into the SAME
//      list below them, today's older definition: a DRAFT (any origin, but in practice a false-alarming
//      certified convention) the same real drill still caught at least one violation with — the exact bar
//      `no-catch-rules-stay-draft` sets for a rule to be doing anything at all. Either way a maintainer can
//      act on the line immediately; each one names its origin's yg status word so turning it on reads as the
//      refactor decision it is. It follows that with no drill there are no candidates to rank — which the
//      report says, rather than ranking drafts nobody has judged. No display cap is applied and none is
//      needed: the definition does the cutting.
//
// Everything else — prose drafts, no-catch drafts, finer type alternatives, the conventions skipped as not a
// rule — is written to disk exactly as before and summarised here in ONE counted line naming the file that
// holds it. `--full` prints it all.
export function proposeReport(r, { outDir, root, full = false } = {}) {
  const rel = p => (root && p.startsWith(root + '/') ? p.slice(root.length + 1) : p);
  const out = rel(outDir);
  const ygg = `${out}/.yggdrasil`;
  const c = r.counts;
  const sha = (r.exp?.asOf || '').slice(0, 7);
  const edges = r.nodes.reduce((a, n) => a + n.relations.length, 0);
  // The report says how far a rule already holds in the same words the rule's own file says it (§7-bis), so
  // a maintainer reading the report and then opening the aspect meets one sentence, not two.
  const evidenceOf = a => a.holds || `${a.share == null ? 'share n/a' : pct(a.share)} of ${a.n ?? 0} site(s), ${a.deviating ?? 0} deviating`;
  const aspectPath = a => `${ygg}/aspects/${a.id}/`;
  const caught = a => (a.drill ? a.drill.catches : 0);
  const byStrength = (a, b) => caught(b) - caught(a) || (b.share ?? 0) - (a.share ?? 0) || (b.n ?? 0) - (a.n ?? 0);

  const enforced = r.aspects.filter(a => a.finalStatus === 'enforced').sort(byStrength);
  // candidates (ticket 107): advisory aspects first (sub-gate origin, same drill bar as enforced — a refactor
  // decision, not law), then the older definition folded in below them — a DRAFT the same real drill still
  // caught at least one violation with. Both groups sort strongest-evidence-first WITHIN themselves; advisory
  // sits above legacy because it cleared a strictly higher bar (0 false alarms, not merely >=1 catch).
  const advisory = r.aspects.filter(a => a.finalStatus === 'advisory').sort(byStrength);
  const legacyCandidates = r.aspects.filter(a => a.finalStatus === 'draft' && caught(a) > 0).sort(byStrength);
  const candidates = [...advisory, ...legacyCandidates];
  const rest = r.aspects.filter(a => a.finalStatus === 'draft' && caught(a) <= 0);
  // counted over `rest` alone, not over every draft: a candidate above is also a draft, and a summary line that
  // re-counted it would make the report's own numbers add up to more than the aspects that exist
  const restByReason = {};
  for (const a of rest) { const k = a.draftReason || 'unverified'; restByReason[k] = (restByReason[k] || 0) + 1; }

  // What an enforced rule costs on the day the graph is switched on (ticket 118). `deviating` is the count of
  // sites that break the rule at `asOf`; whether they block depends on the progressive reference the proposal
  // just wrote, so the sentence names the one that applies rather than leaving the reader to work it out.
  const prog = r.progressive || { reference: null, why: null };
  const existingCost = a => {
    const n = a.deviating ?? 0;
    if (!n) return ' · nothing in this repository breaks it today';
    return prog.reference
      ? (n === 1
        ? ' · 1 existing site violates it today; progressive mode keeps it a warning until touched'
        : ` · ${n} existing sites violate it today; progressive mode keeps them as warnings until touched`)
      : ` · the first \`yg check\` will be red on ${n} site${n === 1 ? '' : 's'} that break${n === 1 ? 's' : ''} it today`;
  };

  const aspectJson = a => ({
    id: a.id, statement: a.name, status: a.finalStatus,
    draftReason: a.draftReason || null, reviewer: a.check ? 'deterministic' : 'llm',
    share: a.share ?? null, n: a.n ?? null, deviating: a.deviating ?? null, existingViolations: a.deviating ?? null, node: a.host || null,
    drill: a.drill ? { caught: a.drill.catches, planted: a.drill.violates, falseAlarms: a.drill.falseAlarm } : null,
    path: aspectPath(a),
  });

  const json = {
    schema: 'grain-propose/1',
    outDir: out, repo: root || null, asOf: r.exp?.asOf || null, files: r.files.length, degraded: r.degraded || null,
    // `levels`/`alternativeLevels` (ticket 110, additive): which level each active type was cut at, and which
    // level each candidate the run did not activate was offered at. Both keyed by level name, summing to
    // `nodeTypes` and to `alternatives`.
    architecture: { nodeTypes: c.types, levels: c.typesByLevel || {}, alternativeLevels: c.alternativesByLevel || {}, nodes: c.nodes, relations: edges, cycles: c.nodeCycles, path: `${ygg}/yg-architecture.yaml` },
    // `timedOut` (additive) counts drills abandoned at `DRILL_TIMEOUT_MS`; their aspects are unverified, so
    // they are already inside the draft counts below — this names WHY they are, rather than leaving it silent.
    yggdrasil: { found: !!r.verify?.haveYg, cli: r.verify?.haveYg ? r.verify.ygBin : null, drilled: r.verify?.verified || 0, timedOut: r.verify?.timedOut || 0 },
    // `progressive` (ticket 118, additive) — the reference the proposal's own `yg-config.yaml` names, and why
    // that one. `reference: null` means the block was left out and the first `yg check` answers for everything.
    progressive: { reference: prog.reference || null, why: prog.why || null },
    // `advisory` (ticket 107, additive) is also the count of `candidates` rows that carry `status: advisory` —
    // both numbers are given so a reader does not have to filter `candidates` to get the split.
    aspects: { total: c.aspects, enforced: enforced.length, advisory: advisory.length, candidates: candidates.length, rest: rest.length, restByDraftReason: restByReason },
    enforced: enforced.map(aspectJson),
    candidates: candidates.map(aspectJson),
    alternatives: c.alternatives,
    skippedNotARule: c.aspectsSkippedNotARule,
    // ticket 120, additive: WHY (`parser-node-type-as-identifier` | `generic-type-parameter-as-domain-type` |
    // absent for the pre-existing `filebirth` case), and the two other identifier-hygiene disclosures — a
    // narrower-than-scope cluster that stayed draft, and a proposed type with no aspect and no relation.
    skippedNotARuleByReason: c.aspectsSkippedNotARuleByReason || {},
    skippedUnrenderableGroupScoped: c.aspectsSkippedUnrenderableGroupScoped,
    clusterNarrowerThanScope: c.aspectsClusterNarrowerThanScope || 0,
    typesWithNoLaw: c.typesWithNoLaw || 0,
    paths: { proposal: `${out}/PROPOSAL.md`, evidence: `${out}/proposal.json`, backlog: `${out}/REFACTOR-BACKLOG.md`, alternatives: `${out}/alternatives.md`, sizing: `${out}/sizing.json`, graph: `${ygg}/` },
    ...(full ? { restAspects: rest.map(aspectJson) } : {}),
  };

  const L = [];
  L.push(`proposed a graph for ${r.files.length} tracked files, as of ${sha} — ${ygg}/`);
  // Only when it happened, and above everything else: every count below is measured over that weaker set.
  if (r.degraded) L.push(`  WARNING: ${r.degraded}`);
  // The types line names the LEVEL each cut came from (ticket 110): no single level wins across repositories,
  // so the report says which levels this repository's cut is made of, and how many candidates at other levels
  // are on offer instead — the number that tells a maintainer whether there is a choice left to make.
  const levelsPhrase = TYPE_LEVELS.filter(l => c.typesByLevel?.[l]).map(l => `${c.typesByLevel[l]} ${l}`).join(', ');
  L.push(`architecture: ${c.types} node types${levelsPhrase ? ` (${levelsPhrase})` : ''} · ${c.nodes} nodes · ${edges ? `${edges} relations` : `no law about dependencies could be mined (${r.exp?.relStages?.seen ?? 0} references seen, ${r.exp?.relStages?.resolved ?? 0} resolved, ${r.exp?.relStages?.crossing ?? 0} survived the module cut)`} · ${c.nodeCycles} dependency cycle(s) — ${ygg}/yg-architecture.yaml`);
  if (!r.verify?.haveYg) {
    L.push(`enforced: 0 of ${c.aspects} aspects — no Yggdrasil CLI was found, so no rule was drilled and NOTHING here is enforced (set YG_BIN to a built bin.js, or put \`yg\` on PATH, then run this again)`);
    L.push(`candidates: 0 of ${c.aspects} — a candidate is an advisory or draft aspect a real drill caught a violation with, and no drill ran`);
  } else {
    L.push(`enforced: ${enforced.length} of ${c.aspects} aspects earned \`status: enforced\` from a real drill of ${r.verify.verified} deterministic check(s) — a certified-convention origin required, not just a passing drill (${r.verify.ygBin})`);
    // A line only when it happened: a drill that never returned would otherwise leave its aspect in the draft
    // pile with no reason given, which reads as "the check is bad" rather than "nothing judged it".
    if (r.verify.timedOut) L.push(`  ${r.verify.timedOut} drill(s) were given up on after ${r.verify.drillTimeoutMs / 1000}s each and their aspects are unverified, not judged — re-run, or drill them by hand with \`yg drill --aspect <id>\``);
    for (const a of enforced) {
      L.push(`  ${a.id} — ${a.name}`);
      L.push(`    caught ${a.drill.catches} of ${a.drill.violates} planted violation(s) · ${a.drill.falseAlarm} false alarm(s) · it already ${evidenceOf(a)}${existingCost(a)} — ${aspectPath(a)}`);
    }
    // Said once, under the enforced list, because it is the same answer for all of them (ticket 118). The
    // drill proved each check correct; it never asked whether this repository already holds the rule.
    if (enforced.length) {
      L.push(prog.reference
        ? `  measured against \`${prog.reference}\` — ${prog.why}: the sites above that break a rule today are reported as warnings until a change reaches them, and \`yg check --full\` blocks on all of them. Remove \`progressive\` from ${ygg}/yg-config.yaml to answer for the whole repository on every run.`
        : `  no branch to measure against: ${prog.why}, so the proposal names none and the first \`yg check\` blocks on every site above. Set \`progressive: { reference: <branch> }\` in ${ygg}/yg-config.yaml to hold the pre-existing sites as warnings until a change reaches them.`);
    }
    L.push(`candidates: ${candidates.length} of ${c.aspects} — ${advisory.length} advisory (sub-gate origin, same drill bar as enforced but below grain's own certification bound) + ${legacyCandidates.length} draft(s) a drill still caught a violation with, strongest evidence first within each`);
    for (const a of candidates) {
      L.push(`  ${a.id} — ${a.name}`);
      L.push(`    caught ${a.drill.catches} of ${a.drill.violates} · ${a.drill.falseAlarm} false alarm(s) · it already ${evidenceOf(a)} · yg status \`${a.finalStatus}\`${a.finalStatus === 'draft' ? ` (${a.draftReason || 'unverified'})` : ''} — ${aspectPath(a)}`);
    }
  }
  const byReason = Object.entries(restByReason).sort().map(([k, v]) => `${v} ${k}`).join(', ') || 'none';
  // ticket 120, additive: the "skipped as not a rule" count now names WHY, whenever a reason is known — the
  // pre-existing `filebirth` case (no reason recorded) still folds into the bare number so the total agrees.
  const notARuleByReason = c.aspectsSkippedNotARuleByReason || {};
  const notARulePhrase = Object.keys(notARuleByReason).length
    ? `${c.aspectsSkippedNotARule} convention(s) skipped as not a rule (${Object.entries(notARuleByReason).sort().map(([k, v]) => `${v} ${k}`).join(', ')})`
    : `${c.aspectsSkippedNotARule} convention(s) skipped as not a rule`;
  L.push(`on disk, not above: ${rest.length} more draft(s) (${byReason}) · ${c.alternatives} finer type alternative(s) · ${notARulePhrase} · ${c.typesWithNoLaw || 0} type(s) with no law attached (no aspect, no relation) — ${out}/PROPOSAL.md`);
  if (full) {
    L.push(`== the remaining ${rest.length} draft(s), by why each is one ==`);
    for (const reason of [...new Set(rest.map(a => a.draftReason || 'unverified'))].sort()) {
      const group = rest.filter(a => (a.draftReason || 'unverified') === reason);
      L.push(`  ${reason}: ${group.length}`);
      for (const a of group) L.push(`    ${a.id} — ${a.name} · it already ${evidenceOf(a)} — ${aspectPath(a)}`);
    }
    const altLevels = TYPE_LEVELS.filter(l => c.alternativesByLevel?.[l]).map(l => `${c.alternativesByLevel[l]} ${l}`).join(', ');
    L.push(`== ${c.alternatives} finer type alternative(s), not cut as types${altLevels ? ` (${altLevels})` : ''} — ${out}/alternatives.md ==`);
    for (const alt of r.alternatives) L.push(`  ${alt.id} [${alt.level}] — ${alt.why}`);
  }
  L.push(`next: read ${out}/PROPOSAL.md (per-element evidence: ${out}/proposal.json), then move ${ygg}/ to the repository root as .yggdrasil/ and run \`yg check\``);
  return { lines: L, json };
}

// ===== the seams already split out of this file =====
// proposal writer · the admission constants, the Yggdrasil CLI resolution, the file walk and the YAML emitter
export {
  SUPERMAJORITY,
  LAMBDA_BOUND,
  MIN_SUPPORT,
  MIN_PROMOTE_FILES,
  MIN_GROUP_MEMBERS,
  MIN_WHEN_FIDELITY,
  MIN_CONVENTION_SITES,
  FAMILY_MIN_MEMBERS,
  SUBGATE_PER_PARTITION,
  resolveYg,
  progressiveReference,
  slug,
  yq,
  yamlEmit,
  PREAMBLE,
} from './propose-base.mjs';
// proposal writer · candidate localities and the words that describe a level
export {
  localities,
  TYPE_LEVELS,
  typeEvidence,
  evidenceContext,
  levelSentence,
  contentRegexFor,
  caseTolerant,
} from './propose-levels.mjs';
// proposal writer · node_types — choosing the level a type is cut at
export { buildTypes } from './propose-types.mjs';
// proposal writer · relations and the coarse node cut
export { buildRelations, nodePathFor, typeGlob, nestedProjectRoots, buildNodes } from './propose-nodes.mjs';
