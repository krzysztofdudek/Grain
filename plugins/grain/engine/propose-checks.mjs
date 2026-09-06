// grain engine · proposal writer · the deterministic check.mjs a drafted aspect ships
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { MARKER_STEMS_BY_EXT } from './config.mjs';
import { NT, PROVENANCE, shapeToRegex } from './propose-lattice.mjs';

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
